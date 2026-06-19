/**
 * Tiny Supabase REST (PostgREST) client built on native fetch (Node 18+).
 * No npm dependency on @supabase/supabase-js — keeps the USSD backend
 * independent and install-free. Uses the service-role key (bypasses RLS),
 * exactly like the main MOVEXA backend's config/supabase.js.
 */
const SB_URL = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

function headers(extra = {}) {
  const key = SB_KEY();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/** GET rows. `query` is a PostgREST query string e.g. "routes?select=*&limit=5". */
async function select(query) {
  const res = await fetch(`${SB_URL()}/rest/v1/${query}`, { headers: headers() });
  if (!res.ok) throw new Error(`Supabase select failed (${res.status}): ${await res.text()}`);
  return res.json();
}

/** INSERT a row (or array of rows). Returns inserted representation. */
async function insert(table, row) {
  const res = await fetch(`${SB_URL()}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase insert failed (${res.status}): ${await res.text()}`);
  return res.json();
}

/**
 * UPSERT on a conflict column (requires a UNIQUE constraint on that column).
 * Used for ussd_sessions keyed by session_id.
 */
async function upsert(table, row, onConflict) {
  const res = await fetch(`${SB_URL()}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase upsert failed (${res.status}): ${await res.text()}`);
  return res.json();
}

/** PATCH rows matching a filter. `filter` e.g. "session_id=eq.abc". */
async function update(table, filter, patch) {
  const res = await fetch(`${SB_URL()}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Supabase update failed (${res.status}): ${await res.text()}`);
  return res.json();
}

/** Escape a value for use inside a PostgREST ilike filter. */
function ilikeValue(s) {
  return encodeURIComponent(`%${String(s).trim()}%`);
}

module.exports = { select, insert, upsert, update, ilikeValue };
