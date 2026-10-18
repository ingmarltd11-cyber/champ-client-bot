const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const CONFIRM_ID = 'delete-all-roles:confirm';
const CANCEL_ID = 'delete-all-roles:cancel';
const CONFIRM_TIMEOUT_MS = 30_000;
const DELETE_DELAY_MS = 500;

const data = new SlashCommandBuilder()
  .setName('delete-all-roles')
  .setDescription('Verwijdert alle rollen in de server die de bot kan verwijderen (onomkeerbaar)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildRow(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CONFIRM_ID)
      .setLabel('Ja, verwijder alle rollen')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(CANCEL_ID)
      .setLabel('Annuleren')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled)
  );
}

async function deleteRoles(interaction) {
  const guild = interaction.guild;
  const roles = await guild.roles.fetch();
  const botHighest = guild.members.me.roles.highest.position;

  let deleted = 0;
  let skipped = 0;
  const failures = [];

  for (const role of roles.values()) {
    if (role.id === guild.id || role.managed || role.position >= botHighest) {
      skipped++;
      continue;
    }

    try {
      await role.delete('Verwijderd via /delete-all-roles');
      deleted++;
    } catch (err) {
      console.error(`Kon rol ${role.name} niet verwijderen:`, err);
      failures.push(role.name);
    }

    await sleep(DELETE_DELAY_MS);
  }

  let summary =
    `Klaar. **${deleted}** rollen verwijderd, **${skipped}** overgeslagen ` +
    `(@everyone, beheerde rollen en rollen op of boven de hoogste rol van de bot).`;

  if (failures.length > 0) {
    summary += `\n**${failures.length}** rollen konden niet worden verwijderd: ${failures.join(', ')}`;
  }

  return summary.length > 2000 ? `${summary.slice(0, 1997)}...` : summary;
}

async function execute(interaction) {
  const guild = interaction.guild;

  if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({
      content: 'Ik heb de permissie **Rollen beheren** nodig om rollen te verwijderen.',
      ephemeral: true,
    });
    return;
  }

  const message = await interaction.reply({
    content:
      '⚠️ **Waarschuwing:** hiermee verwijder je **alle rollen** in deze server die ik kan verwijderen. ' +
      'Dit kan niet ongedaan worden gemaakt.\n\nWeet je zeker dat je door wilt gaan?',
    components: [buildRow()],
    ephemeral: true,
    fetchReply: true,
  });

  const collector = message.createMessageComponentCollector({
    filter: (i) => i.user.id === interaction.user.id,
    time: CONFIRM_TIMEOUT_MS,
    max: 1,
  });

  let answered = false;

  collector.on('collect', async (i) => {
    answered = true;

    if (i.customId === CANCEL_ID) {
      await i.update({ content: 'Geannuleerd. Er zijn geen rollen verwijderd.', components: [] });
      return;
    }

    try {
      await i.deferUpdate();
      await interaction.editReply({ content: 'Rollen worden verwijderd...', components: [] });
      const summary = await deleteRoles(interaction);
      await interaction.editReply({ content: summary, components: [] });
    } catch (err) {
      console.error(err);
      await interaction
        .editReply({ content: 'Er ging iets mis bij het verwijderen van de rollen.', components: [] })
        .catch(() => {});
    }
  });

  collector.on('end', async () => {
    if (answered) return;
    await interaction
      .editReply({
        content: 'Tijd verstreken. Er zijn geen rollen verwijderd.',
        components: [buildRow(true)],
      })
      .catch(() => {});
  });
}

module.exports = { data, execute };
