import { types } from 'node:util';
import { createHash } from 'node:crypto';
import { createOriginalFundingSpendingReservations, captureOriginalFundingSpendingPolicy } from '../original-funding-spending-reservations.js';
import { captureZenonDynamicPlasmaFundingPostPreparationInput } from './dynamic-plasma-funding-post-preparation-input.js';

const F = Object.freeze, NP = Promise, PP = NP.prototype, THEN = PP.then;
const METHODS = ['prepareOriginalFunding', 'commitOriginalFunding', 'submitOriginalFunding', 'handoffToService', 'submitOriginal', 'inspect', 'close'];
function fail(code) { const e = new TypeError('SDK105_SPENDING_' + code); Object.defineProperty(e, 'stack', { value: e.message }); throw F(e); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail('INPUT');
  const out = {};
  for (const name of names) { const d = Object.getOwnPropertyDescriptor(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail('INPUT'); out[name] = d.value; }
  return out;
}
function own(value, name) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || !Object.isFrozen(value)) fail('CHILD_RESULT');
  const d = Object.getOwnPropertyDescriptor(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail('CHILD_RESULT'); return d.value;
}
function safePromise(value) {
  if (PP.then !== THEN || !types.isPromise(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== PP) return false;
  if (Reflect.ownKeys(value).some(k => k !== 'constructor')) return false;
  const d = Object.getOwnPropertyDescriptor(value, 'constructor');
  return d === undefined || Object.hasOwn(d, 'value') && d.value === NP;
}
export function captureSdk105OriginalFundingSpendingConfiguration(input) {
  const c = fields(input, ['policy', 'backend', 'paymentId', 'readDay']);
  if (typeof c.paymentId !== 'string' || /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/.exec(c.paymentId)?.[0] !== c.paymentId
      || typeof c.readDay !== 'function' || types.isProxy(c.readDay)) fail('INPUT');
  return F({ ...c, policy: captureOriginalFundingSpendingPolicy(c.policy) });
}
/** Wrap the actual existing lifecycle, not a replacement signer or planner.
 * The existing preparation codec supplies the exact accepted terms and frozen
 * original input. A successful exact-CAS reservation precedes child preparation.
 * Existing reservations cannot authorize preparation after reopen. */
export function bindSdk105OriginalFundingSpending(client, fundingResourceUrl, configuration) {
  if (arguments.length !== 3) fail('INPUT');
  const c = captureSdk105OriginalFundingSpendingConfiguration(configuration);
  const methods = fields(client, METHODS);
  if (!Object.isFrozen(client) || METHODS.some(k => typeof methods[k] !== 'function' || types.isProxy(methods[k]))) fail('CLIENT');
  const journal = createOriginalFundingSpendingReservations(c.policy, c.backend);
  let started = false, originalDigest = null, active = false, closed = false, held = false, closing = null;
  function available() { if (closed || held || active) fail('UNAVAILABLE'); }
  function now() {
    const value = Reflect.apply(c.readDay, undefined, []);
    if (closed || held) fail('UNAVAILABLE'); return value;
  }
  function uncertain() {
    held = true;
    if (!closed && originalDigest !== null) {
      try { journal.observe(c.paymentId, originalDigest, 'UNKNOWN', Reflect.apply(c.readDay, undefined, [])); } catch {}
    }
  }
  async function invoke(name, input, count) {
    if (count !== 1) fail('INPUT'); available(); active = true;
    try {
      let selected = input;
      if (name === 'prepareOriginalFunding') {
        if (started) fail('ORIGINAL_ALREADY_ENTERED');
        selected = captureZenonDynamicPlasmaFundingPostPreparationInput(input, fundingResourceUrl);
        if (selected.plannerContext.readInput.payerAddress !== c.policy.accountId) fail('PAYER_ACCOUNT');
        const accepts = selected.challenge.paymentRequired.accepts;
        if (accepts.length !== 1) fail('OFFER');
        const accepted = accepts[0];
        const digest = 'sha256:' + createHash('sha256').update(JSON.stringify(selected)).digest('hex');
        const receipt = journal.reserve({ paymentId: c.paymentId, originalDigest: digest,
          network: accepted.network, asset: accepted.asset, recipient: accepted.payTo, amount: accepted.amount }, now());
        if (closed || held) fail('UNAVAILABLE');
        originalDigest = receipt.originalDigest; started = true;
      } else if (!started) fail('RESERVATION_REQUIRED');
      if (closed || held) fail('UNAVAILABLE');
      let returned;
      try { returned = Reflect.apply(methods[name], client, [selected]); }
      catch { uncertain(); fail('CHILD_UNKNOWN'); }
      if (!safePromise(returned)) { uncertain(); fail('CHILD_UNKNOWN'); }
      let result;
      try { result = await returned; } catch { uncertain(); fail('CHILD_UNKNOWN'); }
      if (closed || held) fail('UNAVAILABLE');
      if (name === 'submitOriginalFunding') {
        let bound;
        try {
          bound = own(result, 'phase') === 'FUNDING_INTAKE_BOUND' && own(result, 'fundingIntakeStatus') === 'BOUND';
          journal.observe(c.paymentId, originalDigest, bound ? 'SPENT' : 'UNKNOWN', now());
        }
        catch { uncertain(); fail('JOURNAL_UNKNOWN'); }
        if (!bound) held = true;
      }
      return result;
    } finally { active = false; }
  }
  const out = {};
  for (const name of METHODS.slice(0, 5)) out[name] = F(function (input) { return invoke(name, input, arguments.length); });
  out.inspect = F(function inspect() {
    if (arguments.length !== 0) fail('INPUT');
    const view = Reflect.apply(methods.inspect, client, []);
    const snapshot = {};
    if (view === null || typeof view !== 'object' || types.isProxy(view) || Object.getPrototypeOf(view) !== Object.prototype || !Object.isFrozen(view)) fail('CHILD_RESULT');
    for (const key of Reflect.ownKeys(view)) {
      if (typeof key !== 'string' || key === 'spending') fail('CHILD_RESULT');
      Object.defineProperty(snapshot, key, { value: own(view, key), enumerable: true, configurable: true });
    }
    const journalHeld = journal.snapshot().held;
    Object.defineProperty(snapshot, 'held', { value: held || journalHeld || own(view, 'held'), enumerable: true });
    if (held || journalHeld) Object.defineProperty(snapshot, 'lifecycle', { value: 'HELD', enumerable: true });
    Object.defineProperty(snapshot, 'spending', { value: F({ ...journal.snapshot(), originalReserved: started, active }), enumerable: true });
    return F(snapshot);
  });
  out.close = F(function close() {
    if (arguments.length !== 0) return Promise.reject(new TypeError('SDK105_SPENDING_INPUT'));
    if (closing !== null) return closing;
    let resolve, reject;
    closing = new NP((yes, no) => { resolve = yes; reject = no; });
    Object.defineProperty(closing, 'constructor', { value: NP });
    // Revoke before day/backend/child callbacks. No late BOUND upgrades a
    // close-time UNKNOWN. The borrowed backend is never physically closed.
    closed = true;
    if (active && originalDigest !== null) {
      held = true;
      try { journal.observe(c.paymentId, originalDigest, 'UNKNOWN', Reflect.apply(c.readDay, undefined, [])); } catch {}
    }
    journal.close();
    try {
      const result = Reflect.apply(methods.close, client, []);
      if (!safePromise(result)) fail('CLOSE_UNKNOWN');
      Reflect.apply(THEN, result, [value => {
        if (value !== undefined || held || journal.snapshot().held) { held = true; reject(new TypeError('SDK105_SPENDING_CLOSE_UNKNOWN')); }
        else resolve(undefined);
      }, () => { held = true; reject(new TypeError('SDK105_SPENDING_CLOSE_UNKNOWN')); }]);
    } catch { held = true; reject(new TypeError('SDK105_SPENDING_CLOSE_UNKNOWN')); }
    return closing;
  });
  return F(out);
}
