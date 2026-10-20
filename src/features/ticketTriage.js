const { EmbedBuilder } = require('discord.js');
const { TICKETS, BRAND_COLOR } = require('../config');

// The footer marks the assistant's advice, so a reaction is only handled on this one message
// and never on a random message a member reacted to.
const TRIAGE_FOOTER = 'Ticket assistant';
const HELPFUL = '👍';
const NOT_HELPFUL = '👎';

// "1.21.10", "v1.21.10", "mc1.21" all count. The lookarounds stop a version from matching
// inside a longer number such as 11.21.10.
const VERSION_PATTERN = /(?<!\d)1\.(\d{1,2})(?:\.(\d{1,2}))?(?!\d)/g;

function versionsIn(text) {
  const found = String(text ?? '').match(VERSION_PATTERN) ?? [];
  return [...new Set(found)];
}

function isSupported(version, supported) {
  return supported.some((candidate) => {
    if (candidate === version) return true;
    // "1.21" is supported when a supported build starts with it, so a member who leaves out
    // the patch number is not sent away for nothing.
    return version.split('.').length === 2 && candidate.startsWith(`${version}.`);
  });
}

function latestSupported() {
  const versions = TICKETS.supportedVersions;
  return versions.length > 0 ? versions[versions.length - 1] : '';
}

// One rule per known problem. Every rule gets all answers as plain text and returns advice when
// it recognises something, so more checks can be added here without touching the ticket flow.
const RULES = [
  function versionRule(text) {
    const supported = TICKETS.supportedVersions;
    if (supported.length === 0) return null;

    const wrong = versionsIn(text).find((version) => !isSupported(version, supported));
    if (!wrong) return null;

    const latest = latestSupported();
    return {
      id: 'client-version',
      title: `Client version ${wrong} is not supported`,
      body: [
        `You are on **${wrong}**. ${latest} is our only version.`,
        `Please upgrade to ${latest}, start the game again and try once more.`,
      ].join('\n'),
    };
  },
];

// Turns the answers of a ticket form (or a forum opening post) into advice, or null when there
// is nothing to say about them.
function suggestionFor({ answers = [], content = '' } = {}) {
  const text = [
    ...answers.map(({ question, answer }) => `${question ?? ''}: ${answer ?? ''}`),
    content,
  ]
    .filter((line) => String(line ?? '').trim())
    .join('\n');

  if (!text.trim()) return null;

  for (const rule of RULES) {
    const suggestion = rule(text);
    if (suggestion) return suggestion;
  }
  return null;
}

// Posts the advice with a thumb up and a thumb down. The caller decides what the votes mean.
async function postTriage(channel, { answers = [], content = '' } = {}) {
  const suggestion = suggestionFor({ answers, content });
  if (!suggestion) return null;

  const embed = new EmbedBuilder()
    .setTitle(suggestion.title)
    .setDescription(
      [
        suggestion.body,
        '',
        'Did this solve it? 👍 asks staff to close the ticket, 👎 lets you tell us what still fails.',
      ].join('\n')
    )
    .setColor(BRAND_COLOR)
    .setFooter({ text: TRIAGE_FOOTER });

  const message = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  await message.react(HELPFUL).catch((err) => {
    console.error('Could not add the 👍 reaction:', err.message);
  });
  await message.react(NOT_HELPFUL).catch((err) => {
    console.error('Could not add the 👎 reaction:', err.message);
  });
  return message;
}

function isTriageMessage(message) {
  const botId = message?.client?.user?.id;
  if (botId && message.author?.id && message.author.id !== botId) return false;

  return Boolean(
    message?.embeds?.some(
      (embed) => (embed?.footer?.text ?? embed?.data?.footer?.text) === TRIAGE_FOOTER
    )
  );
}

module.exports = {
  TRIAGE_FOOTER,
  HELPFUL,
  NOT_HELPFUL,
  versionsIn,
  isSupported,
  suggestionFor,
  postTriage,
  isTriageMessage,
};
