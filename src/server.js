import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { cfg } from './config.js';
import { calculate } from './pricing.js';
import { VALID_DAYS, FAST_DAYS, MIN_ORDER } from './catalog.js';
import { nextQuoteNo, saveQuote, getQuote, listQuotes, logEvent } from './store.js';
import * as bevetel from './integrations/bevetel.js';
import * as szamlazz from './integrations/szamlazz.js';
import { sendMail } from './integrations/mail.js';
import { queryTaxpayer } from './integrations/nav.js';
import * as T from './templates.js';
import { renderQuotePdf, pdfPath } from './pdf.js';
import { mountAdmin, users, pilotLimit, ordersCount, attachQuoteToVisit, createLeadToken, leadByToken } from './admin.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  const o = req.headers.origin;
  if (o && (cfg.allowedOrigins.includes('*') || cfg.allowedOrigins.includes(o))) { res.set('Access-Control-Allow-Origin', o); res.set('Access-Control-Allow-Headers', 'Content-Type'); res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS'); }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
// Ha nincs PUBLIC_URL (vagy localhost), az első külső kérésből tanuljuk meg a nyilvános címet
app.use((req, res, next) => {
  if ((!process.env.PUBLIC_URL || /localhost|127\.0\.0\.1/.test(cfg.publicUrl)) && req.headers.host && !/^(localhost|127\.0\.0\.1)/.test(req.headers.host)) {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    cfg.publicUrl = `${proto}://${req.headers.host}`; console.log('PUBLIC_URL felismerve:', cfg.publicUrl);
  }
  next();
});
const wrap = fn => (req, res) => fn(req, res).catch(e => { console.error(e); res.status(400).json({ ok: false, error: e.message }); });
const need = (o, ...k) => { for (const x of k) if (!o?.[x]) throw new Error(`Hiányzó mező: ${x}`); };
const q404 = no => { const q = getQuote(no); if (!q) throw new Error('Nincs ilyen ajánlat'); return q; };
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString(); };

// Süti-hozzájárulás naplózása (igazoláshoz): időpont, verzió, kategóriák, csonkolt IP. Nem igényel hozzájárulást.
const CONSENT_LOG = path.join(cfg.dataDir, 'consent.jsonl');
const truncIp = ip => ip.includes(':') ? ip.split(':').slice(0, 3).join(':') + '::' : ip.replace(/\.\d+$/, '.0');
app.post('/api/consent', (req, res) => {
  const b = req.body || {};
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
  const rec = { ts: new Date().toISOString(), id: String(b.id || '').slice(0, 40), v: Number(b.v) || 0, stat: !!b.stat, mkt: !!b.mkt, action: String(b.action || '').slice(0, 20), ip: truncIp(ip), ua: String(req.headers['user-agent'] || '').slice(0, 200) };
  fs.appendFile(CONSENT_LOG, JSON.stringify(rec) + '\n', () => {});
  res.json({ ok: true });
});
app.get('/api/public-config', (req, res) => res.json({ metaPixelId: process.env.META_PIXEL_ID || '' }));
app.get('/api/health', (req, res) => res.json({ ok: true, dryRun: cfg.dryRun, quotes: listQuotes().length }));

/** Árkalkuláció előnézet (a konfigurátor is hívhatja ellenőrzésre) */
app.post('/api/calc', wrap(async (req, res) => res.json({ ok: true, calc: calculate(req.body.selection) })));

/** NAV adószám -> cégadatok */
app.get('/api/nav/:taxid', wrap(async (req, res) => res.json({ ok: true, ...(await queryTaxpayer(req.params.taxid)) })));

