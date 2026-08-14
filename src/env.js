import fs from 'node:fs';
import path from 'node:path';

export function loadDotEnv(filename = '.env') {
  const p = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(p)) return;

  const text = fs.readFileSync(p, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function envInt(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`${name} must be an integer`);
  return n;
}
