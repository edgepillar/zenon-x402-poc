import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

// Synthetic declared unsigned UserSend SHA3/encoding and price-binding cases.
// No SDK imports, preparation, PoW, key verification, signing or live assurance.
assert.equal(process.versions.node, '24.19.0');
assert.equal(process.argv.length, 2);
const pins = [
  ["../src/zenon/transaction-planner.js", 16004, "54c7cc2c4ac4dbae890a4f1b1b2dcb9a3f2fdacb9998ea318b8c9beb40922825"],
  ["../src/zenon/bounded-dynamic-plasma-strategy.js", 15729, "7b82560bdeb25e573912090a2fe8de7b45912500a7a7c4434fe06dcf94e06d62"],
  ["../src/canonical.js", 967, "0d55ddf1727cafb0dcd46df2922305568615552a4d2ae34a5c30e90b9d8d998c"],
  ["../src/x402-wire.js", 39886, "5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56"],
  ["../src/zenon/dynamic-plasma-required-fused-policy-adapter.js", 12024, "e2b693d4df9065d44ba590f4d0c8dffeb8e55187668eedfa396b4026c9905c3e"],
  ["../src/zenon/dynamic-plasma-observation-collector.js", 33780, "dd298d4cb2ec1c5e2afb7d0fcc51f94f37c3b3793be3e70dc1ce113f2f0f413e"],
  ["../src/zenon/dynamic-plasma-observation-normalizer.js", 28398, "2c3f7d42ded21a5513ff26c23a00a35a53aa334f053d10930f1571a020286897"],
  ["../src/zenon/dynamic-plasma-json-rpc-read-transport.js", 10832, "fd03b2ad87d16660aa61d3961c163d724d5f89cd6d4bb9c4391d739566d5e5ca"],
  ["../src/zenon/bounded-json-rpc-read-core.js", 20906, "5572d24175455c6b3a9924688d601d31585454ce62dac9eb27151d2a65c83fcd"],
  ["../src/zenon/dynamic-plasma-price-policy.js", 14957, "41e2e2044597cfa69c5adca292bcd762a189076be1cd939bec10798d7e35c52b"],
  ["../src/zenon/dynamic-plasma-compatibility.js", 7732, "b3989ce15e5f2e9d07b0ed035fe96bcce9f22cac93f5e497fdca5c37bf7618dd"],
  ["../src/zenon/dynamic-plasma-required-fused-quote.js", 5416, "f5e10ff2dbfff3b6b63d87f0abadd0bb52b5d6b8fe0ead6a55fc5ea14207b730"],
  ["../src/zenon/plasma-strategy.js", 974, "1c597d4e169ba8a5e6d2b7852c4ffa3a8ec9b854332fe354b9b013c36ebae093"],
  ["../package.json", 1413, "8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"],
  ["../test/dynamic-plasma-price-policy.test.js", 28827, "ab6591d268744f611bd5f04f3c199ee53dcf45d871e0b89ac49c57f4981039b5"],
  ["./dynamic-plasma-price-policy-frontier-binding.behavior.draft.mjs", 8745, "d7f672ee4464bd002e893e231dec5acc85785db2407f7df25fa601d74f972409"],
  ["./dynamic-plasma-required-fused-policy-adapter.behavior.draft.mjs", 17942, "8f641945d9f699579a2440a7c6f90e16c4d1712e0e042e9135f0468a8db514f1"],
  ["./dynamic-plasma-four-field-strategy.behavior.draft.mjs", 13760, "7d8e8a975aab82f54889d1a9544a25f2a73ce958cd369d4ee76c5c6021787621"],
  ["./dynamic-plasma-request-bound-policy.behavior.draft.mjs", 26305, "0a1e7ad8860504b7ba07b8f38d212915bff189f7f3bbea2ad822cd3b077348dd"],
  ["./dynamic-plasma-user-send-policy.behavior.draft.mjs", 27617, "726ad107707577cbad02e1684e9a2b498665937cc4a6b307019896e768b5ba61"],
  ["./dynamic-plasma-prepared-user-send-fields.behavior.draft.mjs", 23476, "c483d42e6d93f997647038c942a85c1894380c6b3089632e1f0a15df0f65bf78"],
  ["./dynamic-plasma-user-send-draft.behavior.draft.mjs", 23733, "7c8fb550dadc1a569fb497dd3e5fc1d2d7a45b74caf0447bbb49823bb20e5dd4"],
  ["../test-support/phase2a-account-block-preimage.js", 7724, "dde02531faaf3c45c5ab9760beba84fe56664f923c1d61fa64b077682d97dc0e"],
];
for (const [path, bytes, sha256] of pins) {
  const raw = readFileSync(new URL(path, import.meta.url));
  assert.equal(raw.length, bytes);
  assert.equal(createHash('sha256').update(raw).digest('hex'), sha256);
  const source = raw.toString('utf8');
  assert.equal(/[^\x00-\x7f]/.test(source) || source.includes('\0'), false);
  assert.equal(Buffer.byteLength(source), bytes);
  assert.ok(source.endsWith('\n'));
}
//70 retained registrations requalified against the three changed modules.
// Prior scenario bodies are unchanged; only six source-pin guards refreshed.
await import('./dynamic-plasma-user-send-draft.behavior.draft.mjs');
const { BoundedDynamicPlasmaStrategy: Bounded } = await import('../src/zenon/bounded-dynamic-plasma-strategy.js');
const { validateZenonUnsignedUserSendHash: validateHash,
  snapshotZenonUnsignedUserSendFields: snapshotFields, snapshotZenonUserSendPolicyBinding: snapshot }
  = await import('../src/zenon/transaction-planner.js');
