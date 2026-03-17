'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Input, Select } from '@/components/ui/input'
import { hubClientFetch } from '@/lib/hub'

export function CredentialActions() {
  const [showAdd, setShowAdd] = useState(false)
  const [service, setService] = useState('apify')
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleAdd() {
    if (!apiKey.trim()) return
    setLoading(true)
    try {
      await hubClientFetch('/credentials', {
        method: 'POST',
        body: JSON.stringify({ service, apiKey }),
      })
      setShowAdd(false)
      setApiKey('')
      router.refresh()
    } catch (e: any) {
      alert('Error: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setShowAdd(true)}>+ Agregar Credencial</Button>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Agregar Credencial API">
        <div className="space-y-4">
          <Select
            label="Servicio"
            value={service}
            onChange={(e) => setService(e.target.value)}
            options={[
              { value: 'apify', label: 'Apify' },
              { value: 'brevo', label: 'Brevo' },
              { value: 'evolution', label: 'Evolution API' },
              { value: 'getlate', label: 'getLate' },
              { value: 'phantombuster', label: 'PhantomBuster' },
            ]}
          />
          <Input
            label="API Key"
            type="password"
            placeholder="sk_..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <p className="text-xs text-text-muted">
            La API key se encripta antes de almacenarla. Solo el Hub puede descifrarla.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancelar</Button>
            <Button onClick={handleAdd} loading={loading} disabled={!apiKey.trim()}>Guardar</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
