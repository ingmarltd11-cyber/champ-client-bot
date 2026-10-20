# Champ Client Bot

Discord bot (discord.js v14, slash commands) for the Champ Client server.

## Features

- **Verification**: `/setup-verify-gate` hides channels from unverified members; `/setup-verify` posts the green Verify button plus a 🎫 button that lets an unverified member open **one** ticket; `/verify` or the button grants the verified role. Role matching ignores capitals (`Champ` = `champ`), accepts `verified`, creates the role when it is missing, and explains exactly what to fix when the bot cannot assign it (Manage Roles or role hierarchy).
- **Announcements lock**: `/setup-permissions` locks `#announcements`. Only `developer`, `owner`, `media` and `media manager` can post there.
- **Word filter**: any message containing the whole word `rat` is deleted silently.
- **Roles delete (admin)**: `/setup-roles-delete` deletes all deletable roles after a confirm button. Channels are never touched.
- **Tickets**: `/ticket-panel` posts a category menu; each choice opens a private `ticket-<username>` channel. Staff (including `support`) always have access. Closing needs a reason. Staff close directly; the opener sends a close request that staff accept or deny. The reason is posted in the ticket and saved to Supabase.
- **Multiple ticket panels**: every panel has its own title, description and set of categories, and can be posted in its own channel. `/ticket-panels create | list | remove | set-default` manages them; `/ticket-panel panel:<name>` posts one. Old panel messages keep working.
- **Ticket categories**: `/ticket-category add | remove | list` edits the panel categories. A category can have up to 5 form questions (shown as a Discord form before the ticket opens; answers are posted in the ticket) and a custom welcome message.
- **Reviews**: `/review` posts a star rating and description in `#reviews`.
- **Teaching the bot**: the bot creates a training channel once (`🧠│ai-training`, hidden from regular members) and remembers it. Everything you teach it there applies to **everyone, in every channel**: a reply, a reaction or a lesson. `/learn` manages it too.
- **Ticket actions**: `/setrole user role` and `/ticket-actions add` give roles automatically when someone opens a ticket, for one member or for everyone, per panel or for every panel.
- **Emergency brake**: `/ai-stop` stops every AI admin action at once; `/ai-start` gives them back.

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
- Optional: enable **Server Members Intent** and set `ENABLE_GUILD_MEMBERS_INTENT=true` so the admin AI can list/search members by name. Without it, names are matched against the member cache and mentions/user IDs still work.
- Invite the bot with the `bot` and `applications.commands` scopes and at least: Manage Channels, Manage Roles, Manage Messages, Kick Members, Ban Members, Moderate Members, Create Invite, View Channels, Send Messages, Embed Links, Attach Files, Read Message History.
- The bot's role must sit above the roles it manages (needed for `/verify` and the AI role tools).

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
| `/ticket-panel [channel] [panel] [title] [description] [categories] [save]` | Admin | Post a panel; add a new panel name + `save: true` to keep it |
| `/ticket-panels create\|list\|remove\|set-default` | Admin | Manage multiple saved panels |
| `/ticket-category add\|remove\|list` | Admin | Manage panel categories |
| `/ticket-category question-add\|question-remove\|message-set\|message-clear` | Admin | Set the form questions (max 5, 45 characters each) and the welcome message of a category |
| `/review stars description` | Everyone | Post a review in `#reviews` |
| `/learn add\|lesson\|list\|remove\|clear\|channel` | Admin / trusted | Teach replies, reactions and lessons; show the training channel |
| `/setrole user role` | Admin / trusted | Give the role now and every time that member opens a ticket |
| `/ticket-actions list\|add\|remove\|clear` | Admin / trusted | Manage the roles given when a ticket opens |
| `/ai-stop` | Admin / trusted | Immediately stop every AI admin action |
| `/ai-start` | Admin / trusted | Turn the AI admin actions back on |

## Notes

