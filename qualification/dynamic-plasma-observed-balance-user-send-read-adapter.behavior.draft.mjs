import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

// Only fixed test-owned DATA/callbacks/native Promises. The real AccountInfo
// RPC/native owner, SDK, nonce search, keys/signing, SQL and payment do NOT run.
// Retain152 prior cases;20 new closed-wire/inputv3 cases are selected here.
assert.equal(process.argv.length, 2);
assert.equal(process.versions.node, '24.19.0');
const pins = [
  ['../src/zenon/dynamic-plasma-account-state-read-transport.js', 3632,
    '9aa818dabdacf0baec60ca570e854cc8a327e554ba5e5a76c670eb5ed02b29b8'],
  ['../src/zenon/dynamic-plasma-observed-balance-user-send-read-adapter.js', 15496,
    '0018c76c0e6bee0d0dbcd771613701162e3609b2dcebc36918c2092e3d6da432'],
];
const sources = [];
for (const [path, size, hash] of pins) {
  const bytes = readFileSync(new URL(path, import.meta.url));
  assert.equal(bytes.length, size); assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
  assert.equal(/[^\x00-\x7f]/.test(bytes.toString('utf8')) || bytes.includes(0), false);
  sources.push(bytes.toString('ascii'));
}
await import('./dynamic-plasma-deferred-material-planner.behavior.draft.mjs');
const { createZenonAccountStateReadTransport: WIRE }
  = await import('../src/zenon/dynamic-plasma-account-state-read-transport.js');
const { createObservedBalanceDynamicPlasmaUserSendReadAdapter: CREATE }
  = await import('../src/zenon/dynamic-plasma-observed-balance-user-send-read-adapter.js');
const { rawAdapterViewFixture: rawView, rawAdapterMaterialFixture: material }
  = await import('./dynamic-plasma-raw-adapter.behavior.draft.mjs');
const { requestBoundCollectionFixture: collection }
  = await import('./dynamic-plasma-request-bound-collection.behavior.draft.mjs');
const { frontierReadBlockFixture: block }
  = await import('./dynamic-plasma-account-frontier-read.behavior.draft.mjs');
const { ObservedDynamicPlasmaUserSendAdapter: DataAdapter }
  = await import('../src/zenon/dynamic-plasma-observed-user-send-adapter.js');

