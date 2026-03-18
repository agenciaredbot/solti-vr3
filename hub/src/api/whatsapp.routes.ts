/**
 * WhatsApp API — Instance management + messaging.
 *
 * GET    /instances            List instances for tenant
 * POST   /instances            Create new instance
 * GET    /instances/:id        Get instance details
 * DELETE /instances/:id        Delete instance
 * GET    /instances/:id/qr     Get QR code
 * GET    /instances/:id/status Connection status
 * POST   /instances/:id/send   Send message
 * GET    /instances/:id/conversations  List conversations
 * GET    /conversations/:id/messages   Get messages
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { getTenant } from '../auth/middleware.js'
import { routeService } from '../router/service-router.js'
import { NotFoundError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'

const whatsapp = new Hono()

// ═══ GET /instances — List instances ═══
whatsapp.get('/instances', async (c) => {
  const { tenantId } = getTenant(c)

  const instances = await prisma.whatsappInstance.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  })

  return c.json({ data: instances })
})

// ═══ POST /instances — Create new instance ═══
whatsapp.post('/instances', async (c) => {
  const { tenantId, tenantSlug } = getTenant(c)
  const { name, webhookUrl } = z.object({
    name: z.string().min(1).max(50),
    webhookUrl: z.string().url().optional(),
  }).parse(await c.req.json())

  // Instance name: solti-{slug}-{name} (sanitized, no spaces)
  const safeName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  const instanceName = `solti-${tenantSlug}-${safeName}`

  // Check if DB already has this instance (re-creation scenario)
  const existing = await prisma.whatsappInstance.findFirst({
    where: { tenantId, instanceName },
  })
  if (existing) {
    return c.json({ data: existing }, 200)
  }

  // Create in Evolution API
  const result = await routeService({
    tenantId,
    service: 'evolution',
    action: 'create_instance',
    params: {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
    },
  })

  // If Evolution says "already exists", still register in DB
  const evoData = result.success ? (result.data as any) : {}
  const alreadyExists = !result.success && JSON.stringify(result.data).includes('already')

  if (!result.success && !alreadyExists) {
    return c.json({ error: 'Failed to create WhatsApp instance', details: result.data }, 500)
  }

  // Store in DB
  const instance = await prisma.whatsappInstance.create({
    data: {
      tenantId,
      instanceName,
      instanceId: evoData.instance?.instanceId || instanceName,
      status: alreadyExists ? 'DISCONNECTED' : 'CONNECTING',
      qrCode: evoData.qrcode?.base64 || null,
      webhookUrl: webhookUrl || null,
    },
  })

  // Configure settings (syncFullHistory, etc.)
  await routeService({
    tenantId,
    service: 'evolution',
    action: 'set_settings',
    params: {
      instanceName,
      settings: {
        syncFullHistory: true,
        rejectCall: false,
        readMessages: false,
        readStatus: false,
      },
    },
  }).catch(err => logger.warn({ err, instanceName }, 'Failed to set instance settings'))

  logger.info({ tenantId, instanceName, instanceId: instance.id }, 'WhatsApp instance created')
  return c.json({ data: { ...instance, qrCode: evoData.qrcode?.base64 } }, 201)
})

// ═══ POST /instances/sync — Import instances from Evolution to DB ═══
whatsapp.post('/instances/sync', async (c) => {
  const { tenantId, tenantSlug } = getTenant(c)

  // Fetch all instances from Evolution
  const result = await routeService({
    tenantId,
    service: 'evolution',
    action: 'list_instances',
    params: {},
  })

  if (!result.success) {
    return c.json({ error: 'Failed to fetch Evolution instances' }, 500)
  }

  const rawData = result.data as any
  const evoInstances: any[] = Array.isArray(rawData) ? rawData : (rawData?.instances || [])
  const prefix = `solti-${tenantSlug}`
  const tenantInstances = evoInstances.filter((i: any) => i.name?.startsWith(prefix))

  let imported = 0
  for (const evo of tenantInstances) {
    const exists = await prisma.whatsappInstance.findFirst({
      where: { tenantId, instanceName: evo.name },
    })
    if (!exists) {
      const stateMap: Record<string, string> = { open: 'CONNECTED', close: 'DISCONNECTED', connecting: 'CONNECTING' }
      await prisma.whatsappInstance.create({
        data: {
          tenantId,
          instanceName: evo.name,
          instanceId: evo.id || evo.name,
          status: stateMap[evo.connectionStatus] || 'DISCONNECTED',
          phoneNumber: evo.ownerJid?.split('@')[0] || null,
        },
      })
      imported++
    }
  }

  // Update status of existing instances + remove orphans (in DB but not in Evolution)
  const stateMap: Record<string, string> = { open: 'CONNECTED', close: 'DISCONNECTED', connecting: 'CONNECTING' }
  const dbInstances = await prisma.whatsappInstance.findMany({ where: { tenantId } })
  let removed = 0
  for (const db of dbInstances) {
    const evo = evoInstances.find((i: any) => i.name === db.instanceName)
    if (evo) {
      // Update status from Evolution
      await prisma.whatsappInstance.update({
        where: { id: db.id },
        data: {
          status: stateMap[evo.connectionStatus] || db.status,
          phoneNumber: evo.ownerJid?.split('@')[0] || db.phoneNumber,
          connectedAt: evo.connectionStatus === 'open' && db.status !== 'CONNECTED' ? new Date() : db.connectedAt,
        },
      })
    } else {
      // Orphan: exists in DB but not in Evolution — remove it
      await prisma.whatsappInstance.delete({ where: { id: db.id } })
      removed++
      logger.info({ tenantId, instanceName: db.instanceName }, 'Removed orphan WhatsApp instance from DB')
    }
  }

  const all = await prisma.whatsappInstance.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } })
  logger.info({ tenantId, imported, removed, total: all.length }, 'WhatsApp instances synced')
  return c.json({ data: all, imported, removed })
})

// ═══ GET /instances/:id — Get instance ═══
whatsapp.get('/instances/:id', async (c) => {
  const { tenantId } = getTenant(c)
  const id = c.req.param('id')

  const instance = await prisma.whatsappInstance.findFirst({
    where: { id, tenantId },
  })
  if (!instance) throw new NotFoundError('WhatsApp instance')

  return c.json({ data: instance })
})

// ═══ PATCH /instances/:id — Update instance config ═══
whatsapp.patch('/instances/:id', async (c) => {
  const { tenantId } = getTenant(c)
  const id = c.req.param('id')

  const instance = await prisma.whatsappInstance.findFirst({ where: { id, tenantId } })
  if (!instance) throw new NotFoundError('WhatsApp instance')

  const body = z.object({
    systemPrompt: z.string().nullable().optional(),
    additionalContext: z.string().nullable().optional(),
    autoReply: z.boolean().optional(),
    maxHistoryMsgs: z.number().min(1).max(50).optional(),
    maxTokens: z.number().min(100).max(2000).optional(),
    fallbackMsg: z.string().nullable().optional(),
    cooldownSecs: z.number().min(10).max(600).optional(),
  }).parse(await c.req.json())

  const updated = await prisma.whatsappInstance.update({
    where: { id },
    data: body,
  })

  logger.info({ tenantId, instanceId: id }, 'WhatsApp instance config updated')
  return c.json({ data: updated })
})

// ═══ DELETE /instances/:id — Delete instance ═══
whatsapp.delete('/instances/:id', async (c) => {
  const { tenantId } = getTenant(c)
  const id = c.req.param('id')

  const instance = await prisma.whatsappInstance.findFirst({
    where: { id, tenantId },
  })
  if (!instance) throw new NotFoundError('WhatsApp instance')

  // Delete from Evolution API
  await routeService({
    tenantId,
    service: 'evolution',
    action: 'delete_instance',
    params: { instanceName: instance.instanceName },
  }).catch(err => logger.warn({ err }, 'Failed to delete from Evolution API'))

  // Delete from DB
  await prisma.whatsappInstance.delete({ where: { id } })

  logger.info({ tenantId, instanceName: instance.instanceName }, 'WhatsApp instance deleted')
  return c.json({ success: true })
})

// ═══ GET /instances/:id/qr — Get QR code ═══
whatsapp.get('/instances/:id/qr', async (c) => {
  const { tenantId } = getTenant(c)
  const id = c.req.param('id')

  const instance = await prisma.whatsappInstance.findFirst({
    where: { id, tenantId },
  })
  if (!instance) throw new NotFoundError('WhatsApp instance')

  // Fetch fresh QR from Evolution API
  const result = await routeService({
    tenantId,
    service: 'evolution',
    action: 'get_qr',
    params: { instanceName: instance.instanceName },
  })

  return c.json({
    data: {
      instanceName: instance.instanceName,
      qrCode: result.success ? (result.data as any)?.base64 || (result.data as any)?.code : null,
      status: instance.status,
    },
  })
})

// ═══ GET /instances/:id/status — Connection status ═══
whatsapp.get('/instances/:id/status', async (c) => {
  const { tenantId } = getTenant(c)
  const id = c.req.param('id')

  const instance = await prisma.whatsappInstance.findFirst({
    where: { id, tenantId },
  })
  if (!instance) throw new NotFoundError('WhatsApp instance')

  // Fetch live status from Evolution API
  const result = await routeService({
    tenantId,
    service: 'evolution',
    action: 'connection_state',
    params: { instanceName: instance.instanceName },
  })

  const state = result.success
    ? (result.data as any)?.instance?.state || 'unknown'
    : 'error'

  // Map Evolution state to our status
  const statusMap: Record<string, string> = {
    open: 'CONNECTED',
    close: 'DISCONNECTED',
    connecting: 'CONNECTING',
  }
  const newStatus = statusMap[state] || instance.status

  // Update DB if status changed
  if (newStatus !== instance.status) {
    await prisma.whatsappInstance.update({
      where: { id },
      data: {
        status: newStatus,
        connectedAt: newStatus === 'CONNECTED' ? new Date() : instance.connectedAt,
      },
    })
  }

  return c.json({
    data: {
      instanceName: instance.instanceName,
      status: newStatus,
      evolutionState: state,
    },
  })
})

// ═══ POST /instances/:id/send — Send message ═══
whatsapp.post('/instances/:id/send', async (c) => {
  const { tenantId } = getTenant(c)
  const id = c.req.param('id')
  const { number, text } = z.object({
    number: z.string().min(10), // Phone number with country code
    text: z.string().min(1),
  }).parse(await c.req.json())

  const instance = await prisma.whatsappInstance.findFirst({
    where: { id, tenantId },
  })
  if (!instance) throw new NotFoundError('WhatsApp instance')

  const result = await routeService({
    tenantId,
    service: 'evolution',
    action: 'send_text',
    params: {
      instanceName: instance.instanceName,
      number,
      text,
    },
  })

  if (result.success) {
    // Log the outbound message
    const msgData = result.data as any
    const remoteJid = `${number}@s.whatsapp.net`

    // Find or create conversation
    const conversation = await prisma.whatsappConversation.upsert({
      where: {
        id: await prisma.whatsappConversation.findFirst({
          where: { instanceId: instance.id, remoteJid },
          select: { id: true },
        }).then(c => c?.id || '00000000-0000-0000-0000-000000000000'),
      },
      create: {
        tenantId,
        instanceId: instance.id,
        remoteJid,
        lastMessageAt: new Date(),
      },
      update: {
        lastMessageAt: new Date(),
      },
    })

    await prisma.whatsappMessage.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUTBOUND',
        messageType: 'text',
        content: text,
        status: 'SENT',
        externalId: msgData?.key?.id || null,
      },
    })
  }

  return c.json({ data: result })
})

// ═══ GET /instances/:id/conversations — List conversations ═══
whatsapp.get('/instances/:id/conversations', async (c) => {
  const { tenantId } = getTenant(c)
  const id = c.req.param('id')

  const instance = await prisma.whatsappInstance.findFirst({
    where: { id, tenantId },
  })
  if (!instance) throw new NotFoundError('WhatsApp instance')

  const conversations = await prisma.whatsappConversation.findMany({
    where: { instanceId: instance.id },
    orderBy: { lastMessageAt: 'desc' },
    take: 50,
    include: {
      contact: { select: { id: true, firstName: true, lastName: true, phone: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })

  return c.json({ data: conversations })
})

// ═══ GET /conversations/:id/messages — Get messages ═══
whatsapp.get('/conversations/:convId/messages', async (c) => {
  const { tenantId } = getTenant(c)
  const convId = c.req.param('convId')

  const conversation = await prisma.whatsappConversation.findFirst({
    where: { id: convId, tenantId },
  })
  if (!conversation) throw new NotFoundError('Conversation')

  const page = Number(c.req.query('page') || 1)
  const limit = Math.min(Number(c.req.query('limit') || 50), 100)

  const messages = await prisma.whatsappMessage.findMany({
    where: { conversationId: convId },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  })

  return c.json({ data: messages.reverse() }) // Chronological order
})

export { whatsapp as whatsappRoutes }
