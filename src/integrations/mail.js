// E-mail küldés: Resend vagy Brevo API; kulcs nélkül vagy száraz módban csak napló.
import { cfg } from '../config.js';
import { dry } from './dry.js';
const m = cfg.mail;

export async function sendMail({ to, subject, html, text, attachments = [], replyTo }) {
  const payload = { from: m.from, to: [].concat(to), subject, html, text, replyTo: replyTo || m.replyTo, attachments: attachments.map(a => ({ filename: a.filename, bytes: a.content?.length })) };
  if (cfg.dryRun || !m.key) return dry('mail', m.provider, payload);
  if (m.provider === 'resend') {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${m.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: m.from, to: [].concat(to), subject, html, text, reply_to: replyTo || m.replyTo, attachments: attachments.map(a => ({ filename: a.filename, content: a.content })) }) });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
    return r.json();
  }
  // Brevo
  const r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': m.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender: parseFrom(m.from), to: [].concat(to).map(e => ({ email: e })), subject, htmlContent: html, textContent: text, replyTo: { email: replyTo || m.replyTo }, attachment: attachments.map(a => ({ name: a.filename, content: a.content })) }) });
  if (!r.ok) throw new Error(`Brevo ${r.status}: ${await r.text()}`);
  return r.json();
}
const parseFrom = f => { const mm = f.match(/^(.*?)\s*<(.+)>$/); return mm ? { name: mm[1].replace(/"/g, ''), email: mm[2] } : { email: f }; };
