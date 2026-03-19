import { Syne, DM_Sans } from 'next/font/google'

const syne = Syne({ subsets: ['latin'], variable: '--font-syne' })
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm' })

export const metadata = { title: 'Carnet de voyage — Loïs & Ines' }

export default function RootLayout({ children }) {
  return (
    <html lang="fr" className={`${syne.variable} ${dmSans.variable}`}>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  )
}
