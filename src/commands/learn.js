const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { isAdmin } = require('../utils/permissions');
const { isTrustedUser } = require('../utils/trustedUsers');
const settings = require('../utils/botSettings');
const learning = require('../features/learning');

function reply(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

function allowed(interaction) {
  return isAdmin(interaction.member) || isTrustedUser(interaction.user);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('learn')
    .setDescription('Teach the bot new behaviour that applies to everyone.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Answer messages automatically. Trigger "*" means every message.')
        .addStringOption((option) =>
          option
            .setName('trigger')
            .setDescription('Text to look for, or * for every message. Alternatives with |.')
            .setRequired(true)
            .setMaxLength(200)
        )
        .addStringOption((option) =>
          option
            .setName('response')
            .setDescription('The reply text, or the emoji when react is true')
            .setRequired(true)
            .setMaxLength(1500)
        )
        .addBooleanOption((option) =>
          option.setName('react').setDescription('React with the response instead of replying').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('lesson')
        .setDescription('Remember an instruction for the assistant, for example "never give discounts".')
        .addStringOption((option) =>
          option.setName('text').setDescription('The instruction').setRequired(true).setMaxLength(500)
        )
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Show the learned rules and lessons.'))
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a learned rule by its number or ID.')        .addStringOption((option) =>
          option
            .setName('rule')
            .setDescription('Number from /learn list, the rule ID, its trigger, or its reply text')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) => sub.setName('clear').setDescription('Remove every learned rule and lesson.'))
    .addSubcommand((sub) =>
      sub.setName('channel').setDescription('Create or show the training channel where you can teach the bot.')
    ),

  async execute(interaction) {
    if (!allowed(interaction)) {
      return reply(interaction, '❌ Only an administrator or a trusted operator can teach the bot.');
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const text = [
        '**Message rules** (these are answered automatically, for everyone):',
        learning.describeRules(),
        '',
        '**Lessons** (context for the assistant):',
        learning.describeLessons(),
      ].join('\n');
      return reply(interaction, text.length > 1900 ? `${text.slice(0, 1900)}…` : text);
    }

    if (sub === 'add') {
      const trigger = interaction.options.getString('trigger', true).trim() || '*';
      const response = interaction.options.getString('response', true).trim();
      const react = interaction.options.getBoolean('react') ?? false;

      if (!response) return reply(interaction, '❌ The response cannot be empty.');

      const rule = settings.addLearnedRule({
        trigger,
        response,
        mode: react ? 'react' : 'reply',
        createdBy: interaction.user.id,
      });

      const scope = rule.trigger === '*' ? 'every message' : `messages containing \`${rule.trigger}\``;
      const action = rule.mode === 'react' ? `reacts with ${rule.response}` : `replies \`${rule.response}\``;
      return reply(interaction, `✅ Saved. The bot now ${action} to ${scope}, for every member.`);
    }

    if (sub === 'lesson') {
      const text = interaction.options.getString('text', true).trim();
      if (!text) return reply(interaction, '❌ The lesson cannot be empty.');

      const lesson = settings.addLesson({ text, createdBy: interaction.user.id });
      return reply(interaction, `✅ Remembered: ${lesson.text}`);
    }

    if (sub === 'remove') {
      const removed = settings.removeLearnedRule(interaction.options.getString('rule', true));
      if (!removed) {
        return reply(
          interaction,
          '❌ No learned rule matches that number, ID, trigger or reply. Check `/learn list`.'
        );
      }

      return reply(interaction, `✅ Removed: \`${removed.trigger}\` → \`${removed.response}\`.`);
    }

    if (sub === 'clear') {
      const rules = settings.clearLearnedRules();
      const lessons = settings.clearLessons();
      return reply(interaction, `✅ Forget everything: ${rules} rule(s) and ${lessons} lesson(s) removed.`);
    }

    if (sub === 'channel') {
      const channel = await learning.ensureLearningChannel(interaction.guild, {
        force: true,
        memberId: interaction.user.id,
      });
      if (!channel) {
        return reply(
          interaction,
          '❌ I could not create the training channel. Give the bot **Manage Channels** and try again, ' +
            'or just talk to me in a channel where you are an administrator.'
        );
      }
      return reply(
        interaction,
        `✅ Training channel: <#${channel.id}>. I gave you access to it.\n` +
          'Ping me there (`@bot ...`) and say what I should learn, or use `/learn add`.'
      );
    }

    return reply(interaction, '❌ Unknown subcommand.');
  },
};
