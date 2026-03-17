# SOLTI VR3 — Skills Catalog

> Version: 1.0.0 | Last updated: 2026-03-15
> Complete specification of all 15 skills

---

## Skill Architecture

Each skill is a self-contained package following this structure:

```
skills/{skill-name}/
├── SKILL.md              # Main prompt with frontmatter + workflow
├── SKILL.md.tmpl         # Template source (optional, for generated skills)
├── scripts/              # Python scripts (one job per script)
│   └── {action}.py
├── assets/prompts/       # Hard prompts with {{placeholders}}
│   └── {prompt-name}.txt
├── references/           # Domain expertise docs
│   └── {reference}.md
└── review/               # QA checklist (gstack-style)
    └── checklist.md
```

### SKILL.md Frontmatter Format

```yaml
---
name: skill-name
description: What it does. Use when user says "X", "Y", or "Z".
model: sonnet | haiku | opus
context: fork
allowed-tools: [Read, Write, Bash, Glob, Grep, WebSearch, WebFetch]
---
```

- **name**: kebab-case identifier
- **description**: Used for auto-discovery. Include trigger phrases.
- **model**: Which Claude model to use (haiku=$0.25/M, sonnet=$3/M, opus=$15/M)
- **context: fork**: Spawn isolated subagent (recommended for pipelines)
- **allowed-tools**: Restrict tool access for safety

### Plugin Distribution Format

When packaged for plugin distribution, frontmatter is simplified:

```yaml
---
name: skill-name
description: What it does. Use when user says "X", "Y", or "Z".
---
```

Script paths use: `${CLAUDE_PLUGIN_ROOT}/skills/{skill-name}/scripts/script.py`

---

## Core Growth Skills (8 skills)

These are the differentiating skills that make Solti valuable.

---

### 1. /prospect — Lead Generation & Enrichment

**Cognitive Mode:** Growth Hacker
**Model:** sonnet | **Context:** fork
**Scripts:** 6 | **Estimated cost per run:** $0.30-2.00

#### Purpose
Find, qualify, and enrich leads from multiple sources. The most important skill in Solti — this is where value creation begins.

#### Three Modes

| Mode | Trigger | What it does |
|------|---------|-------------|
| DISCOVER | "find restaurants in bogota" | Scrape → Enrich → Score → Import |
| ENRICH | "enrich these contacts" | Take existing contacts, add email/phone/social |
| BATCH | "run weekly prospect job" | Scheduled bulk prospecting via Hub |

#### Scripts

| Script | Input | Output | External API |
|--------|-------|--------|-------------|
| `scrape_apify.py` | --platform, --query, --location, --max | JSON array of raw leads | Apify REST API |
| `scrape_phantom.py` | --phantom, --query, --session | JSON array of raw leads | PhantomBuster REST API |
| `enrich_lead.py` | --input (JSON file), --enrich (email,phone,social) | JSON array with added fields | Apify enrichment actors |
| `score_lead.py` | --input (JSON file), --icp (path to my-icp.md) | JSON array with score field (0-100) | None (local scoring) |
| `import_to_crm.py` | --input (JSON file), --min-score | Import count + skipped count | Hub MCP or REST |
| `batch_prospect.py` | --config (batch config YAML) | Orchestrates above scripts in parallel | ThreadPoolExecutor |

#### Supported Platforms

| Platform | Apify Actor | Data returned |
|----------|------------|---------------|
| Google Maps | `compass/crawler-google-places` | Name, address, phone, website, rating, reviews |
| LinkedIn | `anchor/linkedin-search` | Name, title, company, location, profile URL |
| Instagram | `apify/instagram-scraper` | Username, bio, followers, email (if public) |
| TikTok | `clockworks/tiktok-scraper` | Username, bio, followers, videos |
| Website | `apify/web-scraper` | Custom extraction from any website |

#### Prompts

| Prompt | Purpose | Placeholders |
|--------|---------|-------------|
| `lead_profile.txt` | Generate a lead profile summary | `{{lead.name}}`, `{{lead.company}}`, `{{lead.data}}` |
| `qualification.txt` | Qualify lead against ICP criteria | `{{lead.data}}`, `{{icp.criteria}}`, `{{icp.disqualifiers}}` |

#### Pre-execution Checklist
1. Read `context/my-icp.md` — know WHO we're looking for
2. Read `context/my-offer.md` — know WHAT we're offering
3. Read `memory/MEMORY.md` — check for prior scraping lessons
4. Run `bin/solti-hub-check` — verify Service Hub is online
5. Run `bin/solti-cost-check` — show today's spend
6. CONFIRM with user: platform, query, location, estimated count, estimated cost

