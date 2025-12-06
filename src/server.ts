// AI News Bot - HTTP Server
// Provides /cron and /slack endpoints for Railway deployment

import { createHmac, timingSafeEqual } from 'crypto';
import { WebClient } from '@slack/web-api';
import { getConfig, loadConfig } from './config';
import { runScrapeCheck, processManualUrl } from './index';
import type { ContentType } from './sources';

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

  try {
    // Get thread messages for context
    const threadResult = await client.conversations.replies({
      channel: channelId,
      ts: threadTs,
    });

    const messages = threadResult.messages || [];

    // Find the original article URL from the thread
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
    const prompt = `You are a helpful AI assistant answering questions about an article that was shared in a Slack thread.

Thread context (previous messages):
${threadContext}

${articleUrl ? `Article URL: ${articleUrl}` : ''}

User question: ${question}

Answer concisely and helpfully. If you don't have enough context to answer, say so.`;

    // Call OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI error: ${response.status}`);
    }

    const data = await response.json();
    const answer = data.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

    // Post reply in thread
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: answer,
    });

  } catch (error) {
    console.error('Error handling mention:', error);

    // Post error message
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: `Sorry, I encountered an error: ${error}`,
    });
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

      // Respond immediately, process in background
      processManualUrl(url_clean, contentType, payload.channel_id)
        .then((result) => {
          sendSlackResponse(payload.response_url,
            result.success ? `✅ ${result.message}` : `❌ ${result.message}`
          );
        })
        .catch((error) => {
          sendSlackResponse(payload.response_url, `❌ Error: ${error.message}`);
        });

      return new Response(JSON.stringify({
        response_type: 'ephemeral',
        text: `⏳ Processing ${url_clean}...`,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
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
