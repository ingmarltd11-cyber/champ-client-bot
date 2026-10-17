const fs = require('fs');
const path = require('path');

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function fetchAllMessages(channel) {
  let allMessages = [];
  let lastId;
  for (;;) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;
    const fetched = await channel.messages.fetch(options);
    if (fetched.size === 0) break;
    allMessages = allMessages.concat(Array.from(fetched.values()));
    lastId = fetched.last().id;
    if (fetched.size < 100) break;
  }
  allMessages.reverse();
  return allMessages;
}

function buildText(channel, messages) {
  const lines = messages.map((m) => {
    const time = new Date(m.createdTimestamp).toISOString();
    const author = `${m.author.tag} (${m.author.id})`;
    const attachments = m.attachments.size
      ? `\n  Bijlagen: ${m.attachments.map((a) => a.url).join(', ')}`
      : '';
    const embeds = m.embeds.length ? `\n  Embeds: ${m.embeds.map((e) => e.title || e.description || 'embed').join(' | ')}` : '';
    return `[${time}] ${author}: ${m.content || '[geen tekst]'}${attachments}${embeds}`;
  });
  const header =
    `Transcript van #${channel.name} (${channel.id})\n` +
    `Gegenereerd: ${new Date().toISOString()}\n${'='.repeat(50)}\n\n`;
  return header + lines.join('\n');
}

function buildHtml(channel, messages) {
  const rows = messages.map((m) => {
    const time = new Date(m.createdTimestamp).toLocaleString('nl-NL');
    const avatar = m.author.displayAvatarURL ? escapeHtml(m.author.displayAvatarURL()) : '';
    const files = m.attachments.size
      ? `<div class="files">${m.attachments.map((a) => `<a href="${escapeHtml(a.url)}">${escapeHtml(a.name || 'bijlage')}</a>`).join(' ')}</div>`
      : '';
    return `<div class="msg"><img class="avatar" src="${avatar}" alt=""/><div><div class="meta"><strong>${escapeHtml(m.author.tag)}</strong><span>${escapeHtml(time)}</span></div><div class="body">${escapeHtml(m.content) || '<i>[geen tekst]</i>'}</div>${files}</div></div>`;
  });
  return `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8"><title>Transcript #${escapeHtml(channel.name)}</title><style>
body{font-family:system-ui,sans-serif;background:#2b2d31;color:#dbdee1;margin:0;padding:24px}
h1{font-size:18px}a{color:#00a8fc}.msg{display:flex;gap:12px;padding:10px 0;border-top:1px solid #3f434a}
.avatar{width:40px;height:40px;border-radius:50%}.meta span{color:#949ba4;font-size:12px;margin-left:8px}
.body{margin-top:2px;white-space:pre-wrap}.files{margin-top:4px;font-size:13px}
</style></head><body><h1>Transcript van #${escapeHtml(channel.name)} (${escapeHtml(channel.id)})</h1><p>Gegenereerd: ${escapeHtml(new Date().toISOString())}</p>${rows.join('\n')}</body></html>`;
}

// Geeft { txt, html, text } terug: paden naar weggeschreven bestanden
// (null als dat formaat is uitgeschakeld) + de kale tekst voor Supabase.
async function generateTranscripts(channel, format = 'both') {
  const messages = await fetchAllMessages(channel);
  const text = buildText(channel, messages);
  const dir = path.join(__dirname, '..', '..', 'transcripts');
  fs.mkdirSync(dir, { recursive: true });
  const base = `${channel.name}-${channel.id}`;
  let txt = null;
  let html = null;
  if (format === 'txt' || format === 'both') {
    txt = path.join(dir, `${base}.txt`);
    fs.writeFileSync(txt, text, 'utf8');
  }
  if (format === 'html' || format === 'both') {
    html = path.join(dir, `${base}.html`);
    fs.writeFileSync(html, buildHtml(channel, messages), 'utf8');
  }
  return { txt, html, text };
}

module.exports = { generateTranscripts };
