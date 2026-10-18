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
        let category = guild.channels.cache.find(
          (c) => c.type === ChannelType.GuildCategory && c.name === categoryDef.name
        );
        if (!category) {
          category = await guild.channels.create({
            name: categoryDef.name,
            type: ChannelType.GuildCategory,
            reason: 'Created by /setup-server',
          });
          createdCategories++;
        }

        for (const channelDef of categoryDef.channels ?? []) {
          const exists = guild.channels.cache.find(
            (c) => c.parentId === category.id && c.name === channelDef.name
          );
          if (exists) continue;

          const type = CHANNEL_TYPES[channelDef.type ?? 'text'];
          if (!type) {
            failed.push(`${channelDef.name} (unknown type "${channelDef.type}")`);
            continue;
          }

          await guild.channels.create({
            name: channelDef.name,
            type,
            parent: category.id,
            reason: 'Created by /setup-server',
          });
          createdChannels++;
        }
      } catch (err) {
        console.error(`Could not set up category ${categoryDef.name}:`, err.message);
        failed.push(categoryDef.name);
      }
    }

    const lines = [
      `✅ Created ${createdCategories} category(ies) and ${createdChannels} channel(s).`,
    ];
    if (failed.length) lines.push(`❌ Failed: ${failed.join(', ')}.`);

    await interaction.editReply({ content: lines.join('\n') });
  },
};
