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
const { ROLES, TICKET_STAFF_ROLE_NAMES, TICKETS, BRAND_COLOR } = require('../config');
const { findRole, isAdmin, roleMatchesName, normalizeName } = require('../utils/permissions');
const { applyTicketActions } = require('./ticketRoles');
const { verifiedRoleNames } = require('./verify');
const { loadCategories, MAX_QUESTIONS, MAX_MESSAGE_LENGTH, buttonStyle } = require('../utils/ticketCategories');
const { DEFAULT_PANEL_ID, getPanel, panelCategories } = require('../utils/ticketPanels');
const { createTranscript } = require('../utils/transcript');
const { saveTicketOpened, saveTicketClosed } = require('../utils/ticketStore');
const triage = require('./ticketTriage');
const aiSupport = require('./aiSupport');

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

// The verify panel shows one extra button for members who are not verified yet. They may open
// one ticket at a time (the normal one-open-ticket rule), so nobody is stuck without help.
const UNVERIFIED_TICKET_ID = 'unverified-ticket';
const UNVERIFIED_CATEGORY = {
  id: 'unverified-support',
  label: 'Unverified support',
  emoji: '🎫',
  description: 'One ticket for members who are not verified yet',
  welcomeMessage:
    'You are not verified yet, so you can open one ticket at a time to ask staff for help.\n\n' +
    'Tell us what you need and a staff member will answer as soon as possible.\n' +
    'When the issue is solved, a staff member closes the ticket for you; you can open a new one later or verify with `/verify`.',
};

// Buttons from a multi-panel setup use "panelId:categoryId"; old panels only send the
// category, which belongs to the default panel. Both keep working.
function parseTicketId(value) {
  const parts = String(value ?? '').split(':').filter(Boolean);
  if (parts.length >= 2) return { panelId: parts[0], categoryId: parts[1] };
  return { panelId: DEFAULT_PANEL_ID, categoryId: parts[0] };
}

function findCategoryInPanel(panelId, categoryId) {
  const panel = getPanel(panelId);
  if (panel) return panelCategories(panel).find((category) => category.id === categoryId) ?? null;
  // Unknown panel (removed while the panel message stayed): fall back to all categories.
  return loadCategories().find((category) => category.id === categoryId) ?? null;
}

// Channels that are already being closed, so a double click cannot schedule two deletes.
const closing = new Set();

// Only support and developer see tickets, next to the member who opened it. Every other role
// keeps no access at all, so a ticket is never readable by media, partners or other staff.
function ticketStaffOverwrites(guild) {
  return TICKET_STAFF_ROLE_NAMES.map((name) => findRole(guild, name))
    .filter(Boolean)
    .map((role) => ({ id: role.id, allow: STAFF_ACCESS }));
}

// Support and developer may request and accept a closure; the server owner and other admins
// always can, because Discord gives administrators every channel anyway.
function isTicketStaff(member) {
  if (!member) return false;
  if (isAdmin(member)) return true;
  return TICKET_STAFF_ROLE_NAMES.some((name) =>
    member.roles?.cache?.some((role) => roleMatchesName(role, name))
  );
}

// Every ticket text may contain {user}: it always becomes a real mention of the ticket opener,
// so the opener is pinged wherever the text is posted (welcome message, close request, ...).
function renderTicketText(text, openerId) {
  const value = String(text ?? '');
  if (!value || !openerId) return value;
  return value.replace(/\{user\}/gi, `<@${openerId}>`);
}

function ticketMentions(openerId, roleIds = []) {
  return {
    parse: [],
    users: openerId ? [String(openerId)] : [],
    roles: roleIds,
  };
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
      ...ticketStaffOverwrites(guild),
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
    ...ticketStaffOverwrites(guild),
  ];
}

function getOpenerId(channel) {
  const match = OPENER_PATTERN.exec(channel.topic ?? '');
  return match ? match[1] : null;
}

// Ticket posts in a forum are threads: the post owner is the opener. Any other thread is not a
// ticket, so /close cannot archive an unrelated conversation.
function isTicketThread(channel) {
  return Boolean(
    channel?.isThread?.() &&
      (channel.parent?.type === ChannelType.GuildForum || getOpenerId(channel))
  );
}

