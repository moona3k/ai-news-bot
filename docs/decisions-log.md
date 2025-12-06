# Decisions & Research Log

## 2024-12-06: Chat Completions vs Responses API for Summarization

### Context
Currently using Chat Completions API with cheerio/@mozilla/readability for article parsing. Exploring whether Responses API with `web_search_preview` could improve summarization quality.

### Research Questions

#### 1. Image Analysis in Articles
**Question:** Can the Responses API pick up and analyze images embedded in articles?

**Example:** https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/ contains relevant images that our current text-only scraper misses.

**Research findings (2024-12-06):**
- **web_search_preview does NOT analyze images** - it primarily extracts text content with citations
- Images may occasionally appear in ChatGPT's interface, but no visual analysis is performed
- Image analysis in Responses API only works for **explicitly provided images**, not auto-discovered web content
- No OCR or visual analysis on embedded images

**Implication:** To analyze article images, we'd need a separate pipeline:
1. Fetch the page and extract image URLs
2. Provide those images explicitly to the Responses API vision capabilities
3. This adds complexity and cost

**Future extension idea - Image Generation:** The Responses API DOES support image generation via `image_generation` tool:
- Models: dall-e-2, dall-e-3, or gpt-image-1 (newest)
- gpt-image-1 supports transparent backgrounds, streaming, longer prompts (32K chars)
- Returns base64-encoded images
- Could generate explanatory visuals, "spicy take" images, or witty images
- **Viable for 3rd Slack reply** - would need to decode base64 and upload to Slack

Sources:
- https://platform.openai.com/docs/guides/tools-web-search
- https://platform.openai.com/docs/guides/tools-image-generation
- https://platform.openai.com/docs/guides/images

#### 2. URL-only vs URL + Pre-extracted Text
**Question:** When using Responses API, is it better to provide:
- (A) Just the URL, or
- (B) URL + pre-extracted text from cheerio/readability

**Cost consideration:** Text extraction via cheerio/readability is essentially free (no tokens).

**Hypothesis:**
- Quality difference likely minimal
- Pre-extracted text *may* provide grounding to prevent LLM from going awry
- Could reduce hallucination risk by giving the model a "source of truth" alongside what it fetches

**Assessment:** Probably a minor point. Worth a quick A/B test but not high priority.

---

## Template for Future Entries

```
## YYYY-MM-DD: Title

### Context
[Background on what prompted this decision/research]

### Options Considered
[List alternatives]

### Decision
[What was decided and why]

### Outcome
[Results after implementation, if applicable]
```
