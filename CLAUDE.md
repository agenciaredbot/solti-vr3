# Solti VR3 — Project Memory

## Project Overview
Multi-tenant SaaS growth engine: Plugin (Claude Code) + Hub (Hono/Railway) + Dashboard (Next.js/Vercel).

## Architecture
- **Plugin**: `solti-plugin/` — 16 skills, Claude Code
- **Hub**: `hub/` — Hono + Prisma + BullMQ, deployed on Railway (`solti-vr3-production.up.railway.app`)
- **Dashboard**: `dashboard/` — Next.js 16, deployed on Vercel (`dashboard-nine-iota-21.vercel.app`)
- **Evolution API**: Hosted on Easypanel (`evolution-api-evolution-api.evfgat.easypanel.host`)
- **Database**: Supabase PostgreSQL (`akbmuieaxehylenorags.supabase.co`)
- **Redis**: Railway internal (`redis.railway.internal:6379`)

## Critical Env Vars
- Hub Railway: `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `ANTHROPIC_API_KEY`, `PLATFORM_APIFY_KEY`
- Dashboard Vercel: `NEXT_PUBLIC_HUB_URL`, `SOLTI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `ANTHROPIC_API_KEY`, `DATABASE_URL`, `DIRECT_URL`
- Evolution API key: `429683C4C977415CAAFCCE10F7D57E11`

## Tenant Info
- Default tenant: `ece67bfc-9fcd-45fb-b7cc-853c854626bf` (slug: `redbot-app`)
- API Key: `sk_solti_d8b50141c2be30446f32abaa664da6caeda75dc71b602b50`
- User: `agencia@theredbot.com`

---

## LESSONS LEARNED — Errores y Soluciones

### 1. Evolution API: Webhooks NO funcionan para mensajes inbound (CRÍTICO)
**Problema**: Evolution API v2 (Baileys) configura webhooks correctamente (`enabled: true`, URL correcta, eventos incluyendo `MESSAGES_UPSERT`) pero NUNCA dispara webhooks para mensajes entrantes. Solo dispara para outbound (`send.message`).
**Diagnóstico**: Los mensajes SÍ aparecen en `chat/findMessages` con `fromMe: false`, pero el webhook nunca se ejecuta.
**Solución**: Mover el manejo de webhooks directamente a Vercel API routes en vez de Railway Hub. Esto funcionó porque aparentemente el problema era la latencia/conectividad entre Evolution y Railway. Evolution → Vercel funciona.
**Lección**: Si Evolution webhooks no llegan, primero verificar con `curl` manual al endpoint destino. Si el manual funciona pero los reales no, el problema puede ser networking entre los hosts.

### 2. WhatsApp @lid Format (Link ID) — Formato nuevo de JID
**Problema**: WhatsApp ahora usa formato `@lid` (Link ID) para algunos contactos en vez del clásico `@s.whatsapp.net`. Ejemplo: `280336944619630@lid`.
**Impacto**:
- El número extraído (`280336944619630`) NO es un número telefónico real
- `sendText(instance, "280336944619630", text)` falla silenciosamente en Evolution
- Solo funciona si envías el remoteJid completo: `sendText(instance, "280336944619630@lid", text)`
**Solución**: Guardar y usar el `remoteJid` completo para enviar respuestas. Al extraer phone para la DB, usar: `remoteJid.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '')`
**Lección**: SIEMPRE usar remoteJid completo para enviar mensajes via Evolution, nunca el phone limpio.

### 3. autoReply NO se activa automáticamente al crear instancia
**Problema**: Al crear una instancia de WhatsApp desde el Dashboard, `autoReply` queda en `false` y `systemPrompt` en `null`. El usuario configura todo pero los cambios no se persisten correctamente o se pierden al recrear la instancia.
**Solución**: Auto-activar `autoReply` con un prompt por defecto cuando la instancia se conecta por primera vez (`CONNECTION_UPDATE` con `state: open` y sin `systemPrompt` previo).
**Lección**: Siempre verificar el estado en la DB después de guardar configuración. No confiar en que el Dashboard guardó correctamente.

### 4. Dashboard Auth: hubClientFetch (client-side JWT) da 401
**Problema**: Las llamadas del Dashboard al Hub usando `hubClientFetch` (fetch desde el browser con JWT de Supabase) devolvían 401 porque el Hub espera `x-api-key` header, no JWT Bearer.
**Solución**: Usar **server actions** en vez de client-side fetch. El patrón correcto es: componente client → server action → `hubFetch` (server-side con API key).
**Lección**: NUNCA usar fetch client-side al Hub. Siempre server actions.

