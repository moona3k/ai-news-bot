// Slack module - posts articles to Slack
import { WebClient } from '@slack/web-api';
import { getConfig } from './config';
import type { ContentType } from './sources';
import type { SummaryOutputs } from './summarizer';

let _client: WebClient | null = null;

function getClient(): WebClient {
  if (!_client) {
    const config = getConfig();
    _client = new WebClient(config.slackBotToken);
  }
  return _client;
}

export interface ArticlePost {
  title: string;
  url: string;
  source: string;
  contentType: ContentType;
}

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

/**
 * Truncate text to fit Slack's 3000 char block limit
 */
function truncateForSlack(text: string, maxLen = 2900): string {
  if (text.length <= maxLen) return text;
  // Try to truncate at a paragraph break
  const truncated = text.slice(0, maxLen);
  const lastBreak = truncated.lastIndexOf('\n\n');
  if (lastBreak > maxLen * 0.7) {
    return truncated.slice(0, lastBreak) + '\n\n_(truncated)_';
  }
  return truncated + '...';
}

/**
 * Format haiku + one-liner for Slack
 * Input: "line1\nline2\nline3\n\none-liner"
 * Output: "> _line1_\n> _line2_\n> _line3_\n\none-liner"
 */
function formatHaikuSummary(text: string): string {
  const parts = text.trim().split('\n\n');
  if (parts.length < 2) return text;

  const haikuLines = parts[0].split('\n');
  const oneLiner = parts.slice(1).join('\n\n');

  const formattedHaiku = haikuLines
    .map(line => `> _${line.trim()}_`)
    .join('\n');

  return `${formattedHaiku}\n\n${oneLiner}`;
}

/**
 * Post an article to Slack with thread replies
 */
export async function postArticleThread(
  article: ArticlePost,
  summaries: SummaryOutputs,
  researchContext: string
): Promise<string | null> {
  const client = getClient();
  const config = getConfig();

  try {
    // Main post - haiku (quoted) + one-liner as clickable link
    const emoji = article.contentType === 'technical' ? '🔬' : '📢';

    // Parse haiku and one-liner
    const parts = summaries.mainSummary.trim().split('\n\n');
    const haikuLines = parts[0].split('\n');
    const oneLiner = parts.slice(1).join(' ').trim();

    // Format haiku as quote + italic
    const formattedHaiku = haikuLines
      .map(line => `> _${line.trim()}_`)
      .join('\n');

    // One-liner becomes the link text
    const mainText = `${emoji} *${article.source}*

${formattedHaiku}

<${article.url}|${oneLiner}>`;

    const mainResult = await client.chat.postMessage({
      channel: config.slackChannelId,
      text: mainText,
      unfurl_links: true,
    });

    const threadTs = mainResult.ts;
    if (!threadTs) {
      console.error('Failed to get thread_ts from main post');
      return null;
    }

    // Reply 1: ELI5 (for both technical and announcements)
    const eli5Text = truncateForSlack(toSlackMarkdown(summaries.secondaryAnalysis));
    await client.chat.postMessage({
      channel: config.slackChannelId,
      thread_ts: threadTs,
      text: `*ELI5*\n\n${summaries.secondaryAnalysis}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '👶 ELI5',
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: eli5Text,
          },
        },
      ],
    });

    // Reply 2: Research (technical) or Reality Check (announcements)
    const researchLabel = article.contentType === 'technical' ? '🎯 The Scoop' : '🎯 The Scoop';
    const researchText = truncateForSlack(toSlackMarkdown(researchContext));
    await client.chat.postMessage({
      channel: config.slackChannelId,
      thread_ts: threadTs,
      text: `*${researchLabel}*\n\n${researchContext}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: researchLabel,
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: researchText,
          },
        },
      ],
    });

    return threadTs;
  } catch (error) {
    console.error('Failed to post to Slack:', error);
    return null;
  }
}

/**
 * Send a simple text message (for status updates)
 */
export async function sendMessage(text: string): Promise<void> {
  const client = getClient();
  const config = getConfig();

  try {
    await client.chat.postMessage({
      channel: config.slackChannelId,
      text,
    });
  } catch (error) {
    console.error('Failed to send Slack message:', error);
  }
}
