const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { isAdmin } = require('../utils/permissions');
const { isTrustedUser } = require('../utils/trustedUsers');
const settings = require('../utils/botSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ai-stop')
    .setDescription('Emergency brake: stop every AI admin action in this server immediately.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAdmin(interaction.member) && !isTrustedUser(interaction.user)) {
      return interaction.reply({
        content: '❌ Only an administrator or a trusted operator can stop the AI actions.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const alreadyStopped = !settings.setAiAdminEnabled(false);
    return interaction.reply({
      content: [
        alreadyStopped ? '⛔ The AI admin actions were already stopped.' : '⛔ The AI admin actions are now stopped.',
        '',
        'The bot still answers questions, but it cannot send, delete, rename, kick, ban or change anything.',
        'Run `/ai-start` to give it its powers back.',
      ].join('\n'),
      flags: MessageFlags.Ephemeral,
    });
  },
};
