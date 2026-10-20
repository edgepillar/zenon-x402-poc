// SOURCE_DRAFT / NOT_RUN: synthetic declared-data API contract cases only.
// This file grants no launch, RPC, SDK, signing, preparation or payment authority.
// The caller must independently review this entry, its guarded graph and launch.
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
const subjects = [["../src/zenon/dynamic-plasma-required-fused-quote.js",5416,133,"f5e10ff2dbfff3b6b63d87f0abadd0bb52b5d6b8fe0ead6a55fc5ea14207b730"],["../src/zenon/dynamic-plasma-price-policy.js",14957,418,"41e2e2044597cfa69c5adca292bcd762a189076be1cd939bec10798d7e35c52b"],["../package.json",1413,40,"8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"]];
for (const args of subjects) guard(...args);
const module = await import('../src/zenon/dynamic-plasma-required-fused-quote.js');
assert.deepEqual(Object.keys(module), ['validateDynamicPlasmaRequiredFusedQuote']);
const validate = module.validateDynamicPlasmaRequiredFusedQuote;
const PREFIX = 'dynamic_plasma_required_fused_quote_';
const RPC_KEYS = ['availablePlasma', 'basePlasma', 'requiredDifficulty', 'requiredFusedPlasma'];
const HASH = 'c'.repeat(64);

function input({
  fusion = 1050, work = 1100, available = 25200,
  base = 21000, difficulty = 0, total = 22050,
} = {}) {
  return {
    requiredFusedQuoteVersion: 1,
    frontier: {
      height: 100, hash: HASH, version: 2,
      nextFusionPrice: fusion, nextWorkPrice: work,
    },
    rpcObservation: {
      availablePlasma: available, basePlasma: base,
      requiredDifficulty: difficulty, requiredFusedPlasma: total,
    },
  };
}
function refuses(value, reason) {
  assert.throws(() => validate(value), error => {
    assert.ok(error instanceof TypeError && Object.isFrozen(error));
    assert.equal(typeof error.code, 'string');
    assert.ok(error.code.startsWith(PREFIX));
    if (reason !== undefined) assert.equal(error.code, PREFIX + reason);
    assert.equal(error.message, error.code);
    assert.equal(error.stack, 'TypeError: ' + error.code);
    return true;
  });
}
function records(value) {
  return [value, value.frontier, value.rpcObservation,
    value.fusedOnlyTarget, value.declaredRecommendation];
}

test('declared V2 vectors retain the exact four-field RPC quote', () => {
  // Source-derived active-DP vectors; this is not actual DP/RPC execution.
  const vectors = [
    [1000, 1000, 25200, 21000, 0, 21000],
    [1050, 1100, 25200, 21000, 0, 22050],
    [1050, 1100, 25200, 21068, 0, 22122],
    [1050, 1100, 18900, 21000, 4950000, 22050],
    [1050, 1100, 0, 21000, 34650000, 22050],
    [1000, 1000, 0, 0, 0, 0],
  ];
  for (const [fusion, work, available, base, difficulty, total] of vectors) {
    const value = input({ fusion, work, available, base, difficulty, total });
    const result = validate(value);
    assert.deepEqual(Object.keys(result.rpcObservation), RPC_KEYS);
    assert.deepEqual(result.rpcObservation, value.rpcObservation);
    assert.deepEqual(result.frontier, value.frontier);
    assert.equal(result.fusedOnlyTarget.fusedPlasmaTotal, total);
    assert.equal(result.fusedOnlyTarget.requiredDifficulty, 0);
    assert.equal(result.declaredRecommendation.requiredDifficulty, difficulty);
    assert.equal(result.declaredRecommendation.fusedPlasma, difficulty === 0 ? total : available);
  }
  const zero = validate(input({ fusion: 1000, work: 1000, available: 0, base: 0, total: 0 }));
  assert.equal(Object.hasOwn(zero.rpcObservation, 'requiredFusedPlasma'), true);
  assert.strictEqual(zero.rpcObservation.requiredFusedPlasma, 0);
});

