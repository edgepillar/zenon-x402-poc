import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

// Declared DATA assembly only; no SDK/account-state preparation, nonce/key
// generation, Ed25519, signing, transport owner or live operation is used.
assert.equal(process.argv.length, 2);
const pins = [
  ["../src/zenon/transaction-planner.js", 20374, "4ef2c72a44d5f0f5ce918172a6ff30b13b693fa173bc74cb56565f5402417c2c"],
  ["../src/zenon/bounded-dynamic-plasma-strategy.js", 15729, "7b82560bdeb25e573912090a2fe8de7b45912500a7a7c4434fe06dcf94e06d62"],
  ["../src/canonical.js", 967, "0d55ddf1727cafb0dcd46df2922305568615552a4d2ae34a5c30e90b9d8d998c"],
  ["../src/x402-wire.js", 39886, "5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56"],
  ["../src/zenon/dynamic-plasma-required-fused-policy-adapter.js", 12024, "e2b693d4df9065d44ba590f4d0c8dffeb8e55187668eedfa396b4026c9905c3e"],
  ["../src/zenon/dynamic-plasma-observation-collector.js", 35157, "d614506b0054a87fe553cc79812b7e5355bea924bd3654902026ece58e796eb8"],
  ["../src/zenon/dynamic-plasma-observation-normalizer.js", 28398, "2c3f7d42ded21a5513ff26c23a00a35a53aa334f053d10930f1571a020286897"],
  ["../src/zenon/dynamic-plasma-json-rpc-read-transport.js", 10832, "fd03b2ad87d16660aa61d3961c163d724d5f89cd6d4bb9c4391d739566d5e5ca"],
  ["../src/zenon/bounded-json-rpc-read-core.js", 20906, "5572d24175455c6b3a9924688d601d31585454ce62dac9eb27151d2a65c83fcd"],
  ["../src/zenon/dynamic-plasma-price-policy.js", 14957, "41e2e2044597cfa69c5adca292bcd762a189076be1cd939bec10798d7e35c52b"],
  ["../src/zenon/dynamic-plasma-compatibility.js", 7732, "b3989ce15e5f2e9d07b0ed035fe96bcce9f22cac93f5e497fdca5c37bf7618dd"],
  ["../src/zenon/dynamic-plasma-required-fused-quote.js", 5416, "f5e10ff2dbfff3b6b63d87f0abadd0bb52b5d6b8fe0ead6a55fc5ea14207b730"],
  ["../src/zenon/plasma-strategy.js", 974, "1c597d4e169ba8a5e6d2b7852c4ffa3a8ec9b854332fe354b9b013c36ebae093"],
  ["../package.json", 1413, "8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"],
  ["../test/dynamic-plasma-price-policy.test.js", 28827, "ab6591d268744f611bd5f04f3c199ee53dcf45d871e0b89ac49c57f4981039b5"],
  ["../qualification/dynamic-plasma-price-policy-frontier-binding.behavior.draft.mjs", 8745, "d7f672ee4464bd002e893e231dec5acc85785db2407f7df25fa601d74f972409"],
  ["../qualification/dynamic-plasma-required-fused-policy-adapter.behavior.draft.mjs", 17942, "8f641945d9f699579a2440a7c6f90e16c4d1712e0e042e9135f0468a8db514f1"],
  ["../qualification/dynamic-plasma-four-field-strategy.behavior.draft.mjs", 13760, "7d8e8a975aab82f54889d1a9544a25f2a73ce958cd369d4ee76c5c6021787621"],
  ["../qualification/dynamic-plasma-request-bound-policy.behavior.draft.mjs", 26305, "84b6490bfb9a6c5c77bc783c11f08b95d26134b0c0939b2a5c064da8e51a3861"],
  ["../qualification/dynamic-plasma-user-send-policy.behavior.draft.mjs", 27617, "b28eea5492774c01efc564335ce841177e84eafeb90581a546b0cc20afa81fb0"],
  ["../qualification/dynamic-plasma-prepared-user-send-fields.behavior.draft.mjs", 23476, "895e79b69ffa68efb4d71bcf0f1168769ec5578a321b65b499ecee520b8d763e"],
  ["../qualification/dynamic-plasma-user-send-draft.behavior.draft.mjs", 23733, "ba36fe63ab0455d3b38e7f5d86b870cc948b0ba711449277ec123bbd2831c7f7"],
  ["../test-support/phase2a-account-block-preimage.js", 7724, "dde02531faaf3c45c5ab9760beba84fe56664f923c1d61fa64b077682d97dc0e"],
  ["../qualification/dynamic-plasma-user-send-hash.behavior.draft.mjs", 28034, "84183ec31555643cb997c85efa8eea8756cb6fc27e3ffce0dbe1e4a706fac039"],
  ["../src/zenon/dynamic-plasma-user-send-work-binding.js", 4522, "218b4391c97e4adde905415e20ec0e2015fca98643db85b6efd682aa3b5c5681"],
  ["../qualification/dynamic-plasma-user-send-work.behavior.draft.mjs", 24164, "fc1879600594882341cea31699e90b80fcd3d2c480305ac49e0b1528d609af77"],
  ["../src/zenon/dynamic-plasma-user-send-key-binding.js", 4237, "37ad7e74b038801297e4bffb0cb8ba92cbd79009ed32c4ae5b134fe2cb154be2"],
  ["../qualification/dynamic-plasma-user-send-key.behavior.draft.mjs", 25162, "91205bb871678f1e24dfa123139bba709ec6df8576fde31c445736f696bc42f6"],
  ["../src/zenon/dynamic-plasma-user-send-assembly.js", 7772, "05012a2a983ceca018674c4d1f63823f3f7ed53b0970a4b4bd486c4278832b04"],
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
// Capture production functions before registering any compatibility cases.
const { assembleZenonUnsignedUserSend: assemble }
  = await import('../src/zenon/dynamic-plasma-user-send-assembly.js');
const { computeZenonUnsignedUserSendHash: computeHash,
  validateZenonUnsignedUserSendHash: validateHash }
  = await import('../src/zenon/transaction-planner.js');
const { BoundedDynamicPlasmaStrategy: Bounded }
  = await import('../src/zenon/bounded-dynamic-plasma-strategy.js');
const { accountBlockHashHex: oracleHash } = await import('../test-support/phase2a-account-block-preimage.js');
const { paymentIntentDigest } = await import('../src/canonical.js');
const { snapshotDynamicPlasmaQuoteRequestContext: requestContext }
  = await import('../src/zenon/dynamic-plasma-observation-normalizer.js');
// Requalify the changed planner graph:82+12+12 original registrations.
// Scenario bodies are byte-identical; only seven source-pin arrays changed.
await import('./dynamic-plasma-user-send-hash.behavior.draft.mjs');
await import('./dynamic-plasma-user-send-work.behavior.draft.mjs');
await import('./dynamic-plasma-user-send-key.behavior.draft.mjs');

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


function material(overrides = {}) {
  return { materialVersion: 1, publicKey: PUBLIC_A, nonce: '0102030405060708', ...overrides };
}
function assemblyError(error) {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, 'zenon_user_send_assembly_input_rejected');
  assert.equal(error.message, error.code);
  assert.equal(error.stack, 'TypeError: ' + error.code);
  assert.equal(Object.hasOwn(error, 'cause'), false);
  return true;
}
function assembled(result, ctx, bytes) {
  assert.equal(result.unsignedAssemblyVersion, 1);
  assert.equal(result.scope, 'DECLARED_UNSIGNED_USER_SEND_ASSEMBLY');
  assert.equal(result.stage, 'UNSIGNED_DECLARED_FIELDS_ONLY');
  assert.equal(result.preparation, 'NOT_PERFORMED');
  assert.equal(result.authority, 'NONE'); assert.equal(result.afterSigningAction, 'NONE');
  assert.equal(result.keyPossession, 'NOT_ESTABLISHED');
  assert.equal(result.signatureValidation, 'NOT_PERFORMED');
  assert.equal(result.chainAuthentication, 'NOT_ESTABLISHED');
  assert.equal(result.accountBlock.signature, '');
  assert.equal(result.accountBlock.nonce, bytes.nonce);
  assert.equal(result.accountBlock.publicKey, bytes.publicKey);
  assert.equal(result.accountBlock.hash, oracleHash(result.accountBlock));
  assert.notEqual(result.accountBlock.hash, ZERO);
  assert.equal(result.quoteRequestContextDigest, ctx.observation.quoteRequestContext.digest);
  assert.equal(result.validation.workBinding.hashPriceBinding.accountBlock, result.accountBlock);
  noAuthority(result.validation); frozen(result);
}

