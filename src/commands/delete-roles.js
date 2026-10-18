const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const data = new SlashCommandBuilder()
  .setName('rollen-verwijderen')
  .setDescription('Verwijdert alle rollen (server-breed of van één lid)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
  .addSubcommand((sub) =>
    sub
      .setName('server')
      .setDescription('Verwijdert ALLE rollen van de server')
      .addBooleanOption((opt) =>
        opt
          .setName('bevestig')
          .setDescription('Zet op True om te bevestigen – dit kan niet ongedaan worden gemaakt')
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('lid')
      .setDescription('Haalt alle rollen weg bij één lid')
      .addUserOption((opt) =>
        opt.setName('gebruiker').setDescription('Het lid waarvan je alle rollen wilt weghalen').setRequired(true)
      )
  );

async function deleteServerRoles(interaction) {
  const confirmed = interaction.options.getBoolean('bevestig', true);

  if (!confirmed) {
    await interaction.reply({
      content: 'Geannuleerd. Zet `bevestig` op True om alle rollen te verwijderen.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;
  await guild.roles.fetch();

  const reason = `Verwijderd via /rollen-verwijderen door ${interaction.user.tag}`;

  let deleted = 0;
  let skipped = 0;
  let failed = 0;

  for (const role of guild.roles.cache.values()) {
    if (role.id === guild.id) continue;

    if (role.managed || !role.editable) {
      skipped++;
      continue;
    }

    try {
      await role.delete(reason);
      deleted++;
    } catch (err) {
      console.error(`Kon rol ${role.name} niet verwijderen:`, err);
      failed++;
    }
  }

  let message = `Klaar. **${deleted}** rollen verwijderd, **${skipped}** overgeslagen (beheerd of hoger dan de bot), **${failed}** mislukt.`;
  if (skipped > 0) {
    message +=
      '\nTip: zet de bot-rol bovenaan in Server-instellingen → Rollen om ook hogere rollen te kunnen verwijderen.';
  }

  await interaction.editReply(message);
}

async function removeMemberRoles(interaction) {
  const user = interaction.options.getUser('gebruiker', true);

  await interaction.deferReply({ ephemeral: true });

  let member;
  try {
    member = await interaction.guild.members.fetch(user.id);
  } catch (err) {
    await interaction.editReply('Lid niet gevonden.');
    return;
  }

  const everyoneId = interaction.guild.id;
  const removable = [];
  let skipped = 0;

  for (const role of member.roles.cache.values()) {
    if (role.id === everyoneId) continue;
    if (role.managed || !role.editable) {
      skipped++;
      continue;
    }
    removable.push(role);
  }

  if (removable.length > 0) {
    await member.roles.remove(
      removable,
      `Verwijderd via /rollen-verwijderen door ${interaction.user.tag}`
    );
  }

  let message = `**${removable.length}** rollen weggehaald bij ${member}.`;
  if (skipped > 0) {
    message += ` **${skipped}** overgeslagen (beheerd of hoger dan de bot).`;
  }

  await interaction.editReply(message);
}

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'server') {
    return deleteServerRoles(interaction);
  }
  if (sub === 'lid') {
    return removeMemberRoles(interaction);
  }
}

module.exports = { data, execute };
