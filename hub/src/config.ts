/**
 * Environment config with Zod validation.
 * Fails fast at startup if required vars are missing.
 */

import { z } from 'zod'

const envSchema = z.object({
  // Supabase
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_KEY: z.string().min(1),

  // Vault
  VAULT_MASTER_KEY: z.string().min(32, 'Generate with: openssl rand -hex 32'),

  // Hub
  PORT: z.coerce.number().default(4000),
  MCP_PORT: z.coerce.number().default(4001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.string().default('info'),

  // Optional — Redis (for BullMQ, not needed yet)
  REDIS_URL: z.string().optional(),

  // Optional — Telegram
  TELEGRAM_BOT_TOKEN: z.string().optional(),

  // Optional — Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
})

export type Config = z.infer<typeof envSchema>

let _config: Config | null = null

export function getConfig(): Config {
  if (!_config) {
    const result = envSchema.safeParse(process.env)
    if (!result.success) {
      const missing = result.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n')
      console.error(`❌ Missing environment variables:\n${missing}`)
      process.exit(1)
    }
    _config = result.data
  }
  return _config
}
