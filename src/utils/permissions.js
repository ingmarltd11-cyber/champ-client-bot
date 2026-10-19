const { PermissionFlagsBits } = require('discord.js');
const { STAFF_ROLE_NAMES } = require('../config');

function normalizeName(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isAdmin(member) {
  return Boolean(member?.permissions?.has(PermissionFlagsBits.Administrator));
}

// Role names in the config are lowercase, but servers often spell them "Champ" or "Support".
// Comparing case-insensitively means /verify and the staff checks keep working either way.
function roleMatchesName(role, name) {
  return normalizeName(role?.name) === normalizeName(name);
}

function isStaff(member) {
  if (!member) return false;
  return (
    isAdmin(member) ||
    member.roles.cache.some((role) => STAFF_ROLE_NAMES.some((name) => roleMatchesName(role, name)))
  );
}

// Exact match first, then a case-insensitive match, so "champ" finds "Champ".
function findRole(guild, name) {
  const wanted = normalizeName(name);
  if (!wanted) return null;
  return (
    guild.roles.cache.find((role) => role.name === name) ??
    guild.roles.cache.find((role) => normalizeName(role.name) === wanted) ??
    null
  );
}

// First role that exists from a list of accepted names.
function findRoleAny(guild, names) {
  for (const name of names) {
    const role = findRole(guild, name);
    if (role) return role;
  }
  return null;
}

// Channel names carry an emoji prefix, e.g. "✅│verify". Compare on the part
// after the last separator so "verify" matches "✅│verify".
function baseChannelName(name) {
  const parts = String(name ?? '').split(/[│┃|]/);
  return parts[parts.length - 1].trim();
}

function findChannel(guild, name) {
  return (
    guild.channels.cache.find(
      (channel) => baseChannelName(channel.name) === name && channel.isTextBased()
    ) ?? null
  );
}

module.exports = {
  isAdmin,
  isStaff,
  findRole,
  findRoleAny,
  roleMatchesName,
  findChannel,
  baseChannelName,
  normalizeName,
};
