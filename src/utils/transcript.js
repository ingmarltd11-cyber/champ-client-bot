const { AttachmentBuilder } = require('discord.js');

// Fetches the whole channel history, oldest message first.
async function fetchAllMessages(channel) {
  const all = [];
  let before;
  for (;;) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (batch.size === 0) break;
    all.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  return all.reverse();
}

function formatMessage(message) {
  const time = new Date(message.createdTimestamp).toISOString();
  const author = `${message.author.tag} (${message.author.id})`;
  const lines = [`[${time}] ${author}: ${message.content || '[no text]'}`];
  for (const attachment of message.attachments.values()) {
    lines.push(`  Attachment: ${attachment.url}`);
  }
  return lines.join('\n');
}

// Returns a .txt attachment with every message in the channel.
async function createTranscript(channel) {
  const messages = await fetchAllMessages(channel);
  const header =
    `Transcript of #${channel.name} (${channel.id})\n` +
    `Generated: ${new Date().toISOString()}\n${'='.repeat(50)}\n\n`;
  const text = header + messages.map(formatMessage).join('\n');
  return new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: `transcript-${channel.name}.txt` });
}

module.exports = { createTranscript };
