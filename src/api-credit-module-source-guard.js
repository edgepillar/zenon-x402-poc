import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { types } from 'node:util';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn;
const APPLY = Reflect.apply, TP = Object.getPrototypeOf(Uint8Array.prototype);
const AB = D(TP, 'buffer').get, OFFSET = D(TP, 'byteOffset').get, LENGTH = D(TP, 'byteLength').get;
const AB_LENGTH = D(ArrayBuffer.prototype, 'byteLength').get;
const RESIZABLE = D(ArrayBuffer.prototype, 'resizable').get;
const LIMIT = F({ rows: 1024, edges: 32, file: 1048576, source: 8388608,
  reads: 8192, readBytes: 67108864, resolves: 32768, loads: 8192 });
const SHA = /^[0-9a-f]{64}$/, PATH = /^[A-Za-z0-9_@.+/-]{1,512}$/;
function bad() { throw new TypeError('API_CREDIT_MODULE_SOURCE_REFUSED'); }
function record(v) {
  return v !== null && typeof v === 'object' && !types.isProxy(v)
    && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
}
function field(v, name) {
  if (!record(v)) bad();
  const d = D(v, name); if (!d || !OWN(d, 'value')) bad(); return d.value;
}
function shape(v, names) {
  if (!record(v) || Reflect.ownKeys(v).length !== names.length) bad();
  for (const name of names) field(v, name);
}
function dense(v, max) {
  if (types.isProxy(v) || !Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype) bad();
  const length = D(v, 'length').value;
  if (!Number.isSafeInteger(length) || length < 1 || length > max || Reflect.ownKeys(v).length !== length + 1) bad();
  const copy = []; for (let i = 0; i < length; i++) { const d = D(v, String(i)); if (!d || !OWN(d, 'value')) bad(); copy.push(d.value); }
  return copy;
}
function relative(v) {
  if (typeof v !== 'string' || !PATH.test(v) || v.startsWith('/')
      || v.split('/').some(p => p === '' || p === '.' || p === '..')) bad();
  return v;
}
function resultRecord(v) {
  if (!record(v)) bad();
  for (const name of Reflect.ownKeys(v)) if (typeof name !== 'string' || !OWN(D(v, name), 'value')) bad();
  return v;
}
// Copy only real byte storage. Never call a source object's conversion hooks.
function bytes(v, maximum) {
  if (typeof v === 'string') {
    if (v.length > maximum || Buffer.byteLength(v, 'utf8') > maximum) bad();
    return Buffer.from(v, 'utf8');
  }
  if (v === null || typeof v !== 'object' || types.isProxy(v)) bad();
  let data;
  if (types.isArrayBuffer(v)) {
    const size = APPLY(AB_LENGTH, v, []); if (size > maximum || APPLY(RESIZABLE, v, [])) bad();
    data = new Uint8Array(v);
  } else if (types.isUint8Array(v)) {
    const storage = APPLY(AB, v, []), size = APPLY(LENGTH, v, []);
    if (types.isSharedArrayBuffer(storage) || APPLY(RESIZABLE, storage, []) || size > maximum) bad();
    data = new Uint8Array(storage, APPLY(OFFSET, v, []), size);
  } else bad();
  return Buffer.from(data);
}
function digest(v) { return createHash('sha256').update(v).digest('hex'); }

/** Pure synchronous admission with declared source/builtin ports. It checks
 * ordinary nextResolve/nextLoad results and returns those same objects. It is
 * neither a resolver replacement nor an authority, filesystem or OS sandbox.
 * Missing optional lookups may throw normally; a resolved unlisted target is
 * sticky refusal even when package code catches the hook's exception. */
