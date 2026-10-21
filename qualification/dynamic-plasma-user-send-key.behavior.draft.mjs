import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

// Fixed public-byte DATA and hashes only. No key generation, Ed25519,
// signature, wallet, SDK, nonce producer, owner or live operation is used.
assert.equal(process.argv.length, 2);
const pins = [
  ["../src/zenon/transaction-planner.js", 16738, "bbf51fa2fc75df7f69973a89ae275ec709622942444eb30cea0cc9924afbf143"],
  ["../src/zenon/bounded-dynamic-plasma-strategy.js", 15729, "7b82560bdeb25e573912090a2fe8de7b45912500a7a7c4434fe06dcf94e06d62"],
  ["../src/canonical.js", 967, "0d55ddf1727cafb0dcd46df2922305568615552a4d2ae34a5c30e90b9d8d998c"],
  ["../src/x402-wire.js", 39886, "5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56"],
  ["../src/zenon/dynamic-plasma-required-fused-policy-adapter.js", 12024, "e2b693d4df9065d44ba590f4d0c8dffeb8e55187668eedfa396b4026c9905c3e"],
  ["../src/zenon/dynamic-plasma-observation-normalizer.js", 28398, "2c3f7d42ded21a5513ff26c23a00a35a53aa334f053d10930f1571a020286897"],
  ["../src/zenon/dynamic-plasma-json-rpc-read-transport.js", 10832, "fd03b2ad87d16660aa61d3961c163d724d5f89cd6d4bb9c4391d739566d5e5ca"],
  ["../src/zenon/bounded-json-rpc-read-core.js", 20906, "5572d24175455c6b3a9924688d601d31585454ce62dac9eb27151d2a65c83fcd"],
  ["../src/zenon/dynamic-plasma-price-policy.js", 14957, "41e2e2044597cfa69c5adca292bcd762a189076be1cd939bec10798d7e35c52b"],
  ["../src/zenon/dynamic-plasma-compatibility.js", 7732, "b3989ce15e5f2e9d07b0ed035fe96bcce9f22cac93f5e497fdca5c37bf7618dd"],
  ["../src/zenon/dynamic-plasma-required-fused-quote.js", 5416, "f5e10ff2dbfff3b6b63d87f0abadd0bb52b5d6b8fe0ead6a55fc5ea14207b730"],
  ["../src/zenon/plasma-strategy.js", 974, "1c597d4e169ba8a5e6d2b7852c4ffa3a8ec9b854332fe354b9b013c36ebae093"],
  ["../package.json", 1413, "8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"],
  ["../test-support/phase2a-account-block-preimage.js", 7724, "dde02531faaf3c45c5ab9760beba84fe56664f923c1d61fa64b077682d97dc0e"],
  ["../src/zenon/dynamic-plasma-user-send-work-binding.js", 4522, "218b4391c97e4adde905415e20ec0e2015fca98643db85b6efd682aa3b5c5681"],
  ["../src/zenon/dynamic-plasma-user-send-key-binding.js", 4237, "37ad7e74b038801297e4bffb0cb8ba92cbd79009ed32c4ae5b134fe2cb154be2"],
  ["../src/zenon/dynamic-plasma-user-send-work-input.js", 2853, "2ff9c089e5903c059746d0a1c38688a2849f94d04d429279811fbbfbb40450a4"],
];
const sources = new Map();
for (const [path, bytes, sha256] of pins) {
  const raw = readFileSync(new URL(path, import.meta.url));
  assert.equal(raw.length, bytes);
  assert.equal(createHash('sha256').update(raw).digest('hex'), sha256);
  const source = raw.toString('utf8');
  assert.equal(/[^\x00-\x7f]/.test(source) || source.includes('\0'), false);
  assert.equal(Buffer.byteLength(source), bytes);
  assert.ok(source.endsWith('\n'));
  sources.set(path, source);
}
const {
  validateZenonUnsignedUserSendKeyBinding: validateKey,
  bindZenonUnsignedUserSendKeyBinding: bindKey,
} = await import('../src/zenon/dynamic-plasma-user-send-key-binding.js');
const {
  validateZenonUnsignedUserSendWork: validateWork,
  bindZenonUnsignedUserSendWork: bindWork,
} = await import('../src/zenon/dynamic-plasma-user-send-work-binding.js');
const { BoundedDynamicPlasmaStrategy: Bounded } = await import('../src/zenon/bounded-dynamic-plasma-strategy.js');
const { validateZenonUnsignedUserSendHash: validateHash } = await import('../src/zenon/transaction-planner.js');
const { accountBlockHashHex: oracleHash } = await import('../test-support/phase2a-account-block-preimage.js');
const { paymentIntentDigest } = await import('../src/canonical.js');
const { snapshotDynamicPlasmaQuoteRequestContext: requestContext }
  = await import('../src/zenon/dynamic-plasma-observation-normalizer.js');

