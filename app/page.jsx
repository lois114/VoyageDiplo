'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@sanity/client'

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
  apiVersion: '2024-01-01',
  token: process.env.NEXT_PUBLIC_SANITY_TOKEN,
  useCdn: false,
})

const QUERY_TRANSPORT = `*[_type == "transport"] | order(date asc, timeDep asc) {
  _id, type, num, from, to, date, timeDep, timeArr, dateArr,
  terminal, company, booking, price, currency, person, pays, note
}`
const QUERY_DEPENSE = `*[_type == "depense"] | order(date asc) {
  _id, categorie, label, date, price, currency, person, pays, lien, note
}`
const QUERY_ETAPE = `*[_type == "etape"] | order(date asc, ordre asc) {
  _id, titre, lieu, lat, lng, date, ordre, note, person, pays
}`
const QUERY_HEBERGEMENT = `*[_type == "hebergement"] | order(dateArrivee asc) {
  _id, nom, lieu, dateArrivee, dateDepart, prix, currency, person, pays, lien, note
}`

const typeLabels  = { avion:'Avion', train:'Train', bus:'Bus', taxi:'Taxi', metro:'Métro', autre:'Autre' }
const typeIcons   = { avion:'✈', train:'🚄', bus:'🚌', taxi:'🚕', metro:'🚇', autre:'🚀' }
const catLabels   = { bouffe:'Restauration', activite:'Activité', hebergement:'Hébergement', shopping:'Shopping', autre:'Autre' }
const catIcons    = { bouffe:'🍽', activite:'🎯', hebergement:'🏨', shopping:'🛍', autre:'📌' }
const personLabel = { lois:'Loïs', ines:'Ines', both:'Loïs & Ines' }
const personClass = { lois:'ptag_lois', ines:'ptag_ines', both:'ptag_both' }

const paysOptions = [
  ['argentine','🇦🇷 Argentine'],
  ['perou','🇵🇪 Pérou'],
  ['bolivie','🇧🇴 Bolivie'],
  ['canada','🇨🇦 Canada'],
  ['usa','🇺🇸 États-Unis'],
]
const paysLabel = Object.fromEntries(paysOptions)

const EMPTY_T = { type:'avion', num:'', from:'', to:'', date:'', timeDep:'', timeArr:'', dateArr:'', terminal:'', company:'', booking:'', price:'', currency:'€', person:'both', pays:'', note:'' }
const EMPTY_D = { categorie:'bouffe', label:'', date:'', price:'', currency:'€', person:'both', pays:'', lien:'', note:'' }
const EMPTY_E = { titre:'', lieu:'', lat:'', lng:'', date:'', ordre:'', note:'', person:'both', pays:'' }
const EMPTY_H = { nom:'', lieu:'', dateArrivee:'', dateDepart:'', price:'', currency:'€', person:'both', pays:'', lien:'', note:'' }

const todoCategories = { transport:'✈ Transport', hebergement:'🏨 Hébergement', activite:'🎯 Activité', visa:'📄 Visa / Docs', shopping:'🛍 Shopping', autre:'📌 Autre' }
const EMPTY_TODO = { label:'', categorie:'transport', person:'both', pays:'', date:'', note:'' }

function calcTotals(transports, depenses, hebergements=[]) {
  const result = { lois:{}, ines:{}, both:{} }
  const add = (p, c, v) => { result[p][c] = (result[p][c]||0) + v }
  ;[...transports,...depenses,...hebergements].forEach(e => {
    const p = e.person||'both', c = e.currency||'€', v = e.price ? parseFloat(e.price) : 0
    if (!v) return
    if (p==='both') { add('lois',c,v); add('ines',c,v); add('both',c,v) }
    else add(p,c,v)
  })
  return result
}
function fmtTotals(obj) {
  const e = Object.entries(obj)
  return e.length ? e.map(([c,v])=>`${v.toFixed(2)} ${c}`).join(' + ') : '—'
}
function formatDate(d) {
  if (!d) return ''
  const [y,m,day] = d.split('-')
  return `${parseInt(day)} ${['jan','fév','mar','avr','mai','juin','juil','août','sep','oct','nov','déc'][parseInt(m)-1]} ${y}`
}
function groupByDay(items) {
  const map = {}
  items.forEach(e => {
    const k = e.date || 'sans-date'
    if (!map[k]) map[k] = []
    map[k].push(e)
  })
  return Object.entries(map).sort(([a],[b]) => a<b?-1:1)
}

