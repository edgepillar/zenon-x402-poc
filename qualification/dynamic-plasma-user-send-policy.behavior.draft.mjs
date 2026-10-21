import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

// Synthetic declared-input pricing integration only, not SDK preparation,
// signer authority, work, signatures, network, SQL, a block hash or a pilot.
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
// The42 existing registrations are requalified for the changed strategy and
// its new pure import graph. Only three source-pin guard sections changed.
await import('./dynamic-plasma-request-bound-policy.behavior.draft.mjs');
const { BoundedDynamicPlasmaStrategy: Bounded } = await import('../src/zenon/bounded-dynamic-plasma-strategy.js');
const { snapshotZenonUserSendPolicyBinding: snapshot, ZenonTransactionPlanner: Planner }
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
function adapterInput(ctx, bound = snapshot(bindingInput(ctx))) {
  return { requiredFusedPolicyVersion: 1, quoteRequestContextVersion: 1,
    expectedQuoteRequestContext: bound.expectedQuoteRequestContext,
    observation: ctx.observation, policy: ctx.policy,
    subjectDigest: bound.subjectDigest, runtimeContextDigest: ctx.runtimeContextDigest };
}
function oldContext(ctx) { return { phase: 'UNSIGNED', ...adapterInput(ctx) }; }
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
async function accepts(ctx, quote, pair = { fusedPlasma: 25410, difficulty: 0 }) {
  const strategy = new Bounded();
  fields(await strategy.applyUserSend(ctx, quote), pair);
  fields(await strategy.validateUserSend(ctx, quote, copy(pair)), pair);
}
async function refusesUse(ctx, quote) {
  const strategy = new Bounded();
  await assert.rejects(strategy.applyUserSend(ctx, quote), policyError);
  await assert.rejects(strategy.validateUserSend(ctx, quote, { fusedPlasma: 25410, difficulty: 0 }), policyError);
}
async function refusesAll(ctx, quote) {
  await assert.rejects(new Bounded().quoteUserSend(ctx), policyError);
  await refusesUse(ctx, quote);
}

test('UserSend pricing derives the exact subject and intent before the existing shared policy',
  { timeout: 5000 }, async () => {
    const ctx = context(), saved = JSON.stringify(ctx), bound = snapshot(bindingInput(ctx));
    const s = ctx.subject;
    // Independent fixed-key canonical preimage for this version1 subject.
    const canonical = JSON.stringify({ address: s.address, amount: s.amount, blockType: s.blockType,
      chainIdentifier: s.chainIdentifier, data: s.data, fromBlockHash: s.fromBlockHash,
      height: s.height, momentumAcknowledged: { hash: s.momentumAcknowledged.hash, height: s.momentumAcknowledged.height },
      previousHash: s.previousHash, subjectVersion: 1, toAddress: s.toAddress,
      tokenStandard: s.tokenStandard, version: 1 });
    const expected = 'sha256:' + createHash('sha256')
      .update('["zenon-x402-user-send-subject/v1",' + canonical + ']').digest('hex');
    assert.equal(bound.subjectDigest, expected);
    assert.equal(bound.intentDigest, paymentIntentDigest(ctx.paymentRequired, ctx.accepted));
    assert.deepEqual(bound.subject, ctx.subject); assert.notEqual(bound.subject, ctx.subject);
    frozen(bound);
    const quote = await new Bounded().quoteUserSend(ctx);
    assert.equal(quote.userSendPolicyQuoteVersion, 1);
    assert.equal(quote.scope, 'DECLARED_USER_SEND_INTENT_PRICE_POLICY');
    assert.equal(quote.subjectDigest, bound.subjectDigest); assert.equal(quote.intentDigest, bound.intentDigest);
    assert.deepEqual(quote.sourceQuote, createFour(adapterInput(ctx)));
    assert.equal(quote.sourceQuote.pricePolicyQuote.subjectDigest, bound.subjectDigest);
    assert.equal(quote.sourceQuote.chainAuthentication, 'NOT_ESTABLISHED');
    assert.equal(quote.authority, 'NONE'); assert.equal(quote.afterSigningAction, 'NONE');
    frozen(quote); await accepts(ctx, quote); assert.equal(JSON.stringify(ctx), saved);
  });

