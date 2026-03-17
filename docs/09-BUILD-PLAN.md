# SOLTI VR3 — Build Plan (Phase-by-Phase)

> Version: 1.0.0 | Last updated: 2026-03-15

---

## Overview

Total estimated build time: **7-8 weeks** across 5 phases.
Each phase produces a working, testable milestone.

---

## Phase 1: Plugin Skeleton (Week 1)

### Goal
A working Claude Code plugin with 3 functional skills that operates standalone (no Hub needed).

### Deliverables

```
solti-plugin/
├── CLAUDE.md                    ✅ System kernel
├── plugin.json                  ✅ Plugin manifest
├── VERSION                      ✅ Version file (1.0.0)
├── setup.sh                     ✅ One-command setup
│
├── context/
│   ├── my-business.md           ✅ Placeholder (filled by /onboard)
│   ├── my-voice.md              ✅ Placeholder
│   ├── my-icp.md                ✅ Placeholder
│   └── my-offer.md              ✅ Placeholder
│
├── args/
│   └── preferences.yaml         ✅ Default preferences
│
├── memory/
│   ├── MEMORY.md                ✅ Empty template
│   └── logs/                    ✅ Directory created
│
├── hooks/
│   ├── guardrail_check.py       ✅ Blocks dangerous commands
│   ├── cost_guard.py            ✅ Confirms expensive operations
│   ├── validate_output.py       ✅ Validates script JSON output
│   └── memory_capture.py        ✅ Auto-saves to daily log
│
├── bin/
│   ├── solti-hub-check          ✅ Hub connectivity check
│   ├── solti-cost-check         ✅ Today's spend
│   └── solti-update-check       ✅ Version check (24h cache)
│
├── rules/
│   ├── guardrails.md            ✅ Safety rules
│   ├── memory-protocol.md       ✅ Memory management
│   └── cost-protocol.md         ✅ Spending rules
│
├── agents/
│   ├── researcher.md            ✅ Read-only research agent
│   └── copywriter.md            ✅ Content in user's voice
│
└── skills/
    ├── onboard/
    │   └── SKILL.md             ✅ 5-phase setup wizard
    ├── prospect/
    │   ├── SKILL.md             ✅ Full prospect skill
    │   ├── scripts/
    │   │   ├── scrape_apify.py  ✅ Apify scraping
    │   │   ├── enrich_lead.py   ✅ Lead enrichment
    │   │   └── score_lead.py    ✅ ICP scoring
    │   ├── assets/prompts/
    │   │   ├── lead_profile.txt ✅ Lead profiling prompt
    │   │   └── qualification.txt✅ Qualification prompt
    │   └── references/
    │       └── scoring-criteria.md ✅
    └── crm/
        ├── SKILL.md             ✅ Basic CRM operations
        └── scripts/
            └── crm_local.py     ✅ SQLite-based local CRM (no Hub)
```

### Testing Criteria
- [ ] Plugin installs cleanly in Claude Code
- [ ] `/onboard` walks through all 5 phases
- [ ] `/prospect` can scrape 10 leads from Google Maps via Apify
- [ ] `/crm` can list, search, and update contacts (SQLite locally)
- [ ] Hooks fire correctly (guardrail blocks `rm -rf`, cost_guard warns on >$1)
- [ ] Memory daily log gets created after session

### Key Decision: Local-First CRM
In Phase 1, the CRM uses SQLite locally (no Hub). This lets users try Solti without any server. The `/crm` skill's `crm_local.py` script stores contacts in `data/contacts.db`. In Phase 3, we add the Hub adapter and the skill transparently switches to PostgreSQL.

---

## Phase 2: Core Skills (Weeks 2-3)

### Goal
All 8 core growth skills working. Plugin is fully functional for lead generation and outreach using local SQLite + direct API calls.

### Deliverables

