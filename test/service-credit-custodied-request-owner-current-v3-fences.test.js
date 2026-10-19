import test from 'node:test';
import a from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { setImmediate as immediate } from 'node:timers';
const { equal: q, ok } = a;
const specs = [
  [
    "../src/service-credit-custodied-request-owner.js",
    35073,
    938,
    "6e7493a4859d48530820e68a4a19a513aad014ffc1048b42965a3ad36ae7c5f7"
  ],
  [
    "../src/service-credit-original-request-custody-contract.js",
    14051,
    356,
    "fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915"
  ],
  [
    "../package.json",
    1413,
    40,
    "8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"
  ]
];
const pins = specs.map(([relative, bytes, LF, sha]) => {
  const url = new URL(relative, import.meta.url);
  const raw = readFileSync(url);
  q(raw.length, bytes, 'SOURCE_BYTES');
  q(createHash('sha256').update(raw).digest('hex'), sha, 'SOURCE_SHA256');
  const text = raw.toString('utf8');
  q(/[^\x00-\x7f]/.test(text), false);
  q(text.includes('\0'), false);
  q(text.split('\n').length - 1, LF);
  ok(text.endsWith('\n'));
  return Object.freeze({ url: url.href, text });
});
const pkg = JSON.parse(pins[2].text);
q(pkg.type, 'module');
q(pkg.engines.node, '>=24');
q(process.versions.node, '24.19.0', 'EXACT_NODE_VERSION_REQUIRED');
q(process.argv.length, 2, 'ONE_FILE_PROCESS_REQUIRED');
const { createServiceCreditCustodiedRequestOwnerV3: createOwner } = await import(pins[0].url);
const {
  captureOriginalServiceRequestCustody: capture,
  parseOriginalServiceRequestCustody: parse,
  serializeOriginalServiceRequestCustody: serialize,
  captureOriginalServiceDispatchIntent: captureIntent,
  parseOriginalServiceDispatchIntent: parseIntent,
  serializeOriginalServiceDispatchIntent: serializeIntent,
} = await import(pins[1].url);

