const { SlashCommandBuilder } = require('discord.js');
const { respondVerified } = require('../features/verify');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify yourself to get access to the server.'),

  async execute(interaction) {
    await respondVerified(interaction);
  },
};
