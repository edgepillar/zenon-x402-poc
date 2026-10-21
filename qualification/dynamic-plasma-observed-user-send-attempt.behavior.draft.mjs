import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// One original unsigned DATA attempt over existing test-owned read capabilities.
// Retain96 relevant cases unchanged; add18 attempt sequencing/ownership cases.
assert.equal(process.argv.length, 2);
const bytes = readFileSync(new URL('../src/zenon/dynamic-plasma-observed-user-send-attempt.js', import.meta.url));
assert.equal(bytes.length, 7192);
assert.equal(createHash('sha256').update(bytes).digest('hex'),
  '578de9a3251eea0ba6eb56271c7fc500afd4f5b39b3807e03d5c314755ff877f');
const source = bytes.toString('ascii');
assert.equal(/[^\x00-\x7f]/.test(bytes.toString('utf8')) || bytes.includes(0), false);
const { createObservedDynamicPlasmaUserSendAttempt: create }
  = await import('../src/zenon/dynamic-plasma-observed-user-send-attempt.js');
await import('./dynamic-plasma-user-send-balance-read.behavior.draft.mjs');
const { rawAdapterViewFixture: rawView, rawAdapterMaterialFixture: material }
  = await import('./dynamic-plasma-raw-adapter.behavior.draft.mjs');
const { requestBoundCollectionFixture: collection }
  = await import('./dynamic-plasma-request-bound-collection.behavior.draft.mjs');
const { frontierReadBlockFixture: block }
  = await import('./dynamic-plasma-account-frontier-read.behavior.draft.mjs');

