# SOLTI VR3 — WhatsApp Campaigns Module (Full Spec)

> Version: 1.0.0 | Last updated: 2026-03-17

---

## Overview

Sistema completo de campañas masivas vía WhatsApp usando Evolution API v2.
Cada tenant puede configurar hasta 2 instancias con rotación inteligente.

**Capacidades:**
- Campañas masivas con rate limiting conservador anti-baneo
- Soporte multimedia (imágenes, videos, documentos, audio)
- Auto-reply con IA (Claude Haiku) basado en system prompt del negocio
- Segmentación por listas existentes, filtros dinámicos, o combinación
- Tracking en tiempo real (sent, delivered, read, replied)
- Notificaciones Telegram + Dashboard

---

## Sección 1: Arquitectura General

### Componentes principales

```
┌─────────────────────────────────────────────────────┐
│                    Dashboard                         │
│  Campaign Builder │ Instance Manager │ Media Upload  │
│  Notification Bell │ Campaign Stats                  │
└─────────────────────┬───────────────────────────────┘
                      │ REST API + WebSocket
                      ▼
┌─────────────────────────────────────────────────────┐
│                     Hub                              │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐│
│  │  Campaign     │  │  Send Queue  │  │  Webhook   ││
│  │  Engine       │  │  (BullMQ)    │  │  Receiver  ││
│  └──────┬───────┘  └──────┬───────┘  └──────┬─────┘│
│         │                 │                  │       │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────┴─────┐│
│  │  Auto-Reply  │  │  Media       │  │  Notif.    ││
│  │  Service     │  │  Service     │  │  Service   ││
│  └──────────────┘  └──────────────┘  └────────────┘│
│                                                      │
│  ┌──────────────────────────────────────────────────┐│
│  │  Evolution Adapter (updated)                     ││
│  └──────────────────────────────────────────────────┘│
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│  Evolution API (VPS) — WhatsApp Web instances       │
│  Instance 1: solti-{tenantId}-1                     │
│  Instance 2: solti-{tenantId}-2                     │
└─────────────────────────────────────────────────────┘
```

### Instancias por tenant

- Máximo 2 instancias de WhatsApp por tenant
- Naming: `solti-{tenantId}-1`, `solti-{tenantId}-2`
- Rotación round-robin para campañas grandes
- Si una cae, la otra absorbe el tráfico

---

## Sección 2: Campaign Engine — Flujo de Campañas

### Ciclo de vida de una campaña WhatsApp

```
CREATE → DRAFT → LAUNCH → SENDING → PAUSED ↔ RESUMED → COMPLETED
                                        ↓
                                      FAILED
```

### Crear campaña (POST /api/v1/campaigns)

```typescript
{
  type: "whatsapp",
  name: "Campaña inmobiliarias Chía",
  instanceIds: ["solti-1", "solti-2"],  // rotación entre ambas
  message: {
    text: "Hola {{firstName}}, soy {{businessName}}...",
    mediaUrl?: "https://...",           // opcional, del Media Service
    mediaType?: "image" | "video" | "document"
  },
  recipients: {
    // Opción A: lista existente
    listId?: "list-123",
    // Opción B: filtros dinámicos
    filters?: {
      tags?: ["inmobiliaria", "chia"],
      scoreMin?: 70,
      status?: ["NEW", "CONTACTED"],
      city?: "Chía",
      customFields?: { industry: "real_estate" }
    },
    // Opción C: ambos (lista + filtro adicional)
    // listId + filters se combinan con AND
  },
  settings: {
    delayBetweenMessages: 5,        // segundos (3-15)
    maxPerHourPerInstance: 60,       // (30-80)
    maxPerDayPerInstance: 500,       // (100-1000)
    sendingWindowStart: "08:00",     // hora local tenant
    sendingWindowEnd: "20:00",
    maxConsecutiveFailures: 3,       // pausa automática
    cooldownMinutes: 30,             // después de pausa
    timezone: "America/Bogota"
  }
}
```

