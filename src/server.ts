// AI Signals - HTTP Server
// Provides /cron and /slack endpoints for Railway deployment

import { createHmac, timingSafeEqual } from 'crypto';
import { getConfig, loadConfig } from './config';
import { runScrapeCheck, processManualUrl } from './index';
import type { ContentType } from './sources';

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

    // Slack slash command endpoint
    if (url.pathname === '/slack' && req.method === 'POST') {
      const body = await req.text();
      const timestamp = req.headers.get('X-Slack-Request-Timestamp') || '';
      const signature = req.headers.get('X-Slack-Signature') || '';

      // Verify Slack signature
      if (!verifySlackSignature(body, timestamp, signature, config.slackSigningSecret)) {
        return new Response('Invalid signature', { status: 401 });
      }

      const payload = parseSlackPayload(body);
      const articleUrl = payload.text.trim();

      // Validate URL
      if (!articleUrl || !articleUrl.startsWith('http')) {
        return new Response(JSON.stringify({
          response_type: 'ephemeral',
          text: 'Usage: /ai-signals <url> [announcement]\nExample: /ai-signals https://example.com/article',
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
      processManualUrl(url_clean, contentType)
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

console.log(`🚀 AI Signals server running on port ${server.port}`);
console.log(`   POST /slack - Slack slash command`);
console.log(`   GET  /cron  - Trigger scheduled scrape`);
console.log(`   GET  /      - Health check`);
