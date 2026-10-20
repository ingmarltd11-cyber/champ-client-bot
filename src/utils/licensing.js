const crypto = require('crypto');

// The customer website (champ-site) owns the `licenses` table. The bot writes to the same
// table through SUPABASE_URL / SUPABASE_SERVICE_KEY, so a key made here can be redeemed on
// the dashboard at once (POST /api/license/redeem) and works with the client's
// /api/license/validate check.
const TABLE = 'licenses';

const PLANS = ['monthly', 'lifetime'];

// Same shape the website generates: CHAMP-1A2B-3C4D-5E6F-7A8B.
const KEY_PREFIX = 'CHAMP';
const KEY_PATTERN = /^CHAMP-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;

// A key that is not sold to a customer yet needs a row, and the table requires an email.
// The placeholder is unique per key, never belongs to a user and is replaced by the real
// account email the moment the customer redeems the key.
const UNASSIGNED_DOMAIN = 'keys.champclient.local';
const UNASSIGNED_PREFIX = 'unassigned+';

const DEFAULT_MONTHLY_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_AMOUNT = 25;
const MAX_KEY_ATTEMPTS = 5;

function newLicenseKey(randomBytes = crypto.randomBytes) {
  const parts = [];
  for (let index = 0; index < 4; index += 1) {
    parts.push(randomBytes(2).toString('hex').toUpperCase());
  }
  return `${KEY_PREFIX}-${parts.join('-')}`;
}

function normalizeKey(value) {
  return String(value ?? '').trim().toUpperCase();
}

function isLicenseKey(value) {
  return KEY_PATTERN.test(normalizeKey(value));
}

function unassignedEmail(key) {
  return `${UNASSIGNED_PREFIX}${normalizeKey(key).toLowerCase()}@${UNASSIGNED_DOMAIN}`;
}

function isUnassignedEmail(email) {
  return String(email ?? '').toLowerCase().endsWith(`@${UNASSIGNED_DOMAIN}`);
}

// Monthly keys get a month by default, lifetime keys never expire unless days is given.
function expiryFor(plan, days, now = new Date()) {
  const amount = Number(days);
  if (Number.isFinite(amount) && amount > 0) {
    return new Date(now.getTime() + amount * DAY_MS);
  }
  if (plan === 'monthly') return new Date(now.getTime() + DEFAULT_MONTHLY_DAYS * DAY_MS);
  return null;
}

function licenseActive(license, now = new Date()) {
  if (!license || license.status !== 'active') return false;
  if (!license.expires_at) return true;
  const expires = new Date(license.expires_at);
  if (Number.isNaN(expires.getTime())) return true;
  return expires > now;
}

function isUniqueViolation(error) {
  // Postgres unique_violation, which Supabase returns as a string code.
  return error?.code === '23505';
}

