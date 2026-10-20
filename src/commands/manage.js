const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  EmbedBuilder,
} = require('discord.js');
const { BRAND_COLOR } = require('../config');
const { isOwner } = require('../utils/permissions');

const OWNER_DENIED = '❌ Only the **owner** role can manage the server with this command.';

// Short names for /manage perms, so an overwrite can be written in one option:
// `allow: view,send,attach` instead of Discord's long permission names.
const PERMISSION_ALIASES = {
  view: 'ViewChannel',
  send: 'SendMessages',
  'send-threads': 'SendMessagesInThreads',
  'read-history': 'ReadMessageHistory',
  attach: 'AttachFiles',
  embed: 'EmbedLinks',
  react: 'AddReactions',
  mention: 'MentionEveryone',
  'external-emoji': 'UseExternalEmojis',
  'public-threads': 'CreatePublicThreads',
  'private-threads': 'CreatePrivateThreads',
  'manage-threads': 'ManageThreads',
  'manage-messages': 'ManageMessages',
  'manage-channel': 'ManageChannels',
  'create-invite': 'CreateInstantInvite',
  connect: 'Connect',
  speak: 'Speak',
  stream: 'Stream',
  video: 'UseVAD',
  'use-soundboard': 'UseSoundboard',
  'send-voice': 'SendVoiceMessages',
  'send-polls': 'SendPolls',
  mute: 'MuteMembers',
  deafen: 'DeafenMembers',
  move: 'MoveMembers',
};

const CHANNEL_TYPES = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  forum: ChannelType.GuildForum,
  announcement: ChannelType.GuildAnnouncement,
};

function reply(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

// "view, send,attach" -> { flags: { ViewChannel: true, ... }, unknown: ['nope'] }
function parsePermissionList(value) {
  const flags = {};
  const unknown = [];
  const words = String(value ?? '')
    .split(/[,\s]+/)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);

  for (const word of words) {
    const name = PERMISSION_ALIASES[word];
    if (name && PermissionFlagsBits[name] !== undefined) {
      flags[name] = true;
      continue;
    }
    // Discord's own camelCase name works too, for permissions without a short alias.
    const direct = Object.keys(PermissionFlagsBits).find((key) => key.toLowerCase() === word);
    if (direct) flags[direct] = true;
    else unknown.push(word);
  }

  return { flags, unknown };
}

// #9b59b6, 9b59b6, 0x9b59b6, "random" or a plain number.
function parseColor(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  if (text === 'random') return 'Random';
  if (text === 'default' || text === 'none') return null;
  const hex = text.replace(/^#/, '').replace(/^0x/, '');
  if (/^[0-9a-f]{6}$/.test(hex)) return Number.parseInt(hex, 16);
  if (/^[0-9a-f]{3}$/.test(hex)) {
    return Number.parseInt([...hex].map((char) => char + char).join(''), 16);
  }
  if (/^\d{1,8}$/.test(text)) return Number.parseInt(text, 10);
  return NaN;
}

function channelSlug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 90);
}

async function resolveTarget(interaction) {
  const roleId = interaction.options.getRole('role')?.id;
  const user = interaction.options.getUser('user');
  if (roleId && user) return { error: 'Give either a role or a user, not both.' };

  const guild = interaction.guild;
  if (user) {
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return { error: 'I cannot find that member in this server.' };
    return { target: member, label: `${member}` };
  }
  if (roleId) {
    const role = interaction.options.getRole('role');
    return { target: role, label: `**${role.name}**` };
  }
  return { target: guild.roles.everyone, label: '@everyone' };
}

function assertRoleHierarchy(role, me) {
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return '❌ I need the **Manage Roles** permission.';
  }
  if (role.managed) return `❌ **${role.name}** is managed by an integration, so I cannot change it.`;
  if (role.id === role.guild?.id) return '❌ That role cannot be changed.';
  if (role.position >= me.roles.highest.position) {
    return `❌ **${role.name}** is higher than my own role. Move the bot role above it in Server Settings → Roles.`;
  }
  return null;
}

function describeFlags(flags) {
  return Object.keys(flags).join(', ') || 'none';
}

