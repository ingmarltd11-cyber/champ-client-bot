// Run with: npm test   (node --test)
// These tests use fake Discord objects, so they need no token and touch no real server.
const fs = require('fs');
const os = require('os');
const path = require('path');

// Both stores read DATA_DIR when they are loaded, so point it at a temp folder first.
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'champ-bot-test-'));
process.env.DATA_DIR = DATA_DIR;

const test = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType, Collection, PermissionFlagsBits } = require('discord.js');

const { findRole, findRoleAny, isStaff } = require('../src/utils/permissions');
const verify = require('../src/features/verify');
const panels = require('../src/utils/ticketPanels');
const { buildRows } = require('../src/commands/ticket-panel');
const { parseTicketId } = require('../src/features/tickets');
const aiTools = require('../src/features/aiTools');
const { isTrustedUser } = require('../src/utils/trustedUsers');

function makeRole(id, name, position = 1, extra = {}) {
  return { id, name, position, managed: false, ...extra };
}

function makeGuild(roleName = 'Champ') {
  const role = makeRole('role-champ', roleName, 1);
  const everyone = makeRole('role-everyone', '@everyone', 0);
  const me = {
    id: 'bot',
    permissions: { has: () => true },
    roles: { highest: { position: 5 } },
  };
  const guild = {
    id: 'guild',
    ownerId: 'owner',
    client: { user: { id: 'bot' } },
    roles: {
      cache: new Collection([
        [role.id, role],
        [everyone.id, everyone],
      ]),
      everyone,
      create: async () => {
        throw new Error('the test role should already exist');
      },
      fetch: async () => {},
    },
    members: {
      me,
      cache: new Collection(),
      fetch: async () => null,
    },
  };
  return { guild, role, me };
}

function makeMember(guild, id = 'member') {
  const owned = new Set([guild.roles.everyone.id]);
  return {
    id,
    guild,
    roles: {
      cache: { has: (roleId) => owned.has(roleId) },
      add: async (role) => {
        owned.add(role.id);
      },
      remove: async (role) => {
        owned.delete(role.id);
      },
    },
    added: owned,
  };
}

test('findRole matches "champ" to a role named "Champ"', () => {
  const { guild, role } = makeGuild('Champ');
  assert.equal(findRole(guild, 'champ'), role);
  assert.equal(findRole(guild, 'CHAMP'), role);
});

test('isStaff accepts staff roles in any capitalisation', () => {
  const { guild } = makeGuild();
  const member = {
    permissions: { has: () => false },
    roles: { cache: [{ name: 'Support' }] },
  };
  assert.equal(isStaff(member), true);
});

test('verification grants the existing "Champ" role instead of failing', async () => {
  const { guild, role } = makeGuild('Champ');
  const member = makeMember(guild);

  const result = await verify.grantVerifiedRole(member);

  assert.equal(result.alreadyVerified, false);
  assert.equal(result.role.id, role.id);
  assert.equal(member.added.has(role.id), true);
});

test('verification reports an existing role on a second click', async () => {
  const { guild } = makeGuild('Champ');
  const member = makeMember(guild);
  await verify.grantVerifiedRole(member);

  const second = await verify.grantVerifiedRole(member);
  assert.equal(second.alreadyVerified, true);
});

test('verification explains a role that sits above the bot', async () => {
  const { guild, role, me } = makeGuild('Champ');
  role.position = me.roles.highest.position;

  await assert.rejects(
    () => verify.grantVerifiedRole(makeMember(guild)),
    /higher than or equal to my own role/
  );
});

