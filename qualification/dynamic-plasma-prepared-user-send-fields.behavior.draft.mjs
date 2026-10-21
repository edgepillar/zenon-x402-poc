import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

// Synthetic declared unsigned JSON field consistency only. No SDK preparation,
// hash/work/key verification, signing, payment, network, SQL or live assurance.
assert.equal(process.versions.node, '24.19.0');
assert.equal(process.argv.length, 2);
const pins = [
  ["../src/zenon/transaction-planner.js", 16738, "bbf51fa2fc75df7f69973a89ae275ec709622942444eb30cea0cc9924afbf143"],
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
  ["./dynamic-plasma-price-policy-frontier-binding.behavior.draft.mjs", 8745, "d7f672ee4464bd002e893e231dec5acc85785db2407f7df25fa601d74f972409"],
  ["./dynamic-plasma-required-fused-policy-adapter.behavior.draft.mjs", 17942, "8f641945d9f699579a2440a7c6f90e16c4d1712e0e042e9135f0468a8db514f1"],
  ["./dynamic-plasma-four-field-strategy.behavior.draft.mjs", 13760, "7d8e8a975aab82f54889d1a9544a25f2a73ce958cd369d4ee76c5c6021787621"],
  ["./dynamic-plasma-request-bound-policy.behavior.draft.mjs", 26305, "84b6490bfb9a6c5c77bc783c11f08b95d26134b0c0939b2a5c064da8e51a3861"],
  ["./dynamic-plasma-user-send-policy.behavior.draft.mjs", 27617, "d5d3b836530d3d47d230577f81a377c337550e61e6d5c724dba11a28928297fa"],
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
//54 retained registrations requalified only because their production graph changed.
// Prior scenario bodies are unchanged; four source-pin guard sections refreshed.
await import('./dynamic-plasma-user-send-policy.behavior.draft.mjs');
const { BoundedDynamicPlasmaStrategy: Bounded } = await import('../src/zenon/bounded-dynamic-plasma-strategy.js');
const { snapshotZenonUnsignedUserSendFields: snapshotFields,
  snapshotZenonUserSendPolicyBinding: snapshot, ZenonTransactionPlanner: Planner }
  = await import('../src/zenon/transaction-planner.js');
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
async function refuses(ctx, quote, value) {
  await assert.rejects(new Bounded().bindPreparedUserSend(ctx, quote, value), policyError);
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

test('Prepared UserSend binds the actual detached unsigned fields to intent and original price selection',
  { timeout: 5000 }, async () => {
    const ctx = context(), strategy = new Bounded(), quote = await strategy.quoteUserSend(ctx);
    const value = block(ctx), saved = JSON.stringify(value), result = await strategy.bindPreparedUserSend(ctx, quote, value);
    assert.deepEqual(Object.keys(result), [
      'preparedFieldBindingVersion', 'scope', 'accountBlock', 'selection', 'subjectDigest',
      'intentDigest', 'fieldDigest', 'chainAuthentication', 'hashAndWorkValidation',
      'keyAddressBinding', 'authority', 'afterSigningAction',
    ]);
    assert.equal(result.preparedFieldBindingVersion, 1);
    assert.equal(result.scope, 'DECLARED_UNSIGNED_USER_SEND_FIELD_BINDING');
    assert.deepEqual(result.accountBlock, value); assert.notEqual(result.accountBlock, value);
    assert.notEqual(result.accountBlock.momentumAcknowledged, value.momentumAcknowledged);
    assert.equal(Object.keys(result.accountBlock).length, 18);
    fields(result.selection, { fusedPlasma: 25410, difficulty: 0 });
    assert.equal(result.subjectDigest, snapshot(bindingInput(ctx)).subjectDigest);
    assert.equal(result.intentDigest, quote.intentDigest);
    assert.equal(result.fieldDigest, committedFields(value));
    assert.equal(result.chainAuthentication, 'NOT_ESTABLISHED');
    assert.equal(result.hashAndWorkValidation, 'NOT_PERFORMED');
    assert.equal(result.keyAddressBinding, 'NOT_PERFORMED');
    assert.equal(result.authority, 'NONE'); assert.equal(result.afterSigningAction, 'NONE');
    frozen(result); assert.equal(JSON.stringify(value), saved);
    assert.deepEqual(await strategy.bindPreparedUserSend(ctx, copy(quote), copy(value)), result);
  });

test('Prepared UserSend refuses changed payment and account fields despite a separately valid pair',
  { timeout: 5000 }, async () => {
    const ctx = context(), strategy = new Bounded(), quote = await strategy.quoteUserSend(ctx);
    const pair = { fusedPlasma: 25410, difficulty: 0 };
    for (const mutate of [
      b => { b.toAddress = C; }, b => { b.address = C; }, b => { b.amount = '6'; },
      b => { b.tokenStandard = OTHER_ASSET; }, b => { b.chainIdentifier = 73405; },
      b => { b.height = 8; }, b => { b.previousHash = H1; },
      b => { b.momentumAcknowledged = { hash: H1, height: 101 }; },
      b => { b.data = Buffer.alloc(32, 7).toString('base64'); },
    ]) {
      const value = block(ctx); mutate(value);
      // The old validator legitimately checks ONLY its separate pair, not value.
      fields(await strategy.validateUserSend(ctx, quote, pair), pair);
      snapshotFields(value); // Each is a syntactically valid declared snapshot.
      await refuses(ctx, quote, value);
    }
    const changed = copy(ctx);
    changed.paymentRequired.resource.url = 'https://resource.invalid/other';
    refreshIntent(changed);
    await refuses(changed, quote, block(ctx));
    await refuses(ctx, quote, { ...block(ctx), fromBlockHash: H1 });
  });

test('Prepared UserSend validates actual Plasma fields and never substitutes a fusion-only total for hybrid',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = await new Bounded().quoteUserSend(ctx);
    for (const [key, values] of [
      ['fusedPlasma', [21000, 25409, 25411, '25410', -0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, 25410n]],
      ['difficulty', [1, '0', -0, -1, NaN, Infinity, 0n]],
    ]) for (const value of values) await refuses(ctx, quote, { ...block(ctx), [key]: value });
    const hybrid = context({ base: 100, available: 1000, maxFused: 50, maxDifficulty: 200000 });
    const q = await new Bounded().quoteUserSend(hybrid), pair = { fusedPlasma: 50, difficulty: 108000 };
    const current = context({ base: 100, available: 50, maxFused: 50, maxDifficulty: 200000,
      height: 102, hash: H2, fusion: 1210, work: 1210 });
    fields((await new Bounded().bindPreparedUserSend(current, q, block(hybrid, pair))).selection, pair);
    assert.equal(current.observation.endpointObservations[0].rpcObservation.requiredFusedPlasma, 121);
    await refuses(current, q, block(hybrid, { fusedPlasma: 121, difficulty: 108000 }));
    await refuses(current, q, block(hybrid, { fusedPlasma: 50, difficulty: 107999 }));
  });

test('Prepared UserSend enforces unsigned exact JSON syntax without claiming work or public-key verification',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = await new Bounded().quoteUserSend(ctx);
    for (const [key, values] of [
      ['signature', ['AA==', Buffer.alloc(64).toString('base64'), null, undefined]],
      ['hash', ['A'.repeat(64), '0'.repeat(63), null]],
      ['nonce', ['A'.repeat(16), '0'.repeat(15), 0]],
      ['publicKey', ['AA==', 'A'.repeat(42) + 'B=', null]],
    ]) for (const value of values) {
      const bad = { ...block(ctx), [key]: value };
      assert.throws(() => snapshotFields(bad), bindingError); await refuses(ctx, quote, bad);
    }
    for (const publicKey of ['', Buffer.alloc(32).toString('base64'), Buffer.alloc(32, 9).toString('base64')]) {
      const value = { ...block(ctx), hash: ZERO, publicKey };
      const result = await new Bounded().bindPreparedUserSend(ctx, quote, value);
      assert.equal(result.accountBlock.hash, ZERO); assert.equal(result.accountBlock.nonce, '0000000000000000');
      assert.equal(result.keyAddressBinding, 'NOT_PERFORMED');
      assert.equal(result.hashAndWorkValidation, 'NOT_PERFORMED');
    }
    for (const value of [[], Object.create(block(ctx)), { ...block(ctx), extra: true }]) {
      assert.throws(() => snapshotFields(value), bindingError); await refuses(ctx, quote, value);
    }
    const first = { ...block(ctx), height: 1, previousHash: ZERO };
    snapshotFields(first); await refuses(ctx, quote, first); // Well typed, different subject.
  });

