import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// One reviewed declared-DATA graph. Retain68 adapter/raw/collection/frontier
// cases and add16 read/stage cases. All exchanges are test-owned synthetic
// strings/native Promises; no native endpoint, SDK, signer or real RPC runs.
assert.equal(process.argv.length, 2);
const bytes = readFileSync(new URL('../src/zenon/dynamic-plasma-observed-user-send-read-adapter.js', import.meta.url));
assert.equal(bytes.length, 17026);
assert.equal(createHash('sha256').update(bytes).digest('hex'),
  '883104f7733ae68d755da4898e776ed8b18eba0a9d271cbc169b218e7a6776d8');
assert.equal(/[^\x00-\x7f]/.test(bytes.toString('utf8')) || bytes.includes(0), false);
const source = bytes.toString('ascii');
const { createObservedDynamicPlasmaUserSendReadAdapter: create }
  = await import('../src/zenon/dynamic-plasma-observed-user-send-read-adapter.js');
const { ObservedDynamicPlasmaUserSendAdapter: DataAdapter }
  = await import('../src/zenon/dynamic-plasma-observed-user-send-adapter.js');
await import('./dynamic-plasma-observed-user-send-adapter.behavior.draft.mjs');
const { requestBoundCollectionFixture: collection }
  = await import('./dynamic-plasma-request-bound-collection.behavior.draft.mjs');
const { rawAdapterViewFixture: rawView, rawAdapterMaterialFixture: material }
  = await import('./dynamic-plasma-raw-adapter.behavior.draft.mjs');
const { frontierReadBlockFixture: block }
  = await import('./dynamic-plasma-account-frontier-read.behavior.draft.mjs');

const NativePromise = Promise, nativeThen = Promise.prototype.then, apply = Reflect.apply;
const clone = value => JSON.parse(JSON.stringify(value)); // Owned fixture DATA only.
const methods = ['quote', 'createWorkRequest', 'assemble', 'validateUnsigned'];
function input(value = rawView()) {
  return { observedUserSendReadVersion: 1, phase: 'UNSIGNED', paymentRequired: value.paymentRequired,
    accepted: value.accepted, payerAddress: value.payerAddress, compiledSporkIds: value.compiledSporkIds,
    policy: value.policy, runtimeContextDigest: value.runtimeContextDigest };
}
function view(value = rawView()) {
  return { observedUserSendViewVersion: 1, phase: 'UNSIGNED', paymentRequired: value.paymentRequired,
    accepted: value.accepted, payerAddress: value.payerAddress, compiledSporkIds: value.compiledSporkIds,
    accountFrontierResultJson: JSON.stringify(block(value)), observation: value.observation,
    policy: value.policy, runtimeContextDigest: value.runtimeContextDigest };
}
function rejected(kind = 'read_or_stage_rejected') {
  return error => {
    assert.ok(error instanceof (kind === 'busy' ? Error : TypeError) && Object.isFrozen(error));
    assert.equal(error.code, 'zenon_observed_dp_read_adapter_' + kind);
    assert.equal(error.message, error.code);
    assert.equal(error.stack, (kind === 'busy' ? 'Error: ' : 'TypeError: ') + error.code);
    assert.equal(Object.hasOwn(error, 'cause'), false); return true;
  };
}
function adjust(text, method, count) {
  if (!count) return text;
  const value = JSON.parse(text), price = [1000, 1100, 1210, 1331][count];
  if (method === 'ledger.getFrontierMomentum') {
    value.height = 100 + count; value.hash = String(count + 3).repeat(64);
    value.nextFusionPrice = price; value.nextWorkPrice = price;
  } else if (method === 'embedded.plasma.getRequiredPoWForAccountBlock') {
    value.requiredFusedPlasma = Math.ceil(value.basePlasma * price / 1000);
    const fused = Math.min(value.availablePlasma, value.requiredFusedPlasma);
    const remaining = Math.max(0, value.basePlasma - Math.floor(fused * 1000 / price));
    value.requiredDifficulty = Math.ceil(remaining * price / 1000) * 1500;
  }
  return JSON.stringify(value);
}
function fixture(settings = {}, value = rawView()) {
  const order = [], accountCalls = [], mode = settings;
  const dp = collection(value, {
    badJson: !!settings.badDP, onFirst() { if (mode.onDPFirst) mode.onDPFirst(); },
  });
  const transports = dp.options.transports.map((transport, index) => Object.freeze({
    callRead: Object.freeze(function callRead(request) {
      order.push('DP' + index + ':' + request.method);
      const pending = transport.callRead(request), advance = mode.advance || 0;
      if (!advance) return pending;
      return apply(nativeThen, pending, [text => adjust(text, request.method, advance)]);
    }),
  }));
  let release;
  const accountExchange = body => {
    const request = JSON.parse(body), index = accountCalls.length + 1;
    accountCalls.push(request); order.push('A' + index);
    assert.equal(request.method, 'ledger.getFrontierAccountBlock');
    assert.deepEqual(request.params, [value.payerAddress]);
    assert.equal(request.id, index);
    if (mode.onAccount) mode.onAccount(index);
    if (mode.throwAt === index) throw Error('PRIVATE_ACCOUNT_FAILURE');
    if (mode.rejectAt === index) return NativePromise.reject({ privateReason: true });
    if (mode.malformedAt === index) return NativePromise.resolve('not-json');
    let result = block(value);
    if (mode.accountChange) result = mode.accountChange(result, index);
    const raw = mode.resultText === undefined ? JSON.stringify(result) : mode.resultText;
    const text = '{"jsonrpc":"2.0","id":' + (request.id + (mode.wrongId ? 1 : 0)) + ',"result":' + raw + '}';
    if (mode.promise) return mode.promise(text);
    if (mode.deferredAt === index) return new NativePromise(resolve => { release = () => resolve(text); });
    return NativePromise.resolve(text);
  };
  const options = { transports, accountExchange }, adapter = create(options);
  return { adapter, options, input: input(value), view: view(value), value, dp, order, accountCalls, mode,
    release: () => release() };
}
function call(adapter, name, supplied, plan, extra) {
  if (name === 'quote') return adapter.quote(supplied);
  if (name === 'createWorkRequest') return adapter.createWorkRequest(supplied, plan);
  return adapter[name](supplied, plan, extra);
}
async function original() {
  const value = rawView(), adapter = new DataAdapter(), supplied = view(value);
  const plan = await adapter.quote(supplied), assembly = await adapter.assemble(supplied, plan, material());
  return { value, plan, assembly };
}
function frozen(value) {
  if (value !== null && typeof value === 'object') {
    assert.ok(Object.isFrozen(value)); for (const child of Object.values(value)) frozen(child);
  }
}

