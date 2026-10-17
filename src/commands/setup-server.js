const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { getServerStructure } = require('../config/loadConfig');

const data = new SlashCommandBuilder()
  .setName('setup-server')
  .setDescription('Zet automatisch de volledige kanaalstructuur neer (CHAMP layout)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

function resolveChannelType(type) {
  if (type === 'voice') return ChannelType.GuildVoice;
  if (type === 'forum') return ChannelType.GuildForum;
  return ChannelType.GuildText;
}

// Bouwt permission-overwrites op basis van het "visibility"-veld in de config.
// "everyone" = zichtbaar voor iedereen, anders alleen voor de bijbehorende rol.
function buildOverwrites(guild, roles, visibility, botId) {
  const overwrites = [];

  if (visibility === 'everyone') {
    overwrites.push({ id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel] });
  } else {
    overwrites.push({ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] });
    const roleId = roles[visibility];
    if (roleId && !roleId.includes('_ROLE_ID')) {
      overwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel] });
    }
  }

  overwrites.push({
    id: botId,
    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],
  });

  return overwrites;
}

async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const structure = getServerStructure();
  const { guild } = interaction;
  const roles = structure.roles || {};
  const botId = guild.members.me.id;

  let created = 0;
  let skipped = 0;

  for (const cat of structure.categories) {
    let category = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name === cat.name
    );

    if (!category) {
      category = await guild.channels.create({
        name: cat.name,
        type: ChannelType.GuildCategory,
        permissionOverwrites: buildOverwrites(guild, roles, cat.visibility || 'verified', botId),
      });
      created++;
    } else {
      skipped++;
    }

    for (const ch of cat.channels) {
      const exists = guild.channels.cache.find(
        (c) => c.parentId === category.id && c.name === ch.name
      );
      if (exists) {
        skipped++;
        continue;
      }

      await guild.channels.create({
        name: ch.name,
        type: resolveChannelType(ch.type),
        parent: category.id,
        permissionOverwrites: buildOverwrites(
          guild,
          roles,
          ch.visibility || cat.visibility || 'verified',
          botId
        ),
      });
      created++;
    }
  }

  // Optioneel: live member-count kanaal
  if (structure.memberCountChannel?.enabled) {
    const mc = structure.memberCountChannel;
    const prefix = mc.name.split('{count}')[0];
    const exists = guild.channels.cache.find((c) => c.name.startsWith(prefix));

    if (!exists) {
      const targetCategory = guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildCategory && c.name === mc.category
      );
      await guild.channels.create({
        name: mc.name.replace('{count}', guild.memberCount),
        type: ChannelType.GuildVoice,
        parent: targetCategory?.id,
        permissionOverwrites: buildOverwrites(guild, roles, mc.visibility || 'everyone', botId),
      });
      created++;
    }
  }

  await interaction.editReply(
    `Setup voltooid. **${created}** kanalen/categorieen aangemaakt, **${skipped}** al aanwezig (overgeslagen).`
  );
}

module.exports = { data, execute };
