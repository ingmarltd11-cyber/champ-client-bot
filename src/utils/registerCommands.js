const { REST, Routes } = require('discord.js');
const { loadCommands } = require('./loadCommands');

// Registers every command in src/commands as a guild command. PUT replaces the full
// list, so removed commands disappear from the server. Used at startup and by npm run deploy.
async function registerCommands() {
  const commands = loadCommands().map((command) => command.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  const registered = await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );

  console.log(
    `Registered ${registered.length} command(s): ${registered.map((c) => c.name).join(', ')}`
  );
  return registered;
}

module.exports = { registerCommands };
