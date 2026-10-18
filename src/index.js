require('dotenv').config();

const {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  MessageFlags,
} = require('discord.js');
const { assertEnv, REQUIRED_ENV } = require('./config');
const { loadCommands } = require('./utils/loadCommands');
const { filterMessage } = require('./features/wordFilter');
const { respondVerified } = require('./features/verify');
const tickets = require('./features/tickets');
const rolesDelete = require('./commands/setup-roles-delete');

assertEnv(REQUIRED_ENV);

// Guilds + GuildMessages are needed for commands and the word filter.
// MessageContent is a privileged intent: it must be enabled in the Developer Portal
// (Bot -> Privileged Gateway Intents) or the word filter cannot read messages.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();
for (const command of loadCommands()) {
  client.commands.set(command.data.name, command);
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.MessageCreate, (message) => {
  filterMessage(message).catch((err) => console.error('Word filter failed:', err));
});

client.on(Events.MessageUpdate, (_oldMessage, message) => {
  if (message.partial) return;
  filterMessage(message).catch((err) => console.error('Word filter failed:', err));
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (command) await command.execute(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket-select') {
      return tickets.handleSelect(interaction);
    }

    if (interaction.isButton()) {
      const id = interaction.customId;

      if (id === 'verify-button') return respondVerified(interaction);
      if (id === 'ticket-close') return tickets.requestClose(interaction);
      if (id === 'ticket-close-confirm') return tickets.confirmClose(interaction);
      if (id === 'ticket-close-cancel') {
        return interaction.update({ content: 'Cancelled.', components: [] });
      }
      if (id.startsWith('roles-delete:')) return rolesDelete.handleButton(interaction);
    }
  } catch (err) {
    console.error('Interaction failed:', err);

    if (interaction.isRepliable()) {
      const payload = { content: '❌ Something went wrong. Please try again.', flags: MessageFlags.Ephemeral };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
