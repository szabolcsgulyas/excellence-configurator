// Számlázz.hu Számla Agent – díjbekérő (XML, multipart POST). Doksi: https://docs.szamlazz.hu/
import { cfg } from '../config.js';
import { dry } from './dry.js';
const s = cfg.szamlazz;
const esc = v => String(v ?? '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const d = dt => dt.toISOString().slice(0, 10);

export function buildProformaXml(q) {
  const today = new Date(); const due = new Date(today); due.setDate(due.getDate() + 8);
  const items = q.calc.lines.map(l => {
    const unitNet = Math.round(l.net / l.n), net = unitNet * l.n, vat = Math.round(net * 0.27);
    return `<tetel><megnevezes>${esc(l.name)} – ${l.type === 'live' ? 'élő képzés' : 'e-learning hozzáférés, 1 év'}</megnevezes><mennyiseg>${l.n}</mennyiseg><mennyisegiEgyseg>${l.type === 'live' ? 'csoport' : l.type === 'extra' && l.id === 'x-track' ? 'év' : 'fő'}</mennyisegiEgyseg><nettoEgysegar>${unitNet}</nettoEgysegar><afakulcs>27</afakulcs><nettoErtek>${net}</nettoErtek><afaErtek>${vat}</afaErtek><bruttoErtek>${net + vat}</bruttoErtek></tetel>`;
  }).join('');
  const fastNote = q.accept?.fast ? ` Gyors döntési kedvezmény (${q.calc.fastPct}%) érvényesítve.` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<xmlszamla xmlns="http://www.szamlazz.hu/xmlszamla" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.szamlazz.hu/xmlszamla https://www.szamlazz.hu/szamla/docs/xsds/agent/xmlszamla.xsd">
<beallitasok><szamlaagentkulcs>${esc(s.key)}</szamlaagentkulcs><eszamla>true</eszamla><szamlaLetoltes>true</szamlaLetoltes><valaszVerzio>2</valaszVerzio></beallitasok>
<fejlec><keltDatum>${d(today)}</keltDatum><teljesitesDatum>${d(today)}</teljesitesDatum><fizetesiHataridoDatum>${d(due)}</fizetesiHataridoDatum><fizmod>Átutalás</fizmod><penznem>HUF</penznem><szamlaNyelve>hu</szamlaNyelve><megjegyzes>Ajánlat száma: ${esc(q.no)}. A hozzáférések a díjbekérő kiegyenlítése után 1 munkanapon belül aktiválódnak.${fastNote}</megjegyzes><rendelesSzam>${esc(q.no)}</rendelesSzam><dijbekero>true</dijbekero><szamlaszamElotag>${esc(s.prefix)}</szamlaszamElotag></fejlec>
<elado><bank>${esc(s.bank)}</bank><bankszamlaszam>${esc(s.account)}</bankszamlaszam><emailReplyto>${esc(cfg.mail.replyTo)}</emailReplyto></elado>
<vevo><nev>${esc(q.company.name)}</nev><cim>${esc(q.company.addr)}</cim><email>${esc(q.company.email)}</email><sendEmail>false</sendEmail><adoszam>${esc(q.company.taxid)}</adoszam></vevo>
<tetelek>${items}</tetelek>
</xmlszamla>`;
}

/** Díjbekérő kiállítása. Visszaad: { number, pdfBase64 } */
export async function createProforma(q) {
  const xml = buildProformaXml(q);
  if (cfg.dryRun || !s.key) { const r = dry('szamlazz', 'xmlagentxmlfile (díjbekérő)', { xmlPreview: xml.slice(0, 1200) }); return { ...r, number: `D-${s.prefix}-DRY-${q.no.slice(-4)}`, pdfBase64: null }; }
  const fd = new FormData();
  fd.append('action-xmlagentxmlfile', new Blob([xml], { type: 'text/xml' }), 'szamla.xml');
  const r = await fetch('https://www.szamlazz.hu/szamla/', { method: 'POST', body: fd });
  const err = r.headers.get('szlahu_error') || r.headers.get('szlahu_error_code');
  if (err) throw new Error(`Számlázz.hu hiba: ${decodeURIComponent(err)}`);
  const body = await r.text();
  const number = r.headers.get('szlahu_szamlaszam') || (body.match(/<szamlaszam>([^<]+)/) || [])[1];
  const pdfBase64 = (body.match(/<pdf>([^<]+)<\/pdf>/) || [])[1] || null;
  return { number, pdfBase64 };
}

/** Fizetés ellenőrzése: a banki kapcsolat miatt kifizetéskor a Számlázz.hu automatikusan kiállítja a végszámlát.
 *  A rendelésszám (= ajánlatszám) alapján lekérdezzük; ha van nem díjbekérő számla, a rendelés fizetve.
 *  FIGYELEM: a válasz pontos szerkezetét a teszt-fiókkal élesítés előtt ellenőrizni kell. Visszaad: { paid, invoiceNo, paidAt } vagy null. */
export async function checkPaid(q) {
  if (cfg.dryRun || !s.key) return null;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><xmlszamlaxml xmlns="http://www.szamlazz.hu/xmlszamlaxml"><szamlaagentkulcs>${esc(s.key)}</szamlaagentkulcs><rendelesSzam>${esc(q.no)}</rendelesSzam></xmlszamlaxml>`;
  const fd = new FormData(); fd.append('action-szamla_agent_xml', new Blob([xml], { type: 'text/xml' }), 'lekerdezes.xml');
  const r = await fetch('https://www.szamlazz.hu/szamla/', { method: 'POST', body: fd });
  if (r.headers.get('szlahu_error')) return null;
  const body = await r.text();
  const isProforma = /<tipus>\s*D\s*<\/tipus>/i.test(body) || /<dijbekero>true/i.test(body);
  const invoiceNo = (body.match(/<szamlaszam>([^<]+)/) || [])[1];
  if (!invoiceNo || isProforma) return { paid: false };
  return { paid: true, invoiceNo, paidAt: (body.match(/<kelt>([^<]+)/) || [])[1] || new Date().toISOString() };
}