test('UserSend pricing refuses payer recipient amount asset chain and intent mismatches',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = await new Bounded().quoteUserSend(ctx);
    for (const mutate of [
      v => { v.subject.amount = '6'; },
      v => { v.subject.tokenStandard = OTHER_ASSET; },
      v => { v.subject.toAddress = C; },
      v => { v.subject.address = C; },
      v => { v.payerAddress = C; },
      v => { v.subject.chainIdentifier = 73405; },
      v => { v.subject.data = Buffer.alloc(32, 7).toString('base64'); },
      v => { v.accepted.amount = '6'; v.paymentRequired.accepts[0].amount = '6'; },
      v => { v.accepted.asset = OTHER_ASSET; v.paymentRequired.accepts[0].asset = OTHER_ASSET; },
    ]) {
      const bad = copy(ctx); mutate(bad);
      assert.throws(() => snapshot(bindingInput(bad)), bindingError);
      await refusesAll(bad, quote);
    }
  });

test('UserSend pricing binds account sequence fields even when the RPC request is unchanged',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = await new Bounded().quoteUserSend(ctx);
    for (const mutate of [
      s => { s.height = 8; }, s => { s.previousHash = H2; },
      s => { s.height = 1; s.previousHash = ZERO; },
    ]) {
      const changed = copy(ctx); mutate(changed.subject);
      const bound = snapshot(bindingInput(changed));
      assert.deepEqual(bound.expectedQuoteRequestContext, snapshot(bindingInput(ctx)).expectedQuoteRequestContext);
      assert.notEqual(bound.subjectDigest, quote.subjectDigest);
      await refusesUse(changed, quote);
      const other = await new Bounded().quoteUserSend(changed);
      assert.notEqual(other.subjectDigest, quote.subjectDigest);
      assert.equal(other.authority, 'NONE'); // Coherent DATA is not account-state authority.
    }
    const bad = copy(ctx); bad.subject.fromBlockHash = H1; await refusesAll(bad, quote);
  });

test('UserSend pricing binds the selected resource and complete accepted intent without replacement authority',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = await new Bounded().quoteUserSend(ctx);
    for (const mutate of [
      v => { v.paymentRequired.resource.url = 'https://resource.invalid/other'; },
      v => { v.paymentRequired.resource.description = 'Changed.'; },
      v => { v.paymentRequired.resource.tags = ['different']; },
      v => {
        v.accepted.extra.minimumMomentumConfirmations = 2;
        v.paymentRequired.accepts[0].extra.minimumMomentumConfirmations = 2;
      },
    ]) {
      const changed = copy(ctx); mutate(changed); await refusesAll(changed, quote);
      refreshIntent(changed);
      const other = await new Bounded().quoteUserSend(changed);
      assert.notEqual(other.intentDigest, quote.intentDigest);
      await refusesUse(changed, quote);
      assert.equal(other.authority, 'NONE'); assert.equal(other.afterSigningAction, 'NONE');
    }
  });

test('UserSend pricing requires the subject acknowledgement at the original quoted Momentum',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = await new Bounded().quoteUserSend(ctx);
    for (const mutate of [
      s => { s.momentumAcknowledged.height = 99; },
      s => { s.momentumAcknowledged.hash = H1; },
    ]) {
      const bad = copy(ctx); mutate(bad.subject);
      snapshot(bindingInput(bad)); // Well-typed subject, but not the quoted frontier.
      await refusesAll(bad, quote);
    }
    const advanced = context({ height: 101, hash: H1, fusion: 1050, work: 1100 });
    await accepts(advanced, quote); // Original subject/ack stays100 while current prices advance.
    const forged = copy(quote);
    forged.sourceQuote = createFour(adapterInput(advanced));
    assert.equal(forged.sourceQuote.sourceObservation.beforeFrontier.height, 101);
    assert.equal(forged.sourceQuote.pricePolicyQuote.subjectDigest, quote.subjectDigest);
    fields(selectFour({ ...adapterInput(advanced), quote: forged.sourceQuote }),
      { fusedPlasma: 26670, difficulty: 0 });
    // A coherent raw adapter receipt still cannot rebind this subject's ack.
    await refusesUse(advanced, forged);
  });

