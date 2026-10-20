// SOURCE_DRAFT / NOT_RUN: synthetic declared-DATA adapter contract only.
// Independently review the complete graph and caller before a separate launch.
// No SDK, RPC, PoW, signing, payment, restart or live-pilot claim is made.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  constants, openSync, readSync, closeSync, lstatSync, fstatSync,
} from 'node:fs';
import { createHash } from 'node:crypto';

assert.equal(process.versions.node, '24.19.0', 'EXACT_NODE_VERSION_REQUIRED');
assert.equal(process.argv.length, 2, 'ONE_EXPLICIT_FILE_REQUIRED');
const stamp = s => [
  s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink, s.size, s.mtimeNs, s.ctimeNs,
];
function guard(relative, bytes, LF, sha256) {
  const url = new URL(relative, import.meta.url);
  const before = lstatSync(url, { bigint: true });
  assert.ok(before.isFile() && !before.isSymbolicLink());
  assert.equal(before.nlink, 1n);
  assert.equal(before.size, BigInt(bytes));
  const fd = openSync(url, constants.O_RDONLY | constants.O_NOFOLLOW);
  const raw = Buffer.alloc(bytes + 1);
  let count = 0, readError = null, closeError = null;
  try {
    assert.deepEqual(stamp(fstatSync(fd, { bigint: true })), stamp(before));
    while (count < raw.length) {
      const size = readSync(fd, raw, count, raw.length - count, null);
      if (size === 0) break;
      count += size;
    }
    assert.equal(count, bytes);
    assert.equal(readSync(fd, raw, 0, 1, null), 0);
    assert.deepEqual(stamp(fstatSync(fd, { bigint: true })), stamp(before));
  } catch (error) { readError = error; }
  finally { try { closeSync(fd); } catch (error) { closeError = error; } }
  if (readError !== null || closeError !== null) {
    throw new AggregateError([readError, closeError].filter(value => value !== null),
      'SOURCE_READ_OR_CLOSE_FAILED');
  }
  assert.deepEqual(stamp(lstatSync(url, { bigint: true })), stamp(before));
  const data = raw.subarray(0, bytes);
  assert.equal(createHash('sha256').update(data).digest('hex'), sha256);
  const text = data.toString('utf8');
  assert.equal(/[^\x00-\x7f]/.test(text) || text.includes('\0'), false);
  assert.equal(text.split('\n').length - 1, LF);
  assert.ok(text.endsWith('\n'));
  if (relative === '../package.json') {
    const pkg = JSON.parse(text);
    assert.equal(pkg.type, 'module');
    assert.equal(pkg.engines.node, '>=24');
  }
}
const subjects = [
  ['../src/zenon/dynamic-plasma-required-fused-policy-adapter.js', 8050, 205,
    '6be7cdd599adb153cda29272bc503d185014718398886b35546756383b4e18ac'],
  ['../src/zenon/dynamic-plasma-price-policy.js', 14957, 418,
    '41e2e2044597cfa69c5adca292bcd762a189076be1cd939bec10798d7e35c52b'],
  ['../src/zenon/dynamic-plasma-compatibility.js', 7732, 225,
    'b3989ce15e5f2e9d07b0ed035fe96bcce9f22cac93f5e497fdca5c37bf7618dd'],
  ['../src/zenon/dynamic-plasma-required-fused-quote.js', 5416, 133,
    'f5e10ff2dbfff3b6b63d87f0abadd0bb52b5d6b8fe0ead6a55fc5ea14207b730'],
  ['../package.json', 1413, 40,
    '8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5'],
];
for (const args of subjects) guard(...args);
const api = await import('../src/zenon/dynamic-plasma-required-fused-policy-adapter.js');
assert.deepEqual(Object.keys(api), [
  'createDynamicPlasmaRequiredFusedPolicyQuote',
  'selectDynamicPlasmaRequiredFusedPolicyFields',
  'validateDynamicPlasmaRequiredFusedPolicySelection',
]);
const create = api.createDynamicPlasmaRequiredFusedPolicyQuote;
const select = api.selectDynamicPlasmaRequiredFusedPolicyFields;
const validate = api.validateDynamicPlasmaRequiredFusedPolicySelection;
const CODE = 'dynamic_plasma_required_fused_policy_input_rejected';
const RPC_KEYS = ['availablePlasma', 'basePlasma', 'requiredDifficulty', 'requiredFusedPlasma'];
const copy = value => JSON.parse(JSON.stringify(value)); // Trusted fixture DATA only.

