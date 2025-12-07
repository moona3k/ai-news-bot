// Summarizer module - generates summaries using OpenAI GPT-5.1
// Uses shared OpenAI client with Braintrust tracing

import { openai } from './openai';
import type { ContentType } from './sources';

export interface SummaryOutputs {
  mainSummary: string;
  secondaryAnalysis: string; // ELI5 or Hype Analysis
}

const PROMPTS = {
  // Technical articles - haiku + one-liner + ELI5 in one call
  technical: `Give me three things for this technical article:

1. A HAIKU (5-7-5 syllables) that captures the essence. Be evocative and rich - make it feel like poetry, not a summary. Clever wordplay welcome. Aim for something memorable.

2. A ONE-LINER - the "why this matters" hook. Can be a spicy take if warranted, but doesn't have to be. Should be grounded in something real and valid. Direct, confident, makes you want to read more.

3. An ELI5 - explain this to a smart non-technical friend. You have stylistic freedom: prose, bullets, emojis, whatever makes it clearest. Length should match the content - brief for simple stuff, longer for rich/complex topics. Use **bold** sparingly and only for key concepts or terms (not random words for emphasis). Optimize for readability and accurate understanding.

If you use any technical terms that need defining, add a glossary at the very end. Format it like this example:
📖 *Glossary*
• *Token* = a small chunk of text; models generate text one token at a time
• *MoE* = Mixture of Experts, a model architecture with specialized sub-networks
Only include glossary if actually needed - skip if everything is already clear.

Format your response EXACTLY like this (use --- as separator):
[haiku line 1]
[haiku line 2]
[haiku line 3]

[one-liner]
---
[eli5]`,

  // Announcements - haiku + one-liner + ELI5 in one call
  announcement: `Give me three things for this announcement:

1. A HAIKU (5-7-5 syllables) that captures the moment. Be evocative, not corporate. Make it feel like poetry - something you'd remember.

2. A ONE-LINER - cut through the PR. What's the real story here? Can be spicy if warranted, but ground it in truth. Direct and confident.

3. An ELI5 - what does this mean for regular people or the industry? You have stylistic freedom: prose, bullets, emojis, whatever makes it clearest. Length should match the content - brief for simple stuff, longer for complex announcements. Use **bold** sparingly and only for key concepts or terms (not random words for emphasis). No hype, just clarity.

If you use any jargon that needs explaining, add a glossary at the very end. Format it like this example:
📖 *Glossary*
• *Token* = a small chunk of text; models generate text one token at a time
• *MoE* = Mixture of Experts, a model architecture with specialized sub-networks
Only include glossary if actually needed.

Format your response EXACTLY like this (use --- as separator):
[haiku line 1]
[haiku line 2]
[haiku line 3]

[one-liner]
---
[eli5]`,
};

/**
 * Generate all summaries for an article (single GPT call)
 * Returns { mainSummary: "haiku + one-liner", secondaryAnalysis: "eli5 text" }
 */
export async function generateSummaries(
  content: string,
  title: string,
  contentType: ContentType
): Promise<SummaryOutputs> {
  const prompt = contentType === 'technical' ? PROMPTS.technical : PROMPTS.announcement;

  console.log(`  Generating haiku + take + ELI5...`);

  const completion = await openai.chat.completions.create({
    model: 'gpt-5.1-chat-latest',
    messages: [
      {
        role: 'user',
        content: `${prompt}

Article Title: ${title}

Article Content:
${content.slice(0, 15000)}`,
      },
    ],
  });

  const response = completion.choices[0]?.message?.content || '';

  // Parse response: split by ---
  const parts = response.split('---').map(p => p.trim());
  const mainSummary = parts[0] || response; // haiku + one-liner
  const secondaryAnalysis = parts[1] || ''; // eli5

  return { mainSummary, secondaryAnalysis };
}
