import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDynamicPlasmaHttpsObservationOwner } from '../src/zenon/dynamic-plasma-https-observation-owner.js';

const SOURCE_URL = new URL('../src/zenon/dynamic-plasma-https-observation-owner.js', import.meta.url);
const SOURCE = readFileSync(SOURCE_URL, 'utf8');
const COLLECTOR_URL = new URL('../src/zenon/dynamic-plasma-observation-collector.js', import.meta.url).href;
const NORMALIZER_URL = new URL('../src/zenon/dynamic-plasma-observation-normalizer.js', import.meta.url).href;
const PREFIX = 'dynamic_plasma_https_observation_owner_';

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

function configuration() {
  return deepFreeze({
    endpoints: [
      { route: { hostname: 'rpc-a.synthetic-public.org', path: '/rpc', ipv4Address: '93.184.216.34' }, timeoutMs: 1000, closeGraceMs: 100 },
      { route: { hostname: 'rpc-b.synthetic-public.org', path: '/rpc', ipv4Address: '1.1.1.1' }, timeoutMs: 1000, closeGraceMs: 100 },
    ],
  });
}

function controlled() {
  let resolve;
  let reject;
  const promise = new Promise((accept, refuse) => { resolve = accept; reject = refuse; });
  promise.then(() => {}, () => {});
  Object.defineProperty(promise, Symbol('runtime metadata'), { get() { throw new Error('private symbol'); } });
  return { promise: Object.freeze(promise), resolve, reject };
}

function prehandled(value, reject = false) {
  const capability = controlled();
  if (reject) capability.reject(value); else capability.resolve(value);
  return capability.promise;
}

function fixtureAddress(byte) {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const bytes = [0, ...Array(19).fill(byte)];
  const words = [];
  let acc = 0;
  let bits = 0;
  for (const value of bytes) {
    acc = (acc << 8) | value;
    bits += 8;
    while (bits >= 5) { bits -= 5; words.push((acc >>> bits) & 31); }
  }
  let checksum = 1;
  for (const word of [3, 0, 26, ...words, 0, 0, 0, 0, 0, 0]) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ word;
    for (const [index, generator] of [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3].entries()) {
      if ((top >>> index) & 1) checksum ^= generator;
    }
  }
  checksum = (checksum ^ 1) >>> 0;
  return 'z1' + [...words, ...Array.from({ length: 6 }, (_, index) => (checksum >>> (5 * (5 - index))) & 31)]
    .map(word => alphabet[word]).join('');
}

const USER = fixtureAddress(17);
const RECIPIENT = fixtureAddress(34);
const GENESIS = '11'.repeat(32);
const LIBP2P = '01'.repeat(32);
const DYNAMIC = '02'.repeat(32);

function collectorInput() {
  return {
    phase: 'UNSIGNED',
    expectedChainProfile: { version: 1, chainIdentifier: '73404', genesisMomentumHash: GENESIS },
    compiledSporkIds: { dynamicPlasmaId: DYNAMIC, libp2pId: LIBP2P },
    quoteRequest: { address: USER, blockType: 2, toAddress: RECIPIENT, data: Buffer.alloc(32, 7).toString('base64') },
  };
}

function momentum(overrides = {}) {
  return {
    version: 2, chainIdentifier: 73404, hash: '33'.repeat(32), previousHash: '44'.repeat(32),
    height: 42, timestamp: 1234, data: '', content: [], changesHash: '55'.repeat(32),
    publicKey: Buffer.alloc(32, 6).toString('base64'), signature: Buffer.alloc(64, 8).toString('base64'),
    nextFusionPrice: 1200, nextWorkPrice: 1100, producer: USER, ...overrides,
  };
}

function replies(count = 2) {
  const sporks = Array.from({ length: count }, (_, index) => ({
    id: index === 0 ? LIBP2P : index === 1 ? DYNAMIC : index.toString(16).padStart(64, '0'),
    name: index === 0 ? 'libp2p' : index === 1 ? 'dynamic-plasma' : `fixture-${index}`,
    description: 'Synthetic.', activated: index !== 0, enforcementHeight: 10,
  }));
  return [
    momentum(),
    { count: 42, list: [momentum({ version: 1, height: 2, hash: '22'.repeat(32), previousHash: GENESIS, nextFusionPrice: 0, nextWorkPrice: 0 })] },
    ...Array.from({ length: Math.max(1, Math.ceil(count / 128)) }, (_, index) => ({ count, list: sporks.slice(index * 128, (index + 1) * 128) })),
    { MaxBasePlasmaInMomentum: 4200000, FusedPlasmaTarget: 1050000, PowPlasmaTarget: 1050000, MaxPriceChangePercent: 10, PriceChangeDenominator: 20 },
    { availablePlasma: 10000, basePlasma: 21000, requiredDifficulty: 20901000 },
    momentum(),
  ];
}

