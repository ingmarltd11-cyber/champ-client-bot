// commands/verify.js
// Lets a member verify either via /verify or by clicking the green verify button.
// Both paths grant the "champ" role (see utils/verifyRole.js).

const { SlashCommandBuilder } = require('discord.js');
const { grantVerifiedRole } = require('../utils/verifyRole');

async function respondVerified(interaction) {
    try {
        const { alreadyVerified } = await grantVerifiedRole(interaction.member);
        await interaction.reply({
            content: alreadyVerified
                ? "✅ You're already verified."
                : '✅ You are now verified! Enjoy the server.',
            ephemeral: true,
        });
    } catch (err) {
        console.error(err);
        await interaction.reply({
            content: '❌ Something went wrong while verifying you. Please contact staff.',
            ephemeral: true,
        });
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Verify yourself to get access to the server.'),

    async execute(interaction) {
        await respondVerified(interaction);
    },

    async handleButton(interaction) {
        await respondVerified(interaction);
    },
};
