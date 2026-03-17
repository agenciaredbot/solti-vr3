# SOLTI VR3 — External Service Integrations

> Version: 1.0.0 | Last updated: 2026-03-15

---

## Integration Map

```
┌─────────────────────────────────────────────────────────────────┐
│                        SOLTI VR3                                │
│                                                                 │
│  SCRAPING & ENRICHMENT                                         │
│  ├── Apify ─────────────── Google Maps, Instagram, LinkedIn,   │
│  │                         TikTok, Website, IG DM, Enrichment  │
│  └── PhantomBuster ─────── LinkedIn automation, Email finder   │
│                                                                 │
│  EMAIL                                                          │
│  └── Brevo ─────────────── Transactional + Campaign emails     │
│                                                                 │
│  MESSAGING                                                      │
│  ├── Evolution API ─────── WhatsApp instances (self-hosted)    │
│  ├── Apify (IG DM) ────── Instagram Direct Messages           │
│  └── PhantomBuster ─────── LinkedIn Messages                   │
│                                                                 │
│  SOCIAL MEDIA                                                   │
│  └── getLate ───────────── Instagram, Facebook, LinkedIn,      │
│                            TikTok, Twitter publishing           │
│                                                                 │
│  PAYMENTS                                                       │
│  └── Stripe ────────────── Subscriptions + credit purchases    │
│                                                                 │
│  NOTIFICATIONS                                                  │
│  └── Telegram Bot ──────── Mobile commands + notifications     │
│                                                                 │
│  INFRASTRUCTURE                                                 │
│  ├── Supabase ──────────── PostgreSQL + Auth + Storage         │
│  ├── Redis ─────────────── Queue + Cache                       │
│  └── Pinecone (optional) ── Vector memory (Tier 3)             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Apify

### Overview
Cloud scraping platform with 3,000+ pre-built actors. Our primary data source.

### Connection
- **Type:** REST API
- **Auth:** API token (Bearer)
- **Base URL:** `https://api.apify.com/v2`
- **Affiliate:** Yes — Apify Partner Program (20% recurring)

### Actors We Use

| Actor ID | Purpose | Input | Output | Est. Cost |
|----------|---------|-------|--------|-----------|
| `compass/crawler-google-places` | Google Maps scraping | searchStrings, location, maxResults | Business listings with phone, address, rating | $0.50/100 results |
| `anchor/linkedin-search` | LinkedIn profile search | searchUrl, cookie | Profiles with name, title, company | $0.50/100 results |
| `apify/instagram-scraper` | Instagram profile scraping | usernames or hashtags | Profiles with bio, followers, posts | $0.30/100 profiles |
| `clockworks/tiktok-scraper` | TikTok scraping | searchQueries | Profiles with bio, followers, videos | $0.30/100 profiles |
| `apify/web-scraper` | Generic website scraping | startUrls, pageFunction | Custom extracted data | $0.20/100 pages |
| `mikolabs/instagram-bulk-dm` | Instagram DM sending | sessionIds, usernames, message | Send status per recipient | $0.80/50 messages |
| `epctex/contact-info-scraper` | Email/phone enrichment | urls | Contact info from websites | $0.40/50 contacts |

### API Pattern (Used in Scripts)

```python
# Start actor run
POST /acts/{actorId}/runs?token={apiToken}
Content-Type: application/json
Body: { ...actorInput }

# Check run status
GET /actor-runs/{runId}?token={apiToken}

# Get results when complete
GET /datasets/{datasetId}/items?token={apiToken}
```

### Script: scrape_apify.py

