// Actual recovery application with declared memory-only client/custody ports.
// No SDK/core, SQL, network, keys, signing, nonce search or native CLI.
import assert from 'node:assert/strict';
import { createApiCreditFundingGrantRecoveryApplication } from '../src/api-credit-funding-grant-recovery-application.js';

const F = Object.freeze, cases = [];
function check(id, run) { cases.push({ id, run }); }
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const input = F({ originalRequest: '{"requestId":"retained.original","body":"same-bytes"}' });
const receipt = F({ phase: 'DECLARED_RECORDED_RESULT', originalRequest: input.originalRequest });

function fixture({ completion = null, borrowed = null, pending = false } = {}) {
  const s = { calls: 0, closes: 0, reads: 0, current: 0, injected: false, completing: false, lifecycle: 'OPEN' };
  const result = deferred(); let root, closing = null, nested = null, closesInside = null;
  const child = {};
  for (const name of ['prepareOriginalFunding', 'commitOriginalFunding', 'submitOriginalFunding', 'handoffToService']) {
    child[name] = F(function unexpected() { throw new TypeError('UNEXPECTED_DECLARED_OPERATION'); });
  }
  child.submitOriginal = F(function submit(value) {
    assert.equal(arguments.length, 1); assert.equal(value, input); s.calls++; s.completing = true;
    return pending ? result.promise : Promise.resolve(receipt);
  });
  child.close = F(function close() {
    assert.equal(arguments.length, 0); s.closes++; s.lifecycle = 'CLOSED'; return Promise.resolve(undefined);
  });
  child.inspect = F(function inspect() {
    assert.equal(arguments.length, 0);
    const view = { lifecycle: s.lifecycle, held: false, publicOperationActive: false };
    if (s.completing && !s.injected) {
      s.injected = true;
      if (completion !== null) completion(view);
      if (borrowed === 'close') {
        closing = root.close(); closing.catch(() => {}); closesInside = s.closes;
      } else if (borrowed === 'operation') {
        nested = root.submitOriginal(input); nested.catch(() => {});
      }
    }
    return F(view);
  });
  root = createApiCreditFundingGrantRecoveryApplication(F({
    application: F(child), paymentId: 'payment.retained.original',
    fundingResourceUrl: 'https://service.example.test/funding',
    custody: F({
      retain: F(function retain() { throw new TypeError('UNEXPECTED_CUSTODY_WRITE'); }),
      read: F(function read() { s.reads++; throw new TypeError('UNEXPECTED_CUSTODY_READ'); }),
      assertCurrent: F(function current() { s.current++; throw new TypeError('UNEXPECTED_CUSTODY_CURRENT'); }),
    }),
  }));
  return { root, s, result, closing: () => closing, nested: () => nested, closesInside: () => closesInside };
}

function held(f) {
  const v = f.root.inspect(); assert.equal(v.held, true); assert.equal(v.lifecycle, 'HELD');
  assert.equal(v.grantQueryRecovery.active, false);
  assert.equal(f.s.calls, 1); assert.equal(f.s.reads, 0); assert.equal(f.s.current, 0);
}
async function refusal(options) {
  const f = fixture(options);
  await assert.rejects(f.root.submitOriginal(input)); held(f);
  // Correcting the later view cannot admit another original dispatch.
  await assert.rejects(f.root.submitOriginal(input)); held(f);
  assert.equal(f.s.closes, 0); return f;
}

check('recovery-completion-open-idle-child-delivers-the-original-receipt', async () => {
  const f = fixture(); assert.equal(await f.root.submitOriginal(input), receipt);
  assert.equal(f.s.calls, 1); assert.equal(f.root.inspect().held, false);
  const close = f.root.close(); assert.equal(f.root.close(), close); await close;
  assert.equal(f.s.closes, 1);
});
for (const lifecycle of ['CLOSING', 'CLOSED', 'REVOKED', 'HELD']) {
  check('recovery-completion-refuses-child-' + lifecycle.toLowerCase() + '-without-another-dispatch', () =>
    refusal({ completion: view => { view.lifecycle = lifecycle; } }));
}
for (const [label, value] of [['busy', true], ['unknown-activity', null], ['nonboolean-activity', 'false']]) {
  check('recovery-completion-refuses-' + label + '-child', () =>
    refusal({ completion: view => { view.publicOperationActive = value; } }));
}
check('recovery-completion-refuses-missing-child-activity-observation', () =>
  refusal({ completion: view => { delete view.publicOperationActive; } }));
check('recovery-completion-refuses-child-lifecycle-accessor-without-reading-it', async () => {
  let getters = 0;
  await refusal({ completion: view => {
    Object.defineProperty(view, 'lifecycle', { enumerable: true, get() { getters++; return 'OPEN'; } });
  } });
  assert.equal(getters, 0);
});
check('recovery-completion-reentrant-close-withholds-success-and-defers-child-close', async () => {
  const f = fixture({ borrowed: 'close' }); await assert.rejects(f.root.submitOriginal(input));
  await assert.rejects(f.closing()); held(f);
  assert.equal(f.closesInside(), 0); assert.equal(f.s.closes, 1);
  assert.equal(f.root.close(), f.closing()); await assert.rejects(f.root.close());
  assert.equal(f.s.closes, 1); await assert.rejects(f.root.submitOriginal(input)); held(f);
});
check('recovery-completion-reentrant-operation-cannot-borrow-the-child-twice', async () => {
  const f = fixture({ borrowed: 'operation' }); assert.equal(await f.root.submitOriginal(input), receipt);
  await assert.rejects(f.nested()); assert.equal(f.s.calls, 1); assert.equal(f.root.inspect().held, false);
  await f.root.close(); assert.equal(f.s.closes, 1);
});
check('recovery-completion-late-child-success-cannot-repair-a-stopped-parent', async () => {
  const f = fixture({ pending: true }), operation = f.root.submitOriginal(input); operation.catch(() => {});
  const close = f.root.close(); close.catch(() => {});
  f.result.resolve(receipt); await assert.rejects(operation); await assert.rejects(close);
  held(f); assert.equal(f.root.close(), close); assert.equal(f.s.closes, 1);
});

const results = []; let active = null, reported = false;
function report() {
  if (reported) return; reported = true;
  const failed = results.filter(row => row.status !== 'PASS').length;
  process.stdout.write(JSON.stringify({ qualification: 'G2_RECOVERY_COMPLETION_ADMISSION_DATA',
    passed: results.length - failed, failed, cases: results, ports: 'DECLARED_MEMORY_ONLY',
    nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0,
    nodeChildren: 0, actualPrepare: 0, freshProcess: 'NOT_ESTABLISHED', physicalRelease: 'NOT_ESTABLISHED' }) + '\n');
  if (failed) process.exitCode = 1;
}
function unsettled() {
  if (active !== null) { results.push({ id: active, status: 'FAIL', error: 'UNSETTLED_DECLARED_PROMISE' }); report(); }
}
process.once('beforeExit', unsettled);
for (const { id, run } of cases) {
  active = id;
  try { await run(); results.push({ id, status: 'PASS' }); }
  catch (error) { results.push({ id, status: 'FAIL', errorType: error?.name ?? 'UNKNOWN' }); }
  active = null;
}
process.off('beforeExit', unsettled); report();