test('Prepared UserSend retains original acknowledgement while rechecking current price resource and age bounds',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = await new Bounded().quoteUserSend(ctx), value = block(ctx);
    const original = await new Bounded().bindPreparedUserSend(ctx, quote, value);
    for (const options of [
      { height: 101, hash: H1, fusion: 1050, work: 1100 },
      { height: 102, hash: H2, fusion: 1210, work: 1210 },
    ]) {
      const result = await new Bounded().bindPreparedUserSend(context(options), quote, value);
      assert.deepEqual(result, original); assert.equal(result.accountBlock.momentumAcknowledged.height, 100);
    }
    for (const options of [
      { height: 103, hash: H2 }, { height: 101, hash: H },
      { height: 101, hash: H1, fusion: 1211 }, { available: 25409 },
    ]) await refuses(context(options), quote, value);
    for (const mutate of [
      c => { c.runtimeContextDigest = 'sha256:' + 'c'.repeat(64); },
      c => { c.policy.maxMomentumAdvances = 3; },
      c => { c.policy.maxPriceChangePercent = 11; },
    ]) { const changed = copy(ctx); mutate(changed); await refuses(changed, quote, value); }
    const q = copy(quote); q.sourceQuote.sourceObservation.rpcObservation.requiredFusedPlasma++;
    await refuses(ctx, q, value);
  });

