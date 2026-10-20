const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { isStaff } = require('../utils/permissions');
const tickets = require('../features/tickets');

function reply(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('close-request')
    .setDescription('Ask staff to close this ticket, with Accept and Deny buttons.')
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

    if (interaction.user.id !== openerId && !isStaff(interaction.member)) {
      return reply(interaction, '❌ Only the ticket opener or staff can ask to close this ticket.');
    }

    const reason =
      interaction.options.getString('reason')?.trim() ||
      (interaction.user.id === openerId
        ? 'The opener asked to close the ticket.'
        : 'Staff asked the opener to confirm closing the ticket.');

    await tickets.postCloseRequest(interaction.channel, interaction.guild, interaction.user, reason);
    return reply(interaction, '✅ The close request has been posted. Staff can accept or deny it.');
  },
};