// Declared borrowed synchronous data only. No SQL commit or external authority.
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const R = freeze({"custodyVersion":1,"profile":"service-credit.execute.v1.empty-body","originalRequestJson":"{\"modelVersion\":1,\"grantId\":\"grant.owned.recovery.plan\",\"requestId\":\"request.multi.a\",\"method\":\"POST\",\"routeId\":\"service-credit.execute.v1\",\"canonicalBodyDigest\":\"sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\",\"selectedContentType\":\"application/json\",\"maxCostUnits\":7}","originalBodyBase64":"","serviceResourceUrl":"https://owned-plan.example.test/service-credit/v1/execute","fundingResourceUrl":"https://owned-plan.example.test/funding","paymentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","network":"zenon:testnet","grantId":"grant.owned.recovery.plan","requestId":"request.multi.a","checksum":"sha256:c2f63238a0f23d3170b9610af992ba6c8072da7ab45392ce7378a8fc291e7a71"});
const POLICY = freeze({"policyVersion":1,"maxRequests":2,"serviceResourceUrl":"https://owned-plan.example.test/service-credit/v1/execute"});
const K = Object.freeze({ grantId: R.grantId, requestId: R.requestId });
const PREFIX = 'SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const COUNT_KEYS = 'loadReads recordReads retainCalls readbackConfirmations dispatchCalls callbackCompletions intentWrites intentReads intentReadbackConfirmations'.split(' ');
const SPY_KEYS = 'load get catalog retain fence intent send close'.split(' ');
const BINDING = Object.freeze({
  fundingResourceUrl: R.fundingResourceUrl, paymentHash: R.paymentHash, network: R.network,
});
const custodyInput = value => ({
  originalRequestJson: value.originalRequestJson, originalBodyBase64: value.originalBodyBase64,
  serviceResourceUrl: value.serviceResourceUrl,
});
const submitInput = value => ({
  grantId: value.grantId, requestId: value.requestId, ...custodyInput(value),
});
const ORIGINAL_TEXT = serialize(R);
const ORIGINAL_BYTES = Buffer.from(R.originalRequestJson, 'utf8');
function differentOriginal() {
  return capture({
    ...custodyInput(R),
    originalRequestJson: JSON.stringify({
      ...JSON.parse(R.originalRequestJson), maxCostUnits: 8,
    }),
  }, BINDING);
}
function intent(original = R, digest = 'b') {
  return parseIntent(serializeIntent(captureIntent(original, {
    fundingRevision: 3, challengeDigest: 'sha256:' + digest.repeat(64),
    paymentDigest: 'sha256:' + 'c'.repeat(64), custodyPolicy: POLICY,
  })));
}
function funding(revision = 3) {
  return freeze({
    revision, status: 'BOUND', ambiguityLatched: false, resourceUrl: R.fundingResourceUrl,
    challengeHeader: 'declared-opaque-header', paymentHeader: 'declared-opaque-payment',
    paymentRequired: {}, paymentPayload: { x402Version: 2, resource: {}, accepted: {},
      payload: { transaction: { hash: R.paymentHash }, intentDigest: 'declared' } },
    requirement: { scheme: 'exact', network: R.network, asset: 'declared', amount: '1',
      payTo: 'declared', maxTimeoutSeconds: 30, extra: {} },
  });
}
function error(value, suffix) {
  a.equal(Object.getPrototypeOf(value), TypeError.prototype);
  a.equal(value.code, PREFIX + suffix); a.equal(value.message, value.code);
  a.equal(value.stack, 'TypeError: ' + value.code); a.equal(Object.isFrozen(value), true);
  a.deepEqual(Reflect.ownKeys(value).sort(), ['code','message','stack']);
}
function thrown(fn, suffix) {
  a.throws(fn, value => { error(value, suffix); return true; });
}
const outcome = promise => promise.then(value => ({ value }), failure => ({ failure }));
function rejected(result, suffix) {
  a.equal(Object.hasOwn(result, 'failure'), true); error(result.failure, suffix);
}
function fulfilled(result) {
  a.equal(Object.hasOwn(result, 'failure'), false); a.equal(result.value, undefined);
}
const turn = () => new Promise(resolve => immediate(resolve));
async function turns(count) { for (let i = 0; i < count; i++) await turn(); }

