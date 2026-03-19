/**
 * GET /api/whatsapp/instances/:id/status — Check live connection status
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth-api'
import * as evo from '@/lib/evolution'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await getAuthContext()
    const { id } = await params

    const instance = await prisma.whatsappInstance.findFirst({
      where: { id, tenantId },
      select: { id: true, instanceName: true, status: true, phoneNumber: true },
    })

    if (!instance) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Get live status from Evolution
    let liveState = 'unknown'
    let ownerJid = ''
    try {
      const result = await evo.getConnectionState(instance.instanceName)
      liveState = result.instance?.state || 'unknown'

      // Also fetch owner info
      const instances = await evo.fetchInstances()
      const found = (instances as any[]).find((i: any) => i.name === instance.instanceName)
      ownerJid = found?.ownerJid || ''
    } catch {
      liveState = 'error'
    }

    // Map to our status
    const statusMap: Record<string, string> = {
      open: 'CONNECTED',
      close: 'DISCONNECTED',
      connecting: 'CONNECTING',
    }
    const newStatus = statusMap[liveState] || 'DISCONNECTED'
    const phone = ownerJid ? ownerJid.replace('@s.whatsapp.net', '') : instance.phoneNumber

    // Update DB if changed
    if (newStatus !== instance.status || (phone && phone !== instance.phoneNumber)) {
      await prisma.whatsappInstance.update({
        where: { id: instance.id },
        data: {
          status: newStatus,
          phoneNumber: phone || instance.phoneNumber,
          ...(newStatus === 'CONNECTED' ? { connectedAt: new Date() } : {}),
        },
      })
    }

    return NextResponse.json({
      data: {
        status: newStatus,
        phoneNumber: phone,
        evolutionState: liveState,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
