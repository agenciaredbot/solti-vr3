# SOLTI VR3 — System Architecture

> Version: 1.0.0 | Last updated: 2026-03-15

---

## High-Level Overview

Solti VR3 is a 3-layer hybrid system:

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 1: SOLTI PLUGIN (Claude Code / Cowork)                   │
│ ─────────────────────────────────────────────                   │
│ The brain. Runs locally in Claude Code.                         │
│ Contains: Skills, Scripts, Hooks, Context, Memory, Prompts      │
│ Communicates with Layer 2 via MCP (HTTP transport)              │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 2: SERVICE HUB (Docker — Cloud or Local)                 │
│ ─────────────────────────────────────────────                   │
│ The body. Runs 24/7 in Docker.                                  │
│ Contains: REST API, PostgreSQL, Redis, BullMQ Jobs,            │
│ Telegram Bot, Webhook receivers, Tenant Vault                   │
│ Exposes: MCP Server (for Plugin) + REST API (for Dashboard)    │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 3: DASHBOARD (Next.js — Lightweight)                     │
│ ─────────────────────────────────────────────                   │
│ The face. Web app for visual monitoring and manual ops.         │
│ Contains: CRM view, Campaign status, Settings, Billing          │
│ Communicates with Layer 2 via REST API                          │
└─────────────────────────────────────────────────────────────────┘
```

## Why This Architecture?

### Why not a monolith like VR2?

VR2 was a single Next.js app that contained everything: UI, API routes, AI orchestration, database access, external service calls. This created problems:

1. **Can't run headless** — Need a browser to use it
2. **Can't package as plugin** — It's a full web app, not a tool
3. **AI orchestration is redundant** — Claude Code already has a superior orchestrator (the model itself)
4. **Single-tenant by nature** — Adding multi-tenancy to a monolith is painful

### Why Plugin + Hub instead of just Plugin?

A pure Plugin (like gstack) can't:
- Run background jobs (scraping takes minutes, campaigns send over hours)
- Persist data between sessions (no database)
- Serve a web dashboard
- Process webhooks from external services (WhatsApp incoming messages)
- Run 24/7 (Claude Code sessions end)

The Hub handles everything that needs persistence and 24/7 availability. The Plugin handles everything that needs AI reasoning and user interaction.

### Why not just a SaaS (Hub + Dashboard)?

Because the Plugin is the differentiator. Every SaaS CRM/marketing tool has a web dashboard. Only Solti lets you say "find me 100 leads in Bogota and send them a cold email" in natural language and have it happen autonomously. The Plugin IS the product; the Hub and Dashboard are supporting infrastructure.

## Layer 1: Solti Plugin — Detailed Architecture

### Directory Structure

```
solti-plugin/
├── CLAUDE.md                          # System kernel
├── plugin.json                        # Plugin manifest
├── .mcp.json                          # MCP server connection to Hub
│
├── context/                           # Business knowledge (user-specific)
│   ├── my-business.md                 # Company info, products, pricing
│   ├── my-voice.md                    # Communication style, tone, phrases
│   ├── my-icp.md                      # Ideal Customer Profile definition
│   ├── my-offer.md                    # Value proposition, pitch
│   └── my-competitors.md             # Competitive landscape
│
├── args/                              # Runtime configuration
│   └── preferences.yaml              # Timezone, models, channels, cost limits
│
├── memory/                            # 3-tier memory system
│   ├── MEMORY.md                      # Tier 1: Core facts (always loaded)
│   ├── logs/                          # Tier 2: Daily session logs
│   │   └── {YYYY-MM-DD}.md
│   └── .markers/                      # Auto-capture position tracking
│
├── hooks/                             # Lifecycle automation
│   ├── guardrail_check.py            # PreToolUse: block dangerous ops
│   ├── cost_guard.py                  # PreToolUse: confirm spend >$1
│   ├── memory_capture.py             # Stop: auto-save session learnings
│   └── validate_output.py            # PostToolUse: validate script JSON
│
├── bin/                               # CLI utilities (gstack-style)
│   ├── solti-hub-check               # Verify Hub is online
│   ├── solti-cost-check              # Show today's spend
│   └── solti-update-check            # Cached version check (24h)
│
├── skills/                            # All skill packages
│   ├── onboard/
│   │   └── SKILL.md
│   ├── prospect/
│   │   ├── SKILL.md
│   │   ├── SKILL.md.tmpl             # Template source
│   │   ├── scripts/
│   │   │   ├── scrape_apify.py
│   │   │   ├── scrape_phantom.py
│   │   │   ├── enrich_lead.py
│   │   │   ├── score_lead.py
│   │   │   ├── import_to_crm.py
│   │   │   └── batch_prospect.py
│   │   ├── assets/prompts/
│   │   │   ├── lead_profile.txt
│   │   │   └── qualification.txt
│   │   └── references/
│   │       ├── scoring-criteria.md
│   │       └── output-structures.md
│   ├── outreach/
│   ├── publish/
│   ├── deploy/
│   ├── whatsapp/
│   ├── crm/
│   ├── connect/
│   ├── pipeline/
│   ├── strategy/
│   ├── audit/
│   ├── retro/
│   ├── qa/
│   ├── browse/
│   └── upgrade/
│
├── agents/                            # Specialized subagents
│   ├── researcher.md                  # Read-only research (Sonnet)
│   ├── copywriter.md                  # Content in user's voice (Sonnet)
│   └── analyst.md                     # Data analysis (Haiku)
│
├── rules/                             # Guardrail rules (auto-loaded)
│   ├── guardrails.md                  # Safety rules
│   ├── memory-protocol.md            # Memory management rules
│   └── cost-protocol.md              # Spending rules
│
└── .tmp/                              # Disposable scratch space
    └── (ephemeral files during skill execution)
