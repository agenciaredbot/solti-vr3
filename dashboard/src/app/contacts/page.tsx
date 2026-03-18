import Link from 'next/link'
import { hubFetch } from '@/lib/hub'

async function getContacts() {
  try {
    return await hubFetch('/contacts?limit=50&sortBy=score&sortDir=desc')
  } catch (e) {
    return { data: [], pagination: { total: 0 } }
  }
}

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-accent-blue/20 text-accent-blue',
  CONTACTED: 'bg-accent-yellow/20 text-accent-yellow',
  REPLIED: 'bg-accent-green/20 text-accent-green',
  QUALIFIED: 'bg-primary/20 text-primary',
  CUSTOMER: 'bg-accent-green/20 text-accent-green',
  LOST: 'bg-red-500/20 text-red-400',
}

export default async function ContactsPage() {
  const result = await getContacts()
  const contacts = result.data || []
  const total = result.pagination?.total ?? contacts.length

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Contactos</h1>
          <p className="text-text-muted mt-1">{total} contactos en el CRM</p>
        </div>
      </div>

      <div className="bg-surface-light border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-text-muted text-sm">
              <th className="text-left p-4">Nombre</th>
              <th className="text-left p-4">Email</th>
              <th className="text-left p-4">Ciudad</th>
              <th className="text-left p-4">Score</th>
              <th className="text-left p-4">Estado</th>
              <th className="text-left p-4">Fuente</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c: any) => (
              <tr key={c.id} className="border-b border-border/50 hover:bg-surface-lighter transition-colors">
                <td className="p-4 font-medium">
                  <Link href={`/contacts/${c.id}`} className="text-primary hover:underline">
                    {c.firstName} {c.lastName}
                  </Link>
                </td>
                <td className="p-4 text-text-muted text-sm">{c.email || '—'}</td>
                <td className="p-4 text-text-muted text-sm">{c.city || '—'}</td>
                <td className="p-4">
                  <ScoreBadge score={c.score ?? 0} />
                </td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[c.status] || 'bg-surface-lighter text-text-muted'}`}>
                    {c.status}
                  </span>
                </td>
                <td className="p-4 text-text-muted text-sm">{c.source || '—'}</td>
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-text-muted">
                  No hay contactos aun.{' '}
                  <a href="/scraping" className="text-primary hover:underline">
                    Busca prospectos
                  </a>{' '}
                  para generar leads.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ScoreBadge({ score }: { score: number }) {
  let color = 'text-text-muted'
  if (score >= 80) color = 'text-accent-green'
  else if (score >= 60) color = 'text-accent-yellow'
  else if (score >= 30) color = 'text-accent-blue'

  return (
    <span className={`font-mono font-bold ${color}`}>
      {score}
    </span>
  )
}
