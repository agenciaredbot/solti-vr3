/**
 * Evolution Adapter — WhatsApp via Evolution API v2
 *
 * Gotchas:
 * - Hosted on VPS (EasyPanel), NOT localhost
 * - Auth: apikey header (not Authorization)
 * - Send text: POST /message/sendText/{instance} with {number, text}
 * - Connection state: GET /instance/connectionState/{instance}
 *   → returns {instance: {state: "open"|"connecting"|"close"}}
 * - Fetch messages: POST /chat/findMessages/{instance} with JSON body
 *   → returns {messages: {total, records: [...]}}
 * - Settings: POST /settings/set/{instance}
 * - Create: POST /instance/create with {instanceName, integration, qrcode}
 * - QR: GET /instance/connect/{instance} → {base64: "data:image/png;..."}
 * - SHARED with Redbot production — Solti uses solti- prefix
 */

import type { ServiceAdapter, AdapterResult } from './adapter.interface.js'

export class EvolutionAdapter implements ServiceAdapter {
  readonly name = 'evolution'

  private getBaseUrl(): string {
    // Base URL stored in credential metadata or env
    return (process.env.EVOLUTION_API_URL || 'https://evolution-api-evolution-api.evfgat.easypanel.host').replace(/\/$/, '')
  }

  async testConnection(apiKey: string): Promise<boolean> {
    const baseUrl = this.getBaseUrl()
    const res = await fetch(`${baseUrl}/instance/fetchInstances`, {
      headers: { apikey: apiKey },
    })
    return res.ok
  }

  /** Normalize: routes send instanceName, some callers send instance */
  private inst(params: Record<string, unknown>): string {
    return (params.instanceName || params.instance || params.name) as string
  }

  async execute(apiKey: string, action: string, params: Record<string, unknown>): Promise<AdapterResult> {
    switch (action) {
      case 'send_text':
        return this.sendText(apiKey, params)
      case 'send_media':
        return this.sendMedia(apiKey, params)
      case 'create_instance':
        return this.createInstance(apiKey, params)
      case 'connection_state':
        return this.connectionState(apiKey, params)
      case 'get_qr':
        return this.getQr(apiKey, params)
      case 'find_messages':
        return this.findMessages(apiKey, params)
      case 'list_instances':
        return this.listInstances(apiKey)
      case 'delete_instance':
        return this.deleteInstance(apiKey, params)
      case 'set_settings':
        return this.setSettings(apiKey, params)
      case 'set_webhook':
        return this.setWebhook(apiKey, params)
      default:
        throw new Error(`Unknown Evolution action: ${action}`)
    }
  }

  getActions(): string[] {
    return ['send_text', 'send_media', 'create_instance', 'connection_state', 'get_qr',
            'find_messages', 'list_instances', 'delete_instance', 'set_settings', 'set_webhook']
  }

  private async sendText(apiKey: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const baseUrl = this.getBaseUrl()
    const instance = this.inst(params)
    const body = { number: params.number as string, text: params.text as string }

    const res = await fetch(`${baseUrl}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Evolution send failed: ${res.status} ${err.slice(0, 200)}`)
    }

