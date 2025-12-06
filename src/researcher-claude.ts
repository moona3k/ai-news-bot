// Researcher module - agentic research using Claude Agent SDK with z.ai
// Uses z.ai's MCP servers for web search capabilities

import { query } from '@anthropic-ai/claude-agent-sdk';
import { getConfig } from './config';
import type { ContentType } from './sources';

const RESEARCH_PROMPTS = {
  technical: `You're giving a friend the quick backstory on this article. Search the web for context.

Cover these angles:
**What's the buzz?** Any interesting reactions, tweets, or HN comments?
**How does this compare?** What are others doing in this space?
**The real question** What should we be asking that the article doesn't address?

Keep it conversational and brief - 3-5 bullet points total. Skip the academic tone. If this is very recent and no reactions exist yet, say so honestly rather than speculating. Include source links where relevant (markdown format).`,

  announcement: `You're giving a friend the real talk on this announcement. Search the web to verify claims and provide context.

Cover these angles:
**Hype check** - Is this genuinely new or do competitors already have this? Be specific.
**What's the reaction?** - Are people excited, skeptical, or meh? Quote specific sources if you find them.
**What's NOT being said?** - What limitations or caveats are being glossed over?
**The real signal** - What does this move actually indicate about their strategy?

Keep it conversational - 4-6 bullet points total. Be honest and grounded. If you can't verify something, say so. If this is very recent and no reactions exist yet, say so honestly rather than speculating. Include source links where relevant (markdown format).`,
};

/**
 * Get z.ai environment variables for Claude Agent SDK
 */
function getZaiEnv() {
  const config = getConfig();
  return {
    // z.ai auth
    ANTHROPIC_AUTH_TOKEN: config.zaiApiKey,
    ANTHROPIC_API_KEY: config.zaiApiKey,
    ANTHROPIC_BASE_URL: 'https://api.z.ai/api/anthropic',
    // Model mapping for z.ai
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'GLM-4.6',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'GLM-4.6',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'GLM-4.5-Air',
    // System vars
    PATH: process.env.PATH || '',
    HOME: process.env.HOME || '',
    USER: process.env.USER || '',
    SHELL: '/bin/bash',
    TERM: 'xterm-256color',
  };
}

/**
 * Run agentic research using Claude Agent SDK with z.ai MCP servers
 */
export async function runAgenticResearch(
  articleContent: string,
  articleTitle: string,
  contentType: ContentType
): Promise<string> {
  const config = getConfig();
  const prompt = contentType === 'technical'
    ? RESEARCH_PROMPTS.technical
    : RESEARCH_PROMPTS.announcement;

  const fullPrompt = `${prompt}

Article Title: "${articleTitle}"

Article Content (excerpt):
${articleContent.slice(0, 5000)}

Search the web for context and provide your research findings:`;

  try {
    const stream = query({
      prompt: fullPrompt,
      options: {
        // IMPORTANT: Use node, not bun (bun has stdin issues with SDK)
        executable: 'node',
        env: getZaiEnv(),
        // z.ai MCP servers for web search
        mcpServers: {
          'web-search-prime': {
            type: 'http',
            url: 'https://api.z.ai/api/mcp/web_search_prime/mcp',
            headers: { Authorization: `Bearer ${config.zaiApiKey}` },
          },
          'web-reader': {
            type: 'http',
            url: 'https://api.z.ai/api/mcp/web_reader/mcp',
            headers: { Authorization: `Bearer ${config.zaiApiKey}` },
          },
        },
        maxTurns: 20,
        // Allow MCP tool use without prompting
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
      },
    });

    let result = '';
    for await (const message of stream) {
      if (message.type === 'result') {
        // Use the SDK's final result, not intermediate assistant messages
        if (message.is_error) {
          console.error('Agent error:', message.result);
          return runSimpleResearch(articleContent, articleTitle, contentType);
        }
        result = message.result || '';
        console.log(`  Research completed in ${message.num_turns} turns (${Math.round(message.duration_ms / 1000)}s)`);
      }
    }

    return result || 'Research could not be completed.';
  } catch (error) {
    console.error('Agentic research failed:', error);
    // Fallback to simple research
    return runSimpleResearch(articleContent, articleTitle, contentType);
  }
}

/**
 * Simple research without MCP (fallback)
 * Uses the model's knowledge to provide context
 */
export async function runSimpleResearch(
  articleContent: string,
  articleTitle: string,
  contentType: ContentType
): Promise<string> {
  const prompt = contentType === 'technical'
    ? RESEARCH_PROMPTS.technical.replace('Search the web and tell me', 'Based on what you know, tell me')
    : RESEARCH_PROMPTS.announcement.replace('Search the web and tell me', 'Based on what you know, tell me');

  const fullPrompt = `${prompt}

(Note: No web search - use your training knowledge)

Article Title: "${articleTitle}"

Article Content (excerpt):
${articleContent.slice(0, 5000)}`;

  try {
    const stream = query({
      prompt: fullPrompt,
      options: {
        executable: 'node',
        env: getZaiEnv(),
        maxTurns: 1,
        tools: [],
      },
    });

    let result = '';
    for await (const message of stream) {
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'text') {
            result += block.text;
          }
        }
      }
    }

    return result || 'Research context could not be generated.';
  } catch (error) {
    console.error('Simple research failed:', error);
    return `*Research unavailable* - Could not generate context for "${articleTitle}".`;
  }
}
