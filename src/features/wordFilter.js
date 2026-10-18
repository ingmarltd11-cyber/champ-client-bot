// Matches "rat" as a whole word, case-insensitive.
const RAT_PATTERN = /\brat\b/i;

// Deletes the message silently: no warning, no timeout, no log.
// Only the bot's own messages are exempt.
async function filterMessage(message) {
  if (!message.guild) return;
  if (message.author.id === message.client.user.id) return;
  if (!RAT_PATTERN.test(message.content ?? '')) return;

  await message.delete().catch((err) => {
    console.error('Could not delete filtered message:', err.message);
  });
}

module.exports = { filterMessage, RAT_PATTERN };
