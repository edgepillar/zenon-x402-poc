import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as httpAdapterModule from '../src/service-credit-external-holder-grant-descriptor-handoff-http.js';
import {
  SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_VERSION,
  createServiceCreditExternalHolderGrantDescriptorSigningBytes,
} from '../src/service-credit-external-holder-grant-descriptor-handoff.js';
import {
  deriveServiceCreditCapabilityCommitment,
} from '../src/service-credit-capability.js';

const {
  SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_BYTES,
  SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_PAIRS,
  SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_REDEMPTION_BYTES,
  createServiceCreditExternalHolderGrantDescriptorHandoffHttpAdapter,
} = httpAdapterModule;

const ORIGIN = 'https://service.example';
const CHALLENGE_TARGET = '/service-credit/external-holder/challenge';
const REDEMPTION_TARGET = '/service-credit/external-holder/redeem';
const NOW = 2_000_000_000_000;
const LIFETIME_MS = 1_000;
const GRANT_ID = 'grant.external-holder.http';
const FAILURE_BODY = '{"error":"unavailable"}';
const INVALID_CONFIGURATION =
  'SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_INVALID_CONFIGURATION';

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function keyMaterial() {
  const pair = generateKeyPairSync('ed25519');
  const spki = pair.publicKey.export({ format: 'der', type: 'spki' });
  return Object.freeze({
    privateKey: pair.privateKey,
    publicKey: spki.subarray(-32).toString('base64url'),
  });
}

function selectionFor(publicKey) {
  return {
    offerId: 'offer.external-holder.http',
    offerVersion: 1,
    holderId: 'holder.external.http',
    capabilityCommitment: deriveServiceCreditCapabilityCommitment({ publicKey }),
  };
}

function rawHeaderBytes(rawHeaders) {
  let bytes = 0;
  for (let index = 0; index < rawHeaders.length; index += 2) {
    bytes += Buffer.byteLength(rawHeaders[index], 'utf8');
    bytes += Buffer.byteLength(rawHeaders[index + 1], 'utf8');
    bytes += 4;
  }
  return bytes;
}

function challengeHeaders(extra = []) {
  return ['Host', 'service.example', 'Content-Length', '0', 'Connection', 'close', ...extra];
}

function redemptionHeaders(length, extra = []) {
  return [
    'Host',
    'service.example',
    'Content-Length',
    String(length),
    'Content-Type',
    'application/json',
    'Connection',
    'close',
    ...extra,
  ];
}

function requestFixture({
  target = CHALLENGE_TARGET,
  method = 'POST',
  rawHeaders = challengeHeaders(),
  chunks = [],
  complete = true,
  aborted = false,
} = {}) {
  const state = { iteratorAccesses: 0, nextCalls: 0 };
  const request = {
    method,
    url: target,
    rawHeaders,
    complete,
    aborted,
    [Symbol.asyncIterator]() {
      state.iteratorAccesses += 1;
      let index = 0;
      return {
        [Symbol.asyncIterator]() { return this; },
        next() {
          state.nextCalls += 1;
          if (index >= chunks.length) return Promise.resolve({ done: true, value: undefined });
          const value = chunks[index];
          index += 1;
          return Promise.resolve({ done: false, value });
        },
      };
    },
  };
  return { request, state };
}

function controlledRequest({ target, rawHeaders, body, splitAt = 1 }) {
  let releaseNext;
  let rejectNext;
  let resolveWaiting;
  const waiting = new Promise(resolve => { resolveWaiting = resolve; });
  const first = body.subarray(0, splitAt);
  const rest = body.subarray(splitAt);
  const state = { iteratorAccesses: 0, nextCalls: 0 };
  const request = {
    method: 'POST',
    url: target,
    rawHeaders,
    complete: false,
    aborted: false,
    [Symbol.asyncIterator]() {
      state.iteratorAccesses += 1;
      let stage = 0;
      return {
        [Symbol.asyncIterator]() { return this; },
        next() {
          state.nextCalls += 1;
          if (stage === 0) {
            stage = 1;
            return Promise.resolve({ done: false, value: first });
          }
          if (stage === 1) {
            stage = 2;
            resolveWaiting();
            return new Promise((resolve, reject) => {
              releaseNext = () => {
                request.complete = true;
                resolve(rest.length === 0
                  ? { done: true, value: undefined }
                  : { done: false, value: rest });
              };
              rejectNext = () => {
                request.aborted = true;
                reject(new Error('synthetic-private-stream-detail'));
              };
            });
          }
          return Promise.resolve({ done: true, value: undefined });
        },
      };
    },
  };
  return Object.freeze({
    request,
    state,
    waiting,
    finish() { releaseNext(); },
    abort() { rejectNext(); },
  });
}

