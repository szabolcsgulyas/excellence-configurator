// NAV Online Számla – queryTaxpayer (adószám -> cégnév, cím). Élesben aláírt XML kérés kell (SHA3-512, requestSignature).
// Száraz módban demó adatot ad. A teljes kliens a kulcsok után készül el (nav-online-invoice npm csomaggal egyszerű).
import { cfg } from '../config.js';
import { dry } from './dry.js';
const DEMO = { '12345678': { name: 'Mintacég Kereskedelmi Kft.', addr: '1117 Budapest, Példa utca 1.' } };

export async function queryTaxpayer(taxid) {
  const base = String(taxid).replace(/\D/g, '').slice(0, 8);
  if (base.length !== 8) throw new Error('Az adószám első 8 számjegye kell.');
  if (cfg.dryRun || !cfg.nav.login) { dry('nav', 'queryTaxpayer', { base }); return DEMO[base] ? { found: true, ...DEMO[base] } : { found: false }; }
  throw new Error('NAV éles kliens még nincs bekötve (NAV_* kulcsok után).');
}
