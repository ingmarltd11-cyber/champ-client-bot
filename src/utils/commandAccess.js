const { isOwner, isStaff } = require('./permissions');

// Every command may declare `access: 'owner' | 'staff' | 'everyone'`.
// A command without the field keeps working for everyone, exactly like before.
// The check runs once in src/index.js, so a command file cannot forget it.
const LEVELS = ['everyone', 'staff', 'owner'];

const DENIED = {
  owner: '❌ Only the **owner** role can use this command.',
  staff: '❌ Only staff can use this command.',
};

function commandAccess(command) {
  const level = command?.access ?? 'everyone';
  return LEVELS.includes(level) ? level : 'everyone';
}

function canUseCommand(command, member) {
  const level = commandAccess(command);
  if (level === 'owner') return isOwner(member);
  if (level === 'staff') return isStaff(member);
  return true;
}

function accessDeniedMessage(command) {
  return DENIED[commandAccess(command)] ?? '❌ You cannot use this command.';
}

module.exports = {
  LEVELS,
  commandAccess,
  canUseCommand,
  accessDeniedMessage,
};
