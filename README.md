# AI News Bot

Slack bot that monitors 14 AI frontier lab blogs, generates haiku summaries + ELI5 + research context, and posts to Slack.

## Features

- **14 sources**: Anthropic, OpenAI, DeepMind, Meta AI, Qwen, Cursor, Allen AI, Cognition, Reflection AI, Simon Willison, Thinking Machines
- **Auto-summaries**: Haiku + one-liner + ELI5 + research with web search
- **Slash command**: `/ai-news <url>` to manually process any article
- **@mention Q&A**: Ask questions about articles in threads
- **GitHub Actions cron**: Auto-checks every 6 hours

## Setup

```bash
bun install
```

## Run locally

```bash
bun src/server.ts
```

## Environment variables

```
OPENAI_API_KEY=sk-...
SLACK_BOT_TOKEN=xoxb-...
SLACK_CHANNEL_ID=C...
```

See [DOCS.md](DOCS.md) for full documentation.