const H = '33'.repeat(32), H1 = '44'.repeat(32), H2 = '55'.repeat(32);
const GENESIS = '11'.repeat(32), TWO = '22'.repeat(32), PREVIOUS = '66'.repeat(32);
const DYNAMIC = '02'.repeat(32), LIBP2P = '01'.repeat(32), ZERO = '0'.repeat(64);
const RUNTIME = 'sha256:' + 'b'.repeat(64);
const ASSET = 'zts1znnxxxxxxxxxxxxx9z4ulx', OTHER_ASSET = 'zts1qsrxxxxxxxxxxxxxmrhjll';
const copy = value => JSON.parse(JSON.stringify(value)); // Owned valid fixture DATA only.
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
    for (const [index, generator] of [
      0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3,
    ].entries()) if ((top >>> index) & 1) checksum ^= generator;
  }
  checksum = (checksum ^ 1) >>> 0;
  return 'z1' + words.map(word => alphabet[word]).join('')
    + Array.from({ length: 6 }, (_, index) => alphabet[(checksum >>> (5 * (5 - index))) & 31]).join('');
}
const A = address(17), B = address(34), C = address(51);
function bindingInput(ctx) {
  return { bindingVersion: 1, subject: ctx.subject, paymentRequired: ctx.paymentRequired,
    accepted: ctx.accepted, payerAddress: ctx.payerAddress, compiledSporkIds: ctx.compiledSporkIds };
}
function context({
  base = 21000, available = 30000, fusion = 1000, work = 1000,
  height = 100, hash = H, maxFused = 30000, maxDifficulty = 0, amount = '5',
} = {}) {
  const accepted = { scheme: 'exact', network: 'zenon:testnet', asset: ASSET, amount,
    payTo: B, maxTimeoutSeconds: 60,
    extra: { poc: true, settlement: 'account-block', paymentFlow: 'upfront',
      zenonChain: { version: 1, chainIdentifier: '73404', genesisMomentumHash: GENESIS } } };
  const paymentRequired = { x402Version: 2,
    resource: { url: 'https://resource.invalid/paid', description: 'Synthetic resource.',
      mimeType: 'application/json', tags: ['synthetic'] }, accepts: [copy(accepted)] };
  const intent = paymentIntentDigest(paymentRequired, accepted);
  const subject = { subjectVersion: 1, version: 1, chainIdentifier: 73404,
    blockType: 2, previousHash: PREVIOUS, height: 7,
    momentumAcknowledged: { hash: H, height: 100 }, address: A, toAddress: B,
    amount, tokenStandard: ASSET, fromBlockHash: ZERO,
    data: Buffer.from(intent, 'hex').toString('base64') };
  const compiledSporkIds = { dynamicPlasmaId: DYNAMIC, libp2pId: LIBP2P };
  const frontier = { chainIdentifier: '73404', height, hash, version: 2,
    nextFusionPrice: fusion, nextWorkPrice: work };
  const total = Math.ceil(base * fusion / 1000), fused = Math.min(available, total);
  const remaining = Math.max(0, base - Math.floor(fused * 1000 / fusion));
  const endpoint = {
    beforeFrontier: { ...frontier },
    profileEvidence: { heightTwo: {
      chainIdentifier: '73404', height: 2, hash: TWO, previousHash: GENESIS, version: 1,
    } },
    sporks: { count: 2, list: [
      { id: LIBP2P, name: 'libp2p', activated: false, enforcementHeight: 0 },
      { id: DYNAMIC, name: 'dynamic-plasma', activated: true, enforcementHeight: 10 },
    ] },
    plasmaVariables: { MaxBasePlasmaInMomentum: 4200000, FusedPlasmaTarget: 1050000,
      PowPlasmaTarget: 1050000, MaxPriceChangePercent: 10, PriceChangeDenominator: 20 },
    rpcObservation: { availablePlasma: available, basePlasma: base,
      requiredDifficulty: Math.ceil(remaining * work / 1000) * 1500, requiredFusedPlasma: total },
    afterFrontier: { ...frontier },
  };
  const ctx = { phase: 'UNSIGNED', subject, paymentRequired, accepted, payerAddress: A,
    compiledSporkIds, observation: {
      expectedChainProfile: copy(accepted.extra.zenonChain), compiledSporkIds: copy(compiledSporkIds),
      endpointObservations: [copy(endpoint), copy(endpoint)],
      requiredFusedObservationVersion: 1, quoteRequestContextVersion: 1, quoteRequestContext: null,
    },
    policy: { policyVersion: 1, maxPriceChangePercent: 10, maxMomentumAdvances: 2,
      maxFusedPlasma: maxFused, maxDifficulty }, runtimeContextDigest: RUNTIME };
  refreshRequest(ctx); return ctx;
}
function refreshRequest(ctx) {
  ctx.observation.quoteRequestContext = requestContext({
    requestContextVersion: 1, expectedChainProfile: ctx.observation.expectedChainProfile,
    compiledSporkIds: ctx.observation.compiledSporkIds,
    quoteRequest: { address: ctx.subject.address, blockType: 2,
      toAddress: ctx.subject.toAddress, data: ctx.subject.data },
  });
}
function refreshIntent(ctx) {
  ctx.subject.data = Buffer.from(paymentIntentDigest(ctx.paymentRequired, ctx.accepted), 'hex').toString('base64');
  refreshRequest(ctx);
}
function policyError(error) {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, 'dynamic_plasma_price_policy_input_rejected');
  assert.equal(error.message, 'Dynamic Plasma price policy input rejected');
  assert.equal(error.stack, 'TypeError: ' + error.message);
  assert.equal(Object.hasOwn(error, 'cause'), false); return true;
}
function bindingError(error) {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, 'zenon_user_send_binding_input_rejected');
  assert.equal(error.message, error.code); assert.equal(error.stack, 'TypeError: ' + error.code);
  assert.equal(Object.hasOwn(error, 'cause'), false); return true;
}
function fields(value, expected) {
  assert.deepEqual(Object.keys(value), ['fusedPlasma', 'difficulty']);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.ok(Object.isFrozen(value)); assert.deepEqual(value, expected);
}
function frozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) frozen(child);
}

