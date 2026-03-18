'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { TagManager } from './[id]/tag-manager'
import { getContact, getContactActivities, updateContact } from './server-actions'

const STATUS_OPTIONS = [
  { value: 'NEW', label: 'Nuevo' },
  { value: 'CONTACTED', label: 'Contactado' },
  { value: 'REPLIED', label: 'Respondio' },
  { value: 'QUALIFIED', label: 'Calificado' },
  { value: 'CUSTOMER', label: 'Cliente' },
  { value: 'LOST', label: 'Descartado' },
]

const ACTIVITY_ICONS: Record<string, string> = {
  email_sent: '📧', dm_sent: '💬', call: '📞', whatsapp_in: '📱', whatsapp_out: '📤', note: '📝',
}

interface Tag { id: string; name: string; color: string }

interface Props {
  contactId: string | null
  allTags: Tag[]
  onClose: () => void
  onUpdate: () => void
}

export function ContactDrawer({ contactId, allTags, onClose, onUpdate }: Props) {
  const [contact, setContact] = useState<any>(null)
  const [activities, setActivities] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'info' | 'social' | 'business' | 'activity'>('info')
  const [editData, setEditData] = useState<Record<string, any>>({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!contactId) return
    setLoading(true)
    setDirty(false)
    setTab('info')
    Promise.all([getContact(contactId), getContactActivities(contactId)]).then(([cRes, aRes]) => {
      const c = cRes.data || cRes
      setContact(c)
      setEditData(c)
      setActivities(aRes.data || [])
      setLoading(false)
    })
  }, [contactId])

  if (!contactId) return null

  function field(key: string, value: any) {
    setEditData(prev => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  async function handleSave() {
    if (!dirty || !contactId) return
    setSaving(true)
    const fields: Record<string, any> = {}
    const editableKeys = [
      'firstName', 'lastName', 'email', 'phone', 'whatsapp', 'instagram',
      'linkedin', 'tiktok', 'twitter', 'facebook', 'youtube', 'website',
      'company', 'jobTitle', 'industry', 'language', 'gender', 'address',
      'zipCode', 'state', 'city', 'country', 'revenue', 'employees',
      'status', 'score', 'notes',
    ]
    for (const k of editableKeys) {
      if (editData[k] !== contact[k]) {
        fields[k] = editData[k] === '' ? null : editData[k]
      }
    }
    if (Object.keys(fields).length > 0) {
      if (fields.score !== undefined) fields.score = Number(fields.score) || 0
      await updateContact(contactId, fields)
      setContact({ ...contact, ...fields })
      setDirty(false)
      onUpdate()
    }
    setSaving(false)
  }

  const scoreColor = (s: number) => s >= 80 ? 'text-accent-green' : s >= 60 ? 'text-accent-yellow' : s >= 30 ? 'text-accent-blue' : 'text-text-muted'

  const currentTags = (contact?.contactTags || []).map((ct: any) => ({
    id: ct.tag?.id || ct.id, name: ct.tag?.name || ct.name, color: ct.tag?.color || '#6366f1',
  }))

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-lg bg-surface border-l border-border h-full overflow-y-auto animate-slide-in"
        onClick={e => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full text-text-muted">Cargando...</div>
        ) : contact ? (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-4 border-b border-border flex items-start justify-between sticky top-0 bg-surface z-10">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold truncate">
                  {contact.firstName} {contact.lastName}
                </h2>
                <p className="text-sm text-text-muted truncate">{contact.email || 'Sin email'}</p>
              </div>
              <div className="flex items-center gap-2 ml-3">
                <span className={`font-mono font-bold text-lg ${scoreColor(contact.score || 0)}`}>
                  {contact.score || 0}
                </span>
                <button onClick={onClose} className="text-text-muted hover:text-text p-1 text-xl">✕</button>
              </div>
            </div>

            {/* Status + Tags quick area */}
            <div className="px-4 py-3 border-b border-border/50 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted w-14">Estado:</span>
                <select
                  value={editData.status || 'NEW'}
                  onChange={e => { field('status', e.target.value); updateContact(contactId, { status: e.target.value }).then(onUpdate) }}
                  className="bg-surface-light border border-border rounded px-2 py-1 text-xs text-text focus:border-primary/50 focus:outline-none"
                >
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <span className="text-xs text-text-muted">Tags:</span>
                <div className="mt-1">
                  <TagManager contactId={contactId} currentTags={currentTags} allTags={allTags} />
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border/50 px-4">
              {(['info', 'social', 'business', 'activity'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                    tab === t ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text'
                  }`}
                >
                  {{ info: 'General', social: 'Social', business: 'Empresa', activity: 'Actividad' }[t]}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 p-4 space-y-3 overflow-y-auto">
              {tab === 'info' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Nombre" value={editData.firstName || ''} onChange={e => field('firstName', e.target.value)} />
                    <Input label="Apellido" value={editData.lastName || ''} onChange={e => field('lastName', e.target.value)} />
                  </div>
                  <Input label="Email" type="email" value={editData.email || ''} onChange={e => field('email', e.target.value)} />
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Telefono" value={editData.phone || ''} onChange={e => field('phone', e.target.value)} />
                    <Input label="WhatsApp" value={editData.whatsapp || ''} onChange={e => field('whatsapp', e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Ciudad" value={editData.city || ''} onChange={e => field('city', e.target.value)} />
                    <Input label="Pais" value={editData.country || ''} onChange={e => field('country', e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Estado/Region" value={editData.state || ''} onChange={e => field('state', e.target.value)} />
                    <Input label="Codigo Postal" value={editData.zipCode || ''} onChange={e => field('zipCode', e.target.value)} />
                  </div>
                  <Input label="Direccion" value={editData.address || ''} onChange={e => field('address', e.target.value)} />
                  <div className="grid grid-cols-2 gap-3">
                    <Select label="Idioma" value={editData.language || ''} onChange={e => field('language', e.target.value)}
                      options={[{ value: '', label: '—' }, { value: 'es', label: 'Espanol' }, { value: 'en', label: 'Ingles' }, { value: 'pt', label: 'Portugues' }, { value: 'fr', label: 'Frances' }]}
                    />
                    <Select label="Genero" value={editData.gender || ''} onChange={e => field('gender', e.target.value)}
                      options={[{ value: '', label: '—' }, { value: 'M', label: 'Masculino' }, { value: 'F', label: 'Femenino' }, { value: 'Other', label: 'Otro' }]}
                    />
                  </div>
                  <Input label="Score (0-100)" type="number" value={editData.score ?? 0} onChange={e => field('score', e.target.value)} />
                  <Textarea label="Notas" value={editData.notes || ''} onChange={e => field('notes', e.target.value)} rows={3} />
                </>
              )}

              {tab === 'social' && (
                <>
                  <Input label="Instagram" placeholder="@usuario o URL" value={editData.instagram || ''} onChange={e => field('instagram', e.target.value)} />
                  <Input label="LinkedIn" placeholder="URL de perfil" value={editData.linkedin || ''} onChange={e => field('linkedin', e.target.value)} />
                  <Input label="TikTok" placeholder="@usuario o URL" value={editData.tiktok || ''} onChange={e => field('tiktok', e.target.value)} />
                  <Input label="Twitter / X" placeholder="@usuario o URL" value={editData.twitter || ''} onChange={e => field('twitter', e.target.value)} />
                  <Input label="Facebook" placeholder="URL de perfil o pagina" value={editData.facebook || ''} onChange={e => field('facebook', e.target.value)} />
                  <Input label="YouTube" placeholder="URL del canal" value={editData.youtube || ''} onChange={e => field('youtube', e.target.value)} />
                  <Input label="Sitio Web" placeholder="https://..." value={editData.website || ''} onChange={e => field('website', e.target.value)} />
                </>
              )}

              {tab === 'business' && (
                <>
                  <Input label="Empresa" value={editData.company || ''} onChange={e => field('company', e.target.value)} />
                  <Input label="Cargo" value={editData.jobTitle || ''} onChange={e => field('jobTitle', e.target.value)} />
                  <Input label="Industria" placeholder="Ej: Inmobiliaria, Tecnologia, Salud" value={editData.industry || ''} onChange={e => field('industry', e.target.value)} />
                  <Select label="Tamano de empresa" value={editData.employees || ''} onChange={e => field('employees', e.target.value)}
                    options={[{ value: '', label: '—' }, { value: '1-10', label: '1-10' }, { value: '11-50', label: '11-50' }, { value: '51-200', label: '51-200' }, { value: '200+', label: '200+' }]}
                  />
                  <Select label="Ingresos estimados" value={editData.revenue || ''} onChange={e => field('revenue', e.target.value)}
                    options={[{ value: '', label: '—' }, { value: '<10k', label: 'Menos de $10k' }, { value: '10k-50k', label: '$10k - $50k' }, { value: '50k-200k', label: '$50k - $200k' }, { value: '200k+', label: 'Mas de $200k' }]}
                  />
                  <p className="text-xs text-text-muted pt-2">Fuente: {contact.source || '—'}</p>
                  {contact.sourceUrl && (
                    <a href={contact.sourceUrl} target="_blank" rel="noopener" className="text-xs text-primary hover:underline">
                      Ver fuente original
                    </a>
                  )}
                </>
              )}

              {tab === 'activity' && (
                <div className="space-y-3">
                  {activities.length > 0 ? activities.map((a: any) => (
                    <div key={a.id} className="flex gap-2 pb-3 border-b border-border/30 last:border-0">
                      <span className="text-sm">{ACTIVITY_ICONS[a.type] || '📝'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{a.title}</p>
                        {a.description && <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{a.description}</p>}
                        <p className="text-[10px] text-text-muted/60 mt-1">{new Date(a.createdAt).toLocaleString('es-CO')}</p>
                      </div>
                    </div>
                  )) : (
                    <p className="text-text-muted text-sm text-center py-6">Sin actividades</p>
                  )}
                </div>
              )}
            </div>

            {/* Save bar */}
            {dirty && tab !== 'activity' && (
              <div className="p-3 border-t border-border bg-surface sticky bottom-0">
                <Button onClick={handleSave} loading={saving} className="w-full">Guardar Cambios</Button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