// Works for both ticket shapes: a text channel with the opener in its topic, and a forum post.
function ticketOpenerId(channel) {
  return getOpenerId(channel) ?? (isTicketThread(channel) ? channel.ownerId ?? null : null);
}

function findExistingTicket(guild, user) {
  const channelName = ticketChannelName(user.username);
  return guild.channels.cache.find((channel) => channel.name === channelName) ?? null;
}

// One text input per question. Discord allows at most 5 inputs per modal.
function buildFormModal(category, panelId = DEFAULT_PANEL_ID) {
  const modal = new ModalBuilder()
    .setCustomId(`${FORM_PREFIX}${panelId}:${category.id}`)
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
async function createTicket(interaction, category, answers, panelId = DEFAULT_PANEL_ID) {
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
      topic: `ticket-opener:${user.id} type:${category.id} panel:${panelId}`,
      permissionOverwrites: ticketOverwrites(guild, client.user.id, user.id),
      reason: `Ticket opened by ${user.tag}`,
    });

    const embed = new EmbedBuilder()
      .setTitle(`${category.emoji ?? ''} ${category.label}`.trim())
      .setDescription(
        renderTicketText(
          category.welcomeMessage ||
            'Thanks for opening a ticket, {user}.\n\nDescribe your issue in as much detail as you can. A staff member will be with you shortly.',
          user.id
        )
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

    await channel.send({
      content: `<@${user.id}>`,
      embeds: [embed],
      components: [row],
      allowedMentions: ticketMentions(user.id),
    });

    // The ticket assistant answers the form right away, for example when the client version is
    // not one we support, and offers 👍 / 👎 so the opener can confirm or explain. Without such
    // advice the support assistant answers the answers themselves, so nobody has to ping first.
    const advice = await triage
      .postTriage(channel, { answers })
      .catch((err) => {
        console.error('Could not post the ticket advice:', err.message);
        return null;
      });

    if (!advice) {
      // Not awaited: the opener must not wait for a model call before the ticket is confirmed.
      aiSupport
        .answerIntake(channel, { answers, openerId: user.id })
        .catch((err) => console.error('Could not answer the ticket intake:', err.message));
    }

    // Roles configured with /setrole or /ticket-actions are given to the opener here.
    const applied = await applyTicketActions(interaction.member, { panelId });
    if (applied.added.length > 0) {
      await channel
        .send({
          content: `✅ Added to the opener: **${applied.added.join('**, **')}**`,
          allowedMentions: { parse: [] },
        })
        .catch(() => {});
    }
    if (applied.failed.length > 0) {
      console.error(`Ticket actions for ${user.tag} failed: ${applied.failed.join(', ')}`);
      await channel
        .send({
          content: `⚠️ These ticket roles could not be added: ${applied.failed.join(', ')}`,
          allowedMentions: { parse: [] },
        })
        .catch(() => {});
    }

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
  const { panelId, categoryId } = parseTicketId(interaction.customId.slice(OPEN_PREFIX.length));
  const category = findCategoryInPanel(panelId, categoryId);
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
    return interaction.showModal(buildFormModal(category, panelId));
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  return createTicket(interaction, category, [], panelId);
}

function isVerifiedMember(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;

  const names = verifiedRoleNames().map(normalizeName);
  return member.roles.cache.some((role) => names.includes(normalizeName(role.name)));
}

