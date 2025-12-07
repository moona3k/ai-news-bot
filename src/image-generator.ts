// Image Generator module - 2-step cartoon pipeline
// Step 1: LLM generates structured script (Responses API with optional web_search)
// Step 2: Image model executes the script (gpt-image-1)
//
// Note: gpt-image-1 has content moderation that can reject certain prompts.
// If this happens, the error will be "moderation_blocked" (400 status).
// The script content may need adjustment to avoid triggering safety filters.

import { openai } from './openai';
import { Attachment, wrapTraced, wrapGoogleGenAI, currentSpan } from 'braintrust';
import * as googleGenAI from '@google/genai';
import { getConfig } from './config';

import type { ContentType } from './sources';

// Wrap Google GenAI for auto-tracing in Braintrust
const { GoogleGenAI } = wrapGoogleGenAI(googleGenAI);

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
// Step 2: Image Generation (gpt-image-1 or gemini-3-pro-image-preview)
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

const IMAGE_GEN_MAX_RETRIES = 3;
const IMAGE_GEN_RETRY_DELAY = 2000; // 2 seconds

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate image using OpenAI gpt-image-1
 * Manually traced since wrapOpenAI doesn't support images.generate
 */
const generateImageWithOpenAI = wrapTraced(async function generateImageWithOpenAI(
  prompt: string
): Promise<{ image: string } | { error: string }> {
  // Log input
  currentSpan().log({
    input: prompt,
    metadata: { model: 'gpt-image-1' },
  });

  const result = await openai.images.generate({
    model: 'gpt-image-1',
    prompt,
    size: '1024x1024',
    n: 1,
  });

  const imageBase64 = result.data?.[0]?.b64_json;

  if (!imageBase64) {
    currentSpan().log({ output: { error: 'No image data returned' } });
    return { error: 'No image data returned' };
  }

  // Log output with image attachment
  const imageBuffer = Buffer.from(imageBase64, 'base64');
  currentSpan().log({
    output: {
      image: new Attachment({
        data: imageBuffer.buffer.slice(imageBuffer.byteOffset, imageBuffer.byteOffset + imageBuffer.byteLength),
        filename: 'openai-image.png',
        contentType: 'image/png',
      }),
    },
  });

  return { image: imageBase64 };
});

/**
 * Generate image using Gemini gemini-3-pro-image-preview (Nano Banana Pro)
 * Note: wrapGoogleGenAI auto-traces this call to Braintrust
 */
async function generateImageWithGemini(prompt: string): Promise<{ image: string } | { error: string }> {
  const config = getConfig();

  if (!config.geminiApiKey) {
    return { error: 'GEMINI_API_KEY not configured' };
  }

  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: prompt,
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  });

  // Extract image from response
  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts) {
    return { error: 'No response parts received' };
  }

  for (const part of parts) {
    if (part.inlineData?.data) {
      return { image: part.inlineData.data };
    }
  }

  return { error: 'No image in response' };
}

/**
 * Step 2: Generate comic image from script using OpenAI gpt-image-1
 * Retries up to IMAGE_GEN_MAX_RETRIES times on failure
 */
async function generateImageFromScript(script: CartoonScript): Promise<{ image: string } | { error: ImageGenerationError }> {
  const prompt = buildImagePrompt(script);

  console.log(`    Step 2: Generating comic with OpenAI gpt-image-1...`);

  let lastError = '';

  for (let attempt = 1; attempt <= IMAGE_GEN_MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`    Retry attempt ${attempt}/${IMAGE_GEN_MAX_RETRIES}...`);
      }

      const result = await generateImageWithOpenAI(prompt);

      if ('error' in result) {
        lastError = result.error;
        console.log(`    Comic generation returned error: ${lastError}`);
        continue;
      }

      console.log(`    Comic generated successfully`);
      return { image: result.image };
    } catch (err: any) {
      lastError = err?.error?.message || err?.message || String(err);
      console.error(`    Comic generation attempt ${attempt} failed:`, lastError);

      if (attempt < IMAGE_GEN_MAX_RETRIES) {
        await sleep(IMAGE_GEN_RETRY_DELAY);
      }
    }
  }

  console.error(`    Comic generation failed after ${IMAGE_GEN_MAX_RETRIES} attempts`);
  return { error: { error: lastError, prompt } };
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
 * Traced in Braintrust with the generated image attached for UI rendering
 */