function input({
  base = 21000, available = 30000, fusion = 1000, work = 1000,
  difficulty = 0, total = Math.ceil(base * fusion / 1000),
  height = 100, hash = 'a'.repeat(64), advances = 0,
  maxFused = 30000, maxDifficulty = 100000000,
} = {}) {
  const frontier = {
    height, hash, version: 2, nextFusionPrice: fusion, nextWorkPrice: work,
  };
  return {
    requiredFusedPolicyVersion: 1,
    observation: {
      chainProfileMatch: { classification: 'MATCH' },
      beforeFrontier: { ...frontier },
      rpcObservation: {
        availablePlasma: available, basePlasma: base,
        requiredDifficulty: difficulty, requiredFusedPlasma: total,
      },
      afterFrontier: { ...frontier },
    },
    policy: {
      policyVersion: 1, maxPriceChangePercent: 10, maxMomentumAdvances: advances,
      maxFusedPlasma: maxFused, maxDifficulty,
    },
    subjectDigest: 'sha256:' + 'b'.repeat(64),
    runtimeContextDigest: 'sha256:' + 'c'.repeat(64),
  };
}
function refuses(call) {
  assert.throws(call, error => {
    assert.ok(error instanceof TypeError && Object.isFrozen(error));
    assert.equal(error.code, CODE);
    assert.equal(error.message, CODE);
    assert.equal(error.stack, 'TypeError: ' + CODE);
    assert.equal(Object.hasOwn(error, 'cause'), false);
    return true;
  });
}
function existingRefuses(value, quote, selection = { fusedPlasma: 21000, difficulty: 0 }) {
  refuses(() => select({ ...value, quote }));
  refuses(() => validate({ ...value, quote, selection }));
}
function allRefuse(value, quote) {
  refuses(() => create(value));
  existingRefuses(value, quote);
}
function assertFrozenTree(value) {
  if (typeof value !== 'object' || value === null) return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertFrozenTree(child);
}

test('four-field policy adapter shares exact fusion-only planner and validator fields', () => {
  const value = input(), before = copy(value), quote = create(value);
  assert.deepEqual(value, before);
  assert.deepEqual(quote.sourceObservation, value.observation);
  assert.deepEqual(Object.keys(quote.sourceObservation.rpcObservation), RPC_KEYS);
  assert.equal(quote.sourceObservation.rpcObservation.requiredFusedPlasma, 21000);
  assert.equal(quote.pricePolicyQuote.sourceCompatibility.quote.rpcObservation.basePlasma, 21000);
  const pair = { fusedPlasma: 21000, difficulty: 0 };
  assert.deepEqual(select({ ...value, quote }), pair);
  assert.deepEqual(validate({ ...value, quote, selection: pair }), pair);
  assert.deepEqual(Object.keys(select({ ...value, quote })), ['fusedPlasma', 'difficulty']);
  assert.equal(quote.requiredFusedPolicyQuoteVersion, 1);
  assert.equal(quote.scope, 'DECLARED_V2_REQUIRED_FUSED_PRICE_POLICY');
});