```
skills/
├── outreach/
│   ├── SKILL.md                 ✅ Multi-channel outreach
│   ├── scripts/
│   │   ├── generate_sequence.py ✅ AI sequence generation
│   │   ├── send_email_campaign.py ✅ Brevo integration
│   │   ├── send_instagram_dm.py ✅ Apify IG DM
│   │   ├── send_linkedin_dm.py  ✅ PhantomBuster
│   │   └── check_campaign_status.py ✅
│   └── assets/prompts/
│       ├── cold_email_initial.txt ✅
│       ├── cold_email_followup.txt ✅
│       └── cold_email_breakup.txt ✅
│
├── publish/
│   ├── SKILL.md                 ✅ Social publishing
│   ├── scripts/
│   │   ├── generate_post.py     ✅ Content generation
│   │   ├── schedule_post.py     ✅ getLate integration
│   │   └── content_calendar.py  ✅ Weekly planning
│   └── assets/prompts/
│       ├── linkedin_post.txt    ✅
│       ├── instagram_caption.txt ✅
│       └── thread_hook.txt      ✅
│
├── deploy/
│   ├── SKILL.md                 ✅ Campaign launcher (8-step)
│   └── scripts/
│       ├── preflight_check.py   ✅ Validate everything
│       ├── test_send.py         ✅ Send test message
│       └── launch_campaign.py   ✅ Execute deployment
│
├── whatsapp/
│   ├── SKILL.md                 ✅ WhatsApp agent management
│   └── scripts/
│       ├── create_instance.py   ✅ Evolution API
│       ├── configure_instance.py ✅
│       └── check_status.py      ✅
│
├── connect/
│   ├── SKILL.md                 ✅ Session/credential manager
│   └── scripts/
│       └── test_credential.py   ✅ Test API key validity
│
└── pipeline/
    ├── SKILL.md                 ✅ Full funnel automation
    └── scripts/
        └── run_pipeline.py      ✅ Orchestrate sub-skills
```

### Also in Phase 2
- [ ] Template system: SKILL.md.tmpl → SKILL.md generation
- [ ] All hard prompts in assets/prompts/ with {{placeholder}} system
- [ ] Score_lead.py enhanced with configurable criteria from my-icp.md
- [ ] Batch processing in prospect (ThreadPoolExecutor)
- [ ] All reference docs for each skill

### Testing Criteria
- [ ] `/prospect` full pipeline: scrape → enrich → score → import (100 leads)
- [ ] `/outreach` creates and sends 3-step email sequence via Brevo
- [ ] `/outreach` sends Instagram DMs via Apify
- [ ] `/publish` generates LinkedIn post in user's voice and schedules via getLate
- [ ] `/deploy` runs 8-step pre-flight before sending campaign
- [ ] `/whatsapp` creates and connects Evolution instance
- [ ] `/connect` imports and validates API keys
- [ ] `/pipeline` orchestrates full funnel end-to-end

---

## Phase 3: Service Hub + Multi-Tenancy (Weeks 4-5)

### Goal
Multi-tenant Service Hub running in Docker. Plugin connects via MCP. Dashboard skeleton.

### Deliverables

