import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as sdk from 'znn-typescript-sdk';
import { getTxHash } from '../node_modules/znn-typescript-sdk/dist/utilities/block.js';
import * as contract from '../src/zenon/internal/offline-observation-to-preparation-contract.js';
import { prepareUnsignedZenonPaymentBlock } from '../src/zenon/internal/pre-sign-account-block-preparation.js';

const { composeOfflinePreparationTrace } = contract;
const REJECTION_CODE = 'offline_observation_to_preparation_contract_rejected';
const REJECTION_MESSAGE = 'Offline observation-to-preparation trace rejected';
const EMPTY_HASH = '00'.repeat(32);
const ACCOUNT_HASH = 'cd'.repeat(32);
const MOMENTUM_HASH = 'ab'.repeat(32);
const OTHER_HASH = 'ef'.repeat(32);
const DATA = Buffer.alloc(32, 0x5a).toString('base64');
const OTHER_DATA = Buffer.alloc(32, 0xa5).toString('base64');
const WORK_NONCE = '0102030405060708';
const BLOCK_FIELDS = [
  'version', 'chainIdentifier', 'blockType', 'hash', 'previousHash', 'height',
  'momentumAcknowledged', 'address', 'toAddress', 'amount', 'tokenStandard',
  'fromBlockHash', 'data', 'fusedPlasma', 'difficulty', 'nonce', 'publicKey',
  'signature',
];

function identity(publicByte = 0x11, recipientByte = 0x22) {
  const publicKeyBytes = Buffer.alloc(32, publicByte);
  const recipientPublicKeyBytes = Buffer.alloc(32, recipientByte);
  return {
    payer: sdk.Address.fromPublicKey(publicKeyBytes).toString(),
    publicKey: publicKeyBytes.toString('base64'),
    recipient: sdk.Address.fromPublicKey(recipientPublicKeyBytes).toString(),
  };
}

function expectedManifest(who = identity()) {
  return {
    payer: who.payer,
    publicKey: who.publicKey,
    intent: {
      toAddress: who.recipient,
      amount: '42',
      tokenStandard: sdk.ZNN_ZTS.toString(),
      data: DATA,
    },
    context: {
      chainIdentifier: 1,
      networkIdentifier: 'synthetic-network-v1',
      profileIdentifier: 'synthetic-profile-v1',
      epochIdentifier: 'synthetic-epoch-v1',
    },
    trustLabel: 'synthetic-recorded',
  };
}

function pricedMomentum(overrides = {}) {
  return {
    chainIdentifier: 1,
    height: 42,
    hash: MOMENTUM_HASH,
    version: 2,
    nextFusionPrice: 1000,
    nextWorkPrice: 1000,
    ...overrides,
  };
}

function absentPriceMomentum(overrides = {}) {
  return {
    chainIdentifier: 1,
    height: 42,
    hash: MOMENTUM_HASH,
    version: 1,
    ...overrides,
  };
}

function baseTrace(who = identity()) {
  const expected = expectedManifest(who);
  const account = { address: who.payer, height: 7, hash: ACCOUNT_HASH };
  const momentum = pricedMomentum();
  return {
    phase: 'UNSIGNED',
    expectedManifest: expected,
    capturedTrace: {
      manifest: structuredClone(expected),
      quoteRequest: {
        address: who.payer,
        blockType: 2,
        toAddress: who.recipient,
        data: DATA,
      },
      accountFrontierBefore: account,
      accountFrontierAfter: { ...account },
      momentumBefore: momentum,
      rpcObservation: {
        availablePlasma: 21000,
        basePlasma: 21000,
        requiredDifficulty: 0,
      },
      momentumAfter: { ...momentum },
      nonceRecord: null,
    },
  };
}

function setMomentum(trace, momentum) {
  trace.capturedTrace.momentumBefore = momentum;
  trace.capturedTrace.momentumAfter = { ...momentum };
  return trace;
}

function setFirstAccountBlock(trace) {
  trace.capturedTrace.accountFrontierBefore = null;
  trace.capturedTrace.accountFrontierAfter = null;
  return trace;
}

function setQuote(trace, overrides) {
  Object.assign(trace.capturedTrace.rpcObservation, overrides);
  return trace;
}

