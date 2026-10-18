const fs = require('fs');
const path = require('path');
const { AI } = require('../config');

// Knowledge lives in these folders, one per topic. Add .md or .txt files and they are picked up.
const FOLDERS = ['website', 'mod'];
const EXTENSIONS = ['.md', '.txt'];
const MAX_CHARS = 3500;
const FALLBACK_CHARS = 1200;

// Words that say nothing about the topic, so they never influence the match.
const STOPWORDS = new Set([
  'de', 'het', 'een', 'en', 'of', 'ik', 'je', 'jij', 'u', 'wij', 'we', 'ze', 'zij', 'hij', 'zij',
  'is', 'ben', 'bent', 'was', 'waren', 'kan', 'kun', 'kunt', 'kan', 'moet', 'moeten', 'wil', 'willen',
  'hoe', 'wat', 'waar', 'wanneer', 'waarom', 'welke', 'wie', 'dat', 'dit', 'deze', 'die', 'er', 'niet',
  'geen', 'met', 'voor', 'van', 'op', 'in', 'aan', 'bij', 'om', 'te', 'dan', 'maar', 'ook', 'als',
  'mijn', 'mijn', 'jouw', 'uw', 'ons', 'onze', 'heb', 'hebt', 'heeft', 'hebben', 'doe', 'doet', 'doen',
  'the', 'a', 'an', 'and', 'or', 'is', 'are', 'to', 'of', 'in', 'on', 'for', 'with', 'how', 'what',
  'why', 'when', 'where', 'which', 'i', 'you', 'my', 'your', 'can', 'do', 'does', 'it', 'this', 'that',
]);

let cache = { key: '', chunks: [] };

function baseDir() {
  return AI.knowledgeDir || path.join(__dirname, '..', '..', 'knowledge');
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...listFiles(full));
    } else if (EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
      found.push(full);
    }
  }
  return found;
}

function fileSignature(files) {
  return files
    .map((file) => {
      const stat = fs.statSync(file);
      return `${file}:${stat.mtimeMs}:${stat.size}`;
    })
    .join('|');
}

// Splits on headings and blank lines, so each chunk stays about one subject.
function splitIntoChunks(text, source) {
  const parts = String(text)
    .split(/\n(?=#{1,3}\s)|\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.map((part) => {
    const titleMatch = /^#{1,3}\s+(.+)$/m.exec(part);
    return { source, title: titleMatch ? titleMatch[1].trim() : source, text: part };
  });
}

function loadChunks() {
  const files = FOLDERS.flatMap((folder) => listFiles(path.join(baseDir(), folder)));
  const key = fileSignature(files);
  if (key === cache.key) return cache.chunks;

  const chunks = [];
  for (const file of files) {
    const folder = path.relative(baseDir(), file).split(path.sep)[0];
    try {
      chunks.push(...splitIntoChunks(fs.readFileSync(file, 'utf8'), folder));
    } catch (err) {
      console.error(`Could not read knowledge file ${file}:`, err.message);
    }
  }

  cache = { key, chunks };
  return chunks;
}

function words(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9à-ÿ\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
}

// Returns the knowledge that matters for this question, or the start of the docs when nothing matches.
function getContext(question) {
  const chunks = loadChunks();
  if (chunks.length === 0) return '';

  const asked = new Set(words(question));
  const scored = chunks
    .map((chunk) => {
      const chunkWords = new Set(words(chunk.text));
      let score = 0;
      for (const word of asked) if (chunkWords.has(word)) score += 1;
      return { chunk, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const picked = [];
  let size = 0;
  const add = (chunk, limit) => {
    if (size + chunk.text.length > limit) return;
    picked.push(`[${chunk.source}] ${chunk.text}`);
    size += chunk.text.length;
  };

  if (scored.length === 0) {
    for (const chunk of chunks) add(chunk, FALLBACK_CHARS);
  } else {
    for (const { chunk } of scored) add(chunk, MAX_CHARS);
  }

  return picked.join('\n\n').slice(0, MAX_CHARS);
}

// Test helper: forget the cached files.
function resetCache() {
  cache = { key: '', chunks: [] };
}

module.exports = { getContext, resetCache, FOLDERS };
