// AI News Bot - HTTP Server
// Provides /cron and /slack endpoints for Railway deployment

import { createHmac, timingSafeEqual } from 'crypto';
import { WebClient } from '@slack/web-api';
import { getConfig, loadConfig } from './config';
import { runScrapeCheck, processManualUrl } from './index';
import { openai } from './openai';
import type { ContentType } from './sources';

/**
 * Convert markdown to Slack mrkdwn format
 */
function toSlackMarkdown(text: string): string {
  return text
    .replace(/^#{1,3}\s+(.+)$/gm, '*$1*')       // ## Header → *Header* (bold)
    .replace(/\*\*(.+?)\*\*/g, '*$1*')           // **bold** → *bold*
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>') // [text](url) → <url|text>
    .replace(/^• /gm, '• ');                     // keep bullets as-is
}

let _slackClient: WebClient | null = null;
function getSlackClient(): WebClient {
  if (!_slackClient) {
    const config = getConfig();
    _slackClient = new WebClient(config.slackBotToken);
  }
  return _slackClient;
}

// Handle @mention questions in threads
async function handleMentionQuestion(channelId: string, threadTs: string, question: string): Promise<void> {
  const client = getSlackClient();

  // Post "Thinking..." message immediately (publicly visible)
  let thinkingTs: string | undefined;
  try {
    const thinkingMsg = await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: ':thinking_party: Thinking...',
    });
    thinkingTs = thinkingMsg.ts;
  } catch (e) {
    console.error('Failed to post thinking message:', e);
  }

  try {
    // Get thread messages for context
    const threadResult = await client.conversations.replies({
      channel: channelId,
      ts: threadTs,
    });

    const messages = threadResult.messages || [];

    // Find the original article URL and build thread context
    let articleUrl: string | null = null;
    let threadContext = '';

    for (const msg of messages) {
      const text = msg.text || '';
      threadContext += text + '\n\n';

      // Look for URL in the message
      const urlMatch = text.match(/<(https?:\/\/[^|>]+)/);
      if (urlMatch && !articleUrl) {
        articleUrl = urlMatch[1];
      }
    }

    // Build prompt with thread context
    const prompt = `You're a sharp AI research assistant in a Slack channel tracking frontier AI labs. You help people cut through the noise on what's actually happening in the race toward AGI.

Personality: Curious and direct. Witty when it fits, with dry humor - think Hitchhiker's Guide to the Galaxy vibes. You have opinions and aren't afraid of spicy questions, but you back things up. Substance over snark. Technical but accessible. Like a smart colleague who's deep in the AI research scene and tells it like it is.

Format (this goes to Slack):
- 2-4 short paragraphs max
- Use *bold* not **bold**, no # headers
- Cite sources inline if you web search

Thread context:
${threadContext}

${articleUrl ? `Article URL: ${articleUrl}` : ''}

Question: ${question}`;

    // Call OpenAI Responses API with web search
    const response = await openai.responses.create({
      model: 'gpt-5.1-chat-latest',
      input: prompt,
      tools: [{ type: 'web_search' }],
    });

    // Extract text from response output
    let answer = '';
    if (response.output) {
      for (const item of response.output) {
        if (item.type === 'message' && item.content) {
          for (const content of item.content) {
            if (content.type === 'output_text') {
              answer += content.text;
            }
          }
        }
      }
    }

    if (!answer) {
      answer = 'Sorry, I could not generate a response.';
    }

    // Convert to Slack formatting
    const slackAnswer = toSlackMarkdown(answer);

    // Update "Thinking..." message with final answer, or post new if update fails
    if (thinkingTs) {
      try {
        await client.chat.update({
          channel: channelId,
          ts: thinkingTs,
          text: slackAnswer,
        });
      } catch (e) {
        console.error('Failed to update thinking message, posting new:', e);
        await client.chat.postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: slackAnswer,
        });
      }
    } else {
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: slackAnswer,
      });
    }

  } catch (error) {
    const errorDetail = error instanceof Error ? error.message : String(error);
    console.error('Error handling mention:', errorDetail);

    const errorText = `Sorry, I encountered an error: ${errorDetail}`;

    // Update "Thinking..." with error, or post new if update fails
    if (thinkingTs) {
      try {
        await client.chat.update({
          channel: channelId,
          ts: thinkingTs,
          text: errorText,
        });
      } catch (e) {
        await client.chat.postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: errorText,
        });
      }
    } else {
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: errorText,
      });
    }
  }
}