function attachNonceRecord(trace, difficulty, nonce = WORK_NONCE) {
  trace.capturedTrace.nonceRecord = {
    nonce,
    payer: trace.expectedManifest.payer,
    previousAccountHash: trace.capturedTrace.accountFrontierAfter?.hash ?? EMPTY_HASH,
    difficulty,
  };
  return trace;
}

function positiveWorkTrace() {
  const trace = setMomentum(
    baseTrace(),
    pricedMomentum({ nextFusionPrice: 1200, nextWorkPrice: 1100 }),
  );
  setQuote(trace, { availablePlasma: 10000, requiredDifficulty: 20901000 });
  return attachNonceRecord(trace, 20901000);
}

function assertRejected(value) {
  assert.throws(
    () => composeOfflinePreparationTrace(value),
    error => error instanceof TypeError && error.code === REJECTION_CODE &&
      error.message === REJECTION_MESSAGE,
  );
}

function materialize(block) {
  const value = sdk.AccountBlockTemplate.fromJson(block);
  value.publicKey = Buffer.from(block.publicKey, 'base64');
  value.signature = Buffer.alloc(0);
  return value;
}

function assertDeepFrozen(value, seen = new Set()) {
  if (typeof value !== 'object' || value === null || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (Object.hasOwn(descriptor, 'value')) assertDeepFrozen(descriptor.value, seen);
  }
}

function containsFunction(value, seen = new Set()) {
  if (typeof value === 'function') return true;
  if (typeof value !== 'object' || value === null || seen.has(value)) return false;
  seen.add(value);
  return Reflect.ownKeys(value).some(key => containsFunction(value[key], seen));
}

test('the public API is the single pure trace composer', () => {
  assert.deepEqual(Object.keys(contract), ['composeOfflinePreparationTrace']);
  assert.equal(typeof composeOfflinePreparationTrace, 'function');
});

test('success matrix maps exactly to the established unsigned preparer and hash', () => {
  const cases = [
    {
      name: 'v1 prices absent',
      trace() {
        return setFirstAccountBlock(setMomentum(baseTrace(), absentPriceMomentum()));
      },
      classification: 'PRE_DP',
      fusedPlasma: 21000,
      difficulty: 0,
      nonce: '0'.repeat(16),
      frontierFields: ['height', 'hash', 'version'],
    },
    {
      name: 'v1 paired zero prices',
      trace() {
        const value = setMomentum(baseTrace(), pricedMomentum({
          version: 1,
          nextFusionPrice: 0,
          nextWorkPrice: 0,
        }));
        setQuote(value, { availablePlasma: 9000, requiredDifficulty: 17 });
        return attachNonceRecord(value, 17);
      },
      classification: 'PRE_DP',
      fusedPlasma: 9000,
      difficulty: 17,
      nonce: WORK_NONCE,
      frontierFields: ['height', 'hash', 'version', 'nextFusionPrice', 'nextWorkPrice'],
    },
    {
      name: 'v2 neutral',
      trace: baseTrace,
      classification: 'DP_ACTIVE',
      fusedPlasma: 21000,
      difficulty: 0,
      nonce: '0'.repeat(16),
    },
    {
      name: 'elevated fusion only',
      trace() {
        const value = setMomentum(baseTrace(), pricedMomentum({
          nextFusionPrice: 1200,
          nextWorkPrice: 1100,
        }));
        return setQuote(value, { availablePlasma: 25200 });
      },
      classification: 'DP_ACTIVE',
      fusedPlasma: 25200,
      difficulty: 0,
      nonce: '0'.repeat(16),
    },
    {
      name: 'partial fusion',
      trace: positiveWorkTrace,
      classification: 'DP_ACTIVE',
      fusedPlasma: 10000,
      difficulty: 20901000,
      nonce: WORK_NONCE,
    },
    {
      name: 'all work with an unverified recorded nonce',
      trace() {
        const value = setMomentum(baseTrace(), pricedMomentum({
          nextFusionPrice: 1200,
          nextWorkPrice: 1100,
        }));
        setQuote(value, { availablePlasma: 0, requiredDifficulty: 34650000 });
        return attachNonceRecord(value, 34650000, '0'.repeat(16));
      },
      classification: 'DP_ACTIVE',
      fusedPlasma: 0,
      difficulty: 34650000,
      nonce: '0'.repeat(16),
    },
  ];

  for (const entry of cases) {
    const trace = entry.trace();
    const result = composeOfflinePreparationTrace(trace);
    const input = result.preparationInput;
    const prepared = prepareUnsignedZenonPaymentBlock(input);
    const block = prepared.block;
    const account = input.accountFrontierAfter;

    assert.deepEqual(Object.keys(input), [
      'chainIdentifier', 'payer', 'publicKey', 'intent', 'accountFrontierBefore',
      'accountFrontierAfter', 'dynamicPlasma', 'nonce',
    ], entry.name);
    assert.deepEqual(Object.keys(input.dynamicPlasma.beforeFrontier),
      entry.frontierFields ?? ['height', 'hash', 'version', 'nextFusionPrice', 'nextWorkPrice'],
      entry.name);
    assert.equal(result.compatibility.classification, entry.classification, entry.name);
    assert.equal(prepared.classification, entry.classification, entry.name);
    assert.deepEqual(Object.keys(block), BLOCK_FIELDS, entry.name);
    assert.equal(block.version, 1, entry.name);
    assert.equal(block.chainIdentifier, input.chainIdentifier, entry.name);
    assert.equal(block.blockType, 2, entry.name);
    assert.equal(block.previousHash, account?.hash ?? EMPTY_HASH, entry.name);
    assert.equal(block.height, account === null ? 1 : account.height + 1, entry.name);
    assert.deepEqual(block.momentumAcknowledged, {
      hash: input.dynamicPlasma.afterFrontier.hash,
      height: input.dynamicPlasma.afterFrontier.height,
    }, entry.name);
    assert.equal(block.address, input.payer, entry.name);
    assert.equal(block.toAddress, input.intent.toAddress, entry.name);
    assert.equal(block.amount, input.intent.amount, entry.name);
    assert.equal(block.tokenStandard, input.intent.tokenStandard, entry.name);
    assert.equal(block.fromBlockHash, EMPTY_HASH, entry.name);
    assert.equal(block.data, input.intent.data, entry.name);
    assert.equal(block.fusedPlasma, entry.fusedPlasma, entry.name);
    assert.equal(block.difficulty, entry.difficulty, entry.name);
    assert.equal(block.nonce, entry.nonce, entry.name);
    assert.equal(block.publicKey, input.publicKey, entry.name);
    assert.equal(block.signature, '', entry.name);
    assert.equal(getTxHash(materialize(block)).toString(), block.hash, entry.name);
    if (result.compatibility.quote !== null) {
      assert.equal(result.compatibility.quote.selectedFusedPlasma, entry.fusedPlasma, entry.name);
      assert.equal(result.compatibility.quote.requiredDifficulty, entry.difficulty, entry.name);
    }
  }
});