test('Prepared UserSend commits all reported fields and detaches snapshots without authenticating preparation',
  { timeout: 5000 }, async () => {
    const ctx = context(), strategy = new Bounded(), quote = await strategy.quoteUserSend(ctx), value = block(ctx);
    const original = await strategy.bindPreparedUserSend(ctx, quote, value), saved = JSON.stringify(original);
    assert.equal(original.fieldDigest, committedFields(value));
    for (const mutate of [
      b => { b.hash = H2; }, b => { b.nonce = '0100000000000000'; },
      b => { b.publicKey = Buffer.alloc(32, 9).toString('base64'); },
    ]) {
      const different = copy(value); mutate(different);
      const result = await strategy.bindPreparedUserSend(ctx, quote, different);
      assert.equal(result.subjectDigest, original.subjectDigest); assert.deepEqual(result.selection, original.selection);
      assert.notEqual(result.fieldDigest, original.fieldDigest); assert.equal(result.fieldDigest, committedFields(different));
      assert.equal(result.authority, 'NONE'); // Another coherent DTO is not another permission.
    }
    value.amount = '7'; value.momentumAcknowledged.height = 101; value.fusedPlasma = 1;
    await refuses(ctx, quote, value); assert.equal(JSON.stringify(original), saved);
    assert.throws(() => { original.accountBlock.amount = '7'; }, TypeError);
    assert.throws(() => { original.accountBlock.momentumAcknowledged.height = 101; }, TypeError);
  });

test('Prepared UserSend refuses hostile descriptors proxies and coercion before invoking any hook',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = await new Bounded().quoteUserSend(ctx);
    let touches = 0;
    const trip = () => { touches++; throw new Error('UNREACHED_INPUT_HOOK'); };
    const traps = { get: trip, getPrototypeOf: trip, ownKeys: trip, getOwnPropertyDescriptor: trip };
    for (const nested of [false, true]) for (const field of Object.keys(nested ? ctx.subject.momentumAcknowledged : block(ctx))) {
      const bad = block(ctx), target = nested ? bad.momentumAcknowledged : bad;
      Object.defineProperty(target, field, { enumerable: true, get: trip });
      assert.throws(() => snapshotFields(bad), bindingError); await refuses(ctx, quote, bad);
    }
    const revoked = Proxy.revocable({}, traps); revoked.revoke();
    for (const bad of [new Proxy(block(ctx), traps), revoked.proxy]) {
      assert.throws(() => snapshotFields(bad), bindingError); await refuses(ctx, quote, bad);
    }
    for (const mutate of [
      b => { b.momentumAcknowledged = new Proxy(b.momentumAcknowledged, traps); },
      b => { b.amount = { toString: trip, valueOf: trip }; },
      b => { b.publicKey = { toString: trip }; }, b => { b.toJSON = trip; },
      b => { b[Symbol.iterator] = trip; }, b => { Object.defineProperty(b, 'hash', { enumerable: false }); },
    ]) {
      const bad = block(ctx); mutate(bad);
      assert.throws(() => snapshotFields(bad), bindingError); await refuses(ctx, quote, bad);
    }
    for (const target of ['context', 'quote']) {
      await refuses(target === 'context' ? new Proxy(ctx, traps) : ctx,
        target === 'quote' ? new Proxy(quote, traps) : quote, block(ctx));
    }
    assert.equal(touches, 0);
  });

test('Prepared UserSend keeps phase arity receipt and no-authority boundaries with preparation still unimplemented',
  { timeout: 5000 }, async () => {
    const ctx = context(), strategy = new Bounded(), quote = await strategy.quoteUserSend(ctx), value = block(ctx);
    for (const phase of ['SIGNED', 'UNKNOWN', 'ACKNOWLEDGED', 'VALIDATED', 'EXPIRED', undefined])
      await refuses({ ...ctx, phase }, quote, value);
    await assert.rejects(strategy.bindPreparedUserSend(ctx, quote), policyError);
    await assert.rejects(strategy.bindPreparedUserSend(ctx, quote, value, undefined), policyError);
    assert.throws(() => snapshotFields(value, undefined), bindingError);
    assert.throws(() => snapshotFields(), bindingError);
    const dto = await strategy.bindPreparedUserSend(ctx, quote, value);
    await refuses(ctx, dto, value); await refuses(ctx, quote, dto);
    await refuses({ ...ctx, subjectDigest: quote.subjectDigest }, quote, value);
    let signCalls = 0;
    const sign = () => { signCalls++; throw new Error('UNREACHED_SIGNING_HOOK'); };
    const originalBytes = Buffer.from([0, 1, 2, 3]), saved = Buffer.from(originalBytes);
    await refuses({ ...ctx, wallet: { sign }, originalBytes }, quote, value);
    assert.equal(signCalls, 0); assert.deepEqual(originalBytes, saved);
    await assert.rejects(new Planner().prepareUnsigned({}), /must be implemented/);
    assert.equal(dto.authority, 'NONE'); assert.equal(dto.afterSigningAction, 'NONE');
  });