test('observed read adapter constructs only captured closed components and starts with zero exchange handoffs', { timeout: 5000 }, async () => {
  const f = fixture();
  assert.deepEqual(Object.keys(f.adapter), methods); assert.equal(f.order.length, 0); assert.equal(f.accountCalls.length, 0);
  assert.deepEqual(f.dp.positions, [0, 0]); assert.ok(Object.isFrozen(f.adapter));
  for (const method of Object.values(f.adapter)) assert.ok(Object.isFrozen(method));
  const saved = f.options.accountExchange;
  f.options.accountExchange = () => { throw Error('REPLACED'); }; f.options.transports[0] = null;
  const plan = await f.adapter.quote(f.input);
  assert.equal(plan.subject.height, 7); assert.equal(f.accountCalls.length, 2);
  assert.notEqual(saved, f.options.accountExchange);
});

test('observed read adapter brackets each existing unsigned stage with account reads around dual DP observations', { timeout: 5000 }, async () => {
  const f = fixture(), expected = await new DataAdapter().quote(f.view);
  const plan = await f.adapter.quote(f.input), work = await f.adapter.createWorkRequest(f.input, plan);
  const assembly = await f.adapter.assemble(f.input, plan, material());
  assert.deepEqual(await f.adapter.validateUnsigned(f.input, plan, assembly.accountBlock), assembly.validation);
  assert.deepEqual(plan, expected); assert.equal(work.accountBlock.height, 7);
  assert.equal(assembly.accountBlock.signature, ''); assert.equal(assembly.authority, 'NONE');
  assert.deepEqual(f.dp.positions, [24, 24]); assert.equal(f.accountCalls.length, 8);
  assert.equal(f.order.length, 56);
  for (let cycle = 0; cycle < 4; cycle++) {
    const rows = f.order.slice(cycle * 14, (cycle + 1) * 14);
    assert.equal(rows[0], 'A' + (cycle * 2 + 1)); assert.equal(rows[13], 'A' + (cycle * 2 + 2));
    assert.ok(rows.slice(1, 7).every(s => s.startsWith('DP0:')));
    assert.ok(rows.slice(7, 13).every(s => s.startsWith('DP1:')));
  }
  frozen(plan); frozen(assembly); assert.equal(Object.isFrozen(f.input), false);
});

