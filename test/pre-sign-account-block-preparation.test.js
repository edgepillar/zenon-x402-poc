import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import * as sdk from 'znn-typescript-sdk';
import { getTxHash } from '../node_modules/znn-typescript-sdk/dist/utilities/block.js';
import { computeBlockHash } from '../src/zenon-payment.js';
import { prepareUnsignedZenonPaymentBlock } from '../src/zenon/internal/pre-sign-account-block-preparation.js';

const EMPTY_HASH = '00'.repeat(32);
const MOMENTUM_HASH = 'ab'.repeat(32);
const ACCOUNT_HASH = 'cd'.repeat(32);
const DATA = Buffer.alloc(32, 0x5a).toString('base64');
const WORK_NONCE = '0102030405060708';
const SDK_BLOCK_SOURCE_DIGEST = 'b29e56d78c614a27079c6179e920c0dbb951c384c4c58a20d7b0dd90b89b7b17';
const REJECTION_CODE = 'pre_sign_account_block_preparation_rejected';
const BLOCK_FIELDS = [
  'version', 'chainIdentifier', 'blockType', 'hash', 'previousHash', 'height',
  'momentumAcknowledged', 'address', 'toAddress', 'amount', 'tokenStandard',
  'fromBlockHash', 'data', 'fusedPlasma', 'difficulty', 'nonce', 'publicKey',
  'signature',
];

function identity(t, payerByte = 0x11) {
  const payerKeyPair = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, payerByte));
  const recipientKeyPair = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, 0x22));
  const value = {
    payerKeyPair,
    payer: payerKeyPair.getAddress().toString(),
    publicKey: Buffer.from(payerKeyPair.getPublicKey()).toString('base64'),
    recipient: recipientKeyPair.getAddress().toString(),
  };
  recipientKeyPair.clear();
  t.after(() => payerKeyPair.clear());
  return value;
}

function pricedFrontier(overrides = {}) {
  return {
    height: 42,
    hash: MOMENTUM_HASH,
    version: 2,
    nextFusionPrice: 1000,
    nextWorkPrice: 1000,
    ...overrides,
  };
}

function legacyAbsentFrontier() {
  return { height: 42, hash: MOMENTUM_HASH, version: 1 };
}

function observation(overrides = {}) {
  return {
    availablePlasma: 21000,
    basePlasma: 21000,
    requiredDifficulty: 0,
    ...overrides,
  };
}

function baseInput(who, overrides = {}) {
  const beforeFrontier = pricedFrontier();
  return {
    chainIdentifier: 1,
    payer: who.payer,
    publicKey: who.publicKey,
    intent: {
      toAddress: who.recipient,
      amount: '42',
      tokenStandard: sdk.ZNN_ZTS.toString(),
      data: DATA,
    },
    accountFrontierBefore: null,
    accountFrontierAfter: null,
    dynamicPlasma: {
      chainProfileMatch: { classification: 'MATCH' },
      beforeFrontier,
      rpcObservation: observation(),
      afterFrontier: { ...beforeFrontier },
    },
    nonce: null,
    ...overrides,
  };
}

function nonFirst(input, who, overrides = {}) {
  const frontier = {
    address: who.payer,
    height: 7,
    hash: ACCOUNT_HASH,
    ...overrides,
  };
  input.accountFrontierBefore = frontier;
  input.accountFrontierAfter = { ...frontier };
  return input;
}

function setDynamic(input, beforeFrontier, rpcObservation, afterFrontier = { ...beforeFrontier }) {
  input.dynamicPlasma = {
    chainProfileMatch: { classification: 'MATCH' },
    beforeFrontier,
    rpcObservation,
    afterFrontier,
  };
  return input;
}

function assertRejected(input) {
  assert.throws(
    () => prepareUnsignedZenonPaymentBlock(input),
    error => error?.code === REJECTION_CODE,
  );
}

function uintBytes(value, size) {
  let integer = BigInt(value);
  const output = Buffer.alloc(size);
  for (let index = size - 1; index >= 0; index -= 1) {
    output[index] = Number(integer & 0xffn);
    integer >>= 8n;
  }
  assert.equal(integer, 0n);
  return output;
}