test('a second ticket panel keeps its own categories and button IDs', () => {
  const stored = panels.savePanel({
    name: 'media',
    title: 'Media Panel',
    description: 'Apply for media',
    categories: 'general-support, billing-payments',
  });
  assert.deepEqual(stored.unknown, []);
  assert.deepEqual(stored.panel.categoryIds, ['general-support', 'billing-payments']);

  const panel = panels.getPanel('media');
  assert.equal(panel.title, 'Media Panel');
  assert.deepEqual(
    panels.panelCategories(panel).map((category) => category.id),
    ['general-support', 'billing-payments']
  );

  const rows = buildRows(panels.panelCategories(panel), panel.id);
  const json = rows[0].toJSON();
  assert.equal(json.components[0].custom_id, 'ticket-open:media:general-support');
  assert.equal(json.components[1].custom_id, 'ticket-open:media:billing-payments');
});

test('the default panel still shows every category and old buttons still parse', () => {
  const defaultPanel = panels.getPanel('default');
  assert.equal(defaultPanel.categoryIds, null);
  assert.ok(panels.panelCategories(defaultPanel).length >= 4);

  assert.deepEqual(parseTicketId('media:billing-payments'), {
    panelId: 'media',
    categoryId: 'billing-payments',
  });
  assert.deepEqual(parseTicketId('general-support'), {
    panelId: 'default',
    categoryId: 'general-support',
  });
});

test('unknown panel categories are rejected instead of silently dropped', () => {
  const stored = panels.savePanel({ name: 'broken', title: 'Broken', categories: 'nope' });
  assert.equal(stored.panel, null);
  assert.deepEqual(stored.unknown, ['nope']);
});

test('the default panel cannot be removed, other panels can', () => {
  assert.equal(panels.removePanel('default'), false);
  assert.equal(panels.removePanel('media'), true);
  assert.equal(panels.getPanel('media'), null);
});

test('sora_developing is trusted, a display-name copy is not', () => {
  assert.equal(isTrustedUser({ bot: false, username: 'sora_developing' }), true);
  assert.equal(isTrustedUser({ bot: false, username: 'someone', displayName: 'sora_developing' }), false);
});

test('an untrusted member cannot run an action tool', async () => {
  const result = await aiTools.executeTool(
    { author: { bot: false, username: 'random' }, guild: {} },
    'delete_channel',
    { channel: 'general' }
  );
  assert.match(result.text, /not allowed/i);
});

test('channel and member resolution work for the admin tools', async () => {
  const guild = {
    channels: {
      cache: new Collection([
        ['c1', { id: 'c1', name: '🛒│champ-client', type: 0 }],
      ]),
    },
    members: {
      cache: new Collection([
        ['m1', { id: 'm1', user: { username: 'Sora_Developing' }, displayName: 'Sora' }],
      ]),
      fetch: async () => null,
    },
    roles: { cache: new Collection() },
  };

  assert.equal(aiTools.resolveGuildChannel(guild, 'champ-client').id, 'c1');
  assert.equal((await aiTools.resolveMember(guild, 'sora_developing')).id, 'm1');
});

test('every action tool has a valid function schema and a destructive set', () => {
  assert.ok(aiTools.TOOLS.length >= 25);
  for (const tool of aiTools.TOOLS) {
    assert.equal(tool.type, 'function');
    assert.equal(typeof tool.function.name, 'string');
    assert.equal(typeof tool.function.description, 'string');
    assert.equal(tool.function.parameters.type, 'object');
  }
  const names = aiTools.TOOLS.map((tool) => tool.function.name);
  for (const expected of ['delete_message', 'purge_messages', 'delete_channel', 'delete_role', 'ban_member']) {
    assert.ok(names.includes(expected), `${expected} is missing`);
  }
});

test('a trusted user can run read-only tools and get a real result', async () => {
  const message = {
    author: { bot: false, username: 'sora_developing' },
    guild: { id: 'guild' },
  };

  const panelsResult = await aiTools.executeTool(message, 'list_ticket_panels', {});
  assert.match(panelsResult.text, /Ticket panels/);

  const optionsResult = await aiTools.executeTool(message, 'list_ticket_options', {});
  assert.match(optionsResult.text, /general-support/);
});

