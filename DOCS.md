# AI Signals - Documentation

> Last updated: 2025-12-05
> Status: Production ready

## Project Overview

**Goal**: Slack bot that monitors AI frontier lab blogs, generates LLM-powered summaries, and posts them to a company Slack channel.

**Key Features**:
- Monitor 9 blog sources (Anthropic, OpenAI, DeepMind, Cursor, Simon Willison, Thinking Machines)
- Content-type aware processing (technical vs announcement)
- Three outputs per article:
  1. **Main post**: Haiku + one-liner (as clickable link) + Slack unfurl
  2. **Thread reply 1**: ELI5 explanation
  3. **Thread reply 2**: Research Context ("The Scoop")
- State tracking to avoid duplicate posts
- Alert system for broken scrapers (one alert per issue, no spam)
- Seed mode for clean initialization

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌─────────┐
│  Cron/Timer │────▶│  Scrape URLs │────▶│  LLM (GPT)  │────▶│  Slack  │
│  (trigger)  │     │  (9 sources) │     │  Summarize  │     │  Post   │
└─────────────┘     └──────────────┘     │  Research   │     └─────────┘
                                         └─────────────┘
```

### Tech Stack
- **Runtime**: Bun
- **Summarization**: OpenAI GPT-5.1 (`gpt-5.1-chat-latest`)
- **Agentic Research**: OpenAI Responses API with `web_search` tool
- **Scraping**: Cheerio (HTML parsing) + @mozilla/readability (content extraction)
- **Slack**: @slack/web-api

### Single API Key Design
Everything runs on **one OpenAI API key**:
- GPT-5.1 for summaries (haiku + take + ELI5)
- Responses API for agentic research (web search built-in)

## Project Structure

```
ai-signals/
├── src/
│   ├── index.ts           # Main orchestration + seed mode
│   ├── config.ts          # Environment variables
│   ├── sources.ts         # 9 blog source definitions
│   ├── state.ts           # Seen articles + alert tracking
│   ├── scraper.ts         # HTML/RSS fetching + Readability
│   ├── summarizer.ts      # OpenAI GPT-5.1 (haiku + take + ELI5)
│   ├── researcher.ts      # OpenAI Responses API + web_search
│   └── slack.ts           # Slack posting with threads
├── .env                   # Credentials (gitignored)
├── .env.example           # Template
├── package.json
├── seen_articles.json     # State file (gitignored)
└── DOCS.md                # This file
```

## Commands

```bash
# First run (seed mode) - marks all existing articles as seen, no LLM calls
bun src/index.ts --seed

# Normal run - process new articles only
bun src/index.ts

# Run tests
bun test
```

## Sources Configuration

Each source has:
- `indexUrl`: The blog listing page
- `articleSelector`: CSS selector to find article links
- `baseUrl`: For resolving relative URLs
- `rssUrl`: Optional RSS feed (preferred when available)

| Source | Type | Selector Strategy | Status |
|--------|------|-------------------|--------|
| Anthropic Engineering | technical | `a[href*="/engineering/"]` | ✅ Working |
| Anthropic News | announcement | `a[href*="/news/"]` | ✅ Working |
| OpenAI Engineering | technical | `a[href^="/index/"]:not(...)` | ✅ Working (no unfurl) |
| OpenAI Research | technical | `a[href^="/index/"]:not(...)` | ✅ Working (no unfurl) |
| OpenAI Product | announcement | `a[href^="/index/"]:not(...)` | ✅ Working (no unfurl) |
| Google DeepMind | technical | `a[href^="/blog/"]` | ✅ Working |
| Cursor Blog | technical | `a[href^="/blog/"]:not(topic)` | ✅ Working |
| Simon Willison | technical | RSS: `/tags/ai.atom` | ✅ Working (AI-only feed) |
| Thinking Machines | technical | `a[href*="/blog/"]` | ✅ Working |

### OpenAI Unfurl Issue

OpenAI uses aggressive Cloudflare protection that blocks Slack's link unfurl bot. When you share OpenAI links in Slack, you get plain text instead of rich preview cards. This is OpenAI's security config, not a bug.

## Scraper Reliability

**What can break:**
- Site redesigns (new HTML structure)
- URL pattern changes
- Cloudflare blocks
- Domain changes (we hit this with DeepMind)

**Mitigation:**
- RSS feeds are most stable (Simon Willison uses this)
- Alert system notifies you when a source returns 0 articles
- Alerts are deduplicated (one alert per broken source, not every run)

**Expected maintenance:** Fix 1-2 scrapers every few months when sites update. Usually a 5-minute fix.

## Alert System

When a source breaks:
1. First detection → Slack alert: `⚠️ Scraper Alert: {source} returned 0 articles`
2. Subsequent runs while broken → No alert (already notified)
3. When fixed → Alert flag cleared automatically

Also alerts on complete failures (network errors, crashes).

## Seed Mode

On first deploy, you don't want to post 100+ historical articles. Use seed mode:

```bash
bun src/index.ts --seed
```

This:
- Scrapes all sources
- Marks all current articles as "seen"
- No LLM calls, no Slack posts
- Takes ~10 seconds

After seeding, normal runs will only process NEW articles.

## State Management

State is stored in `seen_articles.json`:

```json
{
  "seen": {
    "abc123...": {
      "url": "https://...",
      "title": "Article Title",
      "source": "Anthropic Engineering",
      "contentType": "technical",
      "postedAt": "2025-12-05T..."
    }
  },
  "alertedSources": {
    "Google DeepMind": "2025-12-05T..."
  }
}
```

- `seen`: Articles already posted (by URL hash)
- `alertedSources`: Sources with active alerts (to prevent spam)

## Cost Estimates

**Scraping/checking**: Basically free (just HTTP requests)

**LLM costs per article:**
- GPT-5.1 (haiku + ELI5): ~$0.01-0.02
- Responses API (research): ~$0.05-0.10
- **Total per article**: ~$0.07-0.12

**Monthly estimates** (assuming 5 new articles/day):
- ~$10-20/month for LLM
- Railway cron: ~$0.20/month

**Check frequency doesn't affect cost** - you only pay for LLM when there's a new article. Hourly vs every 4 hours costs the same.

## Railway Deployment

### Configuration

```json
// railway.json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "bun src/index.ts",
    "restartPolicyType": "NEVER"
  }
}
```

### Cron Schedule

Set in Railway dashboard:
- Every hour: `0 * * * *`
- Every 4 hours: `0 */4 * * *`

### Environment Variables

```
OPENAI_API_KEY=sk-...
SLACK_BOT_TOKEN=xoxb-...
SLACK_CHANNEL_ID=C09EMST4Z54
```

### Volume for State Persistence

Attach a volume to persist `seen_articles.json` between runs.

### First Deploy Checklist

1. Deploy to Railway
2. Set env vars
3. Attach volume, mount at `/app/seen_articles.json`
4. SSH in and run `bun src/index.ts --seed` to initialize
5. Enable cron schedule

## Design Decisions

### Haiku + One-liner Format
Main post uses a haiku (5-7-5) + one-liner as clickable link. Slack's link unfurl provides the preview. Less is more.

### ELI5 Stylistic Freedom
GPT has full freedom: prose, bullets, emojis, variable length. Optimizes for readability.

### Research as Report
Research output is a one-way report. Prompts say: "don't ask follow-up questions or offer to dig deeper."

### One Alert Per Issue
Alerts fire once when a source breaks, not every run. Prevents alert fatigue.

### Independent Selectors Per Source
Each source has its own CSS selector. Generic rules cause false positives (like grabbing `/blog/topic/` pages instead of articles).
