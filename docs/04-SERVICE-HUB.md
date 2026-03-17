# SOLTI VR3 — Service Hub (Multi-Tenant Platform)

> Version: 1.0.0 | Last updated: 2026-03-15

---

## Overview

The Service Hub is the 24/7 backend that:
1. Stores all data (contacts, campaigns, conversations)
2. Manages API credentials per tenant (Tenant Vault)
3. Executes background jobs (scraping, sending, monitoring)
4. Exposes MCP tools for the Plugin
5. Serves REST API for the Dashboard
6. Processes webhooks (WhatsApp, Stripe, etc.)
7. Handles billing, credits, and affiliate tracking

## Tech Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Runtime | Node.js 22 + TypeScript | Same ecosystem as Dashboard |
| Framework | Hono | Lightweight, fast, edge-ready, great TS |
| Database | PostgreSQL (Supabase) | RLS multi-tenancy, managed, proven |
| ORM | Prisma 7 | Type-safe, migrations, schema-first |
| Queue | BullMQ + Redis | Reliable background jobs |
| Auth | Supabase Auth | JWT, RLS integration, OAuth providers |
| MCP Server | Custom HTTP transport | Plugin ↔ Hub connection |
| Encryption | Node.js crypto (AES-256-GCM) | Tenant Vault credential encryption |
| Validation | Zod | Runtime type validation |
| Logging | Pino | Structured JSON logging |

## Project Structure

```
hub/
├── package.json
├── tsconfig.json
├── prisma/
│   ├── schema.prisma              # Full database schema
│   └── migrations/
├── src/
│   ├── index.ts                   # Hono app entry point
│   ├── config.ts                  # Environment config with Zod validation
│   │
│   ├── auth/
│   │   ├── middleware.ts          # Supabase JWT verification
│   │   ├── tenant-resolver.ts    # Extract tenant from any request source
│   │   └── api-keys.ts           # Plugin API key generation/validation
│   │
│   ├── mcp/
│   │   ├── server.ts             # MCP server setup (HTTP transport)
│   │   ├── tools/                # MCP tool definitions
│   │   │   ├── contacts.ts
│   │   │   ├── campaigns.ts
│   │   │   ├── whatsapp.ts
│   │   │   ├── jobs.ts
│   │   │   ├── analytics.ts
│   │   │   └── settings.ts
│   │   └── types.ts              # Shared MCP types
│   │
│   ├── api/
│   │   ├── routes/               # REST API routes (for Dashboard)
│   │   │   ├── auth.ts
│   │   │   ├── contacts.ts
│   │   │   ├── campaigns.ts
│   │   │   ├── whatsapp.ts
│   │   │   ├── settings.ts
│   │   │   ├── billing.ts
│   │   │   └── analytics.ts
│   │   └── middleware/
│   │       ├── rate-limit.ts
│   │       └── plan-guard.ts     # Enforce plan limits
│   │
│   ├── services/                  # Business logic (shared by MCP + REST)
│   │   ├── contact.service.ts
│   │   ├── campaign.service.ts
│   │   ├── whatsapp.service.ts
│   │   ├── job.service.ts
│   │   ├── credit.service.ts
│   │   ├── vault.service.ts      # Tenant Vault (encrypt/decrypt)
│   │   └── analytics.service.ts
│   │
│   ├── adapters/                  # External service adapters
│   │   ├── adapter.interface.ts   # Common interface
│   │   ├── apify.adapter.ts
│   │   ├── phantom.adapter.ts
│   │   ├── brevo.adapter.ts
│   │   ├── evolution.adapter.ts
│   │   ├── getlate.adapter.ts
│   │   └── telegram.adapter.ts
│   │
│   ├── router/
│   │   └── service-router.ts     # Resolve credentials + route to adapter
│   │
│   ├── jobs/                      # BullMQ job processors
│   │   ├── queues.ts             # Queue definitions
│   │   ├── scraping.worker.ts
│   │   ├── campaign.worker.ts
│   │   ├── whatsapp.worker.ts
│   │   ├── enrichment.worker.ts
│   │   ├── publishing.worker.ts
│   │   └── billing.worker.ts
│   │
│   ├── webhooks/                  # Webhook handlers
│   │   ├── evolution.ts          # WhatsApp events
│   │   ├── stripe.ts             # Payment events
│   │   └── apify.ts              # Scraping completion
│   │
│   ├── telegram/
│   │   ├── bot.ts                # Telegram bot setup
│   │   ├── commands/             # /status, /leads, /run, /cost
│   │   └── middleware.ts         # Auth: chat_id → tenant
│   │
│   └── lib/
│       ├── prisma.ts             # Prisma client singleton
│       ├── redis.ts              # Redis connection
│       ├── crypto.ts             # AES-256-GCM encryption
│       ├── errors.ts             # Error types
│       └── logger.ts             # Pino logger setup
│
├── Dockerfile
├── docker-compose.yml             # Hub + PG + Redis + Evolution
└── .env.example
```

