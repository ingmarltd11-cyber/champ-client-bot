const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
} = require('discord.js');
const { SITE_URL, BRAND_COLOR } = require('../config');
const { isOwner } = require('../utils/permissions');
const { getSupabase } = require('../utils/supabase');
const licensing = require('../utils/licensing');

const OWNER_DENIED = '❌ Only the **owner** role can manage license keys.';

function reply(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

function timestamp(value) {
  if (!value) return 'never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return `<t:${Math.floor(date.getTime() / 1000)}:d>`;
}

function describeStatus(license) {
  if (licensing.licenseActive(license)) return 'active';
  if (license.status === 'active') return 'expired';
  return license.status;
}

function describeOwner(license) {
  return licensing.isUnassignedEmail(license.email) ? 'not redeemed yet' : license.email;
}

function licenseLine(license) {
  const parts = [
    `\`${license.license_key}\``,
    `**${license.plan_type}**`,
    describeStatus(license),
  ];
  if (license.expires_at) parts.push(`expires ${timestamp(license.expires_at)}`);
  if (license.redeemed_at) parts.push(`redeemed ${timestamp(license.redeemed_at)}`);
  parts.push(describeOwner(license));
  return parts.join(' · ');
}

// The key option is free text so a pasted key without capitals still works; it is normalised
// and validated before anything touches the database.
function readKey(interaction) {
  const raw = interaction.options.getString('key', true);
  const key = licensing.normalizeKey(raw);
  return licensing.isLicenseKey(key) ? key : null;
}

// The interaction is already deferred here, so this edits the reply instead of replying.
async function missingLicense(interaction, key) {
  return interaction.editReply({
    content: `❌ No license found for \`${key}\`. Check the key with \`/key list search:${key}\`.`,
  });
}

module.exports = {
  // Only the owner role may use this command, next to Discord's own administrator default.
  access: 'owner',

  data: new SlashCommandBuilder()
    .setName('key')
    .setDescription('Create and manage Champ Client license keys (owner only).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('generate')
        .setDescription('Generate one or more license keys, for a customer or to hand out later.')
        .addStringOption((option) =>
          option
            .setName('plan')
            .setDescription('Which plan the key unlocks')
            .setRequired(true)
            .addChoices({ name: 'monthly', value: 'monthly' }, { name: 'lifetime', value: 'lifetime' })
        )
        .addIntegerOption((option) =>
          option
            .setName('amount')
            .setDescription(`How many keys to create, 1-${licensing.MAX_AMOUNT} (default 1)`)
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(licensing.MAX_AMOUNT)
        )
        .addStringOption((option) =>
          option
            .setName('email')
            .setDescription('Customer email to link the key to. Leave empty for a key they redeem themselves.')
            .setRequired(false)
            .setMaxLength(200)
        )
        .addIntegerOption((option) =>
          option
            .setName('days')
            .setDescription(
              `Days until the key expires. Default: ${licensing.DEFAULT_MONTHLY_DAYS} for monthly, never for lifetime.`
            )
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(3650)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('Show the most recent license keys.')
        .addStringOption((option) =>
          option
            .setName('search')
            .setDescription('Part of an email address, or a full key')
            .setRequired(false)
            .setMaxLength(200)
        )
        .addIntegerOption((option) =>
          option.setName('limit').setDescription('How many rows, 1-25 (default 10)').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('revoke')
        .setDescription('Switch a key off, so it stops validating and downloading stops.')
        .addStringOption((option) =>
          option.setName('key').setDescription('The license key').setRequired(true).setMaxLength(60)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('restore')
        .setDescription('Switch a revoked key back on.')
        .addStringOption((option) =>
          option.setName('key').setDescription('The license key').setRequired(true).setMaxLength(60)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Delete a key for good. The customer loses access immediately.')
        .addStringOption((option) =>
          option.setName('key').setDescription('The license key').setRequired(true).setMaxLength(60)
        )
        .addBooleanOption((option) =>
          option
            .setName('confirm')
            .setDescription('Set to true to really delete the key; it cannot be undone')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    if (!interaction.guild) return reply(interaction, '❌ License keys only work inside the server.');
    if (!isOwner(interaction.member)) return reply(interaction, OWNER_DENIED);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const sub = interaction.options.getSubcommand();
    const supabase = getSupabase();

    try {
      if (sub === 'generate') {
        const plan = interaction.options.getString('plan', true);
        const amount = interaction.options.getInteger('amount') ?? 1;
        const email = interaction.options.getString('email')?.trim() ?? '';
        const days = interaction.options.getInteger('days') ?? undefined;

        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          return interaction.editReply({ content: `❌ \`${email}\` is not an email address.` });
        }
        if (email && amount > 1) {
          return interaction.editReply({
            content: '❌ An email address gets one key per plan. Leave `email` empty to generate several keys at once.',
          });
        }

        const licenses = await licensing.generateLicenses(supabase, { plan, amount, email, days });

        const lines = licenses.map((license) => `\`${license.license_key}\``);
        const embed = new EmbedBuilder()
          .setColor(BRAND_COLOR)
          .setTitle(`${licenses.length} × ${plan} license key${licenses.length === 1 ? '' : 's'}`)
          .setDescription(lines.join('\n'))
          .addFields(
            {
              name: 'Expires',
              value: licenses[0]?.expires_at ? timestamp(licenses[0].expires_at) : 'never',
              inline: true,
            },
            {
              name: 'Linked to',
              value: email ? email : 'nobody yet — the customer redeems it',
              inline: true,
            }
          )
          .setFooter({
            text: email
              ? 'The key is already linked to this account.'
              : `Redeem at ${SITE_URL}/dashboard.html → Redeem a key`,
          });

        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'list') {
        const search = interaction.options.getString('search') ?? '';
        const limit = interaction.options.getInteger('limit') ?? 10;
        const licenses = await licensing.listLicenses(supabase, { search, limit });

        if (licenses.length === 0) {
          return interaction.editReply({
            content: search
              ? `No license matches \`${search}\`.`
              : 'There are no licenses yet. Create one with `/key generate`.',
          });
        }

        const text = licenses.map(licenseLine).join('\n');
        const body = text.length > 3900 ? `${text.slice(0, 3900)}…` : text;
        const active = licenses.filter((license) => licensing.licenseActive(license)).length;
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(BRAND_COLOR)
              .setTitle(`Licenses${search ? ` matching “${search}”` : ''}`)
              .setDescription(body)
              .setFooter({ text: `${licenses.length} shown · ${active} active` }),
          ],
        });
      }

      const key = readKey(interaction);
      if (!key) {
        return interaction.editReply({
          content: '❌ That does not look like a license key. It looks like `CHAMP-1A2B-3C4D-5E6F-7A8B`.',
        });
      }

      if (sub === 'revoke') {
        const license = await licensing.revokeLicense(supabase, key);
        if (!license) return missingLicense(interaction, key);
        return interaction.editReply({
          content: `⛔ \`${key}\` is revoked. The client and the dashboard refuse it from now on.`,
        });
      }

      if (sub === 'restore') {
        const license = await licensing.restoreLicense(supabase, key);
        if (!license) return missingLicense(interaction, key);
        return interaction.editReply({
          content: `✅ \`${key}\` is active again${license.expires_at ? ` until ${timestamp(license.expires_at)}` : ''}.`,
        });
      }

      if (sub === 'delete') {
        if (!interaction.options.getBoolean('confirm', true)) {
          return interaction.editReply({ content: 'Nothing was deleted. Set `confirm: true` to delete the key.' });
        }
        const license = await licensing.deleteLicense(supabase, key);
        if (!license) return missingLicense(interaction, key);
        return interaction.editReply({
          content: `🗑️ \`${key}\` (${license.plan_type}, ${describeOwner(license)}) was deleted.`,
        });
      }

      return interaction.editReply({ content: '❌ Unknown subcommand.' });
    } catch (err) {
      console.error('License command failed:', err);
      return interaction.editReply({
        content: `❌ Could not reach the license database: ${String(err.message ?? err).slice(0, 300)}`,
      });
    }
  },
};
