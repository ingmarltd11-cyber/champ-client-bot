// A stored channel ID can point at a channel the bot has not cached yet (for example right
// after a restart), and it can point at a channel that was deleted. Both are normal, so this
// helper returns null instead of throwing.
async function findChannel(guild, channelId) {
  if (!guild || !channelId) return null;

  const cached = guild.channels?.cache?.get?.(channelId);
  if (cached) return cached;

  if (typeof guild.channels?.fetch !== 'function') return null;
  try {
    return await guild.channels.fetch(channelId);
  } catch (err) {
    return null;
  }
}

module.exports = { findChannel };