## Service Router — The Key Component

The Service Router is what makes multi-tenancy work transparently. When any operation needs an external service, the router:

1. Looks up the tenant's credential for that service
2. Determines the credential type (OWN_KEY, PLATFORM, AFFILIATE)
3. Enforces plan limits and credit balance
4. Routes to the appropriate adapter
5. Logs usage and cost

```typescript
// src/router/service-router.ts — Pseudocode

interface ServiceRequest {
  tenantId: string;
  service: 'apify' | 'phantombuster' | 'brevo' | 'evolution' | 'getlate';
  action: string;
  params: Record<string, unknown>;
}

interface ServiceResponse {
  success: boolean;
  data: unknown;
  creditsCost: number;
  realCost: number;
}

async function routeService(req: ServiceRequest): Promise<ServiceResponse> {
  // 1. Get credential
  const cred = await vault.getCredential(req.tenantId, req.service);

  if (!cred) {
    throw new ServiceError(
      `No ${req.service} credentials configured. ` +
      `Connect your own API key or upgrade to a plan with platform credits.`,
      'CREDENTIAL_MISSING'
    );
  }

  // 2. Resolve API key based on credential type
  let apiKey: string;
  let creditsCost = 0;

  switch (cred.type) {
    case 'OWN_KEY':
    case 'AFFILIATE':
      // User's own key — no credit cost
      apiKey = vault.decrypt(cred.encryptedValue);
      break;

    case 'PLATFORM':
      // Our key — check and deduct credits
      apiKey = getPlatformKey(req.service);
      creditsCost = calculateCreditCost(req.service, req.action, req.params);

      const balance = await credits.getBalance(req.tenantId);
      if (balance.remaining < creditsCost) {
        throw new ServiceError(
          `Insufficient credits. Need ${creditsCost}, have ${balance.remaining}. ` +
          `Connect your own ${req.service} API key or purchase more credits.`,
          'INSUFFICIENT_CREDITS'
        );
      }
      break;
  }

  // 3. Check plan rate limits
  await planGuard.checkLimit(req.tenantId, req.service, req.action);

  // 4. Execute via adapter
  const adapter = getAdapter(req.service);
  const result = await adapter.execute(apiKey, req.action, req.params);

  // 5. Deduct credits if applicable
  if (creditsCost > 0) {
    await credits.deduct(req.tenantId, creditsCost, {
      service: req.service,
      action: req.action,
      realCost: result.cost,
      description: result.description,
    });
  }

  // 6. Log usage
  await analytics.logUsage(req.tenantId, {
    service: req.service,
    action: req.action,
    creditsCost,
    realCost: result.cost,
    timestamp: new Date(),
  });

  return {
    success: true,
    data: result.data,
    creditsCost,
    realCost: result.cost,
  };
}
```

## Tenant Vault — Credential Encryption

```typescript
// src/lib/crypto.ts — Pseudocode

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const MASTER_KEY = process.env.VAULT_MASTER_KEY; // 32-byte hex string
const ALGORITHM = 'aes-256-gcm';

function deriveKey(tenantId: string): Buffer {
  // Per-tenant key derivation
  return scryptSync(MASTER_KEY, tenantId, 32);
}

function encrypt(plaintext: string, tenantId: string): string {
  const key = deriveKey(tenantId);
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  // Store: iv + authTag + ciphertext (all base64)
  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted,
  ].join(':');
}

function decrypt(stored: string, tenantId: string): string {
  const [ivB64, tagB64, ciphertext] = stored.split(':');
  const key = deriveKey(tenantId);
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

## Adapter Interface

All external services implement the same interface:

```typescript
// src/adapters/adapter.interface.ts

