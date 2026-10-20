const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const { ROLES } = require('../config');
const { findRole } = require('../utils/permissions');

// Exact role names from the spec (case-sensitive). Colors carried over from the old config.
const ROLE_DEFINITIONS = [
  { name: ROLES.owner, color: 0xff4d5e, hoist: true, mentionable: false },
  { name: ROLES.developer, color: 0x4d9fff, hoist: true, mentionable: false },
  { name: ROLES.mediaManager, color: 0xb26ae0, hoist: true, mentionable: true },
  { name: ROLES.media, color: 0xc79bf2, hoist: true, mentionable: true },
  { name: ROLES.champPlus, color: 0xffc93c, hoist: true, mentionable: false },
  { name: ROLES.support, color: 0x3ed598, hoist: true, mentionable: true },
  { name: ROLES.champ, color: 0x8a94a6, hoist: false, mentionable: false },
];

module.exports = {
  access: 'owner',

  data: new SlashCommandBuilder()
    .setName('setup-roles')
    .setDescription('Create the server roles that do not exist yet.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { guild } = interaction;
    const created = [];
    const skipped = [];
    const failed = [];

    for (const definition of ROLE_DEFINITIONS) {
      if (findRole(guild, definition.name)) {
        skipped.push(definition.name);
        continue;
      }

      try {
        // No permissions are granted here; permissions are set by staff afterwards.
        await guild.roles.create({
          name: definition.name,
          color: definition.color,
          hoist: definition.hoist,
          mentionable: definition.mentionable,
          reason: 'Created by /setup-roles',
        });
        created.push(definition.name);
      } catch (err) {
        console.error(`Could not create role ${definition.name}:`, err.message);
        failed.push(definition.name);
      }
    }

    const lines = [
      `✅ Created ${created.length} role(s): ${created.join(', ') || 'none'}.`,
      `Already existed: ${skipped.join(', ') || 'none'}.`,
    ];
    if (failed.length) lines.push(`❌ Failed: ${failed.join(', ')}.`);

    await interaction.editReply({ content: lines.join('\n') });
  },
};
