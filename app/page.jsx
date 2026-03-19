'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@sanity/client'

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
  apiVersion: '2024-01-01',
  token: process.env.NEXT_PUBLIC_SANITY_TOKEN,
  useCdn: false,
})

const QUERY = `*[_type == "transport"] | order(date asc, timeDep asc) {
  _id, type, num, from, to, date, timeDep, timeArr,
  terminal, company, booking, price, currency, person, note
}`

const typeLabels = { avion:'Avion', train:'Train', bus:'Bus', taxi:'Taxi', metro:'Métro', autre:'Autre' }
const typeIcons  = { avion:'✈', train:'🚄', bus:'🚌', taxi:'🚕', metro:'🚇', autre:'🚀' }
const personLabel = { lois:'Loïs', ines:'Ines', both:'Loïs & Ines' }

const EMPTY = { type:'avion', num:'', from:'', to:'', date:'', timeDep:'', timeArr:'',
  terminal:'', company:'', booking:'', price:'', currency:'€', person:'both', note:'' }

const F = ({ label, id, type='text', value, onChange, placeholder='', children }) => (
    <div style={s.fg}>
      <label style={s.label}>{label}</label>
      {children || <input style={s.input} type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} />}
    </div>
)


const FormBody = ({ data, set, prefix }) => (
    <div>
      <div style={s.sectionTitle}>Transport</div>
      <div style={s.row}>
        <F label="Type" id={prefix+'-type'} value={data.type} onChange={v=>set({...data,type:v})}>
          <select style={s.input} value={data.type} onChange={e=>set({...data,type:e.target.value})}>
            {Object.entries(typeLabels).map(([v,l])=><option key={v} value={v}>{typeIcons[v]} {l}</option>)}
          </select>
        </F>
        <F label="N° vol / trajet" value={data.num} onChange={v=>set({...data,num:v})} placeholder="AF1234…" />
      </div>
      <div style={s.sectionTitle}>Trajet</div>
      <div style={s.row}>
        <F label="Départ" value={data.from} onChange={v=>set({...data,from:v})} placeholder="Paris CDG" />
        <F label="Arrivée" value={data.to} onChange={v=>set({...data,to:v})} placeholder="New York JFK" />
      </div>
      <div style={s.row}>
        <F label="Date" type="date" value={data.date} onChange={v=>set({...data,date:v})} />
        <F label="Heure départ" type="time" value={data.timeDep} onChange={v=>set({...data,timeDep:v})} />
      </div>
      <div style={s.row}>
        <F label="Heure arrivée" type="time" value={data.timeArr} onChange={v=>set({...data,timeArr:v})} />
        <F label="Terminal / Voie / Quai" value={data.terminal} onChange={v=>set({...data,terminal:v})} placeholder="Terminal 2E…" />
      </div>
      <div style={s.sectionTitle}>Réservation</div>
      <div style={s.row}>
        <F label="Compagnie" value={data.company} onChange={v=>set({...data,company:v})} placeholder="Air France, SNCF…" />
        <F label="N° de réservation" value={data.booking} onChange={v=>set({...data,booking:v})} placeholder="XYZ123" />
      </div>
      <div style={s.sectionTitle}>Prix & Voyageur</div>
      <div style={s.row}>
        <F label="Prix" value={data.price} onChange={v=>set({...data,price:v})}>
          <div style={{display:'flex',gap:8}}>
            <input style={{...s.input,flex:1}} type="number" min="0" step="0.01" value={data.price} onChange={e=>set({...data,price:e.target.value})} placeholder="0.00" />
            <select style={{...s.input,width:75}} value={data.currency} onChange={e=>set({...data,currency:e.target.value})}>
              {['€','$','£','CHF','¥'].map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
        </F>
        <F label="Concerne" value={data.person} onChange={v=>set({...data,person:v})}>
          <div style={{display:'flex',gap:6}}>
            {[['both','Loïs & Ines'],['lois','Loïs'],['ines','Ines']].map(([v,l])=>(
              <button key={v} onClick={()=>set({...data,person:v})}
                style={{...s.personBtn, ...(data.person===v ? s['personSel_'+v] : {})}}>
                {l}
              </button>
            ))}
          </div>
        </F>
      </div>
      <div style={s.sectionTitle}>Notes</div>
      <div style={s.fg}>
        <textarea style={{...s.input,minHeight:70,resize:'vertical',width:'100%'}}
          value={data.note} onChange={e=>set({...data,note:e.target.value})}
          placeholder="Bagage inclus, siège 14A…" />
      </div>
    </div>
  )
export default function Page() {
  const [entries, setEntries] = useState([])
  const [tab, setTab] = useState('liste')
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [editForm, setEditForm] = useState({})

  useEffect(() => { fetchEntries() }, [])

  async function fetchEntries() {
    setLoading(true)
    try { setEntries(await client.fetch(QUERY)) }
    catch(e) { console.error(e) }
    setLoading(false)
  }

  async function addEntry() {
    if (!form.from || !form.to) return alert('Merci d\'indiquer le départ et l\'arrivée.')
    setSaving(true)
    try {
      await client.create({ _type: 'transport', ...form,
        price: form.price ? parseFloat(form.price) : undefined })
      setForm(EMPTY)
      await fetchEntries()
      setTab('liste')
    } catch(e) { alert('Erreur lors de la sauvegarde.') }
    setSaving(false)
  }

  async function saveEdit(id) {
    if (!editForm.from || !editForm.to) return alert('Merci d\'indiquer le départ et l\'arrivée.')
    setSaving(true)
    try {
      const data = { ...editForm, price: editForm.price ? parseFloat(editForm.price) : undefined }
      delete data._id
      await client.patch(id).set(data).commit()
      setEditingId(null)
      await fetchEntries()
    } catch(e) { alert('Erreur lors de la sauvegarde.') }
    setSaving(false)
  }

  async function deleteEntry(id) {
    if (!confirm('Supprimer ce transport ?')) return
    await client.delete(id)
    fetchEntries()
  }

  function startEdit(e) {
    setEditingId(e._id)
    setEditForm({ ...e })
  }

  const filtered = entries.filter(e =>
    filter === 'all' || e.person === filter || e.person === 'both'
  )

  const totals = {}
  entries.forEach(e => { if (e.price) totals[e.currency||'€'] = (totals[e.currency||'€']||0) + e.price })
  const totalStr = Object.entries(totals).map(([c,v]) => `${v.toFixed(2)} ${c}`).join(' + ') || '—'
  const counts = {}
  entries.forEach(e => counts[e.type] = (counts[e.type]||0)+1)

  function formatDate(d) {
    if (!d) return ''
    const [y,m,day] = d.split('-')
    return `${parseInt(day)} ${['jan','fév','mar','avr','mai','juin','juil','août','sep','oct','nov','déc'][parseInt(m)-1]} ${y}`
  }

 

  

  return (
    <div style={s.page}>
      <header style={s.header}>
        <div style={s.headerInner}>
          <div style={s.logo}>✈ carnet <span style={{color:'#2a5c45'}}>voyage</span></div>
          <div style={s.tabs}>
            {[['liste','Transports'],['ajouter','+ Ajouter'],['resume','Résumé']].map(([id,label])=>(
              <button key={id} onClick={()=>setTab(id)}
                style={{...s.tab, ...(tab===id ? s.tabActive : {})}}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main style={s.main}>

        {/* LISTE */}
        {tab==='liste' && (
          <div>
            <div style={s.filterBar}>
              <span style={{fontSize:13,color:'#6b6b67'}}>Afficher :</span>
              {[['all','Tous'],['lois','Loïs'],['ines','Ines']].map(([f,l])=>(
                <button key={f} onClick={()=>setFilter(f)}
                  style={{...s.filterBtn, ...(filter===f ? s['filterActive_'+f] : {})}}>
                  {l}
                </button>
              ))}
              <button onClick={fetchEntries} style={{...s.filterBtn,marginLeft:'auto'}} title="Actualiser">↻ Actualiser</button>
            </div>

            {loading && <div style={s.empty}>Chargement…</div>}

            {!loading && filtered.length === 0 && (
              <div style={s.empty}>
                <div style={{fontSize:40,marginBottom:12}}>🧳</div>
                Aucun transport ajouté.<br />Clique sur "+ Ajouter" pour commencer.
              </div>
            )}

            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {filtered.map(e => {
                const p = e.person || 'both'
                const isEditing = editingId === e._id
                return (
                  <div key={e._id} style={{...s.card, ...(isEditing?{borderColor:'#2a5c45',borderWidth:2}:{})}}>
                    <div style={s.cardActions}>
                      <button style={s.iconBtn} onClick={()=>isEditing ? setEditingId(null) : startEdit(e)}>
                        {isEditing ? '✕ Fermer' : '✏️ Modifier'}
                      </button>
                      <button style={{...s.iconBtn,...s.iconBtnDanger}} onClick={()=>deleteEntry(e._id)}>✕</button>
                    </div>
                    <div style={s.cardHeader}>
                      <span style={{...s.typeBadge,...s['badge_'+e.type]}}>{typeIcons[e.type]} {typeLabels[e.type]}</span>
                      {e.num && <span style={{fontSize:13,color:'#6b6b67'}}>{e.num}</span>}
                      <span style={s.route}>{e.from} → {e.to}</span>
                      <span style={{...s.personTag,...s['ptag_'+p]}}>{personLabel[p]}</span>
                      {e.price && <span style={s.priceTag}>{e.price.toFixed(2)} {e.currency||'€'}</span>}
                    </div>
                    <div style={s.details}>
                      {e.date && <div style={s.detail}>Date<span>{formatDate(e.date)}</span></div>}
                      {e.timeDep && <div style={s.detail}>Départ<span>{e.timeDep}</span></div>}
                      {e.timeArr && <div style={s.detail}>Arrivée<span>{e.timeArr}</span></div>}
                      {e.terminal && <div style={s.detail}>Terminal / Voie<span>{e.terminal}</span></div>}
                      {e.company && <div style={s.detail}>Compagnie<span>{e.company}</span></div>}
                      {e.booking && <div style={s.detail}>Réservation<span>{e.booking}</span></div>}
                    </div>
                    {e.note && <div style={s.note}>{e.note}</div>}

                    {isEditing && (
                      <div style={{marginTop:16,paddingTop:16,borderTop:'1px solid #e8e6e0'}}>
                        <FormBody data={editForm} set={setEditForm} prefix={`edit-${e._id}`} />
                        <div style={{display:'flex',gap:8,marginTop:12}}>
                          <button style={s.cancelBtn} onClick={()=>setEditingId(null)}>Annuler</button>
                          <button style={s.saveBtn} disabled={saving} onClick={()=>saveEdit(e._id)}>
                            {saving ? 'Enregistrement…' : 'Enregistrer'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* AJOUTER */}
        {tab==='ajouter' && (
          <div style={s.card}>
            <FormBody data={form} set={setForm} prefix="add" />
            <button style={{...s.saveBtn,width:'100%',marginTop:16,padding:13}} disabled={saving} onClick={addEntry}>
              {saving ? 'Ajout en cours…' : 'Ajouter ce transport'}
            </button>
          </div>
        )}

        {/* RÉSUMÉ */}
        {tab==='resume' && (
          <div>
            {entries.length === 0
              ? <div style={s.empty}><div style={{fontSize:40,marginBottom:12}}>📊</div>Ajoute des transports pour voir le résumé.</div>
              : <>
                <div style={s.statGrid}>
                  {[['Transports',entries.length],['Vols',counts.avion||0],['Trains',counts.train||0]].map(([l,v])=>(
                    <div key={l} style={s.statCard}>
                      <div style={s.statLabel}>{l}</div>
                      <div style={s.statValue}>{v}</div>
                    </div>
                  ))}
                  <div style={{...s.statCard}}>
                    <div style={s.statLabel}>Budget total</div>
                    <div style={{...s.statValue,fontSize:18,color:'#1a6b45'}}>{totalStr}</div>
                  </div>
                </div>
                <div style={{display:'flex',flexDirection:'column'}}>
                  {entries.map((e,i)=>{
                    const p = e.person||'both'
                    return (
                      <div key={e._id} style={{display:'flex',gap:14}}>
                        <div style={{display:'flex',flexDirection:'column',alignItems:'center',paddingTop:2}}>
                          <div style={{width:12,height:12,borderRadius:'50%',background:'#2a5c45',flexShrink:0}} />
                          {i<entries.length-1 && <div style={{width:2,background:'#e0ddd6',flex:1,minHeight:24,margin:'4px 0'}} />}
                        </div>
                        <div style={{paddingBottom:20,flex:1}}>
                          <div style={{fontSize:12,color:'#a8a8a4'}}>{formatDate(e.date)}{e.timeDep?' · '+e.timeDep:''}</div>
                          <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:15,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                            {typeIcons[e.type]} {e.from} → {e.to}
                            <span style={{...s.personTag,...s['ptag_'+p],fontSize:11,padding:'2px 8px'}}>{personLabel[p]}</span>
                          </div>
                          <div style={{fontSize:13,color:'#6b6b67'}}>{[e.company,e.num,e.booking].filter(Boolean).join(' · ')}</div>
                          {e.price && <div style={{fontSize:13,color:'#1a6b45',fontWeight:500}}>{e.price.toFixed(2)} {e.currency||'€'}</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            }
          </div>
        )}
      </main>
    </div>
  )
}

const s = {
  page: { fontFamily:"'DM Sans',sans-serif", background:'#f7f5f0', minHeight:'100vh', color:'#1a1a18' },
  header: { background:'#fff', borderBottomWidth:1, borderBottomStyle:'solid', borderBottomColor:'rgba(0,0,0,0.08)', position:'sticky', top:0, zIndex:100 },
  headerInner: { maxWidth:780, margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between', height:60, padding:'0 24px', gap:16 },
  logo: { fontFamily:'Syne,sans-serif', fontSize:18, fontWeight:700, letterSpacing:'-0.3px' },
  tabs: { display:'flex', gap:4 },
  tab: { padding:'6px 16px', borderRadius:20, border:'none', background:'transparent', color:'#6b6b67', fontSize:14, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" },
  tabActive: { background:'#2a5c45', color:'#fff', fontWeight:500 },
  main: { maxWidth:780, margin:'0 auto', padding:'28px 24px 60px' },
  filterBar: { display:'flex', gap:8, alignItems:'center', marginBottom:20, flexWrap:'wrap' },
  filterBtn: { padding:'5px 14px', borderRadius:20, borderWidth:1, borderStyle:'solid', borderColor:'rgba(0,0,0,0.15)', background:'#fff', color:'#6b6b67', fontSize:13, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" },
  filterActive_all: { background:'#1a1a18', color:'#fff', borderColor:'#1a1a18' },
  filterActive_lois: { background:'#fff4e6', color:'#7a3e00', borderColor:'#e8a04a', fontWeight:500 },
  filterActive_ines: { background:'#fce8f0', color:'#7a1a3e', borderColor:'#d4729a', fontWeight:500 },
 card: { background:'#fff', borderWidth:1, borderStyle:'solid', borderColor:'rgba(0,0,0,0.08)', borderRadius:14, padding:'18px 20px', position:'relative', boxShadow:'0 2px 12px rgba(0,0,0,0.06)' },
  cardActions: { position:'absolute', top:14, right:14, display:'flex', gap:4 },
  iconBtn: { background:'none', borderWidth:1, borderStyle:'solid', borderColor:' rgba(0,0,0,0.1)', color:'#6b6b67', cursor:'pointer', fontSize:13, padding:'4px 9px', borderRadius:8, fontFamily:"'DM Sans',sans-serif" },
  iconBtnDanger: {},
  cardHeader: { display:'flex', alignItems:'center', gap:8, marginBottom:10, flexWrap:'wrap', paddingRight:130 },
  typeBadge: { fontSize:11, fontWeight:500, padding:'3px 10px', borderRadius:20, fontFamily:'Syne,sans-serif' },
  badge_avion: { background:'#e6f0fb', color:'#1a4a8a' },
  badge_train: { background:'#e2f5ed', color:'#0d5c35' },
  badge_bus:   { background:'#fef3e2', color:'#7a4a00' },
  badge_taxi:  { background:'#fce8f5', color:'#7a0050' },
  badge_metro: { background:'#ede8fb', color:'#3a1a8a' },
  badge_autre: { background:'#f0efea', color:'#4a4a40' },
  route: { fontFamily:'Syne,sans-serif', fontSize:16, fontWeight:700, flex:1 },
  personTag: { fontSize:12, fontWeight:500, padding:'3px 10px', borderRadius:20 },
  ptag_lois: { background:'#fff4e6', color:'#7a3e00' },
  ptag_ines: { background:'#fce8f0', color:'#7a1a3e' },
  ptag_both: { background:'#edf0fb', color:'#2a3580' },
  priceTag: { fontSize:13, fontWeight:500, color:'#1a6b45', background:'#e8f5ed', padding:'3px 10px', borderRadius:20 },
  details: { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:8 },
  detail: { fontSize:12, color:'#a8a8a4', textTransform:'uppercase', letterSpacing:'0.5px', display:'block' },
  note: { fontSize:13, color:'#6b6b67', marginTop:12, paddingTop:12, borderTop:'1px solid rgba(0,0,0,0.08)', fontStyle:'italic' },
  sectionTitle: { fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:1, color:'#a8a8a4', margin:'18px 0 10px', fontFamily:'Syne,sans-serif' },
  row: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 },
  fg: { marginBottom:12 },
  label: { fontSize:12, color:'#6b6b67', display:'block', marginBottom:5, fontWeight:500 },
  input: { width:'100%', padding:'9px 12px', borderWidth:1, borderStyle:'solid', borderColor:' rgba(0,0,0,0.15)', borderRadius:8, background:'#f7f5f0', color:'#1a1a18', fontSize:14, fontFamily:"'DM Sans',sans-serif", outline:'none', boxSizing:'border-box' },
  personBtn: { flex:1, padding:'8px 4px', borderRadius:8, borderWidth:1, borderStyle:'solid', borderColor:' rgba(0,0,0,0.15)', background:'#f7f5f0', color:'#6b6b67', fontSize:12, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textAlign:'center' },
  personSel_both: { background:'#edf0fb', color:'#2a3580', borderColor:'#7a85d4', fontWeight:500 },
  personSel_lois: { background:'#fff4e6', color:'#7a3e00', borderColor:'#e8a04a', fontWeight:500 },
  personSel_ines: { background:'#fce8f0', color:'#7a1a3e', borderColor:'#d4729a', fontWeight:500 },
  saveBtn: { flex:1, padding:'9px', background:'#2a5c45', color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:500, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" },
  cancelBtn: { padding:'9px 18px', background:'transparent', color:'#6b6b67', borderWidth:1, borderStyle:'solid', borderColor:' rgba(0,0,0,0.15)', borderRadius:8, fontSize:14, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" },
  statGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:12, marginBottom:28 },
  statCard: { background:'#fff', borderWidth:1, borderStyle:'solid', borderColor: 'rgba(0,0,0,0.08)', borderRadius:14, padding:'16px 18px', boxShadow:'0 2px 12px rgba(0,0,0,0.06)' },
  statLabel: { fontSize:12, color:'#a8a8a4', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:6 },
  statValue: { fontFamily:'Syne,sans-serif', fontSize:26, fontWeight:700 },
  empty: { textAlign:'center', padding:'60px 24px', color:'#a8a8a4', fontSize:15 },
}
