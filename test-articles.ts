// Test script to process selected articles
// Run with: bun test-articles.ts

import { loadConfig } from './src/config';
import { processManualUrl } from './src/index';

// Private test channel - bypasses seen state check
const TEST_CHANNEL_ID = 'C09EMST4Z54';

const ARTICLES = [
  // Anthropic Engineering (3 remaining - 2 already done)
  { url: 'https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk', type: 'technical' as const },
  { url: 'https://www.anthropic.com/engineering/code-execution-with-mcp', type: 'technical' as const },
  { url: 'https://www.anthropic.com/engineering/claude-think-tool', type: 'technical' as const },

  // Google DeepMind (2)
  { url: 'https://deepmind.google/blog/sima-2-an-agent-that-plays-reasons-and-learns-with-you-in-virtual-3d-worlds/', type: 'technical' as const },
  { url: 'https://blog.google/technology/google-deepmind/gemini-computer-use-model/', type: 'technical' as const },

  // Cursor (2)
  { url: 'https://www.cursor.com/blog/semsearch', type: 'technical' as const },
  { url: 'https://www.cursor.com/blog/composer', type: 'technical' as const },

  // Cognition/Devin (2)
  { url: 'https://cognition.ai/blog/devin-sonnet-4-5-lessons-and-challenges', type: 'technical' as const },
  { url: 'https://cognition.ai/blog/devin-annual-performance-review-2025', type: 'technical' as const },

  // Meta Engineering (2)
  { url: 'https://engineering.fb.com/2025/10/17/ai-research/scaling-llm-inference-innovations-tensor-parallelism-context-parallelism-expert-parallelism/', type: 'technical' as const },
  { url: 'https://engineering.fb.com/2025/09/29/virtual-reality/assetgen-generating-3d-worlds-with-ai/', type: 'technical' as const },

  // Qwen (2)
  { url: 'https://qwenlm.github.io/blog/gspo/', type: 'technical' as const },
  { url: 'https://qwenlm.github.io/blog/qwen3guard/', type: 'technical' as const },

  // Allen AI (2)
  { url: 'https://allenai.org/blog/asta', type: 'technical' as const },
  { url: 'https://allenai.org/blog/dr-tulu', type: 'technical' as const },

  // Simon Willison (2 - external links)
  { url: 'https://blog.chrislewis.au/the-unexpected-effectiveness-of-one-shot-decompilation-with-claude/', type: 'technical' as const },
  { url: 'https://www.lesswrong.com/posts/vpNG99GhbBoLov9og/claude-4-5-opus-soul-document', type: 'technical' as const },
];

async function main() {
  // Temporarily set a fake primary channel so TEST_CHANNEL_ID bypasses seen check
  const originalChannelId = process.env.SLACK_CHANNEL_ID;
  process.env.SLACK_CHANNEL_ID = 'FAKE_PRIMARY_CHANNEL';

  console.log('Loading config...');
  loadConfig();

  console.log(`\n=== Processing ${ARTICLES.length} articles to channel ${TEST_CHANNEL_ID} ===\n`);

  for (let i = 0; i < ARTICLES.length; i++) {
    const article = ARTICLES[i];
    console.log(`\n[${i + 1}/${ARTICLES.length}] ${article.url}`);

    const result = await processManualUrl(article.url, article.type, TEST_CHANNEL_ID);
    console.log(`  Result: ${result.success ? '✓' : '✗'} ${result.message}`);

    // Wait between articles to avoid rate limits (1 min 15 sec)
    if (i < ARTICLES.length - 1) {
      console.log('  Waiting 75s before next article...');
      await new Promise(r => setTimeout(r, 75000));
    }
  }

  // Restore original channel ID
  process.env.SLACK_CHANNEL_ID = originalChannelId;
  console.log('\n=== Done ===');
}

main().catch(console.error);
