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
const { Collection, PermissionFlagsBits } = require('discord.js');

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
  for (const expected of ['learn', 'setrole', 'ticket-actions', 'ai-stop', 'ai-start']) {
    assert.ok(names.includes(expected), `${expected} is missing`);
  }
});
