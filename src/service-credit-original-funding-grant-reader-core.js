import { types } from 'node:util';
import { captureServiceCreditOriginalFundingGrantQuery, captureServiceCreditOriginalFundingGrantResult } from './service-credit-original-funding-grant.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn, APPLY = Reflect.apply;
const NP = Promise, PP = NP.prototype, THEN = PP.then;
const BASE = [[PP, 'then', D(PP, 'then')], [PP, 'constructor', D(PP, 'constructor')], [NP, Symbol.species, D(NP, Symbol.species)]];
function promiseIntrinsics() {
  return D(Object.prototype, 'then') === undefined && BASE.every(([object, key, expected]) => {
    const actual = D(object, key); return actual && Reflect.ownKeys(actual).length === Reflect.ownKeys(expected).length
      && Reflect.ownKeys(expected).every(name => OWN(actual, name) && actual[name] === expected[name]);
  });
}
function fail() {
  const code = 'SERVICE_CREDIT_ORIGINAL_FUNDING_GRANT_QUERY_REJECTED', e = new TypeError(code);
  Object.defineProperties(e, { code: { value: code, enumerable: true }, stack: { value: 'TypeError: ' + code } }); throw F(e);
}
function fields(value, names, frozen = false) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || frozen && !Object.isFrozen(value) || Reflect.ownKeys(value).length !== names.length) fail();
  const c = {}; for (const key of names) { const d = D(value, key); if (!d?.enumerable || !OWN(d, 'value')) fail(); c[key] = d.value; } return c;
}
function callback(value) { if (typeof value !== 'function' || types.isProxy(value) || !Object.isFrozen(value)) fail(); return value; }
function discard(value) {
  try {
    if (!promiseIntrinsics() || types.isProxy(value) || !types.isPromise(value) || Object.getPrototypeOf(value) !== PP
        || Reflect.ownKeys(value).some(k => k !== 'constructor')) return;
    const ctor = D(value, 'constructor'); if (ctor && (!OWN(ctor, 'value') || ctor.value !== NP)) return;
    const bridge = APPLY(THEN, value, [() => {}, () => {}]); APPLY(THEN, bridge, [() => {}, () => {}]);
  } catch {}
}

/** Actual read/authentication sequencing with declared ports. The native
 * binding supplies the real synchronous verifier and one borrowed SQL store.
 * JSON never selects either capability. No writer/activation/dispatch/close
 * store capability exists here; close only retires this reader's admission. */
export function createServiceCreditOriginalFundingGrantReaderCore(options) {
  if (arguments.length !== 1) fail();
  const c = fields(options, ['readOriginalFundingGrant', 'verifyCapability']);
  const READ = callback(c.readOriginalFundingGrant), VERIFY = callback(c.verifyCapability);
  let busy = false, closed = false, held = false, proofChecks = 0, storeReads = 0;
  function live() { if (closed || held) fail(); }
  const read = F(function read(queryInput, proofInput) {
    if (arguments.length !== 2) fail();
    if (busy) { held = true; fail(); } live();
    const selected = captureServiceCreditOriginalFundingGrantQuery(queryInput);
    const proof = F(fields(proofInput, ['proofVersion', 'grantId', 'requestId', 'publicKey', 'maxCostUnits', 'signature']));
    if (proof.proofVersion !== 1 || proof.grantId !== selected.request.grantId || proof.requestId !== selected.request.requestId
        || proof.maxCostUnits !== 1 || typeof proof.publicKey !== 'string' || !proof.publicKey.length || proof.publicKey.length > 128
        || typeof proof.signature !== 'string' || !proof.signature.length || proof.signature.length > 256) fail();
    busy = true; let readEntered = false;
    try {
      proofChecks++;
      const observed = APPLY(VERIFY, undefined, [F({ grant: selected.grant, request: selected.request, proof })]);
      if (types.isPromise(observed) || types.isProxy(observed)) { discard(observed); held = true; fail(); }
      const verified = fields(observed, ['verified', 'proofVersion', 'grantId', 'requestId', 'maxCostUnits'], true);
      if (verified.verified !== true || verified.proofVersion !== 1 || verified.grantId !== selected.request.grantId
          || verified.requestId !== selected.request.requestId || verified.maxCostUnits !== 1) fail();
      live(); readEntered = true; storeReads++;
      const value = APPLY(READ, undefined, [selected.query.originalFunding]);
      if (types.isPromise(value) || types.isProxy(value)) { discard(value); held = true; fail(); }
      live(); const result = captureServiceCreditOriginalFundingGrantResult(value, selected.query.originalFunding); live(); return result;
    } catch { if (readEntered) held = true; fail(); }
    finally { busy = false; }
  });
  const close = F(function close() { if (arguments.length !== 0) fail(); closed = true; if (busy) held = true; });
  const inspect = F(function inspect() {
    if (arguments.length !== 0) fail();
    return F({ originalFundingGrantReaderVersion: 1, lifecycle: held ? 'HELD' : closed ? 'CLOSED' : 'OPEN',
      held, busy, closed, proofChecks, storeReads, storeOwnership: 'BORROWED_NEVER_CLOSED',
      createsGrant: false, updatesGrant: false, dispatchesService: false, startsPayment: false,
      authority: 'NONE', nativeRelease: 'NOT_OWNED' });
  });
  return F({ read, close, inspect });
}