function responseFixture(onEnd = undefined) {
  const headers = Object.create(null);
  const state = { body: null, endCalls: 0 };
  const response = {
    statusCode: 0,
    writableEnded: false,
    destroyed: false,
    setHeader(name, value) { headers[String(name).toLowerCase()] = String(value); },
    end(body) {
      state.endCalls += 1;
      state.body = body;
      this.writableEnded = true;
      if (onEnd !== undefined) onEnd();
    },
  };
  return { response, headers, state };
}

async function exchange(adapter, request, onEnd = undefined) {
  const captured = responseFixture(onEnd);
  const returned = await adapter.handle(request, captured.response);
  return {
    returned,
    statusCode: captured.response.statusCode,
    headers: captured.headers,
    body: captured.state.body,
    endCalls: captured.state.endCalls,
  };
}

function assertPrivacyHeaders(result) {
  assert.deepEqual({ ...result.headers }, {
    'cache-control': 'private, no-store, max-age=0',
    connection: 'close',
    'content-length': String(result.body.length),
    'content-type': 'application/json',
    'x-content-type-options': 'nosniff',
  });
}

function assertUnavailable(result) {
  assert.equal(result.returned, undefined);
  assert.equal(result.statusCode, 503);
  assert.equal(result.endCalls, 1);
  assert.equal(Buffer.isBuffer(result.body), true);
  assert.equal(result.body.toString('utf8'), FAILURE_BODY);
  assertPrivacyHeaders(result);
}

function assertSuccessfulJson(result, expectedStatus = 200) {
  assert.equal(result.returned, undefined);
  assert.equal(result.statusCode, expectedStatus);
  assert.equal(result.endCalls, 1);
  assert.equal(Buffer.isBuffer(result.body), true);
  assert.equal(canonicalJson(JSON.parse(result.body.toString('utf8'))), result.body.toString('utf8'));
  assertPrivacyHeaders(result);
}

function signedRedemption(challenge, context, overrides = {}) {
  const signingSelection = overrides.signingSelection ?? context.selection;
  const signingOrigin = overrides.signingOrigin ?? context.origin;
  const signingKeys = overrides.signingKeys ?? context.keys;
  return {
    challenge,
    publicKey: signingKeys.publicKey,
    signature: sign(
      null,
      createServiceCreditExternalHolderGrantDescriptorSigningBytes({
        ...challenge,
        origin: signingOrigin,
        selection: signingSelection,
      }),
      signingKeys.privateKey,
    ).toString('base64url'),
    ...(Object.hasOwn(overrides, 'signature') ? { signature: overrides.signature } : {}),
  };
}

function makeConfiguration(overrides = {}) {
  const keys = overrides.keys ?? keyMaterial();
  const selection = overrides.selection ?? selectionFor(keys.publicKey);
  const state = overrides.state ?? {
    now: NOW,
    nowReads: 0,
    admitCalls: 0,
    admissions: [],
    ownerReads: 0,
  };
  const ownerSelection = Object.freeze({ ...(overrides.ownerSelection ?? selection) });
  const descriptor = overrides.descriptor ?? Object.freeze({
    grantId: GRANT_ID,
    capabilityCommitment: selection.capabilityCommitment,
  });
  const now = overrides.now ?? Object.freeze(() => {
    state.nowReads += 1;
    return state.now;
  });
  const getActiveGrantDescriptorForSelection = overrides.getActiveGrantDescriptorForSelection
    ?? Object.freeze(requestedSelection => {
      state.ownerReads += 1;
      if (overrides.ownerHook !== undefined) overrides.ownerHook();
      assert.deepEqual(requestedSelection, ownerSelection);
      return descriptor;
    });
  const admitRequest = overrides.admitRequest ?? Object.freeze(admission => {
    state.admitCalls += 1;
    state.admissions.push(admission);
    return true;
  });
  return {
    keys,
    selection,
    state,
    descriptor,
    origin: overrides.origin ?? ORIGIN,
    configuration: {
      origin: overrides.origin ?? ORIGIN,
      selection,
      challengeLifetimeMs: overrides.challengeLifetimeMs ?? LIFETIME_MS,
      now,
      getActiveGrantDescriptorForSelection,
      challengeRequestTarget: overrides.challengeRequestTarget ?? CHALLENGE_TARGET,
      redemptionRequestTarget: overrides.redemptionRequestTarget ?? REDEMPTION_TARGET,
      admitRequest,
    },
  };
}

function fixture(overrides = {}) {
  const context = makeConfiguration(overrides);
  context.adapter = createServiceCreditExternalHolderGrantDescriptorHandoffHttpAdapter(
    context.configuration,
  );
  return context;
}

async function issueChallenge(context) {
  const input = requestFixture();
  const response = await exchange(context.adapter, input.request);
  assertSuccessfulJson(response);
  const challenge = JSON.parse(response.body.toString('utf8'));
  assert.deepEqual(Object.keys(challenge).sort(), ['challenge', 'expiresAtMs', 'handoffVersion']);
  return challenge;
}