function codeIs(code) {
  return error => error !== null && typeof error === 'object' && error.code === code;
}

let moduleSequence = 0;
async function loadWithFactory(factory) {
  const key = `__dp_https_observation_factory_${moduleSequence += 1}`;
  Object.defineProperty(globalThis, key, { value: factory, configurable: true });
  const fake = `export const createDynamicPlasmaHttpsReadTransportOwner = globalThis[${JSON.stringify(key)}];`;
  const fakeUrl = `data:text/javascript;base64,${Buffer.from(fake).toString('base64')}`;
  const transformed = SOURCE
    .replace("'./dynamic-plasma-https-read-transport-owner.js'", JSON.stringify(fakeUrl))
    .replace("'./dynamic-plasma-observation-collector.js'", JSON.stringify(COLLECTOR_URL))
    .replace("'./dynamic-plasma-observation-normalizer.js'", JSON.stringify(NORMALIZER_URL));
  try {
    return await import(`data:text/javascript;base64,${Buffer.from(transformed).toString('base64')}#${moduleSequence}`);
  } finally {
    delete globalThis[key];
  }
}

function scenario(options = {}) {
  const log = [];
  const endpoints = [];
  const values = options.replies ?? [replies(), replies()];
  let factoryCalls = 0;
  const factory = endpointOptions => {
    const endpoint = factoryCalls++;
    if (options.throwConstructionAt === endpoint) throw new Error('private construction failure');
    if (options.hostileOwnerAt === endpoint) {
      const hostile = {};
      Object.defineProperty(hostile, 'transport', { enumerable: true, get() { options.getterReads.value += 1; throw new Error('private getter'); } });
      Object.defineProperty(hostile, 'close', { enumerable: true, value: Object.freeze(() => prehandled(undefined)) });
      return Object.freeze(hostile);
    }
    const closeCapability = controlled();
    const outstanding = [];
    let closeCalls = 0;
    let callIndex = 0;
    const preparedReads = options.precreateReadPromises === true
      ? values[endpoint].map(raw => prehandled(typeof raw === 'string' ? raw : JSON.stringify(raw)))
      : null;
    const state = {
      endpoint, endpointOptions, closeCapability, outstanding,
      get closeCalls() { return closeCalls; },
      resolveClose() { closeCapability.resolve(undefined); },
      rejectClose() { closeCapability.reject(new Error('private close failure')); },
    };
    const callRead = Object.freeze(function callRead(request) {
      log.push(`read:${endpoint}:${request.method}`);
      if (options.onRead) options.onRead({ endpoint, request, state });
      if (options.hostileThenableAt === endpoint && callIndex === 0) {
        callIndex += 1;
        const rejected = Promise.reject(new Error('private prehandled rejection'));
        rejected.catch(() => {});
        const hostile = {};
        Object.defineProperty(hostile, 'then', { get() { options.getterReads.value += 1; throw new Error('private then'); } });
        return hostile;
      }
      if (options.delayReadAt === endpoint && callIndex === (options.delayReadIndex ?? 0)) {
        callIndex += 1;
        const capability = controlled();
        outstanding.push(capability);
        return capability.promise;
      }
      if (options.rejectReadAt === endpoint && callIndex === (options.rejectReadIndex ?? 0)) {
        callIndex += 1;
        return prehandled(new Error('private read failure'), true);
      }
      const raw = values[endpoint][callIndex++];
      assert.notEqual(raw, undefined);
      if (preparedReads !== null) return preparedReads[callIndex - 1];
      return prehandled(typeof raw === 'string' ? raw : JSON.stringify(raw));
    });
    const close = Object.freeze(function close() {
      closeCalls += 1;
      log.push(`close:${endpoint}`);
      if (options.rejectOutstandingOnClose) {
        for (const pending of outstanding) pending.reject(new Error('private cancellation'));
      }
      const mode = options.closeModes?.[endpoint] ?? 'resolve';
      if (mode === 'resolve') closeCapability.resolve(undefined);
      if (mode === 'reject') closeCapability.reject(new Error('private close failure'));
      return closeCapability.promise;
    });
    const owner = Object.freeze({ transport: Object.freeze({ callRead }), close });
    endpoints.push(state);
    return owner;
  };
  return { factory, log, endpoints, get factoryCalls() { return factoryCalls; } };
}

