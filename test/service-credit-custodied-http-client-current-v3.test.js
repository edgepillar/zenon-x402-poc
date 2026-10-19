import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { setTimeout as nativeSetTimeout, clearTimeout as nativeClearTimeout } from 'node:timers';
const sourceSpecs = [["../src/service-credit-custodied-http-client.js",10755,292,"ddbc54faf4a14d95e6274bc9df27b7b49db251bab67c11b871cfb2f9e78b4f15"],["../src/service-credit-custodied-request-owner.js",35073,938,"6e7493a4859d48530820e68a4a19a513aad014ffc1048b42965a3ad36ae7c5f7"],["../src/service-credit-http-execute-dispatch.js",27034,770,"254ba8eef5ea5efb3a1b901be09e9cb33afbc3cfcf63789ca4a23316b6180d1b"],["../src/service-credit-original-request-custody-contract.js",14051,356,"fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915"],["../package.json",1413,40,"8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"]];
for (const [relative, bytes, LF, sha] of sourceSpecs) {
  const raw = readFileSync(new URL(relative, import.meta.url));
  assert.equal(raw.length, bytes, 'SOURCE_BYTES');
  assert.equal(createHash('sha256').update(raw).digest('hex'), sha, 'SOURCE_SHA256');
  const text = raw.toString('utf8');
  assert.equal(/[^\x00-\x7f]/.test(text), false);
  assert.equal(text.includes('\0'), false);
  assert.equal(text.split('\n').length - 1, LF);
  assert.ok(text.endsWith('\n'));
  if (relative === '../package.json') {
    const pkg = JSON.parse(text);
    assert.equal(pkg.type, 'module'); assert.equal(pkg.engines.node, '>=24');
  }
}
assert.equal(process.versions.node, '24.19.0', 'EXACT_NODE_VERSION_REQUIRED');
assert.equal(process.argv.length, 2, 'ONE_FILE_PROCESS_REQUIRED');
const clientModule = await import('../src/service-credit-custodied-http-client.js');
const {
  captureOriginalServiceRequestCustody: CAPTURE,
  serializeOriginalServiceRequestCustody: SERIALIZE,
  parseOriginalServiceRequestCustody: PARSE,
  captureOriginalServiceDispatchIntent: CAPTURE_INTENT,
  serializeOriginalServiceDispatchIntent: SERIALIZE_INTENT,
} = await import('../src/service-credit-original-request-custody-contract.js');
const CREATE = clientModule.createServiceCreditCustodiedHttpClientV3;

// Injected fake interface DATA only; no real transport, proof or signing.
const CP = 'SERVICE_CREDIT_CUSTODIED_HTTP_CLIENT_';
const OP = 'SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const SERVICE = 'https://synthetic.invalid/service-credit/v1/execute';
const FUNDING = 'https://synthetic.invalid/credit';
const GRANT = 'grant.selected';
const HASH = 'a'.repeat(64);
const NETWORK = 'zenon:synthetic';
const EMPTY_DIGEST =
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const SECRET = 'synthetic-private-exception-do-not-expose';
const REPLY = Buffer.from(
  '{"ok":true,"resultCode":"accepted"}',
  'utf8',
);
const APPLY = Reflect.apply;

function originalJson(grantId = GRANT, requestId = 'request.one', cost = 1) {
  return JSON.stringify({
    modelVersion: 1,
    grantId,
    requestId,
    method: 'POST',
    routeId: 'service-credit.execute.v1',
    canonicalBodyDigest: EMPTY_DIGEST,
    selectedContentType: 'application/json',
    maxCostUnits: cost,
  });
}

function proofJson(grantId = GRANT, requestId = 'request.one', cost = 1) {
  // Declared strings only. No key generation, signing or verification.
  return JSON.stringify({
    grantId,
    maxCostUnits: cost,
    proofVersion: 1,
    publicKey: 'declared-public-key',
    requestId,
    signature: 'declared-signature-' + requestId,
  });
}