function fixture({ catalog = false, configure } = {}) {
  const f = {
    funding: funding(), original: null, retainedText: null, intent: null,
    catalog: Object.freeze([]), trace: [], raw: [],
    calls: Object.fromEntries(SPY_KEYS.map(name => [name, 0])),
  };
  function note(receiver, name, key) {
    a.equal(receiver, store); f.calls[name]++; f.trace.push(name);
    if (key !== undefined) a.deepEqual(key, K);
  }
  const store = {
    load() {
      note(this, 'load');
      return f.onLoad ? f.onLoad(f.calls.load) : f.funding;
    },
    getOriginalRequest(key) {
      note(this, 'get', key);
      if (f.onGet) return f.onGet();
      return f.original === null ? null : parse(serialize(f.original));
    },
    retainOriginalRequest(value) {
      note(this, 'retain'); a.deepEqual(value, submitInput(R));
      f.original = capture(custodyInput(value), BINDING);
      f.retainedText = serialize(f.original);
      return parse(f.retainedText);
    },
    fenceOriginalDispatchIntent(key) {
      note(this, 'fence', key);
      f.intent = intent(f.original);
      return f.onFence ? f.onFence(f.intent) : f.intent;
    },
    getOriginalDispatchIntent(key) {
      note(this, 'intent', key);
      return f.onIntent ? f.onIntent(f.intent)
        : f.intent === null ? null : parseIntent(serializeIntent(f.intent));
    },
    close() { note(this, 'close'); throw Error('BORROWED_CLOSE_FORBIDDEN'); },
  };
  if (catalog) store.listOriginalRequestKeys = function () {
    note(this, 'catalog'); return f.catalog;
  };
  if (configure) configure(store, f);
  f.owner = createOwner({ store, fundingResourceUrl: R.fundingResourceUrl,
    custodyPolicy: POLICY, selectedGrantId: R.grantId });
  f.send = original => {
    f.calls.send++; f.trace.push('send');
    f.atCallback = {
      original, trace: [...f.trace],
      counts: COUNT_KEYS.map(name => f.owner.snapshot().counts[name]),
      intent: f.intent, originalText: f.retainedText,
    };
  };
  return f;
}
function check(f, trace, counts, spies, held, tracked = 0) {
  a.deepEqual(f.trace, trace);
  a.deepEqual(COUNT_KEYS.map(name => f.owner.snapshot().counts[name]), counts);
  a.deepEqual(SPY_KEYS.map(name => f.calls[name]), spies);
  const s = f.owner.snapshot();
  a.equal(s.active, false); a.equal(s.trackedRequests, tracked);
  a.deepEqual(s.uncertainty, { custody: held, submission: false, undrained: false,
    declaredFundingAmbiguitySeen: false });
  a.equal(s.recoveryAuthority, 'NONE'); a.equal(s.serviceOutcome, 'NOT_ESTABLISHED');
  a.equal(s.durability, 'NOT_ESTABLISHED');
  a.equal(s.qualification, 'DECLARED_CALLBACK_LIFECYCLE_ONLY');
}
function retained(f) {
  a.equal(f.retainedText, ORIGINAL_TEXT);
  a.equal(serialize(f.original), ORIGINAL_TEXT); a.deepEqual(f.original, R);
  a.deepEqual(Buffer.from(f.original.originalRequestJson, 'utf8'), ORIGINAL_BYTES);
  a.equal(f.original.originalBodyBase64, '');
  a.deepEqual(submitInput(f.original), submitInput(R));
}
async function close(f, held) {
  const before = f.owner.snapshot();
  const p = f.owner.close(); a.equal(f.owner.close(), p);
  const result = await outcome(p);
  if (held) rejected(result, 'CLOSE_FAILED'); else fulfilled(result);
  const after = f.owner.snapshot();
  a.equal(f.owner.close(), p); a.equal(after.closed, true);
  a.equal(after.closeOutcome, held ? 'UNKNOWN' : 'DRAINED');
  a.deepEqual(after.counts, before.counts);
  a.equal(f.calls.close, 0);
}
async function cleanup(f) {
  // Observe the owner's cached close without assertions in cleanup.
  await f.owner.close().then(() => undefined, () => undefined);
}
function nativeRejected(f, owned) {
  const promise = Promise.reject(Object.freeze({ tag: 'DECLARED_INTENT_RETURN_REJECTION' }));
  f.raw.push(promise); owned.add(promise);
  return promise; // No test-side raw sink before the real-turn measurement.
}

test('V3 submission validates the complete catalog before retention and dispatch', { timeout: 5000, concurrency: false }, async () => {
  const f = fixture({ catalog: true });
  try {
    fulfilled(await outcome(f.owner.submitOriginal(submitInput(R), f.send)));
    const trace = ['load','get','catalog','load','retain','get','load','fence','intent','load','send'];
    check(f, trace, [4,3,1,1,1,1,1,1,1], [4,2,1,1,1,1,1,0], false, 1);
    a.deepEqual(f.atCallback.trace, trace);
    a.deepEqual(f.atCallback.counts, [4,3,1,1,1,0,1,1,1]);
    a.deepEqual(f.atCallback.original, R); a.equal(Object.isFrozen(f.atCallback.original), true);
    a.deepEqual(f.atCallback.intent, intent());
    a.equal(f.atCallback.originalText, ORIGINAL_TEXT);
    a.equal(f.owner.snapshot().phase, 'CALLBACK_COMPLETED');
    retained(f); await close(f, false);
  } finally { await cleanup(f); }

  const cases = [
    { name: 'full-foreign-capacity', raw: Object.freeze([
      Object.freeze({ grantId: 'aaa', requestId: 'one' }),
      Object.freeze({ grantId: 'zzz', requestId: 'two' }),
    ]), code: 'CAPACITY', held: false, loads: 2 },
    { name: 'catalog-key-but-null-get', raw: Object.freeze([K]),
      code: 'CUSTODY_OUTCOME_UNKNOWN', held: true, loads: 2 },
    { name: 'malformed-foreign-key', raw: Object.freeze([
      Object.freeze({ grantId: 'aaa', requestId: 'bad key' }),
    ]), code: 'CUSTODY_OUTCOME_UNKNOWN', held: true, loads: 1 },
    { name: 'catalog-funding-null', raw: Object.freeze([]),
      code: 'CUSTODY_OUTCOME_UNKNOWN', held: true, loads: 2 },
    { name: 'catalog-funding-drift', raw: Object.freeze([]),
      code: 'CUSTODY_OUTCOME_UNKNOWN', held: true, loads: 2 },
  ];
  for (const c of cases) {
    const f = fixture({ catalog: true }); f.catalog = c.raw;
    if (c.name === 'catalog-funding-null') f.onLoad = n => n === 2 ? null : f.funding;
    if (c.name === 'catalog-funding-drift') f.onLoad = n => n === 2 ? funding(4) : f.funding;
    try {
      rejected(await outcome(f.owner.submitOriginal(submitInput(R), f.send)), c.code);
      const trace = c.loads === 2 ? ['load','get','catalog','load'] : ['load','get','catalog'];
      check(f, trace, [c.loads,2,0,0,0,0,0,0,0], [c.loads,1,1,0,0,0,0,0], c.held);
      a.equal(f.original, null); a.equal(f.retainedText, null); a.equal(f.intent, null);
      a.equal(f.calls.send, 0); await close(f, c.held);
    } finally { await cleanup(f); }
  }
});

