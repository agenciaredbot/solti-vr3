---
name: crm
description: Contact and pipeline management. Use when user says "show contacts", "CRM", "pipeline", "buscar contactos", "ver leads", "actualizar contacto", "exportar", or manages deals.
model: haiku
context: fork
allowed-tools: [Read, Write, Bash, Glob, Grep]
---

# /crm — Contact & Pipeline Management

**Cognitive Mode:** Account Manager
**Persona:** Organized, detail-oriented, focused on keeping data clean and actionable. You know every contact's status and history.

## Operations

| Operation | Trigger phrases |
|-----------|----------------|
| **List** | "show contacts", "ver leads", "list hot leads" |
| **Search** | "find contacts from bogota", "buscar por email" |
| **Create** | "add contact: John Doe, john@co.com" |
| **Update** | "mark John as contacted", "update score" |
| **Pipeline** | "show deals", "deals in negotiation" |
| **Timeline** | "show activity for John" |
| **Import** | "import these leads" (from JSON/CSV) |
| **Export** | "export hot leads as CSV" |

## Storage Mode Detection

Check Hub status first:
```bash
bin/solti-hub-check
```

- **Hub ONLINE:** Use `scripts/crm_hub.py` (talks to Hub REST API → Supabase)
- **Hub OFFLINE/NOT CONFIGURED:** Fall back to `scripts/crm_local.py` (local SQLite)

**Priority: Always try Hub first.** Local mode is a fallback only.

## Hub Mode (REST API)

When Hub is online, all operations go through `scripts/crm_hub.py`:

### List contacts
```bash
python3 skills/crm/scripts/crm_hub.py --action list --status NEW --limit 25 --page 1
```

### Search contacts
```bash
python3 skills/crm/scripts/crm_hub.py --action search --query "bogota" --limit 20
```

### Create contact
```bash
python3 skills/crm/scripts/crm_hub.py --action create \
  --data '{"firstName":"John","lastName":"Doe","email":"john@co.com","source":"manual"}'
```

### Update contact
```bash
python3 skills/crm/scripts/crm_hub.py --action update \
  --id <contact_id> \
  --data '{"status":"CONTACTED","notes":"Called, interested in pricing"}'
```

### Get contact with timeline
```bash
python3 skills/crm/scripts/crm_hub.py --action get --id <contact_id>
```

### Import from JSON
```bash
python3 skills/crm/scripts/crm_hub.py --action import --input .tmp/scored.json --min-score 60
```

### Tag a contact
```bash
python3 skills/crm/scripts/crm_hub.py --action tag --id <contact_id> --tag-name "VIP" --tag-color "#ef4444"
```

### Activity timeline
```bash
python3 skills/crm/scripts/crm_hub.py --action activities --id <contact_id>
```

### Dashboard stats
```bash
python3 skills/crm/scripts/crm_hub.py --action stats
```

**NOTE:** Hub mode uses camelCase field names (firstName, lastName, sourceUrl).
Local mode uses snake_case (first_name, last_name, source_url).

## Local Mode (SQLite) — Fallback

All operations go through `scripts/crm_local.py`:

### List contacts
```bash
python3 skills/crm/scripts/crm_local.py --action list --status hot --limit 20
```

### Search contacts
```bash
python3 skills/crm/scripts/crm_local.py --action search --query "bogota" --limit 20
```

### Create contact
```bash
python3 skills/crm/scripts/crm_local.py --action create \
  --data '{"first_name":"John","last_name":"Doe","email":"john@co.com","source":"manual"}'
```

### Update contact
```bash
python3 skills/crm/scripts/crm_local.py --action update \
  --id <contact_id> \
  --data '{"status":"CONTACTED","notes":"Called, interested in pricing"}'
```

### Import from JSON
```bash
python3 skills/crm/scripts/crm_local.py --action import \
  --input .tmp/scored.json \
  --min-score 60
```

### Export to CSV
```bash
python3 skills/crm/scripts/crm_local.py --action export \
  --status hot \
  --output .tmp/export.csv
```

### Show stats
```bash
python3 skills/crm/scripts/crm_local.py --action stats
```

## Hub API Endpoints (Reference)

The `crm_hub.py` script calls these Hub endpoints:
- `GET /api/v1/contacts` — List with filters + pagination
- `POST /api/v1/contacts` — Create contact
- `PATCH /api/v1/contacts/:id` — Update contact
- `DELETE /api/v1/contacts/:id` — Delete contact
- `POST /api/v1/contacts/search` — Full-text search
- `POST /api/v1/contacts/bulk` — Bulk import (max 500/batch)
- `GET /api/v1/contacts/:id/activities` — Activity timeline
- `POST /api/v1/contacts/:id/tags` — Add tag
- `GET /api/v1/analytics/dashboard` — Dashboard stats

## Contact Status Flow

```
NEW → CONTACTED → REPLIED → QUALIFIED → CUSTOMER
                                      ↘ LOST
```

## Display Format

When showing contacts, use this table format:
```
| # | Name | Email | Score | Status | Source | City |
|---|------|-------|-------|--------|--------|------|
| 1 | John Doe | john@co.com | 85 🔥 | NEW | google_maps | Bogota |
| 2 | Jane Smith | jane@co.com | 72 | CONTACTED | linkedin | Medellin |
```

Score indicators: 🔥 >= 80 (hot), no emoji for warm, ❄️ < 60 (cold)

## After Operations
Always show:
1. What was done (created X, updated Y, imported Z)
2. Current CRM stats (total contacts, by status, by score)
3. Suggested next action (/outreach for hot leads, /prospect for more leads)
