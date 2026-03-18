'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { createInstance, deleteInstance, getInstanceQR, getInstanceStatus } from './server-actions'

// ═══ Top-level "Nueva Instancia" button + instance card actions ═══
export function WhatsAppActions({
  instanceId,
  instanceName,
  status,
}: {
  instanceId?: string
  instanceName?: string
  status?: string
}) {
  if (!instanceId) {
    return <CreateInstanceButton />
  }

  return (
    <InstanceCardActions
      instanceId={instanceId}
      instanceName={instanceName!}
      status={status!}
    />
  )
}

// ═══ Create Instance Button + Modal ═══
function CreateInstanceButton() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleCreate() {
    if (!name.trim()) return
    setLoading(true)
    setError('')
    const res = await createInstance(name.trim())
    setLoading(false)
    if (res.error) {
      setError(res.error)
    } else {
      setResult(res.data || res)
    }
  }

  function handleClose() {
    setOpen(false)
    setName('')
    setResult(null)
    setError('')
    router.refresh()
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Nueva Instancia</Button>
      <Modal open={open} onClose={handleClose} title="Crear Instancia WhatsApp">
        {!result ? (
          <div className="space-y-4">
            <Input
              label="Nombre de la instancia"
              placeholder="ej: ventas, soporte, marketing"
              value={name}
              onChange={e => setName(e.target.value)}
            />
            <p className="text-xs text-text-muted">
              Se creara como: <span className="font-mono text-text">solti-default-{name || '...'}</span>
            </p>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
              <Button onClick={handleCreate} loading={loading} disabled={!name.trim()}>
                Crear
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-accent-green font-semibold mb-2">Instancia creada</p>
              <p className="text-sm text-text-muted mb-4">
                Escanea el codigo QR con WhatsApp para vincular el numero.
              </p>
            </div>
            {result.qrCode ? (
              <QRDisplay qrBase64={result.qrCode} />
            ) : (
              <p className="text-text-muted text-sm text-center">
                QR no disponible. Usa el boton "QR" en la tarjeta de la instancia.
              </p>
            )}
            <div className="flex justify-end">
              <Button onClick={handleClose}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

// ═══ Instance Card Actions (QR, Status, Delete) ═══
function InstanceCardActions({
  instanceId,
  instanceName,
  status,
}: {
  instanceId: string
  instanceName: string
  status: string
}) {
  const [qrOpen, setQrOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [qrData, setQrData] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [statusData, setStatusData] = useState(status)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()

  const fetchQR = useCallback(async () => {
    setQrLoading(true)
    const res = await getInstanceQR(instanceId)
    if (!res.error) {
      const data = res.data || res
      setQrData(data.qrCode || null)
      if (data.status) setStatusData(data.status)
    } else {
      setQrData(null)
    }
    setQrLoading(false)
  }, [instanceId])

  async function checkStatus() {
    const res = await getInstanceStatus(instanceId)
    if (!res.error) {
      const data = res.data || res
      setStatusData(data.status || status)
      router.refresh()
    }
  }

  async function handleDelete() {
    setDeleting(true)
    await deleteInstance(instanceId)
    setDeleteOpen(false)
    setDeleting(false)
    router.refresh()
  }

  return (
    <>
      {statusData !== 'CONNECTED' && (
        <Button size="sm" variant="secondary" onClick={() => { setQrOpen(true); fetchQR() }}>
          QR
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={checkStatus}>
        Verificar
      </Button>
      <Button size="sm" variant="danger" onClick={() => setDeleteOpen(true)}>
        Eliminar
      </Button>

      {/* QR Modal */}
      <Modal open={qrOpen} onClose={() => setQrOpen(false)} title={`QR — ${instanceName}`}>
        <div className="space-y-4">
          <p className="text-sm text-text-muted text-center">
            Escanea con WhatsApp para vincular este numero.
          </p>
          {qrLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin text-3xl">⟳</div>
            </div>
          ) : qrData ? (
            <QRDisplay qrBase64={qrData} />
          ) : (
            <p className="text-text-muted text-sm text-center py-4">
              QR no disponible. La instancia puede ya estar conectada o necesita reiniciarse.
            </p>
          )}
          <div className="flex justify-between">
            <Button variant="ghost" size="sm" onClick={fetchQR} loading={qrLoading}>
              Refrescar QR
            </Button>
            <Button variant="secondary" onClick={() => setQrOpen(false)}>Cerrar</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Eliminar Instancia">
        <div className="space-y-4">
          <p className="text-sm">
            ¿Estas seguro de eliminar <span className="font-semibold text-red-400">{instanceName}</span>?
          </p>
          <p className="text-xs text-text-muted">
            Se eliminara la instancia de Evolution API y se desconectara el numero de WhatsApp.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancelar</Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>
              Si, eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

// ═══ QR Code Display ═══
function QRDisplay({ qrBase64 }: { qrBase64: string }) {
  const src = qrBase64.startsWith('data:') ? qrBase64 : `data:image/png;base64,${qrBase64}`

  return (
    <div className="flex justify-center">
      <div className="bg-white p-4 rounded-xl">
        <img
          src={src}
          alt="WhatsApp QR Code"
          className="w-64 h-64"
        />
      </div>
    </div>
  )
}
