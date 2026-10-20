// Run with: npm test   (node --test)
// Fake Discord objects only: no token, no server, no network.
const fs = require('fs');
const os = require('os');
const path = require('path');

// The settings store reads DATA_DIR when it is loaded, so point it at a temp folder first.
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'champ-bot-welcome-'));
process.env.DATA_DIR = DATA_DIR;

const test = require('node:test');
const assert = require('node:assert/strict');

const settings = require('../src/utils/botSettings');
const greeting = require('../src/features/greeting');
const memberCount = require('../src/features/memberCount');
const welcomeCommand = require('../src/commands/welcome');
const memberCountCommand = require('../src/commands/membercount');

function resetSettings() {
  fs.rmSync(settings.DATA_FILE, { force: true });
  memberCount.resetState();
}

function makeTextChannel({ id = 'welcome-1', canSend = true } = {}) {
  const sent = [];
  return {
    id,
    name: 'welcome',
    sent,
    isTextBased: () => true,
    isVoiceBased: () => false,
    permissionsFor: () => ({ has: () => canSend }),
    send: async (payload) => {
      sent.push(payload);
      return { id: 'message-1', ...payload };
    },
  };
}

function makeGuild({ channels = [], memberCount: members = 12, name = 'Champ' } = {}) {
  const cache = new Map(channels.map((channel) => [channel.id, channel]));
  return {
    id: 'guild-1',
    name,
    ownerId: 'owner-1',
    memberCount: members,
    channels: {
      cache,
      fetch: async (id) => {
        const channel = cache.get(id);
        if (!channel) throw new Error('Unknown Channel');
        return channel;
      },
    },
    members: { me: { id: 'bot' } },
    roles: { everyone: { id: 'role-everyone' } },
  };
}

function makeMember(guild, { id = '111', username = 'newbie' } = {}) {
  return {
    id,
    guild,
    displayName: 'Newbie Display',
    user: {
      id,
      username,
      tag: `${username}#0001`,
      createdTimestamp: Date.UTC(2020, 0, 2),
    },
  };
}

// --- Placeholders -----------------------------------------------------------------

test('the welcome message fills in the member, server and count', () => {
  const guild = makeGuild({ memberCount: 42 });
  const member = makeMember(guild, { id: '222', username: 'sora' });

  const text = greeting.renderMessage(
    'Hi {user} ({name} / {display}) — welcome to {server}, member #{count} since {created}!',
    { member, guild }
  );

  assert.equal(
    text,
    'Hi <@222> (sora / Newbie Display) — welcome to Champ, member #42 since <t:1577923200:D>!'
  );
});

test('a literal \\n becomes a line break and unknown placeholders are left alone', () => {
  const guild = makeGuild();
  const member = makeMember(guild);

  const text = greeting.renderMessage('Line one\\nLine two {nope}', { member, guild });
  assert.equal(text, 'Line one\nLine two {nope}');
});

// --- Posting the welcome message --------------------------------------------------

test('the welcome message is posted in the configured channel and mentions only the member', async () => {
  resetSettings();
  const channel = makeTextChannel();
  const guild = makeGuild({ channels: [channel] });
  const member = makeMember(guild, { id: '333' });

  settings.setWelcomeChannelId(channel.id);
  settings.setWelcomeMessage('Welcome {user}! @everyone');

  const result = await greeting.sendWelcome(member);

  assert.equal(result.sent, true);
  assert.equal(channel.sent.length, 1);
  assert.equal(channel.sent[0].content, 'Welcome <@333>! @everyone');
  // The @everyone in the text must not ping the server.
  assert.deepEqual(channel.sent[0].allowedMentions, { parse: [], users: ['333'] });
});

test('without a channel there is no welcome message', async () => {
  resetSettings();
  const guild = makeGuild();
  const result = await greeting.sendWelcome(makeMember(guild));

  assert.equal(result.sent, false);
  assert.equal(result.reason, 'not-configured');
  assert.match(greeting.describeFailure(result.reason), /welcome channel/);
});

