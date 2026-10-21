import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

// Deterministic declared frontier-to-subject DATA only; no account lookup,
// SDK preparation, work/key/signature generation or real PREPARE is used.
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
  ["../test/dynamic-plasma-price-policy.test.js",28827,"ab6591d268744f611bd5f04f3c199ee53dcf45d871e0b89ac49c57f4981039b5"],
  ["../qualification/dynamic-plasma-price-policy-frontier-binding.behavior.draft.mjs",8745,"d7f672ee4464bd002e893e231dec5acc85785db2407f7df25fa601d74f972409"],
  ["../qualification/dynamic-plasma-required-fused-policy-adapter.behavior.draft.mjs",17942,"8f641945d9f699579a2440a7c6f90e16c4d1712e0e042e9135f0468a8db514f1"],
  ["../qualification/dynamic-plasma-four-field-strategy.behavior.draft.mjs",13760,"7d8e8a975aab82f54889d1a9544a25f2a73ce958cd369d4ee76c5c6021787621"],
  ["../qualification/dynamic-plasma-request-bound-policy.behavior.draft.mjs",26305,"84b6490bfb9a6c5c77bc783c11f08b95d26134b0c0939b2a5c064da8e51a3861"],
  ["../qualification/dynamic-plasma-user-send-policy.behavior.draft.mjs",27617,"b28eea5492774c01efc564335ce841177e84eafeb90581a546b0cc20afa81fb0"],
  ["../qualification/dynamic-plasma-prepared-user-send-fields.behavior.draft.mjs",23476,"895e79b69ffa68efb4d71bcf0f1168769ec5578a321b65b499ecee520b8d763e"],
  ["../qualification/dynamic-plasma-user-send-draft.behavior.draft.mjs",23733,"ba36fe63ab0455d3b38e7f5d86b870cc948b0ba711449277ec123bbd2831c7f7"],
  ["../test-support/phase2a-account-block-preimage.js",7724,"dde02531faaf3c45c5ab9760beba84fe56664f923c1d61fa64b077682d97dc0e"],
  ["../qualification/dynamic-plasma-user-send-hash.behavior.draft.mjs",28034,"84183ec31555643cb997c85efa8eea8756cb6fc27e3ffce0dbe1e4a706fac039"],
  ["../src/zenon/dynamic-plasma-user-send-work-binding.js",4522,"218b4391c97e4adde905415e20ec0e2015fca98643db85b6efd682aa3b5c5681"],
  ["../qualification/dynamic-plasma-user-send-work.behavior.draft.mjs",24164,"fc1879600594882341cea31699e90b80fcd3d2c480305ac49e0b1528d609af77"],
  ["../src/zenon/dynamic-plasma-user-send-key-binding.js",4237,"37ad7e74b038801297e4bffb0cb8ba92cbd79009ed32c4ae5b134fe2cb154be2"],
  ["../qualification/dynamic-plasma-user-send-key.behavior.draft.mjs",25162,"91205bb871678f1e24dfa123139bba709ec6df8576fde31c445736f696bc42f6"],
  ["../src/zenon/dynamic-plasma-user-send-assembly.js",7772,"05012a2a983ceca018674c4d1f63823f3f7ed53b0970a4b4bd486c4278832b04"],
  ["../qualification/dynamic-plasma-user-send-assembly.behavior.draft.mjs",29723,"ac822df863bf880f9ec54d09353109afeeca2269d9f560eddde904476df0656c"],
  ["../src/zenon/dynamic-plasma-user-send-work-input.js",2853,"2ff9c089e5903c059746d0a1c38688a2849f94d04d429279811fbbfbb40450a4"],
  ["../src/zenon/dynamic-plasma-user-send-work-request.js",2564,"bc66c7d629eae230c46f62c88fa97960860d94b5d65d3c5611612ccae13fe9ce"],
  ["../qualification/dynamic-plasma-user-send-work-input.behavior.draft.mjs",27254,"5537eac9041497380d5f7228a3d1730dbbee777f180d99a96a48e78ddf0eef67"],
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
const { createZenonUserSendSubject: produce,
  snapshotZenonUserSendPolicyBinding: bindSubject }
  = await import('../src/zenon/transaction-planner.js');
