const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const tickets = require('../features/tickets');

function reply(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('Close this ticket (support and developer only).')
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

    // Only support and developer close tickets. The opener never closes their own ticket.
    if (!tickets.isTicketStaff(interaction.member)) {
      return reply(
        interaction,
        '❌ Only support and developer can close a ticket. A staff member closes it for you when it is solved.'
      );
    }

    const reason = interaction.options.getString('reason')?.trim() || 'Closed with /close.';

    await reply(interaction, '🔒 Closing this ticket.');
    return tickets.closeTicket(interaction.channel, interaction.user, reason);
  },
};
