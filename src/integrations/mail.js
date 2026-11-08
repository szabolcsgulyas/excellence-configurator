// E-mail küldés: SMTP (Excellence levelezőszerver), Resend vagy Brevo API; kulcs nélkül vagy száraz módban csak napló.
// MAIL_LIVE=true: a levelek akkor is kimennek, ha a többi integráció (CRM, Számlázz.hu) még száraz módban van.
import nodemailer from 'nodemailer';
import { cfg } from '../config.js';
import { dry } from './dry.js';
const m = cfg.mail;

export async function sendMail({ to, subject, html, text, attachments = [], replyTo }) {
  const payload = { from: m.from, to: [].concat(to), subject, html, text, replyTo: replyTo || m.replyTo, attachments: attachments.map(a => ({ filename: a.filename, bytes: a.content?.length })) };
  const live = !cfg.dryRun || process.env.MAIL_LIVE === 'true';
  if (m.provider === 'smtp') {
    if (!live || !process.env.SMTP_PASS) return dry('mail', 'smtp', payload);
    const info = await smtp().sendMail({ from: m.from, to: [].concat(to), subject, html, text, replyTo: replyTo || m.replyTo, attachments: attachments.map(a => ({ filename: a.filename, content: Buffer.from(a.content, 'base64') })) });
    return { id: info.messageId };
  }
  if (!live || !m.key) return dry('mail', m.provider, payload);
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
let tr = null;
const smtp = () => tr || (tr = nodemailer.createTransport({ host: process.env.SMTP_HOST || 'mail.excellence.hu', port: +(process.env.SMTP_PORT || 587), secure: +(process.env.SMTP_PORT || 587) === 465, requireTLS: +(process.env.SMTP_PORT || 587) !== 465,
  auth: { user: process.env.SMTP_USER || 'gulyas.szabolcs@excellence.hu', pass: process.env.SMTP_PASS } }));