async function redeem(context, redemption) {
  const body = Buffer.from(canonicalJson(redemption), 'utf8');
  const input = requestFixture({
    target: REDEMPTION_TARGET,
    rawHeaders: redemptionHeaders(body.length),
    chunks: [body],
  });
  return exchange(context.adapter, input.request);
}

test('the module exports only the bounded listenerless adapter API and import is inert', async t => {
  assert.deepEqual(Object.keys(httpAdapterModule).sort(), [
    'SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_BYTES',
    'SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_PAIRS',
    'SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_REDEMPTION_BYTES',
    'createServiceCreditExternalHolderGrantDescriptorHandoffHttpAdapter',
  ]);
  assert.equal(
    Number.isSafeInteger(
      SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_PAIRS,
    ) && SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_PAIRS > 0,
    true,
  );
  assert.equal(
    Number.isSafeInteger(
      SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_BYTES,
    ) && SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_BYTES > 0,
    true,
  );
  assert.equal(
    SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_REDEMPTION_BYTES,
    1_024,
  );

  const source = readFileSync(
    new URL('../src/service-credit-external-holder-grant-descriptor-handoff-http.js', import.meta.url),
    'utf8',
  );
  for (const forbidden of [
    'node:http',
    'node:https',
    'node:http2',
    'node:net',
    'node:tls',
    'node:fs',
    'createServer(',
    '.listen(',
    'process.env',
    'globalThis',
    'console.',
    'fetch(',
    'setTimeout(',
    'setInterval(',
  ]) assert.equal(source.includes(forbidden), false);
  assert.equal(
    source.includes("from './service-credit-external-holder-grant-descriptor-handoff.js'"),
    true,
  );

  const context = fixture();
  t.after(() => context.adapter.close());
  assert.equal(context.state.nowReads, 0);
  assert.equal(context.state.admitCalls, 0);
  assert.equal(context.state.ownerReads, 0);
  assert.deepEqual(Reflect.ownKeys(context.adapter), ['handle', 'close']);
  assert.equal(Object.isFrozen(context.adapter), true);
  assert.equal(Object.isFrozen(context.adapter.handle), true);
  assert.equal(Object.isFrozen(context.adapter.close), true);
  for (const hidden of [
    'handoff', 'selection', 'origin', 'admitRequest', 'descriptor', 'store', 'rawHeaders',
  ]) assert.equal(Object.hasOwn(context.adapter, hidden), false);
});

test('configuration is one exact plain-data object with two explicit canonical targets', () => {
  const base = makeConfiguration().configuration;
  const invalidTargets = [
    '',
    '/',
    'relative/path',
    '//authority.example/path',
    'https://service.example/path',
    '/path?query=1',
    '/path#fragment',
    '/path%2fsegment',
    '/path//segment',
    '/path/./segment',
    '/path/../segment',
    '/path/',
    '/path\\segment',
    '/path segment',
    '/path\tsegment',
    '/nön-ascii',
  ];
  for (const target of invalidTargets) {
    assert.throws(
      () => createServiceCreditExternalHolderGrantDescriptorHandoffHttpAdapter({
        ...base,
        challengeRequestTarget: target,
      }),
      error => error?.code === INVALID_CONFIGURATION,
    );
  }
  assert.throws(
    () => createServiceCreditExternalHolderGrantDescriptorHandoffHttpAdapter({
      ...base,
      redemptionRequestTarget: base.challengeRequestTarget,
    }),
    error => error?.code === INVALID_CONFIGURATION,
  );
  assert.throws(
    () => createServiceCreditExternalHolderGrantDescriptorHandoffHttpAdapter({
      ...base,
      unexpected: true,
    }),
    error => error?.code === INVALID_CONFIGURATION,
  );
  assert.throws(
    () => createServiceCreditExternalHolderGrantDescriptorHandoffHttpAdapter(
      Object.assign(Object.create(null), base),
    ),
    error => error?.code === INVALID_CONFIGURATION,
  );
  assert.throws(
    () => createServiceCreditExternalHolderGrantDescriptorHandoffHttpAdapter(
      new Proxy(base, {}),
    ),
    error => error?.code === INVALID_CONFIGURATION,
  );
  let getterCalls = 0;
  const accessor = { ...base };
  Object.defineProperty(accessor, 'admitRequest', {
    enumerable: true,
    get() { getterCalls += 1; return () => true; },
  });
  assert.throws(
    () => createServiceCreditExternalHolderGrantDescriptorHandoffHttpAdapter(accessor),
    error => error?.code === INVALID_CONFIGURATION,
  );
  assert.equal(getterCalls, 0);
  assert.throws(
    () => createServiceCreditExternalHolderGrantDescriptorHandoffHttpAdapter({
      ...base,
      admitRequest: new Proxy(() => true, {}),
    }),
    error => error?.code === INVALID_CONFIGURATION,
  );
  assert.throws(
    () => createServiceCreditExternalHolderGrantDescriptorHandoffHttpAdapter(),
    error => error?.code === INVALID_CONFIGURATION,
  );
  assert.throws(
    () => createServiceCreditExternalHolderGrantDescriptorHandoffHttpAdapter(base, base),
    error => error?.code === INVALID_CONFIGURATION,
  );
});

