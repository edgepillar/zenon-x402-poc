import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

// Synthetic declared unsigned draft producer and existing field-consumer checks.
// No SDK preparation, work/hash/key verification, signing or live assurance.
assert.equal(process.versions.node, '24.19.0');
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
  ["./dynamic-plasma-price-policy-frontier-binding.behavior.draft.mjs", 8745, "d7f672ee4464bd002e893e231dec5acc85785db2407f7df25fa601d74f972409"],
  ["./dynamic-plasma-required-fused-policy-adapter.behavior.draft.mjs", 17942, "8f641945d9f699579a2440a7c6f90e16c4d1712e0e042e9135f0468a8db514f1"],
  ["./dynamic-plasma-four-field-strategy.behavior.draft.mjs", 13760, "7d8e8a975aab82f54889d1a9544a25f2a73ce958cd369d4ee76c5c6021787621"],
  ["./dynamic-plasma-request-bound-policy.behavior.draft.mjs", 26305, "84b6490bfb9a6c5c77bc783c11f08b95d26134b0c0939b2a5c064da8e51a3861"],
  ["./dynamic-plasma-user-send-policy.behavior.draft.mjs", 27617, "b28eea5492774c01efc564335ce841177e84eafeb90581a546b0cc20afa81fb0"],
  ["./dynamic-plasma-prepared-user-send-fields.behavior.draft.mjs", 23476, "895e79b69ffa68efb4d71bcf0f1168769ec5578a321b65b499ecee520b8d763e"],
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
//62 retained registrations requalified for the changed strategy source.
// Only five source-pin guard sections changed; prior scenario bodies did not.
await import('./dynamic-plasma-prepared-user-send-fields.behavior.draft.mjs');
const { BoundedDynamicPlasmaStrategy: Bounded } = await import('../src/zenon/bounded-dynamic-plasma-strategy.js');
const { snapshotZenonUnsignedUserSendFields: snapshotFields,
  snapshotZenonUserSendPolicyBinding: snapshot }
  = await import('../src/zenon/transaction-planner.js');
const { paymentIntentDigest } = await import('../src/canonical.js');
const { snapshotDynamicPlasmaQuoteRequestContext: requestContext }
  = await import('../src/zenon/dynamic-plasma-observation-normalizer.js');
const { createDynamicPlasmaRequiredFusedPolicyQuote: createFour,
  selectDynamicPlasmaRequiredFusedPolicyFields: selectFour }
  = await import('../src/zenon/dynamic-plasma-required-fused-policy-adapter.js');

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

test('Unsigned UserSend producer assembles the original selected pair into the exact raw block',
  { timeout: 5000 }, async () => {
    const ctx = context(), strategy = new Bounded(), quote = await strategy.quoteUserSend(ctx);
    const draft = await strategy.createUnsignedUserSendDraft(ctx, quote);
    assert.deepEqual(draft.accountBlock, { ...block(ctx), hash: ZERO });
    assert.equal(Object.keys(draft.accountBlock).length, 18);
    fields(draft.selection, { fusedPlasma: 25410, difficulty: 0 });
    assert.equal(draft.accountBlock.fusedPlasma, draft.selection.fusedPlasma);
    assert.equal(draft.accountBlock.difficulty, draft.selection.difficulty);
    const consumed = await strategy.bindPreparedUserSend(ctx, quote, draft.accountBlock);
    assert.deepEqual(consumed.accountBlock, draft.accountBlock);
    assert.deepEqual(consumed.selection, draft.selection);
    assert.equal(consumed.subjectDigest, draft.subjectDigest);
    assert.equal(consumed.intentDigest, draft.intentDigest);
    assert.equal(consumed.fieldDigest, draft.fieldDigest);
    assert.equal(draft.fieldDigest, committedFields(draft.accountBlock));
    frozen(draft);
  });