test('every expected/captured payment, context, and trust manifest mismatch rejects', () => {
  const other = identity(0x33, 0x44);
  const mutations = [
    value => { value.capturedTrace.manifest.payer = other.payer; },
    value => { value.capturedTrace.manifest.publicKey = other.publicKey; },
    value => { value.capturedTrace.manifest.intent.toAddress = other.recipient; },
    value => { value.capturedTrace.manifest.intent.amount = '43'; },
    value => { value.capturedTrace.manifest.intent.tokenStandard = sdk.QSR_ZTS.toString(); },
    value => { value.capturedTrace.manifest.intent.data = OTHER_DATA; },
    value => { value.capturedTrace.manifest.context.chainIdentifier = 2; },
    value => { value.capturedTrace.manifest.context.networkIdentifier = 'synthetic-network-v2'; },
    value => { value.capturedTrace.manifest.context.profileIdentifier = 'synthetic-profile-v2'; },
    value => { value.capturedTrace.manifest.context.epochIdentifier = 'synthetic-epoch-v2'; },
    value => { value.capturedTrace.manifest.trustLabel = 'operator-trusted'; },
  ];
  for (const mutate of mutations) {
    const value = baseTrace();
    mutate(value);
    assertRejected(value);
  }
});

test('the captured PoW request binds only its actual four fields to payment intent', () => {
  const other = identity(0x33, 0x44);
  const mutations = [
    value => { value.capturedTrace.quoteRequest.address = other.payer; },
    value => { value.capturedTrace.quoteRequest.blockType = 1; },
    value => { value.capturedTrace.quoteRequest.blockType = '2'; },
    value => { value.capturedTrace.quoteRequest.toAddress = other.recipient; },
    value => { value.capturedTrace.quoteRequest.data = OTHER_DATA; },
    value => { value.capturedTrace.quoteRequest.amount = '42'; },
    value => { value.capturedTrace.quoteRequest.tokenStandard = sdk.ZNN_ZTS.toString(); },
  ];
  for (const mutate of mutations) {
    const value = baseTrace();
    mutate(value);
    assertRejected(value);
  }

  const locallyBound = baseTrace();
  locallyBound.expectedManifest.intent.amount = '43';
  locallyBound.capturedTrace.manifest.intent.amount = '43';
  const result = composeOfflinePreparationTrace(locallyBound);
  assert.equal(result.preparationInput.intent.amount, '43');
  assert.deepEqual(Object.keys(locallyBound.capturedTrace.quoteRequest),
    ['address', 'blockType', 'toAddress', 'data']);
});

