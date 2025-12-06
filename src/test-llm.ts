// Test script for LLM integrations
// Tests: Scraping, Summarization (Baseten), Agentic Research (z.ai)

import { SOURCES } from './sources';
import { fetchArticleUrls, fetchArticleContent } from './scraper';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

const TEST_ARTICLE_CONTENT = `
Claude 3.5 Sonnet is Anthropic's latest AI model, released in June 2024.
It represents a significant leap in AI capabilities, particularly in coding,
reasoning, and following complex instructions. The model achieves state-of-the-art
performance on multiple benchmarks while being faster and more cost-effective
than previous versions.

Key improvements include:
- 2x faster than Claude 3 Opus
- Better at coding tasks with 92% on HumanEval
- Improved instruction following
- Enhanced reasoning capabilities

The model is available through the API and Claude.ai.
`;

async function testScraping() {
  console.log('\n=== Testing Scraping ===\n');

  // Test with Anthropic Engineering (known to work)
  const source = SOURCES.find(s => s.name === 'Anthropic Engineering')!;
  console.log(`Testing source: ${source.name}`);
  console.log(`URL: ${source.indexUrl}`);

  const urls = await fetchArticleUrls(source);
  console.log(`Found ${urls.length} article URLs`);

  if (urls.length > 0) {
    console.log(`\nFirst 3 URLs:`);
    urls.slice(0, 3).forEach(url => console.log(`  - ${url}`));

    // Try to fetch first article content
    console.log(`\nFetching content from: ${urls[0]}`);
    const content = await fetchArticleContent(urls[0]);
    if (content) {
      console.log(`  Title: ${content.title}`);
      console.log(`  Content length: ${content.content.length} chars`);
      console.log(`  First 200 chars: ${content.content.slice(0, 200)}...`);
    } else {
      console.log('  Failed to fetch content');
    }
  }

  return urls.length > 0;
}

async function testBaseten() {
  console.log('\n=== Testing Baseten (Summarization) ===\n');

  const apiKey = process.env.BASETEN_API_KEY;
  if (!apiKey) {
    console.log('BASETEN_API_KEY not set, skipping');
    return false;
  }

  try {
    const baseten = createOpenAI({
      apiKey,
      baseURL: 'https://bridge.baseten.co/v1/direct',
    });

    console.log('Sending test prompt to Baseten...');
    const { text } = await generateText({
      model: baseten('claude-3-5-sonnet-20241022'),
      prompt: `Summarize this in one sentence: ${TEST_ARTICLE_CONTENT}`,
    });

    console.log(`Response: ${text}`);
    return true;
  } catch (error) {
    console.error('Baseten test failed:', error);
    return false;
  }
}

async function testZaiGLM() {
  console.log('\n=== Testing z.ai GLM (via OpenAI-compatible API) ===\n');

  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    console.log('ZAI_API_KEY not set, skipping');
    return false;
  }

  try {
    // Test using OpenAI-compatible endpoint
    const zai = createOpenAI({
      apiKey,
      baseURL: 'https://api.z.ai/api/coding/paas/v4',
    });

    console.log('Sending test prompt to z.ai GLM-4.6...');
    const { text } = await generateText({
      model: zai('glm-4.6'),
      prompt: `Summarize this in one sentence: ${TEST_ARTICLE_CONTENT}`,
    });

    console.log(`Response: ${text}`);
    return true;
  } catch (error: any) {
    console.error('z.ai GLM test failed:', error?.message || error);
    return false;
  }
}

async function testZaiAnthropic() {
  console.log('\n=== Testing z.ai (via Anthropic-compatible API) ===\n');

  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    console.log('ZAI_API_KEY not set, skipping');
    return false;
  }

  try {
    // Test using Anthropic-compatible endpoint (what Claude Agent SDK uses)
    const response = await fetch('https://api.z.ai/api/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content: `Summarize this in one sentence: ${TEST_ARTICLE_CONTENT}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`HTTP ${response.status}: ${errorText}`);
      return false;
    }

    const data = await response.json();
    console.log(`Response: ${data.content?.[0]?.text || JSON.stringify(data)}`);
    return true;
  } catch (error: any) {
    console.error('z.ai Anthropic test failed:', error?.message || error);
    return false;
  }
}

async function main() {
  console.log('=== AI Signals - LLM Integration Test ===');
  console.log(`Time: ${new Date().toISOString()}\n`);

  const results = {
    scraping: false,
    baseten: false,
    zaiGlm: false,
    zaiAnthropic: false,
  };

  // Test scraping
  try {
    results.scraping = await testScraping();
  } catch (e) {
    console.error('Scraping test error:', e);
  }

  // Test z.ai GLM (OpenAI-compatible)
  try {
    results.zaiGlm = await testZaiGLM();
  } catch (e) {
    console.error('z.ai GLM test error:', e);
  }

  // Test z.ai Anthropic-compatible
  try {
    results.zaiAnthropic = await testZaiAnthropic();
  } catch (e) {
    console.error('z.ai Anthropic test error:', e);
  }

  // Test Baseten (skip for now - needs correct endpoint)
  // try {
  //   results.baseten = await testBaseten();
  // } catch (e) {
  //   console.error('Baseten test error:', e);
  // }

  // Summary
  console.log('\n=== Test Results ===');
  console.log(`Scraping: ${results.scraping ? '✓' : '✗'}`);
  console.log(`z.ai GLM (OpenAI): ${results.zaiGlm ? '✓' : '✗'}`);
  console.log(`z.ai (Anthropic): ${results.zaiAnthropic ? '✓' : '✗'}`);
  console.log(`Baseten: skipped (needs endpoint config)`);
}

main().catch(console.error);
