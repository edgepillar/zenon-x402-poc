// Actual recovery core with declared memory callbacks and fulfilled receipts.
// Prototype descriptors are restored synchronously before assertions/reporting.
// No store, SDK, transport, key, signature, nonce or native owner is acquired.
import assert from 'node:assert/strict';
import { createServiceCreditCustodiedBackendRecoveryCore as create } from '../src/service-credit-custodied-backend-recovery-core.js';

const F = Object.freeze, results = [];
const SOME = Object.getOwnPropertyDescriptor(Array.prototype, 'some');
const EVERY = Object.getOwnPropertyDescriptor(Array.prototype, 'every');
const SPECIES = Object.getOwnPropertyDescriptor(Promise, Symbol.species);
const DEFINE = Object.defineProperty;
const names = [
  'recovery-core-receipt-array-some-function-is-not-a-borrowed-hook',
  'recovery-core-receipt-array-some-getter-is-not-entered',
  'recovery-core-receipt-array-every-cannot-bypass-the-promise-species-guard',
];

function control(mode, facts) {
  const receipt = Promise.resolve(undefined);
  const original = F(new TypeError('DECLARED_BACKEND_STOP'));
  const client = F({
    readOriginalRecoveryState: F(() => null), readOriginal: F(() => null),
    readOriginalRecoveryKeys: F(() => F([])), snapshot: F(() => F({ declaredOwner: true })),
    close: F(() => { facts.clientStops++; return receipt; }),
  });
  const backend = F({ readExactOriginal: F(() => { throw new Error('UNEXPECTED_BACKEND_READ'); }),
    close: F(() => {
      facts.backendStops++;
      if (mode === 0) DEFINE(Array.prototype, 'some', { ...SOME,
        value: F(function (...args) { facts.arrayHooks++; return Reflect.apply(SOME.value, this, args); }) });
      else if (mode === 1) DEFINE(Array.prototype, 'some', { configurable: true,
        get: F(() => { facts.arrayHooks++; return SOME.value; }) });
      else {
        DEFINE(Array.prototype, 'every', { ...EVERY, value: F(() => { facts.arrayHooks++; return true; }) });
        DEFINE(Promise, Symbol.species, { ...SPECIES,
          get: F(() => { facts.speciesReads++; return Promise; }) });
      }
      throw original;
    }),
  });
  const core = create(client, backend, 'grant.declared.original', 'DECLARED_BORROWED_READER');
  let caught, threw = false;
  try {
    try { core.close(); } catch (value) { threw = true; caught = value; }
  } finally {
    DEFINE(Array.prototype, 'some', SOME);
    DEFINE(Array.prototype, 'every', EVERY);
    DEFINE(Promise, Symbol.species, SPECIES);
  }
  assert.equal(threw, true); assert.equal(caught, original);
  assert.equal(facts.backendStops, 1); assert.equal(facts.clientStops, 1);
  assert.equal(facts.arrayHooks, 0); assert.equal(facts.speciesReads, 0);
  const snapshot = core.snapshot();
  assert.equal(snapshot.closed, true); assert.equal(snapshot.unavailable, true);
  assert.equal(snapshot.authority, 'NONE');
  let repeat, repeatThrew = false;
  try { core.close(); } catch (value) { repeatThrew = true; repeat = value; }
  assert.equal(repeatThrew, true); assert.equal(repeat, original);
  assert.equal(facts.backendStops, 1); assert.equal(facts.clientStops, 1);
}

for (let mode = 0; mode < names.length; mode++) {
  const observed = { backendStops: 0, clientStops: 0, arrayHooks: 0, speciesReads: 0 };
  try { control(mode, observed); results.push({ id: names[mode], status: 'PASS', observed }); }
  catch (value) { results.push({ id: names[mode], status: 'FAIL', observed, errorType: value?.name ?? 'UNKNOWN' }); }
}
const failed = results.filter(row => row.status !== 'PASS').length;
process.stdout.write(JSON.stringify({ qualification: 'G2_RECOVERY_CORE_RECEIPT_INTRINSICS_DATA',
  passed: results.length - failed, failed, cases: results, ports: 'DECLARED_MEMORY_ONLY',
  nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0,
  nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, physicalRelease: 'NOT_ESTABLISHED',
  G0G5Acceptance: 'OPEN' }) + '\n');
if (failed) process.exitCode = 1;
