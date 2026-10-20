const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { isOwner } = require('../utils/permissions');
const settings = require('../utils/botSettings');

module.exports = {
  access: 'owner',

  data: new SlashCommandBuilder()
    .setName('ai-stop')
    .setDescription('Emergency brake: stop every AI admin action in this server immediately.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isOwner(interaction.member)) {
      return interaction.reply({
        content: '❌ Only the owner role can stop the AI actions.',
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