test('four-field policy headroom stays distinct from observed total across two advances', () => {
  const value = input({ advances: 2 }), quote = create(value);
  const pair = { fusedPlasma: 25410, difficulty: 0 };
  assert.equal(quote.sourceObservation.rpcObservation.requiredFusedPlasma, 21000);
  assert.deepEqual(quote.pricePolicyQuote.boundPrices, { fusionPrice: 1210, workPrice: 1210 });
  assert.deepEqual(quote.pricePolicyQuote.selected, pair);
  for (const [age, price, total, hash] of [
    [0, 1000, 21000, 'a'], [1, 1100, 23100, 'd'], [2, 1210, 25410, 'e'],
  ]) {
    const now = input({
      advances: 2, height: 100 + age, fusion: price, work: price,
      total, hash: hash.repeat(64),
    });
    assert.deepEqual(select({ ...now, quote }), pair);
    assert.deepEqual(validate({ ...now, quote, selection: pair }), pair);
    assert.equal(quote.sourceObservation.rpcObservation.requiredFusedPlasma, 21000);
  }
});

test('four-field policy hybrid plan never attaches fused-only total alongside PoW', () => {
  for (const [available, difficulty] of [[18900, 4950000], [0, 34650000]]) {
    const value = input({ available, fusion: 1050, work: 1100, total: 22050, difficulty });
    const quote = create(value), pair = { fusedPlasma: available, difficulty };
    assert.equal(quote.sourceObservation.rpcObservation.requiredFusedPlasma, 22050);
    assert.deepEqual(select({ ...value, quote }), pair);
    assert.deepEqual(validate({ ...value, quote, selection: pair }), pair);
    refuses(() => validate({
      ...value, quote, selection: { fusedPlasma: 22050, difficulty },
    }));
  }
});

test('four-field policy refuses missing or inconsistent current and original totals', () => {
  const value = input(), quote = create(value);
  for (const total of [0, 3150, 20999, 21001, undefined]) {
    const bad = input();
    if (total === undefined) delete bad.observation.rpcObservation.requiredFusedPlasma;
    else bad.observation.rpcObservation.requiredFusedPlasma = total;
    allRefuse(bad, quote);
    const changed = copy(quote);
    if (total === undefined) delete changed.sourceObservation.rpcObservation.requiredFusedPlasma;
    else changed.sourceObservation.rpcObservation.requiredFusedPlasma = total;
    existingRefuses(value, changed);
  }
});

test('four-field policy binds stable observed frontier and refuses unsupported admission', () => {
  const quote = create(input());
  for (const mutate of [
    v => { v.observation.afterFrontier.hash = 'd'.repeat(64); },
    v => { v.observation.afterFrontier.height++; },
    v => { v.observation.afterFrontier.nextFusionPrice++; },
    v => { v.observation.chainProfileMatch.classification = 'MISMATCH'; },
    v => { v.observation.chainProfileMatch.classification = 'UNAVAILABLE'; },
    v => { v.observation.beforeFrontier = null; },
    v => { v.observation.afterFrontier = null; },
    v => { v.observation.rpcObservation = null; },
    v => { v.observation.beforeFrontier.version = v.observation.afterFrontier.version = 1; },
    v => { v.observation.beforeFrontier.version = v.observation.afterFrontier.version = 3; },
    v => { v.observation.beforeFrontier.height = v.observation.afterFrontier.height = 0; },
  ]) {
    const bad = input(); mutate(bad); allRefuse(bad, quote);
  }
  allRefuse(input({ base: 0, available: 0, total: 0 }), quote);
  // Coherent NEW quote data may be admitted; it cannot rewrite this receipt.
  const changed = input({ fusion: 1100, work: 1100, total: 23100 });
  assert.equal(create(changed).sourceObservation.rpcObservation.requiredFusedPlasma, 23100);
  existingRefuses(changed, quote);
});

