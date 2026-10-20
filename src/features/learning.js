const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { STAFF_ROLE_NAMES } = require('../config');
const { baseChannelName, findRole } = require('../utils/permissions');
const settings = require('../utils/botSettings');

// The channel the bot creates to be taught. The name does not matter: it is remembered in
// DATA_DIR/bot-settings.json, and the plain name is used to find it again after a reset.
const CHANNEL_NAME = '🧠│ai-training';
const CHANNEL_BASE = baseChannelName(CHANNEL_NAME);

const TRAINING_TEXT = [
  '## 🧠 AI training channel',
  'Teach the bot here. Everything you save here applies to **everyone, in every channel**.',
  'Talk to me with a ping (`@bot ...`): I only answer when I am mentioned.',
  '',
  '**Say it in your own words** (the assistant turns it into a rule):',
  '• `reageer op elk bericht met poep` → replies "poep" to every message',
  '• `als iemand hallo zegt, antwoord met hey` → replies "hey" to messages containing "hallo"',
  '• `reageer met 🔥 op elk bericht met fire` → adds that reaction instead of replying',
  '• `onthou dat we nooit korting geven` → a lesson, added to what the assistant knows',
  '',
  '**Or use the commands:**',
  '• `/learn add trigger:* response:poep` — trigger `*` means every message',
  '• `/learn list`, `/learn remove`, `/learn clear`',
  '/ai-stop and /ai-start switch the bot\'s real admin actions off and on.',
].join('\n');

// Channel permissions: staff and the bot keep access, @everyone does not. Administrators
// (the server owner included) can see every channel anyway, so they can always teach.
function learningOverwrites(guild) {
  const allow = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.EmbedLinks,
  ];
  const overwrites = [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }];

  for (const name of STAFF_ROLE_NAMES) {
    const role = findRole(guild, name);
    if (role) overwrites.push({ id: role.id, allow });
  }

  const me = guild.members?.me;
  if (me) overwrites.push({ id: me.id, allow: [...allow, PermissionFlagsBits.ManageMessages] });

  return overwrites;
}

// Finds or creates the training channel and remembers its ID. Never throws: without the
// permission to create a channel the bot still works, the teaching commands keep working.
async function ensureLearningChannel(guild, { force = false } = {}) {
  if (!guild) return null;

  if (!force) {
    const storedId = settings.getLearningChannelId();
    const stored = storedId ? guild.channels.cache.get(storedId) : null;
    if (stored) return stored;
  }

  const existing = guild.channels.cache.find(
    (channel) =>
      channel.type === ChannelType.GuildText &&
      baseChannelName(channel.name).toLowerCase() === CHANNEL_BASE.toLowerCase()
  );
  if (existing) {
    settings.setLearningChannelId(existing.id);
    return existing;
  }

  // Without Manage Channels the channel cannot be created; the commands still work.
  if (!guild.channels?.create) return null;

  try {
    const channel = await guild.channels.create({
      name: CHANNEL_NAME,
      type: ChannelType.GuildText,
      topic: 'Teach the bot new behaviour here. What it learns applies to everyone.',
      permissionOverwrites: learningOverwrites(guild),
      reason: 'Training channel created by Champ Client Bot',
    });

    settings.setLearningChannelId(channel.id);
    await channel
      .send({ content: TRAINING_TEXT, allowedMentions: { parse: [] } })
      .catch((err) => console.error('Could not post the training instructions:', err.message));
    console.log(`Created the AI training channel #${channel.name} (${channel.id})`);
    return channel;
  } catch (err) {
    console.error('Could not create the AI training channel:', err.message);
    return null;
  }
}

function isLearningChannel(channel) {
  const id = settings.getLearningChannelId();
  return Boolean(id && channel?.id === id);
}

// Applies a learned rule to a normal message. Returns true when the bot answered or reacted.
// Rules are per server and apply to every member, which is what "react to every message" means.
async function handleLearnedRule(message) {
  if (!message?.guild || message.author?.bot || message.system || message.webhookId) return false;
  if (!String(message.content ?? '').trim()) return false;
  // In the training channel the trusted user is talking to the assistant, not to a rule.
  if (isLearningChannel(message.channel)) return false;

  const rule = settings.findMatchingRule(message.content);
  if (!rule) return false;

  try {
    if (rule.mode === 'react') {
      const reacted = await message.react(rule.response).then(
        () => true,
        () => false
      );
      if (!reacted) {
        await message.channel.send({ content: rule.response, allowedMentions: { parse: [] } });
      }
    } else {
      await message.channel.send({ content: rule.response, allowedMentions: { parse: [] } });
    }
    return true;
  } catch (err) {
    console.error('Could not apply a learned rule:', err.message);
    return false;
  }
}

function describeRule(rule, index) {
  const trigger = rule.trigger === '*' ? 'every message' : `a message containing "${rule.trigger}"`;
  const action = rule.mode === 'react' ? `react with ${rule.response}` : `reply "${rule.response}"`;
  return `${index + 1}. ${trigger} → ${action}`;
}

function describeRules() {
  const rules = settings.listLearnedRules();
  if (rules.length === 0) return 'No learned rules yet.';
  return rules.map(describeRule).join('\n');
}

function describeLessons() {
  const lessons = settings.listLessons();
  if (lessons.length === 0) return 'No lessons yet.';
  return lessons.map((lesson, index) => `${index + 1}. ${lesson.text}`).join('\n');
}

// Context added to the assistant's system prompt, so it follows what it was taught.
function describeLearning() {
  const rules = settings.listLearnedRules();
  const lessons = settings.listLessons();
  if (rules.length === 0 && lessons.length === 0) return '';

  const lines = ['', 'Learned behaviour in this server. Follow it exactly:'];
  if (rules.length > 0) {
    lines.push('– Message rules (the bot handles these itself, without the model):');
    lines.push(...rules.map(describeRule));
  }
  if (lessons.length > 0) {
    lines.push('– Lessons:');
    lines.push(...lessons.map((lesson) => `• ${lesson.text}`));
  }
  return lines.join('\n');
}

module.exports = {
  CHANNEL_NAME,
  TRAINING_TEXT,
  ensureLearningChannel,
  isLearningChannel,
  handleLearnedRule,
  describeLearning,
  describeRules,
  describeLessons,
};