const NativePromise = Promise, nativeThen = Promise.prototype.then, apply = Reflect.apply;
const copy = value => JSON.parse(JSON.stringify(value)); // Owned valid synthetic DATA only.
const stages = ['quote', 'createWorkRequest', 'assemble', 'validateUnsigned'];
function info(value = rawView(), balance = value.accepted.amount) {
  return { address: value.payerAddress, accountHeight: value.accountFrontier.height,
    balanceInfoMap: { [value.accepted.asset]: { token: { tokenStandard: value.accepted.asset }, balance } } };
}
function input(value = rawView()) {
  return { observedUserSendReadVersion: 2, phase: 'UNSIGNED', paymentRequired: value.paymentRequired,
    accepted: value.accepted, payerAddress: value.payerAddress, compiledSporkIds: value.compiledSporkIds,
    policy: value.policy, runtimeContextDigest: value.runtimeContextDigest,
    accountInfoResultJson: JSON.stringify(info(value)) };
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
function fixture(settings = {}, value = rawView()) {
  const dp = collection(value), calls = [], mode = settings;
  const transports = dp.options.transports.map(transport => Object.freeze({
    callRead: Object.freeze(function callRead(request) {
      const pending = transport.callRead(request), advance = mode.advance || 0;
      return advance ? apply(nativeThen, pending, [text => adjust(text, request.method, advance)]) : pending;
    }),
  }));
  let release;
  const options = { transports, accountExchange(body) {
    const request = JSON.parse(body); calls.push(request);
    assert.equal(request.id, calls.length); assert.equal(request.method, 'ledger.getFrontierAccountBlock');
    assert.deepEqual(request.params, [value.payerAddress]);
    const result = block(value);
    if (mode.frontierMoved) { result.height += 1; result.hash = '99'.repeat(32); }
    const text = JSON.stringify({ jsonrpc: '2.0', id: request.id, result });
    if (mode.onAccount) mode.onAccount(calls.length);
    if (mode.throwAt === calls.length) throw Error('PRIVATE_EXCHANGE_DIAGNOSTIC');
    if (mode.thenableAt === calls.length) return mode.thenable;
    if (mode.deferredAt === calls.length) return new NativePromise(resolve => { release = () => resolve(text); });
    return NativePromise.resolve(text);
  } };
  return { attempt: create(options), options, input: input(value), dp, calls, mode, value, release: () => release() };
}
function rejected(kind = 'operation_rejected') {
  return error => {
    assert.ok(error instanceof (kind === 'busy' ? Error : TypeError) && Object.isFrozen(error));
    assert.equal(error.code, 'zenon_observed_dp_attempt_' + kind);
    assert.equal(error.message, error.code);
    assert.equal(error.stack, (kind === 'busy' ? 'Error: ' : 'TypeError: ') + error.code);
    assert.equal(Object.hasOwn(error, 'cause'), false); assert.equal(error.stack.includes('PRIVATE'), false);
    return true;
  };
}
function invoke(f, name, supplied = f.input, suppliedMaterial = material()) {
  return name === 'assemble' ? f.attempt.assemble(supplied, suppliedMaterial) : f.attempt[name](supplied);
}
async function prefix(f, count) {
  const result = {};
  if (count >= 1) result.plan = await f.attempt.quote(f.input);
  if (count >= 2) result.work = await f.attempt.createWorkRequest(f.input);
  if (count >= 3) result.assembly = await f.attempt.assemble(f.input, material());
  return result;
}
function deepFrozen(value) {
  if (value !== null && typeof value === 'object') {
    assert.ok(Object.isFrozen(value));
    for (const child of Object.values(value)) deepFrozen(child);
  }
}

test('original unsigned attempt exposes only four frozen stages over the existing exact capability configuration', { timeout: 5000 }, () => {
  const f = fixture();
  assert.deepEqual(Object.keys(f.attempt), stages); assert.ok(Object.isFrozen(f.attempt));
  for (const name of stages) assert.ok(Object.isFrozen(f.attempt[name]));
  assert.equal(Object.hasOwn(f.attempt, 'reset'), false); assert.equal(Object.hasOwn(f.attempt, 'close'), false);
  assert.equal(Object.hasOwn(f.attempt, 'prepareUnsigned'), false);
  let hooks = 0; const hook = () => { hooks += 1; throw Error('PRIVATE'); };
  const getter = { accountExchange: f.options.accountExchange };
  Object.defineProperty(getter, 'transports', { enumerable: true, get: hook });
  for (const bad of [null, {}, getter, { ...f.options, close: hook },
    new Proxy(f.options, { get: hook, getPrototypeOf: hook, ownKeys: hook })]) {
    assert.throws(() => create(bad), rejected('configuration_rejected'));
  }
  assert.throws(() => create(), rejected('configuration_rejected'));
  assert.throws(() => create(f.options, null), rejected('configuration_rejected'));
  assert.equal(hooks, 0); assert.equal(f.calls.length, 0); assert.deepEqual(f.dp.positions, [0, 0]);
});

test('original unsigned attempt connects quote work assembly and same-block validation without extra read cycles', { timeout: 5000 }, async () => {
  const f = fixture(), plan = await f.attempt.quote(f.input);
  const work = await f.attempt.createWorkRequest(f.input), assembly = await f.attempt.assemble(f.input, material());
  const validation = await f.attempt.validateUnsigned(f.input);
  assert.deepEqual(validation, assembly.validation); assert.equal(work.accountBlock.amount, '5');
  assert.equal(assembly.accountBlock.height, 7); assert.equal(plan.subject.height, 7);
  assert.equal(plan.subject.momentumAcknowledged.height, 100); assert.equal(assembly.preparation, 'NOT_PERFORMED');
  assert.equal(assembly.accountBlock.signature, ''); assert.equal(assembly.authority, 'NONE');
  assert.equal(f.calls.length, 8); assert.deepEqual(f.dp.positions, [24, 24]);
  assert.ok(f.calls.every(c => c.method === 'ledger.getFrontierAccountBlock'));
  deepFrozen(plan); deepFrozen(work); deepFrozen(assembly); deepFrozen(validation);
});

test('original unsigned attempt refuses wrong arity and stage before hostile input without poisoning valid progression', { timeout: 5000 }, async () => {
  const f = fixture(); let hooks = 0;
  const hostile = new Proxy({}, { getPrototypeOf() { hooks += 1; throw Error('PRIVATE'); } });
  for (const name of stages.slice(1)) await assert.rejects(invoke(f, name, hostile), rejected('stage_rejected'));
  await assert.rejects(f.attempt.quote(), rejected('stage_rejected'));
  await assert.rejects(f.attempt.quote(hostile, null), rejected('stage_rejected'));
  const plan = await f.attempt.quote(f.input);
  await assert.rejects(f.attempt.quote(hostile), rejected('stage_rejected'));
  await assert.rejects(f.attempt.createWorkRequest(hostile, plan), rejected('stage_rejected'));
  await f.attempt.createWorkRequest(f.input);
  await assert.rejects(f.attempt.createWorkRequest(hostile), rejected('stage_rejected'));
  await assert.rejects(f.attempt.assemble(hostile), rejected('stage_rejected'));
  await assert.rejects(f.attempt.assemble(hostile, material(), plan), rejected('stage_rejected'));
  const assembly = await f.attempt.assemble(f.input, material());
  await assert.rejects(f.attempt.assemble(hostile, material()), rejected('stage_rejected'));
  await assert.rejects(f.attempt.validateUnsigned(hostile, assembly.accountBlock), rejected('stage_rejected'));
  await f.attempt.validateUnsigned(f.input);
  assert.equal(hooks, 0); assert.equal(f.calls.length, 8); assert.deepEqual(f.dp.positions, [24, 24]);
});

test('original unsigned attempt retains one detached original plan and accepts no replacement plan argument', { timeout: 5000 }, async () => {
  const f = fixture(), plan = await f.attempt.quote(f.input), retained = JSON.stringify(plan);
  const foreign = copy(plan); foreign.subject.amount = '999'; foreign.quote.sourceQuote = null;
  assert.throws(() => { plan.subject.amount = '999'; }, TypeError);
  assert.throws(() => { plan.quote.sourceQuote = null; }, TypeError);
  await assert.rejects(f.attempt.createWorkRequest(f.input, foreign), rejected('stage_rejected'));
  assert.equal(f.calls.length, 2);
  const work = await f.attempt.createWorkRequest(f.input), assembly = await f.attempt.assemble(f.input, material());
  assert.equal(work.accountBlock.amount, '5'); assert.equal(assembly.accountBlock.amount, '5');
  assert.equal(JSON.stringify(plan), retained);
  assert.deepEqual((await f.attempt.validateUnsigned(f.input)).workBinding.hashPriceBinding.accountBlock, assembly.accountBlock);
});

test('original unsigned attempt captures initial intent balance and policy DATA before borrowed callbacks mutate them', { timeout: 5000 }, async () => {
  const f = fixture(), supplied = copy(f.input);
  f.mode.onAccount = index => {
    if (index !== 1) return;
    supplied.phase = 'SIGNED'; supplied.accountInfoResultJson = 'null'; supplied.accepted.amount = '999';
    supplied.policy.maxMomentumAdvances = 0; supplied.runtimeContextDigest = 'sha256:' + 'c'.repeat(64);
  };
  const plan = await f.attempt.quote(supplied);
  assert.equal(plan.subject.amount, '5'); assert.equal(plan.subject.momentumAcknowledged.height, 100);
  assert.equal(supplied.phase, 'SIGNED'); assert.equal(Object.isFrozen(supplied), false);
  await f.attempt.createWorkRequest(f.input);
  const assembly = await f.attempt.assemble(f.input, material());
  assert.equal(assembly.accountBlock.amount, '5'); assert.equal(f.calls.length, 6);
});

test('original unsigned attempt retains work-stage snapshots and supplied material before later callbacks', { timeout: 5000 }, async () => {
  const f = fixture(); await f.attempt.quote(f.input);
  const supplied = copy(f.input);
  f.mode.onAccount = index => {
    if (index === 3) { supplied.phase = 'SIGNED'; supplied.accepted.amount = '999'; supplied.accountInfoResultJson = 'null'; }
  };
  const work = await f.attempt.createWorkRequest(supplied);
  assert.equal(work.accountBlock.amount, '5'); assert.equal(supplied.phase, 'SIGNED');
  const m = material(), retained = copy(m);
  f.mode.onAccount = index => { if (index === 5) { m.publicKey = ''; m.nonce = 'ff'.repeat(8); } };
  const assembly = await f.attempt.assemble(f.input, m);
  assert.equal(assembly.accountBlock.publicKey, retained.publicKey); assert.equal(assembly.accountBlock.nonce, retained.nonce);
  assert.equal(m.publicKey, ''); assert.equal(Object.isFrozen(m), false);
  await f.attempt.validateUnsigned(f.input);
});

test('original unsigned attempt validates only its retained unsigned block and cannot reassemble or replace it', { timeout: 5000 }, async () => {
  const f = fixture(), { assembly } = await prefix(f, 3), retained = JSON.stringify(assembly.accountBlock);
  const changed = copy(assembly.accountBlock); changed.signature = 'replacement'; changed.hash = '99'.repeat(32);
  assert.throws(() => { assembly.accountBlock.signature = 'replacement'; }, TypeError);
  await assert.rejects(f.attempt.validateUnsigned(f.input, changed), rejected('stage_rejected'));
  await assert.rejects(f.attempt.assemble(f.input, material()), rejected('stage_rejected'));
  assert.equal(f.calls.length, 6);
  for (let i = 0; i < 2; i += 1) {
    const result = await f.attempt.validateUnsigned(f.input);
    assert.deepEqual(result.workBinding.hashPriceBinding.accountBlock, assembly.accountBlock);
  }
  assert.equal(JSON.stringify(assembly.accountBlock), retained); assert.equal(f.calls.length, 10);
});

test('original unsigned attempt keeps the original quote acknowledgement and block through its original price horizon', { timeout: 5000 }, async () => {
  const f = fixture(), { plan, assembly } = await prefix(f, 3), retained = JSON.stringify([plan, assembly.accountBlock]);
  for (const advance of [1, 2]) {
    f.mode.advance = advance;
    const result = await f.attempt.validateUnsigned(f.input);
    assert.deepEqual(result.workBinding.hashPriceBinding.accountBlock, assembly.accountBlock);
    assert.equal(result.authority, 'NONE'); assert.equal(plan.subject.momentumAcknowledged.height, 100);
  }
  f.mode.advance = 3;
  await assert.rejects(f.attempt.validateUnsigned(f.input), rejected());
  const count = f.calls.length;
  for (const name of stages) await assert.rejects(invoke(f, name), rejected('held'));
  assert.equal(f.calls.length, count); assert.equal(JSON.stringify([plan, assembly.accountBlock]), retained);
});

test('original unsigned attempt refuses an advanced original account before DP and never refreshes its retained plan', { timeout: 5000 }, async () => {
  const f = fixture(), { plan } = await prefix(f, 1), retained = JSON.stringify(plan);
  f.mode.frontierMoved = true;
  await assert.rejects(f.attempt.createWorkRequest(f.input), rejected());
  assert.equal(f.calls.length, 3); assert.deepEqual(f.dp.positions, [6, 6]);
  f.mode.frontierMoved = false;
  await assert.rejects(f.attempt.quote(f.input), rejected('held'));
  assert.equal(f.calls.length, 3); assert.equal(JSON.stringify(plan), retained);
});

test('original unsigned attempt rechecks v2 balance at every admitted stage and holds an underfunded refusal', { timeout: 5000 }, async () => {
  for (const [index, name] of stages.entries()) {
    const f = fixture(); await prefix(f, index);
    f.input.accountInfoResultJson = JSON.stringify(info(f.value, '4'));
    await assert.rejects(invoke(f, name), rejected());
    assert.equal(f.calls.length, index * 2 + 1); assert.deepEqual(f.dp.positions, [index * 6, index * 6]);
    f.input.accountInfoResultJson = JSON.stringify(info(f.value));
    await assert.rejects(invoke(f, name), rejected('held'));
    assert.equal(f.calls.length, index * 2 + 1);
  }
});

test('original unsigned attempt rejects v1 downgrade at every stage without an account or DP handoff', { timeout: 5000 }, async () => {
  for (const [index, name] of stages.entries()) {
    const f = fixture(); await prefix(f, index);
    const v1 = { ...f.input, observedUserSendReadVersion: 1 }; delete v1.accountInfoResultJson;
    await assert.rejects(invoke(f, name, v1), rejected());
    assert.equal(f.calls.length, index * 2); assert.deepEqual(f.dp.positions, [index * 6, index * 6]);
    await assert.rejects(invoke(f, name), rejected('held'));
  }
});

test('original unsigned attempt binds later selected intent to the retained plan before another read', { timeout: 5000 }, async () => {
  const f = fixture(), { plan } = await prefix(f, 1), retained = JSON.stringify(plan), foreign = input(rawView({ amount: '9' }));
  await assert.rejects(f.attempt.createWorkRequest(foreign), rejected());
  assert.equal(f.calls.length, 2); assert.deepEqual(f.dp.positions, [6, 6]);
  await assert.rejects(f.attempt.createWorkRequest(f.input), rejected('held'));
  assert.equal(JSON.stringify(plan), retained);
});

test('original unsigned attempt rejects all reentrant stages as busy before hostile input while quote is pending', { timeout: 5000 }, async () => {
  const f = fixture({ deferredAt: 1 }); let hooks = 0;
  const hostile = new Proxy({}, { getPrototypeOf() { hooks += 1; throw Error('PRIVATE'); } });
  const pending = f.attempt.quote(f.input);
  try {
    for (const name of stages) await assert.rejects(invoke(f, name, hostile), rejected('busy'));
    assert.equal(hooks, 0); assert.equal(f.calls.length, 1); assert.deepEqual(f.dp.positions, [0, 0]);
  } finally { f.release(); }
  const plan = await pending; assert.equal(plan.subject.amount, '5');
  await f.attempt.createWorkRequest(f.input);
  assert.equal(f.calls.length, 4);
});

test('original unsigned attempt keeps each later pending stage exclusive and resumes only that admitted operation', { timeout: 5000 }, async () => {
  for (const [index, name] of stages.entries()) {
    if (index === 0) continue;
    const f = fixture(); await prefix(f, index);
    f.mode.deferredAt = index * 2 + 1;
    const pending = invoke(f, name);
    let hooks = 0; const hostile = new Proxy({}, { getPrototypeOf() { hooks += 1; throw Error('PRIVATE'); } });
    try {
      for (const other of stages) await assert.rejects(invoke(f, other, hostile), rejected('busy'));
      assert.equal(hooks, 0); assert.equal(f.calls.length, index * 2 + 1);
    } finally { f.release(); }
    const result = await pending; assert.equal(result.authority === undefined || result.authority === 'NONE', true);
    assert.equal(f.calls.length, index * 2 + 2);
  }
});

test('original unsigned attempt sanitizes borrowed exchange failures and refuses unsafe thenables without caller hooks', { timeout: 5000 }, async () => {
  let hooks = 0;
  const thenable = {}; Object.defineProperty(thenable, 'then', { get() { hooks += 1; throw Error('PRIVATE'); } });
  for (const settings of [{ throwAt: 1 }, { thenableAt: 1, thenable }]) {
    const f = fixture(settings);
    await assert.rejects(f.attempt.quote(f.input), rejected());
    assert.equal(f.calls.length, 1); assert.deepEqual(f.dp.positions, [0, 0]);
    await assert.rejects(f.attempt.quote(f.input), rejected('held')); assert.equal(f.calls.length, 1);
  }
  for (const make of [
    () => { const value = input(); Object.defineProperty(value, 'observedUserSendReadVersion', { get() { hooks += 1; throw Error('PRIVATE'); } }); return value; },
    () => new Proxy(input(), { getPrototypeOf() { hooks += 1; throw Error('PRIVATE'); } }),
  ]) {
    const f = fixture(); await assert.rejects(f.attempt.quote(make()), rejected());
    assert.equal(f.calls.length, 0); await assert.rejects(f.attempt.quote(f.input), rejected('held'));
  }
  assert.equal(hooks, 0);
});

test('original unsigned attempt shields its own public Promise when a borrowed callback tampers with inherited construction', { timeout: 5000 }, async () => {
  const f = fixture(), saved = Object.getOwnPropertyDescriptor(NativePromise.prototype, 'constructor');
  let hooks = 0, pending;
  f.mode.onAccount = index => {
    if (index === 1) Object.defineProperty(NativePromise.prototype, 'constructor', {
      configurable: true, get() { hooks += 1; throw Error('PRIVATE_CONSTRUCTOR'); },
    });
  };
  try { pending = f.attempt.quote(f.input); }
  finally { Object.defineProperty(NativePromise.prototype, 'constructor', saved); }
  await assert.rejects(pending, rejected());
  assert.equal(hooks, 0); assert.equal(f.calls.length, 1);
  await assert.rejects(f.attempt.quote(f.input), rejected('held'));
});

test('original unsigned attempt preserves the same lifetime account wire budget across repeated same-block validation', { timeout: 5000 }, async () => {
  const f = fixture(), { plan, assembly } = await prefix(f, 3), retained = JSON.stringify([plan, assembly.accountBlock]);
  for (let i = 0; i < 13; i += 1) {
    assert.deepEqual((await f.attempt.validateUnsigned(f.input)).workBinding.hashPriceBinding.accountBlock, assembly.accountBlock);
  }
  assert.equal(f.calls.length, 32); assert.deepEqual(f.dp.positions, [96, 96]);
  await assert.rejects(f.attempt.validateUnsigned(f.input), rejected());
  assert.equal(f.calls.length, 32); assert.deepEqual(f.dp.positions, [96, 96]);
  await assert.rejects(f.attempt.quote(f.input), rejected('held'));
  assert.equal(JSON.stringify([plan, assembly.accountBlock]), retained);
});

test('original unsigned attempt is volatile DATA ownership only with no SDK planner signer producer or native owner cutover', { timeout: 5000 }, () => {
  assert.equal((source.match(/^export /gm) ?? []).length, 1);
  assert.match(source, /const CREATE_READS = createObservedDynamicPlasmaUserSendReadAdapter/);
  assert.equal((source.match(/CREATE_READS\(options\)/g) ?? []).length, 1);
  assert.match(source, /originalPlan = result/); assert.match(source, /originalAssembly = result/);
  assert.match(source, /originalAssembly\.accountBlock/);
  assert.doesNotMatch(source, /node:(?:fs|https?|tls|dns|child_process|worker_threads)|fetch\s*\(|new Promise|setTimeout|this\./);
  assert.doesNotMatch(source, /generateKeyPair|crypto\.sign|crypto\.verify|prepareBlock|publishRawTransaction|prepareUnsigned\s*\(/);
  assert.match(source, /NOT payment custody/); assert.match(source, /new instance/);
  assert.match(source, /callers must stop these methods/); assert.match(source, /before signing/);
});
