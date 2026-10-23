/*
 * Seven selected current-source abort-drain lifecycle cases.
 * Actual V1/V2 dispatch and V3 custodied client/runner code; only the declared
 * synchronous store and request/response interface events are test-owned.
 * No native HTTP implementation, socket, SQL, SDK, key/signature operation,
 * search, actual PREPARE, payment or live provider is selected.
 * Do not import old test registrations or transfer their historical pins.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';
import {
  createServiceCreditHttpExecuteDispatch as V1,
  createServiceCreditHttpExecuteDispatchV2 as V2,
} from '../src/service-credit-http-execute-dispatch.js';
import { createServiceCreditCustodiedSequentialRunnerV3 as RUNNER }
  from '../src/service-credit-custodied-sequential-runner.js';
import {
  captureOriginalServiceRequestCustody as CAPTURE,
  serializeOriginalServiceRequestCustody as SERIALIZE,
  parseOriginalServiceRequestCustody as PARSE,
  captureOriginalServiceDispatchIntent as INTENT,
  serializeOriginalServiceDispatchIntent as INTENT_TEXT,
} from '../src/service-credit-original-request-custody-contract.js';

assert.equal(process.versions.node, '24.19.0');
assert.equal(process.argv.length, 2);
const OPTIONS = { timeout: 5000, concurrency: false };
const SERVICE = 'https://synthetic.invalid/service-credit/v1/execute';
const FUNDING = 'https://synthetic.invalid/credit';
const GRANT = 'grant.abort-drain', HASH = 'a'.repeat(64), NETWORK = 'zenon:synthetic';
const EMPTY = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const REPLY = '{"ok":true,"resultCode":"accepted"}';
const D = 'SERVICE_CREDIT_HTTP_EXECUTE_DISPATCH_';
const R = 'SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_';
const O = 'SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const totals = { directDispatchers: 0, directRejected: 0, directFulfilled: 0,
  runnerInstances: 0, runnerRuns: 0, runnerFailed: 0, runnerCompleted: 0,
  requestCalls: 0, requestDestroys: 0, responseDestroys: 0, custodyWrites: 0,
  intentWrites: 0, borrowedStoreCloses: 0, rawReasonHooks: 0 };
function inputFor(requestId = 'request.one') {
  const originalRequestJson = JSON.stringify({ modelVersion: 1, grantId: GRANT, requestId,
    method: 'POST', routeId: 'service-credit.execute.v1', canonicalBodyDigest: EMPTY,
    selectedContentType: 'application/json', maxCostUnits: 1 });
  // Declared strings, not generated keys, signatures or a verified capability.
  const proof = JSON.stringify({ grantId: GRANT, maxCostUnits: 1, proofVersion: 1,
    publicKey: 'declared-public-key', requestId, signature: 'declared-signature-' + requestId });
  return { grantId: GRANT, requestId, originalRequestJson, originalBodyBase64: '',
    serviceResourceUrl: SERVICE, authorizationHeader: 'ServiceCredit '
      + Buffer.from(proof).toString('base64url') };
}
function funding() {
  const requirement = { scheme: 'exact', network: NETWORK, asset: 'synthetic:asset',
    amount: '17', payTo: 'synthetic-payee', maxTimeoutSeconds: 60, extra: { opaque: 'original' } };
  return { revision: 1, status: 'BOUND', ambiguityLatched: false, resourceUrl: FUNDING,
    challengeHeader: 'opaque-original-challenge', paymentHeader: 'opaque-original-payment',
    paymentRequired: { opaque: 'original' }, paymentPayload: { x402Version: 2,
      resource: { url: FUNDING, description: 'declared', mimeType: 'application/json' },
      accepted: requirement, payload: { transaction: { hash: HASH, bytes: 'original-signed-data' },
        intentDigest: 'original-intent' }, extensions: { opaque: 'original' } }, requirement };
}
function record(input, state = funding()) {
  return CAPTURE({ originalRequestJson: input.originalRequestJson,
    originalBodyBase64: '', serviceResourceUrl: SERVICE },
  { fundingResourceUrl: FUNDING, paymentHash: state.paymentPayload.payload.transaction.hash,
    network: state.requirement.network });
}
function capability() {
  let resolve; const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}
function observe(promise) {
  const result = { promise, settled: false };
  result.outcome = promise.then(value => { result.settled = true; return { value }; },
    error => { result.settled = true; return { error }; });
  return result;
}
function failure(result, prefix, suffix) {
  assert.deepEqual(Object.keys(result), ['error']);
  const error = result.error;
  assert.equal(Object.getPrototypeOf(error), TypeError.prototype); assert.ok(Object.isFrozen(error));
  assert.equal(error.code, prefix + suffix); assert.equal(error.message, error.code);
  assert.equal(error.stack, 'TypeError: ' + error.code);
  assert.equal(Object.hasOwn(error, 'cause'), false);
}
async function turns() { await undefined; await undefined; await undefined; }
function opaqueReason() {
  const hook = () => { totals.rawReasonHooks++; throw Error('PRIVATE'); };
  return new Proxy({}, { get: hook, ownKeys: hook, getPrototypeOf: hook });
}
class Handle {
  #listeners = new Map();
  #closed = false;
  constructor(f, kind) { this.f = f; this.kind = kind; this.closedInFixture = false; this.destroys = 0; }
  on(event, listener) {
    const list = this.#listeners.get(event) ?? []; list.push(listener);
    this.#listeners.set(event, list); return this;
  }
  emit(event, ...args) { for (const listener of (this.#listeners.get(event) ?? []).slice()) listener(...args); }
  forceClose() {
    if (this.#closed) return;
    this.#closed = true; this.closedInFixture = true; this.emit('close');
  }
  destroy(...args) {
    assert.equal(args.length, 0); this.destroys++;
    totals[this.kind === 'request' ? 'requestDestroys' : 'responseDestroys']++;
    this.f.destroyed.resolve();
    if (this.kind === 'request' ? this.f.requestAutoClose : this.f.responseAutoClose) this.forceClose();
    return this;
  }
}
class Request extends Handle {
  constructor(f) { super(f, 'request'); this.ends = 0; }
  end(...args) { assert.equal(args.length, 0); this.ends++; if (this.f.onEnd) this.f.onEnd(this); return this; }
  write() { throw Error('BODY_WRITE_FORBIDDEN'); }
}
class Response extends Handle {
  constructor(f) {
    super(f, 'response'); this.complete = false; this.statusCode = 200;
    this.rawHeaders = ['Cache-Control', 'private, no-store, max-age=0',
      'Content-Type', 'application/json', 'Vary', 'Authorization',
      'X-Content-Type-Options', 'nosniff', 'Content-Length', String(Buffer.byteLength(REPLY))];
  }
}
function transport(inputs = [inputFor()], settings = {}) {
  const f = { inputs, calls: [], handles: [], destroyed: capability(), onEnd: settings.onEnd,
    requestAutoClose: settings.requestAutoClose === true,
    responseAutoClose: settings.responseAutoClose === true };
  f.requestImpl = function requestImpl(url, options, callback) {
    assert.equal(this, undefined); assert.equal(arguments.length, 3);
    const input = inputs[f.calls.length]; assert.ok(input); totals.requestCalls++;
    assert.equal(url, SERVICE); assert.equal(options.headers.Authorization, input.authorizationHeader);
    assert.deepEqual(Object.keys(options.headers), ['Authorization']); assert.ok(Object.isFrozen(options.headers));
    assert.equal(options.method, 'POST'); assert.equal(options.agent, false);
    assert.equal(options.rejectUnauthorized, true); assert.equal(options.maxHeaderSize, 16384);
    assert.equal(options.insecureHTTPParser, false); assert.ok(Object.isFrozen(options));
    const call = { request: new Request(f), response: null, callback };
    f.calls.push(call); f.handles.push(call.request); return call.request;
  };
  f.respond = call => {
    assert.equal(call.response, null); call.response = new Response(f);
    f.handles.push(call.response); call.callback(call.response); return call.response;
  };
  f.goodEnd = call => {
    call.response.complete = true; call.response.emit('data', Buffer.from(REPLY));
    call.response.emit('end');
  };
  f.complete = call => {
    f.respond(call); f.goodEnd(call); call.request.forceClose(); call.response.forceClose();
  };
  f.cleanup = () => {
    for (const handle of f.handles) handle.forceClose();
    assert.ok(f.handles.every(h => h.closedInFixture));
  };
  return f;
}
function direct(version = 1, deadlineMs = 30, settings = {}) {
  const input = inputFor(), f = transport([input], settings);
  f.adapter = (version === 1 ? V1 : V2)({ resourceUrl: SERVICE,
    originalRequestJson: input.originalRequestJson, authorizationHeader: input.authorizationHeader,
    deadlineMs, requestImpl: f.requestImpl });
  totals.directDispatchers++;
  assert.deepEqual(Object.keys(f.adapter), ['dispatch', 'snapshot']);
  f.record = record(input); f.start = () => {
    f.operation = observe(f.adapter.dispatch(f.record)); return f.operation;
  };
  return f;
}
function terminalUnknown(f, undrained = true) {
  const s = f.adapter.snapshot(); assert.ok(Object.isFrozen(s)); assert.ok(Object.isFrozen(s.counts));
  assert.equal(s.phase, undrained ? 'UNKNOWN_UNDRAINED' : 'UNKNOWN');
  assert.equal(s.used, true); assert.equal(s.settled, true); assert.equal(s.unknown, true);
  assert.equal(s.undrained, undrained); assert.equal(s.timerArmed, false);
  assert.equal(s.credentialReferenceReleased, true); assert.equal(s.counts.requestCalls, 1);
  assert.equal(s.counts.endCalls, 1); assert.equal(s.counts.settlements, 1);
  for (const call of f.calls) {
    assert.equal(call.request.destroys, 1);
    if (call.response !== null) assert.equal(call.response.destroys, 1);
  }
  return s;
}
async function rejectedDirect(f, undrained = true) {
  const result = await f.operation.outcome;
  failure(result, D, undrained ? 'UNKNOWN_UNDRAINED' : 'OUTCOME_UNKNOWN'); totals.directRejected++;
  return terminalUnknown(f, undrained);
}
function key(value) { return JSON.stringify([value.grantId, value.requestId]); }
class Store {
  #f;
  constructor(f) { this.#f = f; }
  load() { return this.#f.state; }
  getOriginalRequest(value) { return this.#f.rows.get(key(value)) ?? null; }
  retainOriginalRequest(value) {
    const f = this.#f; totals.custodyWrites++;
    const row = PARSE(SERIALIZE(record(value, f.state))); f.rows.set(key(row), row); return row;
  }
  fenceOriginalDispatchIntent(value) {
    const f = this.#f; totals.intentWrites++;
    const intent = INTENT(f.rows.get(key(value)), { fundingRevision: f.state.revision,
      challengeDigest: 'sha256:' + 'b'.repeat(64), paymentDigest: 'sha256:' + 'c'.repeat(64),
      custodyPolicy: f.policy });
    f.intents.set(key(value), intent); return intent;
  }
  getOriginalDispatchIntent(value) { return this.#f.intents.get(key(value)) ?? null; }
  close() { totals.borrowedStoreCloses++; throw Error('BORROWED_CLOSE_FORBIDDEN'); }
}
function runner(deadlineMs = 30) {
  const inputs = [inputFor(), inputFor('request.two')], f = transport(inputs);
  f.state = funding(); f.rows = new Map(); f.intents = new Map();
  f.policy = Object.freeze({ policyVersion: 1, maxRequests: 8, serviceResourceUrl: SERVICE });
  f.store = new Store(f);
  f.runner = RUNNER({ store: f.store, fundingResourceUrl: FUNDING, custodyPolicy: f.policy,
    selectedGrantId: GRANT, requestImpl: f.requestImpl, deadlineMs });
  totals.runnerInstances++;
  f.start = () => { totals.runnerRuns++; f.operation = observe(f.runner.runOriginals(inputs)); return f.operation; };
  return f;
}
async function nextCall(f, index) {
  for (let n = 0; n < 32 && f.calls.length <= index; n++) await undefined;
  assert.equal(f.calls.length, index + 1); return f.calls[index];
}

test('V1 missing request close becomes unknown-undrained without retry or synthetic release', OPTIONS, async () => {
  const f = direct(); f.start();
  try {
    await f.destroyed.promise; await turns();
    assert.equal(f.operation.settled, false); assert.equal(f.adapter.snapshot().timerArmed, true);
    assert.equal(f.calls[0].request.closedInFixture, false);
    const s = await rejectedDirect(f); assert.equal(s.deadlineFired, true);
    assert.equal(s.requestClosed, false); assert.equal(s.responseObserved, false);
    const again = observe(f.adapter.dispatch(f.record));
    failure(await again.outcome, D, 'ALREADY_USED'); assert.equal(f.calls.length, 1);
    f.calls[0].request.forceClose(); await turns();
    terminalUnknown(f); assert.equal(f.adapter.snapshot().requestClosed, true);
  } finally { f.cleanup(); await f.operation.outcome; }
});
test('V2 missing response close rejects and late complete reply cannot create a response receipt', OPTIONS, async () => {
  const f = direct(2, 30, { requestAutoClose: true }); f.start();
  try {
    const call = f.calls[0]; f.respond(call); call.response.emit('data', Buffer.from(REPLY));
    await f.destroyed.promise; const s = await rejectedDirect(f);
    assert.equal(s.requestClosed, true); assert.equal(s.responseClosed, false);
    assert.equal(s.replyValidated, false); assert.equal(s.deadlineFired, true);
    f.goodEnd(call); call.response.forceClose(); await turns();
    terminalUnknown(f); assert.equal(f.adapter.snapshot().replyValidated, false);
  } finally { f.cleanup(); await f.operation.outcome; }
});
test('early error uses the capped one-second abort observation instead of the sixty-second request deadline', OPTIONS, async () => {
  const f = direct(1, 60000, { onEnd: request => request.emit('error', opaqueReason()) }); f.start();
  try {
    const s = await rejectedDirect(f);
    assert.equal(s.deadlineFired, false); assert.equal(s.requestClosed, false);
    assert.equal(f.calls.length, 1); assert.equal(totals.rawReasonHooks, 0);
  } finally { f.cleanup(); await f.operation.outcome; }
});
test('actual V3 custodied runner close terminates unknown and never submits its queued second original', OPTIONS, async () => {
  const f = runner(); f.start();
  const closing = observe(f.runner.close());
  assert.equal(f.runner.close(), closing.promise);
  try {
    await f.destroyed.promise; await turns(); assert.equal(closing.settled, false);
    const first = f.inputs[0], originalText = SERIALIZE(f.rows.get(key(first)));
    const intentText = INTENT_TEXT(f.intents.get(key(first))), stateText = JSON.stringify(f.state);
    failure(await f.operation.outcome, R, 'RUN_FAILED'); totals.runnerFailed++;
    failure(await closing.outcome, O, 'CLOSE_FAILED');
    const s = f.runner.snapshot();
    assert.equal(s.phase, 'FAILED'); assert.equal(s.closed, true); assert.equal(s.active, false);
    assert.equal(s.runSettled, true); assert.equal(s.closeCalls, 1); assert.equal(s.closeOutcome, 'REJECTED');
    assert.equal(s.unknown, true); assert.equal(s.unknownUndrained, true);
    assert.deepEqual([s.planned, s.attempted, s.completed, s.notAttempted, s.queuedReferences], [2, 1, 0, 1, 0]);
    assert.equal(s.client.lastTransport.phase, 'UNKNOWN_UNDRAINED');
    assert.equal(s.client.lastTransport.requestClosed, false); assert.equal(s.client.lastTransport.timerArmed, false);
    assert.equal(s.client.owner.uncertainty.submission, true);
    assert.equal(s.client.owner.closeOutcome, 'UNKNOWN');
    assert.equal(f.calls.length, 1); assert.equal(f.rows.size, 1); assert.equal(f.intents.size, 1);
    f.calls[0].request.forceClose(); await turns();
    assert.equal(f.runner.snapshot().unknownUndrained, true);
    assert.equal(SERIALIZE(f.rows.get(key(first))), originalText);
    assert.equal(INTENT_TEXT(f.intents.get(key(first))), intentText);
    assert.equal(JSON.stringify(f.state), stateText);
    assert.equal(f.runner.runOriginals(f.inputs), f.operation.promise);
    failure(await observe(f.runner.runOriginals([inputFor('replacement')])).outcome, R, 'ALREADY_RUN');
    assert.equal(f.runner.close(), closing.promise); assert.equal(f.calls.length, 1);
  } finally { f.cleanup(); await f.operation.outcome; await closing.outcome; }
});
test('normal V2 response bytes and actual V3 two-original completion retain their existing contracts', OPTIONS, async () => {
  const d = direct(2, 2000); d.start();
  try {
    d.complete(d.calls[0]); const result = await d.operation.outcome;
    assert.deepEqual(result, { value: REPLY }); totals.directFulfilled++;
    const s = d.adapter.snapshot(); assert.equal(s.phase, 'INTERFACE_COMPLETED');
    assert.equal(s.unknown, false); assert.equal(s.undrained, false); assert.equal(s.timerArmed, false);
    assert.equal(s.counts.settlements, 1); assert.equal(s.counts.destroyCalls, 0);
  } finally { d.cleanup(); await d.operation.outcome; }
  const f = runner(2000); f.start();
  try {
    f.complete(await nextCall(f, 0)); f.complete(await nextCall(f, 1));
    assert.deepEqual(await f.operation.outcome, { value: undefined }); totals.runnerCompleted++;
    const s = f.runner.snapshot(); assert.equal(s.phase, 'COMPLETED');
    assert.deepEqual([s.planned, s.attempted, s.completed, s.notAttempted, s.queuedReferences], [2, 2, 2, 0, 0]);
    assert.equal(s.closeOutcome, 'FULFILLED'); assert.equal(s.unknown, false);
    assert.equal(s.unknownUndrained, false); assert.equal(s.closeCalls, 1);
    assert.equal(f.rows.size, 2); assert.equal(f.intents.size, 2);
    assert.equal(f.runner.runOriginals(f.inputs), f.operation.promise);
    const closing = f.runner.close(); assert.equal(f.runner.close(), closing); await closing;
  } finally { f.cleanup(); await f.operation.outcome; }
});
test('V1 and V2 observed abort closes before the drain budget remain unknown but not undrained', OPTIONS, async () => {
  for (const version of [1, 2]) {
    const f = direct(version, 60000, { requestAutoClose: true, responseAutoClose: true }); f.start();
    try {
      f.respond(f.calls[0]); f.calls[0].request.emit('error', opaqueReason());
      const s = await rejectedDirect(f, false);
      assert.equal(s.requestClosed, true); assert.equal(s.responseClosed, true);
      assert.equal(s.deadlineFired, false);
    } finally { f.cleanup(); await f.operation.outcome; }
  }
});
test('repeated errors do not renew the one abort-drain budget or repeat destroy and settlement', OPTIONS, async t => {
  const f = direct(2, 60000, { onEnd: request => request.emit('error', opaqueReason()) });
  const timers = new Set(), ordering = [], guard = capability();
  function schedule(callback, ms) {
    let timer; timer = setTimeout(() => { timers.delete(timer); callback(); }, ms); timers.add(timer);
  }
  f.start();
  try {
    await f.destroyed.promise;
    // Use event ordering, not a hard wall-clock or performance claim. The
    // original drain is 1000 ms; renewing it after 750 ms would lose to 1300.
    schedule(() => { ordering.push('REPEATED_ERROR'); f.calls[0].request.emit('error', opaqueReason()); }, 750);
    schedule(() => { ordering.push('GUARD'); guard.resolve(); }, 1300);
    const outcome = f.operation.outcome.then(result => { ordering.push('REJECTED'); return result; });
    failure(await outcome, D, 'UNKNOWN_UNDRAINED'); totals.directRejected++;
    await guard.promise;
    assert.deepEqual(ordering, ['REPEATED_ERROR', 'REJECTED', 'GUARD']);
    terminalUnknown(f); assert.equal(f.adapter.snapshot().deadlineFired, false);
    assert.equal(f.calls[0].request.destroys, 1);
  } finally {
    for (const timer of timers) clearTimeout(timer); timers.clear();
    guard.resolve(); f.cleanup(); await f.operation.outcome;
  }
  assert.deepEqual(totals, { directDispatchers: 7, directRejected: 6, directFulfilled: 1,
    runnerInstances: 2, runnerRuns: 2, runnerFailed: 1, runnerCompleted: 1,
    requestCalls: 10, requestDestroys: 7, responseDestroys: 3, custodyWrites: 3,
    intentWrites: 3, borrowedStoreCloses: 0, rawReasonHooks: 0 });
  t.diagnostic(JSON.stringify({ kind: 'P2_DISPATCH_ABORT_DRAIN', version: 1, ...totals,
    abortDrainPolicy: 'ONE_MIN_DEADLINE_MS_1000_MS_OBSERVATION_BUDGET',
    lateClosesNeverClearUnknown: true, queuedSecondAfterUnknown: 0, timedOutResponseReceipts: 0,
    originalFundingCustodyAndIntentPreserved: true, closePromiseIdentityPreserved: true,
    oldQualificationEntriesRegistered: 0, ownedFixtureTimersRemaining: timers.size,
    sql: 0, sdk: 0, keyGeneration: 0, signatures: 0, sockets: 0, network: 0,
    nonceSearch: 0, realPrepare: 0, payments: 0, nativeTransportQualified: false,
    hardOsDeadlineOrNativeCleanupEstablished: false }));
});
