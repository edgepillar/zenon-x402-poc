import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  setImmediate as immediate,
  setTimeout as nativeSetTimeout,
  clearTimeout as nativeClearTimeout,
} from 'node:timers';

// Recovery-read output fences using actual owner and pure contract exports.
// Declared synchronous Map data only; no delivery, durability or authority proof.
assert.equal(process.versions.node, '24.19.0', 'EXACT_NODE_VERSION_REQUIRED');
assert.equal(process.argv.length, 2, 'ONE_FILE_PROCESS_REQUIRED');
const mode = process.env.SPV_CUSTODY_OWNER_READ_CLOSE_REENTRY_PARENT_CONTROL;
if (mode !== undefined && mode !== '1') throw new Error('INVALID_PARENT_CONTROL');
const parent = mode === '1';
const specs = [
  ['../src/service-credit-custodied-request-owner.js',
    parent ? 22785 : 22965,
    parent ? 630 : 635,
    parent ? 'ab064ecc113730f7cd2676360b03000016677dd3e736987b9744124718ba9e9b'
      : '4dabb9c49179e9d6533f5c3066faf730fa6d7deb3c4407d132841c1de4183f85'],
  ['../src/service-credit-original-request-custody-contract.js', 9810, 272,
    '8f4d40d017a89e9a064c411c8e076cb21a45b9fb787fda7a664246b7bd744083'],
  ['../package.json', 1413, 40,
    '8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5'],
];
const pins = specs.map(([relative, bytes, LF, sha256]) => {
  const url = new URL(relative, import.meta.url);
  const raw = readFileSync(url);
  assert.equal(raw.length, bytes, 'SOURCE_BYTES');
  assert.equal(createHash('sha256').update(raw).digest('hex'), sha256, 'SOURCE_SHA256');
  const text = raw.toString('utf8');
  assert.equal(/[^\x00-\x7f]/.test(text), false);
  assert.equal(text.includes('\0'), false);
  assert.equal(text.split('\n').length - 1, LF);
  assert.ok(text.endsWith('\n'));
  return Object.freeze({ url: url.href, text });
});
const pkg = JSON.parse(pins[2].text);
assert.equal(pkg.type, 'module');
assert.equal(pkg.engines.node, '>=24');
// All three guards precede repository import; package remains DATA ONLY.
const { createServiceCreditCustodiedRequestOwner: CREATE } = await import(pins[0].url);
const {
  captureOriginalServiceRequestCustody: CAPTURE,
  serializeOriginalServiceRequestCustody: SERIALIZE,
  parseOriginalServiceRequestCustody: PARSE,
} = await import(pins[1].url);

const P = Promise, THEN = P.prototype.then, APPLY = Reflect.apply;
const FUNDING = 'https://owner.example.test/funding';
const SERVICE = 'https://owner.example.test/service-credit/v1/execute';
const HASH = 'a'.repeat(64);
const NETWORK = 'zenon:declared';
const EMPTY = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const PREFIX = 'SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const CHALLENGE_HEADER = 'DECLARED_CHALLENGE_HEADER_NOT_A_LIVE_CREDENTIAL';
const PAYMENT_HEADER = 'DECLARED_PAYMENT_HEADER_NOT_A_SIGNED_PAYMENT';
const sha = value => createHash('sha256').update(value).digest('hex');
const turn = () => new P(resolve => immediate(resolve));

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

