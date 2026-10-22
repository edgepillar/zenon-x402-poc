/*
 * UNEXECUTED, isolated candidate-search qualification draft.
 * Fixed-nonce/metadata permission alone does not authorize this entry's
 * imports, reference evaluation or producer calls. A separately reviewed
 * explicit nonce-search exception and source/identity-guarded caller are
 * required before evaluation. The opt-in below is a guard, NOT authority,
 * hard lifetime, CPU-time, cancellation or OS/network sandbox proof.
 *
 * Reuse the sixteen authored nonce contract scenarios, not their historical
 * adapter/planner fixture chain. This standalone carrier has no quote,
 * preparation, authenticated balance/chain state, key or signing authority.
 * No SDK, endpoint, wallet, SQL, real PREPARE or live provider is imported.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

assert.equal(process.argv.length, 2);
assert.equal(process.env.DP_BOUNDED_NONCE_OPT_IN, 'sixteen-isolated-synthetic-cases-only');
const bytes = readFileSync(new URL('../src/zenon/dynamic-plasma-user-send-nonce-search.js', import.meta.url));
assert.equal(bytes.length, 8437);
assert.equal(createHash('sha256').update(bytes).digest('hex'), '8eda71acf12265b65015ad6db20c1c7b357b207874c8e4c8b72e2889bf86f318');
assert.equal(/[^\x00-\x7f]/.test(bytes.toString('utf8')) || bytes.includes(0), false);
const source = bytes.toString('ascii');
const { searchZenonUnsignedUserSendNonce: search }
  = await import('../src/zenon/dynamic-plasma-user-send-nonce-search.js');
const { deriveZenonUserSendWorkInput: workInput }
  = await import('../src/zenon/dynamic-plasma-user-send-work-input.js');
const { computeZenonUnsignedUserSendHash: computeHash }
  = await import('../src/zenon/transaction-planner.js');
const { validateZenonUnsignedUserSendWork: validateWork }
  = await import('../src/zenon/dynamic-plasma-user-send-fixed-work.js');

const copy = value => JSON.parse(JSON.stringify(value)); // Owned valid synthetic DATA only.
const RANGE = 1n << 64n, ZERO = '0'.repeat(16), LAST = 'ff'.repeat(8);
let producerReservations = 0, verificationReservations = 0, referenceEvaluations = 0, returnedAttempts = 0, calls = 0;
function address(byte) {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l', words = [];
  let accumulator = 0, bits = 0, checksum = 1;
  for (const value of [0, ...Array(19).fill(byte)]) {
    accumulator = (accumulator << 8) | value; bits += 8;
    while (bits >= 5) { bits -= 5; words.push((accumulator >>> bits) & 31); }
  }
  assert.equal(bits, 0);
  for (const word of [3, 0, 26, ...words, 0, 0, 0, 0, 0, 0]) {
    const top = checksum >>> 25; checksum = ((checksum & 0x1ffffff) << 5) ^ word;
    for (const [index, generator] of [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3].entries())
      if ((top >>> index) & 1) checksum ^= generator;
  }
  checksum = (checksum ^ 1) >>> 0;
  return 'z1' + words.map(word => alphabet[word]).join('')
    + Array.from({ length: 6 }, (_, index) => alphabet[(checksum >>> (5 * (5 - index))) & 31]).join('');
}
const A = address(17), B = address(34);
async function input(difficulty = 1, maxAttempts = 16, startNonce = ZERO) {
  // Exact pre-work carrier DATA; no adapter, price quote or planner invocation.
  const accountBlock = { version: 1, chainIdentifier: 73404, blockType: 2,
    hash: '0'.repeat(64), previousHash: '66'.repeat(32), height: 7,
    momentumAcknowledged: { hash: '33'.repeat(32), height: 100 },
    address: A, toAddress: B, amount: '5', tokenStandard: 'zts1znnxxxxxxxxxxxxx9z4ulx',
    fromBlockHash: '0'.repeat(64), data: Buffer.alloc(32, 9).toString('base64'),
    fusedPlasma: 25410, difficulty, nonce: ZERO, publicKey: '', signature: '' };
  return { nonceSearchVersion: 1, phase: 'UNSIGNED', accountBlock, startNonce,
    limits: { maxAttempts, maxDifficulty: difficulty } };
}
function produce(value, reservation) {
  assert.ok(Number.isSafeInteger(reservation) && reservation >= 0 && reservation <= 4096);
  producerReservations += reservation; verificationReservations += 1; assert.ok(producerReservations + referenceEvaluations + verificationReservations <= 65536);
  calls += 1;
  const result = search(value);
  assert.ok(Number.isSafeInteger(result.attempts) && result.attempts >= 0 && result.attempts <= reservation);
  returnedAttempts += result.attempts; return result;
}
function nonceBytes(integer) {
  const bytes = Buffer.alloc(8);
  for (let i = 0; i < 8; i += 1) { bytes[i] = Number(integer & 255n); integer >>= 8n; }
  return bytes;
}
function readLE(bytes) {
  let value = 0n; for (let i = 7; i >= 0; i -= 1) value = (value << 8n) | BigInt(bytes[i]);
  return value;
}
function reference(value) {
  const work = workInput(value.accountBlock), data = Buffer.from(work.dataHash, 'hex');
  const threshold = RANGE - RANGE / BigInt(work.difficulty);
  let cursor = readLE(Buffer.from(value.startNonce, 'hex'));
  for (let i = 0; i < value.limits.maxAttempts; i += 1) {
    referenceEvaluations += 1; assert.ok(producerReservations + referenceEvaluations + verificationReservations <= 65536);
    const nonce = nonceBytes(cursor), digest = createHash('sha3-256').update(Buffer.concat([nonce, data])).digest();
    const number = readLE(digest);
    if (number >= threshold) return { status: 'FOUND', nonce: nonce.toString('hex'), attempts: i + 1,
      nextNonce: null, number: number.toString(), digest: digest.toString('hex'), threshold: threshold.toString() };
    if (cursor === RANGE - 1n) return { status: 'RANGE_EXHAUSTED', nonce: null, attempts: i + 1, nextNonce: null };
    cursor += 1n;
  }
  return { status: 'BUDGET_EXHAUSTED', nonce: null, attempts: value.limits.maxAttempts,
    nextNonce: nonceBytes(cursor).toString('hex') };
}
function matches(actual, expected) {
  for (const key of ['status', 'nonce', 'attempts', 'nextNonce']) assert.equal(actual[key], expected[key]);
  if (expected.status === 'FOUND') {
    assert.equal(actual.verification.value, expected.number); assert.equal(actual.verification.nonceDigest, expected.digest);
    assert.equal(actual.verification.threshold, expected.threshold);
  } else assert.equal(actual.verification, null);
}
function rejected(error) {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, 'zenon_user_send_nonce_search_input_rejected');
  assert.equal(error.message, error.code); assert.equal(error.stack, 'TypeError: ' + error.code);
  assert.equal(Object.hasOwn(error, 'cause'), false); return true;
}
function deepFrozen(value) {
  if (value !== null && typeof value === 'object') {
    assert.ok(Object.isFrozen(value)); for (const child of Object.values(value)) deepFrozen(child);
  }
}

test('bounded nonce search returns existing placeholder DATA without candidate work for declared zero difficulty', { timeout: 5000 }, async () => {
  for (const maxAttempts of [0, 4096]) {
    const value = await input(0, maxAttempts, LAST), result = produce(value, maxAttempts);
    assert.equal(result.status, 'WORK_NOT_REQUIRED'); assert.equal(result.attempts, 0);
    assert.equal(result.nonce, value.accountBlock.nonce); assert.equal(result.nextNonce, null);
    assert.equal(result.verification, null); assert.equal(result.nonceCandidateEvaluation, 'NOT_PERFORMED');
    assert.equal(result.nonceProduction, 'NOT_REQUIRED_BY_DECLARED_ZERO_DIFFICULTY');
    assert.equal(result.workInput.nonceGeneration, 'NOT_PERFORMED');
  }
});

test('bounded nonce search produces the first explicit cursor at difficulty one and discloses bounded production', { timeout: 5000 }, async () => {
  const value = await input(1, 16, '0102030405060708'), before = copy(value), result = produce(value, 16);
  assert.equal(result instanceof Promise, false); assert.equal(result.status, 'FOUND'); assert.equal(result.attempts, 1);
  assert.equal(result.nonce, value.startNonce); assert.equal(result.nextNonce, null);
  assert.equal(result.nonceProduction, 'FOUND_BY_BOUNDED_SEARCH');
  assert.equal(result.nonceCandidateEvaluation, 'PERFORMED_WITHIN_ATTEMPT_LIMIT');
  assert.equal(result.workInput.nonceGeneration, 'NOT_PERFORMED'); // Earlier derivation receipt is not relabeled.
  assert.equal(result.verification.validation, 'MATCHES_DECLARED_DIFFICULTY');
  assert.equal(result.verification.dataHash, workInput(value.accountBlock).dataHash);
  assert.deepEqual(value, before); assert.equal(Object.isFrozen(value), false); deepFrozen(result);
});

test('bounded nonce search matches an independent finite LE64 prefix across safe declared difficulties and cursors', { timeout: 5000 }, async () => {
  for (const difficulty of [1, 2, 3, 1500, Number.MAX_SAFE_INTEGER]) {
    for (const cursor of [ZERO, 'ff00000000000000', '0102030405060708']) {
      const value = await input(difficulty, 16, cursor);
      const expected = reference(value), result = produce(value, 16);
      matches(result, expected); assert.equal(result.workInput.difficulty, difficulty);
      assert.equal(result.workInput.dataHash, workInput(value.accountBlock).dataHash);
    }
  }
});

test('bounded nonce search with zero positive-work budget evaluates no candidate and retains the exact start cursor', { timeout: 5000 }, async () => {
  for (const cursor of [ZERO, LAST]) {
    const value = await input(1, 0, cursor), result = produce(value, 0);
    assert.equal(result.status, 'BUDGET_EXHAUSTED'); assert.equal(result.nonce, null); assert.equal(result.attempts, 0);
    assert.equal(result.nextNonce, cursor); assert.equal(result.verification, null);
    assert.equal(result.nonceCandidateEvaluation, 'NOT_PERFORMED'); assert.equal(result.nonceProduction, 'NO_NONCE_FOUND');
  }
});

test('bounded nonce search exhausts exactly its4096 candidate ceiling without fallback or a fabricated nonce', { timeout: 5000 }, async () => {
  const value = await input(Number.MAX_SAFE_INTEGER, 4096);
  const expected = reference(value); assert.equal(expected.status, 'BUDGET_EXHAUSTED'); // Fixed reviewed prefix, no seed search.
  const result = produce(value, 4096); matches(result, expected);
  assert.equal(result.attempts, 4096); assert.equal(result.nonce, null); assert.equal(result.nextNonce, '0010000000000000');
  assert.equal(result.verification, null); assert.equal(result.nonceProduction, 'NO_NONCE_FOUND');
});

test('bounded nonce search stops at the last nonce and never increments into the work data hash', { timeout: 5000 }, async () => {
  for (const cursor of [LAST, 'feffffffffffffff']) {
    const value = await input(Number.MAX_SAFE_INTEGER, 4096, cursor), before = copy(value);
    const expected = reference(value); assert.equal(expected.status, 'RANGE_EXHAUSTED');
    const result = produce(value, 4096); matches(result, expected);
    assert.equal(result.nextNonce, null); assert.equal(result.nonce, null);
    assert.equal(result.workInput.dataHash, workInput(value.accountBlock).dataHash);
    assert.deepEqual(value, before);
  }
});

test('bounded nonce search exposes little-endian carry and an explicit DATA-only continuation without automatic resume', { timeout: 5000 }, async () => {
  const value = await input(Number.MAX_SAFE_INTEGER, 1, 'ff00000000000000');
  const expected = reference(value); assert.equal(expected.status, 'BUDGET_EXHAUSTED');
  const first = produce(value, 1); matches(first, expected); assert.equal(first.nextNonce, '0001000000000000');
  const continued = { ...value, startNonce: first.nextNonce };
  const nextExpected = reference(continued), second = produce(continued, 1); matches(second, nextExpected);
  assert.equal(first.attempts, 1); assert.equal(second.attempts, 1);
  assert.equal(first.workInput.dataHash, second.workInput.dataHash);
  assert.equal(value.startNonce, 'ff00000000000000'); assert.equal(first.authority, 'NONE');
});

test('bounded nonce search rejects invalid limits and a difficulty above its declared ceiling before candidate evaluation', { timeout: 5000 }, async () => {
  const base = await input();
  for (const maxAttempts of [-1, -0, 4097, 1.5, NaN, Infinity, '1', null, {}, 1n]) {
    assert.throws(() => produce({ ...base, limits: { maxAttempts, maxDifficulty: 1 } }, 0), rejected);
  }
  for (const maxDifficulty of [-1, -0, 0, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null, {}]) {
    assert.throws(() => produce({ ...base, limits: { maxAttempts: 16, maxDifficulty } }, 0), rejected);
  }
});

test('bounded nonce search accepts only exact versioned unsigned pre-work DATA and not prepared signed or decorated blocks', { timeout: 5000 }, async () => {
  const base = await input();
  for (const changes of [{ nonceSearchVersion: 2 }, { phase: 'SIGNED' }, { phase: 'VALIDATED' },
    { startNonce: 'ABCDEF0123456789' }, { startNonce: '' }, { startNonce: ZERO + '00' }, { wallet: null }]) {
    assert.throws(() => produce({ ...base, ...changes }, 0), rejected);
  }
  for (const changes of [{ hash: '11'.repeat(32) }, { nonce: '0102030405060708' },
    { publicKey: Buffer.alloc(32, 7).toString('base64') }, { signature: 'signed' },
    { difficulty: -1 }, { difficulty: -0 }, { difficulty: Number.MAX_SAFE_INTEGER + 1 }, { privateKey: 'not-a-key' }]) {
    assert.throws(() => produce({ ...base, accountBlock: { ...base.accountBlock, ...changes } }, 0), rejected);
  }
  assert.throws(() => search(), rejected); assert.throws(() => search(base, null), rejected);
});

test('bounded nonce search rejects descriptor hooks proxies coercion and operational limits without invocation', { timeout: 5000 }, async () => {
  let hooks = 0; const hook = () => { hooks += 1; throw Error('PRIVATE'); };
  const base = await input(), getter = copy(base);
  Object.defineProperty(getter, 'limits', { enumerable: true, get: hook });
  const nested = copy(base); Object.defineProperty(nested.accountBlock, 'difficulty', { enumerable: true, get: hook });
  const budget = copy(base); Object.defineProperty(budget.limits, 'maxAttempts', { enumerable: true, get: hook });
  const nonce = { ...base, startNonce: { toString: hook, [Symbol.toPrimitive]: hook } };
  const proxy = new Proxy(base, { get: hook, getPrototypeOf: hook, ownKeys: hook });
  for (const value of [getter, nested, budget, nonce, proxy, { ...base, limits: { ...base.limits, callback: hook } }]) {
    assert.throws(() => produce(value, 0), rejected);
  }
  assert.equal(hooks, 0);
});

test('bounded nonce search checks each found candidate through the existing full hash and fixed-nonce consumer', { timeout: 5000 }, async () => {
  const value = await input(1, 1), result = produce(value, 1);
  assert.equal(result.status, 'FOUND');
  const candidate = { ...value.accountBlock, nonce: result.nonce };
  candidate.hash = computeHash(candidate);
  verificationReservations += 1;
  assert.ok(producerReservations + referenceEvaluations + verificationReservations <= 65536);
  const verified = validateWork(candidate);
  assert.deepEqual(result.verification, verified.work);
  assert.equal(result.workInput.dataHash, verified.work.dataHash);
  for (const key of ['accountBlock', 'computedHash', 'paymentPayload', 'signature']) assert.equal(Object.hasOwn(result, key), false);
  assert.equal(value.accountBlock.hash, '0'.repeat(64)); assert.equal(value.accountBlock.nonce, ZERO);
});

test('bounded nonce search receipts are detached frozen DATA without mutating or freezing caller inputs', { timeout: 5000 }, async () => {
  const value = await input(1, 1), before = copy(value), result = produce(value, 1);
  deepFrozen(result); assert.deepEqual(value, before);
  assert.equal(Object.isFrozen(value), false); assert.equal(Object.isFrozen(value.limits), false);
  assert.equal(Object.isFrozen(value.accountBlock), false);
  value.limits.maxAttempts = 0; value.accountBlock.difficulty = 2; value.startNonce = LAST;
  assert.equal(result.limits.maxAttempts, 1); assert.equal(result.workInput.difficulty, 1);
  assert.equal(result.startNonce, ZERO); assert.equal(result.nonce, ZERO);
});

test('bounded nonce search does not turn shared address-frontier work into a full payment commitment or authority', { timeout: 5000 }, async () => {
  const first = await input(1, 1), other = copy(first); other.accountBlock.amount = '6';
  const a = produce(first, 1), b = produce(other, 1);
  assert.equal(a.nonce, b.nonce); assert.equal(a.workInput.dataHash, b.workInput.dataHash);
  assert.notEqual(a.workInput.subjectDigest, b.workInput.subjectDigest);
  assert.notEqual(a.workInput.fieldDigest, b.workInput.fieldDigest);
  for (const value of [a, b]) {
    assert.equal(value.authority, 'NONE'); assert.equal(value.afterSigningAction, 'NONE');
    assert.equal(value.preparation, 'NOT_PERFORMED'); assert.equal(value.currentPriceAndAccountState, 'NOT_CHECKED');
    assert.equal(value.signing, 'NOT_PERFORMED'); assert.equal(value.publication, 'NOT_PERFORMED');
    assert.equal(value.chainAuthentication, 'NOT_ESTABLISHED'); assert.equal(value.keyPossession, 'NOT_ESTABLISHED');
  }
});

test('bounded nonce search is deterministic on an exact explicit request and never owns retry or recovery authority', { timeout: 5000 }, async () => {
  const value = await input(3, 16, '0102030405060708'), a = produce(value, 16), b = produce(copy(value), 16);
  assert.deepEqual(a, b);
  for (const key of ['reset', 'resume', 'sign', 'publish', 'close']) assert.equal(Object.hasOwn(a, key), false);
  const terminal = await input(Number.MAX_SAFE_INTEGER, 1, LAST);
  const expected = reference(terminal); assert.equal(expected.status, 'RANGE_EXHAUSTED');
  const result = produce(terminal, 1); matches(result, expected); assert.equal(result.nextNonce, null);
});

test('bounded nonce search source captures existing consumers and excludes randomness SDK signing native owners and overflow fallback', { timeout: 5000 }, () => {
  assert.equal((source.match(/^export /gm) ?? []).length, 1);
  assert.match(source, /const WORK_INPUT = deriveZenonUserSendWorkInput/);
  assert.match(source, /const VERIFY_WORK = validateZenonUnsignedUserSendWork/);
  assert.match(source, /VERIFY_WORK\(candidate\)/); assert.match(source, /declared\.maxAttempts > 4096/);
  assert.match(source, /cursor === RANGE - 1n/); assert.match(source, /Buffer\.alloc\(40\)/);
  assert.match(source, /copy\(message, 8\)/);
  assert.doesNotMatch(source, /node:(?:fs|https?|tls|dns|child_process|worker_threads)|fetch\s*\(|new Promise|setTimeout|this\./);
  assert.doesNotMatch(source, /randomBytes|Math\.random|generateKeyPair|crypto\.sign|crypto\.verify|prepareBlock|publishRawTransaction/);
  assert.match(source, /NOT a wall-clock/); assert.match(source, /not sufficient current Plasma/);
});

test('bounded nonce search qualification remains below its total65536 declared producer and reference candidate ceiling', { timeout: 5000 }, t => {
  assert.equal(calls, 72); assert.equal(producerReservations, 16679);
  assert.equal(verificationReservations, 73);
  assert.ok(returnedAttempts > 0 && returnedAttempts <= producerReservations);
  assert.ok(referenceEvaluations > 0 && referenceEvaluations <= 4342);
  assert.ok(producerReservations + referenceEvaluations + verificationReservations <= 65536);
  t.diagnostic(JSON.stringify({ kind: 'P1A_ISOLATED_BOUNDED_NONCE',
    guardedProducerCalls: calls, directArityRefusals: 2,
    producerReservations, verificationReservations, referenceEvaluations,
    returnedAttempts, totalCandidateCeiling: 65536, candidateChecksUpperBound: 21094,
    signatures: 0, qualification: 'DECLARED_DATA_ONLY_NOT_NATIVE_PROVIDER_OR_LIVE_DP' }));
});
