// bevetel.hu CRM – API dokumentáció alapján (Bearer token, /api/v1/...)
import { cfg } from '../config.js';
import { dry } from './dry.js';
const b = cfg.bevetel;

async function call(method, p, body, auth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${b.key}`;
  const r = await fetch(`${b.base}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!r.ok) throw new Error(`bevetel.hu ${method} ${p} -> ${r.status}: ${text.slice(0, 300)}`);
  return json;
}
const utm = (u = {}) => ({ utmSource: u.source || '', utmMedium: u.medium || '', utmCampaign: u.campaign || '', utmTerm: u.term || '', utmContent: u.content || '' });

/** Lead létrehozása (leads.write). A userId a saját CRM-felhasználóm -> a lead hozzám kerül. */
export async function createLead({ name, email, phone, message, utm: u }) {
  const payload = { partnerName: name, partnerEmail: email, partnerPhone: phone || '', message, userId: b.userId || undefined, ...utm(u) };
  if (cfg.dryRun || !b.key) return dry('bevetel', 'POST /api/v1/leads', payload);
  return call('POST', '/api/v1/leads', payload);
}

/** Publikus csatornás lead (API kulcs nélkül) – Facebook webhookhoz. */
export async function createChannelLead({ name, email, phone, companyName, message, formResponses, utm: u }) {
  const payload = { name, email, phone, companyName, message, formResponses, ...utm(u) };
  if (cfg.dryRun || !b.channelSpecId) return dry('bevetel', `POST /api/public/channel/${b.channelSpecId || '?'}/lead`, payload);
  return call('POST', `/api/public/channel/${b.channelSpecId}/lead`, payload, false);
}

/** Visszahívás foglalás (bookings.write). startTime/endTime ISO. */
export async function createBooking({ name, email, phone, startTime, endTime }) {
  const payload = { serviceId: b.serviceId, resourceId: b.resourceId, customerName: name, customerEmail: email, customerPhone: phone, startTime, endTime };
  if (cfg.dryRun || !b.key) return dry('bevetel', 'POST /api/v1/bookings', payload);
  return call('POST', '/api/v1/bookings', payload);
}

/** Opció: díjbekérő a bevetel.hu-ban (ha mégis itt akarják) – alapból a Számlázz.hu megy. */
export async function createProforma(q) {
  const payload = {
    billingName: q.company.name, partnerName: q.company.name, partnerType: 'domestic', partnerEmail: q.company.email,
    billingAddress: q.company.addr, billingVat: q.company.taxid, invoiceType: 'proforma', paymentMethod: 'transfer', currency: 'HUF',
    dueDate: q.accept?.dueDate, notes: `Ajánlat: ${q.no}`,
    items: q.calc.lines.map(l => ({ description: `${l.name} – ${l.type === 'live' ? 'élő képzés' : 'e-learning, 1 év'}`, quantity: l.n, unit: l.type === 'live' ? 'alkalom' : 'fő', unitPrice: Math.round(l.net / l.n), vatRate: 27 }))
  };
  if (cfg.dryRun || !b.key) return dry('bevetel', 'POST /api/v1/invoices (proforma)', payload);
  return call('POST', '/api/v1/invoices', payload);
}