test('fused-only total stays separate from shortfall and recommended PoW', () => {
  const result = validate(input({ available: 18900, difficulty: 4950000 }));
  assert.deepEqual(result.fusedOnlyTarget, {
    fusedPlasmaTotal: 22050, requiredDifficulty: 0,
  });
  assert.deepEqual(result.declaredRecommendation, {
    fusedPlasma: 18900, requiredDifficulty: 4950000, pricingMode: 'FUSION_AND_POW',
  });
  assert.notEqual(result.fusedOnlyTarget.fusedPlasmaTotal, 3150);
  const pow = validate(input({ available: 0, difficulty: 34650000 }));
  assert.equal(pow.fusedOnlyTarget.fusedPlasmaTotal, 22050);
  assert.equal(pow.fusedOnlyTarget.requiredDifficulty, 0);
  assert.equal(pow.declaredRecommendation.fusedPlasma, 0);
  assert.equal(pow.declaredRecommendation.requiredDifficulty, 34650000);
  assert.equal(pow.afterSigningAction, 'NONE');
});

test('mismatched totals difficulty and declared frontier prices refuse', () => {
  for (const total of [22049, 22051, 3150]) {
    refuses(input({ available: 18900, difficulty: 4950000, total }), 'inconsistent_total');
  }
  for (const difficulty of [0, 4949999, 4950001]) {
    refuses(input({ available: 18900, difficulty }), 'inconsistent_difficulty');
  }
  refuses(input({ fusion: 1000, available: 18900, difficulty: 4950000 }), 'inconsistent_total');
  refuses(input({ work: 1000, available: 18900, difficulty: 4950000 }), 'inconsistent_difficulty');
  for (const changes of [
    { nextFusionPrice: 999 }, { nextWorkPrice: 999 },
    { hash: 'C'.repeat(64) }, { hash: 'c'.repeat(63) }, { hash: 'g'.repeat(64) },
  ]) {
    const value = input(); Object.assign(value.frontier, changes);
    refuses(value, 'invalid_frontier');
  }
});

test('safe-integer and bounded-result refusals never coerce uint64 inputs', () => {
  const paths = [
    ['frontier', 'height'], ['frontier', 'version'],
    ['frontier', 'nextFusionPrice'], ['frontier', 'nextWorkPrice'],
    ...RPC_KEYS.map(key => ['rpcObservation', key]),
  ];
  for (const bad of [-1, -0, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '1', 1n, null, true]) {
    for (const [record, key] of paths) {
      const value = input(); value[record][key] = bad; refuses(value);
    }
  }
  const max = Number.MAX_SAFE_INTEGER;
  const edge = input({ fusion: 1000, work: 1000, available: max, base: max, total: max });
  edge.frontier.height = max;
  assert.equal(validate(edge).rpcObservation.requiredFusedPlasma, max);
  refuses(input({ fusion: 1001, work: 1000, available: max, base: max, total: max }),
    'arithmetic_bound');
  refuses(input({ fusion: 1000, work: 1000, available: 0, base: max, total: max }),
    'arithmetic_bound');
});

test('schemas reject extra missing inherited symbolic and nonordinary fields', () => {
  const groups = [
    [null, ['requiredFusedQuoteVersion', 'frontier', 'rpcObservation']],
    ['frontier', ['height', 'hash', 'version', 'nextFusionPrice', 'nextWorkPrice']],
    ['rpcObservation', RPC_KEYS],
  ];
  for (const [group, keys] of groups) {
    for (const key of keys) {
      const missing = input(), hidden = input();
      delete (group === null ? missing : missing[group])[key];
      refuses(missing, 'invalid_data');
      Object.defineProperty(group === null ? hidden : hidden[group], key, { enumerable: false });
      refuses(hidden, 'invalid_data');
    }
    for (const extra of ['extra', Symbol('extra')]) {
      const value = input(); (group === null ? value : value[group])[extra] = 1;
      refuses(value, 'invalid_data');
    }
    for (const nullPrototype of [false, true]) {
      const value = input(), original = group === null ? value : value[group];
      const replacement = Object.create(nullPrototype ? null : original);
      if (nullPrototype) Object.assign(replacement, original);
      if (group === null) refuses(replacement, 'invalid_data');
      else { value[group] = replacement; refuses(value, 'invalid_data'); }
    }
  }
  for (const value of [null, undefined, [], new Date(0), () => input()]) refuses(value, 'invalid_data');
  assert.throws(() => validate(), { code: PREFIX + 'invalid_data' });
  assert.throws(() => validate(input(), input()), { code: PREFIX + 'invalid_data' });
});