async function findLicenseByKey(supabase, key) {
  const normalized = normalizeKey(key);
  if (!isLicenseKey(normalized)) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('license_key', normalized)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// One license per email and plan (unique index), exactly like the website's grant_license:
// asking again reactivates the existing key instead of creating a second one.
async function createLicenseForEmail(supabase, { plan, email, expiresAt, now = new Date() }) {
  const address = String(email).trim().toLowerCase();
  const lookup = await supabase
    .from(TABLE)
    .select('*')
    .eq('email', address)
    .eq('plan_type', plan)
    .limit(1)
    .maybeSingle();
  if (lookup.error) throw lookup.error;

  if (lookup.data) {
    const update = await supabase
      .from(TABLE)
      .update({ status: 'active', expires_at: expiresAt, updated_at: now.toISOString() })
      .eq('id', lookup.data.id)
      .select()
      .single();
    if (update.error) throw update.error;
    return { license: update.data, reused: true };
  }

  for (let attempt = 0; attempt < MAX_KEY_ATTEMPTS; attempt += 1) {
    const key = newLicenseKey();
    const insert = await supabase
      .from(TABLE)
      .insert({
        email: address,
        plan_type: plan,
        license_key: key,
        status: 'active',
        expires_at: expiresAt,
        updated_at: now.toISOString(),
      })
      .select()
      .single();

    if (!insert.error) return { license: insert.data, reused: false };
    if (!isUniqueViolation(insert.error)) throw insert.error;

    // The email+plan row may have appeared between the lookup and the insert.
    const clash = await supabase
      .from(TABLE)
      .select('*')
      .eq('email', address)
      .eq('plan_type', plan)
      .limit(1)
      .maybeSingle();
    if (clash.error) throw clash.error;
    if (clash.data) return { license: clash.data, reused: true };
  }

  throw new Error('Could not generate a unique license key, please try again.');
}

// A key without a customer: the placeholder email makes the row valid, the customer's
// account email replaces it when they redeem the key on the website.
async function createUnassignedLicense(supabase, { plan, expiresAt, now = new Date() }) {
  for (let attempt = 0; attempt < MAX_KEY_ATTEMPTS; attempt += 1) {
    const key = newLicenseKey();
    const insert = await supabase
      .from(TABLE)
      .insert({
        email: unassignedEmail(key),
        plan_type: plan,
        license_key: key,
        status: 'active',
        expires_at: expiresAt,
        updated_at: now.toISOString(),
      })
      .select()
      .single();
    if (!insert.error) return { license: insert.data, reused: false };
    if (!isUniqueViolation(insert.error)) throw insert.error;
  }

  throw new Error('Could not generate a unique license key, please try again.');
}

async function generateLicenses(supabase, { plan, amount = 1, email = '', days, now = new Date() }) {
  if (!PLANS.includes(plan)) throw new Error(`Unknown plan: ${plan}`);
  const count = Math.min(Math.max(Math.trunc(Number(amount) || 1), 1), MAX_AMOUNT);
  const expiresAt = expiryFor(plan, days, now)?.toISOString() ?? null;
  const address = String(email ?? '').trim();

  const licenses = [];
  for (let index = 0; index < count; index += 1) {
    const created = address
      ? await createLicenseForEmail(supabase, { plan, email: address, expiresAt, now })
      : await createUnassignedLicense(supabase, { plan, expiresAt, now });
    licenses.push(created.license);
  }
  return licenses;
}

async function listLicenses(supabase, { search = '', limit = 10 } = {}) {
  const size = Math.min(Math.max(Math.trunc(Number(limit) || 10), 1), 25);
  const term = String(search ?? '').trim();
  let query = supabase.from(TABLE).select('*');
  if (term) {
    query = isLicenseKey(term)
      ? query.eq('license_key', normalizeKey(term))
      : query.ilike('email', `%${term.toLowerCase()}%`);
  }
  const { data, error } = await query.order('created_at', { ascending: false }).limit(size);
  if (error) throw error;
  return data ?? [];
}

async function setLicenseStatus(supabase, key, status, now = new Date()) {
  const normalized = normalizeKey(key);
  const { data, error } = await supabase
    .from(TABLE)
    .update({ status, updated_at: now.toISOString() })
    .eq('license_key', normalized)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

function revokeLicense(supabase, key, now = new Date()) {
  return setLicenseStatus(supabase, key, 'revoked', now);
}

function restoreLicense(supabase, key, now = new Date()) {
  return setLicenseStatus(supabase, key, 'active', now);
}

async function deleteLicense(supabase, key) {
  const normalized = normalizeKey(key);
  const { data, error } = await supabase
    .from(TABLE)
    .delete()
    .eq('license_key', normalized)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

module.exports = {
  PLANS,
  KEY_PATTERN,
  UNASSIGNED_DOMAIN,
  DEFAULT_MONTHLY_DAYS,
  MAX_AMOUNT,
  newLicenseKey,
  normalizeKey,
  isLicenseKey,
  unassignedEmail,
  isUnassignedEmail,
  expiryFor,
  licenseActive,
  findLicenseByKey,
  generateLicenses,
  listLicenses,
  revokeLicense,
  restoreLicense,
  deleteLicense,
};
