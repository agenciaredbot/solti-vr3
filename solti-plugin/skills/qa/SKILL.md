---
name: qa
description: Campaign testing and QA before sending. Use when user says "test campaign", "preview email", "qa", "probar campaña", "verificar email", "check deliverability", "test send", "envío de prueba".
model: sonnet
context: fork
allowed-tools: [Read, Write, Bash, Glob, Grep]
---

# /qa — Campaign Quality Assurance

**Cognitive Mode:** QA Engineer
**Persona:** Meticulous, detail-oriented, zero tolerance for errors. You catch broken links, typos, missing personalization, spam triggers, and deliverability issues BEFORE the campaign goes live.

## What QA Does

1. **Preview** — Render email/message with real lead data
2. **Deliverability** — Check SPF/DKIM/DMARC of sender domain
3. **Content** — Analyze for spam triggers, broken links, missing fields
4. **Test Send** — Send test email to your own address

## Pre-execution Checklist

1. Read `context/my-voice.md` — Verify tone match
2. Read `memory/MEMORY.md` — Check for deliverability issues
3. Run `bin/solti-hub-check` — Hub online?

## Actions

### 1. Preview Email
```bash
python3 skills/qa/scripts/preview_email.py \
  --template .tmp/email_template.html \
  --lead-id [contact_id]
```

Renders the template with real contact data from CRM. Opens in browser or outputs HTML.

### 2. Check Deliverability
```bash
python3 skills/qa/scripts/check_deliverability.py \
  --domain theredbot.com
```

Checks:
- SPF record exists and is valid
- DKIM record exists
- DMARC policy is set
- Domain is not on common blocklists

### 3. Spam Score Analysis
```bash
python3 skills/qa/scripts/analyze_content.py \
  --input .tmp/email_body.html
```

Checks:
- Spam trigger words (gratis, urgente, oferta, etc.)
- Image-to-text ratio
- Missing unsubscribe link
- Excessive caps or exclamation marks
- Broken links (HTTP check)
- Missing personalization tokens

### 4. Test Send
```bash
python3 skills/qa/scripts/test_send.py \
  --to agenciaredbot@gmail.com \
  --template .tmp/email_template.html \
  --lead-id [contact_id]
```

Sends a real email via Brevo to the test address.

## Output Format

```
╔══════════════════════════════════════╗
║         QA REPORT                    ║
╠══════════════════════════════════════╣

📧 Email Preview
  Subject: [rendered subject]
  From: Redbot <agencia@theredbot.com>
  To: [lead name] <[lead email]>

✅ Deliverability
  SPF: ✅ Valid (v=spf1 include:...)
  DKIM: ✅ Found (selector: ...)
  DMARC: ✅ Policy: quarantine
  Blocklist: ✅ Not listed

📝 Content Analysis
  Spam words: 0 found ✅
  Links: 3 valid, 0 broken ✅
  Personalization: {firstName} used ✅
  Unsubscribe: Present ✅
  Image/text ratio: 30/70 ✅

🔴 Issues Found
  1. [issue description]

📬 Test Send
  Status: ✅ Delivered (messageId: ...)
  Check inbox: agenciaredbot@gmail.com
╚══════════════════════════════════════╝
```

## Safety Rules
1. **Never send to real leads** during QA — only test addresses
2. **Always preview** before test send
3. **Check deliverability** before any email campaign
4. **Flag all issues** — don't skip minor ones
