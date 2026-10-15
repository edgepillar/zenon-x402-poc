import test from 'node:test';
import { equal as q, deepEqual as same, ok } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { setImmediate as immediate } from 'node:timers';

// Declared synchronous Map fixtures for actual owner/contract exports only.
// No SQL, durability, recovery authority, dispatch or service qualification.
q(process.versions.node, '24.19.0', 'EXACT_NODE_VERSION_REQUIRED');
q(process.argv.length, 2, 'ONE_FILE_PROCESS_REQUIRED');
const mode = process.env.SPV_CUSTODY_OWNER_REJECTED_STORE_PROMISE_PARENT_CONTROL;
if (mode !== undefined && mode !== '1') throw new Error('INVALID_PARENT_CONTROL');
const parent = mode === '1';
const specs = [
  ['../src/service-credit-custodied-request-owner.js',
    parent ? 22239 : 22965,
    parent ? 'fa8d8dbb34363140a4f087c2200cdcfd850d9be09ffcf939e576c08228e19e96'
      : '4dabb9c49179e9d6533f5c3066faf730fa6d7deb3c4407d132841c1de4183f85'],
  ['../src/service-credit-original-request-custody-contract.js', 9810,
    '8f4d40d017a89e9a064c411c8e076cb21a45b9fb787fda7a664246b7bd744083'],
  ['../package.json', 1413,
    '8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5'],
];
const pins = specs.map(([path, bytes, sha]) => {
  const url = new URL(path, import.meta.url);
  const raw = readFileSync(url);
  q(raw.length, bytes, 'SOURCE_BYTES');
  q(createHash('sha256').update(raw).digest('hex'), sha, 'SOURCE_SHA256');
  const text = raw.toString('utf8');
  q(/[^\x00-\x7f]/.test(text), false);
  q(text.includes('\0'), false);
  ok(text.endsWith('\n'));
  return Object.freeze({ url: url.href, text });
});
const pkg = JSON.parse(pins[2].text);
q(pkg.type, 'module');
q(pkg.engines.node, '>=24');
// Package is DATA ONLY. All three source guards precede actual module imports.
const { createServiceCreditCustodiedRequestOwner: createOwner } = await import(pins[0].url);
const {
  captureOriginalServiceRequestCustody: capture,
  parseOriginalServiceRequestCustody: parse,
  serializeOriginalServiceRequestCustody: serialize,
} = await import(pins[1].url);

const P = Promise, THEN = P.prototype.then, REJECT = P.reject, APPLY = Reflect.apply;
const QUEUE_MICROTASK = queueMicrotask;
const FUNDING = 'https://owner.example.test/funding';
const SERVICE = 'https://owner.example.test/service-credit/v1/execute';
const HASH = 'a'.repeat(64);
const NETWORK = 'zenon:declared';
const EMPTY = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const PREFIX = 'SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const CHALLENGE_HEADER = 'DECLARED_CHALLENGE_HEADER_NOT_A_LIVE_CREDENTIAL';
const PAYMENT_HEADER = 'DECLARED_PAYMENT_HEADER_NOT_A_SIGNED_PAYMENT';
const MARKER_TAG = 'DECLARED_NATIVE_STORE_REJECTION_ONLY';
const digest = text => createHash('sha256').update(text, 'utf8').digest('hex');
const turn = () => new P(resolve => immediate(resolve));
async function turns(count) {
  for (let index = 0; index < count; index++) await turn();
}

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

// Counts are [loadReads, recordReads, retainCalls, trackedRequests].
// Every fixture has exactly one selected rejected native store return.
const CASES = Object.freeze({
  'submit-initial-load': {
    api: 'submit', method: 'load', ordinal: 1,
    counts: [1, 0, 0, 0], rows: 0, trace: ['load'],
  },
  'submit-original-get': {
    api: 'submit', method: 'get', ordinal: 1,
    counts: [1, 1, 0, 0], rows: 0, trace: ['load', 'get'],
  },
  'submit-retain-result-after-write': {
    api: 'submit', method: 'retain', ordinal: 1,
    counts: [1, 1, 1, 1], rows: 1, trace: ['load', 'get', 'retain'],
  },
  'submit-readback-get': {
    api: 'submit', method: 'get', ordinal: 2,
    counts: [1, 2, 1, 1], rows: 1, trace: ['load', 'get', 'retain', 'get'],
  },
  'submit-final-load': {
    api: 'submit', method: 'load', ordinal: 2,
    counts: [2, 2, 1, 1], rows: 1, trace: ['load', 'get', 'retain', 'get', 'load'],
  },
  'read-initial-load-preseeded': {
    api: 'read', method: 'load', ordinal: 1,
    counts: [1, 0, 0, 0], rows: 1, trace: ['load'],
  },
  'read-original-get-preseeded': {
    api: 'read', method: 'get', ordinal: 1,
    counts: [1, 1, 0, 0], rows: 1, trace: ['load', 'get'],
  },
  'read-final-load-preseeded': {
    api: 'read', method: 'load', ordinal: 2,
    counts: [2, 1, 0, 0], rows: 1, trace: ['load', 'get', 'load'],
  },
});

