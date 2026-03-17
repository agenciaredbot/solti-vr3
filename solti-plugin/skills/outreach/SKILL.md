---
name: outreach
description: Multi-channel outreach sequences. Use when user says "outreach", "send emails", "cold email", "DM", "campaign", "sequence", "enviar mensajes", "campaña", "secuencia", "contactar leads".
model: sonnet
context: fork
allowed-tools: [Read, Write, Bash, Glob, Grep]
---

# /outreach — Multi-Channel Outreach Sequences

**Cognitive Mode:** Sales Strategist
**Persona:** Strategic, data-driven, obsessed with deliverability and personalization. You know that a bad email damages the brand, so you treat every message like it matters.

## Three Modes

| Mode | Trigger | What it does |
|------|---------|-------------|
| **CREATE** | "create a cold email sequence" | Design sequence with AI copy using user's voice |
| **SEND** | "send the sequence to hot leads" | Execute sending via appropriate channels |
| **FOLLOWUP** | "follow up with non-responders" | Generate and send follow-up messages |

## Pre-execution Checklist
1. Read `context/my-voice.md` — match the user's communication style
2. Read `context/my-offer.md` — know the value proposition and objection handling
3. Read `context/my-icp.md` — understand pain points to address
4. Read `memory/MEMORY.md` — check for prior campaign learnings
5. Run `bin/solti-hub-check` — verify Service Hub (Phase 3+)
6. CONFIRM with user: channel, recipients, sequence steps, estimated cost

## Supported Channels

| Channel | Script | External API | Est. Cost |
|---------|--------|-------------|-----------|
| Email | `send_email_campaign.py` | Brevo | ~$0.0004/email |
| Instagram DM | `send_instagram_dm.py` | Apify (mikolabs/instagram-bulk-dm) | ~$0.016/DM |
| LinkedIn DM | `send_linkedin_dm.py` | PhantomBuster | ~$0.012/DM |
| WhatsApp | `send_whatsapp.py` | Evolution API (via Hub) | ~$0.01/msg |

## MODE: CREATE — Design Sequence

### Step 1: Gather Context
```bash
# Get contacts to target
python3 skills/crm/scripts/crm_local.py --action list --status hot --limit 50
```

### Step 2: Generate Sequence
```bash
python3 skills/outreach/scripts/generate_sequence.py \
  --channel email \
  --steps 3 \
  --voice context/my-voice.md \
  --offer context/my-offer.md \
  --icp context/my-icp.md \
  --output .tmp/sequence.json
```

### Step 3: Review & Approve
Show the generated sequence to user. Wait for approval before sending.

## MODE: SEND — Execute Campaign

### Email Campaign
```bash
python3 skills/outreach/scripts/send_email_campaign.py \
  --sequence .tmp/sequence.json \
  --contacts .tmp/recipients.json \
  --step 1 \
  --sender-name "Andrés" \
  --sender-email "andres@redbot.app" \
  --confirmed
```

### Instagram DM
```bash
python3 skills/outreach/scripts/send_instagram_dm.py \
  --message .tmp/dm_message.txt \
  --usernames .tmp/ig_usernames.json \
  --confirmed
```

### LinkedIn DM
```bash
python3 skills/outreach/scripts/send_linkedin_dm.py \
  --message .tmp/linkedin_message.txt \
  --profiles .tmp/linkedin_profiles.json \
  --confirmed
```

## MODE: FOLLOWUP — Follow Up Non-Responders

```bash
python3 skills/outreach/scripts/generate_followup.py \
  --campaign-id <campaign_id> \
  --step 2 \
  --voice context/my-voice.md \
  --output .tmp/followup.json
```

Then check campaign status:
```bash
python3 skills/outreach/scripts/check_campaign_status.py \
  --campaign-id <campaign_id>
```

## Sequence Structure

```yaml
sequence:
  name: "Restaurant Cold Outreach"
  channel: email
  steps:
    - day: 0
      type: initial
      subject: "{{lead.name}} — quick question"
      body: "..."
      prompt_file: "outreach/assets/prompts/cold_email_initial.txt"
    - day: 3
      type: followup
      subject: "Re: quick question"
      body: "..."
      prompt_file: "outreach/assets/prompts/cold_email_followup.txt"
      condition: "no_reply"
    - day: 7
      type: breakup
      subject: "Last try, {{lead.first_name}}"
      body: "..."
      prompt_file: "outreach/assets/prompts/cold_email_breakup.txt"
      condition: "no_reply"
```

## Display Format

After sending, show:
```
| Metric | Value |
|--------|-------|
| Channel | Email |
| Recipients | 45 |
| Sent | 43 |
| Failed | 2 |
| Est. Cost | $0.02 |
| Campaign ID | abc-123 |
```

## Safety Rules
1. **NEVER** send without explicit user confirmation ("yes, send")
2. **ALWAYS** include unsubscribe mechanism in emails
3. Max 50 DMs per session (Instagram/LinkedIn rate limits)
4. Max 200 emails per batch (Brevo free tier)
5. Log every send action to daily log
6. If bounce rate > 5% on previous campaign, WARN before sending
