import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

// Exact declared work-input projection and pre-work request only. The nonce
// used below is a fixed retained DATA literal, never searched or generated.
assert.equal(process.argv.length, 2);
const pins = [
  ["../src/zenon/transaction-planner.js",16738,"bbf51fa2fc75df7f69973a89ae275ec709622942444eb30cea0cc9924afbf143"],
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
  ["../qualification/dynamic-plasma-user-send-policy.behavior.draft.mjs",27617,"d5d3b836530d3d47d230577f81a377c337550e61e6d5c724dba11a28928297fa"],
  ["../qualification/dynamic-plasma-prepared-user-send-fields.behavior.draft.mjs",23476,"a6824cda4f407b85098c14b99260bd3cd40e59c9dbf93f9b891a383affb4d211"],
  ["../qualification/dynamic-plasma-user-send-draft.behavior.draft.mjs",23733,"44de83fbc3ecd6d41352ad39975d803920834753c0c70a447f49f34b7277d0d9"],
  ["../test-support/phase2a-account-block-preimage.js",7724,"dde02531faaf3c45c5ab9760beba84fe56664f923c1d61fa64b077682d97dc0e"],
  ["../qualification/dynamic-plasma-user-send-hash.behavior.draft.mjs",28034,"cbf9e6f6c07a74ab021cee27ab8bcb2c6f026f0b5c1095af35e022898250884f"],
  ["../src/zenon/dynamic-plasma-user-send-work-binding.js",4522,"218b4391c97e4adde905415e20ec0e2015fca98643db85b6efd682aa3b5c5681"],
  ["../qualification/dynamic-plasma-user-send-work.behavior.draft.mjs",24164,"d654c784cbc4167e443d7c7803feee67342821d779e76a6069a410fc58a9e3ab"],
  ["../src/zenon/dynamic-plasma-user-send-key-binding.js",4237,"37ad7e74b038801297e4bffb0cb8ba92cbd79009ed32c4ae5b134fe2cb154be2"],
  ["../qualification/dynamic-plasma-user-send-key.behavior.draft.mjs",25162,"0b1409638ca89ce46268932a2286936a9de2b4069b15a0af6d7e3014641c0c9e"],
  ["../src/zenon/dynamic-plasma-user-send-assembly.js",7772,"05012a2a983ceca018674c4d1f63823f3f7ed53b0970a4b4bd486c4278832b04"],
  ["../qualification/dynamic-plasma-user-send-assembly.behavior.draft.mjs",29723,"f18951d6a475c29e1a651828e6f8ecbed60e257c12c75d6173083d18c009b953"],
  ["../src/zenon/dynamic-plasma-user-send-work-input.js",2853,"2ff9c089e5903c059746d0a1c38688a2849f94d04d429279811fbbfbb40450a4"],
  ["../src/zenon/dynamic-plasma-user-send-work-request.js",2564,"bc66c7d629eae230c46f62c88fa97960860d94b5d65d3c5611612ccae13fe9ce"],
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
// Capture new production stages before registering compatibility cases.
const { deriveZenonUserSendWorkInput: derive }
  = await import('../src/zenon/dynamic-plasma-user-send-work-input.js');
const { createZenonUnsignedUserSendWorkRequest: request }
  = await import('../src/zenon/dynamic-plasma-user-send-work-request.js');
const { validateZenonUnsignedUserSendWork: validateWork }
  = await import('../src/zenon/dynamic-plasma-user-send-work-binding.js');
const { assembleZenonUnsignedUserSend: assemble }
  = await import('../src/zenon/dynamic-plasma-user-send-assembly.js');
const { BoundedDynamicPlasmaStrategy: Bounded }
  = await import('../src/zenon/bounded-dynamic-plasma-strategy.js');
const { accountBlockHashHex: oracleHash }
  = await import('../test-support/phase2a-account-block-preimage.js');
const { paymentIntentDigest } = await import('../src/canonical.js');
const { snapshotDynamicPlasmaQuoteRequestContext: requestContext }
  = await import('../src/zenon/dynamic-plasma-observation-normalizer.js');
//118 retained authored scenarios; only3 source-pin arrays changed because
// the fixed-nonce consumer now imports the one shared work-input projection.
await import('./dynamic-plasma-user-send-assembly.behavior.draft.mjs');

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
function workHash(block, core = Buffer.from([0, ...Array(19).fill(17)])) {
  const preimage = Buffer.concat([core, Buffer.from(block.previousHash, 'hex')]);
  assert.equal(preimage.length, 52);
  return createHash('sha3-256').update(preimage).digest('hex');
}
function frozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) frozen(child);
}
function errorWith(code) {
  return error => {
    assert.ok(error instanceof TypeError && Object.isFrozen(error));
    assert.equal(error.code, code); assert.equal(error.message, code);
    assert.equal(error.stack, 'TypeError: ' + code);
    assert.equal(Object.hasOwn(error, 'cause'), false); return true;
  };
}
const inputError = errorWith('zenon_user_send_work_input_rejected');
const requestError = errorWith('zenon_user_send_work_request_rejected');
const assemblyError = errorWith('zenon_user_send_assembly_input_rejected');
function checked(result, ctx, core) {
  assert.equal(result.unsignedWorkRequestVersion, 1);
  assert.equal(result.scope, 'DECLARED_USER_SEND_WORK_REQUEST');
  assert.equal(result.stage, 'BEFORE_NONCE_GENERATION');
  assert.equal(result.preparation, 'NOT_PERFORMED');
  assert.equal(result.hashAndNonceValidation, 'NOT_PERFORMED');
  assert.equal(result.keyAddressBinding, 'NOT_PERFORMED');
  for (const receipt of [result, result.workInput]) {
    assert.equal(receipt.authority, 'NONE'); assert.equal(receipt.afterSigningAction, 'NONE');
    assert.equal(receipt.chainAuthentication, 'NOT_ESTABLISHED');
  }
  const block = result.accountBlock, input = result.workInput;
  assert.equal(block.hash, ZERO); assert.equal(block.nonce, '0'.repeat(16));
  assert.equal(block.publicKey, ''); assert.equal(block.signature, '');
  assert.equal(block.address, ctx.payerAddress);
  assert.equal(block.toAddress, ctx.accepted.payTo);
  assert.equal(block.amount, ctx.accepted.amount);
  assert.equal(block.tokenStandard, ctx.accepted.asset);
  assert.equal(block.data, ctx.subject.data);
  assert.deepEqual(result.selection, { fusedPlasma: block.fusedPlasma, difficulty: block.difficulty });
  assert.equal(input.workInputVersion, 1);
  assert.equal(input.scope, 'DECLARED_USER_SEND_WORK_INPUT');
  assert.equal(input.preimageBytes, 52); assert.equal(input.dataHashBytes, 32);
  assert.equal(input.dataHash, workHash(block, core));
  assert.equal(input.algorithm, 'GO_ZENON_E58D8E8_SHA3_256_ADDRESS20_PREVIOUS_HASH32');
  assert.equal(input.difficulty, block.difficulty);
  assert.equal(input.workRequired, block.difficulty > 0);
  assert.equal(input.subjectDigest, result.subjectDigest);
  assert.equal(input.fieldDigest, result.fieldDigest);
  assert.equal(input.nonceGeneration, 'NOT_PERFORMED');
  assert.equal(input.hashAndNonceValidation, 'NOT_PERFORMED');
  assert.deepEqual(derive(block), input); frozen(result);
}
function advance(ctx, count, price = 1000) {
  for (const endpoint of ctx.observation.endpointObservations) {
    for (const frontier of [endpoint.beforeFrontier, endpoint.afterFrontier]) {
      frontier.height = 100 + count; frontier.hash = count === 1 ? H1 : H2;
      frontier.nextFusionPrice = price; frontier.nextWorkPrice = price;
    }
    const raw = endpoint.rpcObservation;
    const total = Math.ceil(raw.basePlasma * price / 1000);
    const fused = Math.min(raw.availablePlasma, total);
    const remaining = Math.max(0, raw.basePlasma - Math.floor(fused * 1000 / price));
    raw.requiredFusedPlasma = total;
    raw.requiredDifficulty = Math.ceil(remaining * price / 1000) * 1500;
  }
}

