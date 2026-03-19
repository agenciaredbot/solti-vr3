/**
 * Solti VR3 — Service Hub
 *
 * Hono app entry point.
 * Serves REST API for Dashboard + MCP for Plugin.
 */

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { getConfig } from './config.js'
import { logger } from './lib/logger.js'
import { AppError, AuthError } from './lib/errors.js'
import { authMiddleware } from './auth/middleware.js'
import { contactRoutes } from './api/contacts.routes.js'
import { serviceRoutes } from './api/services.routes.js'
import { whatsappRoutes } from './api/whatsapp.routes.js'
import { campaignRoutes } from './api/campaigns.routes.js'
import { credentialRoutes } from './api/credentials.routes.js'
import { jobRoutes } from './api/jobs.routes.js'
import { analyticsRoutes } from './api/analytics.routes.js'
import { listRoutes } from './api/lists.routes.js'
import { mediaRoutes } from './api/media.routes.js'
import { notificationRoutes } from './api/notifications.routes.js'
import { creditRoutes } from './api/credits.routes.js'
import { billingRoutes } from './api/billing.routes.js'
import { scrapingRoutes } from './api/scraping.routes.js'
import { tagRoutes } from './api/tags.routes.js'
import { evolutionWebhook } from './webhooks/evolution.webhook.js'
import { brevoWebhook } from './webhooks/brevo.webhook.js'
import { telegramWebhook } from './webhooks/telegram.webhook.js'
import { stripeWebhook } from './webhooks/stripe.webhook.js'
import { startScheduler } from './jobs/scheduler.js'

// Validate env on startup
const config = getConfig()

const app = new Hono()

// ═══ Global middleware ═══
app.use('*', honoLogger())
app.use('*', cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'https://*.vercel.app'],
  credentials: true,
}))

// ═══ Health check (no auth) ═══
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    version: '1.0.0',
    env: config.NODE_ENV,
    timestamp: new Date().toISOString(),
  })
})

// ═══ Auth-protected routes ═══
const api = new Hono()
api.use('*', authMiddleware)

api.route('/contacts', contactRoutes)
api.route('/services', serviceRoutes)
api.route('/whatsapp', whatsappRoutes)
api.route('/campaigns', campaignRoutes)
api.route('/credentials', credentialRoutes)
api.route('/jobs', jobRoutes)
api.route('/analytics', analyticsRoutes)
api.route('/lists', listRoutes)
api.route('/media', mediaRoutes)
api.route('/notifications', notificationRoutes)
api.route('/credits', creditRoutes)
api.route('/billing', billingRoutes)
api.route('/scraping', scrapingRoutes)
api.route('/tags', tagRoutes)

app.route('/api/v1', api)

// ═══ Webhooks (no auth — verified by signature/instanceName) ═══
app.route('/webhooks/evolution', evolutionWebhook)
app.route('/webhooks/brevo', brevoWebhook)
app.route('/webhooks/telegram', telegramWebhook)
app.route('/webhooks/stripe', stripeWebhook)

// ═══ Error handler ═══
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message, code: err.code }, err.statusCode as any)
  }

  logger.error({ err }, 'Unhandled error')
  const isDev = process.env.NODE_ENV !== 'production'
  return c.json(
    { error: isDev ? err.message : 'Internal server error', code: 'INTERNAL_ERROR' },
    500
  )
})

// ═══ 404 ═══
app.notFound((c) => {
  return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
})

// ═══ Start server ═══
const port = config.PORT

serve({
  fetch: app.fetch,
  port,
}, (info) => {
  logger.info(`🚀 Solti Hub running on http://localhost:${info.port}`)
  logger.info(`   Environment: ${config.NODE_ENV}`)

  // Start campaign scheduler (checks every 5 minutes)
  startScheduler(5 * 60 * 1000)

  // Start message poller (fallback for Evolution webhook bug)
  import('./jobs/message-poller.js').then(({ startMessagePoller }) => {
    startMessagePoller()
  }).catch(err => logger.warn({ err }, 'Failed to start message poller'))
})

export default app
