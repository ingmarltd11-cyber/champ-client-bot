const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const { CHANNELS, VERIFIED_VIEW_ROLE_NAMES, ALWAYS_VISIBLE_CHANNELS } = require('../config');
const { findRole, baseChannelName } = require('../utils/permissions');

// The bot itself must keep working after the gate runs, otherwise it can no longer
// post the ticket panel, reviews or verify messages in the channels it just locked.
const BOT_PERMISSIONS = {
  ViewChannel: true,
  SendMessages: true,
  ReadMessageHistory: true,
  EmbedLinks: true,
  AttachFiles: true,
  ManageChannels: true,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-verify-gate')
    .setDescription('Hide all channels from unverified members except #verify.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { guild } = interaction;
    const everyone = guild.roles.everyone;
    const viewRoles = VERIFIED_VIEW_ROLE_NAMES.map((name) => findRole(guild, name)).filter(Boolean);
    const bot = guild.members.me;

    let locked = 0;
    const failed = [];

    for (const channel of guild.channels.cache.values()) {
      try {
        // Explicit allow for the bot, so @everyone's deny does not lock it out.
        if (bot) await channel.permissionOverwrites.edit(bot, BOT_PERMISSIONS);

        if (channel.type === ChannelType.GuildCategory) continue;

        if (baseChannelName(channel.name) === CHANNELS.verify) {
          await channel.permissionOverwrites.edit(everyone, { ViewChannel: true });
          continue;
        }

        // Stays visible to everyone; its Connect deny is kept because edit() merges overwrites.
        if (ALWAYS_VISIBLE_CHANNELS.includes(baseChannelName(channel.name))) {
          await channel.permissionOverwrites.edit(everyone, { ViewChannel: true });
          continue;
        }

        await channel.permissionOverwrites.edit(everyone, { ViewChannel: false });
        for (const role of viewRoles) {
          await channel.permissionOverwrites.edit(role, { ViewChannel: true });
        }
        locked++;
      } catch (err) {
        console.error(`Could not update #${channel.name}:`, err.message);
        failed.push(channel.name);
      }
    }

    const failure = failed.length ? ` Failed: ${failed.join(', ')}.` : '';
    await interaction.editReply({
      content: `✅ Locked ${locked} channel(s). #${CHANNELS.verify} stays visible to everyone.${
        bot ? '' : ' ⚠️ Could not find the bot member, so its own access was not added.'
      }${failure}`,
    });
  },
};
