// AI Signals - Main orchestration
// Monitors AI lab blogs, generates summaries, posts to Slack

import { loadConfig } from './config';
import { SOURCES, type Source } from './sources';
import { loadState, saveState, isArticleSeen, markArticleSeen, isSourceAlerted, markSourceAlerted, clearSourceAlert, type State } from './state';
import { fetchArticleUrls, fetchArticleContent } from './scraper';
import { generateSummaries } from './summarizer';
import { runAgenticResearch, runSimpleResearch } from './researcher';
import { postArticleThread, sendMessage } from './slack';

const DELAY_BETWEEN_ARTICLES = 5000; // 5 seconds
const SEED_MODE = process.argv.includes('--seed');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      if (!article) {
        console.log(`    Failed to fetch content, skipping`);
        continue;
      }

      console.log(`    Title: ${article.title}`);

      // Generate summaries
      const summaries = await generateSummaries(
        article.content,
        article.title,
        source.contentType
      );

      // Run agentic research (with fallback)
      console.log(`    Running research...`);
      let researchContext: string;
      try {
        researchContext = await runAgenticResearch(
          article.content,
          article.title,
          source.contentType
        );
      } catch (e) {
        console.log(`    Agentic research failed, using simple fallback`);
        researchContext = await runSimpleResearch(
          article.content,
          article.title,
          source.contentType
        );
      }

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

async function main() {
  if (SEED_MODE) {
    console.log('=== AI Signals SEED MODE ===');
    console.log('Marking all current articles as seen (no LLM calls, no Slack posts)');
  } else {
    console.log('=== AI Signals Starting ===');
  }
  console.log(`Time: ${new Date().toISOString()}`);

  // Load config (validates environment variables)
  try {
    loadConfig();
  } catch (error) {
    console.error('Configuration error:', error);
    process.exit(1);
  }

  // Load state
  let state = await loadState();
  console.log(`Loaded state: ${Object.keys(state.seen).length} articles seen`);

  let processed = 0;
  let failed = 0;

  // Process each source
  for (const source of SOURCES) {
    try {
      const newState = SEED_MODE
        ? await seedSource(source, state)
        : await processSource(source, state);
      const newArticles = Object.keys(newState.seen).length - Object.keys(state.seen).length;
      processed += newArticles;
      state = newState;
    } catch (error) {
      console.error(`Error processing ${source.name}:`, error);
      failed++;
      if (!SEED_MODE) {
        await sendMessage(`🚨 *Scraper Error*: ${source.name} failed completely.\n\`\`\`${error}\`\`\``);
      }
    }
  }

  // Save state
  await saveState(state);
  console.log(`\nSaved state: ${Object.keys(state.seen).length} articles seen`);

  if (SEED_MODE) {
    console.log('\n=== Seed Complete ===');
    console.log(`Seeded: ${processed} articles`);
  } else {
    console.log('\n=== AI Signals Complete ===');
    console.log(`Processed: ${processed} new articles`);
  }
  console.log(`Failed sources: ${failed}`);
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
