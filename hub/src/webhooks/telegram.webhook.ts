/**
 * Telegram Bot Webhook — Handles incoming bot commands.
 *
 * Commands:
 * /start <linkCode>  — Link Telegram chat to a tenant (code from Dashboard)
 * /status            — Show tenant summary (contacts, campaigns, credits, instances)
 * /credits           — Show credit balance
 * /help              — List available commands
 *
 * Setup:
 * 1. Set TELEGRAM_BOT_TOKEN env
 * 2. Set webhook: POST https://api.telegram.org/bot<token>/setWebhook?url=<hub>/webhooks/telegram
 */

import { Hono } from 'hono'
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { getBalance } from '../services/credit.service.js'

const telegramWebhook = new Hono()

interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from: { id: number; first_name: string; username?: string }
    chat: { id: number; type: string }
    text?: string
    date: number
  }
}

// ═══ POST / — Receive Telegram update ═══
telegramWebhook.post('/', async (c) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) return c.json({ ok: true })

  let update: TelegramUpdate
  try {
    update = await c.req.json()
  } catch {
    return c.json({ ok: true })
  }

  const message = update.message
  if (!message?.text) return c.json({ ok: true })

  const chatId = String(message.chat.id)
  const text = message.text.trim()

  try {
    if (text.startsWith('/start')) {
      await handleStart(botToken, chatId, text, message.from.first_name)
    } else if (text === '/status') {
      await handleStatus(botToken, chatId)
    } else if (text === '/credits' || text === '/creditos') {
      await handleCredits(botToken, chatId)
    } else if (text === '/help' || text === '/ayuda') {
      await handleHelp(botToken, chatId)
    } else {
      // Unknown command — show help
      await sendMessage(botToken, chatId,
        `No reconozco ese comando. Usa /help para ver los comandos disponibles.`
      )
    }
  } catch (err) {
    logger.error({ err, chatId, text }, 'Telegram bot error')
  }

  return c.json({ ok: true })
})

// ═══ Command handlers ═══

async function handleStart(botToken: string, chatId: string, text: string, firstName: string): Promise<void> {
  const parts = text.split(' ')
  const linkCode = parts[1]?.trim()

  if (!linkCode) {
    await sendMessage(botToken, chatId,
      `👋 ¡Hola ${firstName}! Soy el bot de Solti.\n\n` +
      `Para vincular tu cuenta, necesitas un código de vinculación.\n` +
      `Genéralo en: Dashboard → Settings → Telegram.\n\n` +
      `Luego envía: /start <código>`
    )
    return
  }

  // Look up the link code in TenantConfig metadata
  const config = await prisma.tenantConfig.findFirst({
    where: {
      metadata: {
        path: ['telegramLinkCode'],
        equals: linkCode,
      },
    },
    include: {
      tenant: { select: { name: true } },
    },
  })

  if (!config) {
    await sendMessage(botToken, chatId,
      `❌ Código de vinculación inválido o expirado.\n\n` +
      `Genera uno nuevo en: Dashboard → Settings → Telegram`
    )
    return
  }

  // Link the chat
  await prisma.tenantConfig.update({
    where: { id: config.id },
    data: {
      telegramChatId: chatId,
      telegramLinkedAt: new Date(),
    },
  })

  await sendMessage(botToken, chatId,
    `✅ ¡Vinculado exitosamente a *${config.tenant.name}*!\n\n` +
    `Ahora recibirás notificaciones aquí:\n` +
    `• Campañas completadas/pausadas\n` +
    `• Instancias WhatsApp desconectadas\n` +
    `• Leads calientes respondiendo\n\n` +
    `Comandos:\n` +
    `/status — Resumen de tu cuenta\n` +
    `/credits — Balance de créditos\n` +
    `/help — Ayuda`
  )

  logger.info({ tenantId: config.tenantId, chatId }, 'Telegram linked')
}

async function handleStatus(botToken: string, chatId: string): Promise<void> {
  const config = await findTenantByChat(chatId)
  if (!config) {
    await sendMessage(botToken, chatId, `⚠️ Chat no vinculado. Usa /start <código> para vincular tu cuenta.`)
    return
  }

  const tenantId = config.tenantId

  // Gather stats in parallel
  const [contacts, campaigns, instances, balance] = await Promise.all([
    prisma.contact.count({ where: { tenantId } }),
    prisma.campaign.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: true,
    }),
    prisma.whatsappInstance.findMany({
      where: { tenantId },
      select: { instanceName: true, status: true },
    }),
    getBalance(tenantId),
  ])

  const campaignStats = campaigns.reduce((acc, c) => {
    acc[c.status] = c._count
    return acc
  }, {} as Record<string, number>)

  const instanceList = instances.map(i => {
    const emoji = i.status === 'CONNECTED' ? '🟢' : i.status === 'NEEDS_QR' ? '🟡' : '🔴'
    return `  ${emoji} ${i.instanceName}: ${i.status}`
  }).join('\n') || '  No hay instancias'

  const msg =
    `📊 *Estado de ${config.tenant.name}*\n\n` +
    `*Contactos:* ${contacts}\n` +
    `*Campañas:* ${Object.entries(campaignStats).map(([k, v]) => `${k}(${v})`).join(', ') || 'ninguna'}\n` +
    `*Créditos:* ${balance.available} disponibles (${balance.planCredits} plan + ${balance.purchasedCredits} comprados - ${balance.usedCredits} usados)\n\n` +
    `*WhatsApp:*\n${instanceList}`

  await sendMessage(botToken, chatId, msg)
}

async function handleCredits(botToken: string, chatId: string): Promise<void> {
  const config = await findTenantByChat(chatId)
  if (!config) {
    await sendMessage(botToken, chatId, `⚠️ Chat no vinculado. Usa /start <código>`)
    return
  }

  const balance = await getBalance(config.tenantId)
  const tenant = await prisma.tenant.findUnique({
    where: { id: config.tenantId },
    select: { plan: true },
  })

  const msg =
    `💳 *Créditos — Plan ${tenant?.plan || 'free'}*\n\n` +
    `Plan mensual: ${balance.planCredits}\n` +
    `Comprados: ${balance.purchasedCredits}\n` +
    `Usados: ${balance.usedCredits}\n` +
    `*Disponibles: ${balance.available}*\n\n` +
    `Reset: ${balance.resetsAt.toLocaleDateString('es-CO')}`

  await sendMessage(botToken, chatId, msg)
}

async function handleHelp(botToken: string, chatId: string): Promise<void> {
  await sendMessage(botToken, chatId,
    `🤖 *Solti Bot — Comandos*\n\n` +
    `/start <código> — Vincular cuenta\n` +
    `/status — Resumen (contactos, campañas, instancias)\n` +
    `/credits — Balance de créditos\n` +
    `/help — Esta ayuda\n\n` +
    `Las notificaciones llegan automáticamente cuando:\n` +
    `• Una campaña termina o se pausa\n` +
    `• Una instancia WA se desconecta\n` +
    `• Un lead caliente responde`
  )
}

// ═══ Helpers ═══

async function findTenantByChat(chatId: string) {
  return prisma.tenantConfig.findFirst({
    where: { telegramChatId: chatId },
    include: { tenant: { select: { name: true } } },
  })
}

async function sendMessage(botToken: string, chatId: string, text: string): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
    })
  } catch (err) {
    logger.warn({ err, chatId }, 'Failed to send Telegram message')
  }
}

export { telegramWebhook }
