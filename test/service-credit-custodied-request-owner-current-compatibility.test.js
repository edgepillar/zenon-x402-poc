import test from 'node:test';
import { equal as q, deepEqual as same, notEqual as ne, rejects, throws, ok } from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
// Historical scenarios retained; only the recorded versioned API golden differs.
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
const selector = 'all';
const { createServiceCreditCustodiedRequestOwner: createOwner } = await import(pins[0].url);
const { captureOriginalServiceRequestCustody: capture,
  parseOriginalServiceRequestCustody: parse,
  serializeOriginalServiceRequestCustody: serialize } = await import(pins[1].url);

const P = Promise, THEN = P.prototype.then, APPLY = Reflect.apply;
const FUNDING = 'https://owner.example.test/funding';
const SERVICE = 'https://owner.example.test/service-credit/v1/execute';
const HASH = 'a'.repeat(64);
const NETWORK = 'zenon:declared';
const EMPTY = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const PREFIX = 'SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const CHALLENGE_HEADER = 'DECLARED_CHALLENGE_HEADER_NOT_A_LIVE_CREDENTIAL';
const PAYMENT_HEADER = 'DECLARED_PAYMENT_HEADER_NOT_A_SIGNED_PAYMENT';

const code = suffix => error => error instanceof TypeError
  && error.name === 'TypeError'
  && error.code === PREFIX + suffix
  && error.message === PREFIX + suffix
  && error.stack === 'TypeError: ' + PREFIX + suffix;

function policy(maxRequests = 2) {
  return { policyVersion: 1, maxRequests, serviceResourceUrl: SERVICE };
}
function original(grantId = 'grant_A', requestId = 'request_A', maxCostUnits = 7) {
  return {
    grantId, requestId,
    originalRequestJson: JSON.stringify({
      modelVersion: 1, grantId, requestId, method: 'POST',
      routeId: 'service-credit.execute.v1',
      canonicalBodyDigest: EMPTY,
      selectedContentType: 'application/json',
      maxCostUnits,
    }),
    originalBodyBase64: '',
    serviceResourceUrl: SERVICE,
  };
}
const key = value => ({ grantId: value.grantId, requestId: value.requestId });
const input = value => ({
  originalRequestJson: value.originalRequestJson,
  originalBodyBase64: value.originalBodyBase64,
  serviceResourceUrl: value.serviceResourceUrl,
});
const binding = (hash = HASH) => ({
  fundingResourceUrl: FUNDING, paymentHash: hash, network: NETWORK,
});
function funding({
  status = 'BOUND', revision = 3,
  ambiguityLatched = status === 'OUTCOME_UNKNOWN', hash = HASH,
} = {}) {
  return Object.freeze({
    revision, status, ambiguityLatched, resourceUrl: FUNDING,
    challengeHeader: CHALLENGE_HEADER,
    paymentHeader: PAYMENT_HEADER,
    paymentRequired: Object.freeze({ declared: 'DATA_ONLY' }),
    paymentPayload: Object.freeze({
      x402Version: 2,
      resource: Object.freeze({ url: FUNDING }),
      accepted: Object.freeze({ declared: 'DATA_ONLY' }),
      payload: Object.freeze({
        transaction: Object.freeze({ hash }),
        intentDigest: 'b'.repeat(64),
      }),
    }),
    requirement: Object.freeze({
      scheme: 'exact', network: NETWORK, asset: 'declared-asset',
      amount: '1', payTo: 'declared-payee', maxTimeoutSeconds: 30,
      extra: Object.freeze({ declared: 'DATA_ONLY' }),
    }),
  });
}