### 5. Evolution Adapter: `params.instance` vs `params.instanceName`
**Problema**: Las rutas del Hub envían `params.instanceName` pero el adapter de Evolution esperaba `params.instance`. Causaba que get_qr, connection_state, send_text, etc. fallaran con `undefined` como nombre de instancia.
**Solución**: Crear helper `inst(params)` que acepta `instanceName`, `instance`, o `name`.
**Lección**: Al crear adapters, normalizar los parámetros de entrada con un helper.

### 6. Prisma: `orderBy: { createdAt }` en modelos que usan `sentAt`
**Problema**: El modelo `Notification` usa `sentAt` (no `createdAt`) para ordenar. Causa error de Prisma en runtime.
**Lección**: SIEMPRE verificar el schema.prisma antes de escribir queries con `orderBy`.

### 7. Railway vs Vercel para WhatsApp
**Problema**: Railway como intermediario entre Evolution y el Dashboard añadía complejidad innecesaria (Redis, BullMQ, workers). Los webhooks no llegaban de forma fiable.
**Solución final**: Mover toda la lógica de WhatsApp a Vercel API routes:
  - `/api/webhooks/whatsapp` — recibe webhooks de Evolution
  - `/api/whatsapp/instances` — CRUD de instancias
  - `/api/whatsapp/instances/[id]/qr` — QR code
  - `/api/whatsapp/instances/[id]/status` — estado de conexión
  - `/api/whatsapp/instances/[id]/send` — enviar mensajes
  - `/lib/evolution.ts` — cliente directo a Evolution API
**Lección**: Para WhatsApp, la arquitectura más simple gana: Evolution → Vercel → Supabase directo. Sin Redis, sin BullMQ, sin intermediarios.

### 8. Stripe SDK v17+ Response Wrapper
**Problema**: `stripe.subscriptions.retrieve()` devuelve `Response<Subscription>`, no `Subscription` directamente. Campos como `current_period_start` no existen en el wrapper.
**Solución**: Usar `as any` type assertion.
**Lección**: Stripe SDK v17+ cambió los tipos de retorno.

### 9. Tenant model no tiene campo `email`
**Problema**: `tenant.email` no existe. El email está en `tenant.members[0].email`.
**Lección**: Verificar schema antes de acceder a campos.

### 10. Prisma JSON fields: InputJsonValue incompatibility
**Problema**: `Record<string, unknown>` no es asignable a Prisma's `InputJsonValue`.
**Solución**: Usar `JSON.parse(JSON.stringify(obj))` para convertir.

---

### 11. Dos tenants con el mismo usuario — tenant mismatch
**Problema**: El usuario `agencia@theredbot.com` tenía dos tenants: `redbot` (ad6eaea7) creado por Supabase signup, y `redbot-app` (ece67bfc) creado por el seed/API key. La API key resolvía a `redbot-app` pero el Dashboard (Supabase auth) resolvía a `redbot`. Las instancias se creaban en un tenant y se buscaban en otro.
**Solución**: Mover datos al tenant que usa el Dashboard (`redbot` / `ad6eaea7`).
**Lección**: SIEMPRE verificar qué tenantId resuelve `getAuthContext()` antes de crear datos. No asumir que el API key y el Dashboard usan el mismo tenant.

---

## Database Notes
- Usar `prisma db push` (NUNCA `prisma migrate`) — la DB de producción tiene RLS policies manejadas por Supabase externamente
- Agregar `--accept-data-loss` flag cuando hay cambios destructivos
- DIRECT_URL (sin pgbouncer) para `db push`, DATABASE_URL (con pgbouncer) para runtime

## Deploy Commands
- **Hub**: `cd hub && railway up --detach` (o push a main, Railway auto-deploys)
- **Dashboard**: `cd dashboard && vercel --prod --force`
- **Schema changes**: `cd hub && npx prisma db push --accept-data-loss`

## Key Design Decisions
- **OWN_KEY first**: Service router uses tenant's own API key (free), falls back to PLATFORM key (costs credits)
- **Server actions over client fetch**: Dashboard uses server actions for all Hub communication
- **WhatsApp via Vercel**: Direct Evolution → Vercel architecture, bypassing Railway Hub
- **Credit system**: Plan credits (monthly reset) + purchased credits (carry over)
