// Researcher module - agentic research using OpenAI Responses API
// Uses built-in web_search tool for research

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

  try {
    const response = await fetch('https://us.api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        input: fullPrompt,
        tools: [{ type: 'web_search' }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI Responses API error ${response.status}: ${err}`);
    }

    const data = await response.json();

    // Extract text from response output
    let result = '';
    if (data.output) {
      for (const item of data.output) {
        if (item.type === 'message' && item.content) {
          for (const content of item.content) {
            if (content.type === 'output_text') {
              result += content.text;
            }
          }
        }
      }
    }

    // Log metadata if available
    if (data.usage) {
      console.log(`  Research completed (${data.usage.total_tokens} tokens)`);
    }

    return result || 'Research could not be completed.';
  } catch (error) {
    console.error('Agentic research failed:', error);
    return runSimpleResearch(articleContent, articleTitle, contentType);
  }
}

/**
 * Simple research without web search (fallback)
 * Uses GPT for context based on training knowledge
 */
export async function runSimpleResearch(
  articleContent: string,
  articleTitle: string,
  contentType: ContentType
): Promise<string> {
  const prompt = contentType === 'technical'
    ? RESEARCH_PROMPTS.technical.replace('Search the web for context', 'Based on what you know, provide context')
    : RESEARCH_PROMPTS.announcement.replace('Search the web to verify claims and provide context', 'Based on what you know, provide context');

  const fullPrompt = `${prompt}

(Note: No web search - use your training knowledge)

Article Title: "${articleTitle}"

Article Content (excerpt):
${articleContent.slice(0, 5000)}`;

  try {
    const response = await fetch('https://us.api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: fullPrompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI error ${response.status}: ${err}`);
    }

    const data = await response.json();
    return data.choices[0].message.content || 'Research context could not be generated.';
  } catch (error) {
    console.error('Simple research failed:', error);
    return `*Research unavailable* - Could not generate context for "${articleTitle}".`;
  }
}