const { createZenonUnsignedUserSendWorkRequest: workRequest }
  = await import('../src/zenon/dynamic-plasma-user-send-work-request.js');
const { assembleZenonUnsignedUserSend: assemble }
  = await import('../src/zenon/dynamic-plasma-user-send-assembly.js');
const { BoundedDynamicPlasmaStrategy: Bounded }
  = await import('../src/zenon/bounded-dynamic-plasma-strategy.js');
const { accountBlockHashHex: oracleHash }
  = await import('../test-support/phase2a-account-block-preimage.js');
const { paymentIntentDigest } = await import('../src/canonical.js');
const { snapshotDynamicPlasmaQuoteRequestContext: requestContext }
  = await import('../src/zenon/dynamic-plasma-observation-normalizer.js');
//130 retained authored scenarios, requalified only because the imported
// planner graph changed. Existing bodies are unchanged outside8 pin arrays.
await import('./dynamic-plasma-user-send-work-input.behavior.draft.mjs');

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

function input(ctx, changes = {}) {
  return { subjectInputVersion: 1, phase: 'UNSIGNED',
    paymentRequired: ctx.paymentRequired, accepted: ctx.accepted, payerAddress: ctx.payerAddress,
    compiledSporkIds: ctx.compiledSporkIds,
    accountFrontier: { address: ctx.payerAddress, chainIdentifier: 73404, hash: PREVIOUS, height: 6 },
    momentumAcknowledged: copy(ctx.subject.momentumAcknowledged), ...changes };
}
function frozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) frozen(child);
}
function bindingError(error) {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, 'zenon_user_send_binding_input_rejected');
  assert.equal(error.message, error.code); assert.equal(error.stack, 'TypeError: ' + error.code);
  assert.equal(Object.hasOwn(error, 'cause'), false); return true;
}
function workRequestError(error) {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, 'zenon_user_send_work_request_rejected'); return true;
}
function assemblyError(error) {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, 'zenon_user_send_assembly_input_rejected'); return true;
}
function fullBinding(ctx, subject) {
  return bindSubject({ bindingVersion: 1, subject,
    paymentRequired: ctx.paymentRequired, accepted: ctx.accepted,
    payerAddress: ctx.payerAddress, compiledSporkIds: ctx.compiledSporkIds });
}
function updateObservedFrontier(ctx, count) {
  for (const endpoint of ctx.observation.endpointObservations) {
    for (const frontier of [endpoint.beforeFrontier, endpoint.afterFrontier]) {
      frontier.height = 100 + count; frontier.hash = count === 1 ? H1 : H2;
    }
  }
}

test('subject producer derives exact next account sequence and selected intent fields without caller transfer overrides', { timeout: 5000 }, () => {
  const ctx = context(), source = input(ctx), before = copy(source), subject = produce(source);
  assert.deepEqual(subject, ctx.subject);
  assert.equal(subject.height, 7); assert.equal(subject.previousHash, PREVIOUS);
  assert.equal(subject.version, 1); assert.equal(subject.blockType, 2);
  assert.equal(subject.fromBlockHash, ZERO);
  assert.equal(subject.toAddress, ctx.accepted.payTo); assert.equal(subject.amount, '5');
  assert.equal(subject.tokenStandard, ASSET); assert.equal(subject.chainIdentifier, 73404);
  assert.equal(subject.data, Buffer.from(paymentIntentDigest(ctx.paymentRequired, ctx.accepted), 'hex').toString('base64'));
  assert.equal(Object.keys(subject).length, 13);
  assert.equal(Object.getPrototypeOf(subject), Object.prototype);
  assert.notEqual(subject.momentumAcknowledged, source.momentumAcknowledged);
  assert.deepEqual(fullBinding(ctx, subject).subject, subject); frozen(subject);
  assert.deepEqual(source, before); assert.equal(Object.isFrozen(source), false);
});

