const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const { BRAND_COLOR } = require('../config');

module.exports = {
  access: 'owner',

  data: new SlashCommandBuilder()
    .setName('setup-verify')
    .setDescription('Post the verification panel in this channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('Verify to get access')
      .setDescription(
        'Click the button below, or run `/verify`, to unlock the rest of the server.\n\n' +
          'Not verified yet and need help first? Open a ticket with the second button. ' +
          'You can have one ticket open at a time.'
      )
      .setColor(BRAND_COLOR);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('verify-button')
        .setLabel('Verify')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('unverified-ticket')
        .setLabel('Open a ticket (not verified yet)')
        .setEmoji('🎫')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: 'Verification panel posted.', flags: MessageFlags.Ephemeral });
  },
};
