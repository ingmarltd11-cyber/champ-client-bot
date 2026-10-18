// Categories and channels created by /setup-server.
// - Channel names include their emoji prefix, exactly as shown in Discord.
// - A category with name null puts its channels at the top level (no category).
// - '{count}' in a voice channel name is replaced by the member count.
// - Existing categories and channels with the same name are skipped, so the command is safe to re-run.
// - Nothing is deleted: channels that are no longer listed must be removed by hand.
// - Channel types: 'text', 'voice' or 'forum'.
module.exports = {
  categories: [
    {
      name: null,
      channels: [
        { name: '✅│verify', type: 'text' },
        { name: '📈│Members: {count}', type: 'voice' },
      ],
    },
    {
      name: 'SERVER INFO',
      channels: [
        { name: '📣│announcements', type: 'text' },
        { name: '👋│welcome', type: 'text' },
        { name: '🎬│media-access', type: 'text' },
        { name: '🎉│giveaways', type: 'text' },
        { name: '📝│rules', type: 'text' },
        { name: '💰│marketplace', type: 'text' },
      ],
    },
    {
      name: 'CHAMP',
      channels: [
        { name: '🔔│release-information', type: 'text' },
        { name: '💻│dev-log', type: 'text' },
        { name: '🛒│champ-client', type: 'text' },
        { name: '🌐│website', type: 'text' },
        { name: '⭐│reviews', type: 'text' },
        { name: '🐞│bug-reports', type: 'forum' },
      ],
    },
    {
      name: 'COMMUNITY',
      channels: [
        { name: '💬│general-chat', type: 'text' },
        { name: '💬│general-chat-2', type: 'text' },
        { name: '📸│media', type: 'text' },
        { name: '🤖│commands', type: 'text' },
        { name: '💡│suggestions', type: 'forum' },
        { name: '📌│publishment', type: 'text' },
      ],
    },
    {
      name: 'CUSTOMERS',
      channels: [{ name: '🛒│customer-chat', type: 'text' }],
    },
    {
      name: 'VOICE',
      channels: [
        { name: '🔊 General VC 1', type: 'voice' },
        { name: '🔊 General VC 2', type: 'voice' },
        { name: '🔊 General VC 3', type: 'voice' },
        { name: '🔊 Waiting for Drag', type: 'voice' },
        { name: '🔊 Partners Lounge', type: 'voice' },
        { name: '🔊 Founders Lounge', type: 'voice' },
      ],
    },
    {
      name: 'SUPPORT',
      channels: [
        { name: '🎫│support-ticket', type: 'text' },
        { name: '🔧│troubleshooting', type: 'text' },
      ],
    },
  ],
};
