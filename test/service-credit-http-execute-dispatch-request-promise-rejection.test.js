/*
 * Source-pinned regression for rejected native requestImpl Promise returns.
 *
 * No HTTP/TLS/socket implementation is imported or sent. Each actual adapter
 * receives a fresh canonical declared custody record and Authorization string.
 * Their SHA/checksum/proof fields are DATA, not authenticated payment authority.
 *
 * Default pins require the candidate. Only explicit
 * SPV_HTTP_DISPATCH_REJECTED_PROMISE_PARENT_CONTROL=1 selects current parent.
 * The same desired assertions run in both profiles; parent red is not a pass.
 * No implicit source-hash fallback, assertion inversion or historical BASE.
 *
 * Exact owned request Promises get no test rejection sink until finally,
 * after measurement or a preceding failure and after their declared settlement.
 * The adapter operation is separately observed immediately. Exact test process
 * listeners are removed individually. No production process handler is added.
 * Event-loop turns/timeouts are cooperative diagnostics, not hard lifetime,
 * cancellation, OS/network cleanup, delivery, READY or persistence guarantees.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { setImmediate as nativeSetImmediate } from 'node:timers';

assert.equal(process.versions.node, '24.19.0');
const parentControl = process.env.SPV_HTTP_DISPATCH_REJECTED_PROMISE_PARENT_CONTROL;
if (parentControl !== undefined && parentControl !== '1') {
  throw new Error('INVALID_CURRENT_PARENT_CONTROL_PROFILE');
}
const dispatchPin = parentControl === '1'
  ? [25281, '044a7bd97a1344c1f95854a71dfb85eeb197c39fef2cd1b3c2b83b766a768008']
  : [27034, '254ba8eef5ea5efb3a1b901be09e9cb33afbc3cfcf63789ca4a23316b6180d1b'];
const pins = [
  ['../src/service-credit-http-execute-dispatch.js', ...dispatchPin],
  [
    '../src/service-credit-original-request-custody-contract.js',
    9810,
    '8f4d40d017a89e9a064c411c8e076cb21a45b9fb787fda7a664246b7bd744083',
  ],
  [
    '../package.json',
    1413,
    '8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5',
  ],
];
let packageText;
for (const [relative, bytes, sha256] of pins) {
  const raw = readFileSync(new URL(relative, import.meta.url));
  assert.equal(raw.length, bytes, 'complete source byte guard');
  assert.equal(createHash('sha256').update(raw).digest('hex'), sha256,
    'complete source SHA-256 guard');
  const text = raw.toString('utf8');
  assert.equal(/[^\x00-\x7f]/.test(text), false);
  assert.equal(text.includes('\0'), false);
  assert.ok(text.endsWith('\n'));
  if (relative === '../package.json') packageText = text;
}
const packageData = JSON.parse(packageText);
assert.equal(packageData.type, 'module');
assert.equal(packageData.engines.node, '>=24');
const {
  createServiceCreditHttpExecuteDispatch: CREATE,
} = await import('../src/service-credit-http-execute-dispatch.js');
const {
  captureOriginalServiceRequestCustody: capture,
  parseOriginalServiceRequestCustody: parse,
  serializeOriginalServiceRequestCustody: serialize,
} = await import('../src/service-credit-original-request-custody-contract.js');

const APPLY = Reflect.apply;
const P = Promise;
const THEN = P.prototype.then;
const REJECT = P.reject;
const ALL = P.all;
const QUEUE_MICROTASK = globalThis.queueMicrotask;
const ADD_LISTENER = process.on;
const REMOVE_LISTENER = process.removeListener;
const RESOURCE = 'https://dispatch.example.test/service-credit/v1/execute';
const FUNDING = 'https://dispatch.example.test/funding';
const NETWORK = 'zenon:declared';
const HASH = 'a'.repeat(64);
const EMPTY = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const PREFIX = 'SERVICE_CREDIT_HTTP_EXECUTE_DISPATCH_';
const MARKER = 'declared-neutral-request-promise-rejection';

function original(grantId = 'grant_A', requestId = 'request_A', maxCostUnits = 7) {
  return {
    grantId, requestId,
    originalRequestJson: JSON.stringify({
      modelVersion: 1, grantId, requestId, method: 'POST',
      routeId: 'service-credit.execute.v1', canonicalBodyDigest: EMPTY,
      selectedContentType: 'application/json', maxCostUnits,
    }),
    originalBodyBase64: '',
    serviceResourceUrl: RESOURCE,
  };
}
function authorization(change = {}, textTransform) {
  // Declared syntax only: no key generation, signing or verification.
  const proof = {
    grantId: 'grant_A', maxCostUnits: 7, proofVersion: 1,
    publicKey: 'declared-public-key', requestId: 'request_A',
    signature: 'declared-signature',
    ...change,
  };
  let text = JSON.stringify(proof);
  if (textTransform) text = textTransform(text);
  return 'ServiceCredit ' + Buffer.from(text, 'utf8').toString('base64url');
}
function sha(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function makeOwnedPromise(owned, mode) {
  const entry = { promise: null, settled: false };
  if (mode === 'immediate') {
    entry.promise = APPLY(REJECT, P, [MARKER]);
    entry.settled = true;
  } else {
    assert.equal(mode, 'microtask');
    entry.promise = new P((_resolve, reject) => {
      QUEUE_MICROTASK(() => {
        entry.settled = true;
        reject(MARKER);
      });
    });
  }
  owned.set(entry.promise, entry);
  assert.equal(Object.getPrototypeOf(entry.promise), P.prototype);
  return entry.promise;
}

function fixture(mode, owned) {
  const value = Object.freeze(original());
  const binding = Object.freeze({
    fundingResourceUrl: FUNDING, paymentHash: HASH, network: NETWORK,
  });
  const record = capture({
    originalRequestJson: value.originalRequestJson,
    originalBodyBase64: value.originalBodyBase64,
    serviceResourceUrl: value.serviceResourceUrl,
  }, binding);
  const authorizationHeader = authorization();
  const calls = [];
  let returnedPromise = null;
  const requestImpl = function (...args) {
    // Capture only; never call the supplied response callback or any I/O API.
    calls.push({ receiver: this, args });
    returnedPromise = makeOwnedPromise(owned, mode);
    return returnedPromise;
  };
  const config = Object.freeze({
    resourceUrl: RESOURCE,
    originalRequestJson: value.originalRequestJson,
    authorizationHeader,
    deadlineMs: 2000,
    requestImpl,
  });
  const adapter = CREATE(config);
  return {
    value, binding, record, config, adapter, calls, authorizationHeader,
    originalAuthorization: authorizationHeader,
    originalAuthorizationHash: sha(authorizationHeader),
    originalJsonHash: sha(value.originalRequestJson),
    recordText: serialize(record),
    recordHash: sha(serialize(record)),
    checksum: record.checksum,
    descriptors: Object.getOwnPropertyDescriptors(record),
    returnedPromise: () => returnedPromise,
  };
}

function preserved(f) {
  assert.ok(Object.isFrozen(f.value));
  assert.ok(Object.isFrozen(f.binding));
  assert.ok(Object.isFrozen(f.record));
  assert.ok(Object.isFrozen(f.config));
  assert.deepEqual(Object.getOwnPropertyDescriptors(f.record), f.descriptors);
  assert.equal(serialize(f.record), f.recordText);
  assert.equal(sha(serialize(f.record)), f.recordHash);
  assert.equal(f.record.checksum, f.checksum);
  const parsed = parse(f.recordText);
  assert.ok(Object.isFrozen(parsed));
  assert.deepEqual(parsed, f.record);
  assert.equal(f.record.originalRequestJson, f.value.originalRequestJson);
  assert.equal(sha(f.record.originalRequestJson), f.originalJsonHash);
  assert.equal(f.record.originalBodyBase64, '');
  assert.equal(f.record.serviceResourceUrl, RESOURCE);
  assert.equal(f.record.fundingResourceUrl, FUNDING);
  assert.equal(f.record.paymentHash, HASH);
  assert.equal(f.record.network, NETWORK);
  assert.equal(f.record.grantId, 'grant_A');
  assert.equal(f.record.requestId, 'request_A');
  assert.equal(f.config.authorizationHeader, f.originalAuthorization);
  assert.equal(f.authorizationHeader, f.originalAuthorization);
  assert.equal(sha(f.authorizationHeader), f.originalAuthorizationHash);
  assert.equal(f.recordText.includes(f.authorizationHeader), false);
  assert.equal(f.recordText.includes('declared-signature'), false);
}

function assertCapture(f) {
  assert.equal(f.calls.length, 1);
  const call = f.calls[0];
  assert.equal(call.receiver, undefined);
  assert.equal(call.args.length, 3);
  assert.equal(call.args[0], RESOURCE);
  assert.equal(typeof call.args[2], 'function');
  const options = call.args[1];
  assert.ok(Object.isFrozen(options));
  assert.ok(Object.isFrozen(options.headers));
  assert.deepEqual(Object.keys(options), [
    'method', 'headers', 'agent', 'rejectUnauthorized', 'maxHeaderSize',
    'insecureHTTPParser',
  ]);
  assert.deepEqual(options, {
    method: 'POST',
    headers: { Authorization: f.originalAuthorization },
    agent: false,
    rejectUnauthorized: true,
    maxHeaderSize: 16384,
    insecureHTTPParser: false,
  });
  assert.deepEqual(Object.keys(options.headers), ['Authorization']);
  assert.equal(options.headers.Authorization, f.originalAuthorization);
  assert.equal(sha(options.headers.Authorization), f.originalAuthorizationHash);
  assert.equal(Object.hasOwn(options, 'body'), false);
}

function redacted(value, f) {
  const text = JSON.stringify(value);
  for (const marker of [
    f.authorizationHeader, f.recordText, f.value.originalRequestJson,
    RESOURCE, FUNDING, HASH, 'grant_A', 'request_A',
    'declared-public-key', 'declared-signature', MARKER,
  ]) assert.equal(text.includes(marker), false);
}

function fixedError(error, suffix, f) {
  const code = PREFIX + suffix;
  assert.ok(error instanceof TypeError);
  assert.equal(error.name, 'TypeError');
  assert.equal(error.code, code);
  assert.equal(error.message, code);
  assert.equal(error.stack, 'TypeError: ' + code);
  assert.ok(Object.isFrozen(error));
  assert.equal(Object.hasOwn(error, 'cause'), false);
  redacted({ code: error.code, message: error.message, stack: error.stack }, f);
}

function assertSnapshot(f) {
  const view = f.adapter.snapshot();
  assert.ok(Object.isFrozen(view));
  assert.ok(Object.isFrozen(view.counts));
  assert.deepEqual(view, {
    phase: 'UNKNOWN_UNDRAINED',
    used: true,
    settled: true,
    unknown: true,
    undrained: true,
    deadlineFired: false,
    timerArmed: false,
    credentialReferenceReleased: true,
    requestObserved: false,
    responseObserved: false,
    requestClosed: false,
    responseEnded: false,
    responseClosed: false,
    responseComplete: false,
    replyValidated: false,
    duplicateResponseCallback: false,
    lateEventSeen: false,
    counts: {
      requestCalls: 1,
      responseHandles: 0,
      listenerRegistrations: 0,
      endCalls: 0,
      destroyCalls: 0,
      dataChunks: 0,
      bodyBytes: 0,
      settlements: 1,
    },
    qualification: 'SYNTHETIC_INTERFACE_ONLY',
    serviceDelivery: 'NOT_ESTABLISHED',
    realReady: 'NOT_ESTABLISHED',
    restart: 'NOT_ESTABLISHED',
    durability: 'NOT_ESTABLISHED',
  });
  assert.ok(JSON.stringify(view).length <= 4096);
  redacted(view, f);
  return view;
}

function observeOperation(promise) {
  const result = { fulfilled: false, rejected: false, error: null };
  // This is the ADAPTER operation, never the requestImpl-returned Promise.
  const settlement = APPLY(THEN, promise, [
    () => { result.fulfilled = true; },
    error => { result.rejected = true; result.error = error; },
  ]);
  return { result, settlement };
}

async function turns(count) {
  for (let index = 0; index < count; index++) {
    await new P(resolve => {
      nativeSetImmediate(() => { resolve(undefined); });
    });
  }
}

async function rejectedReturn(mode) {
  const owned = new Map();
  let unhandled = 0;
  const onUnhandled = (_reason, promise) => {
    if (owned.has(promise)) unhandled++;
  };
  const f = fixture(mode, owned);
  assert.deepEqual(Object.keys(f.adapter), ['dispatch', 'snapshot']);
  assert.ok(Object.isFrozen(f.adapter));
  assert.ok(Object.isFrozen(f.adapter.dispatch));
  assert.ok(Object.isFrozen(f.adapter.snapshot));
  const unused = f.adapter.snapshot();
  assert.equal(unused.phase, 'UNUSED');
  assert.equal(unused.used, false);
  assert.equal(unused.counts.requestCalls, 0);
  assert.equal(unused.timerArmed, false);
  preserved(f);

  APPLY(ADD_LISTENER, process, ['unhandledRejection', onUnhandled]);
  try {
    const operation = f.adapter.dispatch(f.record);
    const observed = observeOperation(operation); // prompt operation sink
    assert.equal(Object.getPrototypeOf(operation), P.prototype);
    assert.equal(owned.size, 1);
    assert.ok(owned.has(f.returnedPromise()));
    assert.notEqual(operation, f.returnedPromise());
    const beforeSettlement = assertSnapshot(f);
    assertCapture(f);
    preserved(f);

    await observed.settlement;
    assert.equal(observed.result.fulfilled, false);
    assert.equal(observed.result.rejected, true);
    fixedError(observed.result.error, 'UNKNOWN_UNDRAINED', f);
    assert.deepEqual(assertSnapshot(f), beforeSettlement);

    // No test reaction/sink/await has touched the owned request Promise.
    // These real turns expose its rejection to Node's unhandled-event checks.
    await turns(4);
    for (const entry of owned.values()) assert.equal(entry.settled, true);
    assert.equal(unhandled, 0, 'owned request Promise rejection was unhandled');
    assert.deepEqual(assertSnapshot(f), beforeSettlement);
    assertCapture(f);
    preserved(f);

    const repeated = observeOperation(f.adapter.dispatch(f.record));
    await repeated.settlement;
    assert.equal(repeated.result.fulfilled, false);
    assert.equal(repeated.result.rejected, true);
    fixedError(repeated.result.error, 'ALREADY_USED', f);
    assert.deepEqual(assertSnapshot(f), beforeSettlement);
    assertCapture(f);
    preserved(f);
    assert.equal(owned.size, 1);

    await turns(4);
    assert.equal(unhandled, 0, 'no later unhandled owned rejection');
    assert.deepEqual(assertSnapshot(f), beforeSettlement);
    assertCapture(f);
    preserved(f);
    assert.equal(owned.size, 1, 'no retry or replacement callback');
  } finally {
    try {
      // The only deferred rejection is our own queued microtask. Let it run
      // even if a prior assertion failed; never sink an unsettled fixture.
      await turns(2);
      const tails = [];
      for (const entry of owned.values()) {
        assert.equal(entry.settled, true, 'owned fixture must be settled');
        tails.push(APPLY(THEN, entry.promise, [
          () => undefined,
          () => undefined,
        ]));
      }
      await APPLY(ALL, P, [tails]);
      await turns(2);
    } finally {
      APPLY(REMOVE_LISTENER, process, ['unhandledRejection', onUnhandled]);
    }
  }
}

test('immediately rejected native request Promise stays UNKNOWN_UNDRAINED and observed',
  { timeout: 5000 }, async () => {
    await rejectedReturn('immediate');
  });

test('native request Promise rejected in a microtask stays UNKNOWN_UNDRAINED and observed',
  { timeout: 5000 }, async () => {
    await rejectedReturn('microtask');
  });
