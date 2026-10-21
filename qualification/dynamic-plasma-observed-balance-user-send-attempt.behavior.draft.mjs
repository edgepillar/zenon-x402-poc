import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

// New original-quote owner composition:172 retained registrations +18 new.
// The three failed reader/launcher outcomes remain failures, not qualification.
// Only fixed test-owned DATA and native Promises; no network, SDK, nonce
// search, keys/signing, SQL, payment or native owner is imported or run.
assert.equal(process.argv.length, 2);
assert.equal(process.versions.node, '24.19.0');
const bytes = readFileSync(new URL('../src/zenon/dynamic-plasma-observed-balance-user-send-attempt.js', import.meta.url));
assert.equal(bytes.length, 7377);
assert.equal(createHash('sha256').update(bytes).digest('hex'),
  '5111ef500bf33c19113f7ffabadc8980792bc9b5fa388cf6095a3f89a5f69e7a');
assert.equal(/[^\x00-\x7f]/.test(bytes.toString('utf8')) || bytes.includes(0), false);
const source = bytes.toString('ascii');
await import('./dynamic-plasma-observed-balance-user-send-read-adapter.behavior.draft.mjs');
const { createObservedBalanceDynamicPlasmaUserSendAttempt: CREATE }
  = await import('../src/zenon/dynamic-plasma-observed-balance-user-send-attempt.js');
const { rawAdapterViewFixture: rawView, rawAdapterMaterialFixture: material }
  = await import('./dynamic-plasma-raw-adapter.behavior.draft.mjs');
const { requestBoundCollectionFixture: collection }
  = await import('./dynamic-plasma-request-bound-collection.behavior.draft.mjs');
const { frontierReadBlockFixture: block }
  = await import('./dynamic-plasma-account-frontier-read.behavior.draft.mjs');