function block(ctx, selection = { fusedPlasma: 25410, difficulty: 0 }) {
  const { subjectVersion, ...subject } = copy(ctx.subject);
  assert.equal(subjectVersion, 1);
  return { ...subject, hash: '88'.repeat(32), ...selection,
    nonce: '0000000000000000', publicKey: '', signature: '' };
}
function committedFields(value) {
  // Independent fixed sorted-key oracle, not the production canonicalizer.
  const b = value;
  const canonical = JSON.stringify({
    address: b.address, amount: b.amount, blockType: b.blockType,
    chainIdentifier: b.chainIdentifier, data: b.data, difficulty: b.difficulty,
    fromBlockHash: b.fromBlockHash, fusedPlasma: b.fusedPlasma, hash: b.hash, height: b.height,
    momentumAcknowledged: { hash: b.momentumAcknowledged.hash, height: b.momentumAcknowledged.height },
    nonce: b.nonce, previousHash: b.previousHash, publicKey: b.publicKey,
    signature: b.signature, toAddress: b.toAddress, tokenStandard: b.tokenStandard, version: b.version,
  });
  return 'sha256:' + createHash('sha256')
    .update('["zenon-x402-unsigned-user-send-fields/v1",' + canonical + ']').digest('hex');
}

function hashed(ctx, selection, changes = {}) {
  // Only owned well-typed fixture DATA enters the retained independent oracle.
  const value = { ...block(ctx, selection), nonce: '0102030405060708', ...changes };
  value.hash = oracleHash(value);
  return value;
}