test('member search without the members intent explains the fix', async () => {
  const guild = {
    client: { options: { intents: { has: () => false } } },
    members: { cache: new Collection(), fetch: async () => null },
  };
  await assert.rejects(() => aiTools.resolveMember(guild, 'unknown-name'), /Server Members Intent/);
});

test('a failed destructive action returns an error instead of throwing', async () => {
  const message = {
    author: { bot: false, username: 'sora_developing' },
    guild: { channels: { cache: new Collection() } },
    channel: { id: 'current' },
  };

  const result = await aiTools.executeTool(message, 'delete_channel', { channel: 'does-not-exist' });
  assert.match(result.text, /No channel or category matches/);
});

test('permission constants used by the tools exist in discord.js', () => {
  for (const name of ['ManageMessages', 'ManageChannels', 'ManageRoles', 'KickMembers', 'BanMembers', 'ModerateMembers']) {
    assert.equal(typeof PermissionFlagsBits[name], 'bigint');
  }
});

// --- Learning, the AI stop switch and ticket actions --------------------------------

const settings = require('../src/utils/botSettings');
const learning = require('../src/features/learning');
const ticketRoles = require('../src/features/ticketRoles');
const { loadCommands } = require('../src/utils/loadCommands');
const tickets = require('../src/features/tickets');

function resetSettings() {
  settings.setAiAdminEnabled(true);
  settings.clearLearnedRules();
  settings.clearLessons();
  settings.clearTicketActions();
  settings.setLearningChannelId(null);
}

function makeMessage(content, overrides = {}) {
  const channel = {
    id: overrides.channelId ?? 'channel-1',
    sent: [],
    send: async (payload) => {
      channel.sent.push(payload.content);
      return payload;
    },
  };
  const message = {
    id: 'message-1',
    guild: { id: 'guild' },
    channel,
    author: { bot: false, id: 'member-1', username: 'member' },
    system: false,
    webhookId: null,
    content,
    reacted: [],
    react: async (emoji) => {
      if (emoji === 'not-an-emoji') throw new Error('invalid emoji');
      message.reacted.push(emoji);
      return emoji;
    },
    ...overrides,
  };
  return message;
}

test('a rule with trigger * answers every member, not just the operator', async () => {
  resetSettings();
  settings.addLearnedRule({ trigger: '*', response: 'poep' });

  const first = makeMessage('hallo');
  assert.equal(await learning.handleLearnedRule(first), true);
  assert.deepEqual(first.channel.sent, ['poep']);

  const second = makeMessage('iets heel anders', { author: { bot: false, id: 'member-2', username: 'other' } });
  assert.equal(await learning.handleLearnedRule(second), true);
  assert.deepEqual(second.channel.sent, ['poep']);
});

test('a rule only answers messages that contain its trigger', async () => {
  resetSettings();
  settings.addLearnedRule({ trigger: 'hallo|hey', response: 'hoi!' });

  const matching = makeMessage('nou hallo daar');
  assert.equal(await learning.handleLearnedRule(matching), true);
  assert.deepEqual(matching.channel.sent, ['hoi!']);

  const other = makeMessage('iets anders');
  assert.equal(await learning.handleLearnedRule(other), false);
  assert.deepEqual(other.channel.sent, []);
});

test('a reaction rule reacts, and falls back to a reply for an invalid emoji', async () => {
  resetSettings();
  settings.addLearnedRule({ trigger: '*', response: '🔥', mode: 'react' });

  const fire = makeMessage('brand');
  assert.equal(await learning.handleLearnedRule(fire), true);
  assert.deepEqual(fire.reacted, ['🔥']);
  assert.deepEqual(fire.channel.sent, []);

  resetSettings();
  settings.addLearnedRule({ trigger: '*', response: 'not-an-emoji', mode: 'react' });

  const broken = makeMessage('brand');
  assert.equal(await learning.handleLearnedRule(broken), true);
  assert.deepEqual(broken.channel.sent, ['not-an-emoji']);
});

