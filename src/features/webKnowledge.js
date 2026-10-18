const { AI } = require('../config');

// Reads the configured website pages and turns them into answerable text.
// Only URLs from AI_SITE_URLS are fetched, so a question can never point the bot at another host.
const CACHE_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const MAX_PAGES = 12;

let cache = { at: 0, pages: [] };

function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Keep headings readable as headings, so the splitter can use them.
    .replace(/<h([1-3])[^>]*>/gi, '\n## ')
    .replace(/<\/(p|div|li|section|article|h[1-6]|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function pageTitle(html) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(String(html));
  return match ? stripHtml(match[1]).slice(0, 120) : '';
}

async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'ChampClientBot/1.0 (+support assistant)' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const type = response.headers.get('content-type') ?? '';
    const body = await response.text();
    if (!/html|text/i.test(type)) return null;

    const text = stripHtml(body);
    return { url, title: pageTitle(body), text };
  } finally {
    clearTimeout(timer);
  }
}

// Reads the pages in parallel and keeps whatever succeeded.
async function loadPages() {
  if (Date.now() - cache.at < CACHE_MS && cache.pages.length) return cache.pages;
  if (AI.siteUrls.length === 0) return [];

  const results = await Promise.all(
    AI.siteUrls.slice(0, MAX_PAGES).map((url) =>
      fetchPage(url).catch((err) => {
        console.error(`Could not read ${url}:`, err.message);
        return null;
      })
    )
  );

  const pages = results.filter(Boolean);
  // On a total failure keep the previous cache instead of answering with nothing.
  if (pages.length > 0) cache = { at: Date.now(), pages };
  return cache.pages;
}

// Splits a page into sections by heading, then by paragraph.
function pageChunks(page, splitIntoChunks) {
  const heading = page.title ? `# ${page.title}\n` : '';
  return splitIntoChunks(`${heading}${page.text}`, 'website').map((chunk) => ({ ...chunk, url: page.url }));
}

async function getContext(question, { splitIntoChunks, pickChunks }) {
  const pages = await loadPages();
  if (pages.length === 0) return '';

  const chunks = pages.flatMap((page) => pageChunks(page, splitIntoChunks));
  return pickChunks(chunks, question);
}

function resetCache() {
  cache = { at: 0, pages: [] };
}

module.exports = { getContext, resetCache, stripHtml, loadPages };
