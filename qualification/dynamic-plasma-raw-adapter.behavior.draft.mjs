import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

// Only12 new adapter scenarios register. No historical qualification module,
// SDK, native owner, work generator or real signer is imported.
assert.equal(process.argv.length, 2);
const pins = [
  ["../src/zenon/transaction-planner.js",20374,"4ef2c72a44d5f0f5ce918172a6ff30b13b693fa173bc74cb56565f5402417c2c"],
  ["../src/zenon/bounded-dynamic-plasma-strategy.js",15729,"7b82560bdeb25e573912090a2fe8de7b45912500a7a7c4434fe06dcf94e06d62"],
  ["../src/canonical.js",967,"0d55ddf1727cafb0dcd46df2922305568615552a4d2ae34a5c30e90b9d8d998c"],
  ["../src/x402-wire.js",39886,"5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56"],
  ["../src/zenon/dynamic-plasma-required-fused-policy-adapter.js",12024,"e2b693d4df9065d44ba590f4d0c8dffeb8e55187668eedfa396b4026c9905c3e"],
  ["../src/zenon/dynamic-plasma-observation-collector.js",35157,"d614506b0054a87fe553cc79812b7e5355bea924bd3654902026ece58e796eb8"],
  ["../src/zenon/dynamic-plasma-observation-normalizer.js",28398,"2c3f7d42ded21a5513ff26c23a00a35a53aa334f053d10930f1571a020286897"],
  ["../src/zenon/dynamic-plasma-json-rpc-read-transport.js",10832,"fd03b2ad87d16660aa61d3961c163d724d5f89cd6d4bb9c4391d739566d5e5ca"],
  ["../src/zenon/bounded-json-rpc-read-core.js",20906,"5572d24175455c6b3a9924688d601d31585454ce62dac9eb27151d2a65c83fcd"],
  ["../src/zenon/dynamic-plasma-price-policy.js",14957,"41e2e2044597cfa69c5adca292bcd762a189076be1cd939bec10798d7e35c52b"],
  ["../src/zenon/dynamic-plasma-compatibility.js",7732,"b3989ce15e5f2e9d07b0ed035fe96bcce9f22cac93f5e497fdca5c37bf7618dd"],
  ["../src/zenon/dynamic-plasma-required-fused-quote.js",5416,"f5e10ff2dbfff3b6b63d87f0abadd0bb52b5d6b8fe0ead6a55fc5ea14207b730"],
  ["../src/zenon/plasma-strategy.js",974,"1c597d4e169ba8a5e6d2b7852c4ffa3a8ec9b854332fe354b9b013c36ebae093"],
  ["../package.json",1413,"8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"],
  ["../test-support/phase2a-account-block-preimage.js",7724,"dde02531faaf3c45c5ab9760beba84fe56664f923c1d61fa64b077682d97dc0e"],
  ["../src/zenon/dynamic-plasma-user-send-work-binding.js",4522,"218b4391c97e4adde905415e20ec0e2015fca98643db85b6efd682aa3b5c5681"],
  ["../src/zenon/dynamic-plasma-user-send-key-binding.js",4237,"37ad7e74b038801297e4bffb0cb8ba92cbd79009ed32c4ae5b134fe2cb154be2"],
  ["../src/zenon/dynamic-plasma-user-send-assembly.js",7772,"05012a2a983ceca018674c4d1f63823f3f7ed53b0970a4b4bd486c4278832b04"],
  ["../src/zenon/dynamic-plasma-user-send-work-input.js",2853,"2ff9c089e5903c059746d0a1c38688a2849f94d04d429279811fbbfbb40450a4"],
  ["../src/zenon/dynamic-plasma-user-send-work-request.js",2564,"bc66c7d629eae230c46f62c88fa97960860d94b5d65d3c5611612ccae13fe9ce"],
  ["../src/zenon/declared-dynamic-plasma-user-send-adapter.js",5050,"76977bcb857e9ac561daaf080c20cd2b4ec9d289023260815b5da371f1516b7e"],
];
const sources = new Map();
for (const [path, bytes, sha256] of pins) {
  const raw = readFileSync(new URL(path, import.meta.url));
  assert.equal(raw.length, bytes);
  assert.equal(createHash('sha256').update(raw).digest('hex'), sha256);
  const source = raw.toString('utf8');
  assert.equal(/[^\x00-\x7f]/.test(source) || source.includes('\0'), false);
  assert.equal(Buffer.byteLength(source), bytes);
  assert.ok(source.endsWith('\n')); sources.set(path, source);
}
const { DeclaredDynamicPlasmaUserSendAdapter: Adapter }
  = await import('../src/zenon/declared-dynamic-plasma-user-send-adapter.js');
