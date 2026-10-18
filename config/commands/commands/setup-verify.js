// commands/setup-verify.js
// Posts the verification panel. Run this once, inside your #verify channel.

const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-verify')
        .setDescription('Posts the verification panel in this channel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('✅ Verify to get access')
            .setDescription('Click the button below, or run `/verify`, to unlock the rest of the server.')
            .setColor(0x9b59b6);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('verify-button')
                .setLabel('Verify')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Success)
        );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: 'Verification panel posted.', ephemeral: true });
    },
};