const PUBLIC_A = Buffer.alloc(32, 7).toString('base64');
const PUBLIC_B = Buffer.alloc(32, 9).toString('base64');
const PUBLIC_ZERO = Buffer.alloc(32, 0).toString('base64');
function keyAddress(key) {
  // Independent synthetic Bech32 encoder over the pinned public-byte rule,
  // not the production decoder and not an Ed25519 key/address generator.
  const core = Buffer.concat([Buffer.from([0]),
    createHash('sha3-256').update(Buffer.from(key, 'base64')).digest().subarray(0, 19)]);
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l', words = [];
  let value = 0, bits = 0, checksum = 1;
  for (const byte of core) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; words.push((value >>> bits) & 31); }
  }
  assert.equal(bits, 0);
  for (const word of [3, 0, 26, ...words, 0, 0, 0, 0, 0, 0]) {
    const top = checksum >>> 25; checksum = ((checksum & 0x1ffffff) << 5) ^ word;
    for (const [index, generator] of [
      0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3,
    ].entries()) if ((top >>> index) & 1) checksum ^= generator;
  }
  checksum = (checksum ^ 1) >>> 0;
  return 'z1' + words.map(word => alphabet[word]).join('')
    + Array.from({ length: 6 }, (_, index) => alphabet[(checksum >>> (5 * (5 - index))) & 31]).join('');
}
function keyContext(options = {}, publicKey = PUBLIC_A) {
  const ctx = context(options), payer = keyAddress(publicKey);
  ctx.subject.address = payer; ctx.payerAddress = payer; refreshRequest(ctx);
  return ctx;
}
function keyBlock(ctx, selection = { fusedPlasma: 25410, difficulty: 0 }, publicKey = PUBLIC_A) {
  return hashed(ctx, selection, { publicKey });
}
function keyError(error) {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, 'zenon_user_send_key_binding_input_rejected');
  assert.equal(error.message, error.code);
  assert.equal(error.stack, 'TypeError: ' + error.code);
  assert.equal(Object.hasOwn(error, 'cause'), false);
  return true;
}
function noAuthority(value) {
  assert.equal(value.keyAddressBinding, 'MATCHES_SUPPLIED_PUBLIC_KEY_BYTES');
  assert.equal(value.keyPossession, 'NOT_ESTABLISHED');
  assert.equal(value.signatureValidation, 'NOT_PERFORMED');
  assert.equal(value.chainAuthentication, 'NOT_ESTABLISHED');
  assert.equal(value.authority, 'NONE'); assert.equal(value.afterSigningAction, 'NONE');
  frozen(value);
}

test('public-key binding matches the exact supplied bytes to the actual UserSend payer address',
  { timeout: 5000 }, () => {
    const ctx = keyContext(), supplied = keyBlock(ctx, { fusedPlasma: 25410, difficulty: 1 });
    const before = copy(supplied), checked = validateKey(supplied);
    assert.equal(checked.unsignedKeyValidationVersion, 1);
    assert.equal(checked.scope, 'DECLARED_UNSIGNED_USER_SEND_HASH_NONCE_AND_KEY_ADDRESS_CONSISTENCY');
    assert.deepEqual(checked.workBinding.hashBinding.accountBlock, before);
    assert.equal(checked.workBinding.work.validation, 'MATCHES_DECLARED_DIFFICULTY');
    assert.equal(checked.keyBinding.publicKey, PUBLIC_A);
    assert.equal(checked.keyBinding.address, keyAddress(PUBLIC_A));
    const expected = '00' + createHash('sha3-256')
      .update(Buffer.alloc(32, 7)).digest('hex').slice(0, 38);
    assert.equal(checked.keyBinding.addressCoreHex, expected);
    assert.equal(checked.keyBinding.algorithm, 'GO_ZENON_E58D8E8_SHA3_256_PUBLIC_KEY_USER_ADDRESS');
    assert.deepEqual(supplied, before); noAuthority(checked);
  });

