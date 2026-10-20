const { PermissionFlagsBits } = require('discord.js');
const settings = require('../utils/botSettings');
const { findChannel } = require('../utils/channelLookup');

// A voice channel whose name shows the member count, for example "👥 Members: 412".
// Renaming a channel is rate limited by Discord (2 renames per 10 minutes per channel), so
// updates are spaced out and a skipped update is retried instead of dropped.

const MIN_RENAME_GAP_MS = 5 * 60 * 1000;
const RENAME_WINDOW_MS = 10 * 60 * 1000;
// Voice channel names are cut off at 100 characters by Discord.
const MAX_NAME_LENGTH = 100;

// channelId -> { renames: number[], timer: Timeout | null }
const state = new Map();

function stateFor(channelId) {
  if (!state.has(channelId)) state.set(channelId, { renames: [], timer: null });
  return state.get(channelId);
}

// Test helper: forget timings so a test starts with a clean rate limit.
function resetState() {
  for (const entry of state.values()) {
    if (entry.timer) clearTimeout(entry.timer);
  }
  state.clear();
}

function renderCount(template, count, guildName = '') {
  const text = String(template ?? '')
    .replace(/\{(count|members)\}/gi, String(count))
    .replace(/\{server\}/gi, guildName);
  return text.trim().slice(0, MAX_NAME_LENGTH);
}

// How long to wait before the next rename is allowed. 0 means "now".
function delayUntilAllowed(renames, now = Date.now()) {
  const recent = renames.filter((time) => now - time < RENAME_WINDOW_MS);
  if (recent.length === 0) return 0;

  const last = Math.max(...recent);
  return Math.max(0, MIN_RENAME_GAP_MS - (now - last));
}

function recordRename(channelId, now = Date.now()) {
  const entry = stateFor(channelId);
  entry.renames = [...entry.renames.filter((time) => now - time < RENAME_WINDOW_MS), now];
}

// A throttled update would otherwise be lost until the next join, so it is retried once the
// rate limit allows it.
function scheduleRetry(guild, waitMs) {
  const channelId = settings.getStatsSettings().channelId;
  if (!channelId) return;

  const entry = stateFor(channelId);
  if (entry.timer) return;

  entry.timer = setTimeout(() => {
    entry.timer = null;
    syncGuildCount(guild).catch((err) =>
      console.error('Member counter failed:', err.message)
    );
  }, Math.max(waitMs, 1000) + 500);
  if (typeof entry.timer.unref === 'function') entry.timer.unref();
}

// Brings the counter channel in line with the current member count. Returns what happened so
// the commands can report it and the events can stay silent.
async function syncGuildCount(guild, { force = false } = {}) {
  if (!guild) return { updated: false, reason: 'no-guild' };

  const { channelId, template } = settings.getStatsSettings();
  if (!channelId) return { updated: false, reason: 'not-configured' };

  const channel = await findChannel(guild, channelId);
  if (!channel) return { updated: false, reason: 'channel-missing' };

  if (typeof channel.isVoiceBased === 'function' && !channel.isVoiceBased()) {
    return { updated: false, reason: 'not-voice' };
  }

  const count = Number.isFinite(guild.memberCount)
    ? guild.memberCount
    : guild.members?.cache?.size ?? 0;
  const name = renderCount(template, count, guild.name ?? '');
  if (!name) return { updated: false, reason: 'empty-name' };

  if (channel.name === name) return { updated: false, reason: 'unchanged', name };

  const me = guild.members?.me;
  const permissions =
    me && typeof channel.permissionsFor === 'function' ? channel.permissionsFor(me) : null;
  if (
    permissions &&
    typeof permissions.has === 'function' &&
    !permissions.has(PermissionFlagsBits.ManageChannels)
  ) {
    return { updated: false, reason: 'no-permission', name };
  }

  const waitMs = force ? 0 : delayUntilAllowed(stateFor(channelId).renames);
  if (waitMs > 0) {
    scheduleRetry(guild, waitMs);
    return { updated: false, reason: 'throttled', name, waitMs };
  }

  await channel.setName(name, 'Member counter');
  recordRename(channelId);
  return { updated: true, name, count };
}

module.exports = {
  MIN_RENAME_GAP_MS,
  RENAME_WINDOW_MS,
  MAX_NAME_LENGTH,
  renderCount,
  delayUntilAllowed,
  syncGuildCount,
  resetState,
};