test('V3 intent and post-intent funding faults hold retained originals without callback', { timeout: 5000, concurrency: false }, async () => {
  const owned = new Set(), events = [];
  const previousListeners = process.listeners('unhandledRejection');
  function onUnhandled(_reason, promise) {
    if (!owned.has(promise)) throw Error('UNOWNED_UNHANDLED_REJECTION');
    events.push(promise);
  }
  process.on('unhandledRejection', onUnhandled); // Add only; never replace existing handlers.
  try {
    const cases = [
      { name: 'fence-throw', reads: 0, loads: 2, raw: 0 },
      { name: 'fence-native-rejection', reads: 0, loads: 2, raw: 1 },
      { name: 'fence-other-original', reads: 0, loads: 2, raw: 0 },
      { name: 'readback-other-intent', reads: 1, loads: 2, raw: 0 },
      { name: 'intent-read-native-rejection', reads: 1, loads: 2, raw: 1 },
      { name: 'after-intent-funding-null', reads: 1, loads: 3, raw: 0 },
      { name: 'after-intent-funding-drift', reads: 1, loads: 3, raw: 0 },
    ];
    for (const c of cases) {
      const f = fixture();
      if (c.name === 'fence-throw') f.onFence = () => { throw Error('DECLARED_FENCE_THROW_AFTER_WRITE'); };
      if (c.name === 'fence-native-rejection') f.onFence = () => nativeRejected(f, owned);
      if (c.name === 'fence-other-original') f.onFence = () => {
        f.intent = intent(differentOriginal()); return f.intent;
      };
      if (c.name === 'readback-other-intent') f.onIntent = () => {
        f.intent = intent(R, 'd'); return f.intent;
      };
      if (c.name === 'intent-read-native-rejection') f.onIntent = () => nativeRejected(f, owned);
      if (c.name === 'after-intent-funding-null') f.onLoad = n => n === 3 ? null : f.funding;
      if (c.name === 'after-intent-funding-drift') f.onLoad = n => n === 3 ? funding(4) : f.funding;
      try {
        const operation = f.owner.submitOriginal(submitInput(R), f.send);
        a.equal(owned.has(operation), false, 'OWNER_RESULT_IS_NOT_RAW_STORE_PROMISE');
        rejected(await outcome(operation), 'CUSTODY_OUTCOME_UNKNOWN');
        const trace = ['load','get','retain','get','load','fence'];
        if (c.reads) trace.push('intent');
        if (c.loads === 3) trace.push('load');
        const counts = [c.loads,2,1,1,0,0,1,c.reads,0];
        const spies = [c.loads,2,0,1,1,c.reads,0,0];
        check(f, trace, counts, spies, true, 1); retained(f);
        a.equal(f.raw.length, c.raw);
        a.equal(f.calls.send, 0);
        if (c.name === 'fence-other-original') {
          a.deepEqual(f.intent, intent(differentOriginal()));
          a.notEqual(serializeIntent(f.intent), serializeIntent(intent()));
          a.deepEqual(parseIntent(serializeIntent(f.intent)), f.intent);
        } else if (c.name === 'readback-other-intent') {
          a.deepEqual(f.intent, intent(R, 'd'));
          a.notEqual(serializeIntent(f.intent), serializeIntent(intent()));
        } else a.deepEqual(f.intent, intent());
        const retainedIntentText = serializeIntent(f.intent);
        await turns(4); // Real setImmediate turns; no test raw handler yet.
        a.equal(events.length, 0, 'NATIVE_STORE_INTENT_REJECTION_UNHANDLED');
        const repeat = f.owner.submitOriginal(submitInput(R), f.send);
        a.equal(owned.has(repeat), false);
        rejected(await outcome(repeat), 'CUSTODY_OUTCOME_UNKNOWN');
        check(f, trace, counts, spies, true, 1); retained(f);
        a.equal(serializeIntent(f.intent), retainedIntentText);
        await close(f, true);
      } finally {
        // Even early assertion failure leaves raw returns unsunk for real turns.
        // Only after that measurement window attach cleanup sinks; no assertions.
        await turns(4);
        await Promise.all(f.raw.map(p => p.then(() => undefined, () => undefined)));
        await cleanup(f);
      }
    }
  } finally {
    process.removeListener('unhandledRejection', onUnhandled); // Our own listener only.
  }
  a.deepEqual(process.listeners('unhandledRejection'), previousListeners);
});

