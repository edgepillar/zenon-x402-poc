import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';

const FREEZE = Object.freeze, DESCRIPTOR = Object.getOwnPropertyDescriptor;
const PROTOTYPE = Object.getPrototypeOf, KEYS = Reflect.ownKeys, OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy, IS_SHARED = utilTypes.isSharedArrayBuffer;
const ALLOC = Buffer.alloc, FILL = Buffer.prototype.fill, APPLY = Reflect.apply;
const BUFFER = Buffer.prototype, ARRAY = Array.prototype;
const ARRAY_BUFFER = DESCRIPTOR(PROTOTYPE(Uint8Array.prototype), 'buffer').get;
const BYTE_LENGTH = DESCRIPTOR(PROTOTYPE(Uint8Array.prototype), 'byteLength').get;
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * Actual native funding POST adapter's fixed-size response custody.
 * No socket, timer, Promise, SDK, signer or SQLite is imported or executed.
 * Event calls are observations, NOT authenticated native events on their own.
 *
 * Keep at most 64 body bytes and 64/16-KiB header pairs. Never expose a partial
 * body. A response can be taken ONCE only after TLS, exact Content-Length,
 * end, request close and error-free socket close. Every invalid/out-of-order
 * event permanently latches UNKNOWN and clears this owner's body copy.
 * A late observation never repairs uncertainty or grants retry/payment rights.
 * A late error after take can revoke current state, not recall the caller copy.
 * Native integration must call fail on its actual timeout/abort/error paths.
 */
