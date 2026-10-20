const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const settings = require('../utils/botSettings');
const memberCount = require('../features/memberCount');
const { isOwner } = require('../utils/permissions');

const OWNER_DENIED = '❌ Only the **owner** role can set up the member counter.';

function reply(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

function describeResult(result) {
  switch (result.reason) {
    case 'not-configured':
      return 'no counter channel is set yet; use `/membercount channel` first';
    case 'channel-missing':
      return 'the counter channel no longer exists; pick it again with `/membercount channel`';
    case 'not-voice':
      return 'that channel is not a voice channel';
    case 'no-permission':
      return 'I need **Manage Channels** to rename the counter channel';
    case 'unchanged':
      return 'the counter is already up to date';
    case 'empty-name':
      return 'the format produced an empty name';
    case 'throttled':
      return 'the counter was updated recently; Discord rate-limits channel renames, so I retry shortly';
    default:
      return `nothing changed (${result.reason})`;
  }
}

module.exports = {
  access: 'owner',

  data: new SlashCommandBuilder()
    .setName('membercount')
    .setDescription('Keep a voice channel showing the member count (owner only).')
    // Manage Server keeps it out of the member command list; the owner check decides who may use it.
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('Pick the voice channel that shows the member count.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('A voice channel; the bot renames it')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
        )
        .addBooleanOption((option) =>
          option
            .setName('lock')
            .setDescription('Stop members from joining the counter channel (default: true)')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('format')
        .setDescription('Change the counter text. Placeholders: {count} {server}')
        .addStringOption((option) =>
          option
            .setName('text')
            .setDescription('For example: 👥 Members: {count}')
            .setRequired(true)
            .setMaxLength(settings.MAX_STATS_TEMPLATE)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('update').setDescription('Refresh the counter right now.')
    )
    .addSubcommand((sub) =>
      sub.setName('show').setDescription('Show the counter channel and format.')
    )
    .addSubcommand((sub) =>
      sub.setName('disable').setDescription('Stop updating the counter channel.')
    ),

  async execute(interaction) {
    if (!interaction.guild) return reply(interaction, '❌ This command only works inside the server.');
    if (!isOwner(interaction.member)) return reply(interaction, OWNER_DENIED);

    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (sub === 'channel') {
        const channel = interaction.options.getChannel('channel', true);
        if (typeof channel.isVoiceBased === 'function' && !channel.isVoiceBased()) {
          return interaction.editReply({ content: '❌ Pick a voice channel; a text channel cannot show a count.' });
        }

        const me = guild.members.me;
        const permissions = me ? channel.permissionsFor(me) : null;
        if (permissions && !permissions.has(PermissionFlagsBits.ManageChannels)) {
          return interaction.editReply({
            content: `❌ I need **Manage Channels** in <#${channel.id}> to rename it.`,
          });
        }

        settings.setStatsChannelId(channel.id);

        // A counter channel is a sign, not a room: nobody should be able to sit in it.
        const lock = interaction.options.getBoolean('lock') ?? true;
        let locked = false;
        if (lock) {
          try {
            await channel.permissionOverwrites.edit(
              guild.roles.everyone,
              { Connect: false },
              `Member counter set by ${interaction.user.tag}`
            );
            locked = true;
          } catch (err) {
            console.error('Could not lock the counter channel:', err.message);
          }
        }

        const result = await memberCount.syncGuildCount(guild, { force: true });
        const lines = [`✅ Member counter set to <#${channel.id}>.`];
        if (locked) lines.push('Members can no longer join it.');
        if (result.updated) lines.push(`It now shows: **${result.name}**`);
        else lines.push(`The name is not updated yet: ${describeResult(result)}.`);
        lines.push('Change the text with `/membercount format`.');
        return interaction.editReply({ content: lines.join('\n') });
      }

      if (sub === 'format') {
        const text = interaction.options.getString('text', true).trim();
        if (!text) return interaction.editReply({ content: '❌ The format cannot be empty.' });

        settings.setStatsTemplate(text);
        const result = await memberCount.syncGuildCount(guild, { force: true });
        const preview = memberCount.renderCount(text, guild.memberCount ?? 0, guild.name ?? '');

        const lines = [`✅ Saved. The channel name becomes: **${preview}**`];
        if (!result.updated) lines.push(`(Not applied yet: ${describeResult(result)}.)`);
        return interaction.editReply({ content: lines.join('\n') });
      }

      if (sub === 'update') {
        const result = await memberCount.syncGuildCount(guild, { force: true });
        if (result.updated) {
          return interaction.editReply({
            content: `✅ Counter updated to **${result.name}** (${result.count} members).`,
          });
        }
        return interaction.editReply({ content: `ℹ️ Nothing to change: ${describeResult(result)}.` });
      }

      if (sub === 'show') {
        const { channelId, template } = settings.getStatsSettings();
        const lines = [
          '**Member counter**',
          channelId ? `Channel: <#${channelId}>` : 'Channel: none (the counter is off)',
          `Format: ${template}`,
        ];
        if (channelId) {
          const preview = memberCount.renderCount(template, guild.memberCount ?? 0, guild.name ?? '');
          lines.push(`Current name would be: **${preview}**`);
        }
        lines.push('Set it with `/membercount channel` and `/membercount format`.');
        return interaction.editReply({ content: lines.join('\n') });
      }

      if (sub === 'disable') {
        settings.setStatsChannelId(null);
        return interaction.editReply({
          content: '✅ The counter is off. The channel keeps its last name; `/membercount channel` turns it back on.',
        });
      }

      return interaction.editReply({ content: '❌ Unknown subcommand.' });
    } catch (err) {
      console.error('Member count command failed:', err);
      return interaction.editReply({
        content: `❌ Could not finish that: ${String(err.message ?? err).slice(0, 300)}`,
      });
    }
  },
};
