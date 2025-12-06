// Test the researcher module with Claude Agent SDK + z.ai MCP

import { runAgenticResearch, runSimpleResearch } from './researcher';

async function main() {
  console.log('=== Testing Researcher Module ===\n');

  const testTitle = 'Building Effective Agents';
  const testContent = `
    Anthropic recently published a guide on building effective AI agents.
    The key insights include: agents work best with simple, composable patterns.
    The document discusses augmented LLMs, different workflow patterns like
    prompt chaining and routing, and emphasizes keeping agent designs simple.
  `;

  console.log('Test article:', testTitle);
  console.log('Content type: technical\n');

  // Test 1: Simple research (knowledge-based, no web search)
  console.log('--- Test 1: Simple Research (knowledge-based) ---');
  console.log('Running...\n');
  const simpleResult = await runSimpleResearch(testContent, testTitle, 'technical');
  console.log('Result:');
  console.log(simpleResult);
  console.log('\n');

  // Test 2: Agentic research with MCP web search
  console.log('--- Test 2: Agentic Research (with MCP web search) ---');
  console.log('Running (uses z.ai MCP servers for real-time search)...\n');
  const agenticResult = await runAgenticResearch(testContent, testTitle, 'technical');
  console.log('Result:');
  console.log(agenticResult);
}

main().catch(console.error);
