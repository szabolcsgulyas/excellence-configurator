import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Egyszerű .env betöltő (nincs külső függőség)
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}
const e = process.env;
export const cfg = {
  root: ROOT,
  dataDir: path.join(ROOT, 'data'),
  dryRun: (e.DRY_RUN ?? 'true') !== 'false',
  port: +(e.PORT || 3000),
  allowedOrigins: (e.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()),
  // https:// hiányában kiegészítjük, a záró perjelet levágjuk (pl. ha a Railway-en séma nélkül adták meg)
  publicUrl: (u => !u ? 'http://localhost:3000' : (/^https?:\/\//.test(u) ? u : 'https://' + u).replace(/\/+$/, ''))((e.PUBLIC_URL || '').trim()),
  bevetel: {
    base: e.BEVETEL_BASE_URL || '', key: e.BEVETEL_API_KEY || '', userId: e.BEVETEL_USER_ID || '',
    channelSpecId: e.BEVETEL_CHANNEL_SPEC_ID || '', serviceId: e.BEVETEL_BOOKING_SERVICE_ID || '', resourceId: e.BEVETEL_BOOKING_RESOURCE_ID || ''
  },
  szamlazz: { key: e.SZAMLAZZ_AGENT_KEY || '', bank: e.SZAMLAZZ_BANK || '', account: e.SZAMLAZZ_BANK_ACCOUNT || '', prefix: e.SZAMLAZZ_INVOICE_PREFIX || 'EXC' },
  mail: { provider: (e.MAIL_PROVIDER || 'resend').trim().toLowerCase(), key: e.MAIL_API_KEY || '', from: e.MAIL_FROM || 'ajanlat@localhost', replyTo: e.MAIL_REPLY_TO || '', notifyTo: e.NOTIFY_TO || '' },
  nav: { login: e.NAV_LOGIN || '', password: e.NAV_PASSWORD || '', signKey: e.NAV_SIGN_KEY || '', exchangeKey: e.NAV_EXCHANGE_KEY || '', taxNumber: e.NAV_TAX_NUMBER || '' },
  fb: { verifyToken: e.FB_VERIFY_TOKEN || '', pageToken: e.FB_PAGE_TOKEN || '' },
  contact: { name: 'Gulyás Szabolcs', title: 'értékesítési partner', email: e.MAIL_REPLY_TO || 'gulyas.szabolcs@excellence.hu' }
};
fs.mkdirSync(cfg.dataDir, { recursive: true });
