import assert from 'node:assert/strict';
import { setImmediate as turn } from 'node:timers/promises';
import { createOriginalFundingReadCloseCoordinator as create } from '../src/zenon/dynamic-plasma-original-funding-read-close.js';

const MODE = process.env.X402_READ_CLOSE_RETENTION_SELECTION;
assert.equal(process.version, 'v24.19.0'); assert.equal(typeof globalThis.gc, 'function');
assert.ok(['observe-original-retention-v1', 'require-closed-reference-release-v1'].includes(MODE));
const F = Object.freeze, rows = [];
let retainedCoordinator = null;
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  promise.catch(() => undefined);
  return { promise, resolve, reject };
}
function sourceCapabilities(read, operation, funding, permit) {
  // The returned resolver capabilities are created elsewhere. They cannot keep
  // this source-callback lexical environment alive as a test-fixture artifact.
  const source = { calls: 0, bytes: new Uint8Array(1024) };
  function touch() { source.calls++; assert.equal(source.bytes.byteLength, 1024); }
  const options = F({
    startReadClose: F(function startReadClose() { touch(); return read; }),
    snapshotOperation: F(function snapshotOperation() { touch(); return operation; }),
    closeFunding: F(function closeFunding() { touch(); return funding; }),
    canCloseFunding: F(function canCloseFunding() { touch(); return permit; }),
  });
  return { options, weak: [new WeakRef(source), ...Object.values(options).map(fn => new WeakRef(fn))] };
}
function fixture(kind) {
  const read = deferred(), operation = deferred(), funding = deferred();
  const captured = sourceCapabilities(read.promise,
    kind === 'operation-pending' ? operation.promise : null,
    kind === 'funding-alias' ? read.promise : funding.promise, kind !== 'guard-held');
  const join = create(captured.options);
  return { join: kind === 'discarded-control' ? null : join, weak: captured.weak,
    readResolve: read.resolve, readReject: read.reject, operationResolve: operation.resolve,
    fundingResolve: funding.resolve, fundingReject: funding.reject };
}
async function sample(f) {
  let alive = 5, passes = 0;
  for (; passes < 8; passes++) {
    await turn(); globalThis.gc();
    alive = f.weak.reduce((count, weak) => count + Number(weak.deref() !== undefined), 0);
    if (alive === 0) { passes++; break; }
  }
  if (f.join !== null) assert.equal(retainedCoordinator, f.join);
  return { observedLiveReferences: alive, observedCollectedReferences: 5 - alive, gcPasses: passes };
}
function unknown(error) { return error.code === 'original_funding_read_close_close_unknown'; }
for (const kind of ['discarded-control', 'open', 'read-pending', 'operation-pending',
  'funding-pending', 'guard-held', 'funding-alias', 'funding-rejected', 'closed']) {
  const f = fixture(kind); retainedCoordinator = f.join;
  let running = null;
  if (!['discarded-control', 'open'].includes(kind)) {
    running = f.join.start();
    assert.equal(f.join.start(), running);
    if (kind !== 'read-pending') f.readResolve(undefined);
    if (!['funding-pending', 'funding-rejected'].includes(kind)) f.fundingResolve(F({ status: 'CLOSED' }));
    if (kind === 'funding-rejected') f.fundingReject(undefined);
    for (let n = 0; n < 24; n++) await undefined;
    if (['guard-held', 'funding-alias', 'funding-rejected'].includes(kind)) {
      await assert.rejects(running, unknown); assert.equal(f.join.inspect().held, true);
    } else if (kind === 'closed') {
      assert.equal((await running).lifecycle, 'CLOSED');
    }
  }
  const observation = await sample(f);
  if (kind === 'discarded-control') assert.equal(observation.observedLiveReferences, 0);
  else if (kind === 'closed' && MODE === 'require-closed-reference-release-v1')
    assert.equal(observation.observedLiveReferences, 0);
  else assert.equal(observation.observedLiveReferences, 5);
  const phase = f.join === null ? 'DISCARDED_CONTROL' : f.join.inspect().lifecycle;
  rows.push({ kind, phase, ...observation });
  if (['read-pending', 'operation-pending', 'funding-pending'].includes(kind)) {
    f.readResolve(undefined); f.operationResolve(undefined); f.fundingResolve(F({ status: 'CLOSED' }));
    const final = await running;
    assert.equal(final.lifecycle, 'CLOSED'); assert.equal(final.nativeResourceCleanup, 'NOT_QUALIFIED');
    assert.equal(final.operationOutcome, 'NOT_ESTABLISHED'); assert.equal(final.authority, 'NONE');
    assert.equal(f.join.start(), running);
    const after = await sample(f);
    assert.equal(after.observedLiveReferences, MODE === 'require-closed-reference-release-v1' ? 0 : 5);
    rows.push({ kind: kind + '-after-close', phase: f.join.inspect().lifecycle, ...after });
  }
  if (phase === 'CLOSE_OUTCOME_UNKNOWN') {
    f.operationResolve(undefined); f.fundingResolve(F({ status: 'CLOSED' }));
    for (let n = 0; n < 24; n++) await undefined;
    await assert.rejects(f.join.start(), unknown);
    assert.equal(f.join.inspect().held, true);
  }
  retainedCoordinator = null;
}
console.log(JSON.stringify({ event: 'ORIGINAL_READ_CLOSE_RETENTION_ACTUAL_SOURCE_GC_DATA',
  mode: MODE, cases: rows.length, rows, gcIsObservationNotHardGuarantee: true,
  sourceCallbacksAndResultsAreDeclared: true, nativeApplications: 0, SDK: false,
  SQLite: false, sockets: false, signatures: false, nonce: false, storageRootRead: false,
  filesystemCleanup: false, nativeResourceCleanup: 'NOT_QUALIFIED', authority: 'NONE' }));
