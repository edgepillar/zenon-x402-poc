// Actual command-session/host/codecs over declared client and channel DATA.
// The existing component close monitor uses cooperative Node timers. No signal,
// launcher, pipe, SDK, SQL, key, signature, socket or payment is executed.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { createApiCreditOperatorCoordinator as create } from '../src/api-credit-operator-coordinator.js';
import { captureApiCreditCliArguments as capture } from '../src/api-credit-cli-arguments.js';
import { createBuyerApiCreditFundingCommandSession as session } from '../src/buyer-original-funding-command-session.js';
import { runBuyerOriginalCommandHost as host } from '../src/buyer-original-command-host.js';
import { encodeBuyerApiCreditCommand as encode } from '../src/buyer-original-funding-command.js';
import { apiCreditOperatorDataFixtures as fixtures, closeApiCreditOperatorDataFixtures as closeFixtures } from './api-credit-operator.behavior.mjs';

const F = Object.freeze, checks = [];
function check(id, run) { checks.push(F({ id, run })); }
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
async function flush() { for (let i = 0; i < 48; i++) await Promise.resolve(); }
function configuration(f) {
  return { arguments: capture(['--profile-fd', '3', '--key-fd', '4', '--input-fd', '5', '--output-fd', '6', '--bootstrap-ms', '1000']), ports: F(f.ports) };
}
function held(r) {
  assert.equal(r.status, 'CLOSE_UNKNOWN'); assert.equal(r.exitCode, 4);
  assert.equal(r.authority, 'NONE'); assert.equal(r.automaticRetry, false);
  assert.equal(r.nativeResourceRelease, 'NOT_ESTABLISHED');
}
function command(operation) {
  const input = operation === 'commit' || operation === 'submitFunding' ? { expectedPins: {} }
    : operation === 'handoff' ? { originalPayment: 'declared', selectedGrantId: 'declared', paymentRequiredHeader: 'declared' }
    : operation === 'submitService' ? { grantId: 'declared', requestId: 'declared', originalRequestJson: '{}',
      originalBodyBase64: '', serviceResourceUrl: 'https://service.invalid/data', authorizationHeader: 'declared' } : {};
  return encode({ version: 1, id: 'queued-' + operation, operation, input }).slice(0, -1);
}

export function commandAdmissionFixture() {
  const read = deferred(), calls = { read: 0, write: 0, operation: 0, clientClose: 0, channelClose: 0 };
  let clientClosed = false, channelClosed = false, reading = false;
  const enter = F(() => { calls.operation++; return Promise.reject(Error('declared method has no economic implementation')); });
  const client = F({ prepareOriginalFunding: enter, commitOriginalFunding: enter, submitOriginalFunding: enter,
    handoffToService: enter, submitOriginal: enter,
    close: F(() => { calls.clientClose++; clientClosed = true; return Promise.resolve(undefined); }),
    inspect: F(() => F({ sdk105FundingServiceLifecycleVersion: 1, phase: 'DECLARED', lifecycle: clientClosed ? 'CLOSED' : 'OPEN', held: false, publicOperationActive: false })) });
  const channel = F({
    readCommand: F(() => { calls.read++; reading = true; return read.promise; }),
    writeResult: F(() => { calls.write++; return Promise.resolve(undefined); }),
    close: F(() => { calls.channelClose++; channelClosed = true; reading = false; read.resolve(null); return Promise.resolve(undefined); }),
    inspect: F(() => F({ buyerCommandLineChannelVersion: 1, lifecycle: channelClosed ? 'CLOSED' : 'OPEN', held: false, reading, writing: false }))
  });
  const f = fixtures.declaredOperator({ openSession: r => {
    r.selection.release(); r.session = session({ client, channel, limits: r.selectedLimits }); return Promise.resolve(r.session);
  }, host: r => host(r.session) });
  f.controller = create(configuration(f));
  return { f, calls, resolveRead: value => { reading = false; read.resolve(value); } };
}

// The baseline wrapper uses this SAME fixture and canonical import graph against
// the protected previous source. It is separate evidence, not a passing control.
export async function observeQueuedCommand(operation, stop = true) {
  const h = commandAdmissionFixture(), out = h.f.controller.run();
  await flush(); assert.equal(h.calls.read, 1); assert.equal(h.f.session.inspect().activeKind, 'READ');
  h.resolveRead(command(operation));
  if (stop) h.f.controller.requestStop();
  const closeRequestedBeforeYield = h.f.session.inspect().closeRequested;
  const result = await out; await flush();
  return { ...h, out, result, closeRequestedBeforeYield };
}

for (const operation of ['prepare', 'commit', 'submitFunding', 'handoff', 'submitService']) {
  check('buyer-stop-fences-queued-' + operation + '-before-method-entry', async () => {
    const h = await observeQueuedCommand(operation); held(h.result);
    assert.equal(h.closeRequestedBeforeYield, true); assert.equal(h.calls.operation, 0);
    assert.equal(h.f.session.inspect().admittedOperations, 0); assert.equal(h.calls.write, 0);
    assert.equal(h.calls.clientClose, 1); assert.equal(h.calls.channelClose, 1);
    h.f.controller.requestStop(); assert.equal(h.f.controller.run(), h.out);
    assert.equal(h.calls.clientClose, 1); assert.equal(h.calls.channelClose, 1);
  });
}
check('buyer-stop-before-read-completion-revokes-the-same-session-synchronously', async () => {
  const h = commandAdmissionFixture(), out = h.f.controller.run(); await flush();
  h.f.controller.requestStop(); assert.equal(h.f.session.inspect().closeRequested, true);
  h.resolveRead(command('prepare')); held(await out); assert.equal(h.calls.operation, 0);
  assert.equal(h.calls.clientClose, 1); assert.equal(h.calls.channelClose, 1);
});
check('buyer-stop-without-stop-keeps-explicit-command-admission', async () => {
  const h = await observeQueuedCommand('prepare', false);
  // The declared method deliberately rejects; method entry, not payment, is the assertion.
  held(h.result); assert.equal(h.calls.operation, 1); assert.equal(h.f.session.inspect().admittedOperations, 1);
});

