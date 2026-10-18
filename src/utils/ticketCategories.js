const fs = require('fs');
const path = require('path');
const { ButtonStyle, parseEmoji } = require('discord.js');

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

// Button colours by name, so they can be stored in JSON and picked from a slash command.
const BUTTON_COLORS = ['blue', 'grey', 'green', 'red'];
const DEFAULT_BUTTON_COLOR = 'blue';
const BUTTON_STYLES = {
  blue: ButtonStyle.Primary,
  grey: ButtonStyle.Secondary,
  green: ButtonStyle.Success,
  red: ButtonStyle.Danger,
};

// Unknown or missing colours fall back to blue.
function buttonStyle(color) {
  return BUTTON_STYLES[color] ?? BUTTON_STYLES[DEFAULT_BUTTON_COLOR];
}

// Discord rejects a button emoji unless it is a real unicode emoji or a custom emoji
// with an ID. A plain word such as "ticket" makes the whole panel fail to post.
const UNICODE_EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\uFE0F|\u200D)+$/u;

function isValidEmoji(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 100) return false;

  const parsed = parseEmoji(trimmed);
  if (!parsed) return false;
  if (parsed.id) return true; // custom emoji: <:name:123>
  return UNICODE_EMOJI_ONLY.test(parsed.name) && parsed.name.length <= 16;
}

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
  BUTTON_COLORS,
  DEFAULT_BUTTON_COLOR,
  buttonStyle,
  isValidEmoji,
  loadCategories,
  saveCategories,
  describeCategoryStorage,
  slugify,
};