test('a bot that joins is not welcomed', async () => {
  resetSettings();
  const channel = makeTextChannel();
  const guild = makeGuild({ channels: [channel] });
  const member = makeMember(guild);
  member.user.bot = true;

  settings.setWelcomeChannelId(channel.id);
  const result = await greeting.sendWelcome(member);

  assert.equal(result.sent, false);
  assert.equal(result.reason, 'bot');
  assert.equal(channel.sent.length, 0);
});

test('a deleted channel or a missing permission is reported instead of thrown', async () => {
  resetSettings();
  const guild = makeGuild({ channels: [] });
  settings.setWelcomeChannelId('gone');

  const missing = await greeting.sendWelcome(makeMember(guild));
  assert.equal(missing.reason, 'channel-missing');

  const channel = makeTextChannel({ canSend: false });
  guild.channels.cache.set(channel.id, channel);
  settings.setWelcomeChannelId(channel.id);

  const denied = await greeting.sendWelcome(makeMember(guild));
  assert.equal(denied.reason, 'no-permission');
  assert.equal(channel.sent.length, 0);
});

// --- Member counter ---------------------------------------------------------------

test('the counter template fills in the count and stays within a channel name', () => {
  assert.equal(memberCount.renderCount('👥 Members: {count}', 412), '👥 Members: 412');
  assert.equal(memberCount.renderCount('{members} in {server}', 7, 'Champ'), '7 in Champ');
  assert.equal(memberCount.renderCount('{count}', 1).length, 1);

  const long = memberCount.renderCount(`${'x'.repeat(200)} {count}`, 5);
  assert.equal(long.length, memberCount.MAX_NAME_LENGTH);
});

test('the counter renames the voice channel and skips an unchanged name', async () => {
  resetSettings();
  const channel = makeTextChannel({ id: 'stats-1', canSend: true });
  const renames = [];
  channel.isVoiceBased = () => true;
  channel.isTextBased = () => false;
  channel.permissionsFor = () => ({ has: () => true });
  channel.setName = async (name) => {
    renames.push(name);
    channel.name = name;
  };
  channel.name = 'Members: 1';

  const guild = makeGuild({ channels: [channel], memberCount: 12 });
  settings.setStatsChannelId(channel.id);
  settings.setStatsTemplate('Members: {count}');

  const first = await memberCount.syncGuildCount(guild);
  assert.equal(first.updated, true);
  assert.deepEqual(renames, ['Members: 12']);

  const second = await memberCount.syncGuildCount(guild);
  assert.equal(second.updated, false);
  assert.equal(second.reason, 'unchanged');
  assert.equal(renames.length, 1);
});

test('a second rename in the same window is throttled, and force still applies it', async () => {
  resetSettings();
  const channel = makeTextChannel({ id: 'stats-2' });
  const renames = [];
  channel.isVoiceBased = () => true;
  channel.permissionsFor = () => ({ has: () => true });
  channel.setName = async (name) => {
    renames.push(name);
    channel.name = name;
  };
  channel.name = 'Members: 0';

  const guild = makeGuild({ channels: [channel], memberCount: 3 });
  settings.setStatsChannelId(channel.id);
  settings.setStatsTemplate('Members: {count}');

  assert.equal((await memberCount.syncGuildCount(guild)).updated, true);

  guild.memberCount = 4;
  const throttled = await memberCount.syncGuildCount(guild);
  assert.equal(throttled.updated, false);
  assert.equal(throttled.reason, 'throttled');
  assert.ok(throttled.waitMs > 0);
  assert.equal(renames.length, 1);

  guild.memberCount = 5;
  const forced = await memberCount.syncGuildCount(guild, { force: true });
  assert.equal(forced.updated, true);
  assert.deepEqual(renames, ['Members: 3', 'Members: 5']);
});