### Resolución de destinatarios

Cuando se lanza la campaña, el engine:
1. Si hay `listId` → trae los miembros de la lista
2. Si hay `filters` → consulta contacts con esos filtros
3. Si hay ambos → intersección (miembros de la lista QUE además cumplen filtros)
4. Valida números de teléfono (formato colombiano, no duplicados, no en blacklist)
5. Crea `CampaignRecipient` para cada uno con status `PENDING`

### Pause / Resume

- **Pause** (`POST /campaigns/:id/pause`): Cambia status a `PAUSED`, los jobs en cola se detienen al verificar estado antes de enviar.
- **Resume** (`POST /campaigns/:id/resume`): Cambia status a `SENDING`, re-encola solo los recipients con status `PENDING` desde donde quedó. Respeta el conteo diario acumulado.

### Tracking en tiempo real

La campaña mantiene un objeto `stats` en JSONB:

```typescript
{
  total: 150,
  sent: 87,
  delivered: 72,
  read: 45,
  replied: 12,
  failed: 3,
  pending: 60
}
```

Se actualiza en tiempo real desde el Send Queue (sent/failed) y desde el Webhook Receiver (delivered/read/replied).

---

## Sección 3: Send Queue — BullMQ con Rate Limiting y Rotación

### Cola dedicada: `solti:whatsapp-send`

```
Campaign Engine (launch)
        │
        ▼
  ┌─────────────────────────────────────┐
  │  solti:whatsapp-send (BullMQ)       │
  │                                     │
  │  Job = 1 mensaje a 1 destinatario   │
  │  Concurrency: 1 (serial por diseño) │
  │                                     │
  │  Rate Limiter:                      │
  │  ├─ max 1 job cada 5s (delay)       │
  │  ├─ max 60/hora/instancia           │
  │  └─ max 500/día/instancia           │
  │                                     │
  │  Instance Rotator:                  │
  │  ├─ Job 1 → solti-1                 │
  │  ├─ Job 2 → solti-2                 │
  │  ├─ Job 3 → solti-1                 │
  │  └─ ...round-robin                  │
  └──────────┬──────────────────────────┘
             │
             ▼
      Evolution Adapter
      (send_text / send_media)
```

### Estructura del Job

```typescript
{
  campaignId: "camp-123",
  recipientId: "rec-456",
  contactId: "contact-789",
  phone: "573001234567",
  message: {
    text: "Hola María, soy Redbot...",   // ya personalizado
    mediaUrl?: "https://supabase.../file.jpg",
    mediaType?: "image"
  },
  instanceId: "solti-1",  // asignado por el rotator
  attempt: 1              // retry count
}
```

### Rotación de instancias

```
InstanceRotator:
  1. Obtener instancias activas de la campaña (instanceIds)
  2. Filtrar solo las que están CONNECTED (verifica estado en DB)
  3. Round-robin: turno basado en contador atómico en Redis
  4. Si una instancia se desconecta mid-campaign:
     - Marcarla como UNAVAILABLE
     - Todo el tráfico va a la otra instancia
     - Reducir maxPerHour proporcionalmente
     - Notificar al tenant via Notification Service
  5. Si AMBAS se desconectan:
     - Pausar campaña automáticamente
     - Notificar al tenant: "Campaña pausada — ambas instancias desconectadas"
```

### Retry inteligente

```
Fallo en envío:
  │
  ├─ Error transitorio (timeout, 429 rate limit, network)
  │   → Retry con backoff exponencial: 30s, 60s, 120s
  │   → Max 3 intentos por mensaje
  │
  ├─ Error permanente (número inválido, bloqueado)
  │   → Marcar recipient como FAILED
  │   → No retry
  │   → Registrar razón en campaign_events
  │
  └─ 3 fallos CONSECUTIVOS (cualquier tipo)
      → Pausa automática de la campaña
      → Cooldown 30 minutos
      → Notificar tenant
      → Después del cooldown: el tenant debe hacer resume manual
```

