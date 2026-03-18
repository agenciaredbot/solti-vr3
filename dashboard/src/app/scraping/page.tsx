import { hubFetch } from '@/lib/hub'
import { StatCard } from '@/components/stat-card'
import { Badge } from '@/components/ui/badge'
import { ScrapingActions } from './actions'

async function getScrapingJobs() {
  try {
    return await hubFetch('/scraping/jobs?limit=10')
  } catch {
    return { data: [], pagination: { total: 0 } }
  }
}

async function getCreditBalance() {
  try {
    return await hubFetch('/credits/balance')
  } catch {
    return { data: { available: 0, usedCredits: 0 } }
  }
}

const STATUS_MAP: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'default' }> = {
  PENDING: { label: 'Pendiente', variant: 'warning' },
  RUNNING: { label: 'Ejecutando', variant: 'info' },
  COMPLETED: { label: 'Completado', variant: 'success' },
  FAILED: { label: 'Fallido', variant: 'danger' },
  CANCELLED: { label: 'Cancelado', variant: 'default' },
}

const PLATFORM_LABELS: Record<string, string> = {
  google_maps: 'Google Maps',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  website: 'Sitio Web',
}

export default async function ScrapingPage() {
  const [jobsRes, balanceRes] = await Promise.all([getScrapingJobs(), getCreditBalance()])

  const jobs = jobsRes.data || []
  const totalJobs = jobsRes.pagination?.total || 0
  const balance = balanceRes.data || { available: 0, usedCredits: 0 }

  const completedJobs = jobs.filter((j: any) => j.status === 'COMPLETED').length
  const activeJobs = jobs.filter((j: any) => j.status === 'RUNNING' || j.status === 'PENDING').length

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Prospeccion</h1>
        <p className="text-text-muted mt-1">
          Busca leads en Google Maps, Instagram, LinkedIn y sitios web
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard
          label="Jobs Completados"
          value={completedJobs}
          icon="🔍"
        />
        <StatCard
          label="Jobs Activos"
          value={activeJobs}
          icon="⚡"
        />
        <StatCard
          label="Creditos Disponibles"
          value={balance.available ?? 0}
          icon="💰"
        />
      </div>

      {/* Main scraping interface */}
      <ScrapingActions />

      {/* Recent jobs */}
      {jobs.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Jobs Recientes</h2>
          <div className="bg-surface-light border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-text-muted text-left">
                  <th className="px-4 py-3 font-medium">Plataforma</th>
                  <th className="px-4 py-3 font-medium">Busqueda</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job: any) => {
                  const input = job.input || {}
                  const platform = input.platform || job.type
                  const status = STATUS_MAP[job.status] || STATUS_MAP.PENDING
                  const searchLabel = input.searchQuery || input.query || input.searchUrl || 'Scraping'
                  return (
                    <tr key={job.id} className="border-b border-border/50 last:border-0 hover:bg-surface-lighter/50">
                      <td className="px-4 py-3">
                        <span className="font-medium">{PLATFORM_LABELS[platform] || platform}</span>
                      </td>
                      <td className="px-4 py-3 text-text-muted truncate max-w-[200px]">
                        {searchLabel}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-text-muted">
                        {new Date(job.createdAt).toLocaleDateString('es-CO', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                        })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