test('account frontiers must be equal, separate, payer-bound snapshots', () => {
  const other = identity(0x33, 0x44);
  const mutations = [
    value => { value.capturedTrace.accountFrontierAfter.address = other.payer; },
    value => { value.capturedTrace.accountFrontierAfter.height += 1; },
    value => { value.capturedTrace.accountFrontierAfter.hash = OTHER_HASH; },
    value => { value.capturedTrace.accountFrontierAfter = null; },
    value => { value.capturedTrace.accountFrontierBefore = null; },
    value => { value.capturedTrace.accountFrontierAfter = value.capturedTrace.accountFrontierBefore; },
  ];
  for (const mutate of mutations) {
    const value = baseTrace();
    mutate(value);
    assertRejected(value);
  }
});

test('Momentum snapshots bind context, schema, version, prices, height, and hash', () => {
  const drift = [
    value => { value.capturedTrace.momentumAfter.chainIdentifier = 2; },
    value => { value.capturedTrace.momentumAfter.height += 1; },
    value => { value.capturedTrace.momentumAfter.hash = OTHER_HASH; },
    value => { value.capturedTrace.momentumAfter.version = 1; },
    value => { value.capturedTrace.momentumAfter.nextFusionPrice += 1; },
    value => { value.capturedTrace.momentumAfter.nextWorkPrice += 1; },
  ];
  for (const mutate of drift) {
    const value = baseTrace();
    mutate(value);
    assertRejected(value);
  }

  const wrongContext = baseTrace();
  wrongContext.capturedTrace.momentumBefore.chainIdentifier = 2;
  wrongContext.capturedTrace.momentumAfter.chainIdentifier = 2;
  assertRejected(wrongContext);

  const mixed = baseTrace();
  mixed.capturedTrace.momentumBefore = absentPriceMomentum();
  mixed.capturedTrace.momentumAfter = pricedMomentum({
    version: 1,
    nextFusionPrice: 0,
    nextWorkPrice: 0,
  });
  assertRejected(mixed);

  const onePriceMissing = setMomentum(baseTrace(), pricedMomentum({
    version: 1,
    nextFusionPrice: 0,
    nextWorkPrice: 0,
  }));
  delete onePriceMissing.capturedTrace.momentumBefore.nextWorkPrice;
  delete onePriceMissing.capturedTrace.momentumAfter.nextWorkPrice;
  assertRejected(onePriceMissing);

  const absentV2 = setMomentum(baseTrace(), absentPriceMomentum({ version: 2 }));
  assertRejected(absentV2);

  const pricedV1 = setMomentum(baseTrace(), pricedMomentum({
    version: 1,
    nextFusionPrice: 1,
    nextWorkPrice: 0,
  }));
  assertRejected(pricedV1);
});

test('malformed and arithmetic-incoherent quote responses reject', () => {
  const cases = [
    value => { value.capturedTrace.rpcObservation.requiredDifficulty = 1; },
    value => { value.capturedTrace.rpcObservation.availablePlasma = '21000'; },
    value => { value.capturedTrace.rpcObservation.basePlasma = 0; },
    value => { value.capturedTrace.rpcObservation.requiredDifficulty = -0; },
    value => {
      setMomentum(value, pricedMomentum({ nextFusionPrice: 1200, nextWorkPrice: 1100 }));
      value.capturedTrace.rpcObservation.requiredDifficulty = 0;
    },
    value => {
      setMomentum(value, pricedMomentum({
        nextFusionPrice: Number.MAX_SAFE_INTEGER,
        nextWorkPrice: 1000,
      }));
      value.capturedTrace.rpcObservation.basePlasma = Number.MAX_SAFE_INTEGER;
      value.capturedTrace.rpcObservation.availablePlasma = Number.MAX_SAFE_INTEGER;
    },
  ];
  for (const mutate of cases) {
    const value = baseTrace();
    mutate(value);
    assertRejected(value);
  }
});

