const fs = require('fs');
const path = require('path');

// Runtime settings that must survive a restart: the AI stop switch, the learning channel,
// what the bot learned there and the actions it runs when a ticket opens.
// Set DATA_DIR to a persistent volume (e.g. /data on Railway) to keep them across deploys.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'bot-settings.json');

const MAX_RULES = 100;
const MAX_LESSONS = 100;
const MAX_RULE_TEXT = 1500;
const MAX_LESSON_TEXT = 500;

// {user}, {name}, {server} and {count} are filled in when someone joins.
const MAX_WELCOME_MESSAGE = 1500;
const DEFAULT_WELCOME_MESSAGE =
  '👋 Welcome {user} to **{server}**! You are member **#{count}**.';

// The member counter is a voice channel name, and Discord cuts those off at 100 characters.
const MAX_STATS_TEMPLATE = 100;
const DEFAULT_STATS_TEMPLATE = '👥 Members: {count}';

const DEFAULTS = {
  // false = the trusted operators can still talk to the assistant, but no action tool runs.
  aiAdminEnabled: true,
  // The channel the bot created to be taught new behaviour. null = not created yet.
  learningChannelId: null,
  // { id, trigger, response, mode: 'reply' | 'react', createdBy, createdAt }
  learnedRules: [],
  // Free-form instructions kept as context for the assistant.
  lessons: [],
  // { id, type: 'role', roleId, roleName, userId: null, panelId: '*' }
  ticketActions: [],
  // Channel that gets the welcome message. null = welcome messages are off.
  welcomeChannelId: null,
  welcomeMessage: DEFAULT_WELCOME_MESSAGE,
  // Voice channel whose name shows the member count. null = the counter is off.
  statsChannelId: null,
  statsTemplate: DEFAULT_STATS_TEMPLATE,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeRule(rule) {
  const response = String(rule?.response ?? '').trim().slice(0, MAX_RULE_TEXT);
  if (!response) return null;

  return {
    id: String(rule?.id ?? newId('rule')),
    trigger: String(rule?.trigger ?? '*').trim().slice(0, 200) || '*',
    response,
    mode: rule?.mode === 'react' ? 'react' : 'reply',
    createdBy: rule?.createdBy ? String(rule.createdBy) : null,
    createdAt: rule?.createdAt ? String(rule.createdAt) : new Date(0).toISOString(),
  };
}

function normalizeLesson(lesson) {
  const text = String(lesson?.text ?? '').trim().slice(0, MAX_LESSON_TEXT);
  if (!text) return null;

  return {
    id: String(lesson?.id ?? newId('lesson')),
    text,
    createdBy: lesson?.createdBy ? String(lesson.createdBy) : null,
    createdAt: lesson?.createdAt ? String(lesson.createdAt) : new Date(0).toISOString(),
  };
}

// A ticket action is "give this role". Without a userId it applies to every member,
// without a panelId it applies to every ticket panel. "*" means "every".
function normalizeAction(action) {
  const roleId = String(action?.roleId ?? '').trim();
  if (!roleId) return null;

  return {
    id: String(action?.id ?? newId('action')),
    type: 'role',
    roleId,
    roleName: String(action?.roleName ?? '').slice(0, 100),
    userId: action?.userId ? String(action.userId) : null,
    panelId: action?.panelId ? String(action.panelId) : '*',
  };
}

// A stored template always comes back usable: missing, blank or oversized values fall back to
// the default instead of leaving the bot with nothing to send.
function normalizeTemplate(value, fallback, maxLength) {
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : fallback;
}

function normalizeChannelId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeSettings(value = {}) {
  const settings = clone(DEFAULTS);

  settings.aiAdminEnabled = value.aiAdminEnabled !== false;
  settings.learningChannelId =
    typeof value.learningChannelId === 'string' && value.learningChannelId
      ? value.learningChannelId
      : null;

  settings.welcomeChannelId = normalizeChannelId(value.welcomeChannelId);
  settings.welcomeMessage = normalizeTemplate(
    value.welcomeMessage,
    DEFAULT_WELCOME_MESSAGE,
    MAX_WELCOME_MESSAGE
  );
  settings.statsChannelId = normalizeChannelId(value.statsChannelId);
  settings.statsTemplate = normalizeTemplate(
    value.statsTemplate,
    DEFAULT_STATS_TEMPLATE,
    MAX_STATS_TEMPLATE
  );

  settings.learnedRules = Array.isArray(value.learnedRules)
    ? value.learnedRules.map(normalizeRule).filter(Boolean).slice(-MAX_RULES)
    : [];

  settings.lessons = Array.isArray(value.lessons)
    ? value.lessons.map(normalizeLesson).filter(Boolean).slice(-MAX_LESSONS)
    : [];

  settings.ticketActions = Array.isArray(value.ticketActions)
    ? value.ticketActions.map(normalizeAction).filter(Boolean)
    : [];

  return settings;
}

function readSettings() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return normalizeSettings(data && typeof data === 'object' ? data : {});
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('Could not read bot settings, using defaults:', err.message);
    }
    return normalizeSettings();
  }
}

