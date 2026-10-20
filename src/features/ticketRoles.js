const { PermissionFlagsBits } = require('discord.js');
const settings = require('../utils/botSettings');

// Gives the roles configured with /setrole or /ticket-actions to the member who opened the
// ticket. Never throws: a role the bot cannot hand out is reported instead of breaking the
// ticket, because an unverified member still needs their ticket to open.
async function applyTicketActions(member, { panelId = 'default' } = {}) {
  if (!member || !member.guild) return { added: [], failed: [] };

  const guild = member.guild;
  const actions = settings.getTicketActionsFor({ panelId, userId: member.id });
  if (actions.length === 0) return { added: [], failed: [] };

  const me = guild.members?.me;
  if (!me) return { added: [], failed: actions.map((a) => a.roleName || a.roleId) };

  const added = [];
  const failed = [];

  for (const action of actions) {
    const label = action.roleName || action.roleId;
    try {
      const role =
        guild.roles.cache.get(action.roleId) ??
        (await guild.roles.fetch(action.roleId).catch(() => null));

      if (!role) {
        failed.push(`${label} (deleted)`);
        continue;
      }
      if (role.managed) {
        failed.push(`${label} (managed by an integration)`);
        continue;
      }
      if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        failed.push(`${label} (I need Manage Roles)`);
        continue;
      }
      if (role.position >= me.roles.highest.position) {
        failed.push(`${label} (higher than my role)`);
        continue;
      }
      if (member.roles.cache.has(role.id)) continue;

      await member.roles.add(role, 'Ticket action');
      added.push(role.name);
    } catch (err) {
      console.error(`Could not give the ticket role ${label}:`, err.message);
      failed.push(`${label} (${err.message})`);
    }
  }

  return { added, failed };
}

function describeTicketActions() {
  const actions = settings.listTicketActions();
  if (actions.length === 0) return 'No ticket actions yet. Add one with `/setrole` or `/ticket-actions add`.';

  return actions
    .map((action, index) => {
      const who = action.userId ? `<@${action.userId}>` : 'everyone';
      const where = action.panelId === '*' ? 'every panel' : `panel \`${action.panelId}\``;
      return `${index + 1}. Give role ${action.roleName || action.roleId} to ${who} when a ticket opens in ${where}`;
    })
    .join('\n');
}

module.exports = { applyTicketActions, describeTicketActions };
