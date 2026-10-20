const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const { isOwner } = require('../utils/permissions');

// Same look as the channels in src/server-structure.js: an emoji, then '│', then the name.
const SEPARATOR = '│';
const DEFAULT_EMOJI = '💬';
const MAX_NAME_LENGTH = 90;
const MAX_EMOJI_LENGTH = 8;

// Turns "Bug Reports!" into "bug-reports", the way the other channel names are written.
function channelSlug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, MAX_NAME_LENGTH);
}

// A leading emoji plus separator, which is ignored when looking for an existing channel.
function baseName(existingName) {
  return String(existingName).replace(/^[^│]*│/, '').trim().toLowerCase();
}

function cleanEmoji(value) {
  const emoji = String(value ?? '').trim();
  if (!emoji) return DEFAULT_EMOJI;
  return [...emoji].slice(0, MAX_EMOJI_LENGTH).join('');
}

function findCategory(guild, name) {
  const wanted = String(name).trim().toLowerCase();
  return guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name.trim().toLowerCase() === wanted
  );
}

module.exports = {
  access: 'owner',

  data: new SlashCommandBuilder()
    .setName('server-setup-chanel-create')
    .setDescription('Create a channel in the server style: emoji, then the name, inside a category.')
    .addStringOption((option) =>
      option
        .setName('categorie')
        .setDescription('Category to put the channel in. Created when it does not exist yet.')
        .setRequired(true)
        .setMaxLength(100)
    )
    .addStringOption((option) =>
      option
        .setName('naam')
        .setDescription('Channel name without the emoji, for example bug-reports.')
        .setRequired(true)
        .setMaxLength(MAX_NAME_LENGTH)
    )
    .addStringOption((option) =>
      option
        .setName('emoji')
        .setDescription(`Emoji in front of the name. Defaults to ${DEFAULT_EMOJI}.`)
        .setRequired(false)
        .setMaxLength(20)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isOwner(interaction.member)) {
      return interaction.reply({ content: '❌ Only the owner role can create channels.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    const categoryName = interaction.options.getString('categorie', true).trim();
    const slug = channelSlug(interaction.options.getString('naam', true));
    const emoji = cleanEmoji(interaction.options.getString('emoji'));

    if (!slug) {
      return interaction.editReply({
        content: '❌ That name has no letters or numbers. Use something like `bug-reports`.',
      });
    }

    // Reuse the category when it exists, otherwise create it like /setup-server does.
    let category = findCategory(guild, categoryName);
    let createdCategory = false;
    if (!category) {
      try {
        category = await guild.channels.create({
          name: categoryName,
          type: ChannelType.GuildCategory,
          reason: 'Created by /server-setup-chanel-create',
        });
        createdCategory = true;
      } catch (err) {
        console.error(`Could not create category ${categoryName}:`, err.message);
        return interaction.editReply({ content: `❌ Could not create the category: ${err.message}` });
      }
    }

    const existing = guild.channels.cache.find(
      (c) => c.parentId === category.id && baseName(c.name) === slug
    );
    if (existing) {
      return interaction.editReply({
        content: `ℹ️ <#${existing.id}> already exists in **${category.name}**. Nothing was created.`,
      });
    }

    try {
      const channel = await guild.channels.create({
        name: `${emoji}${SEPARATOR}${slug}`,
        type: ChannelType.GuildText,
        parent: category.id,
        reason: 'Created by /server-setup-chanel-create',
      });

      const lines = [
        `✅ Created <#${channel.id}> in **${category.name}**.`,
        `Name: \`${channel.name}\``,
      ];
      if (createdCategory) lines.push(`The category **${category.name}** did not exist, so it was created too.`);
      return interaction.editReply({ content: lines.join('\n') });
    } catch (err) {
      console.error('Could not create the channel:', err.message);
      return interaction.editReply({ content: `❌ Could not create the channel: ${err.message}` });
    }
  },

  // Exported for the tests.
  channelSlug,
  baseName,
  cleanEmoji,
};
