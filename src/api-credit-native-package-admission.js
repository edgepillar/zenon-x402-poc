// SOURCE/PARSER ONLY until the ordinary installed namespace is qualified.
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { constants, lstatSync, openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerHooks, isBuiltin } from 'node:module';
import { createApiCreditModuleSourceGuard } from './api-credit-module-source-guard.js';

const F = Object.freeze, HASH = v => createHash('sha256').update(v).digest('hex');
const CATALOG = 'src/api-credit-module-catalog.json';
const CATALOG_BYTES = 116611; // Generated from the reviewed source selection.
const CATALOG_SHA256 = 'e78623ed85eb695e419bcec177fbad627d2dde60d82d4552863ad9ee0c7102af';
const REFUSED = F({ mode: 'REFUSED' }), UNKNOWN = F({ mode: 'UNKNOWN' });
const HELD = new Set(), DIRECTORIES = new Map();
const rootUrl = new URL('../', import.meta.url).href, root = fileURLToPath(rootUrl);
let phase = 'INITIAL', guard = null, hookOwner = null, reads = 0, allocated = 0, readCalls = 0;
function identity(s) { return [s.dev, s.ino, s.mode, s.uid, s.gid, s.size, s.mtimeNs, s.ctimeNs, s.nlink].join(':'); }
function same(a, b) { return identity(a) === identity(b); }
function missing(error) { return error !== null && typeof error === 'object' && error.code === 'ENOENT'; }
function directories(file) {
  const paths = []; let p = dirname(file);
  for (;;) { paths.push(p); const parent = dirname(p); if (p === parse(p).root) break; p = parent; }
  const rows = [];
  for (const path of paths.reverse()) {
    const s = lstatSync(path, { bigint: true });
    if (!s.isDirectory() || s.isSymbolicLink()) return null;
    // Pin identities, permissions and owners across all reads. Per-read full
    // snapshots also detect observed namespace mutations around a file read.
    const fixed = [s.dev, s.ino, s.mode, s.uid, s.gid].join(':');
    if (DIRECTORIES.has(path) && DIRECTORIES.get(path) !== fixed) return null;
    DIRECTORIES.set(path, fixed); rows.push([path, s]);
  }
  return rows;
}
function flatRead(path, expected) {
  if (!Number.isSafeInteger(expected) || expected < 0 || expected > 1048576
      || ++reads > 32768 || (allocated += expected + 1) > 67108864) return REFUSED;
  let fd = null, result = UNKNOWN;
  try {
    const file = join(root, path), dirs = directories(file);
    if (dirs === null) return REFUSED;
    const before = lstatSync(file, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size !== BigInt(expected)) return REFUSED;
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const opened = fstatSync(fd, { bigint: true });
    if (!opened.isFile() || !same(before, opened)) result = REFUSED;
    else {
      const bytes = Buffer.alloc(expected + 1); let size = 0, eof = false;
      while (size < bytes.length) {
        if (++readCalls > 65536) break;
        const count = readSync(fd, bytes, size, bytes.length - size, null);
        if (count === 0) { eof = true; break; } size += count;
      }
      const after = fstatSync(fd, { bigint: true }), named = lstatSync(file, { bigint: true });
      if (!eof || size !== expected || !same(opened, after) || !same(after, named)
          || dirs.some(([name, stat]) => !same(stat, lstatSync(name, { bigint: true })))) result = REFUSED;
      else result = F({ mode: 'SOURCE', source: bytes.subarray(0, size) });
    }
  } catch (error) { result = missing(error) && fd === null ? REFUSED : UNKNOWN; }
  finally {
    if (fd !== null) {
      try { closeSync(fd); } catch { HELD.add(fd); result = UNKNOWN; }
    }
  }
  return result;
}
function sourceReader(catalog) {
  const rows = new Map(catalog.rows.map(row => [row.path, row]));
  return F((path, expected) => {
    // package.json can change ordinary exports/type resolution without itself
    // being loaded as a module. Check every existing ancestor within the root.
    let parent = dirname(path);
    for (;;) {
      const name = parent === '.' ? 'package.json' : parent + '/package.json';
      if (name !== path) {
        const row = rows.get(name);
        if (row !== undefined) {
          const metadata = flatRead(name, row.bytes);
          if (metadata.mode !== 'SOURCE') return metadata;
          if (HASH(metadata.source) !== row.sha256) return REFUSED;
        } else {
          try { lstatSync(join(root, name), { bigint: true }); return REFUSED; }
          catch (error) { if (!missing(error)) return UNKNOWN; }
        }
      }
      if (parent === '.') break; parent = dirname(parent);
    }
    return flatRead(path, expected);
  });
}
/** One fixed RUN-only binding. No input, environment, FD, cache path, installer
 * or caller-selected loader config supplies policy. Keep hook ownership for
 * this process lifetime; uncertainty never deregisters or retries a hook. */
export function admitNativeApiCreditPackages() {
  if (arguments.length !== 0 || phase !== 'INITIAL') { phase = 'UNKNOWN'; return phase; }
  phase = 'OPENING';
  try {
    const catalogSource = flatRead(CATALOG, CATALOG_BYTES);
    if (catalogSource.mode !== 'SOURCE') { phase = catalogSource.mode; return phase; }
    if (HASH(catalogSource.source) !== CATALOG_SHA256) { phase = 'REFUSED'; return phase; }
    const catalog = JSON.parse(catalogSource.source.toString('utf8'));
    guard = createApiCreditModuleSourceGuard(rootUrl, catalog, sourceReader(catalog), F(url => isBuiltin(url)));
    guard.preflight();
    // Synchronous hooks cover subsequent dynamic import and CommonJS require.
    // Always delegate unchanged ordinary lookup/load, then admit its result.
    phase = 'REGISTERING';
    hookOwner = registerHooks({ resolve: guard.resolve, load: guard.load });
    phase = 'READY'; return phase;
  } catch {
    if (phase === 'REGISTERING' || HELD.size !== 0) phase = 'UNKNOWN';
    else { try { phase = guard === null ? 'REFUSED' : guard.status(); } catch { phase = 'UNKNOWN'; } }
    if (phase !== 'REFUSED') phase = 'UNKNOWN'; return phase;
  }
}
export function readNativeApiCreditPackageAdmissionState() {
  if (arguments.length !== 0 || HELD.size !== 0 || phase !== 'READY' || hookOwner === null) return phase === 'REFUSED' ? 'REFUSED' : 'UNKNOWN';
  try { return guard.status() === 'READY' ? 'READY' : 'UNKNOWN'; } catch { return 'UNKNOWN'; }
}
