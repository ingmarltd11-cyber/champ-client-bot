const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const {
  DEFAULT_PANEL,
  DEFAULT_PANEL_ID,
  describePanels,
  getPanel,
  panelCategories,
  removePanel,
  savePanel,
} = require('../utils/ticketPanels');

function reply(interaction, content) {
  const text = String(content);
  return interaction.reply({
    content: text.length > 1900 ? `${text.slice(0, 1900)}…` : text,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = {
  access: 'owner',

  data: new SlashCommandBuilder()
    .setName('ticket-panels')
    .setDescription('Manage multiple saved ticket panels.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) => sub.setName('list').setDescription('List every saved ticket panel.'))
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create or update a saved panel, then post it with /ticket-panel.')
        .addStringOption((option) =>
          option.setName('panel').setDescription('Panel name/ID, for example media').setRequired(true).setMaxLength(50)
        )
        .addStringOption((option) =>
          option.setName('title').setDescription('Title shown above the buttons').setRequired(true).setMaxLength(256)
        )
        .addStringOption((option) =>
          option.setName('description').setDescription('Text shown above the buttons').setRequired(false).setMaxLength(2000)
        )
        .addStringOption((option) =>
          option
            .setName('categories')
            .setDescription('Comma-separated category IDs or labels. Empty = all categories.')
            .setRequired(false)
            .setMaxLength(1000)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a saved panel. Tickets that are already open keep working.')
        .addStringOption((option) =>
          option.setName('panel').setDescription('Panel name/ID').setRequired(true).setMaxLength(50)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('set-default')
        .setDescription('Use a saved panel when /ticket-panel is run without a panel name.')
        .addStringOption((option) =>
          option.setName('panel').setDescription('Panel name/ID').setRequired(true).setMaxLength(50)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      return reply(
        interaction,
        `**Ticket panels:**\n${describePanels()}\n\n` +
          'Post one with `/ticket-panel panel:<name> channel:<channel>`.'
      );
    }

    const name = interaction.options.getString('panel', true).trim();

    if (sub === 'remove') {
      if (name.toLowerCase() === DEFAULT_PANEL_ID) {
        return reply(interaction, '❌ The default panel cannot be removed. Change it with `set-default` instead.');
      }
      if (!removePanel(name)) return reply(interaction, `❌ No saved panel named **${name}**.`);
      return reply(interaction, `✅ Removed panel **${name}**. Existing panel messages and tickets keep working.`);
    }

    const panel = getPanel(name);
    if (sub === 'set-default') {
      if (!panel) return reply(interaction, `❌ No saved panel named **${name}**.`);
      const { panel: stored, unknown } = savePanel({
        name: DEFAULT_PANEL_ID,
        title: panel.title,
        description: panel.description,
        categories: panel.categoryIds,
      });
      if (!stored) {
        return reply(interaction, `❌ Unknown category: ${unknown.join(', ')}.`);
      }
      return reply(
        interaction,
        `✅ **${panel.title}** is now the default panel. Post it with \`/ticket-panel\`.`
      );
    }

    // create
    const title = interaction.options.getString('title', true).trim();
    const description = interaction.options.getString('description') ?? DEFAULT_PANEL.description;
    const categories = interaction.options.getString('categories');

    const { panel: stored, unknown } = savePanel({ name, title, description, categories });
    if (!stored) {
      return reply(interaction, `❌ Unknown category: ${unknown.map((value) => `\`${value}\``).join(', ')}.`);
    }

    const count = panelCategories(stored).length;
    return reply(
      interaction,
      `✅ Saved panel **${stored.title}** as \`${stored.id}\` with ${count} categories.\n` +
        `Post it with \`/ticket-panel panel:${stored.id} channel:#your-channel\`.`
    );
  },
};
