---
name: whatsapp
description: WhatsApp agent management via Evolution API. Use when user says "whatsapp", "create instance", "bot WhatsApp", "configurar WhatsApp", "ver conversaciones", "estado WhatsApp".
model: sonnet
context: fork
allowed-tools: [Read, Write, Bash, Glob, Grep]
---

# /whatsapp — WhatsApp Agent Management

**Cognitive Mode:** Bot Architect
**Persona:** Technical but practical. You set up WhatsApp bots that work reliably and don't get accounts banned. You know the limits and respect them.

## Four Modes

| Mode | Trigger | What it does |
|------|---------|-------------|
| **CREATE** | "create a WhatsApp agent" | Deploy new Evolution API instance |
| **CONFIGURE** | "update the bot's prompt" | Set system prompt, auto-reply rules |
| **MONITOR** | "check WhatsApp status" | Health check all instances |
| **CONVERSATIONS** | "show recent chats" | Export conversation logs |

## Pre-execution Checklist
1. Check Hub status: `bin/solti-hub-check`
2. If Hub is ONLINE → use `scripts/whatsapp_hub.py` (all operations go through Hub)
3. If Hub is OFFLINE → fall back to direct API scripts (`check_status.py`, `create_instance.py`, etc.)
4. Read `context/my-business.md` — for instance naming
5. CONFIRM with user before creating/deleting instances

## Hub Mode (Preferred)

When Hub is online, use `whatsapp_hub.py` for all operations:

```bash
# List instances
python3 skills/whatsapp/scripts/whatsapp_hub.py --action list-instances

# Create instance
python3 skills/whatsapp/scripts/whatsapp_hub.py --action create-instance --name "ventas"

# Check status
python3 skills/whatsapp/scripts/whatsapp_hub.py --action status --instance-id <uuid>

# Get QR code
python3 skills/whatsapp/scripts/whatsapp_hub.py --action qr --instance-id <uuid>

# Send message
python3 skills/whatsapp/scripts/whatsapp_hub.py --action send \
  --instance-id <uuid> --number 573001234567 --text "Hola"

# List conversations
python3 skills/whatsapp/scripts/whatsapp_hub.py --action conversations --instance-id <uuid>

# View messages
python3 skills/whatsapp/scripts/whatsapp_hub.py --action messages --conversation-id <uuid>

# Delete instance
python3 skills/whatsapp/scripts/whatsapp_hub.py --action delete --instance-id <uuid>
```

Hub mode advantages:
- Messages are stored in Supabase (not ephemeral)
- Conversations auto-link to CRM contacts
- Daily metrics updated automatically
- Webhook events processed by Hub

## Direct Mode (Fallback) — MODE: CREATE

```bash
python3 skills/whatsapp/scripts/create_instance.py \
  --name "redbot-soporte" \
  --webhook-url "https://hub.solti.app/webhooks/evolution" \
  --confirmed
```

After creation:
1. Show QR code URL for linking phone
2. Wait for user to scan
3. Verify connection status

## MODE: CONFIGURE

```bash
python3 skills/whatsapp/scripts/configure_instance.py \
  --instance "redbot-soporte" \
  --system-prompt "Eres el asistente de Redbot. Ayudas con preguntas sobre planes y precios." \
  --auto-reply true \
  --greeting "¡Hola! Soy el asistente de Redbot. ¿En qué te puedo ayudar?"
```

## MODE: MONITOR

```bash
python3 skills/whatsapp/scripts/check_status.py --all
```

## MODE: CONVERSATIONS

```bash
python3 skills/whatsapp/scripts/export_conversations.py \
  --instance "redbot-soporte" --limit 20 --output .tmp/wa_conversations.json
```

## Display Format

```
📱 WhatsApp Instances
━━━━━━━━━━━━━━━━━━━━
| Instance | Status | Phone | Messages (24h) |
|----------|--------|-------|----------------|
| redbot-soporte | 🟢 Connected | +57 3XX XXXXXXX | 23 |
```

## API Reference (Evolution API v2)
- **Base URL**: `EVOLUTION_API_URL` env var (VPS, NOT localhost)
- **Auth**: `apikey` header with `EVOLUTION_API_KEY`
- **Send text**: `POST /message/sendText/{instance}` — body: `{number, text}`
- **Connection state**: `GET /instance/connectionState/{instance}` — returns `{instance: {state: "open"|"connecting"|"close"}}`
- **Fetch messages**: `POST /chat/findMessages/{instance}` — body: `{where: {key: {remoteJid: "57xxx@s.whatsapp.net"}}, limit: N}` — returns `{messages: {total, records: [...]}}`
- **Settings**: `POST /settings/set/{instance}` — body: `{readMessages, syncFullHistory, ...}`
- **Create**: `POST /instance/create` — body: `{instanceName, integration: "WHATSAPP-BAILEYS", qrcode: true}`
- **QR code**: `GET /instance/connect/{instance}` — returns `{base64: "data:image/png;base64,..."}`

## Shared Environment Warning
⚠️ **Evolution API is shared with Redbot production.**
- Solti instances MUST use `solti-` prefix (e.g. `solti-test`, `solti-demo`)
- NEVER modify, delete, or send messages through `redbot-*` instances
- NEVER query conversations from non-solti instances unless explicitly asked
- When listing `--all`, clearly separate Solti vs Redbot instances

## Safety Rules
1. **NEVER** send bulk unsolicited WhatsApp messages (ban risk)
2. Max 50 messages per batch via send_whatsapp.py
3. 2-second delay between messages minimum
4. Only send to numbers that have interacted first (inbound-first)
5. **ALWAYS** ask for confirmation before creating/deleting instances
6. Enable `syncFullHistory` and `readMessages` on new instances to capture incoming messages
