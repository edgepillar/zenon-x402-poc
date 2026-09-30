import assert from 'node:assert/strict';
import crypto, { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as verifierModule from '../src/zenon/internal/offline-nonce-proof-verifier.js';

const { verifyOfflineZenonNonceProof } = verifierModule;

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_GENERATORS = [
  0x3b6a57b2,
  0x26508e6d,
  0x1ea119fa,
  0x3d4233dd,
  0x2a1462b3,
];
const POW_RANGE = 1n << 64n;
const SOURCE_ROOT = fileURLToPath(new URL('../src/', import.meta.url));

function sha3(bytes) {
  return createHash('sha3-256').update(bytes).digest();
}

function polymod(values) {
  let checksum = 1;
  for (const value of values) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let index = 0; index < BECH32_GENERATORS.length; index += 1) {
      if ((top >>> index) & 1) checksum ^= BECH32_GENERATORS[index];
    }
  }
  return checksum >>> 0;
}

function hrpValues(hrp) {
  return [
    ...Array.from(hrp, character => character.charCodeAt(0) >>> 5),
    0,
    ...Array.from(hrp, character => character.charCodeAt(0) & 31),
  ];
}

function fiveBitWords(bytes) {
  const words = [];
  let accumulator = 0;
  let bits = 0;
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      words.push((accumulator >>> bits) & 31);
    }
  }
  if (bits > 0) words.push((accumulator << (5 - bits)) & 31);
  return words;
}

function bech32UserAddress(core) {
  const words = fiveBitWords(core);
  const checksumValue = polymod([...hrpValues('z'), ...words, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = Array.from(
    { length: 6 },
    (_, index) => (checksumValue >>> (5 * (5 - index))) & 31,
  );
  return `z1${[...words, ...checksum].map(value => BECH32_CHARSET[value]).join('')}`;
}

function payerCore(fill = 1) {
  return Buffer.concat([
    Buffer.alloc(1),
    sha3(Buffer.alloc(32, fill)).subarray(0, 19),
  ]);
}

function committedTuple(nonceFirstByte = 3, difficulty = 2) {
  const nonce = Buffer.alloc(8);
  nonce[0] = nonceFirstByte;
  return {
    payer: bech32UserAddress(payerCore()),
    previousAccountHash: sha3(Buffer.from('previous-0')).toString('hex'),
    difficulty,
    nonce: nonce.toString('hex'),
  };
}

function referenceObserved(input, core) {
  const domain = sha3(Buffer.concat([
    core,
    Buffer.from(input.previousAccountHash, 'hex'),
  ]));
  const work = sha3(Buffer.concat([
    Buffer.from(input.nonce, 'hex'),
    domain,
  ]));
  let observed = 0n;
  for (let index = 7; index >= 0; index -= 1) {
    observed = (observed << 8n) | BigInt(work[index]);
  }
  return observed;
}

function referenceStatus(input, core) {
  if (input.difficulty === 0) return 'NOT_REQUIRED';
  const threshold = POW_RANGE - (POW_RANGE / BigInt(input.difficulty));
  return referenceObserved(input, core) >= threshold ? 'VALID' : 'INVALID';
}

function assertDeepFrozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) assertDeepFrozen(value[key]);
}

