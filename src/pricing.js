// Ugyanaz a logika, mint a konfigurátorban – a szerver nem bízik a böngésző által küldött összegekben.
import { PACKAGES, COURSES, BANDS, FAST_PCT, VAT, MAX_SEATS, HOOK, GIFTS, byId } from './catalog.js';

const band = n => BANDS.find(b => n >= b.min && n <= b.max) || BANDS.at(-1);
export function bestForPackage(price, n) {
  const b = band(n); const base = { n, pct: b.pct, total: price * n * (1 - b.pct / 100) };
  const next = BANDS.find(x => x.min > n);
  if (next) { const t = price * next.min * (1 - next.pct / 100); if (t < base.total) return { ...base, alt: { n: next.min, pct: next.pct, total: t } }; }
  return base;
}

/** selection: [{id, qty}] -> részletes kalkuláció */
export function calculate(selection) {
  const sel = (selection || []).map(s => ({ ...byId(s.id), qty: Math.max(1, Math.min(MAX_SEATS, parseInt(s.qty, 10) || 1)) })).filter(x => x.id);
  if (!sel.length) throw new Error('Üres kiválasztás');
  const lines = sel.map(x => {
    if (x.type === 'live') return { id: x.id, name: x.name, type: x.type, n: x.qty, pct: 0, unit: x.price, list: x.price * x.qty, net: x.price * x.qty };
    const r = bestForPackage(x.price, x.qty); const use = r.alt || r;
    const full = x.type === 'pkg' ? COURSES.filter(c => x.items.includes(c.id)).reduce((a, c) => a + c.price, 0) * use.n : x.price * use.n;
    return { id: x.id, name: x.name, type: x.type, n: use.n, pct: use.pct, unit: x.price, list: x.price * use.n, net: Math.round(use.total), full, bumped: !!r.alt, items: x.items };
  });
  const has = id => sel.some(x => x.id === id || (x.type === 'pkg' && x.items.includes(id)));
  const gifts = [];
  const ex = sel.find(x => x.id === 'excel-alap');
  if (ex) HOOK.filter(id => !has(id)).forEach(id => { const c = byId(id); gifts.push({ id, name: c.name, n: ex.qty, value: c.price * ex.qty, kind: 'hook' }); });
  const pk = sel.find(x => x.type === 'pkg');
  if (pk) { const g = GIFTS.find(id => !has(id)); if (g) { const c = byId(g); gifts.push({ id: g, name: c.name, n: pk.qty, value: c.price * pk.qty, kind: 'choice', choices: GIFTS.filter(id => !has(id)) }); } }
  const list = lines.reduce((a, l) => a + l.list, 0), net = lines.reduce((a, l) => a + l.net, 0), full = lines.reduce((a, l) => a + (l.full ?? l.list), 0);
  const fast = Math.round(net * FAST_PCT / 100);
  const r = v => Math.round(v);
  return {
    lines, gifts, giftValue: gifts.reduce((a, g) => a + g.value, 0),
    list, full, net, headcountDiscount: list - net, packageDiscount: full - list, savedTotal: full - net,
    vatPct: VAT, vat: r(net * VAT / 100), gross: r(net * (1 + VAT / 100)),
    fastPct: FAST_PCT, fast, netFast: net - fast, grossFast: r((net - fast) * (1 + VAT / 100)),
    hasElearning: lines.some(l => l.type !== 'live'), hasLive: lines.some(l => l.type === 'live')
  };
}
export { PACKAGES };
