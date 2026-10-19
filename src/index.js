require('dotenv').config();

const {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  MessageFlags,
} = require('discord.js');
const { assertEnv, REQUIRED_ENV, AI } = require('./config');
const { loadCommands } = require('./utils/loadCommands');
const { describeCategoryStorage } = require('./utils/ticketCategories');
const { filterMessage } = require('./features/wordFilter');
const aiSupport = require('./features/aiSupport');
const { isAdmin } = require('./utils/permissions');
const { registerCommands } = require('./utils/registerCommands');
const { respondVerified } = require('./features/verify');
const tickets = require('./features/tickets');
const rolesDelete = require('./commands/setup-roles-delete');
const serverDelete = require('./commands/setup-server-delete');

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
  console.log(describeCategoryStorage());
  console.log(
    AI.apiKey
      ? `AI support: on (${AI.model}, site pages: ${AI.siteUrls.length}, knowledge: website + mod)`
      : 'AI support: off (no AI_API_KEY)'
  );

  // Keeps the slash commands in sync with the code, so a new command exists after a deploy
  // without running npm run deploy by hand. A failure here must not stop the bot.
  registerCommands().catch((err) => console.error('Could not register commands:', err.message));
});

let warnedAboutContent = false;

client.on(Events.MessageCreate, (message) => {
  // Without the Message Content intent Discord sends the message with empty text.
  if (!warnedAboutContent && message.guild && !message.author?.bot && !message.content) {
    warnedAboutContent = true;
    console.warn(
      'Received a message without text. Enable "Message Content Intent" in the Discord Developer Portal (Bot -> Privileged Gateway Intents).'
    );
  }

  filterMessage(message).catch((err) => console.error('Word filter failed:', err));

  // Answers normal questions in tickets (the opener) and when mentioned, but never gives code.
  aiSupport.handleMessage(message).catch((err) => console.error('AI support failed:', err));
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

    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket-form:')) {
      return tickets.handleFormSubmit(interaction);
    }

    if (interaction.isModalSubmit() && interaction.customId === tickets.CLOSE_MODAL_ID) {
      return tickets.handleCloseModal(interaction);
    }

    if (interaction.isButton()) {
      const id = interaction.customId;

      if (id === 'verify-button') return respondVerified(interaction);
      if (id.startsWith('ticket-open:')) return tickets.handleOpen(interaction);
      if (id === 'ticket-close') return tickets.requestClose(interaction);
      if (id === 'ticket-close-accept') return tickets.acceptCloseRequest(interaction);
      if (id === 'ticket-close-deny') return tickets.denyCloseRequest(interaction);
      if (id.startsWith('roles-delete:')) return rolesDelete.handleButton(interaction);
      if (id.startsWith('server-delete:')) return serverDelete.handleButton(interaction);
    }
  } catch (err) {
    console.error('Interaction failed:', err);

    if (interaction.isRepliable()) {
      // Admins get the real reason, so a failure is diagnosable instead of just "Something went wrong".
      const isServerAdmin = interaction.member ? isAdmin(interaction.member) : false;
      const detail = isServerAdmin ? `\n\`${String(err.message).slice(0, 300)}\`` : '';
      const payload = {
        content: `❌ Something went wrong. Please try again.${detail}`,
        flags: MessageFlags.Ephemeral,
      };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