test('four-field policy rebuild refuses changed bindings and nested receipt tampering', () => {
  const value = input(), quote = create(value);
  for (const field of ['subjectDigest', 'runtimeContextDigest']) {
    const changed = input(); changed[field] = 'sha256:' + 'f'.repeat(64);
    existingRefuses(changed, quote);
  }
  const otherPolicy = input({ advances: 1 });
  existingRefuses(otherPolicy, quote);
  for (const mutate of [
    q => { q.requiredFusedPolicyQuoteVersion = 2; },
    q => { q.scope = 'OTHER'; },
    q => { q.chainAuthentication = 'ESTABLISHED'; },
    q => { q.activation = 'ESTABLISHED'; },
    q => { q.afterSigningAction = 'REPLACE'; },
    q => { q.authority = 'SIGN'; },
    q => { q.extra = true; },
    q => { q.pricePolicyQuote.selected.fusedPlasma++; },
    q => { q.pricePolicyQuote.boundPrices.fusionPrice++; },
    q => { q.pricePolicyQuote.subjectDigest = 'sha256:' + 'f'.repeat(64); },
    q => { q.pricePolicyQuote.policy.maxMomentumAdvances++; },
    q => {
      q.sourceObservation.beforeFrontier.hash = 'd'.repeat(64);
      q.sourceObservation.afterFrontier.hash = 'd'.repeat(64);
    },
  ]) {
    const changed = copy(quote); mutate(changed); existingRefuses(value, changed);
  }
});

test('four-field policy delegates stale resource and price bounds without refreshing authority', () => {
  const origin = input(), quote = create(origin);
  existingRefuses(input({ height: 101, hash: 'd'.repeat(64) }), quote);
  existingRefuses(input({ available: 0, difficulty: 31500000 }), quote);
  const noResources = input({ maxFused: 0, maxDifficulty: 0 });
  refuses(() => create(noResources));
  existingRefuses(noResources, quote);
  const bounded = input({ advances: 2 }), boundedQuote = create(bounded);
  existingRefuses(input({
    advances: 2, height: 101, hash: 'd'.repeat(64),
    fusion: 1211, work: 1211, total: 25431,
  }), boundedQuote, { fusedPlasma: 25410, difficulty: 0 });
  existingRefuses(input({
    advances: 2, height: 101, hash: 'd'.repeat(64), base: 21001, total: 21001,
  }), boundedQuote, { fusedPlasma: 25410, difficulty: 0 });
  assert.equal(quote.afterSigningAction, 'NONE');
  assert.equal(quote.authority, 'NONE');
});

test('four-field policy validator requires the original selected pair not a fresh recommendation', () => {
  const value = input({ advances: 2 }), quote = create(value);
  for (const selection of [
    { fusedPlasma: 21000, difficulty: 0 },
    { fusedPlasma: 25411, difficulty: 0 },
    { fusedPlasma: 25410, difficulty: 1 },
    { fusedPlasma: 0, difficulty: 25410 },
    { fusedPlasma: 25410, difficulty: 0, extra: true },
    { fusedPlasma: '25410', difficulty: 0 },
    { fusedPlasma: 25410, difficulty: -0 },
    [], null,
  ]) refuses(() => validate({ ...value, quote, selection }));
  assert.deepEqual(validate({
    ...value, quote, selection: { fusedPlasma: 25410, difficulty: 0 },
  }), quote.pricePolicyQuote.selected);
});

