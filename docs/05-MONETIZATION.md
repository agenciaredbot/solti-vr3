# SOLTI VR3 — Monetization Strategy

> Version: 1.0.0 | Last updated: 2026-03-15

---

## Revenue Model: 4 Streams

### Stream 1: SaaS Subscription

| Plan | Monthly | Leads/mo | Emails/mo | WApp Instances | DMs/mo | Social Posts/mo | Platform Credits |
|------|---------|----------|-----------|----------------|--------|-----------------|-----------------|
| **Free** | $0 | 50 | 100 | 0 | 0 | 5 | 10 |
| **Pro** | $29 | 500 | 2,000 | 1 | 100 | 30 | 50 |
| **Growth** | $79 | 2,000 | 10,000 | 3 | 500 | 100 | 200 |
| **Agency** | $199 | Unlimited | Unlimited | 10 | 2,000 | Unlimited | 500 |

- Free plan: enough to try everything, not enough to scale
- Pro plan: target solopreneur doing moderate outreach
- Growth plan: serious growth hacker doing daily prospecting
- Agency plan: agencies managing multiple clients

### Stream 2: Credit Marketplace

For users who use PLATFORM credentials (our API keys) instead of their own:

| Package | Credits | Price | Per Credit |
|---------|---------|-------|-----------|
| Pay as you go | 10 | $2 | $0.20 |
| Basic | 100 | $10 | $0.10 |
| Growth | 500 | $40 | $0.08 |
| Pro | 2,000 | $120 | $0.06 |

**Margin:** We pay ~$0.03-0.05 real cost per credit, sell at $0.06-0.20 = 50-300% markup.

Users who bring their own API keys skip credits entirely (we only charge subscription).

### Stream 3: Affiliate Revenue

When users create accounts via our referral links:

| Service | Affiliate Program | Expected Commission |
|---------|-------------------|-------------------|
| Apify | Apify Partner Program | 20% recurring commission |
| PhantomBuster | PhantomBuster Referral | $50 per signup + credits |
| Brevo | Brevo Partner | 10% recurring |

**Revenue trigger:** Every new user who doesn't have existing accounts = potential affiliate revenue on 3+ platforms.

### Stream 4: Plugin License (Optional)

| Option | Price | What they get |
|--------|-------|---------------|
| Plugin only | $9.99 one-time | Plugin skills without Hub (limited to own API keys, no CRM) |
| Plugin + Hub | Included with subscription | Full platform access |

## Revenue Projections (Conservative)

### Month 6: 100 users
```
Subscriptions: 60 Free + 25 Pro + 12 Growth + 3 Agency
  = $0 + $725 + $948 + $597 = $2,270/mo

Credits: ~30% of users buy extra credits
  = 30 users x avg $15/mo = $450/mo

Affiliates: ~40 referrals generating recurring revenue
  = 40 x avg $8/mo commission = $320/mo

Total: ~$3,040/mo
```

### Month 12: 500 users
```
Subscriptions: 250 Free + 150 Pro + 70 Growth + 30 Agency
  = $0 + $4,350 + $5,530 + $5,970 = $15,850/mo

Credits: $2,500/mo
Affiliates: $1,200/mo

Total: ~$19,550/mo
```

## Cost Structure

### Fixed Monthly Costs

| Service | Cost | Notes |
|---------|------|-------|
| Supabase | $25 | Pro plan (500MB DB, 50K MAU) |
| Railway/Render | $20 | Hub hosting |
| Redis | $10 | Managed Redis |
| Vercel | $20 | Dashboard hosting |
| Evolution VPS | $10 | Shared WhatsApp instances |
| Domain + DNS | $5 | solti.app |
| **Total** | **~$90/mo** | |

### Variable Costs (per user action using PLATFORM keys)

| Action | Our cost | We charge | Margin |
|--------|----------|-----------|--------|
| 100 leads scrape | $0.50 | 5 credits ($0.50-1.00) | 0-100% |
| 500 emails | $0.20 | 2 credits ($0.20-0.40) | 0-100% |
| 50 IG DMs | $0.80 | 8 credits ($0.80-1.60) | 0-100% |