test('the bot never answers itself, and rules stay quiet in the training channel', async () => {
  resetSettings();
  settings.addLearnedRule({ trigger: '*', response: 'poep' });

  const own = makeMessage('poep', { author: { bot: true, id: 'bot', username: 'bot' } });
  assert.equal(await learning.handleLearnedRule(own), false);

  settings.setLearningChannelId('training');
  const training = makeMessage('reageer op elk bericht met poep', { channelId: 'training' });
  assert.equal(await learning.handleLearnedRule(training), false);
  assert.deepEqual(training.channel.sent, []);
});

test('rules can be listed and removed by number', async () => {
  resetSettings();
  settings.addLearnedRule({ trigger: 'poep', response: 'poep terug' });
  assert.match(learning.describeRules(), /poep/);

  const removed = settings.removeLearnedRule('1');
  assert.equal(removed.trigger, 'poep');
  assert.equal(settings.listLearnedRules().length, 0);
  assert.equal(settings.findMatchingRule('poep'), null);
});

test('an unwanted catch-all can be removed by the text it replies with', async () => {
  resetSettings();
  settings.addLearnedRule({ trigger: '*', response: 'ik praat nederlands' });
  settings.addLearnedRule({ trigger: 'hallo', response: 'hoi' });

  const removed = settings.removeLearnedRule('Ik Praat Nederlands');
  assert.equal(removed.response, 'ik praat nederlands');
  assert.equal(settings.findMatchingRule('zomaar iets'), null);
  assert.equal(settings.findMatchingRule('hallo').response, 'hoi');
});

test('a catch-all rule no longer silences rules taught after it', async () => {
  resetSettings();
  settings.addLearnedRule({ trigger: '*', response: 'ik praat nederlands' });
  settings.addLearnedRule({ trigger: 'hallo', response: 'hoi!' });

  assert.equal(settings.findMatchingRule('hallo daar').response, 'hoi!');
  assert.equal(settings.findMatchingRule('iets anders').response, 'ik praat nederlands');

  // Teaching a new catch-all replaces the old answer instead of being ignored.
  settings.addLearnedRule({ trigger: '*', response: 'poep' });
  assert.equal(settings.findMatchingRule('iets anders').response, 'poep');
});

test('/ai-stop blocks every tool, /ai-start gives them back', async () => {
  resetSettings();
  const message = { author: { bot: false, username: 'sora_developing', id: '1' }, guild: { id: 'guild' } };

  assert.equal(settings.setAiAdminEnabled(false), false);
  const blocked = await aiTools.executeTool(message, 'list_channels', {});
  assert.match(blocked.text, /stopped/i);

  assert.equal(settings.setAiAdminEnabled(true), true);
  assert.equal(settings.isAiAdminEnabled(), true);
});

test('the assistant can be taught a rule with its own tool', async () => {
  resetSettings();
  const message = {
    author: { bot: false, username: 'sora_developing', id: '1' },
    guild: { id: 'guild' },
    channel: { id: 'training' },
  };

  const result = await aiTools.executeTool(message, 'teach_rule', { trigger: '*', response: 'poep' });
  assert.match(result.text, /Learned/);
  assert.equal(settings.findMatchingRule('anything').response, 'poep');

  const list = await aiTools.executeTool(message, 'list_learning', {});
  assert.match(list.text, /poep/);
});

test('ticket actions apply to everyone or to one member only', async () => {
  resetSettings();
  settings.addTicketAction({ roleId: 'role-buyer', roleName: 'buyer' });
  settings.addTicketAction({ roleId: 'role-vip', roleName: 'vip', userId: 'member-1' });

  assert.deepEqual(
    settings.getTicketActionsFor({ panelId: 'default', userId: 'member-2' }).map((a) => a.roleId),
    ['role-buyer']
  );
  assert.deepEqual(
    settings.getTicketActionsFor({ panelId: 'default', userId: 'member-1' }).map((a) => a.roleId),
    ['role-buyer', 'role-vip']
  );
});

