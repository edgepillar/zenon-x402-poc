import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

// Fixed synthetic supplied-nonce DATA only; no nonce search/generation, SDK,
// native PoW producer, signing, wallet, HTTP owner or live operation is used.
assert.equal(process.argv.length, 2);
const pins = [
  ["../src/zenon/transaction-planner.js", 16004, "54c7cc2c4ac4dbae890a4f1b1b2dcb9a3f2fdacb9998ea318b8c9beb40922825"],
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
  ["../src/zenon/dynamic-plasma-user-send-work-binding.js", 4732, "2ecc56698c906795982b19641ad104fb9e1586e4a0fe4d643def9d870a72bd47"],
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

function workError(error) {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, 'zenon_user_send_work_input_rejected');
  assert.equal(error.message, error.code);
  assert.equal(error.stack, 'TypeError: ' + error.code);
  assert.equal(Object.hasOwn(error, 'cause'), false);
  return true;
}
function oracleWork(value, addressByte = 17) {
  // Independent fixed core encoder and native LE64 read, not the production
  // Bech32 decoder or its eight-step integer assembly. No nonce is chosen.
  const dataHash = createHash('sha3-256').update(Buffer.concat([
    Buffer.from([0, ...Array(19).fill(addressByte)]), Buffer.from(value.previousHash, 'hex'),
  ])).digest();
  const digest = createHash('sha3-256').update(Buffer.concat([
    Buffer.from(value.nonce, 'hex'), dataHash,
  ])).digest();
  const score = digest.readBigUInt64LE(0), range = 2n ** 64n;
  const threshold = value.difficulty === 0 ? 0n : range - range / BigInt(value.difficulty);
  return { dataHash: dataHash.toString('hex'), nonceDigest: digest.toString('hex'),
    value: score.toString(10), threshold: threshold.toString(10), accepts: score >= threshold };
}
function unchangedLabels(value) {
  assert.equal(value.authority, 'NONE'); assert.equal(value.afterSigningAction, 'NONE');
  assert.equal(value.keyAddressBinding, 'NOT_PERFORMED');
  assert.equal(value.chainAuthentication, 'NOT_ESTABLISHED');
  frozen(value);
}

test('declared work validates the supplied hash and fixed nonce against the pinned LE64 predicate',
  { timeout: 5000 }, () => {
    const ctx = context(), supplied = hashed(ctx, { fusedPlasma: 25410, difficulty: 1 });
    const before = copy(supplied), expected = oracleWork(supplied), checked = validateWork(supplied);
    assert.equal(checked.unsignedWorkValidationVersion, 1);
    assert.equal(checked.scope, 'DECLARED_UNSIGNED_USER_SEND_HASH_AND_NONCE_CONSISTENCY');
    assert.deepEqual(checked.hashBinding.accountBlock, before);
    assert.equal(checked.hashBinding.computedHash, supplied.hash);
    assert.equal(checked.work.validation, 'MATCHES_DECLARED_DIFFICULTY');
    assert.equal(checked.work.difficulty, 1);
    assert.equal(checked.work.threshold, '0');
    for (const field of ['dataHash', 'nonceDigest', 'value', 'threshold']) {
      assert.equal(checked.work[field], expected[field]);
    }
    assert.equal(checked.work.algorithm, 'GO_ZENON_E58D8E8_SHA3_256_LE64_GE_THRESHOLD');
    assert.deepEqual(supplied, before); unchangedLabels(checked);
  });

test('declared work uses exact fixed nonce bytes and unsigned threshold arithmetic without searching',
  { timeout: 5000 }, () => {
    const ctx = context();
    // A fixed enumeration of arbitrary fixture inputs, never a nonce search
    // or generation loop. Every input is checked, accepted or rejected.
    for (const nonce of ['0000000000000000', '0102030405060708', 'ffffffffffffffff']) {
      for (const difficulty of [1, 2, Number.MAX_SAFE_INTEGER]) {
        const supplied = hashed(ctx, { fusedPlasma: 25410, difficulty }, { nonce });
        const expected = oracleWork(supplied);
        if (expected.accepts) {
          const checked = validateWork(supplied);
          for (const field of ['dataHash', 'nonceDigest', 'value', 'threshold']) {
            assert.equal(checked.work[field], expected[field]);
          }
          assert.equal(checked.hashBinding.accountBlock.nonce, nonce);
        } else assert.throws(() => validateWork(supplied), workError);
      }
    }
  });

test('declared work rejects hash-correct arbitrary high-difficulty nonces that the hash-only path accepts',
  { timeout: 5000 }, () => {
    const ctx = context(), supplied = hashed(ctx,
      { fusedPlasma: 25410, difficulty: Number.MAX_SAFE_INTEGER });
    assert.equal(validateHash(supplied).computedHash, supplied.hash);
    assert.equal(oracleWork(supplied).accepts, false);
    assert.throws(() => validateWork(supplied), workError);
  });

