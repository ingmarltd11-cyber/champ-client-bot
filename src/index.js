require('dotenv').config();
const { Client, GatewayIntentBits, Collection, ChannelType } = require('discord.js');
const setupServer = require('./commands/setup-server');
const setupRoles = require('./commands/setup-roles');
const ticketPanel = require('./commands/ticket-panel');
const ticketStats = require('./commands/ticket-stats');
const ticketUser = require('./commands/ticket-user');
const ticketClose = require('./commands/ticket-close');
const ticketHandlers = require('./handlers/ticketInteractions');
const ticketStore = require('./utils/ticketStore');
const { isSupabaseEnabled } = require('./utils/supabase');
const { startAutoClose } = require('./jobs/autoClose');
const { getServerStructure, getRolesConfig } = require('./config/loadConfig');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages],
});

client.commands = new Collection();
for (const cmd of [setupServer, setupRoles, ticketPanel, ticketStats, ticketUser, ticketClose]) {
  client.commands.set(cmd.data.name, cmd);
}

client.once('ready', () => {
  console.log(`Ingelogd als ${client.user.tag}`);
  console.log(`Ticket-opslag: ${ticketStore.backend()}${isSupabaseEnabled() ? ' (Supabase)' : ' (lokaal)'}`);
  startMemberCountUpdater();
  startAutoClose(client);
});

// Kent automatisch de auto-rol (standaard "Champ") toe aan nieuwe leden.
client.on('guildMemberAdd', async (member) => {
  try {
    const rolesConfig = getRolesConfig();
    if (!rolesConfig.autoRoleName) return;
    const role = member.guild.roles.cache.find(
      (r) => r.name.toLowerCase() === rolesConfig.autoRoleName.toLowerCase()
    );
    if (role) await member.roles.add(role);
  } catch (err) {
    console.error('Kon auto-rol niet toekennen:', err);
  }
});

// Houdt per ticket de laatste activiteit bij (voor auto-close bij inactiviteit).
client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot || !message.guild) return;
    const ticket = await ticketStore.getTicket(message.channel.id);
    if (ticket) await ticketStore.touchTicket(message.channel.id);
  } catch {
    /* negeren */
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (command) await command.execute(interaction);
    } else if (interaction.isStringSelectMenu() && interaction.customId === 'ticket-select') {
      await ticketHandlers.handleSelect(interaction);
    } else if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket-modal-')) {
      await ticketHandlers.handleModalSubmit(interaction);
    } else if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket-rate-modal:')) {
      await ticketHandlers.handleRateModal(interaction);
    } else if (interaction.isButton() && interaction.customId === 'ticket-claim') {
      await ticketHandlers.handleClaim(interaction);
    } else if (interaction.isButton() && interaction.customId === 'ticket-close') {
      await ticketHandlers.handleClose(interaction);
    } else if (interaction.isButton() && interaction.customId.startsWith('ticket-rate:')) {
      await ticketHandlers.handleRateButton(interaction);
    }
  } catch (err) {
    console.error(err);
    if (interaction.isRepliable()) {
      const payload = { content: 'Er ging iets mis.', ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => {});
      else await interaction.reply(payload).catch(() => {});
    }
  }
});

// Houdt het optionele "Members: {count}" voice-kanaal elke 10 minuten up-to-date
// (Discord staat max. ~2 naam-wijzigingen per 10 min per kanaal toe).
function startMemberCountUpdater() {
  const structure = getServerStructure();
  if (!structure.memberCountChannel?.enabled) return;

  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      const prefix = structure.memberCountChannel.name.split('{count}')[0];
      const channel = guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildVoice && c.name.startsWith(prefix)
      );
      if (channel) {
        const newName = structure.memberCountChannel.name.replace('{count}', guild.memberCount);
        if (channel.name !== newName) await channel.setName(newName).catch(() => {});
      }
    }
  }, 10 * 60 * 1000);
}

client.login(process.env.DISCORD_TOKEN);
