// Real pure source controllers. Store, proof, writer and listener ports below
// are declared MEMORY DATA. No SQL, signatures, SDK, HTTP socket or native run.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { createIssuedRecordedResultGrantBinding as binding } from '../src/issued-recorded-result-grant-binding.js';
import { createIssuedFundingPostApplicationBinding as freshBinding } from '../src/x402-issued-funding-post-application-binding.js';
import { createServiceCreditRecordedHttpSessionCore as session } from '../src/service-credit-recorded-http-session-core.js';
import { issuedOriginalGrantAdmissionDataFixture as fixture } from './issued-original-grant-admission.behavior.mjs';
import { issuedProviderRecoveryDataFlush as flush } from './issued-provider-recovery.behavior.mjs';

const F = Object.freeze, checks = [], clone = v => JSON.parse(JSON.stringify(v));
const GRANT = 'grant_' + 'a'.repeat(64), DIGEST = 'sha256:' + 'b'.repeat(64);
function check(id, run) { checks.push({ id, run }); }
function deep(v) { if (v !== null && typeof v === 'object') { for (const x of Object.values(v)) deep(x); F(v); } return v; }
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function result(status = 'CACHED_SUCCESS') {
  const cached = F({ statusCode: 200, contentType: 'application/json', resultCode: 'result.fixed' });
  return deep({ status, revision: status === 'CLOSED' ? null : 7,
    originalRequest: status === 'CACHED_SUCCESS' ? { grantId: GRANT, requestId: 'original', requestDigest: DIGEST, state: 'SUCCEEDED', cachedResult: cached } : null,
    execution: status === 'CACHED_SUCCESS' ? { terminalClassification: 'SUCCEEDED', request: { grantId: GRANT, requestId: 'original', requestDigest: DIGEST } } : null,
    cachedResult: status === 'CACHED_SUCCESS' ? cached : null,
    executionAuthorized: false, paymentAuthorized: false, signingAuthorized: false, deliveryStatus: 'NOT_ESTABLISHED' });
}
function reader(options = {}) {
  const s = { reads: 0, closes: 0, frames: [], request: null }; let root;
  const configuration = F({ admittedGrantId: GRANT,
    readOriginal: F(request => { s.reads++; s.request = request; return options.read ? options.read(s, root, request) : result(); }),
    closeReader: F(() => { s.closes++; return options.close ? options.close(s, root) : result('CLOSED'); }),
    writeResponse: F((destination, frame) => { s.frames.push(frame); return options.write ? options.write(s, root, frame) : undefined; }),
  });
  root = session(configuration); return { root, s, configuration };
}
async function held(f) { await assert.rejects(f.root.handle(F({ declaredProof: true }), F({ declaredResponse: true }))); await assert.rejects(f.root.close()); }
async function selected(lifecycle = 'REVOKED') {
  const f = await fixture(), grant = f.ledger.activate();
  if (lifecycle === 'REVOKED') f.ledger.m.revokeGrant({ grantId: grant.grantId });
  else if (lifecycle === 'EXPIRED') f.ledger.setNow(1000);
  const stored = f.ledger.m.getGrant(grant.grantId), c = f.config.funding.intake;
  const options = { issuedFrame: f.f.x.d.config.issuedFrame, resourceUrl: c.resourceUrl, selection: c.selection };
  return { ...f, grant: stored, options, capture: binding(options), hash: f.root.snapshot().binding.transactionHash };
}
async function restored(lifecycle = 'REVOKED', outcome = 'SUCCEEDED') {
  const first = await fixture(), grant = first.ledger.activate();
  if (outcome === 'SUCCEEDED') {
    first.owner.admitOriginalCommittedServiceGrant(); first.send(first.serviceRequest('original')); await flush();
  } else {
    const request = { modelVersion: 1, grantId: grant.grantId, requestId: 'original', method: 'POST', routeId: 'api.fixed',
      canonicalBodyDigest: 'sha256:' + 'a'.repeat(64), selectedContentType: 'application/json', maxCostUnits: 1 };
    first.ledger.m.reserveRequest(request); first.ledger.m.beginExecution({ grantId: grant.grantId, requestId: 'original' });
    if (outcome === 'OUTCOME_UNKNOWN') first.ledger.m.markOutcomeUnknown({ grantId: grant.grantId, requestId: 'original' });
  }
  const state = first.ledger.m.exportState(); await first.owner.close();
  const next = await fixture({ provider: { state } });
  if (lifecycle === 'REVOKED') next.ledger.m.revokeGrant({ grantId: grant.grantId });
  else next.ledger.setNow(1000);
  return { first, next, grantId: grant.grantId };
}