async function createHarness(options = {}) {
  const h = scenario(options);
  const module = await loadWithFactory(h.factory);
  const owner = module.createDynamicPlasmaHttpsObservationOwner(configuration());
  return { ...h, owner, module };
}

async function tick() { await new Promise(resolve => setImmediate(resolve)); }

test('real construction and close are inert and expose only a deeply frozen one-shot capability', async () => {
  const owner = createDynamicPlasmaHttpsObservationOwner(configuration());
  assert.deepEqual(Object.keys(owner), ['observe', 'close']);
  assert.equal(Object.isFrozen(owner), true);
  assert.equal(Object.isFrozen(owner.observe), true);
  assert.equal(Object.isFrozen(owner.close), true);
  const first = owner.close();
  assert.equal(owner.close(), first);
  await first;
  await assert.rejects(owner.observe(collectorInput()), codeIs(PREFIX + 'closed'));
});

test('configuration is exact, deeply frozen, route-distinct, proxy-safe and inert on rejection', async () => {
  const h = scenario();
  const module = await loadWithFactory(h.factory);
  const invalid = [
    { endpoints: configuration().endpoints },
    Object.freeze({ endpoints: Object.freeze([{ ...configuration().endpoints[0] }, configuration().endpoints[1]]) }),
    deepFreeze({ endpoints: [configuration().endpoints[0], configuration().endpoints[0]] }),
    new Proxy(configuration(), {}),
  ];
  for (const value of invalid) assert.throws(() => module.createDynamicPlasmaHttpsObservationOwner(value), codeIs(PREFIX + 'configuration_rejected'));
  assert.equal(h.factoryCalls, 0);
});

test('fixed configuration errors never consult hostile descriptor-prototype accessors', () => {
  for (const field of ['value', 'enumerable', 'writable', 'configurable']) {
    const original = Object.getOwnPropertyDescriptor(Object.prototype, field);
    let getters = 0;
    let caught;
    try {
      Object.defineProperty(Object.prototype, field, {
        configurable: true,
        get() { getters += 1; throw new Error('private descriptor getter'); },
      });
      try { createDynamicPlasmaHttpsObservationOwner(configuration(), null); }
      catch (error) { caught = error; }
    } finally {
      if (original === undefined) delete Object.prototype[field];
      else Object.defineProperty(Object.prototype, field, original);
    }
    assert.equal(getters, 0);
    assert.equal(caught?.code, PREFIX + 'configuration_rejected');
  }
});

test('fixed errors and late settlement ignore inherited descriptor get/set poison', { timeout: 5000 }, async () => {
  for (const field of ['get', 'set']) {
    const invalidConfiguration = configuration();
    const lateValue = JSON.stringify(replies()[0]);
    const h = await createHarness({ delayReadAt: 0, closeModes: ['manual', 'manual'] });
    const observing = h.owner.observe(collectorInput());
    while (h.endpoints[0].outstanding.length === 0) await tick();
    const closing = h.owner.close();
    const barrier = controlled();
    const unhandled = [];
    const observeUnhandled = value => unhandled.push(value);
    const original = Object.getOwnPropertyDescriptor(Object.prototype, field);
    let getterReads = 0;
    let restored = false;
    let caught;
    function restore() {
      if (restored) return;
      restored = true;
      if (original === undefined) delete Object.prototype[field];
      else Object.defineProperty(Object.prototype, field, original);
    }
    process.on('unhandledRejection', observeUnhandled);
    setImmediate(() => { restore(); barrier.resolve(undefined); });
    try {
      Object.defineProperty(Object.prototype, field, {
        configurable: true,
        get() { getterReads += 1; throw new Error('private descriptor getter'); },
      });
      try { createDynamicPlasmaHttpsObservationOwner(invalidConfiguration, null); }
      catch (error) { caught = error; }
      h.endpoints[0].outstanding[0].resolve(lateValue);
      h.endpoints[0].resolveClose();
      h.endpoints[1].resolveClose();
      await barrier.promise;
      await assert.rejects(observing, codeIs(PREFIX + 'close_uncertain'));
      await assert.rejects(closing, codeIs(PREFIX + 'close_uncertain'));
      await tick();
      assert.equal(caught?.code, PREFIX + 'configuration_rejected');
      assert.equal(getterReads, 0);
      assert.equal(unhandled.length, 0);
      assert.equal(h.endpoints[0].closeCalls, 1);
      assert.equal(h.endpoints[1].closeCalls, 1);
    } finally {
      restore();
      process.off('unhandledRejection', observeUnhandled);
    }
  }
});