// Private fields require the real structural store receiver. Fixture helpers
// neither enter owner counters nor provide an alternate production owner.
class DeclaredStore {
  #control;
  #rows = new Map();
  constructor(control, preseeded) {
    this.#control = control;
    if (preseeded) this.#seed(parse(control.canonicalText));
  }
  #seed(record) {
    let requests = this.#rows.get(record.grantId);
    if (requests === undefined) {
      requests = new Map();
      this.#rows.set(record.grantId, requests);
    }
    requests.set(record.requestId, serialize(record));
  }
  #note(method, args) {
    const c = this.#control;
    const entry = {
      method, receiver: this, args, ordinal: ++c.calls[method],
      descriptors: args.map(value => Object.getOwnPropertyDescriptors(value)),
    };
    c.log.push(entry);
    return entry;
  }
  #result(entry, normal) {
    const c = this.#control;
    entry.returned = entry.method === c.spec.method && entry.ordinal === c.spec.ordinal
      ? c.makeRejected() : normal;
    return entry.returned;
  }
  load(...args) {
    const entry = this.#note('load', args);
    return this.#result(entry, this.#control.funding);
  }
  getOriginalRequest(...args) {
    const entry = this.#note('get', args);
    const value = args[0];
    const text = this.#rows.get(value.grantId)?.get(value.requestId);
    return this.#result(entry, text === undefined ? null : parse(text));
  }
  retainOriginalRequest(...args) {
    const entry = this.#note('retain', args);
    const record = capture(input(args[0]), binding());
    this.#seed(record); // Declared write precedes the selected rejected return.
    return this.#result(entry, parse(serialize(record)));
  }
  rows() {
    const result = [];
    for (const [grantId, requests] of this.#rows) {
      for (const [requestId, text] of requests) result.push([grantId, requestId, text]);
    }
    return result;
  }
  close() {
    this.#control.closeCalls++;
  }
}

function descriptors(value) {
  return {
    value, prototype: Object.getPrototypeOf(value),
    own: Object.getOwnPropertyDescriptors(value),
  };
}
function unchanged(saved) {
  q(Object.getPrototypeOf(saved.value), saved.prototype);
  same(Object.getOwnPropertyDescriptors(saved.value), saved.own);
}
function redacted(value, originalJson, checksum) {
  const text = JSON.stringify(value);
  for (const secret of [
    FUNDING, SERVICE, HASH, NETWORK, CHALLENGE_HEADER, PAYMENT_HEADER,
    'grant_A', 'request_A', originalJson, checksum, MARKER_TAG,
  ]) q(text.includes(secret), false, 'REDACTED_RESULT');
}
function expectError(error, suffix, originalJson, checksum) {
  ok(error instanceof TypeError);
  q(Object.getPrototypeOf(error), TypeError.prototype);
  q(error.name, 'TypeError');
  q(error.code, PREFIX + suffix);
  q(error.message, PREFIX + suffix);
  q(error.stack, 'TypeError: ' + PREFIX + suffix);
  q(Object.hasOwn(error, 'cause'), false);
  ok(Object.isFrozen(error));
  same(Reflect.ownKeys(error).sort(), ['code', 'message', 'stack']);
  for (const name of ['code', 'message', 'stack']) {
    const descriptor = Object.getOwnPropertyDescriptor(error, name);
    q(Object.hasOwn(descriptor, 'value'), true);
    q(descriptor.writable, false);
    q(descriptor.configurable, false);
  }
  redacted(error, originalJson, checksum);
}
function expectState(owner, spec, closed, originalJson, checksum) {
  const state = owner.snapshot();
  same(state, {
    phase: 'CUSTODY_OUTCOME_UNKNOWN', closed, active: false,
    grantScoped: true, trackedRequests: spec.counts[3], maxRequests: 2,
    drainStatus: 'NONE', closeOutcome: closed ? 'UNKNOWN' : 'NOT_REQUESTED',
    counts: {
      loadReads: spec.counts[0], recordReads: spec.counts[1],
      retainCalls: spec.counts[2], readbackConfirmations: 0,
      dispatchCalls: 0, callbackCompletions: 0,
    },
    uncertainty: {
      custody: true, submission: false, undrained: false,
      declaredFundingAmbiguitySeen: false,
    },
    qualification: 'DECLARED_CALLBACK_LIFECYCLE_ONLY',
    serviceOutcome: 'NOT_ESTABLISHED',
    durability: 'NOT_ESTABLISHED', recoveryAuthority: 'NONE',
  });
  ok(Object.isFrozen(state));
  ok(Object.isFrozen(state.counts));
  ok(Object.isFrozen(state.uncertainty));
  redacted(state, originalJson, checksum);
  return state;
}