export async function generateArticleCartoon(
  haiku: string,
  articleTitle: string,
  articleExcerpt: string,
  contentType: ContentType
): Promise<CartoonResult | CartoonError> {
  return traced(
    async (span) => {
      // Step 1: Generate script
      const script = await generateCartoonScript(haiku, articleTitle, articleExcerpt, contentType);

      if (!script) {
        console.log('    Cartoon generation failed at script step');
        span.log({ output: { error: 'Failed to generate cartoon script' } });
        return { success: false, error: 'Failed to generate cartoon script' };
      }

      // Step 2: Generate image from script
      const result = await generateImageFromScript(script);

      if ('error' in result) {
        span.log({
          output: { error: result.error.error },
          metadata: { prompt: result.error.prompt },
        });
        return {
          success: false,
          error: result.error.error,
          prompt: result.error.prompt,
        };
      }

      // Log success with image attachment for Braintrust UI rendering
      const imageBuffer = Buffer.from(result.image, 'base64');
      span.log({
        output: {
          image: new Attachment({
            data: imageBuffer.buffer.slice(imageBuffer.byteOffset, imageBuffer.byteOffset + imageBuffer.byteLength),
            filename: 'cartoon.png',
            contentType: 'image/png',
          }),
          caption: script.caption,
        },
        metadata: {
          style: script.style,
          character: script.character,
        },
      });

      return {
        success: true,
        image: result.image,
        caption: script.caption || 'Here\'s a cartoon for you',
      };
    },
    {
      name: 'generateArticleCartoon',
      event: { input: { haiku, articleTitle, articleExcerpt: articleExcerpt.slice(0, 500), contentType } },
    }
  );
}

/**
 * Extract haiku from mainSummary (first part before double newline)
 */
export function extractHaiku(mainSummary: string): string {
  const parts = mainSummary.trim().split('\n\n');
  return parts[0] || mainSummary;
}

// ============================================================
// Infographic Generation (Gemini Nano Banana Pro)
// ============================================================

const INFOGRAPHIC_SYSTEM_PROMPT = `You are an infographic designer for a tech newsletter. Your job is to create a structured brief for a visual infographic that summarizes a tech article's key points.

Your brief must follow this EXACT format:

HEADLINE: [Catchy 3-6 word title for the infographic]
SUBTITLE: [One sentence explaining what this infographic shows]
STYLE: [One of: "clean minimal" | "tech blueprint" | "magazine editorial" | "data dashboard"]
COLOR_SCHEME: [e.g., "dark mode with cyan accents" | "white with orange highlights" | "gradient blue to purple"]

KEY_POINT_1: [Icon suggestion] | [Short label, 2-4 words] | [One sentence explanation]
KEY_POINT_2: [Icon suggestion] | [Short label, 2-4 words] | [One sentence explanation]
KEY_POINT_3: [Icon suggestion] | [Short label, 2-4 words] | [One sentence explanation]
KEY_POINT_4: [Icon suggestion] | [Short label, 2-4 words] | [One sentence explanation] (optional)

BOTTOM_LINE: [One punchy sentence - the main takeaway]

Guidelines:
- Extract the 3-4 MOST important insights from the article
- Each key point should be visually distinct and memorable
- Icon suggestions should be simple and universal (brain, rocket, shield, chart, etc.)
- The headline should grab attention
- Keep text concise - infographics are visual, not walls of text
- The bottom line should be quotable and shareable`;

interface InfographicBrief {
  headline: string;
  subtitle: string;
  style: string;
  colorScheme: string;
  keyPoints: Array<{
    icon: string;
    label: string;
    explanation: string;
  }>;
  bottomLine: string;
  raw: string;
}

