require('dotenv').config();
const { REST, Routes } = require('discord.js');
const setupServer = require('./commands/setup-server');
const setupRoles = require('./commands/setup-roles');
const ticketPanel = require('./commands/ticket-panel');
const ticketStats = require('./commands/ticket-stats');
const ticketUser = require('./commands/ticket-user');
const ticketClose = require('./commands/ticket-close');

const commands = [setupServer, setupRoles, ticketPanel, ticketStats, ticketUser, ticketClose].map((c) =>
  c.data.toJSON()
);

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Slash commands registreren...');
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), {
      body: commands,
    });
    console.log('Commands geregistreerd.');
  } catch (err) {
    console.error(err);
  }
})();