test('declared work requires the actual block hash and never repairs stale or changed supplied bytes',
  { timeout: 5000 }, () => {
    const original = hashed(context(), { fusedPlasma: 25410, difficulty: 1 });
    for (const edit of [
      b => { b.hash = ZERO; }, b => { b.nonce = '1111111111111111'; },
      b => { b.previousHash = '77'.repeat(32); }, b => { b.difficulty = 2; },
    ]) {
      const supplied = copy(original); edit(supplied); const before = copy(supplied);
      assert.throws(() => validateWork(supplied), workError); assert.deepEqual(supplied, before);
    }
    const correct = copy(original); correct.previousHash = '77'.repeat(32); correct.hash = oracleHash(correct);
    const checked = validateWork(correct);
    assert.notEqual(checked.work.dataHash, validateWork(original).work.dataHash);
    assert.equal(checked.work.dataHash, oracleWork(correct).dataHash);
  });

test('declared zero difficulty skips the nonce predicate without claiming sufficient Plasma or work',
  { timeout: 5000 }, () => {
    for (const nonce of ['0000000000000000', '0102030405060708', 'ffffffffffffffff']) {
      const supplied = hashed(context(), { fusedPlasma: 0, difficulty: 0 }, { nonce });
      const checked = validateWork(supplied);
      assert.equal(checked.work.validation, 'NOT_REQUIRED_BY_DECLARED_ZERO_DIFFICULTY');
      for (const field of ['dataHash', 'nonceDigest', 'value', 'threshold']) assert.equal(checked.work[field], null);
      assert.equal(checked.hashBinding.accountBlock.fusedPlasma, 0);
      assert.equal(checked.hashBinding.accountBlock.nonce, nonce);
      unchangedLabels(checked);
    }
  });

test('work binding reuses the real intent hash and original price selection for the same detached block',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = await new Bounded().quoteUserSend(ctx);
    const supplied = hashed(ctx, { fusedPlasma: 25410, difficulty: 0 });
    const checked = await bindWork(ctx, quote, supplied);
    assert.equal(checked.unsignedWorkBindingVersion, 1);
    assert.equal(checked.scope, 'DECLARED_UNSIGNED_USER_SEND_HASH_NONCE_AND_PRICE_BINDING');
    assert.deepEqual(checked.hashPriceBinding.accountBlock, supplied);
    fields(checked.hashPriceBinding.selection, { fusedPlasma: 25410, difficulty: 0 });
    assert.equal(checked.hashPriceBinding.computedHash, supplied.hash);
    assert.equal(checked.work.validation, 'NOT_REQUIRED_BY_DECLARED_ZERO_DIFFICULTY');
    unchangedLabels(checked);
  });

test('work binding rejects invalid hybrid work even when actual fields and original price selection match',
  { timeout: 5000 }, async () => {
    const ctx = context({ available: 10000, maxFused: 10000, maxDifficulty: 40000000 });
    const strategy = new Bounded(), quote = await strategy.quoteUserSend(ctx);
    const selected = await strategy.applyUserSend(ctx, quote);
    assert.ok(selected.difficulty > 0);
    const supplied = hashed(ctx, selected);
    assert.equal((await strategy.bindHashedUserSend(ctx, quote, supplied)).computedHash, supplied.hash);
    assert.equal(oracleWork(supplied).accepts, false);
    await assert.rejects(bindWork(ctx, quote, supplied), workError);
    assert.deepEqual({ fusedPlasma: supplied.fusedPlasma, difficulty: supplied.difficulty }, selected);
  });

test('work consistency alone cannot replace independently bound payment selected fields or current price limits',
  { timeout: 5000 }, async () => {
    const ctx = context(), strategy = new Bounded(), quote = await strategy.quoteUserSend(ctx);
    const supplied = hashed(ctx, { fusedPlasma: 25410, difficulty: 0 });
    for (const edit of [
      b => { b.toAddress = C; }, b => { b.amount = '6'; }, b => { b.fusedPlasma = 21000; },
      b => { b.momentumAcknowledged.hash = H1; },
    ]) {
      const other = copy(supplied); edit(other); other.hash = oracleHash(other);
      assert.equal(validateWork(other).work.validation, 'NOT_REQUIRED_BY_DECLARED_ZERO_DIFFICULTY');
      await assert.rejects(bindWork(ctx, quote, other), workError);
    }
    const stale = copy(ctx);
    for (const endpoint of stale.observation.endpointObservations) {
      endpoint.beforeFrontier.height += 3; endpoint.afterFrontier.height += 3;
      endpoint.beforeFrontier.hash = H1; endpoint.afterFrontier.hash = H1;
    }
    await assert.rejects(bindWork(stale, quote, supplied), workError);
    const current = copy(ctx);
    for (const endpoint of current.observation.endpointObservations) {
      endpoint.beforeFrontier.height += 2; endpoint.afterFrontier.height += 2;
      endpoint.beforeFrontier.hash = H2; endpoint.afterFrontier.hash = H2;
    }
    const checked = await bindWork(current, quote, supplied);
    assert.equal(checked.hashPriceBinding.accountBlock.momentumAcknowledged.hash, H);
    fields(checked.hashPriceBinding.selection, { fusedPlasma: 25410, difficulty: 0 });
    unchangedLabels(checked);
  });

