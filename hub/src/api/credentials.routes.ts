/**
 * Credentials API — Manage tenant API credentials (Vault).
 *
 * GET    /           List credentials (without values)
 * POST   /           Store a new credential
 * PUT    /:service   Update a credential
 * DELETE /:service   Delete a credential
 * POST   /:service/test  Test a credential
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { getTenant } from '../auth/middleware.js'
import {
  setCredential,
  listCredentials,
  deleteCredential,
  markCredentialValidity,
  type ServiceName,
} from '../services/vault.service.js'
import { testService } from '../router/service-router.js'
import { logger } from '../lib/logger.js'

const credentials = new Hono()

const credentialSchema = z.object({
  service: z.enum(['apify', 'brevo', 'evolution', 'getlate', 'phantombuster']),
  apiKey: z.string().min(1),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
})

// ═══ GET / — List all credentials ═══
credentials.get('/', async (c) => {
  const { tenantId } = getTenant(c)
  const creds = await listCredentials(tenantId)
  return c.json({ data: creds })
})

// ═══ POST / — Store credential ═══
credentials.post('/', async (c) => {
  const { tenantId } = getTenant(c)
  const body = credentialSchema.parse(await c.req.json())

  const cred = await setCredential(
    tenantId,
    body.service,
    body.apiKey,
    body.metadata,
  )

  logger.info({ tenantId, service: body.service }, 'Credential stored')
  return c.json({ data: cred }, 201)
})

// ═══ PUT /:service — Update credential ═══
credentials.put('/:service', async (c) => {
  const { tenantId } = getTenant(c)
  const service = c.req.param('service') as ServiceName
  const { apiKey, metadata = {} } = z.object({
    apiKey: z.string().min(1),
    metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
  }).parse(await c.req.json())

  const cred = await setCredential(tenantId, service, apiKey, metadata)

  logger.info({ tenantId, service }, 'Credential updated')
  return c.json({ data: cred })
})

// ═══ DELETE /:service — Delete credential ═══
credentials.delete('/:service', async (c) => {
  const { tenantId } = getTenant(c)
  const service = c.req.param('service') as ServiceName

  await deleteCredential(tenantId, service)

  logger.info({ tenantId, service }, 'Credential deleted')
  return c.json({ success: true })
})

// ═══ POST /:service/test — Test credential ═══
credentials.post('/:service/test', async (c) => {
  const { tenantId } = getTenant(c)
  const service = c.req.param('service') as ServiceName

  const valid = await testService(tenantId, service)
  await markCredentialValidity(tenantId, service, valid)

  return c.json({ service, valid })
})

export { credentials as credentialRoutes }
