import assert from 'node:assert/strict';
import { runApiCreditSignerInspectionOwner } from '../src/original-funding-signer-inspection-owner.js';

const F = Object.freeze;
const expectedOriginal = F({
  paymentId: 'fixture.payment',
  originalDigest: 'sha256:' + '1'.repeat(64),
  fundingResourceUrl: 'https://funding.example.test/funding',
});

function fixture(readRecord) {
  const trace = [];
  let lifecycle = 'OPEN';
  const fileConfiguration = F({});
  const owner = F({
    signerCustody: F({ requirePreparationContext: true, readSignerRecord: F(paymentId => {
      assert.equal(paymentId, expectedOriginal.paymentId);
      trace.push('read');
      return readRecord();
    }) }),
    inspect: F(() => F({
      spendingFileOwnerVersion: 1, lifecycle, held: false, busy: false,
      backendClosed: lifecycle !== 'OPEN', databaseOpen: lifecycle !== 'CLOSED',
      physicalCloseEntered: lifecycle === 'CLOSED', physicalCloseReturned: lifecycle === 'CLOSED',
    })),
    revoke: F(() => { trace.push('revoke'); lifecycle = 'REVOKED'; }),
    close: F(() => { trace.push('close'); lifecycle = 'CLOSED'; }),
  });
  const ports = F({ openFile: F(configuration => {
    assert.equal(configuration, fileConfiguration);
    trace.push('open');
    return owner;
  }) });
  return { trace, run: () => runApiCreditSignerInspectionOwner({
    fileConfiguration, expectedOriginal, ports, requireOpening: F(() => undefined),
  }) };
}

function requireHeld(value) {
  assert.throws(value.run, { stage: 'READ' });
  assert.deepEqual(value.trace, ['open', 'read', 'revoke']);
}

let settle;
const pending = new Promise(resolve => { settle = resolve; });
const pendingRead = fixture(() => pending);
requireHeld(pendingRead);
settle(null);
await Promise.resolve();
assert.deepEqual(pendingRead.trace, ['open', 'read', 'revoke']);

const rejected = fixture(() => Promise.reject(new Error('Declared read did not join')));
requireHeld(rejected);
await Promise.resolve();
assert.deepEqual(rejected.trace, ['open', 'read', 'revoke']);

let getterCalls = 0;
const opaque = Object.defineProperty({}, 'then', { get() { getterCalls++; } });
requireHeld(fixture(() => opaque));
assert.equal(getterCalls, 0);

const absent = fixture(() => null);
const result = absent.run();
assert.equal(result.status, 'NOT_RECORDED');
assert.equal(result.authority, 'NONE');
assert.equal(result.serializedCheckpoint, null);
assert.deepEqual(absent.trace, ['open', 'read', 'revoke', 'close']);

const refused = fixture(() => { throw new Error('Declared synchronous refusal'); });
assert.throws(refused.run, { stage: 'READ' });
assert.deepEqual(refused.trace, ['open', 'read', 'revoke', 'close']);

console.log(JSON.stringify({ qualification: 'SIGNER_INSPECTION_READ_RECEIPT_DATA', passed: 5,
  nativeDatabaseConnections: 0, keyOperations: 0, nativeProductExecutions: 0 }));