/** 1) Ajánlatkérés: a form beküldésekor. Lead -> CRM, ajánlat e-mail -> ügyfél, értesítés -> nekem */
app.post('/api/quote', wrap(async (req, res) => {
  const { company, selection, utm, customReq, lead: leadTok, sid } = req.body;
  need(company, 'name', 'contact', 'email'); need(req.body, 'selection');
  const calc = calculate(selection);
  const q = { no: nextQuoteNo(), createdAt: new Date().toISOString(), validUntil: addDays(VALID_DAYS), fastUntil: addDays(FAST_DAYS), company, selection, calc, utm: utm || {}, status: 'quote', events: [], ...(leadTok && leadByToken(leadTok) ? { lead: leadTok } : {}) };
  if (calc.net < MIN_ORDER && !calc.hasLive) q.belowMin = true; // 500k alatt is kiadjuk, de jelezzük a CRM-ben
  saveQuote(q); attachQuoteToVisit(sid, q.no);
  const summary = calc.lines.map(l => `${l.name} × ${l.n}`).join(', ') + (calc.certRequested ? ' | HIVATALOS TANÚSÍTVÁNYT KÉR – egyeztetni (5 000 Ft/fő/tananyag, külön számla)' : '');
  const lead = await bevetel.createLead({ name: `${company.name} – ${company.contact}`, email: company.email, phone: company.phone, utm,
    message: `Ajánlat ${q.no}: ${summary}. Nettó ${calc.net.toLocaleString('hu-HU')} Ft${q.belowMin ? ' (500 000 Ft minimum alatt)' : ''}. ${cfg.publicUrl}/a/${q.no}${customReq ? ' · Egyedi árkérés: ' + customReq : ''}` });
  q.crm = { leadId: lead.id || lead.leadId || null }; saveQuote(q);
  logEvent(q.no, 'quote_created', { leadId: q.crm.leadId });
  res.json({ ok: true, no: q.no, url: `${cfg.publicUrl}/a/${q.no}`, calc, validUntil: q.validUntil, fastUntil: q.fastUntil });
  // PDF és levelek a válasz után, háttérben (a felhasználó ne várjon a Chromiumra)
  (async () => { let pdf = null; try { pdf = await renderQuotePdf(q.no, { force: true }); } catch (e) { console.error('PDF hiba:', e.message); }
    await sendMail({ to: company.email, ...T.quoteMail(q), attachments: pdf ? [{ filename: `${q.no}-ajanlat.pdf`, content: pdf.toString('base64') }] : [] });
    if (cfg.mail.notifyTo) await sendMail({ to: cfg.mail.notifyTo, ...T.notifyMail(q, 'Új ajánlat') }); })().catch(e => console.error('Háttér hiba:', e.message));
}));

app.get('/api/quote/:no', wrap(async (req, res) => res.json({ ok: true, quote: q404(req.params.no), publicUrl: cfg.publicUrl })));

