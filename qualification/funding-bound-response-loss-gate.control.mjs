// Pure declared DATA/callback controls. The native fixture is not imported.
import assert from 'node:assert/strict';
import { createFundingBoundResponseLossGate } from './funding-bound-response-loss-gate.mjs';

const F = Object.freeze;
const expected = F({ selectionKey: 'sha256:' + '1'.repeat(64),
  resourceUrl: 'https://127.0.0.1:14443/funding', fundingCommitment: 'sha256:' + '2'.repeat(64),
  transactionHash: '3'.repeat(64), payloadDigest: 'sha256:' + '4'.repeat(64),
  intentDigest: '5'.repeat(64), paymentRequiredHeader: 'c3ludGhldGlj' });
function harness(read = () => F({ status: 'BOUND', ...expected }), stop = () => undefined) {
  const events = [], gate = createFundingBoundResponseLossGate(F({ expected,
    readSnapshot: F(() => { events.push('read'); return read(); }) }));
  assert.equal(gate.arm(F(() => { events.push('stop'); return stop(); })), true);
  assert.equal(gate.beginForward(), true);
  return { gate, events };
}
const cases = [];
function check(id, run) { run(); cases.push({ id, status: 'PASS' }); }
check('BOUND-BEFORE-ONE-STOP', () => {
  const h = harness(); assert.deepEqual(h.events, []);
  assert.equal(h.gate.fundingBoundCallback(), true); assert.deepEqual(h.events, ['read', 'stop']);
  assert.equal(h.gate.inspect().phase, 'BOUND_STOP_REQUESTED');
  assert.equal(h.gate.inspect().boundMatched, true);
});
check('DUPLICATE-CALLBACK-CANNOT-READ-OR-STOP-AGAIN', () => {
  const h = harness(); h.gate.fundingBoundCallback();
  assert.equal(h.gate.fundingBoundCallback(), false);
  assert.equal(h.gate.arm(F(() => { throw Error('unexpected'); })), false);
  assert.deepEqual(h.events, ['read', 'stop']);
});
check('CALLBACK-BEFORE-FORWARD-IS-STICKY-UNKNOWN', () => {
  let reads = 0, stops = 0;
  const gate = createFundingBoundResponseLossGate(F({ expected,
    readSnapshot: F(() => { reads++; return F({ status: 'BOUND', ...expected }); }) }));
  assert.equal(gate.arm(F(() => { stops++; })), true);
  assert.equal(gate.fundingBoundCallback(), false); assert.equal(gate.beginForward(), false);
  assert.equal(gate.fundingBoundCallback(), false);
  assert.equal(gate.inspect().unknown, true); assert.equal(reads, 0); assert.equal(stops, 1);
});
for (const field of Object.keys(expected)) check('EXACT-BINDING-' + field, () => {
  const h = harness(() => F({ status: 'BOUND', ...expected, [field]: expected[field] + 'different' }));
  assert.equal(h.gate.fundingBoundCallback(), false);
  assert.equal(h.gate.inspect().unknown, true); assert.equal(h.gate.inspect().boundMatched, false);
  assert.deepEqual(h.events, ['read', 'stop']);
});
check('ISSUED-OR-MISSING-ROW-IS-NOT-COMMIT', () => {
  for (const row of [null, F({ status: 'ISSUED', ...expected }), F({ status: 'BOUND' })]) {
    const h = harness(() => row); assert.equal(h.gate.fundingBoundCallback(), false);
    assert.equal(h.gate.inspect().phase, 'UNKNOWN');
  }
});
check('READ-EXCEPTION-IS-STICKY', () => {
  let works = false;
  const h = harness(() => { if (!works) throw Error('synthetic'); return F({ status: 'BOUND', ...expected }); });
  assert.equal(h.gate.fundingBoundCallback(), false); works = true;
  assert.equal(h.gate.fundingBoundCallback(), false); assert.equal(h.gate.inspect().boundMatched, false);
  assert.deepEqual(h.events, ['read', 'stop']);
});
check('READ-REENTRANCY-CANNOT-REPAIR-REFUSAL', () => {
  let h; h = harness(() => { h.gate.refuse(); return F({ status: 'BOUND', ...expected }); });
  assert.equal(h.gate.fundingBoundCallback(), false); assert.equal(h.gate.inspect().unknown, true);
  assert.equal(h.gate.inspect().boundMatched, false); assert.equal(h.gate.inspect().stopAttempts, 1);
});
check('ACTUATOR-THROW-OR-NONVOID-IS-UNKNOWN', () => {
  for (const stop of [() => { throw Error('synthetic'); }, () => true, () => Promise.resolve()]) {
    const h = harness(undefined, stop); assert.equal(h.gate.fundingBoundCallback(), false);
    assert.equal(h.gate.inspect().phase, 'UNKNOWN'); assert.equal(h.gate.inspect().stopAttempts, 1);
  }
});
check('ACTUATOR-REENTRANCY-CANNOT-CLEAR-UNKNOWN', () => {
  let h; h = harness(undefined, () => { h.gate.refuse(); });
  assert.equal(h.gate.fundingBoundCallback(), false); assert.equal(h.gate.inspect().unknown, true);
  assert.equal(h.gate.inspect().stopAttempts, 1);
});
check('UNFROZEN-ACCESSOR-AND-PROXY-ROWS-ARE-NOT-INVOKED', () => {
  let gets = 0;
  const accessor = { ...expected }; Object.defineProperty(accessor, 'status', {
    enumerable: true, get() { gets++; return 'BOUND'; },
  }); F(accessor);
  for (const row of [{ status: 'BOUND', ...expected }, accessor,
    new Proxy(F({ status: 'BOUND', ...expected }), { get() { gets++; } })]) {
    const h = harness(() => row); assert.equal(h.gate.fundingBoundCallback(), false);
  }
  assert.equal(gets, 0);
});
check('EXACT-LOOPBACK-RESOURCE-AND-VALID-PORT-REQUIRED', () => {
  for (const resourceUrl of ['https://localhost:14443/funding', 'https://127.0.0.1:65536/funding',
    'https://127.0.0.1:0/funding', expected.resourceUrl + '\r', expected.resourceUrl + '\n',
    expected.resourceUrl + '?different']) {
    assert.throws(() => createFundingBoundResponseLossGate(F({ expected: F({ ...expected, resourceUrl }),
      readSnapshot: F(() => { throw Error('must not enter'); }) })), TypeError);
  }
});
check('UNKNOWN-SCHEMA-OR-MUTABLE-CALLBACK-IS-REFUSED', () => {
  assert.throws(() => createFundingBoundResponseLossGate(F({ expected: F({ ...expected, retry: true }),
    readSnapshot: F(() => null) })), TypeError);
  assert.throws(() => createFundingBoundResponseLossGate(F({ expected, readSnapshot: () => null })), TypeError);
});
check('DECLARED-CONTROL-DOES-NOT-CLAIM-AUTHORITY-OR-NATIVE-LOSS', () => {
  const h = harness(); h.gate.fundingBoundCallback(); const view = h.gate.inspect();
  assert.equal(view.authority, 'NONE'); assert.equal(view.nativeDeliveryLoss, 'NOT_ESTABLISHED');
  assert.equal(view.physicalResourceRelease, 'NOT_QUALIFIED');
});
console.log(JSON.stringify({ qualification: 'FUNDING_BOUND_RESPONSE_LOSS_GATE_DATA_ONLY', cases,
  passed: cases.length, failed: 0, nativeFixtureImported: false, nativeExecutions: 0,
  SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0,
  actualFundingComposition: 'NOT_EXECUTED' }));
