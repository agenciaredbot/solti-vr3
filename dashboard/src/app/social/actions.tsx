'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Input, Select, Textarea } from '@/components/ui/input'
import { hubClientFetch } from '@/lib/hub'

export function SocialActions() {
  return <CreatePostButton />
}

function CreatePostButton() {
  const [open, setOpen] = useState(false)
  const [platform, setPlatform] = useState('linkedin')
  const [content, setContent] = useState('')
  const [schedule, setSchedule] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [accounts, setAccounts] = useState<any[]>([])
  const [accountId, setAccountId] = useState('')
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const router = useRouter()

  async function fetchAccounts(plat: string) {
    setLoadingAccounts(true)
    try {
      const res = await hubClientFetch('/services/execute', {
        method: 'POST',
        body: JSON.stringify({ service: 'getlate', action: 'list_accounts', params: {} }),
      })
      const all = res.data?.data?.accounts || []
      const filtered = plat ? all.filter((a: any) => a.platform === plat) : all
      setAccounts(filtered)
      if (filtered.length === 1) setAccountId(filtered[0]._id || filtered[0].id)
      else setAccountId('')
    } catch {
      setAccounts([])
    }
    setLoadingAccounts(false)
  }

  function handleOpen() {
    setOpen(true)
    setError('')
    setSuccess(false)
    fetchAccounts(platform)
  }

  function handlePlatformChange(val: string) {
    setPlatform(val)
    fetchAccounts(val)
  }

  async function handleSubmit() {
    if (!content.trim() || !accountId) return
    setLoading(true)
    setError('')
    try {
      await hubClientFetch('/services/execute', {
        method: 'POST',
        body: JSON.stringify({
          service: 'getlate',
          action: 'create_post',
          params: {
            text: content,
            platforms: [{ platformAccountId: accountId, platformId: platform }],
            ...(schedule ? { scheduledAt: new Date(schedule).toISOString() } : {}),
          },
        }),
      })
      setSuccess(true)
      setTimeout(() => {
        handleClose()
        router.refresh()
      }, 1500)
    } catch (err: any) {
      setError(err.message || 'Error al publicar')
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    setOpen(false)
    setContent('')
    setSchedule('')
    setError('')
    setSuccess(false)
  }

  return (
    <>
      <Button onClick={handleOpen}>+ Nueva Publicación</Button>
      <Modal open={open} onClose={handleClose} title="Nueva Publicación">
        {success ? (
          <div className="text-center py-6">
            <p className="text-3xl mb-2">✅</p>
            <p className="text-accent-green font-semibold">
              {schedule ? 'Publicación programada' : 'Publicación creada'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <Select
              label="Plataforma"
              value={platform}
              onChange={e => handlePlatformChange(e.target.value)}
              options={[
                { value: 'linkedin', label: 'LinkedIn' },
                { value: 'instagram', label: 'Instagram' },
                { value: 'facebook', label: 'Facebook' },
                { value: 'twitter', label: 'X / Twitter' },
                { value: 'tiktok', label: 'TikTok' },
                { value: 'threads', label: 'Threads' },
              ]}
            />

            {loadingAccounts ? (
              <p className="text-xs text-text-muted">Cargando cuentas...</p>
            ) : accounts.length === 0 ? (
              <p className="text-xs text-red-400">
                No hay cuentas de {platform} conectadas en getLate.
              </p>
            ) : accounts.length > 1 ? (
              <Select
                label="Cuenta"
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                options={[
                  { value: '', label: 'Seleccionar cuenta...' },
                  ...accounts.map((a: any) => ({
                    value: a._id || a.id,
                    label: `@${a.username || a.displayName}`,
                  })),
                ]}
              />
            ) : (
              <p className="text-xs text-text-muted">
                Cuenta: <span className="font-medium text-text">@{accounts[0]?.username || accounts[0]?.displayName}</span>
              </p>
            )}

            <Textarea
              label="Contenido"
              placeholder="Escribe tu publicación..."
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={5}
            />
            <p className="text-xs text-text-muted text-right">{content.length} caracteres</p>

            <Input
              label="Programar (opcional)"
              type="datetime-local"
              value={schedule}
              onChange={e => setSchedule(e.target.value)}
            />
            <p className="text-xs text-text-muted">
              Deja vacío para publicar de inmediato.
            </p>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
              <Button
                onClick={handleSubmit}
                loading={loading}
                disabled={!content.trim() || !accountId}
              >
                {schedule ? 'Programar' : 'Publicar'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
