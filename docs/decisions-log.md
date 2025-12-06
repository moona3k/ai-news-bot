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
2. Filter to relevant images (skip logos, icons, ads) - heuristics or lightweight model
3. Provide those images explicitly to the Responses API vision capabilities
4. This adds complexity and cost

**Decision (2024-12-06): DEFER** - Too much complexity for uncertain value:
- Filtering logic is error-prone (risk of noise if done wrong)
- Majority of articles may not have useful visuals anyway
- Cost/benefit doesn't justify the engineering effort right now

**Future extension idea - Image Generation (PROMISING):** The Responses API DOES support image generation via `image_generation` tool:
- Models: dall-e-2, dall-e-3, or gpt-image-1 (newest)
- gpt-image-1 supports transparent backgrounds, streaming, longer prompts (32K chars)
- Returns base64-encoded images
- Could generate explanatory visuals, "spicy take" images, or witty images
- **Viable for 3rd Slack reply** - would need to decode base64 and upload to Slack

This is a cleaner feature than image analysis because:
- Self-contained (doesn't depend on article having good images)
- Always adds value (fun/engagement)
- No filtering logic needed

Sources:
- https://platform.openai.com/docs/guides/tools-web-search
- https://platform.openai.com/docs/guides/tools-image-generation
- https://platform.openai.com/docs/guides/images

### Image Prompting Research (2024-12-06)

**gpt-image-1 vs DALL-E 3:**
- gpt-image-1: Better for complex prompts, accurate text rendering, up to 4096x4096
- DALL-E 3: More cost-efficient, supports style/quality modifiers
- gpt-image-1 does NOT accept style or quality parameters - prompt-driven only

**Best Practices for Prompts:**
1. Be specific and detailed - include setting, objects, colors, mood, lighting
2. Avoid negative prompting ("no X") - focus on what you want
3. Specify quantities explicitly ("two people" not "people")
4. Include action/dynamism ("jumping over" not "standing by")
5. Reference art styles, artists, or themes ("cyberpunk", "Van Gogh style")
6. Specify aspect ratio (defaults to square otherwise)

**API Usage (gpt-image-1):**
```ts
const result = await openai.images.generate({
  model: "gpt-image-1",
  prompt: "...",
  size: "1024x1024" // or 1024x1536, 1536x1024, auto
});
// Returns b64_json, NOT URL
const imageBase64 = result.data[0].b64_json;
```

**Limitations:**
- One image per request
- No inpainting/editing
- Struggles with non-Latin text
- Complex anatomical combinations fail

Sources:
- https://community.openai.com/t/dalle3-and-gpt-image-1-prompt-tips-and-tricks-thread/498040
- https://www.promptingguide.ai/guides/4o-image-generation
- https://img.ly/blog/openai-gpt-4o-image-generation-api-gpt-image-1-a-complete-guide-for-creative-workflows-for-2025/

### Image Generation Experiment Results (2024-12-06)

**Test:** Generated images for "Defeating Nondeterminism in LLM Inference" article

**Option A (Responses API with image_generation tool):** REMOVED
- Model chose to generate, but result was too abstract
- Less control over output style
- Removed from codebase

**Option B (Direct gpt-image-1 API):** NEEDS IMPROVEMENT
- Generated generic "AI brain with floating numbers" style images
- Too abstract, not memorable or engaging
- Doesn't capture the article's specific insights

**New Approach: 4-Panel Cartoon**

Instead of abstract illustrations, generate a 4-panel comic strip that:
- Tells a mini-story capturing a key insight from the article
- Has clear narrative structure (setup → conflict → resolution → punchline/insight)
- Is more memorable and shareable
- Uses consistent character(s) and visual style

**Implementation strategy:**
1. First attempt: Single prompt to gpt-image-1 describing all 4 panels
2. Fallback if needed: Two-step process
   - Step 1: LLM generates cartoon script (4 panel descriptions)
   - Step 2: Image model generates from detailed script

The two-step approach offloads cognitive/creative work to the language model, which is better at narrative structure, then lets the image model focus purely on visual execution.

**Insight:** This follows an emerging agent architecture pattern - decompose complex tasks into specialized steps rather than asking one model to do everything. Agent best practices are still maturing, but task decomposition is proving valuable.

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
