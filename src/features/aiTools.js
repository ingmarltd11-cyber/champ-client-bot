const { ChannelType } = require('discord.js');
const { baseChannelName } = require('../utils/permissions');
const { isTrustedUser } = require('../utils/trustedUsers');
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
const { postPanel } = require('../commands/ticket-panel');

// Tools the assistant may call, but only for a trusted user. They are plain JSON so any
// OpenAI-compatible endpoint can use them.
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'send_message',
      description: 'Send a message as the bot to a text channel in this server.',
      parameters: {
        type: 'object',
        properties: {
          channel: {
            type: 'string',
            description: 'Text channel name, mention or ID, for example announcements or #general.',
          },
          content: { type: 'string', description: 'The message text, at most 2000 characters.' },
        },
        required: ['channel', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_ticket_option',
      description: 'Add a category button to the ticket panel.',
      parameters: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'Name shown on the panel button.' },
          description: { type: 'string', description: 'Short description of the category.' },
          emoji: { type: 'string', description: 'Optional real emoji for the button.' },
          color: {
            type: 'string',
            enum: BUTTON_COLORS,
            description: 'Button colour, defaults to blue.',
          },
        },
        required: ['label'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_ticket_option',
      description:
        'Change one existing ticket option: its label, description, emoji, colour, welcome message or form questions.',
      parameters: {
        type: 'object',
        properties: {
          option: { type: 'string', description: 'Category ID or label, from list_ticket_options.' },
          label: { type: 'string', description: 'New button label.' },
          description: { type: 'string', description: 'New short description.' },
          emoji: { type: 'string', description: 'New emoji, or an empty string to remove it.' },
          color: { type: 'string', enum: BUTTON_COLORS, description: 'New button colour.' },
          welcome_message: {
            type: 'string',
            description: 'New welcome message, or an empty string to use the default.',
          },
          add_question: {
            type: 'string',
            description: `Form question to add, at most ${MAX_QUESTION_LENGTH} characters (max ${MAX_QUESTIONS}).`,
          },
          remove_question: {
            type: 'integer',
            description: 'Number of the form question to remove, starting at 1.',
          },
        },
        required: ['option'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_ticket_option',
      description: 'Remove a category button from the ticket panel. At least one category must remain.',
      parameters: {
        type: 'object',
        properties: {
          option: { type: 'string', description: 'Category ID or label, from list_ticket_options.' },
        },
        required: ['option'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_ticket_options',
      description: 'List the current ticket options with their ID, emoji, colour and form questions.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'post_ticket_panel',
      description: 'Post a fresh ticket panel with the current options in a text channel.',
      parameters: {
        type: 'object',
        properties: {
          channel: {
            type: 'string',
            description: 'Text channel name, mention or ID. Defaults to the current channel.',
          },
        },
      },
    },
  },
];

const TEXT_CHANNELS = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

function clean(value) {
  return String(value ?? '').trim();
}

function resolveChannel(guild, value) {
  const wanted = clean(value);
  if (!wanted) return null;

  const mention = /^<#(\d+)>$/.exec(wanted);
  const id = mention ? mention[1] : /^\d{15,25}$/.test(wanted) ? wanted : null;
  if (id) {
    const channel = guild.channels.cache.get(id);
    return channel && TEXT_CHANNELS.includes(channel.type) ? channel : null;
  }

  const name = wanted.replace(/^#/, '').toLowerCase();
  return (
    guild.channels.cache.find(
      (channel) =>
        TEXT_CHANNELS.includes(channel.type) &&
        (channel.name.toLowerCase() === name || baseChannelName(channel.name).toLowerCase() === name)
    ) ?? null
  );
}

function describeCategories(categories) {
  if (categories.length === 0) return 'There are no ticket options.';
  return categories
    .map((category) => {
      const questions = (category.questions ?? []).map((q, i) => `${i + 1}. ${q}`).join('; ');
      return [
        `- ${category.id} — ${category.emoji ? `${category.emoji} ` : ''}${category.label}`,
        category.description ? `: ${category.description}` : '',
        ` (${category.buttonColor ?? DEFAULT_BUTTON_COLOR})`,
        questions ? ` | questions: ${questions}` : ' | no form questions',
      ].join('');
    })
    .join('\n');
}

function findCategory(categories, value) {
  const wanted = clean(value).toLowerCase();
  if (!wanted) return null;
  return (
    categories.find((category) => category.id === wanted) ??
    categories.find((category) => String(category.label ?? '').toLowerCase() === wanted) ??
    null
  );
}

function categoryError(categories) {
  return `No ticket option matches that name. Current options:\n${describeCategories(categories)}`;
}

function channelError(guild, value) {
  const names = guild.channels.cache
    .filter((channel) => TEXT_CHANNELS.includes(channel.type))
    .map((channel) => baseChannelName(channel.name))
    .slice(0, 25)
    .join(', ');
  return `No text channel matches "${clean(value)}". Available: ${names}.`;
}

async function sendMessage(message, args) {
  const channel = resolveChannel(message.guild, args.channel);
  if (!channel) return { text: channelError(message.guild, args.channel) };

  const content = clean(args.content);
  if (!content) return { text: 'The message text is empty.' };
  if (content.length > 2000) {
    return { text: `The message is ${content.length} characters; Discord allows at most 2000.` };
  }

  await channel.send({ content, allowedMentions: { parse: [] } });
  return { text: `Message sent in #${baseChannelName(channel.name)}.`, summary: `sent a message in #${baseChannelName(channel.name)}` };
}

async function addOption(args) {
  const categories = loadCategories();
  const label = clean(args.label).slice(0, 100);
  const id = slugify(label);
  if (!id) return { text: 'The label must contain at least one letter or number.' };
  if (categories.length >= MAX_CATEGORIES) {
    return { text: `The panel already has the maximum of ${MAX_CATEGORIES} options. Remove one first.` };
  }
  if (categories.some((category) => category.id === id)) {
    return { text: `An option with ID ${id} already exists. Use edit_ticket_option to change it.` };
  }

  const emoji = clean(args.emoji);
  if (emoji && !isValidEmoji(emoji)) {
    return { text: `${emoji} is not a real emoji. Use a unicode emoji such as 🎫.` };
  }
  const color = clean(args.color).toLowerCase() || DEFAULT_BUTTON_COLOR;
  if (!BUTTON_COLORS.includes(color)) {
    return { text: `Unknown colour. Use one of: ${BUTTON_COLORS.join(', ')}.` };
  }

  categories.push({
    id,
    label,
    description: clean(args.description).slice(0, 100),
    emoji: emoji || undefined,
    buttonColor: color,
  });
  saveCategories(categories);
  return { text: `Added ticket option ${id}.`, summary: `added ticket option ${id}` };
}

async function editOption(args) {
  const categories = loadCategories();
  const category = findCategory(categories, args.option);
  if (!category) return { text: categoryError(categories) };

  const changes = [];

  if (args.label !== undefined) {
    const label = clean(args.label).slice(0, 100);
    if (!label) return { text: 'The label cannot be empty.' };
    category.label = label;
    changes.push('label');
  }

  if (args.description !== undefined) {
    category.description = clean(args.description).slice(0, 100);
    changes.push('description');
  }

  if (args.emoji !== undefined) {
    const emoji = clean(args.emoji);
    if (emoji && !isValidEmoji(emoji)) {
      return { text: `${emoji} is not a real emoji. Use a unicode emoji such as 🎫.` };
    }
    if (emoji) category.emoji = emoji;
    else delete category.emoji;
    changes.push('emoji');
  }

  if (args.color !== undefined) {
    const color = clean(args.color).toLowerCase();
    if (!BUTTON_COLORS.includes(color)) {
      return { text: `Unknown colour. Use one of: ${BUTTON_COLORS.join(', ')}.` };
    }
    category.buttonColor = color;
    changes.push('colour');
  }

  if (args.welcome_message !== undefined) {
    const text = clean(args.welcome_message);
    if (text.length > MAX_MESSAGE_LENGTH) {
      return { text: `The welcome message is longer than ${MAX_MESSAGE_LENGTH} characters.` };
    }
    if (text) category.welcomeMessage = text;
    else delete category.welcomeMessage;
    changes.push('welcome message');
  }

  if (args.add_question !== undefined) {
    const question = clean(args.add_question);
    if (!question) return { text: 'The question cannot be empty.' };
    if (question.length > MAX_QUESTION_LENGTH) {
      return { text: `A question may be at most ${MAX_QUESTION_LENGTH} characters.` };
    }
    const questions = category.questions ?? [];
    if (questions.length >= MAX_QUESTIONS) {
      return { text: `${category.id} already has ${MAX_QUESTIONS} questions. Remove one first.` };
    }
    category.questions = [...questions, question];
    changes.push('question');
  }

  if (args.remove_question !== undefined) {
    const number = Number(args.remove_question);
    const questions = category.questions ?? [];
    if (!Number.isInteger(number) || number < 1 || number > questions.length) {
      return { text: `${category.id} has ${questions.length} question(s); pick a number between 1 and ${questions.length}.` };
    }
    category.questions = questions.filter((_, index) => index !== number - 1);
    changes.push(`question ${number}`);
  }

  if (changes.length === 0) {
    return { text: 'No change was given. Say what should change: label, description, emoji, colour, welcome message or a question.' };
  }

  saveCategories(categories);
  return {
    text: `Updated ${category.id}: ${changes.join(', ')}.`,
    summary: `updated ticket option ${category.id} (${changes.join(', ')})`,
  };
}

function removeOption(args) {
  const categories = loadCategories();
  const category = findCategory(categories, args.option);
  if (!category) return { text: categoryError(categories) };
  if (categories.length === 1) return { text: 'You must keep at least one ticket option.' };

  saveCategories(categories.filter((entry) => entry.id !== category.id));
  return { text: `Removed ticket option ${category.id}.`, summary: `removed ticket option ${category.id}` };
}

function listOptions() {
  return { text: describeCategories(loadCategories()) };
}

async function postPanelTool(message, args) {
  const channel = clean(args.channel)
    ? resolveChannel(message.guild, args.channel)
    : TEXT_CHANNELS.includes(message.channel?.type)
      ? message.channel
      : null;

  if (!channel) return { text: channelError(message.guild, args.channel ?? 'this channel') };

  const skipped = await postPanel(channel);
  const warning = skipped.length
    ? ` Skipped an invalid emoji on: ${skipped.join(', ')}.`
    : '';
  return {
    text: `Posted the ticket panel in #${baseChannelName(channel.name)}.${warning}`,
    summary: `posted the ticket panel in #${baseChannelName(channel.name)}`,
  };
}

// Runs one tool call. Never throws: errors go back to the model as text it can act on.
async function executeTool(message, name, args) {
  if (!isTrustedUser(message.author) || !message.guild) {
    return { text: 'This action is not allowed for this user.' };
  }

  const input = args && typeof args === 'object' ? args : {};

  try {
    switch (name) {
      case 'send_message':
        return await sendMessage(message, input);
      case 'add_ticket_option':
        return await addOption(input);
      case 'edit_ticket_option':
        return await editOption(input);
      case 'remove_ticket_option':
        return removeOption(input);
      case 'list_ticket_options':
        return listOptions();
      case 'post_ticket_panel':
        return await postPanelTool(message, input);
      default:
        return { text: `Unknown action: ${name}.` };
    }
  } catch (err) {
    console.error(`AI action ${name} failed:`, err);
    return { text: `That action failed: ${err.message}` };
  }
}

module.exports = { TOOLS, executeTool, resolveChannel, describeCategories };