test('observed read adapter preserves the original plan block and acknowledgement through two price advances then holds', { timeout: 5000 }, async () => {
  const f = fixture(), plan = await f.adapter.quote(f.input), assembly = await f.adapter.assemble(f.input, plan, material());
  const retained = JSON.stringify([plan, assembly.accountBlock]);
  for (const advance of [1, 2]) {
    f.mode.advance = advance;
    const validation = await f.adapter.validateUnsigned(f.input, plan, assembly.accountBlock);
    assert.deepEqual(validation.workBinding.hashPriceBinding.accountBlock, assembly.accountBlock);
    assert.equal(validation.authority, 'NONE');
    assert.equal(plan.subject.momentumAcknowledged.height, 100);
  }
  f.mode.advance = 3;
  await assert.rejects(f.adapter.validateUnsigned(f.input, plan, assembly.accountBlock), rejected());
  const reads = f.order.length;
  await assert.rejects(f.adapter.quote(f.input), rejected('held'));
  assert.equal(f.order.length, reads); assert.equal(f.accountCalls.length, 10);
  assert.deepEqual(f.dp.positions, [30, 30]); assert.equal(JSON.stringify([plan, assembly.accountBlock]), retained);
});

test('observed read adapter rejects mismatched bracket projections and never treats agreement as full block authentication', { timeout: 5000 }, async () => {
  for (const change of [b => ({ ...b, height: 7 }), b => ({ ...b, hash: '77'.repeat(32) }),
    b => ({ ...b, address: rawView().accepted.payTo }), b => ({ ...b, chainIdentifier: 1 })]) {
    const f = fixture({ accountChange: (b, index) => index === 2 ? change(b) : b });
    await assert.rejects(f.adapter.quote(f.input), rejected());
    assert.equal(f.accountCalls.length, 2); assert.deepEqual(f.dp.positions, [6, 6]);
    const reads = f.order.length; await assert.rejects(f.adapter.quote(f.input), rejected('held')); assert.equal(f.order.length, reads);
  }
  const f = fixture({ accountChange: (b, index) => ({ ...b, publicKey: 'unvalidated',
    signature: 'unvalidated', amount: 'unvalidated-' + index, confirmationDetail: { untrusted: index } }) });
  const plan = await f.adapter.quote(f.input);
  assert.deepEqual(plan, await new DataAdapter().quote(f.view)); assert.equal(plan.quote.authority, 'NONE');
  assert.equal(Object.hasOwn(plan, 'atomicity'), false); assert.equal(Object.hasOwn(plan, 'READY'), false);
});

test('observed read adapter refuses an advanced original account before any DP read at every later stage', { timeout: 5000 }, async () => {
  const { plan, assembly } = await original(), retained = JSON.stringify([plan, assembly.accountBlock]);
  for (const name of methods.slice(1)) {
    const f = fixture({ accountChange: b => ({ ...b, height: 7, hash: '99'.repeat(32) }) });
    await assert.rejects(call(f.adapter, name, f.input, plan,
      name === 'assemble' ? material() : assembly.accountBlock), rejected());
    assert.equal(f.accountCalls.length, 1); assert.deepEqual(f.dp.positions, [0, 0]);
    await assert.rejects(f.adapter.quote(f.input), rejected('held'));
  }
  assert.equal(JSON.stringify([plan, assembly.accountBlock]), retained);
});

test('observed read adapter holds on unavailable malformed miscorrelated and empty account results without retry', { timeout: 5000 }, async () => {
  for (const settings of [{ throwAt: 1 }, { rejectAt: 1 }, { malformedAt: 1 }, { wrongId: true },
    { resultText: 'null' }, { resultText: '{}' }, { resultText: '[]' },
    { resultText: JSON.stringify({ ...block(), height: 0, hash: '0'.repeat(64) }) },
    { resultText: JSON.stringify(block()).replace('"height":6,', '"height":6.0,') }]) {
    const f = fixture(settings);
    await assert.rejects(f.adapter.quote(f.input), rejected());
    assert.equal(f.accountCalls.length, 1); assert.deepEqual(f.dp.positions, [0, 0]);
    const reads = f.order.length; await assert.rejects(f.adapter.quote(f.input), rejected('held')); assert.equal(f.order.length, reads);
  }
});