test('four-field policy hostile records and unsafe primitives refuse without invoking hooks', () => {
  let touched = 0;
  const trip = () => { touched++; throw new Error('HOOK_MUST_NOT_RUN'); };
  const handler = { get: trip, ownKeys: trip, getPrototypeOf: trip, getOwnPropertyDescriptor: trip };
  const quote = create(input());
  const paths = [
    [], ['observation'], ['observation', 'chainProfileMatch'],
    ['observation', 'beforeFrontier'], ['observation', 'rpcObservation'],
    ['observation', 'afterFrontier'], ['policy'], ['quote'],
    ['quote', 'sourceObservation'], ['quote', 'sourceObservation', 'rpcObservation'],
    ['quote', 'pricePolicyQuote'], ['quote', 'pricePolicyQuote', 'selected'], ['selection'],
  ];
  const request = () => ({
    ...input(), quote: copy(quote), selection: { fusedPlasma: 21000, difficulty: 0 },
  });
  const at = (value, path) => path.reduce((v, key) => v[key], value);
  for (const path of paths) {
    const pristine = request(), target = at(pristine, path);
    for (const key of Object.keys(target)) {
      const value = request();
      Object.defineProperty(at(value, path), key, { enumerable: true, get: trip });
      refuses(() => validate(value));
    }
    for (const replacement of [new Proxy(target, handler), Object.create(target)]) {
      if (path.length === 0) refuses(() => validate(replacement));
      else {
        const value = request();
        at(value, path.slice(0, -1))[path.at(-1)] = replacement;
        refuses(() => validate(value));
      }
    }
    const symbolic = request();
    Object.defineProperty(at(symbolic, path), Symbol.toStringTag, { get: trip });
    refuses(() => validate(symbolic));
  }
  const revoked = Proxy.revocable(request(), handler); revoked.revoke();
  for (const call of [create, select, validate]) refuses(() => call(revoked.proxy));
  const coercion = { valueOf: trip, toString: trip, [Symbol.toPrimitive]: trip };
  for (const field of RPC_KEYS) {
    const value = input(); value.observation.rpcObservation[field] = coercion;
    allRefuse(value, quote);
  }
  const selection = { fusedPlasma: coercion, difficulty: 0 };
  refuses(() => validate({ ...input(), quote, selection }));
  for (const bad of [-0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '1', 1n]) {
    const value = input(); value.observation.rpcObservation.requiredFusedPlasma = bad;
    allRefuse(value, quote);
  }
  const unsafe = input();
  unsafe.observation.rpcObservation.basePlasma = Number.MAX_SAFE_INTEGER;
  unsafe.observation.rpcObservation.availablePlasma = Number.MAX_SAFE_INTEGER;
  unsafe.observation.rpcObservation.requiredFusedPlasma = Number.MAX_SAFE_INTEGER;
  unsafe.observation.beforeFrontier.nextFusionPrice = 1001;
  unsafe.observation.afterFrontier.nextFusionPrice = 1001;
  allRefuse(unsafe, quote);
  assert.equal(touched, 0);
});

test('four-field policy detached DATA roundtrips preserve explicit version and no-action labels', () => {
  const value = input(), before = copy(value), quote = create(value);
  assert.deepEqual(value, before);
  assert.equal(Object.isFrozen(value), false);
  assert.notStrictEqual(quote.sourceObservation, value.observation);
  assert.notStrictEqual(quote.sourceObservation.beforeFrontier, value.observation.beforeFrontier);
  assert.notStrictEqual(quote.sourceObservation.rpcObservation, value.observation.rpcObservation);
  assert.notStrictEqual(quote.sourceObservation.afterFrontier, value.observation.afterFrontier);
  assertFrozenTree(quote);
  const restored = copy(quote), pair = { fusedPlasma: 21000, difficulty: 0 };
  assert.deepEqual(select({ ...value, quote: restored }), pair);
  assert.deepEqual(validate({ ...value, quote: restored, selection: pair }), pair);
  for (const field of ['chainAuthentication', 'activation']) {
    assert.equal(quote[field], 'NOT_ESTABLISHED');
  }
  assert.equal(quote.authority, 'NONE');
  assert.equal(quote.afterSigningAction, 'NONE');
  assert.throws(() => { quote.sourceObservation.rpcObservation.requiredFusedPlasma = 0; }, TypeError);
  value.observation.rpcObservation.requiredFusedPlasma = 0;
  assert.equal(quote.sourceObservation.rpcObservation.requiredFusedPlasma, 21000);
  for (const version of [0, 2, '1', 1n, null]) {
    const bad = input(); bad.requiredFusedPolicyVersion = version; allRefuse(bad, quote);
  }
  for (const field of Object.keys(input())) {
    const missing = input(); delete missing[field]; allRefuse(missing, quote);
    const hidden = input(); Object.defineProperty(hidden, field, { enumerable: false });
    allRefuse(hidden, quote);
  }
  for (const [call, arg] of [
    [create, input()], [select, { ...input(), quote }],
    [validate, { ...input(), quote, selection: pair }],
  ]) {
    refuses(() => call());
    refuses(() => call(arg, arg));
  }
});
