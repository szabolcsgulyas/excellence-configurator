// Száraz mód: a külső hívás helyett naplózunk és álazonosítót adunk vissza.
import fs from 'node:fs';
import path from 'node:path';
import { cfg } from '../config.js';
const F = path.join(cfg.dataDir, 'dryrun.jsonl');
let seq = 0;
export function dry(service, action, payload) {
  const id = `${service}-dry-${Date.now()}-${++seq}`;
  const rec = { at: new Date().toISOString(), service, action, id, payload };
  fs.appendFileSync(F, JSON.stringify(rec) + '\n');
  console.log(`[DRY] ${service}.${action}`, JSON.stringify(payload).slice(0, 300));
  return { dry: true, id };
}