/** 2) Elfogadás: szerződés + díjbekérő (Számlázz.hu) + e-mail mellékletekkel */
app.post('/api/quote/:no/accept', wrap(async (req, res) => {
  const q = q404(req.params.no);
  if (q.accept) return res.json({ ok: true, already: true, proforma: q.accept.proformaNo || null, pending: q.stage === 'pending_approval' ? 'approval' : q.stage === 'coordination' ? 'coordination' : null, gross: q.accept.gross });
  const priorOrders = ordersCount();
  const fast = new Date() <= new Date(q.fastUntil);
  const net = fast ? q.calc.netFast : q.calc.net;
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
  q.accept = { at: new Date().toISOString(), fast, net, gross: Math.round(net * 1.27), gift: req.body.gift || null, dueDate: addDays(8).slice(0, 10), ip, userAgent: (req.headers['user-agent'] || '').slice(0, 200) };
  q.closedBy = 'self'; // a kalkulátorban leadott megrendelés automatikusan a partneré (teljes jutalék)
  const hasExtras = q.calc.certRequested || q.calc.lines.some(l => l.type === 'extra');
  const pilot = priorOrders < pilotLimit();
  if (hasExtras || pilot) {
    q.stage = hasExtras ? 'coordination' : 'pending_approval'; saveQuote(q);
    logEvent(q.no, hasExtras ? 'needs_coordination' : 'approval_requested', { fast });
    res.json({ ok: true, pending: hasExtras ? 'coordination' : 'approval', net, gross: q.accept.gross, fast });
    (async () => {
      await sendMail({ to: q.company.email, ...(hasExtras ? T.coordinationMail(q) : T.pendingApprovalMail(q)) });
      for (const to of users().partners) await sendMail({ to, ...T.approvalRequestMail(q) });
      if (hasExtras) await bevetel.createLead({ name: `${q.company.name} – MEGRENDELÉS, EGYEZTETNI`, email: q.company.email, phone: q.company.phone, message: `Ajánlat ${q.no} elfogadva, de kiegészítő miatt egyeztetni kell: ${q.calc.lines.filter(l => l.type === 'extra').map(l => l.name).concat(q.calc.certRequested ? ['hivatalos tanúsítvány'] : []).join(', ')}. Nettó ${net.toLocaleString('hu-HU')} Ft. ${cfg.publicUrl}/a/${q.no}`, utm: q.utm });
      if (cfg.mail.notifyTo) await sendMail({ to: cfg.mail.notifyTo, ...T.notifyMail(q, hasExtras ? 'ELFOGADVA – egyeztetni' : 'ELFOGADVA – jóváhagyásra vár') });
    })().catch(e => console.error('Háttér hiba:', e.message));
    return;
  }
  q.stage = 'auto'; saveQuote(q);
  const r = await finalizeOrder(q);
  res.json({ ok: true, proforma: r.proforma, net, gross: q.accept.gross, fast, contractUrl: `${cfg.publicUrl}/api/quote/${q.no}/pdf` });
}));
/** Megrendelés véglegesítése: díjbekérő (Számlázz.hu) + visszaigazolás e-mail mellékletekkel + CRM. Automatikusan vagy admin-jóváhagyás után. */
async function finalizeOrder(q) {
  const pf = await szamlazz.createProforma(q);
  q.accept.proformaNo = pf.number; q.stage = q.stage === 'auto' ? 'auto' : 'approved'; saveQuote(q);
  logEvent(q.no, 'accepted', { proforma: pf.number, fast: q.accept.fast });
  const net = q.accept.net, fast = q.accept.fast;
  (async () => { const attachments = [];
    try { const pdf = await renderQuotePdf(q.no, { force: true, doc: 'order' }); attachments.push({ filename: `${q.no}-megrendeles-visszaigazolas.pdf`, content: pdf.toString('base64') }); } catch (e) { console.error('PDF hiba:', e.message); }
    try { const pdf = await renderQuotePdf(q.no); attachments.push({ filename: `${q.no}-ajanlat.pdf`, content: pdf.toString('base64') }); } catch (e) { console.error('PDF hiba:', e.message); }
    if (pf.pdfBase64) attachments.push({ filename: `${pf.number}-dijbekero.pdf`, content: pf.pdfBase64 });
    await sendMail({ to: q.company.email, ...T.acceptMail(q, pf.number), attachments });
    await bevetel.createLead({ name: `${q.company.name} – ELFOGADVA`, email: q.company.email, message: `Ajánlat ${q.no} elfogadva. Díjbekérő: ${pf.number}, nettó ${net.toLocaleString('hu-HU')} Ft.${fast ? ' Gyors döntési 5% érvényesítve.' : ''}` , utm: q.utm });
    if (cfg.mail.notifyTo) await sendMail({ to: cfg.mail.notifyTo, ...T.notifyMail(q, 'ELFOGADVA', `Díjbekérő: ${pf.number}`) }); })().catch(e => console.error('Háttér hiba:', e.message));
  return { proforma: pf.number };
}
/** Ajánlat (elfogadás után: megrendelés-visszaigazolással) PDF */
app.get('/api/quote/:no/pdf', wrap(async (req, res) => { const q = q404(req.params.no); const doc = req.query.doc === 'order' ? 'order' : 'quote';
  if (doc === 'order' && !q.accept) throw new Error('Még nincs megrendelve');
  const buf = await renderQuotePdf(q.no, { doc, force: !fs.existsSync(pdfPath(q.no, doc)) || req.query.fresh === '1' });
  res.set('Content-Type', 'application/pdf'); res.set('Content-Disposition', `inline; filename="${q.no}${doc === 'order' ? '-megrendeles-visszaigazolas' : '-ajanlat'}.pdf"`); res.send(buf); }));

