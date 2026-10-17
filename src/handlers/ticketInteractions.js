const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { getTicketConfig } = require('../config/loadConfig');
const { resolveSupportRole, isStaffMember } = require('../utils/permissions');
const ticketStore = require('../utils/ticketStore');
const { generateTranscripts } = require('../utils/transcript');
const { logTicketEvent } = require('../utils/ticketLog');

function sanitize(name) {
  return String(name || 'user').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 80);
}

function buildChannelName(type, user, config) {
  const pattern = config.settings.naming || '{emoji}-{username}';
  return pattern
    .replace('{emoji}', type.emoji || 'ticket')
    .replace('{username}', sanitize(user.username))
    .replace('{type}', type.id)
    .slice(0, 90);
}

// Stap 1: gebruiker kiest een ticket-type in het select-menu
async function handleSelect(interaction) {
  const config = getTicketConfig();
  const typeId = interaction.values[0];
  const type = config.types.find((t) => t.id === typeId);
  if (!type) return interaction.reply({ content: 'Onbekend ticket-type.', ephemeral: true });

  const limit = type.maxOpen ?? config.settings.maxOpenTicketsPerUser ?? 1;
  const openCount = await ticketStore.countOpenByUser(interaction.user.id);
  if (openCount >= limit) {
    return interaction.reply({
      content: 'Je hebt al een open ticket. Sluit deze eerst voordat je een nieuwe opent.',
      ephemeral: true,
    });
  }

  // Geen vragen ingesteld voor dit type? Dan direct het kanaal aanmaken.
  if (!type.questions || type.questions.length === 0) {
    await interaction.deferReply({ ephemeral: true });
    const channel = await createTicketChannel(interaction, type, {});
    return interaction.editReply(`Ticket aangemaakt: ${channel}`);
  }

  // Anders eerst een modal (formulier) tonen met de ingestelde vragen
  const modal = new ModalBuilder()
    .setCustomId(`ticket-modal-${type.id}`)
    .setTitle(type.label.slice(0, 45));

  for (const q of type.questions.slice(0, 5)) {
    const input = new TextInputBuilder()
      .setCustomId(q.id)
      .setLabel(q.label.slice(0, 45))
      .setStyle(q.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(q.required !== false);
    if (q.placeholder) input.setPlaceholder(String(q.placeholder).slice(0, 100));
    if (q.maxLength) input.setMaxLength(Math.min(Number(q.maxLength) || 1000, 4000));
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }

  await interaction.showModal(modal);
}

// Stap 2: modal wordt ingediend -> ticket-kanaal aanmaken met de antwoorden erin
async function handleModalSubmit(interaction) {
  const config = getTicketConfig();
  const typeId = interaction.customId.replace('ticket-modal-', '');
  const type = config.types.find((t) => t.id === typeId);
  if (!type) return interaction.reply({ content: 'Onbekend ticket-type.', ephemeral: true });

  await interaction.deferReply({ ephemeral: true });

  const answers = {};
  for (const q of type.questions || []) {
    answers[q.id] = interaction.fields.getTextInputValue(q.id);
  }

  const channel = await createTicketChannel(interaction, type, answers);
  await interaction.editReply(`Ticket aangemaakt: ${channel}`);
}

async function createTicketChannel(interaction, type, answers) {
  const config = getTicketConfig();
  const guild = interaction.guild;
  const user = interaction.user;

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
    {
      id: guild.members.me.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],
    },
  ];
  const supportRole = resolveSupportRole(guild, type, config);
  if (supportRole) {
    overwrites.push({
      id: supportRole.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
    });
  }

  const categoryId = config.settings.ticketCategoryId;
  const channel = await guild.channels.create({
    name: buildChannelName(type, user, config),
    type: ChannelType.GuildText,
    parent: categoryId && !categoryId.includes('_ID') ? categoryId : undefined,
    permissionOverwrites: overwrites,
    topic: `Ticket van ${user.tag} | type: ${type.id}`,
  });

  await ticketStore.addTicket(channel.id, { guildId: guild.id, userId: user.id, typeId: type.id, answers });

  const embed = new EmbedBuilder()
    .setTitle(`${type.emoji || ''} ${type.label}`.trim())
    .setDescription(`Welkom ${user}, een teamlid helpt je zo snel mogelijk.`)
    .setColor(config.panel.color)
    .setTimestamp();

  for (const [key, value] of Object.entries(answers)) {
    const question = (type.questions || []).find((q) => q.id === key);
    embed.addFields({ name: question?.label || key, value: String(value || '-').slice(0, 1024) });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket-claim').setLabel('Claim').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ticket-close').setLabel('Sluiten').setStyle(ButtonStyle.Danger)
  );

  const pingContent = supportRole && type.pingSupport !== false ? `<@&${supportRole.id}>` : '';
  await channel.send({ content: pingContent, embeds: [embed], components: [row] });

  await logTicketEvent(guild, config, {
    title: `Ticket geopend: ${type.label}`,
    color: '#4D9FFF',
    fields: [
      { name: 'Kanaal', value: `${channel}`, inline: true },
      { name: 'Geopend door', value: `${user.tag}`, inline: true },
      { name: 'Type', value: type.label, inline: true },
    ],
  });

  return channel;
}

