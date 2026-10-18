const { getSupabase } = require('./supabase');

// Only tickets are stored in Supabase (see supabase/schema.sql).
async function saveTicketOpened({ channelId, guildId, userId, typeId }) {
  const { error } = await getSupabase().from('tickets').insert({
    channel_id: channelId,
    guild_id: guildId,
    user_id: userId,
    type_id: typeId,
    status: 'open',
  });
  if (error) throw new Error(`Could not save opened ticket: ${error.message}`);
}

async function saveTicketClosed({ channelId, closedBy, reason }) {
  const { error } = await getSupabase()
    .from('tickets')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      close_reason: reason ?? null,
      closed_by: closedBy ?? null,
    })
    .eq('channel_id', channelId);
  if (error) throw new Error(`Could not save closed ticket: ${error.message}`);
}

module.exports = { saveTicketOpened, saveTicketClosed };
