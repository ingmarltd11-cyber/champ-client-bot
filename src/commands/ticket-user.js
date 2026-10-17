const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getTicketConfig } = require('../config/loadConfig');
const { isStaffMember } = require('../utils/permissions');
const ticketStore = require('../utils/ticketStore');

const data = new SlashCommandBuilder()
  .setName('ticket-user')
  .setDescription('Voeg iemand toe aan dit ticket of verwijder iemand')
  .addStringOption((opt) =>
    opt.setName('actie').setDescription('Toevoegen of verwijderen').setRequired(true)
      .addChoices({ name: 'Toevoegen', value: 'add' }, { name: 'Verwijderen', value: 'remove' })
  )
  .addUserOption((opt) =>
    opt.setName('gebruiker').setDescription('Wie?').setRequired(true)
  );

async function execute(interaction) {
  const config = getTicketConfig();
  const ticket = await ticketStore.getTicket(interaction.channel.id);
  if (!ticket) return interaction.reply({ content: 'Dit is geen ticket-kanaal.', ephemeral: true });
  if (!isStaffMember(interaction.member, interaction.guild, config)) {
    return interaction.reply({ content: 'Alleen staff kan leden beheren.', ephemeral: true });
  }

  const action = interaction.options.getString('actie');
  const user = interaction.options.getUser('gebruiker');
  if (user.id === ticket.userId && action === 'remove') {
    return interaction.reply({ content: 'De opener kan niet worden verwijderd.', ephemeral: true });
  }

  if (action === 'add') {
    await interaction.channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true,
      SendMessages: true,
    });
    return interaction.reply({ content: `${user} toegevoegd aan dit ticket.` });
  }

  await interaction.channel.permissionOverwrites.delete(user.id).catch(() => {});
  return interaction.reply({ content: `${user} verwijderd uit dit ticket.` });
}

module.exports = { data, execute };