test('observed read adapter stops before the second account read when dual DP data is unavailable or incoherent', { timeout: 5000 }, async () => {
  for (const settings of [{ badDP: true }, {}]) {
    const value = rawView();
    if (!settings.badDP) value.observation.endpointObservations[0].afterFrontier.hash = '88'.repeat(32);
    const f = fixture(settings, value);
    await assert.rejects(f.adapter.quote(f.input), rejected());
    assert.equal(f.accountCalls.length, 1);
    assert.deepEqual(f.dp.positions, settings.badDP ? [1, 1] : [6, 6]);
    const reads = f.order.length; await assert.rejects(f.adapter.quote(f.input), rejected('held')); assert.equal(f.order.length, reads);
  }
});

test('observed read adapter captures selected input original plan material and block before the first account callback', { timeout: 5000 }, async () => {
  const { plan, assembly } = await original();
  for (const name of methods) {
    const f = fixture(), supplied = clone(f.input), originalPlan = clone(plan);
    const extra = name === 'assemble' ? material() : clone(assembly.accountBlock);
    f.mode.onAccount = index => {
      if (index !== 1) return;
      supplied.phase = 'SIGNED'; supplied.accepted.amount = '999'; supplied.policy.maxMomentumAdvances = 0;
      originalPlan.subject.amount = '999'; originalPlan.quote.sourceQuote = null;
      if (name === 'assemble') extra.publicKey = '';
      else extra.signature = 'signed';
    };
    const result = await call(f.adapter, name, supplied, originalPlan, extra);
    if (name === 'quote') assert.deepEqual(result, plan);
    else if (name === 'createWorkRequest') assert.equal(result.accountBlock.amount, '5');
    else if (name === 'assemble') assert.deepEqual(result.accountBlock, assembly.accountBlock);
    else assert.deepEqual(result, assembly.validation);
    assert.equal(supplied.phase, 'SIGNED'); assert.equal(Object.isFrozen(supplied), false);
    assert.equal(Object.isFrozen(originalPlan), false);
  }
});

test('observed read adapter rejects exact input version phase arity and malformed original plans before reads', { timeout: 5000 }, async () => {
  const f = fixture(), { plan, assembly } = await original();
  for (const supplied of [{ ...f.input, observedUserSendReadVersion: 2 }, { ...f.input, phase: 'SIGNED' },
    { ...f.input, phase: 'VALIDATED' }, { ...f.input, accountFrontierResultJson: null },
    { ...f.input, observation: null }, { ...f.input, wallet: null }, { ...f.input, runtimeContextDigest: null }]) {
    await assert.rejects(f.adapter.quote(supplied), rejected('input_rejected'));
  }
  for (const supplied of [{ ...plan, observedUserSendPlanVersion: 2 }, { ...plan, signedBlock: null },
    { subject: plan.subject, quote: plan.quote }]) {
    await assert.rejects(f.adapter.createWorkRequest(f.input, supplied), rejected('input_rejected'));
  }
  await assert.rejects(f.adapter.quote(), rejected('input_rejected'));
  await assert.rejects(f.adapter.quote(f.input, null), rejected('input_rejected'));
  await assert.rejects(f.adapter.createWorkRequest(f.input), rejected('input_rejected'));
  await assert.rejects(f.adapter.createWorkRequest(f.input, plan, null), rejected('input_rejected'));
  await assert.rejects(f.adapter.assemble(f.input, plan), rejected('input_rejected'));
  await assert.rejects(f.adapter.assemble(f.input, plan, material(), null), rejected('input_rejected'));
  await assert.rejects(f.adapter.validateUnsigned(f.input, plan), rejected('input_rejected'));
  await assert.rejects(f.adapter.validateUnsigned(f.input, plan, assembly.accountBlock, null), rejected('input_rejected'));
  assert.equal(f.order.length, 0);
  assert.equal((await f.adapter.quote(f.input)).observedUserSendPlanVersion, 1);
});