function preimageFromPreparedBlock(block) {
  return Buffer.concat([
    uintBytes(block.version, 8),
    uintBytes(block.chainIdentifier, 8),
    uintBytes(block.blockType, 8),
    Buffer.from(block.previousHash, 'hex'),
    uintBytes(block.height, 8),
    Buffer.from(block.momentumAcknowledged.hash, 'hex'),
    uintBytes(block.momentumAcknowledged.height, 8),
    Buffer.from(sdk.Address.parse(block.address).getBytes()),
    Buffer.from(sdk.Address.parse(block.toAddress).getBytes()),
    uintBytes(block.amount, 32),
    Buffer.from(sdk.TokenStandard.parse(block.tokenStandard).getBytes()),
    Buffer.from(block.fromBlockHash, 'hex'),
    Buffer.from(sdk.Hash.digest(Buffer.alloc(0)).getBytes()),
    Buffer.from(sdk.Hash.digest(Buffer.from(block.data, 'base64')).getBytes()),
    uintBytes(block.fusedPlasma, 8),
    uintBytes(block.difficulty, 8),
    Buffer.from(block.nonce, 'hex'),
  ]);
}

function explicitVectorPreimage(input, expected) {
  const account = input.accountFrontierAfter;
  const momentum = input.dynamicPlasma.afterFrontier;
  return Buffer.concat([
    Buffer.from('0000000000000001', 'hex'),
    uintBytes(input.chainIdentifier, 8),
    Buffer.from('0000000000000002', 'hex'),
    Buffer.from(account?.hash ?? EMPTY_HASH, 'hex'),
    uintBytes(account === null ? 1 : account.height + 1, 8),
    Buffer.from(momentum.hash, 'hex'),
    uintBytes(momentum.height, 8),
    Buffer.from(sdk.Address.parse(input.payer).getBytes()),
    Buffer.from(sdk.Address.parse(input.intent.toAddress).getBytes()),
    uintBytes(input.intent.amount, 32),
    Buffer.from(sdk.TokenStandard.parse(input.intent.tokenStandard).getBytes()),
    Buffer.alloc(32),
    Buffer.from(sdk.Hash.digest(Buffer.alloc(0)).getBytes()),
    Buffer.from(sdk.Hash.digest(Buffer.from(input.intent.data, 'base64')).getBytes()),
    uintBytes(expected.fusedPlasma, 8),
    uintBytes(expected.difficulty, 8),
    Buffer.from(expected.nonce, 'hex'),
  ]);
}

function materialize(block) {
  const value = sdk.AccountBlockTemplate.fromJson(block);
  value.publicKey = Buffer.from(block.publicKey, 'base64');
  value.signature = Buffer.from(block.signature, 'base64');
  return value;
}

// Test-fixture integrity only; this is not a WalletAdapter or signing policy.
function fixtureSnapshotMatches(value, snapshot, seen = new Map()) {
  if (Object.is(value, snapshot)) return true;
  if (typeof value !== 'object' || value === null ||
      typeof snapshot !== 'object' || snapshot === null ||
      Object.getPrototypeOf(value) !== Object.getPrototypeOf(snapshot)) return false;

  if (seen.has(snapshot)) return seen.get(snapshot) === value;
  seen.set(snapshot, value);

  const valueKeys = Reflect.ownKeys(value);
  const snapshotKeys = Reflect.ownKeys(snapshot);
  if (valueKeys.length !== snapshotKeys.length) return false;
  for (let index = 0; index < snapshotKeys.length; index += 1) {
    if (!Object.is(valueKeys[index], snapshotKeys[index])) return false;
    const valueDescriptor = Object.getOwnPropertyDescriptor(value, valueKeys[index]);
    const snapshotDescriptor = Object.getOwnPropertyDescriptor(snapshot, snapshotKeys[index]);
    if (valueDescriptor.enumerable !== snapshotDescriptor.enumerable ||
        valueDescriptor.configurable !== snapshotDescriptor.configurable ||
        valueDescriptor.writable !== snapshotDescriptor.writable) return false;
    const valueIsData = Object.hasOwn(valueDescriptor, 'value');
    const snapshotIsData = Object.hasOwn(snapshotDescriptor, 'value');
    if (valueIsData !== snapshotIsData) return false;
    if (valueIsData) {
      if (!fixtureSnapshotMatches(valueDescriptor.value, snapshotDescriptor.value, seen)) return false;
    } else if (valueDescriptor.get !== snapshotDescriptor.get ||
               valueDescriptor.set !== snapshotDescriptor.set) return false;
  }
  return true;
}

