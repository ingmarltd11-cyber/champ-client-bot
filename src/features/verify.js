const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const { ROLES } = require('../config');
const { findRoleAny, normalizeName } = require('../utils/permissions');

// The role that /verify grants. Servers spell it "champ", "Champ" or "Verified",
// so every accepted spelling is matched case-insensitively.
function verifiedRoleNames() {
  return [process.env.VERIFIED_ROLE_NAME, ROLES.champ, 'verified']
    .flatMap((name) => String(name ?? '').split(','))
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((name, index, all) => all.findIndex((other) => normalizeName(other) === normalizeName(name)) === index);
}

// Roles that may exist on unverified members. They are removed on verify, so a member
// never ends up with both "unverified" and "champ".
function unverifiedRoleNames() {
  return String(process.env.UNVERIFIED_ROLE_NAME ?? 'unverified')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

// Finds the verified role, creating it when the server has none yet. Uses a fresh role
// fetch first, so a role renamed while the bot was running is still found.
async function resolveVerifiedRole(guild) {
  const current = findRoleAny(guild, verifiedRoleNames());
  if (current) return current;

  try {
    await guild.roles.fetch();
  } catch (err) {
    console.error('Could not refresh the role list:', err.message);
  }

  const fetched = findRoleAny(guild, verifiedRoleNames());
  if (fetched) return fetched;

  // Nothing matches: create the configured name instead of failing every verification.
  try {
    return await guild.roles.create({
      name: String(process.env.VERIFIED_ROLE_NAME ?? 'Champ').split(',')[0].trim() || 'Champ',
      color: 0x8a94a6,
      hoist: false,
      mentionable: false,
      reason: 'Created automatically by the verification system',
    });
  } catch (err) {
    throw new Error(
      `The verified role does not exist and I could not create it (${err.message}). ` +
        'Give the bot "Manage Roles" or create a role named "Champ" and set VERIFIED_ROLE_NAME.'
    );
  }
}

async function grantVerifiedRole(member) {
  const guild = member.guild;
  const role = await resolveVerifiedRole(guild);

  if (role.managed) {
    throw new Error(`The "${role.name}" role is managed by an integration and cannot be assigned by hand.`);
  }

  const me = guild.members.me ?? (await guild.members.fetch(guild.client.user.id));

  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error('I need the "Manage Roles" permission to verify members.');
  }

  // Discord refuses to assign a role that sits above (or at) the bot's highest role.
  if (role.position >= me.roles.highest.position) {
    throw new Error(
      `The "${role.name}" role is higher than or equal to my own role. ` +
        'Move the bot role above it in Server Settings -> Roles.'
    );
  }

  const alreadyVerified = member.roles.cache.has(role.id);
  if (!alreadyVerified) {
    await member.roles.add(role, 'Verified via Champ Client Bot');
  }

  // Clean up an old "unverified" role when the server uses one.
  const stale = unverifiedRoleNames()
    .map((name) => findRoleAny(guild, [name]))
    .filter((staleRole) => staleRole && member.roles.cache.has(staleRole.id));

  if (stale.length > 0) {
    await member.roles.remove(stale, 'Verified via Champ Client Bot').catch((err) => {
      console.error('Could not remove the unverified role:', err.message);
    });
  }

  return { alreadyVerified, role };
}

async function respondVerified(interaction) {
  try {
    const { alreadyVerified, role } = await grantVerifiedRole(interaction.member);
    await interaction.reply({
      content: alreadyVerified
        ? `✅ You're already verified (${role}).`
        : `✅ You are now verified with ${role}! Enjoy the server.`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.error('Verification failed:', err);
    await interaction.reply({
      content: `❌ Verification failed: ${err.message}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

module.exports = {
  grantVerifiedRole,
  respondVerified,
  resolveVerifiedRole,
  verifiedRoleNames,
  unverifiedRoleNames,
};