check('inactive-binding-captures-no-clock-or-application-effect', async () => {
  const f = await selected(); let hooks = 0;
  const c = { ...f.options }; Object.defineProperty(c, 'now', { enumerable: true, get() { hooks++; throw Error(); } });
  assert.throws(() => binding(c)); assert.equal(hooks, 0); await f.owner.close();
});
check('inactive-binding-pins-revoked-original-without-changing-units-or-terms', async () => {
  const f = await selected(), before = canonicalJson(f.ledger.m.exportState()), pin = f.capture.captureCommittedGrant(f.grant, f.grant.grantId, f.hash);
  assert.equal(pin.serviceMode, 'RECORDED_RESULT_ONLY'); assert.equal(pin.authority, 'NONE'); assert.equal(pin.grantActivation, 'NONE');
  assert.equal(canonicalJson(f.ledger.m.exportState()), before); assert.throws(() => f.capture.captureCommittedGrant(f.grant, f.grant.grantId, f.hash)); await f.owner.close();
});
check('inactive-binding-pins-expired-original-without-refreshing-expiry', async () => {
  const f = await selected('EXPIRED'), before = canonicalJson(f.ledger.m.exportState());
  assert.equal(f.capture.captureCommittedGrant(f.grant, f.grant.grantId, f.hash).serviceMode, 'RECORDED_RESULT_ONLY');
  assert.equal(f.ledger.m.getGrant(f.grant.grantId).expiresAt, 1000); assert.equal(canonicalJson(f.ledger.m.exportState()), before); await f.owner.close();
});
check('inactive-binding-does-not-become-an-active-grant-admission-path', async () => {
  const f = await selected('ACTIVE'); assert.throws(() => f.capture.captureCommittedGrant(f.grant, f.grant.grantId, f.hash)); await f.owner.close();
});
check('fresh-binding-still-rejects-expired-and-revoked-grants', async () => {
  for (const lifecycle of ['EXPIRED', 'REVOKED']) {
    const f = await selected(lifecycle), b = freshBinding({ issuedFrame: f.options.issuedFrame, resourceUrl: f.options.resourceUrl, serviceSelection: f.options.selection });
    b.captureBoundOutcome(f.f.owner.getRecordedOutcome()); assert.throws(() => b.captureCommittedGrant(f.grant, f.grant.grantId)); await f.owner.close();
  }
});
check('inactive-binding-rejects-every-foreign-original-funding-field', async () => {
  const f = await selected();
  for (const key of Object.keys(f.f.x.d.d.profile.originalFunding)) {
    const g = clone(f.grant), value = g.activation[key];
    if (key === 'chainProfile') g.activation.chainProfile = { ...value, chainIdentifier: '999' };
    else if (typeof value === 'number') g.activation[key] = value + 1;
    else g.activation[key] = value === 'foreign' ? 'other' : 'foreign';
    assert.throws(() => binding(f.options).captureCommittedGrant(deep(g), f.grant.grantId, f.hash), key);
  }
  await f.owner.close();
});
check('inactive-binding-rejects-foreign-id-hash-intent-scheme-flow-and-payer', async () => {
  const f = await selected();
  assert.throws(() => binding(f.options).captureCommittedGrant(f.grant, 'grant_' + 'f'.repeat(64), f.hash));
  assert.throws(() => binding(f.options).captureCommittedGrant(f.grant, f.grant.grantId, 'f'.repeat(64)));
  assert.throws(() => binding(f.options).captureCommittedGrant(f.grant, f.grant.grantId + '\n', f.hash));
  assert.throws(() => binding(f.options).captureCommittedGrant(f.grant, f.grant.grantId, f.hash + '\n'));
  for (const change of [g => g.paymentIntent.intentId = 'sha256:' + '0'.repeat(64), g => g.paymentIntent.requirementId = 'sha256:' + '0'.repeat(64),
    g => g.activation.scheme = 'foreign', g => g.activation.paymentFlow = 'foreign', g => g.activation.payer = 'foreign']) {
    const g = clone(f.grant); change(g); assert.throws(() => binding(f.options).captureCommittedGrant(deep(g), f.grant.grantId, f.hash));
  }
  await f.owner.close();
});
check('inactive-binding-never-invokes-grant-getters-or-proxy-hooks', async () => {
  const f = await selected(); let hooks = 0; const g = { ...f.grant };
  Object.defineProperty(g, 'lifecycle', { enumerable: true, get() { hooks++; throw Error(); } });
  assert.throws(() => f.capture.captureCommittedGrant(F(g), f.grant.grantId, f.hash));
  assert.throws(() => f.capture.captureCommittedGrant(new Proxy(f.grant, { get() { hooks++; throw Error(); } }), f.grant.grantId, f.hash));
  assert.equal(hooks, 0); await f.owner.close();
});
check('revoked-original-result-reaches-same-provider-route-with-no-new-debit-or-execution', async () => {
  const { next, grantId } = await restored(), before = canonicalJson(next.ledger.m.exportState()), admission = next.owner.admitOriginalCommittedServiceGrant();
  assert.equal(admission.serviceMode, 'RECORDED_RESULT_ONLY'); assert.equal(next.root.snapshot().serviceAdmissionMode, 'RECORDED_RESULT_ONLY');
  const reply = next.send(next.serviceRequest('original')); await flush();
  assert.equal(reply.res.statusCode, 200); assert.equal(reply.res.body, '{"ok":true,"resultCode":"result.fixed"}');
  assert.equal(next.s.debits + next.s.executions + next.f.s.SDK, 0); assert.equal(next.ledger.m.getGrant(grantId).consumedUnits, 1);
  assert.equal(canonicalJson(next.ledger.m.exportState()), before); await next.owner.close(); assert.equal(next.s.resultReaderCloses, 1);
});
check('expired-at-current-grant-read-can-recover-even-when-stored-history-was-active', async () => {
  const { next, grantId } = await restored('EXPIRED'), admission = next.owner.admitOriginalCommittedServiceGrant();
  assert.equal(admission.history.record.storedLifecycle, 'ACTIVE'); assert.equal(admission.serviceMode, 'RECORDED_RESULT_ONLY');
  const reply = next.send(next.serviceRequest('original')); await flush(); assert.equal(reply.res.statusCode, 200);
  assert.equal(next.ledger.m.getGrant(grantId).lifecycle, 'EXPIRED'); assert.equal(next.s.debits + next.s.executions, 0); await next.owner.close();
});
check('inactive-recorded-mode-refuses-new-request-id-without-reserving-credit', async () => {
  for (const lifecycle of ['EXPIRED', 'REVOKED']) {
    const { next } = await restored(lifecycle); next.owner.admitOriginalCommittedServiceGrant(); const before = canonicalJson(next.ledger.m.exportState());
    const reply = next.send(next.serviceRequest('new.request')); await flush(); assert.equal(reply.res.statusCode, 409);
    assert.equal(canonicalJson(next.ledger.m.exportState()), before); assert.equal(next.s.debits + next.s.executions, 0); await next.owner.close();
  }
});
check('inactive-unknown-original-remains-held-without-success-or-new-execution', async () => {
  const { next, grantId } = await restored('REVOKED', 'OUTCOME_UNKNOWN'); next.owner.admitOriginalCommittedServiceGrant();
  const before = canonicalJson(next.ledger.m.exportState()), reply = next.send(next.serviceRequest('original')); await flush();
  assert.equal(reply.res.statusCode, 503); assert.equal(next.ledger.m.getGrant(grantId).heldUnits, 1);
  assert.equal(canonicalJson(next.ledger.m.exportState()), before); assert.equal(next.s.debits + next.s.executions, 0); await next.owner.close();
});
check('inactive-unresolved-original-does-not-enter-an-execution-owner', async () => {
  const { next } = await restored('REVOKED', 'UNRESOLVED'); next.owner.admitOriginalCommittedServiceGrant();
  const before = canonicalJson(next.ledger.m.exportState()), reply = next.send(next.serviceRequest('original')); await flush();
  assert.equal(reply.res.statusCode, 503); assert.equal(canonicalJson(next.ledger.m.exportState()), before); assert.equal(next.s.debits + next.s.executions, 0); await next.owner.close();
});
check('inactive-admission-cannot-upgrade-stored-revocation-to-dispatch-mode', async () => {
  let upgraded = false;
  const f = await fixture({ view(base) { const view = base.root.snapshot(); return upgraded ? F({ ...view, serviceAdmissionMode: 'DURABLE_EXECUTION' }) : view; },
    admit(base, owner, state, id) { const r = base.root.admitCommittedServiceGrant(id); upgraded = true; return r; } });
  const g = f.ledger.activate(); f.ledger.m.revokeGrant({ grantId: g.grantId });
  assert.throws(() => f.owner.admitOriginalCommittedServiceGrant()); assert.equal(f.owner.snapshot().held, true);
  assert.equal(f.s.debits + f.s.executions, 0); await assert.rejects(f.owner.close());
});
check('active-original-still-selects-per-request-durable-execution', async () => {
  const f = await fixture(); f.ledger.activate(); const admission = f.owner.admitOriginalCommittedServiceGrant();
  assert.equal(admission.serviceMode, 'DURABLE_EXECUTION'); assert.equal(f.s.replaySessions, 0);
  const reply = f.send(f.serviceRequest('new.allowed')); await flush(); assert.equal(reply.res.statusCode, 200); assert.equal(f.s.executions, 1); await f.owner.close();
});

