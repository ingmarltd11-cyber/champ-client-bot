const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const { isAdmin } = require('../utils/permissions');
const { isTrustedUser } = require('../utils/trustedUsers');
const settings = require('../utils/botSettings');

function reply(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setrole')
    .setDescription('Give a member a role now, and every time they open a ticket.')
    .addUserOption((option) =>
      option.setName('user').setDescription('The member who gets the role').setRequired(true)
    )
    .addRoleOption((option) =>
      option.setName('role').setDescription('The role to give').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAdmin(interaction.member) && !isTrustedUser(interaction.user)) {
      return reply(interaction, '❌ Only an administrator or a trusted operator can set roles.');
    }

    const user = interaction.options.getUser('user', true);
    const role = interaction.options.getRole('role', true);
    const guild = interaction.guild;

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return reply(interaction, '❌ I cannot find that member in this server.');

    if (role.managed) {
      return reply(interaction, `❌ The role **${role.name}** is managed by an integration and cannot be given by hand.`);
    }

    const me = guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return reply(interaction, '❌ I need the **Manage Roles** permission for this.');
    }
    if (role.position >= me.roles.highest.position) {
      return reply(
        interaction,
        `❌ **${role.name}** is higher than or equal to my own role. Move the bot role above it in Server Settings -> Roles.`
      );
    }

    const action = settings.addTicketAction({
      roleId: role.id,
      roleName: role.name,
      userId: member.id,
      panelId: '*',
    });

    let given = 'already had it';
    if (!member.roles.cache.has(role.id)) {
      try {
        await member.roles.add(role, `Set by ${interaction.user.tag} with /setrole`);
        given = 'given now';
      } catch (err) {
        console.error('Could not add the role:', err.message);
        return reply(interaction, `❌ Could not give the role: ${err.message}`);
      }
    }

    return reply(
      interaction,
      [
        `✅ ${member} → **${role.name}** (${given}).`,
        `Every time ${member} opens a ticket, the role is added automatically (action \`${action.id}\`).`,
        'Remove it with `/ticket-actions remove`.',
      ].join('\n')
    );
  },
};
