// Qualification-only actuator for one already known response socket. This
// module does not open a store, create a socket or verify an economic payment.
import { types } from 'node:util';

const F = Object.freeze, A = Reflect.apply, D = Reflect.getOwnPropertyDescriptor;
const FIELDS = F(['selectionKey', 'resourceUrl', 'fundingCommitment',
  'transactionHash', 'payloadDigest', 'intentDigest', 'paymentRequiredHeader']);
const HASH = /^[0-9a-f]{64}$/, DIGEST = /^sha256:[0-9a-f]{64}$/;
const HEADER = /^[A-Za-z0-9+/]+={0,2}$/;
function data(value, fields) {
  if (value === null || typeof value !== 'object' || types.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype || !Object.isFrozen(value)
      || Reflect.ownKeys(value).length !== fields.length) return null;
  const copy = Object.create(null);
  for (const name of fields) {
    const d = D(value, name);
    if (!d?.enumerable || !Object.hasOwn(d, 'value')) return null;
    copy[name] = d.value;
  }
  return copy;
}
function callable(value) {
  return typeof value === 'function' && !types.isProxy(value) && Object.isFrozen(value);
}
function matches(pattern, value) {
  return typeof value === 'string' && pattern.exec(value)?.[0] === value;
}
function fail() { throw new TypeError('FUNDING_BOUND_RESPONSE_LOSS_GATE_INVALID_INPUT'); }

/**
 * The real intake commits BOUND before entering the official facilitator. The
 * selected facilitator callback synchronously probes the genuine existing row
 * before requesting one stop. Do not call this at intent creation, before SQL
 * commit, or from a different original's callback. A failed read/stop is sticky
 * UNKNOWN. A native caller must independently observe the client's outcome.
 */
export function createFundingBoundResponseLossGate(options) {
  const c = arguments.length === 1 ? data(options, ['expected', 'readSnapshot']) : null;
  const expected = c && data(c.expected, FIELDS);
  const route = expected && typeof expected.resourceUrl === 'string'
    ? /^https:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})\/funding$/.exec(expected.resourceUrl) : null;
  if (!c || !expected || !callable(c.readSnapshot)
      || !['selectionKey', 'fundingCommitment', 'payloadDigest'].every(k => matches(DIGEST, expected[k]))
      || !['transactionHash', 'intentDigest'].every(k => matches(HASH, expected[k]))
      || route === null || route[0] !== expected.resourceUrl || Number(route[1]) > 65535
      || !matches(HEADER, expected.paymentRequiredHeader) || expected.paymentRequiredHeader.length > 5464) fail();
  const READ = c.readSnapshot;
  let phase = 'READY', unknown = false, stop = null, boundMatched = false;
  let armAttempts = 0, callbackEntries = 0, readAttempts = 0, stopAttempts = 0, stopVoidObserved = false;
  function requestStop() {
    if (stop === null || stopAttempts !== 0) return;
    stopAttempts++; // Consume BEFORE actuator entry, including reentrant refusal.
    try {
      if (A(stop, undefined, []) !== undefined) throw new TypeError();
      stopVoidObserved = true;
    } catch { unknown = true; phase = 'UNKNOWN'; }
  }
  function uncertain() { unknown = true; phase = 'UNKNOWN'; requestStop(); }
  const arm = F(function arm(stopTransport) {
    if (arguments.length !== 1 || !callable(stopTransport)) fail();
    armAttempts++;
    if (phase !== 'READY') return false;
    stop = stopTransport; phase = 'ARMED'; return true;
  });
  const beginForward = F(function beginForward() {
    if (arguments.length !== 0) fail();
    if (phase !== 'ARMED') { uncertain(); return false; }
    phase = 'FORWARDING'; return true;
  });
  const fundingBoundCallback = F(function fundingBoundCallback() {
    if (arguments.length !== 0) fail();
    callbackEntries++;
    if (phase !== 'FORWARDING') {
      if (phase === 'READY' || phase === 'ARMED' || phase === 'CHECKING') uncertain();
      return false;
    }
    phase = 'CHECKING'; readAttempts++;
    let row;
    try { row = data(A(READ, undefined, []), ['status', ...FIELDS]); }
    catch { uncertain(); return false; }
    if (phase !== 'CHECKING') return false;
    if (row === null || row.status !== 'BOUND' || FIELDS.some(k => row[k] !== expected[k])) {
      uncertain(); return false;
    }
    boundMatched = true; phase = 'BOUND_STOP_REQUESTED'; requestStop();
    return !unknown;
  });
  const refuse = F(function refuse() { if (arguments.length !== 0) fail(); uncertain(); });
  const inspect = F(function inspect() {
    if (arguments.length !== 0) fail();
    return F({ phase, unknown, boundMatched, armAttempts, callbackEntries, readAttempts,
      stopAttempts, stopVoidObserved, authority: 'NONE',
      nativeDeliveryLoss: 'NOT_ESTABLISHED', physicalResourceRelease: 'NOT_QUALIFIED' });
  });
  return F({ arm, beginForward, fundingBoundCallback, refuse, inspect });
}
