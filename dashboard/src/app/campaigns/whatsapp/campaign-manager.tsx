'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { hubClientFetch } from '@/lib/hub'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Campaign {
  id: string
  name: string
  type: string
  status: string
  listId: string | null
  settings: Record<string, unknown>
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  steps: CampaignStep[]
  list?: { id: string; name: string } | null
  _count?: { recipients: number }
}

interface CampaignStep {
  id: string
  campaignId: string
  stepNumber: number
  type: string
  channel: string
  subject: string | null
  body: string
  delayDays: number
  condition: string
}

interface Instance {
  id: string
  instanceName: string
  status: string
  phoneNumber: string | null
  connectedAt: string | null
}

interface ContactList {
  id: string
  name: string
  _count?: { members: number }
}

interface CampaignStats {
  status: string
  total: number
  sent: number
  failed: number
  pending: number
  delivered: number
  read: number
  replied: number
}

interface Recipient {
  id: string
  status: string
  lastSentAt: string | null
  contact: {
    id: string
    firstName: string | null
    lastName: string | null
    phone: string | null
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'default' | 'info' | 'primary' }> = {
  DRAFT: { label: 'Borrador', variant: 'default' },
  SCHEDULED: { label: 'Programada', variant: 'info' },
  SENDING: { label: 'Enviando', variant: 'warning' },
  PAUSED: { label: 'Pausada', variant: 'warning' },
  COMPLETED: { label: 'Completada', variant: 'success' },
  FAILED: { label: 'Fallida', variant: 'danger' },
}

const PERSONALIZATION_TAGS = [
  { tag: '{{firstName}}', label: 'Nombre' },
  { tag: '{{lastName}}', label: 'Apellido' },
  { tag: '{{company}}', label: 'Empresa' },
  { tag: '{{city}}', label: 'Ciudad' },
  { tag: '{{phone}}', label: 'Teléfono' },
]

const SAMPLE_DATA: Record<string, string> = {
  '{{firstName}}': 'Carlos',
  '{{lastName}}': 'Gomez',
  '{{company}}': 'TechCo',
  '{{city}}': 'Bogota',
  '{{phone}}': '+573001234567',
}

type View = 'list' | 'create' | 'detail'

// ─── Main Component ──────────────────────────────────────────────────────────

interface Props {
  initialCampaigns: Campaign[]
  instances: Instance[]
  lists: ContactList[]
}

export function WhatsAppCampaignManager({ initialCampaigns, instances, lists }: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns)
  const [view, setView] = useState<View>('list')
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(false)

  const refreshCampaigns = useCallback(async () => {
    try {
      const res = await hubClientFetch('/campaigns')
      const all = res.data || []
      setCampaigns(all.filter((c: Campaign) => c.type === 'whatsapp'))
    } catch {
      // keep current
    }
  }, [])

  const handleViewDetail = useCallback((campaign: Campaign) => {
    setSelectedCampaign(campaign)
    setView('detail')
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Eliminar esta campana permanentemente?')) return
    try {
      await hubClientFetch(`/campaigns/${id}`, { method: 'DELETE' })
      setCampaigns(prev => prev.filter(c => c.id !== id))
    } catch (err: any) {
      alert('Error al eliminar: ' + err.message)
    }
  }, [])

  const handleCreated = useCallback(async () => {
    await refreshCampaigns()
    setView('list')
  }, [refreshCampaigns])

  const handleBack = useCallback(() => {
    setView('list')
    setSelectedCampaign(null)
    refreshCampaigns()
  }, [refreshCampaigns])

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          {view !== 'list' && (
            <button
              onClick={handleBack}
              className="text-text-muted hover:text-text text-sm mb-2 flex items-center gap-1 cursor-pointer"
            >
              &larr; Volver a campanas
            </button>
          )}
          <h1 className="text-3xl font-bold">Campanas WhatsApp</h1>
          <p className="text-text-muted text-sm mt-1">
            {view === 'list' && `${campaigns.length} campanas`}
            {view === 'create' && 'Nueva campana de WhatsApp'}
            {view === 'detail' && selectedCampaign?.name}
          </p>
        </div>
        {view === 'list' && (
          <Button onClick={() => setView('create')}>+ Nueva Campana</Button>
        )}
      </div>

