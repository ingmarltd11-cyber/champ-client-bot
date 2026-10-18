const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { CHANNELS, BRAND_COLOR } = require('../config');
const { findChannel } = require('../utils/permissions');

const STAR_CHOICES = [1, 2, 3, 4, 5].map((n) => ({
  name: `${'★'.repeat(n)}${'☆'.repeat(5 - n)} (${n}/5)`,
  value: n,
}));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('review')
    .setDescription('Leave a review. The bot posts it in the reviews channel for you.')
    .addIntegerOption((option) =>
      option
        .setName('stars')
        .setDescription('Your rating')
        .setRequired(true)
        .addChoices(...STAR_CHOICES)
    )
    .addStringOption((option) =>
      option
        .setName('description')
        .setDescription('Tell us about your experience')
        .setRequired(true)
        .setMaxLength(1000)
    ),

  async execute(interaction) {
    const channel = findChannel(interaction.guild, CHANNELS.reviews);
    if (!channel) {
      return interaction.reply({
        content: `❌ No channel named #${CHANNELS.reviews} was found. Ask staff to create it.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const stars = interaction.options.getInteger('stars');
    const description = interaction.options.getString('description');

    const embed = new EmbedBuilder()
      .setTitle('New review')
      .setDescription(description)
      .addFields({ name: 'Rating', value: `${'★'.repeat(stars)}${'☆'.repeat(5 - stars)} (${stars}/5)` })
      .setAuthor({
        name: interaction.user.tag,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setColor(BRAND_COLOR)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    await interaction.editReply({ content: `✅ Thanks! Your review has been posted in ${channel}.` });
  },
};
