const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { getPermissionsConfig } = require('../config/loadConfig');

const data = new SlashCommandBuilder()
  .setName('setup-perms')
  .setDescription('Zet permissies zodat alleen staff kan posten in info-kanalen (announcements, rules, enz.)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

// Haalt de kanaalnaam zonder emoji-prefix op: "📣│announcements" -> "announcements"
function baseName(name) {
  const afterBar = name.includes('│') ? name.split('│').pop() : name;
  return afterBar
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .trim()
    .toLowerCase();
}

async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const config = getPermissionsConfig();
  const guild = interaction.guild;

  const readOnly = (config.readOnlyChannels || []).map((n) => n.toLowerCase());
  const missingRoles = new Set();

  const resolveRoles = (names) => {
    const roles = [];
    for (const name of names || []) {
      const role = guild.roles.cache.find((r) => r.name.toLowerCase() === name.toLowerCase());
      if (role) roles.push(role);
      else missingRoles.add(name);
    }
    return roles;
  };

  const memberRoles = resolveRoles(config.memberRoles);
  const staffRoles = resolveRoles(config.staffRoles);
  const me = guild.members.me;

  const channels = guild.channels.cache.filter(
    (c) =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      readOnly.includes(baseName(c.name))
  );

  const lockedNames = [];
  let updated = 0;
  let failed = 0;

  for (const channel of channels.values()) {
    try {
      const lock = {
        SendMessages: false,
        SendMessagesInThreads: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
        MentionEveryone: false,
      };

      await channel.permissionOverwrites.edit(guild.roles.everyone, lock);
      for (const role of memberRoles) {
        await channel.permissionOverwrites.edit(role, lock);
      }

      for (const role of staffRoles) {
        await channel.permissionOverwrites.edit(role, {
          SendMessages: true,
          SendMessagesInThreads: true,
          CreatePublicThreads: true,
        });
      }

      if (me) {
        await channel.permissionOverwrites.edit(me, {
          ViewChannel: true,
          SendMessages: true,
        });
      }

      updated++;
      lockedNames.push(channel.name);
    } catch (err) {
      console.error(`Permissies aanpassen mislukt voor ${channel.name}:`, err);
      failed++;
    }
  }

  let reply = `Permissie-setup voltooid. **${updated}** kanalen vergrendeld, **${failed}** mislukt.`;
  if (lockedNames.length) {
    reply += `\nAlleen staff kan nu posten in:\n${lockedNames.map((n) => `• ${n}`).join('\n')}`;
  } else {
    reply += '\nGeen overeenkomende kanalen gevonden. Voer eerst /setup-server uit.';
  }
  if (missingRoles.size) {
    reply += `\nRollen niet gevonden: ${[...missingRoles].join(', ')} — voer eerst /setup-roles uit.`;
  }
  reply += '\nDe lijst met kanalen en rollen pas je aan in `config/permissions.json`.';

  await interaction.editReply(reply);
}

module.exports = { data, execute };
