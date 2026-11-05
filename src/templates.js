// E-mail sablonok (tegező, a kapcsolattartó: Gulyás Szabolcs). A konfigurátor szövegeivel egyező hangnem.
import { cfg } from './config.js';
import { VALID_DAYS, FAST_DAYS } from './catalog.js';
const ft = v => Math.round(v).toLocaleString('hu-HU') + ' Ft';
const first = n => (n || '').trim().split(' ').pop();
const link = q => `${cfg.publicUrl}/a/${q.no}`;
const sig = `<p>Üdv,<br><b>${cfg.contact.name}</b><br>${cfg.contact.title} · Excellence Training Kft.<br>${cfg.contact.email}</p>`;
const wrap = body => `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1b2430;max-width:620px">${body}</div>`;
const btn = (href, t) => `<p><a href="${href}" style="background:#0b7a75;color:#fff;padding:11px 18px;border-radius:8px;text-decoration:none;font-weight:600">${t}</a></p>`;

export const quoteMail = q => ({
  subject: `Képzési ajánlat – ${q.company.name} (${q.no})`,
  html: wrap(`<p>Szia ${first(q.company.contact)}!</p>
<p>Köszönöm, hogy összeállítottad a csapat képzési tervét. Az ajánlat kész: ${q.calc.lines.length} tétel, ${q.calc.lines.filter(l => l.type !== 'live').reduce((a, l) => a + l.n, 0)} fő, <b>${ft(q.calc.net)} + ÁFA</b> évre.${q.calc.savedTotal > 0 ? ` A listaárhoz képest ${ft(q.calc.savedTotal)}-ot spórolsz.` : ''}</p>
${btn(link(q), 'Ajánlat megnyitása')}
<p>Az oldalon el tudod fogadni, visszahívást kérhetsz, egyedi árat kérhetsz, vagy továbbküldheted a döntéshozónak. Az ajánlat ${VALID_DAYS} napig érvényes; ${FAST_DAYS} napon belüli elfogadásnál további ${q.calc.fastPct}% jár (${ft(q.calc.netFast)} + ÁFA).</p>
<p>Ha bármi kérdésed van, erre a levélre válaszolj, én olvasom.</p>${sig}`)
});

export const acceptMail = (q, proformaNo) => ({
  subject: `Köszönjük – szerződés és díjbekérő (${q.no})`,
  html: wrap(`<p>Szia ${first(q.company.contact)}!</p>
<p>Köszönöm a döntést. Mellékelve küldöm a szerződést és a díjbekérőt (${proformaNo}), a fizetendő összeg <b>${ft(q.accept.gross)}</b> (bruttó), átutalással, 8 napos határidővel.</p>
<p>Ami ezután történik: a díjbekérő kiegyenlítése után 1 munkanapon belül létrehozzuk a hozzáféréseket, és a résztvevők e-mailben kapják a belépőjüket. Ehhez kérlek, küldd el a résztvevők nevét és e-mail-címét válaszban (egy Excel is jó).</p>
${btn(link(q), 'Ajánlat és dokumentumok')}${sig}`)
});

export const callbackMail = q => ({
  subject: `Visszahívás – ${q.company.name} (${q.no})`,
  html: wrap(`<p>Szia ${first(q.company.contact)}!</p><p>Megkaptam a visszahívás-kérést, ${q.callback?.slot ? `a választott időpont: <b>${q.callback.slot}</b>.` : '1 munkanapon belül hívlak.'} Addig is itt az ajánlat:</p>${btn(link(q), 'Ajánlat megnyitása')}${sig}`)
});

export const forwardCustom = (q, subject, body) => ({ subject, html: wrap(body.split('\n').map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('<br>')) });
export const forwardMail = (q, from) => ({
  subject: `Képzési javaslat a csapatnak – ${q.company.name}`,
  html: wrap(`<p>Szia!</p><p>${from || q.company.contact} összeállított egy képzési tervet a csapatnak, és megkért, hogy küldjem el neked döntésre.</p>
<p><b>Röviden:</b> ${q.calc.lines.map(l => `${l.name} (${l.n} ${l.type === 'live' ? 'alkalom' : 'fő'})`).join(', ')} – <b>${ft(q.calc.net)} + ÁFA / év</b>${q.calc.savedTotal > 0 ? `, a listaárnál ${ft(q.calc.savedTotal)}-tal olcsóbban` : ''}. 30 napos pénzvisszafizetési garancia, 1 éves hozzáférés, automatikus hosszabbítás nélkül, a rögzített áron hosszabbítható.</p>
${btn(link(q), 'Ajánlat megnyitása')}<p>Az ajánlat ${VALID_DAYS} napig érvényes. Ha kérdésed van, válaszolj erre a levélre.</p>${sig}`)
});

