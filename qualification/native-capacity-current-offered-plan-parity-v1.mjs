/* Actual current JS finite-plan parity, DATA only. No native lane is imported. */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { captureServiceCreditCapacityOfferedPlanData as PLAN } from '../src/service-credit-capacity-offered-plan-data.js';

if (process.env.X402_CURRENT_OFFERED_PLAN_PARITY_SELECTION !== 'current-offered-plan-parity-data-v1') {
  throw new TypeError('EXACT_CURRENT_FINITE_PLAN_PARITY_SELECTION');
}
const pieces = [];
let total = 0;
for await (const piece of process.stdin) {
  total += piece.length;
  assert.ok(total <= 131072, 'bounded original parity DATA');
  pieces.push(piece);
}
const raw = Buffer.concat(pieces, total);
const input = JSON.parse(raw.toString('ascii'));
assert.equal(input.kind, 'CURRENT_OFFERED_PYTHON_TO_REAL_JS_FINITE_PLAN_DATA_V1');
assert.equal(input.actualPlanSourceSha256, 'd502d72ded56965ac9a5a7eec9ce57eb37bc44c78bd584ac84bdbbc5f526c317');
assert.match(input.pythonResourceSourceSha256, /^[0-9a-f]{64}$/);
assert.ok(Array.isArray(input.vectors) && input.vectors.length === 25);
let accepted = 0, refused = 0;
for (const vector of input.vectors) {
  assert.equal(typeof vector.accepted, 'boolean');
  if (vector.accepted) {
    const actual = PLAN(vector.configuration);
    assert.deepStrictEqual(actual, vector.expected);
    assert.equal(Object.isFrozen(actual), true);
    assert.equal(actual.laneShareAssumedEqual, false);
    assert.equal(actual.unusedReservationsReplayed, false);
    assert.equal(actual.actualEffectsExecuted, false);
    accepted++;
  } else {
    assert.throws(() => PLAN(vector.configuration), error =>
      error?.code === 'SERVICE_CREDIT_CAPACITY_OFFERED_PLAN_DATA_REJECTED');
    refused++;
  }
}
process.stdout.write(JSON.stringify({
  event: 'CURRENT_OFFERED_REAL_JS_FINITE_PLAN_PARITY_DATA_NOT_NATIVE', node: process.version,
  vectors: input.vectors.length, accepted, refused, fullObjectsCompared: accepted,
  inputBytes: raw.length, inputSha256: createHash('sha256').update(raw).digest('hex'),
  actualPlanSourceSha256: input.actualPlanSourceSha256,
  pythonResourceSourceSha256: input.pythonResourceSourceSha256,
  SDK: false, SQLite: false, nativeModulesImported: false, storageRootAccessed: false,
  keys: false, signatures: false, nonce: false, sockets: false, applicationChildren: 0,
  resourceSourceEffectsMeasured: false, nativeOsNetworkSandbox: false, authority: 'NONE',
}) + '\n');
