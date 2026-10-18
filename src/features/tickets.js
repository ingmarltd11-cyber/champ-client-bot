const {
  ActionRowBuilder,
  ButtonBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { ROLES, STAFF_ROLE_NAMES, TICKETS, BRAND_COLOR } = require('../config');
const { findRole, isStaff } = require('../utils/permissions');
const { loadCategories, MAX_QUESTIONS, MAX_MESSAGE_LENGTH, buttonStyle } = require('../utils/ticketCategories');
const { createTranscript } = require('../utils/transcript');
const { saveTicketOpened, saveTicketClosed } = require('../utils/ticketStore');

const USER_ACCESS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
];

const STAFF_ACCESS = [
  ...USER_ACCESS,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageMessages,
];

// The opener ID is stored in the channel topic so it survives restarts.
const OPENER_PATTERN = /ticket-opener:(\d+)/;
const OPEN_PREFIX = 'ticket-open:';
const FORM_PREFIX = 'ticket-form:';
const CLOSE_MODAL_ID = 'ticket-close-modal';

// Channels that are already being closed, so a double click cannot schedule two deletes.
const closing = new Set();

function staffOverwrites(guild) {
  // The support role is always included, so it always has ticket access.
  return STAFF_ROLE_NAMES.map((name) => findRole(guild, name))
    .filter(Boolean)
    .map((role) => ({ id: role.id, allow: STAFF_ACCESS }));
}

async function ensureTicketCategory(guild) {
  const existing = guild.channels.cache.find(
    (channel) =>
      channel.type === ChannelType.GuildCategory && channel.name === TICKETS.categoryName
  );
  if (existing) return existing;

  return guild.channels.create({
    name: TICKETS.categoryName,
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      ...staffOverwrites(guild),
    ],
    reason: 'Ticket category created by Champ Client Bot',
  });
}

