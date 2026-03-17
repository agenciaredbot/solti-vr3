import { hubFetch } from '@/lib/hub'
import { StatCard } from '@/components/stat-card'

async function getUsage() {
  try {
    return await hubFetch('/analytics/usage?limit=50')
  } catch {
    return { data: [] }
  }
}

async function getMetrics() {
  try {
    return await hubFetch('/analytics/metrics?days=14')
  } catch {
    return { data: [] }
  }
}

async function getCredits() {
  try {
    return await hubFetch('/analytics/credits')
  } catch {
    return { data: {} }
  }
}

export default async function AnalyticsPage() {
  const [usageRes, metricsRes, creditsRes] = await Promise.all([getUsage(), getMetrics(), getCredits()])
  const usage = usageRes.data || []
  const metrics = metricsRes.data || []
  const credits = creditsRes.data?.balance || creditsRes.data || {}

  // Aggregate usage by service
  const byService: Record<string, { calls: number; cost: number }> = {}
  let totalCost = 0
  for (const u of usage) {
    const svc = u.service || 'unknown'
    if (!byService[svc]) byService[svc] = { calls: 0, cost: 0 }
    byService[svc].calls++
    const cost = parseFloat(u.realCostUsd || 0)
    byService[svc].cost += cost
    totalCost += cost
  }

  // Last 14 days metrics
  const totalLeads = metrics.reduce((s: number, m: any) => s + (m.leadsGenerated || 0), 0)
  const totalEmails = metrics.reduce((s: number, m: any) => s + (m.emailsSent || 0), 0)
  const totalDMs = metrics.reduce((s: number, m: any) => s + (m.dmsSent || 0), 0)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-text-muted mt-1">Métricas y uso del sistema</p>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard label="API Calls" value={usage.length} icon="🔌" />
        <StatCard label="Costo Total" value={`$${totalCost.toFixed(2)}`} icon="💰" />
        <StatCard label="Créditos Restantes" value={credits.available ?? '—'} icon="🎫" />
        <StatCard label="Leads (14d)" value={totalLeads} icon="🎯" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Usage by Service */}
        <div className="bg-surface-light border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Uso por Servicio</h2>
          <div className="space-y-3">
            {Object.entries(byService).sort((a, b) => b[1].calls - a[1].calls).map(([svc, data]) => (
              <div key={svc} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{svc === 'apify' ? '🕷️' : svc === 'brevo' ? '📧' : svc === 'evolution' ? '💬' : svc === 'getlate' ? '📱' : '🔧'}</span>
                  <div>
                    <p className="font-medium capitalize">{svc}</p>
                    <p className="text-xs text-text-muted">{data.calls} llamadas</p>
                  </div>
                </div>
                <span className="font-mono text-sm">${data.cost.toFixed(3)}</span>
              </div>
            ))}
            {Object.keys(byService).length === 0 && (
              <p className="text-text-muted text-sm">Sin uso registrado</p>
            )}
          </div>
        </div>

        {/* 14-day Activity */}
        <div className="bg-surface-light border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Actividad (14 días)</h2>
          <div className="space-y-4">
            <MetricBar label="Leads Generados" value={totalLeads} max={Math.max(totalLeads, 100)} color="bg-accent-green" />
            <MetricBar label="Emails Enviados" value={totalEmails} max={Math.max(totalEmails, 100)} color="bg-accent-blue" />
            <MetricBar label="DMs Enviados" value={totalDMs} max={Math.max(totalDMs, 100)} color="bg-accent-yellow" />
          </div>

          <div className="mt-6 pt-4 border-t border-border">
            <h3 className="text-sm font-medium text-text-muted mb-3">Últimos 14 días</h3>
            <div className="flex items-end gap-1 h-20">
              {metrics.slice(0, 14).reverse().map((m: any, i: number) => {
                const val = (m.leadsGenerated || 0) + (m.emailsSent || 0) + (m.dmsSent || 0)
                const maxVal = Math.max(...metrics.map((x: any) => (x.leadsGenerated || 0) + (x.emailsSent || 0) + (x.dmsSent || 0)), 1)
                const height = Math.max((val / maxVal) * 100, 4)
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-primary/60 rounded-t hover:bg-primary transition-colors"
                      style={{ height: `${height}%` }}
                      title={`${m.date}: ${val} acciones`}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Recent API Usage Logs */}
      <div className="bg-surface-light border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Últimas Llamadas API</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-text-muted text-xs">
              <th className="text-left p-4">Servicio</th>
              <th className="text-left p-4">Acción</th>
              <th className="text-left p-4">Costo</th>
              <th className="text-left p-4">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {usage.slice(0, 20).map((u: any) => (
              <tr key={u.id} className="border-b border-border/50 hover:bg-surface-lighter transition-colors">
                <td className="p-4 text-sm capitalize font-medium">{u.service}</td>
                <td className="p-4 text-sm text-text-muted">{u.action}</td>
                <td className="p-4 text-sm font-mono">${parseFloat(u.realCostUsd || 0).toFixed(4)}</td>
                <td className="p-4 text-sm text-text-muted">{new Date(u.createdAt).toLocaleString('es-CO')}</td>
              </tr>
            ))}
            {usage.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-text-muted">Sin registros de uso</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MetricBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-text-muted">{label}</span>
        <span className="font-mono text-sm font-bold">{value}</span>
      </div>
      <div className="w-full h-2 bg-surface-lighter rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
