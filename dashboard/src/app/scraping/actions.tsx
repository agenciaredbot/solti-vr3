'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { hubClientFetch } from '@/lib/hub'

type Platform = 'google_maps' | 'instagram' | 'linkedin' | 'tiktok' | 'website'
type Phase = 'form' | 'running' | 'results' | 'imported'
type ImportMode = 'skip' | 'merge' | 'create_all'

interface NormalizedResult {
  id: string
  processed: boolean
  importedContactId: string | null
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  city?: string | null
  website?: string | null
  instagram?: string | null
  linkedin?: string | null
  source?: string
  sourceUrl?: string | null
  score?: number
  duplicate?: {
    contactId: string
    matchType: string
    confidence: string
    existingContact: { id: string; firstName: string | null; lastName: string | null; email: string | null }
  } | null
}

const PLATFORM_OPTIONS = [
  { value: 'google_maps', label: 'Google Maps' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'website', label: 'Sitio Web' },
]

const PLATFORM_ICONS: Record<Platform, string> = {
  google_maps: '📍',
  instagram: '📸',
  linkedin: '💼',
  tiktok: '🎵',
  website: '🌐',
}

const PLATFORM_HELP: Record<Platform, string> = {
  google_maps: 'Busca negocios en Google Maps por tipo y ubicacion',
  instagram: 'Busca perfiles o hashtags en Instagram',
  linkedin: 'Busca profesionales usando una URL de busqueda de LinkedIn',
  tiktok: 'Busca creadores de contenido y perfiles en TikTok',
  website: 'Extrae informacion de contacto de sitios web',
}