const { createZenonUserSendSubject: subject, assertZenonTransactionPlanner: assertPlanner }
  = await import('../src/zenon/transaction-planner.js');
const { BoundedDynamicPlasmaStrategy: Bounded }
  = await import('../src/zenon/bounded-dynamic-plasma-strategy.js');
const { createZenonUnsignedUserSendWorkRequest: workRequest }
  = await import('../src/zenon/dynamic-plasma-user-send-work-request.js');
const { assembleZenonUnsignedUserSend: assemble }
  = await import('../src/zenon/dynamic-plasma-user-send-assembly.js');
const { accountBlockHashHex: oracleHash }
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
function address(byte, core = [0, ...Array(19).fill(byte)]) {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l', words = [];
  let accumulator = 0, bits = 0, checksum = 1;
  for (const value of core) {
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

const PUBLIC = Buffer.alloc(32, 7).toString('base64');
const NONCE = '0102030405060708'; // Fixed supplied bytes, not generated work.
function payerCore() {
  return Buffer.concat([Buffer.from([0]),
    createHash('sha3-256').update(Buffer.from(PUBLIC, 'base64')).digest().subarray(0, 19)]);
}
function keyContext() {
  const ctx = context(), payer = address(0, payerCore());
  ctx.subject.address = payer; ctx.payerAddress = payer; refreshRequest(ctx); return ctx;
}


function view(options = {}) {
  const ctx = context(options), payer = address(0, payerCore());
  ctx.subject.address = payer; ctx.payerAddress = payer; refreshRequest(ctx);
  return { rawUserSendViewVersion: 1, phase: 'UNSIGNED',
    paymentRequired: ctx.paymentRequired, accepted: ctx.accepted, payerAddress: payer,
    compiledSporkIds: ctx.compiledSporkIds,
    accountFrontier: { address: payer, chainIdentifier: 73404, hash: PREVIOUS, height: 6 },
    momentumAcknowledged: copy(ctx.subject.momentumAcknowledged),
    observation: ctx.observation, policy: ctx.policy, runtimeContextDigest: ctx.runtimeContextDigest };
}
function manualContext(value) {
  return { phase: value.phase, subject: subject({
    subjectInputVersion: 1, phase: value.phase, paymentRequired: value.paymentRequired,
    accepted: value.accepted, payerAddress: value.payerAddress, compiledSporkIds: value.compiledSporkIds,
    accountFrontier: value.accountFrontier, momentumAcknowledged: value.momentumAcknowledged,
  }), paymentRequired: value.paymentRequired, accepted: value.accepted, payerAddress: value.payerAddress,
    compiledSporkIds: value.compiledSporkIds, observation: value.observation,
    policy: value.policy, runtimeContextDigest: value.runtimeContextDigest };
}
function refreshView(value) {
  const ctx = manualContext(value); refreshRequest(ctx);
  value.observation.quoteRequestContext = ctx.observation.quoteRequestContext;
}
function material() { return { materialVersion: 1, publicKey: PUBLIC, nonce: NONCE }; }
function frozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) frozen(child);
}
function adapterError(error) {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, 'zenon_declared_dp_adapter_input_rejected');
  assert.equal(error.message, error.code); assert.equal(error.stack, 'TypeError: ' + error.code);
  assert.equal(Object.hasOwn(error, 'cause'), false); return true;
}
function checked(block, value) {
  assert.equal(block.version, 1); assert.equal(block.chainIdentifier, 73404);
  assert.equal(block.blockType, 2); assert.equal(block.address, value.payerAddress);
  assert.equal(block.height, value.accountFrontier.height + 1);
  assert.equal(block.previousHash, value.accountFrontier.hash);
  assert.equal(block.toAddress, value.accepted.payTo); assert.equal(block.amount, value.accepted.amount);
  assert.equal(block.tokenStandard, value.accepted.asset);
  assert.deepEqual(block.momentumAcknowledged, value.momentumAcknowledged);
  assert.equal(block.fromBlockHash, ZERO); assert.equal(block.nonce, NONCE);
  assert.equal(block.publicKey, PUBLIC); assert.equal(block.signature, '');
  assert.equal(block.data, Buffer.from(paymentIntentDigest(value.paymentRequired, value.accepted), 'hex').toString('base64'));
  assert.equal(block.hash, oracleHash(block)); frozen(block);
}
function advance(value, count, price = 1000) {
  for (const endpoint of value.observation.endpointObservations) {
    for (const frontier of [endpoint.beforeFrontier, endpoint.afterFrontier]) {
      frontier.height = 100 + count; frontier.hash = count === 1 ? H1 : H2;
      frontier.nextFusionPrice = price; frontier.nextWorkPrice = price;
    }
    const raw = endpoint.rpcObservation, total = Math.ceil(raw.basePlasma * price / 1000);
    const fused = Math.min(raw.availablePlasma, total);
    const remaining = Math.max(0, raw.basePlasma - Math.floor(fused * 1000 / price));
    raw.requiredFusedPlasma = total;
    raw.requiredDifficulty = Math.ceil(remaining * price / 1000) * 1500;
  }
}
function damage(value) {
  value.phase = 'SIGNED'; value.accountFrontier.height = 99; value.accountFrontier.hash = ZERO;
  value.accepted.amount = '999'; value.observation.endpointObservations[0].rpcObservation.availablePlasma = 0;
  value.policy.maxFusedPlasma = 0;
}

