# Changelog

All notable changes to Solti VR3 are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-03-17

### Added

#### Plugin (solti-plugin/)
- **CLAUDE.md** system kernel with operating rules, cognitive modes, and skill routing
- **16 skills**: onboard, prospect, outreach, publish, deploy, whatsapp, crm, connect, pipeline, strategy, audit, retro, qa, browse, upgrade
- **4 lifecycle hooks**: guardrail_check, cost_guard, validate_output, memory_capture
- **3 CLI utilities**: solti-hub-check, solti-cost-check, solti-update-check
- **2 subagents**: researcher (read-only), copywriter (voice-matched)
- **Context system**: my-business.md, my-voice.md, my-icp.md, my-offer.md
- **Memory system**: MEMORY.md (persistent) + daily logs (auto-captured)
- **Preferences**: args/preferences.yaml with timezone, language, model routing
- **Safety rules**: guardrails.md, memory-protocol.md, cost-protocol.md
- Python scripts for all skills with JSON stdout protocol

#### Service Hub (hub/)
- **Hono HTTP server** on port 4000 with full REST API
- **Prisma ORM** with PostgreSQL (Supabase) — full multi-tenant schema
- **MCP server** with 36 tools over stdio transport (contacts, campaigns, whatsapp, jobs, analytics, settings, credentials, credits)
- **Auth middleware**: Supabase JWT verification + API key auth + tenant resolution
- **Service Router**: OWN_KEY → PLATFORM key fallback with automatic credit deduction
- **Credential Vault**: AES-256-GCM encryption with per-tenant key derivation
- **BullMQ workers**: scraping, email campaigns, WhatsApp campaigns, auto-reply
- **WhatsApp Campaigns Module**: batch sending with rate limiting, session management, auto-reply with AI
- **Credit system**: plan credits (monthly reset), purchased credits (carry over), per-action costs
- **Notification service**: in-app + Telegram delivery with priority levels
- **Webhooks**: Evolution API (WhatsApp), Stripe (payments), Telegram (bot commands), Apify (job results)
- **Stripe integration**: subscription checkout, credit purchases, webhook processing, customer portal
- **Telegram bot**: /start linking, /status, /credits, /help commands
- **Billing routes**: subscription management, credit packages, Stripe portal
- Docker Compose config: Hub + PostgreSQL + Redis + Evolution API

#### Dashboard (dashboard/)
- **Next.js 16.1.6** with Tailwind CSS v4 and dark theme
- **Supabase Auth**: login (email + Google OAuth), signup with plan selection, session middleware
- **Overview page**: real-time metrics from Hub API
- **CRM pages**: contact list + detail view with timeline
- **Campaign pages**: campaign list + detail view with stats
- **WhatsApp page**: instance list with connection status
- **Billing page**: current plan, credit balance, credit packages, transaction history
- **Settings page**: API credentials, Telegram linking, system info
- **Sidebar navigation** with all sections

#### Documentation (docs/)
- 12 specification documents covering vision, architecture, skills catalog, service hub, monetization, database schema, hooks/scripts, integrations, build plan, Claude kernel, references, WhatsApp campaigns
- README.md quick start guide
- CHANGELOG.md (this file)

### Technical Decisions
- **Hono over Express**: Faster, lighter, better TypeScript support
- **Prisma `db push` over migrations**: Production DB on Supabase with RLS policies managed externally
- **BullMQ over cron**: Reliable async job processing with retry, concurrency, and rate limiting
- **MCP over REST for plugin**: Zero-token overhead for tool calls, native Claude Code integration
- **Credit system**: OWN_KEY-first to reward power users, PLATFORM keys for convenience
- **Local-first CRM**: SQLite in Phase 1-2, transparent upgrade to PostgreSQL via Hub in Phase 3+

---

## [Unreleased]

### Planned
- Production deployment (Railway + Vercel)
- Domain configuration (solti.app)
- Error tracking and uptime monitoring
- Claude Code marketplace listing
- npm package distribution
- Integration tests suite