const { decodeZenonUserSendHashCores: cores }
  = await import('../src/zenon/dynamic-plasma-json-rpc-read-transport.js');
const { accountBlockHashHex: oracleHash, accountBlockHashPreimage: oraclePreimage,
  ACCOUNT_BLOCK_HASH_PREIMAGE_BYTES }
  = await import('../test-support/phase2a-account-block-preimage.js');
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
async function acceptsHash(ctx, quote, value) {
  const result = await new Bounded().bindHashedUserSend(ctx, quote, value);
  assert.equal(result.computedHash, value.hash);
  assert.deepEqual(result.accountBlock, value);
  fields(result.selection, { fusedPlasma: value.fusedPlasma, difficulty: value.difficulty });
  assert.equal(result.hashValidation, 'MATCHES_SUPPLIED_FIELDS');
  assert.equal(result.workValidation, 'NOT_PERFORMED');
  assert.equal(result.keyAddressBinding, 'NOT_PERFORMED');
  assert.equal(result.chainAuthentication, 'NOT_ESTABLISHED');
  assert.equal(result.authority, 'NONE'); assert.equal(result.afterSigningAction, 'NONE');
  frozen(result); return result;
}
function coreError(error) {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, 'zenon_user_send_hash_core_input_rejected');
  assert.equal(error.message, error.code); assert.equal(error.stack, 'TypeError: ' + error.code);
  assert.equal(Object.hasOwn(error, 'cause'), false); return true;
}

test('Unsigned UserSend hash matches the retained independent306-byte preimage without importing SDK',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = await new Bounded().quoteUserSend(ctx), value = hashed(ctx);
    assert.equal(ACCOUNT_BLOCK_HASH_PREIMAGE_BYTES, 306);
    assert.equal(oraclePreimage(value).length, 306);
    const raw = validateHash(value);
    assert.equal(raw.unsignedHashValidationVersion, 1);
    assert.equal(raw.scope, 'DECLARED_UNSIGNED_USER_SEND_HASH_CONSISTENCY');
    assert.equal(raw.encoding, 'SDK105_ACCOUNT_BLOCK_V1_USER_SEND_306_BYTES');
    assert.equal(raw.algorithm, 'sha3-256'); assert.equal(raw.preimageBytes, 306);
    assert.equal(raw.computedHash, oracleHash(value));
    assert.equal(raw.hashValidation, 'MATCHES_SUPPLIED_FIELDS');
    assert.notEqual(raw.accountBlock, value);
    assert.notEqual(raw.accountBlock.momentumAcknowledged, value.momentumAcknowledged);
    assert.equal(raw.fieldDigest, committedFields(value)); frozen(raw);
    const bound = await acceptsHash(ctx, quote, value);
    assert.equal(bound.unsignedHashBindingVersion, 1);
    assert.equal(bound.scope, 'DECLARED_UNSIGNED_USER_SEND_HASH_AND_PRICE_BINDING');
    assert.equal(bound.subjectDigest, snapshot(bindingInput(ctx)).subjectDigest);
    assert.equal(bound.intentDigest, quote.intentDigest);
    assert.equal(bound.fieldDigest, raw.fieldDigest);
  });