test('applying ticket actions gives the roles to the opener and skips the impossible ones', async () => {
  resetSettings();
  settings.addTicketAction({ roleId: 'role-buyer', roleName: 'buyer' });
  settings.addTicketAction({ roleId: 'role-high', roleName: 'high' });
  settings.addTicketAction({ roleId: 'role-gone', roleName: 'gone' });

  const buyer = { id: 'role-buyer', name: 'buyer', position: 1, managed: false };
  const high = { id: 'role-high', name: 'high', position: 9, managed: false };
  const guild = {
    id: 'guild',
    roles: {
      cache: new Collection([
        [buyer.id, buyer],
        [high.id, high],
      ]),
      fetch: async () => null,
    },
    members: { me: { permissions: { has: () => true }, roles: { highest: { position: 5 } } } },
  };
  const owned = new Set();
  const member = {
    id: 'member-1',
    guild,
    roles: {
      cache: { has: (roleId) => owned.has(roleId) },
      add: async (role) => {
        owned.add(role.id);
      },
    },
  };

  const result = await ticketRoles.applyTicketActions(member, { panelId: 'default' });
  assert.deepEqual(result.added, ['buyer']);
  assert.equal(owned.has('role-buyer'), true);
  assert.equal(result.failed.length, 2);
});

test('the training channel is created once, gets instructions and is remembered', async () => {
  resetSettings();
  const created = [];
  const guild = {
    id: 'guild',
    roles: {
      everyone: { id: 'everyone' },
      cache: new Collection([['role-support', { id: 'role-support', name: 'Support', position: 1 }]]),
    },
    members: { me: { id: 'bot' } },
    channels: {
      cache: new Collection(),
      create: async (options) => {
        const channel = {
          id: 'channel-training',
          name: options.name,
          type: options.type,
          sent: [],
          send: async (payload) => channel.sent.push(payload.content),
          permissionOverwrites: { edit: async () => {} },
        };
        created.push(options);
        guild.channels.cache.set(channel.id, channel);
        return channel;
      },
    },
  };

  const first = await learning.ensureLearningChannel(guild);
  assert.equal(created.length, 1);
  assert.match(first.name, /ai-training/);
  assert.equal(first.type, ChannelType.GuildText);
  assert.equal(settings.getLearningChannelId(), 'channel-training');
  assert.match(first.sent[0], /AI training channel/);

  const second = await learning.ensureLearningChannel(guild);
  assert.equal(created.length, 1, 'the channel must not be created twice');
  assert.equal(second.id, 'channel-training');
});

test('an existing training channel is reused and the caller gets access', async () => {
  resetSettings();
  const edits = [];
  const existing = {
    id: 'channel-old',
    name: '🧠│ai-training',
    type: ChannelType.GuildText,
    permissionOverwrites: {
      edit: async (target, allow) => edits.push({ target, allow }),
    },
  };
  const guild = {
    id: 'guild',
    roles: {
      everyone: { id: 'everyone' },
      cache: new Collection([['role-support', { id: 'role-support', name: 'Support', position: 1 }]]),
    },
    members: { me: { id: 'bot' } },
    channels: {
      cache: new Collection([[existing.id, existing]]),
      create: async () => {
        throw new Error('the existing channel should be reused');
      },
    },
  };

  const channel = await learning.ensureLearningChannel(guild, { force: true, memberId: 'someone' });
  assert.equal(channel.id, 'channel-old');
  assert.equal(settings.getLearningChannelId(), 'channel-old');
  assert.ok(edits.some((entry) => entry.target === 'someone'), 'the caller did not get access');
  assert.ok(edits.some((entry) => entry.target?.id === 'bot'), 'the bot did not get access');
});

