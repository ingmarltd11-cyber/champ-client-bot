# Knowledge for the AI assistant

The assistant answers ticket and mention questions using only the files in this folder.

- `website/` — everything about the website: accounts, downloads, licences, payments, dashboard.
- `mod/` — everything about the mod/client: installation, requirements, crashes, settings, updates.

## How to add knowledge

1. Drop `.md` or `.txt` files into `website/` or `mod/`. Subfolders work too.
2. Use short sections with a `##` heading, one subject per section. The assistant picks the sections that match the question.
3. Write facts, not code. Never put source code, tokens or customer data in here.
4. Commit and push; Railway deploys it and the assistant reloads the files automatically.

Files are read on demand, so a change is live after the next deploy without a restart of the settings.

Keep it factual: if the answer is not in these files, the assistant says it is not sure and pings support.