test('unsigned assembly builds a fresh fully checked declared block from original context quote and supplied bytes',
  { timeout: 5000 }, async () => {
    const ctx = keyContext(), quote = await new Bounded().quoteUserSend(ctx), bytes = material();
    const before = copy([ctx, quote, bytes]), result = await assemble(ctx, quote, bytes);
    assembled(result, ctx, bytes);
    assert.equal(Object.keys(result.accountBlock).length, 18);
    fields(result.validation.workBinding.hashPriceBinding.selection, { fusedPlasma: 25410, difficulty: 0 });
    assert.equal(result.accountBlock.toAddress, ctx.accepted.payTo);
    assert.equal(result.accountBlock.amount, ctx.accepted.amount);
    assert.equal(result.accountBlock.tokenStandard, ctx.accepted.asset);
    assert.equal(result.accountBlock.address, ctx.payerAddress);
    assert.equal(result.accountBlock.data, ctx.subject.data);
    assert.deepEqual([ctx, quote, bytes], before);
    assert.equal(Object.isFrozen(ctx), false); assert.equal(Object.isFrozen(bytes), false);
  });

test('shared unsigned hash computation materializes the exact306-byte recipe without rewriting caller fields',
  { timeout: 5000 }, async () => {
    const ctx = keyContext(), quote = await new Bounded().quoteUserSend(ctx);
    const draft = await new Bounded().createUnsignedUserSendDraft(ctx, quote);
    const supplied = { ...copy(draft.accountBlock), publicKey: PUBLIC_A, nonce: material().nonce };
    const before = copy(supplied), hash = computeHash(supplied);
    assert.equal(hash, oracleHash(supplied));
    assert.equal(supplied.hash, ZERO); assert.deepEqual(supplied, before);
    assert.throws(() => validateHash(supplied), bindingError);
    assert.equal(validateHash({ ...supplied, hash }).computedHash, hash);
    assert.equal(computeHash({ ...supplied, hash: '99'.repeat(32) }), hash);
    assert.notEqual(computeHash({ ...supplied, nonce: '0000000000000000' }), hash);
    assert.throws(() => computeHash({ ...supplied, signature: Buffer.alloc(64, 3).toString('base64') }), bindingError);
    assert.throws(() => computeHash(), bindingError);
    assert.throws(() => computeHash(supplied, null), bindingError);
  });

