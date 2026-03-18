'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createListWithContacts } from './server-actions'

interface Props {
  open: boolean
  onClose: () => void
  selectedIds: string[]
  onSuccess: () => void
}

export function CreateListModal({ open, onClose, selectedIds, onSuccess }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ name: string; contactCount: number } | null>(null)

  async function handleCreate() {
    if (!name.trim()) return
    setLoading(true)
    const res = await createListWithContacts(name.trim(), description.trim() || undefined, selectedIds)
    setLoading(false)
    if (res.error) return
    setResult({ name: res.data!.name, contactCount: res.data!.contactCount })
  }

  function handleClose() {
    setName('')
    setDescription('')
    setResult(null)
    onClose()
    if (result) onSuccess()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Crear Lista">
      {result ? (
        <div className="text-center py-4">
          <p className="text-3xl mb-3">✅</p>
          <p className="font-semibold">Lista "{result.name}" creada</p>
          <p className="text-sm text-text-muted mt-1">{result.contactCount} contactos agregados</p>
          <Button onClick={handleClose} className="mt-4">Cerrar</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-text-muted">{selectedIds.length} contactos seleccionados</p>
          <Input
            label="Nombre de la lista"
            placeholder="Ej: Inmobiliarias Armenia"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <Input
            label="Descripcion (opcional)"
            placeholder="Contactos de Google Maps..."
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
            <Button onClick={handleCreate} loading={loading} disabled={!name.trim()}>
              Crear Lista
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