const NativePromise = Promise, nativeThen = Promise.prototype.then, apply = Reflect.apply;
const OPTIONS = { timeout: 5000, concurrency: false };
const FRONTIER = 'ledger.getFrontierAccountBlock', INFO = 'ledger.getAccountInfoByAddress';
const copy = value => JSON.parse(JSON.stringify(value)); // Owned valid synthetic fixture DATA only.
function cap() {
  let resolve, reject; const promise = new NativePromise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function request(method = INFO, address = rawView().payerAddress) {
  return Object.freeze({ method, params: Object.freeze([address]) });
}
function info(value, balance = value.accepted.amount) {
  return { address: value.payerAddress, accountHeight: value.accountFrontier.height,
    balanceInfoMap: { [value.accepted.asset]: { token: { tokenStandard: value.accepted.asset }, balance } } };
}
function input(value) {
  return { observedUserSendReadVersion: 3, phase: 'UNSIGNED', paymentRequired: value.paymentRequired,
    accepted: value.accepted, payerAddress: value.payerAddress, compiledSporkIds: value.compiledSporkIds,
    policy: value.policy, runtimeContextDigest: value.runtimeContextDigest };
}
function adjust(text, method, advance) {
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
  const dp = collection(value, mode.dp || {}), calls = [], order = [], infoReady = cap();
  const f = { dp, calls, order, infoReady, mode, value, input: input(value), advance: 0, balance: value.accepted.amount };
  const transports = dp.options.transports.map((transport, endpoint) => Object.freeze({
    callRead: Object.freeze(function callRead(request) {
      order.push({ kind: 'dp', endpoint, method: request.method });
      const pending = transport.callRead(request), advance = f.advance;
      return advance ? apply(nativeThen, pending, [text => adjust(text, request.method, advance)]) : pending;
    }),
  }));
  f.options = { transports, accountExchange(body) {
    const message = JSON.parse(body), position = calls.length + 1;
    calls.push(message); order.push({ kind: 'account', method: message.method, id: message.id });
    assert.equal(message.id, position); assert.deepEqual(message.params, [value.payerAddress]);
    assert.ok(message.method === FRONTIER || message.method === INFO);
    if (mode.onAccount) mode.onAccount(message, f);
    if (mode.throwAt === position) throw Error('PRIVATE_ACCOUNT');
    const result = message.method === INFO ? info(value, f.balance) : block(value);
    if (mode.movedAt && position >= mode.movedAt && message.method === FRONTIER) {
      result.height += 1; result.hash = '99'.repeat(32);
    }
    let text = JSON.stringify({ jsonrpc: '2.0', id: message.id + (mode.badIdAt === position ? 1 : 0), result });
    if (message.method === INFO && mode.infoText) text = '{"jsonrpc":"2.0","id":' + message.id + ',"result":' + mode.infoText + '}';
    if (message.method === INFO && mode.infoResult) text = JSON.stringify({ jsonrpc: '2.0', id: message.id,
      result: mode.infoResult(copy(result), value) });
    if (message.method === INFO && mode.deferInfo) {
      const held = cap(); f.releaseInfo = () => held.resolve(text); infoReady.resolve(undefined); return held.promise;
    }
    if (message.method === INFO && mode.infoPromise) return mode.infoPromise(text);
    return NativePromise.resolve(text);
  } };
  f.adapter = CREATE(f.options); return f;
}
function rejected(kind = 'read_or_stage_rejected') {
  return error => {
    const prefix = 'zenon_observed_balance_dp_read_adapter_';
    assert.ok(error instanceof (kind === 'busy' ? Error : TypeError));
    assert.equal(error.code, prefix + kind); assert.equal(error.message, error.code);
    assert.equal(error.stack, (kind === 'busy' ? 'Error: ' : 'TypeError: ') + error.code);
    assert.ok(Object.isFrozen(error)); assert.equal(Object.hasOwn(error, 'cause'), false); return true;
  };
}
function wireRejected(kind) {
  return error => { assert.equal(error.code, 'dynamic_plasma_json_rpc_read_transport_' + kind); assert.ok(Object.isFrozen(error)); return true; };
}
async function held(f) {
  const count = f.calls.length, positions = f.dp.positions.slice();
  await assert.rejects(f.adapter.quote(null), rejected('held'));
  assert.equal(f.calls.length, count); assert.deepEqual(f.dp.positions, positions);
}

test('account state wire captures one exchange with zero construction handoffs and serializes both closed methods with shared IDs', OPTIONS, async () => {
  const calls = [], wire = WIRE({ exchange(body) {
    const parsed = JSON.parse(body); calls.push({ body, parsed, receiver: this, count: arguments.length });
    return NativePromise.resolve(JSON.stringify({ jsonrpc: '2.0', id: parsed.id, result: { synthetic: true } }));
  } });
  assert.deepEqual(Object.keys(wire), ['callRead']); assert.ok(Object.isFrozen(wire)); assert.equal(calls.length, 0);
  for (const method of [FRONTIER, INFO]) assert.equal(await wire.callRead(request(method)), '{"synthetic":true}');
  assert.deepEqual(calls.map(c => c.parsed.id), [1, 2]); assert.deepEqual(calls.map(c => c.parsed.method), [FRONTIER, INFO]);
  for (const call of calls) {
    assert.equal(call.receiver, undefined); assert.equal(call.count, 1);
    assert.deepEqual(call.parsed.params, [rawView().payerAddress]);
    assert.equal(call.body, JSON.stringify({ jsonrpc: '2.0', id: call.parsed.id, method: call.parsed.method, params: call.parsed.params }));
  }
});

test('account state wire refuses other methods shapes payer coercion getters proxies and unfrozen DATA before exchange', OPTIONS, async () => {
  let calls = 0, hooks = 0; const hook = () => { hooks++; throw Error('PRIVATE_REQUEST'); };
  const wire = WIRE({ exchange(body) { calls++; const message = JSON.parse(body);
    return NativePromise.resolve(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: null })); } });
  const accessor = { params: Object.freeze([rawView().payerAddress]) };
  Object.defineProperty(accessor, 'method', { enumerable: true, get: hook }); Object.freeze(accessor);
  for (const value of [null, {}, accessor, { method: INFO, params: [rawView().payerAddress] },
    request('ledger.publishRawTransaction'), request('ledger.getUnreceivedBlocksByAddress'),
    Object.freeze({ method: INFO, params: Object.freeze([rawView().payerAddress, 0]) }),
    Object.freeze({ method: INFO, params: Object.freeze([{ toString: hook, [Symbol.toPrimitive]: hook }]) }),
    new Proxy(request(), { getPrototypeOf: hook, ownKeys: hook, get: hook })])
    await assert.rejects(wire.callRead(value), wireRejected('input_rejected'));
  assert.equal(calls, 0); assert.equal(hooks, 0); assert.equal(await wire.callRead(request()), 'null'); assert.equal(calls, 1);
});

