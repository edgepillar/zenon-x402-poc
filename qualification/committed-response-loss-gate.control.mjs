// Actual pure gate with declared commit, queue and stop capabilities.
// No native fixture import, socket, SQLite, SDK, key, signature or scratch.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCommittedResponseLossGate as CREATE } from './committed-response-loss-gate.mjs';

const F = Object.freeze;
assert.equal(process.version, 'v24.19.0');
assert.equal(process.env.X402_COMMITTED_RESPONSE_LOSS, 'declared-commit-before-response');
assert.equal(process.argv.length, 2);
const original = F({ modelVersion: 1, grantId: 'grant.original', requestId: 'request.original', method: 'POST',
  routeId: 'service-credit.execute.v1', canonicalBodyDigest: 'sha256:' + '00'.repeat(32),
  selectedContentType: 'application/json', maxCostUnits: 2 });
function freeze(value) {
  if (value !== null && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); F(value); }
  return value;
}
function committed() {
  const request = { ...original, requestDigest: 'sha256:' + '11'.repeat(32), costUnits: 2 };
  return { revision: 8, request: { ...request, state: 'SUCCEEDED',
    cachedResult: { statusCode: 200, contentType: 'application/json', resultCode: 'native.ok' } },
  execution: { request, terminalClassification: 'SUCCEEDED' } };
}
function fixture(change = {}) {
  const pending = [], calls = { reads: 0, stops: 0, queues: 0 };
  let snapshot = null, gate;
  gate = CREATE(F({ expectedRequest: original,
    readSnapshot: F(function readSnapshot() { calls.reads++; return change.read ? change.read(gate) : snapshot; }),
    enqueue: F(function enqueue(callback) { calls.queues++; if (change.enqueue) return change.enqueue(callback, gate);
      pending.push(callback); return undefined; }),
  }));
  const stop = F(function stop() { calls.stops++; return change.stop ? change.stop(gate) : undefined; });
  return { gate, calls, pending, stop,
    commit(value = committed()) { snapshot = freeze(value); },
    start() { assert.equal(gate.arm(stop), true); assert.equal(gate.beginForward(), true); },
    flush() { for (const callback of pending.splice(0)) callback(); },
  };
}
function unknown(f, reads = 1) {
  const v = f.gate.inspect(); assert.equal(v.phase, 'UNKNOWN'); assert.equal(v.unknown, true);
  assert.equal(f.calls.reads, reads); assert.equal(f.calls.stops, 1);
  assert.equal(v.stopAttempts, 1); assert.equal(v.nativeDeliveryLoss, 'NOT_ESTABLISHED');
  assert.equal(v.nativePhysicalDrain, 'NOT_QUALIFIED'); assert.equal(v.authority, 'NONE');
}
let passed = 0;
async function check(name, run) { await test(name, { concurrency: false }, run); passed++; }