```python
#!/usr/bin/env python3
"""Scrape data using Apify actors."""

import argparse
import json
import sys
import time
import urllib.request
import urllib.error

ACTORS = {
    'google_maps': 'compass/crawler-google-places',
    'linkedin': 'anchor/linkedin-search',
    'instagram': 'apify/instagram-scraper',
    'tiktok': 'clockworks/tiktok-scraper',
    'website': 'apify/web-scraper',
}

BASE_URL = 'https://api.apify.com/v2'

def start_actor(actor_id: str, input_data: dict, token: str) -> dict:
    """Start an Apify actor run."""
    url = f"{BASE_URL}/acts/{actor_id}/runs?token={token}"
    data = json.dumps(input_data).encode()
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())['data']

def wait_for_run(run_id: str, token: str, timeout: int = 300) -> dict:
    """Poll until actor run completes."""
    url = f"{BASE_URL}/actor-runs/{run_id}?token={token}"
    start = time.time()
    while time.time() - start < timeout:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as resp:
            run = json.loads(resp.read())['data']
        if run['status'] in ('SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'):
            return run
        time.sleep(5)
    raise TimeoutError(f"Actor run {run_id} timed out after {timeout}s")

def get_results(dataset_id: str, token: str) -> list:
    """Fetch results from dataset."""
    url = f"{BASE_URL}/datasets/{dataset_id}/items?token={token}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())

def build_input(platform: str, query: str, location: str, max_results: int) -> dict:
    """Build actor-specific input."""
    if platform == 'google_maps':
        return {
            'searchStringsArray': [query],
            'locationQuery': location,
            'maxCrawledPlacesPerSearch': max_results,
            'language': 'es',
        }
    elif platform == 'instagram':
        return {
            'usernames': [query] if not query.startswith('#') else [],
            'hashtags': [query[1:]] if query.startswith('#') else [],
            'resultsLimit': max_results,
        }
    elif platform == 'linkedin':
        return {
            'searchUrl': query,
            'maxResults': max_results,
        }
    # ... other platforms
    return {'query': query, 'maxResults': max_results}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--platform', required=True, choices=ACTORS.keys())
    parser.add_argument('--query', required=True)
    parser.add_argument('--location', default='')
    parser.add_argument('--max-results', type=int, default=100)
    parser.add_argument('--token', default=None, help='Apify API token (or APIFY_API_TOKEN env)')
    parser.add_argument('--output', default=None, help='Output file path')
    parser.add_argument('--confirmed', action='store_true')
    args = parser.parse_args()

    import os
    token = args.token or os.environ.get('APIFY_API_TOKEN')
    if not token:
        print(json.dumps({
            "success": False,
            "error": "No Apify API token. Set APIFY_API_TOKEN or pass --token.",
            "suggestion": "Ask user to connect Apify via /connect or set the token in preferences."
        }), file=sys.stderr)
        sys.exit(1)

    try:
        actor_id = ACTORS[args.platform]
        actor_input = build_input(args.platform, args.query, args.location, args.max_results)

        # Start run
        run = start_actor(actor_id, actor_input, token)
        run_id = run['id']
        dataset_id = run['defaultDatasetId']

        # Wait for completion
        completed = wait_for_run(run_id, token)
        if completed['status'] != 'SUCCEEDED':
            print(json.dumps({
                "success": False,
                "error": f"Actor run failed with status: {completed['status']}",
                "suggestion": "Check Apify dashboard for details. The actor may need different input."
            }), file=sys.stderr)
            sys.exit(1)

        # Get results
        results = get_results(dataset_id, token)

        output = {
            "success": True,
            "platform": args.platform,
            "query": args.query,
            "location": args.location,
            "count": len(results),
            "run_id": run_id,
            "data": results,
        }

        out_str = json.dumps(output, indent=2, ensure_ascii=False)
        if args.output:
            with open(args.output, 'w') as f:
                f.write(out_str)
            print(json.dumps({"success": True, "output_file": args.output, "count": len(results)}))
        else:
            print(out_str)

    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e),
            "error_type": type(e).__name__,
            "suggestion": "Check network connection and Apify API token validity."
        }), file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
```

---

## 2. PhantomBuster

### Overview
Browser automation platform for LinkedIn and social media.

