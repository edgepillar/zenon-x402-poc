import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as sdk from 'znn-typescript-sdk';

import * as contract from
  '../src/zenon/internal/offline-preparation-nonce-contract.js';

const { composeOfflinePreparationWithNonceProof } = contract;

const REJECTION_CODE = 'offline_preparation_nonce_contract_rejected';
const EMPTY_HASH = '00'.repeat(32);
const ZERO_NONCE = '0'.repeat(16);
const POW_RANGE = 1n << 64n;
const PAYER_PUBLIC_KEY_BYTES = Buffer.alloc(32, 0x01);
const RECIPIENT_PUBLIC_KEY_BYTES = Buffer.alloc(32, 0x02);
const OTHER_PUBLIC_KEY_BYTES = Buffer.alloc(32, 0x03);
const PAYER_CORE = Buffer.concat([
  Buffer.alloc(1),
  sha3(PAYER_PUBLIC_KEY_BYTES).subarray(0, 19),
]);
const PAYER = sdk.Address.fromPublicKey(PAYER_PUBLIC_KEY_BYTES).toString();
const RECIPIENT = sdk.Address.fromPublicKey(RECIPIENT_PUBLIC_KEY_BYTES).toString();
const OTHER_ADDRESS = sdk.Address.fromPublicKey(OTHER_PUBLIC_KEY_BYTES).toString();
const PUBLIC_KEY = PAYER_PUBLIC_KEY_BYTES.toString('base64');
const DATA = sha3(Buffer.from('offline-preparation-nonce-data')).toString('base64');
const OTHER_DATA = sha3(Buffer.from('offline-preparation-nonce-other-data')).toString('base64');
const ACCOUNT_HASH = sha3(Buffer.from('previous-0')).toString('hex');
const OTHER_ACCOUNT_HASH = sha3(Buffer.from('previous-1')).toString('hex');
const MOMENTUM_HASH = sha3(Buffer.from('offline-preparation-nonce-momentum')).toString('hex');
const OTHER_MOMENTUM_HASH = sha3(
  Buffer.from('offline-preparation-nonce-other-momentum'),
).toString('hex');
const PRE_DP_VALID_NONCE = Buffer.from([3, 0, 0, 0, 0, 0, 0, 0]).toString('hex');
const PRE_DP_INVALID_NONCE = Buffer.from([1, 0, 0, 0, 0, 0, 0, 0]).toString('hex');
const DP_VALID_NONCE = '3c0f000000000000';
const DP_REVERSED_NONCE = Buffer.from(DP_VALID_NONCE, 'hex').reverse().toString('hex');
const DP_DIFFICULTY = 1500;
const EXPECTED_TRUST = Object.freeze({
  sourceAuthentication: 'NOT_ESTABLISHED',
  chainAuthentication: 'NOT_ESTABLISHED',
  canonicality: 'NOT_ESTABLISHED',
  finality: 'NOT_ESTABLISHED',
  liveFreshness: 'NOT_ESTABLISHED',
  signingAuthorization: 'NOT_ESTABLISHED',
});
const SOURCE_ROOT = fileURLToPath(new URL('../src/', import.meta.url));

function sha3(value) {
  return createHash('sha3-256').update(value).digest();
}

function referenceStatus({ payerCore = PAYER_CORE, previousAccountHash = ACCOUNT_HASH,
  difficulty, nonce }) {
  if (difficulty === 0) return 'NOT_REQUIRED';
  const domain = sha3(Buffer.concat([
    payerCore,
    Buffer.from(previousAccountHash, 'hex'),
  ]));
  const work = sha3(Buffer.concat([
    Buffer.from(nonce, 'hex'),
    domain,
  ]));
  let observed = 0n;
  for (let index = 7; index >= 0; index -= 1) {
    observed = (observed << 8n) | BigInt(work[index]);
  }
  const threshold = POW_RANGE - (POW_RANGE / BigInt(difficulty));
  return observed >= threshold ? 'VALID' : 'INVALID';
}

