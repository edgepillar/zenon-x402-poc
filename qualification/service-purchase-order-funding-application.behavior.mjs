import assert from 'node:assert/strict';
import {
  capturePurchasedOrderFundingApplicationSelection as capture,
  capturePurchasedOrderFundingApplicationRecoveryRecord as record,
  purchasedOrderFundingApplicationRecoveryDigest as digest,
  purchasedOrderFundingSelectionFromRecovery as restore,
  createPurchasedOrderFundingApplicationCore as application,
} from '../src/service-purchase-order-funding-application-core.js';
import { createServiceCreditApplicationDeadlineOwnerCore as deadlineOwner } from '../src/service-credit-application-deadline-owner-core.js';
import { capturePurchasedOrderPayment } from '../src/service-purchase-order-funding.js';
import {
  inspectPurchasedOrderFundingEnvelope as envelope,
  requirePurchasedOrderFundingEnvelopeTransition as transition,
} from '../src/service-purchase-order-funding-cas-contract.js';
import { orderFundingFixture as fixture, orderFundingOwnerInputs as inputs, orderFundingProof as proof, NOW } from './service-purchase-order-funding.fixture.mjs';

// Actual application, owner, checkpoint, CAS and deadline cores. The backend,
// authenticator and timer actuators are synthetic and perform no native I/O.
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
async function drain() { for (let i = 0; i < 16; i++) await Promise.resolve(); }
async function stopped(app) { try { await app.close(); } catch { assert.equal(app.snapshot().phase, 'HELD'); } }
function harness() {
  const f = fixture(), p = capturePurchasedOrderPayment(...inputs(f));
  const counts = { reads: 0, cas: 0, commits: 0, verifies: 0, backendCloses: 0 }, rows = new Map(), scopes = new Map();
  let afterWrite = null, verifier = () => Promise.resolve(f.verifiedRecord), clock = () => NOW + 30000;
  const backend = {
    readEnvelope(orderId, scope) { counts.reads++; const raw = rows.get(orderId) ?? null; return raw === null || envelope(raw).paymentScope === scope ? raw : null; },
    compareAndSwapEnvelope(orderId, scope, expected, proposed) {
      counts.cas++; transition(expected, proposed);
      if ((rows.get(orderId) ?? null) !== expected || (scopes.has(scope) && scopes.get(scope) !== orderId)) return null;
      if (proposed !== expected) { rows.set(orderId, proposed); scopes.set(scope, orderId); counts.commits++; }
      afterWrite?.(proposed); return proposed;
    },
    close() { counts.backendCloses++; },
  };
  function selection(ownerId = 'worker.1', expectedEnvelopeJson = null, maximumVerificationAttempts = 3) {
    return capture({ purchase: Object.fromEntries(['termsJson', 'termsDigest', 'paymentCheckpointJson', 'paymentPinsJson', 'fundingContextJson'].map((key, i) => [key, inputs(f)[i]])),
      ownership: { storeId: 'store.order.synthetic', ownerId, expectedEnvelopeJson }, maximumVerificationAttempts, closeBudgetMs: 10 });
  }
  function create(selected = selection(), mode = {}) {
    const timers = []; let time = 0n, reads = 0;
    const deadlines = deadlineOwner({ maxScheduleStarts: 1, maxConcurrentTimers: 1, maxDelayMs: 10,
      armTimer(wake, ms) { const handle = { wake, ms, cancelled: false }; timers.push(handle); if (mode.earlyArm) wake(); if (mode.armThrows) throw Error('synthetic arm failure'); return handle; },
      cancelTimer(handle) { handle.cancelled = true; if (mode.cancelAdvances) time = 10000000n; if (mode.cancelBoolean) return true; if (mode.cancelThrows) throw Error('synthetic cancel failure'); },
      readMonotonicTime() { reads++; return mode.rewind && reads > 1 ? -1n : time; } });
    if (mode.nonFresh) deadlines.serviceRuntime.schedule(() => {}, 1);
    const app = application({ selection: selected, backend, deadlines,
      verifyFundingEvidence: value => { counts.verifies++; return verifier(value); }, clock: () => clock() });
    return { app, deadlines, timers, setTime(value) { time = value; }, wake() { assert.equal(timers.length, 1); timers[0].wake(); } };
  }
  return { f, p, backend, counts, selection, create, raw: () => rows.get(p.orderId) ?? null,
    set afterWrite(value) { afterWrite = value; }, set verifier(value) { verifier = value; }, set clock(value) { clock = value; } };
}
const checks = [];
function check(id, run) { checks.push({ id, run }); }