test('UserSend pricing preserves original fields and rejects stale resources prices runtime or policy',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = await new Bounded().quoteUserSend(ctx), saved = JSON.stringify(quote);
    for (const options of [
      { height: 101, hash: H1, fusion: 1050, work: 1100 },
      { height: 102, hash: H2, fusion: 1210, work: 1210 },
    ]) await accepts(context(options), quote);
    for (const options of [
      { height: 103, hash: H2 }, { height: 101, hash: H },
      { height: 101, hash: H1, fusion: 1211 }, { available: 25409 },
    ]) await refusesUse(context(options), quote);
    const runtime = copy(ctx); runtime.runtimeContextDigest = 'sha256:' + 'c'.repeat(64);
    await refusesUse(runtime, quote);
    const policy = copy(ctx); policy.policy.maxMomentumAdvances = 3; await refusesUse(policy, quote);
    const rate = copy(ctx); rate.policy.maxPriceChangePercent = 11; await refusesAll(rate, quote);
    assert.equal(JSON.stringify(quote), saved);
  });

test('UserSend pricing keeps hybrid selected fields separate from the fusion-only total',
  { timeout: 5000 }, async () => {
    const ctx = context({ base: 100, available: 1000, maxFused: 50, maxDifficulty: 200000 });
    const quote = await new Bounded().quoteUserSend(ctx), pair = { fusedPlasma: 50, difficulty: 108000 };
    await accepts(ctx, quote, pair);
    const advanced = context({ base: 100, available: 50, maxFused: 50, maxDifficulty: 200000,
      height: 102, hash: H2, fusion: 1210, work: 1210 });
    assert.equal(advanced.observation.endpointObservations[0].rpcObservation.requiredFusedPlasma, 121);
    await accepts(advanced, quote, pair);
    for (const selected of [
      { fusedPlasma: 121, difficulty: 108000 }, { fusedPlasma: 50, difficulty: 107999 },
      { fusedPlasma: 50, difficulty: 108000, nonce: '0000000000000000' },
    ]) await assert.rejects(new Bounded().validateUserSend(advanced, quote, selected), policyError);
  });

test('UserSend pricing accepts only the existing selected single-offer upfront view',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = await new Bounded().quoteUserSend(ctx);
    for (const mutate of [
      v => { v.paymentRequired.accepts.push(copy(v.accepted)); },
      v => { v.paymentRequired.accepts = []; },
      v => { delete v.accepted.extra.paymentFlow; },
      v => { v.accepted.extra.paymentFlow = 'escrow'; },
      v => { v.paymentRequired.accepts[0].payTo = C; },
      v => { v.paymentRequired.resource.url = 'http://resource.invalid/paid'; },
      v => { v.paymentRequired.extensions = { unsupported: true }; },
      v => { v.paymentRequired.x402Version = 1; },
      v => { v.accepted.network = 'other:network'; },
    ]) {
      const bad = copy(ctx); mutate(bad); await refusesAll(bad, quote);
    }
  });

