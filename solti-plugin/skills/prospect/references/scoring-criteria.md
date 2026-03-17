# Lead Scoring Criteria

## Score Components (0-100)

| Factor | Points | Condition |
|--------|--------|-----------|
| Base score | 50 | Every lead starts here |
| Has email | +15 | Critical for outreach |
| Has phone | +10 | Enables WhatsApp/call |
| Has website | +5 | Indicates established business |
| Location match | +10 | Matches ICP location |
| Industry match | +10 | Matches ICP industry |
| Keyword matches | +5 each (max +15) | ICP keywords found in lead data |
| Social presence | +5 | Has Instagram/LinkedIn/etc. |
| High rating | +5 | Google Maps rating >= 4.0 |
| Disqualifier | -20 | Matches a disqualifying criterion |

## Score Categories

| Category | Range | Action |
|----------|-------|--------|
| **HOT** | 80-100 | Priority outreach — reach out within 24h |
| **WARM** | 60-79 | Standard outreach — add to campaign |
| **COLD** | 0-59 | Low priority — nurture or skip |

## Minimum Import Score

Default: 60 (warm and above). Configurable via `--min-score` flag.
Leads below the minimum are still saved in .tmp/ but not imported to CRM.

## Scoring Philosophy

- **Email is king** — A lead without email is hard to reach at scale
- **Location matters** — Local businesses convert better for local services
- **Disqualifiers are strict** — One match drops score significantly
- **Social presence indicates modernity** — More likely to engage digitally