test('public-key binding rejects missing or substituted keys still accepted by hash and nonce checks',
  { timeout: 5000 }, async () => {
    const ctx = keyContext(), quote = await new Bounded().quoteUserSend(ctx);
    const original = keyBlock(ctx), firstHash = original.hash;
    const firstFieldDigest = validateWork(original).hashBinding.fieldDigest;
    for (const publicKey of ['', PUBLIC_B]) {
      const other = { ...original, publicKey };
      assert.equal(other.hash, firstHash); // publicKey is deliberately not hash-covered.
      const prior = validateWork(other);
      assert.equal(prior.hashBinding.computedHash, firstHash);
      assert.notEqual(prior.hashBinding.fieldDigest, firstFieldDigest);
      assert.equal((await bindWork(ctx, quote, other)).hashPriceBinding.computedHash, firstHash);
      assert.throws(() => validateKey(other), keyError);
      await assert.rejects(bindKey(ctx, quote, other), keyError);
    }
  });

test('public-key binding requires the actual payer address rather than an independently valid key',
  { timeout: 5000 }, () => {
    const ctx = keyContext(), original = keyBlock(ctx);
    const other = { ...original, address: keyAddress(PUBLIC_B) };
    other.hash = oracleHash(other);
    assert.equal(validateHash(other).computedHash, other.hash);
    assert.equal(validateWork(other).work.validation, 'NOT_REQUIRED_BY_DECLARED_ZERO_DIFFICULTY');
    assert.throws(() => validateKey(other), keyError);
    const corrected = { ...other, publicKey: PUBLIC_B };
    assert.equal(corrected.hash, other.hash);
    assert.equal(validateKey(corrected).keyBinding.address, keyAddress(PUBLIC_B));
  });

test('public-key binding preserves canonical key syntax empty-signature and exact-field requirements',
  { timeout: 5000 }, () => {
    const supplied = keyBlock(keyContext());
    for (const publicKey of [
      Buffer.alloc(31, 7).toString('base64'), Buffer.alloc(33, 7).toString('base64'),
      PUBLIC_A.slice(0, -1), PUBLIC_A + '=', ' ' + PUBLIC_A, PUBLIC_A + '\n',
      { bytes: PUBLIC_A }, Buffer.alloc(32, 7),
    ]) assert.throws(() => validateKey({ ...supplied, publicKey }), keyError);
    for (const other of [
      { ...supplied, signature: Buffer.alloc(64, 3).toString('base64') },
      { ...supplied, keyPossession: true }, { ...supplied, approved: true },
    ]) assert.throws(() => validateKey(other), keyError);
    assert.equal(validateWork({ ...supplied, publicKey: '' }).hashBinding.computedHash, supplied.hash);
  });

test('public-key byte mapping does not establish curve validity key possession or signing authority',
  { timeout: 5000 }, () => {
    // Fixed zero bytes are DATA, not a generated key or a valid-curve claim.
    for (const publicKey of [PUBLIC_A, PUBLIC_B, PUBLIC_ZERO]) {
      const ctx = keyContext({}, publicKey), supplied = keyBlock(ctx, undefined, publicKey);
      const checked = validateKey(supplied);
      assert.equal(checked.keyBinding.address, keyAddress(publicKey));
      assert.equal(checked.keyBinding.keyPossession, 'NOT_ESTABLISHED');
      assert.equal(checked.keyBinding.signatureValidation, 'NOT_PERFORMED');
      noAuthority(checked);
    }
  });