test('hostile descriptors proxies and coercion hooks are never invoked', () => {
  let touched = 0;
  const trip = () => { touched++; throw new Error('HOOK_MUST_NOT_RUN'); };
  const handler = { get: trip, ownKeys: trip, getPrototypeOf: trip, getOwnPropertyDescriptor: trip };
  for (const group of [null, 'frontier', 'rpcObservation']) {
    const value = input(), target = group === null ? value : value[group];
    for (const key of Object.keys(target)) {
      const candidate = input(), object = group === null ? candidate : candidate[group];
      Object.defineProperty(object, key, { enumerable: true, get: trip });
      refuses(candidate, 'invalid_data');
    }
    const proxy = new Proxy(target, handler);
    if (group === null) refuses(proxy, 'invalid_data');
    else { value[group] = proxy; refuses(value, 'invalid_data'); }
  }
  const revoked = Proxy.revocable(input(), handler); revoked.revoke();
  refuses(revoked.proxy, 'invalid_data');
  const inherited = Object.create(Object.defineProperty({}, 'frontier', { get: trip }));
  refuses(inherited, 'invalid_data');
  const coercion = { valueOf: trip, toString: trip, [Symbol.toPrimitive]: trip };
  for (const field of RPC_KEYS) {
    const value = input(); value.rpcObservation[field] = coercion; refuses(value, 'unsafe_integer');
  }
  const hashObject = input(); hashObject.frontier.hash = coercion; refuses(hashObject, 'invalid_frontier');
  const numericProxy = input(); numericProxy.rpcObservation.basePlasma = new Proxy({}, handler);
  refuses(numericProxy, 'unsafe_integer');
  const symbolic = input(); Object.defineProperty(symbolic, Symbol.toStringTag, { get: trip });
  refuses(symbolic, 'invalid_data');
  assert.equal(touched, 0);
});

test('normalization detaches and freezes DATA without mutating caller input', () => {
  const value = input(), before = JSON.stringify(value);
  const result = validate(value), other = validate(value);
  assert.equal(JSON.stringify(value), before);
  assert.equal(Object.isFrozen(value), false);
  assert.equal(Object.isFrozen(value.frontier), false);
  assert.equal(Object.isFrozen(value.rpcObservation), false);
  assert.deepEqual(result, other);
  assert.notStrictEqual(result, other);
  assert.notStrictEqual(result.frontier, value.frontier);
  assert.notStrictEqual(result.rpcObservation, value.rpcObservation);
  for (const record of records(result)) assert.equal(Object.isFrozen(record), true);
  assert.throws(() => { result.rpcObservation.requiredFusedPlasma = 0; }, TypeError);
  value.frontier.nextFusionPrice = 1000;
  value.rpcObservation.requiredFusedPlasma = 21000;
  assert.equal(result.frontier.nextFusionPrice, 1050);
  assert.equal(result.rpcObservation.requiredFusedPlasma, 22050);
});

test('legacy versions refuse and declared matches grant no action authority', () => {
  for (const version of [0, 2, '1', null, 1n]) {
    const value = input(); value.requiredFusedQuoteVersion = version;
    refuses(value, 'unsupported_contract_version');
  }
  for (const version of [0, 1, 3]) {
    const value = input({ fusion: 1000, work: 1000, total: 21000 });
    value.frontier.version = version; refuses(value, 'unsupported_frontier_version');
  }
  const legacy = input(); delete legacy.rpcObservation.requiredFusedPlasma;
  refuses(legacy, 'invalid_data');
  const namespace = input(); delete namespace.requiredFusedQuoteVersion; namespace.quoteVersion = 1;
  refuses(namespace, 'invalid_data');
  const value = input(); value.frontier.hash = 'd'.repeat(64); value.frontier.height = 0;
  const result = validate(value);
  assert.equal(result.requiredFusedQuoteVersion, 1);
  assert.equal(result.scope, 'DECLARED_V2_REQUIRED_FUSED_TOTAL');
  assert.equal(result.chainAuthentication, 'NOT_ESTABLISHED');
  assert.equal(result.activation, 'NOT_ESTABLISHED');
  assert.equal(result.afterSigningAction, 'NONE');
  assert.equal(result.authority, 'NONE');
  assert.equal(result.numberRepresentation, 'NONNEGATIVE_SAFE_INTEGER_ONLY');
  for (const record of records(result)) {
    for (const field of Reflect.ownKeys(record)) assert.notEqual(typeof record[field], 'function');
  }
});
