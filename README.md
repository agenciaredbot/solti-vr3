# Solti VR3 — Autonomous Growth Engine

> AI-powered growth engine for solopreneurs, growth hackers, and small marketing teams.

Solti unifies lead generation, multi-channel outreach, social publishing, WhatsApp automation, and CRM into a single AI agent operated via natural language through Claude Code.

---

## Architecture

```
Claude_Solti_vr3/
├── solti-plugin/     ← Claude Code plugin (16 skills, hooks, agents)
├── hub/              ← Service Hub (Hono + Prisma + BullMQ + MCP)
├── dashboard/        ← Web dashboard (Next.js 16 + Tailwind v4)
└── docs/             ← Full system documentation (12 specs)
```

### Three-Layer Design

| Layer | Tech | Purpose |
|-------|------|---------|
| **Plugin** | Claude Code + Python scripts | AI orchestration, skill execution, local-first CRM |
| **Hub** | Hono, Prisma, PostgreSQL, Redis, BullMQ | Multi-tenant API, credential vault, job queues, MCP server |
| **Dashboard** | Next.js 16, Supabase Auth, Tailwind v4 | Visual monitoring, billing, settings |

---

## Quick Start

### 1. Plugin Only (No server needed)

```bash
cd solti-plugin
bash setup.sh
```

Then in Claude Code:
```
/onboard    # First-time setup wizard
/prospect   # Generate leads from Google Maps, LinkedIn, etc.
/publish    # Create and schedule social media content
```

### 2. Full Stack (Hub + Dashboard)

```bash
# Terminal 1 — Hub
cd hub
cp .env.example .env   # Fill in your keys
npm install
npx prisma db push
npm run dev             # → http://localhost:4000

# Terminal 2 — Dashboard
cd dashboard
cp .env.example .env.local   # Fill in Supabase + Hub URL
npm install
npm run dev                  # → http://localhost:3001
```

### 3. Docker (Production)

```bash
cd hub
docker compose up -d   # Hub + PostgreSQL + Redis + Evolution API
```

---

## Skills

### Core Growth
| Skill | Command | Description |
|-------|---------|-------------|
| Onboard | `/onboard` | 5-phase setup wizard (business, voice, ICP, offer, connections) |
| Prospect | `/prospect` | Lead generation & enrichment via Apify, PhantomBuster |
| Outreach | `/outreach` | Multi-channel sequences (email, Instagram DM, LinkedIn, WhatsApp) |
| Publish | `/publish` | Social media content creation & scheduling via getLate |
| Deploy | `/deploy` | Campaign launcher with 8-step pre-flight checks |
| WhatsApp | `/whatsapp` | WhatsApp agent management via Evolution API |
| CRM | `/crm` | Contact & pipeline management (SQLite local or Hub PostgreSQL) |
| Connect | `/connect` | Service credential manager |
| Pipeline | `/pipeline` | Full funnel automation (prospect → outreach → nurture) |

### Strategic
| Skill | Command | Description |
|-------|---------|-------------|
| Strategy | `/strategy` | Growth planning (EXPAND / HOLD / REDUCE modes) |
| Audit | `/audit` | Campaign & system health check (2-pass review) |
| Retro | `/retro` | Weekly review with metrics and trends |
| QA | `/qa` | Campaign testing before sending |

### Meta
| Skill | Command | Description |
|-------|---------|-------------|
| Browse | `/browse` | Browser automation for scraping & QA via Apify |
| Upgrade | `/upgrade` | Self-updater with backup & rollback |

---

## Service Hub (MCP)

The Hub exposes **36 MCP tools** over stdio transport, organized by domain:

- `solti_contact_*` — CRM operations (create, search, update, timeline)
- `solti_campaign_*` — Campaign management (create, launch, pause, stats)
- `solti_whatsapp_*` — WhatsApp instances (create, connect, status, send)
- `solti_job_*` — Background job management (status, cancel, retry)
- `solti_analytics_*` — Metrics, costs, and reporting
- `solti_settings_*` — Configuration management
- `solti_credentials_*` — Encrypted API key storage
- `solti_credits_*` — Credit balance, transactions, packages

### Service Router

The Hub routes API calls through a smart credential resolver:

1. **OWN_KEY** — Use tenant's own API key (no credit cost)
2. **PLATFORM** — Fall back to shared platform key (deducts credits)
3. **Error** — No key available, prompt user to `/connect`

