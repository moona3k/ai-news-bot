// Image Generator module - generates images using OpenAI
// Option A: Responses API with image_generation tool (model decides)
// Option B: Separate API call with full prompt control

import { openai } from './openai';
import type { ContentType } from './sources';

/**
 * Build image prompt from haiku and article context
 * Style: Editorial illustration, witty, thought-provoking
 */
function buildImagePrompt(
  haiku: string,
  articleTitle: string,
  contentType: ContentType
): string {
  const mood = contentType === 'technical'
    ? 'thoughtful, innovative, slightly playful'
    : 'bold, newsworthy, dynamic';

  return `Editorial illustration for a tech newsletter about AI.

Topic: "${articleTitle}"

Visual inspiration from this haiku:
${haiku}

Style: Modern minimalist illustration with a ${mood} mood.
Think New Yorker magazine meets tech blog - sophisticated but accessible.
Use a limited color palette with one accent color for emphasis.
Conceptual and metaphorical rather than literal.
Clean composition with clear focal point.
Aspect ratio: 3:2 landscape.

Important: No text, words, or letters in the image.`;
}

/**
 * Generate an image for an article using gpt-image-1 (Option B: separate call)
 * Returns base64-encoded image data, or null if generation fails
 */
export async function generateArticleImage(
  haiku: string,
  articleTitle: string,
  contentType: ContentType
): Promise<string | null> {
  try {
    const prompt = buildImagePrompt(haiku, articleTitle, contentType);

    console.log(`    Generating image...`);

    const result = await openai.images.generate({
      model: 'gpt-image-1',
      prompt,
      size: '1536x1024', // 3:2 landscape
      n: 1,
    });

    const imageBase64 = result.data?.[0]?.b64_json;

    if (!imageBase64) {
      console.log(`    Image generation returned no data`);
      return null;
    }

    console.log(`    Image generated successfully`);
    return imageBase64;
  } catch (error) {
    console.error(`    Image generation failed:`, error);
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

// ============================================================
// Option A: Responses API with image_generation tool
// Model decides whether to generate an image based on context
// ============================================================

const IMAGE_GENERATION_PROMPT = `You're creating a visual companion for a tech newsletter article.

Based on the article content and haiku below, decide if a generated image would add value.

If yes, generate an editorial illustration that:
- Captures the essence or a key insight from the article
- Uses a modern, minimalist style with limited color palette
- Is conceptual/metaphorical rather than literal
- Could be witty, thought-provoking, or simply beautiful
- Has a clean composition with clear focal point
- Contains NO text, words, or letters

If the article is dry/technical and an image wouldn't add much, that's fine - skip it.

Styles to consider (pick what fits):
- Sophisticated editorial (New Yorker style)
- Playful tech illustration
- Abstract conceptual art
- Minimalist infographic style (without text)
- Surrealist interpretation`;

/**
 * Extract image data from Responses API output
 */
function extractImageFromResponse(response: any): string | null {
  if (!response.output) return null;

  for (const item of response.output) {
    if (item.type === 'image_generation_call' && item.result) {
      return item.result; // base64 image data
    }
  }
  return null;
}

/**
 * Generate an image using Responses API with image_generation tool (Option A)
 * Model decides whether to generate based on context
 * Returns base64-encoded image data, or null if model chose not to generate
 */
export async function generateArticleImageWithTool(
  haiku: string,
  articleTitle: string,
  articleExcerpt: string,
  contentType: ContentType
): Promise<{ image: string | null; modelChoseToGenerate: boolean }> {
  try {
    const mood = contentType === 'technical'
      ? 'thoughtful and innovative'
      : 'bold and newsworthy';

    const input = `${IMAGE_GENERATION_PROMPT}

Article Title: "${articleTitle}"
Content Type: ${contentType} (mood: ${mood})

Haiku summary:
${haiku}

Article excerpt:
${articleExcerpt.slice(0, 2000)}

If you decide to generate an image, make it landscape format (wider than tall).`;

    console.log(`    Generating image (Option A - model decides)...`);

    const response = await openai.responses.create({
      model: 'gpt-4.1',
      input,
      tools: [{ type: 'image_generation' }],
    });

    const imageBase64 = extractImageFromResponse(response);

    if (imageBase64) {
      console.log(`    Image generated (model chose to create one)`);
      return { image: imageBase64, modelChoseToGenerate: true };
    } else {
      console.log(`    No image generated (model decided to skip)`);
      return { image: null, modelChoseToGenerate: false };
    }
  } catch (error) {
    console.error(`    Image generation (Option A) failed:`, error);
    return { image: null, modelChoseToGenerate: false };
  }
}