test('raw adapter v1 carries one declared account intent through quote work request and unsigned assembly', { timeout: 5000 }, async () => {
  const adapter = new Adapter(), value = view(), bytes = material(), before = copy([value, bytes]);
  const quote = await adapter.quote(value), work = await adapter.createWorkRequest(value, quote);
  const result = await adapter.assemble(value, quote, bytes); checked(result.accountBlock, value);
  assert.equal(Object.keys(value).length, 11); assert.equal(value.rawUserSendViewVersion, 1);
  assert.equal(work.accountBlock.height, 7); assert.equal(work.accountBlock.previousHash, PREVIOUS);
  assert.equal(result.accountBlock.fusedPlasma, 25410); assert.equal(result.accountBlock.difficulty, 0);
  for (const receipt of [quote, work, result]) { assert.equal(receipt.authority, 'NONE'); frozen(receipt); }
  assert.equal(result.afterSigningAction, 'NONE'); assert.equal(result.preparation, 'NOT_PERFORMED');
  assert.deepEqual([value, bytes], before);
  assert.equal(Object.isFrozen(value), false); assert.equal(Object.isFrozen(value.observation), false);
  assert.equal(Object.isFrozen(bytes), false); assert.ok(Object.isFrozen(adapter));
});

test('raw adapter returns unchanged component contracts for the same independently derived subject', { timeout: 5000 }, async () => {
  const adapter = new Adapter(), value = view(), ctx = manualContext(value);
  const expected = await new Bounded().quoteUserSend(ctx), quote = await adapter.quote(value);
  assert.deepEqual(quote, expected);
  assert.deepEqual(await adapter.createWorkRequest(value, quote), await workRequest(ctx, expected));
  assert.deepEqual(await adapter.assemble(value, quote, material()), await assemble(ctx, expected, material()));
  assert.equal(quote.scope, 'DECLARED_USER_SEND_INTENT_PRICE_POLICY');
  const empty = copy(value); empty.accountFrontier.height = 0; empty.accountFrontier.hash = ZERO;
  const q = await adapter.quote(empty), first = await adapter.assemble(empty, q, material());
  checked(first.accountBlock, empty); assert.equal(first.accountBlock.height, 1);
  await assert.rejects(adapter.quote({ ...value, accountFrontier: null }), adapterError);
});

