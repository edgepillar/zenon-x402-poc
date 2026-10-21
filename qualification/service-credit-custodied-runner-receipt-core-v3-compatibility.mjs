// Versioned compatibility selection for the accepted-run receipt identity fix.
// Preserved entry: test/service-credit-custodied-sequential-runner-current-v3.test.js
// Preserved entry SHA-256: 2788ee1eea7448f412db0451fe9bb18b05a33d8b0b4af6fdf1aba6eff3f71d04
// Only the core sourceSpecs tuple is updated below; every authored test,
// assertion, helper and guard is otherwise preserved byte-for-byte.
// Removing this header and restoring that tuple recovers the preserved entry.
// Historical entries and outcomes remain unchanged; this is a new graph.
// Authored registrations: 5. Explicit single-file process only.
// Actual borrowed client/owner/dispatcher modules use declared in-memory
// store and transport interfaces. No SQL, SDK, keys, signatures or sockets.
// Selected component results are not whole-P2, restart, delivery or pilot proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { setTimeout as nativeSetTimeout, clearTimeout as nativeClearTimeout } from 'node:timers';
const sourceSpecs = [["../src/service-credit-custodied-sequential-runner.js",4184,93,"793c2d383e6b96f75ed676fe98a274b8777e293b9bef56eed028f0825df31326"],["../src/service-credit-custodied-sequential-runner-core.js",15749,489,"42b5f7d7f1f8318ff50dd79d1729d93220c51ab95a7449610d44de91916c7914"],["../src/service-credit-custodied-http-client.js",10755,292,"ddbc54faf4a14d95e6274bc9df27b7b49db251bab67c11b871cfb2f9e78b4f15"],["../src/service-credit-custodied-request-owner.js",35073,938,"6e7493a4859d48530820e68a4a19a513aad014ffc1048b42965a3ad36ae7c5f7"],["../src/service-credit-http-execute-dispatch.js",27034,770,"254ba8eef5ea5efb3a1b901be09e9cb33afbc3cfcf63789ca4a23316b6180d1b"],["../src/service-credit-original-request-custody-contract.js",14051,356,"fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915"],["../package.json",1413,40,"8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"]];
for (const [relative, bytes, LF, sha] of sourceSpecs) {
  const raw = readFileSync(new URL(relative, import.meta.url));
  assert.equal(raw.length, bytes, 'SOURCE_BYTES');
  assert.equal(createHash('sha256').update(raw).digest('hex'), sha, 'SOURCE_SHA256');
  const text = raw.toString('utf8');
  assert.equal(/[^\x00-\x7f]/.test(text), false); assert.equal(text.includes('\0'), false);
  assert.equal(text.split('\n').length - 1, LF); assert.ok(text.endsWith('\n'));
  if (relative === '../package.json') {
    const pkg = JSON.parse(text);
    assert.equal(pkg.type, 'module'); assert.equal(pkg.engines.node, '>=24');
  }
}
assert.equal(process.versions.node, '24.19.0', 'EXACT_NODE_VERSION_REQUIRED');
assert.equal(process.argv.length, 2, 'ONE_FILE_PROCESS_REQUIRED');
const runnerModule = await import('../src/service-credit-custodied-sequential-runner.js');
const CREATE = runnerModule.createServiceCreditCustodiedSequentialRunner;
const CREATE_V3 = runnerModule.createServiceCreditCustodiedSequentialRunnerV3;
const { createServiceCreditCustodiedSequentialRunnerCore: CREATE_CORE } =
  await import('../src/service-credit-custodied-sequential-runner-core.js');
const {
  captureOriginalServiceRequestCustody: CAPTURE,
  serializeOriginalServiceRequestCustody: SERIALIZE,
  parseOriginalServiceRequestCustody: PARSE,
  captureOriginalServiceDispatchIntent: CAPTURE_INTENT,
  serializeOriginalServiceDispatchIntent: SERIALIZE_INTENT,
} = await import('../src/service-credit-original-request-custody-contract.js');

