// Quick test for OpenAI SDK + Braintrust integration
// Run: bun src/test-braintrust.ts

import { openai } from './openai';

async function testChatCompletion() {
  console.log('Testing chat.completions.create()...');
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Say "hello" in 3 words max.' }],
  });
  console.log('Response:', completion.choices[0]?.message?.content);
  console.log('Tokens:', completion.usage?.total_tokens);
}

async function testResponses() {
  console.log('\nTesting responses.create() with web_search...');
  const response = await openai.responses.create({
    model: 'gpt-4o-mini',
    input: 'What is the current weather in San Francisco? One sentence.',
    tools: [{ type: 'web_search' }],
  });

  // Extract text from response
  let text = '';
  for (const item of response.output || []) {
    if (item.type === 'message' && item.content) {
      for (const content of item.content) {
        if (content.type === 'output_text') {
          text += content.text;
        }
      }
    }
  }
  console.log('Response:', text.slice(0, 200));
}

async function main() {
  console.log('Braintrust configured:', !!process.env.BRAINTRUST_API_KEY);
  console.log('Project:', process.env.BRAINTRUST_PROJECT || 'ai-news-bot');
  console.log('');

  await testChatCompletion();
  await testResponses();

  console.log('\n✅ Tests complete!');
  if (process.env.BRAINTRUST_API_KEY) {
    console.log('Check Braintrust dashboard for traces.');
  }
}

main().catch(console.error);