function authorization(grantId = GRANT, requestId = 'request.one', cost = 1) {
  return 'ServiceCredit '
    + Buffer.from(proofJson(grantId, requestId, cost), 'utf8')
      .toString('base64url');
}

function inputFor(requestId = 'request.one', cost = 1, grantId = GRANT) {
  return {
    grantId,
    requestId,
    originalRequestJson: originalJson(grantId, requestId, cost),
    originalBodyBase64: '',
    serviceResourceUrl: SERVICE,
    authorizationHeader: authorization(grantId, requestId, cost),
  };
}

function keyFor(requestId = 'request.one', grantId = GRANT) {
  return { grantId, requestId };
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
      resource: {
        url: FUNDING,
        description: 'declared synthetic funding',
        mimeType: 'application/json',
      },
      accepted: requirement,
      payload: {
        transaction: {
          hash: HASH,
          bytes: 'opaque-original-signed-block-data',
        },
        intentDigest: 'opaque-original-intent',
      },
      extensions: { opaque: 'original-extension' },
    },
    requirement,
  };
}

function binding(state) {
  return {
    fundingResourceUrl: state.resourceUrl,
    paymentHash: state.paymentPayload.payload.transaction.hash,
    network: state.requirement.network,
  };
}

function custodyFor(input, state) {
  return CAPTURE({
    originalRequestJson: input.originalRequestJson,
    originalBodyBase64: input.originalBodyBase64,
    serviceResourceUrl: input.serviceResourceUrl,
  }, binding(state));
}

function slot(key) {
  return JSON.stringify([key.grantId, key.requestId]);
}