### Contadores (Redis)

```
whatsapp:instance:{instanceId}:hourly:{YYYY-MM-DD-HH} → counter (TTL 2h)
whatsapp:instance:{instanceId}:daily:{YYYY-MM-DD}     → counter (TTL 25h)
whatsapp:campaign:{campaignId}:rotation                → counter (no TTL)
```

Antes de cada envío, el worker verifica:
1. `hourly < maxPerHourPerInstance` → si no, espera hasta siguiente hora
2. `daily < maxPerDayPerInstance` → si no, pausa hasta mañana dentro de ventana horaria
3. Hora actual dentro de `sendingWindow` → si no, espera hasta `sendingWindowStart`
4. Campaña sigue en status `SENDING` → si no, descarta el job

### Fallback sin Redis

Si Redis no está disponible (como en dev), los contadores se manejan en memoria del proceso. Se pierde el estado al reiniciar, pero funciona para testing.

---

## Sección 4: Webhook Receiver — Tracking de Events de Evolution API v2

### Bug existente a corregir

En `evolution.adapter.ts` los eventos del webhook usan el formato incorrecto. Evolution requiere **UPPER_SNAKE_CASE** para la configuración, pero envía **lowercase.dot.notation** en el payload:

```
Config (al crear instancia): MESSAGES_UPSERT, CONNECTION_UPDATE
Payload (lo que llega):      messages.upsert, connection.update
```

El adapter actual usa lowercase en la config — debe corregirse a UPPER_SNAKE_CASE.

### Configuración automática al crear instancia

```typescript
// En Evolution adapter, al crear instancia:
webhook: {
  url: "https://{HUB_URL}/webhooks/evolution",
  byEvents: false,
  base64: false,
  events: [
    "MESSAGES_UPSERT",       // inbound + confirmación outbound
    "MESSAGES_UPDATE",       // delivery, read, played
    "CONNECTION_UPDATE",     // conectado/desconectado
    "QRCODE_UPDATED",       // necesita re-escanear QR
    "SEND_MESSAGE"           // confirmación de envío via API
  ]
}
```

### Correlación exacta: messageId

Cuando enviamos un mensaje, Evolution devuelve `key.id` (ej: `"BAE594145F4C59B4"`). El código actual ya lo guarda en `WhatsappMessage.externalId`. Usamos ese mismo ID para correlacionar en los webhooks:

```
Envío:  response.key.id → guardar en CampaignRecipient.externalMessageId
Webhook: data.keyId (MESSAGES_UPDATE) → buscar CampaignRecipient.externalMessageId
         data.key.id (MESSAGES_UPSERT) → buscar WhatsappMessage.externalId
```

### Procesamiento de eventos

```
POST /webhooks/evolution
  │
  │  1. Responder 200 OK inmediatamente
  │  2. Guardar payload raw en tabla webhook_events (buffer)
  │  3. Procesar async en background
  │
  ├─ messages.upsert (key.fromMe = false)
  │   → Mensaje ENTRANTE
  │   → Guardar WhatsappMessage (direction: INBOUND, externalId: key.id)
  │   → Actualizar WhatsappConversation (unread +1)
  │   → Buscar CampaignRecipient por phone normalizado + campaña activa
  │     → Si match: CampaignEvent(replied), stats.replied++
  │   → Si instancia.autoReply = true → enqueue Auto-Reply job
  │   → Notificar tenant (Telegram + Dashboard)
  │
  ├─ messages.update (status: DELIVERY_ACK)
  │   → Buscar CampaignRecipient WHERE externalMessageId = data.keyId
  │   → Actualizar WhatsappMessage.status = DELIVERED
  │   → CampaignEvent(delivered), stats.delivered++
  │
  ├─ messages.update (status: READ | PLAYED)
  │   → Buscar CampaignRecipient WHERE externalMessageId = data.keyId
  │   → Actualizar WhatsappMessage.status = READ
  │   → CampaignEvent(read), stats.read++
  │
  ├─ connection.update (state: "open")
  │   → Actualizar WhatsappInstance.status = CONNECTED
  │   → Si había campaña esperando reconexión → Notificar "instancia reconectada"
  │
  ├─ connection.update (state: "close")
  │   → Actualizar WhatsappInstance.status = DISCONNECTED
  │   → Si campaña activa usa esta instancia → redirigir a la otra
  │   → Si AMBAS desconectadas → pausa automática + notificar tenant
  │
  └─ qrcode.updated
      → Actualizar WhatsappInstance.status = NEEDS_QR
      → Guardar QR base64 en instancia (para Dashboard)
      → Notificar tenant: "Tu instancia {name} necesita re-escanear QR"
```