interface ServiceAdapter {
  name: string;

  /** Test if credentials are valid */
  testConnection(apiKey: string): Promise<boolean>;

  /** Execute an action */
  execute(
    apiKey: string,
    action: string,
    params: Record<string, unknown>
  ): Promise<{
    data: unknown;
    cost: number;        // Real cost in USD
    description: string; // Human-readable summary
  }>;

  /** Get supported actions */
  getActions(): string[];
}
```

### Adapter Example: Apify

```typescript
// src/adapters/apify.adapter.ts — Pseudocode

class ApifyAdapter implements ServiceAdapter {
  name = 'apify';

  private BASE_URL = 'https://api.apify.com/v2';

  async testConnection(apiKey: string): Promise<boolean> {
    const res = await fetch(`${this.BASE_URL}/users/me`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return res.ok;
  }

  async execute(apiKey: string, action: string, params: Record<string, unknown>) {
    switch (action) {
      case 'scrape_google_maps':
        return this.scrapeGoogleMaps(apiKey, params);
      case 'scrape_instagram':
        return this.scrapeInstagram(apiKey, params);
      case 'send_instagram_dm':
        return this.sendInstagramDM(apiKey, params);
      case 'enrich_contact':
        return this.enrichContact(apiKey, params);
      default:
        throw new Error(`Unknown Apify action: ${action}`);
    }
  }

  private async scrapeGoogleMaps(apiKey: string, params: Record<string, unknown>) {
    const actorId = 'compass/crawler-google-places';
    const input = {
      searchStringsArray: [params.query as string],
      locationQuery: params.location as string,
      maxCrawledPlacesPerSearch: params.maxResults as number || 100,
      language: 'es',
    };

    // Start actor run
    const run = await fetch(
      `${this.BASE_URL}/acts/${actorId}/runs?token=${apiKey}`,
      { method: 'POST', body: JSON.stringify(input), headers: { 'Content-Type': 'application/json' } }
    );
    const runData = await run.json();

    // Return run info for async polling
    return {
      data: { runId: runData.data.id, datasetId: runData.data.defaultDatasetId },
      cost: 0.50, // Estimated
      description: `Started Google Maps scrape: "${params.query}" in ${params.location}`,
    };
  }

  getActions() {
    return ['scrape_google_maps', 'scrape_instagram', 'scrape_linkedin',
            'send_instagram_dm', 'enrich_contact', 'scrape_website'];
  }
}
```

## Credit System

### Credit Costs per Action

| Service | Action | Credits | Real Cost (approx) |
|---------|--------|---------|-------------------|
| Apify | Google Maps scrape (100 results) | 5 | $0.50 |
| Apify | Instagram scrape (100 profiles) | 3 | $0.30 |
| Apify | Instagram DM (50 messages) | 8 | $0.80 |
| Apify | LinkedIn scrape (100 profiles) | 5 | $0.50 |
| Apify | Lead enrichment (50 contacts) | 4 | $0.40 |
| PhantomBuster | LinkedIn automation (50 actions) | 6 | $0.60 |
| Brevo | Email campaign (500 emails) | 2 | $0.20 |
| Evolution | WhatsApp instance (1 month) | 20 | $2.00 |
| getLate | Social post (1 post) | 1 | $0.10 |

### Credit Pricing

| Package | Credits | Price | Per Credit |
|---------|---------|-------|-----------|
| Starter | 50 | Free (with plan) | — |
| Basic | 100 | $10 | $0.10 |
| Growth | 500 | $40 | $0.08 |
| Pro | 2000 | $120 | $0.06 |

### Credit Balance Schema

```sql
-- credit_balances table
CREATE TABLE credit_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  credits_total INTEGER NOT NULL DEFAULT 0,
  credits_used INTEGER NOT NULL DEFAULT 0,
  credits_remaining INTEGER GENERATED ALWAYS AS (credits_total - credits_used) STORED,
  plan_credits INTEGER NOT NULL DEFAULT 50,  -- Monthly plan allocation
  purchased_credits INTEGER NOT NULL DEFAULT 0,
  resets_at TIMESTAMPTZ NOT NULL,  -- When plan credits reset
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(tenant_id)
);