test('account state wire shares its32 handoff ceiling across both methods without reset or counter recreation', OPTIONS, async () => {
  const calls = [], wire = WIRE({ exchange(body) { const message = JSON.parse(body); calls.push(message);
    return NativePromise.resolve(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: message.id })); } });
  for (let i = 1; i <= 32; i++) assert.equal(await wire.callRead(request(i % 2 ? FRONTIER : INFO)), String(i));
  await assert.rejects(wire.callRead(null), wireRejected('exhausted'));
  assert.deepEqual(calls.map(c => c.id), Array.from({ length: 32 }, (_, i) => i + 1)); assert.equal(calls.length, 32);
});

test('account state wire preserves native pending busy and exact envelope correlation without implicit retry', OPTIONS, async () => {
  const pending = cap(), calls = [], wire = WIRE({ exchange(body) { calls.push(JSON.parse(body)); return pending.promise; } });
  const first = wire.callRead(request(INFO)); await assert.rejects(wire.callRead(request(FRONTIER)), wireRejected('busy'));
  pending.resolve('{"jsonrpc":"2.0","id":2,"result":null}');
  await assert.rejects(first, wireRejected('unavailable')); assert.equal(calls.length, 1);
  const g = WIRE({ exchange: () => NativePromise.resolve('{"jsonrpc":"2.0","id":1,"id":1,"result":null}') });
  await assert.rejects(g.callRead(request()), wireRejected('unavailable'));
});

test('observed balance reader exposes only frozen captured stages and validates configuration without native owner handoffs', OPTIONS, () => {
  const f = fixture(); assert.deepEqual(Object.keys(f.adapter), ['quote', 'createWorkRequest', 'assemble', 'validateUnsigned']);
  assert.ok(Object.isFrozen(f.adapter)); for (const method of Object.values(f.adapter)) assert.ok(Object.isFrozen(method));
  assert.equal(f.calls.length, 0); assert.equal(f.order.length, 0);
  let hooks = 0; const hook = () => { hooks++; throw Error('PRIVATE_CONFIGURATION'); };
  const bad = { transports: f.options.transports }; Object.defineProperty(bad, 'accountExchange', { enumerable: true, get: hook });
  for (const value of [null, {}, bad, { ...f.options, endpoint: 'https://unused.invalid' },
    { ...f.options, accountExchange: new Proxy(hook, {}) }, { ...f.options, transports: [] }])
    assert.throws(() => CREATE(value), rejected('configuration_rejected'));
  assert.throws(() => CREATE(), rejected('configuration_rejected')); assert.equal(hooks, 0); assert.equal(f.calls.length, 0);
});

test('observed balance reader fetches account info before DP and brackets all four unchanged unsigned stages with one shared account wire', OPTIONS, async () => {
  const f = fixture(), before = copy(f.input), plan = await f.adapter.quote(f.input);
  const work = await f.adapter.createWorkRequest(f.input, plan);
  const assembly = await f.adapter.assemble(f.input, plan, material());
  const checked = await f.adapter.validateUnsigned(f.input, plan, assembly.accountBlock);
  assert.equal(work.accountBlock.previousHash, plan.subject.previousHash);
  assert.equal(assembly.accountBlock.momentumAcknowledged.height, 100);
  assert.deepEqual(checked, assembly.validation);
  assert.equal(f.calls.length, 12); assert.deepEqual(f.dp.positions, [24, 24]); assert.deepEqual(f.input, before);
  assert.deepEqual(f.calls.map(c => c.id), Array.from({ length: 12 }, (_, i) => i + 1));
  assert.deepEqual(f.calls.map(c => c.method), Array.from({ length: 4 }, () => [FRONTIER, INFO, FRONTIER]).flat());
  for (let i = 0; i < 4; i++) {
    const cycle = f.order.slice(i * 15, (i + 1) * 15);
    assert.equal(cycle[0].method, FRONTIER); assert.equal(cycle[1].method, INFO);
    assert.ok(cycle.slice(2, 14).every(c => c.kind === 'dp')); assert.equal(cycle[14].method, FRONTIER);
  }
});