      {view === 'list' && (
        <CampaignList
          campaigns={campaigns}
          instances={instances}
          onView={handleViewDetail}
          onDelete={handleDelete}
          onRefresh={refreshCampaigns}
        />
      )}
      {view === 'create' && (
        <CreateCampaignFlow
          instances={instances}
          lists={lists}
          onCreated={handleCreated}
          onCancel={() => setView('list')}
        />
      )}
      {view === 'detail' && selectedCampaign && (
        <CampaignDetailView
          campaign={selectedCampaign}
          instances={instances}
          onBack={handleBack}
        />
      )}
    </div>
  )
}

// ─── Campaign List ───────────────────────────────────────────────────────────

function CampaignList({
  campaigns,
  instances,
  onView,
  onDelete,
  onRefresh,
}: {
  campaigns: Campaign[]
  instances: Instance[]
  onView: (c: Campaign) => void
  onDelete: (id: string) => void
  onRefresh: () => void
}) {
  const [launchModal, setLaunchModal] = useState<Campaign | null>(null)

  if (campaigns.length === 0) {
    return (
      <div className="bg-surface-light border border-border rounded-xl p-12 text-center">
        <p className="text-4xl mb-4">💬</p>
        <h2 className="text-lg font-semibold mb-2">Sin campanas de WhatsApp</h2>
        <p className="text-text-muted text-sm max-w-md mx-auto">
          Crea tu primera campana para enviar mensajes masivos a tus contactos de forma segura y controlada.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {campaigns.map(c => {
          const badge = STATUS_BADGE[c.status] || STATUS_BADGE.DRAFT
          const settings = c.settings || {}
          return (
            <div key={c.id} className="bg-surface-light border border-border rounded-xl p-6 flex flex-col gap-4 hover:border-primary/30 transition-colors">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold truncate flex-1">{c.name}</h3>
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs text-text-muted">
                <div>
                  <p>Contactos</p>
                  <p className="font-medium text-text">{c._count?.recipients || 0}</p>
                </div>
                <div>
                  <p>Lista</p>
                  <p className="font-medium text-text">{c.list?.name || 'Sin lista'}</p>
                </div>
                <div>
                  <p>Creada</p>
                  <p className="font-medium text-text">{new Date(c.createdAt).toLocaleDateString('es-CO')}</p>
                </div>
                {c.steps?.length > 0 && (
                  <div>
                    <p>Pasos</p>
                    <p className="font-medium text-text">{c.steps.length}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-auto pt-3 border-t border-border/50">
                <Button size="sm" variant="ghost" onClick={() => onView(c)}>
                  Ver
                </Button>
                {(c.status === 'DRAFT' || c.status === 'PAUSED') && (
                  <Button size="sm" variant="primary" onClick={() => setLaunchModal(c)}>
                    Lanzar
                  </Button>
                )}
                {c.status === 'DRAFT' && (
                  <Button size="sm" variant="danger" onClick={() => onDelete(c.id)}>
                    Eliminar
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {launchModal && (
        <LaunchModal
          campaign={launchModal}
          instances={instances}
          onClose={() => { setLaunchModal(null); onRefresh() }}
        />
      )}
    </>
  )
}

// ─── Launch Modal ────────────────────────────────────────────────────────────

function LaunchModal({
  campaign,
  instances,
  onClose,
}: {
  campaign: Campaign
  instances: Instance[]
  onClose: () => void
}) {
  const connectedInstances = instances.filter(i => i.status === 'CONNECTED')
  const [instanceId, setInstanceId] = useState(connectedInstances[0]?.id || '')
  const [delaySeconds, setDelaySeconds] = useState(3)
  const [dailyLimit, setDailyLimit] = useState(100)
  const [windowStart, setWindowStart] = useState(8)
  const [windowEnd, setWindowEnd] = useState(20)
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const handleLaunch = async () => {
    if (!confirmed) return
    setLoading(true)
    try {
      await hubClientFetch(`/campaigns/${campaign.id}/launch-whatsapp`, {
        method: 'POST',
        body: JSON.stringify({
          instanceId,
          delaySeconds,
          dailyLimit,
          sendingWindowStart: windowStart,
          sendingWindowEnd: windowEnd,
        }),
      })
      alert('Campana lanzada exitosamente')
      onClose()
    } catch (err: any) {
      alert('Error al lanzar: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Lanzar Campana de WhatsApp" maxWidth="max-w-xl">
      <div className="space-y-5">
        {/* Warning banner */}
        <div className="bg-accent-yellow/10 border border-accent-yellow/30 rounded-lg p-4 text-sm">
          <p className="font-semibold text-accent-yellow mb-1">Importante: Riesgo de ban de WhatsApp</p>
          <p className="text-text-muted">
            Enviar mensajes masivos puede resultar en la suspension temporal o permanente de tu numero.
            Usa velocidades bajas y limites diarios conservadores.
          </p>
        </div>

        {connectedInstances.length === 0 ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-sm text-red-400">
            No tienes instancias de WhatsApp conectadas. Ve a WhatsApp y conecta una primero.
          </div>
        ) : (
          <>
            <Select
              label="Instancia de WhatsApp"
              value={instanceId}
              onChange={e => setInstanceId(e.target.value)}
              options={connectedInstances.map(i => ({
                value: i.id,
                label: `${i.instanceName} ${i.phoneNumber ? `(${i.phoneNumber})` : ''}`,
              }))}
            />

            <div>
              <label className="block text-sm font-medium text-text-muted mb-1">
                Delay entre mensajes: {delaySeconds}s
              </label>
              <input
                type="range"
                min={2}
                max={10}
                step={1}
                value={delaySeconds}
                onChange={e => setDelaySeconds(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-text-muted mt-1">
                <span>2s (rapido)</span>
                <span>10s (seguro)</span>
              </div>
            </div>

            <Input
              label={`Limite diario de mensajes (max 200)`}
              type="number"
              min={1}
              max={200}
              value={dailyLimit}
              onChange={e => setDailyLimit(Math.min(200, Math.max(1, Number(e.target.value))))}
            />
            {dailyLimit > 150 && (
              <p className="text-red-400 text-xs -mt-3">Enviar mas de 150 mensajes/dia aumenta el riesgo de ban</p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Hora inicio"
                type="number"
                min={0}
                max={23}
                value={windowStart}
                onChange={e => setWindowStart(Number(e.target.value))}
              />
              <Input
                label="Hora fin"
                type="number"
                min={1}
                max={24}
                value={windowEnd}
                onChange={e => setWindowEnd(Number(e.target.value))}
              />
            </div>
            <p className="text-xs text-text-muted -mt-3">
              Solo se enviaran mensajes entre {windowStart}:00 y {windowEnd}:00
            </p>

            <div className="bg-surface border border-border rounded-lg p-4 text-sm space-y-1">
              <p><strong>Resumen:</strong></p>
              <p className="text-text-muted">Contactos: {campaign._count?.recipients || '?'}</p>
              <p className="text-text-muted">Delay: {delaySeconds}s entre cada mensaje</p>
              <p className="text-text-muted">Limite diario: {dailyLimit} mensajes</p>
              <p className="text-text-muted">
                Tiempo estimado: ~{Math.ceil(((campaign._count?.recipients || 0) * delaySeconds) / 60)} minutos
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
                className="accent-primary"
              />
              <span className="text-text-muted">
                Confirmo que entiendo los riesgos de envio masivo de WhatsApp
              </span>
            </label>

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={onClose}>Cancelar</Button>
              <Button
                loading={loading}
                disabled={!confirmed || !instanceId}
                onClick={handleLaunch}
              >
                Lanzar Campana
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

// ─── Create Campaign Flow ────────────────────────────────────────────────────

function CreateCampaignFlow({
  instances,
  lists,
  onCreated,
  onCancel,
}: {
  instances: Instance[]
  lists: ContactList[]
  onCreated: () => void
  onCancel: () => void
}) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)

  // Step 1: Basic config
  const [name, setName] = useState('')
  const [selectedInstanceId, setSelectedInstanceId] = useState(instances[0]?.id || '')
  const [selectedListId, setSelectedListId] = useState('')

  // Step 2: Message
  const [messageBody, setMessageBody] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Step 3: Safety
  const [delaySeconds, setDelaySeconds] = useState(3)
  const [dailyLimit, setDailyLimit] = useState(100)
  const [windowStart, setWindowStart] = useState(8)
  const [windowEnd, setWindowEnd] = useState(20)
  const [scheduleNow, setScheduleNow] = useState(true)
  const [scheduledDate, setScheduledDate] = useState('')

  const insertTag = (tag: string) => {
    const textarea = textareaRef.current
    if (!textarea) {
      setMessageBody(prev => prev + tag)
      return
    }
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newText = messageBody.substring(0, start) + tag + messageBody.substring(end)
    setMessageBody(newText)
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + tag.length, start + tag.length)
    }, 0)
  }

  const previewMessage = () => {
    let preview = messageBody
    for (const [tag, value] of Object.entries(SAMPLE_DATA)) {
      preview = preview.replaceAll(tag, value)
    }
    return preview
  }

  const selectedList = lists.find(l => l.id === selectedListId)
  const contactCount = selectedList?._count?.members || 0

  const handleCreate = async () => {
    setLoading(true)
    try {
      // 1. Create campaign
      const campaignRes = await hubClientFetch('/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name,
          type: 'whatsapp',
          listId: selectedListId || undefined,
          scheduledAt: !scheduleNow && scheduledDate ? new Date(scheduledDate).toISOString() : undefined,
          settings: {
            instanceId: selectedInstanceId,
            delaySeconds,
            dailyLimit,
            sendingWindowStart: windowStart,
            sendingWindowEnd: windowEnd,
          },
        }),
      })

      const campaign = campaignRes.data

      // 2. Add message step
      await hubClientFetch(`/campaigns/${campaign.id}/steps`, {
        method: 'POST',
        body: JSON.stringify({
          stepNumber: 1,
          delayDays: 0,
          type: 'initial',
          channel: 'whatsapp',
          body: messageBody,
          condition: 'always',
        }),
      })

      onCreated()
    } catch (err: any) {
      alert('Error al crear campana: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const canProceed = () => {
    switch (step) {
      case 1: return name.trim().length > 0 && selectedInstanceId
      case 2: return messageBody.trim().length > 0
      case 3: return true
      case 4: return true
      default: return false
    }
  }

  const stepLabels = ['Configuracion', 'Mensaje', 'Seguridad', 'Revision']

  return (
    <div className="max-w-3xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {stepLabels.map((label, i) => {
          const n = i + 1
          const active = n === step
          const done = n < step
          return (
            <div key={n} className="flex items-center gap-2 flex-1">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0
                ${active ? 'bg-primary text-white' : done ? 'bg-accent-green text-white' : 'bg-surface-lighter text-text-muted'}
              `}>
                {done ? '\u2713' : n}
              </div>
              <span className={`text-sm ${active ? 'text-text font-medium' : 'text-text-muted'} hidden sm:inline`}>
                {label}
              </span>
              {i < stepLabels.length - 1 && (
                <div className={`flex-1 h-px ${done ? 'bg-accent-green' : 'bg-border'}`} />
              )}
            </div>
          )
        })}
      </div>

      <div className="bg-surface-light border border-border rounded-xl p-6">
        {/* Step 1: Basic Config */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold">Configuracion basica</h2>

            <Input
              label="Nombre de la campana"
              placeholder="Ej: Promocion Enero 2026"
              value={name}
              onChange={e => setName(e.target.value)}
            />

            <Select
              label="Instancia de WhatsApp"
              value={selectedInstanceId}
              onChange={e => setSelectedInstanceId(e.target.value)}
              options={[
                ...instances.map(i => ({
                  value: i.id,
                  label: `${i.instanceName} (${i.status})`,
                })),
              ]}
            />
            {instances.find(i => i.id === selectedInstanceId)?.status !== 'CONNECTED' && selectedInstanceId && (
              <p className="text-accent-yellow text-xs -mt-3">
                Esta instancia no esta conectada. Deberas conectarla antes de lanzar.
              </p>
            )}

            <Select
              label="Lista de contactos"
              value={selectedListId}
              onChange={e => setSelectedListId(e.target.value)}
              options={[
                { value: '', label: 'Seleccionar lista...' },
                ...lists.map(l => ({
                  value: l.id,
                  label: `${l.name} (${l._count?.members || 0} contactos)`,
                })),
              ]}
            />
          </div>
        )}

        {/* Step 2: Message */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold">Mensaje</h2>

            <div>
              <label className="block text-sm font-medium text-text-muted mb-1">
                Etiquetas de personalizacion
              </label>
              <div className="flex flex-wrap gap-2">
                {PERSONALIZATION_TAGS.map(t => (
                  <button
                    key={t.tag}
                    type="button"
                    onClick={() => insertTag(t.tag)}
                    className="px-3 py-1 text-xs bg-surface-lighter border border-border rounded-full text-text-muted hover:text-text hover:border-primary/40 transition-colors cursor-pointer"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-muted mb-1">
                Cuerpo del mensaje ({messageBody.length} caracteres)
              </label>
              <textarea
                ref={textareaRef}
                value={messageBody}
                onChange={e => setMessageBody(e.target.value)}
                placeholder="Hola {{firstName}}, te escribimos desde..."
                rows={6}
                className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-sm text-text placeholder:text-text-muted/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors resize-none"
              />
            </div>

            {messageBody.trim() && (
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">Vista previa</label>
                <div className="bg-surface border border-border rounded-lg p-4 text-sm whitespace-pre-wrap">
                  {previewMessage()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Safety */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold">Seguridad y programacion</h2>

            {/* Anti-ban warning */}
            <div className="bg-accent-yellow/10 border border-accent-yellow/30 rounded-lg p-4 text-sm space-y-2">
              <p className="font-semibold text-accent-yellow">Consejos anti-ban</p>
              <ul className="text-text-muted space-y-1 list-disc list-inside">
                <li>Usa un delay de al menos 3 segundos entre mensajes</li>
                <li>No envies mas de 100-150 mensajes por dia</li>
                <li>Solo envia en horario comercial (8:00-20:00)</li>
                <li>Usa un numero que tenga historial de conversaciones</li>
                <li>Personaliza los mensajes con el nombre del contacto</li>
              </ul>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-muted mb-1">
                Delay entre mensajes: {delaySeconds} segundos
              </label>
              <input
                type="range"
                min={2}
                max={10}
                step={1}
                value={delaySeconds}
                onChange={e => setDelaySeconds(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-text-muted mt-1">
                <span>2s (rapido, mas riesgo)</span>
                <span>10s (lento, mas seguro)</span>
              </div>
            </div>

            <div>
              <Input
                label="Limite diario de mensajes"
                type="number"
                min={1}
                max={200}
                value={dailyLimit}
                onChange={e => setDailyLimit(Math.min(200, Math.max(1, Number(e.target.value))))}
              />
              {dailyLimit > 150 && (
                <p className="text-red-400 text-xs mt-1">Alto riesgo de ban con mas de 150 mensajes/dia</p>
              )}
              {dailyLimit <= 100 && (
                <p className="text-accent-green text-xs mt-1">Rango seguro</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Hora de inicio"
                type="number"
                min={0}
                max={23}
                value={windowStart}
                onChange={e => setWindowStart(Number(e.target.value))}
              />
              <Input
                label="Hora de fin"
                type="number"
                min={1}
                max={24}
                value={windowEnd}
                onChange={e => setWindowEnd(Number(e.target.value))}
              />
            </div>
            <p className="text-xs text-text-muted -mt-3">
              Mensajes solo se enviaran entre {windowStart}:00 y {windowEnd}:00 (hora del servidor)
            </p>

            <div className="space-y-3">
              <label className="block text-sm font-medium text-text-muted">Programacion</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    checked={scheduleNow}
                    onChange={() => setScheduleNow(true)}
                    className="accent-primary"
                  />
                  Lanzar al crear
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    checked={!scheduleNow}
                    onChange={() => setScheduleNow(false)}
                    className="accent-primary"
                  />
                  Programar para despues
                </label>
              </div>
              {!scheduleNow && (
                <Input
                  type="datetime-local"
                  value={scheduledDate}
                  onChange={e => setScheduledDate(e.target.value)}
                />
              )}
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold">Revision y confirmacion</h2>

            <div className="bg-surface border border-border rounded-lg divide-y divide-border">
              <ReviewRow label="Nombre" value={name} />
              <ReviewRow
                label="Instancia"
                value={instances.find(i => i.id === selectedInstanceId)?.instanceName || '-'}
              />
              <ReviewRow label="Lista" value={selectedList?.name || 'Sin lista'} />
              <ReviewRow label="Contactos" value={String(contactCount)} />
              <ReviewRow label="Delay" value={`${delaySeconds} segundos`} />
              <ReviewRow label="Limite diario" value={`${dailyLimit} mensajes`} />
              <ReviewRow label="Horario" value={`${windowStart}:00 - ${windowEnd}:00`} />
              <ReviewRow
                label="Programacion"
                value={scheduleNow ? 'Lanzar inmediatamente (como borrador)' : `Programada: ${scheduledDate}`}
              />
              <ReviewRow
                label="Tiempo estimado"
                value={`~${Math.ceil((contactCount * delaySeconds) / 60)} minutos`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-muted mb-1">Mensaje</label>
              <div className="bg-surface border border-border rounded-lg p-4 text-sm whitespace-pre-wrap">
                {messageBody}
              </div>
            </div>

            {/* Final warning */}
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-sm">
              <p className="font-semibold text-red-400 mb-1">Antes de confirmar</p>
              <ul className="text-text-muted space-y-1 list-disc list-inside">
                <li>Verifica que tu instancia de WhatsApp esta conectada</li>
                <li>Revisa que el mensaje no contenga errores</li>
                <li>La campana se creara como borrador. Debes lanzarla desde la lista de campanas</li>
              </ul>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8 pt-4 border-t border-border">
          <Button
            variant="secondary"
            onClick={step === 1 ? onCancel : () => setStep(step - 1)}
          >
            {step === 1 ? 'Cancelar' : 'Anterior'}
          </Button>

          {step < 4 ? (
            <Button
              disabled={!canProceed()}
              onClick={() => setStep(step + 1)}
            >
              Siguiente
            </Button>
          ) : (
            <Button
              loading={loading}
              onClick={handleCreate}
            >
              Crear Campana
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between px-4 py-3 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

// ─── Campaign Detail View ────────────────────────────────────────────────────

function CampaignDetailView({
  campaign,
  instances,
  onBack,
}: {
  campaign: Campaign
  instances: Instance[]
  onBack: () => void
}) {
  const [stats, setStats] = useState<CampaignStats | null>(null)
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [launchOpen, setLaunchOpen] = useState(false)
  const [currentStatus, setCurrentStatus] = useState(campaign.status)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, recipientsRes] = await Promise.all([
        hubClientFetch(`/campaigns/${campaign.id}/stats`),
        hubClientFetch(`/campaigns/${campaign.id}/recipients`),
      ])
      setStats(statsRes.data)
      setRecipients(recipientsRes.data || [])
      if (statsRes.data?.status) {
        setCurrentStatus(statsRes.data.status)
      }
    } catch {
      // keep current
    } finally {
      setLoading(false)
    }
  }, [campaign.id])

  useEffect(() => {
    fetchData()
    // Auto-refresh while sending
    intervalRef.current = setInterval(() => {
      fetchData()
    }, 5000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchData])

  // Stop polling when not sending
  useEffect(() => {
    if (currentStatus !== 'SENDING' && intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [currentStatus])

  const handlePause = async () => {
    setActionLoading(true)
    try {
      await hubClientFetch(`/campaigns/${campaign.id}/pause`, { method: 'POST' })
      setCurrentStatus('PAUSED')
      await fetchData()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setActionLoading(false)
    }
  }

  const badge = STATUS_BADGE[currentStatus] || STATUS_BADGE.DRAFT
  const progress = stats ? (stats.total > 0 ? Math.round(((stats.sent + stats.failed) / stats.total) * 100) : 0) : 0

  const recipientStatusVariant = (s: string) => {
    switch (s) {
      case 'SENT': return 'success'
      case 'FAILED': return 'danger'
      case 'PENDING': return 'default'
      default: return 'default' as const
    }
  }

  return (
    <div className="space-y-6">
      {/* Status + actions */}
      <div className="bg-surface-light border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Badge variant={badge.variant}>{badge.label}</Badge>
            {currentStatus === 'SENDING' && (
              <span className="text-xs text-accent-yellow animate-pulse">Enviando...</span>
            )}
          </div>
          <div className="flex gap-2">
            {currentStatus === 'SENDING' && (
              <Button size="sm" variant="danger" loading={actionLoading} onClick={handlePause}>
                Pausar
              </Button>
            )}
            {(currentStatus === 'DRAFT' || currentStatus === 'PAUSED') && (
              <Button size="sm" onClick={() => setLaunchOpen(true)}>
                {currentStatus === 'PAUSED' ? 'Reanudar' : 'Lanzar'}
              </Button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {stats && stats.total > 0 && (
          <div>
            <div className="flex justify-between text-xs text-text-muted mb-1">
              <span>{stats.sent + stats.failed} / {stats.total}</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-2 bg-surface-lighter rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Enviados" value={stats.sent} color="text-accent-green" />
          <StatCard label="Fallidos" value={stats.failed} color="text-red-400" />
          <StatCard label="Pendientes" value={stats.pending} color="text-text-muted" />
          <StatCard label="Entregados" value={stats.delivered} color="text-accent-blue" />
          <StatCard label="Leidos" value={stats.read} color="text-accent-blue" />
          <StatCard label="Respondidos" value={stats.replied} color="text-accent-green" />
        </div>
      )}

      {/* Message preview */}
      {campaign.steps?.length > 0 && (
        <div className="bg-surface-light border border-border rounded-xl p-6">
          <h3 className="text-sm font-semibold text-text-muted mb-2">Mensaje</h3>
          <div className="text-sm whitespace-pre-wrap">{campaign.steps[0].body}</div>
        </div>
      )}

      {/* Recipients list */}
      <div className="bg-surface-light border border-border rounded-xl p-6">
        <h3 className="text-sm font-semibold text-text-muted mb-4">
          Destinatarios ({recipients.length})
        </h3>
        {loading ? (
          <p className="text-text-muted text-sm">Cargando...</p>
        ) : recipients.length === 0 ? (
          <p className="text-text-muted text-sm">Sin destinatarios aun</p>
        ) : (
          <div className="max-h-96 overflow-y-auto space-y-1">
            {recipients.map(r => (
              <div
                key={r.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-lighter text-sm"
              >
                <div className="flex items-center gap-3">
                  <span>
                    {r.contact.firstName || ''} {r.contact.lastName || ''}
                  </span>
                  <span className="text-text-muted text-xs">{r.contact.phone}</span>
                </div>
                <Badge variant={recipientStatusVariant(r.status) as any}>{r.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {launchOpen && (
        <LaunchModal
          campaign={campaign}
          instances={instances}
          onClose={() => { setLaunchOpen(false); fetchData() }}
        />
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-surface-light border border-border rounded-xl p-4">
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`text-2xl font-bold ${color || 'text-text'}`}>{value}</p>
    </div>
  )
}
