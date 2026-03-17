/**
 * Brevo Adapter — Email campaigns
 *
 * Gotchas:
 * - API key format: xkeysib-... (NOT base64 JWT)
 * - Auth header: api-key (not Authorization Bearer)
 * - Base URL: https://api.brevo.com/v3
 * - Sender must be verified with DKIM + DMARC
 * - Rate limit: ~100ms between sends recommended
 */

import type { ServiceAdapter, AdapterResult } from './adapter.interface.js'

const BASE_URL = 'https://api.brevo.com/v3'

export class BrevoAdapter implements ServiceAdapter {
  readonly name = 'brevo'

  async testConnection(apiKey: string): Promise<boolean> {
    const res = await fetch(`${BASE_URL}/account`, {
      headers: { 'api-key': apiKey },
    })
    return res.ok
  }

  async execute(apiKey: string, action: string, params: Record<string, unknown>): Promise<AdapterResult> {
    switch (action) {
      case 'send_email':
        return this.sendEmail(apiKey, params)
      case 'send_batch':
        return this.sendBatch(apiKey, params)
      case 'get_account':
        return this.getAccount(apiKey)
      case 'list_senders':
        return this.listSenders(apiKey)
      default:
        throw new Error(`Unknown Brevo action: ${action}`)
    }
  }

  getActions(): string[] {
    return ['send_email', 'send_batch', 'get_account', 'list_senders']
  }

  private async sendEmail(apiKey: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const body: Record<string, unknown> = {
      sender: {
        name: (params.senderName as string) || 'Redbot',
        email: (params.senderEmail as string) || 'agencia@theredbot.com',
      },
      to: [{ email: params.to as string, name: (params.toName as string) || (params.to as string) }],
      subject: params.subject as string,
      htmlContent: params.html as string,
    }

    // BCC support
    if (params.bcc) {
      const bccList = Array.isArray(params.bcc) ? params.bcc : [params.bcc]
      body.bcc = bccList.map((e: any) => typeof e === 'string' ? { email: e, name: e } : e)
    }
    // CC support
    if (params.cc) {
      const ccList = Array.isArray(params.cc) ? params.cc : [params.cc]
      body.cc = ccList.map((e: any) => typeof e === 'string' ? { email: e, name: e } : e)
    }

    const res = await fetch(`${BASE_URL}/smtp/email`, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Brevo send failed: ${res.status} ${err.slice(0, 200)}`)
    }

    const data = await res.json() as any
    return {
      success: true,
      data: { messageId: data.messageId },
      cost: 0.001,
      description: `Email sent to ${params.to}`,
    }
  }

  private async sendBatch(apiKey: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const recipients = params.recipients as Array<{ email: string; name?: string; html: string; subject: string }>
    if (!recipients?.length) throw new Error('No recipients provided')

    const results: Array<{ email: string; success: boolean; messageId?: string; error?: string }> = []

    for (const r of recipients.slice(0, 200)) { // Max 200 per batch
      try {
        const body = {
          sender: {
            name: (params.senderName as string) || 'Redbot',
            email: (params.senderEmail as string) || 'agencia@theredbot.com',
          },
          to: [{ email: r.email, name: r.name || r.email }],
          subject: r.subject,
          htmlContent: r.html,
        }

        const res = await fetch(`${BASE_URL}/smtp/email`, {
          method: 'POST',
          headers: {
            'api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        })

        if (res.ok) {
          const data = await res.json() as any
          results.push({ email: r.email, success: true, messageId: data.messageId })
        } else {
          results.push({ email: r.email, success: false, error: `HTTP ${res.status}` })
        }

        // Rate limit: 100ms between sends
        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (e: any) {
        results.push({ email: r.email, success: false, error: e.message })
      }
    }

    const sent = results.filter(r => r.success).length
    return {
      success: true,
      data: { results, sent, failed: results.length - sent },
      cost: sent * 0.001,
      description: `Batch: ${sent}/${results.length} emails sent`,
    }
  }

  private async getAccount(apiKey: string): Promise<AdapterResult> {
    const res = await fetch(`${BASE_URL}/account`, {
      headers: { 'api-key': apiKey },
    })
    if (!res.ok) throw new Error(`Brevo account failed: ${res.status}`)
    const data = await res.json()
    return { success: true, data, cost: 0, description: 'Account info retrieved' }
  }

  private async listSenders(apiKey: string): Promise<AdapterResult> {
    const res = await fetch(`${BASE_URL}/senders`, {
      headers: { 'api-key': apiKey },
    })
    if (!res.ok) throw new Error(`Brevo senders failed: ${res.status}`)
    const data = await res.json()
    return { success: true, data, cost: 0, description: 'Senders listed' }
  }
}