function context(overrides = {}) {
  return {
    chainIdentifier: 1,
    networkIdentifier: 'synthetic-network-v1',
    profileIdentifier: 'synthetic-profile-v1',
    epochIdentifier: 'synthetic-epoch-v1',
    ...overrides,
  };
}

function manifest(trustLabel = 'synthetic-recorded') {
  return {
    payer: PAYER,
    publicKey: PUBLIC_KEY,
    intent: {
      toAddress: RECIPIENT,
      amount: '42',
      tokenStandard: sdk.ZNN_ZTS.toString(),
      data: DATA,
    },
    context: context(),
    trustLabel,
  };
}

function momentum(mode) {
  if (mode === 'PRE_DP') {
    return {
      chainIdentifier: 1,
      height: 42,
      hash: MOMENTUM_HASH,
      version: 1,
    };
  }
  return {
    chainIdentifier: 1,
    height: 42,
    hash: MOMENTUM_HASH,
    version: 2,
    nextFusionPrice: 1000,
    nextWorkPrice: 1000,
  };
}

function traceFixture({ mode = 'DP_ACTIVE', work = false,
  trustLabel = 'synthetic-recorded' } = {}) {
  const expectedManifest = manifest(trustLabel);
  const account = { address: PAYER, height: 7, hash: ACCOUNT_HASH };
  const momentumBefore = momentum(mode);
  const difficulty = work ? (mode === 'PRE_DP' ? 2 : DP_DIFFICULTY) : 0;
  const nonce = mode === 'PRE_DP' ? PRE_DP_VALID_NONCE : DP_VALID_NONCE;
  return {
    phase: 'UNSIGNED',
    expectedManifest,
    capturedTrace: {
      manifest: structuredClone(expectedManifest),
      quoteRequest: {
        address: PAYER,
        blockType: 2,
        toAddress: RECIPIENT,
        data: DATA,
      },
      accountFrontierBefore: account,
      accountFrontierAfter: { ...account },
      momentumBefore,
      rpcObservation: {
        availablePlasma: work ? 0 : 1,
        basePlasma: 1,
        requiredDifficulty: difficulty,
      },
      momentumAfter: { ...momentumBefore },
      nonceRecord: work
        ? {
            nonce,
            payer: PAYER,
            previousAccountHash: ACCOUNT_HASH,
            difficulty,
          }
        : null,
    },
  };
}

function assertRejected(callback) {
  assert.throws(
    callback,
    error => error instanceof TypeError && error.code === REJECTION_CODE,
  );
}

function assertDeepFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (Object.hasOwn(descriptor, 'value')) assertDeepFrozen(descriptor.value, seen);
  }
}

function containsFunction(value, seen = new Set()) {
  if (typeof value === 'function') return true;
  if (value === null || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  return Reflect.ownKeys(value).some(key => containsFunction(value[key], seen));
}

function javascriptFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...javascriptFiles(path));
    if (entry.isFile() && entry.name.endsWith('.js')) files.push(path);
  }
  return files;
}

test('the API accepts exactly one raw trace and no branded or override input', () => {
  assert.deepEqual(Object.keys(contract), ['composeOfflinePreparationWithNonceProof']);
  assert.equal(typeof composeOfflinePreparationWithNonceProof, 'function');

  assertRejected(() => composeOfflinePreparationWithNonceProof());
  assertRejected(() => composeOfflinePreparationWithNonceProof(
    traceFixture(),
    undefined,
  ));
  assertRejected(() => composeOfflinePreparationWithNonceProof({
    qualification: 'OFFLINE_RECORDED_TRACE_ONLY',
    trust: {},
    compatibility: {},
    preparationInput: {},
  }));

  const extra = traceFixture();
  extra.preparation = Object.freeze({ qualification: 'caller-supplied' });
  assertRejected(() => composeOfflinePreparationWithNonceProof(extra));

  const missing = traceFixture();
  delete missing.capturedTrace;
  assertRejected(() => composeOfflinePreparationWithNonceProof(missing));
});

