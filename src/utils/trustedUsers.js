const { AI } = require('../config');

// Only these accounts may ask the assistant to act in the server. Matching happens on the
// Discord account username (unique and stable) and on explicit user IDs, never on the display
// name, because anyone can change a display name.
function isTrustedUser(user) {
  if (!user || user.bot) return false;
  if (AI.trustedUserIds.includes(String(user.id))) return true;
  return AI.trustedUsers.includes(String(user.username ?? '').toLowerCase());
}

module.exports = { isTrustedUser };
