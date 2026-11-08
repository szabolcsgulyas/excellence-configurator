// Admin felület szerveroldala: e-mailes belépőlink, két szerepkör, látogatói idővonal, teendők, ajánlat-műveletek, félbehagyás.
// Specifikáció: docs/admin-spec.md
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { cfg } from './config.js';
import { calculate } from './pricing.js';
import { getQuote, saveQuote, listQuotes, logEvent, deleteQuote } from './store.js';
import { sendMail } from './integrations/mail.js';
import * as T from './templates.js';
import { ALL } from './catalog.js';

const D = cfg.dataDir;
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')); } catch { return d; } };
const writeJ = (f, v) => fs.writeFileSync(path.join(D, f), JSON.stringify(v));
const H = 3600e3, DAY = 24 * H;
const list = s => (s || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
export const users = () => ({
  owners: list(process.env.ADMIN_OWNERS || 'gulyas.szabolcs@excellence.hu,gulyas.szabolcs.laszlo@gmail.com'),
  partners: list(process.env.ADMIN_PARTNERS || '')
});
const roleOf = email => { const u = users(); email = (email || '').toLowerCase(); return u.owners.includes(email) ? 'owner' : u.partners.includes(email) ? 'partner' : null; };
export const pilotLimit = () => +(process.env.PILOT_ORDERS ?? 20);

// ---- tárak ----
let tokens = readJ('admin-tokens.json', {});      // belépőlinkek
let sessions = readJ('admin-sessions.json', {});  // munkamenetek
let visits = readJ('visits.json', {});            // látogatások (sid -> {...})
let leads = readJ('leads.json', {});              // FB-leadek (token -> {name,email,phone,company,campaign,createdAt})
const saveVisits = (() => { let t = null; return () => { clearTimeout(t); t = setTimeout(() => writeJ('visits.json', visits), 400); }; })();
export const leadByToken = t => leads[t] || null;
export function createLeadToken(lead) { const t = crypto.randomBytes(9).toString('base64url'); leads[t] = { ...lead, createdAt: new Date().toISOString() }; writeJ('leads.json', leads); return t; }

const truncIp = ip => !ip ? '' : ip.includes(':') ? ip.split(':').slice(0, 3).join(':') + '::' : ip.replace(/\.\d+$/, '.0');
const ipOf = req => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const device = ua => /iphone|android.*mobile|mobile/i.test(ua) ? 'mobil' : /ipad|tablet/i.test(ua) ? 'tablet' : 'asztali';

// Kosár állapota az események alapján
function cartOf(v) { const c = {}; for (const e of v.events) { if (e.type === 'cart_add') c[e.id] = e.qty || 1; if (e.type === 'cart_remove') delete c[e.id]; if (e.type === 'qty' && c[e.id] != null) c[e.id] = e.qty; if (e.type === 'cart_set') Object.assign(c, e.cart || {}); } return c; }
export function attachQuoteToVisit(sid, no) { const v = sid && visits[sid]; if (v) { v.quoteNo = no; saveVisits(); } }

// ---- jutalék (Nórival egyeztetett sávok, nettó megrendelési érték szerint); ha az Excellence salese zárja a leadet: a fele ----
// 5 000 – 500 000 Ft: 15% · 500 001 – 2 000 000 Ft: 17% · 2 000 000 Ft felett: 20%
export const commissionTier = net => net > 2000000 ? 20 : net > 500000 ? 17 : net >= 5000 ? 15 : 0;
export function commissionOf(q) {
  if (!q.accept) return null;
  const refunded = (q.refunds || []).reduce((a, r) => a + r.amount, 0);
  const base = Math.max(0, q.accept.net - refunded); const tier = commissionTier(q.accept.net); const pct = q.closedBy === 'sales' ? tier / 2 : tier;
  const amount = Math.round(base * pct / 100), settled = q.tigSettled || 0;
  return { base, refunded, pct, tierPct: tier, amount, closedBy: q.closedBy || 'self', paid: !!q.paidAt, paidAt: q.paidAt || null, finalAt: q.paidAt ? new Date(+new Date(q.paidAt) + 30 * DAY).toISOString() : null, final: !!q.paidAt && Date.now() - new Date(q.paidAt) > 30 * DAY, settled, open: amount - settled, tigs: q.tigs || [] };
}

export function mountAdmin(app, { wrap, finalizeOrder }) {
  // ---------- nyilvános: eseménygyűjtés ----------
  app.post('/api/track', (req, res) => {
    const b = req.body || {}; const now = new Date().toISOString();
    if (b.leadOpen && leads[b.leadOpen]) { const l = leads[b.leadOpen]; l.opens = (l.opens || 0) + 1; l.lastOpen = now; writeJ('leads.json', leads); }
    const sid = String(b.sid || '').slice(0, 40);
    if (!sid || !b.consent) return res.json({ ok: true }); // részletes mérés csak statisztika-hozzájárulással
    const v = visits[sid] || (visits[sid] = { sid, first: now, events: [], ip: truncIp(ipOf(req)), device: device(req.headers['user-agent'] || ''), utm: b.utm || {}, ref: String(b.ref || '').slice(0, 200), lead: leads[b.lead] ? b.lead : null });
    if (b.lead && leads[b.lead]) v.lead = b.lead;
    for (const e of (b.ev || []).slice(0, 50)) v.events.push({ at: e.at || now, type: String(e.type).slice(0, 30), ...(e.id ? { id: String(e.id).slice(0, 40) } : {}), ...(e.qty != null ? { qty: +e.qty } : {}), ...(e.step ? { step: String(e.step).slice(0, 20) } : {}), ...(e.cart ? { cart: e.cart } : {}) });
    if (v.events.length > 600) v.events = v.events.slice(-600);
    v.last = now; v.cart = cartOf(v); saveVisits();
    res.json({ ok: true });
  });
  // Félbehagyott összeállítás folytatása (emlékeztető levél linkje)
  app.get('/api/resume/:sid', (req, res) => { const v = visits[req.params.sid]; res.json({ ok: !!v, cart: v ? v.cart : {}, lead: v?.lead || null }); });
  app.get('/api/lead/:t', (req, res) => { const l = leads[req.params.t]; res.json(l ? { ok: true, lead: { name: l.name, email: l.email, phone: l.phone, company: l.company, headcount: l.headcount } } : { ok: false }); });

  // ---------- belépés ----------
  app.post('/api/admin/login', wrap(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase(); const role = roleOf(email);
    let devLink = null;
    if (role) {
      const t = crypto.randomBytes(24).toString('base64url'); tokens[t] = { email, exp: Date.now() + 15 * 60e3 }; writeJ('admin-tokens.json', tokens);
      const url = `${cfg.publicUrl}/api/admin/verify?t=${t}`;
      await sendMail({ to: email, ...T.loginMail(url) });
      // Száraz módban (amíg nincs levelezés) a link a képernyőn jelenik meg – de csak helyben, vagy a titkos ADMIN_DEV_KEY ismeretében
      const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '');
      if (cfg.dryRun && (local || (process.env.ADMIN_DEV_KEY && req.body.key === process.env.ADMIN_DEV_KEY))) devLink = url;
    }
    res.json({ ok: true, ...(devLink ? { devLink } : {}) }); // nem áruljuk el, létezik-e a cím
  }));
  app.get('/api/admin/verify', (req, res) => {
    const t = tokens[req.query.t]; delete tokens[req.query.t]; writeJ('admin-tokens.json', tokens);
    if (!t || t.exp < Date.now() || !roleOf(t.email)) return res.redirect('/admin?err=link');
    const sid = crypto.randomBytes(24).toString('base64url'); sessions[sid] = { email: t.email, exp: Date.now() + 30 * DAY }; writeJ('admin-sessions.json', sessions);
    const secure = /^https/.test(cfg.publicUrl) ? '; Secure' : '';
    res.set('Set-Cookie', `adm=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${secure}`); res.redirect('/admin');
  });
  const auth = (roles = ['owner', 'partner']) => (req, res, next) => {
    const s = sessions[cookies(req).adm]; const role = s && s.exp > Date.now() ? roleOf(s.email) : null;
    if (!role) return res.status(401).json({ ok: false, error: 'Belépés szükséges' });
    if (!roles.includes(role)) return res.status(403).json({ ok: false, error: 'Ehhez nincs jogosultságod' });
    req.admin = { email: s.email, role }; next();
  };
  app.post('/api/admin/logout', (req, res) => { delete sessions[cookies(req).adm]; writeJ('admin-sessions.json', sessions); res.set('Set-Cookie', 'adm=; Path=/; Max-Age=0'); res.json({ ok: true }); });
  app.get('/api/admin/me', auth(), (req, res) => res.json({ ok: true, ...req.admin, pilot: { limit: pilotLimit(), done: ordersCount() } }));

  // ---------- adatok ----------
  const quoteRow = q => ({ no: q.no, version: q.version || 1, createdAt: q.createdAt, company: q.company?.name, contact: q.company?.contact, email: q.company?.email, net: q.accept?.net ?? q.calc.net, status: q.status, stage: q.stage || null, adminState: q.adminState || null, lead: !!q.lead, utm: q.utm, cert: !!q.calc.certRequested, extras: q.calc.lines.some(l => l.type === 'extra'), deleted: !!q.deleted, commission: commissionOf(q) });
  const visitRow = v => ({ sid: v.sid, first: v.first, last: v.last, device: v.device, ip: v.ip, utm: v.utm, lead: v.lead ? { t: v.lead, name: leads[v.lead]?.name, company: leads[v.lead]?.company } : null, quoteNo: v.quoteNo || null, cartN: Object.keys(v.cart || {}).length, steps: [...new Set(v.events.filter(e => e.type === 'step').map(e => e.step))], live: Date.now() - new Date(v.last) < 3 * 60e3, abandoned: !!v.abandonedAt, minutes: Math.max(1, Math.round((new Date(v.last) - new Date(v.first)) / 60e3)) });

  app.get('/api/admin/catalog', auth(), (req, res) => res.json({ ok: true, items: ALL.map(x => ({ id: x.id, name: x.name, type: x.type, price: x.price })) }));
  app.get('/api/admin/todos', auth(), (req, res) => {
    const qs = listQuotes().filter(q => !q.deleted); const T2 = [];
    for (const q of qs) {
      if (q.stage === 'pending_approval') T2.push({ kind: 'approval', no: q.no, at: q.accept.at, title: `Jóváhagyásra vár: ${q.company.name}`, sub: `${q.accept.net.toLocaleString('hu-HU')} Ft nettó · pilot` });
      if (q.stage === 'coordination') T2.push({ kind: 'coordination', no: q.no, at: q.accept.at, title: `${q.calc.lines.some(l => l.type === 'live') ? 'Élő képzés – időpont, szerződés, FAR' : 'Kiegészítő miatt egyeztetni'}: ${q.company.name}`, sub: q.calc.lines.filter(l => l.type === 'live' || l.type === 'extra').map(l => l.name).concat(q.calc.certRequested ? ['hivatalos tanúsítvány'] : []).join(', ') });
      else if (q.calc.certRequested && !q.certHandled) T2.push({ kind: 'cert', no: q.no, at: q.createdAt, title: `Tanúsítványt kér: ${q.company.name}`, sub: 'Egyeztetni, mely tananyagokhoz (5 000 Ft/fő/tananyag)' });
      if (q.callback && !q.callbackHandled) T2.push({ kind: 'callback', no: q.no, at: q.callback.at, title: `Visszahívást kér: ${q.company.name}`, sub: [q.callback.phone, q.callback.slot].filter(Boolean).join(' · ') });
      if (q.customReq && !q.customHandled) T2.push({ kind: 'custom', no: q.no, at: q.customReq.at, title: `Egyedi árat kér: ${q.company.name}`, sub: [q.customReq.why, q.customReq.headcount && q.customReq.headcount + ' fő'].filter(Boolean).join(' · ') });
    }
    for (const v of Object.values(visits)) if (v.abandonedAt && !v.quoteNo && !v.abandonHandled) T2.push({ kind: 'abandoned', sid: v.sid, at: v.abandonedAt, title: `Félbehagyta: ${leads[v.lead]?.name || 'lead'}${leads[v.lead]?.company ? ' (' + leads[v.lead].company + ')' : ''}`, sub: `${Object.keys(v.cart || {}).length} tétel a kosárban${v.abandonMailAt ? ' · emlékeztető elküldve' : ''}` });
    T2.sort((a, b) => b.at.localeCompare(a.at));
    res.json({ ok: true, todos: T2, live: Object.values(visits).filter(v => Date.now() - new Date(v.last) < 3 * 60e3).map(visitRow) });
  });
  app.post('/api/admin/todos/done', auth(), wrap(async (req, res) => {
    const { kind, no, sid } = req.body; const f = { cert: 'certHandled', callback: 'callbackHandled', custom: 'customHandled' }[kind];
    if (f && no) { const q = getQuote(no); q[f] = { by: req.admin.email, at: new Date().toISOString() }; saveQuote(q); logEvent(no, 'admin_' + kind + '_done', { by: req.admin.email }); }
    if (kind === 'abandoned' && visits[sid]) { visits[sid].abandonHandled = true; saveVisits(); }
    res.json({ ok: true });
  }));
  app.get('/api/admin/quotes', auth(), (req, res) => {
    const s = String(req.query.q || '').toLowerCase();
    res.json({ ok: true, quotes: listQuotes().filter(q => !q.deleted).filter(q => !s || [q.no, q.company?.name, q.company?.contact, q.company?.email].join(' ').toLowerCase().includes(s)).map(quoteRow) });
  });
  app.get('/api/admin/quotes/:no', auth(), (req, res) => {
    const q = getQuote(req.params.no); if (!q) return res.status(404).json({ ok: false, error: 'Nincs ilyen ajánlat' });
    const vs = Object.values(visits).filter(v => v.quoteNo === q.no || (q.lead && v.lead === q.lead)).map(v => ({ ...visitRow(v), events: v.events }));
    res.json({ ok: true, quote: { ...q, commission: commissionOf(q) }, visits: vs, leadInfo: q.lead ? leads[q.lead] || null : null });
  });
  app.get('/api/admin/visits', auth(), (req, res) => res.json({ ok: true, visits: Object.values(visits).sort((a, b) => (b.last || '').localeCompare(a.last || '')).slice(0, 300).map(visitRow) }));
  app.get('/api/admin/visits/:sid', auth(), (req, res) => { const v = visits[req.params.sid]; if (!v) return res.status(404).json({ ok: false }); res.json({ ok: true, visit: { ...visitRow(v), events: v.events, cart: v.cart }, leadInfo: v.lead ? leads[v.lead] : null }); });

  // ---------- műveletek ----------
  const qx = no => { const q = getQuote(no); if (!q || q.deleted) throw new Error('Nincs ilyen ajánlat'); return q; };
  app.post('/api/admin/quotes/:no/approve', auth(['partner']), wrap(async (req, res) => {
    const q = qx(req.params.no); if (!['pending_approval', 'coordination'].includes(q.stage)) throw new Error('Ez a rendelés nem vár jóváhagyásra');
    q.approval = { by: req.admin.email, at: new Date().toISOString() }; q.stage = 'approved'; saveQuote(q); logEvent(q.no, 'approved', { by: req.admin.email });
    const r = await finalizeOrder(q); res.json({ ok: true, proforma: r.proforma });
  }));
  app.post('/api/admin/quotes/:no/return', auth(['partner']), wrap(async (req, res) => {
    const q = qx(req.params.no); const reason = String(req.body.reason || '').trim(); if (!reason) throw new Error('Add meg, mit kell pontosítani');
    q.stage = 'returned'; q.returned = { by: req.admin.email, at: new Date().toISOString(), reason }; saveQuote(q); logEvent(q.no, 'returned', { by: req.admin.email, reason });
    if (req.body.notify) await sendMail({ to: q.company.email, ...T.returnedMail(q, reason) });
    res.json({ ok: true });
  }));
  app.post('/api/admin/quotes/:no/note', auth(), wrap(async (req, res) => {
    const q = qx(req.params.no); const text = String(req.body.text || '').trim(); if (!text) throw new Error('Üres jegyzet');
    (q.notes = q.notes || []).push({ by: req.admin.email, at: new Date().toISOString(), text }); saveQuote(q); res.json({ ok: true, notes: q.notes });
  }));
  app.post('/api/admin/quotes/:no/state', auth(), wrap(async (req, res) => {
    const q = qx(req.params.no); q.adminState = String(req.body.state || '').slice(0, 40) || null; saveQuote(q); logEvent(q.no, 'admin_state', { state: q.adminState, by: req.admin.email }); res.json({ ok: true });
  }));
  app.post('/api/admin/quotes/:no/closed-by', auth(), wrap(async (req, res) => {
    const q = qx(req.params.no); if (!['self', 'sales'].includes(req.body.closedBy)) throw new Error('Érvénytelen érték');
    q.closedBy = req.body.closedBy; saveQuote(q); logEvent(q.no, 'closed_by_changed', { to: q.closedBy, by: req.admin.email, reason: req.body.reason || '' }); res.json({ ok: true });
  }));
  // Módosítás: új verzió (tételek/létszám), opcionális egyedi kedvezmény indoklással, új levél az ügyfélnek
  app.post('/api/admin/quotes/:no/revise', auth(), wrap(async (req, res) => {
    const q = qx(req.params.no); if (q.accept && q.stage !== 'returned') throw new Error('Elfogadott rendelés csak visszaküldés után módosítható');
    const sel = Array.isArray(req.body.selection) ? req.body.selection : q.selection; const calc = calculate(sel); const changes = [];
    const old = Object.fromEntries(q.calc.lines.map(l => [l.id, l])); const nw = Object.fromEntries(calc.lines.map(l => [l.id, l]));
    for (const id in nw) if (!old[id]) changes.push(`Új tétel: ${nw[id].name} (${nw[id].n})`); else if (old[id].n !== nw[id].n) changes.push(`${nw[id].name}: ${old[id].n} → ${nw[id].n}`);
    for (const id in old) if (!nw[id]) changes.push(`Kikerült: ${old[id].name}`);
    const d = req.body.discount;
    if (d && +d.value > 0) {
      if (!String(d.reason || '').trim()) throw new Error('Az egyedi kedvezményhez indoklás kell');
      const amt = d.type === 'pct' ? Math.round(calc.net * Math.min(+d.value, 90) / 100) : Math.min(Math.round(+d.value), calc.net);
      calc.customDiscount = { type: d.type, value: +d.value, amount: amt, reason: String(d.reason).slice(0, 300), by: req.admin.email };
      calc.net -= amt; calc.netFast = Math.round(calc.net * (1 - (calc.fastPct || 5) / 100)); calc.vat = Math.round(calc.net * 0.27); calc.gross = calc.net + calc.vat;
      changes.push(`Egyedi kedvezmény: −${amt.toLocaleString('hu-HU')} Ft`);
    }
    if (!changes.length) throw new Error('Nincs változás');
    (q.versions = q.versions || []).push({ version: q.version || 1, calc: q.calc, selection: q.selection, at: new Date().toISOString() });
    q.version = (q.version || 1) + 1; q.selection = sel; q.calc = calc; delete q.accept; q.stage = null; q.status = 'quote';
    const addD = n => new Date(Date.now() + n * DAY).toISOString(); q.validUntil = addD(14); q.fastUntil = addD(7);
    saveQuote(q); logEvent(q.no, 'revised', { by: req.admin.email, version: q.version, changes });
    if (req.body.notify !== false) await sendMail({ to: q.company.email, ...T.revisedMail(q, changes) });
    res.json({ ok: true, version: q.version, changes, net: calc.net });
  }));
  // GDPR-törlés: személyes adatok eltávolítása, a pénzügyi tételek (anonim) megmaradnak az elszámoláshoz
  app.post('/api/admin/quotes/:no/erase', auth(), wrap(async (req, res) => {
    const q = qx(req.params.no); if (req.body.confirm !== q.no) throw new Error('A megerősítéshez írd be az ajánlat számát');
    deleteQuote(q.no, req.admin.email);
    for (const v of Object.values(visits)) if (v.quoteNo === q.no) delete visits[v.sid]; saveVisits();
    res.json({ ok: true });
  }));
  app.get('/api/admin/export.csv', auth(), (req, res) => {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Ajánlatszám', 'Verzió', 'Létrehozva', 'Cég', 'Kapcsolattartó', 'E-mail', 'Telefon', 'Állapot', 'Nettó', 'Elfogadva', 'Díjbekérő', 'Ki zárta', 'Jutalék %', 'Jutalék Ft', 'Tételek', 'Forrás']];
    for (const q of listQuotes().filter(q => !q.deleted)) { const c = commissionOf(q); rows.push([q.no, q.version || 1, q.createdAt, q.company.name, q.company.contact, q.company.email, q.company.phone, q.stage || q.status, q.accept?.net ?? q.calc.net, q.accept?.at || '', q.accept?.proformaNo || '', c?.closedBy || '', c?.pct ?? '', c?.amount ?? '', q.calc.lines.map(l => `${l.name} × ${l.n}`).join('; '), [q.utm?.source, q.utm?.campaign].filter(Boolean).join(' / ')]); }
    res.set('Content-Type', 'text/csv; charset=utf-8'); res.set('Content-Disposition', 'attachment; filename="ajanlatok.csv"'); res.send('﻿' + rows.map(r => r.map(esc).join(';')).join('\r\n'));
  });

  // ---------- fizetés, visszafizetés ----------
  app.post('/api/admin/quotes/:no/paid', auth(), wrap(async (req, res) => {
    const q = qx(req.params.no); if (!q.accept?.proformaNo) throw new Error('Még nincs díjbekérő');
    q.paidAt = req.body.unset ? null : (req.body.at ? new Date(req.body.at).toISOString() : new Date().toISOString()); q.paidSource = 'kézi: ' + req.admin.email; saveQuote(q);
    logEvent(q.no, req.body.unset ? 'admin_unpaid' : 'paid', { by: req.admin.email, manual: true }); res.json({ ok: true });
  }));
  app.post('/api/admin/quotes/:no/refund', auth(), wrap(async (req, res) => {
    const q = qx(req.params.no); const amount = Math.round(+req.body.amount || 0); const reason = String(req.body.reason || '').trim();
    if (!q.accept || amount <= 0 || amount > q.accept.net) throw new Error('Érvénytelen összeg'); if (!reason) throw new Error('Add meg az okát');
    (q.refunds = q.refunds || []).push({ amount, reason, by: req.admin.email, at: new Date().toISOString() }); saveQuote(q);
    logEvent(q.no, 'admin_refund', { amount, reason, by: req.admin.email }); res.json({ ok: true });
  }));

  // ---------- statisztika ----------
  app.get('/api/admin/stats', auth(), (req, res) => {
    const days = +req.query.days || 0; const from = days ? Date.now() - days * DAY : 0; const inR = x => x && +new Date(x) >= from;
    const qs = listQuotes().filter(q => !q.deleted && inR(q.createdAt)); const vs = Object.values(visits).filter(v => inR(v.first));
    const orders = qs.filter(q => q.accept), paid = orders.filter(q => q.paidAt);
    const funnel = [
      { k: 'Mért látogatás', n: vs.length }, { k: 'Kosárba tett valamit', n: vs.filter(v => v.events.some(e => e.type === 'cart_add' || e.type === 'cart_set')).length },
      { k: 'Eljutott a cégadatokig', n: vs.filter(v => v.events.some(e => e.type === 'step' && e.step === 'form')).length },
      { k: 'Ajánlatot kért', n: qs.length }, { k: 'Megrendelte', n: orders.length }, { k: 'Fizetett', n: paid.length }];
    const src = {}; const key = u => [u?.source || 'közvetlen', u?.campaign || ''].join('|');
    for (const v of vs) { const k = key(v.utm); (src[k] = src[k] || { visits: 0, quotes: 0, orders: 0, net: 0 }).visits++; }
    for (const q of qs) { const k = key(q.utm); const o = (src[k] = src[k] || { visits: 0, quotes: 0, orders: 0, net: 0 }); o.quotes++; if (q.accept) { o.orders++; o.net += q.accept.net; } }
    const courses = {}; const C = id => (courses[id] = courses[id] || { id, name: ALL.find(x => x.id === id)?.name || id, added: 0, removed: 0, quoted: 0, ordered: 0 });
    for (const v of vs) for (const e of v.events) { if (e.type === 'cart_add') C(e.id).added++; if (e.type === 'cart_remove') C(e.id).removed++; }
    for (const q of qs) for (const l of q.calc.lines) { C(l.id).quoted++; if (q.accept) C(l.id).ordered++; }
    const months = {}; for (const q of orders) { const m = q.accept.at.slice(0, 7); const o = (months[m] = months[m] || { month: m, orders: 0, net: 0, paidNet: 0, commission: 0 }); const c = commissionOf(q); o.orders++; o.net += q.accept.net; if (q.paidAt) o.paidNet += c.base; o.commission += c.amount; }
    res.json({ ok: true, funnel, sources: Object.entries(src).map(([k, o]) => ({ source: k.split('|')[0], campaign: k.split('|')[1], ...o })).sort((a, b) => b.net - a.net || b.quotes - a.quotes),
      courses: Object.values(courses).sort((a, b) => b.ordered - a.ordered || b.added - a.added), months: Object.values(months).sort((a, b) => a.month.localeCompare(b.month)),
      totals: { quotes: qs.length, orders: orders.length, net: orders.reduce((a, q) => a + q.accept.net, 0), avg: orders.length ? Math.round(orders.reduce((a, q) => a + q.accept.net, 0) / orders.length) : 0, commission: orders.reduce((a, q) => a + commissionOf(q).amount, 0), conv: qs.length ? Math.round(orders.length / qs.length * 100) : 0 } });
  });

  // ---------- jutalék és TIG (negyedéves teljesítésigazolás) ----------
  let tigs = readJ('tigs.json', []); const saveTigs = () => writeJ('tigs.json', tigs);
  const qEnd = qt => { const [y, n] = qt.split('-Q').map(Number); return new Date(Date.UTC(y, n * 3, 1) - 1); };
  const qStart = qt => { const [y, n] = qt.split('-Q').map(Number); return new Date(Date.UTC(y, (n - 1) * 3, 1)); };
  const tigCandidates = end => listQuotes().filter(q => q.accept).map(q => ({ q, c: commissionOf(q) })).filter(({ c }) => c && c.final && new Date(c.finalAt) <= end && c.open !== 0);
  app.get('/api/admin/commission', auth(), (req, res) => {
    const rows = listQuotes().filter(q => q.accept && !q.deleted).map(q => ({ no: q.no, company: q.company.name, acceptedAt: q.accept.at, ...commissionOf(q) }));
    const sum = f => rows.filter(f).reduce((a, r) => a + r.open, 0);
    res.json({ ok: true, rows, tigs: tigs.map(t => ({ ...t, lines: undefined, n: t.lines.length })), summary: {
      waiting: rows.filter(r => !r.paid).reduce((a, r) => a + r.amount, 0), inGrace: sum(r => r.paid && !r.final), ready: sum(r => r.final), settled: rows.reduce((a, r) => a + r.settled, 0) } });
  });
  app.post('/api/admin/tig', auth(['owner']), wrap(async (req, res) => {
    const qt = String(req.body.quarter || ''); if (!/^\d{4}-Q[1-4]$/.test(qt)) throw new Error('Negyedév formátuma: 2026-Q4');
    if (tigs.some(t => t.status === 'draft')) throw new Error('Már van jóváhagyásra váró TIG – előbb azt kell lezárni vagy törölni');
    const end = qEnd(qt); const lines = tigCandidates(end).map(({ q, c }) => ({ no: q.no, company: q.company.name, net: q.accept.net, base: c.base, pct: c.pct, closedBy: c.closedBy, amount: c.open, kind: c.settled ? 'korrekció' : 'jutalék', note: c.settled ? `korábban elszámolva: ${c.settled.toLocaleString('hu-HU')} Ft${c.refunded ? '; visszafizetés: ' + c.refunded.toLocaleString('hu-HU') + ' Ft' : ''}` : '' }));
    if (!lines.length) throw new Error('Ebben a negyedévben nincs elszámolható tétel');
    const t = { id: `TIG-${qt}`, quarter: qt, from: qStart(qt).toISOString().slice(0, 10), to: end.toISOString().slice(0, 10), createdAt: new Date().toISOString(), createdBy: req.admin.email, status: 'draft', lines, total: lines.reduce((a, l) => a + l.amount, 0) };
    if (tigs.some(x => x.id === t.id)) t.id += '-' + (tigs.filter(x => x.id.startsWith(t.id)).length + 1);
    tigs.push(t); saveTigs(); for (const to of users().partners) await sendMail({ to, subject: `Teljesítésigazolás jóváhagyásra: ${t.id}`, html: `<p>Új teljesítésigazolás vár jóváhagyásra (${t.lines.length} tétel, ${t.total.toLocaleString('hu-HU')} Ft).</p><p><a href="${cfg.publicUrl}/admin#commission">Megnyitás az adminban</a></p>` });
    res.json({ ok: true, tig: t });
  }));
  app.get('/api/admin/tig/:id', auth(), (req, res) => { const t = tigs.find(x => x.id === req.params.id); if (!t) return res.status(404).json({ ok: false }); res.json({ ok: true, tig: t }); });
  app.post('/api/admin/tig/:id/approve', auth(['partner']), wrap(async (req, res) => {
    const t = tigs.find(x => x.id === req.params.id); if (!t || t.status !== 'draft') throw new Error('Nem jóváhagyható');
    for (const l of t.lines) { const q = getQuote(l.no); if (!q) continue; q.tigSettled = (q.tigSettled || 0) + l.amount; (q.tigs = q.tigs || []).push(t.id); saveQuote(q); logEvent(q.no, 'admin_tig', { tig: t.id, amount: l.amount }); }
    t.status = 'approved'; t.approvedBy = req.admin.email; t.approvedAt = new Date().toISOString(); saveTigs();
    for (const to of users().owners) await sendMail({ to, subject: `Teljesítésigazolás jóváhagyva: ${t.id}`, html: `<p>${t.id} jóváhagyva (${t.total.toLocaleString('hu-HU')} Ft), jóváhagyta: ${t.approvedBy}. A számla kiállítható.</p><p><a href="${cfg.publicUrl}/api/admin/tig/${t.id}/print">Teljesítésigazolás megnyitása</a></p>` });
    res.json({ ok: true });
  }));
  app.post('/api/admin/tig/:id/delete', auth(['owner']), wrap(async (req, res) => { const i = tigs.findIndex(x => x.id === req.params.id && x.status === 'draft'); if (i < 0) throw new Error('Csak jóváhagyásra váró TIG törölhető'); tigs.splice(i, 1); saveTigs(); res.json({ ok: true }); }));
  app.get('/api/admin/tig/:id/print', auth(), (req, res) => {
    const t = tigs.find(x => x.id === req.params.id); if (!t) return res.status(404).send('Nincs ilyen TIG');
    const f = v => Math.round(v).toLocaleString('hu-HU') + ' Ft', d = x => x ? new Date(x).toLocaleDateString('hu-HU') : '';
    res.set('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html><html lang="hu"><meta charset="utf-8"><title>${t.id}</title><style>body{font-family:Arial,sans-serif;font-size:13px;color:#111;max-width:820px;margin:30px auto;padding:0 20px}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border-bottom:1px solid #ccc;padding:6px;text-align:left}td.n,th.n{text-align:right}.sig{display:flex;gap:40px;margin-top:60px}.sig div{flex:1;border-top:1px solid #000;padding-top:6px;text-align:center}.draft{color:#b42318;font-weight:bold}@media print{button{display:none}}</style>
<button onclick="print()">Nyomtatás / PDF</button><h1>Teljesítésigazolás – ${t.id}</h1>${t.status === 'draft' ? '<p class="draft">TERVEZET – jóváhagyásra vár</p>' : ''}
<p><b>Megbízó:</b> Excellence Training Kft., 8000 Székesfehérvár, Határ utca 16., adószám: 27036666-2-07<br><b>Megbízott:</b> ${cfg.contact.name}, ${cfg.contact.title}<br><b>Időszak:</b> ${t.from} – ${t.to}<br><b>Tárgy:</b> értékesítési jutalék a kifizetett és a 30 napos visszafizetési időn túljutott megrendelések után</p>
<table><tr><th>Ajánlat</th><th>Ügyfél</th><th class="n">Nettó alap</th><th class="n">Mérték</th><th>Jelleg</th><th class="n">Összeg</th></tr>${t.lines.map(l => `<tr><td>${l.no}</td><td>${l.company}</td><td class="n">${f(l.base)}</td><td class="n">${l.pct}%${l.closedBy === 'sales' ? ' (sales)' : ''}</td><td>${l.kind}${l.note ? `<br><small>${l.note}</small>` : ''}</td><td class="n">${f(l.amount)}</td></tr>`).join('')}
<tr><th colspan="5">Összesen (a jutalék az ÁFA-t nem tartalmazza)</th><th class="n">${f(t.total)}</th></tr></table>
<p>Megbízó igazolja, hogy a Megbízott a fenti időszakban a felsorolt megrendeléseket érintően a szerződés szerinti tevékenységet teljesítette, a jutalék kifizethető.</p>
${t.status === 'approved' ? `<p><b>Jóváhagyta:</b> ${t.approvedBy}, ${d(t.approvedAt)} (elektronikus jóváhagyás az ajánlat-adminban)</p>` : ''}
<div class="sig"><div>Excellence Training Kft.</div><div>${cfg.contact.name}</div></div></html>`);
  });
  app.get('/api/admin/tig/:id/csv', auth(), (req, res) => {
    const t = tigs.find(x => x.id === req.params.id); if (!t) return res.sendStatus(404);
    const rows = [['Ajánlat', 'Ügyfél', 'Nettó alap', 'Mérték %', 'Lezárta', 'Jelleg', 'Összeg', 'Megjegyzés'], ...t.lines.map(l => [l.no, l.company, l.base, l.pct, l.closedBy, l.kind, l.amount, l.note]), ['', '', '', '', '', 'Összesen', t.total, '']];
    res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="${t.id}.csv"`).send('﻿' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n'));
  });

  // ---------- időzített feladatok: félbehagyás, jóváhagyási emlékeztető, adatmegőrzés ----------
  async function jobs() {
    const now = Date.now();
    for (const v of Object.values(visits)) {
      const cartN = Object.keys(v.cart || {}).length;
      if (v.lead && cartN && !v.quoteNo && !v.abandonedAt && now - new Date(v.last) > +(process.env.ABANDON_MIN || 120) * 60e3) { v.abandonedAt = new Date().toISOString(); saveVisits(); }
      if (v.abandonedAt && !v.quoteNo && !v.abandonMailAt && now - new Date(v.abandonedAt) > +(process.env.ABANDON_MAIL_MIN || 22 * 60) * 60e3 && leads[v.lead]?.email) {
        v.abandonMailAt = new Date().toISOString(); saveVisits();
        const L = leads[v.lead]; if ((L.abandonMailAt && now - new Date(L.abandonMailAt) < 7 * DAY) || listQuotes().some(q => q.lead === v.lead)) continue; // leadenként legfeljebb hetente egy, és ha már kért ajánlatot, nem
        L.abandonMailAt = v.abandonMailAt; writeJ('leads.json', leads);
        await sendMail({ to: leads[v.lead].email, ...T.abandonMail(leads[v.lead], `${cfg.publicUrl}/?resume=${v.sid}&t=${v.lead}`) }).catch(e => console.error('Emlékeztető hiba:', e.message));
      }
      if (now - new Date(v.last || v.first) > 183 * DAY) delete visits[v.sid]; // 6 hónapos megőrzés
    }
    const wd = new Date().getDay(); const workday = wd !== 0 && wd !== 6;
    for (const q of listQuotes()) if (q.stage === 'pending_approval' && workday) {
      const lastPing = Math.max(...[q.accept.at, ...(q.events || []).filter(e => e.type === 'approval_reminder').map(e => e.at)].map(x => +new Date(x)));
      if (now - lastPing > DAY) { for (const to of users().partners) await sendMail({ to, ...T.approvalRequestMail(q, true) }); if (cfg.mail.notifyTo) await sendMail({ to: cfg.mail.notifyTo, ...T.notifyMail(q, 'Jóváhagyás késik', '1 munkanapja vár jóváhagyásra') }); logEvent(q.no, 'approval_reminder'); }
    }
    for (const [k, t] of Object.entries(tokens)) if (t.exp < now) delete tokens[k];
    for (const [k, s] of Object.entries(sessions)) if (s.exp < now) delete sessions[k];
  }
  setInterval(() => jobs().catch(e => console.error('Admin job hiba:', e.message)), 10 * 60e3);
  app.post('/api/cron/admin-jobs', wrap(async (req, res) => { await jobs(); res.json({ ok: true }); }));
  return { jobs };
}

export const ordersCount = () => listQuotes().filter(q => q.accept && !q.deleted && q.stage !== 'returned').length;