test('V3 recovery state fences absent originals and close reentry', { timeout: 5000, concurrency: false }, async () => {
  const cases = [
    { name: 'stable-null', loads: 2, close: false, held: false, code: null },
    { name: 'first-funding-null', loads: 1, close: false, held: false, code: 'FUNDING_REQUIRED' },
    { name: 'second-funding-null', loads: 2, close: false, held: true, code: 'CUSTODY_OUTCOME_UNKNOWN' },
    { name: 'second-funding-drift', loads: 2, close: false, held: true, code: 'CUSTODY_OUTCOME_UNKNOWN' },
    { name: 'close-stable', loads: 2, close: true, held: false, code: 'CLOSED' },
    { name: 'close-second-null', loads: 2, close: true, held: true, code: 'CUSTODY_OUTCOME_UNKNOWN' },
    { name: 'close-second-drift', loads: 2, close: true, held: true, code: 'CUSTODY_OUTCOME_UNKNOWN' },
  ];
  for (const c of cases) {
    const f = fixture();
    if (c.name === 'first-funding-null') f.onLoad = () => null;
    if (c.name === 'second-funding-null' || c.name === 'close-second-null')
      f.onLoad = n => n === 2 ? null : f.funding;
    if (c.name === 'second-funding-drift' || c.name === 'close-second-drift')
      f.onLoad = n => n === 2 ? funding(4) : f.funding;
    if (c.close) f.onGet = () => {
      f.trace.push('close:requested');
      f.closePromise = f.owner.close();
      f.closeResult = outcome(f.closePromise);
      a.equal(f.owner.close(), f.closePromise);
      return null;
    };
    try {
      if (c.code) thrown(() => f.owner.readOriginalRecoveryState(K), c.code);
      else a.equal(f.owner.readOriginalRecoveryState(K), null);
      const trace = ['load'];
      if (c.name !== 'first-funding-null') {
        trace.push('get'); if (c.close) trace.push('close:requested'); trace.push('load');
      }
      const gets = c.name === 'first-funding-null' ? 0 : 1;
      check(f, trace, [c.loads,gets,0,0,0,0,0,0,0], [c.loads,gets,0,0,0,0,0,0], c.held);
      a.equal(f.original, null); a.equal(f.intent, null); a.equal(f.retainedText, null);
      if (c.close) {
        if (c.held) rejected(await f.closeResult, 'CLOSE_FAILED'); else fulfilled(await f.closeResult);
        a.equal(f.owner.close(), f.closePromise);
      }
      await close(f, c.held);
      thrown(() => f.owner.readOriginalRecoveryState(K), 'CLOSED');
      check(f, trace, [c.loads,gets,0,0,0,0,0,0,0], [c.loads,gets,0,0,0,0,0,0], c.held);
    } finally { await cleanup(f); }
  }
});