test('DP fusion-only zero work returns the exact limited detached DTO', () => {
  const input = traceFixture();
  const snapshot = structuredClone(input);
  const result = composeOfflinePreparationWithNonceProof(input);

  assert.deepEqual(input, snapshot);
  assert.deepEqual(Object.keys(result), [
    'qualification',
    'preparation',
    'nonceProof',
    'recordedContext',
    'recordedTrustLabel',
    'trust',
  ]);
  assert.equal(result.qualification, 'OFFLINE_PREPARATION_NONCE_ONLY');
  assert.equal(result.preparation.qualification, 'OFFLINE_SERIALIZATION_ONLY');
  assert.equal(result.preparation.classification, 'DP_ACTIVE');
  assert.equal(result.preparation.block.difficulty, 0);
  assert.equal(result.preparation.block.nonce, ZERO_NONCE);
  assert.equal(result.preparation.block.signature, '');
  assert.equal(result.nonceProof.qualification, 'OFFLINE_NONCE_PREDICATE_ONLY');
  assert.equal(result.nonceProof.status, 'NOT_REQUIRED');
  assert.deepEqual(result.nonceProof.recordedProofScope, {
    payer: result.preparation.block.address,
    previousAccountHash: result.preparation.block.previousHash,
    difficulty: result.preparation.block.difficulty,
  });
  assert.deepEqual(result.recordedContext, input.expectedManifest.context);
  assert.notStrictEqual(result.recordedContext, input.expectedManifest.context);
  assert.equal(result.recordedTrustLabel, 'synthetic-recorded');
  assert.deepEqual(result.trust, EXPECTED_TRUST);
  assert.deepEqual(result.trust, result.nonceProof.trust);
  assert.notStrictEqual(result.trust, result.nonceProof.trust);
  for (const field of [
    'ready', 'signerEligibility', 'authorization', 'capability', 'runtime',
    'publish', 'submit', 'generate', 'wallet', 'rpc',
  ]) {
    assert.equal(field in result, false);
  }
  assert.equal(containsFunction(result), false);
  assertDeepFrozen(result);
});

test('PRE_DP zero work stays NOT_REQUIRED and preserves an operator trust label', () => {
  const input = traceFixture({ mode: 'PRE_DP', trustLabel: 'operator-trusted' });
  const result = composeOfflinePreparationWithNonceProof(input);

  assert.equal(result.preparation.classification, 'PRE_DP');
  assert.equal(
    result.preparation.pricingBasis,
    'LEGACY_SDK_BEHAVIOR_WITHOUT_DP_COHERENCE_PROOF',
  );
  assert.equal(result.preparation.block.difficulty, 0);
  assert.equal(result.preparation.block.nonce, ZERO_NONCE);
  assert.equal(result.nonceProof.status, 'NOT_REQUIRED');
  assert.equal(result.recordedTrustLabel, 'operator-trusted');
  assert.deepEqual(result.trust, EXPECTED_TRUST);
});

test('a positive PRE_DP proof is checked against the prepared block scope', () => {
  assert.equal(referenceStatus({
    difficulty: 2,
    nonce: PRE_DP_VALID_NONCE,
  }), 'VALID');
  const result = composeOfflinePreparationWithNonceProof(traceFixture({
    mode: 'PRE_DP',
    work: true,
  }));

  assert.equal(result.preparation.classification, 'PRE_DP');
  assert.equal(result.nonceProof.status, 'VALID');
  assert.deepEqual(result.nonceProof.recordedProofScope, {
    payer: result.preparation.block.address,
    previousAccountHash: result.preparation.block.previousHash,
    difficulty: result.preparation.block.difficulty,
  });
});

test('a positive DP proof uses the static independently checked fixture', () => {
  assert.equal(referenceStatus({
    difficulty: DP_DIFFICULTY,
    nonce: DP_VALID_NONCE,
  }), 'VALID');
  const result = composeOfflinePreparationWithNonceProof(traceFixture({ work: true }));

  assert.equal(result.preparation.classification, 'DP_ACTIVE');
  assert.equal(result.preparation.block.difficulty, DP_DIFFICULTY);
  assert.equal(result.nonceProof.status, 'VALID');
  assert.deepEqual(result.nonceProof.recordedProofScope, {
    payer: result.preparation.block.address,
    previousAccountHash: result.preparation.block.previousHash,
    difficulty: DP_DIFFICULTY,
  });
});

