# SOLTI VR3 — Database Schema

> Version: 1.0.0 | Last updated: 2026-03-15
> PostgreSQL (Supabase) with Row Level Security for multi-tenancy

---

## Schema Overview

```
TENANCY & AUTH
  tenants              → Top-level account (organization)
  tenant_members       → Users belonging to a tenant
  tenant_configs       → Per-tenant settings

CREDENTIALS & BILLING
  tenant_credentials   → Encrypted API keys (Tenant Vault)
  credit_balances      → Current credit state
  credit_transactions  → Credit audit log
  subscriptions        → Stripe subscription state
  affiliate_referrals  → Affiliate tracking

CRM
  contacts             → People/leads
  companies            → Organizations
  contact_companies    → Many-to-many relation
  deals                → Sales pipeline
  activities           → Timeline events (calls, emails, notes)
  tags                 → Tagging system
  contact_tags         → Many-to-many
  lists                → Contact lists/segments

CAMPAIGNS
  campaigns            → Email/DM/WhatsApp campaigns
  campaign_steps       → Sequence steps
  campaign_recipients  → Who receives what
  campaign_events      → Opens, clicks, replies, bounces

WHATSAPP
  whatsapp_instances   → Evolution API instances
  whatsapp_conversations → Chat threads
  whatsapp_messages    → Individual messages

CONTENT
  content_posts        → Social media posts
  content_schedules    → Publishing schedule

JOBS
  jobs                 → Background job tracking
  scrape_results       → Raw scraping data

ANALYTICS
  usage_logs           → API usage tracking
  daily_metrics        → Aggregated daily stats
```

## Full Schema Definition

### Tenancy & Auth

```sql
-- Top-level account. One tenant can have multiple users (Agency plan).
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,                    -- URL-friendly identifier
  plan TEXT NOT NULL DEFAULT 'free',            -- free, pro, growth, agency
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users belonging to a tenant. Links to Supabase Auth.
CREATE TABLE tenant_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,                        -- Supabase auth.users.id
  role TEXT NOT NULL DEFAULT 'owner',           -- owner, admin, member
  email TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(tenant_id, user_id)
);

-- Per-tenant configuration
CREATE TABLE tenant_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  timezone TEXT NOT NULL DEFAULT 'America/Bogota',
  language TEXT NOT NULL DEFAULT 'es',
  default_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  telegram_chat_id TEXT,
  telegram_linked_at TIMESTAMPTZ,
  plugin_api_key TEXT UNIQUE,                   -- For Plugin → Hub MCP auth
  notify_on_job_complete BOOLEAN DEFAULT true,
  notify_on_error BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security: every table with tenant_id gets this
-- ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY tenant_isolation ON table_name
--   USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

### Credentials & Billing

```sql
-- Encrypted API keys per tenant per service
CREATE TABLE tenant_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service TEXT NOT NULL,                        -- apify, phantombuster, brevo, evolution, getlate, instagram, linkedin
  cred_type TEXT NOT NULL,                      -- OWN_KEY, PLATFORM, AFFILIATE, SESSION
  encrypted_value TEXT NOT NULL,                -- AES-256-GCM encrypted
  metadata JSONB DEFAULT '{}',                  -- expiry, affiliate_ref, notes
  is_valid BOOLEAN DEFAULT true,                -- Last connection test result
  last_tested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(tenant_id, service)
);

-- Credit balance (one row per tenant)
CREATE TABLE credit_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  plan_credits INTEGER NOT NULL DEFAULT 10,     -- Monthly allocation from plan
  purchased_credits INTEGER NOT NULL DEFAULT 0,
  used_credits INTEGER NOT NULL DEFAULT 0,
  resets_at TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('month', NOW()) + INTERVAL '1 month'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Credit transaction audit log
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                           -- deduct, purchase, plan_reset, refund, bonus
  amount INTEGER NOT NULL,                      -- Positive = add, negative = deduct
  balance_after INTEGER NOT NULL,
  service TEXT,                                 -- Which service consumed credits
  action TEXT,                                  -- What action was performed
  real_cost_usd DECIMAL(10, 4),                -- Actual cost to us
  description TEXT,
  job_id UUID,                                  -- Reference to job that consumed credits
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Stripe subscription tracking
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  stripe_price_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',        -- active, past_due, canceled, trialing
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Affiliate referral tracking
CREATE TABLE affiliate_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service TEXT NOT NULL,                        -- apify, phantombuster, brevo
  referral_link TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SENT',          -- SENT, CLICKED, SIGNED_UP, PAYING, EXPIRED
  clicked_at TIMESTAMPTZ,
  signed_up_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(tenant_id, service)
);
```

### CRM

```sql
-- Contacts (leads, customers, etc.)
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT GENERATED ALWAYS AS (
    COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')
  ) STORED,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  instagram TEXT,
  linkedin TEXT,
  tiktok TEXT,
  website TEXT,
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'NEW',           -- NEW, CONTACTED, REPLIED, QUALIFIED, CUSTOMER, LOST
  score INTEGER DEFAULT 0,                      -- 0-100 lead score
  source TEXT,                                  -- google_maps, linkedin, instagram, manual, import
  source_url TEXT,                              -- Original scrape URL
  city TEXT,
  country TEXT,
  notes TEXT,
  custom_fields JSONB DEFAULT '{}',
  raw_data JSONB DEFAULT '{}',                  -- Original scrape data
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX idx_contacts_email ON contacts(tenant_id, email);
CREATE INDEX idx_contacts_status ON contacts(tenant_id, status);
CREATE INDEX idx_contacts_score ON contacts(tenant_id, score DESC);
CREATE INDEX idx_contacts_search ON contacts USING GIN (
  to_tsvector('spanish', COALESCE(first_name,'') || ' ' || COALESCE(last_name,'') || ' ' || COALESCE(email,'') || ' ' || COALESCE(notes,''))
);