function trapCounters() { return { getter: 0, proxy: 0, function: 0, fallback: 0 }; }
function proxyTraps(touched) {
  const trap = () => { touched.proxy++; throw Error('PROXY_TRAP_FORBIDDEN'); };
  return { get: trap, getPrototypeOf: trap, ownKeys: trap, getOwnPropertyDescriptor: trap,
    apply: trap, has: trap, isExtensible: trap, preventExtensions: trap };
}
test('V3 optional catalog descriptors and hostile catalogs refuse without traps', { timeout: 5000, concurrency: false }, async () => {
  for (const kind of ['own-accessor','own-proxy-function']) {
    const touched = trapCounters();
    const f = fixture({ configure(store) {
      Object.setPrototypeOf(store, {
        listOriginalRequestKeys() { touched.fallback++; throw Error('FALLBACK_FORBIDDEN'); },
      });
      if (kind === 'own-accessor') Object.defineProperty(store, 'listOriginalRequestKeys', {
        enumerable: true, configurable: true,
        get() { touched.getter++; throw Error('CATALOG_GETTER_FORBIDDEN'); },
      });
      else Object.defineProperty(store, 'listOriginalRequestKeys', {
        enumerable: true, configurable: true,
        value: new Proxy(function () { touched.function++; }, proxyTraps(touched)),
      });
    } });
    try {
      thrown(() => f.owner.readOriginalRecoveryKeys(), 'RECOVERY_KEYS_UNAVAILABLE');
      check(f, [], [0,0,0,0,0,0,0,0,0], [0,0,0,0,0,0,0,0], false);
      a.deepEqual(touched, trapCounters()); await close(f, false);
      a.deepEqual(touched, trapCounters());
    } finally { await cleanup(f); }
  }

  for (const kind of ['frozen-hole','frozen-index-accessor','frozen-key-accessor','proxy-key','proxy-array']) {
    const touched = trapCounters();
    let raw;
    if (kind === 'frozen-hole') raw = Object.freeze(new Array(1));
    if (kind === 'frozen-index-accessor') {
      raw = [];
      Object.defineProperty(raw, '0', { enumerable: true, configurable: true,
        get() { touched.getter++; throw Error('INDEX_GETTER_FORBIDDEN'); } });
      Object.freeze(raw);
    }
    if (kind === 'frozen-key-accessor') {
      const key = {};
      Object.defineProperty(key, 'grantId', { enumerable: true, configurable: true,
        get() { touched.getter++; throw Error('KEY_GETTER_FORBIDDEN'); } });
      key.requestId = 'foreign'; // Exact field order reaches the accessor-descriptor refusal.
      raw = Object.freeze([Object.freeze(key)]);
    }
    if (kind === 'proxy-key') {
      const key = new Proxy(Object.freeze({ grantId: 'aaa', requestId: 'foreign' }), proxyTraps(touched));
      raw = Object.freeze([key]); // Shallow freeze; never traverse the proxy in test setup.
    }
    if (kind === 'proxy-array') raw = new Proxy(Object.freeze([]), proxyTraps(touched));
    const f = fixture({ catalog: true }); f.catalog = raw;
    try {
      thrown(() => f.owner.readOriginalRecoveryKeys(), 'CUSTODY_OUTCOME_UNKNOWN');
      check(f, ['load','catalog'], [1,1,0,0,0,0,0,0,0], [1,0,1,0,0,0,0,0], true);
      a.equal(f.original, null); a.equal(f.intent, null);
      a.deepEqual(touched, trapCounters()); await close(f, true);
      a.deepEqual(touched, trapCounters());
    } finally { await cleanup(f); }
  }
});
