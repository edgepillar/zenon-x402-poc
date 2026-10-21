import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

// New deferred material orchestration plus the retained130 coupled regressions.
// Material comes ONLY from fixed test-owned DATA/native Promises, never search.
// No real producer, SDK, keys/signatures, network, SQL or native owner is run.
assert.equal(process.argv.length, 2);
assert.equal(process.versions.node, '24.19.0');
const bytes = readFileSync(new URL('../src/zenon/dynamic-plasma-deferred-material-planner.js', import.meta.url));
assert.equal(bytes.length, 13933);
assert.equal(createHash('sha256').update(bytes).digest('hex'),
  '0c21bfed5b4adc22483b7b5961dd7d3cc6587836ab750e7d3df9b52fa6a13827');
assert.equal(/[^\x00-\x7f]/.test(bytes.toString('utf8')) || bytes.includes(0), false);
const source = bytes.toString('ascii');
await import('./dynamic-plasma-supplied-material-planner.behavior.draft.mjs');
const { createDeferredMaterialDynamicPlasmaTransactionPlanner: CREATE }
  = await import('../src/zenon/dynamic-plasma-deferred-material-planner.js');
const { assertZenonTransactionPlanner: assertPlanner }
  = await import('../src/zenon/transaction-planner.js');
const { ObservedDynamicPlasmaUserSendAdapter: DataAdapter }
  = await import('../src/zenon/dynamic-plasma-observed-user-send-adapter.js');
const { rawAdapterViewFixture: rawView, rawAdapterMaterialFixture: material }
  = await import('./dynamic-plasma-raw-adapter.behavior.draft.mjs');
const { requestBoundCollectionFixture: collection }
  = await import('./dynamic-plasma-request-bound-collection.behavior.draft.mjs');
const { frontierReadBlockFixture: block }
  = await import('./dynamic-plasma-account-frontier-read.behavior.draft.mjs');

