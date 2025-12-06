// AI News Bot - Main orchestration
// Monitors AI lab blogs, generates summaries, posts to Slack

import { loadConfig, getConfig } from './config';
import { SOURCES, type Source, type ContentType } from './sources';
import { loadState, saveState, isArticleSeen, markArticleSeen, isSourceAlerted, markSourceAlerted, clearSourceAlert, type State } from './state';
import { fetchArticleUrls, fetchArticleContent } from './scraper';
import { generateSummaries } from './summarizer';
import { runAgenticResearch } from './researcher';
import { postArticleThread, sendMessage, postImageReply } from './slack';
import { generateArticleImage, generateArticleImageWithTool, extractHaiku } from './image-generator';

const DELAY_BETWEEN_ARTICLES = 5000; // 5 seconds

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate and post images based on the configured mode
 */
async function generateAndPostImages(
  haiku: string,
  articleTitle: string,
  articleContent: string,
  contentType: ContentType,
  threadTs: string,
  mode: 'option-a' | 'option-b' | 'both',
  channelId?: string
): Promise<void> {
  // Option A: Responses API with image_generation tool (model decides)
  if (mode === 'option-a' || mode === 'both') {
    const resultA = await generateArticleImageWithTool(
      haiku,
      articleTitle,
      articleContent,
      contentType
    );
    if (resultA.image) {
      const caption = mode === 'both'
        ? '🎨 _Option A: Model-decided illustration_'
        : '🎨 _AI-generated illustration_';
      await postImageReply(resultA.image, threadTs, channelId, caption);
    }
  }

  // Option B: Separate gpt-image-1 call (always generates)
  if (mode === 'option-b' || mode === 'both') {
    const imageB = await generateArticleImage(haiku, articleTitle, contentType);
    if (imageB) {
      const caption = mode === 'both'
        ? '🎨 _Option B: Direct generation illustration_'
        : '🎨 _AI-generated illustration_';
      await postImageReply(imageB, threadTs, channelId, caption);
    }
  }
}

async function seedSource(source: Source, state: State): Promise<State> {
  console.log(`\nSeeding ${source.name}...`);

  const articleUrls = await fetchArticleUrls(source);
  if (articleUrls.length === 0) {
    console.log(`  No articles found`);
    return state;
  }

  let currentState = state;
  for (const url of articleUrls) {
    if (!isArticleSeen(currentState, url)) {
      currentState = markArticleSeen(currentState, url, {
        title: '(seeded)',
        source: source.name,
        contentType: source.contentType,
      });
    }
  }

  console.log(`  Marked ${articleUrls.length} articles as seen`);
  return currentState;
}

async function processSource(source: Source, state: State): Promise<State> {
  console.log(`\nChecking ${source.name}...`);

  // Fetch article URLs
  const articleUrls = await fetchArticleUrls(source);
  if (articleUrls.length === 0) {
    console.log(`  No articles found for ${source.name}`);
    if (!isSourceAlerted(state, source.name)) {
      await sendMessage(`⚠️ *Scraper Alert*: ${source.name} returned 0 articles. Selector may be broken.\n${source.indexUrl}`);
      return markSourceAlerted(state, source.name);
    }
    return state;
  }

  // Clear alert if source is working again
  if (isSourceAlerted(state, source.name)) {
    console.log(`  ${source.name} is working again, clearing alert`);
    state = clearSourceAlert(state, source.name);
  }

  console.log(`  Found ${articleUrls.length} article URLs`);

  // Filter to unseen articles
  const newUrls = articleUrls.filter((url) => !isArticleSeen(state, url));
  if (newUrls.length === 0) {
    console.log(`  No new articles`);
    return state;
  }

  console.log(`  ${newUrls.length} new articles to process`);

  // Process each new article
  let currentState = state;
  for (const url of newUrls) {
    console.log(`\n  Processing: ${url}`);

    try {
      // Fetch article content
      const article = await fetchArticleContent(url);
      console.log(`    Title: ${article.title}`);

      // Generate summaries
      const summaries = await generateSummaries(
        article.content,
        article.title,
        source.contentType
      );

      // Run agentic research
      console.log(`    Running research...`);
      const researchContext = await runAgenticResearch(
        article.content,
        article.title,
        source.contentType
      );

      // Post to Slack
      console.log(`    Posting to Slack...`);
      const threadTs = await postArticleThread(
        {
          title: article.title,
          url,
          source: source.name,
          contentType: source.contentType,
        },
        summaries,
        researchContext
      );

      if (threadTs) {
        // Generate and post image(s) based on config
        const config = getConfig();
        const haiku = extractHaiku(summaries.mainSummary);

        if (config.imageGenMode !== 'off') {
          await generateAndPostImages(
            haiku,
            article.title,
            article.content,
            source.contentType,
            threadTs,
            config.imageGenMode
          );
        }

        // Mark as seen ONLY after successful Slack post
        currentState = markArticleSeen(currentState, url, {
          title: article.title,
          source: source.name,
          contentType: source.contentType,
        });
        console.log(`    ✓ Posted successfully`);
      } else {
        console.log(`    ✗ Failed to post to Slack`);
      }

      // Rate limiting
      await sleep(DELAY_BETWEEN_ARTICLES);
    } catch (error) {
      console.error(`    Error processing ${url}:`, error);
    }
  }

  return currentState;
}

