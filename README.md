# Champ Client Bot

Discord bot (discord.js v14, slash commands) for the Champ Client server.

## Features

- **Verification**: `/setup-verify-gate` hides channels from unverified members; `/setup-verify` posts the green Verify button plus a 🎫 button that lets an unverified member open **one** ticket; `/verify` or the button grants the verified role. Role matching ignores capitals (`Champ` = `champ`), accepts `verified`, creates the role when it is missing, and explains exactly what to fix when the bot cannot assign it (Manage Roles or role hierarchy).
- **Announcements lock**: `/setup-permissions` locks `#announcements`. Only `developer`, `owner`, `media` and `media manager` can post there.
- **Word filter**: any message containing the whole word `rat` is deleted silently.
- **Roles delete (admin)**: `/setup-roles-delete` deletes all deletable roles after a confirm button. Channels are never touched.
- **Tickets**: `/ticket-panel` posts a category menu; each choice opens a private `ticket-<username>` channel. Staff (including `support`) always have access. Closing needs a reason. Staff close directly; the opener sends a close request that staff accept or deny. The reason is posted in the ticket and saved to Supabase.
- **Multiple ticket panels**: every panel has its own title, description and set of categories, and can be posted in its own channel. `/ticket-panels create | list | remove | set-default` manages them; `/ticket-panel panel:<name>` posts one. Old panel messages keep working.
- **Ticket categories**: `/ticket-category` edits the categories of one panel, so every subcommand starts with `panel:<name>` and picks the category by the `name` shown on that panel (the ID still works). `/ticket-category add` also attaches the new category to that panel. A category can have up to 5 form questions (shown as a Discord form before the ticket opens; answers are posted in the ticket) and a custom welcome message. Example: `/ticket-category question-add panel:media name:"General Support" text:"What do you need?"`.
- **Reviews**: `/review` posts a star rating and description in `#reviews`.
- **Teaching the bot**: the bot creates a training channel once (`🧠│ai-training`, hidden from regular members) and remembers it. Everything you teach it there applies to **everyone, in every channel**: a reply, a reaction or a lesson. `/learn` manages it too.
- **Ticket actions**: `/setrole user role` and `/ticket-actions add` give roles automatically when someone opens a ticket, for one member or for everyone, per panel or for every panel.
- **License keys**: `/key generate` makes `CHAMP-XXXX-XXXX-XXXX-XXXX` keys in the website's `licenses` table, free to hand out or already linked to a customer's email. `/key list | revoke | restore | delete` manages them.
- **Server management**: `/manage` creates and deletes channels, categories and roles, edits roles, assigns and removes them, and sets channel permissions per role or member.
- **Welcome message**: `/welcome` picks the channel and the custom text sent when someone joins, with `{user}`, `{name}`, `{display}`, `{server}`, `{count}` and `{created}` filled in. Bots are never welcomed, and a message that contains `@everyone` never pings the server.
- **Member counter**: `/membercount` keeps a voice channel name in sync with the member count (on join, on leave, at startup and every 30 minutes), spaced out for Discord's channel rename rate limit.
- **Owner only**: `/key`, `/manage`, `/welcome`, `/membercount` and every setup command are reserved for the `owner` role (and the Discord server owner). Everyone else is refused, even with Administrator.
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
- Optional: enable **Server Members Intent** and set `ENABLE_GUILD_MEMBERS_INTENT=true` so the admin AI can list/search members by name, and so the welcome message and the member counter receive join and leave events. Without it, names are matched against the member cache, and the welcome message and counter are not updated by joins or leaves (the counter is only corrected at startup and on its 30 minute refresh).
- Invite the bot with the `bot` and `applications.commands` scopes and at least: Manage Channels, Manage Roles, Manage Messages, Kick Members, Ban Members, Moderate Members, Create Invite, View Channels, Send Messages, Embed Links, Attach Files, Read Message History.
- The bot's role must sit above the roles it manages (needed for `/verify` and the AI role tools).

### Database

Run `supabase/schema.sql` once in the Supabase SQL editor. The bot stores tickets in the `tickets` table.

Use the **same Supabase project as the website** (and run `website/supabase/schema.sql` there too). `/key` writes to the website's `licenses` table, so a key made in Discord is redeemable on the dashboard straight away and the launcher's `/api/license/validate` check accepts it.

### Running

```bash
npm run deploy    # register slash commands (also runs before each Railway deploy)
npm start
npm run identity  # optional, once: set the bot name and profile picture from assets/avatar.jpg
```

