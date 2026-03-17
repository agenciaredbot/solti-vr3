# Solti Memory

> Core facts and persistent context. Max ~200 lines.

## User Profile
- **Name:** Andrés
- **Role:** Solo founder & full-stack developer
- **Business:** Redbot — A.I. Para Inmobiliarias (redbot.app)
- **Location:** Colombia
- **Language:** Spanish (es), tutear siempre

## Business Summary
- SaaS multi-tenant para inmobiliarias colombianas
- Chat IA + CRM + catálogo web por suscripción
- Pricing: Starter $89.900, Power $199.000, Omni $399.000 COP/mes
- Stack: Next.js 16, React 19, Supabase, Claude API, Vercel
- Estado: MVP con 10 fases completadas, pre-lanzamiento beta

## ICP Summary
- Inmobiliarias pequeñas (1-10 personas) en Colombia
- Foco geográfico: Cundinamarca (Bogotá, Chía, Cajicá, Zipaquirá, Soacha)
- Pain principal: Pierden leads por demora en respuesta
- Canal clave: WhatsApp

## Onboarding Status
- [x] BUSINESS — context/my-business.md ✓
- [x] VOICE — context/my-voice.md ✓
- [x] ICP — context/my-icp.md ✓
- [x] OFFER — context/my-offer.md ✓
- [x] CONNECT — 4/5 APIs configuradas (ver abajo)

## Prospect Pipeline (2026-03-15)
- Scraped: 10 inmobiliarias en Chía, Cundinamarca
- Enriched: 9/10 con email, 10/10 con teléfono
- Scored: 9 hot (≥80), 1 warm (60-79), avg 82.5
- Imported: 10 contacts en data/contacts.db

## Key Metrics
- Total contacts: 10
- Pipeline: 10 NEW
- Avg score: 82.5

## Connected APIs (Phase 2)
| Service | Status | Env Var | Verified |
|---------|--------|---------|----------|
| Apify | ✅ Connected | APIFY_API_TOKEN | Scraping 10 contacts |
| Brevo | ✅ Connected | BREVO_API_KEY | 2 emails sent, DKIM ✅ |
| getLate | ✅ Connected | GETLATE_API_TOKEN | 12 accounts listed |
| Evolution | ✅ Connected | EVOLUTION_API_KEY + EVOLUTION_API_URL | WhatsApp msg sent+received |
| PhantomBuster | ⏸️ Postponed | — | Pending subscription decision |

## API Gotchas
- **Brevo**: Key is `xkeysib-...` format (user had it base64-encoded in JWT)
- **getLate**: Base URL is `https://getlate.dev/api/v1` (NOT api.getlate.com)
- **getLate posting**: Use `platforms` array (not `accountIds`), media via `mediaItems` with presigned URLs
- **Evolution**: Hosted on VPS (EasyPanel), NOT localhost. URL: EVOLUTION_API_URL env var
- **Evolution shared**: Same instance hosts Redbot production — Solti uses `solti-` prefix only
- **Evolution messages**: `POST /chat/findMessages/{instance}` with JSON body (not GET)
- **Evolution settings**: `POST /settings/set/{instance}` (not PUT /instance/settings/)
- **Evolution state**: Response is `{instance: {state: "open"}}` — state nested inside instance obj
- **Apify**: Actor IDs use `~` not `/` in URL paths

## Hub Connection (Phase 3)
- **Hub URL:** `http://localhost:4000` (dev) — set `SOLTI_HUB_URL`
- **Plugin API Key:** `sk_solti_6954089f1c2f062e93e629d47bc676f5fe664a53478a7471` — set `SOLTI_API_KEY`
- **Tenant:** redbot-app (ID: `ece67bfc-9fcd-45fb-b7cc-853c854626bf`)
- **DB:** Supabase (Solti-Vr3 project, 28 tables with RLS)
- **Credentials:** 4 API keys encrypted in Tenant Vault (AES-256-GCM)
- **Hub scripts:** `crm_hub.py`, `whatsapp_hub.py`, `services_hub.py` (all use `hub_client.py`)
- **Mode detection:** `bin/solti-hub-check` → Hub ONLINE → use `*_hub.py` scripts; OFFLINE → local fallback

