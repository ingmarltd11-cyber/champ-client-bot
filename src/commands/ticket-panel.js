const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const { BRAND_COLOR } = require('../config');
const { loadCategories } = require('../utils/ticketCategories');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Post the support ticket panel in a channel.')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Where to post the panel (default: this channel)')
        .addChannelTypes(ChannelType.GuildText)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const categories = loadCategories();
    const target = interaction.options.getChannel('channel') ?? interaction.channel;

    const embed = new EmbedBuilder()
      .setTitle('Support Tickets')
      .setDescription('Choose a category below to open a private ticket with our staff.')
      .setColor(BRAND_COLOR);

    const menu = new StringSelectMenuBuilder()
      .setCustomId('ticket-select')
      .setPlaceholder('Choose a category...')
      .addOptions(
        categories.map((category) => ({
          label: category.label,
          value: category.id,
          description: category.description,
          emoji: category.emoji,
        }))
      );

    await target.send({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu)],
    });
    await interaction.reply({ content: `✅ Ticket panel posted in ${target}.`, flags: MessageFlags.Ephemeral });
  },
};