test('an unverified member is not treated as verified', () => {
  const member = {
    permissions: { has: () => false },
    roles: { cache: [{ name: 'unverified' }] },
  };
  assert.equal(tickets.isVerifiedMember(member), false);

  const verifiedMember = {
    permissions: { has: () => false },
    roles: { cache: [{ name: 'Champ' }] },
  };
  assert.equal(tickets.isVerifiedMember(verifiedMember), true);
});

test('every command file loads with a name, description and execute', () => {
  const commands = loadCommands();
  for (const command of commands) {
    const json = command.data.toJSON();
    assert.ok(json.name, 'a command has no name');
    assert.equal(typeof command.execute, 'function');
  }

  const names = commands.map((command) => command.data.name);
  for (const expected of [
    'learn',
    'setrole',
    'ticket-actions',
    'ai-stop',
    'ai-start',
    'close',
    'close-request',
  ]) {
    assert.ok(names.includes(expected), `${expected} is missing`);
  }
});

// --- Ticket advice, /close and /close-request --------------------------------------

const triage = require('../src/features/ticketTriage');
const closeCommand = require('../src/commands/close');
const closeRequestCommand = require('../src/commands/close-request');

// Discord user IDs are numeric; the ticket topic stores the opener that way.
const OPENER = '111111111111111111';

function makeAdviceChannel(openerId = OPENER) {
  const channel = {
    id: 'ticket-1',
    topic: `ticket-opener:${openerId} type:general-support panel:default`,
    sent: [],
    send: async (payload) => {
      const message = {
        id: 'advice-1',
        client: { user: { id: 'bot' } },
        author: { id: 'bot' },
        embeds: payload.embeds ?? [],
        guild: { id: 'guild', roles: { cache: new Collection() } },
        channel,
        reacted: [],
        react: async (emoji) => {
          message.reacted.push(emoji);
          return emoji;
        },
      };
      channel.sent.push(payload);
      return message;
    },
  };
  return channel;
}

function makeCommandInteraction(channel, { opener = OPENER, staff = false, options = {} } = {}) {
  const replies = [];
  const member = {
    permissions: { has: () => staff },
    roles: { cache: staff ? [{ name: 'Support' }] : [] },
  };

  return {
    guild: { id: 'guild', roles: { cache: new Collection() } },
    channel,
    member,
    user: { id: opener, bot: false, username: 'member', toString: () => `<@${opener}>` },
    replies,
    options: { getString: (name) => options[name] ?? null },
    reply: async (payload) => {
      replies.push(payload);
      return payload;
    },
  };
}

test('an unsupported client version gets an upgrade answer', () => {
  const suggestion = triage.suggestionFor({
    answers: [{ question: 'What is your client version?', answer: '1.21.10' }],
  });

  assert.ok(suggestion, 'no advice for an old version');
  assert.match(suggestion.title, /1\.21\.10/);
  assert.match(suggestion.body, /1\.21\.11 is our only version/);
  assert.match(suggestion.body, /upgrade/i);
});

test('the supported version and a versionless ticket get no advice', () => {
  assert.equal(
    triage.suggestionFor({ answers: [{ question: 'Client?', answer: '1.21.11' }] }),
    null
  );
  // "1.21" without the patch number is the supported build.
  assert.equal(triage.suggestionFor({ content: 'i play on 1.21' }), null);
  assert.equal(triage.suggestionFor({ content: 'my game crashes on startup' }), null);
  assert.equal(triage.suggestionFor({ answers: [] }), null);
});