async function runCase(timing, path) {
  const spec = CASES[path];
  ok(spec);
  ok(timing === 'immediate' || timing === 'deferred');
  const value = Object.freeze(original());
  const readKey = Object.freeze(key(value));
  const custodyPolicy = Object.freeze(policy());
  const data = funding();
  const canonicalRecord = capture(input(value), binding());
  const canonicalText = serialize(canonicalRecord);
  const canonicalSHA = digest(canonicalText);
  const initialFundingText = JSON.stringify(data);
  const initialFundingSHA = digest(initialFundingText);
  const owned = new Map(), events = [], ownerSinks = [];
  const marker = Object.freeze({ tag: MARKER_TAG });
  const c = {
    spec, funding: data, canonicalText, log: [],
    calls: { load: 0, get: 0, retain: 0 }, closeCalls: 0, dispatches: 0, made: 0,
    makeRejected() {
      const entry = { settled: timing === 'immediate', descriptors: null };
      let promise;
      if (timing === 'immediate') {
        promise = APPLY(REJECT, P, [marker]);
      } else {
        promise = new P((_resolve, reject) => {
          QUEUE_MICROTASK(() => {
            entry.settled = true;
            reject(marker);
          });
        });
      }
      entry.descriptors = Object.getOwnPropertyDescriptors(promise);
      owned.set(promise, entry);
      c.made++;
      return promise;
    },
  };
  const store = new DeclaredStore(c, spec.api === 'read');
  const config = Object.freeze({
    store, fundingResourceUrl: FUNDING, custodyPolicy, selectedGrantId: 'grant_A',
  });
  const protectedData = [
    value, readKey, custodyPolicy, config, data, data.paymentRequired,
    data.paymentPayload, data.paymentPayload.resource, data.paymentPayload.accepted,
    data.paymentPayload.payload, data.paymentPayload.payload.transaction,
    data.requirement, data.requirement.extra, canonicalRecord,
  ].map(descriptors);
  const storeShape = descriptors(store);
  const storePrototypeShape = descriptors(DeclaredStore.prototype);
  const dispatch = Object.freeze(function () { c.dispatches++; });
  const expectedRow = [value.grantId, value.requestId, canonicalText];
  same(store.rows(), spec.api === 'read' ? [expectedRow] : []);

  // Ignore rejection reasons and count events only for exact fixture identities.
  // No raw store Promise receives a test sink before the later measurement.
  function onUnhandled(_reason, promise) {
    if (owned.has(promise)) events.push(promise);
  }
  function observeOwner(promise) {
    q(owned.has(promise), false, 'OWNER_RESULT_MUST_NOT_BE_RAW_STORE_PROMISE');
    q(Object.getPrototypeOf(promise), P.prototype);
    const sink = APPLY(THEN, promise, [
      () => ({ state: 'fulfilled' }),
      error => ({ state: 'rejected', error }),
    ]);
    ownerSinks.push(sink);
    return sink;
  }
  function rejectedOutcome(outcome, suffix) {
    q(outcome.state, 'rejected');
    expectError(outcome.error, suffix, value.originalRequestJson, canonicalRecord.checksum);
  }
  function checkpoint(owner, closed) {
    expectState(owner, spec, closed, value.originalRequestJson, canonicalRecord.checksum);
    same(c.calls, {
      load: spec.counts[0], get: spec.counts[1], retain: spec.counts[2],
    });
    same(c.log.map(entry => entry.method), spec.trace);
    q(c.log.length, spec.trace.length);
    q(c.closeCalls, 0);
    q(c.dispatches, 0);
    q(c.made, 1);
    q(owned.size, 1);
    let faultReturns = 0;
    for (const entry of c.log) {
      q(entry.receiver, store);
      q(entry.args.length, entry.method === 'load' ? 0 : 1);
      if (entry.args.length) {
        const expected = entry.method === 'retain' ? value : readKey;
        same(entry.args[0], expected);
        same(Reflect.ownKeys(entry.args[0]), Reflect.ownKeys(expected));
        q(Object.getPrototypeOf(entry.args[0]), Object.prototype);
        same(Object.getOwnPropertyDescriptors(entry.args[0]), entry.descriptors[0]);
      }
      if (entry.method === spec.method && entry.ordinal === spec.ordinal) {
        q(owned.has(entry.returned), true);
        faultReturns++;
      } else {
        q(owned.has(entry.returned), false);
      }
    }
    q(faultReturns, 1);
    for (const [promise, entry] of owned) {
      q(Object.getPrototypeOf(promise), P.prototype);
      same(Object.getOwnPropertyDescriptors(promise), entry.descriptors);
    }
    same(store.rows(), spec.rows ? [expectedRow] : []);
    for (const [, , text] of store.rows()) {
      q(text, canonicalText);
      q(digest(text), canonicalSHA);
      const record = parse(text);
      same(record, canonicalRecord);
      q(serialize(record), text);
      q(record.checksum, canonicalRecord.checksum);
      q(record.originalRequestJson, value.originalRequestJson);
      q(record.originalBodyBase64, '');
      q(record.serviceResourceUrl, SERVICE);
      q(record.fundingResourceUrl, FUNDING);
      q(record.paymentHash, HASH);
      q(record.network, NETWORK);
      q(record.grantId, value.grantId);
      q(record.requestId, value.requestId);
    }
    for (const saved of protectedData) unchanged(saved);
    unchanged(storeShape);
    unchanged(storePrototypeShape);
    q(JSON.stringify(data), initialFundingText);
    q(digest(JSON.stringify(data)), initialFundingSHA);
    q(data.revision, 3);
    q(data.status, 'BOUND');
    q(data.ambiguityLatched, false);
    q(data.challengeHeader, CHALLENGE_HEADER);
    q(data.paymentHeader, PAYMENT_HEADER);
    q(data.paymentPayload.payload.transaction.hash, HASH);
    q(data.requirement.network, NETWORK);
    q(value.originalBodyBase64, '');
    q(value.serviceResourceUrl, SERVICE);
    q(value.grantId, 'grant_A');
    q(value.requestId, 'request_A');
    q(value.originalRequestJson, original().originalRequestJson);
    q(custodyPolicy.maxRequests, 2);
    q(config.selectedGrantId, 'grant_A');
    q(config.store, store);
  }

  process.on('unhandledRejection', onUnhandled);
  try {
    const owner = createOwner(config);
    ok(Object.isFrozen(owner));
    same(Reflect.ownKeys(owner), ['submitOriginal', 'readOriginal', 'snapshot', 'close']);
    for (const fn of Object.values(owner)) ok(Object.isFrozen(fn));
    const pristine = owner.snapshot();
    same(pristine, {
      phase: 'IDLE', closed: false, active: false,
      grantScoped: true, trackedRequests: 0, maxRequests: 2,
      drainStatus: 'NONE', closeOutcome: 'NOT_REQUESTED',
      counts: {
        loadReads: 0, recordReads: 0, retainCalls: 0,
        readbackConfirmations: 0, dispatchCalls: 0, callbackCompletions: 0,
      },
      uncertainty: {
        custody: false, submission: false, undrained: false,
        declaredFundingAmbiguitySeen: false,
      },
      qualification: 'DECLARED_CALLBACK_LIFECYCLE_ONLY',
      serviceOutcome: 'NOT_ESTABLISHED',
      durability: 'NOT_ESTABLISHED', recoveryAuthority: 'NONE',
    });
    ok(Object.isFrozen(pristine));
    ok(Object.isFrozen(pristine.counts));
    ok(Object.isFrozen(pristine.uncertainty));
    redacted(pristine, value.originalRequestJson, canonicalRecord.checksum);
    if (spec.api === 'submit') {
      // Observe the separate owner operation promptly, never the raw return.
      const result = observeOwner(owner.submitOriginal(value, dispatch));
      checkpoint(owner, false);
      rejectedOutcome(await result, 'CUSTODY_OUTCOME_UNKNOWN');
    } else {
      let error;
      try { owner.readOriginal(readKey); } catch (caught) { error = caught; }
      expectError(error, 'CUSTODY_OUTCOME_UNKNOWN',
        value.originalRequestJson, canonicalRecord.checksum);
      checkpoint(owner, false);
    }
    // Explicit resubmission is held before another store/callback invocation.
    const held = observeOwner(owner.submitOriginal(value, dispatch));
    checkpoint(owner, false);
    rejectedOutcome(await held, 'CUSTODY_OUTCOME_UNKNOWN');

    await turns(4); // Four real setImmediate turns, not microtask-only flushing.
    for (const entry of owned.values()) q(entry.settled, true);
    q(events.length, 0, 'OWNED_STORE_PROMISE_UNHANDLED');
    checkpoint(owner, false);

    const closing = owner.close();
    const closeResult = observeOwner(closing);
    q(owner.close(), closing);
    checkpoint(owner, true);
    const closedSubmit = observeOwner(owner.submitOriginal(value, dispatch));
    let closedReadError;
    try { owner.readOriginal(readKey); } catch (caught) { closedReadError = caught; }
    expectError(closedReadError, 'CLOSED',
      value.originalRequestJson, canonicalRecord.checksum);
    rejectedOutcome(await closeResult, 'CLOSE_FAILED');
    rejectedOutcome(await closedSubmit, 'CLOSED');
    q(owner.close(), closing);
    // Held metadata reads are not asserted to be disabled before close.
    // The closed gate above refuses both APIs without additional store calls.
    await turns(4);
    q(events.length, 0, 'OWNED_STORE_PROMISE_UNHANDLED');
    checkpoint(owner, true);
    q(ownerSinks.length, spec.api === 'submit' ? 4 : 3);
  } finally {
    try {
      await turns(4);
      for (const entry of owned.values()) q(entry.settled, true);
      // Even an earlier assertion failure cannot install an early raw sink.
      try {
        q(events.length, 0, 'OWNED_STORE_PROMISE_UNHANDLED');
      } finally {
        const tails = [];
        for (const [promise] of owned) {
          tails.push(APPLY(THEN, promise, [() => undefined, () => undefined]));
        }
        await P.all(tails);
        await P.all(ownerSinks);
        await turns(2);
      }
    } finally {
      process.removeListener('unhandledRejection', onUnhandled);
    }
  }
}