function ticketChannelName(username) {
  const slug = username
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${TICKETS.channelPrefix}${slug || 'user'}`;
}

function ticketOverwrites(guild, clientId, userId) {
  return [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: userId, allow: USER_ACCESS },
    { id: clientId, allow: STAFF_ACCESS },
    ...staffOverwrites(guild),
  ];
}

function getOpenerId(channel) {
  const match = OPENER_PATTERN.exec(channel.topic ?? '');
  return match ? match[1] : null;
}

function findExistingTicket(guild, user) {
  const channelName = ticketChannelName(user.username);
  return guild.channels.cache.find((channel) => channel.name === channelName) ?? null;
}

// One text input per question. Discord allows at most 5 inputs per modal.
function buildFormModal(category) {
  const modal = new ModalBuilder()
    .setCustomId(`${FORM_PREFIX}${category.id}`)
    .setTitle(category.label.slice(0, 45));

  modal.addComponents(
    category.questions.slice(0, MAX_QUESTIONS).map((question, index) =>
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(`q${index}`)
          .setLabel(question)
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(MAX_MESSAGE_LENGTH)
      )
    )
  );
  return modal;
}

// Creates the ticket channel. The interaction must already be deferred.
async function createTicket(interaction, category, answers) {
  const { guild, user, client } = interaction;

  const existing = findExistingTicket(guild, user);
  if (existing) {
    return interaction.editReply({ content: `You already have an open ticket: ${existing}` });
  }

  try {
    const parent = await ensureTicketCategory(guild);
    const channel = await guild.channels.create({
      name: ticketChannelName(user.username),
      type: ChannelType.GuildText,
      parent: parent.id,
      topic: `ticket-opener:${user.id} type:${category.id}`,
      permissionOverwrites: ticketOverwrites(guild, client.user.id, user.id),
      reason: `Ticket opened by ${user.tag}`,
    });

    const embed = new EmbedBuilder()
      .setTitle(`${category.emoji ?? ''} ${category.label}`.trim())
      .setDescription(
        category.welcomeMessage ||
          `Thanks for opening a ticket, ${user}.\n\nDescribe your issue in as much detail as you can. A staff member will be with you shortly.`
      )
      .setColor(BRAND_COLOR)
      .setTimestamp();

    if (answers.length) {
      embed.addFields(answers.map(({ question, answer }) => ({ name: question, value: answer })));
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket-close')
        .setLabel('Close Ticket')
        .setEmoji('🔒')
        .setStyle(buttonStyle(TICKETS.buttonColors.close))
    );

    await channel.send({ content: `${user}`, embeds: [embed], components: [row] });

    await saveTicketOpened({
      channelId: channel.id,
      guildId: guild.id,
      userId: user.id,
      typeId: category.id,
    }).catch((err) => console.error(err.message));

    await interaction.editReply({ content: `✅ Your ticket has been created: ${channel}` });
  } catch (err) {
    console.error('Could not create ticket:', err);
    await interaction.editReply({ content: '❌ Could not create your ticket. Please contact staff.' });
  }
}

async function handleOpen(interaction) {
  const categoryId = interaction.customId.slice(OPEN_PREFIX.length);
  const category = loadCategories().find((c) => c.id === categoryId);
  if (!category) {
    return interaction.reply({
      content: '❌ This ticket category no longer exists. Ask staff to repost the panel.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const existing = findExistingTicket(interaction.guild, interaction.user);
  if (existing) {
    return interaction.reply({
      content: `You already have an open ticket: ${existing}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // Categories with questions show the form first; the ticket is created on submit.
  if (category.questions?.length) {
    return interaction.showModal(buildFormModal(category));
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  return createTicket(interaction, category, []);
}

async function handleFormSubmit(interaction) {
  const categoryId = interaction.customId.slice(FORM_PREFIX.length);
  const category = loadCategories().find((c) => c.id === categoryId);
  if (!category) {
    return interaction.reply({
      content: '❌ This ticket category no longer exists. Please open a new ticket.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const answers = (category.questions ?? []).slice(0, MAX_QUESTIONS).map((question, index) => ({
    question,
    answer: interaction.fields.getTextInputValue(`q${index}`),
  }));

  return createTicket(interaction, category, answers);
}

// DMs the opener the full transcript. If DMs are closed, the channel says so before it is deleted.
async function sendTranscript(channel, openerId) {
  if (!openerId) return;
  try {
    const attachment = await createTranscript(channel);
    const opener = await channel.client.users.fetch(openerId);
    await opener.send({
      content: `Here is the transcript of your ticket in ${channel.guild?.name ?? 'the server'}.`,
      files: [attachment],
    });
  } catch (err) {
    console.error('Could not send transcript:', err.message);
    await channel
      .send({
        content: '⚠️ The transcript could not be sent to the opener (their DMs may be closed).',
        allowedMentions: { parse: [] },
      })
      .catch(() => {});
  }
}

// Posts the closing message with the reason, saves it, and deletes the channel after a short delay.
async function closeTicket(channel, closer, reason) {
  if (closing.has(channel.id)) return;
  closing.add(channel.id);

  const seconds = TICKETS.closeDelaySeconds;
  await channel.send({
    content: `🔒 Ticket closed by ${closer}.\n**Reason:** ${reason}\nThis channel will be deleted in ${seconds} seconds.`,
    allowedMentions: { parse: [] },
  });

  await saveTicketClosed({ channelId: channel.id, closedBy: closer.id, reason }).catch((err) =>
    console.error(err.message)
  );

  // Sent before the delete timer starts, so the channel is not removed mid-transcript.
  await sendTranscript(channel, getOpenerId(channel));

  setTimeout(() => {
    channel.delete('Ticket closed').catch((err) => {
      console.error('Could not delete ticket channel:', err.message);
    });
  }, seconds * 1000);
}

// Anyone who can see a ticket can ask to close it, but a reason is required.
async function requestClose(interaction) {
  const openerId = getOpenerId(interaction.channel);
  if (!openerId) {
    return interaction.reply({ content: '❌ This is not a ticket channel.', flags: MessageFlags.Ephemeral });
  }
  if (interaction.user.id !== openerId && !isStaff(interaction.member)) {
    return interaction.reply({
      content: '❌ Only the ticket opener or staff can close this ticket.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const modal = new ModalBuilder().setCustomId(CLOSE_MODAL_ID).setTitle('Close ticket');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Reason for closing')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(300)
    )
  );
  return interaction.showModal(modal);
}

// Staff close at once. The opener's request goes to staff as a close request with Accept/Deny buttons.
async function handleCloseModal(interaction) {
  const channel = interaction.channel;
  const openerId = getOpenerId(channel);
  if (!openerId) {
    return interaction.reply({ content: '❌ This is not a ticket channel.', flags: MessageFlags.Ephemeral });
  }

  const reason = interaction.fields.getTextInputValue('reason').trim();
  if (!reason) {
    return interaction.reply({ content: '❌ A reason is required.', flags: MessageFlags.Ephemeral });
  }

  if (isStaff(interaction.member)) {
    await interaction.reply({ content: 'Closing this ticket.', flags: MessageFlags.Ephemeral });
    return closeTicket(channel, interaction.user, reason);
  }

  const supportRole = findRole(interaction.guild, ROLES.support);
  const embed = new EmbedBuilder()
    .setTitle('Close request')
    .setDescription(`${interaction.user} asks to close this ticket. Staff can accept or deny the request.`)
    .addFields({ name: 'Reason', value: reason })
    .setColor(BRAND_COLOR)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket-close-accept')
      .setLabel('Accept close')
      .setStyle(buttonStyle(TICKETS.buttonColors.accept)),
    new ButtonBuilder()
      .setCustomId('ticket-close-deny')
      .setLabel('Deny')
      .setStyle(buttonStyle(TICKETS.buttonColors.deny))
  );

  await channel.send({
    content: supportRole ? `${supportRole}` : undefined,
    embeds: [embed],
    components: [row],
  });
  return interaction.reply({ content: '✅ Your close request has been sent to staff.', flags: MessageFlags.Ephemeral });
}

async function acceptCloseRequest(interaction) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: '❌ Only staff can accept close requests.', flags: MessageFlags.Ephemeral });
  }

  const field = interaction.message.embeds[0]?.fields?.find((f) => f.name === 'Reason');
  const reason = field ? field.value : 'No reason given';

  await interaction.update({ content: `Close request accepted by ${interaction.user}.`, components: [] });
  return closeTicket(interaction.channel, interaction.user, reason);
}

async function denyCloseRequest(interaction) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: '❌ Only staff can deny close requests.', flags: MessageFlags.Ephemeral });
  }

  return interaction.update({
    content: `Close request denied by ${interaction.user}. The ticket stays open.`,
    components: [],
  });
}

module.exports = {
  handleOpen,
  handleFormSubmit,
  requestClose,
  handleCloseModal,
  acceptCloseRequest,
  denyCloseRequest,
  CLOSE_MODAL_ID,
};
