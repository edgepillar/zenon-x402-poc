// Actual original/checkpoint/profile/owner/coordinator code. Transport, clocks,
// timers and FIFO ports are declared DATA. Existing signature-shaped fields
// are deliberately unauthenticated; no native or signature operation runs.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { canonicalJson, paymentIntentDigest } from '../src/canonical.js';
import { retainedOriginalInputFixture } from './dynamic-plasma-retained-input.fixture.mjs';
import { encodeB64Json } from '../src/x402-wire.js';
import { captureOriginalPaymentCheckpoint, encodeOriginalPaymentCheckpoint } from '../src/service-credit-pilot-original-payment-checkpoint.js';
import { captureServiceCreditOriginalFundingGrantQuery as query, createServiceCreditOriginalFundingGrantResult as history } from '../src/service-credit-original-funding-grant.js';
import { decodeApiCreditOriginalGrantQueryProfile as decode, consumeApiCreditOriginalGrantQueryProfile as consume,
  releaseApiCreditOriginalGrantQueryProfile as release } from '../src/api-credit-original-grant-query-profile.js';
import { runApiCreditOriginalGrantQueryOwner as owner, captureApiCreditOriginalGrantQueryOutput as capture } from '../src/api-credit-original-grant-query-owner.js';
import { captureApiCreditCliArguments as args } from '../src/api-credit-cli-arguments.js';
import { captureApiCreditCliExecutionContext as context } from '../src/api-credit-cli-execution-context.js';
import { runApiCreditOriginalGrantQueryCoordinator as coordinate } from '../src/api-credit-recovery-inspection-coordinator.js';

