const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const { BRAND_COLOR } = require('../config');
const { loadCategories } = require('../utils/ticketCategories');

const BUTTONS_PER_ROW = 5;

// One button per category. Discord allows 5 rows of 5 buttons, which matches the 25-category limit.
function buildRows(categories) {
  const rows = [];
  for (let i = 0; i < categories.length; i += BUTTONS_PER_ROW) {
    const buttons = categories.slice(i, i + BUTTONS_PER_ROW).map((category) => {
      const button = new ButtonBuilder()
        .setCustomId(`ticket-open:${category.id}`)
        .setLabel(category.label.slice(0, 80))
        .setStyle(ButtonStyle.Primary);
      if (category.emoji) button.setEmoji(category.emoji);
      return button;
    });
    rows.push(new ActionRowBuilder().addComponents(buttons));
  }
  return rows;
}

module.exports = {
  buildRows,

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
      .setDescription('Click a button below to open a private ticket with our staff.')
      .setColor(BRAND_COLOR);

    await target.send({ embeds: [embed], components: buildRows(categories) });
    await interaction.reply({ content: `✅ Ticket panel posted in ${target}.`, flags: MessageFlags.Ephemeral });
  },
};