test('unsigned assembly accepts only exact supplied material and never a caller block hash or signature for replacement',
  { timeout: 5000 }, async () => {
    const ctx = keyContext(), quote = await new Bounded().quoteUserSend(ctx);
    for (const bytes of [
      material({ materialVersion: 2 }), material({ publicKey: '' }),
      material({ publicKey: Buffer.alloc(31, 7).toString('base64') }),
      material({ nonce: 'ABCDEF0123456789' }), material({ nonce: '' }),
      material({ hash: ZERO }), material({ signature: '' }),
      material({ operation: 'RETRY' }), material({ approved: true }),
      keyBlock(ctx), null, [], PUBLIC_A,
    ]) await assert.rejects(assemble(ctx, quote, bytes), assemblyError);
    assert.equal((await assemble(ctx, quote, material())).accountBlock.signature, '');
  });

test('unsigned assembly snapshots all context quote and material data before the first await',
  { timeout: 5000 }, async () => {
    const ctx = keyContext(), quote = copy(await new Bounded().quoteUserSend(ctx)), bytes = material();
    const original = copy([ctx, quote, bytes]), pending = assemble(ctx, quote, bytes);
    ctx.subject.amount = '999'; ctx.subject.toAddress = C; ctx.phase = 'SIGNED';
    ctx.observation.endpointObservations[0].rpcObservation.availablePlasma = 0;
    quote.scope = 'CHANGED'; quote.sourceQuote.pricePolicyQuote.selected.fusedPlasma = 0;
    bytes.publicKey = PUBLIC_B; bytes.nonce = 'ffffffffffffffff';
    const result = await pending;
    assembled(result, original[0], original[2]);
    assert.equal(result.accountBlock.amount, original[0].subject.amount);
    assert.equal(result.accountBlock.toAddress, original[0].subject.toAddress);
    assert.equal(result.accountBlock.momentumAcknowledged.hash, H);
  });