check('recorded-http-construction-is-inert-and-rejects-executor-or-clock-ports', async () => {
  const f = reader(); assert.equal(f.s.reads + f.s.closes + f.s.frames.length, 0); let hooks = 0;
  for (const name of ['execute', 'prepare', 'now', 'storeClose']) {
    const c = { ...f.configuration }; Object.defineProperty(c, name, { enumerable: true, get() { hooks++; throw Error(); } });
    assert.throws(() => session(F(c)));
  }
  assert.equal(hooks, 0); await f.root.close();
});
check('recorded-http-returns-only-the-existing-canonical-success-body', async () => {
  const f = reader(), request = F({ declaredOriginal: 'original' }); await f.root.handle(request, F({}));
  assert.equal(f.s.request, request); assert.equal(f.s.frames.length, 1); assert.equal(f.s.frames[0].statusCode, 200);
  assert.equal(f.s.frames[0].body, '{"ok":true,"resultCode":"result.fixed"}'); assert.ok(Object.isFrozen(f.s.frames[0])); await f.root.close();
});
check('recorded-http-authentication-refusals-do-not-become-history-success', async () => {
  for (const [status, expected] of [['UNAUTHORIZED', 401], ['BAD_REQUEST', 400], ['NOT_FOUND', 404], ['METHOD_NOT_ALLOWED', 405]]) {
    const f = reader({ read: () => result(status) }); await f.root.handle(F({}), F({})); assert.equal(f.s.frames[0].statusCode, expected);
    if (status === 'UNAUTHORIZED') assert.equal(f.s.frames[0].extraHeaderName, 'WWW-Authenticate'); await f.root.close();
  }
});
check('recorded-http-missing-conflicting-or-not-invoked-originals-cannot-execute', async () => {
  for (const status of ['NOT_RECORDED', 'REQUEST_ID_CONFLICT', 'ORIGINAL_BINDING_MISMATCH', 'NOT_INVOKED']) {
    const f = reader({ read: () => result(status) }); await f.root.handle(F({}), F({})); assert.equal(f.s.frames[0].statusCode, 409); await f.root.close();
  }
});
check('recorded-http-pending-and-unknown-never-expose-a-success-body', async () => {
  for (const status of ['RECONCILIATION_REQUIRED', 'OUTCOME_UNKNOWN']) {
    const f = reader({ read: () => result(status) }); await f.root.handle(F({}), F({})); assert.equal(f.s.frames[0].statusCode, 503);
    assert.equal(f.s.frames[0].body.includes('result.fixed'), false); await f.root.close();
  }
});
check('recorded-http-known-unavailable-keeps-the-same-reader-for-a-later-original-query', async () => {
  let unavailable = true; const f = reader({ read: () => result(unavailable ? 'UNAVAILABLE' : 'CACHED_SUCCESS') });
  await f.root.handle(F({ declaredOriginal: 'original' }), F({})); assert.equal(f.s.frames[0].statusCode, 503);
  assert.equal(f.s.closes, 0); unavailable = false;
  await f.root.handle(F({ declaredOriginal: 'original' }), F({})); assert.equal(f.s.frames[1].statusCode, 200);
  assert.equal(f.s.reads, 2); assert.equal(f.s.closes, 0); await f.root.close(); assert.equal(f.s.closes, 1);
});
check('recorded-http-rejects-foreign-grant-and-broken-execution-cross-links', async () => {
  for (const change of [r => r.originalRequest.grantId = 'grant_' + 'c'.repeat(64), r => r.execution.request.requestId = 'foreign',
    r => r.execution.request.requestDigest = 'sha256:' + 'c'.repeat(64), r => r.execution.terminalClassification = 'OUTCOME_UNKNOWN',
    r => { r.originalRequest.requestDigest = undefined; r.execution.request.requestDigest = undefined; }]) {
    const value = clone(result()); change(value); const f = reader({ read: () => deep(value) }); await held(f); assert.equal(f.s.frames[0].statusCode, 503);
  }
});
check('recorded-http-rejects-cache-conflicts-and-action-authority', async () => {
  for (const change of [r => r.cachedResult.resultCode = 'conflict', r => r.cachedResult.statusCode = 201,
    r => r.executionAuthorized = true, r => r.paymentAuthorized = true, r => r.signingAuthorized = true,
    r => r.deliveryStatus = 'DELIVERED', r => r.cachedResult.resultCode = 'result.fixed\n']) {
    const value = clone(result()); change(value); const f = reader({ read: () => deep(value) }); await held(f); assert.equal(f.s.frames[0].statusCode, 503);
  }
});
check('recorded-http-never-evaluates-result-accessors-or-proxies', async () => {
  let hooks = 0; const value = { ...result() }; Object.defineProperty(value, 'status', { enumerable: true, get() { hooks++; throw Error(); } });
  const status = F({ [Symbol.toPrimitive]() { hooks++; throw Error(); } });
  for (const v of [F(value), new Proxy(result(), { get() { hooks++; throw Error(); } }), F({ ...result(), status })]) { const f = reader({ read: () => v }); await held(f); }
  assert.equal(hooks, 0);
});
check('recorded-http-wrong-arity-returns-unavailable-before-reader-entry', async () => {
  const f = reader(); await f.root.handle(F({}), F({}), F({})); assert.equal(f.s.reads, 0); assert.equal(f.s.frames[0].statusCode, 503); await f.root.close();
});
check('recorded-http-close-is-cached-and-closes-only-the-reader-once', async () => {
  const f = reader(), first = f.root.close(), again = f.root.close(); assert.equal(first, again); await first;
  assert.equal(f.s.closes, 1); await f.root.handle(F({}), F({})); assert.equal(f.s.reads, 0); assert.equal(f.s.frames[0].statusCode, 503);
});
check('recorded-http-reentrant-close-during-read-cannot-publish-a-success', async () => {
  let closing; const f = reader({ read(state, root) { closing = root.close(); return result(); } });
  await held(f); await assert.rejects(closing); assert.equal(f.s.frames[0].statusCode, 503); assert.equal(f.s.closes, 1);
});
check('recorded-http-reentrant-close-during-write-cannot-claim-clean-completion', async () => {
  let closing; const f = reader({ write(state, root) { closing = root.close(); } }); await held(f); await assert.rejects(closing);
  assert.equal(f.s.frames.length, 1); assert.equal(f.s.closes, 1);
});
check('recorded-http-promise-read-is-retained-with-no-late-reply-or-retry', async () => {
  const p = deferred(), f = reader({ read: () => p.promise }); await assert.rejects(f.root.handle(F({}), F({})));
  p.resolve(result()); await flush(); await assert.rejects(f.root.close()); assert.equal(f.s.reads, 1); assert.equal(f.s.frames.length, 1); assert.equal(f.s.frames[0].statusCode, 503);
});
check('recorded-http-unknown-read-is-not-retried-after-a-later-success', async () => {
  let broken = true; const f = reader({ read() { if (broken) throw Error('declared read lost'); return result(); } });
  await assert.rejects(f.root.handle(F({}), F({}))); broken = false; await assert.rejects(f.root.handle(F({}), F({})));
  assert.equal(f.s.reads, 1); assert.ok(f.s.frames.every(v => v.statusCode === 503)); await assert.rejects(f.root.close());
});
check('recorded-http-nonvoid-writer-and-close-receipts-stay-held', async () => {
  const f = reader({ write: () => Promise.resolve(undefined) }); await held(f); assert.equal(f.s.frames.length, 1);
  const g = reader({ close: () => Promise.resolve(result('CLOSED')) }); await assert.rejects(g.root.close()); assert.equal(g.s.closes, 1); assert.equal(g.root.close(), g.root.close());
});

