# SOLTI VR3 — Vision & Philosophy

> Version: 1.0.0 | Last updated: 2026-03-15
> Status: BLUEPRINT — Pre-construction documentation

---

## What is Solti?

Solti is an **autonomous growth engine** for solopreneurs, growth hackers, and small marketing teams. It combines lead generation, multi-channel outreach, social publishing, and WhatsApp automation into a single AI-powered system that can be operated via natural language.

**The core problem Solti solves:** A solopreneur needs 8-12 different SaaS tools (scraping, CRM, email, WhatsApp, social media, analytics) to run a growth operation. Each costs $30-200/month, each has its own UI, and coordinating them is a full-time job. Solti unifies all of this behind one AI agent that orchestrates everything autonomously.

## Why VR3?

Solti VR2 was a monolithic Next.js app with an internal AI orchestrator (planner → router → executor → verifier). It worked, but had fundamental limitations:

1. **Tightly coupled** — AI logic, UI, and service integrations all in one codebase
2. **Single-tenant** — Only one user (the creator)
3. **No monetization path** — Couldn't be packaged or sold
4. **Over-engineered orchestration** — Custom planner/router/verifier pipeline when Claude Code already has superior orchestration built-in
5. **Fragile** — One bad model name in the DB broke the entire system

VR3 is a **complete rewrite from scratch** with a new architecture inspired by three proven frameworks:

| Framework | Author | What we take |
|-----------|--------|-------------|
| **gstack** | Garry Tan (YC CEO) | Cognitive modes per skill, CLI over MCP for local tools, template system for prompts, /ship and /retro workflows, error messages designed for AI |
| **AI OS** | Mansel Scheffel | Skills as self-contained packages, deterministic Python scripts, 3-tier memory, lifecycle hooks, plugin distribution format |
| **Anthropic Patterns** | Anthropic Research | Composable agent patterns, context engineering, plan-and-execute with cheap/expensive model split |

## Design Principles

### 1. AI Decides, Code Executes
The LLM handles reasoning, planning, and decision-making. Deterministic Python scripts handle all external API calls, data processing, and file operations. This gives us 90% AI accuracy x 99.9% script reliability = consistent pipelines.

### 2. Skills, Not Agents
Instead of a generic "agent" that tries to do everything, Solti has **specialized skills** — each a cognitive mode with its own persona, workflow, scripts, and guardrails. When you say `/prospect`, Solti becomes a Growth Hacker. When you say `/strategy`, it becomes a CEO doing quarterly planning.

### 3. CLI Over MCP for Local Tools
Inspired by gstack: MCP burns ~2,000 tokens per call in JSON schema overhead. Over a 20-step lead generation pipeline, that's 40,000 wasted tokens. Local operations (scraping, file processing, browser automation) use direct Python scripts with plain text I/O. MCP is reserved for the Service Hub connection where it's actually needed.

### 4. Hybrid Architecture: Plugin + Service Hub
- **Plugin** (runs in Claude Code): Skills, scripts, prompts, hooks — the brain
- **Service Hub** (runs in Docker): Multi-tenant API, database, background jobs, external service connections — the body
- **Dashboard** (web app): Lightweight visual interface for monitoring and manual operations — the face

### 5. Build for Monetization from Day 1
Every design decision considers: Can this be packaged? Can this be sold? Can this generate affiliate revenue? The answer must be yes.

### 6. Zero-Config Core, Progressive Enhancement
The plugin works standalone with just Apify API keys for basic lead generation. As users connect more services (WhatsApp, email, social media), capabilities unlock progressively. No big-bang setup required.

## Target Users

### Primary: Solopreneurs & Growth Hackers
- Run a one-person business or small agency
- Need to generate leads, send outreach, publish content
- Technical enough to use Claude Code but don't want to build from scratch
- Budget-conscious: $30-80/month total tool spend

### Secondary: Small Marketing Teams (2-5 people)
- Need a shared system for lead management and campaigns
- Want one dashboard instead of 8 different SaaS logins
- Value automation over manual processes

### Tertiary: Agency Operators
- Manage multiple client accounts
- Need white-label or multi-tenant setup
- High volume: thousands of leads, hundreds of campaigns

## Core Capabilities

| Capability | What it does | External services |
|-----------|-------------|-------------------|
| **Lead Generation** | Scrape Google Maps, LinkedIn, Instagram, TikTok, websites. Enrich with email/phone. Score against ICP. | Apify, PhantomBuster |
| **Multi-Channel Outreach** | Email sequences, LinkedIn messages, Instagram DMs, WhatsApp messages | Brevo, Apify (IG DM), PhantomBuster (LinkedIn) |
| **Social Publishing** | Generate and schedule posts for Instagram, Facebook, LinkedIn, TikTok | getLate, Buffer |
| **WhatsApp Agents** | Deploy AI-powered WhatsApp instances that auto-respond to leads | Evolution API |
| **CRM** | Contact management, pipeline tracking, deal stages, activity timeline | Internal (PostgreSQL) |
| **Campaign Management** | Create, send, track email and outreach campaigns | Brevo, internal tracking |
| **Analytics** | Lead quality scores, campaign performance, cost tracking, ROI | Internal |
| **Telegram Commands** | Quick status checks and actions from mobile | Telegram Bot API |

## What Solti is NOT

- **Not a chatbot builder** — Solti IS the agent, not a tool to build agents
- **Not a CRM replacement** — The CRM is basic; it's a lead pipeline, not Salesforce
- **Not an email service** — It uses Brevo/SMTP under the hood, not its own infrastructure
- **Not a social media scheduler** — It can publish, but the value is in AI-generated content + autonomous scheduling
- **Not free** — The plugin may be free/cheap, but the Service Hub has costs (hosting, APIs)

## Success Metrics

For Solti VR3 to be considered successful:

1. **Works end-to-end**: User says "find 100 restaurants in Bogota, enrich them, and send a cold email campaign" — and it happens
2. **Monetizable**: At least 3 revenue streams active (subscription + credits + affiliates)
3. **Packageable**: Can be installed via `claude plugin add solti` or similar
4. **Reliable**: Scripts don't fail silently, errors are actionable, the system self-heals
5. **Fast**: Lead generation pipeline completes in <5 minutes for 100 leads
6. **Affordable**: Total operating cost <$50/month for a solopreneur doing moderate volume