check('construction-and-prestart-refusals-perform-no-backend-or-verifier-work', async () => {
  const h = harness(), { app } = h.create(); assert.equal(app.snapshot().phase, 'CREATED');
  assert.throws(() => app.readFunding(), /NOT_STARTED/); await assert.rejects(app.verifyFunding(proof()), /NOT_STARTED/);
  assert.equal(h.counts.cas + h.counts.reads + h.counts.verifies, 0); await stopped(app);
  assert.equal(app.snapshot().phase, 'CLOSED'); assert.equal(h.counts.backendCloses, 0);
});
check('startup-retains-independent-original-before-authentication', async () => {
  const h = harness(), { app } = h.create(), view = app.start();
  assert.equal(view.phase, 'RETAINED'); assert.equal(envelope(h.raw()).epoch, 1); assert.equal(envelope(h.raw()).revision, 2);
  assert.equal(JSON.parse(envelope(h.raw()).receiptJson).paymentRecordJson, h.p.paymentRecordJson);
  h.verifier = () => { assert.equal(JSON.parse(envelope(h.raw()).receiptJson).phase, 'VERIFYING'); return Promise.resolve(h.f.verifiedRecord); };
  assert.equal((await app.verifyFunding(proof())).phase, 'VERIFIED'); await stopped(app);
});
check('verified-expired-order-keeps-liability-without-inventing-grant-or-payment-time', async () => {
  const h = harness(), { app } = h.create(); app.start(); const v = await app.verifyFunding(proof());
  assert.equal(v.offerExpired, true); assert.equal(v.quantityOwed, 10); assert.equal(v.grantFundingUnits, 27);
  assert.equal(v.paymentAtMs, null); assert.equal(v.paymentWasLate, null); assert.equal(v.grantCreated, false);
  assert.equal(v.deliveryStatus, 'NOT_ESTABLISHED'); assert.equal(v.liability, 'DELIVERY_OR_COMPENSATION_OWED'); await stopped(app);
});
check('verified-startup-recovery-uses-new-epoch-and-never-authenticates-again', async () => {
  const h = harness(), a = h.create(); a.app.start(); await a.app.verifyFunding(proof());
  const retained = a.app.exportRecoveryRecord(), old = envelope(h.raw()); await stopped(a.app);
  h.verifier = () => assert.fail('recovery must not call verifier');
  const b = h.create(restore(retained.recordJson, retained.recordDigest, 'worker.2')); const v = b.app.start();
  assert.equal(v.quantityOwed, 10); assert.equal(envelope(h.raw()).epoch, old.epoch + 1);
  assert.equal(envelope(h.raw()).receiptJson, old.receiptJson); assert.equal(h.counts.verifies, 1); await stopped(b.app);
});
check('stale-selected-envelope-refuses-without-read-refresh-or-claim-retry', async () => {
  const h = harness(), a = h.create(); a.app.start(); const old = h.raw();
  const b = h.create(h.selection('worker.2', old)); b.app.start(); const before = { ...h.counts }, retained = h.raw();
  const c = h.create(h.selection('worker.3', old)); assert.throws(() => c.app.start(), /STARTUP_UNKNOWN/);
  assert.equal(h.counts.cas, before.cas + 1); assert.equal(h.counts.reads, before.reads); assert.equal(h.raw(), retained);
  assert.equal(c.app.snapshot().phase, 'HELD'); await stopped(a.app); await stopped(b.app); await stopped(c.app);
});
check('same-worker-name-recovery-still-fences-the-previous-epoch', async () => {
  const h = harness(), a = h.create(); a.app.start(); const old = h.raw();
  const b = h.create(h.selection('worker.1', old)); b.app.start();
  assert.equal(envelope(h.raw()).epoch, 2); await assert.rejects(a.app.verifyFunding(proof()), /VERIFICATION_UNKNOWN/);
  assert.equal(h.counts.verifies, 0); assert.equal(a.app.snapshot().phase, 'HELD'); await stopped(a.app); await stopped(b.app);
});
check('independent-original-pin-conflict-is-rejected-before-startup-cas', () => {
  const h = harness(), s = h.selection(), pin = JSON.parse(s.purchase.paymentPinsJson); pin.digests.context = 'f'.repeat(64);
  assert.throws(() => capture({ ...s, purchase: { ...s.purchase, paymentPinsJson: JSON.stringify(pin) } }));
  assert.equal(h.counts.cas + h.counts.reads, 0);
});
check('selected-receipt-cannot-change-attempt-budget-or-original-order', async () => {
  const h = harness(), a = h.create(); a.app.start(); const selected = h.selection('worker.2', h.raw());
  assert.throws(() => capture({ ...selected, maximumVerificationAttempts: 2 }), /ORIGINAL_CONFLICT/);
  const foreign = fixture('order.foreign');
  assert.throws(() => capture({ ...selected, purchase: { ...selected.purchase, termsJson: foreign.termsJson, termsDigest: foreign.termsDigest, fundingContextJson: foreign.fundingContextJson } }));
  await stopped(a.app);
});
check('recovery-requires-separate-selected-digest-before-parse', () => {
  const h = harness(), selected = h.selection(), r = record(selected, null);
  assert.equal(r.authority, 'NONE'); assert.equal(digest(r.recordJson), r.recordDigest);
  assert.throws(() => restore(r.recordJson, 'sha256:' + 'f'.repeat(64), 'worker.2'), /RECOVERY_PIN_CONFLICT/);
  assert.throws(() => restore('{', r.recordDigest, 'worker.2'), /RECOVERY_PIN_CONFLICT/);
  assert.equal(restore(r.recordJson, r.recordDigest, 'worker.2').ownership.expectedEnvelopeJson, null);
  assert.equal(h.counts.cas + h.counts.reads, 0);
});
check('lost-claim-ack-holds-and-retains-committed-epoch-with-no-automatic-work', async () => {
  const h = harness(), a = h.create(); h.afterWrite = () => { throw Error('synthetic acknowledgement loss'); };
  assert.throws(() => a.app.start(), /STARTUP_UNKNOWN/); assert.equal(envelope(h.raw()).epoch, 1);
  assert.equal(h.counts.cas, 1); assert.equal(h.counts.reads, 0); assert.equal(h.counts.verifies, 0);
  const r = a.app.exportRecoveryRecord(); h.afterWrite = null; await stopped(a.app);
  const b = h.create(restore(r.recordJson, r.recordDigest, 'worker.2')); assert.equal(b.app.start().phase, 'RETAINED'); await stopped(b.app);
});
check('lost-initial-receipt-ack-recovers-exact-original-without-authentication', async () => {
  const h = harness(), a = h.create();
  h.afterWrite = raw => { if (envelope(raw).receiptJson !== null) throw Error('synthetic receipt acknowledgement loss'); };
  assert.throws(() => a.app.start(), /STARTUP_UNKNOWN/); const before = envelope(h.raw()).receiptJson, r = a.app.exportRecoveryRecord();
  h.afterWrite = null; await stopped(a.app); const b = h.create(restore(r.recordJson, r.recordDigest, 'worker.2'));
  assert.equal(b.app.start().phase, 'RETAINED'); assert.equal(envelope(h.raw()).receiptJson, before); assert.equal(h.counts.verifies, 0); await stopped(b.app);
});
check('lost-verified-ack-recovers-verified-liability-without-new-proof', async () => {
  const h = harness(), a = h.create(); a.app.start();
  h.afterWrite = raw => { if (JSON.parse(envelope(raw).receiptJson ?? '{}').phase === 'VERIFIED') throw Error('synthetic verified acknowledgement loss'); };
  await assert.rejects(a.app.verifyFunding(proof()), /VERIFICATION_UNKNOWN/); const before = envelope(h.raw()).receiptJson;
  const r = a.app.exportRecoveryRecord(); h.afterWrite = null; await stopped(a.app);
  const b = h.create(restore(r.recordJson, r.recordDigest, 'worker.2')); assert.equal(b.app.start().quantityOwed, 10);
  assert.equal(envelope(h.raw()).receiptJson, before); assert.equal(h.counts.verifies, 1); await stopped(b.app);
});
check('concurrent-busy-refusal-does-not-clear-the-original-active-verification', async () => {
  const h = harness(), gate = deferred(), a = h.create(); h.verifier = () => gate.promise; a.app.start();
  const first = a.app.verifyFunding(proof()); await assert.rejects(a.app.verifyFunding(proof()), /BUSY/);
  assert.equal(a.app.snapshot().verificationActive, true); assert.throws(() => a.app.readFunding(), /BUSY/);
  assert.throws(() => a.app.exportRecoveryRecord(), /BUSY/); assert.equal(h.counts.verifies, 1);
  gate.resolve(h.f.verifiedRecord); assert.equal((await first).phase, 'VERIFIED'); assert.equal(a.app.snapshot().verificationActive, false); await stopped(a.app);
});
check('pending-candidate-replacement-is-refused-before-authentication', async () => {
  const h = harness(), gate = deferred(), a = h.create(); h.verifier = () => gate.promise; a.app.start();
  const old = a.app.verifyFunding(proof()), b = h.create(h.selection('worker.2', h.raw())); b.app.start();
  await assert.rejects(b.app.verifyFunding(proof('different')), /VERIFICATION_REFUSED/); assert.equal(h.counts.verifies, 1);
  assert.equal(b.app.snapshot().phase, 'OPEN'); h.verifier = () => Promise.resolve(h.f.verifiedRecord);
  assert.equal((await b.app.verifyFunding(proof())).verificationAttempts, 2); const retained = h.raw();
  gate.resolve(h.f.verifiedRecord); await assert.rejects(old, /VERIFICATION_UNKNOWN/); assert.equal(h.raw(), retained); await stopped(a.app); await stopped(b.app);
});
check('deep-or-oversized-proof-refusal-leaves-application-usable', async () => {
  const h = harness(), a = h.create(); a.app.start(); let artifact = {};
  for (let i = 0; i < 22; i++) artifact = { nested: artifact };
  await assert.rejects(a.app.verifyFunding(JSON.stringify({ evidenceVersion: 1, artifact })), /INPUT_REJECTED/);
  const extremelyDeep = '{\"evidenceVersion\":1,\"artifact\":' + '{\"n\":'.repeat(2200) + '{}' + '}'.repeat(2200) + '}';
  await assert.rejects(a.app.verifyFunding(extremelyDeep), /INPUT_REJECTED/);
  await assert.rejects(a.app.verifyFunding(proof('x'.repeat(17000))), /INPUT_REJECTED/);
  assert.equal(h.counts.verifies, 0); assert.equal(a.app.readFunding().phase, 'RETAINED');
  assert.equal((await a.app.verifyFunding(proof())).phase, 'VERIFIED'); await stopped(a.app);
});
check('known-rejection-can-use-new-proof-without-changing-original-payment', async () => {
  const h = harness(), a = h.create(); a.app.start(); h.verifier = () => Promise.reject(Error('synthetic unavailable'));
  assert.equal((await a.app.verifyFunding(proof())).phase, 'REJECTED'); const before = JSON.parse(envelope(h.raw()).receiptJson).paymentRecordJson;
  h.verifier = () => Promise.resolve(h.f.verifiedRecord); assert.equal((await a.app.verifyFunding(proof('fresh'))).verificationAttempts, 2);
  assert.equal(JSON.parse(envelope(h.raw()).receiptJson).paymentRecordJson, before); await stopped(a.app);
});
check('exhausted-verification-budget-is-a-known-refusal-with-no-hidden-retry', async () => {
  const h = harness(), a = h.create(h.selection('worker.1', null, 1)); a.app.start(); h.verifier = () => Promise.reject(Error('synthetic unavailable'));
  await a.app.verifyFunding(proof()); await assert.rejects(a.app.verifyFunding(proof()), /VERIFICATION_REFUSED/);
  assert.equal(a.app.snapshot().phase, 'OPEN'); assert.equal(h.counts.verifies, 1); await stopped(a.app);
});
check('stuck-verifier-close-rejects-on-cooperative-deadline-and-keeps-pending-original', async () => {
  const h = harness(), gate = deferred(), a = h.create(); h.verifier = () => gate.promise; a.app.start();
  const operation = a.app.verifyFunding(proof()), retained = h.raw(), closing = a.app.close();
  a.setTime(10000000n); a.wake(); await assert.rejects(closing, /CLOSE_UNKNOWN/);
  assert.equal(a.app.snapshot().logicalBackendRetirementEligible, false); assert.equal(h.raw(), retained);
  gate.resolve(h.f.verifiedRecord); await assert.rejects(operation, /OPERATION_CLOSED/); await drain();
  assert.equal(h.raw(), retained); assert.equal(a.app.snapshot().closeOutcome, 'REJECTED'); assert.equal(a.app.snapshot().phase, 'HELD');
  assert.equal(a.app.snapshot().logicalBackendRetirementEligible, true); assert.equal(h.counts.backendCloses, 0);
});
check('late-verifier-rejection-after-timeout-never-repairs-close', async () => {
  const h = harness(), gate = deferred(), a = h.create(); h.verifier = () => gate.promise; a.app.start();
  const operation = a.app.verifyFunding(proof()), closing = a.app.close(); a.setTime(11000000n); a.wake();
  await assert.rejects(closing, /CLOSE_UNKNOWN/); gate.reject(Error('synthetic late failure'));
  await assert.rejects(operation, /OPERATION_CLOSED/); await drain(); assert.equal(a.app.snapshot().closeOutcome, 'REJECTED');
});
check('clean-close-is-idempotent-and-never-closes-borrowed-backend', async () => {
  const h = harness(), a = h.create(); a.app.start(); const closing = a.app.close(); assert.equal(a.app.close(), closing); await closing;
  const s = a.app.snapshot(); assert.equal(s.phase, 'CLOSED'); assert.equal(s.receiptPortClosed, true);
  assert.equal(s.deadlineOwnerClose, 'DRAINED'); assert.equal(s.logicalBackendRetirementEligible, true); assert.equal(h.counts.backendCloses, 0);
  assert.throws(() => a.app.readFunding(), /UNAVAILABLE/); await assert.rejects(a.app.verifyFunding(proof()), /UNAVAILABLE/);
  assert.equal(a.app.exportRecoveryRecord().authority, 'NONE'); a.wake(); assert.equal(a.app.snapshot().phase, 'CLOSED');
});
check('early-watchdog-wake-is-unknown-and-never-clean-close', async () => {
  const h = harness(), a = h.create(); a.app.start(); const closing = a.app.close(); a.wake();
  await assert.rejects(closing, /CLOSE_UNKNOWN/); await drain(); assert.equal(a.app.snapshot().phase, 'HELD');
});
check('synchronous-arm-callback-is-a-retained-control-failure', async () => {
  const h = harness(), a = h.create(h.selection(), { earlyArm: true }); a.app.start();
  await assert.rejects(a.app.close(), /CLOSE_UNKNOWN/); await drain(); assert.equal(a.deadlines.snapshot().unknown, true);
  assert.equal(a.app.snapshot().logicalBackendRetirementEligible, false);
});
check('timer-arm-failure-is-not-retried-or-reported-as-drained', async () => {
  const h = harness(), a = h.create(h.selection(), { armThrows: true }); a.app.start();
  await assert.rejects(a.app.close(), /CLOSE_UNKNOWN/); await drain(); assert.equal(a.deadlines.snapshot().armCalls, 1);
  assert.equal(a.app.snapshot().logicalBackendRetirementEligible, false);
});
check('boolean-cancel-return-holds-and-is-not-retried', async () => {
  const h = harness(), a = h.create(h.selection(), { cancelBoolean: true }); a.app.start();
  await assert.rejects(a.app.close(), /CLOSE_UNKNOWN/); await drain(); assert.equal(a.deadlines.snapshot().cancelCalls, 1);
  assert.equal(a.app.snapshot().logicalBackendRetirementEligible, false);
});
check('elapsed-deadline-before-watchdog-delivery-refuses-clean-close', async () => {
  const h = harness(), a = h.create(); a.app.start(); const closing = a.app.close(); a.setTime(10000000n);
  await assert.rejects(closing, /CLOSE_UNKNOWN/); await drain(); assert.equal(a.app.snapshot().closeOutcome, 'REJECTED');
});
check('deadline-crossed-during-cancel-is-not-a-clean-close', async () => {
  const h = harness(), a = h.create(h.selection(), { cancelAdvances: true }); a.app.start();
  await assert.rejects(a.app.close(), /CLOSE_UNKNOWN/); await drain(); assert.equal(a.app.snapshot().closeOutcome, 'REJECTED');
});
check('monotonic-clock-rewind-holds-before-clean-close', async () => {
  const h = harness(), a = h.create(h.selection(), { rewind: true }); a.app.start();
  await assert.rejects(a.app.close(), /CLOSE_UNKNOWN/); await drain(); assert.equal(a.app.snapshot().phase, 'HELD');
});
check('nonfresh-deadline-owner-is-refused-before-claim', () => {
  const h = harness(); assert.throws(() => h.create(h.selection(), { nonFresh: true }), /DEADLINE_OWNER_NOT_FRESH/);
  assert.equal(h.counts.cas + h.counts.reads, 0);
});
check('reentrant-close-during-claim-preserves-unknown-without-original-verification', async () => {
  const h = harness(), a = h.create(); let closing;
  h.afterWrite = () => { closing = a.app.close(); }; assert.throws(() => a.app.start(), /STARTUP_UNKNOWN/);
  await assert.rejects(closing, /CLOSE_UNKNOWN/); assert.equal(a.app.snapshot().phase, 'HELD');
  assert.equal(h.counts.verifies, 0); assert.equal(envelope(h.raw()).receiptJson, null);
});
check('reentrant-close-during-startup-clock-does-not-publish-open-state', async () => {
  const h = harness(), a = h.create(); let closing; h.clock = () => { closing = a.app.close(); return NOW; };
  assert.throws(() => a.app.start(), /STARTUP_UNKNOWN/); await assert.rejects(closing, /CLOSE_UNKNOWN/);
  assert.equal(a.app.snapshot().startupComplete, false); assert.equal(JSON.parse(envelope(h.raw()).receiptJson).phase, 'RETAINED');
});
check('public-observation-omits-private-original-checkpoint-and-recovery-bytes', async () => {
  const h = harness(), a = h.create(); a.app.start(); await a.app.verifyFunding(proof());
  const publicText = JSON.stringify({ view: a.app.readFunding(), state: a.app.snapshot() });
  for (const privateValue of [h.f.paymentCheckpointJson, h.f.paymentPinsJson, h.f.fundingContextJson]) assert.equal(publicText.includes(privateValue), false);
  const first = a.app.exportRecoveryRecord(); assert.equal(JSON.parse(first.recordJson).purchase.paymentCheckpointJson, h.f.paymentCheckpointJson);
  await stopped(a.app); assert.equal(a.app.exportRecoveryRecord().recordJson, first.recordJson);
});
check('duplicate-start-is-refused-without-another-epoch-or-durable-write', async () => {
  const h = harness(), a = h.create(); a.app.start(); const retained = h.raw(), calls = h.counts.cas;
  assert.throws(() => a.app.start(), /ALREADY_STARTED/); assert.equal(h.counts.cas, calls); assert.equal(h.raw(), retained); await stopped(a.app);
});

const cases = [];
for (const { id, run } of checks) {
  try { await run(); cases.push({ id, status: 'PASS' }); }
  catch (error) { cases.push({ id, status: 'FAIL', error: String(error?.message ?? 'unknown') }); }
}
const failed = cases.filter(r => r.status !== 'PASS').length;
process.stdout.write(JSON.stringify({ qualification: 'PURCHASE_ORDER_FUNDING_APPLICATION_DATA', passed: cases.length - failed, failed, cases,
  actualApplicationOwnerEnvelopeAndDeadlineCores: true, selectedAuthenticator: 'SYNTHETIC', backend: 'SYNTHETIC_ATOMIC_UNIQUE_PAYMENT_CAS',
  timerActuators: 'SYNTHETIC', nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, grants: 0,
  serviceExecutions: 0, payouts: 0, nativeApplicationEntryExecuted: false, physicalResourceRelease: 'NOT_QUALIFIED' }) + '\n');
if (failed) process.exitCode = 1;
