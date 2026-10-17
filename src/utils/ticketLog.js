const { EmbedBuilder } = require('discord.js');

// Stuurt een log-embed naar het ingestelde logkanaal (settings.logChannelId).
// Staat er geen (geldig) kanaal ingesteld, dan gebeurt er niets.
async function logTicketEvent(guild, config, { title, description, color = '#8A94A6', fields = [] }) {
  try {
    const logId = config.settings.logChannelId;
    if (!logId || logId.includes('_ID')) return;
    const channel = await guild.channels.fetch(logId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;
    const embed = new EmbedBuilder().setTitle(title).setColor(color).setTimestamp();
    if (description) embed.setDescription(description);
    for (const f of fields) embed.addFields(f);
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('Kon niet loggen naar logkanaal:', err.message);
  }
}

module.exports = { logTicketEvent };