    const data = await res.json() as any
    return {
      success: true,
      data: { messageId: data.key?.id, status: data.status },
      cost: 0,
      description: `WhatsApp sent to ${params.number} via ${instance}`,
    }
  }

  private async sendMedia(apiKey: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const baseUrl = this.getBaseUrl()
    const instance = this.inst(params)
    const mediaType = params.mediaType as string // image, video, document, audio
    const body: Record<string, unknown> = {
      number: params.number as string,
      mediatype: mediaType,
      media: params.mediaUrl as string,
    }
    if (params.caption) body.caption = params.caption as string
    if (params.fileName) body.fileName = params.fileName as string

    const res = await fetch(`${baseUrl}/message/sendMedia/${instance}`, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Evolution sendMedia failed: ${res.status} ${err.slice(0, 200)}`)
    }

    const data = await res.json() as any
    return {
      success: true,
      data: { messageId: data.key?.id, status: data.status },
      cost: 0,
      description: `WhatsApp ${mediaType} sent to ${params.number} via ${instance}`,
    }
  }

  private async createInstance(apiKey: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const baseUrl = this.getBaseUrl()
    const body: Record<string, unknown> = {
      instanceName: this.inst(params),
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
    }

    if (params.webhookUrl) {
      body.webhook = {
        url: params.webhookUrl,
        byEvents: false,
        base64: false,
        events: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'CONNECTION_UPDATE',
          'QRCODE_UPDATED',
          'SEND_MESSAGE',
        ],
      }
    }

    const res = await fetch(`${baseUrl}/instance/create`, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Evolution create failed: ${res.status} ${err.slice(0, 200)}`)
    }

    const data = await res.json() as any

    // Get QR code
    const qrRes = await fetch(`${baseUrl}/instance/connect/${params.name}`, {
      headers: { apikey: apiKey },
    })
    const qrData = qrRes.ok ? await qrRes.json() as any : {}

    return {
      success: true,
      data: {
        instance: params.name,
        qrCode: qrData.base64 || '',
        qrUrl: `${baseUrl}/instance/connect/${params.name}`,
      },
      cost: 0,
      description: `Instance ${params.name} created`,
    }
  }

  private async connectionState(apiKey: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const baseUrl = this.getBaseUrl()
    const instance = this.inst(params)

    const res = await fetch(`${baseUrl}/instance/connectionState/${instance}`, {
      headers: { apikey: apiKey },
    })

    if (!res.ok) throw new Error(`Evolution state failed: ${res.status}`)

    const data = await res.json() as any
    // Response: {instance: {instanceName: "...", state: "open"}}
    const state = data.instance?.state || 'unknown'

    return {
      success: true,
      data: { instance, state },
      cost: 0,
      description: `${instance}: ${state}`,
    }
  }

  private async getQr(apiKey: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const baseUrl = this.getBaseUrl()
    const instance = this.inst(params)

    const res = await fetch(`${baseUrl}/instance/connect/${instance}`, {
      headers: { apikey: apiKey },
    })

    if (!res.ok) throw new Error(`Evolution QR failed: ${res.status}`)

    const data = await res.json() as any
    return {
      success: true,
      data: { base64: data.base64 || '' },
      cost: 0,
      description: `QR code for ${instance}`,
    }
  }

  private async findMessages(apiKey: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const baseUrl = this.getBaseUrl()
    const instance = this.inst(params)

    // POST with JSON body (NOT GET)
    const body: Record<string, unknown> = { limit: (params.limit as number) || 20 }
    if (params.where) {
      body.where = params.where
    } else if (params.remoteJid) {
      body.where = { key: { remoteJid: params.remoteJid as string } }
    }

    const res = await fetch(`${baseUrl}/chat/findMessages/${instance}`, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) throw new Error(`Evolution messages failed: ${res.status}`)

    const data = await res.json() as any
    // Response: {messages: {total, pages, records: [...]}}
    const records = data.messages?.records || []

    return {
      success: true,
      data: { messages: records, total: data.messages?.total || records.length },
      cost: 0,
      description: `${records.length} messages from ${instance}`,
    }
  }

  private async listInstances(apiKey: string): Promise<AdapterResult> {
    const baseUrl = this.getBaseUrl()

    const res = await fetch(`${baseUrl}/instance/fetchInstances`, {
      headers: { apikey: apiKey },
    })

    if (!res.ok) throw new Error(`Evolution list failed: ${res.status}`)

    const data = await res.json() as any[]
    return {
      success: true,
      data: { instances: data, total: data.length },
      cost: 0,
      description: `${data.length} instances found`,
    }
  }

  private async deleteInstance(apiKey: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const baseUrl = this.getBaseUrl()
    const instance = this.inst(params)

    const res = await fetch(`${baseUrl}/instance/delete/${instance}`, {
      method: 'DELETE',
      headers: { apikey: apiKey },
    })

    if (!res.ok) throw new Error(`Evolution delete failed: ${res.status}`)

    return {
      success: true,
      data: { deleted: instance },
      cost: 0,
      description: `Instance ${instance} deleted`,
    }
  }

  private async setSettings(apiKey: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const baseUrl = this.getBaseUrl()
    const instance = this.inst(params)
    const { instance: _, ...settings } = params

    // POST /settings/set/{instance} (NOT PUT /instance/settings/)
    const res = await fetch(`${baseUrl}/settings/set/${instance}`, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })

    if (!res.ok) throw new Error(`Evolution settings failed: ${res.status}`)

    const data = await res.json()
    return {
      success: true,
      data,
      cost: 0,
      description: `Settings updated for ${instance}`,
    }
  }

  private async setWebhook(apiKey: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const baseUrl = this.getBaseUrl()
    const instance = this.inst(params)
    const url = params.webhookUrl as string

    const res = await fetch(`${baseUrl}/webhook/set/${instance}`, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url,
          webhookByEvents: false,
          webhookBase64: false,
          events: [
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'CONNECTION_UPDATE',
            'QRCODE_UPDATED',
          ],
        },
      }),
    })

    if (!res.ok) throw new Error(`Evolution webhook set failed: ${res.status}`)

    const data = await res.json()
    return {
      success: true,
      data,
      cost: 0,
      description: `Webhook configured for ${instance}`,
    }
  }
}