### Tabla webhook_events (buffer de seguridad)

Evolution NO reintenta webhooks si fallan (fire-and-forget, timeout 30s). Por eso guardamos el payload raw primero.

### Idempotencia

- Para `messages.upsert`: verificar si `WhatsappMessage` con `externalId = key.id` ya existe → skip
- Para `messages.update`: verificar si `CampaignEvent` con mismo `messageId + eventType` ya existe → skip
- La tabla `webhook_events` también sirve como audit log

### Seguridad

- Validar header `apikey` del webhook contra la API key de Evolution almacenada
- Rate limit: max 200 req/s en el endpoint
- Procesar solo instancias con prefijo `solti-` (ignorar las de Redbot production)

---

## Sección 5: Auto-Reply con IA — System Prompt por Tenant

### Flujo

```
Webhook: messages.upsert (fromMe: false)
        │
        ▼
  ¿Instancia tiene autoReply = true?
        │
    No──┘   Sí
              │
              ▼
  ¿Contacto está en blacklist de auto-reply?
        │
    Sí──┘   No
              │
              ▼
  ¿Último mensaje propio fue hace < 24h? (ventana WhatsApp)
        │
    No──┘   Sí
              │
              ▼
  Enqueue job → solti:whatsapp-autoreply (BullMQ)
              │
              ▼
  ┌───────────────────────────────┐
  │  1. Cargar systemPrompt       │
  │     del tenant config         │
  │  2. Cargar historial reciente │
  │     (últimos 10 msgs)         │
  │  3. Llamar Claude API         │
  │  4. Enviar respuesta via      │
  │     Evolution sendText        │
  │  5. Guardar en                │
  │     WhatsappMessage           │
  └───────────────────────────────┘
```

### System Prompt — Configuración en Onboarding

Durante el setup inicial del plugin WhatsApp, Solti solicita esta información al tenant:

```typescript
{
  pluginId: "whatsapp-campaigns",
  config: {
    autoReply: {
      enabled: true,
      systemPrompt: string,        // generado durante onboarding
      maxHistoryMessages: 10,
      maxTokens: 300,
      fallbackMessage: "Gracias por tu mensaje. Un asesor te contactará pronto.",
      businessHoursOnly: false,
      cooldownSeconds: 60
    }
  }
}
```

### Generación del System Prompt en Onboarding

Cuando el tenant configura el plugin por primera vez, el Hub le pide:

```
Paso 1: "¿Cuál es el nombre de tu negocio?"
Paso 2: "¿A qué se dedica tu negocio? (describe en 2-3 líneas)"
Paso 3: "¿Cuáles son tus productos/servicios principales?"
Paso 4: "¿Cuál es tu horario de atención?"
Paso 5: "¿Hay algo que el bot NO debería decir o prometer?"
Paso 6: "¿Cuál es el tono de comunicación? (formal, casual, amigable)"
```

Con esas respuestas, el Hub auto-genera el system prompt:

```typescript
const systemPrompt = `Eres el asistente virtual de ${businessName}.
${businessDescription}

Productos/servicios: ${products}
Horario de atención: ${schedule}

