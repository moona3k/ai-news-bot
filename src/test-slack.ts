// Test sending Anthropic engineering blog articles to Slack
// Usage: bun src/test-slack.ts

import { processManualUrl } from './index';

// Top 5 Anthropic Engineering Blog Articles
const ANTHROPIC_ARTICLES = [
  'https://www.anthropic.com/engineering/claude-code-best-practices',
  'https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents',
  'https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents',
  'https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk',
  'https://www.anthropic.com/engineering/code-execution-with-mcp',
];

async function main() {
  console.log('=== Testing Slack Integration with Anthropic Engineering Articles ===\n');
  console.log(`Will process ${ANTHROPIC_ARTICLES.length} articles...\n`);

  for (let i = 0; i < ANTHROPIC_ARTICLES.length; i++) {
    const url = ANTHROPIC_ARTICLES[i];
    console.log(`\n[${i + 1}/${ANTHROPIC_ARTICLES.length}] Processing: ${url}`);

    const result = await processManualUrl(url, 'technical');

    if (result.success) {
      console.log(`✓ ${result.message}`);
    } else {
      console.log(`✗ ${result.message}`);
    }

    // Small delay between articles to avoid rate limits
    if (i < ANTHROPIC_ARTICLES.length - 1) {
      console.log('  Waiting 3 seconds before next article...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  console.log('\n=== Test Complete ===');
}

main().catch(console.error);