#### Post-execution Report
```
| Metric              | Value   |
|---------------------|---------|
| Total scraped       | 100     |
| Enriched with email | 78      |
| Enriched with phone | 65      |
| Score >= 80 (hot)   | 23      |
| Score 60-79 (warm)  | 34      |
| Score < 60 (cold)   | 43      |
| Imported to CRM     | 57      |
| Duplicates skipped  | 12      |
| Cost                | $0.52   |
```

---

### 2. /outreach — Multi-Channel Outreach Sequences

**Cognitive Mode:** Sales Strategist
**Model:** sonnet | **Context:** fork
**Scripts:** 7 | **Estimated cost per run:** $0.50-5.00

#### Purpose
Create and execute multi-channel outreach sequences: email, LinkedIn, Instagram DM, WhatsApp.

#### Three Modes

| Mode | Trigger | What it does |
|------|---------|-------------|
| CREATE | "create a cold email sequence for restaurants" | Design sequence with AI copy |
| SEND | "send the restaurant sequence to hot leads" | Execute sending via appropriate channels |
| FOLLOWUP | "follow up with leads that didn't respond" | Generate and send follow-up messages |

#### Scripts

| Script | Purpose | External API |
|--------|---------|-------------|
| `generate_sequence.py` | AI generates email/message sequence | None (uses Claude) |
| `send_email_campaign.py` | Send emails via Brevo | Brevo API |
| `send_linkedin_dm.py` | Send LinkedIn messages | PhantomBuster |
| `send_instagram_dm.py` | Send Instagram DMs | Apify (mikolabs/instagram-bulk-dm) |
| `send_whatsapp.py` | Send WhatsApp messages | Hub → Evolution API |
| `check_campaign_status.py` | Poll campaign sending status | Hub API |
| `generate_followup.py` | AI generates follow-up based on non-responses | None (uses Claude) |

#### Sequence Structure
```yaml
sequence:
  name: "Restaurant Cold Outreach"
  channel: email
  steps:
    - day: 0
      type: initial
      subject: "{{lead.name}} — quick question about {{lead.business}}"
      body_prompt: "outreach/initial.txt"
    - day: 3
      type: followup
      subject: "Re: quick question"
      body_prompt: "outreach/followup_1.txt"
      condition: "no_reply"
    - day: 7
      type: breakup
      subject: "Last try, {{lead.first_name}}"
      body_prompt: "outreach/breakup.txt"
      condition: "no_reply"
```

---

### 3. /publish — Social Media Content & Publishing

**Cognitive Mode:** Content Creator
**Model:** sonnet | **Context:** fork
**Scripts:** 5

#### Purpose
Generate content in user's voice and publish to social media platforms.

#### Modes

| Mode | Trigger | What it does |
|------|---------|-------------|
| CREATE | "write a LinkedIn post about lead generation" | Generate content in my-voice.md style |
| SCHEDULE | "schedule 5 posts for next week" | Create content calendar + schedule via getLate |
| PUBLISH | "publish this post now" | Immediate publish to specified platforms |

#### Scripts

| Script | Purpose | External API |
|--------|---------|-------------|
| `generate_post.py` | AI content generation with voice matching | None (uses Claude) |
| `schedule_post.py` | Schedule via getLate or Buffer | getLate API |
| `publish_now.py` | Immediate publish | getLate API |
| `generate_carousel.py` | Generate carousel images (text-based) | None (local) |
| `content_calendar.py` | Generate weekly content plan | None (uses Claude) |

---

### 4. /deploy — Campaign Launcher

