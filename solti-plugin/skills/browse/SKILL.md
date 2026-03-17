# /browse — Browser Automation Skill

> Version: 1.0.0 | Phase: 5

## Purpose
Automate browser-based tasks that can't be done via APIs alone: scraping pages behind logins, filling forms, taking screenshots, and extracting data from dynamic websites.

## Modes

### MODE 1: SCRAPE
Extract structured data from any webpage.

**Flow:**
1. Ask for URL and what data to extract
2. Use browser automation to load the page
3. Wait for dynamic content to render
4. Extract requested data (text, links, images, tables)
5. Return structured JSON

**Usage:**
```
/browse SCRAPE https://example.com/pricing
→ Extract all pricing tiers with features
```

### MODE 2: SCREENSHOT
Capture visual screenshots of webpages.

**Flow:**
1. Ask for URL and viewport size (mobile/desktop)
2. Navigate to page
3. Wait for full render
4. Capture screenshot
5. Save to workspace

**Usage:**
```
/browse SCREENSHOT https://competitor.com --mobile
→ Saves screenshot to workspace
```

### MODE 3: MONITOR
Track changes on a webpage over time.

**Flow:**
1. Ask for URL and elements to monitor
2. Scrape current state
3. Compare with previous state (if exists)
4. Report changes
5. Save current state for next comparison

**Usage:**
```
/browse MONITOR https://competitor.com/pricing
→ Detects price changes since last check
```

### MODE 4: INTERACT
Fill forms, click buttons, navigate multi-step flows.

**Flow:**
1. Ask for target URL and desired actions
2. Navigate to page
3. Execute actions sequence (click, fill, submit)
4. Capture result/confirmation
5. Return outcome

**Usage:**
```
/browse INTERACT https://app.example.com/signup
→ Fill out signup form with test data
```

## Technical Notes

- Uses Playwright or Puppeteer via Apify actors for cloud execution
- Local mode available via headless Chrome
- Respects robots.txt by default (override with --force)
- Rate-limited to 10 requests/minute to avoid blocks
- Screenshots saved to `data/screenshots/`

## Dependencies
- Apify account (for cloud browser automation)
- Or local Chrome/Chromium installation

## Safety Rules
- Never interact with payment forms
- Never submit real personal data without explicit confirmation
- Always show the user what will be clicked/submitted before executing
- Respect website ToS and rate limits