```

### How Skills Execute

```
User says: "find 100 restaurants in bogota"
    │
    ▼
Claude Code matches → /prospect skill (by description)
    │
    ▼
SKILL.md loaded → Cognitive Mode: Growth Hacker
    │
    ▼
Pre-checks:
  1. Read context/my-icp.md
  2. Run bin/solti-hub-check
  3. Run bin/solti-cost-check
    │
    ▼
Confirm with user:
  "I'll scrape Google Maps for 'restaurantes' in Bogota.
   ~100 results, estimated cost: $0.50. Proceed?"
    │
    ▼
Execute deterministic scripts:
  python3 scripts/scrape_apify.py --platform google_maps --query "restaurantes" --location "bogota" --max 100
    │ (JSON output)
    ▼
  python3 scripts/enrich_lead.py --input .tmp/scrape_results.json
    │ (JSON output)
    ▼
  python3 scripts/score_lead.py --input .tmp/enriched.json --icp context/my-icp.md
    │ (JSON output)
    ▼
  python3 scripts/import_to_crm.py --input .tmp/scored.json --min-score 60
    │ (calls Hub via MCP or REST)
    ▼
Report results:
  "Found 100 restaurants. 78 enriched with email. 45 scored >80 (hot). Imported 67 to CRM. Cost: $0.52"
    │
    ▼
Stop hook fires → memory_capture.py → saves to daily log
```

### Tool Routing Decision: CLI vs MCP

| Operation | Method | Rationale |
|-----------|--------|-----------|
| Apify scraping | Python script → REST API | Deterministic, no AI needed for HTTP call |
| PhantomBuster | Python script → REST API | Deterministic |
| Brevo email | Python script → REST API | Deterministic |
| getLate posting | Python script → REST API | Deterministic |
| Browser automation | CLI binary (gstack-style) | Zero token overhead, persistent Chromium |
| File operations | Bash direct | Never MCP for ls, cat, grep |
| Cost/status checks | bin/ shell scripts | 1 line stdout, zero tokens |
| CRM read/write | MCP → Hub | Data lives in Hub's PostgreSQL |
| WhatsApp management | MCP → Hub → Evolution | Evolution runs 24/7 in Hub |
| Campaign management | MCP → Hub | State and scheduling in Hub |
| Contact timeline | MCP → Hub | Data in Hub's PostgreSQL |

**Rule:** If the operation is local and deterministic → Python script or shell. If it needs the Hub's database or 24/7 services → MCP. Never use MCP for something a `python3 script.py` can do.

### Memory Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ TIER 1: MEMORY.md (Always in context)                        │
│ • ~200 lines max                                             │
│ • Curated facts: user preferences, ICP summary, key metrics  │
│ • Updated manually or via sync from Tier 3                   │
│ • Loaded at every session start                              │
├──────────────────────────────────────────────────────────────┤
│ TIER 2: Daily Logs (Session persistence)                     │
│ • memory/logs/{YYYY-MM-DD}.md                                │
│ • Append-only: events, decisions, results                    │
│ • Today + yesterday loaded at session start                  │
│ • Auto-created by Stop hook                                  │
├──────────────────────────────────────────────────────────────┤
│ TIER 3: Vector Memory (Long-term, optional)                  │
│ • mem0 + Pinecone (or local ChromaDB)                        │
│ • Auto-capture from Stop hook                                │
│ • Hybrid search: BM25 + vector + temporal decay              │
│ • ~$0.04/month for Pinecone                                  │
│ • Sanitizes secrets before sending to embedding API          │
└──────────────────────────────────────────────────────────────┘
```