## Commands

| Command | Who | Purpose |
|---|---|---|
| `/setup-verify-gate` | Owner | Hide all channels from `@everyone` except `#verify` |
| `/setup-verify` | Owner | Post the Verify panel in the current channel |
| `/verify` | Everyone | Get the `champ` role |
| `/setup-permissions` | Owner | Lock `#announcements` for regular members |
| `/setup-roles` | Owner | Create the server roles that do not exist yet |
| `/setup-roles-delete` | Owner | Delete all deletable roles (confirmation required) |
| `/setup-server` | Owner | Create the categories and channels from `src/server-structure.js` |
| `/setup-server-delete` | Owner | Delete all channels and categories (confirmation required) |
| `/server-setup-chanel-create categorie naam [emoji]` | Owner | Create a channel in the server style (`emoji│name`) inside a category, creating the category when needed |
| `/manage channel-create\|channel-delete\|category-create` | Owner | Create channels (text, voice, forum, announcement) and categories, delete them with `confirm: true` |
| `/manage role-create\|role-edit\|role-delete\|role-assign\|role-remove` | Owner | Create, recolour, rename, delete, assign and remove roles |
| `/manage perms channel [role] [user] [allow] [deny] [reset]` | Owner | Set or remove a channel permission overwrite, e.g. `allow: view,send` |
| `/welcome channel\|message\|test\|show\|disable` | Owner | Pick the join channel and write the custom welcome message |
| `/membercount channel\|format\|update\|show\|disable` | Owner | Keep a voice channel showing the member count |
| `/key generate plan\|list\|revoke\|restore\|delete` | Owner | Create and manage license keys |
| `/botmessage channel info` | Owner | Post a message as the bot |
| `/ticket-panel [channel] [panel] [title] [description] [categories] [save]` | Owner | Post a panel; add a new panel name + `save: true` to keep it |
| `/ticket-panels create\|list\|remove\|set-default` | Owner | Manage multiple saved panels |
| `/ticket-category add\|remove\|list` | Owner | Manage the categories of one panel (`panel:` and `name:`) |
| `/ticket-category question-add\|question-remove\|message-set\|message-clear` | Owner | Set the form questions (max 5, 45 characters each) and the welcome message of a category on a panel |
| `/close [reason]` | `support` / `developer` | Close the ticket at once |
| `/close-request [reason]` | `support` / `developer` | Ping the opener and ask them to accept or deny the close request |
| `/review stars description` | Everyone | Post a review in `#reviews` |
| `/learn add\|lesson\|list\|remove\|clear\|channel` | Admin / trusted | Teach replies, reactions and lessons; show the training channel |
| `/setrole user role` | Owner | Give the role now and every time that member opens a ticket |
| `/ticket-actions list\|add\|remove\|clear` | Owner | Manage the roles given when a ticket opens |
| `/ai-stop` | Owner | Immediately stop every AI admin action |
| `/ai-start` | Owner | Turn the AI admin actions back on |

## Notes

- Ticket categories are stored in `data/ticket-categories.json`, panels in `data/ticket-panels.json` and the AI settings (stop switch, learned rules, lessons, ticket actions) in `data/bot-settings.json` (all git-ignored). Built-in defaults are used when that file does not exist. On Railway the container filesystem is wiped on every deploy, so without a volume the settings reset to the defaults. To keep them: in Railway, add a **Volume** to the service with mount path `/data`, then set the variable `DATA_DIR=/data`. The bot logs `Ticket categories: ... loaded from ...` at startup, so you can confirm which file it uses.
- The `reviews` and `announcements` channel names, the `Tickets` category name and the staff role list are set in `src/config.js`.

## AI support in tickets

The assistant answers the opener in every ticket, whatever the category, and answers anyone who mentions the bot in a normal channel. In a ticket the opener does not need to ping: every message they write is answered automatically, and a new ticket gets an answer to its intake form straight away (unless the ticket assistant already answered it, for example about an old client version). A ticket post in a forum works the same way. To keep it calm, the opener gets at most 6 answers per ticket with a 10 second pause in between, staff messages are left to staff, and a ticket that is handed over to staff stays quiet. It answers normal questions, small talk and general knowledge questions as well as product questions, and it remembers the last few messages of the channel so follow-up questions still make sense. Asking about modules or features gets a link to the features page of the configured website straight away (taken from the crawled pages, so `features.html` or `/features` both work).

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
| `OWNER_ROLE_NAME` | no | Role(s) allowed to use `/key`, `/manage` and the setup commands, defaults to `owner`. Comma separated; the Discord server owner always counts |
| `SITE_URL` | no | Customer website shown in the `/key` reply, defaults to `https://champ-site-psi.vercel.app` |
| `SUPPORT_API_URL` | no | Website that runs the shared assistant, defaults to `https://champ-site-psi.vercel.app`. Empty disables the shared engine |
| `AI_KNOWLEDGE_DIR` | no | Folder with the `website` and `mod` knowledge folders, defaults to `./knowledge` |

