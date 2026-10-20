const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const {
  MAX_CATEGORIES,
  MAX_QUESTIONS,
  MAX_QUESTION_LENGTH,
  MAX_MESSAGE_LENGTH,
  BUTTON_COLORS,
  DEFAULT_BUTTON_COLOR,
  isValidEmoji,
  loadCategories,
  saveCategories,
  slugify,
} = require('../utils/ticketCategories');

const colorChoices = BUTTON_COLORS.map((color) => ({ name: color, value: color }));

function reply(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

function findCategory(categories, id) {
  return categories.find((c) => c.id === id) ?? null;
}

function describeCategory(category) {
  const lines = [`• \`${category.id}\` — ${category.emoji ?? ''} ${category.label}: ${category.description}`];
  const questions = category.questions ?? [];
  if (questions.length) {
    questions.forEach((q, i) => lines.push(`   ${i + 1}. ${q}`));
  } else {
    lines.push('   No form questions (ticket opens directly).');
  }
  lines.push(`   Button colour: ${category.buttonColor ?? DEFAULT_BUTTON_COLOR}`);
  if (category.emoji && !isValidEmoji(category.emoji)) {
    lines.push(`   ⚠️ Emoji "${category.emoji}" is not a real emoji and is skipped on the panel.`);
  }
  lines.push(category.welcomeMessage ? '   Welcome message: set.' : '   Welcome message: default.');
  return lines.join('\n');
}

module.exports = {
  access: 'owner',

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
        .addStringOption((option) =>
          option
            .setName('color')
            .setDescription(`Button colour (default: ${DEFAULT_BUTTON_COLOR})`)
            .setRequired(false)
            .addChoices(...colorChoices)
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
    .addSubcommand((sub) =>
      sub
        .setName('emoji')
        .setDescription('Set or clear the emoji on a category button.')
        .addStringOption((option) =>
          option.setName('id').setDescription('Category ID').setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('emoji')
            .setDescription('A real emoji, e.g. 🎫 or <:name:id>. Leave empty to clear it.')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('color')
        .setDescription('Set the button colour of a category on the ticket panel.')
        .addStringOption((option) =>
          option.setName('id').setDescription('Category ID').setRequired(true)
        )
        .addStringOption((option) =>
          option.setName('color').setDescription('Button colour').setRequired(true).addChoices(...colorChoices)
        )
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('List the ticket categories, questions and messages.'))
    .addSubcommand((sub) =>
      sub
        .setName('question-add')
        .setDescription(`Add a form question to a category (max ${MAX_QUESTIONS}).`)
        .addStringOption((option) =>
          option.setName('id').setDescription('Category ID').setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('text')
            .setDescription(`The question (max ${MAX_QUESTION_LENGTH} characters)`)
            .setRequired(true)
            .setMaxLength(MAX_QUESTION_LENGTH)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('question-remove')
        .setDescription('Remove a form question from a category.')
        .addStringOption((option) =>
          option.setName('id').setDescription('Category ID').setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName('number')
            .setDescription('Question number from /ticket-category list')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(MAX_QUESTIONS)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('message-set')
        .setDescription('Set the welcome message posted in new tickets of a category.')
        .addStringOption((option) =>
          option.setName('id').setDescription('Category ID').setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('text')
            .setDescription('The welcome message')
            .setRequired(true)
            .setMaxLength(MAX_MESSAGE_LENGTH)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('message-clear')
        .setDescription('Remove the custom welcome message of a category.')
        .addStringOption((option) =>
          option.setName('id').setDescription('Category ID').setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const categories = loadCategories();

    if (sub === 'list') {
      const body = categories.map(describeCategory).join('\n');
      const text = `**Ticket categories (${categories.length}/${MAX_CATEGORIES}):**\n${body}`;
      return reply(interaction, text.length > 1900 ? `${text.slice(0, 1900)}…` : text);
    }

    if (sub === 'add') {
      const label = interaction.options.getString('label').trim();
      const description = interaction.options.getString('description').trim();
      const emoji = interaction.options.getString('emoji')?.trim() || undefined;
      const buttonColor = interaction.options.getString('color') ?? DEFAULT_BUTTON_COLOR;

      if (emoji && !isValidEmoji(emoji)) {
        return reply(
          interaction,
          `❌ \`${emoji}\` is not a real emoji. Use a unicode emoji like 🎫 or a custom one like <:name:id>.`
        );
      }
      const id = slugify(label);

      if (!id) return reply(interaction, '❌ The label must contain at least one letter or number.');
      if (categories.length >= MAX_CATEGORIES) {
        return reply(interaction, `❌ A panel can hold at most ${MAX_CATEGORIES} categories. Remove one first.`);
      }
      if (findCategory(categories, id)) {
        return reply(interaction, `❌ A category with ID \`${id}\` already exists.`);
      }

      categories.push({ id, label, description, emoji, buttonColor });
      saveCategories(categories);
      return reply(interaction, `✅ Added \`${id}\`. Run /ticket-panel again to show it on a new panel.`);
    }

    if (sub === 'remove') {
      const id = interaction.options.getString('id').trim();
      if (!findCategory(categories, id)) {
        return reply(interaction, `❌ No category with ID \`${id}\`.`);
      }
      if (categories.length === 1) {
        return reply(interaction, '❌ You must keep at least one category.');
      }

      saveCategories(categories.filter((c) => c.id !== id));
      return reply(interaction, `✅ Removed \`${id}\`. Run /ticket-panel again to refresh the panel.`);
    }

    // Every remaining subcommand targets one existing category.
    const id = interaction.options.getString('id').trim();
    const category = findCategory(categories, id);
    if (!category) return reply(interaction, `❌ No category with ID \`${id}\`.`);

    if (sub === 'question-add') {
      const text = interaction.options.getString('text').trim();
      if (!text) return reply(interaction, '❌ The question cannot be empty.');
      const questions = category.questions ?? [];
      if (questions.length >= MAX_QUESTIONS) {
        return reply(interaction, `❌ \`${id}\` already has ${MAX_QUESTIONS} questions, the maximum for a form. Remove one first.`);
      }

      category.questions = [...questions, text];
      saveCategories(categories);
      return reply(interaction, `✅ Question ${category.questions.length} added to \`${id}\`.`);
    }

    if (sub === 'question-remove') {
      const number = interaction.options.getInteger('number');
      const questions = category.questions ?? [];
      if (number > questions.length) {
        return reply(interaction, `❌ \`${id}\` has ${questions.length} question(s).`);
      }

      category.questions = questions.filter((_, i) => i !== number - 1);
      saveCategories(categories);
      return reply(interaction, `✅ Question ${number} removed from \`${id}\`.`);
    }

    if (sub === 'message-set') {
      const text = interaction.options.getString('text').trim();
      if (!text) return reply(interaction, '❌ The welcome message cannot be empty.');

      category.welcomeMessage = text;
      saveCategories(categories);
      return reply(interaction, `✅ Welcome message set for \`${id}\`.`);
    }

    if (sub === 'emoji') {
      const emoji = interaction.options.getString('emoji')?.trim();

      if (!emoji) {
        delete category.emoji;
        saveCategories(categories);
        return reply(interaction, `✅ Emoji cleared on \`${id}\`. Run /ticket-panel again to refresh the panel.`);
      }

      if (!isValidEmoji(emoji)) {
        return reply(
          interaction,
          `❌ \`${emoji}\` is not a real emoji. Use a unicode emoji like 🎫 or a custom one like <:name:id>.`
        );
      }

      category.emoji = emoji;
      saveCategories(categories);
      return reply(interaction, `✅ Emoji set on \`${id}\`. Run /ticket-panel again to refresh the panel.`);
    }

    if (sub === 'color') {
      const color = interaction.options.getString('color');
      category.buttonColor = color;
      saveCategories(categories);
      return reply(interaction, `✅ Button colour of \`${id}\` set to ${color}. Run /ticket-panel again to refresh the panel.`);
    }

    if (sub === 'message-clear') {
      delete category.welcomeMessage;
      saveCategories(categories);
      return reply(interaction, `✅ Welcome message cleared for \`${id}\`.`);
    }

    return reply(interaction, '❌ Unknown subcommand.');
  },
};