module.exports = {
  access: 'owner',

  data: new SlashCommandBuilder()
    .setName('manage')
    .setDescription('Create, edit and delete channels and roles, and set permissions (owner only).')
    // Manage Server keeps it out of the member command list, including for an owner role
    // that does not have Administrator. The owner check in execute() decides who may use it.
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('channel-create')
        .setDescription('Create a text, voice, forum or announcement channel.')
        .addStringOption((option) =>
          option.setName('name').setDescription('Channel name').setRequired(true).setMaxLength(100)
        )
        .addStringOption((option) =>
          option
            .setName('type')
            .setDescription('Channel type, defaults to text')
            .setRequired(false)
            .addChoices(
              { name: 'text', value: 'text' },
              { name: 'voice', value: 'voice' },
              { name: 'forum', value: 'forum' },
              { name: 'announcement', value: 'announcement' }
            )
        )
        .addChannelOption((option) =>
          option
            .setName('category')
            .setDescription('Category to put it in')
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildCategory)
        )
        .addBooleanOption((option) =>
          option.setName('private').setDescription('Hide it from @everyone').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('channel-delete')
        .setDescription('Delete a channel or category.')
        .addChannelOption((option) =>
          option.setName('channel').setDescription('The channel to delete').setRequired(true)
        )
        .addBooleanOption((option) =>
          option.setName('confirm').setDescription('Set to true to really delete it').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('category-create')
        .setDescription('Create a category.')
        .addStringOption((option) =>
          option.setName('name').setDescription('Category name').setRequired(true).setMaxLength(100)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('role-create')
        .setDescription('Create a role.')
        .addStringOption((option) =>
          option.setName('name').setDescription('Role name').setRequired(true).setMaxLength(100)
        )
        .addStringOption((option) =>
          option.setName('color').setDescription('Hex colour like #9b59b6, or random').setRequired(false)
        )
        .addBooleanOption((option) =>
          option.setName('hoist').setDescription('Show members with this role separately').setRequired(false)
        )
        .addBooleanOption((option) =>
          option.setName('mentionable').setDescription('Let everyone mention the role').setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('permissions').setDescription('For example: view, send, attach').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('role-edit')
        .setDescription('Rename, recolour or change an existing role.')
        .addRoleOption((option) =>
          option.setName('role').setDescription('The role to edit').setRequired(true)
        )
        .addStringOption((option) =>
          option.setName('name').setDescription('New name').setRequired(false).setMaxLength(100)
        )
        .addStringOption((option) =>
          option.setName('color').setDescription('Hex colour like #9b59b6, or random').setRequired(false)
        )
        .addBooleanOption((option) => option.setName('hoist').setDescription('Show separately').setRequired(false))
        .addBooleanOption((option) =>
          option.setName('mentionable').setDescription('Let everyone mention it').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('role-delete')
        .setDescription('Delete a role.')
        .addRoleOption((option) => option.setName('role').setDescription('The role to delete').setRequired(true))
        .addBooleanOption((option) =>
          option.setName('confirm').setDescription('Set to true to really delete it').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('role-assign')
        .setDescription('Give a member a role.')
        .addUserOption((option) => option.setName('user').setDescription('The member').setRequired(true))
        .addRoleOption((option) => option.setName('role').setDescription('The role').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('role-remove')
        .setDescription('Take a role away from a member.')
        .addUserOption((option) => option.setName('user').setDescription('The member').setRequired(true))
        .addRoleOption((option) => option.setName('role').setDescription('The role').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('perms')
        .setDescription('Set channel permissions for a role or member. Leave both targets empty for @everyone.')
        .addChannelOption((option) =>
          option.setName('channel').setDescription('The channel').setRequired(true)
        )
        .addRoleOption((option) =>
          option.setName('role').setDescription('The role that gets the overwrite').setRequired(false)
        )
        .addUserOption((option) =>
          option.setName('user').setDescription('The member that gets the overwrite').setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('allow').setDescription('For example: view, send, attach').setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('deny').setDescription('For example: send, react').setRequired(false)
        )
        .addBooleanOption((option) =>
          option.setName('reset').setDescription('Remove the overwrite of this target instead').setRequired(false)
        )
    ),

  async execute(interaction) {
    if (!interaction.guild) return reply(interaction, '❌ This command only works inside the server.');
    if (!isOwner(interaction.member)) return reply(interaction, OWNER_DENIED);

    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const me = guild.members.me;

    // Every branch answers privately, so a mistake never becomes public noise.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (sub === 'channel-create') {
        const name = channelSlug(interaction.options.getString('name', true));
        const type = interaction.options.getString('type') ?? 'text';
        const category = interaction.options.getChannel('category');
        const isPrivate = interaction.options.getBoolean('private') ?? false;

        if (!name) return interaction.editReply({ content: '❌ That name has no letters or numbers.' });

        const channel = await guild.channels.create({
          name,
          type: CHANNEL_TYPES[type] ?? ChannelType.GuildText,
          parent: category?.id,
          reason: `Created by ${interaction.user.tag} with /manage`,
          ...(isPrivate
            ? { permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }] }
            : {}),
        });

        return interaction.editReply({
          content: [
            `✅ Created <#${channel.id}> (${type})${category ? ` in **${category.name}**` : ''}.`,
            isPrivate ? 'It is hidden from @everyone.' : null,
          ]
            .filter(Boolean)
            .join('\n'),
        });
      }

      if (sub === 'channel-delete') {
        const channel = interaction.options.getChannel('channel', true);
        if (!interaction.options.getBoolean('confirm', true)) {
          return interaction.editReply({ content: 'Nothing was deleted. Set `confirm: true` to delete it.' });
        }
        const name = channel.name;
        await channel.delete(`Deleted by ${interaction.user.tag} with /manage`);
        return interaction.editReply({ content: `🗑️ Deleted \`${name}\`.` });
      }

      if (sub === 'category-create') {
        const name = interaction.options.getString('name', true).trim();
        const category = await guild.channels.create({
          name,
          type: ChannelType.GuildCategory,
          reason: `Created by ${interaction.user.tag} with /manage`,
        });
        return interaction.editReply({ content: `✅ Created the category **${category.name}**.` });
      }

      if (sub === 'role-create') {
        const name = interaction.options.getString('name', true).trim();
        const color = parseColor(interaction.options.getString('color'));
        if (Number.isNaN(color)) {
          return interaction.editReply({ content: '❌ That colour is not a hex value like `#9b59b6`.' });
        }
        const parsed = parsePermissionList(interaction.options.getString('permissions') ?? '');

        const role = await guild.roles.create({
          name,
          color: color ?? undefined,
          hoist: interaction.options.getBoolean('hoist') ?? false,
          mentionable: interaction.options.getBoolean('mentionable') ?? false,
          permissions: parsed.flags,
          reason: `Created by ${interaction.user.tag} with /manage`,
        });

        const notes = [`✅ Created <@&${role.id}>.`];
        if (Object.keys(parsed.flags).length) notes.push(`Permissions: ${describeFlags(parsed.flags)}.`);
        if (parsed.unknown.length) notes.push(`⚠️ Ignored unknown permissions: ${parsed.unknown.join(', ')}.`);
        return interaction.editReply({ content: notes.join('\n') });
      }

      if (sub === 'role-edit') {
        const role = interaction.options.getRole('role', true);
        const blocked = assertRoleHierarchy(role, me);
        if (blocked) return interaction.editReply({ content: blocked });

        const color = parseColor(interaction.options.getString('color'));
        if (Number.isNaN(color)) {
          return interaction.editReply({ content: '❌ That colour is not a hex value like `#9b59b6`.' });
        }

        const changes = {};
        const name = interaction.options.getString('name')?.trim();
        if (name) changes.name = name;
        if (color != null) changes.color = color;
        const hoist = interaction.options.getBoolean('hoist');
        if (hoist != null) changes.hoist = hoist;
        const mentionable = interaction.options.getBoolean('mentionable');
        if (mentionable != null) changes.mentionable = mentionable;

        if (Object.keys(changes).length === 0) {
          return interaction.editReply({ content: '❌ Give at least one thing to change.' });
        }

        await role.edit({ ...changes, reason: `Edited by ${interaction.user.tag} with /manage` });
        return interaction.editReply({
          content: `✅ Updated <@&${role.id}>: ${Object.keys(changes).join(', ')}.`,
        });
      }

      if (sub === 'role-delete') {
        const role = interaction.options.getRole('role', true);
        if (role.id === guild.roles.everyone.id) {
          return interaction.editReply({ content: '❌ @everyone cannot be deleted.' });
        }
        const blocked = assertRoleHierarchy(role, me);
        if (blocked) return interaction.editReply({ content: blocked });
        if (!interaction.options.getBoolean('confirm', true)) {
          return interaction.editReply({ content: 'Nothing was deleted. Set `confirm: true` to delete it.' });
        }

        const name = role.name;
        await role.delete(`Deleted by ${interaction.user.tag} with /manage`);
        return interaction.editReply({ content: `🗑️ Deleted the role **${name}**.` });
      }

      if (sub === 'role-assign' || sub === 'role-remove') {
        const user = interaction.options.getUser('user', true);
        const role = interaction.options.getRole('role', true);
        const member = await guild.members.fetch(user.id).catch(() => null);
        if (!member) return interaction.editReply({ content: '❌ I cannot find that member in this server.' });

        const blocked = assertRoleHierarchy(role, me);
        if (blocked) return interaction.editReply({ content: blocked });

        if (sub === 'role-assign') {
          if (member.roles.cache.has(role.id)) {
            return interaction.editReply({ content: `ℹ️ ${member} already has **${role.name}**.` });
          }
          await member.roles.add(role, `Added by ${interaction.user.tag} with /manage`);
          return interaction.editReply({ content: `✅ ${member} → **${role.name}**.` });
        }

        if (!member.roles.cache.has(role.id)) {
          return interaction.editReply({ content: `ℹ️ ${member} does not have **${role.name}**.` });
        }
        await member.roles.remove(role, `Removed by ${interaction.user.tag} with /manage`);
        return interaction.editReply({ content: `✅ Took **${role.name}** away from ${member}.` });
      }

      if (sub === 'perms') {
        const channel = interaction.options.getChannel('channel', true);
        const { target, label, error } = await resolveTarget(interaction);
        if (error) return interaction.editReply({ content: `❌ ${error}` });
        if (!('permissionOverwrites' in channel) || typeof channel.permissionOverwrites?.edit !== 'function') {
          return interaction.editReply({ content: '❌ Categories and channels only; pick a channel.' });
        }

        if (interaction.options.getBoolean('reset')) {
          await channel.permissionOverwrites.delete(
            target,
            `Reset by ${interaction.user.tag} with /manage`
          );
          return interaction.editReply({ content: `♻️ Removed the overwrite for ${label} in <#${channel.id}>.` });
        }

        const allow = parsePermissionList(interaction.options.getString('allow') ?? '');
        const deny = parsePermissionList(interaction.options.getString('deny') ?? '');
        const overwrite = {};
        for (const name of Object.keys(allow.flags)) overwrite[name] = true;
        for (const name of Object.keys(deny.flags)) overwrite[name] = false;

        if (Object.keys(overwrite).length === 0) {
          return interaction.editReply({
            content: '❌ Give `allow` or `deny` permissions, or set `reset: true` to remove the overwrite.',
          });
        }

        await channel.permissionOverwrites.edit(
          target,
          overwrite,
          `Changed by ${interaction.user.tag} with /manage`
        );

        const notes = [`✅ <#${channel.id}> for ${label}:`];
        if (Object.keys(allow.flags).length) notes.push(`allow → ${describeFlags(allow.flags)}`);
        if (Object.keys(deny.flags).length) notes.push(`deny → ${describeFlags(deny.flags)}`);
        const unknown = [...allow.unknown, ...deny.unknown];
        if (unknown.length) notes.push(`⚠️ Ignored unknown permissions: ${unknown.join(', ')}.`);
        return interaction.editReply({ content: notes.join('\n') });
      }

      return interaction.editReply({ content: '❌ Unknown subcommand.' });
    } catch (err) {
      console.error('Manage command failed:', err);
      const hint = /Missing Permissions/i.test(String(err.message))
        ? ' The bot needs Manage Channels, Manage Roles and Manage Permissions.'
        : '';
      return interaction.editReply({
        content: `❌ Could not finish that: ${String(err.message ?? err).slice(0, 300)}${hint}`,
      });
    }
  },

  // Exported for the tests and for reuse.
  parsePermissionList,
  parseColor,
  channelSlug,
  PERMISSION_ALIASES,
};
