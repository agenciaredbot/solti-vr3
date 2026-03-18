import { hubFetch } from '@/lib/hub'
import { Badge } from '@/components/ui/badge'
import { TagManager } from './tag-manager'

const STATUS_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'primary' | 'danger' | 'default'> = {
  NEW: 'info',
  CONTACTED: 'warning',
  REPLIED: 'success',
  QUALIFIED: 'primary',
  CUSTOMER: 'success',
  LOST: 'danger',
}

async function getContact(id: string) {
  try {
    return await hubFetch(`/contacts/${id}`)
  } catch {
    return null
  }
}

async function getActivities(id: string) {
  try {
    return await hubFetch(`/contacts/${id}/activities`)
  } catch {
    return { data: [] }
  }
}

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  async function getTags() {
    try { return await hubFetch('/tags') } catch { return { data: [] } }
  }
  const [contactRes, activitiesRes, tagsRes] = await Promise.all([getContact(id), getActivities(id), getTags()])
  const contact = contactRes?.data || contactRes

  if (!contact) {
    return <p className="text-text-muted">Contacto no encontrado</p>
  }

  const activities = activitiesRes.data || []
  const custom = typeof contact.customFields === 'string'
    ? JSON.parse(contact.customFields || '{}')
    : (contact.customFields || {})

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">{contact.firstName} {contact.lastName}</h1>
          <p className="text-text-muted mt-1">{contact.email || 'Sin email'}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={STATUS_VARIANT[contact.status] || 'default'}>{contact.status}</Badge>
          <div className={`text-2xl font-bold font-mono ${contact.score >= 80 ? 'text-accent-green' : contact.score >= 60 ? 'text-accent-yellow' : 'text-text-muted'}`}>
            {contact.score ?? 0}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contact Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-surface-light border border-border rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Información</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Field label="Teléfono" value={contact.phone} />
              <Field label="WhatsApp" value={contact.whatsapp} />
              <Field label="Ciudad" value={contact.city} />
              <Field label="País" value={contact.country} />
              <Field label="Website" value={contact.website} link />
              <Field label="Fuente" value={contact.source} />
            </div>
          </div>

          {/* Custom Fields */}
          {Object.keys(custom).length > 0 && (
            <div className="bg-surface-light border border-border rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Campos Personalizados</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {Object.entries(custom).map(([key, value]) => (
                  <Field key={key} label={key} value={String(value)} />
                ))}
              </div>
            </div>
          )}

          {/* Activities */}
          <div className="bg-surface-light border border-border rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Actividades</h2>
            {activities.length > 0 ? (
              <div className="space-y-4">
                {activities.map((a: any) => (
                  <div key={a.id} className="flex gap-3 pb-4 border-b border-border/50 last:border-0">
                    <div className="w-8 h-8 bg-surface-lighter rounded-full flex items-center justify-center text-xs shrink-0">
                      {a.type === 'email_sent' ? '📧' : a.type === 'dm_sent' ? '💬' : a.type === 'call' ? '📞' : '📝'}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{a.title}</p>
                      {a.description && <p className="text-xs text-text-muted mt-0.5">{a.description}</p>}
                      <p className="text-xs text-text-muted mt-1">{new Date(a.createdAt).toLocaleString('es-CO')}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-text-muted text-sm">Sin actividades registradas</p>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          <div className="bg-surface-light border border-border rounded-xl p-6">
            <h2 className="text-sm font-semibold text-text-muted uppercase mb-3">Fechas</h2>
            <div className="space-y-2 text-sm">
              <Field label="Creado" value={new Date(contact.createdAt).toLocaleDateString('es-CO')} />
              <Field label="Actualizado" value={new Date(contact.updatedAt).toLocaleDateString('es-CO')} />
            </div>
          </div>

          <div className="bg-surface-light border border-border rounded-xl p-6">
            <h2 className="text-sm font-semibold text-text-muted uppercase mb-3">Tags</h2>
            <TagManager
              contactId={id}
              currentTags={(contact.contactTags || contact.tags || []).map((t: any) => ({
                id: t.tag?.id || t.id,
                name: t.tag?.name || t.name,
                color: t.tag?.color || '#6366f1',
              }))}
              allTags={(tagsRes.data || []).map((t: any) => ({ id: t.id, name: t.name, color: t.color }))}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, link }: { label: string; value?: string | null; link?: boolean }) {
  return (
    <div>
      <p className="text-text-muted text-xs">{label}</p>
      {link && value ? (
        <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener" className="text-primary hover:underline">
          {value}
        </a>
      ) : (
        <p className="font-medium">{value || '—'}</p>
      )}
    </div>
  )
}
