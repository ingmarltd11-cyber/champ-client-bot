const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const { categories } = require('../server-structure');

const CHANNEL_TYPES = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  forum: ChannelType.GuildForum,
};

// A name with '{count}' is matched by the text before the placeholder, so the
// member-count channel is found again after the count changes.
function nameMatches(template, existingName) {
  if (template.includes('{count}')) {
    return existingName.startsWith(template.split('{count}')[0]);
  }
  return existingName === template;
}

// Builds @everyone overwrites from { allow: [...], deny: [...] } using PermissionFlagsBits names.
function buildOverwrites(guild, everyone) {
  if (!everyone) return undefined;
  return [
    {
      id: guild.roles.everyone.id,
      allow: (everyone.allow ?? []).map((name) => PermissionFlagsBits[name]),
      deny: (everyone.deny ?? []).map((name) => PermissionFlagsBits[name]),
    },
  ];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-server')
    .setDescription('Create the server categories and channels that do not exist yet.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (categories.length === 0) {
      return interaction.editReply({
        content: '⚠️ No structure is defined yet. Add the categories and channels to `src/server-structure.js`.',
      });
    }

    const { guild } = interaction;
    let createdCategories = 0;
    let createdChannels = 0;
    const failed = [];

    for (const categoryDef of categories) {
      try {
        // A null name means the channels sit at the top level, outside any category.
        let parent = null;
        if (categoryDef.name) {
          parent = guild.channels.cache.find(
            (c) => c.type === ChannelType.GuildCategory && c.name === categoryDef.name
          );
          if (!parent) {
            parent = await guild.channels.create({
              name: categoryDef.name,
              type: ChannelType.GuildCategory,
              reason: 'Created by /setup-server',
            });
            createdCategories++;
          }
        }
        const parentId = parent ? parent.id : null;

        for (const channelDef of categoryDef.channels ?? []) {
          const type = CHANNEL_TYPES[channelDef.type ?? 'text'];
          // ChannelType.GuildText is 0, so compare against undefined rather than falsy.
          if (type === undefined) {
            failed.push(`${channelDef.name} (unknown type "${channelDef.type}")`);
            continue;
          }

          const exists = guild.channels.cache.find(
            (c) =>
              (c.parentId ?? null) === parentId &&
              nameMatches(channelDef.name, c.name)
          );
          if (exists) continue;

          await guild.channels.create({
            name: channelDef.name.replace('{count}', guild.memberCount),
            type,
            parent: parentId,
            permissionOverwrites: buildOverwrites(guild, channelDef.everyone),
            reason: 'Created by /setup-server',
          });
          createdChannels++;
        }
      } catch (err) {
        console.error(`Could not set up category ${categoryDef.name}:`, err.message);
        failed.push(categoryDef.name ?? '(top level)');
      }
    }

    const lines = [
      `✅ Created ${createdCategories} category(ies) and ${createdChannels} channel(s).`,
    ];
    if (failed.length) lines.push(`❌ Failed: ${failed.join(', ')}.`);

    await interaction.editReply({ content: lines.join('\n') });
  },
};
