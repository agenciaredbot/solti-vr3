/**
 * Evolution API Client — Direct calls from Vercel API routes.
 * No Redis, no BullMQ, no intermediary Hub.
 */

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || ''
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || ''

interface EvolutionOptions {
  method?: string
  body?: unknown
}

async function evoFetch(path: string, opts: EvolutionOptions = {}): Promise<any> {
  const res = await fetch(`${EVOLUTION_URL}${path}`, {
    method: opts.method || 'GET',
    headers: {
      apikey: EVOLUTION_KEY,
      'Content-Type': 'application/json',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`[Evolution] ${opts.method || 'GET'} ${path} → ${res.status}: ${text.slice(0, 300)}`)
    throw new Error(`Evolution API error: ${res.status}`)
  }

  return res.json()
}

// ══════ Instance Management ══════

export async function createInstance(name: string, webhookUrl: string) {
  return evoFetch('/instance/create', {
    method: 'POST',
    body: {
      instanceName: name,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      rejectCall: false,
      groupsIgnore: true,
      alwaysOnline: true,
      readMessages: true,
      syncFullHistory: false,
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: [],
      },
    },
  })
}

export async function deleteInstance(name: string) {
  return evoFetch(`/instance/delete/${name}`, { method: 'DELETE' })
}

export async function getConnectionState(name: string) {
  return evoFetch(`/instance/connectionState/${name}`)
}

export async function getQRCode(name: string) {
  return evoFetch(`/instance/connect/${name}`)
}

export async function fetchInstances() {
  return evoFetch('/instance/fetchInstances')
}

export async function setWebhook(name: string, url: string) {
  return evoFetch(`/webhook/set/${name}`, {
    method: 'POST',
    body: {
      webhook: {
        enabled: true,
        url,
        webhookByEvents: false,
        webhookBase64: false,
        events: [],
      },
    },
  })
}

export async function setSettings(name: string, settings: Record<string, unknown>) {
  return evoFetch(`/settings/set/${name}`, {
    method: 'POST',
    body: settings,
  })
}

// ══════ Messaging ══════

export async function sendText(instance: string, number: string, text: string) {
  return evoFetch(`/message/sendText/${instance}`, {
    method: 'POST',
    body: { number, text },
  })
}

export async function findMessages(instance: string, opts: { fromMe?: boolean; limit?: number } = {}) {
  return evoFetch(`/chat/findMessages/${instance}`, {
    method: 'POST',
    body: {
      where: { key: { fromMe: opts.fromMe ?? false } },
      limit: opts.limit || 20,
    },
  })
}

// ══════ Webhook Configuration ══════

export async function findWebhook(name: string) {
  try {
    return await evoFetch(`/webhook/find/${name}`)
  } catch {
    return null
  }
}
