const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const { isOwner } = require('../utils/permissions');

function summarize(guild) {
  const all = [...guild.channels.cache.values()];
  return {
    categories: all.filter((c) => c.type === ChannelType.GuildCategory),
    channels: all.filter((c) => c.type !== ChannelType.GuildCategory),
  };
}

function buildConfirmRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`server-delete:confirm:${userId}`)
      .setLabel('Delete everything')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`server-delete:cancel:${userId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );
}

async function handleButton(interaction) {
  const [, action, userId] = interaction.customId.split(':');

  if (interaction.user.id !== userId) {
    return interaction.reply({
      content: '❌ Only the owner who started this can confirm it.',
      flags: MessageFlags.Ephemeral,
    });
  }
  if (action === 'cancel') {
    return interaction.update({ content: 'Deletion cancelled. Nothing was changed.', embeds: [], components: [] });
  }
  if (!isOwner(interaction.member)) {
    return interaction.update({ content: '❌ You no longer have permission.', embeds: [], components: [] });
  }

  await interaction.deferUpdate();

  // Recomputed at confirm time so the deletion matches the server as it is now.
  const { channels, categories } = summarize(interaction.guild);
  let deleted = 0;
  const failed = [];

  // Channels first, then categories, so each category is empty when it is removed.
  for (const channel of [...channels, ...categories]) {
    try {
      await channel.delete('Deleted via /setup-server-delete');
      deleted++;
    } catch (err) {
      console.error(`Could not delete ${channel.name}:`, err.message);
      failed.push(channel.name);
    }
  }

  const lines = [`✅ Deleted ${deleted} channel(s) and categories. Roles were not touched.`];
  if (failed.length) {
    lines.push(
      `❌ Could not delete: ${failed.join(', ')}. Discord does not allow deleting some system channels, such as the rules or community updates channel.`
    );
  }
  await interaction.editReply({ content: lines.join('\n'), embeds: [], components: [] });
}

module.exports = {
  access: 'owner',

  data: new SlashCommandBuilder()
    .setName('setup-server-delete')
    .setDescription('Delete all channels and categories on this server (after confirmation).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isOwner(interaction.member)) {
      return interaction.reply({ content: '❌ Only the owner role can delete channels.', flags: MessageFlags.Ephemeral });
    }

    const { channels, categories } = summarize(interaction.guild);
    if (channels.length + categories.length === 0) {
      return interaction.reply({ content: 'There is nothing to delete.', flags: MessageFlags.Ephemeral });
    }

    let names = [...categories, ...channels].map((c) => c.name).join(', ');
    if (names.length > 3500) names = `${names.slice(0, 3500)}…`;

    const embed = new EmbedBuilder()
      .setTitle('Delete all channels and categories?')
      .setDescription(
        `This permanently deletes **${channels.length}** channel(s) and **${categories.length}** categories. Roles and members are not affected. This cannot be undone.\n\n${names}`
      )
      .setColor(0xe74c3c);

    return interaction.reply({
      embeds: [embed],
      components: [buildConfirmRow(interaction.user.id)],
      flags: MessageFlags.Ephemeral,
    });
  },

  handleButton,
  summarize,
};