const NativePromise = Promise, nativeThen = Promise.prototype.then, apply = Reflect.apply;
const OPTIONS = { timeout: 5000, concurrency: false };
const FRONTIER = 'ledger.getFrontierAccountBlock', INFO = 'ledger.getAccountInfoByAddress';
const copy = value => JSON.parse(JSON.stringify(value)); // Owned valid synthetic fixture DATA only.
function cap() {
  let resolve, reject; const promise = new NativePromise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function input(value) {
  return { observedUserSendReadVersion: 3, phase: 'UNSIGNED', paymentRequired: value.paymentRequired,
    accepted: value.accepted, payerAddress: value.payerAddress, compiledSporkIds: value.compiledSporkIds,
    policy: value.policy, runtimeContextDigest: value.runtimeContextDigest };
}
function info(value, balance) {
  return { address: value.payerAddress, accountHeight: value.accountFrontier.height,
    balanceInfoMap: { [value.accepted.asset]: { token: { tokenStandard: value.accepted.asset }, balance } } };
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
  const dp = collection(value), calls = [], order = [], ready = cap();
  const f = { mode, value, dp, calls, order, ready, input: input(value), advance: 0, balance: value.accepted.amount };
  const transports = dp.options.transports.map((transport, endpoint) => Object.freeze({
    // Existing collector requires BOTH the record and callable to be frozen.
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
    const text = JSON.stringify({ jsonrpc: '2.0', id: message.id + (mode.badIdAt === position ? 1 : 0), result });
    if (mode.deferAt === position) {
      const held = cap(); f.release = () => held.resolve(text); ready.resolve(undefined); return held.promise;
    }
    if (mode.onPromise) return mode.onPromise(text, message);
    return NativePromise.resolve(text);
  } };
  f.attempt = CREATE(f.options); return f;
}
function rejected(kind = 'operation_rejected') {
  return error => {
    assert.ok(error instanceof (kind === 'busy' ? Error : TypeError)); assert.ok(Object.isFrozen(error));
    assert.equal(error.code, 'zenon_observed_balance_dp_attempt_' + kind); assert.equal(error.message, error.code);
    assert.equal(error.stack, (kind === 'busy' ? 'Error: ' : 'TypeError: ') + error.code);
    assert.equal(Object.hasOwn(error, 'cause'), false); return true;
  };
}
async function held(f) {
  const calls = f.calls.length, positions = f.dp.positions.slice();
  await assert.rejects(f.attempt.quote(null), rejected('held'));
  await assert.rejects(f.attempt.createWorkRequest(null), rejected('held'));
  await assert.rejects(f.attempt.assemble(null, null), rejected('held'));
  await assert.rejects(f.attempt.validateUnsigned(null), rejected('held'));
  assert.equal(f.calls.length, calls); assert.deepEqual(f.dp.positions, positions);
}
async function assembled(f) {
  const plan = await f.attempt.quote(f.input), work = await f.attempt.createWorkRequest(f.input);
  const assembly = await f.attempt.assemble(f.input, material()); return { plan, work, assembly };
}

test('observed balance attempt exposes four frozen methods with one captured reader and zero construction handoffs', OPTIONS, () => {
  const f = fixture(); assert.deepEqual(Object.keys(f.attempt), ['quote', 'createWorkRequest', 'assemble', 'validateUnsigned']);
  assert.ok(Object.isFrozen(f.attempt)); for (const method of Object.values(f.attempt)) assert.ok(Object.isFrozen(method));
  assert.equal(f.calls.length, 0); assert.equal(f.order.length, 0);
  for (const key of ['close', 'reset', 'resume', 'sign', 'publish', 'prepareUnsigned']) assert.equal(Object.hasOwn(f.attempt, key), false);
  assert.throws(() => CREATE(), rejected('configuration_rejected'));
  assert.throws(() => CREATE(null), rejected('configuration_rejected'));
  assert.throws(() => CREATE(f.options, null), rejected('configuration_rejected'));
});

test('observed balance attempt retains one original plan and same unsigned block through all fresh balance bracketed stages', OPTIONS, async () => {
  const f = fixture(), before = copy(f.input), { plan, work, assembly } = await assembled(f);
  const checked = await f.attempt.validateUnsigned(f.input);
  assert.deepEqual(checked, assembly.validation); assert.equal(work.accountBlock.previousHash, plan.subject.previousHash);
  assert.equal(assembly.accountBlock.momentumAcknowledged.height, 100); assert.equal(assembly.accountBlock.signature, '');
  assert.equal(assembly.accountBlock.publicKey, material().publicKey); assert.equal(assembly.accountBlock.nonce, material().nonce);
  assert.equal(f.calls.length, 12); assert.deepEqual(f.dp.positions, [24, 24]); assert.deepEqual(f.input, before);
  assert.deepEqual(f.calls.map(c => c.id), Array.from({ length: 12 }, (_, i) => i + 1));
  assert.deepEqual(f.calls.map(c => c.method), Array.from({ length: 4 }, () => [FRONTIER, INFO, FRONTIER]).flat());
});

test('observed balance attempt refuses wrong order and arity before input inspection without consuming the next legal stage', OPTIONS, async () => {
  const f = fixture(); let hooks = 0;
  const hostile = new Proxy({}, { getPrototypeOf() { hooks++; throw Error('PRIVATE_ORDER'); } });
  await assert.rejects(f.attempt.createWorkRequest(hostile), rejected('stage_rejected'));
  await assert.rejects(f.attempt.assemble(hostile, null), rejected('stage_rejected'));
  await assert.rejects(f.attempt.validateUnsigned(hostile), rejected('stage_rejected'));
  await assert.rejects(f.attempt.quote(), rejected('stage_rejected')); assert.equal(f.calls.length, 0);
  const plan = await f.attempt.quote(f.input);
  await assert.rejects(f.attempt.quote(hostile), rejected('stage_rejected'));
  await assert.rejects(f.attempt.createWorkRequest(hostile, plan), rejected('stage_rejected'));
  await f.attempt.createWorkRequest(f.input); assert.equal(hooks, 0); assert.equal(f.calls.length, 6);
});

test('observed balance attempt later calls have no replacement plan quote block reassembly or requote surface', OPTIONS, async () => {
  const f = fixture(), { plan, assembly } = await assembled(f), replacement = copy(assembly.accountBlock);
  replacement.amount = '6';
  await assert.rejects(f.attempt.createWorkRequest(f.input), rejected('stage_rejected'));
  await assert.rejects(f.attempt.assemble(f.input, material()), rejected('stage_rejected'));
  await assert.rejects(f.attempt.quote(f.input), rejected('stage_rejected'));
  await assert.rejects(f.attempt.validateUnsigned(f.input, replacement), rejected('stage_rejected'));
  await assert.rejects(f.attempt.validateUnsigned(f.input, plan), rejected('stage_rejected'));
  assert.equal(f.calls.length, 9); assert.deepEqual(await f.attempt.validateUnsigned(f.input), assembly.validation);
  assert.equal(f.calls.length, 12); assert.equal(assembly.accountBlock.amount, '5');
});

test('observed balance attempt permanently holds admitted malformed input even before the lower reader makes a handoff', OPTIONS, async () => {
  for (const changes of [{ observedUserSendReadVersion: 1 }, { observedUserSendReadVersion: 2 },
    { phase: 'SIGNED' }, { accountInfoResultJson: '{}' }, { runtimeContextDigest: 'sha256:' + 'z'.repeat(64) }]) {
    const f = fixture(); await assert.rejects(f.attempt.quote({ ...f.input, ...changes }), rejected());
    assert.equal(f.calls.length, 0); assert.deepEqual(f.dp.positions, [0, 0]); await held(f);
  }
});

test('observed balance attempt busy precedes hostile input while original AccountInfo is pending and does not launch a parallel stage', OPTIONS, async () => {
  const f = fixture({ deferAt: 2 }), pending = f.attempt.quote(f.input); await f.ready.promise;
  let hooks = 0; const hostile = new Proxy({}, { getPrototypeOf() { hooks++; throw Error('PRIVATE_BUSY'); } });
  for (const operation of [() => f.attempt.quote(hostile), () => f.attempt.createWorkRequest(hostile),
    () => f.attempt.assemble(hostile, null), () => f.attempt.validateUnsigned(hostile)])
    await assert.rejects(operation(), rejected('busy'));
  assert.equal(f.calls.length, 2); assert.deepEqual(f.dp.positions, [0, 0]); assert.equal(hooks, 0);
  f.release(); await pending; await f.attempt.createWorkRequest(f.input); assert.equal(f.calls.length, 6);
});

test('observed balance attempt detaches initial selected intent and later supplied material before the first account callback', OPTIONS, async () => {
  const first = fixture({ onAccount(message, f) {
    if (message.id === 1) { f.input.accepted.amount = '999'; f.input.paymentRequired.accepts[0].amount = '999'; }
  } });
  const plan = await first.attempt.quote(first.input); assert.equal(plan.subject.amount, '5');
  const f = fixture(), supplied = material(); await f.attempt.quote(f.input); await f.attempt.createWorkRequest(f.input);
  f.mode.onAccount = message => { if (message.id === 7) { supplied.publicKey = Buffer.alloc(32, 9).toString('base64'); supplied.nonce = 'ff'.repeat(8); } };
  const assembly = await f.attempt.assemble(f.input, supplied);
  assert.equal(assembly.accountBlock.publicKey, material().publicKey); assert.equal(assembly.accountBlock.nonce, material().nonce);
  assert.equal(Object.isFrozen(supplied), false); assert.equal(f.calls.length, 9);
});

test('observed balance attempt binds returned frozen plan and assembly receipts to retained originals rather than caller JSON copies', OPTIONS, async () => {
  const f = fixture(), { plan, assembly } = await assembled(f), changedPlan = copy(plan), changedBlock = copy(assembly.accountBlock);
  changedPlan.subject.amount = '99'; changedBlock.signature = 'not-a-signature';
  assert.ok(Object.isFrozen(plan)); assert.ok(Object.isFrozen(plan.subject)); assert.ok(Object.isFrozen(assembly.accountBlock));
  assert.equal(plan.subject.amount, '5'); assert.equal(assembly.accountBlock.signature, '');
  assert.deepEqual(await f.attempt.validateUnsigned(f.input), assembly.validation);
  assert.notDeepEqual(changedPlan, plan); assert.notDeepEqual(changedBlock, assembly.accountBlock);
});

test('observed balance attempt rejects an advanced original account before balance or DP at both work and final validation', OPTIONS, async () => {
  const f = fixture(); await f.attempt.quote(f.input); f.mode.movedAt = 4;
  await assert.rejects(f.attempt.createWorkRequest(f.input), rejected());
  assert.equal(f.calls.length, 4); assert.deepEqual(f.dp.positions, [6, 6]); await held(f);
  const g = fixture(); await assembled(g); g.mode.movedAt = 10;
  await assert.rejects(g.attempt.validateUnsigned(g.input), rejected());
  assert.equal(g.calls.length, 10); assert.deepEqual(g.dp.positions, [18, 18]); await held(g);
});

test('observed balance attempt never reuses prior sufficient balance when the next work stage returns insufficient AccountInfo', OPTIONS, async () => {
  const f = fixture(); await f.attempt.quote(f.input); f.balance = '0';
  await assert.rejects(f.attempt.createWorkRequest(f.input), rejected());
  assert.equal(f.calls.length, 5); assert.deepEqual(f.dp.positions, [6, 6]); await held(f);
});

test('observed balance attempt keeps original acknowledgement through allowed price advances and never refreshes an expired quote', OPTIONS, async () => {
  for (const advance of [1, 2]) {
    const f = fixture(), plan = await f.attempt.quote(f.input); f.advance = advance;
    const work = await f.attempt.createWorkRequest(f.input), assembly = await f.attempt.assemble(f.input, material());
    await f.attempt.validateUnsigned(f.input);
    assert.equal(work.accountBlock.momentumAcknowledged.height, 100); assert.equal(assembly.accountBlock.momentumAcknowledged.height, 100);
    assert.equal(plan.subject.momentumAcknowledged.height, 100); assert.equal(f.calls.length, 12);
  }
  const f = fixture(); await f.attempt.quote(f.input); f.advance = 3;
  await assert.rejects(f.attempt.createWorkRequest(f.input), rejected());
  assert.equal(f.calls.length, 6); assert.deepEqual(f.dp.positions, [12, 12]); await held(f);
});

test('observed balance attempt refuses changed original intent policy or runtime after quote without creating a new plan', OPTIONS, async () => {
  for (const kind of ['amount', 'policy', 'runtime']) {
    const f = fixture(); await f.attempt.quote(f.input);
    const changed = copy(f.input);
    if (kind === 'amount') { changed.accepted.amount = '6'; changed.paymentRequired.accepts[0].amount = '6'; }
    else if (kind === 'policy') changed.policy.maxMomentumAdvances = 1;
    else changed.runtimeContextDigest = 'sha256:' + 'c'.repeat(64);
    await assert.rejects(f.attempt.createWorkRequest(changed), rejected()); await held(f);
    assert.equal(f.calls.length, kind === 'amount' ? 3 : 6);
    assert.deepEqual(f.dp.positions, kind === 'amount' ? [6, 6] : [12, 12]);
  }
});

test('observed balance attempt preserves full payer key and fixed supplied nonce checks and holds without a material replacement attempt', OPTIONS, async () => {
  for (const supplied of [{ ...material(), publicKey: Buffer.alloc(32, 9).toString('base64') },
    { ...material(), nonce: 'ABCDEF0123456789' }, { ...material(), materialVersion: 2 }]) {
    const f = fixture(); await f.attempt.quote(f.input); await f.attempt.createWorkRequest(f.input);
    await assert.rejects(f.attempt.assemble(f.input, supplied), rejected()); await held(f);
  }
});

test('observed balance attempt permanently holds a rejected final account read while retaining the same unsigned assembly DATA', OPTIONS, async () => {
  const f = fixture(), { assembly } = await assembled(f), original = JSON.stringify(assembly.accountBlock);
  f.mode.badIdAt = 12; await assert.rejects(f.attempt.validateUnsigned(f.input), rejected());
  assert.equal(f.calls.length, 12); assert.equal(JSON.stringify(assembly.accountBlock), original); await held(f);
});

test('observed balance attempt never invokes proxy getter coercion or private rejection reason hooks and does not freeze caller input', OPTIONS, async () => {
  let hooks = 0; const hook = () => { hooks++; throw Error('PRIVATE_DATA'); };
  for (const value of [new Proxy({}, { getPrototypeOf: hook, ownKeys: hook }),
    Object.defineProperty({}, 'observedUserSendReadVersion', { enumerable: true, get: hook })]) {
    const f = fixture(); await assert.rejects(f.attempt.quote(value), rejected()); assert.equal(f.calls.length, 0); await held(f);
  }
  const f = fixture({ onPromise(text, message) {
    if (message.id !== 2) return NativePromise.resolve(text);
    const reason = new Proxy({}, { get: hook, ownKeys: hook }); return NativePromise.reject(reason);
  } });
  await assert.rejects(f.attempt.quote(f.input), rejected()); assert.equal(f.calls.length, 2); await held(f);
  assert.equal(hooks, 0); assert.equal(Object.isFrozen(f.input), false);
});

test('observed balance attempt revalidates the retained block only within ten original wire cycles then holds without resetting counters', OPTIONS, async () => {
  const f = fixture(), { assembly } = await assembled(f);
  for (let i = 0; i < 7; i++) assert.deepEqual(await f.attempt.validateUnsigned(f.input), assembly.validation);
  assert.equal(f.calls.length, 30); assert.deepEqual(f.dp.positions, [60, 60]);
  await assert.rejects(f.attempt.validateUnsigned(f.input), rejected()); assert.equal(f.calls.length, 30); await held(f);
});

test('observed balance attempt shields its public receipt and permanently holds pre-read native mechanics mutation after synchronous restore', OPTIONS, async () => {
  for (const mode of ['constructor', 'species', 'inherited-then']) {
    const f = fixture(), target = mode === 'constructor' ? NativePromise.prototype : mode === 'species' ? NativePromise : Object.prototype;
    const key = mode === 'constructor' ? 'constructor' : mode === 'species' ? Symbol.species : 'then';
    const saved = Object.getOwnPropertyDescriptor(target, key); let hooks = 0, pending;
    try {
      Object.defineProperty(target, key, { configurable: true, get() { hooks++; throw Error('PRIVATE_NATIVE'); } });
      pending = f.attempt.quote(f.input);
    } finally { if (saved) Object.defineProperty(target, key, saved); else delete target[key]; }
    assert.equal(Object.getOwnPropertyDescriptor(pending, 'constructor').value, NativePromise);
    await assert.rejects(pending, rejected()); assert.equal(hooks, 0); assert.equal(f.calls.length, 0); await held(f);
  }
});

test('observed balance attempt source captures the v3 reader once and excludes replacement native owners SDK work signing and default cutover', OPTIONS, () => {
  assert.equal((source.match(/^export /gm) ?? []).length, 1);
  assert.match(source, /const CREATE_READS = createObservedBalanceDynamicPlasmaUserSendReadAdapter/);
  assert.equal((source.match(/CREATE_READS\(options\)/g) ?? []).length, 1);
  assert.match(source, /d\.value !== 3/); assert.match(source, /originalAssembly\.accountBlock/);
  assert.match(source, /stage = 'HELD'/); assert.match(source, /originalPlan = result/);
  assert.doesNotMatch(source, /node:(?:fs|https?|tls|dns|child_process|worker_threads)|fetch\s*\(|setTimeout|new Promise|this\./);
  assert.doesNotMatch(source, /searchZenon|generateKeyPair|crypto\.sign|crypto\.verify|prepareBlock|publishRawTransaction/);
  assert.match(source, /NOT durable custody/); assert.match(source, /UNKNOWN\/ACKNOWLEDGED/);
});