test('well-formed invalid and reversed nonce candidates return no composition', () => {
  assert.equal(referenceStatus({
    difficulty: 2,
    nonce: PRE_DP_INVALID_NONCE,
  }), 'INVALID');
  const invalid = traceFixture({ mode: 'PRE_DP', work: true });
  invalid.capturedTrace.nonceRecord.nonce = PRE_DP_INVALID_NONCE;
  assertRejected(() => composeOfflinePreparationWithNonceProof(invalid));

  assert.equal(referenceStatus({
    difficulty: DP_DIFFICULTY,
    nonce: DP_REVERSED_NONCE,
  }), 'INVALID');
  const reversed = traceFixture({ work: true });
  reversed.capturedTrace.nonceRecord.nonce = DP_REVERSED_NONCE;
  assertRejected(() => composeOfflinePreparationWithNonceProof(reversed));
});

test('noncanonical nonce forms reject before a result is returned', () => {
  const cases = [
    PRE_DP_VALID_NONCE.slice(1),
    Buffer.alloc(8, 0xab).toString('hex').toUpperCase(),
    1,
    new String(PRE_DP_VALID_NONCE),
  ];
  for (const nonce of cases) {
    const input = traceFixture({ mode: 'PRE_DP', work: true });
    input.capturedTrace.nonceRecord.nonce = nonce;
    assertRejected(() => composeOfflinePreparationWithNonceProof(input));
  }
});

test('recorded payer, previous hash, and selected difficulty must match exactly', () => {
  const mutations = [
    value => { value.capturedTrace.nonceRecord.payer = OTHER_ADDRESS; },
    value => { value.capturedTrace.nonceRecord.previousAccountHash = OTHER_ACCOUNT_HASH; },
    value => { value.capturedTrace.nonceRecord.difficulty += 1; },
  ];
  for (const mutate of mutations) {
    const input = traceFixture({ work: true });
    mutate(input);
    assertRejected(() => composeOfflinePreparationWithNonceProof(input));
  }
});

test('stale account and Momentum snapshots reject despite a valid nonce fixture', () => {
  const accountDrift = traceFixture({ work: true });
  accountDrift.capturedTrace.accountFrontierAfter.hash = OTHER_ACCOUNT_HASH;
  assertRejected(() => composeOfflinePreparationWithNonceProof(accountDrift));

  const momentumHeightDrift = traceFixture({ work: true });
  momentumHeightDrift.capturedTrace.momentumAfter.height += 1;
  assertRejected(() => composeOfflinePreparationWithNonceProof(momentumHeightDrift));

  const momentumHashDrift = traceFixture({ work: true });
  momentumHashDrift.capturedTrace.momentumAfter.hash = OTHER_MOMENTUM_HASH;
  assertRejected(() => composeOfflinePreparationWithNonceProof(momentumHashDrift));
});

test('manifest, intent, context, and quote bindings remain mandatory', () => {
  const mutations = [
    value => { value.capturedTrace.manifest.intent.amount = '43'; },
    value => {
      value.capturedTrace.manifest.context.networkIdentifier = 'synthetic-network-v2';
    },
    value => { value.capturedTrace.quoteRequest.toAddress = OTHER_ADDRESS; },
    value => { value.capturedTrace.quoteRequest.data = OTHER_DATA; },
    value => { value.capturedTrace.quoteRequest.amount = '42'; },
  ];
  for (const mutate of mutations) {
    const input = traceFixture({ work: true });
    mutate(input);
    assertRejected(() => composeOfflinePreparationWithNonceProof(input));
  }
});

