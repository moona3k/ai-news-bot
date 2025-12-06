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
 */
export async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

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
      console.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
      return null;
    }

    return await response.text();
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return null;
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
  if (!xml) return [];

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
  if (source.rssUrl) {
    console.log(`  Fetching RSS: ${source.rssUrl}`);
    return fetchRss(source.rssUrl);
  }

  console.log(`  Fetching index: ${source.indexUrl}`);
  const html = await fetchPage(source.indexUrl);
  if (!html) return [];

  return extractArticleUrls(html, source.articleSelector, source.baseUrl);
}

/**
 * Fetch and extract clean article content using Readability
 */
export async function fetchArticleContent(url: string): Promise<ArticleContent | null> {
  const html = await fetchPage(url);
  if (!html) return null;

  try {
    // Use linkedom to create a DOM for Readability
    const { document } = parseHTML(html);

    const reader = new Readability(document as any);
    const article = reader.parse();

    if (!article) {
      console.warn(`Readability failed to parse: ${url}`);
      return null;
    }

    return {
      title: article.title || 'Untitled',
      content: article.textContent || '',
      excerpt: article.excerpt || undefined,
    };
  } catch (error) {
    console.error(`Error parsing article ${url}:`, error);
    return null;
  }
}
