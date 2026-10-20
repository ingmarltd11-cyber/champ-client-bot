const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const { CHANNELS, ANNOUNCEMENT_EXEMPT_ROLE_NAMES } = require('../config');
const { findRole, findChannel } = require('../utils/permissions');

const LOCKED_FOR_EVERYONE = {
  SendMessages: false,
  SendMessagesInThreads: false,
  CreatePublicThreads: false,
  CreatePrivateThreads: false,
};

const EXEMPT_ALLOW = {
  ViewChannel: true,
  SendMessages: true,
  SendMessagesInThreads: true,
  CreatePublicThreads: true,
  CreatePrivateThreads: true,
};

module.exports = {
  access: 'owner',

  data: new SlashCommandBuilder()
    .setName('setup-permissions')
    .setDescription('Lock #announcements so only staff can post there.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { guild } = interaction;
    const channel = findChannel(guild, CHANNELS.announcements);
    if (!channel) {
      return interaction.editReply({
        content: `❌ No channel named #${CHANNELS.announcements} was found.`,
      });
    }

    await channel.permissionOverwrites.edit(guild.roles.everyone, LOCKED_FOR_EVERYONE);

    const applied = [];
    const missing = [];
    for (const name of ANNOUNCEMENT_EXEMPT_ROLE_NAMES) {
      const role = findRole(guild, name);
      if (!role) {
        missing.push(name);
        continue;
      }
      await channel.permissionOverwrites.edit(role, EXEMPT_ALLOW);
      applied.push(name);
    }

    const notes = [
      `✅ #${CHANNELS.announcements} is locked for regular members.`,
      `Staff with full access: ${applied.join(', ') || 'none'}.`,
    ];
    if (missing.length) notes.push(`⚠️ Roles not found on this server: ${missing.join(', ')}.`);

    await interaction.editReply({ content: notes.join('\n') });
  },
};