test('Unsigned UserSend producer carries hybrid headroom rather than the fusion-only total',
  { timeout: 5000 }, async () => {
    const ctx = context({ base: 100, available: 1000, maxFused: 50, maxDifficulty: 200000 });
    const strategy = new Bounded(), quote = await strategy.quoteUserSend(ctx);
    const pair = { fusedPlasma: 50, difficulty: 108000 };
    const origin = await strategy.createUnsignedUserSendDraft(ctx, quote);
    assert.deepEqual(origin.accountBlock, { ...block(ctx, pair), hash: ZERO });
    const advanced = context({ base: 100, available: 50, maxFused: 50, maxDifficulty: 200000,
      height: 102, hash: H2, fusion: 1210, work: 1210 });
    assert.equal(advanced.observation.endpointObservations[0].rpcObservation.requiredFusedPlasma, 121);
    const later = await strategy.createUnsignedUserSendDraft(advanced, quote);
    assert.deepEqual(later, origin); fields(later.selection, pair);
    assert.notEqual(later.accountBlock.fusedPlasma, 121);
    assert.equal(later.accountBlock.nonce, '0000000000000000');
    assert.equal(later.preparation, 'NOT_PERFORMED');
  });

test('Unsigned UserSend producer retains original acknowledgement and selection without refreshing quotes',
  { timeout: 5000 }, async () => {
    const ctx = context(), strategy = new Bounded(), quote = await strategy.quoteUserSend(ctx);
    const original = await strategy.createUnsignedUserSendDraft(ctx, quote), savedQuote = JSON.stringify(quote);
    for (const options of [
      { height: 101, hash: H1, fusion: 1050, work: 1100 },
      { height: 102, hash: H2, fusion: 1210, work: 1210 },
    ]) {
      const current = context(options);
      const next = await strategy.createUnsignedUserSendDraft(current, copy(quote));
      assert.deepEqual(next, original);
      assert.equal(next.accountBlock.momentumAcknowledged.height, 100);
      assert.equal(next.accountBlock.momentumAcknowledged.hash, H);
      assert.equal(next.accountBlock.previousHash, PREVIOUS);
      assert.equal(next.accountBlock.height, 7);
      assert.equal(next.accountBlock.fusedPlasma, 25410);
    }
    const coherentLaterQuote = copy(quote);
    // Coherent foreign origin cannot be relabeled as this subject's acknowledgement.
    const laterContext = context({ height: 101, hash: H1, fusion: 1050, work: 1100 });
    const binding = snapshot(bindingInput(laterContext));
    const rawContext = {
      requiredFusedPolicyVersion: 1, quoteRequestContextVersion: 1,
      expectedQuoteRequestContext: binding.expectedQuoteRequestContext,
      observation: laterContext.observation, policy: laterContext.policy,
      subjectDigest: binding.subjectDigest, runtimeContextDigest: laterContext.runtimeContextDigest,
    };
    coherentLaterQuote.sourceQuote = createFour(rawContext);
    fields(selectFour({ ...rawContext, quote: coherentLaterQuote.sourceQuote }),
      { fusedPlasma: 26670, difficulty: 0 });
    await assert.rejects(strategy.createUnsignedUserSendDraft(laterContext, coherentLaterQuote), policyError);
    await assert.rejects(strategy.createUnsignedUserSendDraft(ctx), policyError);
    assert.equal(JSON.stringify(quote), savedQuote);
  });

