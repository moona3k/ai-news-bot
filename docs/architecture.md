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