test('subject producer accepts only an explicit coherent empty-frontier declaration and never treats unavailable data as empty', { timeout: 5000 }, () => {
  const ctx = context(), source = input(ctx);
  source.accountFrontier.height = 0; source.accountFrontier.hash = ZERO;
  const first = produce(source);
  assert.equal(first.height, 1); assert.equal(first.previousHash, ZERO);
  assert.equal(first.address, ctx.payerAddress); frozen(first);
  for (const accountFrontier of [null, undefined, false, {}, [], 'unavailable']) {
    assert.throws(() => produce({ ...source, accountFrontier }), bindingError);
  }
  for (const [height, hash] of [[0, PREVIOUS], [6, ZERO], [-0, ZERO], [1, ZERO]]) {
    assert.throws(() => produce({ ...source, accountFrontier: { ...source.accountFrontier, height, hash } }), bindingError);
  }
  const absent = copy(source); delete absent.accountFrontier;
  assert.throws(() => produce(absent), bindingError);
});

test('subject producer binds declared frontier address and chain to the independently selected payer and profile', { timeout: 5000 }, () => {
  const ctx = context(), source = input(ctx);
  for (const changes of [{ address: B }, { chainIdentifier: 73405 }, { chainIdentifier: '73404' }]) {
    assert.throws(() => produce({ ...source, accountFrontier: { ...source.accountFrontier, ...changes } }), bindingError);
  }
  assert.throws(() => produce({ ...source, payerAddress: B }), bindingError);
  const selected = copy(source); selected.accepted.extra.zenonChain.chainIdentifier = '73405';
  selected.paymentRequired.accepts[0] = copy(selected.accepted);
  assert.throws(() => produce(selected), bindingError);
  assert.equal(produce(source).address, ctx.payerAddress);
});

test('subject producer preserves exact safe sequence arithmetic and rejects overflow coercion and inconsistent frontier pairs', { timeout: 5000 }, () => {
  const ctx = context(), source = input(ctx);
  const edge = produce({ ...source, accountFrontier: { ...source.accountFrontier, height: Number.MAX_SAFE_INTEGER - 1 } });
  assert.equal(edge.height, Number.MAX_SAFE_INTEGER); assert.equal(edge.previousHash, PREVIOUS);
  let hooks = 0; const hook = () => { hooks += 1; throw new Error('HOOK'); };
  for (const height of [-0, -1, 1.5, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, 1n, '6', { valueOf: hook, [Symbol.toPrimitive]: hook }]) {
    assert.throws(() => produce({ ...source, accountFrontier: { ...source.accountFrontier, height } }), bindingError);
  }
  for (const chainIdentifier of [0, -0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 73404n, { valueOf: hook }]) {
    assert.throws(() => produce({ ...source, accountFrontier: { ...source.accountFrontier, chainIdentifier } }), bindingError);
  }
  assert.equal(hooks, 0);
});

test('subject producer derives recipient amount asset and intent data from the exact selected challenge', { timeout: 5000 }, () => {
  const ctx = context(), source = input(ctx), original = produce(source), changed = copy(source);
  changed.accepted.payTo = C; changed.accepted.amount = '7'; changed.accepted.asset = OTHER_ASSET;
  changed.paymentRequired.resource.url = 'https://resource.invalid/different';
  changed.paymentRequired.accepts[0] = copy(changed.accepted);
  const subject = produce(changed);
  assert.equal(subject.toAddress, C); assert.equal(subject.amount, '7');
  assert.equal(subject.tokenStandard, OTHER_ASSET);
  assert.equal(subject.data, Buffer.from(paymentIntentDigest(changed.paymentRequired, changed.accepted), 'hex').toString('base64'));
  assert.notEqual(subject.data, original.data);
  assert.equal(subject.address, original.address); assert.equal(subject.previousHash, original.previousHash);
  assert.equal(subject.height, original.height);
  const mismatch = copy(changed); mismatch.paymentRequired.accepts[0].amount = '8';
  assert.throws(() => produce(mismatch), bindingError);
});