/**
 * Parse the structured infographic brief from the LLM
 */
function parseInfographicBrief(raw: string): InfographicBrief | null {
  try {
    const headlineMatch = raw.match(/HEADLINE:\s*(.+)/i);
    const subtitleMatch = raw.match(/SUBTITLE:\s*(.+)/i);
    const styleMatch = raw.match(/STYLE:\s*(.+)/i);
    const colorMatch = raw.match(/COLOR_SCHEME:\s*(.+)/i);
    const bottomLineMatch = raw.match(/BOTTOM_LINE:\s*(.+)/i);

    // Parse key points
    const keyPointMatches = raw.matchAll(/KEY_POINT_\d+:\s*(.+)/gi);
    const keyPoints: InfographicBrief['keyPoints'] = [];

    for (const match of keyPointMatches) {
      const parts = match[1].split('|').map((s) => s.trim());
      if (parts.length >= 3) {
        keyPoints.push({
          icon: parts[0],
          label: parts[1],
          explanation: parts[2],
        });
      }
    }

    if (!headlineMatch || !styleMatch || keyPoints.length < 3) {
      console.log('    Failed to parse infographic brief - missing fields');
      return null;
    }

    return {
      headline: headlineMatch[1].trim(),
      subtitle: subtitleMatch ? subtitleMatch[1].trim() : '',
      style: styleMatch[1].trim(),
      colorScheme: colorMatch ? colorMatch[1].trim() : 'dark mode with cyan accents',
      keyPoints,
      bottomLine: bottomLineMatch ? bottomLineMatch[1].trim() : '',
      raw,
    };
  } catch (error) {
    console.error('    Infographic brief parsing error:', error);
    return null;
  }
}

/**
 * Generate infographic brief using LLM
 */
async function generateInfographicBrief(
  articleTitle: string,
  articleExcerpt: string,
  contentType: ContentType
): Promise<InfographicBrief | null> {
  const userPrompt = `Create an infographic brief for this tech article:

Article Title: "${articleTitle}"
Content Type: ${contentType}

Article Content:
${articleExcerpt.slice(0, 3000)}

Remember to output in the exact format specified (HEADLINE, SUBTITLE, STYLE, COLOR_SCHEME, KEY_POINT_1-4, BOTTOM_LINE).`;

  console.log(`    Generating infographic brief...`);

  try {
    const response = await openai.responses.create({
      model: 'gpt-4.1',
      instructions: INFOGRAPHIC_SYSTEM_PROMPT,
      input: userPrompt,
    });

    const text = extractResponseText(response);

    if (!text) {
      console.log('    Infographic brief generation returned empty response');
      return null;
    }

    const brief = parseInfographicBrief(text);

    if (brief) {
      console.log(`    Brief generated: "${brief.headline}" (${brief.style})`);
    }

    return brief;
  } catch (error) {
    console.error('    Infographic brief generation failed:', error);
    return null;
  }
}

/**
 * Build Gemini prompt from infographic brief
 */
function buildInfographicPrompt(brief: InfographicBrief): string {
  const keyPointsText = brief.keyPoints
    .map((kp, i) => `${i + 1}. Icon: ${kp.icon} | Label: "${kp.label}" | Text: "${kp.explanation}"`)
    .join('\n');

  return `Create a polished, professional infographic with the following content:

HEADLINE (large, bold, at top): "${brief.headline}"
SUBTITLE (smaller, below headline): "${brief.subtitle}"

VISUAL STYLE: ${brief.style}
COLOR SCHEME: ${brief.colorScheme}

KEY POINTS (arrange in a clear visual hierarchy, each with its icon):
${keyPointsText}

BOTTOM LINE (highlighted box or banner at bottom): "${brief.bottomLine}"

REQUIREMENTS:
- Clean, modern design with clear visual hierarchy
- All text must be LEGIBLE and correctly spelled
- Each key point should have a simple icon next to it
- Use the specified color scheme consistently
- Professional quality suitable for a tech newsletter
- 4K resolution, sharp details
- DO NOT include any placeholder text - use EXACTLY the text provided above
- The headline "${brief.headline}" must appear prominently at the top`;
}