// Verify Slack request signature
function verifySlackSignature(
  body: string,
  timestamp: string,
  signature: string,
  signingSecret: string
): boolean {
  if (!signingSecret) return true; // Skip verification if no secret configured

  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (parseInt(timestamp, 10) < fiveMinutesAgo) {
    return false; // Request too old
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = 'v0=' + createHmac('sha256', signingSecret)
    .update(sigBasestring)
    .digest('hex');

  try {
    return timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature));
  } catch {
    return false;
  }
}

// Parse Slack slash command payload
interface SlackCommand {
  command: string;
  text: string;
  response_url: string;
  user_id: string;
  user_name: string;
  channel_id: string;
}

function parseSlackPayload(body: string): SlackCommand {
  const params = new URLSearchParams(body);
  return {
    command: params.get('command') || '',
    text: params.get('text') || '',
    response_url: params.get('response_url') || '',
    user_id: params.get('user_id') || '',
    user_name: params.get('user_name') || '',
    channel_id: params.get('channel_id') || '',
  };
}

// Send delayed response to Slack
async function sendSlackResponse(responseUrl: string, text: string): Promise<void> {
  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, response_type: 'ephemeral' }),
  });
}

// Main server
const server = Bun.serve({
  port: process.env.PORT || 3000,

  async fetch(req) {
    const url = new URL(req.url);
    const config = getConfig();

    // Health check
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    // Debug endpoint - show state summary
    if (url.pathname === '/debug/state') {
      try {
        const stateFile = Bun.file(config.stateFilePath);
        if (await stateFile.exists()) {
          const state = JSON.parse(await stateFile.text());
          const seenCount = Object.keys(state.seen || {}).length;
          const alertedCount = Object.keys(state.alertedSources || {}).length;

          // Show last 5 articles
          const recentArticles = Object.values(state.seen || {})
            .sort((a: any, b: any) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())
            .slice(0, 5)
            .map((a: any) => `${a.source}: ${a.title} (${a.url})`);

          return new Response(JSON.stringify({
            stateFilePath: config.stateFilePath,
            seenCount,
            alertedCount,
            recentArticles,
          }, null, 2), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } else {
          return new Response(JSON.stringify({
            stateFilePath: config.stateFilePath,
            error: 'State file does not exist',
          }, null, 2), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Cron endpoint - triggers scheduled scrape
    if (url.pathname === '/cron') {
      // Verify webhook secret if configured
      const authHeader = req.headers.get('Authorization');
      if (config.webhookSecret && authHeader !== `Bearer ${config.webhookSecret}`) {
        return new Response('Unauthorized', { status: 401 });
      }

      // Run scrape in background, return immediately
      const seedMode = url.searchParams.get('seed') === 'true';

      // Don't await - let it run in background
      runScrapeCheck(seedMode)
        .then(({ processed, failed }) => {
          console.log(`Cron complete: ${processed} processed, ${failed} failed`);
        })
        .catch((error) => {
          console.error('Cron error:', error);
        });

      return new Response(JSON.stringify({ status: 'started', seedMode }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Slack Events API endpoint (for @mentions)
    if (url.pathname === '/slack/events' && req.method === 'POST') {
      const body = await req.text();
      const payload = JSON.parse(body);

      // Handle URL verification challenge
      if (payload.type === 'url_verification') {
        return new Response(JSON.stringify({ challenge: payload.challenge }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Handle app_mention events
      if (payload.event?.type === 'app_mention') {
        const event = payload.event;
        const channelId = event.channel;
        const threadTs = event.thread_ts || event.ts; // Reply in thread if in thread, else start thread
        const userQuestion = event.text.replace(/<@[^>]+>/g, '').trim(); // Remove @mention

        console.log('App mention received:', { channelId, threadTs, userQuestion });

        // Process in background
        handleMentionQuestion(channelId, threadTs, userQuestion).catch(console.error);
      }

      return new Response('OK', { status: 200 });
    }

    // Slack slash command endpoint
    if ((url.pathname === '/slack' || url.pathname === '/slack/commands') && req.method === 'POST') {
      const body = await req.text();
      const timestamp = req.headers.get('X-Slack-Request-Timestamp') || '';
      const signature = req.headers.get('X-Slack-Signature') || '';

      // Verify Slack signature
      if (!verifySlackSignature(body, timestamp, signature, config.slackSigningSecret)) {
        return new Response('Invalid signature', { status: 401 });
      }

      const payload = parseSlackPayload(body);
      let articleUrl = payload.text.trim();

      // Handle Slack's URL formatting: <https://example.com|example.com> -> https://example.com
      const slackUrlMatch = articleUrl.match(/<([^|>]+)(?:\|[^>]+)?>/);
      if (slackUrlMatch) {
        articleUrl = slackUrlMatch[1];
      } else {
        // Extract URL from anywhere in the text (e.g. "pls process https://example.com")
        const urlMatch = articleUrl.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          articleUrl = urlMatch[0];
        }
      }

      // Validate URL
      if (!articleUrl || !articleUrl.startsWith('http')) {
        return new Response(JSON.stringify({
          response_type: 'ephemeral',
          text: 'Usage: /ai-news <url> [announcement]\nExample: /ai-news https://example.com/article',
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Parse content type from command
      const parts = articleUrl.split(/\s+/);
      const url_clean = parts[0];
      const contentType: ContentType = parts[1] === 'announcement' ? 'announcement' : 'technical';

      // Post public "Thinking..." message with animated dots
      const client = getSlackClient();
      let processingTs: string | undefined;
      let dotCount = 1;
      let animationInterval: ReturnType<typeof setInterval> | undefined;

      const startDotAnimation = () => {
        const tick = () => {
          if (!processingTs || !animationInterval) {
            console.log('Animation stopped: processingTs or interval cleared');
            return;
          }
          dotCount = (dotCount % 3) + 1;
          const dots = '.'.repeat(dotCount);
          console.log(`Animation tick: Thinking${dots}`);
          client.chat.update({
            channel: payload.channel_id,
            ts: processingTs,
            text: `:thinking_party: Thinking${dots}`,
          }).catch((err: any) => {
            console.log('Animation update error:', err?.data?.error || err?.message);
          }).finally(() => {
            // Schedule next tick only if still running
            if (animationInterval) {
              animationInterval = setTimeout(tick, 2000);
            }
          });
        };
        // Start first tick after 2s
        animationInterval = setTimeout(tick, 2000);
      };

      const stopDotAnimation = () => {
        if (animationInterval) {
          clearTimeout(animationInterval);
          animationInterval = undefined;
        }
      };

      client.chat.postMessage({
        channel: payload.channel_id,
        text: ':thinking_party: Thinking.',
      }).then((thinkingMsg) => {
        console.log('Posted Thinking message, starting animation');
        processingTs = thinkingMsg.ts;
        startDotAnimation();
        return processManualUrl(url_clean, contentType, payload.channel_id, processingTs, stopDotAnimation);
      }).then(async (result) => {
        console.log('processManualUrl completed:', result.success ? 'success' : result.message);
        stopDotAnimation();
        if (!result.success && processingTs) {
          // Update "Thinking..." with error
          await client.chat.update({
            channel: payload.channel_id,
            ts: processingTs,
            text: `❌ ${result.message}`,
          });
        }
      }).catch(async (error) => {
        console.error('Slash command error:', error);
        stopDotAnimation();
        if (processingTs) {
          await client.chat.update({
            channel: payload.channel_id,
            ts: processingTs,
            text: `❌ Error: ${error.message}`,
          });
        } else {
          sendSlackResponse(payload.response_url, `❌ Error: ${error.message}`);
        }
      });

      // Return empty response (the public "Thinking..." is the feedback)
      return new Response('', { status: 200 });
    }

    return new Response('Not Found', { status: 404 });
  },
});

// Initialize config on startup
loadConfig();

console.log(`🚀 AI News Bot server running on port ${server.port}`);
console.log(`   POST /slack - Slack slash command`);
console.log(`   GET  /cron  - Trigger scheduled scrape`);
console.log(`   GET  /      - Health check`);
