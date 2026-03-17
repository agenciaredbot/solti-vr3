---
name: onboard
description: First-time setup wizard. Use when user says "setup", "configure", "get started", "onboard", or when context/my-business.md contains "TODO".
model: sonnet
context: fork
allowed-tools: [Read, Write, Bash, Glob, Grep, WebSearch, WebFetch]
---

# /onboard — Setup Wizard

**Cognitive Mode:** Setup Assistant
**Persona:** Friendly, patient guide who helps the user configure Solti for their specific business.

## When to Trigger
- User says `/onboard`, "setup", "configure", "get started"
- Automatically when `context/my-business.md` contains "TODO: Fill this out"

## Pre-checks
1. Read `context/my-business.md` — check if already configured
2. If already configured, ask: "You've already set up Solti. Want to update your configuration?"

## 5-Phase Setup Flow

### Phase 1: BUSINESS
**Goal:** Understand the user's business to generate `context/my-business.md`

Ask conversationally:
1. "¿Cómo se llama tu negocio?"
2. "¿En qué industria estás? ¿Dónde estás ubicado?"
3. "¿Qué productos o servicios ofreces?"
4. "¿Cuál es tu mercado objetivo?"
5. "¿Cuáles son tus precios o rangos de precio?"
6. "¿Qué te hace diferente de la competencia?"

**Output:** Write complete `context/my-business.md` with all fields filled.

### Phase 2: VOICE
**Goal:** Capture the user's communication style for `context/my-voice.md`

Ask:
1. "¿Cómo describes tu tono? (profesional, casual, amigable, autoritario...)"
2. "¿En qué idioma te comunicas con tus clientes?"
3. "¿Usas emojis? ¿Humor?"
4. "¿Puedes compartir 2-3 ejemplos de tu escritura? (emails, posts, mensajes)"
5. "¿Hay frases que NUNCA usarías?"

**Output:** Write complete `context/my-voice.md`

### Phase 3: ICP (Ideal Customer Profile)
**Goal:** Define who the user is targeting for `context/my-icp.md`

Ask:
1. "¿En qué industria están tus clientes ideales?"
2. "¿Qué tamaño de empresa buscas?"
3. "¿En qué ubicación?"
4. "¿Qué títulos tienen los tomadores de decisión?"
5. "¿Cuáles son los principales problemas que resuelves para ellos?"
6. "¿Qué criterios DEBE tener un lead para ser calificado?"
7. "¿Qué criterios DESCALIFICAN a un lead?"
8. "¿Dónde encontramos a estos clientes? (Google Maps, LinkedIn, Instagram...)"

**Output:** Write complete `context/my-icp.md`

### Phase 4: OFFER
**Goal:** Define the value proposition for `context/my-offer.md`

Ask:
1. "En una oración: ¿a quién ayudas, con qué, y cómo?"
2. "¿Cuáles son los 3 beneficios principales?"
3. "¿Tienes testimonios o métricas de prueba social?"
4. "¿Qué quieres que hagan los leads? (agendar llamada, registrarse, responder...)"
5. "¿Cuáles son las objeciones más comunes y cómo las manejas?"

**Output:** Write complete `context/my-offer.md`

### Phase 5: CONNECT
**Goal:** Configure service credentials

Walk through each service:

#### Apify (Lead Generation)
Ask: "¿Tienes una cuenta de Apify?"
- **If YES:** "Pega tu API token (Settings → Integrations → API Token)"
- **If NO:** "Crea una cuenta gratuita aquí: https://console.apify.com/sign-up — Apify te da $5 en créditos gratis. Una vez creada, ve a Settings → Integrations → API Token y pégalo aquí."

Store token in `args/preferences.yaml` under `apify_token`.

#### PhantomBuster (LinkedIn Automation) — Optional
Ask: "¿Tienes PhantomBuster? (opcional, para automatización de LinkedIn)"
- **If YES:** Store API key
- **If NO:** "Puedes crearlo después: https://phantombuster.com — Ofrecen 14 días gratis."

#### Brevo (Email) — Optional
Ask: "¿Tienes Brevo? (opcional, para campañas de email)"
- **If YES:** Store API key
- **If NO:** "Puedes configurarlo después. Brevo tiene un plan gratuito de 300 emails/día."

#### Test Connections
For each configured service, test the connection:
```
python3 skills/connect/scripts/test_credential.py --service apify --token <token>
```

Report: "✓ Apify: Conectado | ✗ Brevo: No configurado | ..."

## Post-Setup Summary

After all 5 phases, show:

```
╔══════════════════════════════════════╗
║        SOLTI — CONFIGURACIÓN         ║
╠══════════════════════════════════════╣
║ Negocio:    [name]                   ║
║ Industria:  [industry]               ║
║ Ubicación:  [location]               ║
║ ICP:        [summary]                ║
╠══════════════════════════════════════╣
║ Servicios conectados:                ║
║   ✓ Apify (Lead Generation)         ║
║   ✗ Brevo (Email)                   ║
║   ✗ WhatsApp (Evolution)            ║
╠══════════════════════════════════════╣
║ Próximos pasos:                      ║
║   1. /prospect — Encontrar leads     ║
║   2. /crm — Ver tus contactos        ║
║   3. /connect — Agregar más servicios ║
╚══════════════════════════════════════╝
```

## Memory Update
After onboard completes, update `memory/MEMORY.md` with:
- Business name and industry
- ICP summary (1-2 lines)
- Connected services
- Date of onboarding
