'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { createSmartList } from '../contacts/server-actions'

const STATUS_OPTIONS = [
  { value: 'NEW', label: 'Nuevo' },
  { value: 'CONTACTED', label: 'Contactado' },
  { value: 'REPLIED', label: 'Respondio' },
  { value: 'QUALIFIED', label: 'Calificado' },
  { value: 'CUSTOMER', label: 'Cliente' },
  { value: 'LOST', label: 'Descartado' },
]

interface Tag { id: string; name: string; color: string }

interface Props {
  open: boolean
  onClose: () => void
  tags: Tag[]
  onSuccess: () => void
}

export function SmartListModal({ open, onClose, tags, onSuccess }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  // Filters
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [statuses, setStatuses] = useState<Set<string>>(new Set())
  const [minScore, setMinScore] = useState('')
  const [maxScore, setMaxScore] = useState('')
  const [source, setSource] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [industry, setIndustry] = useState('')
  const [company, setCompany] = useState('')
  const [search, setSearch] = useState('')
  const [hasEmail, setHasEmail] = useState(false)
  const [hasPhone, setHasPhone] = useState(false)
  const [hasWhatsapp, setHasWhatsapp] = useState(false)
  const [hasInstagram, setHasInstagram] = useState(false)
  const [hasLinkedin, setHasLinkedin] = useState(false)
  const [hasWebsite, setHasWebsite] = useState(false)

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ name: string; populated: number } | null>(null)

  function toggleTag(tagId: string) {
    const next = new Set(selectedTags)
    if (next.has(tagId)) next.delete(tagId)
    else next.add(tagId)
    setSelectedTags(next)
  }

  function toggleStatus(status: string) {
    const next = new Set(statuses)
    if (next.has(status)) next.delete(status)
    else next.add(status)
    setStatuses(next)
  }

  function buildFilters() {
    const filters: Record<string, any> = {}
    if (selectedTags.size > 0) filters.tagIds = Array.from(selectedTags)
    if (statuses.size > 0) filters.statuses = Array.from(statuses)
    if (minScore) filters.minScore = Number(minScore)
    if (maxScore) filters.maxScore = Number(maxScore)
    if (source) filters.source = source
    if (city) filters.city = city
    if (country) filters.country = country
    if (industry) filters.industry = industry
    if (company) filters.company = company
    if (search) filters.search = search
    if (hasEmail) filters.hasEmail = true
    if (hasPhone) filters.hasPhone = true
    if (hasWhatsapp) filters.hasWhatsapp = true
    if (hasInstagram) filters.hasInstagram = true
    if (hasLinkedin) filters.hasLinkedin = true
    if (hasWebsite) filters.hasWebsite = true
    return filters
  }

  const filterCount = selectedTags.size + statuses.size
    + (minScore ? 1 : 0) + (maxScore ? 1 : 0) + (source ? 1 : 0)
    + (city ? 1 : 0) + (country ? 1 : 0) + (industry ? 1 : 0) + (company ? 1 : 0) + (search ? 1 : 0)
    + (hasEmail ? 1 : 0) + (hasPhone ? 1 : 0) + (hasWhatsapp ? 1 : 0)
    + (hasInstagram ? 1 : 0) + (hasLinkedin ? 1 : 0) + (hasWebsite ? 1 : 0)

  async function handleCreate() {
    if (!name.trim() || filterCount === 0) return
    setLoading(true)
    const filters = buildFilters()
    const res = await createSmartList(name.trim(), description.trim() || undefined, filters)
    setLoading(false)
    if (res.error) return
    setResult({ name: res.data!.name, populated: res.data!.populated })
  }

  function handleClose() {
    setName('')
    setDescription('')
    setSelectedTags(new Set())
    setStatuses(new Set())
    setMinScore('')
    setMaxScore('')
    setSource('')
    setCity('')
    setCountry('')
    setIndustry('')
    setCompany('')
    setSearch('')
    setHasEmail(false)
    setHasPhone(false)
    setHasWhatsapp(false)
    setHasInstagram(false)
    setHasLinkedin(false)
    setHasWebsite(false)
    setResult(null)
    setStep(1)
    onClose()
    if (result) onSuccess()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Crear Lista Inteligente" maxWidth="max-w-2xl">
      {result ? (
        <div className="text-center py-6">
          <p className="text-4xl mb-3">🧠</p>
          <p className="text-lg font-semibold">Lista "{result.name}" creada</p>
          <p className="text-text-muted mt-1">{result.populated} contactos agregados automaticamente</p>
          <p className="text-xs text-text-muted/60 mt-2">Usa esta lista para enviar campanas de email o WhatsApp</p>
          <Button onClick={handleClose} className="mt-4">Cerrar</Button>
        </div>
      ) : step === 1 ? (
        <div className="space-y-5">
          {/* Tags Section — Main feature */}
          {tags.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Selecciona Tags</p>
              <p className="text-xs text-text-muted mb-3">Los contactos deben tener TODOS los tags seleccionados</p>
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => {
                  const selected = selectedTags.has(tag.id)
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                        selected
                          ? 'ring-2 ring-offset-1 ring-offset-surface-light'
                          : 'opacity-60 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor: tag.color + (selected ? '30' : '15'),
                        color: tag.color,
                        borderColor: selected ? tag.color : 'transparent',
                        ...(selected ? { ringColor: tag.color } : {}),
                      }}
                    >
                      {selected && '✓ '}{tag.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Status Multi-Select */}
          <div>
            <p className="text-sm font-medium mb-2">Estado del contacto</p>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map(s => {
                const selected = statuses.has(s.value)
                return (
                  <button
                    key={s.value}
                    onClick={() => toggleStatus(s.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      selected
                        ? 'bg-primary/20 text-primary border-primary/30'
                        : 'bg-surface-light text-text-muted border-border hover:border-border/80'
                    }`}
                  >
                    {selected && '✓ '}{s.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Channel Requirements */}
          <div>
            <p className="text-sm font-medium mb-2">Canal de contacto requerido</p>
            <div className="flex flex-wrap gap-3">
              {[
                { key: 'hasEmail', label: '📧 Email', value: hasEmail, set: setHasEmail },
                { key: 'hasPhone', label: '📞 Telefono', value: hasPhone, set: setHasPhone },
                { key: 'hasWhatsapp', label: '💬 WhatsApp', value: hasWhatsapp, set: setHasWhatsapp },
                { key: 'hasInstagram', label: '📸 Instagram', value: hasInstagram, set: setHasInstagram },
                { key: 'hasLinkedin', label: '💼 LinkedIn', value: hasLinkedin, set: setHasLinkedin },
                { key: 'hasWebsite', label: '🌐 Website', value: hasWebsite, set: setHasWebsite },
              ].map(ch => (
                <label key={ch.key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="checkbox" checked={ch.value} onChange={e => ch.set(e.target.checked)} className="rounded" />
                  {ch.label}
                </label>
              ))}
            </div>
          </div>

          {/* Location & Business */}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Ciudad" placeholder="Ej: Armenia" value={city} onChange={e => setCity(e.target.value)} />
            <Input label="Pais" placeholder="Ej: Colombia" value={country} onChange={e => setCountry(e.target.value)} />
            <Input label="Industria" placeholder="Ej: Inmobiliaria" value={industry} onChange={e => setIndustry(e.target.value)} />
            <Input label="Empresa" placeholder="Nombre de empresa" value={company} onChange={e => setCompany(e.target.value)} />
          </div>

          {/* Score */}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Score minimo" type="number" placeholder="0" value={minScore} onChange={e => setMinScore(e.target.value)} />
            <Input label="Score maximo" type="number" placeholder="100" value={maxScore} onChange={e => setMaxScore(e.target.value)} />
          </div>

          {/* Search */}
          <Input label="Busqueda general" placeholder="Nombre, email o empresa..." value={search} onChange={e => setSearch(e.target.value)} />

          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <p className="text-xs text-text-muted">
              {filterCount === 0 ? 'Selecciona al menos un filtro' : `${filterCount} filtro${filterCount > 1 ? 's' : ''} activo${filterCount > 1 ? 's' : ''}`}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
              <Button onClick={() => setStep(2)} disabled={filterCount === 0}>
                Siguiente →
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-surface border border-border/50 rounded-lg p-3">
            <p className="text-xs text-text-muted mb-2">Resumen de filtros:</p>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(selectedTags).map(tagId => {
                const tag = tags.find(t => t.id === tagId)
                return tag ? (
                  <span key={tagId} className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: tag.color + '20', color: tag.color }}>
                    🏷️ {tag.name}
                  </span>
                ) : null
              })}
              {Array.from(statuses).map(s => (
                <span key={s} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/15 text-primary">
                  {STATUS_OPTIONS.find(o => o.value === s)?.label}
                </span>
              ))}
              {city && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-lighter text-text-muted">📍 {city}</span>}
              {country && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-lighter text-text-muted">🌍 {country}</span>}
              {industry && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-lighter text-text-muted">🏢 {industry}</span>}
              {company && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-lighter text-text-muted">🏭 {company}</span>}
              {hasEmail && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-lighter text-text-muted">📧 Email</span>}
              {hasPhone && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-lighter text-text-muted">📞 Tel</span>}
              {hasWhatsapp && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-lighter text-text-muted">💬 WA</span>}
              {hasInstagram && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-lighter text-text-muted">📸 IG</span>}
              {hasLinkedin && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-lighter text-text-muted">💼 LI</span>}
              {hasWebsite && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-lighter text-text-muted">🌐 Web</span>}
              {minScore && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-lighter text-text-muted">Score ≥{minScore}</span>}
              {maxScore && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-lighter text-text-muted">Score ≤{maxScore}</span>}
              {search && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-lighter text-text-muted">🔍 "{search}"</span>}
            </div>
          </div>

          <Input
            label="Nombre de la lista *"
            placeholder="Ej: Inmobiliarias Armenia con WA"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <Input
            label="Descripcion (opcional)"
            placeholder="Descripcion para recordar el proposito de esta lista..."
            value={description}
            onChange={e => setDescription(e.target.value)}
          />

          <p className="text-xs text-text-muted">
            Esta lista se poblara automaticamente con los contactos que cumplan estos criterios.
            Podras usarla para enviar campanas de email o WhatsApp.
          </p>

          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={() => setStep(1)}>← Volver</Button>
            <Button onClick={handleCreate} loading={loading} disabled={!name.trim()}>
              Crear Lista Inteligente
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