test('observed read adapter refuses hostile nested DATA proxies sparse arrays and foreign prototypes without hooks', { timeout: 5000 }, async () => {
  const f = fixture(), { plan } = await original();
  let hooks = 0; const hook = () => { hooks += 1; throw Error('PRIVATE_HOOK'); };
  const top = clone(f.input); Object.defineProperty(top, 'policy', { enumerable: true, get: hook });
  const nested = clone(f.input); Object.defineProperty(nested.accepted, 'amount', { enumerable: true, get: hook });
  const proxy = new Proxy(f.input, { get: hook, getPrototypeOf: hook, ownKeys: hook });
  for (const supplied of [top, nested, proxy, Object.assign(Object.create(null), f.input)]) {
    await assert.rejects(f.adapter.quote(supplied), rejected('input_rejected'));
  }
  const p1 = clone(plan); Object.defineProperty(p1.quote, 'sourceQuote', { enumerable: true, get: hook });
  const p2 = clone(plan); p2.subject = new Proxy(plan.subject, { get: hook, getPrototypeOf: hook });
  const p3 = clone(plan); p3.quote = { sparse: Array(2) };
  for (const supplied of [p1, p2, p3, Object.assign(Object.create(null), plan)]) {
    await assert.rejects(f.adapter.createWorkRequest(f.input, supplied), rejected('input_rejected'));
  }
  const extra = material(); Object.defineProperty(extra, 'publicKey', { enumerable: true, get: hook });
  await assert.rejects(f.adapter.assemble(f.input, plan, extra), rejected('input_rejected'));
  assert.equal(hooks, 0); assert.equal(f.order.length, 0);
});

test('observed read adapter remains busy during an owned pending account read and reentrant DP callback', { timeout: 5000 }, async () => {
  const f = fixture({ deferredAt: 1 }); let hooks = 0;
  const hostile = new Proxy({}, { getPrototypeOf() { hooks += 1; throw Error('HOOK'); } });
  const pending = f.adapter.quote(f.input);
  try {
    await assert.rejects(f.adapter.quote(hostile), rejected('busy'));
    assert.equal(hooks, 0); assert.equal(f.accountCalls.length, 1); assert.deepEqual(f.dp.positions, [0, 0]);
  } finally { f.release(); }
  assert.equal((await pending).subject.height, 7);
  const g = fixture(), checks = [];
  g.mode.onDPFirst = () => { checks.push(assert.rejects(g.adapter.quote(hostile), rejected('busy'))); };
  assert.equal((await g.adapter.quote(g.input)).subject.height, 7);
  await NativePromise.all(checks); assert.equal(checks.length, 1); assert.equal(hooks, 0);
});

test('observed read adapter validates configuration without invoking exchange capabilities or accepting aliased DP transports', { timeout: 5000 }, () => {
  const f = fixture(); let hooks = 0; const hook = () => { hooks += 1; throw Error('HOOK'); };
  const getter = { transports: f.options.transports }; Object.defineProperty(getter, 'accountExchange', { get: hook, enumerable: true });
  const proxy = new Proxy(f.options, { get: hook, getPrototypeOf: hook, ownKeys: hook });
  for (const options of [null, getter, proxy, { ...f.options, accountExchange: null },
    { ...f.options, accountExchange: new Proxy(() => {}, { apply: hook }) },
    { ...f.options, transports: [f.options.transports[0], f.options.transports[0]] },
    { ...f.options, close: hook }, { ...f.options, endpoint: 'https://node.invalid' }]) {
    assert.throws(() => create(options), rejected('configuration_rejected'));
  }
  assert.throws(() => create(), rejected('configuration_rejected'));
  assert.throws(() => create(f.options, null), rejected('configuration_rejected'));
  assert.equal(hooks, 0); assert.equal(f.order.length, 0);
});

test('observed read adapter drains safe failures and refuses decorated or unsafe exchange promises without hooks', { timeout: 5000 }, async () => {
  let hooks = 0; const hook = () => { hooks += 1; throw Error('PRIVATE_HOOK'); };
  const variants = [
    text => { const p = NativePromise.resolve(text); Object.defineProperty(p, 'then', { get: hook }); return p; },
    text => { const p = NativePromise.resolve(text); Object.defineProperty(p, 'constructor', { value: NativePromise }); return p; },
    () => Object.defineProperty({}, 'then', { get: hook }),
    () => { const reason = Object.defineProperty({}, 'stack', { get: hook }); return NativePromise.reject(reason); },
  ];
  for (const promise of variants) {
    const f = fixture({ promise });
    await assert.rejects(f.adapter.quote(f.input), rejected());
    assert.equal(f.accountCalls.length, 1); assert.deepEqual(f.dp.positions, [0, 0]);
    await assert.rejects(f.adapter.quote(f.input), rejected('held'));
  }
  for (const target of ['constructor', 'species']) {
    const saved = target === 'constructor' ? Object.getOwnPropertyDescriptor(Promise.prototype, 'constructor')
      : Object.getOwnPropertyDescriptor(Promise, Symbol.species);
    const f = fixture({ promise(text) {
      const p = NativePromise.resolve(text);
      apply(nativeThen, p, [() => {}, () => {}]); // Exchange owner prehandles before unsafe mechanics.
      Object.defineProperty(target === 'constructor' ? Promise.prototype : Promise,
        target === 'constructor' ? 'constructor' : Symbol.species, { get: hook, configurable: true });
      return p;
    } });
    let pending;
    try { pending = f.adapter.quote(f.input); }
    finally { Object.defineProperty(target === 'constructor' ? Promise.prototype : Promise,
      target === 'constructor' ? 'constructor' : Symbol.species, saved); }
    assert.equal(Object.getOwnPropertyDescriptor(pending, 'constructor').value, NativePromise);
    await assert.rejects(pending, rejected()); await assert.rejects(f.adapter.quote(f.input), rejected('held'));
  }
  assert.equal(hooks, 0);
});