function attachSyntheticSignature(prepared, signer) {
  const signed = structuredClone(prepared.block);
  const before = structuredClone(signed);
  const signature = signer(signed);
  if (!Buffer.isBuffer(signature) || signature.length !== 64 ||
      !fixtureSnapshotMatches(signed, before)) {
    throw new Error('synthetic_signer_contract_rejected');
  }
  signed.signature = signature.toString('base64');
  const changed = Reflect.ownKeys(signed)
    .filter(field => !isDeepStrictEqual(signed[field], before[field]));
  assert.deepEqual(changed, ['signature']);
  return signed;
}

function verifySyntheticSignature(block, declaredPublicKey) {
  const publicKey = createPublicKey({
    key: {
      kty: 'OKP',
      crv: 'Ed25519',
      x: Buffer.from(declaredPublicKey, 'base64').toString('base64url'),
    },
    format: 'jwk',
  });
  return verify(
    null,
    sdk.Hash.parse(block.hash).getBytes(),
    publicKey,
    Buffer.from(block.signature, 'base64'),
  );
}

test('installed SDK hash source remains pinned to the qualified bytes', () => {
  const source = readFileSync(
    new URL('../node_modules/znn-typescript-sdk/dist/utilities/block.js', import.meta.url),
  );
  assert.equal(createHash('sha256').update(source).digest('hex'), SDK_BLOCK_SOURCE_DIGEST);
});

test('fixed-size Base64 rejects oversized input before decoding', t => {
  const who = identity(t);
  const oversizedData = 'A'.repeat(48);
  const input = baseInput(who);
  input.intent.data = oversizedData;
  const originalFrom = Buffer.from;
  let decoderCalls = 0;

  Buffer.from = function observedFrom(value, encodingOrOffset, ...rest) {
    if (value === oversizedData && encodingOrOffset === 'base64') decoderCalls += 1;
    return Reflect.apply(originalFrom, Buffer, [value, encodingOrOffset, ...rest]);
  };
  try {
    assertRejected(input);
  } finally {
    Buffer.from = originalFrom;
  }

  assert.equal(decoderCalls, 0);
});