test('immediate rejected native store Promise: submit initial load', { timeout: 5000, concurrency: false }, async () => {
  await runCase('immediate', 'submit-initial-load');
});

test('immediate rejected native store Promise: submit original get', { timeout: 5000, concurrency: false }, async () => {
  await runCase('immediate', 'submit-original-get');
});

test('immediate rejected native store Promise: submit retain result after declared write', { timeout: 5000, concurrency: false }, async () => {
  await runCase('immediate', 'submit-retain-result-after-write');
});

test('immediate rejected native store Promise: submit readback get', { timeout: 5000, concurrency: false }, async () => {
  await runCase('immediate', 'submit-readback-get');
});

test('immediate rejected native store Promise: submit final load', { timeout: 5000, concurrency: false }, async () => {
  await runCase('immediate', 'submit-final-load');
});

test('immediate rejected native store Promise: read initial load with preseeded row', { timeout: 5000, concurrency: false }, async () => {
  await runCase('immediate', 'read-initial-load-preseeded');
});

test('immediate rejected native store Promise: read original get with preseeded row', { timeout: 5000, concurrency: false }, async () => {
  await runCase('immediate', 'read-original-get-preseeded');
});

test('immediate rejected native store Promise: read final load with preseeded row', { timeout: 5000, concurrency: false }, async () => {
  await runCase('immediate', 'read-final-load-preseeded');
});