Any OpenAI-compatible endpoint works, because the bot only calls `/chat/completions`.

## Learning in the training channel

At startup the bot creates `🧠│ai-training` (only staff and administrators can see it) and posts short instructions. Ping the bot (`@bot ...`) when you talk to it there, because the assistant only answers mentions. Say what you want in your own words:

- `reageer op elk bericht met poep` → it replies `poep` to **every message from everyone**, in every channel
- `als iemand hallo zegt, antwoord met hey` → it replies `hey` to messages containing "hallo"
- `reageer met 🔥 op elk bericht met fire` → it adds that reaction instead of a reply
- `onthou dat we nooit korting geven` → a lesson, added to what the assistant knows

The assistant turns those sentences into saved rules with its own tools, so a rule survives a restart and needs no mention, no slash command and no model call. The equivalent commands are `/learn add trigger:<text|*> response:<text> [react:true]`, `/learn lesson`, `/learn list`, `/learn remove`, `/learn clear`, and `/learn channel` to recreate the channel, refresh its permissions and give yourself access. `/learn remove` takes the rule's number from `/learn list`, its ID, its trigger or the text it replies with, so an unwanted catch-all like `ik praat nederlands` can be removed by what the bot keeps saying. A concrete trigger always wins over a `*` rule, and a newer `*` rule replaces the answer of an older one. When no rule matches, the normal AI support handles the message.

## Ticket actions

`/setrole user role` gives the role now **and** every time that member opens a ticket. `/ticket-actions add role [user] [panel]` does the same without the immediate role: leave `user` out for everyone, leave `panel` out for every panel. `/ticket-actions list` shows them, `remove` takes one away and `clear` removes a member's actions or everything. A role the bot cannot hand out (too high, managed by an integration, missing permission) is reported in the ticket instead of breaking it.

## Welcome message and member counter

One channel receives the welcome message, written by the owner:

```
/welcome channel channel:#welcome
/welcome message text:👋 Welcome {user} to **{server}**! You are member **#{count}**.\nRead the rules first.
/welcome test          # posts it now, as a preview
/welcome show          # the saved channel, text and a preview
/welcome disable       # stop welcoming; the text is kept
```

Placeholders: `{user}` (mention, the only mention that may ping), `{mention}`, `{name}` (account name), `{display}` (server display name), `{tag}`, `{id}`, `{server}`, `{count}` and `{created}` (account age as a Discord date). A literal `\n` becomes a line break, and text Discord cannot render is left alone. Bots are never welcomed.

The counter is a voice channel the bot renames:

```
/membercount channel channel:#Members lock:true
/membercount format text:👥 Members: {count}
/membercount update    # refresh now
/membercount show
/membercount disable
```

`lock: true` (the default) denies **Connect** for `@everyone`, so nobody can sit in the counter channel. Discord allows two channel renames per 10 minutes; updates are spaced 5 minutes apart, and a skipped update is retried shortly after instead of being lost. The channel is also refreshed at startup and every 30 minutes, so the number stays right after a restart. Both settings live in `data/bot-settings.json` (`DATA_DIR`), so mount a volume to keep them across deploys.

Both features need the **Server Members Intent**: enable it in the Developer Portal and set `ENABLE_GUILD_MEMBERS_INTENT=true`. Without it the bot still starts (and says so in the log), but joins and leaves are never delivered.

## Owner-only commands

`/key`, `/manage`, `/welcome`, `/membercount` and every `setup-*` command are reserved for the **owner** role. The check runs once in `src/index.js`: a command declares `access: 'owner'` and is refused with an ephemeral message for anyone else, even a Discord administrator. The Discord server owner always counts as owner, so the server can never lock itself out. The role name comes from `OWNER_ROLE_NAME` (comma separated, defaults to `owner`), and the startup log says which role was found.

Ticket commands (`/close`, `/close-request`), `/verify`, `/review` and `/learn` keep their own rules: staff close tickets, members verify themselves, and the trusted AI accounts keep teaching the bot.

