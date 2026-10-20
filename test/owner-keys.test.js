// Run with: npm test   (node --test)
// Covers the owner-only commands: /key (license keys) and /manage, plus their helpers.
const fs = require('fs');
const os = require('os');
const path = require('path');

// The settings store reads DATA_DIR when it is loaded, so point it at a temp folder first.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'champ-bot-owner-test-'));

const test = require('node:test');
const assert = require('node:assert/strict');

const { isOwner } = require('../src/utils/permissions');
const { canUseCommand, accessDeniedMessage } = require('../src/utils/commandAccess');
const licensing = require('../src/utils/licensing');
const manage = require('../src/commands/manage');
const { loadCommands } = require('../src/utils/loadCommands');

function roleMember(names, { id = 'user-1', guildOwnerId = 'guild-owner', admin = false } = {}) {
  return {
    id,
    guild: { ownerId: guildOwnerId },
    permissions: { has: () => admin },
    roles: { cache: names.map((name) => ({ name })) },
  };
}

test('only the owner role (or the Discord server owner) counts as owner', () => {
  assert.equal(isOwner(roleMember(['Owner'])), true);
  assert.equal(isOwner(roleMember(['owner', 'support'])), true);
  assert.equal(isOwner(roleMember(['support', 'developer'], { admin: true })), false);
  assert.equal(isOwner(roleMember([], { id: 'guild-owner' })), true);
  assert.equal(isOwner(null), false);
});

test('a command with access owner is refused for everyone else', () => {
  const command = { access: 'owner' };
  assert.equal(canUseCommand(command, roleMember(['owner'])), true);
  assert.equal(canUseCommand(command, roleMember(['support'], { admin: true })), false);
  assert.equal(canUseCommand({}, roleMember([])), true, 'commands without access stay open');
  assert.match(accessDeniedMessage(command), /owner/);
});

test('the key, manage and setup commands are owner-only, ticket commands are not', () => {
  const commands = loadCommands();
  const ownerOnly = commands.filter((command) => command.access === 'owner').map((c) => c.data.name);

  for (const name of [
    'key',
    'manage',
    'setup-server',
    'setup-server-delete',
    'setup-roles',
    'setup-roles-delete',
    'setup-permissions',
    'setup-verify',
    'setup-verify-gate',
    'server-setup-chanel-create',
    'botmessage',
    'setrole',
    'ticket-actions',
    'ticket-panel',
    'ticket-panels',
    'ticket-category',
    'ai-start',
    'ai-stop',
  ]) {
    assert.ok(ownerOnly.includes(name), `${name} is not owner-only`);
  }

  for (const name of ['close', 'close-request', 'verify', 'review']) {
    assert.ok(!ownerOnly.includes(name), `${name} must stay available to staff or members`);
  }
});

test('license keys use the CHAMP-XXXX-XXXX-XXXX-XXXX shape the website accepts', () => {
  const bytes = [0x1a, 0x2b, 0x3c, 0x4d, 0x5e, 0x6f, 0x7a, 0x8b];
  let index = 0;
  const randomBytes = () => Buffer.from([bytes[index++], bytes[index++]]);

  const key = licensing.newLicenseKey(randomBytes);
  assert.equal(key, 'CHAMP-1A2B-3C4D-5E6F-7A8B');
  assert.equal(licensing.isLicenseKey(key), true);
  // A pasted lowercase key with spaces around it is accepted too.
  assert.equal(licensing.isLicenseKey(` ${key.toLowerCase()} `), true);
  assert.equal(licensing.isLicenseKey('CHAMP-123'), false);
  assert.equal(licensing.normalizeKey(' champ-1a2b-3c4d-5e6f-7a8b '), key);
});

test('an unredeemed key gets a placeholder email that is recognised again', () => {
  const email = licensing.unassignedEmail('champ-1a2b-3c4d-5e6f-7a8b');
  assert.equal(email, 'unassigned+champ-1a2b-3c4d-5e6f-7a8b@keys.champclient.local');
  assert.equal(licensing.isUnassignedEmail(email), true);
  assert.equal(licensing.isUnassignedEmail('customer@example.com'), false);
});

test('monthly keys expire in 30 days, lifetime keys never expire', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  assert.equal(licensing.expiryFor('monthly', undefined, now).toISOString(), '2026-01-31T00:00:00.000Z');
  assert.equal(licensing.expiryFor('lifetime', undefined, now), null);
  assert.equal(licensing.expiryFor('lifetime', 7, now).toISOString(), '2026-01-08T00:00:00.000Z');
  assert.equal(licensing.expiryFor('monthly', 2, now).toISOString(), '2026-01-03T00:00:00.000Z');
});

test('a license is only active while its status is active and it has not expired', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  assert.equal(licensing.licenseActive({ status: 'active', expires_at: null }, now), true);
  assert.equal(licensing.licenseActive({ status: 'active', expires_at: '2026-07-01T00:00:00Z' }, now), true);
  assert.equal(licensing.licenseActive({ status: 'active', expires_at: '2026-05-01T00:00:00Z' }, now), false);
  assert.equal(licensing.licenseActive({ status: 'revoked', expires_at: null }, now), false);
  assert.equal(licensing.licenseActive(null, now), false);
});

