---
name: publish
description: Social media content creation and publishing. Use when user says "publish", "post", "schedule", "content", "publicar", "programar", "contenido", "calendario", "redes sociales".
model: sonnet
context: fork
allowed-tools: [Read, Write, Bash, Glob, Grep]
---

# /publish — Social Media Content & Publishing

**Cognitive Mode:** Content Creator
**Persona:** Creative but strategic. You write in the user's authentic voice, not generic marketing speak. Every post has a purpose: attract, educate, or convert.

## Three Modes

| Mode | Trigger | What it does |
|------|---------|-------------|
| **CREATE** | "write a LinkedIn post about X" | Generate content in my-voice.md style |
| **SCHEDULE** | "schedule 5 posts for next week" | Create content calendar + schedule via getLate |
| **PUBLISH** | "publish this post now" | Immediate publish to platform |

## Pre-execution Checklist
1. Read `context/my-voice.md` — match tone, phrases, emoji usage
2. Read `context/my-business.md` — know what we do and sell
3. Read `context/my-offer.md` — value proposition for CTAs
4. Read `memory/MEMORY.md` — check for content preferences/lessons

---

## getLate API — Integration via Hub

All getLate operations go through the Hub service executor. Do NOT call getLate directly.

### Endpoint
```
POST http://localhost:4000/api/v1/services/execute
Content-Type: application/json
```

### Available Actions

| Action | Params | Description |
|--------|--------|-------------|
| `list_accounts` | `{}` | Lista todas las cuentas conectadas |
| `create_post` | `{content, platforms, mediaItems?, publishNow?, scheduledFor?}` | Crea y opcionalmente publica un post |
| `presign_media` | `{filename, contentType}` | Obtiene URL presignada para subir media |
| `list_posts` | `{limit?}` | Lista posts recientes |
| `update_post` | `{postId, content?, status?, mediaItems?}` | Actualiza un post existente |
| `publish_post` | `{postId}` | Publica un post en estado draft |

### Request Format
```json
{
  "service": "getlate",
  "action": "create_post",
  "params": {
    "content": "Post body text here",
    "platforms": [
      { "accountId": "69b09b01dc8cab9432caaeee", "platform": "instagram" }
    ],
    "publishNow": true
  }
}
```

---

## CRITICAL: Field Mappings

getLate uses specific field names that differ from what you might guess. Getting these wrong will cause silent failures or errors.

| What you want | CORRECT field | WRONG (do NOT use) |
|---------------|--------------|---------------------|
| Post body text | `content` | ~~text~~, ~~body~~, ~~message~~ |
| Target accounts | `platforms: [{accountId, platform}]` | ~~platformAccountId~~, ~~platformId~~, ~~accountIds~~ |
| Publish immediately | `publishNow: true` | ~~publish: true~~, ~~immediate: true~~ |
| Schedule for later | `scheduledFor: "ISO8601"` | ~~scheduledAt~~, ~~scheduleDate~~ |
| Media attachments | `mediaItems: [{url, type}]` | ~~media~~, ~~attachments~~ |

---

## Publish vs Schedule vs Draft

| Behavior | How to trigger |
|----------|---------------|
| **Publish immediately** | Include `publishNow: true` in params |
| **Schedule for later** | Include `scheduledFor: "2026-03-20T10:00:00Z"` (ISO 8601 UTC) |
| **Draft (NOT published)** | Omit both `publishNow` and `scheduledFor` |

**GOTCHA:** Posts created without `publishNow: true` stay as **draft** forever. They will NOT auto-publish. If the user says "publish this now", you MUST include `publishNow: true`.

---

## Connected Accounts (12 total)

| Platform | Account Name | Handle | accountId |
|----------|-------------|--------|-----------|
| googlebusiness | Software de Automatizacion \| Redbot Grupo V3 | — | `69b0aa4adc8cab9432cae132` |
| instagram | Redbot \| Agente A.I para inmobiliarias | @redbot.io | `69b09b01dc8cab9432caaeee` |
| instagram | Santiago Vini Garcia | @vinnigarcia | `69b09c6ddc8cab9432cab3b5` |
| linkedin | Redbot - Inteligencia Digital | — | `69b0a2c0dc8cab9432cac5c6` |
| linkedin | Santiago Vini Garcia | — | `69b09dd0dc8cab9432cab773` |
| tiktok | redbot | @redbot.io | `69b0a36cdc8cab9432cac7a3` |
| tiktok | contentu | @contentu | `69b09ceedc8cab9432cab4d2` |
| youtube | Agencia Digital \| Redbot Grupo V3 | @redbotv3 | `69b0a2a6dc8cab9432cac57b` |
| youtube | Contentu | @contentuio | `69b0a486dc8cab9432cacd9b` |
| facebook | vinnigarcia | — | `69b09fc7dc8cab9432cabbe5` |
| twitter | Santiago Vini Garcia | @SantiagoViniG | `69b0a0b8dc8cab9432cabe3d` |
| threads | vinnigarcia | @vinnigarcia | `69b0a1cfdc8cab9432cac1cb` |