test('UserSend pricing isolates receipt versions and refuses outer or inner tampering',
  { timeout: 5000 }, async () => {
    const ctx = context(), strategy = new Bounded(), quote = await strategy.quoteUserSend(ctx);
    for (const mutate of [
      q => { q.userSendPolicyQuoteVersion = 2; }, q => { q.scope = 'OTHER'; },
      q => { q.subjectDigest = 'sha256:' + 'f'.repeat(64); },
      q => { q.intentDigest = 'f'.repeat(64); }, q => { q.authority = 'SIGN'; },
      q => { q.afterSigningAction = 'REPLACE'; }, q => { q.extra = true; },
      q => { q.sourceQuote.pricePolicyQuote.selected.fusedPlasma++; },
      q => { q.sourceQuote.sourceObservation.rpcObservation.requiredFusedPlasma++; },
    ]) { const bad = copy(quote); mutate(bad); await refusesUse(ctx, bad); }
    const old = oldContext(ctx), oldQuote = await strategy.quote(old);
    await refusesUse(ctx, oldQuote);
    await assert.rejects(strategy.apply(old, quote), error => error instanceof TypeError
      && Object.isFrozen(error) && error.code === 'dynamic_plasma_required_fused_policy_input_rejected');
    await assert.rejects(strategy.quoteUserSend({ ...ctx, subjectDigest: quote.subjectDigest }), policyError);
    await assert.rejects(strategy.applyUserSend({ ...ctx, subjectDigest: quote.subjectDigest }, quote), policyError);
  });

test('UserSend binding snapshots and JSON receipts remain detached and do not reset authority',
  { timeout: 5000 }, async () => {
    const ctx = context(), clean = copy(ctx), bound = snapshot(bindingInput(ctx));
    const quote = await new Bounded().quoteUserSend(ctx), saved = JSON.stringify(quote);
    assert.notEqual(bound.subject, ctx.subject);
    assert.notEqual(bound.subject.momentumAcknowledged, ctx.subject.momentumAcknowledged);
    assert.notEqual(bound.expectedQuoteRequestContext.compiledSporkIds, ctx.compiledSporkIds);
    frozen(bound); frozen(quote); await accepts(ctx, copy(quote));
    ctx.subject.height++; await refusesUse(ctx, quote);
    assert.equal(bound.subject.height, 7); assert.equal(JSON.stringify(quote), saved);
    const changed = copy(clean);
    changed.compiledSporkIds.dynamicPlasmaId = '77'.repeat(32);
    await refusesAll(changed, quote);
    await accepts(clean, copy(quote)); assert.equal(quote.authority, 'NONE');
  });

test('UserSend binding rejects hostile records descriptors arrays and coercion without invoking hooks',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = await new Bounded().quoteUserSend(ctx);
    let touches = 0;
    const trip = () => { touches++; throw new Error('UNREACHED_INPUT_HOOK'); };
    const traps = { get: trip, getPrototypeOf: trip, ownKeys: trip, getOwnPropertyDescriptor: trip };
    const at = (value, path) => path.reduce((object, key) => object[key], value);
    for (const path of [
      ['subject'], ['subject', 'momentumAcknowledged'], ['accepted'], ['accepted', 'extra'],
      ['accepted', 'extra', 'zenonChain'], ['paymentRequired'], ['paymentRequired', 'resource'],
      ['paymentRequired', 'accepts'], ['compiledSporkIds'],
    ]) {
      const target = at(ctx, path);
      for (const field of Object.keys(target)) {
        const bad = copy(ctx);
        Object.defineProperty(at(bad, path), field, { enumerable: true, get: trip });
        await refusesAll(bad, quote);
      }
      for (const value of [new Proxy(target, traps), Object.create(target)]) {
        const bad = copy(ctx); at(bad, path.slice(0, -1))[path.at(-1)] = value;
        await refusesAll(bad, quote);
      }
    }
    for (const field of Object.keys(ctx)) {
      const bad = { ...ctx }; Object.defineProperty(bad, field, { enumerable: true, get: trip });
      await refusesAll(bad, quote);
    }
    const sparse = copy(ctx); delete sparse.paymentRequired.accepts[0]; await refusesAll(sparse, quote);
    const extra = copy(ctx); extra.paymentRequired.resource.toJSON = trip; await refusesAll(extra, quote);
    const cyclic = copy(ctx); cyclic.paymentRequired.resource.loop = cyclic.paymentRequired; await refusesAll(cyclic, quote);
    const symbolic = copy(ctx); symbolic.subject[Symbol.toStringTag] = 'Hostile'; await refusesAll(symbolic, quote);
    const coerced = copy(ctx); coerced.subject.amount = { toString: trip, valueOf: trip }; await refusesAll(coerced, quote);
    const badReceipt = copy(quote);
    Object.defineProperty(badReceipt.sourceQuote, 'sourceObservation', { enumerable: true, get: trip });
    await refusesUse(ctx, badReceipt);
    const revoked = Proxy.revocable({}, traps); revoked.revoke();
    await refusesAll({ ...ctx, paymentRequired: revoked.proxy }, quote);
    assert.equal(touches, 0);
  });

