# Champ Client Bot

Discord bot (discord.js v14, slash commands) for the Champ Client server.

## Features

- **Verification**: `/setup-verify-gate` hides channels from unverified members; `/setup-verify` posts the green Verify button; `/verify` or the button grants the `champ` role.
- **Announcements lock**: `/setup-permissions` locks `#announcements`. Only `developer`, `owner`, `media` and `media manager` can post there.
- **Word filter**: any message containing the whole word `rat` is deleted silently.
- **Roles delete (admin)**: `/setup-roles-delete` deletes all deletable roles after a confirm button. Channels are never touched.
- **Tickets**: `/ticket-panel` posts a category menu; each choice opens a private `ticket-<username>` channel. Staff (including `support`) always have access. Closing needs a reason. Staff close directly; the opener sends a close request that staff accept or deny. The reason is posted in the ticket and saved to Supabase.
- **Ticket categories**: `/ticket-category add | remove | list` edits the panel categories. A category can have up to 5 form questions (shown as a Discord form before the ticket opens; answers are posted in the ticket) and a custom welcome message.
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
| `/server-setup-chanel-create categorie naam [emoji]` | Admin | Create a channel in the server style (`emoji│name`) inside a category, creating the category when needed |
| `/ticket-panel [channel]` | Admin | Post the ticket panel |
| `/ticket-category add\|remove\|list` | Admin | Manage panel categories |
| `/ticket-category question-add\|question-remove\|message-set\|message-clear` | Admin | Set the form questions (max 5, 45 characters each) and the welcome message of a category |
| `/review stars description` | Everyone | Post a review in `#reviews` |

## Notes

- Ticket categories are stored in `data/ticket-categories.json` (git-ignored). Built-in defaults are used when that file does not exist. On Railway the container filesystem is wiped on every deploy, so without a volume the settings reset to the defaults. To keep them: in Railway, add a **Volume** to the service with mount path `/data`, then set the variable `DATA_DIR=/data`. The bot logs `Ticket categories: ... loaded from ...` at startup, so you can confirm which file it uses.
- The `reviews` and `announcements` channel names, the `Tickets` category name and the staff role list are set in `src/config.js`.

## AI support in tickets

The assistant answers the opener in every ticket, whatever the category, and answers anyone who mentions the bot in a normal channel. It answers normal questions, small talk and general knowledge questions as well as product questions, and it remembers the last few messages of the channel so follow-up questions still make sense. Asking about modules or features gets a link to the `/features` page of the configured website straight away.

The one hard limit: it never gives code, never explains how to get code, and never links to code hosting. A code question is refused before the model is even called. When a product detail is missing from the knowledge base, it stops answering that ticket and pings the support role instead. It is switched off unless `AI_API_KEY` is set, so the bot works normally without it.

Its answers come from your website, plus any `.md` or `.txt` files in `knowledge/website/` and `knowledge/mod/`. Set `AI_SITE_URLS` to the pages the bot may read (comma separated); each page is stripped to text, split by heading and matched to the question, and cached for 10 minutes. Only the URLs you list are fetched, so a question can never point it at another site. Pages that fail to load are skipped. See `knowledge/README.md` for the local documents.

Set these variables (Railway → Variables):

| Variable | Required | Meaning |
| --- | --- | --- |
| `AI_API_KEY` | yes, to enable | Key from Groq or Google AI Studio |
| `AI_BASE_URL` | no | Defaults to `https://api.groq.com/openai/v1`. For Gemini use `https://generativelanguage.googleapis.com/v1beta/openai` |
| `AI_MODEL` | no | Defaults to `openai/gpt-oss-20b`. For Gemini use e.g. `gemini-3.5-flash-lite` |
| `AI_SITE_URLS` | recommended | Comma-separated website pages to read, e.g. `https://example.com/support,https://example.com/faq` |
| `AI_KNOWLEDGE_DIR` | no | Folder with the `website` and `mod` knowledge folders, defaults to `./knowledge` |

Any OpenAI-compatible endpoint works, because the bot only calls `/chat/completions`.

## Project structure

```
.
├── src/
│   ├── index.js              # entry point, event and interaction routing
│   ├── config.js             # role/channel names, env checks, constants
│   ├── deploy-commands.js    # registers slash commands to GUILD_ID
│   ├── set-identity.js       # one-off: bot name and avatar
│   ├── commands/             # one file per slash command
│   ├── features/             # verify, word filter, tickets, AI support
│   └── utils/                # permissions, supabase client, ticket store/categories
├── supabase/schema.sql
├── railway.json
└── render.yaml
```