const F = Object.freeze, checks = [], clone = v => JSON.parse(JSON.stringify(v));
const argv = () => ['--funding-grant-query-fd', '3', '--output-fd', '6', '--bootstrap-ms', '1000'];
function check(id, run) { checks.push({ id, run }); }
function digest(domain, value) { return 'sha256:' + createHash('sha256').update(domain + '\0', 'ascii').update(canonicalJson(value)).digest('hex'); }
function envelope() {
  const f = retainedOriginalInputFixture(), required = clone(f.input.plannerContext.readInput.paymentRequired);
  required.resource.tags = ['x402-service-credit-funding-v1', 'c'.repeat(32), 'c'.repeat(32)];
  const accepted = required.accepts[0], intent = paymentIntentDigest(required, accepted);
  const tx = { ...f.candidate.accountBlock, data: Buffer.from(intent, 'hex').toString('base64') };
  const payload = { x402Version: 2, resource: required.resource, accepted, payload: { transaction: tx, intentDigest: intent } };
  const original = captureOriginalPaymentCheckpoint({ binding: { requestId: 'funding-1', paymentHash: tx.hash,
    origin: new URL(f.resourceUrl).origin, contextId: 'funding-context-1' }, originalBytes: {
    requestBody: '', paymentPayload: encodeB64Json(payload), paymentRequirements: encodeB64Json(required), context: Buffer.from('declared-context').toString('base64') } });
  const originalFunding = { transactionId: 'zenontx:' + tx.hash, network: accepted.network, chainProfile: accepted.extra.zenonChain,
    asset: accepted.asset, amount: accepted.amount, payee: accepted.payTo, offerId: 'offer-1', offerVersion: 1,
    holderId: tx.address, capabilityCommitment: 'sha256:' + 'd'.repeat(64),
    paymentResourceDigest: digest('zenon-x402-service-credit-payment-resource-v1', required.resource),
    paymentRequirementDigest: digest('zenon-x402-service-credit-payment-requirement-v1', accepted),
    paymentIntentDigest: 'sha256:' + intent, grantFundingCommitment: 'sha256:' + 'c'.repeat(64) };
  const q = query({ queryVersion: 1, requestId: 'query-1', originalFunding });
  return { originalGrantQueryVersion: 1, originalPayment: { resourceUrl: f.resourceUrl,
    serializedCheckpoint: encodeOriginalPaymentCheckpoint(original.checkpoint), expectedPins: original.pins }, originalFunding,
    query: { requestId: 'query-1', expectedQueryDigest: q.request.canonicalBodyDigest, proof: {
      proofVersion: 1, grantId: q.request.grantId, requestId: 'query-1', publicKey: 'declared-key-data', maxCostUnits: 1, signature: 'declared-proof-data' } },
    transport: { caBase64: Buffer.from('declared-test-ca-data').toString('base64'), requestDeadlineMs: 100, handshakeDeadlineMs: 50, closeGraceMs: 100 } };
}
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
const closedReceipt = () => F({ phase: 'CLOSED', trackedRequests: 0, trackedSockets: 0, ownedTimers: 0, serviceDelivery: 'NOT_ESTABLISHED' });
function fixture(options = {}, captured = null, outerGuard = null) {
  let token;
  if (captured === null) { token = decode(canonicalJson(envelope())); captured = consume(token); release(token); }
  const c = captured, handle = F({ declaredTransport: true }), read = deferred(), close = deferred();
  const s = { now: 0n, opens: 0, reads: 0, closes: 0, snapshots: 0, cancelled: 0, closed: false, timers: [], externalExpired: false, unknown: false, work: 0 };
  const result = history(c.query.originalFunding, null);
  const view = () => F({ phase: s.closed ? 'CLOSED' : 'OPEN', unknown: s.unknown, requestStarts: s.reads,
    trackedRequests: s.work, trackedSockets: 0, ownedTimers: 0,
    close: F({ phase: s.closed ? 'CLOSED' : 'OPEN', unknown: s.unknown, closeRequested: s.closes > 0,
      closePromiseOutcome: s.closed ? 'CLOSED' : 'PENDING', observing: false, quiescenceObserved: s.closed,
      localMaterialRelease: F({ attempts: s.closed ? 1 : 0, outcome: s.closed ? 'RETURNED' : 'NOT_ATTEMPTED' }) }) });
  const ports = F({
    openTransport: F(p => { assert.equal(p, c); s.opens++; return options.open ? options.open(s, handle) : handle; }),
    read: F((h, q, proof) => { assert.equal(h, handle); assert.equal(q.requestId, c.query.requestId); assert.equal(proof, c.proof); s.reads++;
      return options.read ? options.read(s, result, read) : Promise.resolve(result); }),
    close: F(h => { assert.equal(h, handle); s.closes++; if (options.close) return options.close(s, close); s.closed = true; return Promise.resolve(closedReceipt()); }),
    inspect: F(h => { assert.equal(h, handle); s.snapshots++; return options.view ? options.view(s, view()) : view(); }),
    clock: F(() => options.clock ? options.clock(s) : s.now),
    armTimer: F((budget, callback) => { const t = { budget, callback }; s.timers.push(t); if (options.arm) return options.arm(s, t); return t; }),
    cancelTimer: F(t => { s.cancelled++; t.cancelled = true; if (options.cancel) return options.cancel(s, t); }),
  });
  const baseGuard = outerGuard ?? F(() => { if (s.externalExpired) throw Error('declared expiry'); });
  const guard = options.guardResult ? F(() => { baseGuard(); return options.guardResult(s); }) : baseGuard;
  return { c, s, result, read, close, ports, run: () => owner(F({ profile: c, ports, requireOpening: guard })) };
}
function powerless(result) {
  assert.equal(result.authority, 'NONE'); assert.equal(result.reconciliationRequired, true); assert.equal(result.spendingReservation, 'UNCHANGED');
  assert.equal(result.nativeResourceRelease, 'NOT_ESTABLISHED'); assert.equal(result.localPayerStore, 'NOT_OPENED');
  for (const k of ['mayStartPayment', 'maySignPayment', 'mayDispatchService', 'mayActivateGrant']) assert.equal(result[k], false);
  assert.equal(result.history.grantAuthority, 'NOT_REVALIDATED'); assert.equal(result.history.deliveryLiability, 'NOT_QUERIED');
}
function rejectProfile(edit) { const e = clone(envelope()); edit(e); assert.throws(() => decode(canonicalJson(e))); }
check('grant-query-cli-admits-two-distinct-owned-pipes-with-no-key-or-store', () => {
  assert.deepEqual(args(argv()), { mode: 'ORIGINAL_GRANT_QUERY', originalGrantQueryFd: 3, outputFd: 6, bootstrapMs: 1000 });
  for (const a of [['--funding-grant-query-fd','3','--output-fd','3','--bootstrap-ms','1'], [...argv(),'--key-fd','4'],
    ['--funding-grant-query-fd','03','--output-fd','6','--bootstrap-ms','1']]) assert.throws(() => args(a));
});
check('grant-query-cli-preserves-the-existing-funding-history-mode', () => { const a = argv(); a[0] = '--funding-inspect-fd'; assert.equal(args(a).mode, 'FUNDING_INSPECT'); });
check('grant-query-cli-requires-the-existing-plain-runtime-profile', () => {
  const plain = { execArgv: [], nodeOptions: undefined, nodePath: undefined, preserveSymlinks: undefined };
  assert.equal(context(argv(), '24.19.0', 'node', 'linux', 'x64', plain).mode, 'ORIGINAL_GRANT_QUERY');
  assert.equal(context(argv(), '24.19.0', 'node', 'darwin', 'arm64', { ...plain, execArgv: ['--import=x'] }).mode, 'EXECUTION_CONTEXT_REFUSED');
  assert.equal(context(argv(), '24.18.0', 'node', 'linux', 'x64', plain).mode, 'RUNTIME_REFUSED');
});
check('grant-query-profile-is-one-use-and-exposes-no-proof-or-ca', () => {
  const p = decode(canonicalJson(envelope())); assert.equal(Object.hasOwn(p, 'proof'), false); assert.equal(Object.hasOwn(p, 'transport'), false);
  const c = consume(p); assert.ok(Object.isFrozen(c.query.originalFunding.chainProfile)); assert.throws(() => consume(p)); release(p); assert.throws(() => consume(p));
});
check('grant-query-profile-release-before-consume-retains-no-entry-authority', () => { const p = decode(canonicalJson(envelope())); p.release(); assert.throws(() => consume(p)); });
check('grant-query-profile-rejects-noncanonical-and-extra-fields', () => { assert.throws(() => decode(JSON.stringify(envelope(), null, 1))); rejectProfile(e => { e.signer = 'extra'; }); });
check('grant-query-profile-rejects-changed-independent-checkpoint-pins', () => rejectProfile(e => { e.originalPayment.expectedPins.digests.context = '0'.repeat(64); }));
check('grant-query-profile-rejects-another-original-transaction', () => rejectProfile(e => { e.originalFunding.transactionId = 'zenontx:' + 'f'.repeat(64); }));
check('grant-query-profile-rejects-network-chain-and-amount-drift', () => {
  for (const edit of [e => { e.originalFunding.network = 'zenon:other'; }, e => { e.originalFunding.chainProfile.chainIdentifier = '1'; }, e => { e.originalFunding.amount = '999'; }]) rejectProfile(edit);
});
check('grant-query-profile-rejects-asset-payee-holder-drift', () => { for (const key of ['asset','payee','holderId']) rejectProfile(e => { e.originalFunding[key] = 'other'; }); });
check('grant-query-profile-rejects-resource-requirement-intent-funding-drift', () => { for (const key of ['paymentResourceDigest','paymentRequirementDigest','paymentIntentDigest','grantFundingCommitment']) rejectProfile(e => { e.originalFunding[key] = 'sha256:' + 'f'.repeat(64); }); });
check('grant-query-profile-retained-query-digest-covers-offer-and-capability', () => { for (const key of ['offerId','capabilityCommitment']) rejectProfile(e => { e.originalFunding[key] = key === 'offerId' ? 'other' : 'sha256:' + 'f'.repeat(64); }); });
check('grant-query-profile-does-not-accept-a-service-proof-scope', () => rejectProfile(e => { e.query.proof.grantId = 'grant_' + 'f'.repeat(64); }));
check('grant-query-profile-does-not-accept-a-foreign-proof-request', () => rejectProfile(e => { e.query.proof.requestId = 'other'; }));
check('grant-query-profile-has-no-url-alias-or-ca-fallback', () => { rejectProfile(e => { e.originalPayment.resourceUrl += '?'; }); rejectProfile(e => { e.transport.caBase64 = ''; }); rejectProfile(e => { e.transport.caBase64 += '='; }); });
check('grant-query-profile-caps-combined-request-close-budget', () => { rejectProfile(e => { e.transport.requestDeadlineMs = 60000; }); rejectProfile(e => { e.transport.handshakeDeadlineMs = 101; }); });
check('grant-query-owner-publishes-history-only-after-one-read-and-genuine-close', async () => {
  const f = fixture(), result = await f.run(); powerless(result); assert.equal(result.history.status, 'NOT_RECORDED');
  assert.equal(f.s.opens, 1); assert.equal(f.s.reads, 1); assert.equal(f.s.closes, 1); assert.equal(f.s.cancelled, 1); assert.ok(f.s.snapshots >= 3);
});
check('grant-query-owner-cannot-be-reused-after-success', async () => { const f = fixture(); await f.run(); assert.throws(f.run); assert.equal(f.s.reads, 1); assert.equal(f.s.closes, 1); });
check('grant-query-owner-recorded-grant-remains-history-after-close', async () => {
  const f = fixture({ read(s, result) {
    const q = result.originalFunding;
    return Promise.resolve(history(q, F({ activation: q, transactionId: q.transactionId, offerId: q.offerId, offerVersion: q.offerVersion,
      holderId: q.holderId, capabilityCommitment: q.capabilityCommitment, grantId: 'grant_' + 'a'.repeat(64), activationId: 'activation_' + 'b'.repeat(64),
      totalUnits: 100, expiresAt: 1000, lifecycle: 'EXPIRED', availableUnits: 90, heldUnits: 5, consumedUnits: 5 })));
  } });
  const result = await f.run(); powerless(result); assert.equal(result.history.status, 'RECORDED'); assert.equal(result.history.record.storedLifecycle, 'EXPIRED'); assert.equal(f.s.reads, 1);
});
check('grant-query-owner-waits-for-the-selected-close-promise', async () => {
  const f = fixture({ close(s, c) { return c.promise; } }); let returned = false; const pending = f.run().then(v => { returned = true; return v; });
  await flush(); assert.equal(returned, false); assert.equal(f.s.closes, 1); f.s.closed = true; f.close.resolve(closedReceipt()); powerless(await pending);
});
check('grant-query-owner-void-close-is-not-the-native-close-contract', async () => { const f = fixture({ close(s) { s.closed = true; } }); await assert.rejects(f.run()); assert.equal(f.s.closes, 1); });
check('grant-query-owner-boolean-close-is-not-the-native-close-contract', async () => { const f = fixture({ close(s) { s.closed = true; return Promise.resolve(true); } }); await assert.rejects(f.run()); });
check('grant-query-owner-rejects-a-wrong-closed-receipt', async () => { const f = fixture({ close(s) { s.closed = true; return Promise.resolve(F({ ...closedReceipt(), trackedSockets: 1 })); } }); await assert.rejects(f.run()); });
check('grant-query-owner-requires-fresh-closed-counts', async () => { const f = fixture({ close(s) { s.closed = true; s.work = 1; return Promise.resolve(closedReceipt()); } }); await assert.rejects(f.run()); });
check('grant-query-owner-sticky-transport-unknown-cannot-publish', async () => { const f = fixture({ close(s) { s.closed = true; s.unknown = true; return Promise.resolve(closedReceipt()); } }); await assert.rejects(f.run()); });
check('grant-query-owner-rechecks-after-timer-cancellation', async () => { const f = fixture({ cancel(s) { s.work = 1; } }); await assert.rejects(f.run()); assert.equal(f.s.cancelled, 1); });
check('grant-query-owner-timer-cancellation-must-return-void', async () => { const f = fixture({ cancel() { return true; } }); await assert.rejects(f.run()); });
check('grant-query-owner-timer-cancellation-error-keeps-ownership', async () => { const f = fixture({ cancel() { throw Error('declared'); } }); await assert.rejects(f.run()); assert.equal(f.s.closes, 1); });
check('grant-query-owner-expiry-does-not-compete-with-a-pending-read', async () => {
  const f = fixture({ read(s, result, d) { return d.promise; } }), pending = f.run();
  f.s.now = 200000000n; f.s.timers[0].callback(); await assert.rejects(pending); assert.equal(f.s.closes, 0);
  f.read.resolve(f.result); await flush(); assert.equal(f.s.closes, 1); assert.throws(f.run);
});
check('grant-query-owner-late-close-cannot-repair-an-expired-verdict', async () => {
  const f = fixture({ close(s, d) { return d.promise; } }), pending = f.run(); await flush();
  f.s.now = 200000000n; f.s.timers[0].callback(); await assert.rejects(pending); f.s.closed = true; f.close.resolve(closedReceipt()); await flush();
  assert.equal(f.s.closes, 1); assert.throws(f.run);
});
check('grant-query-owner-unknown-constructor-is-not-closed-by-another-owner', async () => {
  const f = fixture({ open() { return Promise.resolve(F({ opaque: true })); } }); await assert.rejects(f.run()); assert.equal(f.s.reads, 0); assert.equal(f.s.closes, 0);
});
check('grant-query-owner-proxy-constructor-does-not-run-traps', async () => {
  let traps = 0; const f = fixture({ open() { return new Proxy({}, { getPrototypeOf() { traps++; throw Error(); } }); } });
  await assert.rejects(f.run()); assert.equal(traps, 0); assert.equal(f.s.closes, 0);
});
check('grant-query-owner-opaque-read-does-not-enter-thenable-or-competing-close', async () => {
  let hooks = 0; const f = fixture({ read() { return F({ get then() { hooks++; throw Error(); } }); } }); await assert.rejects(f.run());
  assert.equal(hooks, 0); assert.equal(f.s.closes, 0);
});
check('grant-query-owner-read-rejection-enters-one-known-owner-close', async () => {
  const f = fixture({ read() { return Promise.reject(Error('declared')); } }); await assert.rejects(f.run()); await flush(); assert.equal(f.s.closes, 1);
});
check('grant-query-owner-another-funding-response-cannot-match', async () => {
  const f = fixture({ read(s, result) { return Promise.resolve(F({ ...result, originalFunding: F({ ...result.originalFunding, amount: '999' }) })); } });
  await assert.rejects(f.run()); await flush(); assert.equal(f.s.closes, 1);
});
check('grant-query-owner-early-clock-regression-refuses-before-transport', async () => { let calls = 0; const f = fixture({ clock() { return calls++ ? -1n : 0n; } }); await assert.rejects(f.run()); assert.equal(f.s.opens, 0); });
check('grant-query-owner-expiry-at-close-boundary-is-not-a-late-success', async () => { const f = fixture({ close(s) { s.closed = true; s.now = 200000000n; return Promise.resolve(closedReceipt()); } }); await assert.rejects(f.run()); });
check('grant-query-owner-synchronous-timer-expiry-never-opens-transport', async () => { const f = fixture({ arm(s, t) { t.callback(); return t; } }); await assert.rejects(f.run()); assert.equal(f.s.opens, 0); });
check('grant-query-owner-outer-guard-expiry-vetoes-a-valid-result', async () => { const f = fixture({ read(s, result) { s.externalExpired = true; return Promise.resolve(result); } }); await assert.rejects(f.run()); });
check('grant-query-owner-close-rejection-is-not-retried', async () => { const f = fixture({ close() { return Promise.reject(Error('declared close')); } }); await assert.rejects(f.run()); assert.equal(f.s.closes, 1); assert.throws(f.run); });
check('grant-query-output-cannot-clear-reservations-or-add-dispatch', async () => { const f = fixture(), result = await f.run(); for (const edit of [{ spendingReservation: 'RELEASED' }, { mayDispatchService: true }, { nativeResourceRelease: 'ESTABLISHED' }]) assert.throws(() => capture(F({ ...result, ...edit }))); });
function coordinator(options = {}) {
  const r = { text: canonicalJson(envelope()), now: 0n, timers: [], writes: [], closes: 0, closed: false, entered: 0, owned: null };
  const ports = F({ readProfile: F(g => { g(); return Promise.resolve(r.text); }),
    inspectOriginal: F(async (profile, guard) => {
      r.entered++; r.profile = profile;
      try { r.owned = fixture(options.owner ?? {}, consume(profile), guard); const result = await r.owned.run(); return options.result ? options.result(result, r) : result; }
      finally { release(profile); }
    }),
    writeResult: F((line, guard) => { guard(); assert.equal(r.owned.s.closed, true); r.writes.push(line); return Promise.resolve(undefined); }),
    close: F(() => { r.closes++; r.closed = true; return Promise.resolve(undefined); }),
    inspect: F(() => F({ lifecycle: r.closed ? 'CLOSED' : 'OPEN', held: false, reading: false, writing: false })),
    clock: F(() => r.now), armTimer: F((budget, callback) => { const t = { budget, callback }; r.timers.push(t); return t; }),
    cancelTimer: F(t => { t.cancelled = true; }),
  });
  return { r, run: () => coordinate({ arguments: args(argv()), ports }) };
}
check('grant-query-coordinator-writes-one-closed-history-and-closes-fifos', async () => {
  const f = coordinator(), result = await f.run(); assert.equal(result.status, 'CLOSED'); assert.equal(result.exitCode, 0);
  assert.equal(f.r.writes.length, 1); assert.equal(f.r.closes, 1); powerless(JSON.parse(f.r.writes[0])); assert.ok(Buffer.byteLength(f.r.writes[0]) <= 8192);
});
check('grant-query-coordinator-bootstrap-refusal-opens-no-query', async () => { const f = coordinator(); f.r.text = '{}'; const result = await f.run(); assert.equal(result.status, 'BOOTSTRAP_REFUSED'); assert.equal(f.r.entered, 0); assert.equal(f.r.writes.length, 0); });
check('grant-query-coordinator-mismatched-checkpoint-result-is-unknown', async () => {
  const f = coordinator({ result: r => F({ ...r, checkpointDigest: 'f'.repeat(64) }) }); const result = await f.run(); assert.equal(result.status, 'CLOSE_UNKNOWN'); assert.equal(f.r.writes.length, 0);
});
check('grant-query-coordinator-mismatched-request-result-is-unknown', async () => {
  const f = coordinator({ result: r => F({ ...r, requestId: 'other' }) }); const result = await f.run(); assert.equal(result.exitCode, 4); assert.equal(f.r.writes.length, 0);
});
check('grant-query-coordinator-writes-nothing-before-a-pending-native-close', async () => {
  const f = coordinator({ owner: { close(s, d) { return d.promise; } } }); const pending = f.run(); await flush(); assert.equal(f.r.writes.length, 0);
  f.r.owned.s.closed = true; f.r.owned.close.resolve(closedReceipt()); assert.equal((await pending).status, 'CLOSED');
});
check('grant-query-coordinator-expiry-keeps-pending-query-and-discards-late-history', async () => {
  const f = coordinator({ owner: { read(s, result, d) { return d.promise; } } }); const pending = f.run(); await flush();
  f.r.now = 1000000000n; f.r.timers[0].callback(); const result = await pending;
  assert.equal(result.exitCode, 4); assert.equal(f.r.writes.length, 0); assert.equal(f.r.owned.s.closes, 0);
  f.r.owned.read.resolve(f.r.owned.result); await flush(); assert.equal(f.r.owned.s.closes, 1); assert.equal(f.r.writes.length, 0);
});

export const originalGrantQueryDataFixture = fixture;
export const originalGrantQueryCoordinatorDataFixture = coordinator;
if (process.argv[1] === fileURLToPath(import.meta.url)) {

const cases = [];
for (const { id, run } of checks) {
  try { await run(); cases.push({ id, status: 'PASS' }); }
  catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.message ?? 'unknown').slice(0, 256) }); }
}
const failed = cases.filter(c => c.status === 'FAIL').length;
console.log(JSON.stringify({ qualification: 'G2_ORIGINAL_GRANT_QUERY_CLI_DATA', passed: cases.length - failed, failed, cases,
  actualProfileOwnerAndCoordinator: true, transactionFields: 'UNAUTHENTICATED_SYNTHETIC_DATA', transportAndTimers: 'DECLARED_PORTS_ONLY',
  nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0,
  nativePhysicalRelease: 'NOT_ESTABLISHED', LinuxAcceptance: 'NOT_ESTABLISHED' }));
if (failed) process.exitCode = 1;

}
