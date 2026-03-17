/**
 * Seed: creates the redbot-app tenant with its 4 API credentials.
 *
 * Usage: npx tsx prisma/seed.ts
 *
 * Requires VAULT_MASTER_KEY in .env
 */

import { PrismaClient } from '@prisma/client'
import { encrypt } from '../src/lib/crypto.js'
import { randomBytes } from 'crypto'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding Solti-Vr3 database...\n')

  // ═══ 1. Create tenant ═══
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'redbot-app' },
    create: {
      name: 'Redbot — A.I. Para Inmobiliarias',
      slug: 'redbot-app',
      plan: 'pro',
    },
    update: {
      name: 'Redbot — A.I. Para Inmobiliarias',
      plan: 'pro',
    },
  })
  console.log(`✅ Tenant: ${tenant.name} (${tenant.id})`)

  // ═══ 2. Generate plugin API key ═══
  const pluginApiKey = `sk_solti_${randomBytes(24).toString('hex')}`

  await prisma.tenantConfig.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      timezone: 'America/Bogota',
      language: 'es',
      pluginApiKey,
    },
    update: {
      timezone: 'America/Bogota',
      language: 'es',
      // Don't overwrite existing API key on re-seed
    },
  })
  console.log(`✅ Config: timezone=America/Bogota, lang=es`)
  console.log(`🔑 Plugin API Key: ${pluginApiKey}`)
  console.log(`   (save this — used in Plugin's .mcp.json to connect to Hub)\n`)

  // ═══ 3. Store API credentials (encrypted) ═══
  const credentials: Array<{ service: string; key: string; meta?: Record<string, string | number | boolean> }> = [
    {
      service: 'apify',
      key: process.env.APIFY_API_TOKEN || '',
      meta: { note: 'Apify scraping + IG DMs' },
    },
    {
      service: 'brevo',
      key: process.env.BREVO_API_KEY || '',
      meta: { sender_email: 'agencia@theredbot.com', sender_name: 'Redbot', dkim: true, dmarc: true },
    },
    {
      service: 'getlate',
      key: process.env.GETLATE_API_TOKEN || '',
      meta: { base_url: 'https://getlate.dev/api/v1', accounts: 12 },
    },
    {
      service: 'evolution',
      key: process.env.EVOLUTION_API_KEY || '',
      meta: {
        base_url: process.env.EVOLUTION_API_URL || 'https://evolution-api-evolution-api.evfgat.easypanel.host',
        shared_with_redbot: true,
        instance_prefix: 'solti-',
      },
    },
  ]

  for (const cred of credentials) {
    if (!cred.key) {
      console.log(`⏭️  ${cred.service}: no key in env, skipping`)
      continue
    }

    const encryptedValue = encrypt(cred.key, tenant.id)

    await prisma.tenantCredential.upsert({
      where: { tenantId_service: { tenantId: tenant.id, service: cred.service } },
      create: {
        tenantId: tenant.id,
        service: cred.service,
        credType: 'OWN_KEY',
        encryptedValue,
        metadata: cred.meta || {},
        isValid: true,
        lastTestedAt: new Date(),
      },
      update: {
        encryptedValue,
        metadata: cred.meta || {},
        isValid: true,
        lastTestedAt: new Date(),
      },
    })
    console.log(`✅ Credential: ${cred.service} (encrypted + stored)`)
  }

  // ═══ 4. Initialize credit balance ═══
  await prisma.creditBalance.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      planCredits: 100,
      purchasedCredits: 0,
      usedCredits: 0,
      resetsAt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
    },
    update: {},
  })
  console.log(`✅ Credit balance: 100 plan credits`)

  console.log('\n🎉 Seed complete!')
  console.log(`\n📋 Summary:`)
  console.log(`   Tenant: ${tenant.slug} (${tenant.id})`)
  console.log(`   API Key: ${pluginApiKey}`)
  console.log(`   Credentials: ${credentials.filter(c => c.key).length} services encrypted`)
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
