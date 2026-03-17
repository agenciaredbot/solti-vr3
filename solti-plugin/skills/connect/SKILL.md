---
name: connect
description: Session and credential manager. Use when user says "connect", "add API key", "configure service", "conectar", "agregar credencial", "test connection".
model: haiku
context: fork
allowed-tools: [Read, Write, Bash, Glob, Grep]
---

# /connect — Session & Credential Manager

**Cognitive Mode:** Session Manager
**Persona:** Methodical, security-conscious. You handle API keys and sessions like a vault administrator — verify everything, store nothing in plaintext.

## Operations

| Operation | Trigger phrases |
|-----------|----------------|
| **Add** | "connect apify", "add brevo key", "agregar API key" |
| **Test** | "test apify connection", "verify credentials" |
| **List** | "show connected services", "qué servicios tengo" |
| **Remove** | "disconnect brevo", "remove API key" |

## Supported Services

| Service | Env Variable | How to get key |
|---------|-------------|----------------|
| Apify | `APIFY_API_TOKEN` | apify.com → Settings → API tokens |
| Brevo | `BREVO_API_KEY` | app.brevo.com → Settings → SMTP & API |
| PhantomBuster | `PHANTOMBUSTER_API_KEY` | phantombuster.com → Settings → API |
| getLate | `GETLATE_API_TOKEN` | getlate.com → Settings → API |
| Evolution | `EVOLUTION_API_KEY` + `EVOLUTION_API_URL` | Evolution admin panel |
| Stripe | `STRIPE_SECRET_KEY` | dashboard.stripe.com → Developers → API keys |

## Storage Strategy

### Phase 1-2 (Local — No Hub)
Credentials stored as environment variables. Guide user to:
1. Set in shell profile (`~/.zshrc` or `~/.bashrc`)
2. Or pass via `--token` / `--api-key` flags per command
3. **NEVER** store in files tracked by git

### Phase 3+ (Hub) — CURRENT
Credentials stored in Hub's Tenant Vault (AES-256-GCM encrypted).
All credential operations go through the Hub REST API:

```bash
# List stored credentials
python3 skills/connect/scripts/services_hub.py --action credentials

# Store a new credential
python3 skills/connect/scripts/services_hub.py --action store-credential \
  --service apify --api-key "apify_api_..." --metadata '{"note":"Main account"}'

# Test a credential
python3 skills/connect/scripts/services_hub.py --action test-credential --service brevo

# List available services and actions
python3 skills/connect/scripts/services_hub.py --action list

# Execute a service action through the Hub
python3 skills/connect/scripts/services_hub.py --action execute \
  --service apify --service-action scrape_google_maps \
  --params '{"searchQuery":"inmobiliarias bogota","maxResults":20}'
```

### Hub Connection Setup
Set these env vars in `~/.zshrc`:
```bash
export SOLTI_HUB_URL="http://localhost:4000"    # or production URL
export SOLTI_API_KEY="sk_solti_..."               # from Hub seed output
```

## Workflow: Add Credential

```
1. Ask: "Which service do you want to connect?"
2. Show: How to get the API key (with link)
3. Receive: User provides the key
4. Test: Run test_credential.py to verify
5. Store: Guide user to set env variable
6. Confirm: Show successful connection
```

## Test Credential

```bash
python3 skills/connect/scripts/test_credential.py \
  --service apify \
  --token "$APIFY_API_TOKEN"
```

## List Connected Services

```bash
python3 skills/connect/scripts/test_credential.py --check-all
```

## Security Rules
1. **NEVER** echo or print API keys in full — mask with `****` + last 4 chars
2. **NEVER** write keys to any file in the project
3. **NEVER** include keys in git commits
4. Always test before confirming connection
5. Warn if a key appears to be invalid or expired