test('work request produces the original selected hybrid difficulty and exact52-byte work input before nonce generation', { timeout: 5000 }, async () => {
  const ctx = context({ available: 10000, maxFused: 10000, maxDifficulty: 40000000 });
  const strategy = new Bounded(), quote = await strategy.quoteUserSend(ctx), before = copy([ctx, quote]);
  const result = await request(ctx, quote), draft = await strategy.createUnsignedUserSendDraft(ctx, quote);
  checked(result, ctx);
  assert.deepEqual(result.accountBlock, draft.accountBlock);
  assert.deepEqual(result.selection, quote.sourceQuote.pricePolicyQuote.selected);
  assert.equal(result.selection.fusedPlasma, 10000);
  assert.ok(result.selection.difficulty > 0 && result.selection.difficulty <= 40000000);
  assert.notEqual(result.workInput.dataHash, result.accountBlock.hash);
  assert.deepEqual([ctx, quote], before);
  assert.equal(Object.isFrozen(ctx), false); assert.equal(Object.isFrozen(quote), true);
});

test('shared work input matches independent address-frontier hashing and the existing fixed-nonce verifier', { timeout: 5000 }, async () => {
  const ctx = context(), quote = await new Bounded().quoteUserSend(ctx);
  const result = await request(ctx, quote), block = { ...copy(result.accountBlock), difficulty: 1, nonce: NONCE };
  block.hash = oracleHash(block);
  const input = derive(block), verified = validateWork(block);
  assert.equal(input.dataHash, workHash(block));
  assert.equal(verified.work.dataHash, input.dataHash);
  assert.equal(verified.work.validation, 'MATCHES_DECLARED_DIFFICULTY');
  assert.equal(verified.work.difficulty, 1);
  assert.equal(derive({ ...block, nonce: 'ff'.repeat(8) }).dataHash, input.dataHash);
  const other = { ...block, previousHash: '77'.repeat(32) };
  assert.equal(derive(other).dataHash, workHash(other));
  assert.notEqual(derive(other).dataHash, input.dataHash);
  assert.equal(derive({ ...block, difficulty: Number.MAX_SAFE_INTEGER }).difficulty, Number.MAX_SAFE_INTEGER);
});