test('raw adapter produces original hybrid work input but never accepts invalid supplied work or searches', { timeout: 5000 }, async () => {
  const adapter = new Adapter(), value = view({ available: 10000, maxFused: 10000, maxDifficulty: 40000000 });
  const quote = await adapter.quote(value), before = copy(quote), work = await adapter.createWorkRequest(value, quote);
  assert.equal(work.selection.fusedPlasma, 10000); assert.ok(work.selection.difficulty > 0);
  assert.equal(work.workInput.difficulty, work.selection.difficulty);
  assert.equal(work.workInput.dataHash, createHash('sha3-256')
    .update(Buffer.concat([payerCore(), Buffer.from(PREVIOUS, 'hex')])).digest('hex'));
  assert.equal(work.accountBlock.hash, ZERO); assert.equal(work.accountBlock.nonce, '0'.repeat(16));
  assert.equal(work.workInput.nonceGeneration, 'NOT_PERFORMED');
  await assert.rejects(adapter.assemble(value, quote, material()), adapterError);
  assert.deepEqual(quote, before);
});

test('raw adapter refuses original quote reuse after advanced foreign or reset account frontiers', { timeout: 5000 }, async () => {
  const adapter = new Adapter(), value = view(), quote = await adapter.quote(value), before = copy(quote);
  for (const [height, hash] of [[7, '77'.repeat(32)], [6, '88'.repeat(32)], [0, ZERO]]) {
    const current = copy(value); current.accountFrontier.height = height; current.accountFrontier.hash = hash;
    await assert.rejects(adapter.createWorkRequest(current, quote), adapterError);
    await assert.rejects(adapter.assemble(current, quote, material()), adapterError);
  }
  assert.deepEqual(quote, before);
});

test('raw adapter preserves original acknowledgement and selected fields through the declared price window', { timeout: 5000 }, async () => {
  const adapter = new Adapter(), value = view(), quote = await adapter.quote(value);
  const origin = await adapter.assemble(value, quote, material()), current = copy(value);
  advance(current, 2, 1210);
  const work = await adapter.createWorkRequest(current, quote), result = await adapter.assemble(current, quote, material());
  checked(result.accountBlock, current); assert.deepEqual(result.accountBlock, origin.accountBlock);
  assert.deepEqual(work.selection, { fusedPlasma: 25410, difficulty: 0 });
  assert.equal(result.accountBlock.momentumAcknowledged.hash, H);
  assert.equal(result.accountBlock.momentumAcknowledged.height, 100);
  const changed = copy(current); changed.momentumAcknowledged = { hash: H2, height: 102 };
  await assert.rejects(adapter.createWorkRequest(changed, quote), adapterError);
  await assert.rejects(adapter.assemble(changed, quote, material()), adapterError);
});

test('raw adapter rejects coherent stale exhausted over-price and changed-intent views without repricing', { timeout: 5000 }, async () => {
  const adapter = new Adapter(), value = view(), quote = await adapter.quote(value), before = copy(quote);
  for (const kind of ['age', 'price', 'pool', 'budget', 'resource', 'recipient']) {
    const current = copy(value);
    if (kind === 'age') advance(current, 3);
    if (kind === 'price') advance(current, 2, 1211);
    if (kind === 'pool') {
      for (const endpoint of current.observation.endpointObservations) endpoint.rpcObservation.availablePlasma = 25000;
      advance(current, 1);
    }
    if (kind === 'budget') current.policy.maxFusedPlasma = 20000;
    if (kind === 'resource') current.paymentRequired.resource.url = 'https://resource.invalid/other';
    if (kind === 'recipient') { current.accepted.payTo = C; current.paymentRequired.accepts[0] = copy(current.accepted); }
    if (kind === 'resource' || kind === 'recipient') refreshView(current);
    await assert.rejects(adapter.createWorkRequest(current, quote), adapterError);
    await assert.rejects(adapter.assemble(current, quote, material()), adapterError);
  }
  assert.deepEqual(quote, before);
});

