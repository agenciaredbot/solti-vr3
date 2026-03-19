'use server'

/**
 * WhatsApp Server Actions — Now using local API routes (Vercel)
 * instead of Railway Hub. Direct Prisma + Evolution API calls.
 */

import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth-api'
import * as evo from '@/lib/evolution'

export async function getInstance(id: string) {
  try {
    const { tenantId } = await getAuthContext()
    const instance = await prisma.whatsappInstance.findFirst({
      where: { id, tenantId },
    })
    return instance ? { data: instance } : { error: 'Not found' }
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function updateInstanceConfig(id: string, data: Record<string, any>) {
  try {
    const { tenantId } = await getAuthContext()

    const instance = await prisma.whatsappInstance.findFirst({
      where: { id, tenantId },
    })
    if (!instance) return { error: 'Not found' }

    const allowedFields = [
      'autoReply', 'systemPrompt', 'additionalContext',
      'maxHistoryMsgs', 'maxTokens', 'fallbackMsg', 'cooldownSecs',
      'displayName',
    ]

    const updateData: Record<string, any> = {}
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field]
      }
    }

    const updated = await prisma.whatsappInstance.update({
      where: { id },
      data: updateData,
    })

    return { data: updated }
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function getInstanceStatus(id: string) {
  try {
    const { tenantId } = await getAuthContext()

    const instance = await prisma.whatsappInstance.findFirst({
      where: { id, tenantId },
      select: { id: true, instanceName: true, status: true, phoneNumber: true },
    })
    if (!instance) return { error: 'Not found' }

    // Get live status from Evolution
    let liveState = 'unknown'
    let ownerJid = ''
    try {
      const result = await evo.getConnectionState(instance.instanceName)
      liveState = result.instance?.state || 'unknown'

      const instances = await evo.fetchInstances()
      const found = (instances as any[]).find((i: any) => i.name === instance.instanceName)
      ownerJid = found?.ownerJid || ''
    } catch {
      liveState = 'error'
    }

    const statusMap: Record<string, string> = {
      open: 'CONNECTED',
      close: 'DISCONNECTED',
      connecting: 'CONNECTING',
    }
    const newStatus = statusMap[liveState] || 'DISCONNECTED'
    const phone = ownerJid ? ownerJid.replace('@s.whatsapp.net', '') : instance.phoneNumber

    // Update DB
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

    return { data: { status: newStatus, phoneNumber: phone, evolutionState: liveState } }
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function createInstance(name: string) {
  try {
    const { tenantId } = await getAuthContext()

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    })

    const slug = tenant?.slug || 'default'
    const instanceName = `solti-${slug}-${name}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 50)

    // Webhook URL = this Vercel app
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3001')
    const webhookUrl = `${baseUrl}/api/webhooks/whatsapp`

    // Create in Evolution with webhook
    const result = await evo.createInstance(instanceName, webhookUrl)
    const instanceId = result.instance?.instanceId || null

    // Store in DB
    const instance = await prisma.whatsappInstance.create({
      data: {
        tenantId,
        instanceName,
        instanceId,
        status: 'CONNECTING',
        webhookUrl,
      },
    })

    return { data: instance, qrcode: result.qrcode?.base64 || null }
  } catch (e: any) {
    console.error('[WhatsApp] Create error:', e)
    return { error: e.message }
  }
}

export async function deleteInstance(id: string) {
  try {
    const { tenantId } = await getAuthContext()

    const instance = await prisma.whatsappInstance.findFirst({
      where: { id, tenantId },
    })
    if (!instance) return { error: 'Not found' }

    try {
      await evo.deleteInstance(instance.instanceName)
    } catch {
      // May already be deleted
    }

    await prisma.whatsappInstance.delete({ where: { id } })
    return { ok: true }
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function getInstanceQR(id: string) {
  try {
    const { tenantId } = await getAuthContext()

    const instance = await prisma.whatsappInstance.findFirst({
      where: { id, tenantId },
      select: { instanceName: true, status: true },
    })
    if (!instance) return { error: 'Not found' }

    const result = await evo.getQRCode(instance.instanceName)

    return {
      data: {
        instanceName: instance.instanceName,
        qrCode: result.base64 || result.code || null,
        status: instance.status,
      },
    }
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function syncInstances() {
  try {
    const { tenantId } = await getAuthContext()

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    })
    const prefix = `solti-${tenant?.slug || ''}`

    // Fetch from Evolution
    const evoInstances = await evo.fetchInstances() as any[]
    const matching = evoInstances.filter(i => i.name?.startsWith(prefix))

    let imported = 0
    for (const inst of matching) {
      const exists = await prisma.whatsappInstance.findFirst({
        where: { instanceName: inst.name, tenantId },
      })

      if (!exists) {
        const statusMap: Record<string, string> = {
          open: 'CONNECTED', close: 'DISCONNECTED', connecting: 'CONNECTING',
        }
        await prisma.whatsappInstance.create({
          data: {
            tenantId,
            instanceName: inst.name,
            instanceId: inst.id || null,
            phoneNumber: inst.ownerJid?.replace('@s.whatsapp.net', '') || null,
            status: statusMap[inst.connectionStatus] || 'DISCONNECTED',
            ...(inst.connectionStatus === 'open' ? { connectedAt: new Date() } : {}),
          },
        })
        imported++
      }
    }

    return { data: { imported, total: matching.length } }
  } catch (e: any) {
    return { error: e.message }
  }
}