-- credit_transactions table (audit log)
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  type TEXT NOT NULL,  -- 'deduct', 'purchase', 'plan_reset', 'refund'
  amount INTEGER NOT NULL,  -- Positive for additions, negative for deductions
  balance_after INTEGER NOT NULL,
  service TEXT,
  action TEXT,
  real_cost_usd DECIMAL(10, 4),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Affiliate Tracking

### How Affiliate Links Work

During `/onboard` (Phase 5: CONNECT), when a user doesn't have an API key for a service:

```
Solti: "You don't have an Apify account yet.
        Create one here for free: https://apify.com?ref=SOLTI_REF_ID
        Once created, paste your API token below."
```

The referral link includes our affiliate ID. When the user signs up and starts paying:
- **Apify**: Recurring commission on their spend
- **PhantomBuster**: Referral credit
- **Brevo**: Partner commission

### Affiliate Schema

```sql
CREATE TABLE affiliate_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  service TEXT NOT NULL,  -- 'apify', 'phantombuster', 'brevo'
  referral_link TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SENT',  -- SENT, SIGNED_UP, PAYING, EXPIRED
  signed_up_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(tenant_id, service)
);
```

## Background Jobs

### Queue Architecture

```
┌─────────────────────────────────────────────────┐
│ BullMQ Queues (Redis)                            │
│                                                  │
│  scraping (concurrency: 5)                       │
│  ├── Poll Apify run status every 30s             │
│  ├── Fetch results when complete                 │
│  └── Import to database                          │
│                                                  │
│  campaigns (concurrency: 3)                      │
│  ├── Send emails in batches (50/batch)           │
│  ├── Send DMs with delay (30-60s between)        │
│  └── Update delivery status                      │
│                                                  │
│  whatsapp (concurrency: 10)                      │
│  ├── Process incoming messages                   │
│  ├── Generate AI responses                       │
│  └── Send replies via Evolution                  │
│                                                  │
│  enrichment (concurrency: 3)                     │
│  ├── Batch enrich contacts                       │
│  └── Update contact records                      │
│                                                  │
│  publishing (concurrency: 2)                     │
│  ├── Post to scheduled platforms                 │
│  └── Verify post published                       │
│                                                  │
│  billing (concurrency: 1)                        │
│  ├── Monthly credit resets (cron: 0 0 1 * *)     │
│  ├── Usage report generation                     │
│  └── Subscription status sync (Stripe)           │
│                                                  │
│  maintenance (concurrency: 1)                    │
│  ├── Clean expired sessions                      │
│  ├── Archive old job records                     │
│  └── Health check all instances                  │
└─────────────────────────────────────────────────┘
```

## Telegram Bot

### Commands

| Command | What it does |
|---------|-------------|
| `/start` | Link Telegram to Solti account |
| `/status` | System overview: active instances, pending jobs |
| `/leads` | Quick stats: leads today, this week, this month |
| `/campaigns` | Active campaign status |
| `/cost` | Today's spend breakdown |
| `/run <skill> <args>` | Trigger skill execution (creates Hub job) |
| `/help` | List available commands |

### Auth Flow

```
User sends /start to @SoltiBot
    │
    ▼
Bot generates one-time link:
  https://hub.solti.app/telegram/link?code=ABC123
    │
    ▼
User clicks link, logs in with Supabase Auth
    │
    ▼
Hub links telegram_chat_id to tenant_id
    │
    ▼
All future /commands are authenticated via chat_id → tenant lookup
```

## Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  hub:
    build: .
    ports:
      - "4000:4000"     # REST API
      - "4001:4001"     # MCP Server
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/solti
      REDIS_URL: redis://redis:6379
      VAULT_MASTER_KEY: ${VAULT_MASTER_KEY}
      SUPABASE_URL: ${SUPABASE_URL}
      SUPABASE_SERVICE_KEY: ${SUPABASE_SERVICE_KEY}
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
      STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY}
    depends_on:
      - db
      - redis

  db:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: solti
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  evolution:
    image: atendai/evolution-api:latest
    ports:
      - "8080:8080"
    environment:
      AUTHENTICATION_API_KEY: ${EVOLUTION_API_KEY}
      DATABASE_CONNECTION_URI: postgresql://postgres:postgres@db:5432/evolution
    depends_on:
      - db

volumes:
  pgdata:
```
