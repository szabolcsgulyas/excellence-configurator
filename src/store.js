// Egyszerű fájl alapú tár (data/quotes.json + data/events.jsonl). Élesben SQLite/Postgres-re cserélhető.
import fs from 'node:fs';
import path from 'node:path';
import { cfg } from './config.js';

const QF = path.join(cfg.dataDir, 'quotes.json');
const EF = path.join(cfg.dataDir, 'events.jsonl');
let quotes = fs.existsSync(QF) ? JSON.parse(fs.readFileSync(QF, 'utf8')) : {};
const flush = () => fs.writeFileSync(QF, JSON.stringify(quotes, null, 1));

export function nextQuoteNo() {
  const y = new Date().getFullYear();
  const n = Object.keys(quotes).filter(k => k.startsWith(`EXC-${y}-`)).length + 1;
  return `EXC-${y}-${String(n).padStart(4, '0')}`;
}
export function saveQuote(q) { quotes[q.no] = q; flush(); return q; }
export function getQuote(no) { return quotes[no] || null; }
export function listQuotes() { return Object.values(quotes).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
const NO_STATUS = new Set(['approved', 'returned', 'revised', 'approval_reminder', 'closed_by_changed', 'approval_requested', 'needs_coordination', 'paid']);
export function logEvent(no, type, data = {}) {
  const ev = { at: new Date().toISOString(), no, type, ...data };
  fs.appendFileSync(EF, JSON.stringify(ev) + '\n');
  if (quotes[no]) { quotes[no].events = quotes[no].events || []; quotes[no].events.push(ev); if (!NO_STATUS.has(type) && !type.startsWith('admin_')) quotes[no].status = type; flush(); }
  return ev;
}
// GDPR-törlés: a személyes adatokat eltávolítjuk, a pénzügyi tételek anonim módon megmaradnak az elszámoláshoz
export function deleteQuote(no, by) {
  const q = quotes[no]; if (!q) return;
  q.company = { name: '[törölve]', contact: '[törölve]', email: '', phone: '', taxid: '', addr: '' };
  if (q.accept) { q.accept.ip = ''; q.accept.userAgent = ''; }
  q.notes = []; q.callback = q.callback ? { at: q.callback.at } : undefined; q.customReq = q.customReq ? { at: q.customReq.at } : undefined;
  q.events = (q.events || []).map(e => ({ at: e.at, no: e.no, type: e.type }));
  q.deleted = { at: new Date().toISOString(), by }; flush();
  fs.appendFileSync(EF, JSON.stringify({ at: new Date().toISOString(), no, type: 'erased', by }) + '\n');
}