## Hub API Endpoints (Phase 3D)
- `POST /api/v1/services/execute` — Route to any adapter (apify, brevo, evolution, getlate)
- `GET/POST/PATCH/DELETE /api/v1/contacts` — CRM CRUD + search + bulk + tags
- `GET/POST/DELETE /api/v1/whatsapp/instances` — WhatsApp instance management
- `GET/POST/PATCH/DELETE /api/v1/campaigns` — Campaign management
- `GET/POST/DELETE /api/v1/credentials` — Vault credential management
- `GET/POST /api/v1/jobs` — Async job management
- `GET /api/v1/analytics/dashboard` — Dashboard summary

## Phase 4 — Strategic Skills & Dashboard
- **4 new skills:** `/strategy`, `/audit`, `/retro`, `/qa` — all with SKILL.md + Python scripts
- **MCP Server:** `hub/src/mcp/server.ts` — 20 tools exposing full Hub API via stdio transport
- **MCP Config:** `solti-plugin/mcp-config.json` — ready to add to Claude Code settings
- **Dashboard:** Next.js 16 app at `dashboard/` — 3 pages (Dashboard, Contactos, Campañas)
  - Connects to Hub API via server-side fetch + rewrite proxy
  - Dark theme, Tailwind 4, runs on port 3001
- **Deliverability:** theredbot.com SPF ✅, DKIM ❌ needs Brevo DKIM config, DMARC ⚠️ p=none

## getLate Integration — Verified ✅ (2026-03-16)
- Full pipeline tested: Plugin → MCP → Hub → getLate API → YouTube ✅
- 12 accounts connected across 8 platforms
- Video upload tested: 69 MB MP4 uploaded successfully to Cloudflare R2
- Post published to YouTube Shorts @redbotv3 ✅
- Direct HTTP, MCP tools, and Python scripts all verified working

## Critical Lessons Learned (getLate):
1. Field `content` not `text` for post body
2. Platform array: `{accountId, platform}` not `{platformAccountId, platformId}`
3. `publishNow: true` required for immediate publish (otherwise stays draft)
4. `scheduledFor` not `scheduledAt` for scheduling
5. presign_media returns `url` (upload) + `mediaUrl` (public) — different URLs!
6. YouTube requires video content, text-only fails
7. Hub error handler hides details in production — check dev mode for debugging
8. Video upload timeout: 10 minutes for files up to 500 MB

## Account IDs Reference
| Platform | Account ID | Label |
|----------|-----------|-------|
| googlebusiness | 69b0aa4adc8cab9432cae132 | Redbot Grupo V3 |
| instagram | 69b09b01dc8cab9432caaeee | @redbot.io |
| instagram | 69b09c6ddc8cab9432cab3b5 | @vinnigarcia |
| linkedin | 69b0a2c0dc8cab9432cac5c6 | Redbot |
| linkedin | 69b09dd0dc8cab9432cab773 | Santiago |
| tiktok | 69b0a36cdc8cab9432cac7a3 | @redbot.io |
| tiktok | 69b09ceedc8cab9432cab4d2 | @contentu |
| youtube | 69b0a2a6dc8cab9432cac57b | @redbotv3 |
| youtube | 69b0a486dc8cab9432cacd9b | @contentuio |
| facebook | 69b09fc7dc8cab9432cabbe5 | vinnigarcia |
| twitter | 69b0a0b8dc8cab9432cabe3d | @SantiagoViniG |
| threads | 69b0a1cfdc8cab9432cac1cb | @vinnigarcia |

## Lessons Learned
- Local SQLite CRM works well for Phase 1 testing
- Always run enrichment before scoring for better results
- Enable `syncFullHistory` + `readMessages` on new Evolution instances to capture inbound messages
- Use Python urllib (not curl) for Evolution API calls — avoids shell escaping issues with JSON
- Prisma JSON fields reject `Record<string, unknown>` — use `Record<string, string | number | boolean>` or cast
- Supabase pooler URL (pgbouncer) doesn't support DDL — use `DIRECT_URL` for migrations/seeds
