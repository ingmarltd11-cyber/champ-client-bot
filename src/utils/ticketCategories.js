const fs = require('fs');
const path = require('path');

// Runtime edits made with /ticket-category are stored here. Set DATA_DIR to a persistent
// volume (e.g. /data on Railway) so the settings survive redeploys. Default: the git-ignored data/ folder.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'ticket-categories.json');

// Discord select menus allow at most 25 options.
const MAX_CATEGORIES = 25;

// Discord modals hold at most 5 text inputs, and an input label is at most 45 characters.
const MAX_QUESTIONS = 5;
const MAX_QUESTION_LENGTH = 45;
const MAX_MESSAGE_LENGTH = 1000;

const DEFAULT_CATEGORIES = [
  { id: 'general-support', label: 'General Support', description: 'Questions and general help', emoji: '💬' },
  { id: 'report-player', label: 'Report a Player', description: 'Report a player for breaking the rules', emoji: '🚨' },
  { id: 'billing-payments', label: 'Billing/Payments', description: 'Payment, license and billing questions', emoji: '💳' },
  { id: 'partnership-business', label: 'Partnership/Business', description: 'Partnership and business inquiries', emoji: '🤝' },
];

function loadCategories() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (Array.isArray(data) && data.length > 0) return data;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('Could not read ticket categories, using defaults:', err.message);
    }
  }
  return DEFAULT_CATEGORIES.map((category) => ({ ...category }));
}

function saveCategories(categories) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(categories, null, 2), 'utf8');
}

// Tells you at startup where the categories come from, so a lost volume is visible in the logs.
function describeCategoryStorage() {
  const saved = fs.existsSync(DATA_FILE);
  const count = loadCategories().length;
  return `Ticket categories: ${count} loaded from ${DATA_FILE} (${
    saved ? 'saved settings' : 'built-in defaults, no saved file yet'
  })`;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

module.exports = {
  DEFAULT_CATEGORIES,
  MAX_CATEGORIES,
  MAX_QUESTIONS,
  MAX_QUESTION_LENGTH,
  MAX_MESSAGE_LENGTH,
  loadCategories,
  saveCategories,
  describeCategoryStorage,
  slugify,
};