test('derived subject flows through original DP quote work input and the existing unsigned assembler', { timeout: 5000 }, async () => {
  const ctx = keyContext(), source = input(ctx);
  ctx.subject = produce(source); refreshRequest(ctx);
  const quote = await new Bounded().quoteUserSend(ctx), request = await workRequest(ctx, quote);
  const result = await assemble(ctx, quote, { materialVersion: 1, publicKey: PUBLIC, nonce: NONCE });
  for (const [key, value] of Object.entries(ctx.subject)) {
    if (key !== 'subjectVersion') assert.deepEqual(result.accountBlock[key], value);
  }
  assert.equal(request.accountBlock.height, 7);
  assert.equal(request.accountBlock.previousHash, PREVIOUS);
  assert.equal(result.accountBlock.fusedPlasma, 25410); assert.equal(result.accountBlock.difficulty, 0);
  assert.equal(result.accountBlock.hash, oracleHash(result.accountBlock));
  assert.equal(result.accountBlock.signature, '');
  assert.equal(result.authority, 'NONE'); assert.equal(result.afterSigningAction, 'NONE');
});

test('advanced account frontier cannot reuse the original DP quote or reset its prior account sequence', { timeout: 5000 }, async () => {
  const ctx = keyContext(); ctx.subject = produce(input(ctx)); refreshRequest(ctx);
  const quote = await new Bounded().quoteUserSend(ctx), before = copy(quote), current = copy(ctx);
  const source = input(current); source.accountFrontier.height = 7; source.accountFrontier.hash = '77'.repeat(32);
  current.subject = produce(source); refreshRequest(current);
  assert.equal(current.subject.height, 8); assert.equal(current.subject.previousHash, '77'.repeat(32));
  await assert.rejects(workRequest(current, quote), workRequestError);
  await assert.rejects(assemble(current, quote, { materialVersion: 1, publicKey: PUBLIC, nonce: NONCE }), assemblyError);
  const foreign = copy(ctx), sameHeight = input(foreign); sameHeight.accountFrontier.hash = '88'.repeat(32);
  foreign.subject = produce(sameHeight); refreshRequest(foreign);
  assert.equal(foreign.subject.height, ctx.subject.height);
  await assert.rejects(workRequest(foreign, quote), workRequestError);
  await assert.rejects(assemble(foreign, quote, { materialVersion: 1, publicKey: PUBLIC, nonce: NONCE }), assemblyError);
  const reset = copy(ctx), empty = input(reset); empty.accountFrontier.height = 0; empty.accountFrontier.hash = ZERO;
  reset.subject = produce(empty); refreshRequest(reset);
  await assert.rejects(workRequest(reset, quote), workRequestError);
  assert.deepEqual(quote, before);
});

test('changed acknowledgement remains explicit and cannot refresh the original quoted Momentum binding', { timeout: 5000 }, async () => {
  const ctx = keyContext(), source = input(ctx); ctx.subject = produce(source); refreshRequest(ctx);
  const quote = await new Bounded().quoteUserSend(ctx), current = copy(ctx), changed = input(current);
  changed.momentumAcknowledged = { hash: H2, height: 102 };
  current.subject = produce(changed); refreshRequest(current); updateObservedFrontier(current, 2);
  assert.equal(current.subject.momentumAcknowledged.hash, H2);
  await assert.rejects(workRequest(current, quote), workRequestError);
  for (const momentumAcknowledged of [undefined, null, {}, { hash: H, height: 0 }, { hash: H, height: -0 }, { hash: H, height: 100, newest: true }]) {
    assert.throws(() => produce({ ...source, momentumAcknowledged }), bindingError);
  }
});

test('subject producer rejects unsupported selected offer profile resource and spork inputs', { timeout: 5000 }, () => {
  const ctx = context(), source = input(ctx);
  const mutations = [
    value => { value.paymentRequired.resource.url = 'http://resource.invalid/paid'; },
    value => { value.paymentRequired.accepts.push(copy(value.accepted)); },
    value => { value.accepted.extra.paymentFlow = 'batch-settlement'; },
    value => { value.accepted.network = 'zenon:other'; },
    value => { value.accepted.extra.zenonChain.version = 2; },
    value => { value.compiledSporkIds.dynamicPlasmaId = value.compiledSporkIds.libp2pId; },
    value => { value.compiledSporkIds.dynamicPlasmaId = 'x'.repeat(64); },
    value => { value.accepted.amount = '05'; value.paymentRequired.accepts[0] = copy(value.accepted); },
  ];
  for (const mutate of mutations) { const value = copy(source); mutate(value); assert.throws(() => produce(value), bindingError); }
  assert.deepEqual(produce(source), ctx.subject);
});