test('exact routes, methods, raw framing, and attacker bodies fail before admission or draining', async t => {
  const context = fixture();
  t.after(() => context.adapter.close());
  const invalid = [
    { name: 'query target', target: `${CHALLENGE_TARGET}?x=1` },
    { name: 'absolute target', target: `${ORIGIN}${CHALLENGE_TARGET}` },
    { name: 'method', method: 'GET' },
    { name: 'missing length', rawHeaders: ['Host', 'service.example'] },
    { name: 'duplicate length', rawHeaders: challengeHeaders(['Content-Length', '0']) },
    { name: 'lowercase length', rawHeaders: ['content-length', '0'] },
    { name: 'leading zero', rawHeaders: ['Content-Length', '00'] },
    { name: 'signed zero', rawHeaders: ['Content-Length', '+0'] },
    { name: 'spaced zero', rawHeaders: ['Content-Length', ' 0'] },
    { name: 'challenge content type', rawHeaders: challengeHeaders(['Content-Type', 'application/json']) },
    { name: 'transfer encoding', rawHeaders: challengeHeaders(['Transfer-Encoding', 'chunked']) },
    { name: 'trailers', rawHeaders: challengeHeaders(['Trailer', 'Digest']) },
    { name: 'expect', rawHeaders: challengeHeaders(['Expect', '100-continue']) },
    { name: 'upgrade', rawHeaders: challengeHeaders(['Upgrade', 'websocket']) },
    { name: 'content encoding', rawHeaders: challengeHeaders(['Content-Encoding', 'gzip']) },
    { name: 'te', rawHeaders: challengeHeaders(['TE', 'trailers']) },
    { name: 'duplicate connection', rawHeaders: challengeHeaders(['Connection', 'close']) },
    { name: 'connection list', rawHeaders: ['Content-Length', '0', 'Connection', 'close, upgrade'] },
    { name: 'keep alive', rawHeaders: ['Content-Length', '0', 'Connection', 'keep-alive'] },
    { name: 'proxy connection', rawHeaders: challengeHeaders(['Proxy-Connection', 'close']) },
    { name: 'keep-alive header', rawHeaders: challengeHeaders(['Keep-Alive', 'timeout=5']) },
  ];
  for (const candidate of invalid) await t.test(candidate.name, async () => {
    const input = requestFixture({
      ...candidate,
      chunks: [Buffer.from('attacker-body-must-not-be-drained', 'utf8')],
    });
    const beforeAdmissions = context.state.admitCalls;
    assertUnavailable(await exchange(context.adapter, input.request));
    assert.equal(context.state.admitCalls, beforeAdmissions);
    assert.equal(input.state.iteratorAccesses, 0);
    assert.equal(input.state.nextCalls, 0);
  });

  const unexpectedBody = requestFixture({ chunks: [Buffer.from('x', 'utf8')] });
  assertUnavailable(await exchange(context.adapter, unexpectedBody.request));
  assert.equal(unexpectedBody.state.nextCalls, 1);
  assert.equal(context.state.ownerReads, 0);
});

test('raw-header pair and aggregate-byte ceilings are enforced from rawHeaders', async t => {
  const exactPairs = ['Content-Length', '0'];
  for (
    let index = 1;
    index < SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_PAIRS;
    index += 1
  ) exactPairs.push(`X-Bound-${index}`, 'x');
  const atPairLimit = fixture();
  t.after(() => atPairLimit.adapter.close());
  const pairSuccess = await exchange(
    atPairLimit.adapter,
    requestFixture({ rawHeaders: exactPairs }).request,
  );
  assertSuccessfulJson(pairSuccess);
  assert.equal(atPairLimit.state.admitCalls, 1);

  const overPairs = fixture();
  t.after(() => overPairs.adapter.close());
  const tooMany = [...exactPairs, 'X-Over', 'x'];
  const overPairRequest = requestFixture({ rawHeaders: tooMany });
  assertUnavailable(await exchange(overPairs.adapter, overPairRequest.request));
  assert.equal(overPairs.state.admitCalls, 0);
  assert.equal(overPairRequest.state.iteratorAccesses, 0);

  const base = ['Content-Length', '0', 'X-Pad', ''];
  const padding = SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_BYTES
    - rawHeaderBytes(base);
  assert.equal(padding >= 0, true);
  const exactBytes = [...base];
  exactBytes[3] = 'a'.repeat(padding);
  assert.equal(
    rawHeaderBytes(exactBytes),
    SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_BYTES,
  );
  const atByteLimit = fixture();
  t.after(() => atByteLimit.adapter.close());
  assertSuccessfulJson(await exchange(
    atByteLimit.adapter,
    requestFixture({ rawHeaders: exactBytes }).request,
  ));

  const overBytes = fixture();
  t.after(() => overBytes.adapter.close());
  const tooLarge = [...exactBytes];
  tooLarge[3] += 'a';
  const overByteRequest = requestFixture({ rawHeaders: tooLarge });
  assertUnavailable(await exchange(overBytes.adapter, overByteRequest.request));
  assert.equal(overBytes.state.admitCalls, 0);
  assert.equal(overByteRequest.state.iteratorAccesses, 0);
});

