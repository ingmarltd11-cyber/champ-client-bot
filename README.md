# Champ Client Bot

Discord bot (discord.js v14, slash commands) for the Champ Client server.

## Features

- **Verification**: `/setup-verify-gate` hides channels from unverified members; `/setup-verify` posts the green Verify button; `/verify` or the button grants the `champ` role.
- **Announcements lock**: `/setup-permissions` locks `#announcements`. Only `developer`, `owner`, `media` and `media manager` can post there.
- **Word filter**: any message containing the whole word `rat` is deleted silently.
- **Roles delete (admin)**: `/setup-roles-delete` deletes all deletable roles after a confirm button. Channels are never touched.
- **Tickets**: `/ticket-panel` posts a category menu; each choice opens a private `ticket-<username>` channel. Staff (including `support`) always have access. The opener or staff can close it with confirmation.
- **Ticket categories**: `/ticket-category add | remove | list` edits the panel categories.
- **Reviews**: `/review` posts a star rating and description in `#reviews`.

## Setup

```bash
npm install
cp .env.example .env   # Windows: copy the file manually
```

| Variable | Where to get it |
|---|---|
| `DISCORD_TOKEN` | Developer Portal -> Bot -> Token |
| `CLIENT_ID` | Developer Portal -> General Information -> Application ID |
| `GUILD_ID` | Right-click the server -> Copy Server ID (Developer Mode on) |
| `SUPABASE_URL` | Supabase -> Project Settings -> API |
| `SUPABASE_SERVICE_KEY` | Supabase -> Project Settings -> API -> `service_role` |

### Discord Developer Portal

- Bot -> **Privileged Gateway Intents** -> enable **Message Content Intent** (required by the word filter).
- Invite the bot with the `bot` and `applications.commands` scopes and at least: Manage Channels, Manage Roles, View Channels, Send Messages, Embed Links, Attach Files, Read Message History.
- The bot's role must sit above the roles it manages.

### Database

Run `supabase/schema.sql` once in the Supabase SQL editor. The bot stores tickets in the `tickets` table.

### Running

```bash
npm run deploy    # register slash commands (also runs before each Railway deploy)
npm start
npm run identity  # optional, once: set the bot name and profile picture from assets/avatar.jpg
```

## Commands

| Command | Who | Purpose |
|---|---|---|
| `/setup-verify-gate` | Admin | Hide all channels from `@everyone` except `#verify` |
| `/setup-verify` | Admin | Post the Verify panel in the current channel |
| `/verify` | Everyone | Get the `champ` role |
| `/setup-permissions` | Admin | Lock `#announcements` for regular members |
| `/setup-roles-delete` | Admin | Delete all deletable roles (confirmation required) |
| `/ticket-panel [channel]` | Admin | Post the ticket panel |
| `/ticket-category add\|remove\|list` | Admin | Manage panel categories |
| `/review stars description` | Everyone | Post a review in `#reviews` |

## Notes

- Ticket categories are stored in `data/ticket-categories.json` (git-ignored). Built-in defaults are used when that file does not exist. On hosts with an ephemeral filesystem (such as Railway), runtime changes are lost on redeploy. Re-add them with `/ticket-category`, or move the file to a persistent volume.
- The `reviews` and `announcements` channel names, the `Tickets` category name and the staff role list are set in `src/config.js`.

## Project structure

```
.
├── src/
│   ├── index.js              # entry point, event and interaction routing
│   ├── config.js             # role/channel names, env checks, constants
│   ├── deploy-commands.js    # registers slash commands to GUILD_ID
│   ├── set-identity.js       # one-off: bot name and avatar
│   ├── commands/             # one file per slash command
│   ├── features/             # verify, word filter, tickets
│   └── utils/                # permissions, supabase client, ticket store/categories
├── supabase/schema.sql
├── railway.json
└── render.yaml
```
