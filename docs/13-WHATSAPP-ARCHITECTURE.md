# WhatsApp Architecture — Solti VR3

> Version: 1.0.0 | Last updated: 2026-03-19
> Status: PRODUCTION — Funcionando

---

## Arquitectura Final

```
┌─────────────────────┐     Webhook POST      ┌─────────────────────┐
│   EasyPanel (VPS)   │ ──────────────────────→│   Vercel (Next.js)  │
│                     │                        │                     │
│  Evolution API v2   │     HTTP (fetch)       │  /api/webhooks/     │
│  (Baileys)          │ ←──────────────────────│    whatsapp         │
│                     │   sendText, connect,   │                     │
│  Host: evfgat.      │   QR, status, etc.     │  /api/whatsapp/     │
│  easypanel.host     │                        │    instances/       │
└─────────────────────┘                        │    [id]/qr          │
        │                                      │    [id]/status      │
        │ WebSocket                            │    [id]/send        │
        ▼                                      │                     │
┌─────────────────────┐                        │  /lib/evolution.ts  │
│  WhatsApp Servers   │                        │  (cliente directo)  │
│  (Meta)             │                        └──────────┬──────────┘
└─────────────────────┘                                   │
                                                          │ Prisma (directo)
                                                          ▼
                                               ┌─────────────────────┐
                                               │  Supabase Cloud     │
                                               │  PostgreSQL         │
                                               │                     │
                                               │  WhatsappInstance   │
                                               │  WhatsappConversation│
                                               │  WhatsappMessage    │
                                               │  WhatsappBlacklist  │
                                               └─────────────────────┘
```

## Principio Clave

**WhatsApp NO pasa por Railway Hub.** Todo va directo:

- Evolution API (Easypanel) → Webhook → Vercel API Routes → Supabase
- Dashboard (Vercel) → Prisma directo → Supabase
- Auto-reply: Vercel API Route → Claude API → Evolution API

**Railway Hub NO participa** en el flujo de WhatsApp. El poller y el webhook handler del Hub están desactivados.

---

## Componentes

### 1. Evolution API (Easypanel)

- **URL**: `https://evolution-api-evolution-api.evfgat.easypanel.host`
- **API Key**: `429683C4C977415CAAFCCE10F7D57E11`
- **Integración**: `WHATSAPP-BAILEYS`
- **Instancia activa**: `solti-redbot-app-agente-de-ventas-redbot`
- **Número**: `+573019472361`

### 2. Webhook (Vercel)

- **URL configurada en Evolution**: `https://dashboard-nine-iota-21.vercel.app/api/webhooks/whatsapp`
- **Eventos suscritos**: TODOS (array vacío = todos los eventos)
- **Archivo**: `dashboard/src/app/api/webhooks/whatsapp/route.ts`

**Eventos procesados:**
| Evento | Acción |
|--------|--------|
| `messages.upsert` | Guarda mensaje + dispara auto-reply si habilitado |
| `send.message` | Guarda mensaje outbound |
| `connection.update` | Actualiza status de instancia en DB |
| `qrcode.updated` | Guarda QR code en DB |
| Otros | Se ignoran silenciosamente |

### 3. Cliente Evolution (Vercel)

- **Archivo**: `dashboard/src/lib/evolution.ts`
- **Funciones**:
  - `createInstance(name, webhookUrl)` — Crea instancia con webhook incluido
  - `deleteInstance(name)` — Elimina instancia
  - `getConnectionState(name)` — Estado de conexión
  - `getQRCode(name)` — Obtiene QR para escanear
  - `fetchInstances()` — Lista todas las instancias
  - `setWebhook(name, url)` — Configura webhook
  - `sendText(instance, number, text)` — Envía mensaje de texto
  - `findMessages(instance, opts)` — Busca mensajes

### 4. Auto-Reply (Vercel)

- **Archivo**: `dashboard/src/app/api/webhooks/whatsapp/route.ts` (función `processAutoReply`)
- **Modelo IA**: `claude-haiku-4-5-20251001`
- **API Key**: Lee de `TenantCredential` (servicio `anthropic`) o fallback a `process.env.ANTHROPIC_API_KEY`
- **Sin Redis, sin BullMQ** — ejecución inline en la serverless function

**Flujo del auto-reply:**
1. Webhook inbound llega a Vercel
2. Busca instancia en DB → verifica `autoReply: true`
3. Carga historial de conversación (últimos N mensajes)
4. Llama a Claude API con `systemPrompt` + `additionalContext` + historial
5. Envía respuesta via `sendText(instance, remoteJid, reply)`
6. Guarda respuesta en DB como `WhatsappMessage`

### 5. Dashboard Pages (Vercel)

Todas las páginas de WhatsApp usan **Prisma directo** (NO hubFetch):

| Página | Archivo | Qué hace |
|--------|---------|----------|
| `/whatsapp` | `page.tsx` | Lista instancias (Prisma + syncInstances) |
| `/whatsapp/[id]` | `[id]/page.tsx` | Detalle + configuración (Prisma + getAuthContext) |
| Server actions | `server-actions.ts` | CRUD, sync, QR, delete (Prisma + Evolution directa) |