// Synthetic synchronous interface, not a SQL evaluator or durability model.
// Actual pure contract exports build/check every synthetic custody record.
class DeclaredStore {
  constructor() {
    this.funding = funding();
    this.rows = new Map();
    this.log = [];
    this.hooks = {};
    this.getCalls = 0;
    this.retainCalls = 0;
    this.closeCalls = 0;
  }
  load() {
    this.log.push('load');
    if (this.hooks.load) return this.hooks.load(this);
    return this.funding;
  }
  getOriginalRequest(value) {
    this.log.push('get');
    this.getCalls++;
    if (this.hooks.get) return this.hooks.get(value, this, this.getCalls);
    return this.stored(value);
  }
  retainOriginalRequest(value) {
    this.log.push('retain');
    this.retainCalls++;
    if (this.hooks.beforeRetain) this.hooks.beforeRetain(value, this);
    const record = capture(input(value), {
      fundingResourceUrl: this.funding.resourceUrl,
      paymentHash: this.funding.paymentPayload.payload.transaction.hash,
      network: this.funding.requirement.network,
    });
    this.seed(record);
    if (this.hooks.afterRetain) this.hooks.afterRetain(record, this);
    if (this.hooks.retainResult) return this.hooks.retainResult(record, this);
    return parse(serialize(record));
  }
  stored(value) {
    const text = this.rows.get(value.grantId)?.get(value.requestId);
    return text === undefined ? null : parse(text);
  }
  seed(record) {
    let requests = this.rows.get(record.grantId);
    if (requests === undefined) {
      requests = new Map();
      this.rows.set(record.grantId, requests);
    }
    requests.set(record.requestId, serialize(record));
  }
  close() {
    this.closeCalls++;
  }
}
function owner(store, maxRequests = 2, selectedGrantId = 'grant_A') {
  return createOwner({
    store, fundingResourceUrl: FUNDING,
    custodyPolicy: policy(maxRequests), selectedGrantId,
  });
}
function fixture(t, maxRequests = 2, selectedGrantId = 'grant_A',
  store = new DeclaredStore()) {
  const gates = [], sinks = [];
  function track(promise) {
    sinks.push(APPLY(THEN, promise, [() => undefined, () => undefined]));
    return promise;
  }
  function gate() {
    let resolve, reject;
    const promise = new P((yes, no) => { resolve = yes; reject = no; });
    const cap = Object.freeze({ promise, resolve, reject });
    gates.push(cap);
    track(promise);
    return cap;
  }
  t.after(async () => {
    for (const cap of gates) cap.resolve(undefined);
    await P.all(sinks);
  });
  return { store, owner: owner(store, maxRequests, selectedGrantId), track, gate };
}
function redacted(value) {
  ok(Object.isFrozen(value));
  ok(Object.isFrozen(value.counts));
  ok(Object.isFrozen(value.uncertainty));
  const text = JSON.stringify(value);
  for (const secret of [CHALLENGE_HEADER, PAYMENT_HEADER, HASH, FUNDING, SERVICE]) {
    q(text.includes(secret), false);
  }
  q(Object.hasOwn(value, 'selectedGrantId'), false);
  q(value.serviceOutcome, 'NOT_ESTABLISHED');
  q(value.durability, 'NOT_ESTABLISHED');
  q(value.recoveryAuthority, 'NONE');
}
function accessor(value, field, trap) {
  const changed = { ...value };
  Object.defineProperty(changed, field, { enumerable: true, get: trap });
  return changed;
}