export const inactiveGrantRecordedResultDataCases = F([...checks]);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases = []; let current = null, reported = false;
  function report() {
    if (reported) return; reported = true; const failed = cases.filter(c => c.status === 'FAIL').length;
    console.log(JSON.stringify({ qualification: 'G2_INACTIVE_GRANT_RECORDED_RESULT_DATA', passed: cases.length - failed, failed, cases,
      actualSourceControllers: true, storeProofWriterListenerAndExecutionPorts: 'DECLARED_MEMORY_DATA_ONLY',
      activationMetadata: 'SYNTHETIC_UNSIGNED_DATA', signatureAuthentication: 'NOT_EXECUTED',
      nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0,
      nativeFreshProcess: 'NOT_ESTABLISHED', nativePersistence: 'NOT_ESTABLISHED', physicalRelease: 'NOT_ESTABLISHED', LinuxAcceptance: 'NOT_ESTABLISHED', G1G2: 'OPEN' }));
    if (failed) process.exitCode = 1;
  }
  function unsettled() { if (current !== null) { cases.push({ id: current, status: 'FAIL', error: 'UNSETTLED_DECLARED_DATA_PROMISE' }); report(); } }
  process.once('beforeExit', unsettled);
  for (const { id, run } of checks) { current = id; try { await run(); cases.push({ id, status: 'PASS' }); } catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.message ?? 'unknown').slice(0, 256) }); } current = null; }
  process.off('beforeExit', unsettled); report();
}