test('observed read adapter retains exact unsigned bytes and holds after rejected signed damaged or replacement DATA', { timeout: 5000 }, async () => {
  const { plan, assembly } = await original(), retained = JSON.stringify([plan, assembly.accountBlock]);
  for (const change of [b => { b.signature = 'signed'; }, b => { b.hash = '99'.repeat(32); },
    b => { b.nonce = '0202030405060708'; }, b => { b.amount = '999'; },
    b => { b.fusedPlasma += 1; }, b => { b.momentumAcknowledged.height += 1; }]) {
    const f = fixture(), supplied = clone(assembly.accountBlock); change(supplied);
    await assert.rejects(f.adapter.validateUnsigned(f.input, plan, supplied), rejected());
    assert.equal(f.accountCalls.length, 2); assert.deepEqual(f.dp.positions, [6, 6]);
    await assert.rejects(f.adapter.quote(f.input), rejected('held'));
  }
  assert.equal(JSON.stringify([plan, assembly.accountBlock]), retained);
});

test('observed read adapter exhausts the same account wire budget without recreation reset fallback or extra handoffs', { timeout: 5000 }, async () => {
  const f = fixture();
  for (let cycle = 0; cycle < 16; cycle++) assert.equal((await f.adapter.quote(f.input)).subject.height, 7);
  assert.equal(f.accountCalls.length, 32); assert.deepEqual(f.dp.positions, [96, 96]);
  const reads = f.order.length;
  await assert.rejects(f.adapter.quote(f.input), rejected());
  await assert.rejects(f.adapter.quote(f.input), rejected('held'));
  assert.equal(f.order.length, reads); assert.equal(f.accountCalls.length, 32);
  assert.deepEqual(f.accountCalls.map(c => c.id), Array.from({ length: 32 }, (_, i) => i + 1));
});

test('observed read adapter captures existing DATA stage methods without native owners SDK signing publication or active cutover', { timeout: 5000 }, async () => {
  const names = ['quote', 'createWorkRequest', 'assemble', 'validateUnsigned'];
  const saved = names.map(name => Object.getOwnPropertyDescriptor(DataAdapter.prototype, name)); let hooks = 0;
  for (const [i, name] of names.entries()) Object.defineProperty(DataAdapter.prototype, name, { ...saved[i],
    value() { hooks += 1; throw Error('OVERRIDE'); } });
  try {
    const f = fixture(), plan = await f.adapter.quote(f.input), assembly = await f.adapter.assemble(f.input, plan, material());
    assert.equal((await f.adapter.createWorkRequest(f.input, plan)).accountBlock.height, 7);
    assert.deepEqual(await f.adapter.validateUnsigned(f.input, plan, assembly.accountBlock), assembly.validation);
    assert.equal(hooks, 0); assert.equal(assembly.preparation, 'NOT_PERFORMED');
    assert.equal(assembly.keyPossession, 'NOT_ESTABLISHED'); assert.equal(assembly.chainAuthentication, 'NOT_ESTABLISHED');
  } finally { for (const [i, name] of names.entries()) Object.defineProperty(DataAdapter.prototype, name, saved[i]); }
  assert.equal((source.match(/^export /gm) ?? []).length, 1);
  assert.match(source, /const COLLECTOR = createRequestBoundDynamicPlasmaObservationCollector/);
  assert.match(source, /const ACCOUNT_WIRE = createZenonAccountFrontierReadTransport/);
  assert.doesNotMatch(source, /node:(?:fs|https?|tls|dns|child_process|worker_threads)|fetch\s*\(|generateKeyPair|crypto\.sign|crypto\.verify|prepareBlock|publishRawTransaction|setTimeout|this\./);
});