### 6. Server Actions

- **Archivo**: `dashboard/src/app/whatsapp/server-actions.ts`
- **Auth**: `getAuthContext()` → Supabase session → `tenantId`
- **Funciones**:
  - `getInstance(id)` — Busca instancia por ID y tenant
  - `updateInstanceConfig(id, data)` — Actualiza systemPrompt, autoReply, etc.
  - `createInstance(name)` — Crea en Evolution + DB con webhook auto-configurado
  - `deleteInstance(id)` — Elimina de Evolution + DB
  - `getInstanceQR(id)` — Obtiene QR de Evolution
  - `getInstanceStatus(id)` — Estado live de Evolution
  - `syncInstances()` — Sincroniza Evolution → DB

---

## Configuración de Instancia (DB)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `instanceName` | string | Nombre en Evolution (ej: `solti-redbot-app-agente-de-ventas-redbot`) |
| `status` | string | CONNECTED, DISCONNECTED, CONNECTING |
| `autoReply` | boolean | Si el agente responde automáticamente |
| `systemPrompt` | text | Prompt principal del agente (MD) |
| `additionalContext` | text | Contexto adicional (info de empresa, links, etc.) |
| `maxHistoryMsgs` | int | Mensajes de historial para contexto (default: 10) |
| `maxTokens` | int | Max tokens de respuesta (default: 500) |
| `fallbackMsg` | text | Mensaje si Claude API falla |
| `cooldownSecs` | int | Segundos mínimos entre respuestas (default: 60) |
| `phoneNumber` | string | Número vinculado |
| `connectedAt` | datetime | Fecha de última conexión |

---

## Tenant Correcto

**CRÍTICO**: El Dashboard resuelve el tenant via Supabase Auth (`getAuthContext()`), NO via API key del Hub.

| Contexto | Tenant ID | Slug |
|----------|-----------|------|
| Dashboard (Supabase Auth) | `ad6eaea7-95fe-444d-8a17-9954a27a8e52` | `redbot` |
| Hub API Key (legacy) | `ece67bfc-9fcd-45fb-b7cc-853c854626bf` | `redbot-app` |

**Todas las operaciones de WhatsApp usan el tenant `redbot` (`ad6eaea7`).**

---

## Formato @lid (WhatsApp Link ID)

WhatsApp ahora usa dos formatos de `remoteJid`:

| Formato | Ejemplo | Cuándo |
|---------|---------|--------|
| `@s.whatsapp.net` | `573001234567@s.whatsapp.net` | Números directos |
| `@lid` | `280336944619630@lid` | Link ID (contactos nuevos) |

**Regla**: SIEMPRE usar `remoteJid` completo para enviar mensajes. Nunca el número limpio.

```typescript
// ✅ Correcto
await sendText(instance, '280336944619630@lid', text)
await sendText(instance, '573001234567@s.whatsapp.net', text)

// ❌ Incorrecto — falla silenciosamente con @lid
await sendText(instance, '280336944619630', text)
```

---

## Cómo Crear una Nueva Instancia

1. Dashboard → WhatsApp → "Nueva Instancia"
2. Ingresa nombre → Click "Crear"
3. Se crea en Evolution con webhook auto-configurado a Vercel
4. Escanea QR con WhatsApp
5. Al conectar por primera vez, se activa autoReply con prompt por defecto
6. Ve a Configurar → sube tu prompt MD → Guardar

---

## Qué NO Hacer

1. **NO** crear instancias desde Evolution Manager directamente — no tendrán tenant en la DB
2. **NO** configurar webhooks apuntando a Railway Hub — solo a Vercel
3. **NO** activar el poller del Hub (`message-poller.ts` está desactivado)
4. **NO** usar el API key del Hub para operaciones de WhatsApp — usar Supabase Auth
5. **NO** enviar mensajes usando el número limpio — usar remoteJid completo con @lid o @s.whatsapp.net
6. **NO** asumir que el tenant del API key es el mismo que el del Dashboard

---

## Troubleshooting

| Síntoma | Causa probable | Solución |
|---------|---------------|----------|
| "Instancia no encontrada" | Tenant mismatch | Verificar `getAuthContext()` → `tenantId` vs instancia en DB |
| Agente no responde | `autoReply: false` o `systemPrompt: null` | Verificar en DB, configurar desde Dashboard |
| Responde con info incorrecta | Poller de Railway activo | Verificar que `message-poller.ts` está desactivado en `hub/src/index.ts` |
| Webhook no llega | Webhook no configurado en Evolution | Verificar con `GET /webhook/find/{instance}` |
| QR no aparece | Instancia desconectada | Llamar `GET /instance/connect/{instance}` para generar QR |
| Mensajes no se guardan | Formato de evento no reconocido | Verificar normalización: `messages.upsert`, `MESSAGES_UPSERT`, etc. |
