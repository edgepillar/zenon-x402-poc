/* SOURCE ONLY / NOT EXECUTED. Five selected actual guarded-payer/V6 cases.
 * Native-resource guard callbacks below are declared DATA, not HTTPS owners.
 * No source/store/preflight substitute, signer, nonce, fetch or existing DB.
 * A separate reviewed scope/profile is required before these native imports.
 * New paths only; deliberate failures retain the genuine open stores until
 * process exit. No fallback close, reopen, retry, migration or cleanup claim.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

const ROOT = process.argv[2];
assert.equal(process.argv.length, 3);
assert.equal(process.env.X402_PAYER_NATIVE_CLOSE_GUARD_SELECTION, 'five-guarded-payer-cases-only');
assert.equal(process.env.X402_PAYER_NATIVE_CLOSE_GUARD_MODE, 'reviewed-new-v6-files');
assert.equal(ROOT, process.env.SPV_TASK_SCRATCH);
assert.ok(typeof ROOT === 'string' && isAbsolute(ROOT) && resolve(ROOT) === ROOT);
assert.equal(realpathSync(ROOT), ROOT);
const directory = lstatSync(ROOT);
assert.ok(directory.isDirectory() && !directory.isSymbolicLink());
assert.equal(directory.uid, process.getuid()); assert.equal(directory.mode & 0o777, 0o700);

const [{ createZenonFundingPostV1PayerRecoveryOwnerV2: OWNER,
  ZENON_FUNDING_PAYER_RECOVERY_OWNER_V2_CODES: CODES },
  { createZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6: CREATE_V6 }] = await Promise.all([
  import('../src/service-credit-zenon-funding-post-v1-payer-recovery-owner.js'),
  import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js'),
]);
const HELD = [], OPTIONS = { concurrency: false, timeout: 5000 };
const counts = { casesEntered: 0, casesCompleted: 0, newV6Stores: 0, guards: 0,
  fetchEntries: 0, recoveryTransactions: 0, storeCloseReturnedCases: 0,
  heldStores: 0, thenGetterEntries: 0, reentrantGuardCloses: 0 };
const labels = new Set(['clean-reentry', 'false-before-close', 'recovery-turns-unknown',
  'thenable-not-consumed', 'unknown-after-close-return']);
const fetchImpl = async () => { counts.fetchEntries++; throw new Error('FETCH_MUST_NOT_ENTER'); };
function create(label, testHooks) {
  assert.ok(labels.delete(label));
  const databasePath = join(ROOT, label + '.sqlite');
  for (const suffix of ['', '-journal', '-wal', '-shm'])
    assert.throws(() => lstatSync(databasePath + suffix), problem => problem.code === 'ENOENT');
  assert.ok(++counts.newV6Stores <= 5);
  const options = { databasePath, allowedRoot: ROOT, resourceUrl: 'https://resource.invalid/funding',
    custodyPolicy: { policyVersion: 1, maxRequests: 4,
      serviceResourceUrl: 'https://resource.invalid/service-credit/v1/execute' } };
  if (testHooks !== undefined) options.testHooks = testHooks;
  return CREATE_V6(options);
}
function hold(store) {
  if (!HELD.includes(store)) { HELD.push(store); counts.heldStores++; }
}
function guarded(store, callback) {
  const guard = Object.freeze(function guard() {
    assert.equal(arguments.length, 0); assert.equal(this, undefined);
    counts.guards++; return callback();
  });
  try { return OWNER({ store, deadlineMs: 200, fetchImpl, nativeResourceCloseGuard: guard }); }
  catch (cause) { hold(store); throw cause; }
}
async function held(owner, store) {
  const close = owner.close(); assert.equal(close, owner.close());
  await assert.rejects(close, { code: CODES.nativeResourceCloseUnknown });
  assert.equal(store.load(), null); // Exact new synthetic handle; no reopen.
  const state = owner.inspectClose();
  assert.equal(state.nativeGuardRefusal, 'BEFORE_STORE');
  assert.equal(state.storeCloseCallEntered, false); assert.equal(state.storeCloseCallReturned, false);
  assert.equal(state.closeRequested, true); assert.equal(state.quarantined, true);
  hold(store);
  await assert.rejects(owner.recover(), { code: CODES.quarantined });
  return Object.freeze({ close }); // Never assimilate the rejected close.
}
async function selected(name, callback) {
  let complete = false;
  await test(name, OPTIONS, async () => {
    counts.casesEntered++; await callback(); counts.casesCompleted++; complete = true;
  });
  if (!complete) throw new Error('GUARDED_PAYER_CASE_FAILED_NO_MORE_STORES');
}
await selected('guarded payer reserves cached close before guard reentry and checks both store-close boundaries', async () => {
  const store = create('clean-reentry');
  let owner, reentered = null, calls = 0;
  owner = guarded(store, () => {
    calls++;
    if (calls === 1) { reentered = owner.close(); counts.reentrantGuardCloses++; }
    return true;
  });
  try {
    const close = owner.close(); assert.equal(reentered, close); assert.equal(owner.close(), close);
    assert.deepEqual(await close, { status: 'CLOSED' }); assert.equal(calls, 2);
    const state = owner.inspectClose();
    assert.equal(state.nativeCloseStage, 'CLOSED'); assert.equal(state.nativeGuardRefusal, null);
    assert.equal(state.storeCloseCallEntered, true); assert.equal(state.storeCloseCallReturned, true);
    assert.throws(() => store.load(), { code: 'ZENON_FUNDING_PAYER_RECOVERY_STORE_CLOSED' });
    counts.storeCloseReturnedCases++;
  } finally { await owner.close().catch(() => { hold(store); }); }
});
await selected('false native guard vetoes genuine store close and late true cannot repair cached uncertainty', async () => {
  const store = create('false-before-close');
  let clean = false, calls = 0;
  const owner = guarded(store, () => { calls++; return clean; });
  try {
    const { close } = await held(owner, store); clean = true;
    assert.equal(owner.close(), close);
    await assert.rejects(close, { code: CODES.nativeResourceCloseUnknown });
    assert.equal(calls, 1); assert.equal(store.load(), null);
    assert.equal(owner.inspectClose().nativeGuardRefusal, 'BEFORE_STORE');
    assert.equal(owner.inspectClose().storeCloseCallEntered, false);
  } finally { hold(store); await owner.close().catch(() => undefined); }
});
await selected('guard is rechecked after actual V6 recovery join instead of trusting earlier close entry', async () => {
  let owner, closing, clean = true, before = 0, after = 0, calls = 0;
  const store = create('recovery-turns-unknown', {
    beforeCommit(name) {
      if (name !== 'recoverAfterRestart') return;
      before++; assert.equal(before, 1); assert.equal(after, 0); assert.equal(calls, 0);
      closing = owner.close(); closing.catch(() => undefined);
      assert.equal(owner.close(), closing); assert.equal(calls, 0);
    },
    afterCommit(name) {
      if (name !== 'recoverAfterRestart') return;
      after++; assert.equal(before, 1); assert.equal(after, 1); assert.equal(calls, 0);
      clean = false;
    },
  });
  owner = guarded(store, () => { calls++; assert.equal(after, 1); return clean; });
  try {
    const recovery = owner.recover();
    assert.equal(before, 1); assert.equal(after, 1);
    await assert.rejects(recovery, { code: CODES.closed });
    assert.equal(owner.close(), closing);
    await assert.rejects(closing, { code: CODES.nativeResourceCloseUnknown });
    assert.equal(calls, 1); assert.equal(store.load(), null);
    counts.recoveryTransactions++; hold(store);
  } finally { hold(store); await owner.close().catch(() => undefined); }
});
await selected('guard result thenable is rejected without reading then or closing the real store', async () => {
  const store = create('thenable-not-consumed');
  const thenable = Object.freeze(Object.defineProperty({}, 'then', { enumerable: true,
    get() { counts.thenGetterEntries++; throw new Error('THEN_GETTER_MUST_NOT_RUN'); } }));
  let calls = 0;
  const owner = guarded(store, () => { calls++; return thenable; });
  try {
    await held(owner, store); assert.equal(calls, 1); assert.equal(counts.thenGetterEntries, 0);
  } finally { hold(store); await owner.close().catch(() => undefined); }
});
await selected('post-return native uncertainty is not reported as successful close or an open HELD store', async () => {
  const store = create('unknown-after-close-return');
  let calls = 0;
  const owner = guarded(store, () => {
    calls++;
    if (calls === 1) return true;
    assert.throws(() => store.load(), { code: 'ZENON_FUNDING_PAYER_RECOVERY_STORE_CLOSED' });
    return false;
  });
  try {
    const close = owner.close(); assert.equal(owner.close(), close);
    await assert.rejects(close, { code: CODES.nativeResourceCloseUnknown });
    assert.equal(calls, 2); assert.equal(owner.close(), close);
    const state = owner.inspectClose();
    assert.equal(state.nativeGuardRefusal, 'AFTER_STORE'); assert.equal(state.quarantined, true);
    assert.equal(state.storeCloseCallEntered, true); assert.equal(state.storeCloseCallReturned, true);
    assert.throws(() => store.load(), { code: 'ZENON_FUNDING_PAYER_RECOVERY_STORE_CLOSED' });
    counts.storeCloseReturnedCases++;
  } finally { await owner.close().catch(() => undefined); }
});
assert.deepEqual(counts, { casesEntered: 5, casesCompleted: 5, newV6Stores: 5, guards: 7,
  fetchEntries: 0, recoveryTransactions: 1, storeCloseReturnedCases: 2,
  heldStores: 3, thenGetterEntries: 0, reentrantGuardCloses: 1 });
assert.equal(labels.size, 0);
console.log('# payer-native-resource-close-guard-v2 ' + JSON.stringify({ ...counts,
  sockets: 0, keys: 0, signatures: 0, nonceSearch: 0, realPrepare: 0,
  guardObservations: 'DECLARED_CALLBACK_DATA_NOT_NATIVE_TLS',
  nativePhysicalDrain: 'NOT_ESTABLISHED', fullDpGraph: false, authority: 'NONE' }));
