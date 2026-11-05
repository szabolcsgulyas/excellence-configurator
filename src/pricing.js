// Ugyanaz a logika, mint a konfigurátorban – a szerver nem bízik a böngésző által küldött összegekben.
import { COURSES, BANDS, DAY_TIERS, FAST_PCT, VAT, MAX_SEATS, GIFT_RULES, EXAM_IDS, byId } from './catalog.js';

const band = n => BANDS.find(b => n >= b.min && n <= b.max) || BANDS.at(-1);
const dayPct = d => [...DAY_TIERS].reverse().find(t => d >= t.min)?.pct || 0;
const cprice = id => COURSES.find(c => c.id === id).price;

/** selection: [{id, qty}] -> részletes kalkuláció */
export function calculate(selection) {
  const sel = (selection || []).map(s => byId(s.id) && ({ ...byId(s.id), qty: Math.max(1, Math.min(byId(s.id).type === 'live' ? 20 : MAX_SEATS, parseInt(s.qty, 10) || 1)) })).filter(Boolean);
  if (!sel.filter(x => x.type !== 'extra').length) throw new Error('Üres kiválasztás');
  const seats = sel.filter(x => x.type === 'pkg' || x.type === 'course').reduce((a, x) => a + x.qty, 0);
  const bp = band(seats).pct;
  const days = sel.filter(x => x.type === 'live').reduce((a, x) => a + x.days * x.qty, 0);
  const dp = dayPct(days);
  const r = v => Math.round(v);
  const lines = [];
  for (const x of sel) {
    if (x.type === 'pkg') lines.push({ id: x.id, code: x.code, name: x.name, type: x.type, n: x.qty, pct: 0, unit: x.price, list: x.price * x.qty, net: x.price * x.qty, full: x.items.reduce((a, id) => a + cprice(id), 0) * x.qty, items: x.items, gifts: x.gifts });
    else if (x.type === 'course') lines.push({ id: x.id, code: x.code, name: x.name, type: x.type, n: x.qty, pct: bp, unit: x.price, list: x.price * x.qty, net: r(x.price * x.qty * (1 - bp / 100)), full: x.price * x.qty });
    else if (x.type === 'live') lines.push({ id: x.id, code: x.code, name: x.name, type: x.type, n: x.qty, days: x.days, pct: dp, unit: x.price, list: x.price * x.qty, net: r(x.price * x.qty * (1 - dp / 100)), full: x.price * x.qty });
  }
  for (const x of sel.filter(y => y.type === 'extra' && !y.request)) {
    const n = x.per === 'flat' ? 1 : x.per === 'seat' ? seats : sel.filter(y => (y.type === 'course' && EXAM_IDS.includes(y.id)) || (y.type === 'pkg' && y.items.some(i => EXAM_IDS.includes(i)))).reduce((a, y) => Math.max(a, y.qty), 0);
    if (n > 0) lines.push({ id: x.id, code: x.code, name: x.name, type: 'extra', n, pct: 0, unit: x.price, list: x.price * n, net: x.price * n, full: x.price * n });
  }
  // Ajándékok a GIFT_RULES szerint (a kedvezmények utáni nettó és az összes hozzáférés alapján)
  const has = id => sel.some(x => x.id === id || (x.type === 'pkg' && x.items.includes(id)));
  const netAll = lines.reduce((a, l) => a + l.net, 0);
  const gifts = seats ? GIFT_RULES.filter(g => (g.kind === 'seats' ? seats > g.min : netAll > g.min) && !has(g.id)).map(g => { const c = byId(g.id); return { id: g.id, name: c.name, n: seats, value: c.price * seats, kind: g.kind, label: g.label }; }) : [];
  const list = lines.reduce((a, l) => a + l.list, 0), net = lines.reduce((a, l) => a + l.net, 0), full = lines.reduce((a, l) => a + l.full, 0);
  const fast = r(net * FAST_PCT / 100);
  return {
    certRequested: sel.some(x => x.id === 'x-cert'),
    lines, gifts, giftValue: gifts.reduce((a, g) => a + g.value, 0), seats, seatBandPct: bp, liveDays: days, dayPct: dp,
    list, full, net, discount: full - net, savedTotal: full - net,
    vatPct: VAT, vat: r(net * VAT / 100), gross: r(net * (1 + VAT / 100)),
    fastPct: FAST_PCT, fast, netFast: net - fast, grossFast: r((net - fast) * (1 + VAT / 100)),
    hasElearning: lines.some(l => l.type === 'pkg' || l.type === 'course'), hasLive: lines.some(l => l.type === 'live')
  };
}
