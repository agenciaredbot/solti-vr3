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
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('')
  const [minScore, setMinScore] = useState('')
  const [maxScore, setMaxScore] = useState('')
  const [source, setSource] = useState('')
  const [city, setCity] = useState('')
  const [hasEmail, setHasEmail] = useState(false)
  const [hasPhone, setHasPhone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ name: string; populated: number } | null>(null)

  async function handleCreate() {
    if (!name.trim()) return
    setLoading(true)

    const filters: Record<string, any> = {}
    if (status) filters.status = status
    if (minScore) filters.minScore = Number(minScore)
    if (maxScore) filters.maxScore = Number(maxScore)
    if (source) filters.source = source
    if (city) filters.city = city
    if (hasEmail) filters.hasEmail = true
    if (hasPhone) filters.hasPhone = true

    const res = await createSmartList(name.trim(), description.trim() || undefined, filters)
    setLoading(false)

    if (res.error) return
    setResult({ name: res.data!.name, populated: res.data!.populated })
  }

  function handleClose() {
    setName('')
    setDescription('')
    setStatus('')
    setMinScore('')
    setMaxScore('')
    setSource('')
    setCity('')
    setHasEmail(false)
    setHasPhone(false)
    setResult(null)
    onClose()
    if (result) onSuccess()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Crear Lista Inteligente" maxWidth="max-w-xl">
      {result ? (
        <div className="text-center py-4">
          <p className="text-3xl mb-3">🧠</p>
          <p className="font-semibold">Lista "{result.name}" creada</p>
          <p className="text-sm text-text-muted mt-1">{result.populated} contactos agregados automaticamente</p>
          <Button onClick={handleClose} className="mt-4">Cerrar</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Input
            label="Nombre de la lista"
            placeholder="Ej: Leads calientes en Armenia"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <Input
            label="Descripcion (opcional)"
            placeholder="Lista auto-generada por filtros..."
            value={description}
            onChange={e => setDescription(e.target.value)}
          />

          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium mb-3">Filtros</p>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Estado"
                value={status}
                onChange={e => setStatus(e.target.value)}
                options={[{ value: '', label: 'Cualquiera' }, ...STATUS_OPTIONS]}
              />
              <Input
                label="Ciudad"
                placeholder="Ej: Armenia"
                value={city}
                onChange={e => setCity(e.target.value)}
              />
              <Input
                label="Score minimo"
                type="number"
                placeholder="0"
                value={minScore}
                onChange={e => setMinScore(e.target.value)}
              />
              <Input
                label="Score maximo"
                type="number"
                placeholder="100"
                value={maxScore}
                onChange={e => setMaxScore(e.target.value)}
              />
              <Input
                label="Fuente"
                placeholder="Ej: google_maps"
                value={source}
                onChange={e => setSource(e.target.value)}
              />
              <div />
            </div>

            <div className="flex gap-4 mt-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={hasEmail} onChange={e => setHasEmail(e.target.checked)} className="rounded" />
                Tiene email
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={hasPhone} onChange={e => setHasPhone(e.target.checked)} className="rounded" />
                Tiene telefono
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
            <Button onClick={handleCreate} loading={loading} disabled={!name.trim()}>
              Crear y Poblar
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
