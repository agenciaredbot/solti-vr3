# SOLTI VR3 — Master Documentation Index

> Version: 1.0.0 | Last updated: 2026-03-15
> **Purpose:** Complete blueprint for building Solti VR3 from scratch in a new Claude Code session.

---

## How to Use This Documentation

These 11 documents contain everything needed to build Solti VR3 from zero. They are designed to be read by a new Claude Code session that has no prior context.

**For the new Claude Code session, start by saying:**

> "I'm building Solti VR3, an autonomous growth engine. Read all files in the `docs/` folder starting with `00-INDEX.md` to understand the complete architecture. Then we'll build Phase 1."

---

## Document Map

| # | Document | Purpose | Read When |
|---|----------|---------|-----------|
| 00 | **INDEX.md** (this file) | Navigation and reading order | First |
| 01 | **VISION.md** | What Solti is, why it exists, design principles | First |
| 02 | **ARCHITECTURE.md** | 3-layer system design, data flow, communication | First |
| 03 | **SKILLS-CATALOG.md** | All 15 skills with complete specifications | When building skills |
| 04 | **SERVICE-HUB.md** | Multi-tenant hub: router, vault, adapters, queues | Phase 3 |
| 05 | **MONETIZATION.md** | Revenue model, plans, credits, affiliates, Stripe | Phase 3-5 |
| 06 | **DATABASE-SCHEMA.md** | Full PostgreSQL schema (all tables, indexes, RLS) | Phase 3 |
| 07 | **HOOKS-AND-SCRIPTS.md** | All 4 hooks + script patterns + bin/ utilities | Phase 1 |
| 08 | **INTEGRATIONS.md** | All external services (Apify, Brevo, Evolution, etc.) | Phase 1-2 |
| 09 | **BUILD-PLAN.md** | Phase-by-phase execution plan with deliverables | Always |
| 10 | **CLAUDE-KERNEL.md** | The actual CLAUDE.md, rules, context templates | Phase 1 |
| 11 | **REFERENCES.md** | Design sources: gstack, AI OS, Anthropic patterns, VR2 learnings | Reference |

---

## Reading Order by Phase

### Phase 1 (Plugin Skeleton)
1. `01-VISION.md` — Understand the big picture
2. `02-ARCHITECTURE.md` — Understand the 3-layer design (focus on Layer 1: Plugin)
3. `10-CLAUDE-KERNEL.md` — Build CLAUDE.md, rules/, context/ templates, preferences.yaml
4. `07-HOOKS-AND-SCRIPTS.md` — Build all 4 hooks + bin/ utilities
5. `03-SKILLS-CATALOG.md` — Build /onboard, /prospect, /crm skills
6. `08-INTEGRATIONS.md` — Reference for Apify integration in /prospect
7. `09-BUILD-PLAN.md` — Phase 1 checklist

### Phase 2 (Core Skills)
1. `03-SKILLS-CATALOG.md` — Build remaining 5 core skills
2. `08-INTEGRATIONS.md` — Reference for Brevo, Evolution, getLate, PhantomBuster
3. `09-BUILD-PLAN.md` — Phase 2 checklist

### Phase 3 (Service Hub)
1. `04-SERVICE-HUB.md` — Build the entire Hub
2. `06-DATABASE-SCHEMA.md` — Create Prisma schema + migrations
3. `05-MONETIZATION.md` — Set up Stripe, credits, affiliates
4. `09-BUILD-PLAN.md` — Phase 3 checklist

### Phase 4 (Strategy + Dashboard)
1. `03-SKILLS-CATALOG.md` — Build strategic skills (/strategy, /audit, /retro, /qa)
2. `04-SERVICE-HUB.md` — Reference for API endpoints
3. `09-BUILD-PLAN.md` — Phase 4 checklist

### Phase 5 (Launch)
1. `05-MONETIZATION.md` — Activate all revenue streams
2. `09-BUILD-PLAN.md` — Phase 5 checklist

---

## Key Facts for Quick Reference

| Fact | Value |
|------|-------|
| **Project name** | Solti VR3 |
| **Project path** | /Users/res/Documents/Claude_Solti_vr3/ |
| **Architecture** | 3-layer: Plugin (Claude Code) + Hub (Docker) + Dashboard (Next.js) |
| **Primary language** | TypeScript (Hub, Dashboard), Python (Plugin scripts) |
| **Database** | PostgreSQL via Supabase (with RLS multi-tenancy) |
| **AI Provider** | Anthropic Claude (via Claude Code — no direct SDK needed in Plugin) |
| **Plugin framework** | Claude Code Plugin format (SKILL.md + scripts/) |
| **Target user** | Solopreneurs, growth hackers, small marketing teams |
| **Default language** | Spanish (es) |
| **Default timezone** | America/Bogota |
| **Revenue streams** | 4: Subscription + Credits + Affiliates + Plugin license |
| **Total skills** | 15 (8 core growth + 4 strategic + 3 meta) |
| **Total hooks** | 4 (guardrail, cost_guard, validate_output, memory_capture) |
| **Total agents** | 3 (researcher, copywriter, analyst) |

## Reference Frameworks (available in this repo)

| Framework | Location | Purpose |
|-----------|----------|---------|
| AI OS (Scheffel) | `./example-framework-aios/` | Skill structure, hooks, memory, plugin format |
| gstack (Garry Tan) | `/tmp/gstack/` | Cognitive modes, CLI patterns, /ship workflow |

---

## Important: Build from Scratch

**Do NOT reuse code from Solti VR2** (`/Users/res/Documents/Claude_Solti_vr2/`).
VR3 is a complete rewrite with a fundamentally different architecture.

What we DO carry over from VR2:
- **Knowledge** about how Apify, Evolution, Brevo, getLate APIs work
- **Schema concepts** (contact status progression, campaign steps, etc.)
- **Lessons learned** (what failed and why — documented in `11-REFERENCES.md`)

What we do NOT carry over:
- No code
- No components
- No orchestrator pipeline
- No API routes
- No UI components