test('observed balance reader requires exact v3 input and cannot downgrade to supplied balance text or v1 v2 before reads', OPTIONS, async () => {
  const f = fixture();
  for (const changes of [{ observedUserSendReadVersion: 1 }, { observedUserSendReadVersion: 2 },
    { phase: 'SIGNED' }, { phase: 'VALIDATED' }, { accountInfoResultJson: JSON.stringify(info(f.value)) },
    { runtimeContextDigest: 'sha256:' + 'z'.repeat(64) }, { balance: f.value.accepted.amount }])
    await assert.rejects(f.adapter.quote({ ...f.input, ...changes }), rejected('input_rejected'));
  await assert.rejects(f.adapter.quote(), rejected('input_rejected'));
  await assert.rejects(f.adapter.quote(f.input, null), rejected('input_rejected'));
  assert.equal(f.calls.length, 0); assert.deepEqual(f.dp.positions, [0, 0]);
  await f.adapter.quote(f.input); assert.equal(f.calls.length, 3);
});

test('observed balance reader refuses missing unavailable or insufficient selected balance after two handoffs and before any DP read', OPTIONS, async () => {
  for (const infoResult of [() => null, result => ({ ...result, balanceInfoMap: {} }),
    result => ({ ...result, balanceInfoMap: null }), (result, value) => info(value, '0'),
    (result, value) => info(value, '4'), (result, value) => info(value, '05')]) {
    const f = fixture({ infoResult });
    await assert.rejects(f.adapter.quote(f.input), rejected());
    assert.equal(f.calls.length, 2); assert.deepEqual(f.dp.positions, [0, 0]); await held(f);
  }
});

test('observed balance reader binds native payer accountHeight selected asset and raw numeric lexemes without SDK conversion', OPTIONS, async () => {
  const value = rawView(), good = info(value), text = JSON.stringify(good);
  const wrongToken = copy(good); wrongToken.balanceInfoMap[value.accepted.asset].token.tokenStandard = 'zts1qsrxxxxxxxxxxxxxmrhjll';
  for (const infoText of [text.replace('"accountHeight":6', '"accountHeight":6e0'),
    text.replace('"accountHeight":6', '"accountHeight":6,"accountHeight":6'),
    JSON.stringify({ ...good, address: value.accepted.payTo }), JSON.stringify({ ...good, accountHeight: 7 }),
    JSON.stringify({ address: good.address, blockCount: 6, balanceInfoMap: good.balanceInfoMap }), JSON.stringify(wrongToken)]) {
    assert.notEqual(infoText, text); const f = fixture({ infoText });
    await assert.rejects(f.adapter.quote(f.input), rejected());
    assert.equal(f.calls.length, 2); assert.deepEqual(f.dp.positions, [0, 0]); await held(f);
  }
});

test('observed balance reader holds when account frontier moves after coherent balance and dual DP projections without claiming atomic funds', OPTIONS, async () => {
  const f = fixture({ movedAt: 3 }); await assert.rejects(f.adapter.quote(f.input), rejected());
  assert.equal(f.calls.length, 3); assert.deepEqual(f.dp.positions, [6, 6]); await held(f);
});

test('observed balance reader rejects an advanced original account before balance or DP at every later stage', OPTIONS, async () => {
  for (const stage of ['work', 'assemble', 'validate']) {
    const f = fixture(), plan = await f.adapter.quote(f.input);
    if (stage !== 'work') await f.adapter.createWorkRequest(f.input, plan);
    const assembly = stage === 'validate' ? await f.adapter.assemble(f.input, plan, material()) : null;
    const reads = f.calls.length, positions = f.dp.positions.slice(); f.mode.movedAt = reads + 1;
    const operation = stage === 'work' ? f.adapter.createWorkRequest(f.input, plan)
      : stage === 'assemble' ? f.adapter.assemble(f.input, plan, material())
      : f.adapter.validateUnsigned(f.input, plan, assembly.accountBlock);
    await assert.rejects(operation, rejected()); assert.equal(f.calls.length, reads + 1);
    assert.equal(f.calls.at(-1).method, FRONTIER); assert.deepEqual(f.dp.positions, positions); await held(f);
  }
});

