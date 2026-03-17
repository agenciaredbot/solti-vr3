import { hubFetch } from '@/lib/hub'
import { Badge } from '@/components/ui/badge'
import { CampaignActions } from './actions'

const STATUS_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'primary' | 'danger' | 'default'> = {
  DRAFT: 'default',
  SCHEDULED: 'info',
  SENDING: 'warning',
  PAUSED: 'primary',
  COMPLETED: 'success',
  FAILED: 'danger',
}

async function getCampaign(id: string) {
  try {
    return await hubFetch(`/campaigns/${id}`)
  } catch {
    return null
  }
}

async function getRecipients(id: string) {
  try {
    return await hubFetch(`/campaigns/${id}/recipients`)
  } catch {
    return { data: [] }
  }
}

async function getEvents(id: string) {
  try {
    return await hubFetch(`/campaigns/${id}/events`)
  } catch {
    return { data: [] }
  }
}

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [campaignRes, recipientsRes, eventsRes] = await Promise.all([
    getCampaign(id), getRecipients(id), getEvents(id),
  ])
  const campaign = campaignRes?.data || campaignRes

  if (!campaign) {
    return <p className="text-text-muted">Campaña no encontrada</p>
  }

  const recipients = recipientsRes.data || []
  const events = eventsRes.data || []
  const steps = campaign.steps || []
  const stats = typeof campaign.stats === 'string' ? JSON.parse(campaign.stats || '{}') : (campaign.stats || {})

  return (
    <div>
      {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold">{campaign.name}</h1>
              <Badge variant={STATUS_VARIANT[campaign.status] || 'default'}>{campaign.status}</Badge>
            </div>
            <p className="text-text-muted">
              {campaign.type} · {steps.length} pasos · {recipients.length} destinatarios
            </p>
          </div>
          <CampaignActions campaignId={campaign.id} status={campaign.status} />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
          <MiniStat label="Enviados" value={stats.sent || 0} />
          <MiniStat label="Entregados" value={stats.delivered || 0} />
          <MiniStat label="Abiertos" value={stats.opened || 0} accent={stats.sent > 0 ? `${Math.round((stats.opened || 0) / stats.sent * 100)}%` : undefined} />
          <MiniStat label="Clicks" value={stats.clicked || 0} />
          <MiniStat label="Respondidos" value={stats.replied || 0} />
          <MiniStat label="Rebotados" value={stats.bounced || 0} danger={stats.bounced > 0} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Steps */}
            <div className="bg-surface-light border border-border rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Pasos de la Secuencia</h2>
              <div className="space-y-4">
                {steps.sort((a: any, b: any) => a.stepNumber - b.stepNumber).map((step: any) => (
                  <div key={step.id} className="border border-border/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 bg-primary/20 text-primary rounded-full flex items-center justify-center text-xs font-bold">
                          {step.stepNumber}
                        </span>
                        <span className="font-medium capitalize">{step.type}</span>
                        <Badge variant="default">{step.channel}</Badge>
                      </div>
                      <span className="text-xs text-text-muted">
                        {step.delayDays > 0 ? `+${step.delayDays} días` : 'Inmediato'}
                        {step.condition !== 'always' && ` · ${step.condition}`}
                      </span>
                    </div>
                    {step.subject && (
                      <p className="text-sm text-text-muted mb-1">Asunto: <span className="text-text">{step.subject}</span></p>
                    )}
                    <p className="text-xs text-text-muted line-clamp-2">
                      {(step.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)}
                    </p>
                  </div>
                ))}
                {steps.length === 0 && (
                  <p className="text-text-muted text-sm">Sin pasos definidos</p>
                )}
              </div>
            </div>

            {/* Recipients */}
            <div className="bg-surface-light border border-border rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="text-lg font-semibold">Destinatarios ({recipients.length})</h2>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-text-muted text-xs">
                    <th className="text-left p-4">Contacto</th>
                    <th className="text-left p-4">Email</th>
                    <th className="text-left p-4">Paso</th>
                    <th className="text-left p-4">Estado</th>
                    <th className="text-left p-4">Último envío</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.slice(0, 50).map((r: any) => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-surface-lighter transition-colors">
                      <td className="p-4 text-sm font-medium">
                        {r.contact?.firstName} {r.contact?.lastName}
                      </td>
                      <td className="p-4 text-sm text-text-muted">{r.contact?.email || '—'}</td>
                      <td className="p-4 text-sm font-mono">{r.currentStep || 0}</td>
                      <td className="p-4">
                        <Badge variant={r.status === 'SENT' ? 'success' : r.status === 'FAILED' ? 'danger' : 'default'}>
                          {r.status}
                        </Badge>
                      </td>
                      <td className="p-4 text-xs text-text-muted">
                        {r.lastSentAt ? new Date(r.lastSentAt).toLocaleString('es-CO') : '—'}
                      </td>
                    </tr>
                  ))}
                  {recipients.length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-text-muted">Sin destinatarios</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Events timeline */}
          <div className="bg-surface-light border border-border rounded-xl p-6 max-h-[800px] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Timeline ({events.length})</h2>
            <div className="space-y-3">
              {events.slice(0, 50).map((e: any) => (
                <div key={e.id} className="flex gap-3 pb-3 border-b border-border/30 last:border-0">
                  <div className="w-2 h-2 mt-1.5 rounded-full shrink-0 bg-primary" />
                  <div>
                    <p className="text-sm">
                      <span className="font-medium capitalize">{e.eventType}</span>
                      {e.contact && <span className="text-text-muted"> · {e.contact.firstName} {e.contact.lastName}</span>}
                    </p>
                    <p className="text-xs text-text-muted">Paso {e.stepNumber} · {new Date(e.createdAt).toLocaleString('es-CO')}</p>
                  </div>
                </div>
              ))}
              {events.length === 0 && (
                <p className="text-text-muted text-sm">Sin eventos aún</p>
              )}
            </div>
          </div>
        </div>
    </div>
  )
}

function MiniStat({ label, value, accent, danger }: { label: string; value: number; accent?: string; danger?: boolean }) {
  return (
    <div className="bg-surface-light border border-border rounded-lg p-4">
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`text-2xl font-bold font-mono ${danger ? 'text-red-400' : ''}`}>{value}</p>
      {accent && <p className="text-xs text-accent-green">{accent}</p>}
    </div>
  )
}