test('partial construction requests cleanup and hostile owner accessors are never invoked', async () => {
  const partial = scenario({ throwConstructionAt: 1 });
  const firstModule = await loadWithFactory(partial.factory);
  assert.throws(() => firstModule.createDynamicPlasmaHttpsObservationOwner(configuration()), codeIs(PREFIX + 'configuration_rejected'));
  assert.deepEqual(partial.log, ['close:0']);
  const getterReads = { value: 0 };
  const hostile = scenario({ hostileOwnerAt: 0, getterReads });
  const secondModule = await loadWithFactory(hostile.factory);
  assert.throws(() => secondModule.createDynamicPlasmaHttpsObservationOwner(configuration()), codeIs(PREFIX + 'configuration_rejected'));
  assert.equal(getterReads.value, 0);
});

test('DP_ACTIVE waits for A physical close before B and for both closes before release', async () => {
  const h = await createHarness();
  const output = await h.owner.observe(collectorInput());
  assert.equal(output.classification, 'DP_ACTIVE');
  const firstB = h.log.findIndex(value => value.startsWith('read:1:'));
  const closeA = h.log.indexOf('close:0');
  const closeB = h.log.indexOf('close:1');
  assert.ok(closeA >= 0 && closeA < firstB);
  assert.ok(closeB > firstB);
  assert.equal(h.log.filter(value => value.startsWith('read:0:')).length, 6);
  assert.equal(h.log.filter(value => value.startsWith('read:1:')).length, 6);
  assert.equal(h.endpoints[0].closeCalls, 1);
  assert.equal(h.endpoints[1].closeCalls, 1);
  assert.equal(output.chainAuthentication, 'NOT_ESTABLISHED');
  assert.equal(output.canonicality, 'NOT_ESTABLISHED');
  assert.equal(output.finality, 'NOT_ESTABLISHED');
  assert.equal(output.afterSigningAction, 'NONE');
});

test('maximum pagination remains thirteen ordered native reads per endpoint', async () => {
  const h = await createHarness({ replies: [replies(1024), replies(1024)] });
  assert.equal((await h.owner.observe(collectorInput())).classification, 'DP_ACTIVE');
  assert.equal(h.log.filter(value => value.startsWith('read:0:')).length, 13);
  assert.equal(h.log.filter(value => value.startsWith('read:1:')).length, 13);
  assert.ok(h.log.indexOf('close:0') < h.log.findIndex(value => value.startsWith('read:1:')));
});

test('PRE_DP, endpoint disagreement, and endpoint unavailability stay detached normalizer outcomes', async t => {
  await t.test('PRE_DP', async () => {
    const legacy = replies();
    legacy[0] = momentum({ version: 1, nextFusionPrice: 0, nextWorkPrice: 0 });
    legacy[5] = legacy[0];
    legacy[2].list[1].activated = false;
    legacy[4].requiredDifficulty = 16500000;
    const h = await createHarness({ replies: [legacy, structuredClone(legacy)] });
    assert.equal((await h.owner.observe(collectorInput())).classification, 'PRE_DP');
  });
  await t.test('disagreement', async () => {
    const second = replies();
    second[4].requiredDifficulty += 1;
    const h = await createHarness({ replies: [replies(), second] });
    const result = await h.owner.observe(collectorInput());
    assert.equal(result.classification, 'MISBOUND_OR_INCOHERENT');
    assert.equal(result.reason, 'ENDPOINT_OBSERVATION_MISMATCH');
  });
  await t.test('unavailable', async () => {
    const h = await createHarness({ rejectReadAt: 0 });
    const result = await h.owner.observe(collectorInput());
    assert.equal(result.classification, 'UNAVAILABLE');
    assert.equal(result.reason, 'ENDPOINT_DATA_UNAVAILABLE');
    assert.equal(h.log.filter(value => value.startsWith('read:0:')).length, 1);
    assert.equal(h.log.filter(value => value.startsWith('read:1:')).length, 6);
  });
});

test('non-UNSIGNED and hostile phase inputs perform zero reads and close both owners', async () => {
  for (const input of [
    { ...collectorInput(), phase: 'SIGNED' },
    new Proxy(collectorInput(), {}),
    Object.defineProperty({ ...collectorInput() }, 'phase', { enumerable: true, get() { throw new Error('private getter'); } }),
  ]) {
    const h = await createHarness();
    await assert.rejects(h.owner.observe(input), codeIs(PREFIX + 'input_rejected'));
    assert.equal(h.log.filter(value => value.startsWith('read:')).length, 0);
    assert.deepEqual(h.log.filter(value => value.startsWith('close:')).sort(), ['close:0', 'close:1']);
  }
});