### Hooks Lifecycle

```
Session Start
    │
    ▼
[Auto-load MEMORY.md + today's log + yesterday's log]
    │
    ▼
User sends message → Claude reasons → Decides to use a tool
    │
    ▼
┌─ PreToolUse Hook ─────────────────────────────────┐
│ guardrail_check.py                                 │
│   Input: {tool_name, tool_input}                   │
│   Checks: dangerous commands, destructive ops      │
│   Exit 0: proceed | Exit 2: BLOCK (unbypassable)   │
│                                                     │
│ cost_guard.py                                       │
│   Input: {tool_name, tool_input}                   │
│   Checks: if action costs >$1, ask confirmation    │
│   Exit 0: proceed | Exit 2: BLOCK until confirmed   │
└─────────────────────────────────────────────────────┘
    │
    ▼
Tool executes (Bash, Write, MCP call, etc.)
    │
    ▼
┌─ PostToolUse Hook ────────────────────────────────┐
│ validate_output.py                                 │
│   Input: {tool_name, tool_input, tool_output}      │
│   Checks: JSON validity, expected fields           │
│   Exit 0: valid | Exit 1: log warning              │
└─────────────────────────────────────────────────────┘
    │
    ▼
Claude generates response → Session may continue or end
    │
    ▼
┌─ Stop Hook ───────────────────────────────────────┐
│ memory_capture.py                                  │
│   Input: {session_id, transcript_path, cwd}        │
│   Actions:                                          │
│   1. Read new messages from transcript              │
│   2. Append summary to daily log (Tier 2)          │
│   3. Feed to mem0 for fact extraction (Tier 3)     │
│   4. Sanitize secrets before external API calls     │
│   Exit 0 always (non-blocking, async)              │
└─────────────────────────────────────────────────────┘
```

## Layer 2: Service Hub — Detailed Architecture

### Technology Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Runtime | Node.js + TypeScript | Same language as Plugin's MCP integration |
| Framework | Fastify (or Hono) | Lightweight, fast, good TypeScript support |
| Database | PostgreSQL (Supabase) | RLS for multi-tenancy, proven scale |
| Cache/Queue | Redis + BullMQ | Background job processing |
| Auth | Supabase Auth | Email/password, magic link, Google OAuth, RLS |
| ORM | Prisma | Type-safe, migrations, good DX |
| MCP Server | @anthropic-ai/sdk | HTTP transport for Plugin connection |
| Telegram | grammy or telegraf | Bot for mobile commands |
| WhatsApp | Evolution API | Self-hosted WhatsApp instances |
| Encryption | Node.js crypto | AES-256-GCM for Tenant Vault |

