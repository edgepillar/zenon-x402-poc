// Actual recovery core with declared memory-only client and reader callbacks.
// These controls do not open a store, transport, SDK, key or native owner.
import assert from 'node:assert/strict';
import { createServiceCreditCustodiedBackendRecoveryCore as create } from '../src/service-credit-custodied-backend-recovery-core.js';

const F = Object.freeze, cases = [];
function check(id, run) { cases.push({ id, run }); }
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  promise.catch(() => {});
  return { promise, resolve, reject };
}
function throwsSame(invoke, expected) {
  let threw = false;
  try { invoke(); } catch (value) { threw = true; assert.equal(value, expected); }
  assert.equal(threw, true);
}
function fixture(options = {}) {
  const s = { backendStops: 0, clientStops: 0, reads: 0, backendReads: 0,
    reentered: false, reentryError: null, reentryThrew: false };
  const pending = deferred();
  const backendError = Object.hasOwn(options, 'backendError') ? options.backendError : F(new TypeError('DECLARED_BACKEND_STOP'));
  const clientError = Object.hasOwn(options, 'clientError') ? options.clientError : F(new TypeError('DECLARED_CLIENT_STOP'));
  const receipt = Object.hasOwn(options, 'receipt') ? options.receipt : pending.promise;
  let connection;
  function reenter() {
    if (s.reentered) return;
    s.reentered = true;
    try { connection.close(); } catch (value) { s.reentryThrew = true; s.reentryError = value; }
  }
  const client = F({
    readOriginalRecoveryState: F(() => { s.reads++; return null; }),
    readOriginal: F(() => { s.reads++; return null; }),
    readOriginalRecoveryKeys: F(() => { s.reads++; return F([]); }),
    snapshot: F(() => F({ declaredOwner: true })),
    close: F(function closeClient() {
      assert.equal(arguments.length, 0); s.clientStops++;
      if (options.reentry === 'CLIENT') reenter();
      if (options.clientThrows) throw clientError;
      return receipt;
    }),
  });
  const backend = F({
    readExactOriginal: F(() => { s.backendReads++; assert.fail('UNEXPECTED_BACKEND_READ'); }),
    close: F(function closeBackend() {
      assert.equal(arguments.length, 0); s.backendStops++;
      if (options.reentry === 'BACKEND') reenter();
      if (options.backendThrows) throw backendError;
      return F({ status: 'CLOSED', declaredReaderOnly: true });
    }),
  });
  connection = create(client, backend, 'grant.declared.original', 'DECLARED_BORROWED_READER');
  return { connection, s, pending, receipt, backendError, clientError };
}
function stoppedOnce(f) {
  assert.equal(f.s.backendStops, 1); assert.equal(f.s.clientStops, 1);
  assert.equal(f.s.reads, 0); assert.equal(f.s.backendReads, 0);
}
function unavailable(f) {
  const view = f.connection.snapshot(); assert.equal(view.closed, true);
  assert.equal(view.unavailable, true); assert.equal(view.authority, 'NONE');
  assert.equal(view.serviceDelivery, 'NOT_ESTABLISHED');
}