-- Companies
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT,
  industry TEXT,
  size TEXT,                                    -- 1-10, 11-50, 51-200, 200+
  city TEXT,
  country TEXT,
  website TEXT,
  phone TEXT,
  description TEXT,
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Contact-Company relation
CREATE TABLE contact_companies (
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT,                                   -- Job title at this company
  is_primary BOOLEAN DEFAULT true,

  PRIMARY KEY(contact_id, company_id)
);

-- Deals (sales pipeline)
CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  value DECIMAL(12, 2),
  currency TEXT DEFAULT 'USD',
  stage TEXT NOT NULL DEFAULT 'LEAD',           -- LEAD, QUALIFIED, PROPOSAL, NEGOTIATION, WON, LOST
  probability INTEGER DEFAULT 0,               -- 0-100
  expected_close_at DATE,
  closed_at TIMESTAMPTZ,
  lost_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Activities (timeline events)
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  type TEXT NOT NULL,                           -- note, email_sent, email_received, call, meeting, dm_sent, dm_received, whatsapp, status_change, score_change
  title TEXT,
  description TEXT,
  metadata JSONB DEFAULT '{}',                  -- channel-specific data
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activities_contact ON activities(contact_id, created_at DESC);
CREATE INDEX idx_activities_tenant ON activities(tenant_id, created_at DESC);

-- Tags
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',

  UNIQUE(tenant_id, name)
);

CREATE TABLE contact_tags (
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(contact_id, tag_id)
);

-- Contact lists (segments)
CREATE TABLE lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_dynamic BOOLEAN DEFAULT false,            -- Dynamic: filter-based, Static: manual
  filters JSONB DEFAULT '{}',                   -- For dynamic lists: {status: "QUALIFIED", score_gte: 80}
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE list_members (
  list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(list_id, contact_id)
);
```

### Campaigns

```sql
-- Campaigns
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,                           -- email, instagram_dm, linkedin_dm, whatsapp, multi_channel
  status TEXT NOT NULL DEFAULT 'DRAFT',         -- DRAFT, SCHEDULED, SENDING, PAUSED, COMPLETED, FAILED
  list_id UUID REFERENCES lists(id),            -- Target list
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  stats JSONB DEFAULT '{"sent":0,"delivered":0,"opened":0,"clicked":0,"replied":0,"bounced":0,"failed":0}',
  settings JSONB DEFAULT '{}',                  -- Channel-specific settings
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Campaign sequence steps
CREATE TABLE campaign_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  delay_days INTEGER NOT NULL DEFAULT 0,        -- Days after previous step
  type TEXT NOT NULL,                           -- initial, followup, breakup
  channel TEXT NOT NULL,                        -- email, instagram_dm, linkedin_dm, whatsapp
  subject TEXT,                                 -- For email
  body TEXT NOT NULL,                           -- Message body (supports {{placeholders}})
  condition TEXT DEFAULT 'no_reply',            -- no_reply, no_open, always
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(campaign_id, step_number)
);

-- Campaign recipients
CREATE TABLE campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  current_step INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING',       -- PENDING, SENDING, SENT, REPLIED, BOUNCED, UNSUBSCRIBED, FAILED
  last_sent_at TIMESTAMPTZ,
  next_send_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',

  UNIQUE(campaign_id, contact_id)
);