test('fusion-only work request flows into the existing unsigned assembler without pretending to generate work', { timeout: 5000 }, async () => {
  const ctx = keyContext(), quote = await new Bounded().quoteUserSend(ctx);
  const work = await request(ctx, quote); checked(work, ctx, payerCore());
  assert.equal(work.workInput.workRequired, false); assert.equal(work.workInput.difficulty, 0);
  assert.equal(work.selection.fusedPlasma, 25410);
  const assembled = await assemble(ctx, quote, { materialVersion: 1, publicKey: PUBLIC, nonce: NONCE });
  for (const key of Object.keys(work.accountBlock)) {
    if (!['hash', 'nonce', 'publicKey'].includes(key)) assert.deepEqual(assembled.accountBlock[key], work.accountBlock[key]);
  }
  assert.equal(assembled.accountBlock.hash, oracleHash(assembled.accountBlock));
  assert.equal(derive(assembled.accountBlock).dataHash, work.workInput.dataHash);
  assert.equal(assembled.validation.workBinding.work.validation, 'NOT_REQUIRED_BY_DECLARED_ZERO_DIFFICULTY');
});

test('work request retains original selection and acknowledgement across the admitted declared price window', { timeout: 5000 }, async () => {
  const ctx = context({ available: 10000, maxFused: 10000, maxDifficulty: 40000000 });
  const quote = await new Bounded().quoteUserSend(ctx), original = await request(ctx, quote);
  for (const [count, price] of [[1, 1100], [2, 1210]]) {
    const current = copy(ctx); advance(current, count, price);
    const result = await request(current, quote); checked(result, current);
    assert.deepEqual(result.accountBlock, original.accountBlock);
    assert.deepEqual(result.workInput, original.workInput);
    assert.deepEqual(result.selection, original.selection);
    assert.equal(result.accountBlock.momentumAcknowledged.hash, H);
    assert.equal(result.accountBlock.momentumAcknowledged.height, 100);
  }
});