check('recovery-core-close-clean-preserves-the-original-client-receipt', async () => {
  const f = fixture(), close = f.connection.close();
  assert.equal(close, f.receipt); stoppedOnce(f);
  f.pending.resolve(undefined); assert.equal(await close, undefined);
});
check('recovery-core-close-repeat-does-not-reenter-either-owner', async () => {
  const f = fixture(), close = f.connection.close();
  assert.equal(f.connection.close(), close); stoppedOnce(f);
  f.pending.resolve(undefined); await close;
  assert.equal(f.connection.close(), close); stoppedOnce(f);
});
check('recovery-core-close-backend-refusal-still-enters-the-known-client-stop', async () => {
  const f = fixture({ backendThrows: true });
  throwsSame(() => f.connection.close(), f.backendError); stoppedOnce(f); unavailable(f);
  f.pending.resolve(undefined); await f.receipt;
});
check('recovery-core-close-late-client-success-cannot-repair-the-backend-refusal', async () => {
  const f = fixture({ backendThrows: true });
  throwsSame(() => f.connection.close(), f.backendError); stoppedOnce(f);
  f.pending.resolve(undefined); await f.receipt;
  throwsSame(() => f.connection.close(), f.backendError); stoppedOnce(f); unavailable(f);
});
check('recovery-core-close-client-refusal-is-retained-without-a-second-stop', () => {
  const f = fixture({ clientThrows: true });
  throwsSame(() => f.connection.close(), f.clientError);
  throwsSame(() => f.connection.close(), f.clientError); stoppedOnce(f); unavailable(f);
});
check('recovery-core-close-two-refusals-preserve-the-first-failure', () => {
  const f = fixture({ backendThrows: true, clientThrows: true });
  throwsSame(() => f.connection.close(), f.backendError);
  throwsSame(() => f.connection.close(), f.backendError); stoppedOnce(f); unavailable(f);
});
for (const owner of ['BACKEND', 'CLIENT']) {
  check('recovery-core-close-' + owner.toLowerCase() + '-reentry-cannot-add-cleanup-authority', () => {
    const f = fixture({ reentry: owner });
    let caught;
    try { f.connection.close(); } catch (value) { caught = value; }
    assert.equal(f.s.reentryThrew, true); assert.notEqual(caught, undefined);
    assert.equal(caught, f.s.reentryError);
    throwsSame(() => f.connection.close(), caught); stoppedOnce(f); unavailable(f);
    f.pending.resolve(undefined);
  });
}
check('recovery-core-close-known-client-rejection-does-not-replace-the-first-failure', async () => {
  const f = fixture({ backendThrows: true });
  throwsSame(() => f.connection.close(), f.backendError); stoppedOnce(f);
  f.pending.reject(f.clientError); await assert.rejects(f.receipt, value => value === f.clientError);
  throwsSame(() => f.connection.close(), f.backendError); stoppedOnce(f); unavailable(f);
});
check('recovery-core-close-opaque-thenable-is-not-assimilated', () => {
  let getters = 0;
  const receipt = F(Object.defineProperty({}, 'then', { enumerable: true,
    get() { getters++; assert.fail('OPAQUE_CLOSE_RECEIPT_READ'); } }));
  const f = fixture({ backendThrows: true, receipt });
  throwsSame(() => f.connection.close(), f.backendError);
  throwsSame(() => f.connection.close(), f.backendError); stoppedOnce(f); unavailable(f);
  assert.equal(getters, 0);
});
check('recovery-core-close-opaque-proxy-is-not-inspected', () => {
  let traps = 0;
  const receipt = new Proxy({}, { get() { traps++; assert.fail('OPAQUE_CLOSE_RECEIPT_READ'); },
    getPrototypeOf() { traps++; assert.fail('OPAQUE_CLOSE_RECEIPT_PROTOTYPE'); },
    ownKeys() { traps++; assert.fail('OPAQUE_CLOSE_RECEIPT_KEYS'); } });
  const f = fixture({ backendThrows: true, receipt });
  throwsSame(() => f.connection.close(), f.backendError); stoppedOnce(f); unavailable(f);
  assert.equal(traps, 0);
});
check('recovery-core-close-clean-revokes-reads-without-a-backend-query', async () => {
  const f = fixture(), close = f.connection.close();
  assert.throws(() => f.connection.readOriginalBackendRecoveryState(), /CLOSED/);
  f.pending.resolve(undefined); await close; stoppedOnce(f);
});
check('recovery-core-close-undefined-backend-throw-remains-a-failure', () => {
  const f = fixture({ backendThrows: true, backendError: undefined });
  throwsSame(() => f.connection.close(), undefined);
  throwsSame(() => f.connection.close(), undefined); stoppedOnce(f); unavailable(f);
  f.pending.resolve(undefined);
});
check('recovery-core-close-undefined-client-throw-is-not-retried', () => {
  const f = fixture({ clientThrows: true, clientError: undefined });
  throwsSame(() => f.connection.close(), undefined);
  throwsSame(() => f.connection.close(), undefined); stoppedOnce(f); unavailable(f);
});

const results = []; let active = null, reported = false;
function report() {
  if (reported) return; reported = true;
  const failed = results.filter(row => row.status !== 'PASS').length;
  process.stdout.write(JSON.stringify({ qualification: 'G2_RECOVERY_CORE_CLOSE_LEGS_DATA',
    passed: results.length - failed, failed, cases: results, ports: 'DECLARED_MEMORY_ONLY',
    nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0,
    nonceSearches: 0, nodeChildren: 0, actualPrepare: 0,
    physicalRelease: 'NOT_ESTABLISHED', freshProcess: 'NOT_ESTABLISHED', G0G5Acceptance: 'OPEN' }) + '\n');
  if (failed) process.exitCode = 1;
}
function unsettled() {
  if (active !== null) { results.push({ id: active, status: 'FAIL', error: 'UNSETTLED_DECLARED_PROMISE' }); report(); }
}
process.once('beforeExit', unsettled);
for (const { id, run } of cases) {
  active = id;
  try { await run(); results.push({ id, status: 'PASS' }); }
  catch (value) { results.push({ id, status: 'FAIL', errorType: value?.name ?? 'UNKNOWN' }); }
  active = null;
}
process.off('beforeExit', unsettled); report();
