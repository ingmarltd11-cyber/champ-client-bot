// Eenmalig uitvoeren met: npm run identity
// Zet de botnaam en profielfoto. Niet in de hoofd-bot zelf, want Discord
// staat maar een beperkt aantal naam-wijzigingen per uur toe.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');

const BOT_USERNAME = 'Champ Client Bot';
const AVATAR_PATH = path.join(__dirname, '..', 'assets', 'avatar.jpg');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  try {
    if (client.user.username !== BOT_USERNAME) {
      await client.user.setUsername(BOT_USERNAME);
      console.log(`Gebruikersnaam ingesteld op "${BOT_USERNAME}".`);
    } else {
      console.log('Gebruikersnaam staat al goed, niets gewijzigd.');
    }

    if (fs.existsSync(AVATAR_PATH)) {
      const avatar = fs.readFileSync(AVATAR_PATH);
      await client.user.setAvatar(avatar);
      console.log('Profielfoto ingesteld.');
    } else {
      console.log(`Geen afbeelding gevonden op ${AVATAR_PATH}, profielfoto overgeslagen.`);
    }
  } catch (err) {
    console.error('Kon identiteit niet instellen:', err.message);
  } finally {
    client.destroy();
  }
});

client.login(process.env.DISCORD_TOKEN);