/**
 * Generate infographic image using Gemini
 */
async function generateInfographicImage(brief: InfographicBrief): Promise<{ image: string } | { error: ImageGenerationError }> {
  const config = getConfig();
  const prompt = buildInfographicPrompt(brief);

  if (!config.geminiApiKey) {
    return { error: { error: 'GEMINI_API_KEY not configured for infographic generation', prompt } };
  }

  console.log(`    Generating infographic with Gemini...`);

  let lastError = '';

  for (let attempt = 1; attempt <= IMAGE_GEN_MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`    Retry attempt ${attempt}/${IMAGE_GEN_MAX_RETRIES}...`);
      }

      const result = await generateImageWithGemini(prompt);

      if ('error' in result) {
        lastError = result.error;
        console.log(`    Infographic generation returned error: ${lastError}`);
        await sleep(IMAGE_GEN_RETRY_DELAY);
        continue;
      }

      console.log(`    Infographic generated successfully`);
      return { image: result.image };
    } catch (err: any) {
      lastError = err?.error?.message || err?.message || String(err);
      console.error(`    Infographic generation attempt ${attempt} failed:`, lastError);

      if (attempt < IMAGE_GEN_MAX_RETRIES) {
        await sleep(IMAGE_GEN_RETRY_DELAY);
      }
    }
  }

  console.error(`    Infographic generation failed after ${IMAGE_GEN_MAX_RETRIES} attempts`);
  return { error: { error: lastError, prompt } };
}

export interface InfographicResult {
  success: true;
  image: string;  // base64-encoded image
  headline: string;
  bottomLine: string;
}

export interface InfographicError {
  success: false;
  error: string;
  prompt?: string;
}

/**
 * Generate an infographic using 2-step pipeline:
 * 1. LLM generates structured brief (key points, style, colors)
 * 2. Gemini Nano Banana Pro renders the infographic
 *
 * Returns image + headline on success, or error details on failure
 */
export async function generateArticleInfographic(
  articleTitle: string,
  articleContent: string,
  contentType: ContentType
): Promise<InfographicResult | InfographicError> {
  return traced(
    async (span) => {
      // Step 1: Generate brief
      const brief = await generateInfographicBrief(articleTitle, articleContent, contentType);

      if (!brief) {
        console.log('    Infographic generation failed at brief step');
        span.log({ output: { error: 'Failed to generate infographic brief' } });
        return { success: false, error: 'Failed to generate infographic brief' };
      }

      // Step 2: Generate image from brief
      const result = await generateInfographicImage(brief);

      if ('error' in result) {
        span.log({
          output: { error: result.error.error },
          metadata: { prompt: result.error.prompt },
        });
        return {
          success: false,
          error: result.error.error,
          prompt: result.error.prompt,
        };
      }

      // Log success with image attachment for Braintrust UI rendering
      const imageBuffer = Buffer.from(result.image, 'base64');
      span.log({
        output: {
          image: new Attachment({
            data: imageBuffer.buffer.slice(imageBuffer.byteOffset, imageBuffer.byteOffset + imageBuffer.byteLength),
            filename: 'infographic.png',
            contentType: 'image/png',
          }),
          headline: brief.headline,
          bottomLine: brief.bottomLine,
        },
        metadata: {
          style: brief.style,
          colorScheme: brief.colorScheme,
          keyPointCount: brief.keyPoints.length,
        },
      });

      return {
        success: true,
        image: result.image,
        headline: brief.headline,
        bottomLine: brief.bottomLine,
      };
    },
    {
      name: 'generateArticleInfographic',
      event: { input: { articleTitle, articleContent: articleContent.slice(0, 500), contentType } },
    }
  );
}