- Ticket categories are stored in `data/ticket-categories.json`, panels in `data/ticket-panels.json` and the AI settings (stop switch, learned rules, lessons, ticket actions) in `data/bot-settings.json` (all git-ignored). Built-in defaults are used when that file does not exist. On Railway the container filesystem is wiped on every deploy, so without a volume the settings reset to the defaults. To keep them: in Railway, add a **Volume** to the service with mount path `/data`, then set the variable `DATA_DIR=/data`. The bot logs `Ticket categories: ... loaded from ...` at startup, so you can confirm which file it uses.
- The `reviews` and `announcements` channel names, the `Tickets` category name and the staff role list are set in `src/config.js`.

## AI support in tickets

The assistant answers the opener in every ticket, whatever the category, and answers anyone who mentions the bot in a normal channel. It answers normal questions, small talk and general knowledge questions as well as product questions, and it remembers the last few messages of the channel so follow-up questions still make sense. Asking about modules or features gets a link to the features page of the configured website straight away (taken from the crawled pages, so `features.html` or `/features` both work).

Two accounts can also ask it to act, not just answer: `sora_developing` and `silvan` by default (`AI_TRUSTED_USERS`, or exact IDs via `AI_TRUSTED_USER_IDS`). They are recognised by Discord account username, never by display name, so nobody can rename themselves into permission.

For those accounts the assistant has **full server administration**. It executes the request immediately, without a confirmation step, including destructive actions:

| Area | Actions |
|---|---|
| Messages | send, read, delete one message, purge up to 100 recent messages (optionally only from one member or containing text) |
| Channels | create, rename, change topic/slowmode/NSFW/category, lock or unlock, delete |
| Roles | create, rename/recolour, assign, remove, delete |
| Members | kick, ban (with message cleanup), unban, timeout, clear timeout |
| Invites | create an invite link |
| Server info | list channels, roles and members |
| Tickets | add/edit/remove categories, create/update panels, post a panel |

Safety rails that remain: the server owner, the bot itself and `@everyone` cannot be the target, and Discord's own role hierarchy and permissions still apply. Every action is written to the Railway logs and to Discord's audit log with `Champ AI: <user> (<id>)` as the reason. Everyone else only gets answers and never sees that these actions exist.

> ⚠️ Keep `AI_TRUSTED_USERS`/`AI_TRUSTED_USER_IDS` tight. Anyone on that list can delete channels and roles and ban members through plain chat.

Run `/ai-stop` to take those powers away at once; `/ai-start` gives them back. The stop switch and everything the bot learned are kept in `data/bot-settings.json`, so mount a Railway volume at `/data` and set `DATA_DIR=/data` to survive redeploys. While the actions are stopped the bot still answers questions, and a tool call is refused with a message that says so.

It also treats `champclient.com` (and every spelling of it) as non-existent: the domain is removed from the crawled pages, from the question and from its own answer, and replaced with the official website. So it can never mention or link it.

The one hard limit: it never gives code, never explains how to get code, and never links to code hosting. A code question is refused before the model is even called. When a product detail is missing from the knowledge base, it stops answering that ticket and pings the support role instead. It is switched off unless `AI_API_KEY` is set, so the bot works normally without it.

The website runs the shared answer engine: Discord sends its questions to `https://champ-site-psi.vercel.app/api/ai/chat` (override with `SUPPORT_API_URL`), so the website chat and the bot answer from the same model and knowledge. When that endpoint is unavailable the bot falls back to its own model, which is also what powers the trusted-user actions. The website's model key lives in Vercel as `GROQ_API_KEY` or `AI_API_KEY`; the bot's `AI_API_KEY` is only used for the fallback.

Its fallback answers come from your website, plus any `.md` or `.txt` files in `knowledge/website/` and `knowledge/mod/`. Set `AI_SITE_URLS` to the pages the bot may read (comma separated); each page is stripped to text, split by heading and matched to the question, and cached for 10 minutes. Only the URLs you list are fetched, so a question can never point it at another site. Pages that fail to load are skipped. See `knowledge/README.md` for the local documents.

Set these variables (Railway → Variables):