/** 3) Visszahívás: foglalás a CRM-ben + értesítések */
app.post('/api/quote/:no/callback', wrap(async (req, res) => {
  const q = q404(req.params.no);
  const { phone, startTime, slot } = req.body; // startTime ISO (opcionális, ha a felhasználó időpontot választott)
  q.callback = { at: new Date().toISOString(), phone: phone || q.company.phone, slot: slot || null };
  let booking = null;
  if (startTime) { const end = new Date(new Date(startTime).getTime() + 30 * 60000).toISOString(); booking = await bevetel.createBooking({ name: `${q.company.name} – ${q.company.contact}`, email: q.company.email, phone: q.callback.phone, startTime, endTime: end }); }
  else await bevetel.createLead({ name: `${q.company.name} – VISSZAHÍVÁST KÉR`, email: q.company.email, phone: q.callback.phone, message: `Ajánlat ${q.no}: visszahívást kér. ${cfg.publicUrl}/a/${q.no}`, utm: q.utm });
  saveQuote(q);
  await sendMail({ to: q.company.email, ...T.callbackMail(q) });
  if (cfg.mail.notifyTo) await sendMail({ to: cfg.mail.notifyTo, ...T.notifyMail(q, 'Visszahívást kér', q.callback.phone ? 'Tel: ' + q.callback.phone : '') });
  logEvent(q.no, 'callback_requested', { bookingId: booking?.id || null });
  res.json({ ok: true, bookingId: booking?.id || null });
}));

/** 4) Egyedi ár kérése (popup): CRM lead + értesítés */
app.post('/api/quote/:no/custom-price', wrap(async (req, res) => {
  const q = q404(req.params.no); const { why, headcount, years, budget, note } = req.body;
  q.customReq = { at: new Date().toISOString(), why, headcount, years, budget, note }; saveQuote(q);
  const d = `${why || ''} · ${headcount || '?'} fő · ${years || 1} év${budget ? ' · keret ' + budget : ''}${note ? ' · „' + note + '”' : ''}`;
  await bevetel.createLead({ name: `${q.company.name} – EGYEDI ÁR`, email: q.company.email, message: `Ajánlat ${q.no}: egyedi árat kér. ${d}`, utm: q.utm });
  if (cfg.mail.notifyTo) await sendMail({ to: cfg.mail.notifyTo, ...T.notifyMail(q, 'Egyedi árkérés', d) });
  logEvent(q.no, 'custom_price_requested', { d });
  res.json({ ok: true });
}));

/** 5) Kérdés */
app.post('/api/quote/:no/question', wrap(async (req, res) => {
  const q = q404(req.params.no); need(req.body, 'text');
  if (cfg.mail.notifyTo) await sendMail({ to: cfg.mail.notifyTo, replyTo: q.company.email, ...T.notifyMail(q, 'Kérdés', req.body.text) });
  logEvent(q.no, 'question', { text: req.body.text });
  res.json({ ok: true });
}));

/** 6) Továbbküldés a döntéshozónak */
app.post('/api/quote/:no/forward', wrap(async (req, res) => {
  const q = q404(req.params.no); need(req.body, 'to');
  const attachments = []; try { const pdf = await renderQuotePdf(q.no); attachments.push({ filename: `${q.no}-ajanlat.pdf`, content: pdf.toString('base64') }); } catch (e) { console.error('PDF hiba:', e.message); }
  const mail = req.body.body ? T.forwardCustom(q, req.body.subject || `Képzési ajánlat jóváhagyásra – ${q.no}`, req.body.body) : T.forwardMail(q, q.company.contact);
  await sendMail({ to: req.body.to, replyTo: q.company.email, ...mail, attachments });
  if (cfg.mail.notifyTo) await sendMail({ to: cfg.mail.notifyTo, ...T.notifyMail(q, 'Továbbküldve', `Címzett: ${req.body.to}`) });
  logEvent(q.no, 'forwarded', { to: req.body.to });
  res.json({ ok: true });
}));