test('accessors, proxies, and coercion reject without invoking user code', () => {
  let getterCalls = 0;
  const accessor = traceFixture({ work: true });
  Object.defineProperty(accessor.expectedManifest.intent, 'amount', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return '42';
    },
  });
  assertRejected(() => composeOfflinePreparationWithNonceProof(accessor));
  assert.equal(getterCalls, 0);

  let proxyCalls = 0;
  const proxy = new Proxy(momentum('DP_ACTIVE'), {
    get() { proxyCalls += 1; return undefined; },
    getOwnPropertyDescriptor() { proxyCalls += 1; return undefined; },
    getPrototypeOf() { proxyCalls += 1; return Object.prototype; },
    ownKeys() { proxyCalls += 1; return []; },
  });
  const proxied = traceFixture({ work: true });
  proxied.capturedTrace.momentumBefore = proxy;
  assertRejected(() => composeOfflinePreparationWithNonceProof(proxied));
  assert.equal(proxyCalls, 0);

  let coercionCalls = 0;
  const coercive = {
    valueOf() { coercionCalls += 1; return 42; },
    toString() { coercionCalls += 1; return '42'; },
    [Symbol.toPrimitive]() { coercionCalls += 1; return '42'; },
  };
  const coerced = traceFixture({ work: true });
  coerced.expectedManifest.intent.amount = coercive;
  assertRejected(() => composeOfflinePreparationWithNonceProof(coerced));
  assert.equal(coercionCalls, 0);
});

test('caller-supplied proof, preparation, callbacks, and dependencies cannot bypass checks', () => {
  let callbackCalls = 0;
  const callback = () => { callbackCalls += 1; };
  const fields = [
    ['nonceProof', Object.freeze({ status: 'VALID' })],
    ['preparation', Object.freeze({ qualification: 'caller-supplied' })],
    ['callback', callback],
    ['dependencies', Object.freeze({ verify: callback })],
  ];
  for (const [field, value] of fields) {
    const input = traceFixture({ work: true });
    input[field] = value;
    assertRejected(() => composeOfflinePreparationWithNonceProof(input));
  }
  assert.equal(callbackCalls, 0);
});

test('results are deeply detached and frozen while repeated traces remain permitted', () => {
  const input = traceFixture({ mode: 'PRE_DP', work: true });
  const snapshot = structuredClone(input);
  const first = composeOfflinePreparationWithNonceProof(input);
  const second = composeOfflinePreparationWithNonceProof(input);

  assert.deepEqual(input, snapshot);
  assert.deepEqual(first, second);
  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.preparation, second.preparation);
  assert.notStrictEqual(first.nonceProof, second.nonceProof);
  assert.notStrictEqual(first.recordedContext, second.recordedContext);
  assert.notStrictEqual(first.trust, second.trust);
  assertDeepFrozen(first);
  assertDeepFrozen(second);

  input.expectedManifest.intent.amount = '99';
  input.capturedTrace.manifest.intent.amount = '99';
  input.capturedTrace.accountFrontierAfter.height += 1;
  input.capturedTrace.momentumAfter.height += 1;
  assert.equal(first.preparation.block.amount, '42');
  assert.equal(first.preparation.block.height, 8);
  assert.equal(first.preparation.block.momentumAcknowledged.height, 42);
  assert.throws(() => { first.trust.canonicality = 'ESTABLISHED'; }, TypeError);
});