export function ScrapingActions() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('form')

  // Form state
  const [platform, setPlatform] = useState<Platform>('google_maps')
  const [formData, setFormData] = useState<Record<string, any>>({
    searchQuery: '',
    location: 'Colombia',
    maxResults: 100,
  })
  const [costEstimate, setCostEstimate] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Job state
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<any>(null)
  const [startTime, setStartTime] = useState<number>(0)
  const [elapsed, setElapsed] = useState(0)

  // Results state
  const [results, setResults] = useState<NormalizedResult[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importMode, setImportMode] = useState<ImportMode>('skip')
  const [duplicateCount, setDuplicateCount] = useState(0)

  // Import state
  const [importSummary, setImportSummary] = useState<any>(null)

  // Enrichment state
  const [enrichOpen, setEnrichOpen] = useState(false)
  const [enrichContacts, setEnrichContacts] = useState<any[]>([])
  const [enrichSelected, setEnrichSelected] = useState<Set<string>>(new Set())
  const [enrichJobId, setEnrichJobId] = useState<string | null>(null)
  const [enrichPhase, setEnrichPhase] = useState<'select' | 'running' | 'done'>('select')
  const [enrichResult, setEnrichResult] = useState<any>(null)
  const [enrichLoading, setEnrichLoading] = useState(false)

  // ═══ Platform change resets form ═══
  function handlePlatformChange(val: string) {
    const p = val as Platform
    setPlatform(p)
    setError('')
    setCostEstimate(null)
    switch (p) {
      case 'google_maps':
        setFormData({ searchQuery: '', location: 'Colombia', maxResults: 100 })
        break
      case 'instagram':
        setFormData({ query: '', searchType: 'user', max: 50 })
        break
      case 'linkedin':
        setFormData({ searchUrl: '', maxResults: 100 })
        break
      case 'tiktok':
        setFormData({ query: '', maxResults: 50 })
        break
      case 'website':
        setFormData({ startUrls: '', maxResults: 100 })
        break
    }
  }

  // ═══ Cost estimate ═══
  const fetchCostEstimate = useCallback(async () => {
    try {
      const res = await hubClientFetch('/scraping/cost-estimate', {
        method: 'POST',
        body: JSON.stringify({
          platform,
          maxResults: formData.maxResults || formData.max || 100,
        }),
      })
      setCostEstimate(res.data)
    } catch {
      setCostEstimate(null)
    }
  }, [platform, formData.maxResults, formData.max])

  useEffect(() => {
    const timer = setTimeout(fetchCostEstimate, 500)
    return () => clearTimeout(timer)
  }, [fetchCostEstimate])

  // ═══ Launch scraping ═══
  async function handleStart() {
    setLoading(true)
    setError('')
    try {
      let body: any = { platform }

      if (platform === 'google_maps') {
        if (!formData.searchQuery?.trim()) { setError('La busqueda es requerida'); setLoading(false); return }
        body = { ...body, searchQuery: formData.searchQuery, location: formData.location, maxResults: Number(formData.maxResults) }
      } else if (platform === 'instagram') {
        if (!formData.query?.trim()) { setError('El termino de busqueda es requerido'); setLoading(false); return }
        body = { ...body, query: formData.query, searchType: formData.searchType, max: Number(formData.max) }
      } else if (platform === 'linkedin') {
        if (!formData.searchUrl?.trim()) { setError('La URL de LinkedIn es requerida'); setLoading(false); return }
        body = { ...body, searchUrl: formData.searchUrl, maxResults: Number(formData.maxResults) }
      } else if (platform === 'tiktok') {
        if (!formData.query?.trim()) { setError('El termino de busqueda es requerido'); setLoading(false); return }
        body = { ...body, query: formData.query, maxResults: Number(formData.maxResults) }
      } else if (platform === 'website') {
        const urls = formData.startUrls?.split('\n').map((u: string) => u.trim()).filter(Boolean)
        if (!urls?.length) { setError('Al menos una URL es requerida'); setLoading(false); return }
        body = { ...body, startUrls: urls, maxResults: Number(formData.maxResults) }
      }

      const res = await hubClientFetch('/scraping/start', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      setJobId(res.data.jobId)
      setStartTime(Date.now())
      setPhase('running')
    } catch (err: any) {
      setError(err.message || 'Error al iniciar busqueda')
    } finally {
      setLoading(false)
    }
  }

  // ═══ Job polling ═══
  useEffect(() => {
    if (phase !== 'running' || !jobId) return

    const pollInterval = setInterval(async () => {
      try {
        const res = await hubClientFetch(`/scraping/jobs/${jobId}/status`)
        setJobStatus(res.data)
        setElapsed(Math.round((Date.now() - startTime) / 1000))

        if (res.data.status === 'COMPLETED') {
          clearInterval(pollInterval)
          // Fetch results
          const resultsRes = await hubClientFetch(`/scraping/jobs/${jobId}/results`)
          setResults(resultsRes.data || [])
          setDuplicateCount(resultsRes.duplicateCount || 0)
          // Select all non-duplicate by default
          const nonDupeIds = new Set<string>(
            (resultsRes.data || [])
              .filter((r: NormalizedResult) => !r.processed && !r.duplicate)
              .map((r: NormalizedResult) => r.id)
          )
          setSelected(nonDupeIds)
          setPhase('results')
        } else if (res.data.status === 'FAILED') {
          clearInterval(pollInterval)
        }
      } catch {
        // Keep polling on error
      }
    }, 5000)

    return () => clearInterval(pollInterval)
  }, [phase, jobId, startTime])

  // ═══ Elapsed timer ═══
  useEffect(() => {
    if (phase !== 'running') return
    const timer = setInterval(() => {
      setElapsed(Math.round((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [phase, startTime])

  // ═══ Import contacts ═══
  async function handleImport() {
    if (selected.size === 0) return
    setLoading(true)
    setError('')
    try {
      const res = await hubClientFetch(`/scraping/jobs/${jobId}/import`, {
        method: 'POST',
        body: JSON.stringify({
          resultIds: Array.from(selected),
          mode: importMode,
        }),
      })
      setImportSummary(res.data)
      setPhase('imported')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Error al importar contactos')
    } finally {
      setLoading(false)
    }
  }

  // ═══ Select/deselect ═══
  function toggleResult(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function toggleAll() {
    if (selected.size === results.filter(r => !r.processed).length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(results.filter(r => !r.processed).map(r => r.id)))
    }
  }

  // ═══ Reset ═══
  function handleReset() {
    setPhase('form')
    setJobId(null)
    setJobStatus(null)
    setResults([])
    setSelected(new Set())
    setImportSummary(null)
    setError('')
    setElapsed(0)
  }

  // ═══ Enrichment handlers ═══
  async function openEnrichModal() {
    setEnrichOpen(true)
    setEnrichPhase('select')
    setEnrichResult(null)
    setEnrichLoading(true)
    try {
      const res = await hubClientFetch('/contacts?limit=50&sortBy=createdAt&sortDir=desc')
      const contacts = (res.data || []).filter((c: any) => c.website && (!c.email || !c.phone))
      setEnrichContacts(contacts)
    } catch {
      setEnrichContacts([])
    }
    setEnrichLoading(false)
  }

  async function startEnrichment() {
    if (enrichSelected.size === 0) return
    setEnrichLoading(true)
    try {
      const res = await hubClientFetch('/scraping/enrich', {
        method: 'POST',
        body: JSON.stringify({ contactIds: Array.from(enrichSelected) }),
      })
      setEnrichJobId(res.data.jobId)
      setEnrichPhase('running')
    } catch (err: any) {
      setError(err.message || 'Error al iniciar enriquecimiento')
    }
    setEnrichLoading(false)
  }

  // Enrichment polling
  useEffect(() => {
    if (enrichPhase !== 'running' || !enrichJobId) return
    const interval = setInterval(async () => {
      try {
        const res = await hubClientFetch(`/scraping/enrich/${enrichJobId}/results`)
        if (res.data?.status === 'COMPLETED') {
          clearInterval(interval)
          setEnrichResult(res.data)
          setEnrichPhase('done')
          router.refresh()
        } else if (res.data?.status === 'FAILED') {
          clearInterval(interval)
          setEnrichPhase('done')
        }
      } catch {}
    }, 5000)
    return () => clearInterval(interval)
  }, [enrichPhase, enrichJobId, router])

  // ═══ Render ═══
  return (
    <div className="space-y-6">
      {/* ═══ PHASE 1: Form ═══ */}
      {phase === 'form' && (
        <div className="bg-surface-light border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Nueva Busqueda</h2>

          <div className="space-y-4">
            <Select
              label="Plataforma"
              value={platform}
              onChange={e => handlePlatformChange(e.target.value)}
              options={PLATFORM_OPTIONS}
            />

            <p className="text-xs text-text-muted flex items-center gap-1">
              {PLATFORM_ICONS[platform]} {PLATFORM_HELP[platform]}
            </p>

            {/* Dynamic fields per platform */}
            {platform === 'google_maps' && (
              <>
                <Input
                  label="Busqueda"
                  placeholder="Ej: Restaurantes en Bogota, Abogados en Medellin"
                  value={formData.searchQuery}
                  onChange={e => setFormData({ ...formData, searchQuery: e.target.value })}
                />
                <Input
                  label="Ubicacion"
                  placeholder="Colombia"
                  value={formData.location}
                  onChange={e => setFormData({ ...formData, location: e.target.value })}
                />
                <Input
                  label="Max resultados"
                  type="number"
                  value={formData.maxResults}
                  onChange={e => setFormData({ ...formData, maxResults: e.target.value })}
                />
              </>
            )}

            {platform === 'instagram' && (
              <>
                <Input
                  label="Busqueda"
                  placeholder="Ej: @usuario o #hashtag"
                  value={formData.query}
                  onChange={e => setFormData({ ...formData, query: e.target.value })}
                />
                <Select
                  label="Tipo de busqueda"
                  value={formData.searchType}
                  onChange={e => setFormData({ ...formData, searchType: e.target.value })}
                  options={[
                    { value: 'user', label: 'Usuarios' },
                    { value: 'hashtag', label: 'Hashtags' },
                  ]}
                />
                <Input
                  label="Max resultados"
                  type="number"
                  value={formData.max}
                  onChange={e => setFormData({ ...formData, max: e.target.value })}
                />
              </>
            )}

            {platform === 'linkedin' && (
              <>
                <Input
                  label="URL de busqueda de LinkedIn"
                  placeholder="https://www.linkedin.com/search/results/people/?keywords=..."
                  value={formData.searchUrl}
                  onChange={e => setFormData({ ...formData, searchUrl: e.target.value })}
                />
                <Input
                  label="Max resultados"
                  type="number"
                  value={formData.maxResults}
                  onChange={e => setFormData({ ...formData, maxResults: e.target.value })}
                />
              </>
            )}

            {platform === 'tiktok' && (
              <>
                <Input
                  label="Busqueda"
                  placeholder="Ej: marketing digital, fitness, cocina"
                  value={formData.query}
                  onChange={e => setFormData({ ...formData, query: e.target.value })}
                />
                <Input
                  label="Max resultados"
                  type="number"
                  value={formData.maxResults}
                  onChange={e => setFormData({ ...formData, maxResults: e.target.value })}
                />
              </>
            )}

            {platform === 'website' && (
              <>
                <Textarea
                  label="URLs (una por linea)"
                  placeholder="https://ejemplo.com&#10;https://otro-sitio.com"
                  value={formData.startUrls}
                  onChange={e => setFormData({ ...formData, startUrls: e.target.value })}
                  rows={4}
                />
                <Input
                  label="Max paginas por sitio"
                  type="number"
                  value={formData.maxResults}
                  onChange={e => setFormData({ ...formData, maxResults: e.target.value })}
                />
              </>
            )}

            {/* Cost estimate */}
            {costEstimate && (
              <div className="bg-surface border border-border/50 rounded-lg p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-muted">Costo estimado</span>
                  <span className="font-medium">{costEstimate.estimatedCredits} creditos (~${costEstimate.estimatedCostUsd} USD)</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-text-muted">Balance actual</span>
                  <span className={`font-medium ${costEstimate.hasBalance ? 'text-accent-green' : 'text-red-400'}`}>
                    {costEstimate.currentBalance} creditos
                  </span>
                </div>
                {!costEstimate.hasBalance && (
                  <p className="text-red-400 text-xs mt-2">Creditos insuficientes. Compra mas en Facturacion.</p>
                )}
              </div>
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button
                onClick={handleStart}
                loading={loading}
                disabled={costEstimate !== null && !costEstimate.hasBalance}
              >
                Iniciar Busqueda
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PHASE 2: Running ═══ */}
      {phase === 'running' && (
        <div className="bg-surface-light border border-border rounded-xl p-6 text-center">
          <div className="text-5xl mb-4 animate-pulse">{PLATFORM_ICONS[platform]}</div>
          <h2 className="text-lg font-semibold mb-2">Buscando en {PLATFORM_OPTIONS.find(p => p.value === platform)?.label}...</h2>

          <div className="flex items-center justify-center gap-3 mb-4">
            <Badge variant={jobStatus?.status === 'FAILED' ? 'danger' : 'info'}>
              {jobStatus?.status === 'FAILED' ? 'Fallido' : 'Ejecutando'}
            </Badge>
            <span className="text-sm text-text-muted font-mono">{elapsed}s</span>
          </div>

          {/* Progress bar */}
          <div className="w-full max-w-md mx-auto bg-surface rounded-full h-2 mb-4">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-500"
              style={{ width: `${jobStatus?.progress || 5}%` }}
            />
          </div>

          {jobStatus?.status === 'FAILED' && (
            <div className="mt-4">
              <p className="text-red-400 text-sm mb-3">{jobStatus.error || 'La busqueda fallo'}</p>
              <Button variant="secondary" onClick={handleReset}>Intentar de nuevo</Button>
            </div>
          )}
        </div>
      )}

      {/* ═══ PHASE 3: Results ═══ */}
      {phase === 'results' && (
        <div className="bg-surface-light border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              Resultados ({results.length})
            </h2>
            <div className="flex items-center gap-2">
              {duplicateCount > 0 && (
                <Badge variant="warning">{duplicateCount} posibles duplicados</Badge>
              )}
            </div>
          </div>

          {results.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">🔍</p>
              <p className="text-text-muted">No se encontraron resultados</p>
              <Button variant="secondary" onClick={handleReset} className="mt-4">Nueva busqueda</Button>
            </div>
          ) : (
            <>
              {/* Results table */}
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface-light">
                    <tr className="border-b border-border/50 text-text-muted text-left">
                      <th className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.size === results.filter(r => !r.processed).length && selected.size > 0}
                          onChange={toggleAll}
                          className="rounded"
                        />
                      </th>
                      <th className="px-3 py-2 font-medium">Nombre</th>
                      <th className="px-3 py-2 font-medium">Email</th>
                      <th className="px-3 py-2 font-medium">Telefono</th>
                      <th className="px-3 py-2 font-medium">Ciudad</th>
                      <th className="px-3 py-2 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map(r => (
                      <tr
                        key={r.id}
                        className={`border-b border-border/50 last:border-0 ${r.duplicate ? 'bg-accent-yellow/5' : ''} ${r.processed ? 'opacity-50' : ''}`}
                      >
                        <td className="px-3 py-2">
                          {!r.processed && (
                            <input
                              type="checkbox"
                              checked={selected.has(r.id)}
                              onChange={() => toggleResult(r.id)}
                              className="rounded"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2 font-medium">
                          {[r.firstName, r.lastName].filter(Boolean).join(' ') || '-'}
                        </td>
                        <td className="px-3 py-2 text-text-muted">{r.email || '-'}</td>
                        <td className="px-3 py-2 text-text-muted">{r.phone || '-'}</td>
                        <td className="px-3 py-2 text-text-muted">{r.city || '-'}</td>
                        <td className="px-3 py-2">
                          {r.processed ? (
                            <Badge variant="success">Importado</Badge>
                          ) : r.duplicate ? (
                            <Badge variant="warning">
                              Dup: {r.duplicate.matchType} ({r.duplicate.confidence})
                            </Badge>
                          ) : (
                            <Badge variant="default">Nuevo</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Import controls */}
              <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-4">
                <div className="flex items-center gap-3">
                  <Select
                    label=""
                    value={importMode}
                    onChange={e => setImportMode(e.target.value as ImportMode)}
                    options={[
                      { value: 'skip', label: 'Omitir duplicados' },
                      { value: 'merge', label: 'Combinar datos' },
                      { value: 'create_all', label: 'Crear todos' },
                    ]}
                  />
                  <span className="text-sm text-text-muted">
                    {selected.size} seleccionados
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={handleReset}>Cancelar</Button>
                  <Button
                    onClick={handleImport}
                    loading={loading}
                    disabled={selected.size === 0}
                  >
                    Importar ({selected.size})
                  </Button>
                </div>
              </div>

              {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
            </>
          )}
        </div>
      )}

      {/* ═══ PHASE 4: Imported ═══ */}
      {phase === 'imported' && importSummary && (
        <div className="bg-surface-light border border-border rounded-xl p-6 text-center">
          <p className="text-5xl mb-4">✅</p>
          <h2 className="text-lg font-semibold mb-4">Importacion Completada</h2>

          <div className="grid grid-cols-3 gap-4 max-w-md mx-auto mb-6">
            <div className="bg-surface rounded-lg p-3">
              <p className="text-2xl font-bold text-accent-green">{importSummary.imported}</p>
              <p className="text-xs text-text-muted">Importados</p>
            </div>
            <div className="bg-surface rounded-lg p-3">
              <p className="text-2xl font-bold text-text-muted">{importSummary.skipped}</p>
              <p className="text-xs text-text-muted">Omitidos</p>
            </div>
            <div className="bg-surface rounded-lg p-3">
              <p className="text-2xl font-bold text-accent-yellow">{importSummary.merged}</p>
              <p className="text-xs text-text-muted">Combinados</p>
            </div>
          </div>

          <div className="flex justify-center gap-3">
            <Button variant="secondary" onClick={handleReset}>Nueva busqueda</Button>
            <Button onClick={() => window.location.href = '/contacts'}>Ver contactos</Button>
          </div>
        </div>
      )}

      {/* ═══ Enrichment Section ═══ */}
      <div className="bg-surface-light border border-border rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Enriquecimiento de Contactos</h3>
            <p className="text-sm text-text-muted mt-1">
              Encuentra emails y telefonos a partir del sitio web de tus contactos
            </p>
          </div>
          <Button variant="secondary" onClick={openEnrichModal}>
            Enriquecer contactos
          </Button>
        </div>
      </div>

      {/* Enrichment Modal */}
      <Modal open={enrichOpen} onClose={() => setEnrichOpen(false)} title="Enriquecer Contactos" maxWidth="max-w-2xl">
        {enrichPhase === 'select' && (
          <div>
            {enrichLoading ? (
              <p className="text-center py-6 text-text-muted">Cargando contactos...</p>
            ) : enrichContacts.length === 0 ? (
              <p className="text-center py-6 text-text-muted">
                No hay contactos con website que necesiten enriquecimiento.
              </p>
            ) : (
              <>
                <p className="text-sm text-text-muted mb-3">
                  Contactos con website pero sin email o telefono ({enrichContacts.length}):
                </p>
                <div className="max-h-[300px] overflow-y-auto space-y-1">
                  {enrichContacts.map((c: any) => (
                    <label key={c.id} className="flex items-center gap-2 p-2 hover:bg-surface-lighter rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enrichSelected.has(c.id)}
                        onChange={() => {
                          const next = new Set(enrichSelected)
                          if (next.has(c.id)) next.delete(c.id)
                          else next.add(c.id)
                          setEnrichSelected(next)
                        }}
                        className="rounded"
                      />
                      <span className="font-medium text-sm">{c.firstName} {c.lastName}</span>
                      <span className="text-xs text-text-muted truncate">{c.website}</span>
                    </label>
                  ))}
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="ghost" onClick={() => setEnrichOpen(false)}>Cancelar</Button>
                  <Button onClick={startEnrichment} loading={enrichLoading} disabled={enrichSelected.size === 0}>
                    Enriquecer ({enrichSelected.size})
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {enrichPhase === 'running' && (
          <div className="text-center py-8">
            <div className="text-4xl animate-pulse mb-4">🔬</div>
            <p className="font-semibold">Buscando informacion de contacto...</p>
            <p className="text-sm text-text-muted mt-2">Esto puede tomar unos minutos</p>
          </div>
        )}

        {enrichPhase === 'done' && enrichResult && (
          <div className="text-center py-6">
            <p className="text-4xl mb-3">✅</p>
            <p className="font-semibold mb-2">{enrichResult.enriched} contactos enriquecidos</p>
            <p className="text-sm text-text-muted mb-4">de {enrichResult.totalProcessed} procesados</p>
            {enrichResult.updates?.length > 0 && (
              <div className="text-left bg-surface rounded-lg p-3 max-h-[200px] overflow-y-auto">
                {enrichResult.updates.map((u: any, i: number) => (
                  <p key={i} className="text-xs text-text-muted">
                    Contacto actualizado: {u.fieldsUpdated.join(', ')}
                  </p>
                ))}
              </div>
            )}
            <Button variant="secondary" onClick={() => { setEnrichOpen(false); router.refresh() }} className="mt-4">
              Cerrar
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
