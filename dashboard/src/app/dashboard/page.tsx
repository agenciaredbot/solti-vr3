import { hubFetch } from '@/lib/hub'
import { StatCard } from '@/components/stat-card'

async function getDashboard() {
  try {
    return await hubFetch('/analytics/dashboard')
  } catch (e) {
    return null
  }
}

export default async function DashboardPage() {
  const data = await getDashboard()
  const d = data?.data || data || {}
  const contacts = d.contacts || {}
  const campaigns = d.campaigns || {}
  const credits = d.credits || {}
  const today = d.today || {}

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-text-muted mt-1">Resumen de tu motor de crecimiento</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          label="Contactos"
          value={contacts.total ?? '—'}
          icon="👥"
        />
        <StatCard
          label="Campañas Activas"
          value={campaigns.active ?? 0}
          icon="📧"
        />
        <StatCard
          label="Créditos"
          value={credits.available ?? '—'}
          icon="💰"
        />
        <StatCard
          label="Leads Hoy"
          value={today.leadsGenerated ?? 0}
          icon="🎯"
        />
      </div>

      {/* Today's Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-light border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Actividad de Hoy</h2>
          <div className="space-y-3">
            <ActivityRow label="Emails enviados" value={today.emailsSent ?? 0} />
            <ActivityRow label="DMs enviados" value={today.dmsSent ?? 0} />
            <ActivityRow label="WhatsApp entrante" value={today.whatsappMessagesIn ?? 0} />
            <ActivityRow label="WhatsApp saliente" value={today.whatsappMessagesOut ?? 0} />
            <ActivityRow label="Posts publicados" value={today.postsPublished ?? 0} />
          </div>
        </div>

        <div className="bg-surface-light border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Distribución de Leads</h2>
          <div className="space-y-3">
            {contacts.byStatus && Object.entries(contacts.byStatus).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <span className="text-text-muted">{status}</span>
                <span className="font-mono font-bold">{String(count)}</span>
              </div>
            ))}
            {!contacts.byStatus && (
              <p className="text-text-muted">Sin datos</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ActivityRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-text-muted text-sm">{label}</span>
      <span className="font-mono text-lg font-bold">{value}</span>
    </div>
  )
}