export const reminderMail = (q, kind) => {
  const t = { d1: 'Megnéztem, hogy minden rendben van-e az ajánlattal', d7: `Ma jár le a ${q.calc.fastPct}% gyors döntési kedvezmény`, d13: 'Holnap lejár az ajánlat' }[kind];
  return { subject: `${t} (${q.no})`, html: wrap(`<p>Szia ${first(q.company.contact)}!</p><p>${t}. Ha elakadtál valamiben – létszám, indulás, egyedi ár – írj, vagy kérj visszahívást az ajánlatoldalon.</p>${btn(link(q), 'Ajánlat megnyitása')}${sig}`) };
};

export const notifyMail = (q, type, extra = '') => ({
  subject: `[${type}] ${q.company.name} – ${ft(q.calc.net)} (${q.no})`,
  html: wrap(`<p><b>${type}</b> · ${q.company.name} · ${q.company.contact} (${q.company.email}${q.company.phone ? ', ' + q.company.phone : ''})</p><p>${q.calc.lines.map(l => `${l.name} × ${l.n}`).join('<br>')}</p>${q.calc.certRequested ? '<p><b>Hivatalos tanúsítványt kér</b> – egyeztetni kell, mely tananyagokhoz (5 000 Ft/fő/tananyag, külön számla).</p>' : ''}<p>Nettó: ${ft(q.calc.net)}</p>${extra ? `<p>${extra}</p>` : ''}<p><a href="${link(q)}">${link(q)}</a></p>`)
});

/** Egyszerű szerződés-szöveg (HTML). Élesben a hivatalos docx sablonból generáljuk PDF-be. */
export const contractHtml = q => `<!doctype html><html lang="hu"><meta charset="utf-8"><body style="font-family:Arial;font-size:13px;max-width:720px;margin:auto">
<h2>Képzési szolgáltatási szerződés – ${q.no}</h2>
<p><b>Szolgáltató:</b> Excellence Training Kft. &nbsp; <b>Megrendelő:</b> ${q.company.name}, ${q.company.addr}, adószám: ${q.company.taxid}, kapcsolattartó: ${q.company.contact} (${q.company.email})</p>
<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><tr><th align="left">Képzés</th><th>Mennyiség</th><th align="right">Nettó</th></tr>
${q.calc.lines.map(l => `<tr><td>${l.name}</td><td align="center">${l.n} ${l.type === 'live' ? 'alkalom' : 'fő'}</td><td align="right">${ft(l.net)}</td></tr>`).join('')}${q.calc.certRequested ? '<tr><td colspan="3">Hivatalos tanúsítvány: igényelve – egyeztetés után külön számlázzuk (5 000 Ft/fő/tananyag).</td></tr>' : ''}
<tr><td colspan="2"><b>Összesen nettó${q.accept?.fast ? ` (gyors döntési ${q.calc.fastPct}% levonva)` : ''}</b></td><td align="right"><b>${ft(q.accept?.net ?? q.calc.net)}</b></td></tr></table>
<p>Hozzáférés: 1 év az aktiválástól, nem hosszabbodik automatikusan, a rögzített áron hosszabbítható. Fizetés: átutalás díjbekérő alapján, 8 napon belül. 30 napos pénzvisszafizetési garancia az e-learning tételekre. Az élő képzések időpontját a felek külön egyeztetik.</p>
<p>Kelt: ${new Date().toLocaleDateString('hu-HU')}</p></body></html>`;

