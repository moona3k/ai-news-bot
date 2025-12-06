// Researcher module - agentic research using OpenAI Responses API
// Uses shared OpenAI client with Braintrust tracing

import { openai } from './openai';
import type { ContentType } from './sources';

const RESEARCH_PROMPTS = {
  technical: `You're giving a friend the quick backstory on this article. Search the web for context.

Consider angles like (pick what's relevant):
- What's the buzz? Reactions, tweets, HN comments?
- How does this compare to what others are doing?
- Technical deep-dive: If the tech is novel, what's the underlying approach and why does it matter?
- Any skepticism or counterpoints worth noting?
- Contrarian/counter-intuitive: What's surprising, or challenges the obvious narrative?

Dig deep - follow your own threads, verify claims, chase interesting angles. Keep the final output scannable: use emoji markers (📢 🔍 ⚙️ 🤔 💡 etc.) to start each bullet point. 3-5 bullets total, conversational and brief. Skip the academic tone. If this is very recent and no reactions exist yet, say so honestly. Include source links where relevant (markdown format). End with a "Bottom line:" hot take - a punchy, opinionated final sentence. Don't offer to "dig deeper" - this is a report, not a chat.`,

  announcement: `You're giving a friend the real talk on this announcement. Search the web to verify claims and provide context.

Consider angles like (pick what's relevant):
- Hype check: Is this genuinely new or do competitors already have this?
- What's the reaction? Excited, skeptical, meh? Quote sources if you find them.
- The real signal: What does this move indicate about their strategy?
- Contrarian/counter-intuitive: What's surprising, glossed over, or challenges the obvious narrative?

Dig deep - follow your own threads, verify claims, chase interesting angles. Keep the final output scannable: use emoji markers (📢 🔍 ⚙️ 🤔 💡 etc.) to start each bullet point. 3-5 bullets total, conversational and brief. Be honest and grounded. If you can't verify something, say so. If this is very recent and no reactions exist yet, say so honestly. Include source links where relevant (markdown format). End with a "Bottom line:" hot take - a punchy, opinionated final sentence. Don't offer to "dig deeper" - this is a report, not a chat.`,
};

/**
 * Extract text content from Responses API output
 */
function extractResponseText(response: any): string {
  let result = '';
  if (response.output) {
    for (const item of response.output) {
      if (item.type === 'message' && item.content) {
        for (const content of item.content) {
          if (content.type === 'output_text') {
            result += content.text;
          }
        }
      }
    }
  }
  return result;
}

/**
 * Run agentic research using OpenAI Responses API with web search
 */
export async function runAgenticResearch(
  articleContent: string,
  articleTitle: string,
  contentType: ContentType
): Promise<string> {
  const prompt = contentType === 'technical'
    ? RESEARCH_PROMPTS.technical
    : RESEARCH_PROMPTS.announcement;

  const fullPrompt = `${prompt}

Article Title: "${articleTitle}"

Article Content (excerpt):
${articleContent.slice(0, 5000)}

Search the web for context and provide your research findings:`;

  const response = await openai.responses.create({
    model: 'gpt-5.1',
    input: fullPrompt,
    tools: [{ type: 'web_search' }],
  });

  const result = extractResponseText(response);

  // Log token usage if available
  if (response.usage) {
    console.log(`  Research completed (${response.usage.total_tokens} tokens)`);
  }

  if (!result) {
    throw new Error('Research returned empty response');
  }

  return result;
}