function writeSettings(settings) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

function getSettings() {
  return readSettings();
}

function updateSettings(patch) {
  const next = normalizeSettings({ ...readSettings(), ...patch });
  writeSettings(next);
  return next;
}

function isAiAdminEnabled() {
  return readSettings().aiAdminEnabled;
}

// Returns the new state. /ai-start turns the action tools back on.
function setAiAdminEnabled(enabled) {
  return updateSettings({ aiAdminEnabled: Boolean(enabled) }).aiAdminEnabled;
}

function getLearningChannelId() {
  return readSettings().learningChannelId;
}

function setLearningChannelId(channelId) {
  return updateSettings({ learningChannelId: channelId ? String(channelId) : null })
    .learningChannelId;
}

function getWelcomeSettings() {
  const settings = readSettings();
  return { channelId: settings.welcomeChannelId, message: settings.welcomeMessage };
}

// null turns welcome messages off; the message itself is kept.
function setWelcomeChannelId(channelId) {
  return updateSettings({ welcomeChannelId: channelId ? String(channelId) : null })
    .welcomeChannelId;
}

function setWelcomeMessage(message) {
  return updateSettings({ welcomeMessage: message }).welcomeMessage;
}

function getStatsSettings() {
  const settings = readSettings();
  return { channelId: settings.statsChannelId, template: settings.statsTemplate };
}

function setStatsChannelId(channelId) {
  return updateSettings({ statsChannelId: channelId ? String(channelId) : null }).statsChannelId;
}

function setStatsTemplate(template) {
  return updateSettings({ statsTemplate: template }).statsTemplate;
}

function listLearnedRules() {
  return readSettings().learnedRules;
}

// Adds a rule. An identical trigger/response/mode combination is reused instead of duplicated.
function addLearnedRule({ trigger = '*', response, mode = 'reply', createdBy = null }) {
  const text = String(response ?? '').trim().slice(0, MAX_RULE_TEXT);
  if (!text) throw new Error('A reply or reaction is required.');

  const wantedTrigger = String(trigger ?? '*').trim().slice(0, 200) || '*';
  const wantedMode = mode === 'react' ? 'react' : 'reply';
  const settings = readSettings();

  const existing = settings.learnedRules.find(
    (rule) =>
      rule.trigger.toLowerCase() === wantedTrigger.toLowerCase() &&
      rule.response === text &&
      rule.mode === wantedMode
  );
  if (existing) return existing;

  const rule = {
    id: newId('rule'),
    trigger: wantedTrigger,
    response: text,
    mode: wantedMode,
    createdBy: createdBy ? String(createdBy) : null,
    createdAt: new Date().toISOString(),
  };
  settings.learnedRules = [...settings.learnedRules, rule].slice(-MAX_RULES);
  writeSettings(settings);
  return rule;
}