export function createFundingPostNativeResponseCustody() {
  if (arguments.length !== 0) throw problem();
  return createCustody(64);
}
/** Separate opt-in history-query profile. The original POST limit stays 64. */
export function createOriginalFundingGrantNativeResponseCustody() {
  if (arguments.length !== 0) throw problem();
  return createCustody(8192);
}
function createCustody(maxBytes) {
  const bytes = ALLOC(maxBytes);
  let tls = false, headers = null, status = null, expected = null, length = 0;
  let ended = false, requestClosed = false, socketClosed = false, taken = false, unknown = false;
  function refuse() { unknown = true; APPLY(FILL, bytes, [0]); throw problem(); }
  function live() { if (unknown || taken) refuse(); }
  const acceptTls = FREEZE(function acceptTls() {
    if (arguments.length !== 0) refuse();
    live(); if (tls || headers !== null || ended || requestClosed || socketClosed) refuse();
    tls = true;
  });
  const acceptHeaders = FREEZE(function acceptHeaders(input) {
    try {
      if (arguments.length !== 1) refuse();
      live(); if (!tls || headers !== null || ended || requestClosed || socketClosed) refuse();
      const c = record(input, ['statusCode', 'rawHeaders']);
      if (!Number.isSafeInteger(c.statusCode) || c.statusCode < 200 || c.statusCode > 599
          || [204, 205, 304].includes(c.statusCode)) refuse();
      const raw = dense(c.rawHeaders);
      if (raw.length < 2 || raw.length > 128 || raw.length % 2 !== 0) refuse();
      const found = new Set(), pairs = [];
      let size = 0, bodyLength = null;
      for (let i = 0; i < raw.length; i += 2) {
        const name = raw[i], value = raw[i + 1];
        if (typeof name !== 'string' || name.length < 1 || name.length > 16384 || !TOKEN.test(name)
            || typeof value !== 'string' || value.length > 16384 || /[^\x20-\x7e]/.test(value)
            || value.trim() !== value) refuse();
        size += name.length + value.length + 4; if (size > 16384) refuse();
        const lower = name.toLowerCase();
        if (found.has(lower) || ['transfer-encoding', 'content-encoding', 'trailer'].includes(lower)) refuse();
        found.add(lower);
        if (lower === 'content-length') {
          if (!/^(?:0|[1-9][0-9]*)$/.test(value)) refuse();
          bodyLength = Number(value);
          if (!Number.isSafeInteger(bodyLength) || bodyLength > maxBytes) refuse();
        }
        pairs.push(FREEZE([lower, value]));
      }
      if (bodyLength === null) refuse();
      status = c.statusCode; expected = bodyLength; headers = FREEZE(pairs);
    } catch { refuse(); }
  });
  const acceptChunk = FREEZE(function acceptChunk(chunk) {
    try {
      if (arguments.length !== 1) refuse();
      live(); if (!tls || headers === null || ended || requestClosed || socketClosed
          || typeof chunk !== 'object' || chunk === null || IS_PROXY(chunk)
          || PROTOTYPE(chunk) !== BUFFER || IS_SHARED(APPLY(ARRAY_BUFFER, chunk, []))) refuse();
      const count = APPLY(BYTE_LENGTH, chunk, []);
      if (count > maxBytes || length + count > expected) refuse();
      const names = KEYS(chunk);
      if (names.length !== count) refuse();
      for (let i = 0; i < names.length; i++) {
        if (names[i] !== String(i)) refuse();
        const d = DESCRIPTOR(chunk, names[i]);
        if (!d || !OWN(d, 'value') || !d.enumerable || !Number.isInteger(d.value)
            || d.value < 0 || d.value > 255) refuse();
        bytes[length + i] = d.value;
      }
      length += names.length;
    } catch { refuse(); }
  });
  const acceptEnd = FREEZE(function acceptEnd() {
    if (arguments.length !== 0) refuse();
    live(); if (headers === null || ended || requestClosed || socketClosed || length !== expected) refuse();
    ended = true;
  });
  const acceptRequestClose = FREEZE(function acceptRequestClose() {
    if (arguments.length !== 0) refuse();
    live(); if (!ended || requestClosed) refuse(); requestClosed = true;
  });
  const acceptSocketClose = FREEZE(function acceptSocketClose(input) {
    try {
      if (arguments.length !== 1) refuse();
      live(); if (!ended || socketClosed || record(input, ['hadError']).hadError !== false) refuse();
      socketClosed = true;
    } catch { refuse(); }
  });
  const fail = FREEZE(function fail() {
    if (arguments.length !== 0) refuse();
    unknown = true; APPLY(FILL, bytes, [0]); return undefined;
  });
  const snapshot = FREEZE(function snapshot() {
    if (arguments.length !== 0) throw problem();
    return FREEZE({ phase: unknown ? 'UNKNOWN' : taken ? 'TAKEN'
      : ended && requestClosed && socketClosed ? 'READY' : 'WAITING',
      tls, headersAccepted: headers !== null, expectedBytes: expected, receivedBytes: length,
      ended, requestClosed, socketClosed, taken, unknown,
      maxResponseBodyBytes: maxBytes, nativeEventsAuthenticatedByThisComponent: false, authority: 'NONE' });
  });
  const takeResponse = FREEZE(function takeResponse() {
    if (arguments.length !== 0) refuse();
    live(); if (!ended || !requestClosed || !socketClosed || headers === null || !tls) refuse();
    const body = ALLOC(length);
    for (let i = 0; i < length; i++) body[i] = bytes[i];
    taken = true; APPLY(FILL, bytes, [0]);
    return FREEZE({ statusCode: status, headerPairs: headers, body });
  });
  return FREEZE({ acceptTls, acceptHeaders, acceptChunk, acceptEnd,
    acceptRequestClose, acceptSocketClose, fail, takeResponse, snapshot });
}
function record(value, fields) {
  if (typeof value !== 'object' || value === null || IS_PROXY(value)
      || PROTOTYPE(value) !== Object.prototype || KEYS(value).length !== fields.length) throw problem();
  const out = Object.create(null);
  for (const key of fields) {
    const d = DESCRIPTOR(value, key);
    if (!d || !d.enumerable || !OWN(d, 'value')) throw problem();
    Object.defineProperty(out, key, { value: d.value, enumerable: true });
  }
  return out;
}
function dense(value) {
  if (!Array.isArray(value) || IS_PROXY(value) || PROTOTYPE(value) !== ARRAY) throw problem();
  const d = DESCRIPTOR(value, 'length');
  if (!d || !OWN(d, 'value') || !Number.isSafeInteger(d.value) || d.value < 0 || d.value > 128
      || KEYS(value).length !== d.value + 1) throw problem();
  const out = [];
  for (let i = 0; i < d.value; i++) {
    const cell = DESCRIPTOR(value, String(i));
    if (!cell || !OWN(cell, 'value') || !cell.enumerable) throw problem();
    out.push(cell.value);
  }
  return out;
}
function problem() {
  const code = 'FUNDING_POST_NATIVE_RESPONSE_UNAVAILABLE', error = new TypeError(code);
  Object.defineProperty(error, 'code', { value: code, enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: ' + code });
  return FREEZE(error);
}