test('invalid UNSIGNED collector input still performs zero native reads', async () => {
  const h = await createHarness();
  const input = collectorInput();
  input.quoteRequest.data = 'not-canonical-base64';
  await assert.rejects(h.owner.observe(input), codeIs(PREFIX + 'input_rejected'));
  assert.equal(h.log.filter(value => value.startsWith('read:')).length, 0);
  assert.deepEqual(h.log.filter(value => value.startsWith('close:')).sort(), ['close:0', 'close:1']);
});

test('A close uncertainty stops B and still requests B cleanup without releasing observation', async () => {
  const h = await createHarness({ closeModes: ['reject', 'resolve'] });
  await assert.rejects(h.owner.observe(collectorInput()), codeIs(PREFIX + 'close_uncertain'));
  assert.equal(h.log.filter(value => value.startsWith('read:1:')).length, 0);
  assert.deepEqual(h.log.filter(value => value.startsWith('close:')).sort(), ['close:0', 'close:1']);
  await assert.rejects(h.owner.close(), codeIs(PREFIX + 'close_uncertain'));
});

test('B close uncertainty withholds a normalized candidate', async () => {
  const h = await createHarness({ closeModes: ['resolve', 'reject'] });
  await assert.rejects(h.owner.observe(collectorInput()), codeIs(PREFIX + 'close_uncertain'));
  assert.equal(h.log.filter(value => value.startsWith('read:1:')).length, 6);
  await assert.rejects(h.owner.close(), codeIs(PREFIX + 'close_uncertain'));
});

test('close before observe gates admission synchronously and returns one stable promise', async () => {
  const h = await createHarness();
  const first = h.owner.close();
  assert.equal(h.owner.close(), first);
  const refused = h.owner.observe(collectorInput());
  assert.equal(h.log.filter(value => value.startsWith('read:')).length, 0);
  await first;
  await assert.rejects(refused, codeIs(PREFIX + 'closed'));
  assert.equal(h.endpoints[0].closeCalls, 1);
  assert.equal(h.endpoints[1].closeCalls, 1);
});

test('close during observe cancels admission and delayed settlement cannot revive success', async () => {
  const h = await createHarness({ delayReadAt: 0, closeModes: ['manual', 'manual'] });
  const observing = h.owner.observe(collectorInput());
  while (h.endpoints[0].outstanding.length === 0) await tick();
  const closing = h.owner.close();
  assert.equal(h.owner.close(), closing);
  h.endpoints[0].resolveClose();
  h.endpoints[1].resolveClose();
  h.endpoints[0].outstanding[0].resolve(JSON.stringify(replies()[0]));
  await assert.rejects(observing, codeIs(PREFIX + 'closed'));
  await closing;
  assert.equal(h.log.filter(value => value.startsWith('read:1:')).length, 0);
});

test('duplicate observe calls never create a second lifecycle', async () => {
  const h = await createHarness({ delayReadAt: 0, closeModes: ['manual', 'manual'] });
  const first = h.owner.observe(collectorInput());
  await assert.rejects(h.owner.observe(collectorInput()), codeIs(PREFIX + 'busy'));
  while (h.endpoints[0].outstanding.length === 0) await tick();
  const closing = h.owner.close();
  h.endpoints[0].resolveClose();
  h.endpoints[1].resolveClose();
  h.endpoints[0].outstanding[0].reject(new Error('private cancellation'));
  await assert.rejects(first, codeIs(PREFIX + 'closed'));
  await closing;
  await assert.rejects(h.owner.observe(collectorInput()), codeIs(PREFIX + 'closed'));
});

test('synchronous reentrant close during the first read cannot release an observation', async () => {
  let owner;
  let reentered = false;
  const h = scenario({
    rejectReadAt: 0,
    onRead: ({ endpoint }) => {
      if (!reentered && endpoint === 0) {
        reentered = true;
        owner.close();
      }
    },
  });
  const module = await loadWithFactory(h.factory);
  owner = module.createDynamicPlasmaHttpsObservationOwner(configuration());
  await assert.rejects(owner.observe(collectorInput()), codeIs(PREFIX + 'closed'));
  await owner.close();
  assert.equal(h.log.filter(value => value.startsWith('read:1:')).length, 0);
  assert.equal(h.endpoints[0].closeCalls, 1);
  assert.equal(h.endpoints[1].closeCalls, 1);
});

test('close after successful observation returns the same settled cleanup promise', async () => {
  const h = await createHarness();
  assert.equal((await h.owner.observe(collectorInput())).classification, 'DP_ACTIVE');
  const first = h.owner.close();
  const second = h.owner.close();
  assert.equal(first, second);
  await first;
  await assert.rejects(h.owner.observe(collectorInput()), codeIs(PREFIX + 'closed'));
  assert.equal(h.endpoints[0].closeCalls, 1);
  assert.equal(h.endpoints[1].closeCalls, 1);
});