test('Unsigned UserSend producer refuses expired resources prices policy and changed intent bindings',
  { timeout: 5000 }, async () => {
    const ctx = context(), strategy = new Bounded(), quote = await strategy.quoteUserSend(ctx);
    for (const options of [
      { height: 103, hash: H2 }, { height: 101, hash: H },
      { height: 101, hash: H1, fusion: 1211 }, { available: 25409 },
    ]) await assert.rejects(strategy.createUnsignedUserSendDraft(context(options), quote), policyError);
    for (const mutate of [
      c => { c.subject.amount = '6'; }, c => { c.subject.toAddress = C; },
      c => { c.subject.address = C; }, c => { c.subject.previousHash = H2; },
      c => { c.subject.height = 8; }, c => { c.subject.chainIdentifier = 73405; },
      c => { c.paymentRequired.resource.url = 'https://resource.invalid/other'; refreshIntent(c); },
      c => { c.policy.maxMomentumAdvances = 3; }, c => { c.policy.maxPriceChangePercent = 11; },
      c => { c.runtimeContextDigest = 'sha256:' + 'c'.repeat(64); },
      c => { c.compiledSporkIds.dynamicPlasmaId = '77'.repeat(32); },
    ]) {
      const changed = copy(ctx); mutate(changed);
      await assert.rejects(strategy.createUnsignedUserSendDraft(changed, quote), policyError);
    }
    const wrong = copy(quote); wrong.sourceQuote.pricePolicyQuote.selected.fusedPlasma = 21000;
    await assert.rejects(strategy.createUnsignedUserSendDraft(ctx, wrong), policyError);
  });

test('Unsigned UserSend producer detaches deterministic drafts and never mutates retained inputs',
  { timeout: 5000 }, async () => {
    const ctx = context(), strategy = new Bounded(), quote = await strategy.quoteUserSend(ctx);
    const before = JSON.stringify({ ctx, quote });
    const first = await strategy.createUnsignedUserSendDraft(ctx, quote);
    const second = await strategy.createUnsignedUserSendDraft(ctx, quote);
    assert.deepEqual(first, second); assert.notEqual(first, second);
    assert.notEqual(first.accountBlock, second.accountBlock);
    assert.notEqual(first.accountBlock.momentumAcknowledged, ctx.subject.momentumAcknowledged);
    assert.equal(JSON.stringify({ ctx, quote }), before);
    const saved = JSON.stringify(first);
    ctx.subject.height++;
    await assert.rejects(strategy.createUnsignedUserSendDraft(ctx, quote), policyError);
    assert.equal(JSON.stringify(first), saved);
    assert.throws(() => { first.accountBlock.fusedPlasma++; }, TypeError);
    assert.throws(() => { first.selection.fusedPlasma++; }, TypeError);
    const fromJson = JSON.parse(saved);
    assert.equal(snapshotFields(fromJson.accountBlock).fieldDigest, first.fieldDigest);
    frozen(first);
  });

test('Unsigned UserSend producer uses captured pure stages without virtual wallet or preparer callbacks',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = await new Bounded().quoteUserSend(ctx);
    let touches = 0;
    const trip = () => { touches++; throw new Error('UNREACHED_CALLBACK'); };
    const strategy = new Bounded();
    for (const name of ['quote', 'apply', 'quoteUserSend', 'applyUserSend', 'validateUserSend',
      'bindPreparedUserSend', 'prepareUnsigned', 'sign', 'publish']) {
      Object.defineProperty(strategy, name, { enumerable: true, get: trip });
    }
    const draft = await strategy.createUnsignedUserSendDraft(ctx, quote);
    fields(draft.selection, { fusedPlasma: 25410, difficulty: 0 });
    for (const field of ['wallet', 'preparer', 'producer', 'sign', 'publish', 'accountBlock']) {
      const bad = { ...ctx, [field]: { run: trip } };
      await assert.rejects(strategy.createUnsignedUserSendDraft(bad, quote), policyError);
    }
    assert.equal(touches, 0);
  });

