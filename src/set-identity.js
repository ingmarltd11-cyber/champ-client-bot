// Run once with: npm run identity
// Sets the bot username and profile picture. This is kept out of the main bot
// process because Discord limits how often a username can be changed.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Events } = require('discord.js');

const BOT_USERNAME = 'Champ Client Bot';
const AVATAR_PATH = path.join(__dirname, '..', 'assets', 'avatar.jpg');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async () => {
  try {
    if (client.user.username !== BOT_USERNAME) {
      await client.user.setUsername(BOT_USERNAME);
      console.log(`Username set to "${BOT_USERNAME}".`);
    } else {
      console.log('Username is already correct, nothing changed.');
    }

    if (fs.existsSync(AVATAR_PATH)) {
      await client.user.setAvatar(fs.readFileSync(AVATAR_PATH));
      console.log('Profile picture set.');
    } else {
      console.log(`No image found at ${AVATAR_PATH}, skipping profile picture.`);
    }
  } catch (err) {
    console.error('Could not set identity:', err.message);
  } finally {
    client.destroy();
  }
});

client.login(process.env.DISCORD_TOKEN);
