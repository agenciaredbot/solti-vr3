/**
 * Services API — Route requests to external service adapters.
 *
 * POST   /execute          Execute a service action
 * POST   /test             Test a service credential
 * GET    /                 List available services
 * GET    /:service/actions  List actions for a service
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { getTenant } from '../auth/middleware.js'
import { routeService, testService, getAvailableServices, getServiceActions } from '../router/service-router.js'
import { logger } from '../lib/logger.js'
import { prisma } from '../lib/prisma.js'

const services = new Hono()

const executeSchema = z.object({
  service: z.enum(['apify', 'brevo', 'evolution', 'getlate']),
  action: z.string().min(1),
  params: z.record(z.unknown()).default({}),
})

// ═══ POST /execute — Execute a service action ═══
services.post('/execute', async (c) => {
  const { tenantId } = getTenant(c)
  const body = executeSchema.parse(await c.req.json())

  const result = await routeService({
    tenantId,
    service: body.service,
    action: body.action,
    params: body.params,
  })

  // Log usage
  await prisma.usageLog.create({
    data: {
      tenantId,
      service: body.service,
      action: body.action,
      realCostUsd: result.cost,
      metadata: { success: result.success, description: result.description },
    },
  }).catch(err => logger.warn({ err }, 'Failed to log usage'))

  return c.json({ data: result })
})

// ═══ POST /test — Test a service credential ═══
services.post('/test', async (c) => {
  const { tenantId } = getTenant(c)
  const { service } = z.object({
    service: z.enum(['apify', 'brevo', 'evolution', 'getlate']),
  }).parse(await c.req.json())

  const valid = await testService(tenantId, service)

  // Mark validity in DB
  await prisma.tenantCredential.updateMany({
    where: { tenantId, service },
    data: { isValid: valid, lastTestedAt: new Date() },
  }).catch(() => {})

  return c.json({ service, valid })
})

// ═══ GET / — List available services ═══
services.get('/', (c) => {
  const available = getAvailableServices()
  const serviceDetails = available.map(name => ({
    name,
    actions: getServiceActions(name),
  }))
  return c.json({ data: serviceDetails })
})

// ═══ GET /:service/actions — List actions for a service ═══
services.get('/:service/actions', (c) => {
  const service = c.req.param('service')
  const actions = getServiceActions(service)
  if (!actions.length) {
    return c.json({ error: `Unknown service: ${service}` }, 404)
  }
  return c.json({ data: actions })
})

export { services as serviceRoutes }