**Tip:** Si solo hay 1 cuenta para una plataforma (ej. facebook, twitter, threads), se puede auto-detectar el accountId. Si hay 2+ (ej. instagram, linkedin, tiktok, youtube), pregunta al usuario cual quiere usar.

---

## Content Types & Limits Per Platform

| Platform | Supported types | Character limit | Notes |
|----------|----------------|-----------------|-------|
| **linkedin** | text, image, carousel, video, article | text: 3,000 / article: 120,000 | Best for B2B, thought leadership |
| **instagram** | image, carousel, reel, story | 2,200 | REQUIRES at least 1 image or video — text-only fails |
| **facebook** | text, image, video, link | 63,206 | Most permissive limits |
| **twitter** | text (tweet), thread, image, video | 280 per tweet | For threads, each tweet max 280 |
| **tiktok** | video ONLY | 2,200 (caption) | Text-only will fail — MUST include video |
| **threads** | text, image, video | 500 | Meta's text platform |
| **youtube** | video, short | video: 5,000 / short: 100 | REQUIRES video — text-only fails with "Content is required for selected platforms" |
| **googlebusiness** | text, image, event, offer | 1,500 | Google Business Profile posts |

---

## Media Upload Flow

getLate uses presigned URLs via Cloudflare R2. Follow this exact sequence:

### Step 1: Get presigned URL
```json
{
  "service": "getlate",
  "action": "presign_media",
  "params": {
    "filename": "video-promo.mp4",
    "contentType": "video/mp4"
  }
}
```

### Step 2: Response contains two URLs
```json
{
  "url": "https://...r2.cloudflarestorage.com/temp/abc123...",
  "mediaUrl": "https://media.getlate.dev/temp/abc123..."
}
```
- `url` = upload destination (Cloudflare R2 presigned PUT URL)
- `mediaUrl` = public URL to reference in the post

### Step 3: Upload file binary via PUT
```bash
curl -X PUT "${url}" \
  -H "Content-Type: video/mp4" \
  --data-binary @/path/to/video.mp4 \
  --max-time 600
```

### Step 4: Attach mediaUrl to post
```json
{
  "service": "getlate",
  "action": "create_post",
  "params": {
    "content": "Check out this video!",
    "platforms": [{ "accountId": "69b0a2a6dc8cab9432cac57b", "platform": "youtube" }],
    "mediaItems": [{ "url": "https://media.getlate.dev/temp/abc123...", "type": "video" }],
    "publishNow": true
  }
}
```

### Media Limits
- **Images:** max 50 MB
- **Videos:** max 500 MB
- **Upload timeout:** Use 600 seconds (10 minutes) for large videos

### Media Gotchas
- The `mediaUrl` path may change from `/temp/` to `/media/` after processing
- Use `type: "video"` or `type: "image"` in mediaItems — match the actual file type
- Instagram, TikTok, and YouTube REQUIRE media — text-only posts will fail

---

## MODE: CREATE

### Generate a single post
```bash
python3 skills/publish/scripts/generate_post.py \
  --platform linkedin \
  --topic "como la IA esta cambiando el sector inmobiliario" \
  --voice context/my-voice.md \
  --output .tmp/post_draft.json
```

### Generate content calendar
```bash
python3 skills/publish/scripts/content_calendar.py \
  --platforms linkedin,instagram \
  --posts-per-week 5 \
  --voice context/my-voice.md \
  --business context/my-business.md \
  --output .tmp/calendar.json
```

## MODE: SCHEDULE

```bash
# List available accounts for a platform
python3 skills/publish/scripts/schedule_post.py \
  --platform instagram --list-accounts

# Schedule with media (local file auto-uploads via presigned URL)
python3 skills/publish/scripts/schedule_post.py \
  --platform instagram \
  --account-id 69b09b01dc8cab9432caaeee \
  --content "Caption here..." \
  --media /path/to/image.png \
  --schedule "2026-03-20T10:00:00" \
  --confirmed
```

## MODE: PUBLISH (Immediate)

```bash
python3 skills/publish/scripts/schedule_post.py \
  --platform linkedin \
  --content "Post text here..." \
  --schedule now \
  --confirmed
```

---

## Calling the Hub Directly (Bash/curl)

When scripts are not available, use curl to call the Hub directly:

### List accounts
```bash
curl -s -X POST http://localhost:4000/api/v1/services/execute \
  -H "Content-Type: application/json" \
  -d '{"service":"getlate","action":"list_accounts","params":{}}' | python3 -m json.tool
```

### Publish a text post immediately
```bash
curl -s -X POST http://localhost:4000/api/v1/services/execute \
  -H "Content-Type: application/json" \
  -d '{
    "service": "getlate",
    "action": "create_post",
    "params": {
      "content": "Your post text here",
      "platforms": [{"accountId": "69b09dd0dc8cab9432cab773", "platform": "linkedin"}],
      "publishNow": true
    }
  }' | python3 -m json.tool
```

### Schedule a post for later
```bash
curl -s -X POST http://localhost:4000/api/v1/services/execute \
  -H "Content-Type: application/json" \
  -d '{
    "service": "getlate",
    "action": "create_post",
    "params": {
      "content": "Scheduled post text",
      "platforms": [{"accountId": "69b0a2c0dc8cab9432cac5c6", "platform": "linkedin"}],
      "scheduledFor": "2026-03-20T10:00:00Z"
    }
  }' | python3 -m json.tool
```

### Upload media and publish
```bash
# 1. Get presigned URL
PRESIGN=$(curl -s -X POST http://localhost:4000/api/v1/services/execute \
  -H "Content-Type: application/json" \
  -d '{"service":"getlate","action":"presign_media","params":{"filename":"photo.jpg","contentType":"image/jpeg"}}')

UPLOAD_URL=$(echo $PRESIGN | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['url'])")
MEDIA_URL=$(echo $PRESIGN | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['mediaUrl'])")

# 2. Upload file
curl -X PUT "$UPLOAD_URL" -H "Content-Type: image/jpeg" --data-binary @/path/to/photo.jpg

# 3. Create post with media
curl -s -X POST http://localhost:4000/api/v1/services/execute \
  -H "Content-Type: application/json" \
  -d "{
    \"service\": \"getlate\",
    \"action\": \"create_post\",
    \"params\": {
      \"content\": \"Check out this photo!\",
      \"platforms\": [{\"accountId\": \"69b09b01dc8cab9432caaeee\", \"platform\": \"instagram\"}],
      \"mediaItems\": [{\"url\": \"$MEDIA_URL\", \"type\": \"image\"}],
      \"publishNow\": true
    }
  }"
```

---

## Content Pillars (auto-detected from my-business.md)

Generate content around these themes:
1. **Educate** — Industry insights, tips, how-tos
2. **Showcase** — Product demos, features, results
3. **Social proof** — Testimonials, case studies, metrics
4. **Behind the scenes** — Team, process, culture
5. **Engage** — Questions, polls, opinions

## Prompt Templates

| Template | Purpose |
|----------|---------|
| `linkedin_post.txt` | Professional thought leadership |
| `instagram_caption.txt` | Visual-first, emoji-friendly |
| `thread_hook.txt` | Twitter/X thread opener |

---

## Known Gotchas & Debugging

1. **Draft trap:** Posts without `publishNow: true` stay as draft forever — they will NOT publish automatically
2. **presign_media response:** Returns `{url, mediaUrl}` — upload binary to `url`, reference `mediaUrl` in post
3. **Video upload timeout:** Set to 10 minutes (600000ms) for large files — default timeout will cut off uploads
4. **Media URL path change:** After processing, the URL path may change from `/temp/` to `/media/`
5. **YouTube text-only:** Will fail with "Content is required for selected platforms" — always include video
6. **TikTok text-only:** Will fail silently — always include video
7. **Instagram text-only:** Will fail — always include at least one image or video
8. **Hub error swallowing:** In production, the Hub's error handler strips details. Use dev mode (`NODE_ENV=development`) for full error messages
9. **Field name confusion:** The most common error is using `text` instead of `content`, or `platformAccountId` instead of `platforms[].accountId` — see the Field Mappings table above

---

## Display Format

```
📝 Post Preview
━━━━━━━━━━━━━━
Platform: LinkedIn
Account: Redbot - Inteligencia Digital (69b0a2c0dc8cab9432cac5c6)
Type: Text post
Characters: 1,247
Hashtags: 5
Media: None

[Post content here]

━━━━━━━━━━━━━━
Action: Publish now | Schedule: 2026-03-20 10:00 AM (America/Bogota) | Draft
```

## Safety Rules
1. **ALWAYS** show post preview before publishing
2. Never publish without user confirmation
3. Respect platform character limits (see table above)
4. No more than 5 hashtags per post (Instagram exception: up to 15)
5. Log every published post to daily log
6. For platforms requiring media (Instagram, TikTok, YouTube), WARN the user if no media is provided before attempting to publish
