const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { isOwner } = require('../utils/permissions');
const settings = require('../utils/botSettings');
const { describeTicketActions } = require('../features/ticketRoles');

function reply(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

module.exports = {
  access: 'owner',

  data: new SlashCommandBuilder()
    .setName('ticket-actions')
    .setDescription('Manage what happens automatically when someone opens a ticket.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) => sub.setName('list').setDescription('Show every ticket action.'))
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Give a role when a ticket opens.')
        .addRoleOption((option) =>
          option.setName('role').setDescription('The role to give').setRequired(true)
        )
        .addUserOption((option) =>
          option.setName('user').setDescription('Only for this member (default: everyone)').setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('panel')
            .setDescription('Only for this ticket panel ID (default: every panel)')
            .setRequired(false)
            .setMaxLength(30)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a ticket action by its number from /ticket-actions list.')
        .addStringOption((option) =>
          option.setName('action').setDescription('Number from the list, an action ID or a role ID').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('clear')
        .setDescription('Remove ticket actions, for one member or everything.')
        .addUserOption((option) =>
          option.setName('user').setDescription('Only clear this member\'s actions').setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('panel').setDescription('Only clear this panel ID').setRequired(false).setMaxLength(30)
        )
    ),

  async execute(interaction) {
    if (!isOwner(interaction.member)) {
      return reply(interaction, '❌ Only the owner role can change ticket actions.');
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const text = `**Ticket actions:**\n${describeTicketActions()}`;
      return reply(interaction, text.length > 1900 ? `${text.slice(0, 1900)}…` : text);
    }

    if (sub === 'add') {
      const role = interaction.options.getRole('role', true);
      const user = interaction.options.getUser('user', false);
      const panel = interaction.options.getString('panel')?.trim() || '*';

      settings.addTicketAction({
        roleId: role.id,
        roleName: role.name,
        userId: user ? user.id : null,
        panelId: panel,
      });

      const who = user ? `${user}` : 'everyone';
      const where = panel === '*' ? 'every ticket' : `tickets from panel \`${panel}\``;
      return reply(interaction, `✅ When ${who} opens ${where}, the role **${role.name}** is added.`);
    }

    if (sub === 'remove') {
      const removed = settings.removeTicketAction(interaction.options.getString('action', true));
      if (!removed) {
        return reply(interaction, '❌ No ticket action matches that number, ID or role. Check `/ticket-actions list`.');
      }
      return reply(
        interaction,
        `✅ Removed: ${removed.roleName || removed.roleId} for ${removed.userId ? `<@${removed.userId}>` : 'everyone'}.`
      );
    }

    if (sub === 'clear') {
      const user = interaction.options.getUser('user', false);
      const panel = interaction.options.getString('panel')?.trim() || null;
      const count = settings.clearTicketActions({ userId: user ? user.id : null, panelId: panel });
      return reply(interaction, `✅ Removed ${count} ticket action(s).`);
    }

    return reply(interaction, '❌ Unknown subcommand.');
  },
};
