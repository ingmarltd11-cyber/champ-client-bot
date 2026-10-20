const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const tickets = require('../features/tickets');

function reply(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('close-request')
    .setDescription('Ask the ticket opener to confirm closing (support and developer only).')
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Why the ticket can be closed; {user} becomes a mention of the opener')
        .setRequired(false)
        .setMaxLength(300)
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return reply(interaction, '❌ Tickets only work inside the server.');
    }

    const openerId = tickets.getTicketOpenerId(interaction.channel);
    if (!openerId) {
      return reply(interaction, '❌ This is not a ticket channel or ticket post.');
    }

    // A close request always comes from staff; the opener only answers it.
    if (!tickets.isTicketStaff(interaction.member)) {
      return reply(interaction, '❌ Only support and developer can send a close request.');
    }

    const reason =
      interaction.options.getString('reason')?.trim() ||
      'Staff asked the opener to confirm closing the ticket.';

    await tickets.postCloseRequest(interaction.channel, interaction.guild, interaction.user, reason, openerId);
    return reply(
      interaction,
      '✅ The close request has been posted. The ticket opener is pinged and can accept or deny it.'
    );
  },
};