// Owned in-memory fake interface events only, never sockets or signing.
const RP = 'SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_';
const CP = 'SERVICE_CREDIT_CUSTODIED_HTTP_CLIENT_';
const OP = 'SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const SERVICE = 'https://synthetic.invalid/service-credit/v1/execute';
const FUNDING = 'https://synthetic.invalid/credit';
const GRANT = 'grant.selected';
const HASH = 'a'.repeat(64);
const NETWORK = 'zenon:synthetic';
const SECRET = 'synthetic-private-exception-do-not-expose';
const EMPTY_DIGEST =
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const REPLY = Buffer.from('{"ok":true,"resultCode":"accepted"}', 'utf8');
const APPLY = Reflect.apply;

function inputFor(requestId = 'request.one', cost = 1, grantId = GRANT) {
  const originalRequestJson = JSON.stringify({
    modelVersion: 1,
    grantId,
    requestId,
    method: 'POST',
    routeId: 'service-credit.execute.v1',
    canonicalBodyDigest: EMPTY_DIGEST,
    selectedContentType: 'application/json',
    maxCostUnits: cost,
  });
  // Declared metadata strings only. No keys, signature or proof operation.
  const proof = JSON.stringify({
    grantId,
    maxCostUnits: cost,
    proofVersion: 1,
    publicKey: 'declared-public-key',
    requestId,
    signature: 'declared-signature-' + requestId,
  });
  return {
    grantId,
    requestId,
    originalRequestJson,
    originalBodyBase64: '',
    serviceResourceUrl: SERVICE,
    authorizationHeader: 'ServiceCredit '
      + Buffer.from(proof, 'utf8').toString('base64url'),
  };
}

function keyFor(value = inputFor()) {
  return { grantId: value.grantId, requestId: value.requestId };
}

function funding() {
  const requirement = {
    scheme: 'exact',
    network: NETWORK,
    asset: 'synthetic:asset',
    amount: '17',
    payTo: 'synthetic-payee',
    maxTimeoutSeconds: 60,
    extra: { opaque: 'original-requirement-extra' },
  };
  return {
    revision: 1,
    status: 'BOUND',
    ambiguityLatched: false,
    resourceUrl: FUNDING,
    challengeHeader: 'opaque-original-challenge',
    paymentHeader: 'opaque-original-payment-header',
    paymentRequired: { opaque: 'original-payment-required' },
    paymentPayload: {
      x402Version: 2,
      resource: { url: FUNDING, description: 'declared', mimeType: 'application/json' },
      accepted: requirement,
      payload: {
        transaction: { hash: HASH, bytes: 'opaque-original-signed-block-data' },
        intentDigest: 'opaque-original-intent',
      },
      extensions: { opaque: 'original-extension' },
    },
    requirement,
  };
}

function custodyFor(value, state) {
  return CAPTURE({
    originalRequestJson: value.originalRequestJson,
    originalBodyBase64: value.originalBodyBase64,
    serviceResourceUrl: value.serviceResourceUrl,
  }, {
    fundingResourceUrl: state.resourceUrl,
    paymentHash: state.paymentPayload.payload.transaction.hash,
    network: state.requirement.network,
  });
}

function slot(key) {
  return JSON.stringify([key.grantId, key.requestId]);
}

