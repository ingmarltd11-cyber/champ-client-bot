const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const { BRAND_COLOR } = require('../config');
const { loadCategories, buttonStyle, isValidEmoji } = require('../utils/ticketCategories');

const BUTTONS_PER_ROW = 5;

// What the bot needs in the target channel to post a panel with buttons.
const REQUIRED_PERMISSIONS = [
  ['ViewChannel', 'View Channel'],
  ['SendMessages', 'Send Messages'],
  ['EmbedLinks', 'Embed Links'],
];

// One button per category. Discord allows 5 rows of 5 buttons, which matches the 25-category limit.
// An emoji Discord would reject is skipped and its category name is pushed into `skippedEmoji`,
// so one bad emoji cannot break the whole panel.
function buildRows(categories, skippedEmoji = []) {
  const rows = [];
  for (let i = 0; i < categories.length; i += BUTTONS_PER_ROW) {
    const buttons = categories.slice(i, i + BUTTONS_PER_ROW).map((category) => {
      const button = new ButtonBuilder()
        .setCustomId(`ticket-open:${category.id}`)
        .setLabel(String(category.label ?? category.id ?? 'Ticket').slice(0, 80))
        .setStyle(buttonStyle(category.buttonColor));

      if (category.emoji) {
        if (isValidEmoji(category.emoji)) {
          button.setEmoji(category.emoji.trim());
        } else {
          skippedEmoji.push(category.label ?? category.id);
        }
      }
      return button;
    });
    rows.push(new ActionRowBuilder().addComponents(buttons));
  }
  return rows;
}

function reply(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
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
    // Non-throwing lookup, so an older registered command cannot crash the command.
    const target = interaction.options.getChannel('channel', false) ?? interaction.channel;

    if (!target || typeof target.send !== 'function') {
      return reply(interaction, '❌ I cannot use that channel. Pick a text channel.');
    }

    const categories = loadCategories();

    // Check up front, so the reason is clear instead of "Something went wrong".
    const me = interaction.guild?.members?.me;
    if (me && typeof target.permissionsFor === 'function') {
      const permissions = target.permissionsFor(me);
      const missing = REQUIRED_PERMISSIONS.filter(
        ([flag]) => !permissions?.has(PermissionFlagsBits[flag])
      ).map(([, label]) => label);

      if (missing.length) {
        return reply(
          interaction,
          `❌ I cannot post the panel in ${target}: I am missing **${missing.join(', ')}**.\n` +
            'Grant those permissions to the bot, or re-run `/setup-verify-gate` (it keeps bot access).'
        );
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('Support Tickets')
      .setDescription('Click a button below to open a private ticket with our staff.')
      .setColor(BRAND_COLOR);

    const skippedEmoji = [];
    try {
      await target.send({ embeds: [embed], components: buildRows(categories, skippedEmoji) });
    } catch (err) {
      console.error('Could not post the ticket panel:', err);
      return reply(interaction, `❌ Discord refused the panel in ${target}: ${err.message}`);
    }

    const warning = skippedEmoji.length
      ? `\n⚠️ Skipped an invalid emoji on: ${skippedEmoji.join(', ')}. Fix it with \`/ticket-category emoji\` and post the panel again.`
      : '';
    return reply(interaction, `✅ Ticket panel posted in ${target}.${warning}`);
  },
};
