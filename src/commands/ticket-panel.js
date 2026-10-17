const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ChannelType,
} = require('discord.js');
const { getTicketConfig } = require('../config/loadConfig');

const data = new SlashCommandBuilder()
  .setName('ticket-panel')
  .setDescription('Plaats het ticket-paneel in een kanaal')
  .addChannelOption((opt) =>
    opt
      .setName('kanaal')
      .setDescription('Kanaal om het paneel te plaatsen (standaard: huidig kanaal)')
      .addChannelTypes(ChannelType.GuildText)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function execute(interaction) {
  const config = getTicketConfig();
  const target = interaction.options.getChannel('kanaal') || interaction.channel;

  const embed = new EmbedBuilder()
    .setTitle(config.panel.title)
    .setDescription(config.panel.description)
    .setColor(config.panel.color)
    .setFooter({ text: config.panel.footer });

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket-select')
    .setPlaceholder(config.panel.placeholder || 'Kies een categorie...')
    .addOptions(
      config.types.map((t) => ({
        label: t.label,
        value: t.id,
        description: t.description,
        emoji: t.emoji,
      }))
    );

  const row = new ActionRowBuilder().addComponents(menu);

  await target.send({ embeds: [embed], components: [row] });
  await interaction.reply({ content: `Paneel geplaatst in ${target}.`, ephemeral: true });
}

module.exports = { data, execute };