test('raw adapter requires its exact versioned view and never accepts legacy contexts or operational dependencies', { timeout: 5000 }, async () => {
  const adapter = new Adapter(), value = view(), quote = await adapter.quote(value);
  for (const version of [0, 2, '1', undefined]) {
    const bad = { ...value, rawUserSendViewVersion: version };
    await assert.rejects(adapter.quote(bad), adapterError);
    await assert.rejects(adapter.createWorkRequest(bad, quote), adapterError);
    await assert.rejects(adapter.assemble(bad, quote, material()), adapterError);
  }
  const absent = copy(value); delete absent.rawUserSendViewVersion;
  await assert.rejects(adapter.quote(absent), adapterError);
  await assert.rejects(adapter.quote(manualContext(value)), adapterError);
  for (const phase of ['SIGNED', 'UNKNOWN', 'ACKNOWLEDGED', 'VALIDATED', 'PREPARED']) {
    const bad = { ...value, phase };
    await assert.rejects(adapter.quote(bad), adapterError);
    await assert.rejects(adapter.createWorkRequest(bad, quote), adapterError);
    await assert.rejects(adapter.assemble(bad, quote, material()), adapterError);
  }
  for (const field of ['subject', 'accountBlock', 'payment', 'operation', 'signer', 'workProvider', 'approved', 'consumedAuthority']) {
    const bad = { ...value, [field]: true };
    await assert.rejects(adapter.quote(bad), adapterError);
    await assert.rejects(adapter.createWorkRequest(bad, quote), adapterError);
    await assert.rejects(adapter.assemble(bad, quote, material()), adapterError);
  }
  let calls = 0; assert.throws(() => new Adapter({ quote() { calls += 1; } }), adapterError);
  assert.equal(calls, 0);
});

test('raw adapter stages retain their pre-await checked view quote and supplied material data', { timeout: 5000 }, async () => {
  const adapter = new Adapter(), original = view(), expected = await adapter.quote(original);
  const quoted = copy(original), qPending = adapter.quote(quoted); damage(quoted);
  assert.deepEqual(await qPending, expected);
  const value = copy(original), quote = copy(expected);
  const expectedWork = await adapter.createWorkRequest(original, expected);
  const workPending = adapter.createWorkRequest(value, quote); damage(value);
  quote.scope = 'CHANGED'; quote.sourceQuote.pricePolicyQuote.selected.fusedPlasma = 0;
  assert.deepEqual(await workPending, expectedWork);
  const current = copy(original), retained = copy(expected), bytes = material();
  const expectedBlock = await adapter.assemble(original, expected, material());
  const pending = adapter.assemble(current, retained, bytes); damage(current);
  retained.authority = 'READY'; bytes.publicKey = Buffer.alloc(32, 9).toString('base64'); bytes.nonce = 'ff'.repeat(8);
  const result = await pending; assert.deepEqual(result, expectedBlock); checked(result.accountBlock, original);
});

test('raw adapter rejects hostile view descriptors proxies and coercion without caller hooks', { timeout: 5000 }, async () => {
  const adapter = new Adapter(), value = view(), quote = await adapter.quote(value);
  let hooks = 0; const hook = () => { hooks += 1; throw new Error('HOOK'); };
  for (const [part, field] of [
    ['', 'phase'], ['accountFrontier', 'hash'], ['momentumAcknowledged', 'height'],
    ['accepted', 'amount'], ['policy', 'maxFusedPlasma'],
  ]) {
    const bad = copy(value), target = part ? bad[part] : bad;
    Object.defineProperty(target, field, { get: hook, enumerable: true });
    await assert.rejects(adapter.quote(bad), adapterError);
    await assert.rejects(adapter.createWorkRequest(bad, quote), adapterError);
    await assert.rejects(adapter.assemble(bad, quote, material()), adapterError);
  }
  const observed = copy(value);
  Object.defineProperty(observed.observation.endpointObservations[0].beforeFrontier, 'height', { get: hook, enumerable: true });
  await assert.rejects(adapter.quote(observed), adapterError);
  const proxy = new Proxy(value, { get: hook, ownKeys: hook, getPrototypeOf: hook, getOwnPropertyDescriptor: hook });
  await assert.rejects(adapter.quote(proxy), adapterError);
  await assert.rejects(adapter.createWorkRequest(proxy, quote), adapterError);
  await assert.rejects(adapter.assemble(proxy, quote, material()), adapterError);
  const callable = copy(value); callable.paymentRequired.resource.toJSON = hook;
  await assert.rejects(adapter.quote(callable), adapterError);
  const unsafe = copy(value); unsafe.accountFrontier.height = { valueOf: hook, [Symbol.toPrimitive]: hook };
  await assert.rejects(adapter.quote(unsafe), adapterError);
  assert.equal(hooks, 0);
});

