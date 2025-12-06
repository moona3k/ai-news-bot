// Sources module - defines all blog sources to monitor

export type ContentType = 'technical' | 'announcement';

export interface Source {
  name: string;
  indexUrl: string;
  articleSelector: string;
  baseUrl: string;
  contentType: ContentType;
  rssUrl?: string; // Optional RSS feed URL
}

export const SOURCES: Source[] = [
  // Technical sources (ELI5 + Agentic Research)
  {
    name: 'Anthropic Engineering',
    indexUrl: 'https://www.anthropic.com/engineering',
    articleSelector: 'a[href*="/engineering/"]',
    baseUrl: 'https://www.anthropic.com',
    contentType: 'technical',
  },
  {
    name: 'OpenAI Engineering',
    indexUrl: 'https://openai.com/news/engineering/',
    articleSelector: 'a[href^="/index/"]:not([href="/index/"]):not([href*="/research/index"])',
    baseUrl: 'https://openai.com',
    contentType: 'technical',
  },
  {
    name: 'OpenAI Research',
    indexUrl: 'https://openai.com/news/research/',
    articleSelector: 'a[href^="/index/"]:not([href="/index/"]):not([href*="/research/index"])',
    baseUrl: 'https://openai.com',
    contentType: 'technical',
  },
  {
    name: 'Google DeepMind',
    indexUrl: 'https://deepmind.google/discover/blog/',
    articleSelector: 'a[href^="/blog/"]',
    baseUrl: 'https://deepmind.google',
    contentType: 'technical',
  },
  {
    name: 'Cursor Blog',
    indexUrl: 'https://www.cursor.com/blog',
    articleSelector: 'a[href^="/blog/"]:not([href="/blog/"]):not([href*="/blog/topic/"])',
    baseUrl: 'https://www.cursor.com',
    contentType: 'technical',
  },
  {
    name: 'Simon Willison',
    indexUrl: 'https://simonwillison.net/tags/ai/',
    articleSelector: 'h3 a, h4 a', // Blog post titles
    baseUrl: 'https://simonwillison.net',
    contentType: 'technical',
    rssUrl: 'https://simonwillison.net/tags/ai.atom',
  },
  {
    name: 'Thinking Machines',
    indexUrl: 'https://thinkingmachines.ai/blog/',
    articleSelector: 'a[href*="/blog/"]',
    baseUrl: 'https://thinkingmachines.ai',
    contentType: 'technical',
  },
  {
    name: 'Reflection AI',
    indexUrl: 'https://reflection.ai/blog/',
    articleSelector: 'a[href^="/blog/"]:not([href="/blog/"])',
    baseUrl: 'https://reflection.ai',
    contentType: 'technical',
  },
  {
    name: 'Cognition (Devin)',
    indexUrl: 'https://cognition.ai/blog',
    articleSelector: 'a[href^="/blog/"]:not([href="/blog/"]):not([href*="/1"]):not([href*="/2"])',
    baseUrl: 'https://cognition.ai',
    contentType: 'technical',
  },
  {
    name: 'Allen AI',
    indexUrl: 'https://allenai.org/blog',
    articleSelector: 'a[href^="/blog/"]:not([href="/blog/"])',
    baseUrl: 'https://allenai.org',
    contentType: 'technical',
  },
  {
    name: 'Meta Engineering (AI)',
    indexUrl: 'https://engineering.fb.com/category/ai-research/',
    articleSelector: 'a[href*="/202"]',
    baseUrl: 'https://engineering.fb.com',
    contentType: 'technical',
  },
  {
    name: 'Qwen (Alibaba)',
    indexUrl: 'https://qwenlm.github.io/blog/',
    articleSelector: 'a[href*="/blog/"]:not([href="/blog/"]):not([href*="/zh/"]):not([href*="page/"])',
    baseUrl: 'https://qwenlm.github.io',
    contentType: 'technical',
  },
  // xAI (Grok) - blocked by Cloudflare bot protection, cannot scrape reliably
  // DeepSeek - JS-rendered SPA, cannot scrape without headless browser

  // Announcement sources (Hype-Aware Analysis)
  {
    name: 'Anthropic News',
    indexUrl: 'https://www.anthropic.com/news',
    articleSelector: 'a[href*="/news/"]',
    baseUrl: 'https://www.anthropic.com',
    contentType: 'announcement',
  },
  {
    name: 'OpenAI Product',
    indexUrl: 'https://openai.com/news/product-releases/',
    articleSelector: 'a[href^="/index/"]:not([href="/index/"]):not([href*="/research/index"])',
    baseUrl: 'https://openai.com',
    contentType: 'announcement',
  },
];
