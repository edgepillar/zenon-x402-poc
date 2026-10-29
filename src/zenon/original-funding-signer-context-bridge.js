import { types } from 'node:util';

const F = Object.freeze, DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn, PP = Promise.prototype, THEN = PP.then;
const CTOR = DESC(PP, 'constructor'), SPECIES = DESC(Promise, Symbol.species);
function fail() { throw new TypeError('ORIGINAL_FUNDING_SIGNER_CONTEXT_BRIDGE'); }
function method(value, name, optional = false) {
  if (value === null || typeof value !== 'object' || types.isProxy(value)) fail(); let p = value;
  for (let i = 0; i < 8 && p !== null && p !== Object.prototype; i++) {
    if (types.isProxy(p)) fail(); const d = DESC(p, name);
    if (d !== undefined) { if (!OWN(d, 'value') || typeof d.value !== 'function' || types.isProxy(d.value) || !Object.isFrozen(d.value)) fail(); return d.value; }
    p = Object.getPrototypeOf(p);
  }
  if (!optional) fail(); return null;
}
function data(value, name) {
  discardUnexpectedPromise(value);
  if (value === null || typeof value !== 'object' || types.isProxy(value) || !Object.isFrozen(value)) fail();
  const d = DESC(value, name); if (!d?.enumerable || !OWN(d, 'value')) fail(); return d.value;
}
function same(a, b) { return !!a && !!b && Reflect.ownKeys(a).length === Reflect.ownKeys(b).length && Reflect.ownKeys(b).every(k => OWN(a, k) && a[k] === b[k]); }
function discardUnexpectedPromise(value) {
  if (types.isPromise(value) && !types.isProxy(value) && Object.getPrototypeOf(value) === PP && PP.then === THEN
      && DESC(Object.prototype, 'then') === undefined && same(DESC(PP, 'constructor'), CTOR) && same(DESC(Promise, Symbol.species), SPECIES)) {
    const d = DESC(value, 'constructor'); if (!d || OWN(d, 'value') && d.value === Promise) { try { Reflect.apply(THEN, value, [() => {}, () => {}]); } catch {} }
  }
}
function voidReceipt(value) {
  if (value === undefined) return; discardUnexpectedPromise(value);
  fail();
}
export function bindWalletOriginalFundingPreparation(wallet, original, resourceUrl) {
  if (arguments.length !== 3) fail(); const bind = method(wallet, 'bindOriginalPreparation', true);
  if (bind !== null) voidReceipt(Reflect.apply(bind, wallet, [original, resourceUrl]));
}
export function bindWalletOriginalFundingPreSignContext(wallet, handoff) {
  if (arguments.length !== 2) fail(); const bind = method(wallet, 'bindOriginalPreSignContext', true); if (bind === null) return;
  const snapshot = Reflect.apply(method(handoff, 'getSignedOriginalData'), handoff, []);
  voidReceipt(Reflect.apply(bind, wallet, [F({ originalUnsignedBlock: data(handoff, 'originalUnsignedBlock'), originalPlan: data(snapshot, 'originalPlan'),
    preSignCheckpointJson: data(snapshot, 'preSignCheckpointJson') })]));
}