function pendingHostFixture(edit = null) {
  const receipt = deferred(), f = fixtures.declaredOperator({ host: () => receipt.promise });
  if (edit) edit(f); f.controller = create(configuration(f)); return { f, receipt };
}
check('buyer-stop-caches-one-session-stop-before-reentrant-close-callback', async () => {
  let entries = 0;
  const { f } = pendingHostFixture(r => { r.session = F({ close: F(() => {
    entries++; r.controller.requestStop(); return Promise.resolve(undefined);
  }), inspect: F(() => F({ declaredSession: true })) }); });
  const out = f.controller.run(); await flush(); f.controller.requestStop();
  assert.equal(entries, 1); held(await out); assert.equal(entries, 1); assert.equal(f.calls.inputs, 1);
});
check('buyer-stop-uses-only-remaining-original-close-window', async () => {
  const { f } = pendingHostFixture(r => { r.session = F({ close: F(() => {
    r.now += 200000001n; return Promise.resolve(undefined);
  }), inspect: F(() => F({ declaredSession: true })) }); });
  const out = f.controller.run(); await flush(); f.controller.requestStop(); held(await out);
  assert.deepEqual(f.timers.map(t => t.budget), [1000, 50]); assert.ok(f.timers.every(t => t.cancelled));
});
check('buyer-stop-does-not-rearm-an-exhausted-close-window', async () => {
  const { f } = pendingHostFixture(r => { r.session = F({ close: F(() => {
    r.now += 250000000n; return Promise.resolve(undefined);
  }), inspect: F(() => F({ declaredSession: true })) }); });
  const out = f.controller.run(); await flush(); f.controller.requestStop(); const result = await out; held(result);
  assert.equal(result.knownStopsObserved, false); assert.deepEqual(f.timers.map(t => t.budget), [1000]);
  assert.equal(f.calls.keyStop, 1); assert.equal(f.calls.inputs, 1);
});
check('buyer-stop-clock-refusal-still-revokes-session-without-a-new-window', async () => {
  let refuse = false;
  const { f } = pendingHostFixture(r => { r.ports.clock = F(() => { if (refuse) throw Error('declared clock refusal'); return r.now; }); });
  const out = f.controller.run(); await flush(); refuse = true; f.controller.requestStop();
  assert.equal(f.calls.sessionStop, 1); const result = await out; held(result);
  assert.equal(result.knownStopsObserved, false); assert.deepEqual(f.timers.map(t => t.budget), [1000]);
  assert.equal(f.calls.keyStop, 1); assert.equal(f.calls.inputs, 1);
});
check('buyer-stop-throwing-session-close-is-not-repeated-by-finally', async () => {
  let entries = 0;
  const { f } = pendingHostFixture(r => { r.session = F({ close: F(() => {
    entries++; throw Error('declared close refusal');
  }), inspect: F(() => F({ declaredSession: true })) }); });
  const out = f.controller.run(); await flush(); f.controller.requestStop(); assert.equal(entries, 1);
  held(await out); f.controller.requestStop(); assert.equal(entries, 1); assert.equal(f.calls.inputs, 1);
});
check('buyer-stop-late-host-completion-does-not-repair-command-revocation', async () => {
  const { f, receipt } = pendingHostFixture(), out = f.controller.run(); await flush(); f.controller.requestStop();
  const result = await out; held(result); const before = { ...f.calls };
  receipt.resolve(F({ buyerOriginalCommandHostResultVersion: 1 })); await flush();
  held(result); assert.deepEqual(f.calls, before); assert.equal(f.controller.run(), out);
});

export const buyerStopCommandAdmissionDataCases = F([...checks]);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases = []; let current = null, reported = false;
  function report() {
    if (reported) return; reported = true; const failed = cases.filter(c => c.status === 'FAIL').length;
    console.log(JSON.stringify({ qualification: 'G2_BUYER_STOP_COMMAND_ADMISSION_DATA', passed: cases.length - failed, failed, cases,
      actualCommandSessionHostAndCodecs: true, declaredClientAndChannel: true, componentCooperativeTimers: true,
      nativeExecutions: 0, SDK: 0, SQLite: 0, signals: 0, keys: 0, signatures: 0, sockets: 0,
      nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0, physicalRelease: 'NOT_ESTABLISHED', G0G5Acceptance: 'OPEN' }));
    if (failed) process.exitCode = 1;
  }
  process.once('beforeExit', () => { if (cases.length !== checks.length) { cases.push({ id: current ?? 'incomplete', status: 'FAIL', error: 'UNSETTLED_DATA_PROMISE' }); report(); process.exitCode = 1; } });
  for (const c of checks) { current = c.id; try { await c.run(); cases.push({ id: c.id, status: 'PASS' }); } catch { cases.push({ id: c.id, status: 'FAIL', error: 'DATA_ASSERTION' }); } }
  await closeFixtures(); report();
}
