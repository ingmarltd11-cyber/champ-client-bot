// Supabase-client voor de bot. Zijn SUPABASE_URL en SUPABASE_SERVICE_KEY
// niet ingevuld, dan geeft dit null terug en valt ticketStore automatisch
// terug op lokale JSON-opslag (data/tickets.json).
let cached = null;
let tried = false;

function getSupabase() {
  if (tried) return cached;
  tried = true;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key || url.includes('jouw-project')) return null;
  try {
    const { createClient } = require('@supabase/supabase-js');
    cached = createClient(url, key, { auth: { persistSession: false } });
  } catch (err) {
    console.error('Supabase-client kon niet worden gemaakt, val terug op JSON:', err.message);
    cached = null;
  }
  return cached;
}

function isSupabaseEnabled() {
  return getSupabase() !== null;
}

module.exports = { getSupabase, isSupabaseEnabled };