Instrucciones:
- Responde de manera ${tone} y concisa
- No prometas: ${restrictions}
- Si no sabes la respuesta, di que un asesor se pondrá en contacto
- No inventes información sobre precios o disponibilidad
- Mantén las respuestas cortas (máximo 2-3 párrafos)
- Responde en el mismo idioma que el cliente`
```

El tenant puede editar manualmente después desde el Dashboard.

### Llamada a Claude API

```typescript
const response = await anthropic.messages.create({
  model: "claude-haiku-4-5-20251001",  // rápido y económico
  max_tokens: config.maxTokens,
  system: config.systemPrompt,
  messages: conversationHistory.map(msg => ({
    role: msg.direction === 'INBOUND' ? 'user' : 'assistant',
    content: msg.body
  }))
});
```

### Protecciones

| Protección | Detalle |
|-----------|---------|
| Cooldown | Mínimo 60s entre auto-replies al mismo contacto |
| Ventana 24h | Solo responde si hubo interacción en últimas 24h |
| Blacklist | El tenant puede excluir contactos del auto-reply |
| Max history | Solo carga últimos 10 mensajes |
| Fallback | Si Claude falla, envía mensaje genérico configurable |
| Kill switch | `autoReply.enabled = false` detiene todo al instante |

---

## Sección 6: Media Service — Upload a Supabase Storage

### Arquitectura

```
Dashboard (tenant)
    │
    │  POST /api/v1/media/upload
    │  Content-Type: multipart/form-data
    │
    ▼
Hub API
    │
    ├─ 1. Validar archivo (tipo, tamaño)
    ├─ 2. Generar nombre único (uuid + extensión)
    ├─ 3. Upload a Supabase Storage
    ├─ 4. Obtener URL pública
    ├─ 5. Guardar registro en DB
    │
    ▼
Supabase Storage
    Bucket: solti-media
    Path: /{tenantId}/campaigns/{filename}
```

### Límites por tipo de archivo

| Tipo | Extensiones | Max tamaño | MIME types |
|------|------------|------------|------------|
| Imagen | jpg, png, webp | 5 MB | image/jpeg, image/png, image/webp |
| Video | mp4 | 16 MB | video/mp4 |
| Documento | pdf, docx | 10 MB | application/pdf, application/vnd.openxmlformats... |
| Audio | mp3, ogg | 5 MB | audio/mpeg, audio/ogg |

### API Endpoints

```
POST   /api/v1/media/upload     → Subir archivo
GET    /api/v1/media             → Listar archivos del tenant
GET    /api/v1/media/:id         → Detalle de un archivo
DELETE /api/v1/media/:id         → Eliminar archivo (Storage + DB)
```

### Uso en campañas

Cuando el tenant crea una campaña con multimedia:

```typescript
{
  message: {
    text: "Hola {{firstName}}, mira nuestra oferta...",
    mediaId: "media-abc123"  // referencia al MediaFile
  }
}
```

El Campaign Engine resuelve `mediaId` → `publicUrl` y lo pasa al Send Queue. Evolution recibe la URL pública.

### Envío via Evolution

```typescript
if (job.data.message.mediaUrl) {
  // POST /message/sendMedia/{instance}
  await evolution.sendMedia(instanceName, {
    number: phone,
    mediatype: mediaType,        // "image" | "video" | "document" | "audio"
    media: publicUrl,
    caption: job.data.message.text,
    fileName: originalFilename   // solo para documentos
  });
} else {
  // POST /message/sendText/{instance}
  await evolution.sendText(instanceName, {
    number: phone,
    text: job.data.message.text
  });
}
```

---

## Sección 7: Notification Service — Telegram + Dashboard Real-Time

### Tipos de notificación y canal por defecto

