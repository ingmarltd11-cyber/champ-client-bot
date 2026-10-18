const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const {
  MAX_CATEGORIES,
  loadCategories,
  saveCategories,
  slugify,
} = require('../utils/ticketCategories');

function reply(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-category')
    .setDescription('Manage the categories shown on the ticket panel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a ticket category.')
        .addStringOption((option) =>
          option.setName('label').setDescription('Name shown on the panel').setRequired(true).setMaxLength(100)
        )
        .addStringOption((option) =>
          option.setName('description').setDescription('Short description').setRequired(true).setMaxLength(100)
        )
        .addStringOption((option) =>
          option.setName('emoji').setDescription('Optional emoji').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a ticket category.')
        .addStringOption((option) =>
          option.setName('id').setDescription('Category ID from /ticket-category list').setRequired(true)
        )
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('List the ticket categories.')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const categories = loadCategories();

    if (sub === 'list') {
      const lines = categories.map((c) => `• \`${c.id}\` — ${c.emoji ?? ''} ${c.label}: ${c.description}`);
      return reply(interaction, `**Ticket categories (${categories.length}/${MAX_CATEGORIES}):**\n${lines.join('\n')}`);
    }

    if (sub === 'add') {
      const label = interaction.options.getString('label').trim();
      const description = interaction.options.getString('description').trim();
      const emoji = interaction.options.getString('emoji')?.trim() || undefined;
      const id = slugify(label);

      if (!id) return reply(interaction, '❌ The label must contain at least one letter or number.');
      if (categories.length >= MAX_CATEGORIES) {
        return reply(interaction, `❌ A panel can hold at most ${MAX_CATEGORIES} categories. Remove one first.`);
      }
      if (categories.some((c) => c.id === id)) {
        return reply(interaction, `❌ A category with ID \`${id}\` already exists.`);
      }

      categories.push({ id, label, description, emoji });
      saveCategories(categories);
      return reply(
        interaction,
        `✅ Added \`${id}\`. Run /ticket-panel again to show it on a new panel.`
      );
    }

    if (sub === 'remove') {
      const id = interaction.options.getString('id').trim();
      if (!categories.some((c) => c.id === id)) {
        return reply(interaction, `❌ No category with ID \`${id}\`.`);
      }
      if (categories.length === 1) {
        return reply(interaction, '❌ You must keep at least one category.');
      }

      saveCategories(categories.filter((c) => c.id !== id));
      return reply(interaction, `✅ Removed \`${id}\`. Run /ticket-panel again to refresh the panel.`);
    }

    return reply(interaction, '❌ Unknown subcommand.');
  },
};