test('Unsigned UserSend hash rejects draft placeholders still accepted by the field-only consumer',
  { timeout: 5000 }, async () => {
    const ctx = context(), strategy = new Bounded(), quote = await strategy.quoteUserSend(ctx);
    const draft = await strategy.createUnsignedUserSendDraft(ctx, quote);
    assert.equal(draft.accountBlock.hash, ZERO);
    await strategy.bindPreparedUserSend(ctx, quote, draft.accountBlock);
    assert.notEqual(oracleHash(draft.accountBlock), ZERO);
    assert.throws(() => validateHash(draft.accountBlock), bindingError);
    await assert.rejects(strategy.bindHashedUserSend(ctx, quote, draft.accountBlock), policyError);
    const value = hashed(ctx), altered = { ...value, nonce: '0102030405060709' };
    await strategy.bindPreparedUserSend(ctx, quote, altered);
    assert.throws(() => validateHash(altered), bindingError);
    await assert.rejects(strategy.bindHashedUserSend(ctx, quote, altered), policyError);
  });

test('Unsigned UserSend hash covers every encoded payment account acknowledgement and Plasma field',
  { timeout: 5000 }, async () => {
    const ctx = context(), value = hashed(ctx);
    for (const mutate of [
      b => { b.chainIdentifier++; }, b => { b.previousHash = H2; }, b => { b.height++; },
      b => { b.momentumAcknowledged = { hash: H1, height: 101 }; },
      b => { b.address = C; }, b => { b.toAddress = C; }, b => { b.amount = '6'; },
      b => { b.tokenStandard = OTHER_ASSET; }, b => { b.data = Buffer.alloc(32, 7).toString('base64'); },
      b => { b.fusedPlasma++; }, b => { b.difficulty++; }, b => { b.nonce = '0807060504030201'; },
    ]) {
      const altered = copy(value); mutate(altered);
      assert.notEqual(oracleHash(altered), value.hash);
      assert.throws(() => validateHash(altered), bindingError);
      altered.hash = oracleHash(altered);
      assert.equal(validateHash(altered).computedHash, altered.hash);
    }
    for (const version of [0, 2]) assert.throws(() => validateHash({ ...value, version }), bindingError);
    for (const blockType of [1, 3]) assert.throws(() => validateHash({ ...value, blockType }), bindingError);
    assert.throws(() => validateHash({ ...value, fromBlockHash: H1 }), bindingError);
  });

test('Unsigned UserSend hash match alone cannot replace the independently bound payment or selected pair',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = await new Bounded().quoteUserSend(ctx), strategy = new Bounded();
    for (const changes of [
      { amount: '6' }, { address: C }, { toAddress: C }, { tokenStandard: OTHER_ASSET },
      { height: 8 }, { previousHash: H2 }, { chainIdentifier: 73405 },
      { momentumAcknowledged: { hash: H1, height: 101 } },
      { data: Buffer.alloc(32, 7).toString('base64') },
      { fusedPlasma: 21000 }, { difficulty: 1 },
    ]) {
      const value = hashed(ctx, undefined, changes);
      validateHash(value); // Correct hash of the WRONG declared subject/selection.
      await assert.rejects(strategy.bindHashedUserSend(ctx, quote, value), policyError);
    }
  });

test('Unsigned UserSend hash and price binding preserves original fields through admitted current advances',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = await new Bounded().quoteUserSend(ctx), value = hashed(ctx);
    const original = await acceptsHash(ctx, quote, value);
    for (const options of [
      { height: 101, hash: H1, fusion: 1050, work: 1100 },
      { height: 102, hash: H2, fusion: 1210, work: 1210 },
    ]) assert.deepEqual(await acceptsHash(context(options), copy(quote), copy(value)), original);
    for (const options of [
      { height: 103, hash: H2 }, { height: 101, hash: H },
      { height: 101, hash: H1, fusion: 1211 }, { available: 25409 },
    ]) await assert.rejects(new Bounded().bindHashedUserSend(context(options), quote, value), policyError);
    for (const mutate of [
      c => { c.policy.maxPriceChangePercent = 11; }, c => { c.policy.maxMomentumAdvances = 3; },
      c => { c.runtimeContextDigest = 'sha256:' + 'c'.repeat(64); },
    ]) {
      const current = copy(ctx); mutate(current);
      await assert.rejects(new Bounded().bindHashedUserSend(current, quote, value), policyError);
    }
  });