test('/manage turns short permission names into Discord permission flags', () => {
  const parsed = manage.parsePermissionList('view, send,attach,nope');
  assert.deepEqual(parsed.flags, { ViewChannel: true, SendMessages: true, AttachFiles: true });
  assert.deepEqual(parsed.unknown, ['nope']);

  // Discord's own camelCase names work too.
  assert.deepEqual(manage.parsePermissionList('ManageMessages').flags, { ManageMessages: true });
  assert.deepEqual(manage.parsePermissionList('').flags, {});
});

test('/manage accepts hex colours and rejects nonsense', () => {
  assert.equal(manage.parseColor('#9b59b6'), 0x9b59b6);
  assert.equal(manage.parseColor('9B59B6'), 0x9b59b6);
  assert.equal(manage.parseColor('#abc'), 0xaabbcc);
  assert.equal(manage.parseColor('random'), 'Random');
  assert.equal(manage.parseColor(''), null);
  assert.equal(Number.isNaN(manage.parseColor('purple!')), true);
  assert.equal(manage.channelSlug('Bug Reports!'), 'bug-reports');
});

// A tiny stand-in for the Supabase client, enough for the queries licensing.js makes.
function makeFakeSupabase(initialRows = []) {
  const rows = initialRows.map((row) => ({ status: 'active', ...row }));
  let nextId = rows.length + 1;

  function chain() {
    let matches = () => true;
    let mode = 'select';
    let payload = null;

    const api = {
      select() {
        return api;
      },
      eq(column, value) {
        const previous = matches;
        matches = (row) => previous(row) && String(row[column]) === String(value);
        return api;
      },
      ilike(column, pattern) {
        const needle = String(pattern).replace(/%/g, '').toLowerCase();
        const previous = matches;
        matches = (row) => previous(row) && String(row[column] ?? '').toLowerCase().includes(needle);
        return api;
      },
      limit() {
        return api;
      },
      order() {
        return api;
      },
      insert(row) {
        mode = 'insert';
        payload = row;
        return api;
      },
      update(values) {
        mode = 'update';
        payload = values;
        return api;
      },
      delete() {
        mode = 'delete';
        return api;
      },
      maybeSingle() {
        return settle(true);
      },
      single() {
        return settle(true);
      },
      then(resolve, reject) {
        return settle(false).then(resolve, reject);
      },
    };

    async function settle(single) {
      if (mode === 'insert') {
        const row = { id: nextId++, created_at: new Date().toISOString(), ...payload };
        rows.push(row);
        return { data: single ? row : [row], error: null };
      }
      if (mode === 'update') {
        const hit = rows.filter(matches);
        hit.forEach((row) => Object.assign(row, payload));
        return { data: single ? (hit[0] ?? null) : hit, error: null };
      }
      if (mode === 'delete') {
        const hit = rows.filter(matches);
        hit.forEach((row) => rows.splice(rows.indexOf(row), 1));
        return { data: single ? (hit[0] ?? null) : hit, error: null };
      }
      const hit = rows.filter(matches).reverse();
      return { data: single ? (hit[0] ?? null) : hit, error: null };
    }

    return api;
  }

  return { from: () => chain(), rows };
}

// /key reads its client from utils/supabase, so the module is stubbed before loading it.
function loadKeyCommand(supabase) {
  const supabasePath = require.resolve('../src/utils/supabase');
  const previous = require.cache[supabasePath];
  require.cache[supabasePath] = {
    id: supabasePath,
    filename: supabasePath,
    loaded: true,
    exports: { getSupabase: () => supabase },
  };
  delete require.cache[require.resolve('../src/commands/key')];
  const command = require('../src/commands/key');
  if (previous) require.cache[supabasePath] = previous;
  else delete require.cache[supabasePath];
  return command;
}

function makeKeyInteraction({
  subcommand,
  strings = {},
  integers = {},
  booleans = {},
  member = roleMember(['owner']),
  user = { tag: 'owner#0001', id: 'owner-1' },
} = {}) {
  const captured = { replies: [], edits: [] };
  return {
    guild: { id: 'guild' },
    member,
    user,
    captured,
    options: {
      getSubcommand: () => subcommand,
      getString: (name) => strings[name] ?? null,
      getInteger: (name) => integers[name] ?? null,
      getBoolean: (name) => booleans[name] ?? null,
    },
    deferReply: async () => {},
    editReply: async (payload) => {
      captured.edits.push(payload);
      return payload;
    },
    reply: async (payload) => {
      captured.replies.push(payload);
      return payload;
    },
  };
}