test('parameterized offline preparations cover legacy and Dynamic Plasma pricing modes', t => {
  const who = identity(t);
  const cases = [
    {
      name: 'v1 absent prices, first account block',
      configure(input) {
        return setDynamic(input, legacyAbsentFrontier(), observation());
      },
      expected: { classification: 'PRE_DP', fusedPlasma: 21000, difficulty: 0, nonce: '0'.repeat(16) },
    },
    {
      name: 'v1 paired zero prices, non-first account block',
      configure(input) {
        const legacy = pricedFrontier({ version: 1, nextFusionPrice: 0, nextWorkPrice: 0 });
        input.nonce = WORK_NONCE;
        return nonFirst(setDynamic(input, legacy, observation({ availablePlasma: 9000, requiredDifficulty: 17 })), who);
      },
      expected: { classification: 'PRE_DP', fusedPlasma: 9000, difficulty: 17, nonce: WORK_NONCE },
    },
    {
      name: 'v2 neutral prices',
      configure(input) { return input; },
      expected: { classification: 'DP_ACTIVE', fusedPlasma: 21000, difficulty: 0, nonce: '0'.repeat(16) },
    },
    {
      name: 'v2 elevated fusion-only',
      configure(input) {
        const frontier = pricedFrontier({ nextFusionPrice: 1200, nextWorkPrice: 1100 });
        return nonFirst(setDynamic(input, frontier, observation({ availablePlasma: 25200 })), who);
      },
      expected: { classification: 'DP_ACTIVE', fusedPlasma: 25200, difficulty: 0, nonce: '0'.repeat(16) },
    },
    {
      name: 'v2 elevated all-work',
      configure(input) {
        const frontier = pricedFrontier({ nextFusionPrice: 1200, nextWorkPrice: 1100 });
        input.nonce = WORK_NONCE;
        return setDynamic(input, frontier, observation({ availablePlasma: 0, requiredDifficulty: 34650000 }));
      },
      expected: { classification: 'DP_ACTIVE', fusedPlasma: 0, difficulty: 34650000, nonce: WORK_NONCE },
    },
    {
      name: 'v2 elevated partial fusion',
      configure(input) {
        const frontier = pricedFrontier({ nextFusionPrice: 1200, nextWorkPrice: 1100 });
        input.nonce = WORK_NONCE;
        return nonFirst(setDynamic(input, frontier, observation({
          availablePlasma: 10000,
          requiredDifficulty: 20901000,
        })), who);
      },
      expected: { classification: 'DP_ACTIVE', fusedPlasma: 10000, difficulty: 20901000, nonce: WORK_NONCE },
    },
  ];

  for (const scenario of cases) {
    const input = scenario.configure(baseInput(who));
    const prepared = prepareUnsignedZenonPaymentBlock(input);
    const preparedBeforeSigning = structuredClone(prepared);
    const expectedHeight = input.accountFrontierAfter === null
      ? 1
      : input.accountFrontierAfter.height + 1;
    assert.equal(prepared.qualification, 'OFFLINE_SERIALIZATION_ONLY', scenario.name);
    assert.equal(prepared.classification, scenario.expected.classification, scenario.name);
    assert.equal(
      prepared.pricingBasis,
      scenario.expected.classification === 'PRE_DP'
        ? 'LEGACY_SDK_BEHAVIOR_WITHOUT_DP_COHERENCE_PROOF'
        : 'DYNAMIC_PLASMA_CLASSIFIER',
      scenario.name,
    );
    assert.deepEqual(Object.keys(prepared.block), BLOCK_FIELDS, scenario.name);
    assert.equal(prepared.block.version, 1, scenario.name);
    assert.equal(prepared.block.blockType, sdk.BlockTypeEnum.UserSend, scenario.name);
    assert.equal(prepared.block.fromBlockHash, EMPTY_HASH, scenario.name);
    assert.equal(prepared.block.address, who.payer, scenario.name);
    assert.equal(prepared.block.publicKey, who.publicKey, scenario.name);
    assert.equal(prepared.block.height, expectedHeight, scenario.name);
    assert.equal(prepared.block.previousHash, input.accountFrontierAfter?.hash ?? EMPTY_HASH, scenario.name);
    assert.deepEqual(prepared.block.momentumAcknowledged, {
      hash: input.dynamicPlasma.afterFrontier.hash,
      height: input.dynamicPlasma.afterFrontier.height,
    }, scenario.name);
    assert.equal(prepared.block.fusedPlasma, scenario.expected.fusedPlasma, scenario.name);
    assert.equal(prepared.block.difficulty, scenario.expected.difficulty, scenario.name);
    assert.equal(prepared.block.nonce, scenario.expected.nonce, scenario.name);
    assert.equal(prepared.block.signature, '', scenario.name);
    assert.equal(Object.isFrozen(prepared), true, scenario.name);
    assert.equal(Object.isFrozen(prepared.block), true, scenario.name);
    assert.equal(Object.isFrozen(prepared.block.momentumAcknowledged), true, scenario.name);

    const fromBlock = preimageFromPreparedBlock(prepared.block);
    const explicit = explicitVectorPreimage(input, scenario.expected);
    const sdkBlock = materialize(prepared.block);
    assert.equal(fromBlock.length, 306, scenario.name);
    assert.deepEqual(fromBlock, explicit, scenario.name);
    assert.equal(getTxHash(sdkBlock).toString(), prepared.block.hash, scenario.name);
    assert.equal(computeBlockHash(sdkBlock, sdk).toString(), prepared.block.hash, scenario.name);

    let signerCalls = 0;
    const signed = attachSyntheticSignature(prepared, block => {
      signerCalls += 1;
      return who.payerKeyPair.sign(sdk.Hash.parse(block.hash).getBytes());
    });
    assert.equal(signerCalls, 1, scenario.name);
    assert.notStrictEqual(signed, prepared.block, scenario.name);
    assert.notStrictEqual(
      signed.momentumAcknowledged,
      prepared.block.momentumAcknowledged,
      scenario.name,
    );
    assert.deepEqual(prepared, preparedBeforeSigning, scenario.name);
    const signedWithoutSignature = structuredClone(signed);
    signedWithoutSignature.signature = '';
    assert.deepEqual(signedWithoutSignature, preparedBeforeSigning.block, scenario.name);
    assert.equal(signed.publicKey, input.publicKey, scenario.name);
    assert.equal(verifySyntheticSignature(signed, input.publicKey), true, scenario.name);
  }
});

