const { assertEnv } = require('./config');
const { registerCommands } = require('./utils/registerCommands');

async function main() {
  assertEnv(['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID']);
  await registerCommands();
}

main().catch((err) => {
  console.error('Command registration failed:', err);
  process.exit(1);
});
