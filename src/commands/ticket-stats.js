const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getTicketConfig } = require('../config/loadConfig');
const { isStaffMember } = require('../utils/permissions');
const ticketStore = require('../utils/ticketStore');

const data = new SlashCommandBuilder()
  .setName('ticket-stats')
  .setDescription('Toon ticket-statistieken (open/gesloten, beoordelingen, top staff)');

async function execute(interaction) {
  const config = getTicketConfig();
  if (!isStaffMember(interaction.member, interaction.guild, config)) {
    return interaction.reply({ content: 'Alleen staff kan statistieken bekijken.', ephemeral: true });
  }
  await interaction.deferReply({ ephemeral: true });

  const stats = await ticketStore.getStats();
  const typeName = (id) => config.types.find((t) => t.id === id)?.label || id;

  const embed = new EmbedBuilder()
    .setTitle('Ticket-statistieken')
    .setColor(config.panel.color)
    .setTimestamp()
    .addFields(
      { name: 'Open tickets', value: String(stats.openTotal), inline: true },
      { name: 'Gesloten tickets', value: String(stats.closedTotal), inline: true },
      {
        name: 'Gem. beoordeling',
        value: stats.avgRating ? `${stats.avgRating.toFixed(1)} (${stats.ratingsTotal} stemmen)` : 'nog geen',
        inline: true,
      }
    );

  const openLines = Object.entries(stats.openByType).map(([id, n]) => `${typeName(id)}: **${n}**`);
  embed.addFields({ name: 'Open per type', value: openLines.length ? openLines.join('\n') : 'geen' });

  if (stats.topStaff.length) {
    const lines = [];
    for (const [staffId, count] of stats.topStaff) {
      const user = await interaction.client.users.fetch(staffId).catch(() => null);
      lines.push(`${user ? user.tag : staffId}: **${count}** geclaimd`);
    }
    embed.addFields({ name: 'Top staff (claims)', value: lines.join('\n') });
  }

  await interaction.editReply({ embeds: [embed] });
}

module.exports = { data, execute };
