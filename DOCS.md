# AI News Bot - Documentation

> Last updated: 2025-12-06
> Status: Production ready
> Slack channel: `#ai-latest`

## The Concept: AGI Pulse

We're not at AGI yet, but we're watching the frontier labs for signals. Every blog post, every research paper, every product announcement is a data point - a pulse check on how close we're getting.

By monitoring Anthropic, OpenAI, DeepMind, Meta, Qwen, and other frontier labs, we get a real-time feed of progress. The channel `#ai-latest` captures this: it's a health check on the state of AI, delivered through the labs' own words.

## Project Overview

**Goal**: Slack bot that monitors AI frontier lab blogs, generates LLM-powered summaries, and posts them to `#ai-latest`.

**Key Features**:
- Monitor 14 blog sources (Anthropic, OpenAI, DeepMind, Meta, Qwen, Cursor, Allen AI, Cognition, Reflection AI, Simon Willison, Thinking Machines)
- Content-type aware processing (technical vs announcement)
- Three outputs per article:
  1. **Main post**: Haiku + one-liner (as clickable link) + Slack unfurl
  2. **Thread reply 1**: ELI5 explanation
  3. **Thread reply 2**: Research Context ("The Scoop") with "Bottom line:" hot take
- State tracking to avoid duplicate posts (persistent volume)
- Alert system for broken scrapers (one alert per issue, no spam)
- Seed mode for clean initialization
- **Slack slash command** `/ai-news` for manual article processing
- **@mention Q&A** in threads - ask questions about articles with GPT-5.1 + web search

## Architecture

```
┌─────────────────┐
│ GitHub Actions  │──▶ GET /cron (every 6 hours)
└─────────────────┘
                        ┌──────────────────────────────────┐
┌─────────────────┐     │     Bun HTTP Server (server.ts)  │
│  Slack Command  │────▶│                                  │────▶ Slack
│  /ai-news       │     │  GET  /cron        → scrape all  │
└─────────────────┘     │  POST /slack/*     → slash cmd   │
┌─────────────────┐     │  POST /slack/events → @mentions  │
│  @mention       │────▶│  GET  /debug/state → state info  │
└─────────────────┘     │  GET  /            → health      │
                        └──────────────────────────────────┘
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
ai-news-bot/
├── src/
│   ├── server.ts          # HTTP server (Railway entry point)
│   ├── index.ts           # Core logic + CLI mode
│   ├── config.ts          # Environment variables
│   ├── openai.ts          # Shared OpenAI client + Braintrust tracing
│   ├── sources.ts         # 14 blog source definitions
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
# Start HTTP server (for Railway)
bun src/server.ts

# CLI mode (for local testing)
bun src/index.ts           # Normal run
bun src/index.ts --seed    # Seed mode (mark all as seen)

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
| Reflection AI | technical | `a[href^="/blog/"]:not(...)` | ✅ Working |
| Cognition (Devin) | technical | `a[href^="/blog/"]:not(pagination)` | ✅ Working |
| Allen AI | technical | `a[href^="/blog/"]` | ✅ Working |
| Meta Engineering (AI) | technical | `a[href*="/202"]` (date pattern) | ✅ Working |
| Qwen (Alibaba) | technical | `a[href*="/blog/"]:not(zh/page)` | ✅ Working |

### Not Supported
- **xAI (Grok)**: Blocked by Cloudflare bot protection
- **DeepSeek**: JS-rendered SPA, requires headless browser

### Known Issues

**OpenAI Unfurl**: OpenAI uses aggressive Cloudflare protection that blocks Slack's link unfurl bot. You get plain text instead of rich preview cards.

**Meta AI Blog**: The main `ai.meta.com/blog` uses heavy React/JS rendering that blocks scraping. Using `engineering.fb.com/category/ai-research/` instead.

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

### Debug Endpoint

Check Railway state:
```
curl https://your-app.railway.app/debug/state
```

Returns:
```json
{
  "stateFilePath": "/app/data/seen_articles.json",
  "seenCount": 183,
  "alertedCount": 0,
  "recentArticles": ["..."]
}
```

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
    "startCommand": "bun src/server.ts",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

### Cron Schedule

Uses **GitHub Actions** (`.github/workflows/cron.yml`) to hit `/cron` every 6 hours. No Railway cron needed.

### Environment Variables

```
OPENAI_API_KEY=sk-...
SLACK_BOT_TOKEN=xoxb-...
SLACK_CHANNEL_ID=C...
STATE_FILE_PATH=/app/data/seen_articles.json
```

### Volume for State Persistence

Attach a Railway volume:
1. Go to service → Settings → Volumes
2. Add volume, mount at `/app/data`
3. Set `STATE_FILE_PATH=/app/data/seen_articles.json` in Variables

### First Deploy Checklist

1. Deploy to Railway (auto-deploys from GitHub)
2. Set env vars (OPENAI_API_KEY, SLACK_BOT_TOKEN, SLACK_CHANNEL_ID)
3. Attach volume at `/app/data`
4. Add `STATE_FILE_PATH=/app/data/seen_articles.json`
5. Seed via: `curl "https://your-app.railway.app/cron?seed=true"`
6. GitHub Actions cron is already configured

## Slack Slash Command

### Setup

1. Create a Slack app at https://api.slack.com/apps
2. Add slash command `/ai-news` → `https://your-app.railway.app/slack/commands`
3. Add bot scopes: `chat:write`, `channels:history`, `app_mentions:read`
4. Enable Event Subscriptions → `https://your-app.railway.app/slack/events`
5. Subscribe to `app_mention` event
6. Install app to workspace