test('raw adapter captures source implementations instead of overridden preparer methods', { timeout: 5000 }, async () => {
  const adapter = new Adapter(), value = view(), fields = ['quoteUserSend', 'createUnsignedUserSendDraft', 'bindHashedUserSend'];
  const ds = fields.map(field => [field, Object.getOwnPropertyDescriptor(Bounded.prototype, field)]);
  let calls = 0;
  for (const [field, d] of ds) Object.defineProperty(Bounded.prototype, field, {
    ...d, value() { calls += 1; throw new Error('OVERRIDE'); },
  });
  try {
    const quote = await adapter.quote(value), work = await adapter.createWorkRequest(value, quote);
    const result = await adapter.assemble(value, quote, material());
    checked(result.accountBlock, value); assert.equal(work.selection.fusedPlasma, 25410);
  } finally { for (const [field, d] of ds) Object.defineProperty(Bounded.prototype, field, d); }
  assert.equal(calls, 0);
});

test('raw adapter preserves exact arity original quote material and no replacement boundaries', { timeout: 5000 }, async () => {
  const adapter = new Adapter(), value = view(), quote = await adapter.quote(value);
  await assert.rejects(adapter.quote(), adapterError); await assert.rejects(adapter.quote(value, null), adapterError);
  await assert.rejects(adapter.createWorkRequest(value), adapterError);
  await assert.rejects(adapter.createWorkRequest(value, quote, null), adapterError);
  await assert.rejects(adapter.assemble(value, quote), adapterError);
  await assert.rejects(adapter.assemble(value, quote, material(), null), adapterError);
  for (const badQuote of [{ ...quote, userSendPolicyQuoteVersion: 2 }, { ...quote, authority: 'READY' }, quote.sourceQuote]) {
    await assert.rejects(adapter.createWorkRequest(value, badQuote), adapterError);
    await assert.rejects(adapter.assemble(value, badQuote, material()), adapterError);
  }
  for (const bad of [
    { ...material(), publicKey: Buffer.alloc(32, 9).toString('base64') },
    { ...material(), nonce: 'ABCDEF0123456789' }, { ...material(), signature: '' },
    { ...material(), payment: 'retained' }, { ...material(), operation: 'RETRY' },
  ]) await assert.rejects(adapter.assemble(value, quote, bad), adapterError);
  checked((await adapter.assemble(value, quote, material())).accountBlock, value);
});

test('raw adapter stays stateless default-off frozen DATA without planner SDK signer owner or runtime activation', { timeout: 5000 }, async () => {
  const adapter = new Adapter(), value = view(), quote = await adapter.quote(value);
  const work = await adapter.createWorkRequest(value, quote), result = await adapter.assemble(value, quote, material());
  for (const receipt of [quote, work, result]) { assert.deepEqual(copy(receipt), receipt); frozen(receipt); }
  assert.throws(() => { result.accountBlock.amount = '999'; }, TypeError);
  assert.throws(() => { work.workInput.dataHash = ZERO; }, TypeError);
  for (const field of ['prepareUnsigned', 'sign', 'publish', 'close', 'reset', 'READY']) assert.equal(adapter[field], undefined);
  assert.throws(() => assertPlanner(adapter), /prepareUnsigned/); assert.deepEqual(Object.keys(adapter), []);
  const source = sources.get('../src/zenon/declared-dynamic-plasma-user-send-adapter.js');
  assert.equal((source.match(/^export /gm) ?? []).length, 1);
  assert.match(source, /rawUserSendViewVersion/);
  assert.match(source, /const QUOTE = BoundedDynamicPlasmaStrategy\.prototype\.quoteUserSend/);
  assert.match(source, /const subject = SUBJECT\(/);
  assert.match(source, /WORK_REQUEST\(context\(view\), originalQuote\)/);
  assert.match(source, /ASSEMBLE\(context\(view\), originalQuote, suppliedMaterial\)/);
  assert.doesNotMatch(source, /node:(?:fs|https?|tls|dns|child_process|worker_threads)|generateKeyPair|randomBytes|crypto\.sign|crypto\.verify|prepareBlock|publishRawTransaction|mnemonic|keystore|fetch\s*\(/);
  assert.doesNotMatch(source, /this\.(?:quote|createWorkRequest|assemble)\s*\(/);
});
