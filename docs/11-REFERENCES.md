# SOLTI VR3 — Design References & Inspiration

> Version: 1.0.0 | Last updated: 2026-03-15
> Sources, frameworks, and patterns that informed Solti VR3's design

---

## Framework 1: gstack by Garry Tan

### Source
- **Repo:** github.com/garrytan/gstack
- **Author:** Garry Tan (CEO, Y Combinator)
- **Version analyzed:** 0.3.8 (March 2026)
- **License:** MIT
- **Location of our copy:** /tmp/gstack/

### Key Concepts Adopted

#### 1. Cognitive Modes (Skills = Brain States)
gstack's core insight: each slash command puts Claude into a specific "cognitive mode" rather than being a generic assistant.

- `/plan-ceo-review` → Founder thinking (taste, vision, priorities)
- `/plan-eng-review` → Engineering Manager (execution, scope, rigor)
- `/review` → Paranoid Staff Engineer (find every bug)
- `/ship` → Release Engineer (automate everything, non-interactive)
- `/qa` → QA Lead (systematic testing)
- `/retro` → Engineering Manager (metrics, trends, praise)

**Our adaptation:** Each Solti skill has a cognitive mode:
- `/prospect` → Growth Hacker
- `/outreach` → Sales Strategist
- `/strategy` → CEO/Founder
- `/audit` → Paranoid Reviewer
- `/deploy` → Campaign Engineer (modeled after /ship)
- `/retro` → Engineering Manager (direct inspiration)

#### 2. CLI Over MCP
gstack explicitly rejects MCP for local tools. From ARCHITECTURE.md:
> "MCP JSON schemas cost ~2000 tokens per call in context overhead. Over a 20-command QA session, MCP burns 30,000-40,000 tokens on protocol framing alone."

gstack uses a compiled Bun binary that talks to a persistent Chromium daemon. Zero token overhead.