test('close settlement order and failure permutations always wait for both cleanups', async t => {
  for (const order of [[0, 1], [1, 0]]) {
    for (const failures of [[], [0], [1], [0, 1]]) {
      await t.test(`order-${order.join('')}-fail-${failures.join('') || 'none'}`, async () => {
        const h = await createHarness({ delayReadAt: 0, closeModes: ['manual', 'manual'] });
        const observing = h.owner.observe(collectorInput());
        while (h.endpoints[0].outstanding.length === 0) await tick();
        const closing = h.owner.close();
        h.endpoints[0].outstanding[0].reject(new Error('private cancellation'));
        for (const endpoint of order) {
          if (failures.includes(endpoint)) h.endpoints[endpoint].rejectClose();
          else h.endpoints[endpoint].resolveClose();
        }
        await assert.rejects(observing, codeIs(PREFIX + (failures.length === 0 ? 'closed' : 'close_uncertain')));
        if (failures.length === 0) await closing;
        else await assert.rejects(closing, codeIs(PREFIX + 'close_uncertain'));
        assert.equal(h.endpoints[0].closeCalls, 1);
        assert.equal(h.endpoints[1].closeCalls, 1);
      });
    }
  }
});

test('missing A close proof blocks B; missing B close proof blocks result release', async t => {
  await t.test('A missing', async () => {
    const h = await createHarness({ closeModes: ['manual', 'resolve'] });
    const observing = h.owner.observe(collectorInput());
    await tick();
    assert.equal(h.log.filter(value => value.startsWith('read:1:')).length, 0);
    let settled = false;
    observing.then(() => { settled = true; }, () => { settled = true; });
    await tick();
    assert.equal(settled, false);
    h.endpoints[0].resolveClose();
    assert.equal((await observing).classification, 'DP_ACTIVE');
  });
  await t.test('B missing', async () => {
    const h = await createHarness({ closeModes: ['resolve', 'manual'] });
    const observing = h.owner.observe(collectorInput());
    await tick();
    let settled = false;
    observing.then(() => { settled = true; }, () => { settled = true; });
    await tick();
    assert.equal(settled, false);
    h.endpoints[1].resolveClose();
    assert.equal((await observing).classification, 'DP_ACTIVE');
  });
});

test('hostile thenables are not assimilated and their getters remain unread', async () => {
  const getterReads = { value: 0 };
  const h = await createHarness({ hostileThenableAt: 0, getterReads });
  const result = await h.owner.observe(collectorInput());
  assert.equal(result.classification, 'UNAVAILABLE');
  assert.equal(getterReads.value, 0);
});

test('Promise and Object.prototype drift fail closed with no B admission or unhandled rejection', async () => {
  const unhandled = [];
  const observeUnhandled = value => unhandled.push(value);
  process.on('unhandledRejection', observeUnhandled);
  try {
    for (const drift of ['object-then', 'promise-constructor']) {
      const h = await createHarness();
      const objectThen = Object.getOwnPropertyDescriptor(Object.prototype, 'then');
      const promiseConstructor = Object.getOwnPropertyDescriptor(Promise.prototype, 'constructor');
      let pending;
      try {
        if (drift === 'object-then') Object.defineProperty(Object.prototype, 'then', { configurable: true, value() {} });
        else Object.defineProperty(Promise.prototype, 'constructor', { ...promiseConstructor, value: function Replacement() {} });
        pending = h.owner.observe(collectorInput());
      } finally {
        if (objectThen === undefined) delete Object.prototype.then; else Object.defineProperty(Object.prototype, 'then', objectThen);
        Object.defineProperty(Promise.prototype, 'constructor', promiseConstructor);
      }
      await assert.rejects(pending, codeIs(PREFIX + 'close_uncertain'));
      assert.equal(h.log.filter(value => value.startsWith('read:')).length, 0);
    }
    await tick();
    assert.equal(unhandled.length, 0);
  } finally { process.off('unhandledRejection', observeUnhandled); }
});

