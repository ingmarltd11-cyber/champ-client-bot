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
const learning = require('./features/learning');
const settings = require('./utils/botSettings');
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
// Server Members Intent is optional: it is needed to search/list members by name (the admin
// AI tools). It must be enabled in the Developer Portal first, otherwise Discord rejects the
// login, so it is opt-in and the member tools fall back to the cache without it.
const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
];
if (process.env.ENABLE_GUILD_MEMBERS_INTENT === 'true') {
  intents.push(GatewayIntentBits.GuildMembers);
}

const client = new Client({ intents });

client.commands = new Collection();
for (const command of loadCommands()) {
  client.commands.set(command.data.name, command);
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  console.log(describeCategoryStorage());
  console.log(
    AI.apiKey
      ? `AI support: on (${AI.model}, site pages: ${AI.siteUrls.length}, knowledge: website + mod)`
      : 'AI support: off (no AI_API_KEY)'
  );
  console.log(
    `AI admin actions: ${settings.isAiAdminEnabled() ? 'on' : 'stopped (/ai-start)'}; ` +
      `${settings.listLearnedRules().length} learned rule(s), ${settings.listLessons().length} lesson(s)`
  );

  // The training channel is created once and then remembered, so the bot always has a place
  // where it can be taught new behaviour. A failure here must not stop the bot.
  try {
    const guild = await readyClient.guilds.fetch(process.env.GUILD_ID);
    await learning.ensureLearningChannel(guild);
  } catch (err) {
    console.error('Could not set up the AI training channel:', err.message);
  }

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

  // A learned rule (taught in the training channel) answers first, for every member. When no
  // rule matches, the assistant answers only if the bot is pinged, and it never gives code.
  learning
    .handleLearnedRule(message)
    .then((handled) => {
      if (!handled) return aiSupport.handleMessage(message);
      return null;
    })
    .catch((err) => console.error('AI support failed:', err));
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
      if (id === tickets.UNVERIFIED_TICKET_ID) return tickets.openUnverifiedTicket(interaction);
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