**Key insight:** Users who bring their own keys cost us nearly nothing. Users who use platform credits have positive margin.

## Onboarding Monetization Funnel

```
User discovers Solti (content marketing, Claude plugin marketplace)
    │
    ▼
Installs plugin (free) → runs /onboard
    │
    ▼
Phase 5: CONNECT services
    │
    ├── Has Apify? → "Paste your API key" → We earn $0
    │                                        (but retention value)
    │
    └── No Apify? → "Create account here: [AFFILIATE LINK]"
                     → They sign up → We earn 20% recurring
                     → They paste API key → Full functionality
    │
    ▼
User tries free tier (50 leads, 100 emails)
    │
    ├── Impressed → Upgrades to Pro ($29/mo)
    │
    └── Needs more → Buys credit pack
    │
    ▼
Ongoing: affiliate commissions + subscription + credits
```

## Payment Integration: Stripe

### Implementation

```typescript
// Stripe products
const PLANS = {
  free: { price_id: null, credits: 10 },
  pro: { price_id: 'price_xxx_pro', credits: 50 },
  growth: { price_id: 'price_xxx_growth', credits: 200 },
  agency: { price_id: 'price_xxx_agency', credits: 500 },
};

// Stripe webhooks to handle
const STRIPE_EVENTS = [
  'checkout.session.completed',   // New subscription
  'invoice.paid',                 // Recurring payment success
  'invoice.payment_failed',       // Payment failed
  'customer.subscription.updated', // Plan change
  'customer.subscription.deleted', // Cancellation
];
```

### Credit Purchases (Stripe Checkout)

```
User clicks "Buy 100 credits" in Dashboard
    → Stripe Checkout session created
    → User pays $10
    → Webhook: checkout.session.completed
    → Hub adds 100 credits to tenant balance
    → Credit transaction logged
```

## Affiliate Link Management

### Setup

For each affiliate program, we have:
1. A referral ID/link registered with the service
2. A tracking pixel or callback URL for conversion tracking
3. A commission structure documented

### Implementation in /onboard

```markdown
# In SKILL.md for /onboard:

## Phase 5: CONNECT

For each service, check if user has an API key.
If not, provide the affiliate signup link.

### Apify
Ask: "Do you have an Apify account?"
If NO:
  "Great! Create a free Apify account here:
   https://console.apify.com/sign-up?ref=SOLTI_AFFILIATE_ID

   Apify gives you $5 free credits to start.
   Once created, go to Settings → Integrations → API Token
   and paste it below."

### PhantomBuster
Ask: "Do you have a PhantomBuster account?"
If NO:
  "Create your PhantomBuster account here:
   https://phantombuster.com?ref=SOLTI_AFFILIATE_ID

   They offer a 14-day free trial.
   Go to Settings → API Keys and paste your key below."
```

## Packaging for Distribution

### As Claude Code Plugin

```json
// plugin.json
{
  "name": "solti",
  "version": "1.0.0",
  "description": "Autonomous growth engine: lead generation, multi-channel outreach, social publishing, WhatsApp agents. Use when user says 'find leads', 'send campaign', 'publish post', 'create WhatsApp agent', or 'grow my business'.",
  "author": {
    "name": "Solti"
  }
}
```

Install: `claude plugin add solti` (or manual install via git clone + setup)

### As Data Package (Alternative)

For users who want just the skills without the Hub:

```
solti-skills-pack/
├── skills/              # All 15 SKILL.md files
├── scripts/             # All Python scripts
├── context/             # Template context files
├── hooks/               # Guardrails + memory
├── setup.sh             # One-command setup
└── README.md
```

Price: $49 one-time. User brings their own everything (API keys, database).

## Key Monetization Decisions

1. **Free tier is generous enough to get hooked** — 50 leads is enough to see value, not enough to scale
2. **Own API keys = no credit cost** — We don't penalize power users; they pay subscription for the orchestration value
3. **Affiliate revenue is passive** — Once a user creates an account via our link, we earn forever
4. **Credits have diminishing cost** — Bulk buyers get better rates, encouraging larger purchases
5. **Agency plan is the whale** — 3-5 agency customers = $600-1000/mo guaranteed