test('Unsigned UserSend hash binding keeps hybrid selection separate from fusion-only target and work proof',
  { timeout: 5000 }, async () => {
    const ctx = context({ base: 100, available: 1000, maxFused: 50, maxDifficulty: 200000 });
    const quote = await new Bounded().quoteUserSend(ctx), pair = { fusedPlasma: 50, difficulty: 108000 };
    const value = hashed(ctx, pair);
    const result = await acceptsHash(ctx, quote, value);
    assert.equal(result.accountBlock.nonce, '0102030405060708');
    assert.equal(result.workValidation, 'NOT_PERFORMED'); // Arbitrary fixture nonce, no PoW executed.
    const current = context({ base: 100, available: 50, maxFused: 50, maxDifficulty: 200000,
      height: 102, hash: H2, fusion: 1210, work: 1210 });
    assert.equal(current.observation.endpointObservations[0].rpcObservation.requiredFusedPlasma, 121);
    await acceptsHash(current, quote, value);
    const wrong = hashed(ctx, { fusedPlasma: 121, difficulty: 108000 });
    validateHash(wrong);
    await assert.rejects(new Bounded().bindHashedUserSend(current, quote, wrong), policyError);
  });

test('Unsigned UserSend hash encoding preserves safe uint64 and uint256 boundaries without coercion',
  { timeout: 5000 }, async () => {
    const ctx = context(), max = Number.MAX_SAFE_INTEGER;
    const value = hashed(ctx, { fusedPlasma: max, difficulty: max }, {
      chainIdentifier: max, height: max, previousHash: H2,
      momentumAcknowledged: { hash: H1, height: max }, amount: ((1n << 255n) - 1n).toString(),
      nonce: 'ffffffffffffffff',
    });
    assert.equal(validateHash(value).computedHash, oracleHash(value));
    assert.equal(oraclePreimage(value).length, 306);
    for (const [key, values] of [
      ['height', [0, -0, -1, 1.5, max + 1, 1n]],
      ['fusedPlasma', [-0, -1, max + 1, '0', 0n]],
      ['difficulty', [-0, -1, Infinity, NaN, 0n]],
      ['amount', ['0', '05', '-1', (1n << 255n).toString()]],
    ]) for (const change of values) assert.throws(() => validateHash({ ...value, [key]: change }), bindingError);
  });

test('Unsigned UserSend hash excludes public key but refuses signatures without claiming key or work validity',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = await new Bounded().quoteUserSend(ctx), value = hashed(ctx);
    const original = await acceptsHash(ctx, quote, value);
    for (const publicKey of [Buffer.alloc(32).toString('base64'), Buffer.alloc(32, 9).toString('base64')]) {
      const altered = { ...value, publicKey };
      assert.equal(oracleHash(altered), value.hash);
      const result = await acceptsHash(ctx, quote, altered);
      assert.equal(result.computedHash, original.computedHash);
      assert.notEqual(result.fieldDigest, original.fieldDigest);
      assert.equal(result.keyAddressBinding, 'NOT_PERFORMED');
    }
    for (const signature of ['AA==', Buffer.alloc(64).toString('base64')])
      assert.throws(() => validateHash({ ...value, signature }), bindingError);
    for (const hash of [ZERO, value.hash.toUpperCase(), value.hash.slice(1), null])
      assert.throws(() => validateHash({ ...value, hash }), bindingError);
  });

test('Unsigned UserSend hash cores reuse closed address validation and require canonical ZTS checksum',
  { timeout: 5000 }, async () => {
    const ctx = context();
    const decoded = cores({ address: A, toAddress: B, tokenStandard: ASSET });
    assert.deepEqual(decoded.address, [0, ...Array(19).fill(17)]);
    assert.deepEqual(decoded.toAddress, [0, ...Array(19).fill(34)]);
    assert.equal(decoded.tokenStandard.length, 10); frozen(decoded);
    const value = hashed(ctx);
    for (const tokenStandard of [
      ASSET.toUpperCase(), ASSET.slice(0, -1) + (ASSET.endsWith('q') ? 'p' : 'q'),
      'x'.repeat(26), ASSET + 'q', ASSET.slice(1),
    ]) {
      assert.throws(() => cores({ address: A, toAddress: B, tokenStandard }), coreError);
      snapshotFields({ ...value, tokenStandard }); // Old lexical field-only grammar remains unchanged.
      assert.throws(() => validateHash({ ...value, tokenStandard }), bindingError);
    }
    for (const tokenStandard of [ASSET, OTHER_ASSET]) {
      const candidate = hashed(ctx, undefined, { tokenStandard });
      assert.equal(validateHash(candidate).computedHash, oracleHash(candidate));
    }
    assert.throws(() => cores({ address: A.toUpperCase(), toAddress: B, tokenStandard: ASSET }), coreError);
    assert.throws(() => cores({ address: A, toAddress: B, tokenStandard: ASSET }, undefined), coreError);
  });

