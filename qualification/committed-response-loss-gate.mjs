// Qualification control only. This owns one declared stop capability; it does
// not create a socket, run a store, deliver a service or establish physical loss.
import { types } from 'node:util';

const F = Object.freeze, A = Reflect.apply, D = Reflect.getOwnPropertyDescriptor;
const ORIGINAL = F(['modelVersion', 'grantId', 'requestId', 'method', 'routeId',
  'canonicalBodyDigest', 'selectedContentType', 'maxCostUnits']);
function data(value, fields, exact = false) {
  if (value === null || typeof value !== 'object' || types.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype || !Object.isFrozen(value)
      || exact && Reflect.ownKeys(value).length !== fields.length) return null;
  const copy = Object.create(null);
  for (const field of fields) {
    const descriptor = D(value, field);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
    copy[field] = descriptor.value;
  }
  return copy;
}
function callable(value) {
  return typeof value === 'function' && !types.isProxy(value) && Object.isFrozen(value);
}
function fail() { throw new TypeError('COMMITTED_RESPONSE_LOSS_GATE_INVALID_INPUT'); }

/**
 * The real binding enqueues from the durable owner's timer cancellation. That
 * cancellation precedes its synchronous completion transaction. The probe MUST
 * be deferred: it checks the exact committed original before stopping the known
 * response socket. A native trial must independently observe client rejection.
 * Failed setup/read/stop is sticky UNKNOWN; neither retry nor delivery follows.
 */
export function createCommittedResponseLossGate(options) {
  const c = arguments.length === 1 ? data(options, ['expectedRequest', 'readSnapshot', 'enqueue'], true) : null;
  const expected = c && data(c.expectedRequest, ORIGINAL, true);
  if (!c || !expected || !callable(c.readSnapshot) || !callable(c.enqueue)
      || expected.modelVersion !== 1 || expected.method !== 'POST'
      || expected.routeId !== 'service-credit.execute.v1' || expected.selectedContentType !== 'application/json'
      || !Number.isSafeInteger(expected.maxCostUnits) || expected.maxCostUnits < 1
      || !['grantId', 'requestId'].every(k => typeof expected[k] === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(expected[k]))
      || typeof expected.canonicalBodyDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(expected.canonicalBodyDigest)) fail();
  const READ = c.readSnapshot, ENQUEUE = c.enqueue;
  let phase = 'READY', stop = null, unknown = false, commitMatched = false, revision = null;
  let armAttempts = 0, queueAttempts = 0, probeEntries = 0, stopAttempts = 0, stopVoidObserved = false;
  function requestStop() {
    if (stop === null || stopAttempts !== 0) return;
    stopAttempts++; // Claim BEFORE the actuator, including reentrant refusal.
    try {
      if (A(stop, undefined, []) !== undefined) throw new TypeError();
      stopVoidObserved = true;
    } catch { unknown = true; phase = 'UNKNOWN'; }
  }
  function uncertain() { unknown = true; phase = 'UNKNOWN'; requestStop(); }
  function matching(snapshot) {
    const s = data(snapshot, ['revision', 'request', 'execution'], true);
    if (!s || !Number.isSafeInteger(s.revision) || s.revision < 1) return null;
    const r = data(s.request, [...ORIGINAL, 'requestDigest', 'costUnits', 'state', 'cachedResult']);
    const e = data(s.execution, ['request', 'terminalClassification']);
    const er = e && data(e.request, [...ORIGINAL, 'requestDigest', 'costUnits']);
    const cached = r && data(r.cachedResult, ['statusCode', 'contentType', 'resultCode'], true);
    if (!r || !e || !er || !cached || r.state !== 'SUCCEEDED' || e.terminalClassification !== 'SUCCEEDED'
        || cached.statusCode !== 200 || cached.contentType !== 'application/json' || cached.resultCode !== 'native.ok'
        || typeof r.requestDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(r.requestDigest)
        || r.requestDigest !== er.requestDigest || !Number.isSafeInteger(r.costUnits)
        || r.costUnits < 1 || r.costUnits > expected.maxCostUnits || r.costUnits !== er.costUnits
        || ORIGINAL.some(k => r[k] !== expected[k] || er[k] !== expected[k])) return null;
    return s.revision;
  }
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
  const serviceTimerCancelled = F(function serviceTimerCancelled() {
    if (arguments.length !== 0) fail();
    if (phase === 'ARMED') { uncertain(); return false; }
    if (phase !== 'FORWARDING') return false;
    phase = 'QUEUING'; queueAttempts++;
    let enqueueReturned = false;
    const probe = F(function probe() {
      if (!enqueueReturned) { uncertain(); return; }
      if (phase !== 'QUEUED') return; // A late/duplicate callback cannot repair UNKNOWN.
      phase = 'CHECKING'; probeEntries++;
      let observed;
      try { observed = matching(A(READ, undefined, [])); } catch { uncertain(); return; }
      if (phase !== 'CHECKING') return; // Reentrant refusal retains its verdict.
      if (observed === null) { uncertain(); return; }
      commitMatched = true; revision = observed; phase = 'COMMITTED_STOP_REQUESTED'; requestStop();
    });
    try {
      const value = A(ENQUEUE, undefined, [probe]); enqueueReturned = true;
      if (value !== undefined || phase !== 'QUEUING') { uncertain(); return false; }
      phase = 'QUEUED'; return true;
    } catch { enqueueReturned = true; uncertain(); return false; }
  });
  const refuse = F(function refuse() { if (arguments.length !== 0) fail(); uncertain(); });
  const inspect = F(function inspect() {
    if (arguments.length !== 0) fail();
    return F({ phase, unknown, commitMatched, revision, armAttempts, queueAttempts, probeEntries,
      stopAttempts, stopVoidObserved, authority: 'NONE', nativeDeliveryLoss: 'NOT_ESTABLISHED',
      nativePhysicalDrain: 'NOT_QUALIFIED' });
  });
  return F({ arm, beginForward, serviceTimerCancelled, refuse, inspect });
}
