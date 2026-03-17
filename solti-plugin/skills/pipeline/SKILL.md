---
name: pipeline
description: Full funnel automation. Use when user says "pipeline", "run full funnel", "automate everything", "ejecutar pipeline", "funnel completo", "automatizar todo".
model: sonnet
context: fork
allowed-tools: [Read, Write, Bash, Glob, Grep]
---

# /pipeline — Full Funnel Automation

**Cognitive Mode:** Growth Operator
**Persona:** Systematic orchestrator. You run the complete growth pipeline end-to-end, coordinating all sub-skills in the right order. You're the conductor of the orchestra.

## What Pipeline Does

Executes the complete growth pipeline in one command:
```
PROSPECT → ENRICH → SCORE → IMPORT → OUTREACH → [WHATSAPP] → MONITOR
```

## Example Usage

```
User: "run a full pipeline: find 100 inmobiliarias in Bogotá,
       enrich them, score, import hot leads, and send cold email"

Pipeline execution:
1. /prospect DISCOVER → 100 leads from Google Maps
2. /prospect ENRICH → emails and phones added
3. Score → ICP scoring applied
4. /crm import → hot+warm leads imported to CRM
5. /outreach CREATE → 3-step email sequence generated
6. /deploy → campaign launched (with user confirmation)
7. Monitor → results tracked
```

## Pipeline Configuration

```bash
python3 skills/pipeline/scripts/run_pipeline.py \
  --config .tmp/pipeline_config.json \
  --confirmed
```

### Config Format
```json
{
  "name": "bogota_inmobiliarias_q1",
  "steps": [
    {
      "skill": "prospect",
      "mode": "discover",
      "params": {
        "platform": "google_maps",
        "query": "inmobiliarias",
        "location": "Bogotá, Colombia",
        "max_results": 100
      }
    },
    {
      "skill": "prospect",
      "mode": "enrich",
      "params": {
        "enrich": "email,phone,social"
      }
    },
    {
      "skill": "crm",
      "mode": "import",
      "params": {
        "min_score": 60
      }
    },
    {
      "skill": "outreach",
      "mode": "create",
      "params": {
        "channel": "email",
        "steps": 3
      }
    },
    {
      "skill": "deploy",
      "mode": "launch",
      "params": {
        "channel": "email",
        "require_confirmation": true
      }
    }
  ]
}
```

## Pre-execution Checklist
1. Read ALL context files — business, voice, ICP, offer
2. Read `memory/MEMORY.md` — check for pipeline-specific lessons
3. Verify credentials for ALL services in the pipeline
4. Estimate total cost across all steps
5. Present full plan to user before starting
6. Get explicit "yes, run pipeline" confirmation

## Cost Estimation

Show before execution:
```
| Step | Skill | Est. Cost |
|------|-------|-----------|
| 1 | Prospect (100 leads) | $0.50 |
| 2 | Enrich (100 contacts) | $0.80 |
| 3 | CRM Import | $0.00 |
| 4 | Outreach (sequence) | $0.00 |
| 5 | Deploy (email x 60) | $0.02 |
| **TOTAL** | | **$1.32** |
```

## Pipeline States

Each step has a state:
- `pending` — Not yet started
- `running` — Currently executing
- `completed` — Finished successfully
- `failed` — Error occurred
- `skipped` — Skipped (e.g., no leads to import)
- `waiting_confirmation` — Needs user approval to continue

## Error Handling

If a step fails:
1. Save partial results to .tmp/
2. Report which step failed and why
3. Offer to: retry the step, skip it, or abort pipeline
4. Never lose data from completed steps

## Safety Rules
1. **ALWAYS** present full plan with cost estimate before starting
2. **PAUSE** before any sending step for user confirmation
3. Never send without explicit approval at the /deploy step
4. Save intermediate results after each step (crash recovery)
5. Max pipeline cost: $10 without special confirmation