test('normalized headers and body hooks are not consulted before validated admission', async t => {
  const context = fixture({ admitRequest: Object.freeze(() => false) });
  t.after(() => context.adapter.close());
  const input = requestFixture();
  let normalizedReads = 0;
  Object.defineProperty(input.request, 'headers', {
    get() { normalizedReads += 1; throw new Error('synthetic-private-header-detail'); },
  });
  assertUnavailable(await exchange(context.adapter, input.request));
  assert.equal(normalizedReads, 0);
  assert.equal(input.state.iteratorAccesses, 0);
  assert.equal(context.state.nowReads, 0);
  assert.equal(context.state.ownerReads, 0);
});

test('admission gets only fresh frozen descriptors and assimilates only primitive true', async t => {
  let thenGetterCalls = 0;
  let thenCalls = 0;
  let proxyGets = 0;
  const accessorThenable = {};
  Object.defineProperty(accessorThenable, 'then', {
    get() { thenGetterCalls += 1; return () => {}; },
  });
  const proxyResult = new Proxy({}, {
    get() { proxyGets += 1; throw new Error('synthetic-private-proxy-detail'); },
  });
  const cases = [
    ['false', false],
    ['throw', Symbol('throw')],
    ['native promise', Promise.resolve(true)],
    ['thenable', { then() { thenCalls += 1; throw new Error('synthetic-private-then-detail'); } }],
    ['accessor', accessorThenable],
    ['proxy', proxyResult],
    ['boolean wrapper', new Boolean(true)],
    ['number', 1],
    ['string', 'true'],
    ['null', null],
    ['object', Object.create(null)],
  ];
  for (const [name, returned] of cases) await t.test(name, async () => {
    const descriptors = [];
    const context = fixture({
      admitRequest: Object.freeze(descriptor => {
        descriptors.push(descriptor);
        if (typeof returned === 'symbol') throw new Error('synthetic-private-admission-detail');
        return returned;
      }),
    });
    t.after(() => context.adapter.close());
    const input = requestFixture();
    const response = await exchange(context.adapter, input.request);
    assertUnavailable(response);
    assert.equal(input.state.iteratorAccesses, 0);
    assert.equal(context.state.nowReads, 0);
    assert.equal(context.state.ownerReads, 0);
    assert.equal(descriptors.length, 1);
    assert.deepEqual(Reflect.ownKeys(descriptors[0]), ['operation', 'declaredBodyBytes']);
    assert.deepEqual(descriptors[0], { operation: 'CHALLENGE', declaredBodyBytes: 0 });
    assert.equal(Object.isFrozen(descriptors[0]), true);
  });
  assert.equal(thenGetterCalls, 0);
  assert.equal(thenCalls, 0);
  assert.equal(proxyGets, 0);

  const admissions = [];
  const context = fixture({
    admitRequest: Object.freeze(descriptor => { admissions.push(descriptor); return true; }),
  });
  t.after(() => context.adapter.close());
  await issueChallenge(context);
  assertUnavailable(await exchange(context.adapter, requestFixture().request));
  assert.equal(admissions.length, 2);
  assert.notStrictEqual(admissions[0], admissions[1]);
  assert.deepEqual(admissions.map(value => value.operation), ['CHALLENGE', 'CHALLENGE']);
});

