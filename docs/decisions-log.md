# Decisions & Research Log

## 2024-12-06: Chat Completions vs Responses API for Summarization

### Context
Currently using Chat Completions API with cheerio/@mozilla/readability for article parsing. Exploring whether Responses API with `web_search_preview` could improve summarization quality.

### Research Questions

#### 1. Image Analysis in Articles
**Question:** Can the Responses API pick up and analyze images embedded in articles?

**Example:** https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/ contains relevant images that our current text-only scraper misses.

**Hypothesis:** If Responses API can parse images, summaries could be richer and more accurate for visual-heavy content (diagrams, charts, infographics).

**Proposed prompt addition:**
> "If there are images relevant to the article content (diagrams, charts, illustrations), analyze them and incorporate insights into the summary."

**Future extension idea:** Could Responses API use image generation tools to create:
- Explanatory visuals
- "Spicy take" images
- Witty/fun images for engagement

This could be a third Slack reply with a generated image. (Requires testing if Responses API can return generated images inline.)

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
