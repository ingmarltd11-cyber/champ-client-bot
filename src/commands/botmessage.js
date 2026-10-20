const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { isOwner } = require('../utils/permissions');

module.exports = {
  access: 'owner',

  data: new SlashCommandBuilder()
    .setName('botmessage')
    .setDescription('Post a message as the bot in a channel.')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('The channel to post in')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addStringOption((option) =>
      option.setName('info').setDescription('The message to post').setRequired(true).setMaxLength(2000)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    // Server admins can override the default permission above, so check again here.
    if (!isOwner(interaction.member)) {
      return interaction.reply({ content: '❌ Only the owner role can use this command.', flags: MessageFlags.Ephemeral });
    }

    const channel = interaction.options.getChannel('channel');
    const text = interaction.options.getString('info').trim();
    if (!text) {
      return interaction.reply({ content: '❌ The message cannot be empty.', flags: MessageFlags.Ephemeral });
    }

    try {
      // No pings: @everyone, @here and role or user mentions are not parsed.
      await channel.send({ content: text, allowedMentions: { parse: [] } });
    } catch (err) {
      console.error('Could not post bot message:', err.message);
      return interaction.reply({
        content: `❌ Could not post in ${channel}: ${err.message}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({ content: `✅ Message posted in ${channel}.`, flags: MessageFlags.Ephemeral });
  },
};