await check('actual microtask runs after declared commit and before response continuation', async () => {
  const order = []; let snapshot = null;
  const gate = CREATE(F({ expectedRequest: original,
    readSnapshot: F(() => { order.push('read'); return snapshot; }),
    enqueue: F(callback => { queueMicrotask(callback); }),
  }));
  assert.equal(gate.arm(F(() => { order.push('stop'); })), true); gate.beginForward();
  assert.equal(gate.serviceTimerCancelled(), true);
  assert.equal(gate.inspect().commitMatched, false); order.push('commit'); snapshot = freeze(committed());
  await Promise.resolve().then(() => { order.push('response'); });
  assert.deepEqual(order, ['commit', 'read', 'stop', 'response']);
  assert.equal(gate.inspect().phase, 'COMMITTED_STOP_REQUESTED'); assert.equal(gate.inspect().revision, 8);
  assert.equal(gate.inspect().stopVoidObserved, true); assert.equal(gate.inspect().nativeDeliveryLoss, 'NOT_ESTABLISHED');
});
await check('one stop and one probe; exact replay cannot re-arm fault', () => {
  const f = fixture(); f.start(); f.gate.serviceTimerCancelled(); f.commit(); const callback = f.pending[0]; f.flush();
  assert.equal(f.gate.arm(f.stop), false); assert.equal(f.gate.serviceTimerCancelled(), false); callback();
  assert.deepEqual(f.calls, { reads: 1, stops: 1, queues: 1 });
});
await check('no cancellation signal means no invented commit or stop', () => {
  const f = fixture(); f.start(); f.commit(); f.flush();
  assert.equal(f.gate.inspect().phase, 'FORWARDING'); assert.equal(f.gate.inspect().commitMatched, false);
  assert.deepEqual(f.calls, { reads: 0, stops: 0, queues: 0 });
});
await check('cancellation before forward is unknown and stops only known owner', () => {
  const f = fixture(); f.gate.arm(f.stop); assert.equal(f.gate.serviceTimerCancelled(), false); unknown(f, 0);
});
await check('synchronous probe during queue admission cannot qualify pre-commit state', () => {
  const f = fixture({ enqueue(callback) { callback(); } }); f.start(); f.commit();
  assert.equal(f.gate.serviceTimerCancelled(), false); unknown(f, 0); assert.equal(f.gate.inspect().commitMatched, false);
});
await check('throwing queue is consumed without retry', () => {
  const f = fixture({ enqueue() { throw Error('declared queue refusal'); } }); f.start(); f.gate.serviceTimerCancelled();
  f.gate.serviceTimerCancelled(); unknown(f, 0); assert.equal(f.calls.queues, 1);
});
await check('nonvoid queue receipt remains unknown even if callback arrives later', () => {
  let late; const f = fixture({ enqueue(callback) { late = callback; return true; } }); f.start();
  f.gate.serviceTimerCancelled(); f.commit(); late(); unknown(f, 0);
});
await check('uncommitted, missing and terminal-unknown snapshots cannot pass', () => {
  for (const edit of [s => { s.request = null; }, s => { s.execution = null; },
    s => { s.request.state = 'OUTCOME_UNKNOWN'; }, s => { s.execution.terminalClassification = 'OUTCOME_UNKNOWN'; },
    s => { s.request.cachedResult = null; }, s => { s.request.cachedResult.resultCode = 'another.result'; },
    s => { s.request.cachedResult.statusCode = 503; }, s => { s.revision = 0; }]) {
    const f = fixture(), s = committed(); edit(s); f.start(); f.gate.serviceTimerCancelled(); f.commit(s); f.flush();
    unknown(f); assert.equal(f.gate.inspect().commitMatched, false);
  }
});
await check('each of the eight independently supplied original fields is bound', () => {
  for (const field of Object.keys(original)) {
    const f = fixture(), s = committed(); s.request[field] = typeof original[field] === 'number' ? original[field] + 1 : 'changed';
    f.start(); f.gate.serviceTimerCancelled(); f.commit(s); f.flush(); unknown(f);
  }
});
await check('execution link, request digest and debit must match committed original', () => {
  for (const edit of [s => { s.execution.request.requestId = 'foreign'; },
    s => { s.execution.request.requestDigest = 'sha256:' + '22'.repeat(32); },
    s => { s.execution.request.costUnits = 1; }, s => { s.request.costUnits = 3; }]) {
    const f = fixture(), s = committed(); edit(s); f.start(); f.gate.serviceTimerCancelled(); f.commit(s); f.flush(); unknown(f);
  }
});
await check('throwing committed-state read retains unknown and has no second query', () => {
  const f = fixture({ read() { throw Error('declared read refusal'); } }); f.start(); f.gate.serviceTimerCancelled(); f.flush();
  f.gate.serviceTimerCancelled(); unknown(f); assert.equal(f.gate.inspect().commitMatched, false);
});
await check('getters and proxy snapshot data are not evaluated', () => {
  let reads = 0;
  const getter = F({ revision: 8, get request() { reads++; return null; }, execution: null });
  for (const value of [getter, new Proxy({}, { get() { reads++; throw Error(); } })]) {
    const f = fixture({ read() { return value; } }); f.start(); f.gate.serviceTimerCancelled(); f.flush(); unknown(f);
  }
  assert.equal(reads, 0);
});
await check('stop failure retains committed match without a cleanup claim or retry', () => {
  const f = fixture({ stop() { throw Error('declared stop refusal'); } }); f.start(); f.gate.serviceTimerCancelled(); f.commit(); f.flush();
  f.gate.refuse(); unknown(f); assert.equal(f.gate.inspect().commitMatched, true); assert.equal(f.gate.inspect().stopVoidObserved, false);
});
await check('nonvoid stop is not accepted as a void receipt', () => {
  const f = fixture({ stop() { return true; } }); f.start(); f.gate.serviceTimerCancelled(); f.commit(); f.flush(); unknown(f);
  assert.equal(f.gate.inspect().stopVoidObserved, false);
});
await check('reentrant refusal during read cannot be upgraded by matching data', () => {
  const f = fixture({ read(gate) { gate.refuse(); return freeze(committed()); } }); f.start();
  f.gate.serviceTimerCancelled(); f.flush(); unknown(f); assert.equal(f.gate.inspect().commitMatched, false);
});
await check('reentrant stop refusal has one actuator entry and remains unknown', () => {
  const f = fixture({ stop(gate) { gate.refuse(); } }); f.start(); f.gate.serviceTimerCancelled(); f.commit(); f.flush(); unknown(f);
  assert.equal(f.gate.inspect().commitMatched, true);
});
await check('late matching probe cannot repair an earlier refusal', () => {
  const f = fixture(); f.start(); f.gate.serviceTimerCancelled(); f.gate.refuse(); f.commit(); f.flush(); unknown(f, 0);
  assert.equal(f.gate.inspect().commitMatched, false);
});
await check('configuration requires frozen data and fixed original semantics', () => {
  for (const bad of [null, { ...original }, F({ ...original, method: 'GET' }), F({ ...original, maxCostUnits: 0 })]) {
    assert.throws(() => CREATE(F({ expectedRequest: bad, readSnapshot: F(() => null), enqueue: F(() => {}) })));
  }
  const f = fixture(); assert.throws(() => f.gate.arm(() => {})); assert.equal(f.gate.inspect().armAttempts, 0);
});
console.log('# committed-response-loss-gate ' + JSON.stringify({ passed: true, cases: passed,
  commitQueueAndStopCapabilities: 'DECLARED', actualMicrotaskQueue: true, nativeFixtureExecutions: 0,
  SDK: 0, SQLite: 0, sockets: 0, keys: 0, signatures: 0, nonceSearches: 0, scratchFiles: 0,
  nativeDeliveryLoss: 'NOT_ESTABLISHED', nativePhysicalDrain: 'NOT_QUALIFIED' }));
