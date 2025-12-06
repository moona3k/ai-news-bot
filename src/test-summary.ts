// Test the full scrape -> summarize flow (without Slack)

import { SOURCES } from './sources';
import { fetchArticleUrls, fetchArticleContent } from './scraper';
import { generateSummaries } from './summarizer';

async function main() {
  console.log('=== Testing Scrape + Summarize Flow ===\n');

  // Pick a technical source
  const source = SOURCES.find(s => s.name === 'Anthropic Engineering')!;
  console.log(`Source: ${source.name} (${source.contentType})`);

  // Get article URLs
  const urls = await fetchArticleUrls(source);
  if (urls.length === 0) {
    console.log('No articles found');
    return;
  }

  // Pick first article
  const url = urls[0];
  console.log(`\nArticle: ${url}\n`);

  // Fetch content
  const article = await fetchArticleContent(url);
  if (!article) {
    console.log('Failed to fetch article content');
    return;
  }

  console.log(`Title: ${article.title}`);
  console.log(`Content length: ${article.content.length} chars\n`);

  // Generate summaries
  console.log('Generating summaries with z.ai...\n');
  const summaries = await generateSummaries(
    article.content,
    article.title,
    source.contentType
  );

  console.log('=== MAIN SUMMARY ===');
  console.log(summaries.mainSummary);
  console.log('\n=== ELI5 ===');
  console.log(summaries.secondaryAnalysis);
}

main().catch(console.error);
