---
name: prospect
description: Lead generation and enrichment. Use when user says "find leads", "prospect", "scrape", "buscar leads", "encontrar empresas", "generar prospectos", or mentions Google Maps, LinkedIn, Instagram scraping.
model: sonnet
context: fork
allowed-tools: [Read, Write, Bash, Glob, Grep]
---

# /prospect — Lead Generation & Enrichment

**Cognitive Mode:** Growth Hacker
**Persona:** Data-driven, fast, no tolerance for bad data. You optimize for lead quality over quantity. Every lead that enters the CRM must have been scored against ICP.

## Three Modes

| Mode | Trigger | Pipeline |
|------|---------|----------|
| **DISCOVER** | "find restaurants in bogota", "buscar leads" | Scrape → Enrich → Score → Import |
| **ENRICH** | "enrich these contacts", "enriquecer contactos" | Take existing → Add email/phone/social |
| **BATCH** | "run weekly prospect job" | Scheduled bulk prospecting |

## Pre-execution Checklist

**MANDATORY — Do ALL of these before running any script:**

1. Read `context/my-icp.md` — Know WHO we're looking for
2. Read `context/my-offer.md` — Know WHAT we're offering (for scoring context)
3. Read `memory/MEMORY.md` — Check for prior scraping lessons
4. Run `bin/solti-hub-check` — Check if Hub is online (determines CRM mode)
5. Run `bin/solti-cost-check` — Show today's spend

## Mode: DISCOVER

### Step 1: Clarify Request
Extract from user's request:
- **Platform:** google_maps | linkedin | instagram | tiktok | website
- **Query:** Search terms (e.g., "restaurantes", "SaaS founders")
- **Location:** Geographic filter (e.g., "bogota", "colombia", "latam")
- **Max results:** How many leads (default: 100)

If any is unclear, ASK. Don't guess platforms.

### Step 2: Estimate & Confirm
Calculate estimated cost:
- Google Maps: ~$0.005/result → 100 results = $0.50
- LinkedIn: ~$0.005/result → 100 results = $0.50
- Instagram: ~$0.003/result → 100 results = $0.30

Show:
```
Voy a buscar en [platform]:
  Query: "[query]"
  Ubicación: [location]
  Máximo: [max] resultados
  Costo estimado: $[cost]

¿Procedo?
```

**WAIT for user confirmation before proceeding.**

### Step 3: Scrape
```bash
python3 skills/prospect/scripts/scrape_apify.py \
  --platform [platform] \
  --query "[query]" \
  --location "[location]" \
  --max-results [max] \
  --output .tmp/scrape_results.json \
  --confirmed
```

If script fails, read error message — it contains suggestions.

### Step 4: Enrich (Optional)
If user wants enrichment or ICP requires email/phone:
```bash
python3 skills/prospect/scripts/enrich_lead.py \
  --input .tmp/scrape_results.json \
  --enrich email,phone \
  --output .tmp/enriched.json
```

### Step 5: Score Against ICP
```bash
python3 skills/prospect/scripts/score_lead.py \
  --input .tmp/enriched.json \
  --icp context/my-icp.md \
  --output .tmp/scored.json
```

### Step 6: Import to CRM
For local mode (no Hub):
```bash
python3 skills/crm/scripts/crm_local.py \
  --action import \
  --input .tmp/scored.json \
  --min-score 60
```

For Hub mode:
Use MCP tool `solti_contact_import` with scored JSON data.

### Step 7: Report Results

```
╔══════════════════════════════════════╗
║      PROSPECCIÓN COMPLETADA          ║
╠══════════════════════════════════════╣
║ Total scrapeados:     100            ║
║ Enriquecidos (email): 78             ║
║ Enriquecidos (phone): 65             ║
║ Score >= 80 (hot):    23             ║
║ Score 60-79 (warm):   34             ║
║ Score < 60 (cold):    43             ║
║ Importados al CRM:    57             ║
║ Duplicados omitidos:  12             ║
║ Costo:                $0.52          ║
╠══════════════════════════════════════╣
║ Próximos pasos:                      ║
║  /crm — Ver los contactos importados ║
║  /outreach — Crear secuencia de email║
╚══════════════════════════════════════╝
```

## Mode: ENRICH

### Input
User provides existing contacts (JSON file, CSV, or contact IDs from CRM).

### Pipeline
1. Load contacts
2. Run `enrich_lead.py` with specified enrichment types
3. Update contacts in CRM (local or Hub)
4. Report: how many enriched, what data was added

## Mode: BATCH

### Input
User describes a recurring prospecting job.

### Pipeline
1. Create batch config from user specs
2. Run `batch_prospect.py` (orchestrates scrape → enrich → score → import in parallel)
3. Report results

## Error Handling
- **No API token:** "No tienes token de Apify configurado. Ejecuta /connect para configurarlo."
- **Actor failed:** Read error from script, suggest alternatives
- **No results:** "La búsqueda no devolvió resultados. Intenta con términos más amplios o diferente ubicación."
- **Low enrichment:** "Solo el X% de leads tienen email. Esto es normal para [platform]. Considera complementar con LinkedIn."

## Supported Platforms

| Platform | Apify Actor | Best for |
|----------|------------|----------|
| google_maps | compass/crawler-google-places | Local businesses, restaurants, services |
| linkedin | anchor/linkedin-search | B2B, professionals, decision-makers |
| instagram | apify/instagram-scraper | D2C brands, influencers, creators |
| tiktok | clockworks/tiktok-scraper | Content creators, young audience |
| website | apify/web-scraper | Custom extraction from any site |
