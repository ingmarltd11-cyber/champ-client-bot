const { MessageFlags } = require('discord.js');
const { ROLES } = require('../config');
const { findRole } = require('../utils/permissions');

async function grantVerifiedRole(member) {
  const role = findRole(member.guild, ROLES.champ);
  if (!role) {
    throw new Error(`The "${ROLES.champ}" role does not exist on this server.`);
  }
  if (member.roles.cache.has(role.id)) {
    return { alreadyVerified: true };
  }
  await member.roles.add(role, 'Verified via Champ Client Bot');
  return { alreadyVerified: false };
}

async function respondVerified(interaction) {
  try {
    const { alreadyVerified } = await grantVerifiedRole(interaction.member);
    await interaction.reply({
      content: alreadyVerified
        ? "✅ You're already verified."
        : '✅ You are now verified! Enjoy the server.',
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.error('Verification failed:', err);
    await interaction.reply({
      content: '❌ Something went wrong while verifying you. Please contact staff.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

module.exports = { grantVerifiedRole, respondVerified };