function invalidChecksum(address) {
  const finalIndex = BECH32_CHARSET.indexOf(address.at(-1));
  const replacement = BECH32_CHARSET[(finalIndex + 1) % BECH32_CHARSET.length];
  return `${address.slice(0, -1)}${replacement}`;
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

test('matches the committed deterministic positive and negative tuples', () => {
  const positive = committedTuple(3, 2);
  const negative = committedTuple(1, 2);

  assert.equal(referenceStatus(positive, payerCore()), 'VALID');
  assert.equal(referenceStatus(negative, payerCore()), 'INVALID');
  assert.equal(verifyOfflineZenonNonceProof(positive).status, 'VALID');
  assert.equal(verifyOfflineZenonNonceProof(negative).status, 'INVALID');
});

test('independently evaluates changed domains, reversed nonce bytes, and difficulty', () => {
  const original = committedTuple(3, 2);
  const alternateCore = payerCore(2);
  const reversedNonce = Buffer.from(original.nonce, 'hex').reverse().toString('hex');
  const cases = [
    {
      core: alternateCore,
      input: { ...original, payer: bech32UserAddress(alternateCore) },
    },
    {
      core: payerCore(),
      input: {
        ...original,
        previousAccountHash: sha3(Buffer.from('previous-1')).toString('hex'),
      },
    },
    {
      core: payerCore(),
      input: { ...original, nonce: reversedNonce },
    },
    {
      core: payerCore(),
      input: { ...original, difficulty: 3 },
    },
  ];

  for (const fixture of cases) {
    const expected = referenceStatus(fixture.input, fixture.core);
    assert.equal(verifyOfflineZenonNonceProof(fixture.input).status, expected);
  }
});

test('uses exact integer threshold division at the passing boundary', () => {
  const base = committedTuple(3, 2);
  const gap = POW_RANGE - referenceObserved(base, payerCore());
  const largestPassingDifficulty = POW_RANGE / gap;
  assert.equal(largestPassingDifficulty >= 2n, true);
  assert.equal(largestPassingDifficulty + 1n <= BigInt(Number.MAX_SAFE_INTEGER), true);

  const atBoundary = { ...base, difficulty: Number(largestPassingDifficulty) };
  const afterBoundary = { ...base, difficulty: Number(largestPassingDifficulty + 1n) };
  assert.equal(referenceStatus(atBoundary, payerCore()), 'VALID');
  assert.equal(referenceStatus(afterBoundary, payerCore()), 'INVALID');
  assert.equal(verifyOfflineZenonNonceProof(atBoundary).status, 'VALID');
  assert.equal(verifyOfflineZenonNonceProof(afterBoundary).status, 'INVALID');
});

test('zero difficulty validates structure, returns NOT_REQUIRED, and performs no hashing',
  { concurrency: false }, () => {
    const input = committedTuple(3, 0);
    const originalCreateHash = crypto.createHash;
    let hashCalls = 0;
    crypto.createHash = function countedCreateHash(...arguments_) {
      hashCalls += 1;
      return Reflect.apply(originalCreateHash, crypto, arguments_);
    };
    syncBuiltinESMExports();

    let result;
    try {
      result = verifyOfflineZenonNonceProof(input);
    } finally {
      crypto.createHash = originalCreateHash;
      syncBuiltinESMExports();
    }

    assert.equal(hashCalls, 0);
    assert.equal(result.status, 'NOT_REQUIRED');
    assert.equal(input.nonce === Buffer.alloc(8).toString('hex'), false);
    assert.throws(() => verifyOfflineZenonNonceProof({
      ...input,
      previousAccountHash: input.previousAccountHash.slice(1),
    }), TypeError);
  });

test('difficulty one is always valid and the safe-integer maximum remains bounded', () => {
  const difficultyOne = committedTuple(1, 1);
  const boundedMaximum = committedTuple(1, Number.MAX_SAFE_INTEGER);
  assert.equal(verifyOfflineZenonNonceProof(difficultyOne).status, 'VALID');
  assert.equal(
    verifyOfflineZenonNonceProof(boundedMaximum).status,
    referenceStatus(boundedMaximum, payerCore()),
  );
});

test('rejects negative, fractional, unsafe, negative-zero, boxed, and coercive difficulty', () => {
  const base = committedTuple();
  const invalidValues = [
    -1,
    -0,
    0.5,
    Number.MAX_SAFE_INTEGER + 1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '2',
    2n,
    1n << 1024n,
    new Number(2),
    null,
    undefined,
  ];
  for (const difficulty of invalidValues) {
    assert.throws(() => verifyOfflineZenonNonceProof({ ...base, difficulty }), TypeError);
  }

  let coercions = 0;
  const coercive = {
    valueOf() { coercions += 1; return 2; },
    toString() { coercions += 1; return '2'; },
    [Symbol.toPrimitive]() { coercions += 1; return 2; },
  };
  assert.throws(() => verifyOfflineZenonNonceProof({
    ...base,
    difficulty: coercive,
  }), TypeError);
  assert.equal(coercions, 0);
});

test('enforces canonical bounded Bech32 user addresses', () => {
  const base = committedTuple();
  const address = base.payer;
  const unsupportedCore = Buffer.from(payerCore());
  unsupportedCore[0] = 1;
  const invalidAddresses = [
    address.toUpperCase(),
    `x${address.slice(1)}`,
    address.slice(0, -1),
    `${address}q`,
    invalidChecksum(address),
    `${address.slice(0, 2)}1${address.slice(3)}`,
    bech32UserAddress(unsupportedCore),
    'z'.repeat(10_000),
    new String(address),
  ];
  for (const payer of invalidAddresses) {
    assert.throws(() => verifyOfflineZenonNonceProof({ ...base, payer }), TypeError);
  }
});

test('bounds and validates the previous hash and nonce before decoding', () => {
  const base = committedTuple();
  const uppercaseNonce = Buffer.alloc(8, 0xab).toString('hex').toUpperCase();
  const invalidPreviousHashes = [
    base.previousAccountHash.slice(1),
    `${base.previousAccountHash}0`,
    `g${base.previousAccountHash.slice(1)}`,
    `A${base.previousAccountHash.slice(1)}`,
    '0'.repeat(10_000),
    new String(base.previousAccountHash),
  ];
  const invalidNonces = [
    base.nonce.slice(1),
    `${base.nonce}0`,
    `g${base.nonce.slice(1)}`,
    uppercaseNonce,
    '0'.repeat(10_000),
    new String(base.nonce),
  ];

  for (const previousAccountHash of invalidPreviousHashes) {
    assert.throws(() => verifyOfflineZenonNonceProof({
      ...base,
      previousAccountHash,
    }), TypeError);
  }
  for (const nonce of invalidNonces) {
    assert.throws(() => verifyOfflineZenonNonceProof({ ...base, nonce }), TypeError);
  }
});

test('rejects malformed records, proxies, accessors, symbols, and alternate prototypes', () => {
  const base = committedTuple();
  const missing = { ...base };
  delete missing.nonce;
  const nonenumerable = { ...base };
  Object.defineProperty(nonenumerable, 'nonce', {
    value: base.nonce,
    enumerable: false,
  });
  let accessorReads = 0;
  const accessor = { ...base };
  Object.defineProperty(accessor, 'difficulty', {
    enumerable: true,
    get() { accessorReads += 1; return 2; },
  });
  const alternatePrototype = Object.assign(Object.create({}), base);
  const nullPrototype = Object.assign(Object.create(null), base);
  const symbolField = { ...base, [Symbol('extra')]: true };
  const malformed = [
    null,
    undefined,
    [],
    new Date(0),
    missing,
    { ...base, extra: true },
    nonenumerable,
    accessor,
    alternatePrototype,
    nullPrototype,
    symbolField,
  ];
  for (const input of malformed) {
    assert.throws(() => verifyOfflineZenonNonceProof(input), TypeError);
  }
  assert.equal(accessorReads, 0);
  assert.throws(() => verifyOfflineZenonNonceProof(), TypeError);
  assert.throws(() => verifyOfflineZenonNonceProof(base, undefined), TypeError);

  let inputProxyTraps = 0;
  const inputProxy = new Proxy(base, {
    get() { inputProxyTraps += 1; return undefined; },
    getOwnPropertyDescriptor() { inputProxyTraps += 1; return undefined; },
    getPrototypeOf() { inputProxyTraps += 1; return Object.prototype; },
    ownKeys() { inputProxyTraps += 1; return []; },
  });
  assert.throws(() => verifyOfflineZenonNonceProof(inputProxy), TypeError);
  assert.equal(inputProxyTraps, 0);

  let valueProxyTraps = 0;
  const valueProxy = new Proxy({}, {
    get() { valueProxyTraps += 1; return undefined; },
    getPrototypeOf() { valueProxyTraps += 1; return Object.prototype; },
  });
  assert.throws(() => verifyOfflineZenonNonceProof({
    ...base,
    difficulty: valueProxy,
  }), TypeError);
  assert.equal(valueProxyTraps, 0);

  assert.equal(verifyOfflineZenonNonceProof(Object.freeze({ ...base })).status, 'VALID');
});

test('returns a detached deeply frozen DTO with explicit trust and signer limits', () => {
  const input = committedTuple();
  const snapshot = { ...input };
  const result = verifyOfflineZenonNonceProof(input);
  const second = verifyOfflineZenonNonceProof(snapshot);

  assert.deepEqual(Object.keys(result), [
    'qualification', 'status', 'recordedProofScope', 'trust',
  ]);
  assert.deepEqual(Object.keys(result.recordedProofScope), [
    'payer', 'previousAccountHash', 'difficulty',
  ]);
  assert.deepEqual(Object.keys(result.trust), [
    'sourceAuthentication',
    'chainAuthentication',
    'canonicality',
    'finality',
    'liveFreshness',
    'signingAuthorization',
  ]);
  assert.equal(result.qualification, 'OFFLINE_NONCE_PREDICATE_ONLY');
  assert.equal(result.status, 'VALID');
  for (const value of Object.values(result.trust)) {
    assert.equal(value, 'NOT_ESTABLISHED');
  }
  assert.equal(result.recordedProofScope.payer === snapshot.payer, true);
  assert.equal(
    result.recordedProofScope.previousAccountHash === snapshot.previousAccountHash,
    true,
  );
  assert.equal(result.recordedProofScope.difficulty, snapshot.difficulty);
  assert.equal('nonce' in result.recordedProofScope, false);
  for (const field of [
    'block',
    'capability',
    'signerEligibility',
    'acceptedEpoch',
    'acceptedProfile',
    'authenticatedObservation',
    'sourceHash',
    'nonce',
    'trace',
  ]) {
    assert.equal(field in result, false);
  }
  assertDeepFrozen(result);
  assert.notEqual(result, second);
  assert.notEqual(result.recordedProofScope, second.recordedProofScope);
  assert.notEqual(result.trust, second.trust);
  assert.equal(JSON.stringify(input) === JSON.stringify(snapshot), true);

  input.payer = bech32UserAddress(payerCore(2));
  input.previousAccountHash = sha3(Buffer.from('mutated')).toString('hex');
  input.difficulty = 1;
  input.nonce = Buffer.alloc(8).toString('hex');
  assert.equal(result.recordedProofScope.payer === snapshot.payer, true);
  assert.equal(
    result.recordedProofScope.previousAccountHash === snapshot.previousAccountHash,
    true,
  );
  assert.equal(result.recordedProofScope.difficulty, snapshot.difficulty);
  assert.throws(() => { result.status = 'INVALID'; }, TypeError);
  assert.throws(() => {
    result.trust.signingAuthorization = 'ESTABLISHED';
  }, TypeError);
});

test('keeps one isolated export, one exact offline consumer, and the old trace unverified', () => {
  assert.deepEqual(Object.keys(verifierModule), ['verifyOfflineZenonNonceProof']);
  const verifierSource = readFileSync(
    new URL('../src/zenon/internal/offline-nonce-proof-verifier.js', import.meta.url),
    'utf8',
  );
  const imports = Array.from(
    verifierSource.matchAll(/from\s+['"]([^'"]+)['"]/gu),
    match => match[1],
  );
  assert.deepEqual(imports, ['node:crypto', 'node:util']);
  for (const forbidden of [
    'znn-typescript-sdk',
    'live-runtime',
    'pre-sign-account-block-preparation',
    'legacy-sdk',
    'gate-b-testnet-faucet-receive-child',
  ]) {
    assert.equal(verifierSource.includes(forbidden), false);
  }

  const productionFiles = javascriptFiles(SOURCE_ROOT);
  const definitionAndConsumerFiles = productionFiles
    .filter(path => readFileSync(path, 'utf8').includes('verifyOfflineZenonNonceProof'))
    .map(path => relative(SOURCE_ROOT, path))
    .sort();
  assert.deepEqual(definitionAndConsumerFiles, [
    'zenon/internal/offline-nonce-proof-verifier.js',
    'zenon/internal/offline-pow-producer-owner.js',
    'zenon/internal/offline-preparation-nonce-contract.js',
  ]);

  const traceSource = readFileSync(
    new URL('../src/zenon/internal/offline-observation-to-preparation-contract.js', import.meta.url),
    'utf8',
  );
  assert.equal(
    traceSource.includes("if (!sameManifest(expectedManifest, capturedManifest)) reject();"),
    true,
  );
  assert.equal((traceSource.match(/nonceProof:\s*'NOT_VERIFIED'/gu) ?? []).length, 1);
  assert.equal(traceSource.includes("nonceProof: 'VERIFIED'"), false);
});