### Connection
- **Type:** REST API
- **Auth:** API key (X-Phantombuster-Key header)
- **Base URL:** `https://api.phantombuster.com/api/v2`
- **Affiliate:** Yes — PhantomBuster Referral Program

### Phantoms We Use

| Phantom | Purpose | Use case |
|---------|---------|----------|
| LinkedIn Profile Scraper | Extract LinkedIn profiles | Lead enrichment |
| LinkedIn Search Export | Export search results | Lead discovery |
| LinkedIn Auto Connect | Send connection requests | Outreach |
| LinkedIn Message Sender | Send direct messages | Outreach |
| Email Finder | Find emails from names + companies | Enrichment |

### API Pattern

```python
# Launch phantom
POST /agents/launch
Headers: X-Phantombuster-Key: {apiKey}
Body: { "id": "phantomId", "argument": { ...config } }

# Check status
GET /agents/fetch-output?id={containerId}
```

---

## 3. Brevo (formerly Sendinblue)

### Overview
Email marketing and transactional email platform.

### Connection
- **Type:** REST API
- **Auth:** API key (api-key header)
- **Base URL:** `https://api.brevo.com/v3`
- **Affiliate:** Yes — Brevo Partner Program (10% recurring)

### Endpoints We Use

| Endpoint | Purpose |
|----------|---------|
| `POST /smtp/email` | Send transactional email |
| `POST /contacts` | Create/update contact |
| `POST /emailCampaigns` | Create campaign |
| `POST /emailCampaigns/{id}/sendNow` | Send campaign |
| `GET /emailCampaigns/{id}` | Campaign stats |
| `POST /contacts/lists` | Manage contact lists |

### Email Sending Pattern

```python
def send_email(api_key: str, to: dict, subject: str, html: str, sender: dict):
    """Send transactional email via Brevo."""
    url = "https://api.brevo.com/v3/smtp/email"
    data = {
        "sender": sender,       # {"name": "...", "email": "..."}
        "to": [to],             # [{"email": "...", "name": "..."}]
        "subject": subject,
        "htmlContent": html,
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode(),
        headers={
            'api-key': api_key,
            'Content-Type': 'application/json',
        }
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())
```

---

## 4. Evolution API

### Overview
Self-hosted WhatsApp API. Deploy multiple WhatsApp instances.

### Connection
- **Type:** REST API + WebSocket (webhooks)
- **Auth:** API key (apikey header)
- **Base URL:** `http://localhost:8080` (or Docker service)

### Endpoints We Use

| Endpoint | Purpose |
|----------|---------|
| `POST /instance/create` | Create WhatsApp instance |
| `GET /instance/connect/{name}` | Get QR code for connection |
| `GET /instance/connectionState/{name}` | Check connection status |
| `POST /message/sendText/{name}` | Send text message |
| `POST /message/sendMedia/{name}` | Send image/video/document |
| `GET /chat/findMessages/{name}` | Get conversation messages |
| `DELETE /instance/delete/{name}` | Remove instance |

### Webhook Events

Evolution sends webhooks for:
- `messages.upsert` — New message received
- `connection.update` — Connection state changed
- `messages.update` — Message status updated (delivered, read)

---

## 5. getLate

### Overview
Social media publishing platform. Schedule and publish to multiple networks.

### Connection
- **Type:** REST API
- **Auth:** API token
- **Platforms:** Instagram, Facebook, LinkedIn, TikTok, Twitter

### API Pattern

```python
# Schedule a post
POST /api/v1/posts
Headers: Authorization: Bearer {token}
Body: {
    "platform": "instagram",
    "type": "post",
    "content": "Post text...",
    "media": ["https://...image.jpg"],
    "schedule_at": "2026-03-20T10:00:00Z"
}

# Get post status
GET /api/v1/posts/{id}

# List scheduled posts
GET /api/v1/posts?status=scheduled
```

---

## 6. Stripe

### Overview
Payment processing for subscriptions and credit purchases.

