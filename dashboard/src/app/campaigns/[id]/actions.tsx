'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { hubClientFetch } from '@/lib/hub'

export function CampaignActions({ campaignId, status }: { campaignId: string; status: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleAction(action: 'launch' | 'pause') {
    setLoading(true)
    try {
      await hubClientFetch(`/campaigns/${campaignId}/${action}`, { method: 'POST' })
      router.refresh()
    } catch (e: any) {
      alert('Error: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex gap-2">
      {(status === 'DRAFT' || status === 'PAUSED') && (
        <Button onClick={() => handleAction('launch')} loading={loading}>
          🚀 Lanzar
        </Button>
      )}
      {status === 'SENDING' && (
        <Button variant="secondary" onClick={() => handleAction('pause')} loading={loading}>
          ⏸️ Pausar
        </Button>
      )}
    </div>
  )
}
