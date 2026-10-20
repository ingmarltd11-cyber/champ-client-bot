const { PermissionFlagsBits } = require('discord.js');
const settings = require('../utils/botSettings');
const { findChannel } = require('../utils/channelLookup');

// The welcome message is posted in one channel with the text the owner wrote. Placeholders
// let one message greet everyone by name, and a literal \n (Discord's slash command input
// cannot hold a real line break on every client) becomes a line break.

const MAX_CONTENT_LENGTH = 2000;

// Why a welcome message was not posted, in words an owner can act on.
const FAILURES = {
  'no-guild': 'this only works inside the server',
  'not-configured': 'no welcome channel is set yet; use `/welcome channel` first',
  'channel-missing': 'the welcome channel no longer exists; pick it again with `/welcome channel`',
  'not-text': 'the welcome channel is not a text channel',
  'no-permission': 'I need **Send Messages** in the welcome channel',
  bot: 'new bots are not welcomed, only real members',
};

function describeFailure(reason) {
  return FAILURES[reason] ?? `unknown reason (${reason})`;
}

// Fills {user}, {mention}, {name}, {display}, {tag}, {id}, {server}, {count} and {created}.
// Unknown placeholders are left alone, so `{server}` in a typo does not vanish silently.
function renderMessage(template, { member = null, user = null, guild = null, count = null } = {}) {
  const target = user ?? member?.user ?? {};
  const id = target.id ? String(target.id) : '';
  const username = target.username ?? 'there';

  const memberCount = count ?? guild?.memberCount ?? guild?.members?.cache?.size ?? 0;
  const createdSeconds = Number.isFinite(target.createdTimestamp)
    ? Math.floor(target.createdTimestamp / 1000)
    : null;

  const values = {
    user: id ? `<@${id}>` : `@${username}`,
    mention: id ? `<@${id}>` : `@${username}`,
    name: username,
    display: member?.displayName ?? username,
    tag: target.tag ?? username,
    id,
    server: guild?.name ?? 'the server',
    count: String(memberCount),
    created: createdSeconds ? `<t:${createdSeconds}:D>` : '',
  };

  return String(template ?? '')
    .replace(/\{(\w+)\}/g, (whole, key) => {
      const value = values[String(key).toLowerCase()];
      return value === undefined ? whole : value;
    })
    .replace(/\\n/g, '\n')
    .slice(0, MAX_CONTENT_LENGTH);
}

// Posts the welcome message for a member who just joined. Never throws: a missing permission
// or a deleted channel must not take the bot down, so the caller gets a reason instead.
async function sendWelcome(member) {
  const guild = member?.guild;
  if (!guild) return { sent: false, reason: 'no-guild' };

  // A bot joining the server is not a member; welcoming it would only add noise.
  if (member.user?.bot) return { sent: false, reason: 'bot' };

  const { channelId, message } = settings.getWelcomeSettings();
  if (!channelId) return { sent: false, reason: 'not-configured' };

  const channel = await findChannel(guild, channelId);
  if (!channel) return { sent: false, reason: 'channel-missing' };
  if (typeof channel.isTextBased === 'function' ? !channel.isTextBased() : !channel.send) {
    return { sent: false, reason: 'not-text' };
  }

  const me = guild.members?.me;
  const permissions = me && typeof channel.permissionsFor === 'function' ? channel.permissionsFor(me) : null;
  if (permissions && typeof permissions.has === 'function' && !permissions.has(PermissionFlagsBits.SendMessages)) {
    return { sent: false, reason: 'no-permission' };
  }

  const content = renderMessage(message, { member, user: member.user, guild });
  const userId = member.user?.id ? String(member.user.id) : '';

  // Only the new member is mentioned: a welcome message that happens to contain @everyone
  // must never ping the whole server.
  await channel.send({
    content,
    allowedMentions: { parse: [], users: userId ? [userId] : [] },
  });

  return { sent: true, channelId, content };
}

module.exports = {
  MAX_CONTENT_LENGTH,
  FAILURES,
  describeFailure,
  renderMessage,
  sendWelcome,
};
