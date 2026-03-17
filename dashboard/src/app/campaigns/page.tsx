import Link from 'next/link'
import { hubFetch } from '@/lib/hub'

async function getCampaigns() {
  try {
    return await hubFetch('/campaigns')
  } catch (e) {
    return { data: [] }
  }
}

const STATUS_ICONS: Record<string, string> = {
  DRAFT: '📝',
  SCHEDULED: '📅',
  SENDING: '🚀',
  PAUSED: '⏸️',
  COMPLETED: '✅',
  FAILED: '❌',
}

const TYPE_ICONS: Record<string, string> = {
  EMAIL: '📧',
  WHATSAPP: '💬',
  INSTAGRAM_DM: '📸',
  LINKEDIN_DM: '💼',
  SMS: '📱',
}

export default async function CampaignsPage() {
  const result = await getCampaigns()
  const campaigns = result.data || []

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Campañas</h1>
          <p className="text-text-muted mt-1">{campaigns.length} campañas</p>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="bg-surface-light border border-border rounded-xl p-12 text-center">
          <p className="text-5xl mb-4">📧</p>
          <h2 className="text-xl font-semibold mb-2">Sin campañas aún</h2>
          <p className="text-text-muted">
            Ejecuta <code className="bg-surface-lighter px-2 py-1 rounded text-sm">/outreach</code> en Solti para crear una campaña.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {campaigns.map((c: any) => (
            <Link key={c.id} href={`/campaigns/${c.id}`}>
              <CampaignCard campaign={c} />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function CampaignCard({ campaign: c }: { campaign: any }) {
  const stats = typeof c.stats === 'string' ? JSON.parse(c.stats || '{}') : (c.stats || {})

  return (
    <div className="bg-surface-light border border-border rounded-xl p-6 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">{TYPE_ICONS[c.type] || '📋'}</span>
          <h3 className="font-semibold truncate">{c.name}</h3>
        </div>
        <span className="text-sm">{STATUS_ICONS[c.status] || '❓'} {c.status}</span>
      </div>

      <div className="space-y-2 text-sm text-text-muted">
        <div className="flex justify-between">
          <span>Tipo</span>
          <span className="font-medium text-text">{c.type}</span>
        </div>
        {stats.sent > 0 && (
          <>
            <div className="flex justify-between">
              <span>Enviados</span>
              <span className="font-mono text-text">{stats.sent}</span>
            </div>
            <div className="flex justify-between">
              <span>Abiertos</span>
              <span className="font-mono text-text">{stats.opened || 0} ({stats.sent > 0 ? Math.round((stats.opened || 0) / stats.sent * 100) : 0}%)</span>
            </div>
            <div className="flex justify-between">
              <span>Rebotados</span>
              <span className="font-mono text-text">{stats.bounced || 0}</span>
            </div>
          </>
        )}
        <div className="flex justify-between">
          <span>Creada</span>
          <span className="text-text">{new Date(c.createdAt).toLocaleDateString('es-CO')}</span>
        </div>
      </div>
    </div>
  )
}
