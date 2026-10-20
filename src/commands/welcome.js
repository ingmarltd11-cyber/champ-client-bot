const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const settings = require('../utils/botSettings');
const greeting = require('../features/greeting');
const { isOwner } = require('../utils/permissions');

const OWNER_DENIED = '❌ Only the **owner** role can set up the welcome message.';

function reply(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

module.exports = {
  access: 'owner',

  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Set the channel and custom message for new members (owner only).')
    // Manage Server keeps it out of the member command list; the owner check decides who may use it.
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('Pick the channel where the bot welcomes new members.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Text channel for the welcome message')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('message')
        .setDescription('Write the welcome message. Placeholders: {user} {name} {server} {count}')
        .addStringOption((option) =>
          option
            .setName('text')
            .setDescription('Your message; use \\n for a new line')
            .setRequired(true)
            .setMaxLength(settings.MAX_WELCOME_MESSAGE)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('test').setDescription('Post the welcome message now, as a preview.')
    )
    .addSubcommand((sub) =>
      sub.setName('show').setDescription('Show the welcome channel and message.')
    )
    .addSubcommand((sub) =>
      sub.setName('disable').setDescription('Stop welcoming new members; the message is kept.')
    ),

  async execute(interaction) {
    if (!interaction.guild) return reply(interaction, '❌ This command only works inside the server.');
    if (!isOwner(interaction.member)) return reply(interaction, OWNER_DENIED);

    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (sub === 'channel') {
        const channel = interaction.options.getChannel('channel', true);
        const me = interaction.guild.members.me;
        const permissions = me ? channel.permissionsFor(me) : null;
        if (permissions && !permissions.has(PermissionFlagsBits.SendMessages)) {
          return interaction.editReply({
            content: `❌ I cannot send messages in <#${channel.id}>. Give the bot **Send Messages** there first.`,
          });
        }

        settings.setWelcomeChannelId(channel.id);
        const { message } = settings.getWelcomeSettings();
        const preview = greeting.renderMessage(message, {
          member: interaction.member,
          guild: interaction.guild,
        });

        return interaction.editReply({
          content: [
            `✅ New members are welcomed in <#${channel.id}>.`,
            `Message: ${preview}`,
            'Change it with `/welcome message`.',
          ].join('\n'),
        });
      }

      if (sub === 'message') {
        const text = interaction.options.getString('text', true).trim();
        if (!text) return interaction.editReply({ content: '❌ The message cannot be empty.' });

        settings.setWelcomeMessage(text);
        const preview = greeting.renderMessage(text, {
          member: interaction.member,
          guild: interaction.guild,
        });

        return interaction.editReply({
          content: [
            '✅ Saved. It will look like this:',
            `>>> ${preview}`,
            '_Placeholders: `{user}` mention, `{name}` username, `{display}` display name, ' +
              '`{server}` server name, `{count}` member number, `{created}` account age._',
          ].join('\n'),
        });
      }

      if (sub === 'test') {
        const result = await greeting.sendWelcome(interaction.member);
        if (!result.sent) {
          return interaction.editReply({
            content: `❌ Could not post the welcome message: ${greeting.describeFailure(result.reason)}.`,
          });
        }
        return interaction.editReply({
          content: `✅ Test welcome posted in <#${result.channelId}>.`,
        });
      }

      if (sub === 'show') {
        const { channelId, message } = settings.getWelcomeSettings();
        const preview = greeting.renderMessage(message, {
          member: interaction.member,
          guild: interaction.guild,
        });

        const lines = [
          '**Welcome message**',
          channelId ? `Channel: <#${channelId}>` : 'Channel: none (welcome messages are off)',
          `Message: ${message}`,
        ];
        if (channelId) lines.push(`Preview: ${preview}`);
        lines.push('Set it with `/welcome channel` and `/welcome message`.');
        return interaction.editReply({ content: lines.join('\n') });
      }

      if (sub === 'disable') {
        settings.setWelcomeChannelId(null);
        return interaction.editReply({
          content: '✅ Welcome messages are off. The message is kept, so `/welcome channel` turns them back on.',
        });
      }

      return interaction.editReply({ content: '❌ Unknown subcommand.' });
    } catch (err) {
      console.error('Welcome command failed:', err);
      return interaction.editReply({
        content: `❌ Could not save that: ${String(err.message ?? err).slice(0, 300)}`,
      });
    }
  },
};