### Hub Internal Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     SERVICE HUB                              │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ INGRESS                                               │   │
│  │                                                       │   │
│  │  MCP Server (HTTP)  ←── Plugin connection             │   │
│  │  REST API           ←── Dashboard + external clients  │   │
│  │  Telegram Webhook   ←── Mobile commands               │   │
│  │  WhatsApp Webhook   ←── Evolution API callbacks       │   │
│  │  Stripe Webhook     ←── Payment events                │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                   │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ AUTH + TENANT RESOLUTION                              │   │
│  │                                                       │   │
│  │  Every request → Extract tenant from:                 │   │
│  │    MCP: Bearer token → tenant_id                      │   │
│  │    REST: Supabase JWT → user_id → tenant_id           │   │
│  │    Telegram: chat_id → tenant_id                      │   │
│  │    Webhook: instance_id → tenant_id                   │   │
│  │                                                       │   │
│  │  All DB queries scoped by tenant (RLS)                │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                   │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ SERVICE ROUTER                                        │   │
│  │                                                       │   │
│  │  Resolves HOW to execute each action:                 │   │
│  │                                                       │   │
│  │  1. Get tenant's credential for service               │   │
│  │  2. Determine type:                                   │   │
│  │     OWN_KEY → Use their API key, no credit cost       │   │
│  │     PLATFORM → Use our key, deduct credits            │   │
│  │     AFFILIATE → Use their key (created via our link)  │   │
│  │  3. Check rate limits and plan quotas                 │   │
│  │  4. Execute via appropriate adapter                   │   │
│  │  5. Log usage and cost                                │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                   │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ SERVICE ADAPTERS                                      │   │
│  │                                                       │   │
│  │  ApifyAdapter     → REST API calls to Apify           │   │
│  │  PhantomAdapter   → REST API calls to PhantomBuster   │   │
│  │  BrevoAdapter     → Transactional + campaign emails   │   │
│  │  EvolutionAdapter → WhatsApp instance management      │   │
│  │  GetLateAdapter   → Social media publishing           │   │
│  │  TelegramAdapter  → Bot messages and commands         │   │
│  │                                                       │   │
│  │  Each adapter: same interface, swap implementations   │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                   │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ DATA LAYER                                            │   │
│  │                                                       │   │
│  │  PostgreSQL (Supabase)                                │   │
│  │  ├── Tenant management (users, configs, plans)        │   │
│  │  ├── Tenant Vault (encrypted credentials)             │   │
│  │  ├── Credit system (balances, usage, transactions)    │   │
│  │  ├── CRM (contacts, companies, deals, activities)     │   │
│  │  ├── Campaigns (email, DM, sequences)                 │   │
│  │  ├── WhatsApp (instances, conversations, messages)    │   │
│  │  ├── Content (posts, schedules, media)                │   │
│  │  ├── Jobs (scraping, sending, background tasks)       │   │
│  │  └── Analytics (usage, costs, performance)            │   │
│  │                                                       │   │
│  │  Redis                                                │   │
│  │  ├── BullMQ job queues                                │   │
│  │  ├── Rate limiting counters                           │   │
│  │  └── Session cache                                    │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ BACKGROUND JOBS (BullMQ)                              │   │
│  │                                                       │   │
│  │  Queues:                                              │   │
│  │  ├── scraping    → Poll Apify/Phantom run status      │   │
│  │  ├── campaigns   → Send emails/DMs on schedule        │   │
│  │  ├── whatsapp    → Process incoming WApp messages     │   │
│  │  ├── enrichment  → Background lead enrichment         │   │
│  │  ├── publishing  → Scheduled social media posts       │   │
│  │  ├── billing     → Monthly credit resets, usage calc  │   │
│  │  └── maintenance → Cleanup, health checks             │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### MCP Server Exposed Tools

The Hub exposes these tools to the Plugin via MCP:

```
CONTACTS:
  solti_contact_create       → Create a new contact
  solti_contact_update       → Update contact fields
  solti_contact_search       → Search contacts by query
  solti_contact_list         → List contacts with filters
  solti_contact_get          → Get single contact with timeline
  solti_contact_import       → Bulk import contacts from JSON

CAMPAIGNS:
  solti_campaign_create      → Create email/DM campaign
  solti_campaign_send        → Trigger campaign sending
  solti_campaign_status      → Check campaign progress
  solti_campaign_list        → List campaigns with stats

WHATSAPP:
  solti_whatsapp_create      → Deploy new WApp instance
  solti_whatsapp_send        → Send message via instance
  solti_whatsapp_status      → Check instance health
  solti_whatsapp_list        → List all instances

JOBS:
  solti_job_create           → Start a background job
  solti_job_status           → Check job progress
  solti_job_results          → Fetch completed job results

ANALYTICS:
  solti_analytics_dashboard  → Get summary metrics
  solti_analytics_costs      → Get cost breakdown
  solti_analytics_leads      → Get lead generation stats

SETTINGS:
  solti_settings_get         → Get tenant settings
  solti_settings_update      → Update settings
  solti_credentials_set      → Store API key (encrypted)
  solti_credentials_check    → Verify a credential works
```

### Tenant Vault (Credential Storage)

```
┌────────────────────────────────────────────────────────┐
│ tenant_credentials (PostgreSQL table)                   │
│                                                         │
│  id          UUID PRIMARY KEY                           │
│  tenant_id   UUID REFERENCES tenants(id)                │
│  service     TEXT (apify, phantombuster, brevo, etc.)   │
│  cred_type   TEXT (OWN_KEY, PLATFORM, AFFILIATE, SESSION)│
│  value       TEXT (AES-256-GCM encrypted)               │
│  metadata    JSONB (expiry, notes, affiliate_ref)       │
│  created_at  TIMESTAMPTZ                                │
│  updated_at  TIMESTAMPTZ                                │
│                                                         │
│  UNIQUE(tenant_id, service)                             │
│  RLS: tenant can only see own credentials               │
└────────────────────────────────────────────────────────┘

Encryption:
  key = derive_key(VAULT_MASTER_KEY, tenant_id)  // per-tenant key
  ciphertext = AES-256-GCM(plaintext, key, random_iv)
  stored = base64(iv + ciphertext + auth_tag)
```