async function handleClaim(interaction) {
  const config = getTicketConfig();
  const ticket = await ticketStore.getTicket(interaction.channel.id);
  if (!ticket) return interaction.reply({ content: 'Dit is geen ticket-kanaal.', ephemeral: true });
  if (!isStaffMember(interaction.member, interaction.guild, config)) {
    return interaction.reply({ content: 'Alleen staff kan een ticket claimen.', ephemeral: true });
  }

  await ticketStore.claimTicket(interaction.channel.id, interaction.user.id);
  await interaction.reply({ content: `Ticket geclaimd door ${interaction.user}.` });
  await logTicketEvent(interaction.guild, config, {
    title: 'Ticket geclaimd',
    color: '#B26AE0',
    fields: [
      { name: 'Kanaal', value: `${interaction.channel}`, inline: true },
      { name: 'Geclaimd door', value: `${interaction.user.tag}`, inline: true },
    ],
  });
}

// Gedeelde sluit-logica (knop, /ticket-close en auto-close gebruiken deze).
async function closeTicketChannel(channel, config, { closerTag = 'systeem', reason = null } = {}) {
  const ticket = await ticketStore.getTicket(channel.id);
  if (!ticket) return null;

  const format = config.settings.transcriptFormat || 'both';
  const { txt, html, text } = await generateTranscripts(channel, format);
  const files = [txt, html].filter(Boolean);

  // Transcript naar de opener sturen (als dat aan staat)
  if (config.settings.sendTranscriptDm !== false) {
    try {
      const opener = await channel.client.users.fetch(ticket.userId);
      await opener.send({
        content:
          `Hier is het transcript van je **${ticket.typeId}**-ticket in **${channel.guild.name}**.` +
          (reason ? `\nReden: ${reason}` : ''),
        files,
      });
    } catch {
      await channel.send('Kon het transcript niet via DM versturen (DMs mogelijk dicht). Transcript blijft bewaard bij de bot.').catch(() => {});
    }

    // Beoordeling vragen via DM (als dat aan staat voor dit type)
    const type = config.types.find((t) => t.id === ticket.typeId);
    if (config.settings.rating?.enabled && type?.ratingEnabled !== false) {
      try {
        const opener = await channel.client.users.fetch(ticket.userId);
        const row = new ActionRowBuilder().addComponents(
          [1, 2, 3, 4, 5].map((n) =>
            new ButtonBuilder().setCustomId(`ticket-rate:${channel.id}:${n}`).setLabel(String(n)).setStyle(ButtonStyle.Secondary)
          )
        );
        await opener.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(config.settings.rating.title || 'Beoordeel onze support')
              .setDescription(config.settings.rating.message || 'Hoe tevreden ben je?')
              .setColor(config.panel.color),
          ],
          components: [row],
        });
      } catch {
        /* DM dicht: beoordeling overslaan */
      }
    }
  }

  await ticketStore.closeTicket(channel.id, { transcript: text });

  await logTicketEvent(channel.guild, config, {
    title: 'Ticket gesloten',
    color: '#FF4D5E',
    fields: [
      { name: 'Kanaal', value: `#${channel.name}`, inline: true },
      { name: 'Gesloten door', value: closerTag, inline: true },
      ...(reason ? [{ name: 'Reden', value: reason }] : []),
    ],
  });

  const delay = (config.settings.deleteDelaySeconds ?? 5) * 1000;
  setTimeout(() => channel.delete().catch(() => {}), delay);
  return { txt, html };
}

async function handleClose(interaction) {
  const config = getTicketConfig();
  const ticket = await ticketStore.getTicket(interaction.channel.id);
  if (!ticket) return interaction.reply({ content: 'Dit is geen ticket-kanaal.', ephemeral: true });

  const isOpener = interaction.user.id === ticket.userId;
  const isStaff = isStaffMember(interaction.member, interaction.guild, config);
  if (!isOpener && !isStaff) {
    return interaction.reply({ content: 'Alleen de opener of staff kan dit ticket sluiten.', ephemeral: true });
  }

  await interaction.reply('Ticket wordt gesloten, transcript wordt gegenereerd...');
  await closeTicketChannel(interaction.channel, config, { closerTag: interaction.user.tag });
}

// Beoordeling: klik op sterren -> modal voor optionele opmerking
async function handleRateButton(interaction) {
  const [, channelId, stars] = interaction.customId.split(':');
  const ticket = await ticketStore.getTicket(channelId);
  if (!ticket) return interaction.reply({ content: 'Dit ticket bestaat niet meer.', ephemeral: true });
  if (interaction.user.id !== ticket.userId) {
    return interaction.reply({ content: 'Alleen de opener kan een beoordeling geven.', ephemeral: true });
  }
  const modal = new ModalBuilder()
    .setCustomId(`ticket-rate-modal:${channelId}:${stars}`)
    .setTitle(`Beoordeling: ${stars} ster${stars === '1' ? '' : 'ren'}`);
  const input = new TextInputBuilder()
    .setCustomId('comment')
    .setLabel('Opmerking (optioneel)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function handleRateModal(interaction) {
  const config = getTicketConfig();
  const [, channelId, stars] = interaction.customId.split(':');
  const comment = interaction.fields.getTextInputValue('comment') || null;
  await ticketStore.setRating(channelId, Number(stars), comment);
  await interaction.reply({ content: `Bedankt voor je beoordeling (${stars}/5)!`, ephemeral: true });
  await logTicketEvent(interaction.guild, config, {
    title: `Nieuwe beoordeling: ${stars}/5`,
    color: '#FFC93C',
    fields: [
      { name: 'Ticket', value: channelId, inline: true },
      { name: 'Van', value: interaction.user.tag, inline: true },
      ...(comment ? [{ name: 'Opmerking', value: comment.slice(0, 1024) }] : []),
    ],
  });
}

module.exports = {
  handleSelect,
  handleModalSubmit,
  handleClaim,
  handleClose,
  handleRateButton,
  handleRateModal,
  closeTicketChannel,
};
