const { PermissionFlagsBits } = require('discord.js');

// Geeft de support-rol voor een ticket-type terug. Heeft het type een eigen
// (geldige) supportRoleId, dan wordt die gebruikt; anders wordt teruggevallen
// op de rol genoemd in settings.defaultSupportRoleName (standaard "Support"),
// die /setup-roles automatisch aanmaakt.
function resolveSupportRole(guild, type, config) {
  if (type && type.supportRoleId && !type.supportRoleId.includes('_ROLE_ID')) {
    const byId = guild.roles.cache.get(type.supportRoleId);
    if (byId) return byId;
  }
  const fallbackName = config.settings.defaultSupportRoleName;
  if (fallbackName) {
    return guild.roles.cache.find((r) => r.name.toLowerCase() === fallbackName.toLowerCase()) || null;
  }
  return null;
}

// True als dit lid tickets mag beheren: Administrator of de support-rol.
function isStaffMember(member, guild, config) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const supportRole = resolveSupportRole(guild, null, config);
  if (supportRole && member.roles.cache.has(supportRole.id)) return true;
  return false;
}

module.exports = { resolveSupportRole, isStaffMember };