-- Campaign events (opens, clicks, replies, bounces)
CREATE TABLE campaign_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES campaign_recipients(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  step_number INTEGER,
  event_type TEXT NOT NULL,                     -- sent, delivered, opened, clicked, replied, bounced, unsubscribed, failed
  metadata JSONB DEFAULT '{}',                  -- link_url, error_message, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaign_events ON campaign_events(campaign_id, event_type, created_at);
```

### WhatsApp

```sql
-- WhatsApp instances (via Evolution API)
CREATE TABLE whatsapp_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL,
  instance_id TEXT NOT NULL UNIQUE,             -- Evolution API instance ID
  phone_number TEXT,
  status TEXT NOT NULL DEFAULT 'DISCONNECTED',  -- DISCONNECTED, CONNECTING, CONNECTED, BANNED
  system_prompt TEXT,                           -- AI auto-reply prompt
  auto_reply BOOLEAN DEFAULT false,
  webhook_url TEXT,
  qr_code TEXT,                                 -- For connection
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- WhatsApp conversations
CREATE TABLE whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  remote_jid TEXT NOT NULL,                     -- WhatsApp JID
  remote_name TEXT,
  status TEXT DEFAULT 'ACTIVE',                 -- ACTIVE, ARCHIVED, BLOCKED
  last_message_at TIMESTAMPTZ,
  unread_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- WhatsApp messages
CREATE TABLE whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,                      -- INBOUND, OUTBOUND
  message_type TEXT NOT NULL DEFAULT 'text',    -- text, image, audio, video, document
  content TEXT,
  media_url TEXT,
  is_ai_generated BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'SENT',                   -- PENDING, SENT, DELIVERED, READ, FAILED
  external_id TEXT,                             -- Evolution message ID
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Content

```sql
-- Social media posts
CREATE TABLE content_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,                       -- instagram, facebook, linkedin, tiktok, twitter
  type TEXT NOT NULL DEFAULT 'post',            -- post, story, reel, carousel, article
  content TEXT NOT NULL,
  media_urls TEXT[],                             -- Array of image/video URLs
  hashtags TEXT[],
  status TEXT NOT NULL DEFAULT 'DRAFT',         -- DRAFT, SCHEDULED, PUBLISHED, FAILED
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  external_id TEXT,                             -- Platform post ID
  external_url TEXT,                            -- URL to published post
  stats JSONB DEFAULT '{}',                     -- likes, comments, shares, views
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Jobs

```sql
-- Background jobs
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                           -- scrape, enrich, campaign_send, dm_send, publish, whatsapp_deploy
  status TEXT NOT NULL DEFAULT 'PENDING',       -- PENDING, RUNNING, COMPLETED, FAILED, CANCELLED
  input JSONB NOT NULL DEFAULT '{}',            -- Job input parameters
  output JSONB DEFAULT '{}',                    -- Job results
  progress INTEGER DEFAULT 0,                   -- 0-100
  error TEXT,
  external_id TEXT,                             -- Apify run ID, PhantomBuster container ID, etc.
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  credits_cost INTEGER DEFAULT 0,
  real_cost_usd DECIMAL(10, 4) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_jobs_tenant ON jobs(tenant_id, status, created_at DESC);

-- Raw scraping results (temporary storage before import)
CREATE TABLE scrape_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  raw_data JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  imported_contact_id UUID REFERENCES contacts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Analytics

```sql
-- Usage logging
CREATE TABLE usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  action TEXT NOT NULL,
  credits_cost INTEGER DEFAULT 0,
  real_cost_usd DECIMAL(10, 4) DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_tenant_date ON usage_logs(tenant_id, created_at);

-- Daily aggregated metrics
CREATE TABLE daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  leads_generated INTEGER DEFAULT 0,
  leads_enriched INTEGER DEFAULT 0,
  emails_sent INTEGER DEFAULT 0,
  emails_opened INTEGER DEFAULT 0,
  dms_sent INTEGER DEFAULT 0,
  dms_replied INTEGER DEFAULT 0,
  whatsapp_messages_in INTEGER DEFAULT 0,
  whatsapp_messages_out INTEGER DEFAULT 0,
  posts_published INTEGER DEFAULT 0,
  total_credits_used INTEGER DEFAULT 0,
  total_cost_usd DECIMAL(10, 4) DEFAULT 0,

  UNIQUE(tenant_id, date)
);
```

## Prisma Schema Notes

The above SQL translates to Prisma schema. Key considerations:

1. **RLS via Supabase**: All queries scoped by tenant_id automatically
2. **Indexes**: Full-text search on contacts, composite indexes on frequently queried columns
3. **JSONB fields**: For flexible metadata without schema changes
4. **Generated columns**: full_name computed from first_name + last_name
5. **Cascading deletes**: Tenant deletion cascades to all owned data
6. **Unique constraints**: Prevent duplicate contacts per tenant (by email), duplicate credentials, etc.