test('Unsigned UserSend producer refuses hostile inputs without getters proxy traps or coercion',
  { timeout: 5000 }, async () => {
    const ctx = context(), strategy = new Bounded(), quote = await strategy.quoteUserSend(ctx);
    let touches = 0;
    const trip = () => { touches++; throw new Error('UNREACHED_INPUT_HOOK'); };
    const traps = { get: trip, getPrototypeOf: trip, ownKeys: trip, getOwnPropertyDescriptor: trip };
    for (const field of Object.keys(ctx)) {
      const bad = { ...ctx }; Object.defineProperty(bad, field, { enumerable: true, get: trip });
      await assert.rejects(strategy.createUnsignedUserSendDraft(bad, quote), policyError);
    }
    for (const field of Object.keys(quote)) {
      const bad = { ...quote }; Object.defineProperty(bad, field, { enumerable: true, get: trip });
      await assert.rejects(strategy.createUnsignedUserSendDraft(ctx, bad), policyError);
    }
    const badSubject = copy(ctx);
    Object.defineProperty(badSubject.subject.momentumAcknowledged, 'height', { enumerable: true, get: trip });
    await assert.rejects(strategy.createUnsignedUserSendDraft(badSubject, quote), policyError);
    const coerce = copy(ctx); coerce.subject.amount = { valueOf: trip, toString: trip };
    await assert.rejects(strategy.createUnsignedUserSendDraft(coerce, quote), policyError);
    const revoked = Proxy.revocable({}, traps); revoked.revoke();
    for (const value of [new Proxy(ctx, traps), revoked.proxy])
      await assert.rejects(strategy.createUnsignedUserSendDraft(value, quote), policyError);
    await assert.rejects(strategy.createUnsignedUserSendDraft(ctx, new Proxy(quote, traps)), policyError);
    assert.equal(touches, 0);
  });

test('Unsigned UserSend producer exposes only the pre-work stage and never accepts a prior payment for rewriting',
  { timeout: 5000 }, async () => {
    const ctx = context(), strategy = new Bounded(), quote = await strategy.quoteUserSend(ctx);
    const draft = await strategy.createUnsignedUserSendDraft(ctx, quote);
    assert.deepEqual(Object.keys(draft), [
      'unsignedDraftVersion', 'scope', 'stage', 'preparation', 'accountBlock', 'selection',
      'subjectDigest', 'intentDigest', 'fieldDigest', 'chainAuthentication', 'hashAndWorkValidation',
      'keyAddressBinding', 'authority', 'afterSigningAction',
    ]);
    assert.equal(draft.unsignedDraftVersion, 1);
    assert.equal(draft.scope, 'DECLARED_UNSIGNED_USER_SEND_DRAFT');
    assert.equal(draft.stage, 'BEFORE_WORK_HASH_AND_SIGNING');
    assert.equal(draft.preparation, 'NOT_PERFORMED');
    assert.equal(draft.accountBlock.hash, ZERO);
    assert.equal(draft.accountBlock.nonce, '0000000000000000');
    assert.equal(draft.accountBlock.publicKey, ''); assert.equal(draft.accountBlock.signature, '');
    assert.equal(draft.hashAndWorkValidation, 'NOT_PERFORMED');
    assert.equal(draft.keyAddressBinding, 'NOT_PERFORMED');
    assert.equal(draft.chainAuthentication, 'NOT_ESTABLISHED');
    assert.equal(draft.authority, 'NONE'); assert.equal(draft.afterSigningAction, 'NONE');
    for (const phase of ['SIGNED', 'VALIDATED', 'UNKNOWN', 'ACKNOWLEDGED', 'EXPIRED', undefined])
      await assert.rejects(strategy.createUnsignedUserSendDraft({ ...ctx, phase }, quote), policyError);
    const prior = block(ctx); prior.signature = Buffer.alloc(64, 7).toString('base64');
    const saved = JSON.stringify(prior), bytes = Buffer.from([0, 1, 2, 3]), savedBytes = Buffer.from(bytes);
    await assert.rejects(strategy.createUnsignedUserSendDraft(ctx, quote, prior), policyError);
    await assert.rejects(strategy.createUnsignedUserSendDraft(ctx, quote, bytes), policyError);
    assert.equal(JSON.stringify(prior), saved); assert.deepEqual(bytes, savedBytes);
    await assert.rejects(strategy.createUnsignedUserSendDraft(ctx, draft), policyError);
    await assert.rejects(strategy.bindPreparedUserSend(ctx, quote, draft), policyError);
    await assert.rejects(strategy.createUnsignedUserSendDraft(), policyError);
  });