**Cognitive Mode:** Campaign Engineer (inspired by gstack's /ship)
**Model:** sonnet | **Context:** fork
**Scripts:** 4

#### Purpose
Launch campaigns with rigorous pre-flight checks. Inspired by gstack's /ship workflow.

#### 8-Step Launch Workflow

```
Step 1: PRE-FLIGHT
  → Verify: Hub online, credentials valid, contact list ready
  → Check: no duplicate campaign names, within daily limits

Step 2: VALIDATE CONTENT
  → Review email subject/body for spam triggers
  → Check personalization tags resolve correctly
  → Verify unsubscribe link present

Step 3: TEST SEND
  → Send to test email address
  → Send to test WhatsApp number
  → Preview in all channels

Step 4: CONFIRM WITH USER
  → Show: recipient count, channels, estimated cost, schedule
  → WAIT for explicit "yes, deploy" before proceeding

Step 5: EXECUTE
  → Create campaign in Hub
  → Queue sending jobs
  → Start background processing

Step 6: MONITOR (first 5 minutes)
  → Check for bounces, errors, blocks
  → Report initial delivery rate

Step 7: REPORT
  → Summary: sent, delivered, errors, cost

Step 8: LOG
  → Update daily log with campaign details
  → Update MEMORY.md if significant learnings
```

---

### 5. /whatsapp — WhatsApp Agent Management

**Cognitive Mode:** Bot Architect
**Model:** sonnet | **Context:** fork
**Scripts:** 4

#### Purpose
Deploy, configure, and monitor AI-powered WhatsApp instances via Evolution API.

#### Modes

| Mode | Trigger |
|------|---------|
| CREATE | "create a WhatsApp agent for customer support" |
| CONFIGURE | "update the WhatsApp agent's system prompt" |
| MONITOR | "check WhatsApp agent status" |
| CONVERSATIONS | "show recent WhatsApp conversations" |

#### Scripts

| Script | Purpose |
|--------|---------|
| `create_instance.py` | Deploy new Evolution API instance |
| `configure_instance.py` | Set system prompt, auto-reply rules |
| `check_status.py` | Health check all instances |
| `export_conversations.py` | Export conversation logs |

---

### 6. /crm — Contact & Pipeline Management

**Cognitive Mode:** Account Manager
**Model:** haiku | **Context:** fork
**Scripts:** 4

#### Purpose
Manage contacts, companies, deals, and activity timeline. Lightweight CRM operations.

#### Operations

| Operation | What it does |
|-----------|-------------|
| Search | "find all contacts from Bogota with score > 80" |
| Create | "add contact: John Doe, john@company.com, CEO" |
| Update | "mark John Doe as contacted, add note: called, interested" |
| Pipeline | "show me all deals in negotiation stage" |
| Timeline | "show activity for John Doe" |
| Export | "export all hot leads as CSV" |

---

### 7. /connect — Session & Credential Manager

**Cognitive Mode:** Session Manager (inspired by gstack's /setup-browser-cookies)
**Model:** haiku | **Context:** fork
**Scripts:** 2

#### Purpose
Import browser sessions, API keys, and credentials for services that need authentication.

#### Supported Imports

| Service | What's needed | How to get it |
|---------|--------------|---------------|
| Instagram | Session cookie | Export from browser DevTools |
| LinkedIn | Session cookie | Export from browser DevTools |
| Apify | API token | Copy from apify.com/settings |
| PhantomBuster | API key | Copy from phantombuster.com/settings |
| Brevo | API key | Copy from app.brevo.com/settings |
| getLate | API token | Copy from getlate.com/settings |
| Evolution | API key | Copy from Evolution admin panel |

---

### 8. /pipeline — Full Funnel Automation

**Cognitive Mode:** Growth Operator
**Model:** sonnet | **Context:** fork
**Scripts:** 3

#### Purpose
Execute the complete growth pipeline in one command: prospect → enrich → outreach → nurture.

#### Example
```
User: "run a full pipeline: find 200 SaaS founders in LATAM,
       enrich them, send cold email, and set up WhatsApp follow-up"

Pipeline:
1. /prospect DISCOVER → 200 leads from LinkedIn
2. /prospect ENRICH → emails and phones added
3. /outreach CREATE → 3-step email sequence generated
4. /deploy → campaign launched
5. /whatsapp CONFIGURE → auto-reply for inbound from campaign
6. /retro → report results after 7 days
```

---

## Strategic Skills (4 skills)

Inspired by gstack's planning, review, and retrospective workflows.

---

### 9. /strategy — Growth Planning

**Cognitive Mode:** CEO/Founder
**Model:** opus (complex reasoning)
**Context:** fork

#### Purpose
Strategic growth planning with three modes, inspired by gstack's `/plan-ceo-review`.

#### Three Modes

| Mode | Trigger | Mindset |
|------|---------|---------|
| EXPAND | "let's think big about growth" | Dream big, explore new channels, raise targets |
| HOLD | "optimize our current funnel" | Maximum rigor on what's working, squeeze more from existing |
| REDUCE | "we need to focus" | Strip to essentials, kill underperforming channels |

#### Pre-Review Audit
1. Read context/ files (business, ICP, offer, competitors)
2. Read MEMORY.md for historical context
3. Query Hub: lead count, campaign stats, conversion rates, costs
4. Read last /retro report (if exists)

#### Output: Strategic Plan
```markdown
# Growth Strategy — [Date]
## Mode: [EXPAND/HOLD/REDUCE]

### Current State
- Leads this month: X
- Conversion rate: Y%
- Cost per lead: $Z
- Active channels: [list]

### Priorities (P0-P4)
- P0: [Immediate action]
- P1: [This week]
- P2: [This month]
- P3: [This quarter]

### Channel Analysis
| Channel | Leads | Conv% | CPL | Verdict |
|---------|-------|-------|-----|---------|
| Google Maps | ... | ... | ... | SCALE/HOLD/KILL |

### Recommended Actions
1. ...
2. ...

### TODOS
- [ ] P0: ...
- [ ] P1: ...
```

---

### 10. /audit — Campaign & System Health Check

**Cognitive Mode:** Paranoid Reviewer (inspired by gstack's `/review`)
**Model:** sonnet
**Context:** fork

#### Purpose
Two-pass audit of campaigns, lead quality, and system health.

#### Pass 1: CRITICAL (Blocking)
- Email deliverability (bounce rate > 5% = RED)
- Lead data quality (missing emails > 30% = RED)
- Credit balance (< 10% remaining = RED)
- WhatsApp instance health (disconnected = RED)
- API key expiry (< 7 days = RED)

#### Pass 2: INFORMATIONAL
- Campaign open rates vs benchmarks
- Lead scoring distribution
- Channel cost efficiency
- Content engagement rates
- Unused features or underutilized services

---

### 11. /retro — Weekly Review & Metrics

**Cognitive Mode:** Engineering Manager (inspired by gstack's `/retro`)
**Model:** sonnet
**Context:** fork

#### Purpose
Weekly retrospective with metrics, trends, and action items.

#### Data Gathered
```
From Hub:
  - Leads generated (by source, by day)
  - Campaigns sent (by channel, by status)
  - Emails: sent, opened, clicked, bounced
  - DMs: sent, replied, ignored
  - WhatsApp: messages in, messages out, conversations
  - Costs: by service, by action
  - CRM: new contacts, status changes, deals moved

From Memory:
  - Previous retro JSON (for trend comparison)
  - Daily logs (for qualitative insights)
```

#### Output: Retro Report + JSON Snapshot
```markdown
# Weekly Retro — Week of [Date]

## Key Metrics
| Metric | This Week | Last Week | Delta |
|--------|-----------|-----------|-------|
| Leads generated | 245 | 180 | +36% |
| Emails sent | 500 | 400 | +25% |
| Email open rate | 32% | 28% | +4pp |
| Cost per lead | $0.42 | $0.55 | -24% |
| Total spend | $102 | $99 | +3% |

## What Worked
- ...

## What Didn't
- ...

## Action Items for Next Week
- [ ] ...
```

JSON snapshot saved to `.context/retros/{date}.json` for trend tracking.

---

### 12. /qa — Campaign Testing

**Cognitive Mode:** QA Lead (inspired by gstack's `/qa`)
**Model:** sonnet
**Context:** fork

#### Purpose
Test campaigns before sending: preview emails, verify WhatsApp, check landing pages.

#### Test Suite
1. **Email preview** — Render email with real lead data, check spam score
2. **DM preview** — Show Instagram/LinkedIn message with real names
3. **WhatsApp test** — Send test message to your own number
4. **Landing page check** — Browse target URL, verify load speed, forms work
5. **Deliverability** — Check sender domain (SPF, DKIM, DMARC)
6. **Personalization** — Verify all {{tags}} resolve correctly

---

## Meta Skills (3 skills)

---

### 13. /onboard — Setup Wizard

**Cognitive Mode:** Setup Assistant
**Model:** sonnet

#### Purpose
First-run experience. Guides user through configuring their Solti instance.

#### 5-Phase Setup
```
Phase 1: BUSINESS
  "Tell me about your business"
  → Generates context/my-business.md

Phase 2: VOICE
  "How do you communicate? Share examples"
  → Generates context/my-voice.md

Phase 3: ICP
  "Who is your ideal customer?"
  → Generates context/my-icp.md

Phase 4: OFFER
  "What's your value proposition?"
  → Generates context/my-offer.md

Phase 5: CONNECT
  "Let's connect your services"
  → Walks through API key setup for each service
  → Generates affiliate links for services user doesn't have
  → Tests each connection
  → Stores in Hub's Tenant Vault
```

---

### 14. /browse — Browser Automation

**Cognitive Mode:** QA Engineer
**Model:** sonnet

#### Purpose
Browser automation for manual scraping, QA of landing pages, and visual verification. Inspired by gstack's browse system.

#### Approach
Uses Playwright via CLI binary (not MCP) for zero token overhead. Persistent Chromium daemon with ref-based element selection (@e1, @e2).

---

### 15. /upgrade — Self-Updater

**Cognitive Mode:** Release Manager
**Model:** haiku

#### Purpose
Check for and apply Solti Plugin updates. Inspired by gstack's update system.

#### Features
- 24h cached version check (bin/solti-update-check)
- Update preamble injected in all skills
- Changelog display between versions
- Automatic setup after update