---

## Monetization

### Plans

| Plan | Monthly | Credits | Target |
|------|---------|---------|--------|
| Free | $0 | 10 | Trial users |
| Pro | $29 | 50 | Solopreneurs |
| Growth | $79 | 200 | Growing teams |
| Agency | $499 | 500 | Agencies |

### Credit Packs (One-Time)

| Pack | Price | Per Credit |
|------|-------|------------|
| 10 credits | $2 | $0.20 |
| 100 credits | $10 | $0.10 |
| 500 credits | $40 | $0.08 |
| 2,000 credits | $120 | $0.06 |

Credits are consumed only when using **platform keys**. Bring your own API keys = unlimited usage at no credit cost.

---

## Integrations

| Service | Purpose | Credential |
|---------|---------|------------|
| **Apify** | Web scraping, lead generation, browser automation | `APIFY_API_KEY` |
| **Brevo** | Email campaigns & transactional email | `BREVO_API_KEY` |
| **Evolution API** | WhatsApp Web automation | `EVOLUTION_API_URL` + `EVOLUTION_API_KEY` |
| **getLate** | Social media scheduling (12 platforms) | `GETLATE_API_KEY` |
| **PhantomBuster** | LinkedIn automation | `PHANTOMBUSTER_API_KEY` |
| **Stripe** | Payments & subscriptions | `STRIPE_SECRET_KEY` |
| **Supabase** | Authentication & database | `SUPABASE_URL` + `SUPABASE_ANON_KEY` |
| **Telegram** | Bot notifications & alerts | `TELEGRAM_BOT_TOKEN` |

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Plugin runtime | Claude Code (Anthropic) |
| Scripts | Python 3.11+ |
| Hub framework | Hono (TypeScript) |
| Database | PostgreSQL (Supabase) |
| ORM | Prisma |
| Queue | BullMQ + Redis |
| Dashboard | Next.js 16.1.6 |
| Styling | Tailwind CSS v4 |
| Auth | Supabase Auth (@supabase/ssr) |
| Payments | Stripe SDK v17+ |
| Protocol | Model Context Protocol (MCP) |

---

## Documentation

Full specs are in `docs/`:

| Doc | Content |
|-----|---------|
| [01-VISION](docs/01-VISION.md) | Philosophy and design principles |
| [02-ARCHITECTURE](docs/02-ARCHITECTURE.md) | System architecture and data flow |
| [03-SKILLS-CATALOG](docs/03-SKILLS-CATALOG.md) | All 16 skills with detailed specs |
| [04-SERVICE-HUB](docs/04-SERVICE-HUB.md) | Hub API, MCP tools, middleware |
| [05-MONETIZATION](docs/05-MONETIZATION.md) | Plans, credits, affiliate model |
| [06-DATABASE-SCHEMA](docs/06-DATABASE-SCHEMA.md) | Full Prisma schema documentation |
| [07-HOOKS-AND-SCRIPTS](docs/07-HOOKS-AND-SCRIPTS.md) | Lifecycle hooks and script protocol |
| [08-INTEGRATIONS](docs/08-INTEGRATIONS.md) | Third-party service adapters |
| [09-BUILD-PLAN](docs/09-BUILD-PLAN.md) | 5-phase build plan |
| [10-CLAUDE-KERNEL](docs/10-CLAUDE-KERNEL.md) | CLAUDE.md design and operating rules |
| [11-REFERENCES](docs/11-REFERENCES.md) | External references and inspiration |
| [12-WHATSAPP-CAMPAIGNS](docs/12-WHATSAPP-CAMPAIGNS-SPEC.md) | WhatsApp campaign module spec |

---

## Project Status

- **Phase 1** ✅ Plugin skeleton (CLAUDE.md, hooks, bin, 3 skills)
- **Phase 2** ✅ Core skills (all 16 skills with scripts)
- **Phase 3** ✅ Service Hub + multi-tenancy (MCP, Prisma, BullMQ, webhooks)
- **Phase 4** ✅ Strategic skills + Dashboard (auth, billing, settings)
- **Phase 5** ✅ Polish + launch (Stripe, browse/, upgrade/, docs)

---

## License

Proprietary — Redbot Group V3. All rights reserved.