test('the counter explains a missing channel and a missing permission', async () => {
  resetSettings();
  settings.setStatsChannelId('gone');
  const guild = makeGuild({ channels: [] });

  const missing = await memberCount.syncGuildCount(guild);
  assert.equal(missing.reason, 'channel-missing');

  const channel = makeTextChannel({ id: 'stats-3' });
  channel.isVoiceBased = () => true;
  channel.permissionsFor = () => ({ has: () => false });
  channel.setName = async () => {
    throw new Error('should not be called');
  };
  guild.channels.cache.set(channel.id, channel);
  settings.setStatsChannelId(channel.id);

  const denied = await memberCount.syncGuildCount(guild);
  assert.equal(denied.reason, 'no-permission');
});

// --- Stored settings --------------------------------------------------------------

test('welcome and counter settings survive a reload and fall back to defaults', () => {
  resetSettings();

  const fresh = settings.getWelcomeSettings();
  assert.equal(fresh.channelId, null);
  assert.equal(fresh.message, settings.DEFAULT_WELCOME_MESSAGE);
  assert.equal(settings.getStatsSettings().template, settings.DEFAULT_STATS_TEMPLATE);

  settings.setWelcomeChannelId('chan-9');
  settings.setWelcomeMessage('Yo {user}');
  settings.setStatsChannelId('voice-9');
  settings.setStatsTemplate('{count} members');

  assert.deepEqual(settings.getWelcomeSettings(), { channelId: 'chan-9', message: 'Yo {user}' });
  assert.deepEqual(settings.getStatsSettings(), { channelId: 'voice-9', template: '{count} members' });

  // An oversized template is cut off so the channel name never exceeds Discord's limit.
  settings.setStatsTemplate('x'.repeat(500));
  assert.equal(settings.getStatsSettings().template.length, settings.MAX_STATS_TEMPLATE);

  // A blank value is not allowed to wipe the welcome message.
  settings.setWelcomeMessage('   ');
  assert.equal(settings.getWelcomeSettings().message, settings.DEFAULT_WELCOME_MESSAGE);

  settings.setWelcomeChannelId(null);
  settings.setStatsChannelId(null);
  assert.equal(settings.getWelcomeSettings().channelId, null);
  assert.equal(settings.getStatsSettings().channelId, null);
});

// --- Commands ---------------------------------------------------------------------

test('/welcome and /membercount are owner-only with valid slash command data', () => {
  for (const command of [welcomeCommand, memberCountCommand]) {
    const json = command.data.toJSON();
    assert.ok(json.name);
    assert.ok(json.description.length <= 100);
    assert.equal(command.access, 'owner');
    assert.equal(typeof command.execute, 'function');

    for (const option of json.options ?? []) {
      assert.ok(option.description.length <= 100, `${json.name} ${option.name} description too long`);
    }
  }

  assert.equal(welcomeCommand.data.name, 'welcome');
  assert.equal(memberCountCommand.data.name, 'membercount');

  const subs = welcomeCommand.data.toJSON().options.map((option) => option.name);
  assert.deepEqual(subs, ['channel', 'message', 'test', 'show', 'disable']);
});

test('/welcome test reports when no channel is set', async () => {
  resetSettings();
  const guild = makeGuild();
  const replies = [];

  await welcomeCommand.execute({
    guild,
    // The Discord server owner always counts as owner, even without the owner role.
    member: { id: 'owner-1', guild, permissions: { has: () => false }, roles: { cache: [] } },
    user: { id: '1', username: 'owner' },
    options: { getSubcommand: () => 'test', getString: () => null },
    deferReply: async () => {},
    editReply: async (payload) => {
      replies.push(payload);
      return payload;
    },
    reply: async (payload) => {
      replies.push(payload);
      return payload;
    },
  });

  assert.equal(replies.length, 1);
  assert.match(replies[0].content, /welcome channel/);
});
