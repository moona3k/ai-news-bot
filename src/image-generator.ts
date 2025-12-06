// Image Generator module - generates 4-panel cartoon using OpenAI gpt-image-1
// Single prompt approach first, can add two-step (script → image) if needed

import { openai } from './openai';
import type { ContentType } from './sources';

/**
 * Build prompt for a 4-panel cartoon based on article content
 */
function buildCartoonPrompt(
  haiku: string,
  articleTitle: string,
  articleExcerpt: string,
  contentType: ContentType
): string {
  return `Create a 4-panel comic strip (2x2 grid layout) that explains a key insight from this tech article.

Article: "${articleTitle}"

Haiku summary:
${haiku}

Article excerpt:
${articleExcerpt.slice(0, 1500)}

Requirements:
- 4 panels arranged in a 2x2 grid with clear panel borders
- Simple, clean line art style like xkcd or The Oatmeal
- Stick figures or simple characters are fine
- Clear visual storytelling: setup → problem → realization → punchline/insight
- Each panel should be visually distinct and advance the story
- Capture ONE specific insight or "aha moment" from the article
- Can be funny, clever, or thought-provoking
- NO speech bubbles with text (keep it visual-only, or minimal single words)
- Light/white background for each panel
- Consistent character design across all panels

Style: Minimalist tech cartoon, black line art on white background with optional single accent color.`;
}

/**
 * Generate a 4-panel cartoon for an article
 * Returns base64-encoded image data, or null if generation fails
 */
export async function generateArticleCartoon(
  haiku: string,
  articleTitle: string,
  articleExcerpt: string,
  contentType: ContentType
): Promise<string | null> {
  try {
    const prompt = buildCartoonPrompt(haiku, articleTitle, articleExcerpt, contentType);

    console.log(`    Generating 4-panel cartoon...`);

    const result = await openai.images.generate({
      model: 'gpt-image-1',
      prompt,
      size: '1024x1024', // Square for 2x2 grid
      n: 1,
    });

    const imageBase64 = result.data?.[0]?.b64_json;

    if (!imageBase64) {
      console.log(`    Cartoon generation returned no data`);
      return null;
    }

    console.log(`    Cartoon generated successfully`);
    return imageBase64;
  } catch (error) {
    console.error(`    Cartoon generation failed:`, error);
    return null;
  }
}

/**
 * Extract haiku from mainSummary (first part before double newline)
 */
export function extractHaiku(mainSummary: string): string {
  const parts = mainSummary.trim().split('\n\n');
  return parts[0] || mainSummary;
}