| Evento | Prioridad | Canal | Mensaje ejemplo |
|--------|-----------|-------|-----------------|
| Campaña completada | Normal | BOTH | "Campaña 'Inmobiliarias Chía' completada: 487 enviados, 12 fallidos" |
| Campaña pausada (auto) | Alta | BOTH | "Campaña pausada: 3 fallos consecutivos" |
| Instancia desconectada | Alta | BOTH | "Instancia solti-1 desconectada. Tráfico redirigido" |
| Ambas instancias caídas | Crítica | BOTH | "Ambas instancias desconectadas. Campaña pausada" |
| QR necesita re-escaneo | Alta | BOTH | "Instancia solti-2 necesita re-escanear QR" |
| Lead respondió | Normal | DASHBOARD | "María López respondió a campaña" |
| Lead respondió (high score) | Alta | BOTH | "Lead caliente: María López (score 85) respondió" |
| Reporte diario | Baja | TELEGRAM | "Resumen: 3 campañas, 1,240 msgs, 45 respuestas" |

### Configuración por tenant

```typescript
{
  notifications: {
    telegram: {
      enabled: true,
      chatId: "123456789",
      silentHours: {
        start: "22:00",
        end: "07:00",
        timezone: "America/Bogota"
      }
    },
    dashboard: {
      enabled: true
    },
    preferences: {
      campaignCompleted: "BOTH",
      campaignPaused: "BOTH",
      instanceDown: "BOTH",
      leadReplied: "DASHBOARD",
      leadRepliedHighScore: "BOTH",
      highScoreThreshold: 70,
      dailyReport: "TELEGRAM",
      dailyReportTime: "20:00"
    }
  }
}
```

### Dashboard (WebSocket via Socket.IO)

Notificaciones push en tiempo real + persistencia en DB para historial.

### Dashboard API

```
GET    /api/v1/notifications              → Listar (paginado, filtro read/unread)
PATCH  /api/v1/notifications/:id/read     → Marcar como leída
PATCH  /api/v1/notifications/read-all     → Marcar todas como leídas
GET    /api/v1/notifications/unread-count  → Contador para badge en UI
```

### Solo las notificaciones CRITICAL rompen silent hours de Telegram.

---

## Sección 8: Schema Prisma — Nuevos Modelos

### Modelos nuevos (se agregan al schema existente)

```prisma
// --- Media Files ---

model MediaFile {
  id          String    @id @default(cuid())
  tenantId    String
  tenant      Tenant    @relation(fields: [tenantId], references: [id])

  filename    String
  storagePath String
  publicUrl   String
  mimeType    String
  size        Int
  type        MediaType

  width       Int?
  height      Int?
  duration    Int?

  createdAt   DateTime  @default(now())

  campaigns   Campaign[]

  @@index([tenantId])
}

enum MediaType {
  IMAGE
  VIDEO
  DOCUMENT
  AUDIO
}

// --- Webhook Events (buffer) ---

model WebhookEvent {
  id            String    @id @default(cuid())
  tenantId      String?
  source        String    // "evolution"
  event         String    // "messages.upsert", etc.
  instanceName  String
  payload       Json
  processed     Boolean   @default(false)
  processedAt   DateTime?
  error         String?
  createdAt     DateTime  @default(now())

  @@index([processed, createdAt])
  @@index([instanceName, event])
}

// --- Notifications ---

model Notification {
  id         String               @id @default(cuid())
  tenantId   String
  tenant     Tenant               @relation(fields: [tenantId], references: [id])

  type       NotificationType
  priority   NotificationPriority @default(NORMAL)
  channel    NotificationChannel

  title      String
  body       String
  metadata   Json?
  actionUrl  String?

  read       Boolean  @default(false)
  readAt     DateTime?
  sentAt     DateTime @default(now())

  @@index([tenantId, read])
  @@index([tenantId, sentAt])
}

enum NotificationType {
  CAMPAIGN_COMPLETED
  CAMPAIGN_PAUSED
  INSTANCE_DISCONNECTED
  INSTANCE_NEEDS_QR
  LEAD_REPLIED
  DAILY_REPORT
}

enum NotificationPriority {
  LOW
  NORMAL
  HIGH
  CRITICAL
}

enum NotificationChannel {
  TELEGRAM
  DASHBOARD
  BOTH
}

// --- Blacklist ---

model WhatsappBlacklist {
  id        String   @id @default(cuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id])

  phone     String
  reason    String?  // "opt-out", "reported spam", "manual"

  createdAt DateTime @default(now())

  @@unique([tenantId, phone])
}
```