test('work binding uses the captured implementation without virtual preparer signer or work callbacks',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = await new Bounded().quoteUserSend(ctx);
    const supplied = hashed(ctx, { fusedPlasma: 25410, difficulty: 0 });
    const descriptor = Object.getOwnPropertyDescriptor(Bounded.prototype, 'bindHashedUserSend');
    let callbacks = 0;
    Object.defineProperty(Bounded.prototype, 'bindHashedUserSend', {
      ...descriptor, value() { callbacks += 1; throw new Error('UNTRUSTED_OVERRIDE'); },
    });
    try { unchangedLabels(await bindWork(ctx, quote, supplied)); }
    finally { Object.defineProperty(Bounded.prototype, 'bindHashedUserSend', descriptor); }
    assert.equal(callbacks, 0);
  });

test('work APIs reject hostile descriptors proxies unsafe difficulty and arity without invoking hooks',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = await new Bounded().quoteUserSend(ctx);
    const supplied = hashed(ctx, { fusedPlasma: 25410, difficulty: 0 });
    let hooks = 0;
    const hook = () => { hooks += 1; throw new Error('HOOK'); };
    for (const field of ['difficulty', 'nonce', 'address', 'hash']) {
      const hostile = copy(supplied);
      Object.defineProperty(hostile, field, { get: hook, enumerable: true });
      assert.throws(() => validateWork(hostile), workError);
      await assert.rejects(bindWork(ctx, quote, hostile), workError);
    }
    const proxy = new Proxy(supplied, {
      get: hook, getPrototypeOf: hook, getOwnPropertyDescriptor: hook, ownKeys: hook,
    });
    assert.throws(() => validateWork(proxy), workError);
    await assert.rejects(bindWork(ctx, quote, proxy), workError);
    for (const difficulty of [-0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 1n, '1',
      { valueOf: hook, [Symbol.toPrimitive]: hook }]) {
      assert.throws(() => validateWork({ ...supplied, difficulty }), workError);
    }
    assert.throws(() => validateWork(), workError);
    assert.throws(() => validateWork(supplied, null), workError);
    await assert.rejects(bindWork(ctx, quote), workError);
    await assert.rejects(bindWork(ctx, quote, supplied, null), workError);
    for (const phase of ['SIGNED', 'UNKNOWN', 'ACKNOWLEDGED', 'VALIDATED']) {
      await assert.rejects(bindWork({ ...ctx, phase }, quote, supplied), workError);
    }
    assert.equal(hooks, 0);
  });

test('work binding retains the pre-await checked bytes and returns detached serializable data without authority',
  { timeout: 5000 }, async () => {
    const ctx = context(), quote = await new Bounded().quoteUserSend(ctx);
    const supplied = hashed(ctx, { fusedPlasma: 25410, difficulty: 0 }), before = copy(supplied);
    const pending = bindWork(ctx, quote, supplied);
    supplied.nonce = 'ffffffffffffffff'; supplied.difficulty = Number.MAX_SAFE_INTEGER;
    supplied.hash = ZERO; ctx.phase = 'SIGNED';
    const checked = await pending;
    assert.deepEqual(checked.hashPriceBinding.accountBlock, before);
    assert.deepEqual(copy(checked), checked);
    unchangedLabels(checked);
    assert.throws(() => { checked.hashPriceBinding.accountBlock.nonce = ''; }, TypeError);
    assert.throws(() => { checked.work.validation = 'READY'; }, TypeError);
  });

test('work module stays opt-in fixed-cost and separate from generators owners SDK signing and publication',
  { timeout: 5000 }, () => {
    const source = sources.get('../src/zenon/dynamic-plasma-user-send-work-binding.js');
    assert.equal((source.match(/^export /gm) ?? []).length, 2);
    assert.equal((source.match(/for \(/g) ?? []).length, 1);
    assert.match(source, /for \(let index = 7; index >= 0; index -= 1\)/);
    assert.doesNotMatch(source, /while\s*\(|GetPoWNonce|getPoWNonce|quickInc|randomBytes|prepareBlock|publishRawTransaction|mnemonic|keystore/);
    assert.doesNotMatch(source, /node:(?:fs|https?|tls|dns|child_process|worker_threads)|fetch\s*\(|process\.(?:env|on)|new URL\s*\(/);
    assert.match(source, /e58d8e80eabd9fd5630ed62e0707424d96b5303c/);
    assert.match(source, /if \(value < threshold\) reject\(\)/);
    assert.match(source, /const threshold = RANGE - RANGE \/ BigInt\(block\.difficulty\)/);
  });
