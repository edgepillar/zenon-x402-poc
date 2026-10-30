import { types } from 'node:util';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, A = Reflect.apply;
const NP = Promise, PP = NP.prototype, THEN = D(PP, 'then'), CTOR = D(PP, 'constructor'), SPECIES = D(NP, Symbol.species);
const HELD = new Set(), RESULT = ['status', 'revision', 'originalRequest', 'execution', 'cachedResult',
  'executionAuthorized', 'paymentAuthorized', 'signingAuthorized', 'deliveryStatus'];
function fail() { throw new TypeError('SERVICE_CREDIT_RECORDED_HTTP_SESSION'); }
function own(value, key) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || !Object.isFrozen(value)
      || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const d = D(value, key); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); return d.value;
}
function fields(value, keys) {
  const out = {}; for (const key of keys) out[key] = own(value, key);
  if (Reflect.ownKeys(value).length !== keys.length) fail(); return out;
}
function matches(expression, value) { return typeof value === 'string' && expression.exec(value)?.[0] === value; }
function same(a, b) {
  return !!a && !!b && Reflect.ownKeys(a).length === Reflect.ownKeys(b).length
    && Reflect.ownKeys(b).every(k => Object.hasOwn(a, k) && a[k] === b[k]);
}
function invariant() {
  return D(Object.prototype, 'then') === undefined && D(Object.prototype, 'toJSON') === undefined
    && same(D(PP, 'then'), THEN) && same(D(PP, 'constructor'), CTOR) && same(D(NP, Symbol.species), SPECIES);
}
function discard(value) {
  if (!invariant() || !types.isPromise(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== PP) return;
  const d = D(value, 'constructor');
  if (d && (!Object.hasOwn(d, 'value') || d.value !== NP)) return;
  try { const p = A(THEN.value, value, [() => {}, () => {}]); A(THEN.value, p, [() => {}, () => {}]); } catch {}
}
function capability() {
  let resolve, reject; const promise = new NP((yes, no) => { resolve = yes; reject = no; });
  Object.defineProperty(promise, 'constructor', { value: NP }); discard(promise); return { promise, resolve, reject };
}
function frame(statusCode, body, extraHeaderName = null, extraHeaderValue = null) {
  return F({ statusCode, body: JSON.stringify(body), extraHeaderName, extraHeaderValue });
}
const UNAVAILABLE = frame(503, { error: 'service_unavailable' });
const RESPONSES = F({ BAD_REQUEST: frame(400, { error: 'invalid_request' }),
  UNAUTHORIZED: frame(401, { error: 'unauthorized' }, 'WWW-Authenticate', 'ServiceCredit'),
  NOT_FOUND: frame(404, { error: 'not_found' }),
  METHOD_NOT_ALLOWED: frame(405, { error: 'method_not_allowed' }, 'Allow', 'POST'),
  NOT_RECORDED: frame(409, { error: 'request_unavailable' }),
  REQUEST_ID_CONFLICT: frame(409, { error: 'request_unavailable' }),
  ORIGINAL_BINDING_MISMATCH: frame(409, { error: 'request_unavailable' }),
  NOT_INVOKED: frame(409, { error: 'request_unavailable' }),
  RECONCILIATION_REQUIRED: UNAVAILABLE, OUTCOME_UNKNOWN: UNAVAILABLE,
  // The fixed reader also uses this known, powerless result for admission
  // throttling. Preserve that same reader and its consumed request budget.
  UNAVAILABLE });
function capturedResult(value) {
  const r = fields(value, RESULT);
  if (!matches(/^[A-Z_]{1,64}$/, r.status) || r.executionAuthorized !== false || r.paymentAuthorized !== false || r.signingAuthorized !== false
      || r.deliveryStatus !== 'NOT_ESTABLISHED') fail(); return r;
}
function cache(value) {
  const c = fields(value, ['statusCode', 'contentType', 'resultCode']);
  if (c.statusCode !== 200 || c.contentType !== 'application/json'
      || !matches(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/, c.resultCode) || c.resultCode.includes('://')) fail(); return c;
}
function response(value, grantId) {
  const r = capturedResult(value);
  if (r.status === 'CACHED_SUCCESS') {
    const request = r.originalRequest, execution = r.execution, reference = own(execution, 'request');
    const c = cache(r.cachedResult), stored = cache(own(request, 'cachedResult'));
    const requestId = own(request, 'requestId'), requestDigest = own(request, 'requestDigest');
    if (!Number.isSafeInteger(r.revision) || r.revision < 0 || own(request, 'grantId') !== grantId
        || !matches(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/, requestId) || requestId.includes('://')
        || !matches(/^sha256:[0-9a-f]{64}$/, requestDigest)
        || own(request, 'state') !== 'SUCCEEDED' || own(execution, 'terminalClassification') !== 'SUCCEEDED'
        || own(reference, 'grantId') !== grantId || own(reference, 'requestId') !== own(request, 'requestId')
        || own(reference, 'requestDigest') !== own(request, 'requestDigest')
        || c.statusCode !== stored.statusCode || c.contentType !== stored.contentType || c.resultCode !== stored.resultCode) fail();
    return frame(200, { ok: true, resultCode: c.resultCode });
  }
  if (r.cachedResult !== null || !Object.hasOwn(RESPONSES, r.status)) fail(); return RESPONSES[r.status];
}

/** Fixed declared reader/writer ports. The native binding supplies the existing
 * proof-authenticated original-outcome reader and private HTTP writer. No
 * executor, reservation, prepare, clock, timer or store-close port is accepted.
 * DATA proves this controller only; native SQL, proofs and HTTP remain separate.
 * A cached response is retained history, never current execution/delivery proof. */
export function createServiceCreditRecordedHttpSessionCore(options) {
  if (arguments.length !== 1 || !invariant() || HELD.size >= 32) fail();
  const c = fields(options, ['admittedGrantId', 'readOriginal', 'closeReader', 'writeResponse']);
  if (!matches(/^grant_[0-9a-f]{64}$/, c.admittedGrantId)) fail();
  const methods = [c.readOriginal, c.closeReader, c.writeResponse];
  if (methods.some(fn => typeof fn !== 'function' || types.isProxy(fn) || !Object.isFrozen(fn)) || new Set(methods).size !== 3) fail();
  const grantId = c.admittedGrantId, READ = c.readOriginal, CLOSE = c.closeReader, WRITE = c.writeResponse;
  let closed = false, held = false, active = false, closing = null;
  const opaque = [], retained = F(() => [READ, CLOSE, WRITE, opaque]);
  function hold(value) { held = true; HELD.add(retained); if (value !== undefined) { opaque.push(value); discard(value); } }
  const handle = F(async function handle(request, destination) {
    let selected = UNAVAILABLE, claimed = false;
    if (!invariant()) hold();
    if (arguments.length === 2 && invariant() && !closed && !held && !active) {
      active = true; claimed = true;
      try {
        const value = A(READ, undefined, [request]);
        if (types.isPromise(value)) { hold(value); fail(); }
        if (!invariant()) { hold(); fail(); }
        if (!closed && !held && invariant()) selected = response(value, grantId);
      } catch { hold(); }
    }
    try {
      const value = A(WRITE, undefined, [destination, selected]);
      if (value !== undefined) { hold(value); fail(); }
    } catch { hold(); }
    finally { if (claimed) active = false; }
    if (held) fail();
  });
  const close = F(function close() {
    if (arguments.length !== 0) { const out = capability(); out.reject(new TypeError('SERVICE_CREDIT_RECORDED_HTTP_SESSION')); return out.promise; }
    if (closing !== null) return closing.promise;
    closing = capability(); closed = true; if (active || !invariant()) hold();
    try {
      const value = A(CLOSE, undefined, []);
      if (types.isPromise(value)) { hold(value); fail(); }
      const result = capturedResult(value);
      if (result.status !== 'CLOSED' || [result.revision, result.originalRequest, result.execution, result.cachedResult].some(v => v !== null)) fail();
      if (held || !invariant()) fail(); closing.resolve(undefined);
    } catch { hold(); closing.reject(new TypeError('SERVICE_CREDIT_RECORDED_HTTP_SESSION_CLOSE_HELD')); }
    return closing.promise;
  });
  return F({ handle, close });
}