### Campos nuevos en modelos existentes

```prisma
// Agregar a Campaign:
  mediaId     String?
  media       MediaFile?     @relation(fields: [mediaId], references: [id])

// Agregar a CampaignRecipient:
  externalMessageId   String?    // key.id de Evolution (correlación webhook)
  instanceUsed        String?    // qué instancia lo envió
  @@index([externalMessageId])

// Agregar a WhatsappInstance:
  autoReply      Boolean  @default(false)
  systemPrompt   String?  @db.Text
  maxHistoryMsgs Int      @default(10)
  maxTokens      Int      @default(300)
  fallbackMsg    String?
  cooldownSecs   Int      @default(60)

// Agregar a WhatsappMessage:
  isAutoReply    Boolean  @default(false)
  campaignId     String?
  @@index([campaignId])

// Agregar a Tenant:
  mediaFiles     MediaFile[]
  notifications  Notification[]
  whatsappBlacklist WhatsappBlacklist[]
```

---

## Sección 9: Estructura de Archivos

```
hub/src/
├── modules/
│   └── whatsapp-campaigns/
│       ├── index.ts                    // registro del módulo
│       ├── campaign.service.ts         // CRUD + launch + pause/resume
│       ├── campaign.routes.ts          // REST endpoints de campañas
│       ├── recipient.resolver.ts       // resuelve destinatarios (listas + filtros)
│       ├── message.personalizer.ts     // reemplaza {{variables}} en texto
│       │
│       ├── queue/
│       │   ├── send.queue.ts           // BullMQ queue config
│       │   ├── send.worker.ts          // procesa jobs de envío
│       │   ├── send.producer.ts        // encola jobs al lanzar campaña
│       │   ├── instance.rotator.ts     // round-robin entre instancias
│       │   └── rate.limiter.ts         // contadores Redis hora/día
│       │
│       ├── autoreply/
│       │   ├── autoreply.queue.ts      // BullMQ queue para auto-replies
│       │   ├── autoreply.worker.ts     // procesa: historial → Claude → envío
│       │   └── autoreply.service.ts    // lógica: cooldown, blacklist, etc.
│       │
│       ├── media/
│       │   ├── media.service.ts        // upload/delete Supabase Storage
│       │   └── media.routes.ts         // REST endpoints de media
│       │
│       ├── notifications/
│       │   ├── notification.service.ts // dispatch a Telegram/Dashboard
│       │   ├── notification.routes.ts  // REST endpoints
│       │   ├── telegram.notifier.ts    // envío via Bot API
│       │   └── dashboard.notifier.ts   // envío via Socket.IO
│       │
│       └── webhooks/
│           ├── evolution.handler.ts    // procesa webhook events
│           ├── event.correlator.ts     // correlaciona messageId → campaign
│           └── event.processor.ts      // actualiza stats, recipients, messages
│
├── adapters/
│   └── evolution.adapter.ts            // YA EXISTE — se actualiza
│
└── webhooks/
    └── evolution.webhook.ts            // YA EXISTE — se refactoriza
```

---

## Sección 10: Defaults de Rate Limiting

| Parámetro | Default | Rango configurable |
|-----------|--------|--------------------|
| Delay entre mensajes | 5 segundos | 3-15s |
| Máximo por hora por instancia | 60 msgs | 30-80 |
| Máximo por día por instancia | 500 msgs | 100-1000 |
| Ventana horaria | 8am - 8pm | Configurable |
| Pausa automática tras fallos | 3 consecutivos | 1-10 |
| Cooldown después de pausa | 30 minutos | 15-60 min |

Con 2 instancias rotando: ~1000 msgs/día en modo conservador.
