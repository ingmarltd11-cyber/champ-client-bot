# Champ Client Bot

Discord-bot (discord.js v14) voor de Champ Client-server. Doet drie dingen:

1. **Server-setup** (`/setup-server`) — maakt automatisch de volledige CHAMP-kanaalstructuur aan (categorieen, tekst-/voice-/forumkanalen, member-count kanaal).
2. **Rollen** (`/setup-roles`) — maakt de rollen **Owner, Developer, Media Manager, Media, Champ+, Support, Champ** aan met bijpassende kleuren. Nieuwe leden krijgen automatisch **Champ**.
3. **Ticket-systeem** (`/ticket-panel`) — volledig instelbaar ticket-paneel met vragen-formulieren per type, claim/close-knoppen, transcripts (`.txt` + `.html`), beoordelingen met sterren, auto-sluiten bij inactiviteit, ticket-logkanaal en statistieken.

Alles is aan te passen via de JSON-bestanden in `config/` — **geen code nodig** om het paneel, ticket-types, vragen of forums te wijzigen.

## 1. Installatie

```bash
npm install
cp .env.example .env   # (Windows: kopieer het bestand handmatig)
```

Vul in `.env` in:

| Variabele | Waar vandaan |
|---|---|
| `DISCORD_TOKEN` | Discord Developer Portal -> Bot -> Token |
| `CLIENT_ID` | Developer Portal -> General Information -> Application ID |
| `GUILD_ID` | Rechtermuisklik op je server -> Kopieer server-ID (Developer-modus aan) |
| `SUPABASE_URL` | Supabase -> Project Settings -> API |
| `SUPABASE_SERVICE_KEY` | Supabase -> Project Settings -> API -> `service_role` |

Zonder Supabase-regels werkt de bot gewoon — tickets worden dan lokaal bewaard in `data/tickets.json`.

## 2. Bot uitnodigen

Nodig de bot uit met scopes `bot` + `applications.commands` en minimaal:
Manage Channels, Manage Roles, View Channels, Send Messages, Embed Links, Attach Files, Use Application Commands.

## 3. Database (Supabase, aanbevolen)

Draai `supabase/schema.sql` eenmalig in de Supabase SQL-editor. Dat maakt:

- `tickets` — open/gesloten tickets, antwoorden, claims, beoordelingen, transcripts
- `licenses` — licentiesleutels voor de website-verkoop

Zet daarna `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` in `.env` (en in Railway als env-variabelen).

## 4. Rollen & ID's invullen

- `config/roles.json` — rolnamen, kleuren, `hoist`, `mentionable` en `autoRoleName`.
- `config/server-structure.json` — categorieen + kanalen (`text`/`voice`/`forum`) en per (sub)item `visibility`. Vul de `roles`-placeholder-ID's met echte rol-ID's; leeg laten = regel overslaan.
- `config/tickets.json` — `settings.ticketCategoryId` (categorie voor nieuwe tickets) en `settings.logChannelId` (logkanaal). `supportRoleId` per type mag leeg blijven: dan wordt automatisch de **Support**-rol gebruikt.

## 5. Botnaam & profielfoto (eenmalig, al gedaan)

```bash
npm run identity
```

## 6. Commands registreren & starten

```bash
npm run deploy   # eenmalig, en opnieuw na het toevoegen/wijzigen van commands
npm start
```

## 7. Gebruik

| Command | Wat |
|---|---|
| `/setup-server` | Maakt categorieen/kanalen aan die ontbreken (veilig om te herhalen) |
| `/setup-roles` | Maakt rollen aan; schakelt auto-rol **Champ** in |
| `/rollen-verwijderen server bevestig:True` | Verwijdert alle verwijderbare rollen van de server (alleen admins, niet ongedaan te maken) |
| `/rollen-verwijderen lid gebruiker` | Haalt alle rollen weg bij één lid (alleen admins) |
| `/ticket-panel [kanaal]` | Plaatst het ticket-paneel (embed + dropdown) |
| `/ticket-stats` | Statistieken: open/gesloten, gem. beoordeling, top staff (alleen staff) |
| `/ticket-user` | Iemand toevoegen aan / verwijderen uit dit ticket (alleen staff) |
| `/ticket-close [reden]` | Ticket sluiten met transcript (opener of staff) |

## 8. Online zetten (Railway)

Nieuwe service -> repo `champ-client-bot` koppelen -> env-variabelen invullen -> deploy. `railway.json` regelt de rest (`npm start`).

## Mapstructuur

```
.
├── config/               # server-structure, roles, tickets (alles instelbaar zonder code)
├── supabase/schema.sql   # tickets- + licenties-tabellen
├── src/
│   ├── index.js          # startpunt + event-routing
│   ├── deploy-commands.js# registreert slash commands
│   ├── set-identity.js   # eenmalig: naam + avatar
│   ├── commands/         # setup-server/roles, ticket-panel/stats/user/close
│   ├── handlers/         # select/modal/claim/close/rating-logica
│   ├── jobs/autoClose.js # waarschuwt + sluit inactieve tickets
│   └── utils/            # ticketStore (Supabase/JSON), transcript, log
├── railway.json / render.yaml
└── README.md
```
