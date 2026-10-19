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
const { buttonStyle, isValidEmoji } = require('../utils/ticketCategories');
const {
  DEFAULT_PANEL_ID,
  DEFAULT_PANEL,
  getPanel,
  savePanel,
  resolveCategoryIds,
  panelCategories,
  panelKey,
  describePanels,
} = require('../utils/ticketPanels');

const BUTTONS_PER_ROW = 5;

// What the bot needs in the target channel to post a panel with buttons.
const REQUIRED_PERMISSIONS = [
  ['ViewChannel', 'View Channel'],
  ['SendMessages', 'Send Messages'],
  ['EmbedLinks', 'Embed Links'],
];

// One button per category. Discord allows 5 rows of 5 buttons, which matches the 25-category limit.
// The panel ID is part of the custom ID, so two panels can share a category and still open the
// right ticket. An emoji Discord would reject is skipped, so one bad emoji cannot break the panel.
function buildRows(categories, panelId = DEFAULT_PANEL_ID, skippedEmoji = []) {
  const rows = [];
  for (let i = 0; i < categories.length; i += BUTTONS_PER_ROW) {
    const buttons = categories.slice(i, i + BUTTONS_PER_ROW).map((category) => {
      const button = new ButtonBuilder()
        .setCustomId(`ticket-open:${panelId}:${category.id}`)
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

// Posts a panel with the categories it is allowed to show. `panelOrName` may be a saved
// panel object, a panel ID/title, or nothing (the default panel).
async function postPanel(target, panelOrName = DEFAULT_PANEL_ID) {
  const panel =
    panelOrName && typeof panelOrName === 'object'
      ? panelOrName
      : getPanel(panelOrName) ?? { ...DEFAULT_PANEL, id: panelKey(panelOrName) };

  const skippedEmoji = [];
  const embed = new EmbedBuilder()
    .setTitle(panel.title)
    .setDescription(panel.description)
    .setColor(BRAND_COLOR);

  const categories = panelCategories(panel);
  if (categories.length === 0) {
    throw new Error('This panel has no categories yet. Add one with /ticket-category add.');
  }

  await target.send({
    embeds: [embed],
    components: buildRows(categories, panel.id, skippedEmoji),
  });
  return { skippedEmoji, panel, categories };
}

module.exports = {
  buildRows,
  postPanel,

  data: new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Post a ticket panel (use a different panel name for extra panels).')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Where to post the panel (default: this channel)')
        .addChannelTypes(ChannelType.GuildText)
    )
    .addStringOption((option) =>
      option
        .setName('panel')
        .setDescription(`Saved panel name/ID (default: ${DEFAULT_PANEL_ID}). A new name makes a new panel.`)
        .setRequired(false)
        .setMaxLength(50)
    )
    .addStringOption((option) =>
      option
        .setName('title')
        .setDescription('Panel title (default: use the saved title)')
        .setRequired(false)
        .setMaxLength(256)
    )
    .addStringOption((option) =>
      option
        .setName('description')
        .setDescription('Panel description (default: use the saved description)')
        .setRequired(false)
        .setMaxLength(2000)
    )
    .addStringOption((option) =>
      option
        .setName('categories')
        .setDescription('Comma-separated category IDs or labels. Empty = all categories.')
        .setRequired(false)
        .setMaxLength(1000)
    )
    .addBooleanOption((option) =>
      option
        .setName('save')
        .setDescription('Save these title/description/categories as a panel for later use')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    // Non-throwing lookup, so an older registered command cannot crash the command.
    const target = interaction.options.getChannel('channel', false) ?? interaction.channel;

    if (!target || typeof target.send !== 'function') {
      return reply(interaction, '❌ I cannot use that channel. Pick a text channel.');
    }

    const panelName = interaction.options.getString('panel') ?? DEFAULT_PANEL_ID;
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const categoriesInput = interaction.options.getString('categories');
    const shouldSave = interaction.options.getBoolean('save') ?? false;

    const saved = getPanel(panelName);
    if (!saved && title === null && description === null && categoriesInput === null) {
      return reply(
        interaction,
        `❌ No saved panel named **${panelName}**.\n\nSaved panels:\n${describePanels()}\n\n` +
          'Run `/ticket-panel` again with a `title`/`categories` to create it, and `save: true` to keep it.'
      );
    }

    let categoryIds = saved?.categoryIds ?? null;
    if (categoriesInput !== null) {
      const resolved = resolveCategoryIds(categoriesInput);
      if (resolved.unknown.length > 0) {
        const known = panelCategories({ categoryIds: null }).map((category) => `\`${category.id}\``).join(', ');
        return reply(
          interaction,
          `❌ Unknown category: ${resolved.unknown.map((name) => `\`${name}\``).join(', ')}.\nKnown categories: ${known}.`
        );
      }
      if (resolved.ids.length === 0) {
        return reply(interaction, '❌ `categories` was empty. Leave it out to show every category.');
      }
      categoryIds = resolved.ids;
    }

    const panel = {
      id: panelKey(saved?.id ?? panelName),
      title: title ?? saved?.title ?? DEFAULT_PANEL.title,
      description: description ?? saved?.description ?? DEFAULT_PANEL.description,
      categoryIds,
    };

    if (shouldSave) {
      const { panel: stored, unknown } = savePanel({
        name: panel.id,
        title: panel.title,
        description: panel.description,
        categories: panel.categoryIds,
      });
      if (!stored) {
        return reply(interaction, `❌ Unknown category: ${unknown.map((name) => `\`${name}\``).join(', ')}.`);
      }
      panel.id = stored.id;
    }

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

    let result;
    try {
      result = await postPanel(target, panel);
    } catch (err) {
      console.error('Could not post the ticket panel:', err);
      return reply(interaction, `❌ Discord refused the panel in ${target}: ${err.message}`);
    }

    const warning = result.skippedEmoji.length
      ? `\n⚠️ Skipped an invalid emoji on: ${result.skippedEmoji.join(', ')}. Fix it with \`/ticket-category emoji\` and post the panel again.`
      : '';
    const savedNote = shouldSave
      ? `\n💾 Saved as panel \`${panel.id}\` with ${result.categories.length} categories.`
      : saved
        ? `\nPanel \`${panel.id}\` with ${result.categories.length} categories.`
        : `\nℹ️ Panel \`${panel.id}\` was not saved. Add \`save: true\` to reuse it.`;
    return reply(interaction, `✅ Ticket panel posted in ${target}.${savedNote}${warning}`);
  },
};