test('key and price binding consumes the same original hash nonce intent and selected Plasma fields',
  { timeout: 5000 }, async () => {
    const ctx = keyContext(), quote = await new Bounded().quoteUserSend(ctx), supplied = keyBlock(ctx);
    const checked = await bindKey(ctx, quote, supplied);
    assert.equal(checked.unsignedKeyBindingVersion, 1);
    assert.equal(checked.scope, 'DECLARED_UNSIGNED_USER_SEND_HASH_NONCE_KEY_AND_PRICE_BINDING');
    assert.deepEqual(checked.workBinding.hashPriceBinding.accountBlock, supplied);
    fields(checked.workBinding.hashPriceBinding.selection, { fusedPlasma: 25410, difficulty: 0 });
    assert.equal(checked.workBinding.hashPriceBinding.computedHash, supplied.hash);
    assert.equal(checked.workBinding.hashPriceBinding.keyAddressBinding, 'NOT_PERFORMED');
    assert.equal(checked.workBinding.work.validation, 'NOT_REQUIRED_BY_DECLARED_ZERO_DIFFICULTY');
    noAuthority(checked);
  });

test('matching public bytes cannot replace the independently selected payment or original allocation',
  { timeout: 5000 }, async () => {
    const ctx = keyContext(), quote = await new Bounded().quoteUserSend(ctx), supplied = keyBlock(ctx);
    for (const edit of [
      b => { b.toAddress = C; }, b => { b.amount = '6'; }, b => { b.fusedPlasma = 21000; },
      b => { b.momentumAcknowledged.hash = H1; },
    ]) {
      const other = copy(supplied); edit(other); other.hash = oracleHash(other);
      assert.equal(validateKey(other).keyAddressBinding, 'MATCHES_SUPPLIED_PUBLIC_KEY_BYTES');
      await assert.rejects(bindKey(ctx, quote, other), keyError);
    }
    const wrongPayerContext = copy(ctx);
    wrongPayerContext.payerAddress = keyAddress(PUBLIC_B);
    await assert.rejects(bindKey(wrongPayerContext, quote, supplied), keyError);
  });

test('matching public bytes do not bypass nonce validation or original quote price-window guards',
  { timeout: 5000 }, async () => {
    const ctx = keyContext(), quote = await new Bounded().quoteUserSend(ctx), supplied = keyBlock(ctx);
    const high = keyBlock(ctx, { fusedPlasma: 25410, difficulty: Number.MAX_SAFE_INTEGER });
    assert.equal(validateHash(high).computedHash, high.hash);
    assert.throws(() => validateKey(high), keyError);
    const stale = copy(ctx);
    for (const endpoint of stale.observation.endpointObservations) {
      endpoint.beforeFrontier.height += 3; endpoint.afterFrontier.height += 3;
      endpoint.beforeFrontier.hash = H1; endpoint.afterFrontier.hash = H1;
    }
    await assert.rejects(bindKey(stale, quote, supplied), keyError);
    const current = copy(ctx);
    for (const endpoint of current.observation.endpointObservations) {
      endpoint.beforeFrontier.height += 2; endpoint.afterFrontier.height += 2;
      endpoint.beforeFrontier.hash = H2; endpoint.afterFrontier.hash = H2;
    }
    const checked = await bindKey(current, quote, supplied);
    assert.equal(checked.workBinding.hashPriceBinding.accountBlock.momentumAcknowledged.hash, H);
    noAuthority(checked);
  });