**Our adaptation:** Python scripts for all external API calls. MCP only for Hub connection (where it's actually needed for persistent database access).

#### 3. Template System (.tmpl → SKILL.md)
gstack generates SKILL.md files from `.tmpl` templates with placeholders resolved from actual source code:
- `{{COMMAND_REFERENCE}}` — generated from command registry
- `{{SNAPSHOT_FLAGS}}` — generated from snapshot.ts
- `{{UPDATE_CHECK}}` — standardized update preamble

CI (`skill-docs.yml`) enforces that generated files are fresh.

**Our adaptation:** SKILL.md.tmpl files for skills that reference dynamic content (command lists, version numbers, available platforms).

#### 4. /ship Workflow (8-Step Automated Deploy)
gstack's /ship skill is explicitly non-interactive: "The user said /ship which means DO IT." It runs:
1. Pre-flight checks
2. Merge origin/main
3. Run tests (parallel)
4. Eval suites (conditional)
5. Pre-landing review
6. Greptile triage
7. Version bump
8. CHANGELOG + TODOS update

**Our adaptation:** `/deploy` skill uses the same 8-step pattern for campaign launches.

#### 5. Error Messages for AI
From ARCHITECTURE.md: errors are designed for AI consumers, not humans. Every error includes what to do next.

**Our adaptation:** All script errors include a `suggestion` field:
```json
{"success": false, "error": "...", "suggestion": "Ask user to check API key"}
```

#### 6. /retro with JSON Snapshots
gstack's /retro saves JSON snapshots to `.context/retros/` for trend tracking between retrospectives.

**Our adaptation:** `/retro` saves metrics to `.context/retros/{date}.json` and compares with previous snapshots.

#### 7. Update Check with 24h Cache
`bin/gstack-update-check` runs on every skill invocation with 24-hour cache. Update preamble injected via `{{UPDATE_CHECK}}` template variable.

**Our adaptation:** `bin/solti-update-check` with identical caching pattern.

#### 8. TODOS.md as Canonical Backlog
gstack uses a structured TODOS.md format with priority levels (P0-P4), effort estimates, and dependency tracking.

**Our adaptation:** We use TODOS.md for growth task tracking (campaigns to send, leads to follow up, content to create).

### What We Did NOT Take from gstack
- **Greptile integration** — Code review specific, not relevant to growth automation
- **Rails/React specific patterns** — Our stack is different
- **Conductor integration** — Multi-workspace tool, overkill for our use case
- **Browser binary** — We use Playwright directly via Python scripts

---

## Framework 2: AI OS by Mansel Scheffel

### Source
- **Author:** Mansel Scheffel
- **Location:** /Users/res/Documents/Claude_Solti_vr3/example-framework-aios/
- **Version analyzed:** 1.0.0
- **License:** MIT

### Key Concepts Adopted

#### 1. Skills as Self-Contained Packages
The fundamental unit: a directory with SKILL.md (frontmatter + instructions), scripts/, references/, and assets/.

```
.claude/skills/{name}/
├── SKILL.md          # Process definition
├── scripts/          # Python scripts (one job each)
├── references/       # Domain knowledge
└── assets/           # Templates, data
```

**Adopted directly** as Solti's skill structure.

#### 2. Deterministic Python Scripts
AI decides WHAT to do. Scripts decide HOW. Scripts are:
- One job per script
- CLI args input (argparse)
- JSON output (stdout)
- Error handling (stderr + exit code)
- No AI reasoning inside scripts

**Adopted directly.** Every Solti script follows this pattern.

#### 3. 3-Tier Memory System
- **Tier 1: MEMORY.md** — Core facts, always in context (~200 lines)
- **Tier 2: Daily logs** — Session events, append-only, date-based files
- **Tier 3: Vector memory** — mem0 + Pinecone for long-term retrieval

**Adopted with modifications.** Tier 3 is optional in Solti (not required for core functionality).

#### 4. Lifecycle Hooks
- **PreToolUse** (guardrail_check.py) — Block dangerous commands. Exit 2 = unbypassable.
- **PostToolUse** (validate_output.py) — Validate JSON output from scripts.
- **Stop** (memory_capture.py) — Auto-save session learnings.

**Adopted directly.** Added cost_guard.py as additional PreToolUse hook.

#### 5. Context Files (Business Knowledge)
- `context/my-business.md` — Business details
- `context/my-voice.md` — Communication style

**Adopted and extended** with my-icp.md, my-offer.md, my-competitors.md.

#### 6. Plugin Distribution Format
- `plugin.json` — Manifest with skills, agents, hooks
- Simplified SKILL.md frontmatter for plugins (name + description only)
- `${CLAUDE_PLUGIN_ROOT}` for script paths

**Adopted directly** for Solti's distribution format.

#### 7. Agents as Specialized Subagents
- Researcher (read-only, Sonnet)
- Content-Writer (voice-matched, Sonnet)
- Code-Reviewer (quality analysis, Opus)

**Adopted and adapted:**
- Researcher → same (for lead research)
- Copywriter → adapted from Content-Writer (for campaigns, social posts)
- Analyst → new (for data analysis, metrics, Haiku)

#### 8. Model Routing for Cost
- Haiku for simple tasks (~$0.25/M tokens)
- Sonnet for routine pipelines (~$3/M tokens)
- Opus for complex reasoning (~$15/M tokens)

**Adopted directly** with mapping:
- /crm, /connect → Haiku
- /prospect, /outreach, /publish, /deploy, /audit, /retro, /qa → Sonnet
- /strategy → Opus

#### 9. Secret Sanitization
`sanitize_text()` with 34 regex patterns strips API keys, tokens, passwords before sending to external APIs (mem0, Pinecone).

**Adopted directly** in memory hooks.

### What We Did NOT Take from AI OS
- **mem0 + Pinecone as required** — Made optional (Tier 3)
- **GPT-4.1 Nano for memory** — We'd use Haiku or skip Tier 3 entirely
- **SQLite task manager** — Replaced by Hub's PostgreSQL
- **Email digest skill** — Not relevant to our use case
- **Gamma slides skill** — Not relevant
- **16 starter skills** — We have 15 specialized growth skills instead

---

## Framework 3: Anthropic Agent Patterns

### Source
- Anthropic Research: "Building Effective Agents" (2025)
- Claude Code SDK documentation

### Key Concepts Adopted

#### 1. Composable Patterns
Don't over-engineer. Start with simple prompt chaining, add complexity only when needed.

| Pattern | When to use | Solti usage |
|---------|-------------|-------------|
| Prompt chaining | Sequential steps | Most skills |
| Routing | Input determines path | /pipeline (which sub-skill to call) |
| Parallelization | Independent subtasks | Batch enrichment, multi-source scraping |
| Evaluator-Optimizer | Quality matters | /qa (test → evaluate → fix → retest) |
| Orchestrator-Worker | Complex multi-step | /pipeline delegates to sub-skills |

#### 2. Context Engineering
- Progressive disclosure: don't load everything upfront
- Compaction: summarize long histories
- Relevant context only: load my-icp.md for /prospect, my-voice.md for /publish

#### 3. Plan-and-Execute
Cheap model plans, expensive model executes:
- /strategy uses Opus (expensive) for the planning itself
- /prospect uses Sonnet for orchestration, scripts for execution
- /crm uses Haiku (cheap) for simple CRUD

---

## Framework 4: Solti VR2 (What We Learned)

### Source
- **Repo:** /Users/res/Documents/Claude_Solti_vr2/
- **Stack:** Next.js 16, Tailwind v4, Prisma, Supabase, Anthropic SDK

### What Worked Well (Keep the Knowledge)
1. **Apify integration patterns** — Direct REST API, no npm package needed
2. **Evolution API for WhatsApp** — Self-hosted, works well
3. **Brevo for email** — Reliable, good free tier
4. **PostgreSQL schema design** — 30+ models, well-normalized
5. **Supabase Auth** — SSR cookie-based auth works smoothly
6. **AI usage tracking** — Token counting + cost estimation

### What Failed (Don't Repeat)
1. **Custom AI orchestrator** — Planner → Router → Executor → Verifier was over-engineered. Claude Code's built-in orchestration is better.
2. **Model names in DB** — Invalid model name in userConfig caused silent failures. VR3 validates all model references.
3. **Shell env overriding .env.local** — Empty ANTHROPIC_API_KEY in shell broke everything. VR3 uses Plugin's own config, not process.env for service keys.
4. **Monolithic architecture** — Everything in one Next.js app made it impossible to package or sell.
5. **Single-tenant** — No path to monetization without multi-tenancy.

### Data Model Elements to Reuse (Concepts, Not Code)
- Contact model with status progression (NEW → CONTACTED → REPLIED → QUALIFIED → CUSTOMER → LOST)
- Campaign with steps and recipient tracking
- Job model for async operations with progress tracking
- Activity timeline (polymorphic events per contact)
- Tag system for contact segmentation
- Dynamic lists with filter-based membership

---

## Key Architectural Decisions Summary

| Decision | Chosen approach | Alternative considered | Why we chose this |
|----------|----------------|----------------------|-------------------|
| Skill system | Markdown-first (SKILL.md) | Code-first (TypeScript classes) | Simpler, Claude reads naturally, gstack proves it works |
| External APIs | Python scripts (deterministic) | MCP tools | Zero token overhead, more reliable, easier to test |
| Hub connection | MCP (HTTP transport) | REST API direct | MCP is native to Claude Code, tool definitions are typed |
| Multi-tenancy | Supabase RLS | Application-level filtering | Database-enforced, impossible to leak across tenants |
| Memory | 3-tier (file → log → vector) | Single database | Progressive enhancement, works without Hub |
| Monetization | Subscription + Credits + Affiliates | Subscription only | Multiple revenue streams, lower barrier to entry |
| Distribution | Claude Code Plugin | npm package / SaaS only | Native integration, marketplace discovery |
| Dashboard | Separate Next.js app | Embedded in Hub | Clean separation, deploy anywhere |
| Credential storage | AES-256-GCM per-tenant | Env vars | Security requirement for multi-tenant |
| Queue system | BullMQ + Redis | pg-boss / Supabase cron | Proven, feature-rich, good monitoring |