```
hub/
├── package.json                 ✅
├── tsconfig.json                ✅
├── Dockerfile                   ✅
├── docker-compose.yml           ✅ Hub + PG + Redis + Evolution
├── .env.example                 ✅
│
├── prisma/
│   ├── schema.prisma            ✅ Full schema (all tables)
│   └── seed.ts                  ✅ Initial data + test tenant
│
├── src/
│   ├── index.ts                 ✅ Hono app entry
│   ├── config.ts                ✅ Env validation (Zod)
│   │
│   ├── auth/
│   │   ├── middleware.ts        ✅ Supabase JWT
│   │   ├── tenant-resolver.ts   ✅ Multi-source tenant resolution
│   │   └── api-keys.ts          ✅ Plugin API key management
│   │
│   ├── mcp/
│   │   ├── server.ts            ✅ MCP server (HTTP transport)
│   │   └── tools/
│   │       ├── contacts.ts      ✅ CRM tools
│   │       ├── campaigns.ts     ✅ Campaign tools
│   │       ├── whatsapp.ts      ✅ WhatsApp tools
│   │       ├── jobs.ts          ✅ Job management tools
│   │       ├── analytics.ts     ✅ Analytics tools
│   │       └── settings.ts      ✅ Settings tools
│   │
│   ├── services/                ✅ All service modules
│   ├── adapters/                ✅ All service adapters
│   ├── router/
│   │   └── service-router.ts    ✅ Credential resolution + routing
│   ├── jobs/                    ✅ BullMQ workers
│   ├── webhooks/                ✅ Evolution, Stripe, Apify
│   └── lib/                     ✅ Shared utilities
│
└── tests/                       ✅ Integration tests
```

### Plugin Updates for Hub Connection

```
solti-plugin/
├── .mcp.json                    ✅ MCP connection to Hub
└── skills/
    └── crm/
        └── scripts/
            ├── crm_local.py     (keep for offline mode)
            └── crm_hub.py       ✅ NEW: Hub-connected CRM
```

### Also in Phase 3
- [ ] Tenant Vault with AES-256-GCM encryption
- [ ] Credit system (balances, transactions, deductions)
- [ ] Service Router (OWN_KEY vs PLATFORM credential resolution)
- [ ] BullMQ queues for all async operations
- [ ] Webhook handlers (Evolution, Stripe, Apify)
- [ ] Telegram bot with /start linking

### Testing Criteria
- [ ] `docker compose up` starts all services
- [ ] Plugin connects to Hub via MCP
- [ ] CRUD operations via MCP tools work with RLS
- [ ] Tenant Vault encrypts/decrypts credentials
- [ ] Credit deduction works for PLATFORM key usage
- [ ] Background scraping job completes and imports results
- [ ] WhatsApp webhook creates contact and logs message
- [ ] Telegram /status returns live data

---

## Phase 4: Strategic Skills + Dashboard (Week 6)

### Goal
Strategic planning/review skills working. Lightweight Dashboard for visual monitoring.

### Deliverables — Skills

```
skills/
├── strategy/
│   └── SKILL.md                 ✅ CEO growth planning (3 modes)
├── audit/
│   ├── SKILL.md                 ✅ Campaign health audit (2-pass)
│   └── review/
│       └── checklist.md         ✅ Audit checklist
├── retro/
│   ├── SKILL.md                 ✅ Weekly retro with metrics
│   └── scripts/
│       └── gather_metrics.py    ✅ Query Hub for stats
└── qa/
    ├── SKILL.md                 ✅ Campaign testing
    └── scripts/
        ├── preview_email.py     ✅ Render email preview
        └── check_deliverability.py ✅ SPF/DKIM/DMARC check
```

### Deliverables — Dashboard

```
dashboard/
├── package.json                 ✅
├── next.config.ts               ✅
├── tailwind.config.ts           ✅
│
├── src/app/
│   ├── layout.tsx               ✅ Root layout + Supabase provider
│   ├── (auth)/
│   │   ├── login/page.tsx       ✅ Login page
│   │   └── signup/page.tsx      ✅ Signup + plan selection
│   ├── (dashboard)/
│   │   ├── layout.tsx           ✅ Dashboard layout + sidebar
│   │   ├── page.tsx             ✅ Overview dashboard
│   │   ├── crm/
│   │   │   ├── page.tsx         ✅ Contact list
│   │   │   └── [id]/page.tsx    ✅ Contact detail + timeline
│   │   ├── campaigns/
│   │   │   ├── page.tsx         ✅ Campaign list
│   │   │   └── [id]/page.tsx    ✅ Campaign detail
│   │   ├── whatsapp/
│   │   │   └── page.tsx         ✅ Instance list + status
│   │   ├── settings/
│   │   │   ├── page.tsx         ✅ General settings
│   │   │   └── connect/page.tsx ✅ Service connections + affiliate links
│   │   └── billing/
│   │       └── page.tsx         ✅ Plan, credits, invoices
│   └── api/                     ✅ API routes (proxy to Hub)
│
└── src/components/              ✅ Shared UI components (shadcn/ui)
```