test('public-key APIs reject hostile key address context descriptors proxies and providers without callbacks',
  { timeout: 5000 }, async () => {
    const ctx = keyContext(), quote = await new Bounded().quoteUserSend(ctx), supplied = keyBlock(ctx);
    let hooks = 0;
    const hook = () => { hooks += 1; throw new Error('HOOK'); };
    for (const field of ['publicKey', 'address', 'hash']) {
      const other = copy(supplied);
      Object.defineProperty(other, field, { get: hook, enumerable: true });
      assert.throws(() => validateKey(other), keyError);
      await assert.rejects(bindKey(ctx, quote, other), keyError);
    }
    const proxy = new Proxy(supplied, {
      get: hook, getPrototypeOf: hook, ownKeys: hook, getOwnPropertyDescriptor: hook,
    });
    assert.throws(() => validateKey(proxy), keyError);
    await assert.rejects(bindKey(ctx, quote, proxy), keyError);
    for (const publicKey of [hook, { toString: hook, valueOf: hook, [Symbol.toPrimitive]: hook }]) {
      assert.throws(() => validateKey({ ...supplied, publicKey }), keyError);
    }
    const hostileContext = copy(ctx);
    Object.defineProperty(hostileContext, 'payerAddress', { get: hook, enumerable: true });
    await assert.rejects(bindKey(hostileContext, quote, supplied), keyError);
    assert.equal(hooks, 0);
  });

test('public-key APIs enforce exact arity phases and receipt separation without resetting authority',
  { timeout: 5000 }, async () => {
    const ctx = keyContext(), quote = await new Bounded().quoteUserSend(ctx), supplied = keyBlock(ctx);
    assert.throws(() => validateKey(), keyError);
    assert.throws(() => validateKey(supplied, null), keyError);
    await assert.rejects(bindKey(ctx, quote), keyError);
    await assert.rejects(bindKey(ctx, quote, supplied, null), keyError);
    for (const phase of ['SIGNED', 'UNKNOWN', 'ACKNOWLEDGED', 'VALIDATED', 'KEY_BOUND']) {
      await assert.rejects(bindKey({ ...ctx, phase }, quote, supplied), keyError);
    }
    const receipt = validateKey(supplied);
    assert.throws(() => validateKey(receipt), keyError);
    await assert.rejects(bindKey(ctx, receipt, supplied), keyError);
    noAuthority(await bindKey(ctx, quote, supplied));
  });

test('key and price binding retains detached pre-await public bytes without rereading mutated caller input',
  { timeout: 5000 }, async () => {
    const ctx = keyContext(), quote = await new Bounded().quoteUserSend(ctx), supplied = keyBlock(ctx);
    const original = copy(supplied), pending = bindKey(ctx, quote, supplied);
    supplied.publicKey = PUBLIC_B; supplied.address = keyAddress(PUBLIC_B);
    supplied.hash = ZERO; supplied.signature = 'not-unsigned'; ctx.phase = 'SIGNED';
    const checked = await pending;
    assert.deepEqual(checked.workBinding.hashPriceBinding.accountBlock, original);
    assert.equal(checked.keyBinding.publicKey, PUBLIC_A);
    assert.deepEqual(copy(checked), checked); noAuthority(checked);
    assert.throws(() => { checked.keyBinding.publicKey = PUBLIC_B; }, TypeError);
    assert.throws(() => { checked.workBinding.hashPriceBinding.accountBlock.address = C; }, TypeError);
  });

test('public-key module remains a fixed-size opt-in hash mapping without key signature or runtime machinery',
  { timeout: 5000 }, () => {
    const source = sources.get('../src/zenon/dynamic-plasma-user-send-key-binding.js');
    assert.equal((source.match(/^export /gm) ?? []).length, 2);
    assert.equal((source.match(/HASH\('sha3-256'\)/g) ?? []).length, 1);
    assert.match(source, /digest\.subarray\(0, 19\)/);
    assert.match(source, /if \(key\.length !== 32\) reject\(\)/);
    assert.match(source, /expectedCore\.equals\(Buffer\.from\(cores\.address\)\)/);
    assert.doesNotMatch(source, /generateKeyPair|createPrivateKey|createPublicKey|randomBytes|crypto\.sign|crypto\.verify|prepareBlock|publishRawTransaction|mnemonic|keystore/);
    assert.doesNotMatch(source, /node:(?:fs|https?|tls|dns|child_process|worker_threads)|fetch\s*\(|process\.(?:env|on)|while\s*\(|for\s*\(/);
    assert.match(source, /e58d8e80eabd9fd5630ed62e0707424d96b5303c/);
  });