test('the full 306-byte preimage matches explicit vector bytes and both real hash oracles', t => {
  const who = identity(t);
  const frontier = pricedFrontier({ nextFusionPrice: 1200, nextWorkPrice: 1100 });
  const input = nonFirst(setDynamic(
    baseInput(who, { nonce: WORK_NONCE }),
    frontier,
    observation({ availablePlasma: 10000, requiredDifficulty: 20901000 }),
  ), who);
  const expected = { fusedPlasma: 10000, difficulty: 20901000, nonce: WORK_NONCE };
  const prepared = prepareUnsignedZenonPaymentBlock(input);
  const fromBlock = preimageFromPreparedBlock(prepared.block);
  const explicit = explicitVectorPreimage(input, expected);
  const sdkBlock = materialize(prepared.block);

  assert.equal(fromBlock.length, 306);
  assert.deepEqual(fromBlock, explicit);
  assert.equal(sdk.Hash.digest(explicit).toString(), prepared.block.hash);
  assert.equal(getTxHash(sdkBlock).toString(), prepared.block.hash);
  assert.equal(computeBlockHash(sdkBlock, sdk).toString(), prepared.block.hash);
});

test('one synthetic signature is attached only after every unsigned field is final', t => {
  const who = identity(t);
  const prepared = prepareUnsignedZenonPaymentBlock(baseInput(who));
  const original = structuredClone(prepared.block);
  let signerCalls = 0;
  const signed = attachSyntheticSignature(prepared, block => {
    signerCalls += 1;
    return who.payerKeyPair.sign(sdk.Hash.parse(block.hash).getBytes());
  });

  assert.equal(signerCalls, 1);
  assert.deepEqual(prepared.block, original);
  assert.equal(prepared.block.signature, '');
  assert.equal(Buffer.from(signed.signature, 'base64').length, 64);
  for (const field of BLOCK_FIELDS.filter(field => field !== 'signature')) {
    assert.deepEqual(signed[field], original[field]);
  }
  assert.equal(verifySyntheticSignature(signed, who.publicKey), true);
});

test('incoherent quotes, stale frontiers, and unavailable or mismatched profiles reject before signing', t => {
  const who = identity(t);
  const invalid = [];

  const badQuote = baseInput(who);
  badQuote.dynamicPlasma.rpcObservation.requiredDifficulty = 1;
  invalid.push(badQuote);

  const staleMomentum = baseInput(who);
  staleMomentum.dynamicPlasma.afterFrontier.height += 1;
  invalid.push(staleMomentum);

  const staleAccount = nonFirst(baseInput(who), who);
  staleAccount.accountFrontierAfter.hash = 'ef'.repeat(32);
  invalid.push(staleAccount);

  for (const classification of ['MISMATCH', 'UNAVAILABLE']) {
    const input = baseInput(who);
    input.dynamicPlasma.chainProfileMatch.classification = classification;
    invalid.push(input);
  }

  let signerCalls = 0;
  for (const input of invalid) {
    assert.throws(() => {
      const prepared = prepareUnsignedZenonPaymentBlock(input);
      signerCalls += 1;
      return attachSyntheticSignature(prepared, block =>
        who.payerKeyPair.sign(sdk.Hash.parse(block.hash).getBytes()));
    }, error => error?.code === REJECTION_CODE);
  }
  assert.equal(signerCalls, 0);
});

test('mixed legacy schemas, unknown fields, SDK objects, and aliases reject', t => {
  const who = identity(t);

  const mixed = baseInput(who);
  mixed.dynamicPlasma.beforeFrontier = legacyAbsentFrontier();
  mixed.dynamicPlasma.afterFrontier = pricedFrontier({
    version: 1,
    nextFusionPrice: 0,
    nextWorkPrice: 0,
  });
  assertRejected(mixed);

  const unknown = baseInput(who);
  unknown.dynamicPlasma.beforeFrontier = { ...unknown.dynamicPlasma.beforeFrontier, timestamp: 1 };
  assertRejected(unknown);

  const rawMomentum = Object.assign(Object.create(sdk.Momentum.prototype), pricedFrontier());
  const raw = baseInput(who);
  raw.dynamicPlasma.beforeFrontier = rawMomentum;
  assertRejected(raw);

  assertRejected({ ...baseInput(who), signer: () => {} });

  const alias = baseInput(who);
  alias.dynamicPlasma.afterFrontier = alias.dynamicPlasma.beforeFrontier;
  assertRejected(alias);

  const accountAlias = nonFirst(baseInput(who), who);
  accountAlias.accountFrontierAfter = accountAlias.accountFrontierBefore;
  assertRejected(accountAlias);
});

test('nonce shape and zero-work/positive-work presence are exact', t => {
  const who = identity(t);
  const priced = pricedFrontier({ nextFusionPrice: 1200, nextWorkPrice: 1100 });

  for (const nonce of [null, '01', 'ABCDEF0123456789', 1]) {
    const input = setDynamic(
      baseInput(who, { nonce }),
      priced,
      observation({ availablePlasma: 0, requiredDifficulty: 34650000 }),
    );
    assertRejected(input);
  }
  for (const nonce of [WORK_NONCE, '0'.repeat(16)]) {
    assertRejected(baseInput(who, { nonce }));
  }
});