test('positive-work nonce records bind payer, account hash, and selected difficulty only', () => {
  const other = identity(0x33, 0x44);
  const mutations = [
    value => { value.capturedTrace.nonceRecord = null; },
    value => { value.capturedTrace.nonceRecord.payer = other.payer; },
    value => { value.capturedTrace.nonceRecord.previousAccountHash = OTHER_HASH; },
    value => { value.capturedTrace.nonceRecord.difficulty += 1; },
    value => { value.capturedTrace.nonceRecord.nonce = 'ABCDEF0123456789'; },
    value => { value.capturedTrace.nonceRecord.nonce = 1; },
    value => { value.capturedTrace.nonceRecord.workVerified = true; },
  ];
  for (const mutate of mutations) {
    const value = positiveWorkTrace();
    mutate(value);
    assertRejected(value);
  }

  const zeroWork = baseTrace();
  attachNonceRecord(zeroWork, 1);
  assertRejected(zeroWork);
});

test('decoding and integer parsing bounds precede decoding and BigInt conversion', () => {
  const oversizedData = 'A'.repeat(48);
  const oversizedAmount = '9'.repeat(78);
  const originalFrom = Buffer.from;
  const originalBigInt = globalThis.BigInt;
  let decodeCalls = 0;
  let integerCalls = 0;

  Buffer.from = function observedFrom(value, encodingOrOffset, ...rest) {
    if (value === oversizedData && encodingOrOffset === 'base64') decodeCalls += 1;
    return Reflect.apply(originalFrom, Buffer, [value, encodingOrOffset, ...rest]);
  };
  globalThis.BigInt = function observedBigInt(value) {
    if (value === oversizedAmount) integerCalls += 1;
    return originalBigInt(value);
  };
  try {
    const badData = baseTrace();
    badData.expectedManifest.intent.data = oversizedData;
    badData.capturedTrace.manifest.intent.data = oversizedData;
    badData.capturedTrace.quoteRequest.data = oversizedData;
    assertRejected(badData);

    const badAmount = baseTrace();
    badAmount.expectedManifest.intent.amount = oversizedAmount;
    badAmount.capturedTrace.manifest.intent.amount = oversizedAmount;
    assertRejected(badAmount);
  } finally {
    Buffer.from = originalFrom;
    globalThis.BigInt = originalBigInt;
  }
  assert.equal(decodeCalls, 0);
  assert.equal(integerCalls, 0);
});

test('coercions, noncanonical encodings, accessors, proxies, and prototypes reject inertly', () => {
  const malformed = [
    value => { value.expectedManifest.context.chainIdentifier = '1'; },
    value => { value.expectedManifest.intent.amount = 42; },
    value => { value.expectedManifest.intent.amount = '042'; },
    value => { value.expectedManifest.context.networkIdentifier = 'Synthetic'; },
    value => { value.expectedManifest.publicKey = `${value.expectedManifest.publicKey.slice(0, -2)}AA`; },
    value => { value.capturedTrace.momentumBefore.hash = MOMENTUM_HASH.toUpperCase(); },
  ];
  for (const mutate of malformed) {
    const value = baseTrace();
    mutate(value);
    assertRejected(value);
  }

  let coercionCalls = 0;
  const coercion = baseTrace();
  coercion.expectedManifest.intent.amount = {
    toString() { coercionCalls += 1; return '42'; },
    valueOf() { coercionCalls += 1; return 42; },
  };
  assertRejected(coercion);
  assert.equal(coercionCalls, 0);

  let getterCalls = 0;
  const accessor = baseTrace();
  Object.defineProperty(accessor.capturedTrace.quoteRequest, 'data', {
    enumerable: true,
    get() { getterCalls += 1; return DATA; },
  });
  assertRejected(accessor);
  assert.equal(getterCalls, 0);

  let trapCalls = 0;
  const proxy = new Proxy(pricedMomentum(), {
    getPrototypeOf() { trapCalls += 1; return Object.prototype; },
    ownKeys() { trapCalls += 1; return []; },
    getOwnPropertyDescriptor() { trapCalls += 1; return undefined; },
    get() { trapCalls += 1; return undefined; },
  });
  const proxied = baseTrace();
  proxied.capturedTrace.momentumBefore = proxy;
  assertRejected(proxied);
  assert.equal(trapCalls, 0);

  const exotic = baseTrace();
  exotic.capturedTrace.quoteRequest = Object.assign(
    Object.create(null),
    exotic.capturedTrace.quoteRequest,
  );
  assertRejected(exotic);
});