### Connection
- **Type:** REST API + Webhooks
- **Auth:** Secret key
- **Dashboard:** dashboard.stripe.com

### Implementation

```typescript
// Products to create in Stripe
const products = {
  pro_monthly: { price: 2900, interval: 'month' },     // $29/mo
  growth_monthly: { price: 7900, interval: 'month' },   // $79/mo
  agency_monthly: { price: 19900, interval: 'month' },  // $199/mo
  credits_100: { price: 1000, mode: 'payment' },        // $10 one-time
  credits_500: { price: 4000, mode: 'payment' },        // $40 one-time
  credits_2000: { price: 12000, mode: 'payment' },      // $120 one-time
};

// Webhook events to handle
const webhookHandlers = {
  'checkout.session.completed': handleCheckoutComplete,
  'invoice.paid': handleInvoicePaid,
  'invoice.payment_failed': handlePaymentFailed,
  'customer.subscription.updated': handleSubUpdate,
  'customer.subscription.deleted': handleSubCanceled,
};
```

---

## 7. Telegram Bot

### Overview
Mobile interface for quick commands and notifications.

### Connection
- **Type:** Bot API (long polling or webhook)
- **Auth:** Bot token from @BotFather
- **Library:** grammy (TypeScript)

### Commands

```
/start           → Link Telegram to Solti account
/status          → System overview
/leads           → Lead stats (today, week, month)
/leads hot       → List hot leads (score > 80)
/campaigns       → Active campaign status
/cost            → Today's spend
/run prospect    → Trigger prospect skill
/help            → List commands
```

---

## 8. Supabase

### Overview
Backend-as-a-Service: PostgreSQL, Auth, Storage, Edge Functions.

### What We Use

| Feature | Purpose |
|---------|---------|
| PostgreSQL | Primary database with RLS |
| Auth | User registration, login, JWT tokens |
| Storage | Media files (campaign images, post assets) |
| RLS | Row Level Security for multi-tenancy |

### RLS Setup

```sql
-- Enable RLS on all tenant tables
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see their tenant's data
CREATE POLICY "Tenant isolation" ON contacts
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid()
    )
  );
```

---

## 9. Pinecone (Optional — Tier 3 Memory)

### Overview
Vector database for long-term AI memory.

### Connection
- **Type:** REST API
- **Auth:** API key
- **Config:** Serverless (AWS us-east-1)

### Usage
- Store memory embeddings from mem0
- Hybrid search: vector similarity + BM25 keyword
- ~$0.04/month for typical usage

---

## Integration Testing Checklist

Before deploying, verify each integration:

```
[ ] Apify: scrape_apify.py --platform google_maps --query "test" --max-results 5
[ ] PhantomBuster: scrape_phantom.py --phantom "test" --query "test"
[ ] Brevo: send_email_campaign.py --to "test@test.com" --subject "Test"
[ ] Evolution: create_instance.py --name "test-instance"
[ ] getLate: schedule_post.py --platform "instagram" --content "Test" --schedule "now"
[ ] Stripe: webhook test via Stripe CLI
[ ] Telegram: /status command from linked account
[ ] Supabase: CRUD operations with RLS active
```

## Environment Variables Required

```bash
# Required for all deployments
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
VAULT_MASTER_KEY=<32-byte-hex>

# Required for external services (can be per-tenant via Vault)
APIFY_API_TOKEN=apify_api_xxx
PHANTOMBUSTER_API_KEY=xxx
BREVO_API_KEY=xkeysib-xxx
EVOLUTION_API_KEY=xxx
EVOLUTION_API_URL=http://localhost:8080
GETLATE_API_TOKEN=xxx

# Required for monetization
STRIPE_SECRET_KEY=sk_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
TELEGRAM_BOT_TOKEN=xxx

# Optional (Tier 3 memory)
OPENAI_API_KEY=sk-xxx
PINECONE_API_KEY=xxx
MEM0_USER_ID=solti-user
```
