// Ticket-opslag met twee backends:
// 1. Supabase (als SUPABASE_URL + SUPABASE_SERVICE_KEY zijn ingesteld)
// 2. Lokale JSON (data/tickets.json) als fallback.
const fs = require('fs');
const path = require('path');
const { getSupabase } = require('./supabase');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'tickets.json');

function useSupabase() {
  return getSupabase() !== null;
}

function readAll() {
  if (!fs.existsSync(DB_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeAll(data) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function fromRow(row) {
  if (!row) return null;
  return {
    channelId: row.channel_id ?? row.channelId,
    guildId: row.guild_id ?? row.guildId,
    userId: row.user_id ?? row.userId,
    typeId: row.type_id ?? row.typeId,
    status: row.status || 'open',
    claimedBy: row.claimed_by ?? row.claimedBy ?? null,
    answers: row.answers || {},
    rating: row.rating ?? null,
    ratingComment: row.rating_comment ?? row.ratingComment ?? null,
    warned: row.warned || false,
    openedAt: row.opened_at ?? row.openedAt,
    lastActivityAt: row.last_activity_at ?? row.lastActivityAt,
    closedAt: row.closed_at ?? row.closedAt ?? null,
  };
}

module.exports = {
  backend() {
    return useSupabase() ? 'supabase' : 'json';
  },

  async addTicket(channelId, info) {
    if (useSupabase()) {
      await getSupabase().from('tickets').insert({
        channel_id: channelId,
        guild_id: info.guildId,
        user_id: info.userId,
        type_id: info.typeId,
        status: 'open',
        claimed_by: null,
        answers: info.answers || {},
      });
      return;
    }
    const all = readAll();
    all[channelId] = {
      guildId: info.guildId,
      userId: info.userId,
      typeId: info.typeId,
      status: 'open',
      claimedBy: null,
      answers: info.answers || {},
      warned: false,
      openedAt: Date.now(),
      lastActivityAt: Date.now(),
    };
    writeAll(all);
  },

  async getTicket(channelId) {
    if (useSupabase()) {
      const { data } = await getSupabase().from('tickets').select('*').eq('channel_id', channelId).maybeSingle();
      return fromRow(data);
    }
    const raw = readAll()[channelId];
    return raw ? fromRow({ channelId, ...raw }) : null;
  },

  async touchTicket(channelId) {
    if (useSupabase()) {
      await getSupabase().from('tickets').update({ last_activity_at: new Date().toISOString() }).eq('channel_id', channelId).eq('status', 'open');
      return;
    }
    const all = readAll();
    if (all[channelId] && all[channelId].status !== 'closed') {
      all[channelId].lastActivityAt = Date.now();
      writeAll(all);
    }
  },

  async setWarned(channelId) {
    if (useSupabase()) {
      await getSupabase().from('tickets').update({ warned: true }).eq('channel_id', channelId);
      return;
    }
    const all = readAll();
    if (all[channelId]) {
      all[channelId].warned = true;
      writeAll(all);
    }
  },

  async claimTicket(channelId, staffId) {
    if (useSupabase()) {
      await getSupabase().from('tickets').update({ claimed_by: staffId }).eq('channel_id', channelId);
      return;
    }
    const all = readAll();
    if (all[channelId]) {
      all[channelId].claimedBy = staffId;
      writeAll(all);
    }
  },

  async closeTicket(channelId, { transcript = null } = {}) {
    if (useSupabase()) {
      const patch = { status: 'closed', closed_at: new Date().toISOString() };
      if (transcript) patch.transcript = transcript;
      await getSupabase().from('tickets').update(patch).eq('channel_id', channelId);
      return;
    }
    const all = readAll();
    if (all[channelId]) {
      all[channelId].status = 'closed';
      all[channelId].closedAt = Date.now();
      if (transcript) all[channelId].transcript = transcript;
      writeAll(all);
    }
  },

  async setRating(channelId, stars, comment) {
    if (useSupabase()) {
      await getSupabase().from('tickets').update({ rating: stars, rating_comment: comment || null }).eq('channel_id', channelId);
      return;
    }
    const all = readAll();
    if (all[channelId]) {
      all[channelId].rating = stars;
      all[channelId].ratingComment = comment || null;
      writeAll(all);
    }
  },

  async countOpenByUser(userId, typeId = null) {
    if (useSupabase()) {
      let q = getSupabase().from('tickets').select('channel_id', { count: 'exact' }).eq('user_id', userId).eq('status', 'open');
      if (typeId) q = q.eq('type_id', typeId);
      const { count } = await q;
      return count || 0;
    }
    return Object.values(readAll()).filter(
      (t) => t.userId === userId && t.status !== 'closed' && (!typeId || t.typeId === typeId)
    ).length;
  },

  async listOpenTickets() {
    if (useSupabase()) {
      const { data } = await getSupabase().from('tickets').select('*').eq('status', 'open');
      return (data || []).map(fromRow);
    }
    return Object.entries(readAll())
      .filter(([, t]) => t.status !== 'closed')
      .map(([channelId, t]) => fromRow({ channelId, ...t }));
  },

  async getStats() {
    const open = await this.listOpenTickets();
    let closed = [];
    let rated = [];
    if (useSupabase()) {
      const sb = getSupabase();
      const { data } = await sb.from('tickets').select('*').eq('status', 'closed');
      closed = (data || []).map(fromRow);
      rated = closed.filter((t) => t.rating);
    } else {
      const all = Object.entries(readAll()).map(([channelId, t]) => fromRow({ channelId, ...t }));
      closed = all.filter((t) => t.status === 'closed');
      rated = closed.filter((t) => t.rating);
    }

    const openByType = {};
    for (const t of open) openByType[t.typeId] = (openByType[t.typeId] || 0) + 1;

    const claims = {};
    for (const t of [...open, ...closed]) {
      if (t.claimedBy) claims[t.claimedBy] = (claims[t.claimedBy] || 0) + 1;
    }
    const topStaff = Object.entries(claims).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const avg = rated.length ? rated.reduce((s, t) => s + t.rating, 0) / rated.length : null;
    return { openTotal: open.length, openByType, closedTotal: closed.length, ratingsTotal: rated.length, avgRating: avg, topStaff };
  },
};