test('synchronous first-read invariant drift leaves no collector rejection unhandled', async () => {
  const unhandled = [];
  const observeUnhandled = value => unhandled.push(value);
  let installed = false;
  const original = Object.getOwnPropertyDescriptor(Object.prototype, 'then');
  process.on('unhandledRejection', observeUnhandled);
  try {
    const h = await createHarness({
      onRead: ({ endpoint }) => {
        if (!installed && endpoint === 0) {
          installed = true;
          Object.defineProperty(Object.prototype, 'then', { configurable: true, value() {} });
        }
      },
    });
    const pending = h.owner.observe(collectorInput());
    while (!installed) await Promise.resolve();
    if (original === undefined) delete Object.prototype.then;
    else Object.defineProperty(Object.prototype, 'then', original);
    await assert.rejects(pending, error => error !== null && typeof error === 'object' &&
      typeof error.code === 'string' && error.code.startsWith(PREFIX));
    await tick();
    await tick();
    assert.equal(unhandled.length, 0);
    assert.equal(h.log.filter(value => value.startsWith('read:1:')).length, 0);
  } finally {
    if (original === undefined) delete Object.prototype.then;
    else Object.defineProperty(Object.prototype, 'then', original);
    process.off('unhandledRejection', observeUnhandled);
  }
});

test('post-first-A then getter poison is never read by the owner or prehandled fixture', { timeout: 5000 }, async () => {
  const unhandled = [];
  const observeUnhandled = value => unhandled.push(value);
  const original = Object.getOwnPropertyDescriptor(Promise.prototype, 'then');
  const barrier = controlled();
  let getterReads = 0;
  let installed = false;
  let restored = false;
  function restore() {
    if (restored) return;
    restored = true;
    Object.defineProperty(Promise.prototype, 'then', original);
  }
  const h = await createHarness({
    precreateReadPromises: true,
    onRead: ({ endpoint }) => {
      if (!installed && endpoint === 0) {
        installed = true;
        Object.defineProperty(Promise.prototype, 'then', {
          configurable: true,
          get() { getterReads += 1; throw new Error('private then getter'); },
        });
      }
    },
  });
  process.on('unhandledRejection', observeUnhandled);
  setImmediate(() => { restore(); barrier.resolve(undefined); });
  try {
    const observing = h.owner.observe(collectorInput());
    await barrier.promise;
    await assert.rejects(observing, codeIs(PREFIX + 'close_uncertain'));
    await assert.rejects(h.owner.close(), codeIs(PREFIX + 'close_uncertain'));
    await tick();
    assert.equal(installed, true);
    assert.equal(getterReads, 0);
    assert.equal(unhandled.length, 0);
    assert.equal(h.log.filter(value => value.startsWith('read:1:')).length, 0);
    assert.equal(h.endpoints[0].closeCalls, 1);
    assert.equal(h.endpoints[1].closeCalls, 1);
  } finally {
    restore();
    process.off('unhandledRejection', observeUnhandled);
  }
});

test('B cached refusal sees runtime drift installed on the final A capability', { timeout: 5000 }, async () => {
  const unhandled = [];
  const observeUnhandled = value => unhandled.push(value);
  const original = Object.getOwnPropertyDescriptor(Object.prototype, 'get');
  const barrier = controlled();
  let aReads = 0;
  let getterReads = 0;
  let installed = false;
  let restored = false;
  function restore() {
    if (restored) return;
    restored = true;
    if (original === undefined) delete Object.prototype.get;
    else Object.defineProperty(Object.prototype, 'get', original);
  }
  const h = await createHarness({
    precreateReadPromises: true,
    onRead: ({ endpoint }) => {
      if (endpoint === 0 && (aReads += 1) === 6) {
        installed = true;
        Object.defineProperty(Object.prototype, 'get', {
          configurable: true,
          get() { getterReads += 1; throw new Error('private inherited getter'); },
        });
      }
    },
  });
  process.on('unhandledRejection', observeUnhandled);
  setImmediate(() => { restore(); barrier.resolve(undefined); });
  try {
    const observing = h.owner.observe(collectorInput());
    await barrier.promise;
    await assert.rejects(observing, codeIs(PREFIX + 'close_uncertain'));
    await assert.rejects(h.owner.close(), codeIs(PREFIX + 'close_uncertain'));
    await tick();
    assert.equal(installed, true);
    assert.equal(aReads, 6);
    assert.equal(getterReads, 0);
    assert.equal(h.log.filter(value => value.startsWith('read:1:')).length, 0);
    assert.equal(h.endpoints[0].closeCalls, 1);
    assert.equal(h.endpoints[1].closeCalls, 1);
    assert.equal(unhandled.length, 0);
  } finally {
    restore();
    process.off('unhandledRejection', observeUnhandled);
  }
});

