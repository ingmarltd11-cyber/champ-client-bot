const { createClient } = require('@supabase/supabase-js');

let client = null;

// Server-side only: uses the service role key, so never expose it to clients.
function getSupabase() {
  if (!client) {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });
  }
  return client;
}

module.exports = { getSupabase };
