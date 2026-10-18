const { AI } = require('../config');

// Reads the configured website and follows its internal links, so the whole site is covered.
// Only hosts of the configured URLs are fetched, so a question can never point it elsewhere.
const CACHE_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const MAX_PAGES = 20;
const MAX_TEXT_PER_PAGE = 20000;
// Short pages (login, support) still matter, so only near-empty pages are skipped.
const MIN_TEXT_LENGTH = 20;

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
    .replace(/&rarr;/gi, '->')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function pageTitle(html) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(String(html));
  return match ? stripHtml(match[1]).slice(0, 120) : '';
}

function normalise(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

// A page counts once, even when it is reachable as / and /index.html or with a query string.
function pageKey(url) {
  const parsed = new URL(url);
  let pathname = parsed.pathname.replace(/\/index\.html?$/i, '/');
  if (pathname === '') pathname = '/';
  return `${parsed.host}${pathname}`.toLowerCase();
}

// Collects links from <a> tags only, so stylesheets and scripts are never treated as pages.
function linksFrom(html, baseUrl, allowedHosts) {
  const found = [];
  const pattern = /<a\b[^>]*href=["']([^"']+)["']/gi;
  let match;
  while ((match = pattern.exec(String(html))) !== null) {
    const raw = match[1].trim();
    if (!raw || /^(#|mailto:|tel:|javascript:|data:)/i.test(raw)) continue;

    const absolute = normalise(new URL(raw, baseUrl).toString());
    if (!absolute) continue;
    if (!allowedHosts.has(new URL(absolute).host)) continue;
    if (!/\.html?$|\/$|^https?:\/\/[^/]+$/i.test(absolute)) continue;
    found.push(absolute);
  }
  return [...new Set(found)];
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
    // Only real pages: never CSS, JavaScript, JSON or images.
    if (!/text\/html|text\/plain/i.test(type)) return null;

    const html = await response.text();
    const text = stripHtml(html).slice(0, MAX_TEXT_PER_PAGE);
    if (text.length < MIN_TEXT_LENGTH) return null;

    return { url, title: pageTitle(html), text, html };
  } finally {
    clearTimeout(timer);
  }
}

// Breadth-first through the site, capped so a big site cannot flood memory or the prompt.
async function crawl(seeds) {
  const allowedHosts = new Set(seeds.map((url) => new URL(url).host));
  const queue = seeds.map(normalise).filter(Boolean);
  const seen = new Set();
  const pages = [];

  while (queue.length > 0 && pages.length < MAX_PAGES) {
    const url = queue.shift();
    if (!url) continue;

    const key = pageKey(url);
    if (seen.has(key)) continue;
    seen.add(key);

    const page = await fetchPage(url).catch((err) => {
      console.error(`Could not read ${url}:`, err.message);
      return null;
    });
    if (!page) continue;

    pages.push({ url: page.url, title: page.title, text: page.text });
    queue.push(...linksFrom(page.html, page.url, allowedHosts));
  }

  return pages;
}

async function loadPages() {
  if (Date.now() - cache.at < CACHE_MS && cache.pages.length) return cache.pages;
  if (AI.siteUrls.length === 0) return [];

  const seeds = AI.siteUrls.map(normalise).filter(Boolean);
  try {
    const pages = await crawl(seeds);
    // On a total failure keep the previous cache instead of answering with nothing.
    if (pages.length > 0) cache = { at: Date.now(), pages };
  } catch (err) {
    console.error('Could not read the website:', err.message);
  }
  return cache.pages;
}

// Splits a page into sections by heading, then by paragraph.
function pageChunks(page, splitIntoChunks) {
  const heading = page.title ? `# ${page.title}\n` : '';
  return splitIntoChunks(`${heading}${page.text}`, 'website').map((chunk) => ({
    ...chunk,
    url: page.url,
  }));
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

module.exports = { getContext, resetCache, stripHtml, loadPages, linksFrom };
