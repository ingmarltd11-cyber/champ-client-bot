const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const { isAdmin } = require('../utils/permissions');

// Roles that can be deleted: not @everyone, not managed (bot/integration roles),
// and only roles the bot can edit (below its highest role).
function getDeletableRoles(guild) {
  return guild.roles.cache
    .filter((role) => role.id !== guild.id && !role.managed && role.editable)
    .sort((a, b) => b.position - a.position);
}

function buildConfirmRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`roles-delete:confirm:${userId}`)
      .setLabel('Delete all listed roles')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`roles-delete:cancel:${userId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );
}

async function handleButton(interaction) {
  const [, action, userId] = interaction.customId.split(':');

  if (interaction.user.id !== userId) {
    return interaction.reply({
      content: '❌ Only the admin who started this can confirm it.',
      flags: MessageFlags.Ephemeral,
    });
  }
  if (action === 'cancel') {
    return interaction.update({ content: 'Role deletion cancelled.', embeds: [], components: [] });
  }
  if (!isAdmin(interaction.member)) {
    return interaction.update({ content: '❌ You no longer have permission.', embeds: [], components: [] });
  }

  await interaction.deferUpdate();

  // Recompute at confirm time so the list reflects the server as it is now.
  const roles = getDeletableRoles(interaction.guild);
  let deleted = 0;
  const failed = [];

  for (const role of roles.values()) {
    try {
      await role.delete('Deleted via /setup-roles-delete');
      deleted++;
    } catch (err) {
      console.error(`Could not delete role ${role.name}:`, err.message);
      failed.push(role.name);
    }
  }

  const failure = failed.length ? ` Failed: ${failed.join(', ')}.` : '';
  await interaction.editReply({
    content: `✅ Deleted ${deleted} role(s). Channels and categories were not touched.${failure}`,
    embeds: [],
    components: [],
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-roles-delete')
    .setDescription('Delete all deletable roles on this server (roles only, after confirmation).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ Administrator only.', flags: MessageFlags.Ephemeral });
    }

    const roles = getDeletableRoles(interaction.guild);
    if (roles.size === 0) {
      return interaction.reply({ content: 'There are no deletable roles.', flags: MessageFlags.Ephemeral });
    }

    let names = roles.map((role) => role.name).join(', ');
    if (names.length > 3500) names = `${names.slice(0, 3500)}…`;

    const embed = new EmbedBuilder()
      .setTitle(`Delete ${roles.size} role(s)?`)
      .setDescription(
        `This permanently deletes these roles. Channels and categories are not affected.\n\n${names}`
      )
      .setColor(0xe74c3c);

    return interaction.reply({
      embeds: [embed],
      components: [buildConfirmRow(interaction.user.id)],
      flags: MessageFlags.Ephemeral,
    });
  },

  handleButton,
  getDeletableRoles,
};