## License keys

```
/key generate plan:<monthly|lifetime> [amount:1-25] [email] [days]
/key list [search] [limit]
/key revoke key:<CHAMP-...>
/key restore key:<CHAMP-...>
/key delete key:<CHAMP-...> confirm:true
```

`/key generate` makes keys in the website's `licenses` table, in the same `CHAMP-XXXX-XXXX-XXXX-XXXX` shape the dashboard and the client expect:

- **Without `email`** the key is free to hand out. It gets a placeholder address (`unassigned+<key>@keys.champclient.local`) so the row is valid; the customer opens the dashboard, clicks **Redeem a key** and the key is linked to their account. Until then nobody can download with it.
- The website admin panel lists every key under **Orders & Keys**; a key without an owner shows as **Unclaimed** until the first account redeems it.
- **With `email`** the key is linked to that customer at once. If that email already has a license for the plan, the existing key is reactivated instead of creating a second one (the table allows one license per email and plan, exactly like Stripe checkout does).
- **Expiry**: monthly keys last 30 days, lifetime keys never expire, and `days` overrides both. The clock starts when the key is generated, so make a monthly key when you hand it over (or give it more `days`).
- `revoke` sets the status to `revoked`, so `/api/license/validate` and the download endpoint refuse the key; `restore` switches it back on; `delete` removes the row for good and needs `confirm: true`.

The customer never sees the placeholder: it is replaced by their account email on redeem. Use the same Supabase project as the website.

## Server management

`/manage` is the slash-command version of what the trusted AI accounts can do by chat:

| Subcommand | Does |
|---|---|
| `channel-create name [type] [category] [private]` | Text, voice, forum or announcement channel; `private: true` hides it from `@everyone` |
| `channel-delete channel confirm:true` | Delete a channel or category |
| `category-create name` | Create a category |
| `role-create name [color] [hoist] [mentionable] [permissions]` | Create a role with a hex colour and permissions like `view, send` |
| `role-edit role [name] [color] [hoist] [mentionable]` | Rename, recolour or change an existing role |
| `role-delete role confirm:true` | Delete a role (never `@everyone`, never a bot/integration role) |
| `role-assign user role` / `role-remove user role` | Give or take a role |
| `perms channel [role] [user] [allow] [deny] [reset:true]` | Set a channel overwrite for a role or member; without a target it applies to `@everyone` |

Permission names are short (`view`, `send`, `read-history`, `attach`, `embed`, `react`, `mention`, `external-emoji`, `manage-messages`, `manage-channel`, `create-invite`, `connect`, `speak`, `stream`, `mute`, `deafen`, `move`, …) and Discord's own names such as `ManageMessages` work too. Unknown names are reported instead of silently ignored. The bot needs Manage Channels, Manage Roles and (for `perms`) Manage Permissions, and its role must sit above every role it edits, deletes or hands out.

## Ticket assistant, /close and close requests

When a ticket opens, the bot reads the answers of the form and answers right away when it recognises the problem. Today it checks the client version: a ticket that says `1.21.10` (or any other build) gets *"Client version 1.21.10 is not supported. You are on 1.21.10. 1.21.11 is our only version. Please upgrade, start the game again and try once more."* The supported versions come from `SUPPORTED_CLIENT_VERSION` (default `1.21.11`, comma separated for several builds). A version without a patch number, such as `1.21`, counts as supported so nobody is sent away for nothing.

That answer is posted with a 👍 and a 👎 reaction, and only the opener can use them:

- 👍 tells the ticket staff the answer solved it (the staff roles are pinged); only staff close the ticket.
- 👎 asks the opener what exactly still fails, so they can send the error and staff can take over.

Tickets are visible to `support`, `developer` and the member who opened the ticket, and to nobody else. Only support and developer close a ticket or start a close request, with `/close`, `/close-request [reason]` or the **Close Ticket** button. A close request pings the opener and offers **Accept close** / **Deny**: the opener accepts it, and the opener cannot close the ticket themselves. Anywhere a ticket text contains `{user}`, the bot replaces it with a real mention of the ticket opener, including in the close reason. Both commands work in a normal ticket channel and in a forum post: a forum post is locked and archived instead of deleted, and every ticket still gets its transcript in DM.

New posts in a forum channel (for example a bug-report forum) get the same version check on the opening post. A reply inside the post does not trigger it again, and a post that does not mention a client version is left alone.

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