test('unsigned assembly refuses a supplied key that does not match the independently selected payer',
  { timeout: 5000 }, async () => {
    const ctx = keyContext(), quote = await new Bounded().quoteUserSend(ctx);
    const before = copy([ctx, quote]);
    await assert.rejects(assemble(ctx, quote, material({ publicKey: PUBLIC_B })), assemblyError);
    assert.deepEqual([ctx, quote], before);
    assembled(await assemble(ctx, quote, material()), ctx, material());
  });

test('unsigned assembly preserves original headroom and acknowledgement through admitted declared price advances',
  { timeout: 5000 }, async () => {
    const ctx = keyContext(), quote = await new Bounded().quoteUserSend(ctx), current = copy(ctx);
    for (const endpoint of current.observation.endpointObservations) {
      for (const frontier of [endpoint.beforeFrontier, endpoint.afterFrontier]) {
        frontier.height += 2; frontier.hash = H2;
        frontier.nextFusionPrice = 1210; frontier.nextWorkPrice = 1210;
      }
      endpoint.rpcObservation.requiredFusedPlasma = 25410;
    }
    const result = await assemble(current, quote, material());
    assembled(result, current, material());
    assert.equal(result.accountBlock.fusedPlasma, 25410);
    assert.equal(result.accountBlock.difficulty, 0);
    assert.equal(result.accountBlock.momentumAcknowledged.hash, H);
    assert.equal(result.accountBlock.momentumAcknowledged.height, 100);
  });

test('unsigned assembly refuses stale exhausted and misbound inputs without refreshing the original quote',
  { timeout: 5000 }, async () => {
    const ctx = keyContext(), quote = await new Bounded().quoteUserSend(ctx), originalQuote = copy(quote);
    for (const kind of ['age', 'price', 'pool', 'resource', 'recipient']) {
      const current = copy(ctx);
      if (kind === 'resource') current.paymentRequired.resource.url = 'https://resource.invalid/other';
      else if (kind === 'recipient') current.subject.toAddress = C;
      else for (const endpoint of current.observation.endpointObservations) {
        for (const frontier of [endpoint.beforeFrontier, endpoint.afterFrontier]) {
          frontier.height += kind === 'age' ? 3 : 2; frontier.hash = H2;
          if (kind === 'price') { frontier.nextFusionPrice = 1211; frontier.nextWorkPrice = 1211; }
        }
        if (kind === 'price') endpoint.rpcObservation.requiredFusedPlasma = 25431;
        if (kind === 'pool') endpoint.rpcObservation.availablePlasma = 25000;
      }
      await assert.rejects(assemble(current, quote, material()), assemblyError);
    }
    assert.deepEqual(quote, originalQuote);
  });

test('unsigned assembly never returns an accepted hybrid block with hash-correct but invalid supplied work',
  { timeout: 5000 }, async () => {
    const ctx = keyContext({ available: 10000, maxFused: 10000, maxDifficulty: 40000000 });
    const strategy = new Bounded(), quote = await strategy.quoteUserSend(ctx);
    const draft = await strategy.createUnsignedUserSendDraft(ctx, quote);
    const candidate = { ...draft.accountBlock, publicKey: PUBLIC_A, nonce: material().nonce };
    candidate.hash = computeHash(candidate);
    assert.equal(validateHash(candidate).computedHash, oracleHash(candidate));
    assert.ok(candidate.difficulty > 0);
    const before = copy([ctx, quote]);
    await assert.rejects(assemble(ctx, quote, material()), assemblyError);
    assert.deepEqual([ctx, quote], before);
  });

test('unsigned assembly retains the existing normalizer maximum spork-list shape within bounded snapshots',
  { timeout: 5000 }, async () => {
    const ctx = keyContext();
    for (const endpoint of ctx.observation.endpointObservations) {
      const list = endpoint.sporks.list;
      for (let index = 2; index < 1024; index += 1) list.push({
        id: index.toString(16).padStart(64, '0'), name: 'synthetic',
        activated: false, enforcementHeight: 0,
      });
      endpoint.sporks.count = list.length;
    }
    const quote = await new Bounded().quoteUserSend(ctx), result = await assemble(ctx, quote, material());
    assembled(result, ctx, material());
    assert.equal(result.accountBlock.fusedPlasma, 25410);
  });