test('observed balance reader snapshots selected input and original plan before callbacks and issues no DP while AccountInfo is pending', OPTIONS, async () => {
  const f = fixture({ deferInfo: true }), before = copy(f.input), pending = f.adapter.quote(f.input);
  await f.infoReady.promise; assert.equal(f.calls.length, 2); assert.deepEqual(f.dp.positions, [0, 0]);
  let hooks = 0; const hostile = new Proxy({}, { getPrototypeOf() { hooks++; throw Error('PRIVATE_BUSY'); } });
  await assert.rejects(f.adapter.quote(hostile), rejected('busy')); assert.equal(hooks, 0);
  f.input.accepted.amount = '999'; f.input.paymentRequired.accepts[0].amount = '999'; f.input.policy.maxDifficulty = 1;
  f.releaseInfo(); const plan = await pending; assert.equal(plan.subject.amount, before.accepted.amount);
  assert.equal(f.calls.length, 3); assert.deepEqual(f.dp.positions, [6, 6]);
  const g = fixture();
  // Returned plan is frozen; use an owned JSON DATA copy for a mutation probe.
  const original = copy(await g.adapter.quote(g.input));
  g.mode.onAccount = (message, self) => { if (message.id === 4) original.subject.amount = '999'; };
  const work = await g.adapter.createWorkRequest(g.input, original); assert.equal(work.accountBlock.amount, '5');
});

test('observed balance reader obtains a new balance sample on later stages and never reuses a prior supplied sufficient balance', OPTIONS, async () => {
  const f = fixture(), plan = await f.adapter.quote(f.input); f.balance = '0';
  await assert.rejects(f.adapter.createWorkRequest(f.input, plan), rejected());
  assert.equal(f.calls.length, 5); assert.deepEqual(f.calls.map(c => c.method), [FRONTIER, INFO, FRONTIER, FRONTIER, INFO]);
  assert.deepEqual(f.dp.positions, [6, 6]); await held(f);
});

test('observed balance reader stops after AccountInfo or DP failures without an after read fallback or retry', OPTIONS, async () => {
  for (const mode of [{ throwAt: 2 }, { badIdAt: 2 }, { dp: { throwFirst: true } }]) {
    const f = fixture(mode); await assert.rejects(f.adapter.quote(f.input), rejected());
    assert.equal(f.calls.length, 2);
    if (mode.dp) assert.ok(f.dp.positions[0] > 0); else assert.deepEqual(f.dp.positions, [0, 0]);
    await held(f);
  }
});

test('observed balance reader observes only native exchange Promise mechanics at the new info boundary without thenable hooks', OPTIONS, async () => {
  let hooks = 0; const hook = () => { hooks++; throw Error('PRIVATE_THEN'); };
  const f = fixture({ infoPromise(text) {
    return Object.freeze(NativePromise.resolve(text));
  } });
  await f.adapter.quote(f.input); assert.equal(hooks, 0); assert.equal(f.calls.length, 3);
  for (const infoPromise of [text => { const pending = NativePromise.resolve(text);
    Object.defineProperty(pending, 'then', { get: hook }); return pending; },
    () => ({ then: hook }), () => new Proxy(NativePromise.resolve('null'), {}),
    text => new (class Foreign extends NativePromise {})(resolve => resolve(text)),
    () => { const pending = NativePromise.reject(Error('PRIVATE_REJECTION')); apply(nativeThen, pending, [null, () => undefined]); return pending; }]) {
    const g = fixture({ infoPromise }); await assert.rejects(g.adapter.quote(g.input), rejected());
    assert.equal(g.calls.length, 2); assert.deepEqual(g.dp.positions, [0, 0]); await held(g);
  }
  assert.equal(hooks, 0);
});

test('observed balance reader retains original quote acknowledgement through two price advances and holds beyond the declared horizon', OPTIONS, async () => {
  for (const advance of [1, 2]) {
    const f = fixture(), plan = await f.adapter.quote(f.input); f.advance = advance;
    const work = await f.adapter.createWorkRequest(f.input, plan);
    assert.equal(work.accountBlock.momentumAcknowledged.height, 100); assert.equal(work.accountBlock.difficulty, 0);
    assert.equal(f.calls.length, 6); assert.deepEqual(f.dp.positions, [12, 12]);
  }
  const f = fixture(), plan = await f.adapter.quote(f.input); f.advance = 3;
  await assert.rejects(f.adapter.createWorkRequest(f.input, plan), rejected());
  assert.equal(f.calls.length, 6); assert.deepEqual(f.dp.positions, [12, 12]); await held(f);
});