### Usage

```
/ai-news https://example.com/article
/ai-news https://example.com/article announcement
/ai-news pls process https://example.com/article
```

- Default content type is `technical`
- Add `announcement` at the end for product announcements
- URL can be anywhere in the text

The bot will:
1. Post `:thinking_party: Thinking...` publicly
2. Fetch, summarize, and research the article
3. Update the "Thinking..." message with the final haiku + link
4. Add thread replies (ELI5 + Research)

**Note:** Duplicate detection only applies to `#ai-latest`. Using `/ai-news` in other channels always works, even for previously posted articles.

## @mention Q&A

In any thread, @mention the bot to ask questions:

```
@ai-news-bot what's the main technical contribution?
@ai-news-bot how does this compare to what Anthropic is doing?
```

The bot will:
1. Post `:thinking_party: Thinking...` publicly
2. Run GPT-5.1 with web search
3. Update the "Thinking..." message with the answer

Personality: witty, direct, Hitchhiker's Guide vibes. Technical but accessible.

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

### Per-Channel Duplicate Detection
The "seen" state only applies to `#ai-latest`. Using `/ai-news` in other channels bypasses duplicate detection and doesn't pollute the seen map. This lets teams repost articles to their own channels freely.

### "Thinking..." UX
Both `/ai-news` and @mentions show a public `:thinking_party: Thinking...` message that gets updated with the final result. This gives immediate feedback and lets everyone in the channel see the bot is working.

## LLM Observability

Uses [Braintrust](https://www.braintrust.dev/) for LLM observability. When configured, all LLM calls are automatically traced.

### What You Get

- Latency & cost tracking per LLM call
- Full prompt/response logging for debugging
- Token usage metrics over time
- Hierarchical traces: article → summarize + research spans

### Setup

1. Get API key from https://www.braintrust.dev/app/token
2. Add to environment:
```
BRAINTRUST_API_KEY=your_key_here
BRAINTRUST_PROJECT=ai-news-bot
```

That's it - tracing is automatic when the key is set.

### How It Works

All LLM calls go through a shared OpenAI client (`src/openai.ts`) wrapped with Braintrust's `wrapOpenAI()`. This auto-traces:
- `openai.chat.completions.create()` - summaries (GPT-5.1)
- `openai.responses.create()` - research + @mentions (GPT-4o/5.1 with web search)

When `BRAINTRUST_API_KEY` is not set, the wrapper is a no-op and everything works normally.

### Resources

- [Braintrust TypeScript SDK](https://www.braintrust.dev/docs/reference/sdks/typescript)
- [Braintrust Logging](https://www.braintrust.dev/docs/guides/logs)