/**
 * Process a single URL manually (for Slack slash command)
 * @param channelId - Optional channel to post to (defaults to config channel)
 * @param processingTs - Optional ts of a "Processing..." message to update
 *
 * Note: Seen state is only checked/updated when posting to the primary channel.
 * Other channels can post the same article multiple times without restriction.
 */
export async function processManualUrl(
  url: string,
  contentType: ContentType = 'technical',
  channelId?: string,
  processingTs?: string
): Promise<{ success: boolean; message: string }> {
  console.log(`\n=== Processing Manual URL ===`);
  console.log(`URL: ${url}`);
  console.log(`Content Type: ${contentType}`);

  let config;
  try {
    config = loadConfig();
  } catch (error) {
    return { success: false, message: `Configuration error: ${error}` };
  }

  // Determine if posting to primary channel (where seen state applies)
  const targetChannel = channelId || config.slackChannelId;
  const isPrimaryChannel = targetChannel === config.slackChannelId;

  let state = await loadState();

  // Only check seen state for primary channel
  if (isPrimaryChannel && isArticleSeen(state, url)) {
    return { success: false, message: 'Article already processed' };
  }

  try {
    // Fetch article content
    const article = await fetchArticleContent(url);
    console.log(`Title: ${article.title}`);

    // Generate summaries
    const summaries = await generateSummaries(article.content, article.title, contentType);

    // Run agentic research
    console.log(`Running research...`);
    const researchContext = await runAgenticResearch(article.content, article.title, contentType);

    // Post to Slack
    console.log(`Posting to Slack...`);
    const domain = new URL(url).hostname.replace('www.', '');
    const threadTs = await postArticleThread(
      {
        title: article.title,
        url,
        source: domain,
        contentType,
      },
      summaries,
      researchContext,
      channelId,
      processingTs
    );

    if (threadTs) {
      // Generate and post image(s) based on config
      const haiku = extractHaiku(summaries.mainSummary);
      if (config.imageGenMode !== 'off') {
        await generateAndPostImages(
          haiku,
          article.title,
          article.content,
          contentType,
          threadTs,
          config.imageGenMode,
          channelId
        );
      }

      // Only mark as seen for primary channel
      if (isPrimaryChannel) {
        state = markArticleSeen(state, url, {
          title: article.title,
          source: 'Manual',
          contentType,
        });
        await saveState(state);
      }
      return { success: true, message: `Posted: ${article.title}` };
    } else {
      return { success: false, message: 'Failed to post to Slack' };
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`Error processing ${url}:`, detail);
    return { success: false, message: `Failed to fetch article: ${detail}` };
  }
}

/**
 * Run the scheduled scrape check (for cron)
 */
export async function runScrapeCheck(seedMode = false): Promise<{ processed: number; failed: number }> {
  if (seedMode) {
    console.log('=== AI News Bot SEED MODE ===');
    console.log('Marking all current articles as seen (no LLM calls, no Slack posts)');
  } else {
    console.log('=== AI News Bot Starting ===');
  }
  console.log(`Time: ${new Date().toISOString()}`);

  try {
    loadConfig();
  } catch (error) {
    console.error('Configuration error:', error);
    throw error;
  }

  let state = await loadState();
  console.log(`Loaded state: ${Object.keys(state.seen).length} articles seen`);

  let processed = 0;
  let failed = 0;

  for (const source of SOURCES) {
    try {
      const newState = seedMode
        ? await seedSource(source, state)
        : await processSource(source, state);
      const newArticles = Object.keys(newState.seen).length - Object.keys(state.seen).length;
      processed += newArticles;
      state = newState;
    } catch (error) {
      console.error(`Error processing ${source.name}:`, error);
      failed++;
      if (!seedMode) {
        await sendMessage(`🚨 *Scraper Error*: ${source.name} failed completely.\n\`\`\`${error}\`\`\``);
      }
    }
  }

  await saveState(state);
  console.log(`\nSaved state: ${Object.keys(state.seen).length} articles seen`);

  if (seedMode) {
    console.log('\n=== Seed Complete ===');
    console.log(`Seeded: ${processed} articles`);
  } else {
    console.log('\n=== AI News Bot Complete ===');
    console.log(`Processed: ${processed} new articles`);
  }
  console.log(`Failed sources: ${failed}`);

  return { processed, failed };
}

// CLI mode - run directly if not imported
const isMainModule = import.meta.main;
if (isMainModule) {
  const SEED_MODE = process.argv.includes('--seed');
  runScrapeCheck(SEED_MODE).catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