// `idOrIndex` is a rule ID, a 1-based position from /learn list, a trigger, or the reply text
// itself ("ik praat nederlands"), so a rule can be removed without looking up its number.
function removeLearnedRule(idOrIndex) {
  const settings = readSettings();
  const wanted = String(idOrIndex ?? '').trim().replace(/^#/, '');
  if (!wanted) return null;

  let index;
  if (/^\d+$/.test(wanted)) {
    index = Number(wanted) - 1;
  } else {
    const lower = wanted.toLowerCase();
    index = settings.learnedRules.findIndex((rule) => rule.id === wanted);
    if (index < 0) {
      index = settings.learnedRules.findIndex((rule) => rule.response.toLowerCase() === lower);
    }
    if (index < 0) {
      index = settings.learnedRules.findIndex((rule) => rule.trigger.toLowerCase() === lower);
    }
  }
  if (index < 0 || index >= settings.learnedRules.length) return null;

  const [removed] = settings.learnedRules.splice(index, 1);
  writeSettings(settings);
  return removed;
}

function clearLearnedRules() {
  const settings = readSettings();
  const count = settings.learnedRules.length;
  settings.learnedRules = [];
  writeSettings(settings);
  return count;
}

// The first rule whose trigger appears in the message. A concrete trigger always beats a
// catch-all, no matter which was taught first, so one old "*" rule cannot silence every rule
// added after it. Between several "*" rules the newest wins: teaching again replaces the
// answer instead of the bot repeating the first catch-all forever.
// Triggers can list alternatives with "|".
function findMatchingRule(content) {
  const text = String(content ?? '').trim();
  if (!text) return null;

  const lower = text.toLowerCase();
  const rules = listLearnedRules();

  for (const rule of rules) {
    if (rule.trigger === '*') continue;

    const triggers = rule.trigger
      .split('|')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (triggers.some((trigger) => lower.includes(trigger))) return rule;
  }

  return [...rules].reverse().find((rule) => rule.trigger === '*') ?? null;
}

function listLessons() {
  return readSettings().lessons;
}

function addLesson({ text, createdBy = null }) {
  const value = String(text ?? '').trim().slice(0, MAX_LESSON_TEXT);
  if (!value) return null;

  const settings = readSettings();
  const existing = settings.lessons.find(
    (lesson) => lesson.text.toLowerCase() === value.toLowerCase()
  );
  if (existing) return existing;

  const lesson = {
    id: newId('lesson'),
    text: value,
    createdBy: createdBy ? String(createdBy) : null,
    createdAt: new Date().toISOString(),
  };
  settings.lessons = [...settings.lessons, lesson].slice(-MAX_LESSONS);
  writeSettings(settings);
  return lesson;
}

function removeLesson(idOrIndex) {
  const settings = readSettings();
  const wanted = String(idOrIndex ?? '').trim().replace(/^#/, '');
  if (!wanted) return null;

  const index = /^\d+$/.test(wanted)
    ? Number(wanted) - 1
    : settings.lessons.findIndex((lesson) => lesson.id === wanted);
  if (index < 0 || index >= settings.lessons.length) return null;

  const [removed] = settings.lessons.splice(index, 1);
  writeSettings(settings);
  return removed;
}

function clearLessons() {
  const settings = readSettings();
  const count = settings.lessons.length;
  settings.lessons = [];
  writeSettings(settings);
  return count;
}

function listTicketActions() {
  return readSettings().ticketActions;
}

// The actions that must run when this member opens a ticket in this panel.
function getTicketActionsFor({ panelId = '*', userId = null } = {}) {
  return readSettings().ticketActions.filter(
    (action) =>
      (action.panelId === '*' || action.panelId === panelId) &&
      (!action.userId || action.userId === userId)
  );
}

// Registers a role that is given when a ticket opens. Adding the same role twice for the
// same scope reuses the existing action.
function addTicketAction({ roleId, roleName, userId = null, panelId = '*' }) {
  const wantedRole = String(roleId ?? '').trim();
  if (!wantedRole) throw new Error('A role is required.');

  const scope = {
    userId: userId ? String(userId) : null,
    panelId: panelId ? String(panelId) : '*',
  };
  const settings = readSettings();
  const existing = settings.ticketActions.find(
    (action) =>
      action.roleId === wantedRole &&
      action.userId === scope.userId &&
      action.panelId === scope.panelId
  );
  if (existing) return existing;

  const action = {
    id: newId('action'),
    type: 'role',
    roleId: wantedRole,
    roleName: String(roleName ?? '').slice(0, 100),
    ...scope,
  };
  settings.ticketActions = [...settings.ticketActions, action];
  writeSettings(settings);
  return action;
}

// `idOrIndex` is an action ID or its 1-based position in /ticket-actions list.
function removeTicketAction(idOrIndex) {
  const settings = readSettings();
  const wanted = String(idOrIndex ?? '').trim().replace(/^#/, '');
  if (!wanted) return null;

  const index = /^\d+$/.test(wanted)
    ? Number(wanted) - 1
    : settings.ticketActions.findIndex((action) => action.id === wanted || action.roleId === wanted);
  if (index < 0 || index >= settings.ticketActions.length) return null;

  const [removed] = settings.ticketActions.splice(index, 1);
  writeSettings(settings);
  return removed;
}

// Clears actions for one member, one panel, or everything.
function clearTicketActions({ userId = null, panelId = null } = {}) {
  const settings = readSettings();
  const before = settings.ticketActions.length;
  settings.ticketActions = settings.ticketActions.filter((action) => {
    if (userId && action.userId !== String(userId)) return true;
    if (panelId && action.panelId !== String(panelId)) return true;
    return false;
  });
  writeSettings(settings);
  return before - settings.ticketActions.length;
}

module.exports = {
  DATA_FILE,
  MAX_RULES,
  MAX_LESSONS,
  MAX_WELCOME_MESSAGE,
  MAX_STATS_TEMPLATE,
  DEFAULT_WELCOME_MESSAGE,
  DEFAULT_STATS_TEMPLATE,
  getSettings,
  updateSettings,
  getWelcomeSettings,
  setWelcomeChannelId,
  setWelcomeMessage,
  getStatsSettings,
  setStatsChannelId,
  setStatsTemplate,
  isAiAdminEnabled,
  setAiAdminEnabled,
  getLearningChannelId,
  setLearningChannelId,
  listLearnedRules,
  addLearnedRule,
  removeLearnedRule,
  clearLearnedRules,
  findMatchingRule,
  listLessons,
  addLesson,
  removeLesson,
  clearLessons,
  listTicketActions,
  getTicketActionsFor,
  addTicketAction,
  removeTicketAction,
  clearTicketActions,
};