const NativePromise = Promise, nativeThen = Promise.prototype.then, apply = Reflect.apply;
const OPTIONS = { timeout: 5000, concurrency: false };
const copy = value => JSON.parse(JSON.stringify(value)); // Owned valid fixture DATA only.
function cap() {
  let resolve, reject;
  const promise = new NativePromise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function outcome(promise) {
  return apply(nativeThen, promise, [value => ({ value }), error => ({ error })]);
}
function info(value, balance = value.accepted.amount) {
  return { address: value.payerAddress, accountHeight: value.accountFrontier.height,
    balanceInfoMap: { [value.accepted.asset]: { token: { tokenStandard: value.accepted.asset }, balance } } };
}
function input(value) {
  return { observedUserSendReadVersion: 2, phase: 'UNSIGNED', paymentRequired: value.paymentRequired,
    accepted: value.accepted, payerAddress: value.payerAddress, compiledSporkIds: value.compiledSporkIds,
    policy: value.policy, runtimeContextDigest: value.runtimeContextDigest,
    accountInfoResultJson: JSON.stringify(info(value)) };
}
function view(value) {
  return { observedUserSendViewVersion: 1, phase: 'UNSIGNED', paymentRequired: value.paymentRequired,
    accepted: value.accepted, payerAddress: value.payerAddress, compiledSporkIds: value.compiledSporkIds,
    accountFrontierResultJson: JSON.stringify(block(value)), observation: value.observation,
    policy: value.policy, runtimeContextDigest: value.runtimeContextDigest };
}
function adjust(text, method, advance) {
  if (!advance) return text;
  const value = JSON.parse(text), price = [1000, 1100, 1210, 1331][advance];
  if (method === 'ledger.getFrontierMomentum') {
    value.height = 100 + advance; value.hash = String(advance + 3).repeat(64);
    value.nextFusionPrice = price; value.nextWorkPrice = price;
  } else if (method === 'embedded.plasma.getRequiredPoWForAccountBlock') {
    value.requiredFusedPlasma = Math.ceil(value.basePlasma * price / 1000);
    const fused = Math.min(value.availablePlasma, value.requiredFusedPlasma);
    value.requiredDifficulty = Math.ceil(Math.max(0, value.basePlasma - Math.floor(fused * 1000 / price)) * price / 1000) * 1500;
  }
  return JSON.stringify(value);
}
function fixture(mode = {}, value = rawView()) {
  const dp = collection(value), calls = [], materials = [], materialReady = cap(), accountReady = cap();
  const f = { dp, calls, materials, mode, value, supplied: material(), materialReady, accountReady,
    context: { plannerContextVersion: 2, readInput: input(value) } };
  const transports = dp.options.transports.map(transport => Object.freeze({
    callRead: Object.freeze(function callRead(request) {
      const pending = transport.callRead(request), advance = mode.advance || 0;
      return advance ? apply(nativeThen, pending, [text => adjust(text, request.method, advance)]) : pending;
    }),
  }));
  f.options = {
    readOptions: { transports, accountExchange(body) {
      const request = JSON.parse(body); calls.push(request);
      assert.equal(request.id, calls.length); assert.equal(request.method, 'ledger.getFrontierAccountBlock');
      assert.deepEqual(request.params, [value.payerAddress]);
      const result = block(value);
      if (mode.movedAt && calls.length >= mode.movedAt) { result.height += 1; result.hash = '99'.repeat(32); }
      const text = JSON.stringify({ jsonrpc: '2.0', id: request.id + (mode.badIdAt === calls.length ? 1 : 0), result });
      if (mode.onAccount) mode.onAccount(calls.length);
      if (mode.throwAt === calls.length) throw Error('PRIVATE_ACCOUNT_FAULT');
      if (mode.deferAccountAt === calls.length) {
        const pending = cap(); f.releaseAccount = () => pending.resolve(text); accountReady.resolve(undefined);
        return pending.promise;
      }
      return NativePromise.resolve(text);
    } },
    materialExchange: function materialExchange(request) {
      materials.push({ request, receiver: this, argc: arguments.length,
        accountCalls: calls.length, dpPositions: dp.positions.slice() });
      materialReady.resolve(undefined);
      return mode.onMaterial ? mode.onMaterial(request, f) : NativePromise.resolve(f.supplied);
    },
  };
  f.planner = CREATE(f.options);
  return f;
}
function rejected(kind = 'operation_rejected') {
  return error => {
    assert.ok(error instanceof (kind === 'busy' ? Error : TypeError));
    assert.equal(error.code, 'zenon_deferred_material_dp_planner_' + kind);
    assert.equal(error.message, error.code);
    assert.equal(error.stack, (kind === 'busy' ? 'Error: ' : 'TypeError: ') + error.code);
    assert.equal(Object.isFrozen(error), true); assert.equal(Object.hasOwn(error, 'cause'), false);
    assert.equal(error.stack.includes('PRIVATE'), false);
    return true;
  };
}
async function expected(value = rawView()) {
  const adapter = new DataAdapter(), supplied = view(value), plan = await adapter.quote(supplied);
  const work = await adapter.createWorkRequest(supplied, plan);
  const assembly = await adapter.assemble(supplied, plan, material());
  return { work, block: assembly.accountBlock };
}
function frozen(value) {
  if (value !== null && typeof value === 'object') {
    assert.equal(Object.isFrozen(value), true);
    for (const child of Object.values(value)) frozen(child);
  }
}
async function used(f) {
  const count = f.calls.length, materialCount = f.materials.length, positions = f.dp.positions.slice();
  await assert.rejects(f.planner.prepareUnsigned(f.context), rejected('used'));
  assert.equal(f.calls.length, count); assert.equal(f.materials.length, materialCount);
  assert.deepEqual(f.dp.positions, positions);
}

test('deferred DP planner exposes one frozen SPI with captured distinct capabilities and no constructor handoffs', OPTIONS, () => {
  const f = fixture();
  assert.equal(assertPlanner(f.planner), f.planner);
  assert.deepEqual(Object.keys(f.planner), ['prepareUnsigned']);
  assert.equal(Object.isFrozen(f.planner), true); assert.equal(Object.isFrozen(f.planner.prepareUnsigned), true);
  let hooks = 0; const hook = () => { hooks++; throw Error('PRIVATE'); };
  const accessor = { readOptions: f.options.readOptions };
  Object.defineProperty(accessor, 'materialExchange', { enumerable: true, get: hook });
  const badReads = { accountExchange: f.options.readOptions.accountExchange };
  Object.defineProperty(badReads, 'transports', { enumerable: true, get: hook });
  const sparse = new Array(2);
  const modes = [null, {}, accessor, { ...f.options, extra: true },
    { ...f.options, materialExchange: null }, { ...f.options, readOptions: badReads },
    { ...f.options, materialExchange: f.options.readOptions.accountExchange },
    ...f.options.readOptions.transports.map(t => ({ ...f.options, materialExchange: t.callRead })),
    { ...f.options, materialExchange: new Proxy(function () {}, { apply: hook }) },
    { ...f.options, readOptions: { ...f.options.readOptions, transports: sparse } },
    new Proxy(f.options, { get: hook, ownKeys: hook, getPrototypeOf: hook })];
  for (const bad of modes) assert.throws(() => CREATE(bad), rejected('configuration_rejected'));
  assert.throws(() => CREATE(), rejected('configuration_rejected'));
  assert.throws(() => CREATE(f.options, null), rejected('configuration_rejected'));
  assert.equal(hooks, 0); assert.equal(f.calls.length, 0); assert.equal(f.materials.length, 0);
  assert.deepEqual(f.dp.positions, [0, 0]);
});

test('deferred DP planner obtains material once after quote and original work request and returns only the final block', OPTIONS, async () => {
  const f = fixture(), before = copy(f.context), oracle = await expected(f.value);
  const result = await f.planner.prepareUnsigned(f.context);
  assert.deepEqual(result, oracle.block); assert.equal(result.signature, '');
  assert.equal(f.materials.length, 1);
  const m = f.materials[0];
  assert.equal(m.receiver, undefined); assert.equal(m.argc, 1);
  assert.equal(m.accountCalls, 4); assert.deepEqual(m.dpPositions, [12, 12]);
  assert.deepEqual(Object.keys(m.request), ['materialRequestVersion', 'phase', 'workRequest']);
  assert.equal(m.request.materialRequestVersion, 1); assert.equal(m.request.phase, 'UNSIGNED');
  assert.deepEqual(m.request.workRequest, oracle.work);
  assert.equal(m.request.workRequest.accountBlock.hash, '00'.repeat(32));
  assert.equal(m.request.workRequest.accountBlock.publicKey, '');
  assert.equal(m.request.workRequest.accountBlock.nonce, '00'.repeat(8));
  assert.equal(m.request.workRequest.accountBlock.signature, '');
  frozen(m.request); frozen(result);
  assert.equal(f.calls.length, 8); assert.deepEqual(f.dp.positions, [24, 24]);
  assert.deepEqual(f.context, before); assert.equal(Object.isFrozen(f.context), false);
  for (const key of ['paymentPayload', 'plan', 'workRequest', 'material', 'signatureCapability'])
    assert.equal(Object.hasOwn(result, key), false);
});

test('deferred DP planner preserves one admission and checks busy or used before hostile replacement input', OPTIONS, async () => {
  const f = fixture(); let hooks = 0;
  const hostile = new Proxy({}, { getPrototypeOf() { hooks++; throw Error('PRIVATE'); } });
  await assert.rejects(f.planner.prepareUnsigned(), rejected('input_rejected'));
  await assert.rejects(f.planner.prepareUnsigned(hostile, null), rejected('input_rejected'));
  assert.equal(f.calls.length, 0);
  const result = await f.planner.prepareUnsigned(f.context);
  assert.equal(result.signature, '');
  await assert.rejects(f.planner.prepareUnsigned(hostile), rejected('used'));
  await assert.rejects(f.planner.prepareUnsigned(), rejected('used'));
  assert.equal(hooks, 0); assert.equal(f.calls.length, 8); assert.equal(f.materials.length, 1);
  for (const key of ['quote', 'assemble', 'validateUnsigned', 'reset', 'resume', 'close'])
    assert.equal(Object.hasOwn(f.planner, key), false);
});

test('deferred DP planner snapshots selected DATA before its initial yield and captures capability references', OPTIONS, async () => {
  const f = fixture(), supplied = copy(f.context); let replacements = 0;
  const pending = f.planner.prepareUnsigned(supplied);
  assert.equal(f.calls.length, 0); assert.equal(f.materials.length, 0);
  supplied.plannerContextVersion = 1; supplied.readInput.phase = 'SIGNED';
  supplied.readInput.accepted.amount = '999'; supplied.readInput.accountInfoResultJson = 'null';
  supplied.readInput.policy.maxMomentumAdvances = 0;
  f.options.materialExchange = () => { replacements++; throw Error('PRIVATE'); };
  f.options.readOptions.accountExchange = () => { replacements++; throw Error('PRIVATE'); };
  f.options.readOptions.transports[0] = Object.freeze({ callRead: Object.freeze(() => {
    replacements++; throw Error('PRIVATE');
  }) });
  const result = await pending;
  assert.deepEqual(result, (await expected(f.value)).block);
  assert.equal(replacements, 0); assert.equal(f.calls.length, 8); assert.equal(f.materials.length, 1);
  assert.equal(Object.isFrozen(supplied), false);
});

test('deferred DP planner requires explicit context version2 read version2 and exact descriptor DATA before reads', OPTIONS, async () => {
  let hooks = 0; const hook = () => { hooks++; throw Error('PRIVATE'); };
  const makers = [
    c => ({ ...c, plannerContextVersion: 1 }), c => ({ ...c, material: material() }),
    c => ({ ...c, wallet: null }), c => ({ ...c, readInput: null }),
    c => { c.readInput.observedUserSendReadVersion = 1; delete c.readInput.accountInfoResultJson; return c; },
    c => { Object.defineProperty(c, 'readInput', { enumerable: true, get: hook }); return c; },
    c => { Object.defineProperty(c.readInput.accepted, 'amount', { enumerable: true, get: hook }); return c; },
    c => new Proxy(c, { get: hook, ownKeys: hook, getPrototypeOf: hook }),
    c => ({ ...c, readInput: new Proxy(c.readInput, { getPrototypeOf: hook }) }),
    c => ({ ...c, readInput: { ...c.readInput, accountInfoResultJson: { toString: hook } } }),
  ];
  for (const make of makers) {
    const f = fixture();
    await assert.rejects(f.planner.prepareUnsigned(make(copy(f.context))), rejected());
    assert.equal(f.calls.length, 0); assert.equal(f.materials.length, 0);
    assert.deepEqual(f.dp.positions, [0, 0]); await used(f);
  }
  assert.equal(hooks, 0);
});

test('deferred DP planner stays busy with no additional reads while the single material Promise is pending', OPTIONS, async () => {
  const held = cap(), heldOutcome = outcome(held.promise), f = fixture({ onMaterial: () => held.promise });
  const pending = f.planner.prepareUnsigned(f.context); await f.materialReady.promise;
  let hooks = 0; const hostile = new Proxy({}, { getPrototypeOf() { hooks++; throw Error('PRIVATE'); } });
  try {
    assert.equal(f.calls.length, 4); assert.deepEqual(f.dp.positions, [12, 12]); assert.equal(f.materials.length, 1);
    await assert.rejects(f.planner.prepareUnsigned(hostile), rejected('busy'));
    await NativePromise.resolve(); await NativePromise.resolve();
    assert.equal(f.calls.length, 4); assert.equal(f.materials.length, 1); assert.equal(hooks, 0);
  } finally { held.resolve(material()); await heldOutcome; }
  assert.deepEqual(await pending, (await expected(f.value)).block); await used(f);
});

test('deferred DP planner refuses pre-material read failures without handoff and later failures without retry', OPTIONS, async () => {
  for (const at of [1, 3, 4, 5, 7, 8]) {
    const f = fixture({ throwAt: at });
    await assert.rejects(f.planner.prepareUnsigned(f.context), rejected());
    assert.equal(f.calls.length, at); assert.equal(f.materials.length, at <= 4 ? 0 : 1);
    await used(f);
  }
  const f = fixture({ badIdAt: 4 });
  await assert.rejects(f.planner.prepareUnsigned(f.context), rejected());
  assert.equal(f.calls.length, 4); assert.equal(f.materials.length, 0); await used(f);
});

test('deferred DP planner hides synchronous material faults and observed native rejections without inspecting raw reasons', OPTIONS, async () => {
  for (const mode of ['throw', 'reject']) {
    let hooks = 0; const raw = new Proxy({}, { get() { hooks++; throw Error('PRIVATE'); } });
    const f = fixture({ onMaterial() {
      if (mode === 'throw') throw raw;
      return NativePromise.reject(raw);
    } });
    await assert.rejects(f.planner.prepareUnsigned(f.context), rejected());
    assert.equal(hooks, 0); assert.equal(f.calls.length, 4); assert.equal(f.materials.length, 1);
    await used(f);
  }
});

test('deferred DP planner rejects unsupported material promises and thenables without caller hooks', OPTIONS, async () => {
  let hooks = 0; const hook = () => { hooks++; throw Error('PRIVATE'); };
  const thenable = Object.defineProperty({}, 'then', { get: hook });
  const ordinary = NativePromise.resolve(material());
  const accessor = NativePromise.resolve(material());
  Object.defineProperty(accessor, 'constructor', { get: hook });
  const foreign = NativePromise.resolve(material()); Object.setPrototypeOf(foreign, {});
  class SubPromise extends NativePromise {}
  const values = [null, undefined, material(), thenable, new Proxy(ordinary, { get: hook }),
    accessor, foreign, SubPromise.resolve(material())];
  for (const value of values) {
    const f = fixture({ onMaterial: () => value });
    await assert.rejects(f.planner.prepareUnsigned(f.context), rejected());
    assert.equal(f.calls.length, 4); assert.equal(f.materials.length, 1); await used(f);
  }
  assert.equal(hooks, 0);
});

test('deferred DP planner uses native observation without reading an own then getter or decorating the material Promise', OPTIONS, async () => {
  let hooks = 0;
  const pending = NativePromise.resolve(material());
  Object.defineProperty(pending, 'then', { get() { hooks++; throw Error('PRIVATE'); } });
  Object.freeze(pending);
  const f = fixture({ onMaterial: () => pending });
  assert.deepEqual(await f.planner.prepareUnsigned(f.context), (await expected(f.value)).block);
  assert.equal(hooks, 0); assert.equal(Object.isFrozen(pending), true);
  assert.equal(Object.hasOwn(pending, 'constructor'), false); assert.equal(f.materials.length, 1);
});

test('deferred DP planner snapshots fulfillment before await assimilation of hostile material objects', OPTIONS, async () => {
  let hooks = 0;
  for (const key of ['then', 'nonce']) {
    const m = material(), pending = NativePromise.resolve(m);
    Object.defineProperty(m, key, { enumerable: true, get() { hooks++; throw Error('PRIVATE'); } });
    const f = fixture({ onMaterial: () => pending });
    await assert.rejects(f.planner.prepareUnsigned(f.context), rejected());
    assert.equal(f.calls.length, 4); assert.equal(f.materials.length, 1); await used(f);
  }
  assert.equal(hooks, 0);
});

test('deferred DP planner retains the observed material snapshot across later caller mutations and read barriers', OPTIONS, async () => {
  const supplied = material(), mode = {
    onMaterial: () => NativePromise.resolve(supplied),
    onAccount(index) { if (index === 5) { supplied.publicKey = ''; supplied.nonce = 'ff'.repeat(8); } },
  };
  const f = fixture(mode);
  const result = await f.planner.prepareUnsigned(f.context);
  assert.deepEqual(result, (await expected(f.value)).block); assert.equal(result.nonce, material().nonce);
  assert.equal(supplied.publicKey, ''); assert.equal(Object.isFrozen(supplied), false);
  assert.equal(f.calls.length, 8); assert.equal(f.materials.length, 1);
});

test('deferred DP planner rejects an original account advance after material before any next DP read', OPTIONS, async () => {
  const f = fixture({ onMaterial(request, self) {
    self.mode.movedAt = 5; return NativePromise.resolve(material());
  } });
  await assert.rejects(f.planner.prepareUnsigned(f.context), rejected());
  assert.equal(f.calls.length, 5); assert.deepEqual(f.dp.positions, [12, 12]);
  assert.equal(f.materials.length, 1); await used(f);
});

test('deferred DP planner preserves the original quote acknowledgement and block through allowed material-time price advances', OPTIONS, async () => {
  for (const advance of [1, 2]) {
    const f = fixture({ onMaterial(request, self) {
      self.mode.advance = advance; return NativePromise.resolve(material());
    } });
    const result = await f.planner.prepareUnsigned(f.context);
    assert.deepEqual(result, (await expected(f.value)).block);
    assert.equal(result.momentumAcknowledged.height, 100);
    assert.equal(result.momentumAcknowledged.hash, '33'.repeat(32));
    assert.equal(f.materials[0].request.workRequest.accountBlock.momentumAcknowledged.height, 100);
    assert.equal(f.calls.length, 8); assert.equal(f.materials.length, 1);
  }
});

test('deferred DP planner holds an expired material-time price horizon without refreshed quote or replacement material', OPTIONS, async () => {
  const f = fixture({ onMaterial(request, self) {
    self.mode.advance = 3; return NativePromise.resolve(material());
  } }), before = JSON.stringify(f.context);
  await assert.rejects(f.planner.prepareUnsigned(f.context), rejected());
  assert.equal(f.calls.length, 6); assert.deepEqual(f.dp.positions, [18, 18]);
  assert.equal(f.materials.length, 1); assert.equal(JSON.stringify(f.context), before); await used(f);
});

test('deferred DP planner rejects its own run receipt as material without a direct self-dependency or replacement call', OPTIONS, async () => {
  let pending, refused, hooks = 0;
  const hostile = new Proxy({}, { getPrototypeOf() { hooks++; throw Error('PRIVATE'); } });
  const f = fixture({ onMaterial(request, self) {
    refused = outcome(self.planner.prepareUnsigned(hostile));
    return pending;
  } });
  pending = f.planner.prepareUnsigned(f.context);
  await assert.rejects(pending, rejected());
  const result = await refused; assert.ok(Object.hasOwn(result, 'error'));
  assert.ok(rejected('busy')(result.error)); assert.equal(hooks, 0);
  assert.equal(f.calls.length, 4); assert.equal(f.materials.length, 1); await used(f);
});

test('deferred DP planner shields its public Promise and refuses pre-read native mechanics mutation without hooks', OPTIONS, async () => {
  for (const mode of ['constructor', 'species', 'inherited-then']) {
    const f = fixture();
    const target = mode === 'constructor' ? NativePromise.prototype : mode === 'species' ? NativePromise : Object.prototype;
    const key = mode === 'constructor' ? 'constructor' : mode === 'species' ? Symbol.species : 'then';
    const saved = Object.getOwnPropertyDescriptor(target, key);
    let hooks = 0, pending;
    try {
      Object.defineProperty(target, key, { configurable: true, get() { hooks++; throw Error('PRIVATE_NATIVE'); } });
      // The pre-read gate fails synchronously inside run, before its first
      // yield. Restore before any external microtask or assertion can execute.
      pending = f.planner.prepareUnsigned(f.context);
    } finally {
      if (saved) Object.defineProperty(target, key, saved); else delete target[key];
    }
    assert.equal(Object.getOwnPropertyDescriptor(pending, 'constructor').value, NativePromise);
    await assert.rejects(pending, rejected());
    assert.equal(hooks, 0); assert.equal(f.calls.length, 0); assert.equal(f.materials.length, 0);
    await used(f);
  }
});

test('deferred DP planner rejects malformed supplied material before assembly without nonce search or key production', OPTIONS, async () => {
  for (const value of [null, { ...material(), materialVersion: 2 }, { ...material(), privateKey: 'not-a-key' },
    { ...material(), publicKey: '' }, { ...material(), publicKey: 'B'.repeat(43) + '=' },
    { ...material(), publicKey: Buffer.alloc(33, 7).toString('base64') },
    { ...material(), nonce: '' }, { ...material(), nonce: 'ABCDEF0123456789' },
    { ...material(), nonce: '00'.repeat(9) }, { ...material(), signature: 'not-a-signature' }]) {
    const f = fixture({ onMaterial: () => NativePromise.resolve(value) });
    await assert.rejects(f.planner.prepareUnsigned(f.context), rejected());
    assert.equal(f.calls.length, 4); assert.equal(f.materials.length, 1); await used(f);
  }
});

test('deferred DP planner retains full payer key and fixed positive-work consumer checks after the handoff', OPTIONS, async () => {
  const f = fixture({ onMaterial: () => NativePromise.resolve({
    ...material(), publicKey: Buffer.alloc(32, 8).toString('base64'),
  }) });
  await assert.rejects(f.planner.prepareUnsigned(f.context), rejected());
  assert.equal(f.calls.length, 6); assert.equal(f.materials.length, 1);
  const value = rawView({ available: 0, maxFused: 0, maxDifficulty: Number.MAX_SAFE_INTEGER });
  const adapter = new DataAdapter(), supplied = view(value), plan = await adapter.quote(supplied);
  const work = await adapter.createWorkRequest(supplied, plan);
  assert.ok(work.workInput.difficulty > 0);
  // Exactly ONE already-supplied nonce is evaluated, not incremented or searched.
  const digest = createHash('sha3-256').update(Buffer.concat([
    Buffer.from(material().nonce, 'hex'), Buffer.from(work.workInput.dataHash, 'hex'),
  ])).digest();
  let number = 0n; for (let i = 7; i >= 0; i--) number = (number << 8n) | BigInt(digest[i]);
  const range = 1n << 64n;
  assert.ok(number < range - range / BigInt(work.workInput.difficulty));
  const g = fixture({}, value);
  await assert.rejects(g.planner.prepareUnsigned(g.context), rejected());
  assert.equal(g.calls.length, 6); assert.equal(g.materials.length, 1); await used(g);
});

test('deferred DP planner returns no partial block before the final same-block read gate', OPTIONS, async () => {
  const f = fixture({ deferAccountAt: 8 }); let returned = 0;
  const pending = f.planner.prepareUnsigned(f.context);
  const tracked = apply(nativeThen, pending, [value => { returned++; return value; }]);
  await f.accountReady.promise;
  try {
    assert.equal(returned, 0); assert.equal(f.materials.length, 1);
    assert.equal(f.calls.length, 8); assert.deepEqual(f.dp.positions, [24, 24]);
    await assert.rejects(f.planner.prepareUnsigned(f.context), rejected('busy'));
  } finally { f.releaseAccount(); }
  assert.deepEqual(await tracked, (await expected(f.value)).block); assert.equal(returned, 1); await used(f);
});

test('deferred DP planner preserves declared balance gates and finite snapshots without adding a balance RPC', OPTIONS, async () => {
  const f = fixture();
  f.context.readInput.accountInfoResultJson = JSON.stringify(info(f.value, '4'));
  await assert.rejects(f.planner.prepareUnsigned(f.context), rejected());
  assert.equal(f.calls.length, 1); assert.equal(f.materials.length, 0); assert.deepEqual(f.dp.positions, [0, 0]);
  for (const mutate of [
    c => { c.readInput.accountInfoResultJson = ' '.repeat(65537); },
    c => { c.readInput.accountInfoResultJson = '\u00e9'.repeat(40000); },
    c => { c.readInput.paymentRequired.resource.description = 'x'.repeat(8193); },
    c => { c.readInput.paymentRequired.resource.tags = Array(1025).fill('x'); },
    c => { const x = {}; x.self = x; c.readInput.paymentRequired.resource.tags = [x]; },
  ]) {
    const g = fixture(); mutate(g.context);
    await assert.rejects(g.planner.prepareUnsigned(g.context), rejected());
    assert.equal(g.calls.length, 0); assert.equal(g.materials.length, 0); await used(g);
  }
  const h = fixture(), large = info(h.value);
  large.balanceInfoMap[h.value.accepted.asset].token.description = 'x'.repeat(9000);
  h.context.readInput.accountInfoResultJson = JSON.stringify(large);
  assert.equal((await h.planner.prepareUnsigned(h.context)).signature, '');
  assert.equal(h.calls.length, 8); assert.equal(h.materials.length, 1);
  assert.ok(h.calls.every(c => c.method === 'ledger.getFrontierAccountBlock'));
});

test('deferred DP planner remains default-off and cannot activate a native producer signer SDK or recovery owner', OPTIONS, () => {
  assert.equal((source.match(/^export /gm) ?? []).length, 1);
  assert.equal((source.match(/CREATE_ATTEMPT\(reads\)/g) ?? []).length, 1);
  assert.equal((source.match(/apply\(EXCHANGE, undefined, \[request\]\)/g) ?? []).length, 1);
  assert.match(source, /await undefined/); assert.match(source, /pending === originalRun/);
  assert.match(source, /captureFulfilled/); assert.match(source, /return assembly\.accountBlock/);
  assert.doesNotMatch(source, /node:(?:fs|https?|tls|dns|child_process|worker_threads)|fetch\s*\(|new Promise|setTimeout|this\./);
  assert.doesNotMatch(source, /generateKeyPair|crypto\.sign|crypto\.verify|prepareBlock|publishRawTransaction|WalletAdapter/);
  assert.match(source, /unchanged/); assert.match(source, /NOT durable custody/);
  assert.match(source, /indirect dependencies/); assert.match(source, /No nonce search/);
});
