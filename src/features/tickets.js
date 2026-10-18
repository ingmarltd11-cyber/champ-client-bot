const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const { STAFF_ROLE_NAMES, TICKETS, BRAND_COLOR } = require('../config');
const { findRole, isStaff } = require('../utils/permissions');
const { loadCategories } = require('../utils/ticketCategories');
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

async function handleSelect(interaction) {
  const category = loadCategories().find((c) => c.id === interaction.values[0]);
  if (!category) {
    return interaction.reply({
      content: '❌ This ticket category no longer exists. Ask staff to repost the panel.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const { guild, user, client } = interaction;
    const channelName = ticketChannelName(user.username);

    const existing = guild.channels.cache.find((channel) => channel.name === channelName);
    if (existing) {
      return interaction.editReply({ content: `You already have an open ticket: ${existing}` });
    }

    const parent = await ensureTicketCategory(guild);
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: parent.id,
      topic: `ticket-opener:${user.id} type:${category.id}`,
      permissionOverwrites: ticketOverwrites(guild, client.user.id, user.id),
      reason: `Ticket opened by ${user.tag}`,
    });

    const embed = new EmbedBuilder()
      .setTitle(`${category.emoji ?? ''} ${category.label}`.trim())
      .setDescription(
        `Thanks for opening a ticket, ${user}.\n\nDescribe your issue in as much detail as you can. A staff member will be with you shortly.`
      )
      .setColor(BRAND_COLOR)
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket-close')
        .setLabel('Close Ticket')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger)
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

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket-close-confirm')
      .setLabel('Close ticket')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('ticket-close-cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  return interaction.reply({
    content: 'Are you sure you want to close this ticket?',
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

async function confirmClose(interaction) {
  const channel = interaction.channel;
  const openerId = getOpenerId(channel);
  if (!openerId) {
    return interaction.update({ content: '❌ This is not a ticket channel.', components: [] });
  }
  if (interaction.user.id !== openerId && !isStaff(interaction.member)) {
    return interaction.update({
      content: '❌ Only the ticket opener or staff can close this ticket.',
      components: [],
    });
  }

  const seconds = TICKETS.closeDelaySeconds;
  await interaction.update({ content: `Closing this ticket in ${seconds} seconds.`, components: [] });
  await channel.send(`🔒 Ticket closed by ${interaction.user}. This channel will be deleted in ${seconds} seconds.`);

  await saveTicketClosed({ channelId: channel.id }).catch((err) => console.error(err.message));

  setTimeout(() => {
    channel.delete('Ticket closed').catch((err) => {
      console.error('Could not delete ticket channel:', err.message);
    });
  }, seconds * 1000);
}

module.exports = { handleSelect, requestClose, confirmClose };
