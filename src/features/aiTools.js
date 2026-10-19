const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { baseChannelName, findRole, normalizeName } = require('../utils/permissions');
const { isTrustedUser } = require('../utils/trustedUsers');
const {
  MAX_CATEGORIES,
  MAX_QUESTIONS,
  MAX_QUESTION_LENGTH,
  MAX_MESSAGE_LENGTH,
  BUTTON_COLORS,
  DEFAULT_BUTTON_COLOR,
  isValidEmoji,
  loadCategories,
  saveCategories,
  slugify,
} = require('../utils/ticketCategories');
const {
  DEFAULT_PANEL_ID,
  describePanels,
  getPanel,
  savePanel,
} = require('../utils/ticketPanels');
const { postPanel } = require('../commands/ticket-panel');

const TEXT_CHANNELS = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
];

const CHANNEL_TYPES = {
  text: ChannelType.GuildText,
  announcement: ChannelType.GuildAnnouncement,
  voice: ChannelType.GuildVoice,
  forum: ChannelType.GuildForum,
  category: ChannelType.GuildCategory,
  stage: ChannelType.GuildStageVoice,
};

const MAX_PURGE = 100;
const MAX_TIMEOUT_MINUTES = 28 * 24 * 60;
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

// Tools the assistant may call, but only for a trusted user. They are plain JSON so any
// OpenAI-compatible endpoint can use them. The destructive tools really execute: there is
// no confirmation step, because the trusted user asked for exactly that.
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'send_message',
      description: 'Send a message as the bot to a channel in this server.',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'Channel name, mention or ID.' },
          content: { type: 'string', description: 'The message text, at most 2000 characters.' },
          allow_mentions: {
            type: 'boolean',
            description: 'Parse @everyone/@here and role/user mentions. Defaults to false.',
          },
        },
        required: ['channel', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_messages',
      description: 'Read the most recent messages in a channel, with their IDs, to find something to delete.',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'Channel name, mention or ID.' },
          limit: { type: 'integer', description: 'How many messages, 1-50. Defaults to 15.' },
          contains: { type: 'string', description: 'Only messages containing this text.' },
          user: { type: 'string', description: 'Only messages from this member.' },
        },
        required: ['channel'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_message',
      description: 'Delete one message by its ID.',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'Channel name, mention or ID.' },
          message_id: { type: 'string', description: 'The message ID to delete.' },
        },
        required: ['channel', 'message_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'purge_messages',
      description: 'Delete many recent messages in a channel, optionally only from one member or containing text.',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'Channel name, mention or ID.' },
          count: { type: 'integer', description: `How many recent messages to inspect, 1-${MAX_PURGE}.` },
          user: { type: 'string', description: 'Only delete messages from this member.' },
          contains: { type: 'string', description: 'Only delete messages containing this text.' },
        },
        required: ['channel', 'count'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_channel',
      description: 'Create a channel or category.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Channel name.' },
          type: {
            type: 'string',
            enum: Object.keys(CHANNEL_TYPES),
            description: 'Defaults to text.',
          },
          category: { type: 'string', description: 'Category name or ID to put the channel in.' },
          topic: { type: 'string', description: 'Optional channel topic.' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_channel',
      description: 'Delete a channel or category with everything in it. This cannot be undone.',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'Channel/category name, mention or ID.' },
          reason: { type: 'string', description: 'Optional audit-log reason.' },
        },
        required: ['channel'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_channel',
      description: 'Rename a channel, change its topic, slowmode, NSFW flag or category.',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'Channel name, mention or ID.' },
          name: { type: 'string', description: 'New name.' },
          topic: { type: 'string', description: 'New topic.' },
          slowmode_seconds: { type: 'integer', description: 'Slowmode in seconds, 0-21600.' },
          nsfw: { type: 'boolean', description: 'NSFW flag.' },
          category: { type: 'string', description: 'Move to this category name or ID.' },
        },
        required: ['channel'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'lock_channel',
      description: 'Lock or unlock a channel for @everyone (deny or restore Send Messages).',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'Channel name, mention or ID.' },
          locked: { type: 'boolean', description: 'true locks, false unlocks. Defaults to true.' },
        },
        required: ['channel'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_role',
      description: 'Create a role.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Role name.' },
          color: { type: 'string', description: 'Hex colour such as #ff4d5e, or "none".' },
          hoist: { type: 'boolean', description: 'Show separately in the member list.' },
          mentionable: { type: 'boolean', description: 'Allow everyone to mention the role.' },
          permissions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Permission names, e.g. ["ManageMessages", "KickMembers"].',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_role',
      description: 'Delete a role. Members lose it. This cannot be undone.',
      parameters: {
        type: 'object',
        properties: { role: { type: 'string', description: 'Role name, mention or ID.' } },
        required: ['role'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_role',
      description: 'Rename a role or change its colour, hoist or mentionable flag.',
      parameters: {
        type: 'object',
        properties: {
          role: { type: 'string', description: 'Role name, mention or ID.' },
          name: { type: 'string', description: 'New name.' },
          color: { type: 'string', description: 'Hex colour, or "none".' },
          hoist: { type: 'boolean' },
          mentionable: { type: 'boolean' },
        },
        required: ['role'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_role',
      description: 'Give a role to a member.',
      parameters: {
        type: 'object',
        properties: {
          member: { type: 'string', description: 'Member username, mention or ID.' },
          role: { type: 'string', description: 'Role name, mention or ID.' },
        },
        required: ['member', 'role'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_role',
      description: 'Take a role away from a member.',
      parameters: {
        type: 'object',
        properties: {
          member: { type: 'string', description: 'Member username, mention or ID.' },
          role: { type: 'string', description: 'Role name, mention or ID.' },
        },
        required: ['member', 'role'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kick_member',
      description: 'Kick a member from the server.',
      parameters: {
        type: 'object',
        properties: {
          member: { type: 'string', description: 'Member username, mention or ID.' },
          reason: { type: 'string', description: 'Audit-log reason.' },
        },
        required: ['member'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ban_member',
      description: 'Ban a member from the server, optionally deleting their recent messages.',
      parameters: {
        type: 'object',
        properties: {
          member: { type: 'string', description: 'Member username, mention or ID.' },
          reason: { type: 'string', description: 'Audit-log reason.' },
          delete_message_days: {
            type: 'integer',
            description: 'Delete this many days of their messages, 0-7. Defaults to 0.',
          },
        },
        required: ['member'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'unban_member',
      description: 'Remove a ban by user ID, username or mention.',
      parameters: {
        type: 'object',
        properties: {
          user: { type: 'string', description: 'User ID, mention or username.' },
          reason: { type: 'string', description: 'Audit-log reason.' },
        },
        required: ['user'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'timeout_member',
      description: 'Timeout a member so they cannot talk, up to 28 days.',
      parameters: {
        type: 'object',
        properties: {
          member: { type: 'string', description: 'Member username, mention or ID.' },
          minutes: { type: 'integer', description: `Timeout length in minutes, 1-${MAX_TIMEOUT_MINUTES}.` },
          reason: { type: 'string', description: 'Audit-log reason.' },
        },
        required: ['member', 'minutes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clear_timeout',
      description: 'Remove an active timeout from a member.',
      parameters: {
        type: 'object',
        properties: { member: { type: 'string', description: 'Member username, mention or ID.' } },
        required: ['member'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_invite',
      description: 'Create an invite link for a channel.',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'Channel name, mention or ID.' },
          max_age_seconds: { type: 'integer', description: '0 = never expires. Defaults to 86400.' },
          max_uses: { type: 'integer', description: '0 = unlimited. Defaults to 0.' },
        },
        required: ['channel'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_channels',
      description: 'List every channel and category with its ID and type.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_roles',
      description: 'List every role with its ID, colour and position.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_members',
      description: 'List members, optionally filtered by a search term.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Part of a username, display name or ID.' },
          limit: { type: 'integer', description: '1-100, defaults to 25.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_ticket_options',
      description: 'List the ticket categories with their ID, emoji, colour and form questions.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_ticket_panels',
      description: 'List every saved ticket panel with its ID, title and categories.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_ticket_panel',
      description: 'Create or update a saved ticket panel with its own title, text and categories.',
      parameters: {
        type: 'object',
        properties: {
          panel: { type: 'string', description: 'Panel name/ID, for example media.' },
          title: { type: 'string', description: 'Panel title.' },
          description: { type: 'string', description: 'Text above the buttons.' },
          categories: {
            type: 'array',
            items: { type: 'string' },
            description: 'Category IDs or labels. Omit for every category.',
          },
        },
        required: ['panel', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_ticket_option',
      description: 'Add a category button to the ticket system.',
      parameters: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'Name shown on the panel button.' },
          description: { type: 'string', description: 'Short description of the category.' },
          emoji: { type: 'string', description: 'Optional real emoji for the button.' },
          color: { type: 'string', enum: BUTTON_COLORS, description: 'Button colour.' },
        },
        required: ['label'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_ticket_option',
      description: 'Change a ticket option: label, description, emoji, colour, welcome message or questions.',
      parameters: {
        type: 'object',
        properties: {
          option: { type: 'string', description: 'Category ID or label.' },
          label: { type: 'string' },
          description: { type: 'string' },
          emoji: { type: 'string', description: 'New emoji, or an empty string to remove it.' },
          color: { type: 'string', enum: BUTTON_COLORS },
          welcome_message: { type: 'string', description: 'New welcome text, or empty to use the default.' },
          add_question: { type: 'string', description: `Question to add (max ${MAX_QUESTION_LENGTH} chars).` },
          remove_question: { type: 'integer', description: 'Question number to remove, starting at 1.' },
        },
        required: ['option'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_ticket_option',
      description: 'Remove a category from the ticket system. At least one category must remain.',
      parameters: {
        type: 'object',
        properties: { option: { type: 'string', description: 'Category ID or label.' } },
        required: ['option'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'post_ticket_panel',
      description: 'Post a saved ticket panel with its buttons in a channel.',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'Channel name, mention or ID. Defaults to this channel.' },
          panel: { type: 'string', description: `Saved panel name/ID. Defaults to ${DEFAULT_PANEL_ID}.` },
        },
      },
    },
  },
];

function clean(value) {
  return String(value ?? '').trim();
}

function truncate(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function resolveGuildChannel(guild, value) {
  const wanted = clean(value);
  if (!wanted) return null;

  const mention = /^<#(\d+)>$/.exec(wanted);
  const id = mention ? mention[1] : /^\d{15,25}$/.test(wanted) ? wanted : null;
  if (id) return guild.channels.cache.get(id) ?? null;

  const name = normalizeName(wanted.replace(/^#/, ''));
  return (
    guild.channels.cache.find((channel) => normalizeName(channel.name) === name) ??
    guild.channels.cache.find((channel) => normalizeName(baseChannelName(channel.name)) === name) ??
    null
  );
}

function resolveTextChannel(guild, value) {
  const channel = resolveGuildChannel(guild, value);
  return channel && TEXT_CHANNELS.includes(channel.type) ? channel : null;
}

function channelError(guild, value) {
  const names = guild.channels.cache
    .filter((channel) => TEXT_CHANNELS.includes(channel.type))
    .map((channel) => `#${baseChannelName(channel.name)}`)
    .slice(0, 40)
    .join(', ');
  return `No text channel matches "${clean(value)}". Available: ${names}.`;
}

async function resolveMember(guild, value) {
  const wanted = clean(value);
  if (!wanted) return null;

  const mention = /^<@!?(\d+)>$/.exec(wanted);
  const id = mention ? mention[1] : /^\d{15,25}$/.test(wanted) ? wanted : null;
  if (id) {
    return guild.members.cache.get(id) ?? (await guild.members.fetch(id).catch(() => null));
  }

  const name = normalizeName(wanted.replace(/^@/, ''));
  const cached = guild.members.cache.find(
    (member) =>
      normalizeName(member.user.username) === name ||
      normalizeName(member.displayName) === name ||
      normalizeName(member.user.tag) === name ||
      member.user.id === wanted
  );
  if (cached) return cached;

  // Partial matches, for "sora" instead of the full username.
  const results = await guild.members
    .fetch({ query: wanted, limit: 10 })
    .catch(() => null);
  if (!results) return null;
  return (
    results.find((member) => normalizeName(member.user.username) === name) ??
    results.find((member) => normalizeName(member.displayName) === name) ??
    results.first() ??
    null
  );
}

function resolveRole(guild, value) {
  const wanted = clean(value);
  if (!wanted) return null;
  const mention = /^<@&(\d+)>$/.exec(wanted);
  const id = mention ? mention[1] : /^\d{15,25}$/.test(wanted) ? wanted : null;
  if (id) return guild.roles.cache.get(id) ?? null;
  return findRole(guild, wanted.replace(/^@/, ''));
}

async function resolveUser(client, guild, value) {
  const wanted = clean(value);
  if (!wanted) return null;
  const mention = /^<@!?(\d+)>$/.exec(wanted);
  const id = mention ? mention[1] : /^\d{15,25}$/.test(wanted) ? wanted : null;
  if (id) return client.users.cache.get(id) ?? (await client.users.fetch(id).catch(() => null));

  const member = await resolveMember(guild, value);
  return member ? member.user : null;
}

function botMember(guild) {
  return guild.members.me ?? null;
}

function requirePermission(guild, flag, label) {
  const me = botMember(guild);
  if (!me) throw new Error('I cannot find my own server member. Re-add the bot.');
  if (!me.permissions.has(flag)) throw new Error(`I need the "${label}" permission for that.`);
}

function actorReason(message, reason, action) {
  return `Champ AI: ${message.author.tag} (${message.author.id}) ${action}${reason ? `: ${reason}` : ''}`;
}

function memberLabel(member) {
  return member ? `${member.user.tag} (${member.id})` : 'unknown member';
}

function channelLabel(channel) {
  return `#${baseChannelName(channel.name)} (${channel.id})`;
}

async function sendMessage(message, args) {
  const channel = resolveTextChannel(message.guild, args.channel);
  if (!channel) return { text: channelError(message.guild, args.channel) };

  const content = clean(args.content);
  if (!content) return { text: 'The message text is empty.' };
  if (content.length > 2000) {
    return { text: `The message is ${content.length} characters; Discord allows at most 2000.` };
  }

  await channel.send({
    content,
    allowedMentions: args.allow_mentions ? { parse: ['everyone', 'roles', 'users'] } : { parse: [] },
  });
  return {
    text: `Message sent in ${channelLabel(channel)}.`,
    summary: `sent a message in ${channelLabel(channel)}`,
  };
}

async function readMessages(message, args) {
  const channel = resolveTextChannel(message.guild, args.channel);
  if (!channel) return { text: channelError(message.guild, args.channel) };

  const limit = Math.min(Math.max(Number(args.limit) || 15, 1), 50);
  const fetched = await channel.messages.fetch({ limit });
  let messages = [...fetched.values()];

  if (args.user) {
    const member = await resolveMember(message.guild, args.user);
    if (!member) return { text: `No member matches "${clean(args.user)}".` };
    messages = messages.filter((entry) => entry.author.id === member.id);
  }
  if (args.contains) {
    const needle = clean(args.contains).toLowerCase();
    messages = messages.filter((entry) => entry.content.toLowerCase().includes(needle));
  }

  if (messages.length === 0) return { text: 'No messages matched.' };

  const lines = messages.map(
    (entry) =>
      `${entry.id} | ${entry.author.tag} | ${new Date(entry.createdTimestamp).toISOString()} | ${truncate(
        entry.content.replace(/\s+/g, ' '),
        160
      ) || '[no text]'}`
  );
  return { text: `Recent messages in ${channelLabel(channel)} (newest first):\n${lines.join('\n')}` };
}

async function deleteMessage(message, args) {
  const channel = resolveTextChannel(message.guild, args.channel);
  if (!channel) return { text: channelError(message.guild, args.channel) };

  const id = clean(args.message_id);
  const target = await channel.messages.fetch(id).catch(() => null);
  if (!target) return { text: `No message with ID ${id} exists in ${channelLabel(channel)}.` };

  await target.delete(actorReason(message, null, 'deleted a message'));
  return {
    text: `Deleted message ${id} in ${channelLabel(channel)}.`,
    summary: `deleted message ${id} in ${channelLabel(channel)}`,
  };
}

async function purgeMessages(message, args) {
  const channel = resolveTextChannel(message.guild, args.channel);
  if (!channel) return { text: channelError(message.guild, args.channel) };

  requirePermission(message.guild, PermissionFlagsBits.ManageMessages, 'Manage Messages');

  const count = Math.min(Math.max(Number(args.count) || 10, 1), MAX_PURGE);
  const fetched = await channel.messages.fetch({ limit: Math.min(Math.max(count * 3, count), MAX_PURGE) });
  let messages = [...fetched.values()].filter((entry) => !entry.pinned);

  if (args.user) {
    const member = await resolveMember(message.guild, args.user);
    if (!member) return { text: `No member matches "${clean(args.user)}".` };
    messages = messages.filter((entry) => entry.author.id === member.id);
  }
  if (args.contains) {
    const needle = clean(args.contains).toLowerCase();
    messages = messages.filter((entry) => entry.content.toLowerCase().includes(needle));
  }

  messages = messages.slice(0, count);
  if (messages.length === 0) return { text: 'No messages matched, nothing was deleted.' };

  const recent = messages.filter((entry) => Date.now() - entry.createdTimestamp < TWO_WEEKS_MS);
  const old = messages.filter((entry) => Date.now() - entry.createdTimestamp >= TWO_WEEKS_MS);

  let deleted = 0;
  if (recent.length === 1) {
    await recent[0].delete().then(() => (deleted += 1)).catch(() => {});
  } else if (recent.length > 1) {
    const result = await channel.bulkDelete(recent, true).catch(() => null);
    deleted += result?.size ?? 0;
  }
  for (const entry of old) {
    await entry.delete().then(() => (deleted += 1)).catch(() => {});
  }

  return {
    text: `Deleted ${deleted} of ${messages.length} matching message(s) in ${channelLabel(channel)} (messages older than 14 days are deleted one by one).`,
    summary: `deleted ${deleted} message(s) in ${channelLabel(channel)}`,
  };
}

async function createChannel(message, args) {
  const guild = message.guild;
  const name = clean(args.name);
  if (!name) return { text: 'A channel name is required.' };

  const typeName = clean(args.type).toLowerCase() || 'text';
  const type = CHANNEL_TYPES[typeName];
  if (type === undefined) return { text: `Unknown channel type. Use one of: ${Object.keys(CHANNEL_TYPES).join(', ')}.` };

  let parent;
  if (type !== ChannelType.GuildCategory && args.category) {
    const category = resolveGuildChannel(guild, args.category);
    if (!category || category.type !== ChannelType.GuildCategory) {
      return { text: `No category matches "${clean(args.category)}".` };
    }
    parent = category.id;
  }

  const channel = await guild.channels.create({
    name: truncate(name, 100),
    type,
    parent,
    topic: type === ChannelType.GuildText || type === ChannelType.GuildAnnouncement ? clean(args.topic) || undefined : undefined,
    reason: actorReason(message, null, `created ${typeName} channel ${name}`),
  });

  return {
    text: `Created ${typeName} ${channelLabel(channel)}.`,
    summary: `created ${typeName} ${channelLabel(channel)}`,
  };
}

async function deleteChannel(message, args) {
  const channel = resolveGuildChannel(message.guild, args.channel);
  if (!channel) return { text: `No channel or category matches "${clean(args.channel)}".` };
  if (channel.id === message.channel.id) {
    return {
      text: 'I cannot delete the channel we are talking in, because my reply would disappear. Run the command from another channel.',
    };
  }

  const label = channelLabel(channel);
  await channel.delete(
    actorReason(message, args.reason, `deleted ${channel.type === ChannelType.GuildCategory ? 'category' : 'channel'} ${label}`)
  );
  return { text: `Deleted ${label}.`, summary: `deleted ${label}` };
}

async function editChannel(message, args) {
  const channel = resolveGuildChannel(message.guild, args.channel);
  if (!channel) return { text: `No channel or category matches "${clean(args.channel)}".` };

  const changes = [];
  const payload = {};
  if (args.name !== undefined) {
    const name = clean(args.name);
    if (!name) return { text: 'The new name cannot be empty.' };
    payload.name = truncate(name, 100);
    changes.push('name');
  }
  if (args.topic !== undefined && TEXT_CHANNELS.includes(channel.type)) {
    payload.topic = truncate(clean(args.topic), 1024);
    changes.push('topic');
  }
  if (args.slowmode_seconds !== undefined && TEXT_CHANNELS.includes(channel.type)) {
    payload.rateLimitPerUser = Math.min(Math.max(Number(args.slowmode_seconds) || 0, 0), 21600);
    changes.push('slowmode');
  }
  if (args.nsfw !== undefined) {
    payload.nsfw = Boolean(args.nsfw);
    changes.push('nsfw');
  }
  if (args.category !== undefined && channel.type !== ChannelType.GuildCategory) {
    const category = resolveGuildChannel(message.guild, args.category);
    if (!category || category.type !== ChannelType.GuildCategory) {
      return { text: `No category matches "${clean(args.category)}".` };
    }
    payload.parent = category.id;
    changes.push(`category ${category.name}`);
  }

  if (changes.length === 0) return { text: 'No change was given (name, topic, slowmode_seconds, nsfw or category).' };

  await channel.edit({ ...payload, reason: actorReason(message, null, `edited ${channelLabel(channel)}`) });
  return {
    text: `Updated ${channelLabel(channel)}: ${changes.join(', ')}.`,
    summary: `updated ${channelLabel(channel)} (${changes.join(', ')})`,
  };
}

async function lockChannel(message, args) {
  const channel = resolveTextChannel(message.guild, args.channel);
  if (!channel) return { text: channelError(message.guild, args.channel) };

  const locked = args.locked === undefined ? true : Boolean(args.locked);
  requirePermission(message.guild, PermissionFlagsBits.ManageChannels, 'Manage Channels');
  await channel.permissionOverwrites.edit(
    message.guild.roles.everyone,
    { SendMessages: locked ? false : null },
    { reason: actorReason(message, null, `${locked ? 'locked' : 'unlocked'} ${channelLabel(channel)}`) }
  );

  return {
    text: `${locked ? 'Locked' : 'Unlocked'} ${channelLabel(channel)} for @everyone.`,
    summary: `${locked ? 'locked' : 'unlocked'} ${channelLabel(channel)}`,
  };
}

function parseColor(value) {
  const text = clean(value).toLowerCase();
  if (!text || text === 'none' || text === 'default') return null;
  const hex = text.replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/.test(hex)) return undefined;
  return Number.parseInt(hex, 16);
}

function parsePermissions(values) {
  if (!Array.isArray(values)) return { bits: [] };
  const bits = [];
  const unknown = [];
  for (const value of values) {
    if (PermissionFlagsBits[value] === undefined) unknown.push(value);
    else bits.push(PermissionFlagsBits[value]);
  }
  return { bits, unknown };
}

async function createRole(message, args) {
  const name = clean(args.name);
  if (!name) return { text: 'A role name is required.' };

  const color = parseColor(args.color);
  if (color === undefined) return { text: 'Use a hex colour such as #ff4d5e, or "none".' };
  const { bits, unknown } = parsePermissions(args.permissions);

  const role = await message.guild.roles.create({
    name: truncate(name, 100),
    color: color ?? undefined,
    hoist: Boolean(args.hoist),
    mentionable: Boolean(args.mentionable),
    permissions: bits,
    reason: actorReason(message, null, `created role ${name}`),
  });

  const warning = unknown.length ? ` Ignored unknown permissions: ${unknown.join(', ')}.` : '';
  return {
    text: `Created role ${role.name} (${role.id}).${warning}`,
    summary: `created role ${role.name}`,
  };
}

function assertRoleManageable(guild, role, action) {
  const me = botMember(guild);
  if (!me) throw new Error('I cannot find my own server member.');
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error(`I need the "Manage Roles" permission to ${action}.`);
  }
  if (role.id === guild.roles.everyone.id) {
    throw new Error('The @everyone role cannot be changed or deleted this way.');
  }
  if (role.managed) {
    throw new Error(`The "${role.name}" role is managed by an integration and cannot be changed.`);
  }
  if (role.position >= me.roles.highest.position) {
    throw new Error(`The "${role.name}" role is not below my own role, so I cannot ${action}.`);
  }
}

async function deleteRole(message, args) {
  const role = resolveRole(message.guild, args.role);
  if (!role) return { text: `No role matches "${clean(args.role)}".` };
  assertRoleManageable(message.guild, role, 'delete it');

  const name = role.name;
  await role.delete(actorReason(message, null, `deleted role ${name}`));
  return { text: `Deleted role ${name}.`, summary: `deleted role ${name}` };
}

async function editRole(message, args) {
  const role = resolveRole(message.guild, args.role);
  if (!role) return { text: `No role matches "${clean(args.role)}".` };
  assertRoleManageable(message.guild, role, 'edit it');

  const changes = [];
  const payload = {};
  if (args.name !== undefined) {
    const name = clean(args.name);
    if (!name) return { text: 'The new role name cannot be empty.' };
    payload.name = truncate(name, 100);
    changes.push('name');
  }
  if (args.color !== undefined) {
    const color = parseColor(args.color);
    if (color === undefined) return { text: 'Use a hex colour such as #ff4d5e, or "none".' };
    payload.color = color ?? null;
    changes.push('colour');
  }
  if (args.hoist !== undefined) {
    payload.hoist = Boolean(args.hoist);
    changes.push('hoist');
  }
  if (args.mentionable !== undefined) {
    payload.mentionable = Boolean(args.mentionable);
    changes.push('mentionable');
  }
  if (changes.length === 0) return { text: 'No change was given (name, color, hoist or mentionable).' };

  await role.edit({ ...payload, reason: actorReason(message, null, `edited role ${role.name}`) });
  return {
    text: `Updated role ${role.name}: ${changes.join(', ')}.`,
    summary: `updated role ${role.name} (${changes.join(', ')})`,
  };
}

async function addRole(message, args) {
  const member = await resolveMember(message.guild, args.member);
  if (!member) return { text: `No member matches "${clean(args.member)}".` };
  const role = resolveRole(message.guild, args.role);
  if (!role) return { text: `No role matches "${clean(args.role)}".` };
  assertRoleManageable(message.guild, role, 'assign it');

  await member.roles.add(role, actorReason(message, null, `added role ${role.name}`));
  return {
    text: `Gave ${role.name} to ${memberLabel(member)}.`,
    summary: `gave role ${role.name} to ${memberLabel(member)}`,
  };
}

async function removeRole(message, args) {
  const member = await resolveMember(message.guild, args.member);
  if (!member) return { text: `No member matches "${clean(args.member)}".` };
  const role = resolveRole(message.guild, args.role);
  if (!role) return { text: `No role matches "${clean(args.role)}".` };
  assertRoleManageable(message.guild, role, 'remove it');

  await member.roles.remove(role, actorReason(message, null, `removed role ${role.name}`));
  return {
    text: `Removed ${role.name} from ${memberLabel(member)}.`,
    summary: `removed role ${role.name} from ${memberLabel(member)}`,
  };
}

function assertNotOwnerOrBot(guild, member, action) {
  if (member.id === guild.ownerId) throw new Error('The server owner cannot be targeted by this action.');
  if (member.id === guild.client.user.id) throw new Error('I cannot target myself.');
}

async function kickMember(message, args) {
  const member = await resolveMember(message.guild, args.member);
  if (!member) return { text: `No member matches "${clean(args.member)}".` };
  assertNotOwnerOrBot(message.guild, member, 'kick');
  requirePermission(message.guild, PermissionFlagsBits.KickMembers, 'Kick Members');

  await member.kick(actorReason(message, args.reason, 'kicked a member'));
  return { text: `Kicked ${memberLabel(member)}.`, summary: `kicked ${memberLabel(member)}` };
}

async function banMember(message, args) {
  const member = await resolveMember(message.guild, args.member);
  const user = member?.user ?? (await resolveUser(message.client, message.guild, args.member));
  if (!user) return { text: `No user matches "${clean(args.member)}".` };
  if (user.id === message.guild.ownerId) throw new Error('The server owner cannot be banned.');
  if (user.id === message.client.user.id) throw new Error('I cannot ban myself.');
  requirePermission(message.guild, PermissionFlagsBits.BanMembers, 'Ban Members');

  const days = Math.min(Math.max(Number(args.delete_message_days) || 0, 0), 7);
  await message.guild.members.ban(user.id, {
    reason: actorReason(message, args.reason, 'banned a member'),
    deleteMessageSeconds: days * 24 * 60 * 60,
  });
  return {
    text: `Banned ${user.tag} (${user.id})${days ? ` and deleted ${days} day(s) of messages` : ''}.`,
    summary: `banned ${user.tag} (${user.id})`,
  };
}

async function unbanMember(message, args) {
  const user = await resolveUser(message.client, message.guild, args.user);
  if (!user) return { text: `No user matches "${clean(args.user)}".` };
  requirePermission(message.guild, PermissionFlagsBits.BanMembers, 'Ban Members');

  const ban = await message.guild.bans.fetch(user.id).catch(() => null);
  if (!ban) return { text: `${user.tag} (${user.id}) is not banned.` };

  await message.guild.bans.remove(user.id, actorReason(message, args.reason, 'unbanned a user'));
  return { text: `Unbanned ${user.tag} (${user.id}).`, summary: `unbanned ${user.tag} (${user.id})` };
}

async function timeoutMember(message, args) {
  const member = await resolveMember(message.guild, args.member);
  if (!member) return { text: `No member matches "${clean(args.member)}".` };
  assertNotOwnerOrBot(message.guild, member, 'timeout');
  requirePermission(message.guild, PermissionFlagsBits.ModerateMembers, 'Moderate Members');

  const minutes = Math.min(Math.max(Number(args.minutes) || 0, 1), MAX_TIMEOUT_MINUTES);
  await member.timeout(minutes * 60 * 1000, actorReason(message, args.reason, 'timed out a member'));
  return {
    text: `Timed out ${memberLabel(member)} for ${minutes} minute(s).`,
    summary: `timed out ${memberLabel(member)} for ${minutes} minute(s)`,
  };
}

async function clearTimeout(message, args) {
  const member = await resolveMember(message.guild, args.member);
  if (!member) return { text: `No member matches "${clean(args.member)}".` };
  requirePermission(message.guild, PermissionFlagsBits.ModerateMembers, 'Moderate Members');

  await member.timeout(null, actorReason(message, null, 'cleared a timeout'));
  return { text: `Cleared the timeout of ${memberLabel(member)}.`, summary: `cleared timeout of ${memberLabel(member)}` };
}

async function createInvite(message, args) {
  const channel = resolveTextChannel(message.guild, args.channel);
  if (!channel) return { text: channelError(message.guild, args.channel) };
  requirePermission(message.guild, PermissionFlagsBits.CreateInstantInvite, 'Create Invite');

  const maxAge = Math.min(Math.max(Number(args.max_age_seconds ?? 86400), 0), 604800);
  const maxUses = Math.min(Math.max(Number(args.max_uses ?? 0), 0), 100);

  const invite = await channel.createInvite({
    maxAge,
    maxUses,
    unique: true,
    reason: actorReason(message, null, `created an invite for ${channelLabel(channel)}`),
  });

  return {
    text: `Invite for ${channelLabel(channel)}: ${invite.url} (expires in ${maxAge === 0 ? 'never' : `${maxAge}s`}, max uses ${maxUses || 'unlimited'}).`,
    summary: `created an invite for ${channelLabel(channel)}`,
  };
}

function listChannels(message) {
  const lines = [...message.guild.channels.cache.values()]
    .sort((a, b) => (a.parent?.position ?? -1) - (b.parent?.position ?? -1) || a.position - b.position)
    .map((channel) => {
      const parent = channel.parent ? ` in ${channel.parent.name}` : '';
      return `${channel.id} | ${channel.type} | ${channel.name}${parent}`;
    });
  return { text: `Channels and categories (${lines.length}):\n${lines.join('\n')}` };
}

function listRoles(message) {
  const lines = [...message.guild.roles.cache.values()]
    .sort((a, b) => b.position - a.position)
    .map((role) => `${role.id} | position ${role.position} | ${role.name}${role.managed ? ' (managed)' : ''}`);
  return { text: `Roles (${lines.length}):\n${lines.join('\n')}` };
}

async function listMembers(message, args) {
  const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 100);
  let members;
  if (args.search) {
    members = await message.guild.members.fetch({ query: clean(args.search), limit }).catch(() => null);
  } else {
    members = await message.guild.members.fetch({ limit }).catch(() => null);
  }
  if (!members || members.size === 0) return { text: 'No members found.' };

  const lines = [...members.values()].map(
    (member) =>
      `${member.id} | ${member.user.tag} | display: ${member.displayName} | roles: ${
        member.roles.cache.filter((role) => role.id !== message.guild.id).map((role) => role.name).join(', ') || 'none'
      }`
  );
  return { text: `Members (${lines.length}):\n${lines.join('\n')}` };
}

function describeCategories(categories) {
  if (categories.length === 0) return 'There are no ticket options.';
  return categories
    .map((category) => {
      const questions = (category.questions ?? []).map((q, i) => `${i + 1}. ${q}`).join('; ');
      return [
        `- ${category.id} — ${category.emoji ? `${category.emoji} ` : ''}${category.label}`,
        category.description ? `: ${category.description}` : '',
        ` (${category.buttonColor ?? DEFAULT_BUTTON_COLOR})`,
        questions ? ` | questions: ${questions}` : ' | no form questions',
      ].join('');
    })
    .join('\n');
}

function findCategory(categories, value) {
  const wanted = normalizeName(clean(value));
  if (!wanted) return null;
  return (
    categories.find((category) => normalizeName(category.id) === wanted) ??
    categories.find((category) => normalizeName(category.label) === wanted) ??
    null
  );
}

function categoryError(categories) {
  return `No ticket option matches that name. Current options:\n${describeCategories(categories)}`;
}

async function addOption(args) {
  const categories = loadCategories();
  const label = truncate(clean(args.label), 100);
  const id = slugify(label);
  if (!id) return { text: 'The label must contain at least one letter or number.' };
  if (categories.length >= MAX_CATEGORIES) {
    return { text: `The panel already has the maximum of ${MAX_CATEGORIES} options. Remove one first.` };
  }
  if (categories.some((category) => category.id === id)) {
    return { text: `An option with ID ${id} already exists. Use edit_ticket_option to change it.` };
  }

  const emoji = clean(args.emoji);
  if (emoji && !isValidEmoji(emoji)) {
    return { text: `${emoji} is not a real emoji. Use a unicode emoji such as 🎫.` };
  }
  const color = clean(args.color).toLowerCase() || DEFAULT_BUTTON_COLOR;
  if (!BUTTON_COLORS.includes(color)) {
    return { text: `Unknown colour. Use one of: ${BUTTON_COLORS.join(', ')}.` };
  }

  categories.push({
    id,
    label,
    description: truncate(clean(args.description), 100),
    emoji: emoji || undefined,
    buttonColor: color,
  });
  saveCategories(categories);
  return { text: `Added ticket option ${id}.`, summary: `added ticket option ${id}` };
}

async function editOption(args) {
  const categories = loadCategories();
  const category = findCategory(categories, args.option);
  if (!category) return { text: categoryError(categories) };

  const changes = [];

  if (args.label !== undefined) {
    const label = truncate(clean(args.label), 100);
    if (!label) return { text: 'The label cannot be empty.' };
    category.label = label;
    changes.push('label');
  }

  if (args.description !== undefined) {
    category.description = truncate(clean(args.description), 100);
    changes.push('description');
  }

  if (args.emoji !== undefined) {
    const emoji = clean(args.emoji);
    if (emoji && !isValidEmoji(emoji)) {
      return { text: `${emoji} is not a real emoji. Use a unicode emoji such as 🎫.` };
    }
    if (emoji) category.emoji = emoji;
    else delete category.emoji;
    changes.push('emoji');
  }

  if (args.color !== undefined) {
    const color = clean(args.color).toLowerCase();
    if (!BUTTON_COLORS.includes(color)) {
      return { text: `Unknown colour. Use one of: ${BUTTON_COLORS.join(', ')}.` };
    }
    category.buttonColor = color;
    changes.push('colour');
  }

  if (args.welcome_message !== undefined) {
    const text = clean(args.welcome_message);
    if (text.length > MAX_MESSAGE_LENGTH) {
      return { text: `The welcome message is longer than ${MAX_MESSAGE_LENGTH} characters.` };
    }
    if (text) category.welcomeMessage = text;
    else delete category.welcomeMessage;
    changes.push('welcome message');
  }

  if (args.add_question !== undefined) {
    const question = clean(args.add_question);
    if (!question) return { text: 'The question cannot be empty.' };
    if (question.length > MAX_QUESTION_LENGTH) {
      return { text: `A question may be at most ${MAX_QUESTION_LENGTH} characters.` };
    }
    const questions = category.questions ?? [];
    if (questions.length >= MAX_QUESTIONS) {
      return { text: `${category.id} already has ${MAX_QUESTIONS} questions. Remove one first.` };
    }
    category.questions = [...questions, question];
    changes.push('question');
  }

  if (args.remove_question !== undefined) {
    const number = Number(args.remove_question);
    const questions = category.questions ?? [];
    if (!Number.isInteger(number) || number < 1 || number > questions.length) {
      return { text: `${category.id} has ${questions.length} question(s); pick a number between 1 and ${questions.length}.` };
    }
    category.questions = questions.filter((_, index) => index !== number - 1);
    changes.push(`question ${number}`);
  }

  if (changes.length === 0) {
    return { text: 'No change was given. Say what should change: label, description, emoji, colour, welcome message or a question.' };
  }

  saveCategories(categories);
  return {
    text: `Updated ${category.id}: ${changes.join(', ')}.`,
    summary: `updated ticket option ${category.id} (${changes.join(', ')})`,
  };
}

function removeOption(args) {
  const categories = loadCategories();
  const category = findCategory(categories, args.option);
  if (!category) return { text: categoryError(categories) };
  if (categories.length === 1) return { text: 'You must keep at least one ticket option.' };

  saveCategories(categories.filter((entry) => entry.id !== category.id));
  return { text: `Removed ticket option ${category.id}.`, summary: `removed ticket option ${category.id}` };
}

function listOptions() {
  return { text: describeCategories(loadCategories()) };
}

function listPanels() {
  return { text: `Ticket panels:\n${describePanels()}` };
}

async function savePanelTool(args) {
  const name = clean(args.panel);
  const title = clean(args.title);
  if (!name || !title) return { text: 'A panel name and title are required.' };

  const { panel, unknown } = savePanel({
    name,
    title,
    description: args.description === undefined ? undefined : clean(args.description),
    categories: args.categories,
  });
  if (!panel) return { text: `Unknown category: ${unknown.join(', ')}.` };

  return {
    text: `Saved panel ${panel.title} as ${panel.id}.`,
    summary: `saved ticket panel ${panel.id}`,
  };
}

async function postPanelTool(message, args) {
  const channel = clean(args.channel)
    ? resolveTextChannel(message.guild, args.channel)
    : TEXT_CHANNELS.includes(message.channel?.type)
      ? message.channel
      : null;

  if (!channel) return { text: channelError(message.guild, args.channel ?? 'this channel') };

  const panelName = clean(args.panel) || DEFAULT_PANEL_ID;
  if (panelName !== DEFAULT_PANEL_ID && !getPanel(panelName)) {
    return { text: `No saved panel named "${panelName}". Panels:\n${describePanels()}` };
  }

  const result = await postPanel(channel, panelName);
  const warning = result.skippedEmoji.length
    ? ` Skipped an invalid emoji on: ${result.skippedEmoji.join(', ')}.`
    : '';
  return {
    text: `Posted panel ${result.panel.id} in ${channelLabel(channel)}.${warning}`,
    summary: `posted ticket panel ${result.panel.id} in ${channelLabel(channel)}`,
  };
}

// Runs one tool call. Never throws: errors go back to the model as text it can act on.
async function executeTool(message, name, args) {
  if (!isTrustedUser(message.author) || !message.guild) {
    return { text: 'This action is not allowed for this user.' };
  }

  const input = args && typeof args === 'object' ? args : {};
  console.log(`AI action requested by ${message.author.username} (${message.author.id}): ${name}`);

  try {
    switch (name) {
      case 'send_message':
        return await sendMessage(message, input);
      case 'read_messages':
        return await readMessages(message, input);
      case 'delete_message':
        return await deleteMessage(message, input);
      case 'purge_messages':
        return await purgeMessages(message, input);
      case 'create_channel':
        return await createChannel(message, input);
      case 'delete_channel':
        return await deleteChannel(message, input);
      case 'edit_channel':
        return await editChannel(message, input);
      case 'lock_channel':
        return await lockChannel(message, input);
      case 'create_role':
        return await createRole(message, input);
      case 'delete_role':
        return await deleteRole(message, input);
      case 'edit_role':
        return await editRole(message, input);
      case 'add_role':
        return await addRole(message, input);
      case 'remove_role':
        return await removeRole(message, input);
      case 'kick_member':
        return await kickMember(message, input);
      case 'ban_member':
        return await banMember(message, input);
      case 'unban_member':
        return await unbanMember(message, input);
      case 'timeout_member':
        return await timeoutMember(message, input);
      case 'clear_timeout':
        return await clearTimeout(message, input);
      case 'create_invite':
        return await createInvite(message, input);
      case 'list_channels':
        return listChannels(message);
      case 'list_roles':
        return listRoles(message);
      case 'list_members':
        return await listMembers(message, input);
      case 'list_ticket_options':
        return listOptions();
      case 'list_ticket_panels':
        return listPanels();
      case 'save_ticket_panel':
        return await savePanelTool(input);
      case 'add_ticket_option':
        return await addOption(input);
      case 'edit_ticket_option':
        return await editOption(input);
      case 'remove_ticket_option':
        return removeOption(input);
      case 'post_ticket_panel':
        return await postPanelTool(message, input);
      default:
        return { text: `Unknown action: ${name}.` };
    }
  } catch (err) {
    console.error(`AI action ${name} failed:`, err);
    return { text: `That action failed: ${err.message}` };
  }
}

module.exports = {
  TOOLS,
  executeTool,
  resolveGuildChannel,
  resolveTextChannel,
  resolveMember,
  resolveRole,
  resolveUser,
  describeCategories,
};