test('work request refuses stale price exhausted budget and intent changes without refreshing its quote', { timeout: 5000 }, async () => {
  const ctx = context({ available: 10000, maxFused: 10000, maxDifficulty: 40000000 });
  const quote = await new Bounded().quoteUserSend(ctx), before = copy(quote);
  for (const kind of ['age', 'price', 'pool', 'budget', 'resource', 'recipient']) {
    const current = copy(ctx);
    if (kind === 'age') advance(current, 3);
    if (kind === 'price') advance(current, 2, 1211);
    if (kind === 'pool') {
      for (const endpoint of current.observation.endpointObservations) endpoint.rpcObservation.availablePlasma = 9999;
      advance(current, 1);
    }
    if (kind === 'budget') current.policy.maxDifficulty = 0;
    if (kind === 'resource') current.paymentRequired.resource.url = 'https://resource.invalid/other';
    if (kind === 'recipient') current.subject.toAddress = C;
    await assert.rejects(request(current, quote), requestError);
  }
  assert.deepEqual(quote, before);
});

test('work request snapshots through the captured synchronous draft before its first await', { timeout: 5000 }, async () => {
  const ctx = context(), quote = copy(await new Bounded().quoteUserSend(ctx)), before = copy([ctx, quote]);
  const pending = request(ctx, quote);
  ctx.phase = 'SIGNED'; ctx.subject.amount = '999'; ctx.subject.previousHash = ZERO;
  ctx.observation.endpointObservations[0].rpcObservation.availablePlasma = 0;
  quote.scope = 'CHANGED'; quote.sourceQuote.pricePolicyQuote.selected.fusedPlasma = 0;
  const result = await pending; checked(result, before[0]);
  assert.equal(result.accountBlock.amount, '5');
  assert.equal(result.accountBlock.previousHash, PREVIOUS);
  assert.equal(result.accountBlock.fusedPlasma, 25410);
});

test('work input rejects hostile exact-field data unsafe numbers signatures and arity without hooks', { timeout: 5000 }, async () => {
  const ctx = context(), quote = await new Bounded().quoteUserSend(ctx);
  const { accountBlock: block } = await request(ctx, quote);
  let hooks = 0; const hook = () => { hooks += 1; throw new Error('HOOK'); };
  for (const field of ['address', 'previousHash', 'difficulty', 'nonce', 'signature']) {
    const value = copy(block);
    Object.defineProperty(value, field, { get: hook, enumerable: true });
    assert.throws(() => derive(value), inputError);
  }
  const proxy = new Proxy(block, { get: hook, ownKeys: hook, getPrototypeOf: hook, getOwnPropertyDescriptor: hook });
  assert.throws(() => derive(proxy), inputError);
  for (const difficulty of [-0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 1n, '1', { valueOf: hook }]) {
    assert.throws(() => derive({ ...block, difficulty }), inputError);
  }
  for (const changes of [
    { signature: Buffer.alloc(64, 3).toString('base64') }, { tokenStandard: ASSET.slice(0, -1) + 'q' },
    { nonce: 'ABCDEF0123456789' }, { publicKey: Buffer.alloc(31, 0).toString('base64') },
    { previousHash: 'f'.repeat(63) }, { height: 1 }, { extra: true },
  ]) assert.throws(() => derive({ ...block, ...changes }), inputError);
  assert.throws(() => derive(), inputError); assert.throws(() => derive(block, null), inputError);
  assert.equal(hooks, 0);
});

test('work request rejects hostile context quote phases and arity without invoking callbacks', { timeout: 5000 }, async () => {
  const ctx = context(), quote = await new Bounded().quoteUserSend(ctx);
  let hooks = 0; const hook = () => { hooks += 1; throw new Error('HOOK'); };
  const badContext = copy(ctx);
  Object.defineProperty(badContext.subject, 'address', { get: hook, enumerable: true });
  await assert.rejects(request(badContext, quote), requestError);
  const badQuote = copy(quote);
  Object.defineProperty(badQuote, 'sourceQuote', { get: hook, enumerable: true });
  await assert.rejects(request(ctx, badQuote), requestError);
  const proxy = new Proxy(ctx, { get: hook, ownKeys: hook, getPrototypeOf: hook, getOwnPropertyDescriptor: hook });
  await assert.rejects(request(proxy, quote), requestError);
  for (const phase of ['SIGNED', 'UNKNOWN', 'ACKNOWLEDGED', 'VALIDATED']) {
    await assert.rejects(request({ ...ctx, phase }, quote), requestError);
  }
  await assert.rejects(request(ctx), requestError);
  await assert.rejects(request(ctx, quote, null), requestError);
  assert.equal(hooks, 0);
});