const POLICY = Object.freeze({ policyVersion: 1, maxRequests: 2, serviceResourceUrl: SERVICE });
const COUNT_KEYS = 'loadReads recordReads retainCalls readbackConfirmations dispatchCalls callbackCompletions intentWrites intentReads intentReadbackConfirmations'.split(' ');
function intended(record) {
  return CAPTURE_INTENT(record, { fundingRevision: 1,
    challengeDigest: 'sha256:' + 'b'.repeat(64),
    paymentDigest: 'sha256:' + 'c'.repeat(64), custodyPolicy: POLICY });
}
class Store {
  #f;
  constructor(f) { this.#f = f; }
  load() {
    const f = this.#f; f.log.push('load'); f.loads++;
    return f.onLoad ? f.onLoad(f.loads) : f.state;
  }
  getOriginalRequest(key) {
    const f = this.#f; f.log.push('get'); f.gets++;
    const row = f.rows.get(slot(key)) ?? null;
    return f.onGet ? f.onGet(f.gets, row) : row;
  }
  retainOriginalRequest(input) {
    const f = this.#f; f.log.push('retain'); f.retains++;
    assert.deepEqual(Object.keys(input), [
      'grantId','requestId','originalRequestJson','originalBodyBase64','serviceResourceUrl',
    ]);
    const record = PARSE(SERIALIZE(custodyFor(input, f.state)));
    f.rows.set(slot(record), record); return record;
  }
  fenceOriginalDispatchIntent(key) {
    const f = this.#f; f.log.push('fence'); f.fences++;
    const intent = intended(f.rows.get(slot(key)));
    f.intents.set(slot(key), intent);
    if (f.fenceThrows) throw Error(SECRET);
    return intent;
  }
  getOriginalDispatchIntent(key) {
    const f = this.#f; f.log.push('intent'); f.intentReads++;
    return f.intents.get(slot(key)) ?? null;
  }
  close() { this.#f.storeCloses++; throw Error('BORROWED_CLOSE_FORBIDDEN'); }
  row(key = keyFor()) { return this.#f.rows.get(slot(key)) ?? null; }
  intent(key = keyFor()) { return this.#f.intents.get(slot(key)) ?? null; }
}
class Handle {
  #listeners = new Map();
  #closed = false;
  constructor() { this.destroys = []; }
  on(event, listener) {
    const list = this.#listeners.get(event) ?? [];
    list.push(listener); this.#listeners.set(event, list); return this;
  }
  emit(event, ...args) {
    for (const listener of (this.#listeners.get(event) ?? []).slice()) listener(...args);
  }
  forceClose() {
    if (this.#closed) return; this.#closed = true; this.emit('close');
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
    super(); this.complete = false; this.statusCode = 200;
    this.rawHeaders = [
      'Cache-Control','private, no-store, max-age=0','Content-Type','application/json',
      'Vary','Authorization','X-Content-Type-Options','nosniff','Content-Length',String(REPLY.length),
    ];
  }
}
const EMIT = Handle.prototype.emit, FORCE = Handle.prototype.forceClose;
function fixture({ catalog = false } = {}) {
  const f = { state: funding(), rows: new Map(), intents: new Map(), log: [],
    loads: 0, gets: 0, retains: 0, fences: 0, intentReads: 0, catalogs: 0,
    storeCloses: 0, requests: 0, clients: [], exchanges: [], sinks: [],
    onLoad: null, onGet: null, onRequest: null, fenceThrows: false,
    catalog: Object.freeze([]) };
  f.store = new Store(f);
  if (catalog) f.store.listOriginalRequestKeys = function () {
    assert.equal(this, f.store); f.catalogs++; f.log.push('catalog'); return f.catalog;
  };
  f.observe = promise => {
    const o = { promise, settled: false };
    o.result = promise.then(value => { o.settled = true; return { value }; },
      failure => { o.settled = true; return { failure }; });
    f.sinks.push(o.result); return o;
  };
  f.requestImpl = function (url, options, callback) {
    f.requests++; f.log.push('request');
    const x = { url, options, callback, receiver: this, argc: arguments.length,
      request: new Request(), response: new Response() };
    f.exchanges.push(x);
    f.atRequest = { log: f.log.slice(), owner: f.client.snapshot().owner,
      original: f.store.row(), intent: f.store.intent() };
    if (f.onRequest) f.onRequest(x);
    return x.request;
  };
  f.make = () => {
    f.client = CREATE({ store: f.store, fundingResourceUrl: FUNDING, custodyPolicy: POLICY,
      selectedGrantId: GRANT, requestImpl: f.requestImpl, deadlineMs: 2000 });
    f.clients.push(f.client); return f.client;
  };
  f.respond = x => x.callback(x.response);
  f.endGood = x => {
    x.response.complete = true;
    APPLY(EMIT, x.response, ['data', Buffer.from(REPLY)]);
    APPLY(EMIT, x.response, ['end']);
  };
  f.force = handle => APPLY(FORCE, handle, []);
  return f;
}
function error(e, prefix, code) {
  assert.equal(Object.getPrototypeOf(e), TypeError.prototype);
  assert.equal(e.code, prefix + code); assert.equal(e.message, e.code);
  assert.equal(e.stack, 'TypeError: ' + e.code); assert.equal(Object.isFrozen(e), true);
}
function failed(result, prefix, code) {
  assert.equal(Object.hasOwn(result, 'failure'), true); error(result.failure, prefix, code);
}
function succeeded(result) {
  assert.equal(Object.hasOwn(result, 'failure'), false); assert.equal(result.value, undefined);
}
function throws(fn, prefix, code) {
  assert.throws(fn, e => { error(e, prefix, code); return true; });
}
async function pending(observed) {
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(observed.settled, false, 'WAITING_FOR_DECLARED_INTERFACE_CLOSES');
}
function redacted(client) {
  const s = client.snapshot(); assert.equal(Object.isFrozen(s), true);
  assert.equal(Object.isFrozen(s.owner), true);
  assert.equal(Object.isFrozen(s.owner.counts), true);
  assert.equal(Object.isFrozen(s.owner.uncertainty), true);
  if (s.lastTransport) {
    assert.equal(Object.isFrozen(s.lastTransport), true);
    assert.equal(Object.isFrozen(s.lastTransport.counts), true);
  }
  const text = JSON.stringify(s);
  for (const secret of [SERVICE,FUNDING,HASH,GRANT,'ServiceCredit ','declared-signature','declared-public-key',SECRET])
    assert.equal(text.includes(secret), false);
  assert.equal(s.storeOwnership, 'BORROWED'); assert.equal(s.boundEstablishesAuthority, false);
  assert.equal(s.qualification, 'SYNTHETIC_COMPOSITION_ONLY');
  for (const key of ['serviceDelivery','currentAuthority','realReady','durability','restart','pilot'])
    assert.equal(s[key], 'NOT_ESTABLISHED');
  assert.equal(frozenMethods(client), true);
}
function frozenMethods(client) {
  return Object.isFrozen(client) && Object.values(client).every(value => typeof value === 'function' && Object.isFrozen(value));
}
function exactOriginal(f, input = inputFor()) {
  const row = f.store.row(keyFor(input.requestId, input.grantId));
  assert.equal(SERIALIZE(row), SERIALIZE(custodyFor(input, f.state)));
  assert.equal(row.originalRequestJson, input.originalRequestJson);
  assert.deepEqual(Buffer.from(row.originalRequestJson), Buffer.from(input.originalRequestJson));
  assert.equal(row.originalBodyBase64, '');
  assert.equal(JSON.stringify(row).includes(input.authorizationHeader), false);
  assert.equal(JSON.stringify(row).includes('ServiceCredit '), false);
  assert.equal(JSON.stringify(row).includes('declared-signature'), false);
  return row;
}
async function close(f, client, held) {
  const c = f.observe(client.close()); assert.equal(client.close(), c.promise);
  const result = await c.result;
  if (held) failed(result, OP, 'CLOSE_FAILED'); else succeeded(result);
  assert.equal(client.close(), c.promise);
  assert.equal(client.snapshot().owner.closeOutcome, held ? 'UNKNOWN' : 'DRAINED');
  assert.equal(f.storeCloses, 0);
}
async function cleanup(f) {
  // Declared fake close events only. No assertion can mask the authored failure.
  for (const client of f.clients) f.observe(client.close());
  for (const x of f.exchanges) {
    APPLY(FORCE, x.request, []); APPLY(FORCE, x.response, []);
  }
  await Promise.all(f.sinks);
}

test('V3 client fences exact original and intent before bodyless fake transport and both closes', { timeout: 5000, concurrency: false }, async () => {
  const f = fixture(), client = f.make(), input = inputFor();
  try {
    assert.deepEqual(Object.keys(client), [
      'submitOriginal','readOriginal','readOriginalRecoveryState','readOriginalRecoveryKeys','snapshot','close',
    ]);
    assert.deepEqual(Reflect.ownKeys(client), Object.keys(client));
    assert.equal(frozenMethods(client), true);
    const op = f.observe(client.submitOriginal(input));
    assert.equal(f.requests, 1);
    assert.deepEqual(f.atRequest.log, ['load','get','retain','get','load','fence','intent','load','request']);
    assert.deepEqual(COUNT_KEYS.map(k => f.atRequest.owner.counts[k]), [3,2,1,1,1,0,1,1,1]);
    assert.equal(SERIALIZE(f.atRequest.original), SERIALIZE(custodyFor(input, f.state)));
    assert.equal(SERIALIZE_INTENT(f.atRequest.intent), SERIALIZE_INTENT(intended(f.atRequest.original)));
    const x = f.exchanges[0];
    assert.equal(x.receiver, undefined); assert.equal(x.argc, 3); assert.equal(x.url, SERVICE);
    assert.deepEqual(x.options, { method: 'POST', headers: { Authorization: input.authorizationHeader },
      agent: false, rejectUnauthorized: true, maxHeaderSize: 16384, insecureHTTPParser: false });
    assert.equal(Object.isFrozen(x.options), true); assert.equal(Object.isFrozen(x.options.headers), true);
    assert.deepEqual(x.request.ends, [[]]); assert.equal(x.request.writes, 0);
    f.respond(x); f.endGood(x);
    assert.equal(client.snapshot().lastTransport.replyValidated, true);
    assert.equal(client.snapshot().lastTransport.settled, false); await pending(op);
    f.force(x.request); await pending(op);
    f.force(x.response); succeeded(await op.result);
    const snap = client.snapshot();
    assert.equal(snap.owner.phase, 'CALLBACK_COMPLETED');
    assert.equal(snap.owner.counts.callbackCompletions, 1);
    assert.equal(snap.lastTransport.phase, 'INTERFACE_COMPLETED');
    assert.equal(snap.lastTransport.timerArmed, false);
    assert.equal(snap.lastTransport.credentialReferenceReleased, true);
    exactOriginal(f, input); redacted(client);
    const before = [f.retains,f.fences,f.intentReads,f.requests];
    const previousTransport = client.snapshot().lastTransport;
    failed(await f.observe(client.submitOriginal(input)).result, OP, 'RECOVERY_REQUIRED');
    assert.deepEqual([f.retains,f.fences,f.intentReads,f.requests], before);
    assert.deepEqual(client.snapshot().lastTransport, previousTransport);
    await close(f, client, false); redacted(client);
  } finally { await cleanup(f); }
});

test('V3 client recovery delegates scoped metadata and preserves owner versus client arity errors', { timeout: 5000, concurrency: false }, async () => {
  const f = fixture({ catalog: true }), input = inputFor();
  const row = custodyFor(input, f.state), intent = intended(row);
  f.rows.set(slot(row), row); f.intents.set(slot(row), intent);
  f.catalog = Object.freeze([
    Object.freeze({ grantId: 'aaa', requestId: 'foreign' }), Object.freeze(keyFor()),
  ]);
  const client = f.make();
  try {
    const state = client.readOriginalRecoveryState(keyFor());
    assert.equal(Object.isFrozen(state), true); assert.equal(Object.isFrozen(state.original), true);
    assert.equal(Object.isFrozen(state.dispatchIntent), true); assert.equal(Object.isFrozen(state.uncertainty), true);
    assert.equal(Object.isFrozen(state.funding), true);
    assert.equal(SERIALIZE(state.original), SERIALIZE(row));
    assert.equal(SERIALIZE_INTENT(state.dispatchIntent), SERIALIZE_INTENT(intent));
    assert.deepEqual(state.funding, { revision: 1, status: 'BOUND', ambiguityLatched: false,
      fundingResourceUrl: FUNDING, paymentHash: HASH, network: NETWORK });
    assert.equal(state.authority, 'NONE'); assert.equal(state.qualification, 'UNQUALIFIED');
    assert.equal(state.dispatchStatus, 'POSSIBLY_ATTEMPTED');
    assert.equal(state.serviceOutcome, 'NOT_ESTABLISHED');
    assert.deepEqual(f.log, ['load','get','intent','load']);
    const keys = client.readOriginalRecoveryKeys();
    assert.equal(Object.isFrozen(keys), true); assert.equal(Object.isFrozen(keys.keys), true);
    assert.equal(Object.isFrozen(keys.keys[0]), true); assert.deepEqual(keys.keys, [keyFor()]);
    assert.equal(keys.authority, 'NONE'); assert.equal(keys.qualification, 'UNQUALIFIED');
    assert.deepEqual([keys.mayStartPayment,keys.maySignPayment,keys.mayDispatchService,keys.deliveryConfirmed],
      [false,false,false,false]);
    assert.equal(keys.grantId, GRANT); assert.deepEqual(keys.funding, state.funding);
    assert.equal(Object.isFrozen(keys.funding), true);
    assert.deepEqual(COUNT_KEYS.map(k => client.snapshot().owner.counts[k]), [4,2,0,0,0,0,0,1,0]);
    const before = f.log.slice();
    throws(() => client.readOriginalRecoveryState(keyFor('request.one','foreign')), OP, 'FOREIGN_GRANT');
    throws(() => client.readOriginalRecoveryState(), CP, 'INVALID_INPUT');
    throws(() => client.readOriginalRecoveryState(keyFor(), null), CP, 'INVALID_INPUT');
    throws(() => client.readOriginalRecoveryKeys(keyFor()), OP, 'INVALID_INPUT');
    assert.deepEqual(f.log, before);
    assert.deepEqual([f.retains,f.fences,f.requests], [0,0,0]); assert.equal(f.intentReads, 1);
    assert.equal(client.snapshot().lastTransport, null); redacted(client);
    await close(f, client, false);
    throws(() => client.readOriginalRecoveryState(), CP, 'INVALID_INPUT');
    throws(() => client.readOriginalRecoveryState(keyFor()), OP, 'CLOSED');
    throws(() => client.readOriginalRecoveryKeys(keyFor()), OP, 'CLOSED');
  } finally { await cleanup(f); }

  for (const mode of ['malformed-foreign','unavailable']) {
    const f = fixture({ catalog: mode !== 'unavailable' });
    if (mode === 'malformed-foreign') f.catalog = Object.freeze([
      Object.freeze({ grantId: 'aaa', requestId: 'bad key' }), Object.freeze(keyFor()),
    ]);
    const client = f.make();
    try {
      throws(() => client.readOriginalRecoveryKeys(), OP,
        mode === 'unavailable' ? 'RECOVERY_KEYS_UNAVAILABLE' : 'CUSTODY_OUTCOME_UNKNOWN');
      assert.deepEqual(f.log, mode === 'unavailable' ? [] : ['load','catalog']);
      assert.deepEqual([f.retains,f.fences,f.intentReads,f.requests], [0,0,0,0]);
      assert.equal(client.snapshot().lastTransport, null);
      await close(f, client, mode !== 'unavailable'); redacted(client);
    } finally { await cleanup(f); }
  }
});

test('V3 client custody intent and final funding refusals never invoke fake transport', { timeout: 5000, concurrency: false }, async () => {
  for (const mode of ['custody-readback','intent-fence','post-intent-null','post-intent-drift']) {
    const f = fixture(), client = f.make(), input = inputFor();
    if (mode === 'custody-readback') f.onGet = (n, row) => n === 2 ? { ...row, checksum: 'invalid' } : row;
    if (mode === 'intent-fence') f.fenceThrows = true;
    if (mode === 'post-intent-null') f.onLoad = n => n === 3 ? null : f.state;
    if (mode === 'post-intent-drift') f.onLoad = n => n === 3 ? { ...f.state, revision: 2 } : f.state;
    try {
      failed(await f.observe(client.submitOriginal(input)).result, OP, 'CUSTODY_OUTCOME_UNKNOWN');
      const expected = mode === 'custody-readback' ? [1,2,1,0,0,0,0,0,0]
        : mode === 'intent-fence' ? [2,2,1,1,0,0,1,0,0] : [3,2,1,1,0,0,1,1,0];
      assert.deepEqual(COUNT_KEYS.map(k => client.snapshot().owner.counts[k]), expected);
      assert.equal(client.snapshot().owner.uncertainty.custody, true);
      assert.equal(client.snapshot().owner.trackedRequests, 1);
      assert.equal(f.requests, 0); assert.equal(client.snapshot().lastTransport, null);
      const row = exactOriginal(f, input);
      if (mode === 'custody-readback') assert.equal(f.store.intent(), null);
      else assert.equal(SERIALIZE_INTENT(f.store.intent()), SERIALIZE_INTENT(intended(row)));
      const log = f.log.slice(), intentText = f.store.intent() && SERIALIZE_INTENT(f.store.intent());
      failed(await f.observe(client.submitOriginal(input)).result, CP, 'CUSTODY_OUTCOME_UNKNOWN');
      assert.deepEqual(f.log, log); assert.equal(f.requests, 0);
      assert.equal(client.snapshot().lastTransport, null);
      assert.equal(f.store.intent() && SERIALIZE_INTENT(f.store.intent()), intentText);
      exactOriginal(f, input); redacted(client); await close(f, client, true);
    } finally { await cleanup(f); }
  }
});

test('V3 client busy reentrant close and uncertain fake outcomes retain drain and recovery boundaries', { timeout: 5000, concurrency: false }, async () => {
  for (const mode of ['reentrant-success','uncertain-response']) {
    const f = fixture(), client = f.make(), input = inputFor();
    let busy, future, closing, busyState, busyKeys;
    if (mode === 'reentrant-success') f.onRequest = () => {
      busy = f.observe(client.submitOriginal(inputFor('request.nested')));
      try { client.readOriginalRecoveryState(keyFor()); } catch (e) { busyState = e; }
      try { client.readOriginalRecoveryKeys(); } catch (e) { busyKeys = e; }
      closing = f.observe(client.close());
      future = f.observe(client.submitOriginal(inputFor('request.future')));
    };
    try {
      const op = f.observe(client.submitOriginal(input)), x = f.exchanges[0];
      assert.equal(f.requests, 1); assert.deepEqual(x.request.ends, [[]]);
      if (mode === 'reentrant-success') {
        failed(await busy.result, CP, 'BUSY'); failed(await future.result, CP, 'CLOSED');
        error(busyState, OP, 'BUSY'); error(busyKeys, OP, 'BUSY');
        assert.equal(client.close(), closing.promise);
        await pending(op); await pending(closing);
        f.respond(x); f.endGood(x); f.force(x.response);
        await pending(op); await pending(closing);
        f.force(x.request); succeeded(await op.result); succeeded(await closing.result);
        assert.equal(client.close(), closing.promise);
        assert.equal(client.snapshot().owner.closeOutcome, 'DRAINED');
        assert.equal(client.snapshot().lastTransport.phase, 'INTERFACE_COMPLETED');
      } else {
        x.response.statusCode = 503; f.respond(x);
        assert.equal(x.request.destroys.length, 1); assert.equal(x.response.destroys.length, 1);
        assert.deepEqual(x.request.destroys[0], []); assert.deepEqual(x.response.destroys[0], []);
        await pending(op); f.force(x.request); await pending(op); f.force(x.response);
        failed(await op.result, OP, 'SUBMISSION_OUTCOME_UNKNOWN');
        assert.equal(client.snapshot().lastTransport.phase, 'UNKNOWN');
        assert.equal(client.snapshot().owner.uncertainty.submission, true);
        const log = f.log.slice();
        failed(await f.observe(client.submitOriginal(input)).result, CP, 'SUBMISSION_OUTCOME_UNKNOWN');
        assert.deepEqual(f.log, log); assert.equal(f.requests, 1);
        const state = client.readOriginalRecoveryState(keyFor());
        assert.equal(state.dispatchStatus, 'POSSIBLY_ATTEMPTED');
        assert.equal(state.authority, 'NONE'); assert.equal(state.qualification, 'UNQUALIFIED');
        assert.equal(state.uncertainty.submission, true);
        assert.equal(SERIALIZE(state.original), SERIALIZE(f.store.row()));
        assert.equal(SERIALIZE_INTENT(state.dispatchIntent), SERIALIZE_INTENT(f.store.intent()));
        assert.equal(f.requests, 1);
        await close(f, client, true);
      }
      exactOriginal(f, input); redacted(client);
      assert.equal(client.snapshot().lastTransport.timerArmed, false);
      assert.equal(client.snapshot().lastTransport.counts.settlements, 1);
      failed(await f.observe(client.submitOriginal(inputFor('request.after-close'))).result, CP, 'CLOSED');
      assert.equal(f.requests, 1); assert.equal(f.storeCloses, 0);
    } finally { await cleanup(f); }
  }
});
