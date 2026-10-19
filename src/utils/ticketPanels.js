const fs = require('fs');
const path = require('path');
const { loadCategories, slugify } = require('./ticketCategories');

// Saved panels live next to the ticket categories, so DATA_DIR keeps both on a volume.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'ticket-panels.json');

const DEFAULT_PANEL_ID = 'default';
const DEFAULT_PANEL = {
  id: DEFAULT_PANEL_ID,
  title: 'Support Tickets',
  description: 'Click a button below to open a private ticket with our staff.',
  // null = show every category, including categories added later.
  categoryIds: null,
};

function clone(panel) {
  return { ...panel, categoryIds: panel.categoryIds ? [...panel.categoryIds] : null };
}

// Discord allows 100 characters in a button custom ID. A panel ID of at most 30 keeps
// "ticket-open:<panel>:<category>" (and the form ID) safely under that limit.
function panelKey(name) {
  const key = slugify(String(name ?? '').trim()).slice(0, 30);
  return key || DEFAULT_PANEL_ID;
}

function readAll() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('Could not read ticket panels, using the default panel:', err.message);
    }
  }
  return {};
}

function writeAll(panels) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(panels, null, 2), 'utf8');
}

function normalizePanel(name, value = {}) {
  const id = panelKey(value.id ?? name);
  return {
    id,
    title: String(value.title ?? DEFAULT_PANEL.title).slice(0, 256),
    description: String(value.description ?? DEFAULT_PANEL.description).slice(0, 4000),
    categoryIds: Array.isArray(value.categoryIds)
      ? value.categoryIds.map((categoryId) => String(categoryId))
      : null,
  };
}

// All saved panels, always including the built-in default panel.
function loadPanels() {
  const stored = readAll();
  const panels = { [DEFAULT_PANEL_ID]: clone(DEFAULT_PANEL) };
  for (const [name, value] of Object.entries(stored)) {
    const panel = normalizePanel(name, value);
    panels[panel.id] = panel;
  }
  return panels;
}

function listPanels() {
  return Object.values(loadPanels());
}

// Looks a panel up by ID or by its title ("media panel" -> "media-panel").
function getPanel(name) {
  const id = panelKey(name ?? DEFAULT_PANEL_ID);
  const panels = loadPanels();
  if (panels[id]) return panels[id];

  const wanted = String(name ?? '').trim().toLowerCase();
  return (
    Object.values(panels).find((panel) => panel.title.toLowerCase() === wanted) ??
    null
  );
}

// Creates or replaces a saved panel. `categories` may be null (all categories), an array of
// category IDs or a comma-separated string of IDs/labels. Unknown names are returned instead
// of saved, so a typo cannot silently create an empty panel.
function savePanel({ name, title, description, categories }) {
  const id = panelKey(name ?? DEFAULT_PANEL_ID);
  const existing = getPanel(id);

  let categoryIds = existing?.categoryIds ?? null;
  if (categories !== undefined && categories !== null) {
    const resolved = resolveCategoryIds(categories);
    if (resolved.unknown.length > 0) return { panel: null, unknown: resolved.unknown };
    categoryIds = resolved.ids;
  }

  const panels = loadPanels();
  panels[id] = normalizePanel(id, {
    id,
    title: title ?? existing?.title ?? DEFAULT_PANEL.title,
    description: description ?? existing?.description ?? DEFAULT_PANEL.description,
    categoryIds,
  });
  writeAll(panels);
  return { panel: panels[id], unknown: [] };
}

function removePanel(name) {
  const id = panelKey(name);
  if (id === DEFAULT_PANEL_ID) return false;
  const panels = loadPanels();
  if (!panels[id]) return false;
  delete panels[id];
  writeAll(panels);
  return true;
}

// Accepts IDs or labels, returns the matching category IDs in the order given.
// Unknown names are returned separately so a command can explain the mistake.
function resolveCategoryIds(input) {
  const all = loadCategories();
  const names = Array.isArray(input)
    ? input
    : String(input ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

  const ids = [];
  const unknown = [];
  for (const name of names) {
    const wanted = String(name).toLowerCase();
    const category =
      all.find((entry) => entry.id.toLowerCase() === wanted) ??
      all.find((entry) => String(entry.label ?? '').toLowerCase() === wanted);
    if (category) {
      if (!ids.includes(category.id)) ids.push(category.id);
    } else {
      unknown.push(name);
    }
  }
  return { ids, unknown };
}

// The categories a panel shows, in the panel's order. A missing category is skipped,
// so deleting a category never breaks an existing panel.
function panelCategories(panel) {
  const all = loadCategories();
  if (!panel?.categoryIds || panel.categoryIds.length === 0) return all;
  return panel.categoryIds
    .map((categoryId) => all.find((category) => category.id === categoryId))
    .filter(Boolean);
}

function describePanels() {
  return listPanels()
    .map((panel) => {
      const categories = panelCategories(panel);
      const names = categories.map((category) => category.id).join(', ') || 'none';
      const defaultTag = panel.id === DEFAULT_PANEL_ID ? ' (default)' : '';
      return `• **${panel.title}** \`${panel.id}\`${defaultTag} — ${categories.length} categor(y/ies): ${names}`;
    })
    .join('\n');
}

module.exports = {
  DEFAULT_PANEL_ID,
  DEFAULT_PANEL,
  DATA_FILE,
  loadPanels,
  listPanels,
  getPanel,
  savePanel,
  removePanel,
  resolveCategoryIds,
  panelCategories,
  panelKey,
  describePanels,
};