test('subject producer refuses hostile descriptors proxies and coercion without invoking caller hooks', { timeout: 5000 }, () => {
  const source = input(context()); let hooks = 0;
  const hook = () => { hooks += 1; throw new Error('HOOK'); };
  for (const [part, field] of [
    ['', 'phase'], ['accountFrontier', 'height'], ['accountFrontier', 'hash'],
    ['momentumAcknowledged', 'hash'], ['accepted', 'amount'], ['compiledSporkIds', 'dynamicPlasmaId'],
  ]) {
    const value = copy(source), target = part ? value[part] : value;
    Object.defineProperty(target, field, { get: hook, enumerable: true });
    assert.throws(() => produce(value), bindingError);
  }
  const resource = copy(source);
  Object.defineProperty(resource.paymentRequired.resource, 'url', { get: hook, enumerable: true });
  assert.throws(() => produce(resource), bindingError);
  for (const part of ['', 'accountFrontier', 'momentumAcknowledged', 'accepted', 'compiledSporkIds']) {
    const value = copy(source), target = part ? value[part] : value;
    const proxy = new Proxy(target, { get: hook, ownKeys: hook, getPrototypeOf: hook, getOwnPropertyDescriptor: hook });
    assert.throws(() => produce(part ? { ...value, [part]: proxy } : proxy), bindingError);
  }
  const callable = copy(source); callable.paymentRequired.resource.toJSON = hook;
  assert.throws(() => produce(callable), bindingError);
  const symbolic = copy(source); symbolic[Symbol('extra')] = true;
  assert.throws(() => produce(symbolic), bindingError);
  assert.equal(hooks, 0);
});

test('subject producer enforces exact phase version arity and rejects payment retry block or authority replacement arguments', { timeout: 5000 }, () => {
  const source = input(context()), before = copy(source);
  assert.throws(() => produce(), bindingError); assert.throws(() => produce(source, null), bindingError);
  for (const phase of ['SIGNED', 'UNKNOWN', 'ACKNOWLEDGED', 'VALIDATED', 'PREPARED']) {
    assert.throws(() => produce({ ...source, phase }), bindingError);
  }
  assert.throws(() => produce({ ...source, subjectInputVersion: 2 }), bindingError);
  for (const field of ['subject', 'accountBlock', 'payment', 'nonce', 'signature', 'privateKey', 'operation', 'approved', 'consumedAuthority']) {
    assert.throws(() => produce({ ...source, [field]: true }), bindingError);
  }
  const priorBlock = { ...copy(context().subject), hash: PREVIOUS, signature: '' };
  assert.throws(() => produce({ ...source, accountFrontier: priorBlock }), bindingError);
  assert.deepEqual(source, before);
});

test('subject producer returns only detached frozen DATA while the planner stub SDK signer and active runtime remain unchanged', { timeout: 5000 }, () => {
  const source = input(context()), subject = produce(source), original = copy(subject);
  frozen(subject); assert.deepEqual(copy(subject), subject);
  source.accountFrontier.height = 9; source.accountFrontier.hash = '88'.repeat(32);
  source.momentumAcknowledged.hash = H2; source.accepted.amount = '999';
  assert.deepEqual(subject, original);
  assert.throws(() => { subject.height = 999; }, TypeError);
  assert.throws(() => { subject.momentumAcknowledged.hash = H2; }, TypeError);
  for (const field of ['hash', 'nonce', 'publicKey', 'signature', 'authority', 'approved', 'prepareUnsigned']) {
    assert.equal(Object.hasOwn(subject, field), false);
  }
  const code = sources.get('../src/zenon/transaction-planner.js');
  const start = code.indexOf('export function createZenonUserSendSubject(');
  const end = code.indexOf('\n/**\n * Detached pricing-input binding only', start);
  const body = code.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(body, /const height = frontier\.height \+ 1/);
  assert.match(body, /return snapshotZenonUserSendPolicyBinding\(/);
  assert.doesNotMatch(body, /\bawait\b|readFile|fetch\s*\(|prepareBlock|generateKeyPair|randomBytes|crypto\.sign|crypto\.verify|publishRawTransaction/);
  assert.match(code, /return notImplemented\('ZenonTransactionPlanner', 'prepareUnsigned\(\)'\)/);
});