// Opened from the verify panel. Unverified members get exactly one ticket at a time; a member
// who is already verified is sent to the normal ticket panel instead.
async function openUnverifiedTicket(interaction) {
  if (!interaction.guild) {
    return interaction.reply({
      content: '❌ Tickets only work inside the server.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (isVerifiedMember(interaction.member)) {
    return interaction.reply({
      content: '✅ You are already verified, so you can use the normal ticket panel. This button is for unverified members.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const existing = findExistingTicket(interaction.guild, interaction.user);
  if (existing) {
    return interaction.reply({
      content: `You already have an open ticket: ${existing}. You can open one ticket at a time.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  return createTicket(interaction, UNVERIFIED_CATEGORY, [], DEFAULT_PANEL_ID);
}

async function handleFormSubmit(interaction) {
  const { panelId, categoryId } = parseTicketId(interaction.customId.slice(FORM_PREFIX.length));
  const category = findCategoryInPanel(panelId, categoryId);
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

  return createTicket(interaction, category, answers, panelId);
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

// Posts the closing message with the reason, saves it, and deletes the channel after a short
// delay. A forum post cannot be deleted like a channel, so it is locked and archived instead.
async function closeTicket(channel, closer, reason) {
  if (closing.has(channel.id)) return;
  closing.add(channel.id);

  const thread = Boolean(channel.isThread?.());
  const seconds = TICKETS.closeDelaySeconds;
  await channel.send({
    content: `🔒 Ticket closed by ${closer}.\n**Reason:** ${renderTicketText(
      reason,
      ticketOpenerId(channel)
    )}\n${
      thread ? 'This post is now locked and archived.' : `This channel will be deleted in ${seconds} seconds.`
    }`,
    allowedMentions: { parse: [] },
  });

  await saveTicketClosed({ channelId: channel.id, closedBy: closer.id, reason }).catch((err) =>
    console.error(err.message)
  );

  // Sent before the delete timer starts, so the channel is not removed mid-transcript.
  await sendTranscript(channel, ticketOpenerId(channel));

  if (thread) {
    await channel.setLocked(true, 'Ticket closed').catch((err) => {
      console.error('Could not lock the ticket post:', err.message);
    });
    await channel.setArchived(true, 'Ticket closed').catch((err) => {
      console.error('Could not archive the ticket post:', err.message);
    });
    return;
  }

  setTimeout(() => {
    channel.delete('Ticket closed').catch((err) => {
      console.error('Could not delete ticket channel:', err.message);
    });
  }, seconds * 1000);
}

// Only ticket staff (support and developer) start a close request, and a reason is required.
async function requestClose(interaction) {
  const openerId = ticketOpenerId(interaction.channel);
  if (!openerId) {
    return interaction.reply({ content: '❌ This is not a ticket channel.', flags: MessageFlags.Ephemeral });
  }
  if (!isTicketStaff(interaction.member)) {
    return interaction.reply({
      content:
        '❌ Only support and developer can close a ticket. A staff member closes it for you when it is solved.',
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

// Posts a close request. Only support and developer start one, and the opener is pinged so they
// see it and can accept or deny. {user} in the reason becomes a mention of the opener too.
async function postCloseRequest(channel, guild, requester, reason, openerId = ticketOpenerId(channel)) {
  const staffRoles = TICKET_STAFF_ROLE_NAMES.map((name) => findRole(guild, name)).filter(Boolean);
  const embed = new EmbedBuilder()
    .setTitle('Close request')
    .setDescription(
      renderTicketText(
        `${requester} would like to close this ticket.\n\n{user}, do you agree? **Accept close** closes it, **Deny** keeps it open.`,
        openerId
      )
    )
    .addFields({ name: 'Reason', value: renderTicketText(reason, openerId) })
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

  return channel.send({
    content: [openerId ? `<@${openerId}>` : '', ...staffRoles.map((role) => `${role}`)]
      .filter(Boolean)
      .join(' '),
    embeds: [embed],
    components: [row],
    allowedMentions: ticketMentions(openerId, staffRoles.map((role) => role.id)),
  });
}

// The Close Ticket button asks ticket staff for a reason and posts a close request, so the
// opener is always pinged before the ticket disappears. The opener cannot close it themselves.
async function handleCloseModal(interaction) {
  const channel = interaction.channel;
  const openerId = ticketOpenerId(channel);
  if (!openerId) {
    return interaction.reply({ content: '❌ This is not a ticket channel.', flags: MessageFlags.Ephemeral });
  }

  if (!isTicketStaff(interaction.member)) {
    return interaction.reply({
      content: '❌ Only support and developer can close a ticket.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const reason = interaction.fields.getTextInputValue('reason').trim();
  if (!reason) {
    return interaction.reply({ content: '❌ A reason is required.', flags: MessageFlags.Ephemeral });
  }

  await postCloseRequest(channel, interaction.guild, interaction.user, reason, openerId);
  return interaction.reply({
    content: '✅ Close request posted. The ticket opener is pinged and can accept or deny it.',
    flags: MessageFlags.Ephemeral,
  });
}

// The opener decides about the request staff made; support and developer may also accept it.
async function acceptCloseRequest(interaction) {
  const openerId = ticketOpenerId(interaction.channel);
  const allowed = interaction.user.id === openerId || isTicketStaff(interaction.member);
  if (!allowed) {
    return interaction.reply({
      content: '❌ Only the ticket opener or support/developer can answer a close request.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const field = interaction.message.embeds[0]?.fields?.find((f) => f.name === 'Reason');
  const reason = field ? field.value : 'No reason given';

  await interaction.update({ content: `Close request accepted by ${interaction.user}.`, components: [] });
  return closeTicket(interaction.channel, interaction.user, reason);
}

async function denyCloseRequest(interaction) {
  const openerId = ticketOpenerId(interaction.channel);
  const allowed = interaction.user.id === openerId || isTicketStaff(interaction.member);
  if (!allowed) {
    return interaction.reply({
      content: '❌ Only the ticket opener or support/developer can answer a close request.',
      flags: MessageFlags.Ephemeral,
    });
  }

  return interaction.update({
    content: `Close request denied by ${interaction.user}. The ticket stays open.`,
    components: [],
  });
}

// Thumbs up on the ticket advice tells staff the opener is helped (only staff close a ticket, so
// this pings them instead of posting a close request); thumbs down asks what still fails. Only
// the ticket opener votes.
async function handleTriageReaction(reaction, user) {
  if (!user || user.bot) return false;

  const message = reaction.message?.partial
    ? await reaction.message.fetch().catch(() => null)
    : reaction.message;
  if (!message || !triage.isTriageMessage(message)) return false;

  const channel = message.channel;
  const openerId = ticketOpenerId(channel);
  if (!openerId || user.id !== openerId) return false;

  const emoji = reaction.emoji?.name;

  if (emoji === triage.HELPFUL) {
    const staffRoles = TICKET_STAFF_ROLE_NAMES.map((name) => findRole(message.guild, name)).filter(
      Boolean
    );
    await channel.send({
      content:
        `👍 ${user} says the advice solved it. A staff member can close this ticket with ` +
        `/close or the Close Ticket button.` +
        (staffRoles.length ? `\n${staffRoles.join(' ')}` : ''),
      allowedMentions: ticketMentions(null, staffRoles.map((role) => role.id)),
    });
    return true;
  }

  if (emoji === triage.NOT_HELPFUL) {
    await channel.send({
      content:
        `${user} Thanks for checking. What exactly went wrong? ` +
        'Send the error message, a screenshot or the step where it fails, and staff will help you further.',
      allowedMentions: { users: [user.id] },
    });
    return true;
  }

  return false;
}

// A new post in a forum (bug reports) is a ticket too: the opening post is checked for a client
// version we do not support. Every other post and channel is left alone.
async function handleForumTriage(message) {
  const channel = message?.channel;
  if (!message?.guild || message.author?.bot || message.system || message.webhookId) return false;
  if (!isTicketThread(channel)) return false;
  // A forum post and its starter message share an ID, so this answers the opening post once.
  if (message.id !== channel.id) return false;

  const posted = await triage
    .postTriage(channel, { content: message.content })
    .catch((err) => {
      console.error('Could not post the ticket advice:', err.message);
      return null;
    });
  return Boolean(posted);
}

module.exports = {
  UNVERIFIED_TICKET_ID,
  UNVERIFIED_CATEGORY,
  isVerifiedMember,
  parseTicketId,
  findCategoryInPanel,
  getTicketOpenerId: ticketOpenerId,
  handleOpen,
  openUnverifiedTicket,
  handleFormSubmit,
  requestClose,
  isTicketStaff,
  ticketOverwrites,
  handleCloseModal,
  acceptCloseRequest,
  denyCloseRequest,
  closeTicket,
  postCloseRequest,
  handleTriageReaction,
  handleForumTriage,
  CLOSE_MODAL_ID,
};