// ---- Admin és jóváhagyási folyamat ----
const adminLink = q => `${cfg.publicUrl}/admin#q=${q.no}`;
export const loginMail = url => ({ subject: 'Belépés az Excellence ajánlat-adminba', html: wrap(`<p>Szia!</p><p>Ezzel a linkkel léphetsz be az admin felületre. A link 15 percig érvényes, és csak egyszer használható.</p>${btn(url, 'Belépés')}<p style="color:#667;font-size:13px">Ha nem te kérted, hagyd figyelmen kívül ezt a levelet.</p>`) });
export const pendingApprovalMail = q => ({
  subject: `Megrendelés rögzítve – ellenőrzés alatt (${q.no})`,
  html: wrap(`<p>Szia ${first(q.company.contact)}!</p><p>Köszönöm a megrendelést, rögzítettük <b>${q.no}</b> számon. A kalkulációt kollégánk 1 munkanapon belül ellenőrzi, és utána küldjük a megrendelés visszaigazolását és a díjbekérőt.</p>${btn(link(q), 'Ajánlat megnyitása')}${sig}`)
});
export const coordinationMail = q => ({
  subject: `Megrendelés rögzítve – egyeztetünk (${q.no})`,
  html: wrap(`<p>Szia ${first(q.company.contact)}!</p><p>Köszönöm a megrendelést, rögzítettük <b>${q.no}</b> számon. A kiválasztott kiegészítők (${q.calc.lines.filter(l => l.type === 'extra').map(l => l.name).concat(q.calc.certRequested ? ['hivatalos tanúsítvány'] : []).join(', ')}) miatt kollégánk 1 munkanapon belül felveszi veled a kapcsolatot, és utána küldjük a díjbekérőt.</p>${btn(link(q), 'Ajánlat megnyitása')}${sig}`)
});
export const approvalRequestMail = (q, reminder = false) => ({
  subject: `${reminder ? '[EMLÉKEZTETŐ] ' : ''}Jóváhagyásra vár: ${q.company.name} – ${ft(q.accept?.net ?? q.calc.net)} (${q.no})`,
  html: wrap(`<p><b>${reminder ? 'Még mindig jóváhagyásra vár' : 'Új megrendelés jóváhagyásra vár'}</b> (pilot időszak).</p><p>${q.company.name} · ${q.company.contact} (${q.company.email})</p><p>${q.calc.lines.map(l => `${l.name} × ${l.n} – ${ft(l.net)}`).join('<br>')}</p><p>Nettó: <b>${ft(q.accept?.net ?? q.calc.net)}</b>${q.accept?.fast ? ' (gyors döntési kedvezménnyel)' : ''}</p>${btn(adminLink(q), 'Megnyitás az adminban – jóváhagyás')}`)
});
export const returnedMail = (q, reason) => ({
  subject: `Megrendelés – pontosítás szükséges (${q.no})`,
  html: wrap(`<p>Szia ${first(q.company.contact)}!</p><p>Köszönöm a megrendelést. Az ellenőrzés során egy pontosításra van szükség: ${String(reason || '').replace(/</g, '&lt;')}</p><p>Hamarosan küldjük a javított ajánlatot, vagy keresünk telefonon.</p>${sig}`)
});
export const revisedMail = (q, changes) => ({
  subject: `Frissített ajánlat – ${q.company.name} (${q.no}-v${q.version})`,
  html: wrap(`<p>Szia ${first(q.company.contact)}!</p><p>Frissítettük az ajánlatot. A változások:</p><ul>${changes.map(c => `<li>${c}</li>`).join('')}</ul><p>Az új nettó összeg: <b>${ft(q.calc.net)} + ÁFA</b>. A korábbi verzió érvényét veszti.</p>${btn(link(q), 'Frissített ajánlat megnyitása')}${sig}`)
});
export const abandonMail = (lead, url) => ({
  subject: 'Elmentettük a képzési összeállításodat',
  html: wrap(`<p>Szia ${first(lead.name)}!</p><p>Láttam, hogy elkezdted összeállítani a csapat képzési tervét. Elmentettük, onnan folytathatod, ahol abbahagytad – az ajánlatot 2 perc alatt megkapod.</p>${btn(url, 'Folytatom az összeállítást')}<p>Ha elakadtál valamiben (létszám, élő vagy online képzés, egyedi ár), válaszolj erre a levélre, és segítek.</p>${sig}`)
});