## Layer 3: Dashboard — Detailed Architecture

### Technology

| Component | Choice | Why |
|-----------|--------|-----|
| Framework | Next.js 15 (App Router) | SSR, API routes, fast |
| Styling | Tailwind CSS v4 + shadcn/ui | Rapid development, consistent |
| Auth | Supabase SSR | Same auth as Hub |
| State | React Query (TanStack) | Server state management |
| Charts | Recharts | Lightweight, React-native |

### Pages

```
/                    → Landing page (marketing)
/login               → Auth (email, Google)
/signup              → Registration + plan selection
/dashboard           → Overview: leads, campaigns, costs, activity
/crm                 → Contact list + search + filters
/crm/[id]            → Contact detail + timeline + notes
/campaigns           → Campaign list + status indicators
/campaigns/[id]      → Campaign detail + send stats
/campaigns/new       → Campaign builder (wizard)
/whatsapp            → WhatsApp instances + status
/content             → Scheduled posts + drafts
/settings            → General settings
/settings/connect    → API key management + service connections
/settings/plan       → Current plan + usage + upgrade
/billing             → Invoices + payment method
```

### Dashboard is NOT the primary interface

The Dashboard is a **complement** to the Plugin, not a replacement. Users perform complex operations via the Plugin (natural language) and use the Dashboard for:

1. **Monitoring** — See campaign progress, lead counts, costs at a glance
2. **Manual CRM** — Browse contacts, add notes, update deal stages
3. **Settings** — Connect API keys, manage plan, billing
4. **Sharing** — Show results to team members who don't use Claude Code

## Communication Patterns

```
Plugin ←── MCP (HTTP) ──→ Hub ←── REST ──→ Dashboard
                           │
                           ├── Telegram Bot ──→ User mobile
                           ├── Evolution API ──→ WhatsApp
                           ├── Webhooks ←── External services
                           └── BullMQ ──→ Background jobs
```

### Plugin → Hub (MCP)

```
Plugin calls MCP tool: solti_contact_create({name: "John", email: "john@co.com"})
    │
    ▼
MCP HTTP transport: POST https://hub.solti.app/mcp
Headers: Authorization: Bearer {tenant_api_key}
Body: {method: "solti_contact_create", params: {name: "John", email: "john@co.com"}}
    │
    ▼
Hub resolves tenant from API key
Hub executes: INSERT INTO contacts (tenant_id, name, email) VALUES (...)
Hub returns: {id: "uuid", name: "John", email: "john@co.com"}
    │
    ▼
Plugin receives result, continues skill execution
```

### External Service → Hub (Webhook)

```
WhatsApp user sends message to business number
    │
    ▼
Evolution API → POST https://hub.solti.app/webhooks/evolution
Body: {instance: "biz-1", from: "+57300...", message: "Hola, quiero cotizar"}
    │
    ▼
Hub resolves tenant from instance_id
Hub processes: create/update contact, log message, trigger AI response
Hub responds via Evolution API: send reply message
    │
    ▼
WhatsApp user receives AI-generated response
```

## Deployment Architecture

### Development (Local)

```
Developer machine:
  ├── Claude Code + Solti Plugin (local files)
  ├── Docker Compose:
  │   ├── hub (Node.js app)
  │   ├── postgres (Supabase local or vanilla PG)
  │   ├── redis
  │   └── evolution (WhatsApp)
  └── Dashboard (next dev on localhost:3001)
```

### Production

```
Cloud:
  ├── Supabase (managed PostgreSQL + Auth + Storage)
  ├── Railway / Fly.io / Render:
  │   ├── hub (Docker container)
  │   └── redis (managed)
  ├── Vercel:
  │   └── dashboard (Next.js)
  └── Evolution API (VPS or Docker on same server)

User machines:
  └── Claude Code + Solti Plugin (connects to cloud Hub)
```

### One-Command Local Setup

```bash
# Clone and start everything
git clone https://github.com/yourorg/solti-vr3
cd solti-vr3
docker compose up -d          # Hub + PG + Redis + Evolution
cd plugin && ./setup           # Install Plugin in Claude Code
claude                         # Start Claude Code → /onboard
```