| Variable | Required | Meaning |
| --- | --- | --- |
| `AI_API_KEY` | yes, to enable | Key from Groq or Google AI Studio. `GROQ_API_KEY` is accepted as a fallback |
| `AI_BASE_URL` | no | Defaults to `https://api.groq.com/openai/v1`. For Gemini use `https://generativelanguage.googleapis.com/v1beta/openai` |
| `AI_MODEL` | no | Defaults to `openai/gpt-oss-20b`. For Gemini use e.g. `gemini-3.5-flash-lite` |
| `AI_SITE_URLS` | recommended | Comma-separated website pages to read, e.g. `https://example.com/support,https://example.com/faq` |
| `AI_HIDDEN_HOSTS` | no | Domains the assistant must never mention, defaults to `champclient.com`. Comma separated; every mention is replaced with the official website |
| `AI_TRUSTED_USERS` | no | Discord usernames allowed to make the assistant act, defaults to `sora_developing,silvan` |
| `AI_TRUSTED_USER_IDS` | no | User IDs allowed to act, comma separated. Safer than usernames; use this when an account is renamed |
| `AI_MAX_CALLS_PER_MINUTE` | no | Model calls per minute, defaults to `20`. An action uses two or more calls |
| `ENABLE_GUILD_MEMBERS_INTENT` | no | `true` requests the Server Members Intent, so the AI can list/search members by name. Enable it in the Developer Portal first |
| `VERIFIED_ROLE_NAME` | no | Role granted by `/verify`, defaults to `champ` (also tried case-insensitively, plus `verified`). Created when missing |
| `UNVERIFIED_ROLE_NAME` | no | Optional role removed on successful verification, defaults to `unverified` |
| `DATA_DIR` | no | Folder for `ticket-categories.json`, `ticket-panels.json` and `bot-settings.json`; use a Railway volume such as `/data` |
| `SUPPORT_API_URL` | no | Website that runs the shared assistant, defaults to `https://champ-site-psi.vercel.app`. Empty disables the shared engine |
| `AI_KNOWLEDGE_DIR` | no | Folder with the `website` and `mod` knowledge folders, defaults to `./knowledge` |

Any OpenAI-compatible endpoint works, because the bot only calls `/chat/completions`.

## Learning in the training channel

At startup the bot creates `🧠│ai-training` (only staff and administrators can see it) and posts short instructions. Ping the bot (`@bot ...`) when you talk to it there, because the assistant only answers mentions. Say what you want in your own words:

- `reageer op elk bericht met poep` → it replies `poep` to **every message from everyone**, in every channel
- `als iemand hallo zegt, antwoord met hey` → it replies `hey` to messages containing "hallo"
- `reageer met 🔥 op elk bericht met fire` → it adds that reaction instead of a reply
- `onthou dat we nooit korting geven` → a lesson, added to what the assistant knows

The assistant turns those sentences into saved rules with its own tools, so a rule survives a restart and needs no mention, no slash command and no model call. The equivalent commands are `/learn add trigger:<text|*> response:<text> [react:true]`, `/learn lesson`, `/learn list`, `/learn remove`, `/learn clear`, and `/learn channel` to recreate the channel, refresh its permissions and give yourself access. A learned rule answers first; when none matches, the normal AI support handles the message.

## Ticket actions

`/setrole user role` gives the role now **and** every time that member opens a ticket. `/ticket-actions add role [user] [panel]` does the same without the immediate role: leave `user` out for everyone, leave `panel` out for every panel. `/ticket-actions list` shows them, `remove` takes one away and `clear` removes a member's actions or everything. A role the bot cannot hand out (too high, managed by an integration, missing permission) is reported in the ticket instead of breaking it.

## Project structure

```
.
├── src/
│   ├── index.js              # entry point, event and interaction routing
│   ├── config.js             # role/channel names, env checks, constants
│   ├── deploy-commands.js    # registers slash commands to GUILD_ID
│   ├── set-identity.js       # one-off: bot name and avatar
│   ├── commands/             # one file per slash command
│   ├── features/             # verify, word filter, tickets, AI support + action tools
│   └── utils/                # permissions, supabase client, ticket store/categories/panels
├── supabase/schema.sql
├── railway.json
└── render.yaml
```