const scenarios = [
  ['retention readback and current binding fence one explicit callback', async t => {
    const f = fixture(t), value = original();
    const before = JSON.stringify(value);
    let calls = 0, received;
    const operation = f.owner.submitOriginal(value, function (...args) {
      q(this, undefined);
      q(args.length, 1);
      received = args[0];
      calls++;
      same(f.store.log, ['load', 'get', 'retain', 'get', 'load']);
      q(f.store.retainCalls, 1);
      same(f.store.stored(key(value)), received);
      same(received, capture(input(value), binding()));
      ne(received, value);
      ok(Object.isFrozen(received));
      throws(() => { received.originalBodyBase64 = 'AA=='; }, TypeError);
      q(f.owner.snapshot().counts.readbackConfirmations, 1);
    });
    q(await f.track(operation), undefined);
    q(calls, 1);
    q(JSON.stringify(value), before);
    q(received.originalRequestJson, value.originalRequestJson);
    q(received.originalBodyBase64, '');
    q(f.store.funding.challengeHeader, CHALLENGE_HEADER);
    q(f.store.funding.paymentHeader, PAYMENT_HEADER);
    q(f.owner.snapshot().phase, 'CALLBACK_COMPLETED');
    q(f.owner.snapshot().counts.callbackCompletions, 1);
    redacted(f.owner.snapshot());
    q(await f.track(f.owner.close()), undefined);
    q(f.store.closeCalls, 0);
  }],
  ['existing originals require recovery and changed bindings refuse dispatch', async t => {
    const f = fixture(t), value = original();
    let calls = 0;
    const pristine = f.owner.snapshot();
    const foreignFirst = original('foreign_grant', 'request_A');
    await rejects(f.track(f.owner.submitOriginal(foreignFirst, () => { calls++; })),
      code('FOREIGN_GRANT'));
    throws(() => f.owner.readOriginal(key(foreignFirst)), code('FOREIGN_GRANT'));
    same(f.store.log, []);
    same(f.owner.snapshot(), pristine);
    q(calls, 0);
    await f.track(f.owner.submitOriginal(value, () => { calls++; }));
    await rejects(f.track(f.owner.submitOriginal(value, () => { calls++; })),
      code('RECOVERY_REQUIRED'));
    await rejects(f.track(f.owner.submitOriginal(original('grant_A', 'request_A', 8),
      () => { calls++; })), code('CONFLICT'));
    const fresh = owner(f.store);
    await rejects(f.track(fresh.submitOriginal(value, () => { calls++; })),
      code('RECOVERY_REQUIRED'));
    q(calls, 1);
    q(f.store.retainCalls, 1);

    const foreign = fixture(t);
    foreign.store.seed(capture(input(value), binding('c'.repeat(64))));
    await rejects(foreign.track(foreign.owner.submitOriginal(value, () => { calls++; })),
      code('CUSTODY_OUTCOME_UNKNOWN'));
    q(foreign.store.retainCalls, 0);
    q(foreign.owner.snapshot().uncertainty.custody, true);

    const absent = fixture(t);
    absent.store.hooks.get = () => undefined;
    await rejects(absent.track(absent.owner.submitOriginal(value, () => { calls++; })),
      code('CUSTODY_OUTCOME_UNKNOWN'));
    q(absent.store.retainCalls, 0);
    q(calls, 1);
    await rejects(absent.track(absent.owner.close()), code('CLOSE_FAILED'));
  }],
  ['retention and readback uncertainty hold without dispatch', async t => {
    const secret = 'PRIVATE_BACKEND_FAILURE';
    for (const kind of [
      'before-write', 'after-write', 'wrong-retain', 'wrong-readback',
      'missing-readback', 'changed-binding',
    ]) {
      const f = fixture(t), value = original();
      if (kind === 'before-write') {
        f.store.hooks.beforeRetain = () => { throw new Error(secret); };
      }
      if (kind === 'after-write') {
        f.store.hooks.afterRetain = () => { throw new Error(secret); };
      }
      if (kind === 'wrong-retain') {
        f.store.hooks.retainResult = () =>
          capture(input(original('grant_A', 'request_A', 8)), binding());
      }
      if (kind === 'wrong-readback' || kind === 'missing-readback') {
        f.store.hooks.get = (requested, store, call) => {
          if (call === 1) return null;
          if (kind === 'missing-readback') return null;
          return capture(input(original('grant_A', 'request_A', 8)), binding());
        };
      }
      if (kind === 'changed-binding') {
        f.store.hooks.afterRetain = (_record, store) => {
          store.funding = funding({ hash: 'd'.repeat(64) });
        };
      }
      let calls = 0;
      await rejects(f.track(f.owner.submitOriginal(value, () => { calls++; })),
        code('CUSTODY_OUTCOME_UNKNOWN'));
      q(calls, 0);
      q(f.store.retainCalls, 1);
      q(f.owner.snapshot().uncertainty.custody, true);
      q(f.owner.snapshot().counts.dispatchCalls, 0);
      q(JSON.stringify(f.owner.snapshot()).includes(secret), false);
      const logLength = f.store.log.length;
      await rejects(f.track(f.owner.submitOriginal(value, () => { calls++; })),
        code('CUSTODY_OUTCOME_UNKNOWN'));
      q(f.store.log.length, logLength);
      await rejects(f.track(f.owner.close()), code('CLOSE_FAILED'));
      q(f.store.closeCalls, 0);
      redacted(f.owner.snapshot());
    }
  }],
  ['observable promises preserve busy guards and close drain identity', async t => {
    const f = fixture(t), value = original(), gate = f.gate();
    let nestedSubmit, nestedClose;
    const operation = f.track(f.owner.submitOriginal(value, record => {
      same(record, f.store.stored(key(value)));
      const before = f.store.log.length;
      nestedSubmit = f.track(f.owner.submitOriginal(original('grant_A', 'request_B'),
        () => { throw new Error('UNREACHED_NESTED_DISPATCH'); }));
      throws(() => f.owner.readOriginal(key(value)), code('BUSY'));
      q(f.store.log.length, before);
      nestedClose = f.track(f.owner.close());
      return gate.promise;
    }));
    await rejects(nestedSubmit, code('BUSY'));
    const closing = f.owner.close();
    q(closing, nestedClose);
    q(f.owner.close(), closing);
    q(f.owner.snapshot().closed, true);
    q(f.owner.snapshot().active, true);
    q(f.owner.snapshot().closeOutcome, 'WAITING');
    let settled = false;
    const watched = APPLY(THEN, closing, [
      () => { settled = true; }, () => { settled = true; },
    ]);
    f.track(watched);
    await P.resolve();
    q(settled, false);
    const before = f.store.log.length;
    await rejects(f.track(f.owner.submitOriginal(value, () => undefined)), code('CLOSED'));
    throws(() => f.owner.readOriginal(key(value)), code('CLOSED'));
    q(f.store.log.length, before);
    gate.resolve(undefined);
    q(await operation, undefined);
    q(await closing, undefined);
    await watched;
    q(settled, true);
    q(f.owner.snapshot().active, false);
    q(f.owner.snapshot().phase, 'CALLBACK_COMPLETED');
    q(f.owner.snapshot().drainStatus, 'OBSERVED');
    q(f.owner.snapshot().closeOutcome, 'DRAINED');
    q(f.owner.snapshot().counts.dispatchCalls, 1);
    q(f.store.closeCalls, 0);

    const during = fixture(t), duringValue = original();
    let retainedClose, duringCalls = 0;
    during.store.hooks.beforeRetain = () => {
      retainedClose = during.track(during.owner.close());
    };
    await rejects(during.track(during.owner.submitOriginal(duringValue,
      () => { duringCalls++; })), code('RECOVERY_REQUIRED'));
    q(await retainedClose, undefined);
    q(duringCalls, 0);
    same(during.store.stored(key(duringValue)), capture(input(duringValue), binding()));
    q(during.owner.snapshot().closeOutcome, 'DRAINED');
    q(during.store.closeCalls, 0);

    const cycle = fixture(t);
    let cycleClose;
    const cyclic = cycle.track(cycle.owner.submitOriginal(original(), () => {
      cycleClose = cycle.track(cycle.owner.close());
      return cycleClose;
    }));
    await rejects(cyclic, code('SUBMISSION_OUTCOME_UNKNOWN'));
    await rejects(cycleClose, code('CLOSE_FAILED'));
    q(cycle.owner.snapshot().uncertainty.undrained, true);
    q(cycle.owner.snapshot().closeOutcome, 'UNKNOWN');
    q(cycle.store.closeCalls, 0);
  }],
  ['dispatch failures remain submission unknown without retry', async t => {
    const secret = 'PRIVATE_DISPATCH_FAILURE';
    for (const kind of ['throw', 'reject', 'wrong-sync', 'wrong-fulfilled']) {
      const f = fixture(t), value = original(), gate = f.gate();
      let calls = 0;
      const operation = f.track(f.owner.submitOriginal(value, () => {
        calls++;
        if (kind === 'throw') throw new Error(secret);
        if (kind === 'wrong-sync') return { delivered: true };
        return gate.promise;
      }));
      if (kind === 'reject') gate.reject(new Error(secret));
      if (kind === 'wrong-fulfilled') gate.resolve('not-void');
      await rejects(operation, code('SUBMISSION_OUTCOME_UNKNOWN'));
      q(calls, 1);
      q(f.store.retainCalls, 1);
      q(f.owner.snapshot().uncertainty.submission, true);
      q(f.owner.snapshot().uncertainty.undrained,
        kind === 'throw' || kind === 'wrong-sync');
      q(f.owner.snapshot().counts.callbackCompletions, 0);
      q(JSON.stringify(f.owner.snapshot()).includes(secret), false);
      await rejects(f.track(f.owner.submitOriginal(value, () => { calls++; })),
        code('SUBMISSION_OUTCOME_UNKNOWN'));
      q(calls, 1);
      same(f.owner.readOriginal(key(value)), f.store.stored(key(value)));
      const fresh = owner(f.store);
      await rejects(f.track(fresh.submitOriginal(value, () => { calls++; })),
        code('RECOVERY_REQUIRED'));
      q(calls, 1);
      await rejects(f.track(f.owner.close()), code('CLOSE_FAILED'));
      q(f.store.closeCalls, 0);
    }
  }],
  ['hostile inputs and unobservable promise handles execute no getters', async t => {
    let touches = 0;
    const trap = () => { touches++; throw new Error('UNREACHED_TRAP'); };
    const traps = {
      get: trap, ownKeys: trap, getPrototypeOf: trap,
      getOwnPropertyDescriptor: trap, apply: trap,
    };
    const backend = new DeclaredStore();
    const config = {
      store: backend, fundingResourceUrl: FUNDING,
      custodyPolicy: policy(), selectedGrantId: 'grant_A',
    };
    throws(() => createOwner(), code('INVALID_CONFIGURATION'));
    throws(() => createOwner(config, undefined), code('INVALID_CONFIGURATION'));
    throws(() => createOwner(new Proxy(config, traps)), code('INVALID_CONFIGURATION'));
    throws(() => createOwner(accessor(config, 'store', trap)), code('INVALID_CONFIGURATION'));
    throws(() => createOwner(accessor(config, 'selectedGrantId', trap)),
      code('INVALID_CONFIGURATION'));
    const missingGrant = { ...config };
    delete missingGrant.selectedGrantId;
    throws(() => createOwner(missingGrant), code('INVALID_CONFIGURATION'));
    for (const selectedGrantId of [
      '', '_bad', 'a://b', 'a'.repeat(129), -0, NaN, 1n,
      new String('grant_A'), { [Symbol.toPrimitive]: trap },
    ]) throws(() => createOwner({ ...config, selectedGrantId }),
      code('INVALID_CONFIGURATION'));
    throws(() => createOwner({ ...config, extra: true }), code('INVALID_CONFIGURATION'));
    throws(() => createOwner({ ...config, [Symbol('extra')]: 1 }),
      code('INVALID_CONFIGURATION'));
    throws(() => createOwner({ ...config, store: new Proxy(backend, traps) }),
      code('INVALID_CONFIGURATION'));
    throws(() => createOwner({
      ...config, custodyPolicy: new Proxy(policy(), traps),
    }), code('INVALID_CONFIGURATION'));
    for (const maxRequests of [0, 1025, -0, NaN, 1n, new Number(2)]) {
      throws(() => createOwner({ ...config, custodyPolicy: policy(maxRequests) }),
        code('INVALID_CONFIGURATION'));
    }
    for (const method of ['load', 'getOriginalRequest', 'retainOriginalRequest']) {
      const own = {
        load: backend.load.bind(backend),
        getOriginalRequest: backend.getOriginalRequest.bind(backend),
        retainOriginalRequest: backend.retainOriginalRequest.bind(backend),
      };
      throws(() => createOwner({ ...config, store: accessor(own, method, trap) }),
        code('INVALID_CONFIGURATION'));
      throws(() => createOwner({
        ...config, store: { ...own, [method]: new Proxy(() => undefined, traps) },
      }), code('INVALID_CONFIGURATION'));
    }
    const prototypeProxy = Object.create(new Proxy({}, traps));
    throws(() => createOwner({ ...config, store: prototypeProxy }),
      code('INVALID_CONFIGURATION'));
    let deep = backend;
    for (let index = 0; index < 9; index++) deep = Object.create(deep);
    throws(() => createOwner({ ...config, store: deep }), code('INVALID_CONFIGURATION'));

    const f = fixture(t), value = original();
    for (const bad of [
      new Proxy(value, traps), accessor(value, 'grantId', trap),
      { ...value, [Symbol('extra')]: 1 },
      { ...value, authorization: 'not-accepted' },
      { ...value, originalRequestJson: { toJSON: trap, [Symbol.toPrimitive]: trap } },
    ]) await rejects(f.track(f.owner.submitOriginal(bad, () => undefined)),
      code('INVALID_INPUT'));
    await rejects(f.track(f.owner.submitOriginal(value, new Proxy(() => {}, traps))),
      code('INVALID_INPUT'));
    await rejects(f.track(f.owner.submitOriginal(value)), code('INVALID_INPUT'));
    throws(() => f.owner.readOriginal(new Proxy(key(value), traps)), code('INVALID_INPUT'));
    throws(() => f.owner.snapshot(undefined), code('INVALID_INPUT'));
    await rejects(f.track(f.owner.close(undefined)), code('INVALID_INPUT'));
    q(f.owner.snapshot().closed, false);
    q(f.store.retainCalls, 0);

    const badData = fixture(t);
    badData.store.hooks.load = () => new Proxy(funding(), traps);
    await rejects(badData.track(badData.owner.submitOriginal(value, () => undefined)),
      code('CUSTODY_OUTCOME_UNKNOWN'));

    const opaqueHeader = fixture(t);
    opaqueHeader.store.hooks.load = () => accessor(funding(), 'paymentHeader', trap);
    await rejects(opaqueHeader.track(opaqueHeader.owner.submitOriginal(value,
      () => undefined)), code('CUSTODY_OUTCOME_UNKNOWN'));
    q(opaqueHeader.store.retainCalls, 0);

    const fake = Object.create(P.prototype);
    Object.defineProperty(fake, 'then', { get: trap });
    const thenable = {};
    Object.defineProperty(thenable, 'then', { get: trap });
    const resolvedConstructorTrap = P.resolve(undefined);
    Object.defineProperty(resolvedConstructorTrap, 'constructor', { get: trap });
    const fakeConstructor = function DeclaredConstructor() {};
    Object.defineProperty(fakeConstructor, Symbol.species, { get: trap });
    const resolvedSpeciesTrap = P.resolve(undefined);
    Object.defineProperty(resolvedSpeciesTrap, 'constructor', { value: fakeConstructor });
    class DeclaredSubclass extends P {}
    Object.defineProperty(DeclaredSubclass, Symbol.species, { get: trap });
    const resolvedSubclass = new DeclaredSubclass(resolve => { resolve(undefined); });
    const resolvedProxy = new Proxy(P.resolve(undefined), traps);
    // All unobservable genuine promise fixtures above are resolved, never
    // deliberately rejected. No unsafe .then sink is attached after mutation.
    for (const returned of [
      fake, thenable, resolvedConstructorTrap, resolvedSpeciesTrap,
      resolvedSubclass, resolvedProxy,
    ]) {
      const bad = fixture(t);
      await rejects(bad.track(bad.owner.submitOriginal(value, () => returned)),
        code('SUBMISSION_OUTCOME_UNKNOWN'));
      q(bad.owner.snapshot().phase, 'UNKNOWN_UNDRAINED');
      q(bad.owner.snapshot().drainStatus, 'UNOBSERVABLE');
      const closing = bad.track(bad.owner.close());
      q(bad.owner.close(), closing);
      await rejects(closing, code('CLOSE_FAILED'));
      q(bad.store.closeCalls, 0);
    }

    const safe = fixture(t), gate = safe.gate();
    Object.defineProperty(gate.promise, 'then', { get: trap });
    Object.defineProperty(gate.promise, Symbol.species, { get: trap });
    const pending = safe.track(safe.owner.submitOriginal(value, () => gate.promise));
    q(safe.owner.snapshot().active, true);
    gate.resolve(undefined);
    q(await pending, undefined);
    q(await safe.track(safe.owner.close()), undefined);
    q(touches, 0);
  }],
  ['one-grant composite bookkeeping enforces explicit capacity', async t => {
    const limited = fixture(t, 1, 'selected_grant');
    const firstLimited = original('selected_grant', 'one');
    let limitedCalls = 0;
    await limited.track(limited.owner.submitOriginal(firstLimited,
      () => { limitedCalls++; }));
    await rejects(limited.track(limited.owner.submitOriginal(
      original('selected_grant', 'two'), () => { limitedCalls++; })), code('CAPACITY'));
    await rejects(limited.track(limited.owner.submitOriginal(firstLimited,
      () => { limitedCalls++; })), code('RECOVERY_REQUIRED'));
    q(limitedCalls, 1);
    q(limited.owner.snapshot().trackedRequests, 1);
    q(limited.store.retainCalls, 1);

    // Independent explicitly scoped synthetic owners test composite isolation.
    // This does not establish a multi-grant pilot dispatch policy.
    const composite = fixture(t, 2, 'a:b');
    const first = original('a:b', 'c'), second = original('a', 'b:c');
    let calls = 0;
    q(first.grantId + ':' + first.requestId, second.grantId + ':' + second.requestId);
    await composite.track(composite.owner.submitOriginal(first, () => { calls++; }));
    const before = composite.store.log.length;
    await rejects(composite.track(composite.owner.submitOriginal(second,
      () => { calls++; })), code('FOREIGN_GRANT'));
    throws(() => composite.owner.readOriginal(key(second)), code('FOREIGN_GRANT'));
    q(composite.store.log.length, before);

    const other = owner(composite.store, 2, 'a');
    await composite.track(other.submitOriginal(second, () => { calls++; }));
    same(composite.store.stored(key(first)), capture(input(first), binding()));
    same(composite.store.stored(key(second)), capture(input(second), binding()));
    ne(serialize(composite.store.stored(key(first))),
      serialize(composite.store.stored(key(second))));
    const otherBefore = composite.store.log.length;
    await rejects(composite.track(other.submitOriginal(first, () => { calls++; })),
      code('FOREIGN_GRANT'));
    throws(() => other.readOriginal(key(first)), code('FOREIGN_GRANT'));
    q(composite.store.log.length, otherBefore);
    q(calls, 2);
    q(composite.store.retainCalls, 2);

    const multiple = fixture(t, 2, 'g');
    for (const requestId of ['one', 'two']) {
      await multiple.track(multiple.owner.submitOriginal(original('g', requestId),
        () => undefined));
    }
    q(multiple.owner.snapshot().trackedRequests, 2);
    q(multiple.owner.snapshot().counts.dispatchCalls, 2);
    q(multiple.owner.snapshot().counts.callbackCompletions, 2);
    q(multiple.store.funding.challengeHeader, CHALLENGE_HEADER);
    q(multiple.store.funding.paymentHeader, PAYMENT_HEADER);
    q(multiple.store.closeCalls, 0);
    q(owner(new DeclaredStore(), 1024, 'grant_A').snapshot().maxRequests, 1024);

    const ownBackend = new DeclaredStore();
    const ownSurface = {
      load: ownBackend.load.bind(ownBackend),
      getOriginalRequest: ownBackend.getOriginalRequest.bind(ownBackend),
      retainOriginalRequest: ownBackend.retainOriginalRequest.bind(ownBackend),
    };
    await composite.track(owner(ownSurface, 1, 'grant_A')
      .submitOriginal(original(), () => undefined));
    q(ownBackend.retainCalls, 1);

    class PrivateDeclaredStore {
      #inner;
      constructor(inner) { this.#inner = inner; }
      load() { return this.#inner.load(); }
      getOriginalRequest(value) { return this.#inner.getOriginalRequest(value); }
      retainOriginalRequest(value) { return this.#inner.retainOriginalRequest(value); }
    }
    const privateBackend = new DeclaredStore();
    await composite.track(owner(new PrivateDeclaredStore(privateBackend), 1, 'grant_A')
      .submitOriginal(original(), () => undefined));
    q(privateBackend.retainCalls, 1);
  }],
  ['recovery reads and closure never establish delivery authority', async t => {
    const value = original();
    for (const status of [
      'PREPARED', 'ATTEMPT_FENCED', 'OUTCOME_UNKNOWN',
      'PAYMENT_REJECTED', 'PAYMENT_CONFLICT',
    ]) {
      const f = fixture(t);
      f.store.funding = funding({ status });
      const stored = capture(input(value), binding());
      f.store.seed(stored);
      const first = f.owner.readOriginal(key(value));
      const second = f.owner.readOriginal(key(value));
      same(first, stored);
      same(second, stored);
      ne(first, second);
      ok(Object.isFrozen(first));
      await rejects(f.track(f.owner.submitOriginal(value, () => {
        throw new Error('UNREACHED_NONBOUND_DISPATCH');
      })), code('FUNDING_NOT_BOUND'));
      q(f.store.retainCalls, 0);
      q(f.owner.snapshot().counts.dispatchCalls, 0);
      q(f.owner.readOriginal({ grantId: value.grantId, requestId: 'absent' }), null);
      redacted(f.owner.snapshot());
    }

    const missing = fixture(t);
    missing.store.hooks.load = () => null;
    throws(() => missing.owner.readOriginal(key(value)), code('FUNDING_REQUIRED'));
    const failedRead = fixture(t);
    failedRead.store.hooks.get = () => { throw new Error('PRIVATE_READ_ERROR'); };
    throws(() => failedRead.owner.readOriginal(key(value)), code('CUSTODY_OUTCOME_UNKNOWN'));
    q(JSON.stringify(failedRead.owner.snapshot()).includes('PRIVATE_READ_ERROR'), false);
    q(failedRead.owner.snapshot().uncertainty.custody, true);
    await rejects(failedRead.track(failedRead.owner.close()), code('CLOSE_FAILED'));

    const completed = fixture(t);
    completed.store.funding = funding({ ambiguityLatched: true });
    await completed.track(completed.owner.submitOriginal(value, () => undefined));
    const before = completed.owner.snapshot();
    q(before.phase, 'CALLBACK_COMPLETED');
    q(before.uncertainty.declaredFundingAmbiguitySeen, true);
    redacted(before);
    const closing = completed.track(completed.owner.close());
    q(completed.owner.close(), closing);
    q(await closing, undefined);
    const logs = completed.store.log.length;
    throws(() => completed.owner.readOriginal(key(value)), code('CLOSED'));
    await rejects(completed.track(completed.owner.submitOriginal(value, () => undefined)),
      code('CLOSED'));
    q(completed.store.log.length, logs);
    q(completed.store.closeCalls, 0);
    const after = completed.owner.snapshot();
    ne(after, before);
    ne(after.counts, before.counts);
    ne(after.uncertainty, before.uncertainty);
    q(after.closeOutcome, 'DRAINED');
    q(after.counts.callbackCompletions, 1);
    redacted(after);
    same(Object.keys(completed.owner), [
      'submitOriginal', 'readOriginal', 'readOriginalRecoveryState', 'snapshot', 'close',
    ]);
    ok(Object.isFrozen(completed.owner));
  }],
];

q(scenarios.length, 8);
for (let index = 0; index < scenarios.length; index++) {
  if (selector === 'all' || selector === String(index + 1)) {
    const [name, run] = scenarios[index];
    test(name, { timeout: 5000 }, run);
  }
}