test('/key generate writes unredeemed monthly keys that expire in a month', async () => {
  const supabase = makeFakeSupabase();
  const keyCommand = loadKeyCommand(supabase);

  const interaction = makeKeyInteraction({
    subcommand: 'generate',
    strings: { plan: 'monthly' },
    integers: { amount: 2 },
  });
  await keyCommand.execute(interaction);

  assert.equal(supabase.rows.length, 2);
  for (const row of supabase.rows) {
    assert.match(row.license_key, /^CHAMP-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    assert.equal(row.plan_type, 'monthly');
    assert.equal(row.status, 'active');
    assert.equal(licensing.isUnassignedEmail(row.email), true);
    const days = (new Date(row.expires_at) - Date.now()) / (24 * 60 * 60 * 1000);
    assert.ok(days > 29 && days < 31, `expiry is ${days} days away`);
  }

  const embed = interaction.captured.edits[0].embeds[0];
  assert.match(embed.data.description, new RegExp(supabase.rows[0].license_key));
});

test('/key generate links an email to the key and reuses the existing one', async () => {
  const supabase = makeFakeSupabase([
    {
      id: 1,
      email: 'customer@example.com',
      plan_type: 'lifetime',
      license_key: 'CHAMP-AAAA-BBBB-CCCC-DDDD',
      status: 'revoked',
    },
  ]);
  const keyCommand = loadKeyCommand(supabase);

  const interaction = makeKeyInteraction({
    subcommand: 'generate',
    strings: { plan: 'lifetime', email: 'Customer@Example.com' },
  });
  await keyCommand.execute(interaction);

  assert.equal(supabase.rows.length, 1, 'no second row for the same email and plan');
  assert.equal(supabase.rows[0].license_key, 'CHAMP-AAAA-BBBB-CCCC-DDDD');
  assert.equal(supabase.rows[0].status, 'active');
  assert.equal(supabase.rows[0].expires_at, null);
});

test('/key revoke, restore and delete only touch the named key', async () => {
  const supabase = makeFakeSupabase([
    { id: 1, email: 'a@example.com', plan_type: 'monthly', license_key: 'CHAMP-AAAA-BBBB-CCCC-DDDD' },
    { id: 2, email: 'b@example.com', plan_type: 'monthly', license_key: 'CHAMP-1111-2222-3333-4444' },
  ]);
  const keyCommand = loadKeyCommand(supabase);

  await keyCommand.execute(
    makeKeyInteraction({ subcommand: 'revoke', strings: { key: 'champ-aaaa-bbbb-cccc-dddd' } })
  );
  assert.equal(supabase.rows[0].status, 'revoked');
  assert.equal(supabase.rows[1].status, 'active');

  await keyCommand.execute(
    makeKeyInteraction({ subcommand: 'restore', strings: { key: 'CHAMP-AAAA-BBBB-CCCC-DDDD' } })
  );
  assert.equal(supabase.rows[0].status, 'active');

  await keyCommand.execute(
    makeKeyInteraction({
      subcommand: 'delete',
      strings: { key: 'CHAMP-AAAA-BBBB-CCCC-DDDD' },
      booleans: { confirm: false },
    })
  );
  assert.equal(supabase.rows.length, 2, 'nothing is deleted without confirm: true');

  await keyCommand.execute(
    makeKeyInteraction({
      subcommand: 'delete',
      strings: { key: 'CHAMP-AAAA-BBBB-CCCC-DDDD' },
      booleans: { confirm: true },
    })
  );
  assert.deepEqual(supabase.rows.map((row) => row.license_key), ['CHAMP-1111-2222-3333-4444']);
});

test('/key answers a key it does not know instead of failing on the deferred reply', async () => {
  const supabase = makeFakeSupabase();
  const keyCommand = loadKeyCommand(supabase);

  const interaction = makeKeyInteraction({
    subcommand: 'revoke',
    strings: { key: 'CHAMP-9999-8888-7777-6666' },
  });
  await keyCommand.execute(interaction);

  assert.equal(interaction.captured.edits.length, 1);
  assert.match(interaction.captured.edits[0].content, /No license found/);
  assert.equal(interaction.captured.replies.length, 0, 'a deferred interaction is edited, never replied to');
});

test('/key and /manage refuse a member without the owner role', async () => {
  const supabase = makeFakeSupabase();
  const keyCommand = loadKeyCommand(supabase);

  const keyInteraction = makeKeyInteraction({
    subcommand: 'generate',
    strings: { plan: 'lifetime' },
    member: roleMember(['support'], { admin: true }),
  });
  await keyCommand.execute(keyInteraction);
  assert.equal(supabase.rows.length, 0);
  assert.match(keyInteraction.captured.replies[0].content, /owner/);

  const manageInteraction = {
    guild: { id: 'guild' },
    member: roleMember(['support'], { admin: true }),
    options: { getSubcommand: () => 'category-create', getString: () => 'Testing' },
    deferReply: async () => {
      throw new Error('the command should be refused before it defers');
    },
    reply: async (payload) => payload,
  };
  const payload = await manage.execute(manageInteraction);
  assert.match(payload.content, /owner/);
});
