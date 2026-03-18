'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { createListWithContacts } from '../contacts/server-actions'
import { SmartListModal } from './smart-list-modal'

interface Tag { id: string; name: string; color: string }

export function ListActions({ tags }: { tags: Tag[] }) {
  const [showCreate, setShowCreate] = useState(false)
  const [showSmart, setShowSmart] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleCreate() {
    if (!name.trim()) return
    setLoading(true)
    const res = await createListWithContacts(name.trim(), description.trim() || undefined, [])
    setLoading(false)
    if (!res.error) {
      setShowCreate(false)
      setName('')
      setDescription('')
      router.refresh()
    }
  }

  return (
    <>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => setShowSmart(true)}>Lista Inteligente</Button>
        <Button onClick={() => setShowCreate(true)}>+ Nueva Lista</Button>
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Crear Lista">
        <div className="space-y-4">
          <Input
            label="Nombre"
            placeholder="Ej: Hot Leads Bogota"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="Descripcion (opcional)"
            placeholder="Ej: Contactos score >= 80 en Bogota"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate} loading={loading} disabled={!name.trim()}>Crear Lista</Button>
          </div>
        </div>
      </Modal>

      <SmartListModal
        open={showSmart}
        onClose={() => setShowSmart(false)}
        tags={tags}
        onSuccess={() => router.refresh()}
      />
    </>
  )
}