test('Unsigned UserSend hash rejects hostile data descriptors proxies and hooks before native hashing',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = await new Bounded().quoteUserSend(ctx), value = hashed(ctx);
    let touches = 0;
    const trip = () => { touches++; throw new Error('UNREACHED_INPUT_HOOK'); };
    const traps = { get: trip, getPrototypeOf: trip, ownKeys: trip, getOwnPropertyDescriptor: trip };
    for (const field of Object.keys(value)) {
      const bad = { ...value }; Object.defineProperty(bad, field, { enumerable: true, get: trip });
      assert.throws(() => validateHash(bad), bindingError);
      await assert.rejects(new Bounded().bindHashedUserSend(ctx, quote, bad), policyError);
    }
    const nested = copy(value); Object.defineProperty(nested.momentumAcknowledged, 'hash', { enumerable: true, get: trip });
    assert.throws(() => validateHash(nested), bindingError);
    const revoked = Proxy.revocable({}, traps); revoked.revoke();
    for (const bad of [new Proxy(value, traps), revoked.proxy, { ...value, toJSON: trip },
      { ...value, amount: { toString: trip, valueOf: trip } }]) assert.throws(() => validateHash(bad), bindingError);
    const raw = { address: A, toAddress: B, tokenStandard: ASSET };
    for (const field of Object.keys(raw)) {
      const bad = { ...raw }; Object.defineProperty(bad, field, { enumerable: true, get: trip });
      assert.throws(() => cores(bad), coreError);
    }
    assert.throws(() => cores(new Proxy(raw, traps)), coreError);
    assert.equal(touches, 0);
  });

test('Unsigned UserSend hash consumer keeps exact arity phases receipt separation and no-authority labels',
  { timeout: 5000 }, async () => {
    const ctx = context(), strategy = new Bounded(), quote = await strategy.quoteUserSend(ctx), value = hashed(ctx);
    const bound = await acceptsHash(ctx, quote, value);
    for (const phase of ['SIGNED', 'UNKNOWN', 'ACKNOWLEDGED', 'VALIDATED', 'EXPIRED', undefined])
      await assert.rejects(strategy.bindHashedUserSend({ ...ctx, phase }, quote, value), policyError);
    await assert.rejects(strategy.bindHashedUserSend(ctx, quote), policyError);
    await assert.rejects(strategy.bindHashedUserSend(ctx, quote, value, undefined), policyError);
    assert.throws(() => validateHash(value, undefined), bindingError);
    assert.throws(() => validateHash(), bindingError);
    await assert.rejects(strategy.bindHashedUserSend(ctx, bound, value), policyError);
    await assert.rejects(strategy.bindHashedUserSend(ctx, quote, bound), policyError);
    await assert.rejects(strategy.bindHashedUserSend({ ...ctx, subjectDigest: quote.subjectDigest }, quote, value), policyError);
    assert.equal(bound.authority, 'NONE'); assert.equal(bound.afterSigningAction, 'NONE');
    const signedBytes = Buffer.from([0, 1, 2, 3]), saved = Buffer.from(signedBytes);
    await assert.rejects(strategy.bindHashedUserSend(ctx, quote, value, signedBytes), policyError);
    assert.deepEqual(signedBytes, saved);
  });

test('Unsigned UserSend draft to hash consumer uses detached declared fields without work or wallet callbacks',
  { timeout: 5000 }, async () => {
    const ctx = context(), strategy = new Bounded(), quote = await strategy.quoteUserSend(ctx);
    const draft = await strategy.createUnsignedUserSendDraft(ctx, quote), saved = JSON.stringify(draft);
    const declared = { ...copy(draft.accountBlock), nonce: '0807060504030201' };
    declared.hash = oracleHash(declared); // Independent declared-field hash, NOT SDK/PoW preparation.
    let touches = 0;
    const trip = () => { touches++; throw new Error('UNREACHED_CALLBACK'); };
    for (const name of ['prepareUnsigned', 'sign', 'publish', 'bindPreparedUserSend'])
      Object.defineProperty(strategy, name, { enumerable: true, get: trip });
    const result = await strategy.bindHashedUserSend(ctx, quote, declared), frozenResult = JSON.stringify(result);
    assert.equal(result.computedHash, declared.hash); assert.equal(result.subjectDigest, draft.subjectDigest);
    assert.deepEqual(result.selection, draft.selection); frozen(result);
    assert.equal(JSON.stringify(draft), saved);
    declared.nonce = '0000000000000000'; declared.amount = '6';
    assert.equal(JSON.stringify(result), frozenResult);
    assert.equal(touches, 0); assert.equal(result.workValidation, 'NOT_PERFORMED');
    assert.equal(result.keyAddressBinding, 'NOT_PERFORMED');
  });