test('unknown keys and shared semantic aliases reject', () => {
  const unknown = baseTrace();
  unknown.prepare = () => {};
  assertRejected(unknown);
  assert.throws(
    () => composeOfflinePreparationTrace(baseTrace(), null),
    error => error?.code === REJECTION_CODE,
  );

  const fieldAlias = baseTrace();
  fieldAlias.capturedTrace.quoteRequest.recipient = fieldAlias.expectedManifest.intent.toAddress;
  assertRejected(fieldAlias);

  const manifestAlias = baseTrace();
  manifestAlias.capturedTrace.manifest = manifestAlias.expectedManifest;
  assertRejected(manifestAlias);

  const intentAlias = baseTrace();
  intentAlias.capturedTrace.manifest.intent = intentAlias.expectedManifest.intent;
  assertRejected(intentAlias);

  const contextAlias = baseTrace();
  contextAlias.capturedTrace.manifest.context = contextAlias.expectedManifest.context;
  assertRejected(contextAlias);

  const accountAlias = baseTrace();
  accountAlias.capturedTrace.accountFrontierAfter = accountAlias.capturedTrace.accountFrontierBefore;
  assertRejected(accountAlias);

  const momentumAlias = baseTrace();
  momentumAlias.capturedTrace.momentumAfter = momentumAlias.capturedTrace.momentumBefore;
  assertRejected(momentumAlias);
});

test('only UNSIGNED traces are eligible and no callback is exposed or invoked', () => {
  let callbackCalls = 0;
  const callback = () => { callbackCalls += 1; };
  for (const phase of ['SIGNED', 'ACKNOWLEDGED', 'UNKNOWN', 'RECONCILIATION_ONLY']) {
    const value = baseTrace();
    value.phase = phase;
    value.capturedTrace.sign = callback;
    assertRejected(value);
  }
  const rejectedUnsigned = baseTrace();
  rejectedUnsigned.capturedTrace.publish = callback;
  assertRejected(rejectedUnsigned);
  assert.equal(callbackCalls, 0);

  const result = composeOfflinePreparationTrace(baseTrace());
  assert.equal(containsFunction(result), false);
  assert.equal('prepare' in result, false);
  assert.equal('block' in result, false);
  assert.equal('signedBlock' in result, false);
  assert.equal('publishedBlock' in result, false);
});

test('output is detached, deeply frozen, and explicit about every evidence limit', () => {
  const input = baseTrace();
  const snapshot = structuredClone(input);
  const result = composeOfflinePreparationTrace(input);

  assert.deepEqual(input, snapshot);
  assert.deepEqual(Object.keys(result), [
    'qualification', 'trust', 'compatibility', 'preparationInput',
  ]);
  assert.equal(result.qualification, 'OFFLINE_RECORDED_TRACE_ONLY');
  assert.deepEqual(result.trust, {
    recordedTrustLabel: 'synthetic-recorded',
    recordedContext: {
      chainIdentifier: 1,
      networkIdentifier: 'synthetic-network-v1',
      profileIdentifier: 'synthetic-profile-v1',
      epochIdentifier: 'synthetic-epoch-v1',
    },
    sourceAuthentication: 'NOT_ESTABLISHED',
    chainAuthentication: 'NOT_ESTABLISHED',
    canonicality: 'NOT_ESTABLISHED',
    finality: 'NOT_ESTABLISHED',
    liveFreshness: 'NOT_ESTABLISHED',
    nonceProof: 'NOT_VERIFIED',
    signingAuthorization: 'NOT_ESTABLISHED',
  });
  assertDeepFrozen(result);
  assert.notEqual(result.preparationInput.intent, input.expectedManifest.intent);
  assert.notEqual(result.preparationInput.accountFrontierBefore,
    result.preparationInput.accountFrontierAfter);
  assert.notEqual(result.preparationInput.dynamicPlasma.beforeFrontier,
    result.preparationInput.dynamicPlasma.afterFrontier);

  input.expectedManifest.intent.amount = '99';
  input.capturedTrace.accountFrontierAfter.height = 8;
  input.capturedTrace.momentumAfter.height = 43;
  assert.equal(result.preparationInput.intent.amount, '42');
  assert.equal(result.preparationInput.accountFrontierAfter.height, 7);
  assert.equal(result.preparationInput.dynamicPlasma.afterFrontier.height, 42);
  assert.throws(() => { result.trust.canonicality = 'ESTABLISHED'; }, TypeError);
});

