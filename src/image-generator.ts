// Image Generator module - 2-step cartoon pipeline
// Step 1: LLM generates structured script (Responses API with optional web_search)
// Step 2: Image model executes the script (gpt-image-1)
//
// Note: gpt-image-1 has content moderation that can reject certain prompts.
// If this happens, the error will be "moderation_blocked" (400 status).
// The script content may need adjustment to avoid triggering safety filters.

import { openai } from './openai';
import type { ContentType } from './sources';

// ============================================================
// Step 1: Script Generation (Responses API)
// ============================================================

const SCRIPT_SYSTEM_PROMPT = `You are a comic strip writer for a tech newsletter. Your job is to create a 4-panel cartoon script that explains a key insight from a tech article in a memorable, visual way.

Your script must follow this EXACT format:

STYLE: [One of: "xkcd minimalist" | "the oatmeal" | "dilbert office" | "calvin and hobbes"]
CHARACTER: [Brief consistent character description, e.g., "A stick figure programmer with spiky hair and glasses"]
CAPTION: [One witty, conversational sentence that explains the cartoon's point - like you're telling a friend "basically, ..."]

PANEL 1 (Setup): [Visual scene description] | LABEL: [Short caption below panel, 3-6 words]
PANEL 2 (Problem): [Visual scene description] | LABEL: [Short caption below panel, 3-6 words]
PANEL 3 (Realization): [Visual scene description] | LABEL: [Short caption below panel, 3-6 words]
PANEL 4 (Punchline): [Visual scene description] | LABEL: [Short caption below panel, 3-6 words]

Guidelines:
- The CAPTION should be light, witty, and help someone "get" the cartoon if they're confused
- Each panel has a scene description AND a short label that appears below it
- Labels should be punchy - like a comic strip caption (e.g., "Meanwhile, in production...", "The next morning", "Plot twist:")
- Each panel description should be 1-2 sentences, visually specific
- Focus on ONE key insight from the article - don't try to explain everything
- Make it clever, witty, or thought-provoking
- Use visual metaphors when possible (e.g., "a tower of blocks wobbling" for instability)
- Keep characters consistent across all panels
- Avoid text-heavy panels - show don't tell
- The punchline should land with impact

If you need to search for additional context about the topic, you may do so.`;

interface PanelDescription {
  scene: string;
  label: string;
}

interface CartoonScript {
  style: string;
  character: string;
  caption: string;
  panels: PanelDescription[];
  raw: string;
}

/**
 * Parse the structured script output from the LLM
 */
/**
 * Parse a panel string that may contain "scene | LABEL: label" format
 */
function parsePanel(panelText: string): PanelDescription {
  const text = panelText.trim();
  const labelMatch = text.match(/\|\s*LABEL:\s*(.+)$/i);

  if (labelMatch) {
    const scene = text.replace(/\|\s*LABEL:\s*.+$/i, '').trim();
    return { scene, label: labelMatch[1].trim() };
  }

  return { scene: text, label: '' };
}

function parseScript(raw: string): CartoonScript | null {
  try {
    const styleMatch = raw.match(/STYLE:\s*(.+)/i);
    const characterMatch = raw.match(/CHARACTER:\s*(.+)/i);
    const captionMatch = raw.match(/CAPTION:\s*(.+)/i);
    const panel1Match = raw.match(/PANEL 1[^:]*:\s*(.+?)(?=PANEL 2|$)/is);
    const panel2Match = raw.match(/PANEL 2[^:]*:\s*(.+?)(?=PANEL 3|$)/is);
    const panel3Match = raw.match(/PANEL 3[^:]*:\s*(.+?)(?=PANEL 4|$)/is);
    const panel4Match = raw.match(/PANEL 4[^:]*:\s*(.+?)$/is);

    if (!styleMatch || !characterMatch || !panel1Match || !panel2Match || !panel3Match || !panel4Match) {
      console.log('    Failed to parse script - missing fields');
      return null;
    }

    return {
      style: styleMatch[1].trim(),
      character: characterMatch[1].trim(),
      caption: captionMatch ? captionMatch[1].trim() : '',
      panels: [
        parsePanel(panel1Match[1]),
        parsePanel(panel2Match[1]),
        parsePanel(panel3Match[1]),
        parsePanel(panel4Match[1]),
      ],
      raw,
    };
  } catch (error) {
    console.error('    Script parsing error:', error);
    return null;
  }
}

/**
 * Extract text from Responses API output
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
 * Step 1: Generate a structured cartoon script using Responses API
 */
