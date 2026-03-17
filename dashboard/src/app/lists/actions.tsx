'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { hubClientFetch } from '@/lib/hub'

export function ListActions() {
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleCreate() {
    if (!name.trim()) return
    setLoading(true)
    try {
      await hubClientFetch('/lists', {
        method: 'POST',
        body: JSON.stringify({ name, description: description || undefined }),
      })
      setShowCreate(false)
      setName('')
      setDescription('')
      router.refresh()
    } catch (e: any) {
      alert('Error: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button onClick={() => setShowCreate(true)}>+ Nueva Lista</Button>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Crear Lista">
        <div className="space-y-4">
          <Input
            label="Nombre"
            placeholder="Ej: Hot Leads Bogotá"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="Descripción (opcional)"
            placeholder="Ej: Contactos score >= 80 en Bogotá"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate} loading={loading} disabled={!name.trim()}>Crear Lista</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