test('malformed account frontiers, overflow, encodings, and payer binding reject', t => {
  const who = identity(t);

  const halfFirst = baseInput(who);
  halfFirst.accountFrontierBefore = { address: who.payer, height: 1, hash: ACCOUNT_HASH };
  assertRejected(halfFirst);

  const overflow = nonFirst(baseInput(who), who, { height: Number.MAX_SAFE_INTEGER });
  assertRejected(overflow);

  const malformedHash = nonFirst(baseInput(who), who, { hash: ACCOUNT_HASH.toUpperCase() });
  assertRejected(malformedHash);

  assertRejected(baseInput(who, { chainIdentifier: Number.MAX_SAFE_INTEGER + 1 }));
  assertRejected(baseInput(who, { publicKey: `${who.publicKey.slice(0, -2)}AA` }));

  const amount = baseInput(who);
  amount.intent.amount = '042';
  assertRejected(amount);

  const data = baseInput(who);
  data.intent.data = Buffer.alloc(31).toString('base64');
  assertRejected(data);

  const other = identity(t, 0x33);
  assertRejected(baseInput(who, { publicKey: other.publicKey }));
});

test('accessors and proxies are rejected without invoking caller callbacks', t => {
  const who = identity(t);
  let getterCalls = 0;
  const accessor = baseInput(who);
  Object.defineProperty(accessor.intent, 'amount', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return '42';
    },
  });
  assertRejected(accessor);
  assert.equal(getterCalls, 0);

  let trapCalls = 0;
  const proxy = new Proxy(pricedFrontier(), {
    getPrototypeOf() { trapCalls += 1; return Object.prototype; },
    ownKeys() { trapCalls += 1; return []; },
    getOwnPropertyDescriptor() { trapCalls += 1; return undefined; },
    get() { trapCalls += 1; return undefined; },
  });
  const proxied = baseInput(who);
  proxied.dynamicPlasma.beforeFrontier = proxy;
  assertRejected(proxied);
  assert.equal(trapCalls, 0);
});

test('preparation neither mutates inputs nor exposes mutable aliases', t => {
  const who = identity(t);
  const input = nonFirst(baseInput(who), who);
  const before = structuredClone(input);
  const prepared = prepareUnsignedZenonPaymentBlock(input);

  assert.deepEqual(input, before);
  input.intent.amount = '99';
  input.accountFrontierAfter.height = 8;
  input.dynamicPlasma.afterFrontier.height = 43;
  assert.equal(prepared.block.amount, '42');
  assert.equal(prepared.block.height, 8);
  assert.equal(prepared.block.momentumAcknowledged.height, 42);
  assert.throws(() => { prepared.block.amount = '99'; }, TypeError);
  assert.throws(() => { prepared.block.momentumAcknowledged.height = 43; }, TypeError);
});

test('the signing boundary detects changed, added, deleted, and nested fixture fields', t => {
  const who = identity(t);
  const prepared = prepareUnsignedZenonPaymentBlock(baseInput(who));
  const mutations = [
    block => { block.amount = '43'; },
    block => { block.fixtureOnlyUnexpected = true; },
    block => { delete block.amount; },
    block => { block.momentumAcknowledged.height += 1; },
    block => { Object.setPrototypeOf(block.momentumAcknowledged, null); },
  ];
  let signerCalls = 0;
  for (const mutate of mutations) {
    assert.throws(() => attachSyntheticSignature(prepared, block => {
      signerCalls += 1;
      mutate(block);
      return who.payerKeyPair.sign(sdk.Hash.parse(block.hash).getBytes());
    }), /synthetic_signer_contract_rejected/);
  }
  assert.equal(signerCalls, mutations.length);
  assert.equal(prepared.block.amount, '42');
  assert.equal(prepared.block.signature, '');
});

test('the helper has one classifier call site and no signing or runtime activation hook', () => {
  const source = readFileSync(
    new URL('../src/zenon/internal/pre-sign-account-block-preparation.js', import.meta.url),
    'utf8',
  );
  assert.equal(source.match(/\bclassifyDynamicPlasmaCompatibility\s*\(/g)?.length, 1);
  assert.doesNotMatch(source, /\.sign\s*\(|publishRawTransaction|sendRequest|Zenon\.getInstance|prepareBlock\s*\(/);
});