test('nested handle and admission-triggered close fail before body or handoff access', async t => {
  await t.test('nested handle', async t => {
    let adapter;
    let nested;
    let admissionCalls = 0;
    const context = makeConfiguration({
      admitRequest: Object.freeze(() => {
        admissionCalls += 1;
        nested = exchange(adapter, requestFixture().request);
        return true;
      }),
    });
    adapter = createServiceCreditExternalHolderGrantDescriptorHandoffHttpAdapter(
      context.configuration,
    );
    t.after(() => adapter.close());
    assertSuccessfulJson(await exchange(adapter, requestFixture().request));
    assertUnavailable(await nested);
    assert.equal(admissionCalls, 1);
    assert.equal(context.state.ownerReads, 0);
  });

  await t.test('callback close', async () => {
    let adapter;
    let closePromise;
    let closeSettled = false;
    const input = requestFixture();
    const context = makeConfiguration({
      admitRequest: Object.freeze(() => {
        closePromise = adapter.close();
        closePromise.then(() => { closeSettled = true; });
        return true;
      }),
    });
    adapter = createServiceCreditExternalHolderGrantDescriptorHandoffHttpAdapter(
      context.configuration,
    );
    const result = await exchange(adapter, input.request, () => {
      assert.equal(closeSettled, false);
    });
    assertUnavailable(result);
    assert.equal(input.state.iteratorAccesses, 0);
    assert.equal(context.state.nowReads, 0);
    assert.equal(context.state.ownerReads, 0);
    assert.strictEqual(adapter.close(), closePromise);
    await closePromise;
    assert.equal(closeSettled, true);
  });
});

test('body materialization rejects malformed framing, streams, UTF-8, JSON, and schemas', async t => {
  const context = fixture();
  t.after(() => context.adapter.close());
  const challenge = await issueChallenge(context);
  const valid = signedRedemption(challenge, context);
  const canonical = Buffer.from(canonicalJson(valid), 'utf8');
  const duplicate = Buffer.from(
    canonical.toString('utf8').replace(
      `"publicKey":"${valid.publicKey}"`,
      `"publicKey":"${valid.publicKey}","publicKey":"${valid.publicKey}"`,
    ),
    'utf8',
  );
  const candidates = [
    ['malformed JSON', Buffer.from('{', 'utf8')],
    ['fatal UTF-8', Buffer.from([0xc3, 0x28])],
    ['noncanonical whitespace', Buffer.from(` ${canonical.toString('utf8')}`, 'utf8')],
    ['duplicate key', duplicate],
    ['outer extra field', Buffer.from(canonicalJson({ ...valid, extra: true }), 'utf8')],
    ['nested extra field', Buffer.from(canonicalJson({
      ...valid,
      challenge: { ...valid.challenge, extra: true },
    }), 'utf8')],
    ['wrong outer type', Buffer.from('[]', 'utf8')],
    ['wrong nested type', Buffer.from(canonicalJson({ ...valid, challenge: [] }), 'utf8')],
  ];
  for (const [name, body] of candidates) await t.test(name, async () => {
    const beforeReads = context.state.ownerReads;
    const input = requestFixture({
      target: REDEMPTION_TARGET,
      rawHeaders: redemptionHeaders(body.length),
      chunks: [body],
    });
    assertUnavailable(await exchange(context.adapter, input.request));
    assert.equal(context.state.ownerReads, beforeReads);
  });

  const truncated = requestFixture({
    target: REDEMPTION_TARGET,
    rawHeaders: redemptionHeaders(canonical.length + 1),
    chunks: [canonical],
  });
  assertUnavailable(await exchange(context.adapter, truncated.request));
  assert.equal(truncated.state.nextCalls, 2);

  const overrun = requestFixture({
    target: REDEMPTION_TARGET,
    rawHeaders: redemptionHeaders(canonical.length - 1),
    chunks: [canonical, Buffer.from('must-not-drain', 'utf8')],
  });
  assertUnavailable(await exchange(context.adapter, overrun.request));
  assert.equal(overrun.state.nextCalls, 1);

  const incomplete = requestFixture({
    target: REDEMPTION_TARGET,
    rawHeaders: redemptionHeaders(canonical.length),
    chunks: [canonical],
    complete: false,
  });
  assertUnavailable(await exchange(context.adapter, incomplete.request));

  const aborted = requestFixture({
    target: REDEMPTION_TARGET,
    rawHeaders: redemptionHeaders(canonical.length),
    chunks: [canonical],
    aborted: true,
  });
  assertUnavailable(await exchange(context.adapter, aborted.request));

  const oversized = requestFixture({
    target: REDEMPTION_TARGET,
    rawHeaders: redemptionHeaders(
      SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_REDEMPTION_BYTES + 1,
    ),
    chunks: [Buffer.from('must-not-read', 'utf8')],
  });
  const admissionsBeforeOversize = context.state.admitCalls;
  assertUnavailable(await exchange(context.adapter, oversized.request));
  assert.equal(context.state.admitCalls, admissionsBeforeOversize);
  assert.equal(oversized.state.iteratorAccesses, 0);
  assert.equal(context.state.ownerReads, 0);

  const exact = await redeem(context, valid);
  assertSuccessfulJson(exact);
  assert.deepEqual(JSON.parse(exact.body.toString('utf8')), context.descriptor);
  assert.equal(context.state.ownerReads, 1);
});