test('recorded context is retained as detached frozen metadata without authority', () => {
  const firstInput = baseTrace();
  const originalContext = structuredClone(firstInput.expectedManifest.context);
  const first = composeOfflinePreparationTrace(firstInput);
  const second = composeOfflinePreparationTrace(baseTrace());

  assert.deepEqual(first.trust.recordedContext, originalContext);
  assert.deepEqual(Object.keys(first.trust.recordedContext), [
    'chainIdentifier', 'networkIdentifier', 'profileIdentifier', 'epochIdentifier',
  ]);
  assert.notEqual(first.trust.recordedContext, firstInput.expectedManifest.context);
  assert.notEqual(first.trust.recordedContext, firstInput.capturedTrace.manifest.context);
  assert.notEqual(first.trust.recordedContext, second.trust.recordedContext);

  Object.assign(firstInput.expectedManifest.context, {
    chainIdentifier: 2,
    networkIdentifier: 'mutated-expected-network',
    profileIdentifier: 'mutated-expected-profile',
    epochIdentifier: 'mutated-expected-epoch',
  });
  Object.assign(firstInput.capturedTrace.manifest.context, {
    chainIdentifier: 3,
    networkIdentifier: 'mutated-captured-network',
    profileIdentifier: 'mutated-captured-profile',
    epochIdentifier: 'mutated-captured-epoch',
  });
  assert.deepEqual(first.trust.recordedContext, originalContext);
  assert.equal(Object.isFrozen(first.trust.recordedContext), true);
  assert.throws(() => {
    first.trust.recordedContext.profileIdentifier = 'accepted-profile';
  }, TypeError);
  assert.deepEqual({
    sourceAuthentication: first.trust.sourceAuthentication,
    chainAuthentication: first.trust.chainAuthentication,
    canonicality: first.trust.canonicality,
    finality: first.trust.finality,
    liveFreshness: first.trust.liveFreshness,
    nonceProof: first.trust.nonceProof,
    signingAuthorization: first.trust.signingAuthorization,
  }, {
    sourceAuthentication: 'NOT_ESTABLISHED',
    chainAuthentication: 'NOT_ESTABLISHED',
    canonicality: 'NOT_ESTABLISHED',
    finality: 'NOT_ESTABLISHED',
    liveFreshness: 'NOT_ESTABLISHED',
    nonceProof: 'NOT_VERIFIED',
    signingAuthorization: 'NOT_ESTABLISHED',
  });
});

test('operator-trusted is retained only as an original recorded label', () => {
  const input = baseTrace();
  input.expectedManifest.trustLabel = 'operator-trusted';
  input.capturedTrace.manifest.trustLabel = 'operator-trusted';
  const result = composeOfflinePreparationTrace(input);
  assert.equal(result.trust.recordedTrustLabel, 'operator-trusted');
  assert.equal(result.trust.sourceAuthentication, 'NOT_ESTABLISHED');
  assert.equal(result.trust.chainAuthentication, 'NOT_ESTABLISHED');
  assert.equal(result.trust.signingAuthorization, 'NOT_ESTABLISHED');
});

test('the production module has one classifier call and no preparer, signer, I/O, or runtime hook', () => {
  const source = readFileSync(new URL(
    '../src/zenon/internal/offline-observation-to-preparation-contract.js',
    import.meta.url,
  ), 'utf8');
  assert.equal(source.match(/\bclassifyDynamicPlasmaCompatibility\s*\(/g)?.length, 1);
  assert.doesNotMatch(source,
    /pre-sign-account-block-preparation|prepareUnsignedZenonPaymentBlock/);
  assert.doesNotMatch(source,
    /\.sign\s*\(|publishRawTransaction|sendRequest|prepareBlock\s*\(|Zenon\.getInstance/);
  assert.doesNotMatch(source,
    /\b(fetch|WebSocket|XMLHttpRequest|console|process|setTimeout|setInterval)\b/);
});