test('the same work can remain valid across locally matching changed intent and context', () => {
  const originalTrace = traceFixture({ mode: 'PRE_DP', work: true });
  const changedTrace = traceFixture({ mode: 'PRE_DP', work: true });
  for (const value of [changedTrace.expectedManifest, changedTrace.capturedTrace.manifest]) {
    value.intent.toAddress = OTHER_ADDRESS;
    value.intent.amount = '43';
    value.intent.tokenStandard = sdk.QSR_ZTS.toString();
    value.intent.data = OTHER_DATA;
    value.context = context({
      chainIdentifier: 2,
      networkIdentifier: 'synthetic-network-v2',
      profileIdentifier: 'synthetic-profile-v2',
      epochIdentifier: 'synthetic-epoch-v2',
    });
  }
  changedTrace.capturedTrace.quoteRequest.toAddress = OTHER_ADDRESS;
  changedTrace.capturedTrace.quoteRequest.data = OTHER_DATA;
  changedTrace.capturedTrace.momentumBefore.chainIdentifier = 2;
  changedTrace.capturedTrace.momentumAfter.chainIdentifier = 2;

  const original = composeOfflinePreparationWithNonceProof(originalTrace);
  const changed = composeOfflinePreparationWithNonceProof(changedTrace);
  assert.equal(original.nonceProof.status, 'VALID');
  assert.equal(changed.nonceProof.status, 'VALID');
  assert.deepEqual(
    original.nonceProof.recordedProofScope,
    changed.nonceProof.recordedProofScope,
  );
  assert.notEqual(original.preparation.block.hash, changed.preparation.block.hash);
  assert.notDeepEqual(original.recordedContext, changed.recordedContext);
  assert.equal('replayProtected' in original, false);
  assert.equal('fresh' in original, false);
});

test('source ownership stays exact, unwired, and free of active capabilities', () => {
  const sourcePath = fileURLToPath(new URL(
    '../src/zenon/internal/offline-preparation-nonce-contract.js',
    import.meta.url,
  ));
  const source = readFileSync(sourcePath, 'utf8');
  const imports = Array.from(
    source.matchAll(/from\s+['"]([^'"]+)['"]/gu),
    match => match[1],
  );
  assert.deepEqual(imports, [
    './offline-nonce-proof-verifier.js',
    './offline-observation-to-preparation-contract.js',
    './pre-sign-account-block-preparation.js',
  ]);
  for (const name of [
    'composeOfflinePreparationTrace',
    'prepareUnsignedZenonPaymentBlock',
    'verifyOfflineZenonNonceProof',
  ]) {
    assert.equal(source.match(new RegExp(`\\b${name}\\s*\\(`, 'gu'))?.length, 1);
  }
  assert.match(
    source,
    /export function composeOfflinePreparationWithNonceProof\(trace\)/u,
  );
  assert.doesNotMatch(source, /from\s+['"](?:node:|znn-typescript-sdk|.*test-support)/u);
  assert.doesNotMatch(source,
    /\.sign\s*\(|\bsigner\b|\bwallet\b|publishRawTransaction|sendRequest|prepareBlock\s*\(|Zenon\.getInstance/u);
  assert.doesNotMatch(source,
    /\b(?:fetch|WebSocket|XMLHttpRequest|setTimeout|setInterval|queue|activation|callback|dependencies)\b/u);
  assert.doesNotMatch(source,
    /\b(?:generate|createPowModule|WebAssembly|child_process|worker_threads)\b/u);

  const sourceConsumers = javascriptFiles(SOURCE_ROOT)
    .filter(path => readFileSync(path, 'utf8')
      .includes('composeOfflinePreparationWithNonceProof'))
    .map(path => relative(SOURCE_ROOT, path))
    .sort();
  assert.deepEqual(sourceConsumers, [
    'zenon/internal/offline-owned-nonce-preparation.js',
    'zenon/internal/offline-preparation-nonce-contract.js',
  ]);
});

test('first-account-block proof scope uses only the prepared empty previous hash', () => {
  const input = traceFixture({ mode: 'PRE_DP', work: true });
  input.capturedTrace.accountFrontierBefore = null;
  input.capturedTrace.accountFrontierAfter = null;
  input.capturedTrace.nonceRecord.previousAccountHash = EMPTY_HASH;
  input.capturedTrace.nonceRecord.difficulty = 1;
  input.capturedTrace.rpcObservation.requiredDifficulty = 1;
  input.capturedTrace.nonceRecord.nonce = PRE_DP_INVALID_NONCE;

  const result = composeOfflinePreparationWithNonceProof(input);
  assert.equal(result.nonceProof.status, 'VALID');
  assert.equal(result.preparation.block.previousHash, EMPTY_HASH);
  assert.equal(result.nonceProof.recordedProofScope.previousAccountHash, EMPTY_HASH);
  assert.equal(result.preparation.block.height, 1);
});