test('redemption content framing is exact and validated before admission', async t => {
  const context = fixture();
  t.after(() => context.adapter.close());
  const invalidHeaders = [
    ['missing content type', ['Content-Length', '1']],
    ['duplicate content type', redemptionHeaders(1, ['Content-Type', 'application/json'])],
    ['lowercase content type', ['Content-Length', '1', 'content-type', 'application/json']],
    ['wrong value case', ['Content-Length', '1', 'Content-Type', 'Application/Json']],
    ['parameter', ['Content-Length', '1', 'Content-Type', 'application/json; charset=utf-8']],
    ['zero length', ['Content-Length', '0', 'Content-Type', 'application/json']],
    ['duplicate length', redemptionHeaders(1, ['Content-Length', '1'])],
    ['lowercase length', ['content-length', '1', 'Content-Type', 'application/json']],
  ];
  for (const [name, rawHeaders] of invalidHeaders) await t.test(name, async () => {
    const input = requestFixture({
      target: REDEMPTION_TARGET,
      rawHeaders,
      chunks: [Buffer.from('x', 'utf8')],
    });
    const before = context.state.admitCalls;
    assertUnavailable(await exchange(context.adapter, input.request));
    assert.equal(context.state.admitCalls, before);
    assert.equal(input.state.iteratorAccesses, 0);
  });
});

test('all failures use independent fixed privacy responses without sensitive reflection', async t => {
  const secret = 'synthetic-sensitive-marker';
  const context = fixture({
    admitRequest: Object.freeze(() => { throw new Error(secret); }),
  });
  t.after(() => context.adapter.close());
  const firstInput = requestFixture({ target: `${CHALLENGE_TARGET}?${secret}` });
  firstInput.request.rawHeaders.push('X-Sensitive', secret);
  const first = await exchange(context.adapter, firstInput.request);
  const second = await exchange(context.adapter, requestFixture().request);
  assertUnavailable(first);
  assertUnavailable(second);
  assert.notStrictEqual(first.body, second.body);
  assert.deepEqual(first.body, second.body);
  assert.equal(first.body.toString('utf8').includes(secret), false);
  first.body.fill(0x78);
  assert.equal(second.body.toString('utf8'), FAILURE_BODY);

  const brokenResponse = {
    set statusCode(_value) { throw new Error(secret); },
  };
  assert.equal(await context.adapter.handle(requestFixture().request, brokenResponse), undefined);
});

test('one admitted request owns the adapter with no queue', async t => {
  const context = fixture();
  t.after(() => context.adapter.close());
  const challenge = await issueChallenge(context);
  const redemption = signedRedemption(challenge, context);
  const body = Buffer.from(canonicalJson(redemption), 'utf8');
  const controlled = controlledRequest({
    target: REDEMPTION_TARGET,
    rawHeaders: redemptionHeaders(body.length),
    body,
  });
  const first = exchange(context.adapter, controlled.request);
  await controlled.waiting;
  const admissionsBeforeNested = context.state.admitCalls;
  const secondInput = requestFixture();
  assertUnavailable(await exchange(context.adapter, secondInput.request));
  assert.equal(context.state.admitCalls, admissionsBeforeNested);
  assert.equal(secondInput.state.iteratorAccesses, 0);
  controlled.finish();
  const completed = await first;
  assertSuccessfulJson(completed);
  assert.equal(context.state.ownerReads, 1);
});

test('close gates synchronously and waits only for admitted stream completion or abort', async t => {
  for (const finishMode of ['complete', 'abort']) await t.test(finishMode, async () => {
    const context = fixture();
    const challenge = await issueChallenge(context);
    const redemption = signedRedemption(challenge, context);
    const body = Buffer.from(canonicalJson(redemption), 'utf8');
    const controlled = controlledRequest({
      target: REDEMPTION_TARGET,
      rawHeaders: redemptionHeaders(body.length),
      body,
    });
    const response = exchange(context.adapter, controlled.request);
    await controlled.waiting;
    let settled = false;
    const closePromise = context.adapter.close();
    closePromise.then(() => { settled = true; });
    assert.strictEqual(context.adapter.close(), closePromise);
    assert.equal(Object.getPrototypeOf(closePromise), Promise.prototype);
    await Promise.resolve();
    assert.equal(settled, false);
    const afterClose = requestFixture();
    assertUnavailable(await exchange(context.adapter, afterClose.request));
    assert.equal(afterClose.state.iteratorAccesses, 0);
    assert.equal(settled, false);
    if (finishMode === 'complete') controlled.finish();
    else controlled.abort();
    assertUnavailable(await response);
    assert.equal(context.state.ownerReads, 0);
    await closePromise;
    assert.equal(settled, true);
    assert.strictEqual(context.adapter.close(), closePromise);
  });
});

