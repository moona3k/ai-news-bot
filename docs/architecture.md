# Architecture Notes

## OpenAI Responses API - Tools

The Responses API supports the following built-in tools:

### Web Search (`web_search_preview`)
- Searches the web for real-time information
- Can fetch and parse URLs directly
- Configurable user location and search context size

### File Search (`file_search`)
- Searches through uploaded files/vector stores
- Supports up to 50 results with configurable ranking

### Computer Use (`computer_use_preview`)
- Controls a virtual computer (click, type, screenshot)

### Custom Function Tools
```ts
{
  type: "function",
  name: "get_weather",
  description: "Get current weather for a location",
  parameters: {
    type: "object",
    properties: {
      location: { type: "string" }
    },
    required: ["location"]
  }
}
```

### MCP Support
```ts
{
  type: "mcp",
  server_label: "my_server",
  server_url: "https://my-mcp-server.com",
  allowed_tools: ["tool1", "tool2"]
}
```

## Article Parsing Strategy

Consider replacing cheerio/@mozilla/readability with the Responses API `web_search_preview` tool:

```ts
const response = await openai.responses.create({
  model: "gpt-4o",
  tools: [{ type: "web_search_preview" }],
  input: `Read this article and extract: title, author, publication date, and a summary: ${articleUrl}`
});
```

**Pros:**
- No maintenance burden for HTML edge cases
- Better at extracting article content from various sites
- Handles JS-rendered pages
- Built-in summarization

**Cons:**
- Less control over exact extraction
- Token/API cost
- Potential latency increase

## 4-Panel Cartoon Generation

Each article gets a 4-panel cartoon posted as a thread reply in Slack.

### Pipeline Architecture

```
Article Content + Haiku
        ↓
┌─────────────────────────────────────┐
│  Step 1: SCRIPT GENERATOR           │
│  (Responses API + web_search)       │
│                                     │
│  Input: article, haiku, context     │
│  Output: Structured 4-panel script  │
│    - STYLE: xkcd/oatmeal/etc       │
│    - CHARACTER: description         │
│    - CAPTION: witty one-liner       │
│    - PANEL 1-4: scene + label       │
└─────────────────────────────────────┘
        ↓
┌─────────────────────────────────────┐
│  Step 2: IMAGE GENERATOR            │
│  (gpt-image-1 direct API)           │
│                                     │
│  Input: Structured script           │
│  Output: 4-panel comic image        │
│                                     │
│  Just executes - no interpretation  │
└─────────────────────────────────────┘
        ↓
    Base64 Image + Caption → Slack
```

### Why 2-Step?

Separating concerns produces better results:
- **LLM** excels at creative/narrative work (choosing insight, writing story arc)
- **Image model** excels at visual execution (doesn't have to "think")
- Strict format ensures consistent, parseable output
- Web search available if Step 1 needs more context

### Script Format

```
STYLE: [xkcd minimalist | the oatmeal | dilbert office | calvin and hobbes]
CHARACTER: [consistent character description]
CAPTION: [witty one-liner explaining the cartoon]

PANEL 1 (Setup): [scene] | LABEL: [3-6 word caption]
PANEL 2 (Problem): [scene] | LABEL: [3-6 word caption]
PANEL 3 (Realization): [scene] | LABEL: [3-6 word caption]
PANEL 4 (Punchline): [scene] | LABEL: [3-6 word caption]
```

### Slack Output

```
🎨 *_Basically, even if you ask your AI for the "same" result,
it's like flipping a coin—because the hardware's secretly
shuffling the deck._* 🎨

[4-panel cartoon image]
```

### Configuration

Set `IMAGE_GEN_ENABLED=true` in `.env` to enable cartoon generation.

### Error Handling

If image generation fails (e.g., moderation filter), posts error to thread:
- Error message from OpenAI
- The prompt used (in code block for debugging)

## Slack API Rate Limits

Rate limits are **per method, per workspace, per app** - not shared across the workspace.

This means:
- Our bot has its own rate limit quota, separate from other Slack apps in the company
- Other bots' activity won't affect ours, and vice versa
- Essentially free infrastructure for animations/updates

### Tiers

| Tier | Rate | Use Case |
|------|------|----------|
| Tier 1 | 1+ per minute | Infrequent access |
| Tier 2 | 20+ per minute | Most methods (chat.postMessage, chat.update) |
| Tier 3 | 50+ per minute | Paginating collections |
| Tier 4 | 100+ per minute | Largest quotas |

### Special Rules

- **Message posting**: Max 1 message per second per channel
- **429 errors**: Returns `Retry-After` header with seconds to wait

### Our Usage

- "Thinking..." animation: `chat.update` every 2 seconds = 30/min (well under Tier 2 limit)
- "Drawing comic strip..." animation: same pattern

Sources:
- https://docs.slack.dev/apis/web-api/rate-limits/
- https://api.slack.com/apis/rate-limits
