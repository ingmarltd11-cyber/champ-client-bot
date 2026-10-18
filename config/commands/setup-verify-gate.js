// commands/setup-verify-gate.js
// Hides every channel from unverified members (@everyone) except the verify channel,
// and makes sure verified/staff roles can still see everything.
//
// Run this ONCE after creating your channels. Re-run it any time you add new channels.

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

const CONFIG = {
    verifyChannelName: 'verify',
    visibleToRoles: ['champ', 'champ+', 'support', 'media', 'media manager', 'owner', 'developer'],
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-verify-gate')
        .setDescription('Hides all channels from unverified members except the verify channel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;
        const everyoneRole = guild.roles.everyone;

        const roles = CONFIG.visibleToRoles
            .map((name) => guild.roles.cache.find((r) => r.name === name))
            .filter(Boolean);

        let locked = 0;

        for (const channel of guild.channels.cache.values()) {
            if (channel.type === ChannelType.GuildCategory) continue;
            if (channel.name === CONFIG.verifyChannelName) continue;

            try {
                await channel.permissionOverwrites.edit(everyoneRole, { ViewChannel: false });
                for (const role of roles) {
                    await channel.permissionOverwrites.edit(role, { ViewChannel: true });
                }
                locked++;
            } catch (err) {
                console.error(`Failed on #${channel.name}:`, err);
            }
        }

        await interaction.editReply({
            content: `✅ Locked ${locked} channel(s). Left #${CONFIG.verifyChannelName} visible to everyone.`,
        });
    },
};
