const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { isStaff } = require('../utils/permissions');
const tickets = require('../features/tickets');

function reply(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('Close this ticket. Staff close it at once; the opener sends a close request.')
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Why the ticket can be closed')
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

    const staff = isStaff(interaction.member);
    if (!staff && interaction.user.id !== openerId) {
      return reply(interaction, '❌ Only the ticket opener or staff can close this ticket.');
    }

    const given = interaction.options.getString('reason')?.trim();
    const reason = given || (staff ? 'Closed with /close.' : 'The opener asked to close the ticket.');

    // Staff do not need permission from anyone, so their /close really closes the ticket.
    if (staff) {
      await reply(interaction, '🔒 Closing this ticket.');
      return tickets.closeTicket(interaction.channel, interaction.user, reason);
    }

    await tickets.postCloseRequest(interaction.channel, interaction.guild, interaction.user, reason);
    return reply(interaction, '✅ Your close request has been sent to staff.');
  },
};
