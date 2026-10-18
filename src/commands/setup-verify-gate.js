const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const { CHANNELS, VERIFIED_VIEW_ROLE_NAMES } = require('../config');
const { findRole, baseChannelName } = require('../utils/permissions');

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

    let locked = 0;
    const failed = [];

    for (const channel of guild.channels.cache.values()) {
      if (channel.type === ChannelType.GuildCategory) continue;

      try {
        if (baseChannelName(channel.name) === CHANNELS.verify) {
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
      content: `✅ Locked ${locked} channel(s). #${CHANNELS.verify} stays visible to everyone.${failure}`,
    });
  },
};