test('UserSend binding keeps typed bounds unsigned phases arity and unfinished preparation gates explicit',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = await new Bounded().quoteUserSend(ctx), strategy = new Bounded();
    for (const [field, values] of [
      ['subjectVersion', [0, 2, '1', 1n]], ['version', [0, 2]], ['blockType', [1, 3]],
      ['height', [0, -0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, 1n]],
      ['chainIdentifier', [0, -0, '73404', 73405]],
      ['amount', ['0', '05', '-1', (1n << 255n).toString()]],
      ['previousHash', ['A'.repeat(64), '1'.repeat(63), ZERO]],
    ]) {
      for (const value of values) {
        const bad = { ...ctx, subject: { ...ctx.subject, [field]: value } };
        await refusesAll(bad, quote);
      }
    }
    const max = context({ amount: ((1n << 255n) - 1n).toString() });
    assert.equal(snapshot(bindingInput(max)).subject.amount, max.accepted.amount);
    const long = copy(ctx); long.paymentRequired.resource.description = 'x'.repeat(8193);
    await refusesAll(long, quote);
    const fake = copy(ctx);
    fake.paymentRequired.accepts = Object.assign(Object.create(Array.prototype), { 0: copy(ctx.accepted), length: 1 });
    await refusesAll(fake, quote);
    for (const field of ['fusedPlasma', 'difficulty', 'nonce', 'hash', 'publicKey', 'signature']) {
      const bad = copy(ctx); bad.subject[field] = field === 'nonce' ? '0000000000000000' : 0;
      await refusesAll(bad, quote);
    }
    for (const phase of ['SIGNED', 'UNKNOWN', 'ACKNOWLEDGED', 'VALIDATED', 'EXPIRED', undefined]) {
      await refusesAll({ ...ctx, phase }, quote);
    }
    await assert.rejects(strategy.quoteUserSend(ctx, undefined), policyError);
    await assert.rejects(strategy.applyUserSend(ctx), policyError);
    await assert.rejects(strategy.applyUserSend(ctx, quote, undefined), policyError);
    await assert.rejects(strategy.validateUserSend(ctx, quote), policyError);
    await assert.rejects(strategy.validateUserSend(ctx, quote, quote.sourceQuote.pricePolicyQuote.selected, undefined), policyError);
    assert.throws(() => snapshot(bindingInput(ctx), undefined), bindingError);
    const bytes = Buffer.from([0, 1, 2, 3]), saved = Buffer.from(bytes);
    let signingCalls = 0;
    const sign = () => { signingCalls++; throw new Error('UNREACHED_SIGNING_HOOK'); };
    await refusesAll({ ...ctx, wallet: { sign }, signedBytes: bytes }, quote);
    assert.equal(signingCalls, 0);
    assert.deepEqual(bytes, saved);
    await assert.rejects(new Planner().prepareUnsigned({}), /must be implemented/);
    assert.equal(quote.authority, 'NONE'); assert.equal(quote.afterSigningAction, 'NONE');
  });
