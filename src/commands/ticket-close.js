const { SlashCommandBuilder } = require('discord.js');
const { getTicketConfig } = require('../config/loadConfig');
const { isStaffMember } = require('../utils/permissions');
const ticketStore = require('../utils/ticketStore');
const { closeTicketChannel } = require('../handlers/ticketInteractions');

const data = new SlashCommandBuilder()
  .setName('ticket-close')
  .setDescription('Sluit dit ticket (met optionele reden)')
  .addStringOption((opt) =>
    opt.setName('reden').setDescription('Reden voor het sluiten').setRequired(false)
  );

async function execute(interaction) {
  const config = getTicketConfig();
  const ticket = await ticketStore.getTicket(interaction.channel.id);
  if (!ticket) return interaction.reply({ content: 'Dit is geen ticket-kanaal.', ephemeral: true });

  const isOpener = interaction.user.id === ticket.userId;
  const isStaff = isStaffMember(interaction.member, interaction.guild, config);
  if (!isOpener && !isStaff) {
    return interaction.reply({ content: 'Alleen de opener of staff kan dit ticket sluiten.', ephemeral: true });
  }

  const reason = interaction.options.getString('reden') || null;
  await interaction.reply('Ticket wordt gesloten, transcript wordt gegenereerd...');
  await closeTicketChannel(interaction.channel, config, { closerTag: interaction.user.tag, reason });
}

module.exports = { data, execute };
