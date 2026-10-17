const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getRolesConfig } = require('../config/loadConfig');

const data = new SlashCommandBuilder()
  .setName('setup-roles')
  .setDescription('Maakt de serverrollen aan (Owner, Developer, Media, Champ, Support, enz.)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const config = getRolesConfig();
  const guild = interaction.guild;

  let created = 0;
  let skipped = 0;

  for (const roleDef of config.roles) {
    const exists = guild.roles.cache.find(
      (r) => r.name.toLowerCase() === roleDef.name.toLowerCase()
    );
    if (exists) {
      skipped++;
      continue;
    }

    await guild.roles.create({
      name: roleDef.name,
      color: roleDef.color,
      hoist: roleDef.hoist ?? false,
      mentionable: roleDef.mentionable ?? false,
      permissions: roleDef.permissions || [],
    });
    created++;
  }

  await interaction.editReply(
    `Rollen-setup voltooid. **${created}** rollen aangemaakt, **${skipped}** bestonden al.\n` +
      `Leden krijgen vanaf nu automatisch de rol **${config.autoRoleName}** bij binnenkomst.\n` +
      `Rollen, kleuren en auto-rol pas je aan in \`config/roles.json\`. Volgorde/hierarchie van de rollen kun je zelf nog aanpassen in Server-instellingen.`
  );
}

module.exports = { data, execute };