/** 7) Emlékeztetők: cron hívja naponta (pl. `curl -X POST .../api/cron/reminders`) */
app.post('/api/cron/reminders', wrap(async (req, res) => {
  const now = Date.now(), day = 86400000, sent = [];
  for (const q of listQuotes()) {
    if (q.accept || q.deleted || ['accepted', 'callback_requested'].includes(q.status)) continue;
    const age = (now - new Date(q.createdAt)) / day; const done = new Set((q.events || []).filter(e => e.type === 'reminder').map(e => e.kind));
    const kind = age >= 13 && age < 14 ? 'd13' : age >= 7 && age < 8 ? 'd7' : age >= 1 && age < 2 ? 'd1' : null;
    if (kind && !done.has(kind)) { await sendMail({ to: q.company.email, ...T.reminderMail(q, kind) }); logEvent(q.no, 'reminder', { kind }); q.status = 'quote'; saveQuote(q); sent.push(`${q.no}:${kind}`); }
  }
  res.json({ ok: true, sent });
}));

/** 8) Facebook Lead Ads webhook (Meta közvetlenül, vagy Zapier/Make POST-olja ugyanide) */
app.get('/api/fb/webhook', (req, res) => req.query['hub.verify_token'] === cfg.fb.verifyToken ? res.send(req.query['hub.challenge']) : res.sendStatus(403));
app.post('/api/fb/webhook', wrap(async (req, res) => {
  // Egyszerűsített: Zapier/Make már kibontott mezőket küld {name,email,phone,company,campaign}
  const b = req.body; if (b.object === 'page') return res.json({ ok: true, note: 'Meta nyers webhook: a leadgen_id-t a Graph API-n kell lekérni (FB_PAGE_TOKEN) – bekötés a token után.' });
  need(b, 'name', 'email');
  const token = createLeadToken({ name: b.name, email: b.email, phone: b.phone, company: b.company, headcount: b.headcount, campaign: b.campaign });
  const link = `${cfg.publicUrl}/?t=${token}&utm_source=facebook&utm_medium=lead-ad${b.campaign ? '&utm_campaign=' + encodeURIComponent(b.campaign) : ''}`;
  const r = await bevetel.createChannelLead({ name: b.name, email: b.email, phone: b.phone, companyName: b.company, message: `${b.message || 'Facebook lead ad'} · Személyes link: ${link}`, formResponses: b.answers, utm: { source: 'facebook', medium: 'lead-ad', campaign: b.campaign } });
  res.json({ ok: true, leadId: r.id || null, token, link });
}));

mountAdmin(app, { wrap, finalizeOrder });

/** Publikus ajánlatoldal: a konfigurátor HTML-t szolgálja ki, ?q=<no> paraméterrel betölti az ajánlatot */
const PUB = path.join(cfg.root, 'public');
app.use(express.static(PUB, { etag: false, setHeaders: (res, p) => { if (p.endsWith('.html')) res.set('Cache-Control', 'no-store'); } }));
app.get('/admin', (req, res) => { res.set('Cache-Control', 'no-store'); res.sendFile(path.join(PUB, 'admin.html')); });
app.get('/a/:no', (req, res) => { res.set('Cache-Control', 'no-store'); res.sendFile(path.join(PUB, 'index.html')); });

app.listen(cfg.port, () => console.log(`Ajánlat-szerver fut: http://localhost:${cfg.port}  (DRY_RUN=${cfg.dryRun})`));