test('work request uses the captured draft implementation rather than an overridden preparer', { timeout: 5000 }, async () => {
  const ctx = context(), quote = await new Bounded().quoteUserSend(ctx);
  const d = Object.getOwnPropertyDescriptor(Bounded.prototype, 'createUnsignedUserSendDraft');
  let calls = 0;
  Object.defineProperty(Bounded.prototype, 'createUnsignedUserSendDraft', {
    ...d, value() { calls += 1; throw new Error('OVERRIDE'); },
  });
  try { checked(await request(ctx, quote), ctx); }
  finally { Object.defineProperty(Bounded.prototype, 'createUnsignedUserSendDraft', d); }
  assert.equal(calls, 0);
});

test('work request never accepts a caller block material payment or replacement argument', { timeout: 5000 }, async () => {
  const ctx = context(), quote = await new Bounded().quoteUserSend(ctx), result = await request(ctx, quote);
  const before = copy([ctx, quote, result]);
  for (const extra of [result.accountBlock, { nonce: NONCE }, { payment: 'retained' }, { operation: 'RETRY' }]) {
    await assert.rejects(request(ctx, quote, extra), requestError);
  }
  await assert.rejects(request(result.accountBlock, quote), requestError);
  await assert.rejects(request(ctx, result), requestError);
  assert.deepEqual([ctx, quote, result], before);
});

test('work input equality is not an intent commitment and cannot bypass original request binding', { timeout: 5000 }, async () => {
  const ctx = context(), quote = await new Bounded().quoteUserSend(ctx), result = await request(ctx, quote);
  const foreign = { ...copy(result.accountBlock), toAddress: C, amount: '6', tokenStandard: OTHER_ASSET };
  const low = derive(foreign);
  assert.equal(low.dataHash, result.workInput.dataHash);
  assert.notEqual(low.subjectDigest, result.subjectDigest);
  assert.notEqual(low.fieldDigest, result.fieldDigest);
  const current = copy(ctx); current.subject.toAddress = C; current.subject.amount = '6';
  await assert.rejects(request(current, quote), requestError);
  const keyed = keyContext({}), keyedQuote = await new Bounded().quoteUserSend(keyed);
  await assert.rejects(assemble(keyed, keyedQuote, { materialVersion: 1, publicKey: PUBLIC, nonce: 'ff'.repeat(8), workInput: low }), assemblyError);
});

test('work input and request stay frozen serializable default-off DATA without native SDK generator or signing machinery', { timeout: 5000 }, async () => {
  const ctx = context(), quote = await new Bounded().quoteUserSend(ctx), result = await request(ctx, quote);
  checked(result, ctx); assert.deepEqual(copy(result), result);
  assert.throws(() => { result.workInput.dataHash = ZERO; }, TypeError);
  assert.throws(() => { result.accountBlock.difficulty = 0; }, TypeError);
  for (const path of [
    '../src/zenon/dynamic-plasma-user-send-work-input.js',
    '../src/zenon/dynamic-plasma-user-send-work-request.js',
  ]) {
    const source = sources.get(path);
    assert.equal((source.match(/^export /gm) ?? []).length, 1);
    assert.doesNotMatch(source, /node:(?:fs|https?|tls|dns|child_process|worker_threads)|GetPoWNonce|getPoWNonce|quickInc|generateKeyPair|randomBytes|crypto\.sign|crypto\.verify|prepareBlock|publishRawTransaction|mnemonic|keystore|fetch\s*\(|while\s*\(|for\s*\(/);
  }
  const input = sources.get('../src/zenon/dynamic-plasma-user-send-work-input.js');
  const consumer = sources.get('../src/zenon/dynamic-plasma-user-send-work-binding.js');
  assert.match(input, /preimage\.length !== 52/);
  assert.match(consumer, /Buffer\.from\(WORK_INPUT\(block\)\.dataHash, 'hex'\)/);
  assert.doesNotMatch(consumer, /HASH_CORES/);
  const producer = sources.get('../src/zenon/dynamic-plasma-user-send-work-request.js');
  assert.match(producer, /await apply\(CREATE_DRAFT, undefined, \[context, quote\]\)/);
  assert.match(producer, /DERIVE_INPUT\(draft\.accountBlock\)/);
});
