const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { isAdmin } = require('../utils/permissions');
const { isTrustedUser } = require('../utils/trustedUsers');
const settings = require('../utils/botSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ai-start')
    .setDescription('Give the AI its admin actions back after /ai-stop.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAdmin(interaction.member) && !isTrustedUser(interaction.user)) {
      return interaction.reply({
        content: '❌ Only an administrator or a trusted operator can start the AI actions.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const alreadyRunning = settings.setAiAdminEnabled(true);
    return interaction.reply({
      content: alreadyRunning
        ? '✅ The AI admin actions were already running.'
        : '✅ The AI admin actions are running again. A trusted operator can now ask the bot to make changes.',
      flags: MessageFlags.Ephemeral,
    });
  },
};