export function createApiCreditModuleSourceGuard(rootUrl, catalog, readSource, isBuiltin) {
  if (arguments.length !== 4 || typeof rootUrl !== 'string'
      || typeof readSource !== 'function' || types.isProxy(readSource) || !Object.isFrozen(readSource)
      || typeof isBuiltin !== 'function' || types.isProxy(isBuiltin) || !Object.isFrozen(isBuiltin)) bad();
  const root = new URL(rootUrl);
  if (root.protocol !== 'file:' || root.host !== '' || root.search || root.hash || !rootUrl.endsWith('/') || root.href !== rootUrl) bad();
  shape(catalog, ['version', 'rows', 'edges']); if (field(catalog, 'version') !== 1) bad();
  const byPath = new Map(), byUrl = new Map(), aliases = new Set(), edges = new Map(); let total = 0;
  for (const value of dense(field(catalog, 'rows'), LIMIT.rows)) {
    shape(value, ['path', 'bytes', 'sha256', 'format']);
    const path = relative(field(value, 'path')), size = field(value, 'bytes'), sha256 = field(value, 'sha256'), format = field(value, 'format');
    if (!Number.isSafeInteger(size) || size < 0 || size > LIMIT.file || typeof sha256 !== 'string' || !SHA.test(sha256)
        || !['module', 'commonjs', 'json'].includes(format) || aliases.has(path.toLowerCase())) bad();
    total += size; if (total > LIMIT.source) bad(); aliases.add(path.toLowerCase());
    const row = F({ path, bytes: size, sha256, format }), url = new URL(path, root).href;
    byPath.set(path, row); byUrl.set(url, row);
  }
  for (const value of dense(field(catalog, 'edges'), LIMIT.edges)) {
    shape(value, ['parent', 'specifier', 'path']);
    const parent = relative(field(value, 'parent')), specifier = field(value, 'specifier'), path = relative(field(value, 'path'));
    if (!byPath.has(parent) || !byPath.has(path) || typeof specifier !== 'string' || specifier.length < 1 || specifier.length > 256
        || specifier.startsWith('.') || specifier.includes(':') || specifier.includes('\\')) bad();
    const key = new URL(parent, root).href + '\n' + specifier; if (edges.has(key)) bad(); edges.set(key, new URL(path, root).href);
  }
  let state = 'INITIAL', busy = false, reads = 0, readBytes = 0, resolves = 0, loads = 0;
  function refuse(unknown = false) { if (state !== 'UNKNOWN') state = unknown ? 'UNKNOWN' : 'REFUSED'; bad(); }
  function enter(expected) { if (busy) refuse(true); if (state !== expected) refuse(); busy = true; }
  function builtin(url) { return typeof url === 'string' && url.startsWith('node:') && isBuiltin(url) === true; }
  function rowFor(url) { if (typeof url !== 'string' || !byUrl.has(url)) refuse(); return byUrl.get(url); }
  function verify(row, source) {
    const copy = bytes(source, row.bytes);
    if (copy.length !== row.bytes || digest(copy) !== row.sha256) refuse();
  }
  function read(row) {
    if (++reads > LIMIT.reads || (readBytes += row.bytes) > LIMIT.readBytes) refuse();
    let result;
    try { result = readSource(row.path, row.bytes); } catch { refuse(true); }
    if (state === 'UNKNOWN') bad();
    const mode = field(result, 'mode');
    if (mode === 'UNKNOWN') { shape(result, ['mode']); refuse(true); }
    if (mode === 'REFUSED') { shape(result, ['mode']); refuse(); }
    shape(result, ['mode', 'source']); if (mode !== 'SOURCE') refuse(true);
    verify(row, field(result, 'source'));
  }
  function guarded(run) {
    try { return run(); } catch (error) { if (state !== 'UNKNOWN') state = 'REFUSED'; throw error; }
    finally { busy = false; }
  }
  return F({
    preflight: F(function () {
      if (arguments.length !== 0) refuse(); enter('INITIAL');
      return guarded(() => { for (const row of byPath.values()) read(row); if (state !== 'INITIAL') refuse(true); state = 'READY'; return state; });
    }),
    status: F(function () { if (arguments.length !== 0 || busy) refuse(true); return state; }),
    resolve: F(function (specifier, context, nextResolve) {
      if (arguments.length !== 3 || typeof specifier !== 'string' || specifier.length > 1024
          || typeof nextResolve !== 'function' || types.isProxy(nextResolve)) refuse();
      enter('READY');
      // A failed ordinary lookup supplied no module to admit. Propagate that
      // same failure without authorizing a target or rewriting the lookup.
      let result, ordinaryFailure = false;
      try {
        if (++resolves > LIMIT.resolves) refuse();
        resultRecord(context); const parent = field(context, 'parentURL'); read(rowFor(parent));
        try { result = nextResolve(specifier, context); }
        catch (error) { ordinaryFailure = state === 'READY'; throw error; }
        if (state !== 'READY') refuse(true); resultRecord(result); const url = field(result, 'url');
        const requestedBuiltin = isBuiltin(specifier) === true;
        if (requestedBuiltin ? url !== (specifier.startsWith('node:') ? specifier : 'node:' + specifier) : builtin(url)) refuse();
        const edge = edges.get(field(context, 'parentURL') + '\n' + specifier);
        if (edge !== undefined && url !== edge) refuse();
        if (!builtin(url)) {
          const row = rowFor(url), hint = D(result, 'format');
          if (hint && hint.value !== undefined && hint.value !== null && hint.value !== row.format) refuse();
          read(row);
        }
        return result;
      } catch (error) { if (!ordinaryFailure && state !== 'UNKNOWN') state = 'REFUSED'; throw error; }
      finally { busy = false; }
    }),
    load: F(function (url, context, nextLoad) {
      if (arguments.length !== 3 || typeof nextLoad !== 'function' || types.isProxy(nextLoad)) refuse();
      enter('READY');
      return guarded(() => {
        resultRecord(context); if (++loads > LIMIT.loads) refuse(); const native = builtin(url), row = native ? null : rowFor(url);
        if (row !== null) read(row);
        let result; try { result = nextLoad(url, context); } catch { refuse(true); }
        if (state !== 'READY') refuse(true); resultRecord(result);
        const format = field(result, 'format'), source = field(result, 'source'), response = D(result, 'responseURL');
        if (response && response.value !== undefined && response.value !== url) refuse();
        if (native) { if (format !== 'builtin' || source !== null) refuse(); }
        else { if (format !== row.format) refuse(); verify(row, source); read(row); }
        return result;
      });
    }),
  });
}