const COUNT_KEYS = 'loadReads recordReads retainCalls readbackConfirmations dispatchCalls callbackCompletions intentWrites intentReads intentReadbackConfirmations'.split(' ');
class Store {
  #f;
  constructor(f) { this.#f = f; }
  load() {
    const f = this.#f; f.loads++; f.log.push('load');
    if (f.mode === 'post-intent-null' && f.loads === 6) return null;
    return f.state;
  }
  getOriginalRequest(key) {
    const f = this.#f; f.gets++; f.log.push('get:' + key.requestId);
    const row = f.rows.get(slot(key)) ?? null;
    if (f.mode === 'custody-readback' && f.gets === 4)
      return { ...row, checksum: 'invalid' };
    return row;
  }
  retainOriginalRequest(value) {
    const f = this.#f; f.retains++; f.log.push('retain:' + value.requestId);
    assert.deepEqual(Object.keys(value), [
      'grantId','requestId','originalRequestJson','originalBodyBase64','serviceResourceUrl',
    ]);
    const row = PARSE(SERIALIZE(custodyFor(value, f.state)));
    f.rows.set(slot(row), row); f.lastRetained = row; return row;
  }
  fenceOriginalDispatchIntent(key) {
    const f = this.#f; f.fences++; f.log.push('fence:' + key.requestId);
    const row = f.rows.get(slot(key));
    const intent = CAPTURE_INTENT(row, { fundingRevision: 1,
      challengeDigest: 'sha256:' + 'b'.repeat(64), paymentDigest: 'sha256:' + 'c'.repeat(64),
      custodyPolicy: f.policy });
    f.intents.set(slot(key), intent);
    if (f.mode === 'intent-write-throw' && key.requestId === 'request.two') throw Error(SECRET);
    return intent;
  }
  getOriginalDispatchIntent(key) {
    const f = this.#f; f.intentReads++; f.log.push('intent:' + key.requestId);
    return f.intents.get(slot(key)) ?? null;
  }
  close() { this.#f.storeCloses++; throw Error('BORROWED_CLOSE_FORBIDDEN'); }
  row(value) { return this.#f.rows.get(slot(value)) ?? null; }
  intent(value) { return this.#f.intents.get(slot(value)) ?? null; }
}
class Handle {
  #listeners = new Map();
  #closed = false;
  constructor() { this.fixtureClosed = false; this.destroys = []; }
  on(event, listener) {
    const list = this.#listeners.get(event) ?? [];
    list.push(listener); this.#listeners.set(event, list); return this;
  }
  emit(event, ...args) {
    for (const listener of (this.#listeners.get(event) ?? []).slice()) listener(...args);
  }
  forceClose() {
    if (this.#closed) return;
    this.#closed = true; this.fixtureClosed = true;
    APPLY(EMIT, this, ['close']);
  }
  destroy(...args) { this.destroys.push(args); return this; }
}
class Request extends Handle {
  constructor() { super(); this.ends = []; this.writes = 0; }
  end(...args) { this.ends.push(args); return this; }
  write() { this.writes++; throw Error('BODY_WRITE_FORBIDDEN'); }
}
class Response extends Handle {
  constructor() {
    super(); this.statusCode = 200; this.complete = false;
    this.rawHeaders = [
      'Cache-Control','private, no-store, max-age=0','Content-Type','application/json',
      'Vary','Authorization','X-Content-Type-Options','nosniff','Content-Length',String(REPLY.length),
    ];
  }
}
const EMIT = Handle.prototype.emit, FORCE = Handle.prototype.forceClose;
function fixture(mode = null) {
  const f = { mode, policy: Object.freeze({ policyVersion: 1, maxRequests: 8, serviceResourceUrl: SERVICE }),
    state: funding(), rows: new Map(), intents: new Map(), log: [], loads: 0, gets: 0,
    retains: 0, fences: 0, intentReads: 0, storeCloses: 0, requests: 0,
    exchanges: [], runners: [], sinks: [], onRequest: null, maxActive: 0, lastRetained: null };
  f.store = new Store(f);
  f.observe = promise => {
    const o = { promise, settled: false };
    o.result = promise.then(value => { o.settled = true; return { value }; },
      failure => { o.settled = true; return { failure }; });
    f.sinks.push(o.result); return o;
  };
  f.requestImpl = function (url, options, callback) {
    const open = f.exchanges.filter(x => !x.request.fixtureClosed || !x.response.fixtureClosed).length;
    f.maxActive = Math.max(f.maxActive, open + 1); f.requests++;
    f.log.push('request:' + f.lastRetained.requestId);
    const x = { url, options, callback, receiver: this, argc: arguments.length,
      request: new Request(), response: new Response(), original: f.lastRetained,
      intent: f.store.intent(f.lastRetained), atEntry: f.runner.snapshot(), trace: f.log.slice() };
    f.exchanges.push(x);
    if (f.onRequest) f.onRequest(x);
    return x.request;
  };
  f.configuration = () => ({ store: f.store, fundingResourceUrl: FUNDING,
    custodyPolicy: f.policy, selectedGrantId: GRANT, requestImpl: f.requestImpl, deadlineMs: 2000 });
  f.make = () => { f.runner = CREATE_V3(f.configuration()); f.runners.push(f.runner); return f.runner; };
  f.respond = x => x.callback(x.response);
  f.goodEnd = x => {
    x.response.complete = true;
    APPLY(EMIT, x.response, ['data', Buffer.from(REPLY)]);
    APPLY(EMIT, x.response, ['end']);
  };
  f.force = x => APPLY(FORCE, x, []);
  f.complete = x => { f.respond(x); f.goodEnd(x); f.force(x.request); f.force(x.response); };
  return f;
}
function err(e, prefix, suffix) {
  assert.equal(Object.getPrototypeOf(e), TypeError.prototype);
  assert.equal(e.code, prefix + suffix); assert.equal(e.message, e.code);
  assert.equal(e.stack, 'TypeError: ' + e.code); assert.equal(Object.isFrozen(e), true);
}
function failed(result, prefix, suffix) {
  assert.equal(Object.hasOwn(result, 'failure'), true); err(result.failure, prefix, suffix);
}
function succeeded(result) {
  assert.equal(Object.hasOwn(result, 'failure'), false); assert.equal(result.value, undefined);
}
async function pending(o) {
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(o.settled, false);
}
async function exchangeAt(f, index) {
  for (let i = 0; i < 24; i++) {
    if (f.exchanges[index]) return f.exchanges[index];
    await Promise.resolve();
  }
  assert.fail('EXPECTED_NEXT_DECLARED_FAKE');
}
function record(f, input, hasIntent) {
  const row = f.store.row(keyFor(input));
  assert.equal(SERIALIZE(row), SERIALIZE(custodyFor(input, f.state)));
  assert.equal(row.originalRequestJson, input.originalRequestJson);
  assert.deepEqual(Buffer.from(row.originalRequestJson), Buffer.from(input.originalRequestJson));
  assert.equal(row.originalBodyBase64, '');
  assert.equal(JSON.stringify(row).includes('ServiceCredit '), false);
  const intent = f.store.intent(keyFor(input));
  if (!hasIntent) assert.equal(intent, null);
  else {
    const expected = CAPTURE_INTENT(row, { fundingRevision: 1,
      challengeDigest: 'sha256:' + 'b'.repeat(64), paymentDigest: 'sha256:' + 'c'.repeat(64),
      custodyPolicy: f.policy });
    assert.equal(SERIALIZE_INTENT(intent), SERIALIZE_INTENT(expected));
  }
}
function redacted(runner) {
  const s = runner.snapshot();
  for (const value of [s,s.limits,s.client,s.client.owner,s.client.owner.counts,s.client.owner.uncertainty])
    assert.equal(Object.isFrozen(value), true);
  if (s.client.lastTransport) {
    assert.equal(Object.isFrozen(s.client.lastTransport), true);
    assert.equal(Object.isFrozen(s.client.lastTransport.counts), true);
  }
  for (const secret of [SERVICE,FUNDING,HASH,GRANT,'ServiceCredit ','declared-signature','declared-public-key',SECRET])
    assert.equal(JSON.stringify(s).includes(secret), false);
  assert.equal(s.storeOwnership, 'BORROWED');
  assert.equal(s.qualification, 'SYNTHETIC_SEQUENTIAL_INTERFACE_ONLY');
  for (const key of ['serviceDelivery','currentAuthority','realReady','durability','restart','osCleanup'])
    assert.equal(s[key], 'NOT_ESTABLISHED');
}
function summary(runner, expected) {
  const s = runner.snapshot();
  for (const [key,value] of Object.entries(expected)) assert.equal(s[key], value, key);
  return s;
}
async function closed(f, runner, held) {
  const c = f.observe(runner.close()); assert.equal(runner.close(), c.promise);
  assert.equal(Object.getPrototypeOf(c.promise), Promise.prototype);
  if (held) failed(await c.result, OP, 'CLOSE_FAILED'); else succeeded(await c.result);
  assert.equal(runner.close(), c.promise);
  assert.equal(f.storeCloses, 0);
}
async function cleanup(f) {
  // Only owned declared fake events. No assertion replaces an authored failure.
  for (const r of f.runners) f.observe(r.close());
  for (const x of f.exchanges) { APPLY(FORCE, x.request, []); APPLY(FORCE, x.response, []); }
  await Promise.all(f.sinks);
}

test('V3 sequential opt-in fences two originals and preserves the one-shot receipt and borrowed close', { timeout: 5000, concurrency: false }, async () => {
  const f = fixture(), runner = f.make();
  const inputs = [inputFor(), inputFor('request.two', 2)], batch = inputs.map(x => ({ ...x }));
  try {
    assert.deepEqual(Object.keys(runnerModule), [
      'createServiceCreditCustodiedSequentialRunner','createServiceCreditCustodiedSequentialRunnerV3',
    ]);
    assert.deepEqual(Object.keys(runner), ['runOriginals','snapshot','close']);
    assert.equal(Object.isFrozen(runner), true);
    for (const fn of Object.values(runner)) assert.equal(Object.isFrozen(fn), true);
    assert.throws(() => CREATE_V3(), e => { err(e, RP, 'INVALID_CONFIGURATION'); return true; });
    assert.throws(() => CREATE_V3(f.configuration(), null), e => { err(e, RP, 'INVALID_CONFIGURATION'); return true; });
    const run = f.observe(runner.runOriginals(batch));
    assert.equal(Object.getPrototypeOf(run.promise), Promise.prototype);
    assert.equal(f.requests, 1);
    const first = f.exchanges[0];
    assert.deepEqual(first.trace, [
      'load','get:request.one','retain:request.one','get:request.one','load',
      'fence:request.one','intent:request.one','load','request:request.one',
    ]);
    assert.deepEqual(COUNT_KEYS.map(k => first.atEntry.client.owner.counts[k]), [3,2,1,1,1,0,1,1,1]);
    assert.deepEqual([first.atEntry.planned,first.atEntry.attempted,first.atEntry.completed,first.atEntry.queuedReferences], [2,1,0,1]);
    f.respond(first); f.goodEnd(first); await pending(run);
    assert.equal(f.requests, 1); assert.equal(f.store.row(keyFor(inputs[1])), null);
    f.force(first.request); await pending(run); assert.equal(f.requests, 1);
    f.force(first.response);
    const second = await exchangeAt(f, 1);
    assert.equal(first.request.fixtureClosed, true); assert.equal(first.response.fixtureClosed, true);
    assert.deepEqual(COUNT_KEYS.map(k => second.atEntry.client.owner.counts[k]), [6,4,2,2,2,1,2,2,2]);
    assert.equal(second.atEntry.attempted, 2); assert.equal(second.atEntry.completed, 1);
    for (let i = 0; i < 2; i++) {
      const x = f.exchanges[i], input = inputs[i];
      assert.equal(x.receiver, undefined); assert.equal(x.argc, 3); assert.equal(x.url, SERVICE);
      assert.deepEqual(x.options, { method: 'POST', headers: { Authorization: input.authorizationHeader },
        agent: false, rejectUnauthorized: true, maxHeaderSize: 16384, insecureHTTPParser: false });
      assert.equal(Object.isFrozen(x.options), true); assert.equal(Object.isFrozen(x.options.headers), true);
      assert.deepEqual(x.request.ends, [[]]); assert.equal(x.request.writes, 0);
      assert.equal(SERIALIZE(x.original), SERIALIZE(custodyFor(input, f.state)));
      assert.deepEqual(x.trace.slice(-9), ['load','get:' + input.requestId,'retain:' + input.requestId,
        'get:' + input.requestId,'load','fence:' + input.requestId,'intent:' + input.requestId,'load','request:' + input.requestId]);
      const beforeRequestIntent = CAPTURE_INTENT(x.original, { fundingRevision: 1,
        challengeDigest: 'sha256:' + 'b'.repeat(64), paymentDigest: 'sha256:' + 'c'.repeat(64), custodyPolicy: f.policy });
      assert.equal(SERIALIZE_INTENT(x.intent), SERIALIZE_INTENT(beforeRequestIntent));
      record(f, input, true);
    }
    f.complete(second); succeeded(await run.result);
    summary(runner, { phase: 'COMPLETED', outcome: 'CALLBACKS_COMPLETED', planned: 2,
      attempted: 2, completed: 2, notAttempted: 0, queuedReferences: 0,
      closeCalls: 1, closeOutcome: 'FULFILLED', unknown: false });
    assert.equal(f.maxActive, 1);
    assert.deepEqual([f.retains,f.fences,f.intentReads,f.requests], [2,2,2,2]);
    assert.equal(runner.snapshot().client.lastTransport.timerArmed, false);
    const before = f.log.slice();
    batch[0] = null; batch.push({ ignored: true });
    assert.equal(runner.runOriginals(batch), run.promise);
    failed(await f.observe(runner.runOriginals([inputFor('replacement')])).result, RP, 'ALREADY_RUN');
    assert.deepEqual(f.log, before); assert.equal(f.requests, 2);
    await closed(f, runner, false); redacted(runner);
  } finally { await cleanup(f); }

  let calls = 0, storeCloses = 0;
  const store = { load() { calls++; return funding(); }, getOriginalRequest() { calls++; return null; },
    retainOriginalRequest() { calls++; throw Error('UNUSED'); }, close() { storeCloses++; } };
  const config = { store, fundingResourceUrl: FUNDING,
    custodyPolicy: Object.freeze({ policyVersion: 1, maxRequests: 8, serviceResourceUrl: SERVICE }),
    selectedGrantId: GRANT, requestImpl() { calls++; throw Error('UNUSED'); }, deadlineMs: 2000 };
  const legacy = CREATE(config);
  assert.equal(calls, 0);
  assert.throws(() => CREATE_V3(config), e => { err(e, RP, 'INVALID_CONFIGURATION'); return true; });
  assert.equal(calls, 0); assert.deepEqual(Object.keys(legacy), ['runOriginals','snapshot','close']);
  const p = legacy.close(), observed = p.then(value => ({ value }), failure => ({ failure }));
  assert.equal(legacy.close(), p); succeeded(await observed);
  assert.equal(calls, 0); assert.equal(storeCloses, 0);
});

test('V3 sequential mid-batch refusals preserve partial completion and never dispatch queued originals', { timeout: 5000, concurrency: false }, async () => {
  for (const mode of ['intent-write-throw','post-intent-null','custody-readback']) {
    const f = fixture(mode), runner = f.make();
    const batch = [inputFor(), inputFor('request.two', 2), inputFor('request.three', 3)];
    try {
      const run = f.observe(runner.runOriginals(batch));
      f.complete(f.exchanges[0]); failed(await run.result, RP, 'RUN_FAILED');
      const s = summary(runner, { phase: 'FAILED', outcome: 'RUN_FAILED', failure: 'ENTRY_REJECTED',
        planned: 3, attempted: 2, completed: 1, notAttempted: 1, queuedReferences: 0,
        closeCalls: 1, closeOutcome: 'REJECTED', unknown: true, unknownUndrained: false });
      const counts = mode === 'custody-readback' ? [4,4,2,1,1,1,1,1,1]
        : mode === 'intent-write-throw' ? [5,4,2,2,1,1,2,1,1] : [6,4,2,2,1,1,2,2,1];
      assert.deepEqual(COUNT_KEYS.map(k => s.client.owner.counts[k]), counts);
      assert.equal(s.client.owner.uncertainty.custody, true);
      assert.equal(s.client.lastTransport.phase, 'INTERFACE_COMPLETED');
      assert.equal(f.requests, 1); assert.equal(f.rows.size, 2);
      record(f, batch[0], true); record(f, batch[1], mode !== 'custody-readback');
      assert.equal(f.store.row(keyFor(batch[2])), null); assert.equal(f.store.intent(keyFor(batch[2])), null);
      assert.equal(f.log.some(item => item.includes('request.three')), false);
      const before = f.log.slice();
      assert.equal(runner.runOriginals(batch), run.promise);
      failed(await f.observe(runner.runOriginals([inputFor('replacement')])).result, RP, 'ALREADY_RUN');
      assert.deepEqual(f.log, before); assert.equal(f.requests, 1);
      await closed(f, runner, true); redacted(runner);
    } finally { await cleanup(f); }
  }
});

test('V3 sequential manual close stops queued work while draining the active declared interface', { timeout: 5000, concurrency: false }, async () => {
  const idle = fixture(), unused = idle.make();
  try {
    await closed(idle, unused, false);
    failed(await idle.observe(unused.runOriginals([inputFor()])).result, RP, 'CLOSED');
    summary(unused, { phase: 'CLOSED', runClaimed: false, attempted: 0, queuedReferences: 0,
      closeCalls: 1, closeOutcome: 'FULFILLED' });
    assert.deepEqual(idle.log, []); assert.equal(idle.requests, 0);
  } finally { await cleanup(idle); }
  const f = fixture(), runner = f.make();
  const batch = [inputFor(), inputFor('request.two', 2), inputFor('request.three', 3)];
  let closing, receipt, replacement;
  f.onRequest = () => {
    closing = f.observe(runner.close());
    receipt = runner.runOriginals(batch);
    replacement = f.observe(runner.runOriginals([inputFor('replacement')]));
  };
  try {
    const run = f.observe(runner.runOriginals(batch));
    assert.equal(receipt, run.promise); assert.equal(runner.close(), closing.promise);
    failed(await replacement.result, RP, 'ALREADY_RUN');
    assert.equal(runner.snapshot().queuedReferences, 0);
    await pending(run); await pending(closing);
    const x = f.exchanges[0]; f.respond(x); f.goodEnd(x); f.force(x.response);
    await pending(run); await pending(closing); assert.equal(f.requests, 1);
    f.force(x.request); succeeded(await closing.result);
    failed(await run.result, RP, 'RUN_FAILED');
    summary(runner, { phase: 'FAILED', outcome: 'RUN_FAILED', failure: 'CLOSE_REQUESTED',
      planned: 3, attempted: 1, completed: 1, notAttempted: 2, queuedReferences: 0,
      closeCalls: 1, closeOutcome: 'FULFILLED', unknown: false });
    assert.equal(runner.close(), closing.promise); assert.equal(f.requests, 1);
    assert.deepEqual([f.retains,f.fences,f.intentReads], [1,1,1]);
    record(f, batch[0], true); assert.equal(f.store.row(keyFor(batch[1])), null);
    assert.equal(f.store.row(keyFor(batch[2])), null); assert.equal(f.storeCloses, 0); redacted(runner);
  } finally { await cleanup(f); }
});

test('V3 sequential uncertain first transport drains fake handles and preserves failed close and intent', { timeout: 5000, concurrency: false }, async () => {
  const f = fixture(), runner = f.make();
  const batch = [inputFor(), inputFor('request.two', 2), inputFor('request.three', 3)];
  try {
    const run = f.observe(runner.runOriginals(batch)), x = f.exchanges[0];
    x.response.statusCode = 503; f.respond(x);
    assert.deepEqual(x.request.destroys, [[]]); assert.deepEqual(x.response.destroys, [[]]);
    await pending(run); assert.equal(f.requests, 1);
    f.force(x.request); await pending(run); assert.equal(f.requests, 1);
    f.force(x.response); failed(await run.result, RP, 'RUN_FAILED');
    const s = summary(runner, { phase: 'FAILED', failure: 'ENTRY_REJECTED', outcome: 'RUN_FAILED',
      planned: 3, attempted: 1, completed: 0, notAttempted: 2, queuedReferences: 0,
      closeCalls: 1, closeOutcome: 'REJECTED', unknown: true, unknownUndrained: false });
    assert.equal(s.client.owner.uncertainty.submission, true);
    assert.equal(s.client.lastTransport.phase, 'UNKNOWN'); assert.equal(s.client.lastTransport.timerArmed, false);
    record(f, batch[0], true);
    for (const input of batch.slice(1)) {
      assert.equal(f.store.row(keyFor(input)), null); assert.equal(f.store.intent(keyFor(input)), null);
    }
    const before = f.log.slice(); assert.equal(runner.runOriginals(batch), run.promise);
    failed(await f.observe(runner.runOriginals([inputFor('replacement')])).result, RP, 'ALREADY_RUN');
    assert.deepEqual(f.log, before); assert.equal(f.requests, 1);
    await closed(f, runner, true); redacted(runner);
  } finally { await cleanup(f); }
});

test('Sequential core ownership labels are frozen DATA without constructor hooks or SQL authority', { timeout: 5000, concurrency: false }, async () => {
  const calls = { submit: 0, snapshot: 0, close: 0, trap: 0 };
  const view = Object.freeze({ owner: Object.freeze({ uncertainty: Object.freeze({
    custody: false, submission: false, undrained: false,
  }) }), lastTransport: null });
  const cp = Promise.resolve(undefined);
  const config = label => ({
    submitOriginal() { calls.submit++; return Promise.resolve(undefined); },
    snapshot() { calls.snapshot++; return view; },
    close() { calls.close++; return cp; },
    selectedGrantId: GRANT, storeOwnership: label,
  });
  const trap = () => { calls.trap++; throw Error(SECRET); };
  const proxy = new Proxy({}, { get: trap, getPrototypeOf: trap, ownKeys: trap,
    getOwnPropertyDescriptor: trap, has: trap });
  for (const label of ['UNKNOWN', proxy]) {
    assert.throws(() => CREATE_CORE(config(label)), e => { err(e, RP, 'INVALID_CONFIGURATION'); return true; });
  }
  const accessor = config('BORROWED');
  Object.defineProperty(accessor, 'storeOwnership', { enumerable: true, get: trap });
  assert.throws(() => CREATE_CORE(accessor), e => { err(e, RP, 'INVALID_CONFIGURATION'); return true; });
  assert.deepEqual(calls, { submit: 0, snapshot: 0, close: 0, trap: 0 });
  for (const label of ['BORROWED','OWNED_EXISTING_V2','OWNED_EXISTING_V3_DISPATCH_INTENT']) {
    const before = { ...calls }, runner = CREATE_CORE(config(label));
    assert.deepEqual(calls, before);
    const initial = runner.snapshot();
    assert.equal(initial.storeOwnership, label); assert.equal(Object.isFrozen(initial), true);
    assert.equal(Object.isFrozen(initial.client), true);
    assert.equal(initial.qualification, 'SYNTHETIC_SEQUENTIAL_INTERFACE_ONLY');
    for (const key of ['serviceDelivery','currentAuthority','realReady','durability','restart','osCleanup'])
      assert.equal(initial[key], 'NOT_ESTABLISHED');
    const batch = [inputFor()], run = runner.runOriginals(batch);
    const result = run.then(value => ({ value }), failure => ({ failure }));
    succeeded(await result);
    const terminal = runner.snapshot();
    assert.deepEqual([terminal.planned,terminal.attempted,terminal.completed,terminal.notAttempted,
      terminal.queuedReferences,terminal.closeCalls], [1,1,1,0,0,1]);
    assert.equal(terminal.phase, 'COMPLETED'); assert.equal(terminal.closeOutcome, 'FULFILLED');
    assert.equal(terminal.storeOwnership, label); assert.equal(runner.close(), cp);
    batch[0] = null; assert.equal(runner.runOriginals(batch), run);
    assert.equal(calls.submit, before.submit + 1); assert.equal(calls.close, before.close + 1);
    assert.equal(calls.trap, 0);
  }
});