test('unsigned assembly rejects hostile descriptors proxies cycles and excessive data without invoking hooks',
  { timeout: 5000 }, async () => {
    const ctx = keyContext(), quote = await new Bounded().quoteUserSend(ctx);
    let hooks = 0;
    const hook = () => { hooks += 1; throw new Error('HOOK'); };
    const badContext = copy(ctx);
    Object.defineProperty(badContext.paymentRequired.resource, 'description', { get: hook, enumerable: true });
    await assert.rejects(assemble(badContext, quote, material()), assemblyError);
    const badMaterial = material();
    Object.defineProperty(badMaterial, 'publicKey', { get: hook, enumerable: true });
    await assert.rejects(assemble(ctx, quote, badMaterial), assemblyError);
    const badQuote = copy(quote);
    Object.defineProperty(badQuote, 'sourceQuote', { get: hook, enumerable: true });
    await assert.rejects(assemble(ctx, badQuote, material()), assemblyError);
    const proxy = new Proxy(ctx, { get: hook, getPrototypeOf: hook, ownKeys: hook, getOwnPropertyDescriptor: hook });
    await assert.rejects(assemble(proxy, quote, material()), assemblyError);
    const cycle = copy(ctx); cycle.extra = cycle;
    await assert.rejects(assemble(cycle, quote, material()), assemblyError);
    const largeArray = copy(ctx); largeArray.paymentRequired.resource.tags = Array(1025).fill('synthetic');
    await assert.rejects(assemble(largeArray, quote, material()), assemblyError);
    const longString = copy(ctx); longString.paymentRequired.resource.description = 'x'.repeat(8193);
    await assert.rejects(assemble(longString, quote, material()), assemblyError);
    const callable = copy(ctx); callable.paymentRequired.resource.toJSON = hook;
    await assert.rejects(assemble(callable, quote, material()), assemblyError);
    const unsafe = copy(ctx); unsafe.policy.maxDifficulty = -0;
    await assert.rejects(assemble(unsafe, quote, material()), assemblyError);
    assert.equal(hooks, 0);
  });

test('unsigned assembly uses captured pure stages rather than overridden preparer or wallet callbacks',
  { timeout: 5000 }, async () => {
    const ctx = keyContext(), quote = await new Bounded().quoteUserSend(ctx);
    const descriptor = Object.getOwnPropertyDescriptor(Bounded.prototype, 'createUnsignedUserSendDraft');
    let callbacks = 0;
    Object.defineProperty(Bounded.prototype, 'createUnsignedUserSendDraft', {
      ...descriptor, value() { callbacks += 1; throw new Error('OVERRIDE'); },
    });
    try { assembled(await assemble(ctx, quote, material()), ctx, material()); }
    finally { Object.defineProperty(Bounded.prototype, 'createUnsignedUserSendDraft', descriptor); }
    assert.equal(callbacks, 0);
  });

test('unsigned assembly keeps arity phase immutable result and default-off non-preparation boundaries',
  { timeout: 5000 }, async () => {
    const ctx = keyContext(), quote = await new Bounded().quoteUserSend(ctx);
    await assert.rejects(assemble(ctx, quote), assemblyError);
    await assert.rejects(assemble(ctx, quote, material(), null), assemblyError);
    for (const phase of ['SIGNED', 'UNKNOWN', 'ACKNOWLEDGED', 'VALIDATED']) {
      await assert.rejects(assemble({ ...ctx, phase }, quote, material()), assemblyError);
    }
    const result = await assemble(ctx, quote, material());
    assembled(result, ctx, material());
    assert.deepEqual(copy(result), result);
    assert.throws(() => { result.accountBlock.nonce = ''; }, TypeError);
    assert.throws(() => { result.validation.authority = 'READY'; }, TypeError);
    const source = sources.get('../src/zenon/dynamic-plasma-user-send-assembly.js');
    assert.equal((source.match(/^export /gm) ?? []).length, 1);
    assert.match(source, /snapshotDynamicPlasmaObservationCollectionInput/);
    assert.match(source, /candidate\.hash = COMPUTE_HASH\(candidate\)/);
    assert.match(source, /await BIND_KEY\(stableContext, stableQuote, candidate\)/);
    assert.doesNotMatch(source, /node:(?:fs|https?|tls|dns|child_process|worker_threads)|generateKeyPair|randomBytes|prepareBlock|publishRawTransaction|mnemonic|keystore|fetch\s*\(/);
  });