function generateICS(transports, etapes, hebergements) {
  const d = s => s.replace(/-/g,'')
  const dt = (date, time) => time ? `${d(date)}T${time.replace(/:/g,'')}00` : null
  const esc = s => (s||'').replace(/,/g,'\\,').replace(/;/g,'\\;').replace(/\n/g,'\\n')

  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Carnet Voyage//FR','CALSCALE:GREGORIAN']

  transports.forEach(e => {
    if (!e.date) return
    const start = dt(e.date, e.timeDep)
    const end   = dt(e.dateArr||e.date, e.timeArr)
    lines.push('BEGIN:VEVENT',
      `UID:transport-${e._id}@carnet-voyage`,
      start ? `DTSTART:${start}` : `DTSTART;VALUE=DATE:${d(e.date)}`,
      end   ? `DTEND:${end}`     : `DTEND;VALUE=DATE:${d(e.dateArr||e.date)}`,
      `SUMMARY:${esc(typeIcons[e.type]+' '+e.from+' → '+e.to)}`,
      `DESCRIPTION:${esc([e.company,e.num,e.booking].filter(Boolean).join(' · '))}`,
      'END:VEVENT')
  })

  hebergements.forEach(e => {
    if (!e.dateArrivee) return
    lines.push('BEGIN:VEVENT',
      `UID:hebergement-${e._id}@carnet-voyage`,
      `DTSTART;VALUE=DATE:${d(e.dateArrivee)}`,
      `DTEND;VALUE=DATE:${d(e.dateDepart||e.dateArrivee)}`,
      `SUMMARY:${esc('🏨 '+e.nom)}`,
      `LOCATION:${esc(e.lieu)}`,
      `DESCRIPTION:${esc(e.lien)}`,
      'END:VEVENT')
  })

  etapes.forEach(e => {
    if (!e.date) return
    lines.push('BEGIN:VEVENT',
      `UID:etape-${e._id}@carnet-voyage`,
      `DTSTART;VALUE=DATE:${d(e.date)}`,
      `DTEND;VALUE=DATE:${d(e.date)}`,
      `SUMMARY:${esc('📍 '+e.titre)}`,
      `LOCATION:${esc(e.lieu)}`,
      `DESCRIPTION:${esc(e.note)}`,
      'END:VEVENT')
  })

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

async function geocode(lieu) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(lieu)}&format=json&limit=1`)
    const d = await r.json()
    if (d.length) return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) }
  } catch(e) {}
  return null
}

// ── Map (Leaflet + OSM) ──────────────────────────────────────────────────────
function RoadmapMap({ etapes }) {
  const mapRef = useRef(null)
  const instanceRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const valid = etapes.filter(e => e.lat && e.lng)
    if (!valid.length) return

    import('leaflet').then(L => {
      if (!mapRef.current) return
      delete L.Icon.Default.prototype._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      })
      if (instanceRef.current) { instanceRef.current.remove(); instanceRef.current = null }
      const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: false })
      instanceRef.current = map
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map)
      const bounds = []
      valid.forEach(e => {
        L.marker([e.lat, e.lng]).addTo(map)
          .bindPopup(`<b>${e.titre}</b><br>${e.lieu}${e.date?'<br>'+formatDate(e.date):''}`)
        bounds.push([e.lat, e.lng])
      })
      if (bounds.length > 1) L.polyline(bounds, { color:'#2a5c45', weight:2, dashArray:'6,6', opacity:0.7 }).addTo(map)
      map.fitBounds(bounds, { padding:[40,40] })
    })
    return () => { if (instanceRef.current) { instanceRef.current.remove(); instanceRef.current = null } }
  }, [etapes])

  return (
    <>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
      <div ref={mapRef} style={{ height:340, borderRadius:14, overflow:'hidden', borderWidth:1, borderStyle:'solid', borderColor:'rgba(0,0,0,0.08)', marginTop:28 }} />
    </>
  )
}

// ── Field / sub-components ───────────────────────────────────────────────────
function Field({ label, type='text', value, onChange, placeholder='', children }) {
  return (
    <div style={s.fg}>
      <label style={s.label}>{label}</label>
      {children || <input style={s.input} type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} />}
    </div>
  )
}
function PersonToggle({ value, onChange }) {
  return (
    <div style={{display:'flex',gap:6}}>
      {[['both','Loïs & Ines'],['lois','Loïs'],['ines','Ines']].map(([v,l])=>(
        <button key={v} type="button" onClick={()=>onChange(v)}
          style={{...s.personBtn,...(value===v?s['personSel_'+v]:{})}}>
          {l}
        </button>
      ))}
    </div>
  )
}
function PriceRow({ data, set }) {
  return (
    <div style={{display:'flex',gap:8}}>
      <input style={{...s.input,flex:1}} type="number" min="0" step="0.01" value={data.price} onChange={e=>set({...data,price:e.target.value})} placeholder="0.00" />
      <select style={{...s.input,width:75}} value={data.currency} onChange={e=>set({...data,currency:e.target.value})}>
        {['€','$','£','CHF','¥'].map(c=><option key={c}>{c}</option>)}
      </select>
    </div>
  )
}
function PersonTagEl({ person }) {
  const p = person||'both'
  return <span style={{...s.personTag,...s[personClass[p]]}}>{personLabel[p]}</span>
}
function FilterBar({ filter, setFilter, onRefresh }) {
  return (
    <div style={s.filterBar}>
      <span style={{fontSize:13,color:'#6b6b67'}}>Afficher :</span>
      {[['all','Tous'],['lois','Loïs'],['ines','Ines']].map(([f,l])=>(
        <button key={f} onClick={()=>setFilter(f)}
          style={{...s.filterBtn,...(filter===f?s['filterActive_'+f]:{})}}>
          {l}
        </button>
      ))}
      <button onClick={onRefresh} style={{...s.filterBtn,marginLeft:'auto'}}>↻ Actualiser</button>
    </div>
  )
}
function CountryBar({ paysFilter, setPaysFilter }) {
  return (
    <div style={{...s.filterBar,marginTop:-10,marginBottom:16,paddingBottom:12,borderBottomWidth:1,borderBottomStyle:'solid',borderBottomColor:'rgba(0,0,0,0.06)'}}>
      <span style={{fontSize:13,color:'#6b6b67'}}>Pays :</span>
      <button onClick={()=>setPaysFilter('all')}
        style={{...s.filterBtn,...(paysFilter==='all'?s.filterActive_all:{})}}>
        🌍 Tous
      </button>
      {paysOptions.map(([v,l])=>(
        <button key={v} onClick={()=>setPaysFilter(v)}
          style={{...s.filterBtn,...(paysFilter===v?{background:'#2a5c45',color:'#fff',borderColor:'#2a5c45'}:{})}}>
          {l}
        </button>
      ))}
    </div>
  )
}
function PaysSelect({ value, onChange }) {
  return (
    <select style={s.input} value={value} onChange={e=>onChange(e.target.value)}>
      <option value=''>— Pays (optionnel)</option>
      {paysOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}
    </select>
  )
}
function PaysTagEl({ pays }) {
  if (!pays) return null
  return <span style={s.paysTag}>{paysLabel[pays]||pays}</span>
}

function TransportForm({ data, set }) {
  return (
    <div>
      <div style={s.sectionTitle}>Transport</div>
      <div style={s.row}>
        <Field label="Type">
          <select style={s.input} value={data.type} onChange={e=>set({...data,type:e.target.value})}>
            {Object.entries(typeLabels).map(([v,l])=><option key={v} value={v}>{typeIcons[v]} {l}</option>)}
          </select>
        </Field>
        <Field label="N° vol / trajet" value={data.num} onChange={v=>set({...data,num:v})} placeholder="AF1234…" />
      </div>
      <div style={s.sectionTitle}>Trajet</div>
      <div style={s.row}>
        <Field label="Départ" value={data.from} onChange={v=>set({...data,from:v})} placeholder="Paris CDG" />
        <Field label="Arrivée" value={data.to} onChange={v=>set({...data,to:v})} placeholder="New York JFK" />
      </div>
      <div style={s.row}>
        <Field label="Date" type="date" value={data.date} onChange={v=>set({...data,date:v})} />
        <Field label="Heure départ" type="time" value={data.timeDep} onChange={v=>set({...data,timeDep:v})} />
      </div>
      <div style={s.row}>
        <Field label="Heure arrivée" type="time" value={data.timeArr} onChange={v=>set({...data,timeArr:v})} />
        <Field label="Date d'arrivée" type="date" value={data.dateArr} onChange={v=>set({...data,dateArr:v})} />
      </div>
      <div style={s.row}>
        <Field label="Terminal / Voie" value={data.terminal} onChange={v=>set({...data,terminal:v})} placeholder="Terminal 2E…" />
      </div>
      <div style={s.sectionTitle}>Réservation</div>
      <div style={s.row}>
        <Field label="Compagnie" value={data.company} onChange={v=>set({...data,company:v})} placeholder="Air France, SNCF…" />
        <Field label="N° de réservation" value={data.booking} onChange={v=>set({...data,booking:v})} placeholder="XYZ123" />
      </div>
      <div style={s.sectionTitle}>Prix & Voyageur</div>
      <div style={s.row}>
        <Field label="Prix"><PriceRow data={data} set={set} /></Field>
        <Field label="Concerne"><PersonToggle value={data.person} onChange={v=>set({...data,person:v})} /></Field>
      </div>
      <div style={s.row}>
        <Field label="Pays"><PaysSelect value={data.pays||''} onChange={v=>set({...data,pays:v})} /></Field>
      </div>
      <div style={s.sectionTitle}>Notes</div>
      <textarea style={{...s.input,minHeight:70,resize:'vertical',width:'100%'}} value={data.note} onChange={e=>set({...data,note:e.target.value})} placeholder="Bagage inclus, siège 14A…" />
    </div>
  )
}

function DepenseForm({ data, set }) {
  return (
    <div>
      <div style={s.sectionTitle}>Dépense</div>
      <div style={s.row}>
        <Field label="Catégorie">
          <select style={s.input} value={data.categorie} onChange={e=>set({...data,categorie:e.target.value})}>
            {Object.entries(catLabels).map(([v,l])=><option key={v} value={v}>{catIcons[v]} {l}</option>)}
          </select>
        </Field>
        <Field label="Description" value={data.label} onChange={v=>set({...data,label:v})} placeholder="Dîner au restaurant…" />
      </div>
      <div style={s.row}>
        <Field label="Date" type="date" value={data.date} onChange={v=>set({...data,date:v})} />
        <Field label="Prix"><PriceRow data={data} set={set} /></Field>
      </div>
      <div style={s.sectionTitle}>Voyageur & Pays</div>
      <div style={s.row}>
        <Field label="Concerne"><PersonToggle value={data.person} onChange={v=>set({...data,person:v})} /></Field>
        <Field label="Pays"><PaysSelect value={data.pays||''} onChange={v=>set({...data,pays:v})} /></Field>
      </div>
      <div style={{marginTop:12}}>
        <div style={s.sectionTitle}>Lien utile</div>
        <Field label="URL" value={data.lien} onChange={v=>set({...data,lien:v})} placeholder="https://…" />
      </div>
      <div style={{marginTop:12}}>
        <div style={s.sectionTitle}>Notes</div>
        <textarea style={{...s.input,minHeight:60,resize:'vertical',width:'100%'}} value={data.note} onChange={e=>set({...data,note:e.target.value})} placeholder="Détails…" />
      </div>
    </div>
  )
}

function EtapeForm({ data, set, geocoding, onGeocode }) {
  return (
    <div>
      <div style={s.sectionTitle}>Étape</div>
      <div style={s.row}>
        <Field label="Titre" value={data.titre} onChange={v=>set({...data,titre:v})} placeholder="Arrivée à Barcelone, Visite Sagrada…" />
        <Field label="Date" type="date" value={data.date} onChange={v=>set({...data,date:v})} />
      </div>
      <div style={s.sectionTitle}>Lieu (pour la carte)</div>
      <div style={s.fg}>
        <label style={s.label}>Ville / Adresse</label>
        <div style={{display:'flex',gap:8}}>
          <input style={{...s.input,flex:1}} type="text" value={data.lieu}
            onChange={e=>set({...data,lieu:e.target.value})} placeholder="Barcelone, Espagne" />
          <button type="button" onClick={onGeocode} disabled={geocoding||!data.lieu}
            style={{...s.saveBtn,padding:'9px 14px',flexShrink:0,opacity:geocoding||!data.lieu?0.5:1}}>
            {geocoding?'…':'📍 Localiser'}
          </button>
        </div>
      </div>
      <div style={s.row}>
        <Field label="Latitude (auto)" value={data.lat} onChange={v=>set({...data,lat:v})} placeholder="41.38" />
        <Field label="Longitude (auto)" value={data.lng} onChange={v=>set({...data,lng:v})} placeholder="2.17" />
      </div>
      <div style={s.sectionTitle}>Voyageur & Ordre</div>
      <div style={s.row}>
        <Field label="Concerne"><PersonToggle value={data.person} onChange={v=>set({...data,person:v})} /></Field>
        <Field label="Ordre dans la journée" type="number" value={data.ordre} onChange={v=>set({...data,ordre:v})} placeholder="1" />
      </div>
      <div style={s.row}>
        <Field label="Pays"><PaysSelect value={data.pays||''} onChange={v=>set({...data,pays:v})} /></Field>
      </div>
      <div style={s.sectionTitle}>Notes</div>
      <textarea style={{...s.input,minHeight:70,resize:'vertical',width:'100%'}} value={data.note} onChange={e=>set({...data,note:e.target.value})} placeholder="Adresse précise, horaires, infos pratiques…" />
    </div>
  )
}

function HebergementForm({ data, set }) {
  return (
    <div>
      <div style={s.sectionTitle}>Hébergement</div>
      <div style={s.row}>
        <Field label="Nom" value={data.nom} onChange={v=>set({...data,nom:v})} placeholder="Hôtel Ibis, Airbnb…" />
        <Field label="Lieu" value={data.lieu} onChange={v=>set({...data,lieu:v})} placeholder="Barcelone, Espagne" />
      </div>
      <div style={s.row}>
        <Field label="Check-in" type="date" value={data.dateArrivee} onChange={v=>set({...data,dateArrivee:v})} />
        <Field label="Check-out" type="date" value={data.dateDepart} onChange={v=>set({...data,dateDepart:v})} />
      </div>
      <div style={s.sectionTitle}>Prix & Voyageur</div>
      <div style={s.row}>
        <Field label="Prix total"><PriceRow data={data} set={set} /></Field>
        <Field label="Concerne"><PersonToggle value={data.person} onChange={v=>set({...data,person:v})} /></Field>
      </div>
      <div style={s.row}>
        <Field label="Pays"><PaysSelect value={data.pays||''} onChange={v=>set({...data,pays:v})} /></Field>
      </div>
      <div style={s.sectionTitle}>Lien de réservation</div>
      <Field label="URL" value={data.lien} onChange={v=>set({...data,lien:v})} placeholder="https://…" />
      <div style={s.sectionTitle}>Notes</div>
      <textarea style={{...s.input,minHeight:60,resize:'vertical',width:'100%'}} value={data.note} onChange={e=>set({...data,note:e.target.value})} placeholder="Code d'accès, étage, infos pratiques…" />
    </div>
  )
}

// ── Edit / Card sub-components ────────────────────────────────────────────────
function EditSection({ e, kind, editingId, editForm, setEditForm, geocoding, handleGeocode, saving, setEditingId, saveEdit }) {
  if (editingId!==e._id) return null
  return (
    <div style={{marginTop:16,paddingTop:16,borderTopWidth:1,borderTopStyle:'solid',borderTopColor:'#e8e6e0'}}>
      {kind==='transport'    && <TransportForm data={editForm} set={setEditForm} />}
      {kind==='depense'      && <DepenseForm data={editForm} set={setEditForm} />}
      {kind==='etape'        && <EtapeForm data={editForm} set={setEditForm} geocoding={geocoding} onGeocode={()=>handleGeocode(editForm,setEditForm)} />}
      {kind==='hebergement'  && <HebergementForm data={editForm} set={setEditForm} />}
      <div style={{display:'flex',gap:8,marginTop:12}}>
        <button style={s.cancelBtn} onClick={()=>setEditingId(null)}>Annuler</button>
        <button style={s.saveBtn} disabled={saving} onClick={()=>saveEdit(e._id)}>
          {saving?'Enregistrement…':'Enregistrer'}
        </button>
      </div>
    </div>
  )
}

function CardActions({ e, kind, editingId, startEdit, setEditingId, deleteEntry }) {
  const isEditing = editingId===e._id
  return (
    <div style={s.cardActions}>
      <button style={s.iconBtn} onClick={()=>isEditing?setEditingId(null):startEdit(e,kind)}>
        {isEditing?'✕ Fermer':'✏️ Modifier'}
      </button>
      <button style={s.iconBtn} onClick={()=>deleteEntry(e._id)}>✕</button>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Page() {
  const [transports, setTransports]     = useState([])
  const [depenses, setDepenses]         = useState([])
  const [etapes, setEtapes]             = useState([])
  const [hebergements, setHebergements] = useState([])
  const [tab, setTab]               = useState('transports')
  const [addType, setAddType]       = useState('transport')
  const [filter, setFilter]         = useState('all')
  const [paysFilter, setPaysFilter] = useState('all')
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [geocoding, setGeocoding]   = useState(false)
  const [editingId, setEditingId]   = useState(null)
  const [editKind, setEditKind]     = useState(null)
  const [chronoFilter, setChronoFilter] = useState('all')
  const [formT, setFormT]           = useState(EMPTY_T)
  const [formD, setFormD]           = useState(EMPTY_D)
  const [formE, setFormE]           = useState(EMPTY_E)
  const [formH, setFormH]           = useState(EMPTY_H)
  const [editForm, setEditForm]     = useState({})
  const [budgets, setBudgets]       = useState({ lois:'', ines:'' })
  const [todos, setTodos]           = useState([])
  const [formTodo, setFormTodo]     = useState(EMPTY_TODO)

  useEffect(() => {
    const saved = localStorage.getItem('voyage_budgets')
    if (saved) setBudgets(JSON.parse(saved))
    const savedTodos = localStorage.getItem('voyage_todos')
    if (savedTodos) setTodos(JSON.parse(savedTodos))
  }, [])

  useEffect(()=>{ fetchAll() },[])

  async function fetchAll() {
    setLoading(true)
    try {
      const [t,d,e,h] = await Promise.all([client.fetch(QUERY_TRANSPORT), client.fetch(QUERY_DEPENSE), client.fetch(QUERY_ETAPE), client.fetch(QUERY_HEBERGEMENT)])
      setTransports(t); setDepenses(d); setEtapes(e); setHebergements(h)
    } catch(e){ console.error(e) }
    setLoading(false)
  }

  function saveBudget(person, val) {
    const updated = { ...budgets, [person]: val }
    setBudgets(updated)
    localStorage.setItem('voyage_budgets', JSON.stringify(updated))
  }

  function saveTodos(list) {
    setTodos(list)
    localStorage.setItem('voyage_todos', JSON.stringify(list))
  }

  function addTodo() {
    if (!formTodo.label.trim()) return alert('Merci d\'indiquer une tâche.')
    const newTodo = { ...formTodo, id: Date.now().toString(), done: false }
    saveTodos([...todos, newTodo])
    setFormTodo(EMPTY_TODO)
    setTab('todo')
  }

  function toggleTodo(id) {
    saveTodos(todos.map(t => t.id===id ? {...t, done: !t.done} : t))
  }

  function deleteTodo(id) {
    saveTodos(todos.filter(t => t.id!==id))
  }

  async function handleGeocode(data, set) {
    if (!data.lieu) return
    setGeocoding(true)
    const coords = await geocode(data.lieu)
    if (coords) set({...data, lat: coords.lat.toString(), lng: coords.lng.toString()})
    else alert('Lieu introuvable, essaie une autre formulation.')
    setGeocoding(false)
  }

  async function addTransport() {
    if (!formT.from||!formT.to) return alert('Merci d\'indiquer le départ et l\'arrivée.')
    setSaving(true)
    try {
      await client.create({_type:'transport',...formT,price:formT.price?parseFloat(formT.price):undefined})
      setFormT(EMPTY_T); await fetchAll(); setTab('transports')
    } catch(e){ alert('Erreur lors de la sauvegarde.') }
    setSaving(false)
  }

  async function addDepense() {
    if (!formD.label) return alert('Merci d\'indiquer une description.')
    setSaving(true)
    try {
      await client.create({_type:'depense',...formD,price:formD.price?parseFloat(formD.price):undefined})
      setFormD(EMPTY_D); await fetchAll(); setTab('depenses')
    } catch(e){ alert('Erreur lors de la sauvegarde.') }
    setSaving(false)
  }

  async function addHebergement() {
    if (!formH.nom) return alert('Merci d\'indiquer le nom de l\'hébergement.')
    setSaving(true)
    try {
      await client.create({_type:'hebergement',...formH,price:formH.price?parseFloat(formH.price):undefined})
      setFormH(EMPTY_H); await fetchAll(); setTab('hebergements')
    } catch(e){ alert('Erreur lors de la sauvegarde.') }
    setSaving(false)
  }

  async function addEtape() {
    if (!formE.titre) return alert('Merci d\'indiquer un titre.')
    setSaving(true)
    try {
      await client.create({
        _type:'etape',...formE,
        lat: formE.lat ? parseFloat(formE.lat) : undefined,
        lng: formE.lng ? parseFloat(formE.lng) : undefined,
        ordre: formE.ordre ? parseInt(formE.ordre) : undefined,
      })
      setFormE(EMPTY_E); await fetchAll(); setTab('roadmap')
    } catch(e){ alert('Erreur lors de la sauvegarde.') }
    setSaving(false)
  }

  async function saveEdit(id) {
    setSaving(true)
    try {
      const data = {...editForm}; delete data._id
      if (data.price) data.price = parseFloat(data.price)
      if (data.lat) data.lat = parseFloat(data.lat)
      if (data.lng) data.lng = parseFloat(data.lng)
      if (data.ordre) data.ordre = parseInt(data.ordre)
      await client.patch(id).set(data).commit()
      setEditingId(null); await fetchAll()
    } catch(e){ alert('Erreur lors de la sauvegarde.') }
    setSaving(false)
  }

  async function deleteEntry(id) {
    if (!confirm('Supprimer ?')) return
    await client.delete(id); fetchAll()
  }

  function startEdit(e, kind) { setEditingId(e._id); setEditKind(kind); setEditForm({...e}) }

  const byPays = e => paysFilter==='all' || !e.pays || e.pays===paysFilter
  const filteredT  = transports.filter(e=>(filter==='all'||e.person===filter||e.person==='both') && byPays(e))
  const filteredD  = depenses.filter(e=>(filter==='all'||e.person===filter||e.person==='both') && byPays(e))
  const totals     = calcTotals(transports, depenses, hebergements)
  const dayGroups  = groupByDay(etapes)

  const allTabs = [
    ['transports','✈ Transports'],
    ['depenses','💸 Dépenses'],
    ['hebergements','🏨 Hébergements'],
    ['roadmap','🗺 Roadmap'],
    ['todo',`✅ À faire${todos.filter(t=>!t.done).length ? ` (${todos.filter(t=>!t.done).length})` : ''}`],
    ['ajouter','+ Ajouter'],
    ['resume','Résumé'],
  ]

  const editSectionProps = { editingId, editForm, setEditForm, geocoding, handleGeocode, saving, setEditingId, saveEdit }
  const cardActionsProps = { editingId, startEdit, setEditingId, deleteEntry }

  return (
    <div style={s.page}>
      <header style={s.header}>
        <div style={s.headerInner} className="header-inner">
          <div style={s.logo} className="app-logo">🦕 carnet <span style={{color:'#2a5c45'}}>voyage</span></div>
          <div style={s.tabs} className="nav-tabs">
            {allTabs.map(([id,label])=>(
              <button key={id} onClick={()=>setTab(id)}
                style={{...s.tab,...(tab===id?s.tabActive:{})}}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main style={s.main} className="app-main">

        {/* TRANSPORTS */}
        {tab==='transports' && (
          <div>
            <FilterBar filter={filter} setFilter={setFilter} onRefresh={fetchAll} />
            <CountryBar paysFilter={paysFilter} setPaysFilter={setPaysFilter} />
            {loading && <div style={s.empty}>Chargement…</div>}
            {!loading && filteredT.length===0 && <div style={s.empty}><div style={{fontSize:40,marginBottom:12}}>🧳</div>Aucun transport.</div>}
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {filteredT.map(e=>(
                <div key={e._id} style={{...s.card,...(editingId===e._id?{borderColor:'#2a5c45',borderWidth:2,borderStyle:'solid'}:{})}}>
                  <CardActions e={e} kind="transport" {...cardActionsProps} />
                  <div style={s.cardHeader} className="card-header">
                    <span style={{...s.typeBadge,...s['badge_'+e.type]}}>{typeIcons[e.type]} {typeLabels[e.type]}</span>
                    {e.num && <span style={{fontSize:13,color:'#6b6b67'}}>{e.num}</span>}
                    <span style={s.route}>{e.from} → {e.to}</span>
                    <PersonTagEl person={e.person} />
                    <PaysTagEl pays={e.pays} />
                    {e.price && <span style={s.priceTag}>{e.price.toFixed(2)} {e.currency||'€'}</span>}
                  </div>
                  <div style={s.details}>
                    {e.date     && <div style={s.detail}>Départ<span style={{display:'block'}}>{formatDate(e.date)}{e.timeDep?' · '+e.timeDep:''}</span></div>}
                    {(e.dateArr||e.timeArr) && <div style={s.detail}>Arrivée<span style={{display:'block'}}>{e.dateArr?formatDate(e.dateArr):''}{e.timeArr?' · '+e.timeArr:''}</span></div>}
                    {e.terminal && <div style={s.detail}>Terminal / Voie<span style={{display:'block'}}>{e.terminal}</span></div>}
                    {e.company  && <div style={s.detail}>Compagnie<span style={{display:'block'}}>{e.company}</span></div>}
                    {e.booking  && <div style={s.detail}>Réservation<span style={{display:'block'}}>{e.booking}</span></div>}
                  </div>
                  {e.note && <div style={s.note}>{e.note}</div>}
                  <EditSection e={e} kind="transport" {...editSectionProps} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DÉPENSES */}
        {tab==='depenses' && (
          <div>
            <FilterBar filter={filter} setFilter={setFilter} onRefresh={fetchAll} />
            <CountryBar paysFilter={paysFilter} setPaysFilter={setPaysFilter} />
            {loading && <div style={s.empty}>Chargement…</div>}
            {!loading && filteredD.length===0 && <div style={s.empty}><div style={{fontSize:40,marginBottom:12}}>💸</div>Aucune dépense.</div>}
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {filteredD.map(e=>{
                const cat = e.categorie||'autre'
                return (
                  <div key={e._id} style={{...s.card,...(editingId===e._id?{borderColor:'#2a5c45',borderWidth:2,borderStyle:'solid'}:{})}}>
                    <CardActions e={e} kind="depense" {...cardActionsProps} />
                    <div style={s.cardHeader} className="card-header">
                      <span style={{...s.typeBadge,...s['badge_cat_'+cat]}}>{catIcons[cat]} {catLabels[cat]}</span>
                      <span style={s.route}>{e.label||'—'}</span>
                      <PersonTagEl person={e.person} />
                      <PaysTagEl pays={e.pays} />
                      {e.price && <span style={s.priceTag}>{e.price.toFixed(2)} {e.currency||'€'}</span>}
                    </div>
                    <div style={s.details}>
                      {e.date && <div style={s.detail}>Date<span style={{display:'block'}}>{formatDate(e.date)}</span></div>}
                    </div>
                    {e.lien && <a href={e.lien} target="_blank" rel="noreferrer" style={{display:'inline-block',marginTop:8,fontSize:12,color:'#2a5c45',textDecoration:'underline'}}>🔗 Voir le lien</a>}
                    {e.note && <div style={s.note}>{e.note}</div>}
                    <EditSection e={e} kind="depense" {...editSectionProps} />
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* HÉBERGEMENTS */}
        {tab==='hebergements' && (
          <div>
            <FilterBar filter={filter} setFilter={setFilter} onRefresh={fetchAll} />
            <CountryBar paysFilter={paysFilter} setPaysFilter={setPaysFilter} />
            {loading && <div style={s.empty}>Chargement…</div>}
            {!loading && hebergements.filter(e=>(filter==='all'||e.person===filter||e.person==='both')&&byPays(e)).length===0 && (
              <div style={s.empty}><div style={{fontSize:40,marginBottom:12}}>🏨</div>Aucun hébergement.</div>
            )}
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {hebergements.filter(e=>(filter==='all'||e.person===filter||e.person==='both')&&byPays(e)).map(e=>(
                <div key={e._id} style={{...s.card,...(editingId===e._id?{borderColor:'#2a5c45',borderWidth:2,borderStyle:'solid'}:{})}}>
                  <CardActions e={e} kind="hebergement" {...cardActionsProps} />
                  <div style={s.cardHeader} className="card-header">
                    <span style={{...s.typeBadge,background:'#e6fbe8',color:'#0a4a1a'}}>🏨 Hébergement</span>
                    <span style={s.route}>{e.nom||'—'}</span>
                    <PersonTagEl person={e.person} />
                    <PaysTagEl pays={e.pays} />
                    {e.price && <span style={s.priceTag}>{e.price.toFixed(2)} {e.currency||'€'}</span>}
                  </div>
                  <div style={s.details}>
                    {e.lieu        && <div style={s.detail}>Lieu<span style={{display:'block'}}>{e.lieu}</span></div>}
                    {e.dateArrivee && <div style={s.detail}>Check-in<span style={{display:'block'}}>{formatDate(e.dateArrivee)}</span></div>}
                    {e.dateDepart  && <div style={s.detail}>Check-out<span style={{display:'block'}}>{formatDate(e.dateDepart)}</span></div>}
                  </div>
                  {e.lien && <a href={e.lien} target="_blank" rel="noreferrer" style={{display:'inline-block',marginTop:8,fontSize:12,color:'#2a5c45',textDecoration:'underline'}}>🔗 Voir la réservation</a>}
                  {e.note && <div style={s.note}>{e.note}</div>}
                  <EditSection e={e} kind="hebergement" {...editSectionProps} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ROADMAP */}
        {tab==='roadmap' && (
          <div>
            {loading && <div style={s.empty}>Chargement…</div>}
            {!loading && etapes.length===0 && (
              <div style={s.empty}>
                <div style={{fontSize:40,marginBottom:12}}>🗺</div>
                Aucune étape planifiée.<br />Clique sur "+ Ajouter" → Étape pour commencer.
              </div>
            )}
            {dayGroups.map(([date, items]) => (
              <div key={date} style={{marginBottom:28}}>
                <div style={s.dayHeader}>
                  <div style={s.dayDot} />
                  <span>{date==='sans-date' ? 'Sans date' : formatDate(date)}</span>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:10,paddingLeft:20,borderLeftWidth:2,borderLeftStyle:'solid',borderLeftColor:'#e0ddd6',marginLeft:5}}>
                  {items.sort((a,b)=>(a.ordre||0)-(b.ordre||0)).map(e=>(
                    <div key={e._id} style={{...s.card,...(editingId===e._id?{borderColor:'#2a5c45',borderWidth:2,borderStyle:'solid'}:{})}}>
                      <CardActions e={e} kind="etape" {...cardActionsProps} />
                      <div style={s.cardHeader} className="card-header">
                        <span style={{...s.typeBadge,background:'#e6fbe8',color:'#0a4a1a'}}>📍 Étape</span>
                        <span style={s.route}>{e.titre}</span>
                        <PersonTagEl person={e.person} />
                        <PaysTagEl pays={e.pays} />
                      </div>
                      {e.lieu && (
                        <div style={{fontSize:13,color:'#6b6b67',marginBottom:6}}>
                          📌 {e.lieu}
                          {e.lat && e.lng && <span style={{fontSize:11,color:'#a8a8a4',marginLeft:8}}>{parseFloat(e.lat).toFixed(4)}, {parseFloat(e.lng).toFixed(4)}</span>}
                        </div>
                      )}
                      {e.note && <div style={s.note}>{e.note}</div>}
                      <EditSection e={e} kind="etape" {...editSectionProps} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {etapes.some(e=>e.lat&&e.lng) && <RoadmapMap etapes={etapes} />}
          </div>
        )}

        {/* À FAIRE */}
        {tab==='todo' && (
          <div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20,flexWrap:'wrap',gap:8}}>
              <div style={{fontSize:13,color:'#6b6b67'}}>
                {todos.filter(t=>!t.done).length} à faire · {todos.filter(t=>t.done).length} fait{todos.filter(t=>t.done).length>1?'s':''}
              </div>
              {todos.filter(t=>t.done).length>0 && (
                <button onClick={()=>saveTodos(todos.filter(t=>!t.done))} style={{...s.cancelBtn,fontSize:13,padding:'6px 14px'}}>
                  Effacer les tâches finies
                </button>
              )}
            </div>

            {todos.length===0 && (
              <div style={s.empty}><div style={{fontSize:40,marginBottom:12}}>✅</div>Aucune tâche pour l'instant.</div>
            )}

            {['transport','hebergement','activite','visa','shopping','autre'].map(cat => {
              const catTodos = todos.filter(t=>t.categorie===cat)
              if (!catTodos.length) return null
              const pending = catTodos.filter(t=>!t.done)
              const done = catTodos.filter(t=>t.done)
              return (
                <div key={cat} style={{marginBottom:24}}>
                  <div style={{...s.sectionTitle,display:'flex',alignItems:'center',gap:8}}>
                    {todoCategories[cat]}
                    {pending.length>0 && <span style={{background:'#2a5c45',color:'#fff',fontSize:10,padding:'1px 7px',borderRadius:20,fontWeight:600}}>{pending.length}</span>}
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:8}}>
                    {[...pending, ...done].map(t=>(
                      <div key={t.id} style={{...s.card,padding:'12px 16px',opacity:t.done?0.55:1,display:'flex',alignItems:'flex-start',gap:12}}>
                        <button onClick={()=>toggleTodo(t.id)} style={{width:22,height:22,borderRadius:6,borderWidth:2,borderStyle:'solid',borderColor:t.done?'#2a5c45':'rgba(0,0,0,0.2)',background:t.done?'#2a5c45':'transparent',cursor:'pointer',flexShrink:0,marginTop:1,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,color:'#fff'}}>
                          {t.done?'✓':''}
                        </button>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:15,textDecoration:t.done?'line-through':'none',color:t.done?'#a8a8a4':'#1a1a18',display:'flex',flexWrap:'wrap',alignItems:'center',gap:8}}>
                            {t.label}
                            <PersonTagEl person={t.person} />
                            <PaysTagEl pays={t.pays} />
                          </div>
                          {(t.date||t.note) && (
                            <div style={{fontSize:12,color:'#a8a8a4',marginTop:4,display:'flex',gap:10,flexWrap:'wrap'}}>
                              {t.date && <span>📅 {formatDate(t.date)}</span>}
                              {t.note && <span style={{fontStyle:'italic'}}>{t.note}</span>}
                            </div>
                          )}
                        </div>
                        <button onClick={()=>deleteTodo(t.id)} style={{...s.iconBtn,padding:'3px 8px',fontSize:12,flexShrink:0}}>✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* AJOUTER */}
        {tab==='ajouter' && (
          <div>
            <div style={{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap'}}>
              {[['transport','✈ Transport'],['depense','💸 Dépense'],['hebergement','🏨 Hébergement'],['etape','📍 Étape'],['todo','✅ Tâche']].map(([v,l])=>(
                <button key={v} onClick={()=>setAddType(v)}
                  style={{...s.tab,...(addType===v?s.tabActive:{}),borderWidth:1,borderStyle:'solid',borderColor:addType===v?'transparent':'rgba(0,0,0,0.15)'}}>
                  {l}
                </button>
              ))}
            </div>
            <div style={s.card}>
              {addType==='transport' && <>
                <TransportForm data={formT} set={setFormT} />
                <button style={{...s.saveBtn,width:'100%',marginTop:16,padding:13}} disabled={saving} onClick={addTransport}>
                  {saving?'Ajout…':'Ajouter ce transport'}
                </button>
              </>}
              {addType==='depense' && <>
                <DepenseForm data={formD} set={setFormD} />
                <button style={{...s.saveBtn,width:'100%',marginTop:16,padding:13}} disabled={saving} onClick={addDepense}>
                  {saving?'Ajout…':'Ajouter cette dépense'}
                </button>
              </>}
              {addType==='hebergement' && <>
                <HebergementForm data={formH} set={setFormH} />
                <button style={{...s.saveBtn,width:'100%',marginTop:16,padding:13}} disabled={saving} onClick={addHebergement}>
                  {saving?'Ajout…':'Ajouter cet hébergement'}
                </button>
              </>}
              {addType==='etape' && <>
                <EtapeForm data={formE} set={setFormE} geocoding={geocoding} onGeocode={()=>handleGeocode(formE,setFormE)} />
                <button style={{...s.saveBtn,width:'100%',marginTop:16,padding:13}} disabled={saving} onClick={addEtape}>
                  {saving?'Ajout…':'Ajouter cette étape'}
                </button>
              </>}
              {addType==='todo' && <>
                <div style={s.row}>
                  <Field label="Tâche" value={formTodo.label} onChange={v=>setFormTodo({...formTodo,label:v})} placeholder="Réserver le vol Paris-Tokyo…" />
                  <Field label="Catégorie">
                    <select style={s.input} value={formTodo.categorie} onChange={e=>setFormTodo({...formTodo,categorie:e.target.value})}>
                      {Object.entries(todoCategories).map(([v,l])=><option key={v} value={v}>{l}</option>)}
                    </select>
                  </Field>
                </div>
                <div style={s.row}>
                  <Field label="Échéance (optionnel)" type="date" value={formTodo.date} onChange={v=>setFormTodo({...formTodo,date:v})} />
                  <Field label="Concerne"><PersonToggle value={formTodo.person} onChange={v=>setFormTodo({...formTodo,person:v})} /></Field>
                </div>
                <div style={s.row}>
                  <Field label="Pays"><PaysSelect value={formTodo.pays||''} onChange={v=>setFormTodo({...formTodo,pays:v})} /></Field>
                </div>
                <Field label="Note (optionnel)" value={formTodo.note} onChange={v=>setFormTodo({...formTodo,note:v})} placeholder="Détails, lien…" />
                <button style={{...s.saveBtn,width:'100%',marginTop:16,padding:13}} onClick={addTodo}>
                  Ajouter la tâche
                </button>
              </>}
            </div>
          </div>
        )}

        {/* RÉSUMÉ */}
        {tab==='resume' && (
          <div>
            {(transports.length===0&&depenses.length===0)
              ? <div style={s.empty}><div style={{fontSize:40,marginBottom:12}}>📊</div>Ajoute des entrées pour voir le résumé.</div>
              : <>
                  <button onClick={()=>{
                    const content = generateICS(transports, etapes, hebergements)
                    const blob = new Blob([content], {type:'text/calendar;charset=utf-8'})
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a'); a.href=url; a.download='carnet-voyage.ics'; a.click()
                    URL.revokeObjectURL(url)
                  }} style={{...s.saveBtn,display:'flex',alignItems:'center',gap:8,justifyContent:'center',padding:'11px 20px',marginBottom:24,width:'100%'}}>
                    📅 Exporter vers Google Calendar (.ics)
                  </button>
                  <div style={s.sectionTitle}>Budget & Dépenses</div>
                  {[['lois','Loïs','#fff4e6','#7a3e00','#e8a04a'],['ines','Ines','#fce8f0','#7a1a3e','#d4729a']].map(([p,name,bg,color,accent])=>{
                    const spent = totals[p]['€'] || 0
                    const budget = parseFloat(budgets[p]) || 0
                    const pct = budget > 0 ? Math.min(spent/budget*100, 100) : 0
                    const over = budget > 0 && spent > budget
                    return (
                      <div key={p} style={{...s.statCard,background:bg,marginBottom:12}}>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                          <div style={{...s.statLabel,color,marginBottom:0}}>{name}</div>
                          <div style={{fontSize:14,fontWeight:600,color}}>{fmtTotals(totals[p])}</div>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <div style={{flex:1,height:8,borderRadius:99,background:'rgba(0,0,0,0.08)',overflow:'hidden'}}>
                            <div style={{height:'100%',borderRadius:99,background:over?'#d94f4f':accent,width:`${pct}%`,transition:'width 0.4s'}} />
                          </div>
                          <input
                            type="number" min="0" placeholder="Budget €"
                            value={budgets[p]}
                            onChange={e=>saveBudget(p,e.target.value)}
                            style={{...s.input,width:110,padding:'5px 9px',fontSize:13}}
                          />
                        </div>
                        {budget>0 && <div style={{fontSize:11,color,marginTop:5,opacity:0.8}}>
                          {over ? `⚠ Dépassement de ${(spent-budget).toFixed(2)} €` : `${(budget-spent).toFixed(2)} € restants`}
                        </div>}
                      </div>
                    )
                  })}
                  <div style={s.statCard}>
                    <div style={s.statLabel}>Total commun (Loïs & Ines)</div>
                    <div style={{...s.statValue,fontSize:18,color:'#1a6b45'}}>{fmtTotals(totals.both)}</div>
                  </div>
                  <div style={s.sectionTitle}>Répartition</div>
                  <div style={s.statGrid}>
                    <div style={s.statCard}><div style={s.statLabel}>Transports</div><div style={s.statValue}>{transports.length}</div></div>
                    <div style={s.statCard}><div style={s.statLabel}>Étapes</div><div style={s.statValue}>{etapes.length}</div></div>
                    {Object.entries(catLabels).map(([cat,label])=>{
                      const count = depenses.filter(d=>d.categorie===cat).length
                      return count ? <div key={cat} style={s.statCard}><div style={s.statLabel}>{catIcons[cat]} {label}</div><div style={s.statValue}>{count}</div></div> : null
                    })}
                  </div>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8,marginBottom:4}}>
                    <div style={s.sectionTitle}>Chronologie complète</div>
                    <div style={{display:'flex',gap:6}}>
                      {[['all','Tous'],['lois','Loïs'],['ines','Ines']].map(([f,l])=>(
                        <button key={f} onClick={()=>setChronoFilter(f)}
                          style={{...s.filterBtn,...(chronoFilter===f?s['filterActive_'+f]:{})}}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{display:'flex',flexDirection:'column'}}>
                    {[...transports.map(e=>({...e,_kind:'transport'})),...depenses.map(e=>({...e,_kind:'depense'})),...etapes.map(e=>({...e,_kind:'etape'})),...hebergements.map(e=>({...e,_kind:'hebergement',date:e.dateArrivee})),...hebergements.filter(e=>e.dateDepart).map(e=>({...e,_kind:'hebergement_out',date:e.dateDepart})),...transports.filter(e=>e.dateArr).map(e=>({...e,_kind:'transport_arr',date:e.dateArr}))]
                      .filter(e=>chronoFilter==='all'||(e.person||'both')===chronoFilter||(e.person||'both')==='both')
                      .sort((a,b)=>a.date<b.date?-1:1)
                      .map((e,i,arr)=>{
                        const p = e.person||'both'
                        const icon = e._kind==='transport'?`${typeIcons[e.type]} Départ`:e._kind==='transport_arr'?`${typeIcons[e.type]} Arrivée`:e._kind==='depense'?catIcons[e.categorie||'autre']:e._kind==='hebergement'?'🏨 Check-in':e._kind==='hebergement_out'?'🏨 Check-out':'📍'
                        const title = (e._kind==='transport'||e._kind==='transport_arr')?`${e.from} → ${e.to}`:e._kind==='depense'?e.label:(e._kind==='hebergement'||e._kind==='hebergement_out')?e.nom:e.titre
                        return (
                          <div key={e._id+e._kind} style={{display:'flex',gap:14}}>
                            <div style={{display:'flex',flexDirection:'column',alignItems:'center',paddingTop:2}}>
                              <div style={{width:12,height:12,borderRadius:'50%',background:'#2a5c45',flexShrink:0}} />
                              {i<arr.length-1&&<div style={{width:2,background:'#e0ddd6',flex:1,minHeight:24,margin:'4px 0'}} />}
                            </div>
                            <div style={{paddingBottom:20,flex:1}}>
                              <div style={{fontSize:12,color:'#a8a8a4'}}>{formatDate(e.date)}</div>
                              <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:15,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                                {icon} {title}
                                <span style={{...s.personTag,...s[personClass[p]],fontSize:11,padding:'2px 8px'}}>{personLabel[p]}</span>
                              </div>
                              {e.price&&<div style={{fontSize:13,color:'#1a6b45',fontWeight:500,marginTop:2}}>{e.price.toFixed(2)} {e.currency||'€'}</div>}
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
  headerInner: { maxWidth:860, margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between', minHeight:60, padding:'8px 24px', gap:12, flexWrap:'wrap' },
  logo: { fontFamily:'Syne,sans-serif', fontSize:18, fontWeight:700, letterSpacing:'-0.3px' },
  tabs: { display:'flex', gap:4, flexWrap:'wrap' },
  tab: { padding:'6px 14px', borderRadius:20, borderWidth:0, borderStyle:'solid', borderColor:'transparent', background:'transparent', color:'#6b6b67', fontSize:14, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" },
  tabActive: { background:'#2a5c45', color:'#fff', fontWeight:500 },
  main: { maxWidth:860, margin:'0 auto', padding:'28px 24px 60px' },
  filterBar: { display:'flex', gap:8, alignItems:'center', marginBottom:20, flexWrap:'wrap' },
  filterBtn: { padding:'5px 14px', borderRadius:20, borderWidth:1, borderStyle:'solid', borderColor:'rgba(0,0,0,0.15)', background:'#fff', color:'#6b6b67', fontSize:13, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" },
  filterActive_all:  { background:'#1a1a18', color:'#fff', borderColor:'#1a1a18' },
  filterActive_lois: { background:'#fff4e6', color:'#7a3e00', borderColor:'#e8a04a', fontWeight:500 },
  filterActive_ines: { background:'#fce8f0', color:'#7a1a3e', borderColor:'#d4729a', fontWeight:500 },
  card: { background:'#fff', borderWidth:1, borderStyle:'solid', borderColor:'rgba(0,0,0,0.08)', borderRadius:14, padding:'18px 20px', position:'relative', boxShadow:'0 2px 12px rgba(0,0,0,0.06)' },
  cardActions: { position:'absolute', top:14, right:14, display:'flex', gap:4 },
  iconBtn: { background:'none', borderWidth:1, borderStyle:'solid', borderColor:'rgba(0,0,0,0.1)', color:'#6b6b67', cursor:'pointer', fontSize:13, padding:'4px 9px', borderRadius:8, fontFamily:"'DM Sans',sans-serif" },
  cardHeader: { display:'flex', alignItems:'center', gap:8, marginBottom:10, flexWrap:'wrap', paddingRight:130 },
  typeBadge: { fontSize:11, fontWeight:500, padding:'3px 10px', borderRadius:20, fontFamily:'Syne,sans-serif' },
  badge_avion:   { background:'#e6f0fb', color:'#1a4a8a' },
  badge_train:   { background:'#e2f5ed', color:'#0d5c35' },
  badge_bus:     { background:'#fef3e2', color:'#7a4a00' },
  badge_taxi:    { background:'#fce8f5', color:'#7a0050' },
  badge_metro:   { background:'#ede8fb', color:'#3a1a8a' },
  badge_autre:   { background:'#f0efea', color:'#4a4a40' },
  badge_cat_bouffe:      { background:'#fff4e6', color:'#7a3e00' },
  badge_cat_activite:    { background:'#e6f5fb', color:'#0a4a6a' },
  badge_cat_hebergement: { background:'#e6fbe8', color:'#0a4a1a' },
  badge_cat_shopping:    { background:'#fbe6f5', color:'#6a0a4a' },
  badge_cat_autre:       { background:'#f0efea', color:'#4a4a40' },
  route: { fontFamily:'Syne,sans-serif', fontSize:16, fontWeight:700, flex:1 },
  personTag: { fontSize:12, fontWeight:500, padding:'3px 10px', borderRadius:20 },
  ptag_lois: { background:'#fff4e6', color:'#7a3e00' },
  ptag_ines: { background:'#fce8f0', color:'#7a1a3e' },
  ptag_both: { background:'#edf0fb', color:'#2a3580' },
  priceTag: { fontSize:13, fontWeight:500, color:'#1a6b45', background:'#e8f5ed', padding:'3px 10px', borderRadius:20 },
  paysTag: { fontSize:11, fontWeight:500, padding:'3px 9px', borderRadius:20, background:'#f0f0ea', color:'#5a5a50', border:'1px solid rgba(0,0,0,0.1)' },
  details: { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:8 },
  detail: { fontSize:12, color:'#a8a8a4', textTransform:'uppercase', letterSpacing:'0.5px', display:'block' },
  note: { fontSize:13, color:'#6b6b67', marginTop:12, paddingTop:12, borderTopWidth:1, borderTopStyle:'solid', borderTopColor:'rgba(0,0,0,0.08)', fontStyle:'italic' },
  sectionTitle: { fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:1, color:'#a8a8a4', margin:'18px 0 10px', fontFamily:'Syne,sans-serif' },
  row: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 },
  fg: { marginBottom:12 },
  label: { fontSize:12, color:'#6b6b67', display:'block', marginBottom:5, fontWeight:500 },
  input: { width:'100%', padding:'9px 12px', borderWidth:1, borderStyle:'solid', borderColor:'rgba(0,0,0,0.15)', borderRadius:8, background:'#f7f5f0', color:'#1a1a18', fontSize:14, fontFamily:"'DM Sans',sans-serif", outline:'none', boxSizing:'border-box' },
  personBtn: { flex:1, padding:'8px 4px', borderRadius:8, borderWidth:1, borderStyle:'solid', borderColor:'rgba(0,0,0,0.15)', background:'#f7f5f0', color:'#6b6b67', fontSize:12, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textAlign:'center' },
  personSel_both: { background:'#edf0fb', color:'#2a3580', borderColor:'#7a85d4', fontWeight:500 },
  personSel_lois: { background:'#fff4e6', color:'#7a3e00', borderColor:'#e8a04a', fontWeight:500 },
  personSel_ines: { background:'#fce8f0', color:'#7a1a3e', borderColor:'#d4729a', fontWeight:500 },
  saveBtn: { flex:1, padding:'9px', background:'#2a5c45', color:'#fff', borderWidth:0, borderStyle:'solid', borderColor:'transparent', borderRadius:8, fontSize:14, fontWeight:500, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" },
  cancelBtn: { padding:'9px 18px', background:'transparent', color:'#6b6b67', borderWidth:1, borderStyle:'solid', borderColor:'rgba(0,0,0,0.15)', borderRadius:8, fontSize:14, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" },
  statGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, marginBottom:24 },
  statCard: { background:'#fff', borderWidth:1, borderStyle:'solid', borderColor:'rgba(0,0,0,0.08)', borderRadius:14, padding:'16px 18px', boxShadow:'0 2px 12px rgba(0,0,0,0.06)' },
  statLabel: { fontSize:12, color:'#a8a8a4', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:6 },
  statValue: { fontFamily:'Syne,sans-serif', fontSize:26, fontWeight:700 },
  empty: { textAlign:'center', padding:'60px 24px', color:'#a8a8a4', fontSize:15 },
  dayHeader: { display:'flex', alignItems:'center', gap:10, marginBottom:12, fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:16 },
  dayDot: { width:14, height:14, borderRadius:'50%', background:'#2a5c45', flexShrink:0 },
}
