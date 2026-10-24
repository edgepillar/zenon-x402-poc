import test from 'node:test';
import assert from 'node:assert/strict';
import './service-credit-capacity-paced-native-binding-construction.behavior.mjs';
import { createNativeCapacityPacedPairedLane as createPair } from './capacity-native-paced-paired-lane-v1.supervisor.draft.mjs';

if (process.version !== 'v24.19.0'
    || process.env.X402_CAPACITY_PACED_PARENT_GUARD_DATA_SELECTION !== 'paced-parent-absence-guard-data-v1')
  throw new TypeError('PACED_PARENT_ABSENCE_GUARD_DATA_SELECTION_REQUIRED');

function config() {
  return {
    context: { runId: 'a'.repeat(64), laneId: 'synthetic-lane' },
    plan: { warmupCallsPerLane: 1, measurementCallsPerLane: 2 },
    payerProfile: { path: '/synthetic/never-opened/payer.json', sha256: '1'.repeat(64) },
    serviceProfile: { path: '/synthetic/never-opened/service.json', sha256: '2'.repeat(64) },
    payeeAddress: 'z1' + 'q'.repeat(38), commandBudgetMs: 1000, closeBudgetMs: 6000,
  };
}
const error = { name: 'TypeError', message: 'NATIVE_CAPACITY_PACED_PAIR_UNAVAILABLE' };

test('actual paced pair refuses absent parent admission before reading profiles or owning children', () => {
  assert.equal(Object.getOwnPropertyDescriptor(globalThis, 'getPinnedNativeCapacityPacedSupervisorNamespaceSnapshotV1'), undefined);
  assert.equal(Object.getOwnPropertyDescriptor(globalThis, 'getPinnedNativeCapacitySupervisorNamespaceSnapshotV3'), undefined);
  assert.throws(() => createPair(config()), error);
  assert.equal(Object.getOwnPropertyDescriptor(globalThis, 'getPinnedNativeCapacityPacedSupervisorNamespaceSnapshotV1'), undefined);
});

test('actual paced pair constructor enforces exact arity before admission', () => {
  assert.throws(() => createPair(), error);
  assert.throws(() => createPair(config(), undefined), error);
});

test('actual paced pair rejects malformed run identity before admission', () => {
  const c = config(); c.context.runId = 'not-a-run';
  assert.throws(() => createPair(c), error);
});

test('actual paced pair rejects malformed lane identity before admission', () => {
  const c = config(); c.context.laneId = 'bad lane';
  assert.throws(() => createPair(c), error);
});
