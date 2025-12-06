// Scraper module - fetches and parses blog pages
import * as cheerio from 'cheerio';
import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import type { Source } from './sources';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const FETCH_TIMEOUT = 30000; // 30 seconds

export interface ArticleContent {
  title: string;
  content: string;
  excerpt?: string;
}

/**
 * Fetch a page with browser-like headers
 * Throws an error with details if fetch fails
 */
export async function fetchPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return await response.text();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  }
}

/**
 * Extract article URLs from an index page
 */
export function extractArticleUrls(
  html: string,
  selector: string,
  baseUrl: string
): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();

  $(selector).each((_, element) => {
    const href = $(element).attr('href');
    if (href) {
      // Resolve relative URLs
      let fullUrl: string;
      if (href.startsWith('http')) {
        fullUrl = href;
      } else if (href.startsWith('/')) {
        fullUrl = `${baseUrl}${href}`;
      } else {
        fullUrl = `${baseUrl}/${href}`;
      }

      // Filter out index/listing pages - check for article slug in path
      const path = new URL(fullUrl).pathname;
      const segments = path.split('/').filter(Boolean);
      // Accept if there's a meaningful slug (not just /blog/ or /news/)
      const lastSegment = segments[segments.length - 1];
      if (segments.length >= 2 && lastSegment && lastSegment.length > 0) {
        urls.add(fullUrl);
      }
    }
  });

  return Array.from(urls);
}

/**
 * Fetch and parse RSS feed
 */
export async function fetchRss(rssUrl: string): Promise<string[]> {
  const xml = await fetchPage(rssUrl);
  const $ = cheerio.load(xml, { xmlMode: true });
  const urls: string[] = [];

  // Atom feed
  $('entry link[rel="alternate"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) urls.push(href);
  });

  // If no Atom entries, try RSS
  if (urls.length === 0) {
    $('item link').each((_, el) => {
      const href = $(el).text();
      if (href) urls.push(href);
    });
  }

  return urls;
}

/**
 * Fetch article URLs from a source (handles both HTML and RSS)
 */
export async function fetchArticleUrls(source: Source): Promise<string[]> {
  try {
    if (source.rssUrl) {
      console.log(`  Fetching RSS: ${source.rssUrl}`);
      return await fetchRss(source.rssUrl);
    }

    console.log(`  Fetching index: ${source.indexUrl}`);
    const html = await fetchPage(source.indexUrl);
    return extractArticleUrls(html, source.articleSelector, source.baseUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  Failed to fetch ${source.name}: ${message}`);
    return [];
  }
}

/**
 * Fetch and extract clean article content using Readability
 * Throws an error with details if fetch or parse fails
 */
export async function fetchArticleContent(url: string): Promise<ArticleContent> {
  const html = await fetchPage(url);

  // Use linkedom to create a DOM for Readability
  const { document } = parseHTML(html);

  const reader = new Readability(document as any);
  const article = reader.parse();

  if (!article) {
    throw new Error('Could not parse article content');
  }

  return {
    title: article.title || 'Untitled',
    content: article.textContent || '',
    excerpt: article.excerpt || undefined,
  };
}
