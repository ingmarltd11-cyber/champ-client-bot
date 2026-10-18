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

// Staff roles: get staff permissions and access to every ticket.
const STAFF_ROLE_NAMES = [
  ROLES.developer,
  ROLES.owner,
  ROLES.media,
  ROLES.mediaManager,
  ROLES.support,
];

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
};

const BRAND_COLOR = 0x9b59b6;

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
  STAFF_ROLE_NAMES,
  ANNOUNCEMENT_EXEMPT_ROLE_NAMES,
  VERIFIED_VIEW_ROLE_NAMES,
  CHANNELS,
  TICKETS,
  BRAND_COLOR,
  ALWAYS_VISIBLE_CHANNELS,
  REQUIRED_ENV,
  assertEnv,
};
