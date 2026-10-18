const { PermissionFlagsBits } = require('discord.js');
const { STAFF_ROLE_NAMES } = require('../config');

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

function isStaff(member) {
  return (
    isAdmin(member) ||
    member.roles.cache.some((role) => STAFF_ROLE_NAMES.includes(role.name))
  );
}

function findRole(guild, name) {
  return guild.roles.cache.find((role) => role.name === name) ?? null;
}

// Channel names carry an emoji prefix, e.g. "✅│verify". Compare on the part
// after the last separator so "verify" matches "✅│verify".
function baseChannelName(name) {
  const parts = name.split(/[│┃|]/);
  return parts[parts.length - 1].trim();
}

function findChannel(guild, name) {
  return (
    guild.channels.cache.find(
      (channel) => baseChannelName(channel.name) === name && channel.isTextBased()
    ) ?? null
  );
}

module.exports = { isAdmin, isStaff, findRole, findChannel, baseChannelName };
