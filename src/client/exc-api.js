/* Konfigurátor -> szerver csatoló. A konfigurator.html <script> elejére illesztendő.
   Használat: a meglévő eseménykezelőkbe egy-egy hívás (lásd README "Bekötés a konfigurátorba"). */
window.EXC_API = (() => {
  $('#tGross').textContent=ft(state.accept&&state.accept.gross?state.accept.gross:T.gross);}
  const utm = Object.fromEntries([...new URLSearchParams(location.search)].filter(([k]) => k.startsWith('utm_')).map(([k, v]) => [k.slice(4), v]));
  let no = (location.pathname.match(/^\/a\/([\w-]+)/) || [])[1] || null;
  const post = (p, body) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
    .then(r => r.json()).then(j => { if (!j.ok) throw new Error(j.error || 'Hiba'); return j; });
  return {
    get no() { return no; },
    utm,
    nav: taxid => fetch(`${BASE}/api/nav/${taxid}`).then(r => r.json()),
    calc: selection => post('/api/calc', { selection }),
    /** state.sel/state.qty -> [{id,qty}] */
    selectionFrom: (state, selected, qtyOf) => selected().map(x => ({ id: x.id, qty: qtyOf(x) })),
    quote: (company, selection, customReq) => post('/api/quote', { company, selection, utm, customReq }).then(j => { no = j.no; history.replaceState(history.state, '', `/a/${no}`); return j; }),
    accept: gift => post(`/api/quote/${no}/accept`, { gift }),
    callback: (phone, startTime, slot) => post(`/api/quote/${no}/callback`, { phone, startTime, slot }),
    customPrice: d => post(`/api/quote/${no}/custom-price`, d),
    question: text => post(`/api/quote/${no}/question`, { text }),
    forward: to => post(`/api/quote/${no}/forward`, { to }),
    load: () => no ? fetch(`${BASE}/api/quote/${no}`).then(r => r.json()) : Promise.resolve(null)
  };
})();
