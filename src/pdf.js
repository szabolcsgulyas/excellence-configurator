// Designos ajánlat-PDF szerveroldali renderelése: a konfigurátor saját PDF-nézetét (?print=<no>) Chromium nyomtatja A4-re.
import fs from 'node:fs';
import path from 'node:path';
import { cfg } from './config.js';

let browserP = null;
async function browser() {
  if (!browserP) browserP = import('playwright').then(({ chromium }) => chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] }))
    .catch(e => { browserP = null; throw new Error('Chromium nem indítható: ' + e.message); });
  return browserP;
}

export const pdfPath = no => path.join(cfg.dataDir, `${no}.pdf`);

/** Legenerálja (és fájlba menti) az ajánlat PDF-jét. Visszaad: Buffer */
export async function renderQuotePdf(no, { force = false } = {}) {
  const out = pdfPath(no);
  if (!force && fs.existsSync(out)) return fs.readFileSync(out);
  const b = await browser();
  const page = await b.newPage({ viewport: { width: 900, height: 1200 } });
  try {
    await page.goto(`http://127.0.0.1:${cfg.port}/?print=${encodeURIComponent(no)}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForFunction(() => window.__pdfReady || window.__pdfError, null, { timeout: 30000 });
    const err = await page.evaluate(() => window.__pdfError); if (err) throw new Error(err);
    await page.evaluate(() => document.fonts && document.fonts.ready);
    const buf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    fs.writeFileSync(out, buf);
    return buf;
  } finally { await page.close(); }
}
