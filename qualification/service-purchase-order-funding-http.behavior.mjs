import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import {
  capturePurchasedOrderFundingHttpSelection as captureHttp, createPurchasedOrderFundingHttpApplicationCore as createHttp,
} from '../src/service-purchase-order-funding-http-application.js';
import { purchasedOrderFundingSelectionFromRecovery as restore } from '../src/service-purchase-order-funding-application-core.js';
import { createServiceCreditApplicationDeadlineOwnerCore as deadlineOwner } from '../src/service-credit-application-deadline-owner-core.js';
import { capturePurchasedOrderPayment } from '../src/service-purchase-order-funding.js';
import { inspectPurchasedOrderFundingEnvelope as envelope, requirePurchasedOrderFundingEnvelopeTransition as transition } from '../src/service-purchase-order-funding-cas-contract.js';
import { orderFundingFixture as fixture, orderFundingOwnerInputs as inputs, orderFundingProof as proof, NOW } from './service-purchase-order-funding.fixture.mjs';

// Real HTTP binding/writer and application/owner/receipt/deadline cores; only
// backend, verifier, response and timer actuators are synthetic DATA capabilities.
const F = Object.freeze;
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
async function drain() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
async function stop(app) { try { await app.close(); } catch { assert.equal(app.snapshot().phase, 'HELD'); } }
function harness() {
  const f = fixture(), p = capturePurchasedOrderPayment(...inputs(f)), rows = new Map(), scopes = new Map();
  const counts = { cas: 0, reads: 0, commits: 0, verifies: 0, closes: 0 }; let afterWrite = null, verifier = () => Promise.resolve(f.verifiedRecord);
  const backend = {
    readEnvelope(orderId, scope) { counts.reads++; const raw = rows.get(orderId) ?? null; return raw === null || envelope(raw).paymentScope === scope ? raw : null; },
    compareAndSwapEnvelope(orderId, scope, expected, proposed) {
      counts.cas++; transition(expected, proposed);
      if ((rows.get(orderId) ?? null) !== expected || (scopes.has(scope) && scopes.get(scope) !== orderId)) return null;
      if (proposed !== expected) { rows.set(orderId, proposed); scopes.set(scope, orderId); counts.commits++; }
      afterWrite?.(proposed); return proposed;
    }, close() { counts.closes++; },
  };
  function selection(ownerId = 'worker.http.1', expectedEnvelopeJson = null) {
    return { purchase: Object.fromEntries(['termsJson', 'termsDigest', 'paymentCheckpointJson', 'paymentPinsJson', 'fundingContextJson'].map((key, i) => [key, inputs(f)[i]])),
      ownership: { storeId: 'store.order.http.synthetic', ownerId, expectedEnvelopeJson }, maximumVerificationAttempts: 3, closeBudgetMs: 10 };
  }
  function create(s = selection(), clock = () => NOW + 30000) {
    const timers = []; let time = 0n;
    const deadlines = deadlineOwner({ maxScheduleStarts: 1, maxConcurrentTimers: 1, maxDelayMs: 10,
      armTimer(wake, ms) { const handle = { wake, ms, cancelled: false }; timers.push(handle); return handle; },
      cancelTimer(handle) { handle.cancelled = true; }, readMonotonicTime() { return time; } });
    const app = createHttp({ purchaseHttp: { selection: s, fundingCandidateJson: proof() }, backend,
      verifyFundingEvidence: value => { counts.verifies++; return verifier(value); }, clock, deadlines });
    return { app, deadlines, expire() { time = 10000000n; assert.equal(timers.length, 1); timers[0].wake(); } };
  }
  function request(signature = p.checkpoint.originalBytes.paymentPayload) {
    return { method: 'POST', url: '/funding', httpVersion: '1.1', socket: { encrypted: true },
      rawHeaders: ['Host', 'order-funding.invalid', 'Content-Length', '0', ...(signature === null ? [] : ['PAYMENT-SIGNATURE', signature])] };
  }
  return { f, p, counts, backend, selection, create, request, raw: () => rows.get(p.orderId) ?? null,
    set verifier(value) { verifier = value; }, set afterWrite(value) { afterWrite = value; } };
}
function response(mode = {}) {
  const headers = {}, state = { status: null, body: null, endCalls: 0, headerCalls: 0 };
  return { destroyed: mode.destroyed ?? false, writableEnded: false, statusCode: 0, headers, state,
    setHeader(name, value) { state.headerCalls++; if (mode.headerThrows) throw Error('synthetic header failure'); headers[name] = value; },
    end(body) { state.status = this.statusCode; state.body = body; state.endCalls++; mode.onEnd?.(); if (mode.endThrows) throw Error('synthetic reply loss'); this.writableEnded = true; } };
}
function dispatch(app, request, r = response(), completionMode = {}) {
  const state = { success: 0, failure: 0 };
  const completion = F({ success: F(() => { state.success++; completionMode.success?.(); }), failure: F(() => { state.failure++; completionMode.failure?.(); }) });
  assert.equal(app.handle(request, r, F({ declaredData: true }), completion), undefined); return { response: r, state, completion };
}
function assertBound(result) {
  assert.equal(result.response.state.status, 202); assert.equal(result.response.state.body, 'BOUND'); assert.deepEqual(result.state, { success: 1, failure: 0 });
  const h = result.response.headers; assert.equal(h['Vary'], 'PAYMENT-SIGNATURE'); assert.equal(h['Content-Length'], '5'); assert.equal(h['Cache-Control'], 'private, no-store, max-age=0');
  assert.equal(h['Connection'], 'close'); assert.equal(h['Content-Type'], 'text/plain; charset=utf-8');
  assert.equal(Object.keys(h).some(name => ['payment-response', 'payment-required', 'authorization'].includes(name.toLowerCase())), false);
}
const checks = [];
function check(id, run) { checks.push({ id, run }); }
check('dormant-http-refuses-before-start-without-touching-backend-or-verifier', async () => {
  const h = harness(), a = h.create(); const r = dispatch(a.app, h.request()); assert.equal(r.response.state.status, 503);
  assert.equal(h.counts.cas + h.counts.reads + h.counts.verifies, 0); await stop(a.app);
});
check('startup-retains-original-before-first-http-verifier-entry', async () => {
  const h = harness(), a = h.create(); a.app.start();
  assert.equal(JSON.parse(envelope(h.raw()).receiptJson).phase, 'RETAINED');
  h.verifier = () => { assert.equal(JSON.parse(envelope(h.raw()).receiptJson).phase, 'VERIFYING'); return Promise.resolve(h.f.verifiedRecord); };
  const r = dispatch(a.app, h.request()); await drain(); assertBound(r); assert.equal(h.counts.verifies, 1); await stop(a.app);
});
check('verified-original-http-response-preserves-the-post-v1-bound-wire-contract', async () => {
  const h = harness(), a = h.create(); a.app.start(); const r = dispatch(a.app, h.request()); await drain(); assertBound(r);
  assert.equal(JSON.parse(envelope(h.raw()).receiptJson).phase, 'VERIFIED');
  assert.equal(a.app.snapshot().responseWriteMeansDelivery, false); assert.equal(a.app.snapshot().grantActivation, 'NOT_ESTABLISHED'); await stop(a.app);
});
check('wrong-method-target-host-tls-and-body-are-refused-before-verifier-entry', async () => {
  const h = harness(), a = h.create(); a.app.start(); const before = h.raw();
  for (const edit of [r => { r.method = 'GET'; }, r => { r.url = '/service-credit/v1/execute'; }, r => { r.rawHeaders[1] = 'foreign.invalid'; },
    r => { r.socket.encrypted = false; }, r => { r.rawHeaders[3] = '1'; }, r => { r.rawHeaders.push('Transfer-Encoding', 'chunked'); }, r => { r.rawHeaders.push('Host', 'order-funding.invalid'); }]) {
    const req = h.request(); edit(req); const r = dispatch(a.app, req); assert.equal(r.response.state.status, 400);
  }
  assert.equal(h.counts.verifies, 0); assert.equal(h.raw(), before); await stop(a.app);
});
check('missing-original-payment-does-not-issue-a-new-challenge', async () => {
  const h = harness(), a = h.create(); a.app.start(); const r = dispatch(a.app, h.request(null));
  assert.equal(r.response.state.status, 400); assert.equal(Object.hasOwn(r.response.headers, 'PAYMENT-REQUIRED'), false);
  assert.equal(a.app.snapshot().challengeIssuance, false); assert.equal(h.counts.verifies, 0); await stop(a.app);
});
check('semantically-equivalent-reencoded-payment-header-is-not-the-original', async () => {
  const h = harness(), a = h.create(); a.app.start(); const original = h.p.checkpoint.originalBytes.paymentPayload;
  const parsed = JSON.parse(Buffer.from(original, 'base64').toString());
  const changed = Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(parsed).reverse()))).toString('base64');
  assert.notEqual(changed, original); const r = dispatch(a.app, h.request(changed)); assert.equal(r.response.state.status, 409);
  assert.equal(h.counts.verifies, 0); await stop(a.app);
});
check('exact-http-replay-returns-identical-bound-without-another-authentication-or-write', async () => {
  const h = harness(), a = h.create(); a.app.start(); const first = dispatch(a.app, h.request()); await drain(); assertBound(first);
  const retained = h.raw(), before = { ...h.counts }, next = dispatch(a.app, h.request()); assertBound(next);
  assert.deepEqual(next.response.headers, first.response.headers); assert.equal(h.raw(), retained); assert.deepEqual(h.counts, before);
  assert.equal(a.app.snapshot().cachedReplies, 1); await stop(a.app);
});
check('reply-loss-after-verified-commit-replays-same-payment-without-economic-repetition', async () => {
  const h = harness(), a = h.create(); a.app.start(); const lost = dispatch(a.app, h.request(), response({ endThrows: true })); await drain();
  assert.deepEqual(lost.state, { success: 0, failure: 1 }); assert.equal(JSON.parse(envelope(h.raw()).receiptJson).phase, 'VERIFIED');
  const retained = h.raw(), before = { ...h.counts }, replay = dispatch(a.app, h.request()); assertBound(replay);
  assert.equal(h.raw(), retained); assert.deepEqual(h.counts, before); assert.equal(a.app.snapshot().phase, 'OPEN'); await stop(a.app);
});
check('header-write-loss-does-not-erase-verified-liability-or-trigger-reauthentication', async () => {
  const h = harness(), a = h.create(); a.app.start(); const lost = dispatch(a.app, h.request(), response({ headerThrows: true })); await drain();
  assert.equal(lost.response.state.endCalls, 0); assert.equal(lost.state.failure, 1); const retained = h.raw();
  const replay = dispatch(a.app, h.request()); assertBound(replay); assert.equal(h.raw(), retained); assert.equal(h.counts.verifies, 1); await stop(a.app);
});
check('already-destroyed-response-retains-verified-state-and-local-write-uncertainty', async () => {
  const h = harness(), a = h.create(); a.app.start(); const lost = dispatch(a.app, h.request(), response({ destroyed: true })); await drain();
  assert.equal(lost.state.failure, 1); assert.equal(lost.response.state.endCalls, 0); const retained = h.raw();
  assertBound(dispatch(a.app, h.request())); assert.equal(h.raw(), retained); assert.equal(h.counts.verifies, 1); await stop(a.app);
});
check('pending-verifier-does-not-admit-a-second-http-verification', async () => {
  const h = harness(), gate = deferred(), a = h.create(); h.verifier = () => gate.promise; a.app.start();
  const first = dispatch(a.app, h.request()), other = dispatch(a.app, h.request()); assert.equal(other.response.state.status, 503);
  assert.equal(a.app.snapshot().verificationActive, true); assert.equal(h.counts.verifies, 1);
  gate.resolve(h.f.verifiedRecord); await drain(); assertBound(first); await stop(a.app);
});
check('explicit-pending-to-success-replay-observes-same-locally-selected-proof', async () => {
  const h = harness(), a = h.create(), evidence = []; a.app.start();
  h.verifier = value => { evidence.push(JSON.stringify(value)); return Promise.reject(Error('synthetic pending')); };
  const pending = dispatch(a.app, h.request()); await drain(); assert.equal(pending.response.state.status, 503);
  const original = JSON.parse(envelope(h.raw()).receiptJson).paymentRecordJson;
  h.verifier = value => { evidence.push(JSON.stringify(value)); return Promise.resolve(h.f.verifiedRecord); };
  const success = dispatch(a.app, h.request()); await drain(); assertBound(success);
  assert.equal(evidence.length, 2); assert.equal(evidence[0], evidence[1]); assert.equal(JSON.parse(envelope(h.raw()).receiptJson).paymentRecordJson, original); await stop(a.app);
});
check('persistent-pending-exhausts-fixed-budget-without-payment-replacement-or-hidden-retry', async () => {
  const h = harness(), a = h.create(); h.verifier = () => Promise.reject(Error('synthetic pending')); a.app.start();
  const original = JSON.parse(envelope(h.raw()).receiptJson).paymentRecordJson;
  for (let i = 0; i < 4; i++) { const r = dispatch(a.app, h.request()); await drain(); assert.equal(r.response.state.status, 503); }
  assert.equal(h.counts.verifies, 3); assert.equal(JSON.parse(envelope(h.raw()).receiptJson).attempts, 3);
  assert.equal(JSON.parse(envelope(h.raw()).receiptJson).paymentRecordJson, original); assert.equal(a.app.snapshot().phase, 'OPEN'); await stop(a.app);
});
check('foreign-header-after-success-cannot-obtain-the-cached-bound-frame', async () => {
  const h = harness(), a = h.create(); a.app.start(); dispatch(a.app, h.request()); await drain();
  const before = { ...h.counts }, r = dispatch(a.app, h.request('Zm9yZWlnbg==')); assert.equal(r.response.state.status, 409);
  assert.deepEqual(h.counts, before); assert.equal(a.app.snapshot().cachedReplies, 0); await stop(a.app);
});
check('explicit-new-epoch-startup-recovery-replays-verified-http-without-authentication', async () => {
  const h = harness(), a = h.create(); a.app.start(); dispatch(a.app, h.request()); await drain(); const retained = a.app.exportRecoveryRecord(); await stop(a.app);
  const before = envelope(h.raw()); h.verifier = () => assert.fail('recovery must not verify again');
  const b = h.create(restore(retained.recordJson, retained.recordDigest, 'worker.http.2')); b.app.start(); assertBound(dispatch(b.app, h.request()));
  assert.equal(envelope(h.raw()).epoch, before.epoch + 1); assert.equal(envelope(h.raw()).receiptJson, before.receiptJson); assert.equal(h.counts.verifies, 1); await stop(b.app);
});
check('lost-native-like-verified-ack-needs-new-epoch-before-bound-http-recovery', async () => {
  const h = harness(), a = h.create(); a.app.start();
  h.afterWrite = raw => { if (JSON.parse(envelope(raw).receiptJson ?? '{}').phase === 'VERIFIED') throw Error('synthetic acknowledgement loss'); };
  const unknown = dispatch(a.app, h.request()); await drain(); assert.equal(unknown.response.state.status, 503); assert.equal(a.app.snapshot().phase, 'HELD');
  const retained = a.app.exportRecoveryRecord(), receipt = envelope(h.raw()).receiptJson; h.afterWrite = null; await stop(a.app);
  const b = h.create(restore(retained.recordJson, retained.recordDigest, 'worker.http.2')); b.app.start(); assertBound(dispatch(b.app, h.request()));
  assert.equal(envelope(h.raw()).receiptJson, receipt); assert.equal(h.counts.verifies, 1); await stop(b.app);
});
check('fenced-old-application-cannot-verify-or-change-new-owner-original', async () => {
  const h = harness(), a = h.create(); a.app.start(); const b = h.create(h.selection('worker.http.2', h.raw())); b.app.start();
  const retained = h.raw(), old = dispatch(a.app, h.request()); await drain(); assert.equal(old.response.state.status, 503);
  assert.equal(a.app.snapshot().phase, 'HELD'); assert.equal(h.raw(), retained); assert.equal(h.counts.verifies, 0); await stop(a.app); await stop(b.app);
});
check('close-detaches-active-response-and-completion-before-late-verifier-success', async () => {
  const h = harness(), gate = deferred(), a = h.create(); h.verifier = () => gate.promise; a.app.start(); const r = dispatch(a.app, h.request());
  const retained = h.raw(), closing = a.app.close(); assert.deepEqual(r.state, { success: 0, failure: 1 }); a.expire(); await assert.rejects(closing, /CLOSE_UNKNOWN/);
  gate.resolve(h.f.verifiedRecord); await drain(); assert.equal(r.response.state.endCalls, 0); assert.deepEqual(r.state, { success: 0, failure: 1 });
  assert.equal(h.raw(), retained); assert.equal(a.app.snapshot().phase, 'HELD'); assert.equal(a.app.snapshot().closeOutcome, 'REJECTED');
});
check('late-verifier-error-after-close-cannot-write-or-complete-the-response-again', async () => {
  const h = harness(), gate = deferred(), a = h.create(); h.verifier = () => gate.promise; a.app.start(); const r = dispatch(a.app, h.request());
  const closing = a.app.close(); a.expire(); await assert.rejects(closing, /CLOSE_UNKNOWN/); gate.reject(Error('synthetic late error')); await drain();
  assert.equal(r.response.state.endCalls, 0); assert.deepEqual(r.state, { success: 0, failure: 1 }); assert.equal(a.app.snapshot().closeOutcome, 'REJECTED');
});
check('clean-close-is-single-use-and-refuses-later-http-without-verifying', async () => {
  const h = harness(), a = h.create(); a.app.start(); const closing = a.app.close(); assert.equal(a.app.close(), closing); await closing;
  const r = dispatch(a.app, h.request()); assert.equal(r.response.state.status, 503); assert.equal(h.counts.verifies, 0);
  assert.equal(h.counts.closes, 0); assert.equal(a.app.snapshot().phase, 'CLOSED');
});
check('actual-ingress-completion-adapter-returns-void-and-settles-once', async () => {
  const h = harness(), a = h.create(); a.app.start(); const counts = { yes: 0, no: 0 };
  const done = F({ success: F(() => { counts.yes++; }), failure: F(() => { counts.no++; }) });
  assert.equal(a.app.downstream.close(done), undefined); await drain(); assert.deepEqual(counts, { yes: 1, no: 0 }); assert.equal(a.app.snapshot().phase, 'CLOSED');
});
check('request-accessor-is-not-invoked-during-admission', async () => {
  const h = harness(), a = h.create(); a.app.start(); let calls = 0; const req = h.request();
  Object.defineProperty(req, 'method', { enumerable: true, get() { calls++; return 'POST'; } });
  const r = dispatch(a.app, req); assert.equal(r.response.state.status, 400); assert.equal(calls, 0); assert.equal(h.counts.verifies, 0); await stop(a.app);
});
check('deep-or-oversized-selected-proof-is-refused-before-startup-or-sql', () => {
  const h = harness(); let artifact = {}; for (let i = 0; i < 23; i++) artifact = { nested: artifact };
  assert.throws(() => captureHttp({ selection: h.selection(), fundingCandidateJson: JSON.stringify({ evidenceVersion: 1, artifact }) }), /INPUT_REJECTED/);
  assert.throws(() => captureHttp({ selection: h.selection(), fundingCandidateJson: proof('x'.repeat(17000)) }), /INPUT_REJECTED/);
  assert.equal(h.counts.cas + h.counts.reads + h.counts.verifies, 0);
});
check('reentrant-http-at-response-end-only-replays-recorded-funding', async () => {
  const h = harness(), a = h.create(); a.app.start(); let second;
  const first = dispatch(a.app, h.request(), response({ onEnd() { second = dispatch(a.app, h.request()); } })); await drain();
  assertBound(first); assertBound(second); assert.equal(h.counts.verifies, 1); assert.equal(a.app.snapshot().cachedReplies, 1); await stop(a.app);
});
check('reused-completion-capability-is-held-without-a-second-completion', async () => {
  const h = harness(), a = h.create(); a.app.start(); const first = dispatch(a.app, h.request()); await drain(); assertBound(first);
  assert.equal(a.app.handle(h.request(), response(), F({}), first.completion), undefined); assert.deepEqual(first.state, { success: 1, failure: 0 });
  assert.equal(a.app.snapshot().phase, 'HELD'); await stop(a.app);
});
check('reentrant-close-during-startup-does-not-expose-an-open-http-application', async () => {
  const h = harness(); let a, closing; a = h.create(h.selection(), () => { closing = a.app.close(); return NOW; });
  assert.throws(() => a.app.start(), /STARTUP_UNKNOWN/); await assert.rejects(closing, /CLOSE_UNKNOWN/);
  assert.equal(a.app.snapshot().startupComplete, false); const r = dispatch(a.app, h.request()); assert.equal(r.response.state.status, 503); assert.equal(h.counts.verifies, 0);
});
check('wire-and-public-snapshot-do-not-disclose-checkpoint-context-or-verifier-proof', async () => {
  const h = harness(), a = h.create(); a.app.start(); const r = dispatch(a.app, h.request()); await drain();
  const publicText = JSON.stringify({ status: a.app.snapshot(), body: r.response.state.body, headers: r.response.headers });
  for (const raw of [h.f.paymentCheckpointJson, h.f.paymentPinsJson, h.f.fundingContextJson, proof()]) assert.equal(publicText.includes(raw), false);
  assert.equal(JSON.parse(a.app.exportRecoveryRecord().recordJson).purchase.paymentCheckpointJson, h.f.paymentCheckpointJson); await stop(a.app);
});

const cases = [];
for (const { id, run } of checks) {
  try { await run(); cases.push({ id, status: 'PASS' }); }
  catch (error) { cases.push({ id, status: 'FAIL', error: String(error?.message ?? 'unknown') }); }
}
const failed = cases.filter(r => r.status !== 'PASS').length;
process.stdout.write(JSON.stringify({ qualification: 'PURCHASE_ORDER_FUNDING_ORIGINAL_HTTP_DATA', passed: cases.length - failed, failed, cases,
  actualHttpApplicationWriterOwnerEnvelopeAndDeadlineCores: true, selectedAuthenticator: 'SYNTHETIC', backend: 'SYNTHETIC_ATOMIC_UNIQUE_PAYMENT_CAS',
  responseAndTimerActuators: 'SYNTHETIC_DATA', nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, grants: 0,
  serviceExecutions: 0, payouts: 0, nativeHttpApplicationExecuted: false, physicalResourceRelease: 'NOT_QUALIFIED', responseWriteMeansDelivery: false }) + '\n');
if (failed) process.exitCode = 1;
