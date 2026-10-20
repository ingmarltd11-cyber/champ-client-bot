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
const { getPanel, listPanels, panelCategories, savePanel } = require('../utils/ticketPanels');

const colorChoices = BUTTON_COLORS.map((color) => ({ name: color, value: color }));

function reply(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
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

// Every subcommand starts with the panel, so an edit always says which panel it is for.
// These are passed to addStringOption first, because Discord wants required options
// before the optional ones.
function panelOption(option) {
  return option
    .setName('panel')
    .setDescription('Panel name/ID, see /ticket-panels list')
    .setRequired(true)
    .setMaxLength(50);
}

function nameOption(option) {
  return option.setName('name').setDescription('Category name shown on that panel').setRequired(true).setMaxLength(100);
}

function panelList() {
  return listPanels()
    .map((panel) => `**${panel.title}** \`${panel.id}\``)
    .join(', ');
}

function unknownPanel(panelName) {
  return `❌ No saved panel named **${panelName}**. Saved panels: ${panelList()}.`;
}

function describeAvailable(available) {
  if (!available.length) return 'none';
  return available.map((category) => `**${category.label}**`).join(', ');
}

// Finds the category by the name shown on the panel. The ID still works as a fallback,
// and a unique prefix is accepted so a long label does not have to be typed out fully.
function findCategoryOnPanel(categories, panel, name) {
  // Match on the objects being edited, not on a fresh copy, so a change is saved.
  const available = panelCategories(panel)
    .map((visible) => categories.find((category) => category.id === visible.id))
    .filter(Boolean);
  const wanted = String(name ?? '').trim().toLowerCase();
  if (!wanted) return { category: null, available };

  const byLabel = available.find((category) => String(category.label).toLowerCase() === wanted);
  const byId = available.find((category) => category.id.toLowerCase() === wanted);
  if (byLabel || byId) return { category: byLabel ?? byId, available };

  const partial = available.filter((category) => String(category.label).toLowerCase().startsWith(wanted));
  return { category: partial.length === 1 ? partial[0] : null, available };
}

module.exports = {
  access: 'owner',

  data: new SlashCommandBuilder()
    .setName('ticket-category')
    .setDescription('Manage the categories shown on a ticket panel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a ticket category to a panel.')
        .addStringOption(panelOption)
        .addStringOption((option) =>
          option.setName('label').setDescription('Name shown on the panel').setRequired(true).setMaxLength(100)
        )
        .addStringOption((option) =>
          option.setName('description').setDescription('Short description').setRequired(true).setMaxLength(100)
        )
        .addStringOption((option) => option.setName('emoji').setDescription('Optional emoji').setRequired(false))
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
        .setDescription('Remove a ticket category from a panel.')
        .addStringOption(panelOption)
        .addStringOption(nameOption)
    )
    .addSubcommand((sub) =>
      sub
        .setName('emoji')
        .setDescription('Set or clear the emoji on a category button.')
        .addStringOption(panelOption)
        .addStringOption(nameOption)
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
        .setDescription('Set the button colour of a category on a panel.')
        .addStringOption(panelOption)
        .addStringOption(nameOption)
        .addStringOption((option) =>
          option.setName('color').setDescription('Button colour').setRequired(true).addChoices(...colorChoices)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('List the ticket categories, questions and messages of a panel.')
        .addStringOption((option) =>
          option
            .setName('panel')
            .setDescription('Only list the categories of this panel, see /ticket-panels list')
            .setRequired(false)
            .setMaxLength(50)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('question-add')
        .setDescription(`Add a form question to a category (max ${MAX_QUESTIONS}).`)
        .addStringOption(panelOption)
        .addStringOption(nameOption)
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
        .addStringOption(panelOption)
        .addStringOption(nameOption)
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
        .addStringOption(panelOption)
        .addStringOption(nameOption)
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
        .addStringOption(panelOption)
        .addStringOption(nameOption)
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const categories = loadCategories();

    if (sub === 'list') {
      const panelName = interaction.options.getString('panel')?.trim();
      const panel = panelName ? getPanel(panelName) : null;
      if (panelName && !panel) return reply(interaction, unknownPanel(panelName));

      const shown = panel ? panelCategories(panel) : categories;
      const heading = panel
        ? `**Ticket categories on ${panel.title} (\`${panel.id}\`):**`
        : `**Ticket categories (${categories.length}/${MAX_CATEGORIES}):**`;
      const text = `${heading}\n${shown.map(describeCategory).join('\n')}`;
      return reply(interaction, text.length > 1900 ? `${text.slice(0, 1900)}…` : text);
    }

    const panelName = interaction.options.getString('panel', true).trim();
    const panel = getPanel(panelName);
    if (!panel) return reply(interaction, unknownPanel(panelName));

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
      if (categories.some((category) => category.id === id)) {
        return reply(interaction, `❌ A category named **${label}** (\`${id}\`) already exists.`);
      }

      categories.push({ id, label, description, emoji, buttonColor });
      saveCategories(categories);

      // A panel with an explicit category list only shows what is on that list, so the new
      // category is added to it. The default panel follows every category automatically.
      if (Array.isArray(panel.categoryIds)) {
        const known = panel.categoryIds.filter((categoryId) =>
          categories.some((category) => category.id === categoryId)
        );
        savePanel({ name: panel.id, categories: [...known, id] });
      }

      return reply(
        interaction,
        `✅ Added **${label}** (\`${id}\`) to panel **${panel.title}**. ` +
          `Run /ticket-panel panel:${panel.id} again to show it.`
      );
    }

    const name = interaction.options.getString('name', true);
    const { category, available } = findCategoryOnPanel(categories, panel, name);
    if (!category) {
      return reply(
        interaction,
        `❌ Panel **${panel.title}** has no category **${name.trim()}**. It shows: ${describeAvailable(available)}.`
      );
    }

    const id = category.id;

    if (sub === 'remove') {
      if (categories.length === 1) {
        return reply(interaction, '❌ You must keep at least one category.');
      }

      saveCategories(categories.filter((c) => c.id !== id));
      return reply(
        interaction,
        `✅ Removed **${category.label}** from the ticket system. ` +
          `Run /ticket-panel panel:${panel.id} again to refresh the panel.`
      );
    }

    if (sub === 'question-add') {
      const text = interaction.options.getString('text').trim();
      if (!text) return reply(interaction, '❌ The question cannot be empty.');
      const questions = category.questions ?? [];
      if (questions.length >= MAX_QUESTIONS) {
        return reply(
          interaction,
          `❌ **${category.label}** already has ${MAX_QUESTIONS} questions, the maximum for a form. Remove one first.`
        );
      }

      category.questions = [...questions, text];
      saveCategories(categories);
      return reply(
        interaction,
        `✅ Question ${category.questions.length} added to **${category.label}** on panel **${panel.title}**.`
      );
    }

    if (sub === 'question-remove') {
      const number = interaction.options.getInteger('number');
      const questions = category.questions ?? [];
      if (number > questions.length) {
        return reply(interaction, `❌ **${category.label}** has ${questions.length} question(s).`);
      }

      category.questions = questions.filter((_, i) => i !== number - 1);
      saveCategories(categories);
      return reply(
        interaction,
        `✅ Question ${number} removed from **${category.label}** on panel **${panel.title}**.`
      );
    }

    if (sub === 'message-set') {
      const text = interaction.options.getString('text').trim();
      if (!text) return reply(interaction, '❌ The welcome message cannot be empty.');

      category.welcomeMessage = text;
      saveCategories(categories);
      return reply(
        interaction,
        `✅ Welcome message set for **${category.label}** on panel **${panel.title}**.`
      );
    }

    if (sub === 'emoji') {
      const emoji = interaction.options.getString('emoji')?.trim();

      if (!emoji) {
        delete category.emoji;
        saveCategories(categories);
        return reply(
          interaction,
          `✅ Emoji cleared on **${category.label}**. Run /ticket-panel panel:${panel.id} again to refresh the panel.`
        );
      }

      if (!isValidEmoji(emoji)) {
        return reply(
          interaction,
          `❌ \`${emoji}\` is not a real emoji. Use a unicode emoji like 🎫 or a custom one like <:name:id>.`
        );
      }

      category.emoji = emoji;
      saveCategories(categories);
      return reply(
        interaction,
        `✅ Emoji set on **${category.label}**. Run /ticket-panel panel:${panel.id} again to refresh the panel.`
      );
    }

    if (sub === 'color') {
      const color = interaction.options.getString('color');
      category.buttonColor = color;
      saveCategories(categories);
      return reply(
        interaction,
        `✅ Button colour of **${category.label}** set to ${color}. ` +
          `Run /ticket-panel panel:${panel.id} again to refresh the panel.`
      );
    }

    if (sub === 'message-clear') {
      delete category.welcomeMessage;
      saveCategories(categories);
      return reply(
        interaction,
        `✅ Welcome message cleared for **${category.label}** on panel **${panel.title}**.`
      );
    }

    return reply(interaction, '❌ Unknown subcommand.');
  },
};
