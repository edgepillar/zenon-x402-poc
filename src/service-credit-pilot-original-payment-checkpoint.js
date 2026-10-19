import { createHash } from 'node:crypto';

// Independent pins/trusted plain data required; no persistence or authority.
const B = ['requestId', 'paymentHash', 'origin', 'contextId'];
const K = ['requestBody', 'paymentPayload', 'paymentRequirements', 'context'];
const C = ['version', 'authorization', 'binding', 'originalBytes', 'digests'];
const freeze = Object.freeze;
function bad() { throw new TypeError('Invalid original-payment checkpoint'); }
function record(v, keys) {
  if (!v || typeof v !== 'object') bad();
  const p = Object.getPrototypeOf(v);
  if (p !== Object.prototype && p !== null || Reflect.ownKeys(v).length !== keys.length) bad();
  const out = {};
  for (const k of keys) {
    const d = Object.getOwnPropertyDescriptor(v, k);
    if (!d || !Object.hasOwn(d, 'value') || !d.enumerable) bad();
    out[k] = d.value;
  }
  return out;
}
function binding(v) {
  const b = record(v, B);
  for (const k of ['requestId', 'contextId']) {
    const s = b[k];
    if (typeof s !== 'string' || !s.length || s.length > 256 || Buffer.byteLength(s) > 256
      || /[\u0000-\u001f\u007f-\u009f]/u.test(s) || Buffer.from(s).toString() !== s) bad();
  }
  const h = b.paymentHash, o = b.origin;
  if (typeof h !== 'string' || h.length !== 64 || !/^[0-9a-fA-F]+$/.test(h)) bad();
  if (typeof o !== 'string' || o.length > 2048 || Buffer.byteLength(o) > 2048) bad();
  let u;
  try { u = new URL(o); } catch { bad(); }
  if (u.protocol !== 'https:' || u.origin !== o || u.username || u.password
    || u.pathname !== '/' || u.search || u.hash) bad();
  return b;
}
function fingerprint(s, field) {
  if (typeof s !== 'string' || (!s.length && field !== 'requestBody') || s.length > 5464 || s.length % 4
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s)) bad();
  if (s.length / 4 * 3 - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0) > 4096) bad();
  const bytes = Buffer.from(s, 'base64');
  if ((!bytes.length && field !== 'requestBody') || bytes.toString('base64') !== s) bad();
  return createHash('sha256').update(bytes).digest('hex');
}
function digests(v) {
  const d = record(v, K);
  for (const k of K)
    if (typeof d[k] !== 'string' || d[k].length !== 64 || !/^[0-9a-f]+$/.test(d[k])) bad();
  return d;
}
function make(b, bytes, d) {
  return freeze({ version: 1, authorization: 'NONE', binding: freeze(b),
    originalBytes: freeze(bytes), digests: freeze(d) });
}
function checked(v) {
  const c = record(v, C);
  if (c.version !== 1 || c.authorization !== 'NONE') bad();
  const b = binding(c.binding), bytes = record(c.originalBytes, K), d = digests(c.digests);
  for (const k of K) if (fingerprint(bytes[k], k) !== d[k]) bad();
  return make(b, bytes, d);
}
function canonical(c) {
  const out = Object.create(null);
  for (const k of C) out[k] = typeof c[k] === 'object' ? Object.assign(Object.create(null), c[k]) : c[k];
  return JSON.stringify(out);
}
export function captureOriginalPaymentCheckpoint(input) {
  const v = record(input, ['binding', 'originalBytes']);
  const b = binding(v.binding), bytes = record(v.originalBytes, K), d = {};
  for (const k of K) d[k] = fingerprint(bytes[k], k);
  return freeze({ checkpoint: make(b, bytes, d),
    pins: freeze({ binding: freeze({ ...b }), digests: freeze({ ...d }) }) });
}
export function encodeOriginalPaymentCheckpoint(checkpoint) {
  const s = canonical(checked(checkpoint));
  if (Buffer.byteLength(s) > 32768) bad();
  return s;
}
export function restoreOriginalPaymentCheckpoint(serialized, expectedPins) {
  if (typeof serialized !== 'string' || serialized.length > 32768 || Buffer.byteLength(serialized) > 32768) bad();
  const p = record(expectedPins, ['binding', 'digests']), b = binding(p.binding), d = digests(p.digests);
  let v;
  try { v = JSON.parse(serialized); } catch { bad(); }
  const c = checked(v);
  if (canonical(c) !== serialized) bad();
  for (const k of B) if (c.binding[k] !== b[k]) bad();
  for (const k of K) if (c.digests[k] !== d[k]) bad();
  return c;
}
