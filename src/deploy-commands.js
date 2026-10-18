const { REST, Routes } = require('discord.js');
const { assertEnv } = require('./config');
const { loadCommands } = require('./utils/loadCommands');

async function main() {
  assertEnv(['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID']);

  const commands = loadCommands().map((command) => command.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  // PUT replaces the full command list, so removed commands disappear from the server.
  const registered = await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );

  console.log(
    `Registered ${registered.length} command(s): ${registered.map((c) => c.name).join(', ')}`
  );
}

main().catch((err) => {
  console.error('Command registration failed:', err);
  process.exit(1);
});
