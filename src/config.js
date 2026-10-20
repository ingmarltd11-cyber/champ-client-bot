require('dotenv').config();

// Role names must match the server exactly (case-sensitive).
const ROLES = {
  support: 'support',
  champ: 'champ',
  champPlus: 'champ+',
  media: 'media',
  mediaManager: 'media manager',
  owner: 'owner',
  developer: 'developer',
};

// The only role allowed to use the management commands (/key, /manage and the setup-commands).
// Comma separated, so a server that spells it "Owner" or "Founder" can set OWNER_ROLE_NAME.
// The server owner (Discord's own "owner") always counts as owner too.
const OWNER_ROLE_NAMES = (process.env.OWNER_ROLE_NAME ?? ROLES.owner)
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

// Staff roles: get staff permissions and access to every ticket.
const STAFF_ROLE_NAMES = [
  ROLES.developer,
  ROLES.owner,
  ROLES.media,
  ROLES.mediaManager,
  ROLES.support,
];

// Only these roles can see a ticket and request its closure, next to the member who opened it.
// Administrators always see every channel, which Discord itself enforces.
const TICKET_STAFF_ROLE_NAMES = [ROLES.support, ROLES.developer];

// The only roles allowed to post in #announcements.
const ANNOUNCEMENT_EXEMPT_ROLE_NAMES = [
  ROLES.developer,
  ROLES.owner,
  ROLES.media,
  ROLES.mediaManager,
];

// Roles that can see every channel once verified (used by /setup-verify-gate).
const VERIFIED_VIEW_ROLE_NAMES = [
  ROLES.champ,
  ROLES.champPlus,
  ROLES.support,
  ROLES.media,
  ROLES.mediaManager,
  ROLES.owner,
  ROLES.developer,
];

const CHANNELS = {
  verify: 'verify',
  announcements: 'announcements',
  reviews: 'reviews',
};

const TICKETS = {
  categoryName: 'Tickets',
  channelPrefix: 'ticket-',
  closeDelaySeconds: 5,
  // Button colours for ticket buttons: blue, grey, green or red.
  buttonColors: { close: 'red', accept: 'red', deny: 'grey' },
  // The client versions the server supports, newest last. Any other version in a ticket gets
  // an upgrade hint from the ticket assistant. Comma separated for several builds.
  supportedVersions: (process.env.SUPPORTED_CLIENT_VERSION ?? '1.21.11')
    .split(',')
    .map((version) => version.trim())
    .filter(Boolean),
};

// Support assistant in ticket channels. Without AI_API_KEY it stays off and the bot works as before.
// Works with any OpenAI-compatible endpoint: Groq (default) or Gemini's /openai/ layer.
const AI = {
  // GROQ_API_KEY is accepted too, so a key copied from the website project works here.
  apiKey: process.env.AI_API_KEY ?? process.env.GROQ_API_KEY ?? '',
  baseUrl: (process.env.AI_BASE_URL ?? 'https://api.groq.com/openai/v1').replace(/\/+$/, ''),
  model: process.env.AI_MODEL ?? 'openai/gpt-oss-20b',
  // Optional override for the knowledge folders (default: ./knowledge).
  knowledgeDir: process.env.AI_KNOWLEDGE_DIR ?? '',
  // Website pages the assistant may read, comma separated. Only these URLs are fetched.
  siteUrls: (process.env.AI_SITE_URLS ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean),
  // Users who may ask the assistant to act (send a message, change ticket options).
  // Matched on the Discord account username, which is unique, plus optional user IDs.
  trustedUsers: (process.env.AI_TRUSTED_USERS ?? 'sora_developing,silvan')
    .split(',')
    .map((name) => name.trim().replace(/^@/, '').toLowerCase())
    .filter(Boolean),
  trustedUserIds: (process.env.AI_TRUSTED_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
  // The website runs the shared assistant. Discord sends its questions there, so both
  // channels get the same answer from the same model and knowledge. Empty disables it.
  supportApiUrl: (process.env.SUPPORT_API_URL ?? 'https://champ-site-psi.vercel.app')
    .trim()
    .replace(/\/+$/, ''),
  // Domains the assistant must never mention or link. Removed from the knowledge, the
  // question and the answer, and replaced with the official website.
  hiddenHosts: (process.env.AI_HIDDEN_HOSTS ?? 'champclient.com')
    .split(',')
    .map((host) => host.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').replace(/^www\./i, ''))
    .filter(Boolean),
  // Staying under the free tier: a few calls per minute and per ticket. An action for a
  // trusted user costs two calls (the tool round and the confirmation), so this leaves room.
  maxCallsPerMinute: Number(process.env.AI_MAX_CALLS_PER_MINUTE ?? 20),
  maxRepliesPerTicket: 6,
  cooldownMs: 10000,
  timeoutMs: 20000,
  maxAnswerChars: 1200,
};

const BRAND_COLOR = 0x9b59b6;

// The customer website. License keys made with /key are redeemed there.
const SITE_URL = (process.env.SITE_URL ?? 'https://champ-site-psi.vercel.app')
  .trim()
  .replace(/\/+$/, '');

// Channels every member can see, even before verification (base name, emoji prefix ignored).
const ALWAYS_VISIBLE_CHANNELS = ['champ.com'];

const REQUIRED_ENV = [
  'DISCORD_TOKEN',
  'CLIENT_ID',
  'GUILD_ID',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
];

function assertEnv(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
}

module.exports = {
  ROLES,
  OWNER_ROLE_NAMES,
  STAFF_ROLE_NAMES,
  TICKET_STAFF_ROLE_NAMES,
  ANNOUNCEMENT_EXEMPT_ROLE_NAMES,
  VERIFIED_VIEW_ROLE_NAMES,
  CHANNELS,
  TICKETS,
  AI,
  BRAND_COLOR,
  SITE_URL,
  ALWAYS_VISIBLE_CHANNELS,
  REQUIRED_ENV,
  assertEnv,
};