test('observed balance reader consumes at most ten whole three-read cycles and refuses an eleventh before hostile input or any extra handoff', OPTIONS, async () => {
  const f = fixture(); for (let i = 0; i < 10; i++) await f.adapter.quote(f.input);
  let hooks = 0; const hostile = new Proxy({}, { getPrototypeOf() { hooks++; throw Error('PRIVATE_EXHAUSTED'); } });
  await assert.rejects(f.adapter.quote(hostile), rejected('exhausted'));
  assert.equal(hooks, 0); assert.equal(f.calls.length, 30); assert.deepEqual(f.dp.positions, [60, 60]);
  assert.deepEqual(f.calls.map(c => c.id), Array.from({ length: 30 }, (_, i) => i + 1));
});

test('observed balance reader refuses getters proxies sparse arrays and unknown DATA with zero hooks and no input freezing', OPTIONS, async () => {
  const f = fixture(); let hooks = 0; const hook = () => { hooks++; throw Error('PRIVATE_INPUT'); };
  const accessor = copy(f.input); Object.defineProperty(accessor, 'accepted', { enumerable: true, get: hook });
  const nested = copy(f.input); Object.defineProperty(nested.policy, 'maxDifficulty', { enumerable: true, get: hook });
  const sparse = copy(f.input); sparse.paymentRequired.accepts = new Array(1);
  for (const value of [accessor, nested, sparse, Object.assign(Object.create(null), f.input),
    new Proxy(f.input, { getPrototypeOf: hook, ownKeys: hook }), { ...f.input, then: hook }])
    await assert.rejects(f.adapter.quote(value), rejected('input_rejected'));
  assert.equal(hooks, 0); assert.equal(f.calls.length, 0); assert.equal(Object.isFrozen(f.input), false);
});

test('observed balance reader shields its public Promise and refuses pre-read native global drift with synchronous restore', OPTIONS, async () => {
  for (const mode of ['constructor', 'species', 'inherited-then']) {
    const f = fixture(), target = mode === 'constructor' ? NativePromise.prototype : mode === 'species' ? NativePromise : Object.prototype;
    const key = mode === 'constructor' ? 'constructor' : mode === 'species' ? Symbol.species : 'then';
    const saved = Object.getOwnPropertyDescriptor(target, key); let hooks = 0, pending;
    try {
      Object.defineProperty(target, key, { configurable: true, get() { hooks++; throw Error('PRIVATE_NATIVE'); } });
      pending = f.adapter.quote(f.input);
    } finally { if (saved) Object.defineProperty(target, key, saved); else delete target[key]; }
    assert.equal(Object.getOwnPropertyDescriptor(pending, 'constructor').value, NativePromise);
    await assert.rejects(pending, rejected('input_rejected')); assert.equal(hooks, 0); assert.equal(f.calls.length, 0);
  }
});

test('observed balance reader captures existing stages and closed core without SDK nonce search native hosts active cutover or authority', OPTIONS, async () => {
  for (const source of sources) {
    assert.equal((source.match(/^export /gm) ?? []).length, 1);
    assert.doesNotMatch(source, /node:(?:fs|https?|tls|dns|child_process|worker_threads)|fetch\s*\(|setTimeout|new Promise|this\./);
    assert.doesNotMatch(source, /randomBytes|generateKeyPair|crypto\.sign|crypto\.verify|searchZenon|prepareBlock|publishRawTransaction/);
  }
  assert.match(sources[0], /const CORE = createBoundedJsonRpcReadTransportCore/);
  assert.match(sources[1], /const BALANCE = validateZenonUserSendBalanceRead/);
  assert.match(sources[1], /cycles >= 10/); assert.match(sources[1], /observedUserSendReadVersion !== 3/);
  assert.match(sources[1], /NOT atomicity/); assert.match(sources[1], /not adoption into the deferred planner/);
  const saved = Object.getOwnPropertyDescriptor(DataAdapter.prototype, 'quote'); let hooks = 0;
  try {
    Object.defineProperty(DataAdapter.prototype, 'quote', { configurable: true, value() { hooks++; throw Error('PRIVATE_STAGE'); } });
    const f = fixture(); await f.adapter.quote(f.input); assert.equal(hooks, 0);
  } finally { Object.defineProperty(DataAdapter.prototype, 'quote', saved); }
});
