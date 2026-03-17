#!/usr/bin/env node
/**
 * Solti MCP Server — Exposes Hub capabilities as MCP tools for Claude Code.
 *
 * Transport: stdio (Claude Code spawns this process)
 * Auth: Uses SOLTI_API_KEY env var to call Hub REST API
 *
 * Usage in claude_desktop_config.json or .claude/settings.json:
 * {
 *   "mcpServers": {
 *     "solti": {
 *       "command": "npx",
 *       "args": ["tsx", "/path/to/hub/src/mcp/server.ts"],
 *       "env": {
 *         "SOLTI_HUB_URL": "http://localhost:4000",
 *         "SOLTI_API_KEY": "sk_solti_..."
 *       }
 *     }
 *   }
 * }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

// ═══ Hub HTTP Client ═══
const HUB_URL = (process.env.SOLTI_HUB_URL || 'http://localhost:4000').replace(/\/$/, '')
const API_KEY = process.env.SOLTI_API_KEY || ''
const API_BASE = `${HUB_URL}/api/v1`

async function hubRequest(method: string, path: string, body?: any): Promise<any> {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    method,
    headers: {
      'X-Api-Key': API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { error: text, status: res.status }
  }
}

// ═══ MCP Server Setup ═══
const server = new McpServer({
  name: 'solti-hub',
  version: '1.0.0',
})

// ════════════════════════════════════════════
// CRM TOOLS
// ════════════════════════════════════════════

server.tool(
  'solti_contacts_list',
  'List contacts from the CRM with optional filters',
  {
    limit: z.number().optional().describe('Max contacts to return (default 20)'),
    offset: z.number().optional().describe('Offset for pagination'),
    status: z.string().optional().describe('Filter by status: NEW, CONTACTED, REPLIED, QUALIFIED, CUSTOMER, LOST'),
    source: z.string().optional().describe('Filter by source: google_maps, linkedin, instagram, manual'),
    sortBy: z.string().optional().describe('Sort field: score, created_at, firstName'),
    sortDir: z.enum(['asc', 'desc']).optional().describe('Sort direction'),
  },
  async (params) => {
    const query = new URLSearchParams()
    if (params.limit) query.set('limit', String(params.limit))
    if (params.offset) query.set('offset', String(params.offset))
    if (params.status) query.set('status', params.status)
    if (params.source) query.set('source', params.source)
    if (params.sortBy) query.set('sortBy', params.sortBy)
    if (params.sortDir) query.set('sortDir', params.sortDir)

    const qs = query.toString()
    const result = await hubRequest('GET', `/contacts${qs ? '?' + qs : ''}`)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'solti_contacts_search',
  'Search contacts by name, email, phone, or city',
  {
    query: z.string().describe('Search query'),
    status: z.string().optional().describe('Filter by status'),
    minScore: z.number().optional().describe('Minimum ICP score'),
    limit: z.number().optional().describe('Max results (default 20)'),
  },
  async (params) => {
    const result = await hubRequest('POST', '/contacts/search', {
      query: params.query,
      status: params.status,
      minScore: params.minScore,
      limit: params.limit,
    })
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'solti_contacts_create',
  'Create a new contact in the CRM',
  {
    firstName: z.string().describe('First name or company name'),
    lastName: z.string().optional().describe('Last name'),
    email: z.string().optional().describe('Email address'),
    phone: z.string().optional().describe('Phone number'),
    whatsapp: z.string().optional().describe('WhatsApp number'),
    city: z.string().optional().describe('City'),
    country: z.string().optional().describe('Country (default: Colombia)'),
    source: z.string().optional().describe('Lead source'),
    score: z.number().optional().describe('ICP score 0-100'),
    website: z.string().optional().describe('Website URL'),
    notes: z.string().optional().describe('Notes about the contact'),
  },
  async (params) => {
    const result = await hubRequest('POST', '/contacts', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'solti_contacts_update',
  'Update an existing contact',
  {
    id: z.string().describe('Contact UUID'),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    status: z.string().optional().describe('NEW, CONTACTED, REPLIED, QUALIFIED, CUSTOMER, LOST'),
    score: z.number().optional(),
    notes: z.string().optional(),
  },
  async (params) => {
    const { id, ...body } = params
    const result = await hubRequest('PATCH', `/contacts/${id}`, body)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'solti_contacts_import',
  'Bulk import contacts from a JSON array',
  {
    contacts: z.string().describe('JSON string of contacts array [{firstName, email, ...}]'),
    source: z.string().optional().describe('Source label for all contacts'),
    skipDuplicates: z.boolean().optional().describe('Skip contacts with existing email (default true)'),
  },
  async (params) => {
    let contacts: any[]
    try {
      contacts = JSON.parse(params.contacts)
    } catch {
      return { content: [{ type: 'text' as const, text: 'Error: contacts must be valid JSON array' }] }
    }
    const result = await hubRequest('POST', '/contacts/bulk', {
      contacts,
      source: params.source,
      skipDuplicates: params.skipDuplicates ?? true,
    })
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

// ════════════════════════════════════════════
// SERVICE EXECUTION TOOLS
// ════════════════════════════════════════════

server.tool(
  'solti_service_execute',
  `Execute an external service action.

Services & actions:
- apify: scrapeGoogleMaps, etc.
- brevo: send_email, etc.
- evolution: sendText, etc.
- getlate: 6 actions — list_accounts, create_post, presign_media, list_posts, update_post, publish_post

═══ getLate Field Reference (IMPORTANT — use exact field names below) ═══

getlate / create_post:
  params: {
    "content": "Post text here",              ← MUST use "content" (NOT "text")
    "platforms": [{"accountId": "uuid", "platform": "instagram"}],  ← MUST use "platforms" array with {accountId, platform} objects (NOT platformAccountId or platformId)
    "publishNow": true,                        ← optional: publish immediately
    "scheduledFor": "2026-03-20T14:00:00Z",    ← optional: schedule for later (ISO-8601)
    "mediaItems": [{"url": "https://...", "type": "IMAGE"}]  ← optional: attach media (url from presign_media mediaUrl)
  }
  Note: Without publishNow or scheduledFor, post stays as DRAFT.

getlate / presign_media:
  params: {"filename": "photo.jpg", "contentType": "image/jpeg"}
  Returns: {"url": "<upload PUT target>", "mediaUrl": "<public URL to use in create_post mediaItems>"}

getlate / update_post:
  params: {"postId": "uuid", "content?": "new text", "status?": "DRAFT", "mediaItems?": [...]}

getlate / publish_post:
  params: {"postId": "uuid"}

getlate / list_accounts:
  params: {} (no params needed)

getlate / list_posts:
  params: {} (or optional filters)
`,
  {
    service: z.enum(['apify', 'brevo', 'evolution', 'getlate']).describe(
      'Service to call. getlate has 6 actions: list_accounts, create_post, presign_media, list_posts, update_post, publish_post'
    ),
    action: z.string().describe(
      'Action to execute. Examples: apify→scrapeGoogleMaps, brevo→send_email, evolution→sendText, getlate→create_post/presign_media/list_accounts/list_posts/update_post/publish_post'
    ),
    params: z.string().describe(
      'JSON string of action parameters. For getlate create_post use: {"content":"...","platforms":[{"accountId":"...","platform":"instagram"}]} — see tool description for full field reference'
    ),
  },
  async (toolParams) => {
    let params: any
    try {
      params = JSON.parse(toolParams.params)
    } catch {
      return { content: [{ type: 'text' as const, text: 'Error: params must be valid JSON' }] }
    }
    const result = await hubRequest('POST', '/services/execute', {
      service: toolParams.service,
      action: toolParams.action,
      params,
    })
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'solti_service_list',
  'List all available services and their actions. Services: apify, brevo, evolution, getlate (6 actions: list_accounts, create_post, presign_media, list_posts, update_post, publish_post)',
  {},
  async () => {
    const result = await hubRequest('GET', '/services')
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

// ════════════════════════════════════════════
// CAMPAIGN TOOLS
// ════════════════════════════════════════════

server.tool(
  'solti_campaigns_list',
  'List all campaigns',
  {
    status: z.string().optional().describe('Filter: DRAFT, SCHEDULED, SENDING, PAUSED, COMPLETED, FAILED'),
  },
  async (params) => {
    const qs = params.status ? `?status=${params.status}` : ''
    const result = await hubRequest('GET', `/campaigns${qs}`)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'solti_campaigns_create',
  'Create a new outreach campaign',
  {
    name: z.string().describe('Campaign name'),
    type: z.enum(['EMAIL', 'WHATSAPP', 'INSTAGRAM_DM', 'LINKEDIN_DM', 'SMS']).describe('Channel'),
    subject: z.string().optional().describe('Email subject (for EMAIL type)'),
    body: z.string().optional().describe('Message body or HTML'),
    listId: z.string().optional().describe('Contact list ID'),
  },
  async (params) => {
    const result = await hubRequest('POST', '/campaigns', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'solti_campaigns_launch',
  'Launch a campaign (start sending)',
  {
    id: z.string().describe('Campaign UUID'),
  },
  async (params) => {
    const result = await hubRequest('POST', `/campaigns/${params.id}/launch`)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'solti_campaigns_get',
  'Get campaign details including steps, stats, and recipient summary',
  {
    id: z.string().describe('Campaign UUID'),
  },
  async (params) => {
    const result = await hubRequest('GET', `/campaigns/${params.id}`)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'solti_campaigns_stats',
  'Get real-time campaign stats (sent, delivered, read, replied, failed, pending)',
  {
    id: z.string().describe('Campaign UUID'),
  },
  async (params) => {
    const result = await hubRequest('GET', `/campaigns/${params.id}/stats`)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'solti_campaigns_recipients',
  'List campaign recipients with their delivery status',
  {
    id: z.string().describe('Campaign UUID'),
    status: z.string().optional().describe('Filter: PENDING, QUEUED, SENT, DELIVERED, READ, REPLIED, FAILED, SKIPPED'),
    limit: z.number().optional().describe('Max results (default 50)'),
    offset: z.number().optional().describe('Pagination offset'),
  },
  async (params) => {
    const query = new URLSearchParams()
    if (params.status) query.set('status', params.status)
    if (params.limit) query.set('limit', String(params.limit))
    if (params.offset) query.set('offset', String(params.offset))
    const qs = query.toString()
    const result = await hubRequest('GET', `/campaigns/${params.id}/recipients${qs ? '?' + qs : ''}`)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'solti_campaigns_events',
  'Get campaign event timeline (sent, delivered, read, replied, paused, etc.)',
  {
    id: z.string().describe('Campaign UUID'),
    limit: z.number().optional().describe('Max events (default 50)'),
  },
  async (params) => {
    const qs = params.limit ? `?limit=${params.limit}` : ''
    const result = await hubRequest('GET', `/campaigns/${params.id}/events${qs}`)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'solti_campaigns_launch_whatsapp',
  `Launch a WhatsApp mass campaign with rate limiting, instance rotation, and anti-ban protections.

Required: instanceIds (1-2 connected WhatsApp instances).
Optional recipient config: listId (contact list), filters (tags, scoreMin, status, city), or both.
If no recipientConfig, uses campaign's existing listId.

Rate limit defaults: 5s delay, 60/hr/instance, 500/day/instance, 8am-8pm window.`,
  {
    id: z.string().describe('Campaign UUID (must be DRAFT or SCHEDULED)'),
    instanceIds: z.string().describe('JSON array of 1-2 WhatsApp instance IDs, e.g. ["uuid1","uuid2"]'),
    delaySeconds: z.number().optional().describe('Delay between messages in seconds (3-15, default 5)'),
    maxPerHourPerInstance: z.number().optional().describe('Max messages per hour per instance (30-80, default 60)'),
    maxPerDayPerInstance: z.number().optional().describe('Max messages per day per instance (100-1000, default 500)'),
    sendingWindowStart: z.number().optional().describe('Hour to start sending (0-23, default 8)'),
    sendingWindowEnd: z.number().optional().describe('Hour to stop sending (0-23, default 20)'),
    maxConsecutiveFailures: z.number().optional().describe('Auto-pause after N consecutive failures (default 3)'),
    timezone: z.string().optional().describe('Timezone for sending window (default America/Bogota)'),
    recipientConfig: z.string().optional().describe('JSON: {"listId":"uuid","filters":{"tags":["vip"],"scoreMin":50,"status":["NEW","CONTACTED"],"city":"Bogota"}}'),
  },
  async (params) => {
    let instanceIds: string[]
    try {
      instanceIds = JSON.parse(params.instanceIds)
    } catch {
      return { content: [{ type: 'text' as const, text: 'Error: instanceIds must be valid JSON array' }] }
    }

    const body: any = { instanceIds }
    if (params.delaySeconds) body.delaySeconds = params.delaySeconds
    if (params.maxPerHourPerInstance) body.maxPerHourPerInstance = params.maxPerHourPerInstance
    if (params.maxPerDayPerInstance) body.maxPerDayPerInstance = params.maxPerDayPerInstance
    if (params.sendingWindowStart !== undefined) body.sendingWindowStart = params.sendingWindowStart
    if (params.sendingWindowEnd !== undefined) body.sendingWindowEnd = params.sendingWindowEnd
    if (params.maxConsecutiveFailures) body.maxConsecutiveFailures = params.maxConsecutiveFailures
    if (params.timezone) body.timezone = params.timezone
    if (params.recipientConfig) {
      try {
        body.recipientConfig = JSON.parse(params.recipientConfig)
      } catch {
        return { content: [{ type: 'text' as const, text: 'Error: recipientConfig must be valid JSON' }] }
      }
    }

    const result = await hubRequest('POST', `/campaigns/${params.id}/launch-whatsapp`, body)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'solti_campaigns_pause',
  'Pause an active campaign',
  {
    id: z.string().describe('Campaign UUID'),
  },
  async (params) => {
    const result = await hubRequest('POST', `/campaigns/${params.id}/pause`)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'solti_campaigns_resume',
  'Resume a paused WhatsApp campaign (re-enqueues pending recipients)',
  {
    id: z.string().describe('Campaign UUID (must be PAUSED)'),
  },
  async (params) => {
    const result = await hubRequest('POST', `/campaigns/${params.id}/resume`)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

// ════════════════════════════════════════════
// MEDIA TOOLS
// ════════════════════════════════════════════

server.tool(
  'solti_media_list',
  'List uploaded media files (images, videos, documents, audio) for campaigns',
  {
    limit: z.number().optional().describe('Max results (default 50)'),
    offset: z.number().optional().describe('Pagination offset'),
  },
  async (params) => {
    const query = new URLSearchParams()
    if (params.limit) query.set('limit', String(params.limit))
    if (params.offset) query.set('offset', String(params.offset))
    const qs = query.toString()
    const result = await hubRequest('GET', `/media${qs ? '?' + qs : ''}`)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'solti_media_delete',
  'Delete a media file from storage',
  {
    id: z.string().describe('Media file UUID'),
  },
  async (params) => {
    const result = await hubRequest('DELETE', `/media/${params.id}`)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

// ════════════════════════════════════════════
// NOTIFICATION TOOLS
// ════════════════════════════════════════════

server.tool(
  'solti_notifications_list',
  'List dashboard notifications (campaigns completed, instances disconnected, leads replied, etc.)',
  {
    limit: z.number().optional().describe('Max results (default 20)'),
    offset: z.number().optional().describe('Pagination offset'),
    unread: z.boolean().optional().describe('Only unread notifications'),
  },
  async (params) => {
    const query = new URLSearchParams()
    if (params.limit) query.set('limit', String(params.limit))
    if (params.offset) query.set('offset', String(params.offset))
    if (params.unread) query.set('unread', 'true')
    const qs = query.toString()
    const result = await hubRequest('GET', `/notifications${qs ? '?' + qs : ''}`)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'solti_notifications_unread_count',
  'Get count of unread notifications (for badge)',
  {},
  async () => {
    const result = await hubRequest('GET', '/notifications/unread-count')
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'solti_notifications_mark_read',
  'Mark notifications as read (one or all)',
  {
    id: z.string().optional().describe('Notification UUID (omit to mark ALL as read)'),
  },
  async (params) => {
    const result = params.id
      ? await hubRequest('PATCH', `/notifications/${params.id}/read`)
      : await hubRequest('PATCH', '/notifications/read-all')
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

// ════════════════════════════════════════════
// CREDIT TOOLS
// ════════════════════════════════════════════

server.tool(
  'solti_credits_balance',
  'Get current credit balance (plan credits, purchased, used, available)',
  {},
  async () => {
    const result = await hubRequest('GET', '/credits/balance')
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'solti_credits_transactions',
  'Get credit transaction history (deductions, purchases, resets, bonuses)',
  {
    limit: z.number().optional().describe('Max results (default 50)'),
    type: z.string().optional().describe('Filter: deduct, purchase, plan_reset, refund, bonus'),
  },
  async (params) => {
    const query = new URLSearchParams()
    if (params.limit) query.set('limit', String(params.limit))
    if (params.type) query.set('type', params.type)
    const qs = query.toString()
    const result = await hubRequest('GET', `/credits/transactions${qs ? '?' + qs : ''}`)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'solti_credits_packages',
  'Get available credit packages and plan credit allocations',
  {},
  async () => {
    const result = await hubRequest('GET', '/credits/packages')
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

// ════════════════════════════════════════════
// WHATSAPP TOOLS
// ════════════════════════════════════════════

server.tool(
  'solti_whatsapp_instances',
  'List WhatsApp instances and their connection status',
  {},
  async () => {
    const result = await hubRequest('GET', '/whatsapp/instances')
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'solti_whatsapp_send',
  'Send a WhatsApp message',
  {
    instanceName: z.string().describe('WhatsApp instance name'),
    to: z.string().describe('Phone number (with country code, e.g., 573001234567)'),
    message: z.string().describe('Text message to send'),
  },
  async (params) => {
    const result = await hubRequest('POST', '/whatsapp/send', {
      instanceName: params.instanceName,
      to: params.to,
      message: params.message,
    })
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'solti_whatsapp_qr',
  'Get QR code for WhatsApp instance (to scan and connect)',
  {
    instanceName: z.string().describe('WhatsApp instance name'),
  },
  async (params) => {
    const result = await hubRequest('GET', `/whatsapp/instances/${params.instanceName}/qr`)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

// ════════════════════════════════════════════
// ANALYTICS TOOLS
// ════════════════════════════════════════════

server.tool(
  'solti_dashboard',
  'Get dashboard summary: contacts, campaigns, credits, today metrics',
  {},
  async () => {
    const result = await hubRequest('GET', '/analytics/dashboard')
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'solti_analytics_usage',
  'Get API usage logs (service calls, costs)',
  {
    limit: z.number().optional().describe('Max logs (default 50)'),
    service: z.string().optional().describe('Filter by service name'),
  },
  async (params) => {
    const query = new URLSearchParams()
    if (params.limit) query.set('limit', String(params.limit))
    if (params.service) query.set('service', params.service)
    const qs = query.toString()
    const result = await hubRequest('GET', `/analytics/usage${qs ? '?' + qs : ''}`)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'solti_analytics_metrics',
  'Get daily metrics for trend analysis',
  {
    days: z.number().optional().describe('Number of days (default 30)'),
  },
  async (params) => {
    const qs = params.days ? `?days=${params.days}` : ''
    const result = await hubRequest('GET', `/analytics/metrics${qs}`)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

// ════════════════════════════════════════════
// CREDENTIAL / VAULT TOOLS
// ════════════════════════════════════════════

server.tool(
  'solti_credentials_list',
  'List all stored API credentials (keys are masked)',
  {},
  async () => {
    const result = await hubRequest('GET', '/credentials')
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'solti_credentials_store',
  'Store or update an API credential in the vault',
  {
    service: z.string().describe('Service name: apify, brevo, evolution, getlate, etc.'),
    apiKey: z.string().describe('API key or token'),
    baseUrl: z.string().optional().describe('Custom API base URL'),
    label: z.string().optional().describe('Human-readable label'),
  },
  async (params) => {
    const result = await hubRequest('POST', '/credentials', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

// ════════════════════════════════════════════
// JOB MANAGEMENT TOOLS
// ════════════════════════════════════════════

server.tool(
  'solti_jobs_list',
  'List async jobs (scraping runs, campaign sends)',
  {
    status: z.string().optional().describe('Filter: PENDING, RUNNING, COMPLETED, FAILED'),
    limit: z.number().optional(),
  },
  async (params) => {
    const query = new URLSearchParams()
    if (params.status) query.set('status', params.status)
    if (params.limit) query.set('limit', String(params.limit))
    const qs = query.toString()
    const result = await hubRequest('GET', `/jobs${qs ? '?' + qs : ''}`)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'solti_jobs_check',
  'Check status of a specific job (with Apify run status)',
  {
    id: z.string().describe('Job UUID'),
  },
  async (params) => {
    const result = await hubRequest('GET', `/jobs/${params.id}`)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

// ════════════════════════════════════════════
// START SERVER
// ════════════════════════════════════════════

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('✅ Solti MCP Server connected via stdio')
  console.error(`   Hub: ${HUB_URL}`)
  console.error(`   Tools: 36 registered`)
}

main().catch((err) => {
  console.error('❌ MCP Server failed to start:', err)
  process.exit(1)
})