async function generateCartoonScript(
  haiku: string,
  articleTitle: string,
  articleExcerpt: string,
  contentType: ContentType
): Promise<CartoonScript | null> {
  const userPrompt = `Create a 4-panel cartoon script for this tech article:

Article Title: "${articleTitle}"

Haiku Summary:
${haiku}

Article Excerpt:
${articleExcerpt.slice(0, 2000)}

Remember to output in the exact format specified (STYLE, CHARACTER, PANEL 1-4).`;

  console.log(`    Step 1: Generating cartoon script...`);

  try {
    const response = await openai.responses.create({
      model: 'gpt-4.1',
      instructions: SCRIPT_SYSTEM_PROMPT,
      input: userPrompt,
      tools: [{ type: 'web_search' }],
    });

    const text = extractResponseText(response);

    if (!text) {
      console.log('    Script generation returned empty response');
      return null;
    }

    const script = parseScript(text);

    if (script) {
      console.log(`    Script generated: ${script.style} style`);
    }

    return script;
  } catch (error) {
    console.error('    Script generation failed:', error);
    return null;
  }
}

// ============================================================
// Step 2: Image Generation (gpt-image-1)
// ============================================================

/**
 * Build image prompt from structured script
 */
function buildImagePrompt(script: CartoonScript): string {
  const panel1Label = script.panels[0].label ? `\nCaption below panel: "${script.panels[0].label}"` : '';
  const panel2Label = script.panels[1].label ? `\nCaption below panel: "${script.panels[1].label}"` : '';
  const panel3Label = script.panels[2].label ? `\nCaption below panel: "${script.panels[2].label}"` : '';
  const panel4Label = script.panels[3].label ? `\nCaption below panel: "${script.panels[3].label}"` : '';

  return `Create a 4-panel comic strip (2x2 grid layout) with clear panel borders.

STYLE: ${script.style} - simple, clean line art

CHARACTER DESIGN: ${script.character}
(Keep this character consistent across ALL panels)

PANEL 1 (top-left): ${script.panels[0].scene}${panel1Label}

PANEL 2 (top-right): ${script.panels[1].scene}${panel2Label}

PANEL 3 (bottom-left): ${script.panels[2].scene}${panel3Label}

PANEL 4 (bottom-right): ${script.panels[3].scene}${panel4Label}

Requirements:
- 2x2 grid with clear black borders between panels
- Each panel has a small caption/label area below the scene (if specified)
- Consistent character design across all 4 panels
- Light/white background
- Draw any caption text clearly in a simple sans-serif font
- Each panel should be visually distinct and tell the story
- Draw EXACTLY what is described - no interpretation`;
}

export interface ImageGenerationError {
  error: string;
  prompt: string;
}

/**
 * Step 2: Generate image from script using gpt-image-1
 */
async function generateImageFromScript(script: CartoonScript): Promise<{ image: string } | { error: ImageGenerationError }> {
  const prompt = buildImagePrompt(script);

  console.log(`    Step 2: Generating image from script...`);

  try {
    const result = await openai.images.generate({
      model: 'gpt-image-1',
      prompt,
      size: '1024x1024',
      n: 1,
    });

    const imageBase64 = result.data?.[0]?.b64_json;

    if (!imageBase64) {
      console.log('    Image generation returned no data');
      return { error: { error: 'No image data returned', prompt } };
    }

    console.log('    Image generated successfully');
    return { image: imageBase64 };
  } catch (err: any) {
    const errorMessage = err?.error?.message || err?.message || String(err);
    console.error('    Image generation failed:', errorMessage);
    return { error: { error: errorMessage, prompt } };
  }
}

// ============================================================
// Main Export: 2-Step Pipeline
// ============================================================

export interface CartoonResult {
  success: true;
  image: string;  // base64-encoded image
  caption: string;  // witty one-liner explanation
}

export interface CartoonError {
  success: false;
  error: string;
  prompt?: string;
}

/**
 * Generate a 4-panel cartoon using 2-step pipeline:
 * 1. LLM generates structured script (with caption)
 * 2. Image model executes the script
 *
 * Returns image + caption on success, or error details on failure
 */
export async function generateArticleCartoon(
  haiku: string,
  articleTitle: string,
  articleExcerpt: string,
  contentType: ContentType
): Promise<CartoonResult | CartoonError> {
  // Step 1: Generate script
  const script = await generateCartoonScript(haiku, articleTitle, articleExcerpt, contentType);

  if (!script) {
    console.log('    Cartoon generation failed at script step');
    return { success: false, error: 'Failed to generate cartoon script' };
  }

  // Step 2: Generate image from script
  const result = await generateImageFromScript(script);

  if ('error' in result) {
    return {
      success: false,
      error: result.error.error,
      prompt: result.error.prompt,
    };
  }

  return {
    success: true,
    image: result.image,
    caption: script.caption || 'Here\'s a cartoon for you',
  };
}

/**
 * Extract haiku from mainSummary (first part before double newline)
 */
export function extractHaiku(mainSummary: string): string {
  const parts = mainSummary.trim().split('\n\n');
  return parts[0] || mainSummary;
}
