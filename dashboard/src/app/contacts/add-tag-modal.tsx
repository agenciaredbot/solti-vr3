'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { addTagToContact } from './server-actions'

const PRESET_COLORS = [
  '#6366f1', '#ef4444', '#f59e0b', '#22c55e',
  '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6',
]

interface Tag { id: string; name: string; color: string }

interface Props {
  open: boolean
  onClose: () => void
  selectedContactIds: string[]
  existingTags: Tag[]
  onSuccess: () => void
}

export function AddTagModal({ open, onClose, selectedContactIds, existingTags, onSuccess }: Props) {
  const [tagName, setTagName] = useState('')
  const [tagColor, setTagColor] = useState(PRESET_COLORS[0])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)

  function selectExisting(tag: Tag) {
    setTagName(tag.name)
    setTagColor(tag.color)
  }

  async function handleApply() {
    if (!tagName.trim()) return
    setLoading(true)
    setProgress(0)
    let completed = 0
    for (const contactId of selectedContactIds) {
      await addTagToContact(contactId, tagName.trim(), tagColor)
      completed++
      setProgress(Math.round((completed / selectedContactIds.length) * 100))
    }
    setLoading(false)
    setDone(true)
  }

  function handleClose() {
    setTagName('')
    setTagColor(PRESET_COLORS[0])
    setProgress(0)
    setDone(false)
    onClose()
    if (done) onSuccess()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Agregar Tag">
      {done ? (
        <div className="text-center py-4">
          <p className="text-3xl mb-3">🏷️</p>
          <p className="font-semibold">Tag "{tagName}" aplicado</p>
          <p className="text-sm text-text-muted mt-1">a {selectedContactIds.length} contactos</p>
          <Button onClick={handleClose} className="mt-4">Cerrar</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-text-muted">{selectedContactIds.length} contactos seleccionados</p>

          {existingTags.length > 0 && (
            <div>
              <p className="text-xs text-text-muted mb-2">Tags existentes:</p>
              <div className="flex flex-wrap gap-1.5">
                {existingTags.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => selectExisting(tag)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                      tagName === tag.name
                        ? 'ring-2 ring-primary ring-offset-1 ring-offset-surface-light'
                        : 'hover:opacity-80'
                    }`}
                    style={{ backgroundColor: tag.color + '20', color: tag.color }}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Input
            label="Nombre del tag"
            placeholder="Ej: VIP, Interesado, Frio"
            value={tagName}
            onChange={e => setTagName(e.target.value)}
          />

          <div>
            <p className="text-xs text-text-muted mb-2">Color:</p>
            <div className="flex gap-2">
              {PRESET_COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => setTagColor(color)}
                  className={`w-7 h-7 rounded-full transition-all ${
                    tagColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-surface-light scale-110' : ''
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {loading && (
            <div className="w-full bg-surface rounded-full h-2">
              <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
            <Button onClick={handleApply} loading={loading} disabled={!tagName.trim()}>
              Aplicar Tag
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