### Testing Criteria
- [ ] `/strategy EXPAND` produces growth plan with real data from Hub
- [ ] `/audit` runs 2-pass review and identifies issues
- [ ] `/retro` generates weekly report with comparison to previous
- [ ] `/qa` previews email with real lead data and checks deliverability
- [ ] Dashboard login works with Supabase Auth
- [ ] Dashboard shows real data from Hub API
- [ ] Settings page manages API keys
- [ ] Billing page shows plan and credits

---

## Phase 5: Polish + Launch (Weeks 7-8)

### Goal
Production-ready system. Monetization active. Documentation complete.

### Deliverables

```
Final skills:
├── browse/SKILL.md              ✅ Browser automation
└── upgrade/SKILL.md             ✅ Self-updater

Monetization:
├── Stripe products created      ✅ 3 plans + 3 credit packs
├── Checkout flow working        ✅ Upgrade via Dashboard
├── Webhook processing           ✅ Auto-activate plans
├── Affiliate links embedded     ✅ In /onboard wizard
└── Credit purchase flow         ✅ Buy from Dashboard

Production:
├── Supabase project created     ✅ Production database
├── Hub deployed (Railway)       ✅ Docker container
├── Dashboard deployed (Vercel)  ✅ Next.js
├── Evolution deployed (VPS)     ✅ WhatsApp service
├── Domain configured            ✅ solti.app or similar
├── SSL certificates             ✅ Automatic via providers
└── Monitoring                   ✅ Error tracking + uptime

Documentation:
├── README.md                    ✅ Quick start guide
├── CHANGELOG.md                 ✅ Version history
└── User guide                   ✅ How to use each skill

Distribution:
├── plugin.json finalized        ✅ For Claude Code marketplace
├── npm package (optional)       ✅ `npm install solti-plugin`
└── GitHub release               ✅ Tagged v1.0.0
```

### Testing Criteria (End-to-End)
- [ ] New user can: signup → /onboard → /prospect 100 leads → /outreach email → /retro
- [ ] Stripe subscription activates correctly
- [ ] Credit purchase adds credits to balance
- [ ] Affiliate link tracking works
- [ ] WhatsApp agent auto-responds to incoming messages
- [ ] Telegram bot shows live stats
- [ ] Plugin auto-update check works
- [ ] System handles 10 concurrent tenants without issues

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Apify actors change API | Adapter pattern isolates changes; update one adapter file |
| Evolution API breaks | WhatsApp is optional; core lead gen works without it |
| Stripe integration complex | Start with manual plan upgrades, add Checkout later |
| Multi-tenancy bugs | Heavy RLS testing; Supabase has battle-tested RLS |
| Token costs too high | CLI scripts (not MCP) for local ops; haiku for simple tasks |
| User data security | AES-256-GCM vault, per-tenant key derivation, RLS isolation |
| Build takes longer | Phase 1-2 are standalone and valuable; launch early, iterate |

---

## Dependencies Between Phases

```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5
(Plugin)    (Skills)    (Hub)       (Strategy    (Launch)
                                    + Dashboard)

Phase 1-2: No Hub needed (standalone plugin)
Phase 3: Hub required (database, multi-tenancy)
Phase 4: Hub + Dashboard (visual layer)
Phase 5: Everything (production)
```

**Key insight:** Phases 1-2 are independently valuable. A user can use Solti as a standalone Claude Code plugin with just Apify API keys. The Hub adds persistence, multi-tenancy, and monetization, but isn't required for core functionality.