test('post-capability constructor and species accessors remain unread and fail terminally', { timeout: 5000 }, async () => {
  for (const kind of ['constructor', 'species']) {
    const target = kind === 'constructor' ? Promise.prototype : Promise;
    const key = kind === 'constructor' ? 'constructor' : Symbol.species;
    const original = Object.getOwnPropertyDescriptor(target, key);
    const unhandled = [];
    const observeUnhandled = value => unhandled.push(value);
    let getterReads = 0;
    let installed = false;
    let restored = false;
    function restore() {
      if (restored) return;
      restored = true;
      Object.defineProperty(target, key, original);
    }
    const h = await createHarness({
      precreateReadPromises: true,
      onRead: ({ endpoint }) => {
        if (!installed && endpoint === 0) {
          installed = true;
          Object.defineProperty(target, key, {
            configurable: true,
            get() { getterReads += 1; throw new Error('private Promise metadata getter'); },
          });
        }
      },
    });
    process.on('unhandledRejection', observeUnhandled);
    try {
      const observing = h.owner.observe(collectorInput());
      restore();
      await assert.rejects(observing, codeIs(PREFIX + 'unavailable'));
      await h.owner.close();
      await tick();
      assert.equal(installed, true);
      assert.equal(getterReads, 0);
      assert.equal(unhandled.length, 0);
      assert.equal(h.log.filter(value => value.startsWith('read:1:')).length, 0);
      assert.equal(h.endpoints[0].closeCalls, 1);
      assert.equal(h.endpoints[1].closeCalls, 1);
    } finally {
      restore();
      process.off('unhandledRejection', observeUnhandled);
    }
  }
});

test('drift immediately before B admission allocates no late bridge and invokes no B read', async () => {
  const unhandled = [];
  const observeUnhandled = value => unhandled.push(value);
  const h = await createHarness({ closeModes: ['manual', 'resolve'] });
  const pending = h.owner.observe(collectorInput());
  while (!h.log.includes('close:0')) await tick();
  const original = Object.getOwnPropertyDescriptor(Object.prototype, 'then');
  process.on('unhandledRejection', observeUnhandled);
  try {
    Object.defineProperty(Object.prototype, 'then', { configurable: true, value() {} });
    h.endpoints[0].resolveClose();
    await tick();
  } finally {
    if (original === undefined) delete Object.prototype.then;
    else Object.defineProperty(Object.prototype, 'then', original);
  }
  await assert.rejects(pending, codeIs(PREFIX + 'close_uncertain'));
  await tick();
  process.off('unhandledRejection', observeUnhandled);
  assert.equal(unhandled.length, 0);
  assert.equal(h.log.filter(value => value.startsWith('read:1:')).length, 0);
});

test('owned promises tolerate unread symbol metadata and duplicate native settlements are inert', async () => {
  const h = await createHarness({ closeModes: ['manual', 'manual'] });
  const observing = h.owner.observe(collectorInput());
  h.endpoints[0].resolveClose();
  h.endpoints[0].resolveClose();
  await tick();
  h.endpoints[1].resolveClose();
  h.endpoints[1].resolveClose();
  assert.equal((await observing).classification, 'DP_ACTIVE');
  assert.equal(h.endpoints[0].closeCalls, 1);
  assert.equal(h.endpoints[1].closeCalls, 1);
});

test('source is unmounted, default-off, and owns no broader authority', () => {
  assert.equal((SOURCE.match(/^export\s/gm) ?? []).length, 1);
  assert.match(SOURCE, /createDynamicPlasmaHttpsReadTransportOwner/);
  assert.match(SOURCE, /createDynamicPlasmaObservationCollector/);
  assert.match(SOURCE, /normalizeDynamicPlasmaObservation/);
  assert.doesNotMatch(SOURCE, /node:(?:fs|dns|child_process|worker_threads)|process\.(?:env|on)|globalThis|fetch\s*\(|new URL\s*\(|\.listen\s*\(|console\.|readFile|writeFile|setInterval|prepareBlock|publishRawTransaction|keystore|mnemonic/i);
  assert.doesNotMatch(SOURCE, /(?:https?:\/\/|wss?:\/\/|Authorization|Cookie|Set-Cookie)/i);
  assert.doesNotMatch(SOURCE, /define\(error, 'stack', \{/);
  assert.doesNotMatch(SOURCE, /define\(result, toString\(index\), \{/);
  assert.doesNotMatch(SOURCE, /const secondCallRead[\s\S]{0,400}return rejected\('unavailable'\)/);
  assert.match(SOURCE, /terminalUnavailableRead/);
  const sourceDirectory = new URL('../src/', import.meta.url);
  const importerNames = [];
  for (const name of ['buyer.js', 'server.js', 'service-credit-http.js', 'index.js']) {
    try {
      if (readFileSync(new URL(name, sourceDirectory), 'utf8').includes('dynamic-plasma-https-observation-owner')) importerNames.push(name);
    } catch { /* absent optional entry point */ }
  }
  assert.deepEqual(importerNames, []);
});