test('body chunks and constructor inputs are captured against later mutation', async t => {
  const context = makeConfiguration();
  const originalSelection = Object.freeze({ ...context.selection });
  const adapter = createServiceCreditExternalHolderGrantDescriptorHandoffHttpAdapter(
    context.configuration,
  );
  t.after(() => adapter.close());
  context.configuration.admitRequest = () => false;
  context.configuration.challengeRequestTarget = '/changed';
  context.selection.offerId = 'offer.changed';
  context.selection.capabilityCommitment = `sha256:${'0'.repeat(64)}`;
  context.selection = originalSelection;
  context.adapter = adapter;
  const challenge = await issueChallenge(context);
  const redemption = signedRedemption(challenge, context);
  const body = Buffer.from(canonicalJson(redemption), 'utf8');
  const controlled = controlledRequest({
    target: REDEMPTION_TARGET,
    rawHeaders: redemptionHeaders(body.length),
    body,
    splitAt: body.length,
  });
  const pending = exchange(adapter, controlled.request);
  await controlled.waiting;
  body.fill(0x78);
  controlled.finish();
  const result = await pending;
  assertSuccessfulJson(result);
  assert.equal(context.state.ownerReads, 1);
});

test('the real adapter covers exact proof, wrong proof, expiry, replay, and selection mismatch', async t => {
  await t.test('exact proof and replay', async t => {
    const context = fixture();
    t.after(() => context.adapter.close());
    const challenge = await issueChallenge(context);
    assert.equal(challenge.handoffVersion,
      SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_VERSION);
    assert.equal(challenge.expiresAtMs, NOW + LIFETIME_MS);
    assert.match(challenge.challenge, /^[A-Za-z0-9_-]{43}$/);
    const redemption = signedRedemption(challenge, context);
    const first = await redeem(context, redemption);
    assertSuccessfulJson(first);
    assert.deepEqual(JSON.parse(first.body.toString('utf8')), context.descriptor);
    assert.deepEqual(context.state.admissions.at(-1), {
      operation: 'REDEMPTION',
      declaredBodyBytes: Buffer.byteLength(canonicalJson(redemption), 'utf8'),
    });
    assert.equal(Object.isFrozen(context.state.admissions.at(-1)), true);
    assertUnavailable(await redeem(context, redemption));
    assert.equal(context.state.ownerReads, 1);
  });

  await t.test('wrong proof burns the challenge before owner read', async t => {
    const context = fixture();
    t.after(() => context.adapter.close());
    const challenge = await issueChallenge(context);
    const exact = signedRedemption(challenge, context);
    const wrong = { ...exact, signature: Buffer.alloc(64).toString('base64url') };
    assertUnavailable(await redeem(context, wrong));
    assertUnavailable(await redeem(context, exact));
    assert.equal(context.state.ownerReads, 0);
  });

  await t.test('expiry burns the challenge before owner read', async t => {
    const context = fixture();
    t.after(() => context.adapter.close());
    const challenge = await issueChallenge(context);
    const exact = signedRedemption(challenge, context);
    context.state.now = challenge.expiresAtMs;
    assertUnavailable(await redeem(context, exact));
    assertUnavailable(await redeem(context, exact));
    assert.equal(context.state.ownerReads, 0);
  });

  await t.test('signed selection mismatch reaches no owner', async t => {
    const context = fixture();
    t.after(() => context.adapter.close());
    const challenge = await issueChallenge(context);
    const wrongSelection = {
      ...context.selection,
      holderId: 'holder.external.other',
    };
    assertUnavailable(await redeem(context, signedRedemption(challenge, context, {
      signingSelection: wrongSelection,
    })));
    assert.equal(context.state.ownerReads, 0);
  });

  await t.test('privileged selection mismatch discloses no descriptor', async t => {
    const keys = keyMaterial();
    const selected = selectionFor(keys.publicKey);
    const context = fixture({
      keys,
      selection: selected,
      ownerSelection: { ...selected, offerVersion: 2 },
    });
    t.after(() => context.adapter.close());
    const challenge = await issueChallenge(context);
    const response = await redeem(context, signedRedemption(challenge, context));
    assertUnavailable(response);
    assert.equal(context.state.ownerReads, 1);
    assert.equal(response.body.toString('utf8').includes(GRANT_ID), false);
  });
});

test('a closed adapter never reopens while a fresh adapter has a fresh lifecycle', async () => {
  const old = fixture();
  const firstClose = old.adapter.close();
  assert.strictEqual(old.adapter.close(), firstClose);
  await firstClose;
  const closedInput = requestFixture();
  assertUnavailable(await exchange(old.adapter, closedInput.request));
  assert.equal(closedInput.state.iteratorAccesses, 0);
  assert.equal(old.state.admitCalls, 0);

  const fresh = fixture();
  try {
    assertSuccessfulJson(await exchange(fresh.adapter, requestFixture().request));
    assert.equal(fresh.state.admitCalls, 1);
  } finally {
    await fresh.adapter.close();
  }
  assertUnavailable(await exchange(old.adapter, requestFixture().request));
});