const CASES = Object.freeze({
  'first-load': {
    method: 'load', ordinal: 1, present: true, kind: 'normal',
    loads: 1, gets: 0, unknown: false, trace: ['load:1'],
  },
  'null-get': {
    method: 'get', ordinal: 1, present: false, kind: 'normal',
    loads: 1, gets: 1, unknown: false, trace: ['load:1', 'get:1'],
  },
  'present-get': {
    method: 'get', ordinal: 1, present: true, kind: 'normal',
    loads: 2, gets: 1, unknown: false, trace: ['load:1', 'get:1', 'load:2'],
  },
  'final-load': {
    method: 'load', ordinal: 2, present: true, kind: 'normal',
    loads: 2, gets: 1, unknown: false, trace: ['load:1', 'get:1', 'load:2'],
  },
  'undefined-get': {
    method: 'get', ordinal: 1, present: true, kind: 'undefined',
    loads: 1, gets: 1, unknown: true, trace: ['load:1', 'get:1'],
  },
  'changed-final-load': {
    method: 'load', ordinal: 2, present: true, kind: 'changed',
    loads: 2, gets: 1, unknown: true, trace: ['load:1', 'get:1', 'load:2'],
  },
});
const slot = value => JSON.stringify([value.grantId, value.requestId]);

// No submit creates a row. Preseeding uses actual pure capture/serialization.
class DeclaredStore {
  #control;
  #rows = new Map();
  constructor(control) {
    this.#control = control;
    if (control.spec.present) {
      this.#rows.set(slot(control.readKey), SERIALIZE(PARSE(control.canonicalText)));
    }
  }
  #enter(method, args) {
    const c = this.#control;
    const ordinal = ++c.calls[method];
    const entry = {
      method, ordinal, receiver: this, args,
      descriptors: args.map(value => Object.getOwnPropertyDescriptors(value)),
      atEntry: c.owner.snapshot(),
    };
    c.log.push(entry);
    c.timeline.push(method + ':' + ordinal + ':enter');
    if (!c.reentered && method === c.spec.method && ordinal === c.spec.ordinal) {
      c.reentered = true;
      c.closeReentries++;
      c.beforeClose = c.owner.snapshot();
      c.timeline.push('close:call');
      const promise = c.owner.close(); // Exactly one close invocation in the hook.
      c.closePromise = promise;
      c.closeResult = APPLY(THEN, promise, [
        value => {
          c.closeReactions++;
          c.timeline.push('close:fulfilled');
          return { ok: true, value };
        },
        error => {
          c.closeReactions++;
          c.timeline.push('close:rejected');
          return { ok: false, error };
        },
      ]);
      c.lifecycle.push(c.closeResult);
      c.insideClose = c.owner.snapshot();
      c.timeline.push('close:waiting');
    }
    return entry;
  }
  #leave(entry, value) {
    entry.returned = value;
    this.#control.timeline.push(entry.method + ':' + entry.ordinal + ':return');
    return value;
  }
  load(...args) {
    const entry = this.#enter('load', args);
    const c = this.#control;
    const value = c.spec.kind === 'changed' && entry.ordinal === 2
      ? c.changedState : c.state;
    return this.#leave(entry, value);
  }
  getOriginalRequest(...args) {
    const entry = this.#enter('get', args);
    const text = this.#rows.get(slot(args[0]));
    const value = this.#control.spec.kind === 'undefined'
      ? undefined : text === undefined ? null : PARSE(text);
    return this.#leave(entry, value);
  }
  retainOriginalRequest(...args) {
    this.#enter('retain', args);
    throw new Error('READ_FIXTURE_RETAIN_FORBIDDEN');
  }
  rows() { return [...this.#rows.entries()]; }
  close() { this.#control.storeCloseCalls++; }
}

function expectedSnapshot(loads, gets, {
  closed = false, active = false, closeOutcome = 'NOT_REQUESTED', unknown = false,
} = {}) {
  return {
    phase: unknown ? 'CUSTODY_OUTCOME_UNKNOWN' : 'IDLE',
    closed, active, grantScoped: true, trackedRequests: 0, maxRequests: 2,
    drainStatus: 'NONE', closeOutcome,
    counts: {
      loadReads: loads, recordReads: gets, retainCalls: 0,
      readbackConfirmations: 0, dispatchCalls: 0, callbackCompletions: 0,
    },
    uncertainty: {
      custody: unknown, submission: false, undrained: false,
      declaredFundingAmbiguitySeen: false,
    },
    qualification: 'DECLARED_CALLBACK_LIFECYCLE_ONLY',
    serviceOutcome: 'NOT_ESTABLISHED', durability: 'NOT_ESTABLISHED',
    recoveryAuthority: 'NONE',
  };
}
function redacted(value, f) {
  const text = JSON.stringify(value);
  for (const secret of [
    FUNDING, SERVICE, HASH, NETWORK, CHALLENGE_HEADER, PAYMENT_HEADER,
    'grant_A', 'request_A', f.value.originalRequestJson, f.canonicalText,
    f.canonicalRecord.checksum,
  ]) assert.equal(text.includes(secret), false, 'REDACTED_OWNER_RESULT');
}
function assertSnapshot(value, expected, f) {
  assert.deepEqual(value, expected);
  assert.ok(Object.isFrozen(value));
  assert.ok(Object.isFrozen(value.counts));
  assert.ok(Object.isFrozen(value.uncertainty));
  redacted(value, f);
}
function assertError(error, suffix, f) {
  const code = PREFIX + suffix;
  assert.ok(error instanceof TypeError);
  assert.equal(Object.getPrototypeOf(error), TypeError.prototype);
  assert.equal(error.name, 'TypeError');
  assert.equal(error.code, code);
  assert.equal(error.message, code);
  assert.equal(error.stack, 'TypeError: ' + code);
  assert.ok(Object.isFrozen(error));
  assert.equal(Object.hasOwn(error, 'cause'), false);
  assert.deepEqual(Reflect.ownKeys(error).sort(), ['code', 'message', 'stack']);
  for (const field of ['code', 'message', 'stack']) {
    const descriptor = Object.getOwnPropertyDescriptor(error, field);
    assert.equal(Object.hasOwn(descriptor, 'value'), true);
    assert.equal(descriptor.writable, false);
    assert.equal(descriptor.configurable, false);
  }
  redacted(error, f);
}
function rememberData(...roots) {
  const seen = new Set(), saved = [];
  function visit(value) {
    if (value === null || typeof value !== 'object' || seen.has(value)) return;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== Array.prototype) return;
    seen.add(value);
    const own = Object.getOwnPropertyDescriptors(value);
    saved.push({ value, prototype, own });
    for (const descriptor of Object.values(own)) {
      if (Object.hasOwn(descriptor, 'value')) visit(descriptor.value);
    }
  }
  for (const root of roots) visit(root);
  return saved;
}

function fixture(caseName) {
  const spec = CASES[caseName];
  const value = Object.freeze(original());
  const readKey = Object.freeze(key(value));
  const custodyPolicy = Object.freeze(policy());
  const state = funding(), changedState = funding({ revision: 4 });
  const canonicalRecord = CAPTURE(input(value), binding());
  const canonicalText = SERIALIZE(canonicalRecord);
  const c = {
    spec, readKey, state, changedState, canonicalText, owner: null,
    calls: { load: 0, get: 0, retain: 0 }, log: [], timeline: [],
    reentered: false, closeReentries: 0, closeReactions: 0,
    closePromise: null, closeResult: null, lifecycle: [],
    beforeClose: null, insideClose: null, storeCloseCalls: 0, dispatchCalls: 0,
  };
  const store = new DeclaredStore(c);
  const config = Object.freeze({
    store, fundingResourceUrl: FUNDING, custodyPolicy, selectedGrantId: 'grant_A',
  });
  const f = {
    c, spec, value, readKey, custodyPolicy, state, changedState,
    canonicalRecord, canonicalText, store, config, owner: null,
    watchdogs: new Set(),
    observe(promise) {
      assert.equal(Object.getPrototypeOf(promise), P.prototype);
      const sink = APPLY(THEN, promise, [
        value => ({ ok: true, value }),
        error => ({ ok: false, error }),
      ]);
      c.lifecycle.push(sink);
      return sink;
    },
    wait(promise) {
      return new P((resolve, reject) => {
        let done = false, timer;
        const finish = (ok, value) => {
          if (done) return;
          done = true;
          nativeClearTimeout(timer);
          this.watchdogs.delete(cancel);
          if (ok) resolve(value);
          else reject(value);
        };
        const cancel = () => finish(false, new Error('OWNED_WAIT_CANCELLED'));
        timer = nativeSetTimeout(() => {
          finish(false, new Error('OWNED_WAIT_TIMEOUT'));
        }, 1000);
        this.watchdogs.add(cancel);
        APPLY(THEN, promise, [
          value => { finish(true, value); },
          error => { finish(false, error); },
        ]);
      });
    },
  };
  f.dispatch = Object.freeze(function () { c.dispatchCalls++; });
  f.savedData = rememberData(value, readKey, custodyPolicy, config,
    state, changedState, canonicalRecord);
  f.stateText = JSON.stringify(state);
  f.changedText = JSON.stringify(changedState);
  f.stateSHA = sha(f.stateText);
  f.changedSHA = sha(f.changedText);
  f.canonicalSHA = sha(canonicalText);
  f.originalBytes = Buffer.from(value.originalRequestJson, 'utf8');
  f.storeOwn = Object.getOwnPropertyDescriptors(store);
  f.prototypeOwn = Object.getOwnPropertyDescriptors(DeclaredStore.prototype);
  return f;
}
function assertPreserved(f) {
  for (const saved of f.savedData) {
    assert.equal(Object.getPrototypeOf(saved.value), saved.prototype);
    assert.deepEqual(Object.getOwnPropertyDescriptors(saved.value), saved.own);
  }
  assert.equal(JSON.stringify(f.state), f.stateText);
  assert.equal(sha(JSON.stringify(f.state)), f.stateSHA);
  assert.equal(JSON.stringify(f.changedState), f.changedText);
  assert.equal(sha(JSON.stringify(f.changedState)), f.changedSHA);
  assert.notEqual(f.changedState, f.state);
  assert.notEqual(f.changedState.paymentPayload, f.state.paymentPayload);
  assert.equal(f.state.revision, 3);
  assert.equal(f.changedState.revision, 4);
  assert.equal(f.changedText, JSON.stringify({ ...f.state, revision: 4 }));
  assert.equal(f.state.challengeHeader, CHALLENGE_HEADER);
  assert.equal(f.state.paymentHeader, PAYMENT_HEADER);
  assert.equal(f.state.paymentPayload.payload.transaction.hash, HASH);
  assert.equal(f.state.requirement.network, NETWORK);
  assert.equal(f.state.status, 'BOUND');
  assert.equal(f.state.ambiguityLatched, false);
  assert.deepEqual(Buffer.from(f.value.originalRequestJson, 'utf8'), f.originalBytes);
  assert.equal(f.value.originalBodyBase64, '');
  const expectedRows = f.spec.present ? [[slot(f.readKey), f.canonicalText]] : [];
  assert.deepEqual(f.store.rows(), expectedRows);
  for (const [, text] of f.store.rows()) {
    assert.equal(sha(text), f.canonicalSHA);
    const record = PARSE(text);
    assert.deepEqual(record, f.canonicalRecord);
    assert.equal(SERIALIZE(record), text);
    assert.equal(record.checksum, f.canonicalRecord.checksum);
    assert.equal(record.originalRequestJson, f.value.originalRequestJson);
    assert.deepEqual(Buffer.from(record.originalRequestJson, 'utf8'), f.originalBytes);
    assert.equal(record.originalBodyBase64, '');
    assert.equal(record.serviceResourceUrl, SERVICE);
    assert.equal(record.fundingResourceUrl, FUNDING);
    assert.equal(record.paymentHash, HASH);
    assert.equal(record.network, NETWORK);
    assert.equal(record.grantId, f.value.grantId);
    assert.equal(record.requestId, f.value.requestId);
  }
  assert.deepEqual(Object.getOwnPropertyDescriptors(f.store), f.storeOwn);
  assert.deepEqual(Object.getOwnPropertyDescriptors(DeclaredStore.prototype),
    f.prototypeOwn);
  assert.equal(Object.getPrototypeOf(f.store), DeclaredStore.prototype);
  assert.equal(f.c.storeCloseCalls, 0);
  assert.equal(f.c.dispatchCalls, 0);
  assert.equal(f.c.calls.retain, 0);
}
function assertTrace(f) {
  const c = f.c;
  assert.deepEqual(c.calls, { load: f.spec.loads, get: f.spec.gets, retain: 0 });
  assert.deepEqual(c.log.map(entry => entry.method + ':' + entry.ordinal),
    f.spec.trace);
  const expectedTimeline = ['read:call'];
  for (const label of f.spec.trace) {
    expectedTimeline.push(label + ':enter');
    if (label === f.spec.method + ':' + f.spec.ordinal) {
      expectedTimeline.push('close:call', 'close:waiting');
    }
    expectedTimeline.push(label + ':return');
  }
  expectedTimeline.push('read:unwound',
    f.spec.unknown ? 'close:rejected' : 'close:fulfilled');
  assert.deepEqual(c.timeline, expectedTimeline);
  for (const entry of c.log) {
    assert.equal(entry.receiver, f.store);
    assert.equal(entry.args.length, entry.method === 'load' ? 0 : 1);
    if (entry.method === 'get') {
      assert.deepEqual(entry.args[0], f.readKey);
      assert.equal(Object.getPrototypeOf(entry.args[0]), Object.prototype);
      assert.deepEqual(Object.getOwnPropertyDescriptors(entry.args[0]),
        entry.descriptors[0]);
    }
    assert.equal(entry.atEntry.active, true);
    const selectedIndex = c.log.findIndex(item =>
      item.method === f.spec.method && item.ordinal === f.spec.ordinal);
    assert.equal(entry.atEntry.closed, c.log.indexOf(entry) > selectedIndex);
    if (entry.method === 'load') {
      assert.equal(entry.returned,
        f.spec.kind === 'changed' && entry.ordinal === 2 ? f.changedState : f.state);
    } else if (f.spec.kind === 'undefined') {
      assert.equal(entry.returned, undefined);
    } else if (!f.spec.present) {
      assert.equal(entry.returned, null);
    } else {
      assert.deepEqual(entry.returned, f.canonicalRecord);
      assert.equal(SERIALIZE(entry.returned), f.canonicalText);
    }
  }
}

async function runCase(caseName) {
  const f = fixture(caseName), failures = [];
  try {
    f.owner = CREATE(f.config);
    f.c.owner = f.owner;
    assert.ok(Object.isFrozen(f.owner));
    assert.deepEqual(Reflect.ownKeys(f.owner),
      ['submitOriginal', 'readOriginal', 'snapshot', 'close']);
    for (const fn of Object.values(f.owner)) assert.ok(Object.isFrozen(fn));
    assertSnapshot(f.owner.snapshot(), expectedSnapshot(0, 0), f);
    assert.deepEqual(f.c.log, []);
    assertPreserved(f);

    let returned = false, readError;
    f.c.timeline.push('read:call');
    try {
      f.owner.readOriginal(f.readKey);
      returned = true;
    } catch (error) {
      readError = error;
    }
    f.c.timeline.push('read:unwound');
    assert.equal(f.c.closeReentries, 1);
    assert.equal(f.c.reentered, true);
    assert.equal(f.c.closeReactions, 0, 'CLOSE_REACTION_MUST_WAIT_FOR_UNWIND');
    assert.equal(Object.getPrototypeOf(f.c.closePromise), P.prototype);
    const hookLoads = f.spec.method === 'load' ? f.spec.ordinal : 1;
    const hookGets = f.spec.method === 'get' || f.spec.ordinal === 2 ? 1 : 0;
    assertSnapshot(f.c.beforeClose, expectedSnapshot(hookLoads, hookGets, {
      active: true,
    }), f);
    assertSnapshot(f.c.insideClose, expectedSnapshot(hookLoads, hookGets, {
      closed: true, active: true, closeOutcome: 'WAITING',
    }), f);
    const terminal = expectedSnapshot(f.spec.loads, f.spec.gets, {
      closed: true, active: false, unknown: f.spec.unknown,
      closeOutcome: f.spec.unknown ? 'UNKNOWN' : 'DRAINED',
    });
    assertSnapshot(f.owner.snapshot(), terminal, f);
    assert.equal(f.owner.close(), f.c.closePromise);
    assert.equal(f.owner.close(), f.c.closePromise);
    const closeResult = await f.wait(f.c.closeResult);
    assert.equal(f.c.closeReactions, 1);
    assert.equal(closeResult.ok, !f.spec.unknown);
    if (f.spec.unknown) assertError(closeResult.error, 'CLOSE_FAILED', f);
    else assert.equal(closeResult.value, undefined);
    assertSnapshot(f.owner.snapshot(), terminal, f);
    assertTrace(f);
    assertPreserved(f);

    // Parent retains these same assertions: no expected-result inversion.
    assert.equal(returned, false, 'RECOVERY_METADATA_RETURNED_AFTER_REENTRANT_CLOSE');
    assertError(readError, f.spec.unknown ? 'CUSTODY_OUTCOME_UNKNOWN' : 'CLOSED', f);
    let closedReadError;
    try { f.owner.readOriginal(f.readKey); }
    catch (error) { closedReadError = error; }
    assertError(closedReadError, 'CLOSED', f);
    const refused = f.observe(f.owner.submitOriginal(f.value, f.dispatch));
    const submitResult = await f.wait(refused);
    assert.equal(submitResult.ok, false);
    assertError(submitResult.error, 'CLOSED', f);
    assert.equal(f.owner.close(), f.c.closePromise);
    assertSnapshot(f.owner.snapshot(), terminal, f);
    assertTrace(f);
    assertPreserved(f);
    await turn();
    assert.equal(f.owner.close(), f.c.closePromise);
    assert.equal(f.c.closeReactions, 1);
    assertSnapshot(f.owner.snapshot(), terminal, f);
    assertTrace(f);
    assertPreserved(f);
  } catch (error) {
    failures.push(error);
  } finally {
    try {
      if (f.owner !== null) {
        const promise = f.owner.close();
        if (f.c.closePromise === null) f.observe(promise);
        else assert.equal(promise, f.c.closePromise);
      }
      await f.wait(P.all(f.c.lifecycle));
      assertPreserved(f);
      assert.equal(f.watchdogs.size, 0);
    } catch (error) {
      failures.push(error);
    } finally {
      for (const cancel of [...f.watchdogs]) cancel();
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, 'DECLARED_READ_CLOSE_CHECKS_FAILED');
  }
}

test('first funding load close reentry refuses recovery output and drains', { timeout: 5000, concurrency: false }, async () => {
  await runCase('first-load');
});

test('null get close reentry refuses recovery output and drains', { timeout: 5000, concurrency: false }, async () => {
  await runCase('null-get');
});

test('present get close reentry validates final funding before CLOSED', { timeout: 5000, concurrency: false }, async () => {
  await runCase('present-get');
});

test('final funding load close reentry refuses recovery output and drains', { timeout: 5000, concurrency: false }, async () => {
  await runCase('final-load');
});

test('undefined get close reentry preserves custody uncertainty precedence', { timeout: 5000, concurrency: false }, async () => {
  await runCase('undefined-get');
});

test('changed final funding close reentry preserves custody uncertainty precedence', { timeout: 5000, concurrency: false }, async () => {
  await runCase('changed-final-load');
});