test('the advice is posted with a thumb up and a thumb down', async () => {
  const channel = makeAdviceChannel();
  const advice = await triage.postTriage(channel, {
    answers: [{ question: 'What is your client version?', answer: '1.21.10' }],
  });

  assert.ok(advice, 'no advice posted');
  assert.deepEqual(advice.reacted, ['👍', '👎']);
  assert.equal(advice.embeds[0].data.footer.text, triage.TRIAGE_FOOTER);

  // A ticket without a known problem stays quiet.
  const quiet = makeAdviceChannel();
  assert.equal(await triage.postTriage(quiet, { content: 'help' }), null);
  assert.equal(quiet.sent.length, 0);
});

test('only the opener votes on the advice, and 👍 asks staff to close the ticket', async () => {
  const channel = makeAdviceChannel(OPENER);
  const advice = await triage.postTriage(channel, { content: 'client: 1.21.10' });

  const staffVote = await tickets.handleTriageReaction(
    { emoji: { name: '👍' }, message: advice },
    { id: 'staff-1', bot: false }
  );
  assert.equal(staffVote, false);
  assert.equal(channel.sent.length, 1, 'a stranger must not trigger a close request');

  const vote = await tickets.handleTriageReaction(
    { emoji: { name: '👍' }, message: advice },
    { id: OPENER, bot: false }
  );
  assert.equal(vote, true);
  assert.equal(channel.sent.length, 2);
  assert.equal(channel.sent[1].embeds[0].data.title, 'Close request');
  assert.equal(channel.sent[1].components[0].components.length, 2);
});

test('a thumb down asks what still fails', async () => {
  const channel = makeAdviceChannel(OPENER);
  const advice = await triage.postTriage(channel, { content: 'client: 1.21.10' });

  const vote = await tickets.handleTriageReaction(
    { emoji: { name: '👎' }, message: advice },
    { id: OPENER, bot: false }
  );
  assert.equal(vote, true);
  assert.equal(channel.sent.length, 2);
  assert.match(channel.sent[1].content, /what exactly went wrong/i);
});

test('/close asks staff for the opener and /close-request posts the request', async () => {
  const channel = makeAdviceChannel(OPENER);
  const interaction = makeCommandInteraction(channel, { opener: OPENER });

  await closeCommand.execute(interaction);
  assert.match(interaction.replies[0].content, /close request has been sent/i);
  assert.equal(channel.sent[0].embeds[0].data.title, 'Close request');

  const requestChannel = makeAdviceChannel(OPENER);
  const request = makeCommandInteraction(requestChannel, { opener: OPENER, options: { reason: 'Solved' } });
  await closeRequestCommand.execute(request);
  assert.equal(requestChannel.sent[0].embeds[0].data.fields[0].value, 'Solved');
});

test('/close refuses a channel that is not a ticket', async () => {
  const reply = [];
  const interaction = {
    guild: { id: 'guild' },
    channel: { id: 'general', topic: null, send: async () => ({}) },
    member: { permissions: { has: () => true }, roles: { cache: [] } },
    user: { id: 'someone' },
    options: { getString: () => null },
    reply: async (payload) => reply.push(payload.content),
  };

  await closeCommand.execute(interaction);
  assert.match(reply[0], /not a ticket/i);
});

test('a new forum post with an old client version is answered once', async () => {
  const channel = {
    id: 'post-1',
    isThread: () => true,
    parent: { type: ChannelType.GuildForum },
    sent: [],
    send: async (payload) => {
      channel.sent.push(payload);
      return { id: 'advice', reacted: [], react: async () => {}, embeds: payload.embeds };
    },
  };
  const post = {
    id: 'post-1',
    guild: { id: 'guild' },
    channel,
    author: { id: 'member-1', bot: false },
    system: false,
    webhookId: null,
    content: 'client version: 1.20.4, the menu does not open',
  };

  assert.equal(await tickets.handleForumTriage(post), true);
  assert.equal(channel.sent.length, 1);

  // A reply inside the post is not the opening post, so it gets no second advice.
  assert.equal(await tickets.handleForumTriage({ ...post, id: 'post-2' }), false);
  assert.equal(channel.sent.length, 1);
});