test('deferred rejected native store Promise: submit initial load', { timeout: 5000, concurrency: false }, async () => {
  await runCase('deferred', 'submit-initial-load');
});

test('deferred rejected native store Promise: submit original get', { timeout: 5000, concurrency: false }, async () => {
  await runCase('deferred', 'submit-original-get');
});

test('deferred rejected native store Promise: submit retain result after declared write', { timeout: 5000, concurrency: false }, async () => {
  await runCase('deferred', 'submit-retain-result-after-write');
});

test('deferred rejected native store Promise: submit readback get', { timeout: 5000, concurrency: false }, async () => {
  await runCase('deferred', 'submit-readback-get');
});

test('deferred rejected native store Promise: submit final load', { timeout: 5000, concurrency: false }, async () => {
  await runCase('deferred', 'submit-final-load');
});

test('deferred rejected native store Promise: read initial load with preseeded row', { timeout: 5000, concurrency: false }, async () => {
  await runCase('deferred', 'read-initial-load-preseeded');
});

test('deferred rejected native store Promise: read original get with preseeded row', { timeout: 5000, concurrency: false }, async () => {
  await runCase('deferred', 'read-original-get-preseeded');
});

test('deferred rejected native store Promise: read final load with preseeded row', { timeout: 5000, concurrency: false }, async () => {
  await runCase('deferred', 'read-final-load-preseeded');
});

