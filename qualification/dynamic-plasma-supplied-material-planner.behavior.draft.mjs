import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

// Supplied DATA/material only: retain114 relevant cases, add16 planner cases.
// No nonce search, SDK, real PREPARE, key/signing, network or native owner runs.
assert.equal(process.argv.length, 2);
const bytes = readFileSync(new URL('../src/zenon/dynamic-plasma-supplied-material-planner.js', import.meta.url));
assert.equal(bytes.length, 10622);
assert.equal(createHash('sha256').update(bytes).digest('hex'),
  'ea465d97719735d4d876f073b5a1214b68ce1565e93a82d7058ebedf38d925c7');
assert.equal(/[^\x00-\x7f]/.test(bytes.toString('utf8')) || bytes.includes(0), false);
const source = bytes.toString('ascii');
const { createSuppliedMaterialDynamicPlasmaTransactionPlanner: create }
  = await import('../src/zenon/dynamic-plasma-supplied-material-planner.js');
const { assertZenonTransactionPlanner: assertPlanner }
  = await import('../src/zenon/transaction-planner.js');
const { ObservedDynamicPlasmaUserSendAdapter: DataAdapter }
  = await import('../src/zenon/dynamic-plasma-observed-user-send-adapter.js');
await import('./dynamic-plasma-observed-user-send-attempt.behavior.draft.mjs');
const { rawAdapterViewFixture: rawView, rawAdapterMaterialFixture: material }
  = await import('./dynamic-plasma-raw-adapter.behavior.draft.mjs');
const { requestBoundCollectionFixture: collection }
  = await import('./dynamic-plasma-request-bound-collection.behavior.draft.mjs');
const { frontierReadBlockFixture: block }
  = await import('./dynamic-plasma-account-frontier-read.behavior.draft.mjs');

const NativePromise = Promise, nativeThen = Promise.prototype.then, apply = Reflect.apply;
const copy = value => JSON.parse(JSON.stringify(value)); // Owned valid synthetic DATA only.
function info(value = rawView(), balance = value.accepted.amount) {
  return { address: value.payerAddress, accountHeight: value.accountFrontier.height,
    balanceInfoMap: { [value.accepted.asset]: { token: { tokenStandard: value.accepted.asset }, balance } } };
}
function readInput(value = rawView()) {
  return { observedUserSendReadVersion: 2, phase: 'UNSIGNED', paymentRequired: value.paymentRequired,
    accepted: value.accepted, payerAddress: value.payerAddress, compiledSporkIds: value.compiledSporkIds,
    policy: value.policy, runtimeContextDigest: value.runtimeContextDigest,
    accountInfoResultJson: JSON.stringify(info(value)) };
}
function view(value = rawView()) {
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
function fixture(settings = {}, value = rawView()) {
  const dp = collection(value), calls = [], mode = settings;
  const transports = dp.options.transports.map(transport => Object.freeze({
    callRead: Object.freeze(function callRead(request) {
      const pending = transport.callRead(request), advance = mode.advance || 0;
      return advance ? apply(nativeThen, pending, [text => adjust(text, request.method, advance)]) : pending;
    }),
  }));
  let release, markBlocked;
  const blocked = new NativePromise(resolve => { markBlocked = resolve; });
  const options = { transports, accountExchange(body) {
    const request = JSON.parse(body); calls.push(request);
    assert.equal(request.id, calls.length); assert.equal(request.method, 'ledger.getFrontierAccountBlock');
    assert.deepEqual(request.params, [value.payerAddress]);
    const result = block(value);
    if (mode.frontierMovedAt && calls.length >= mode.frontierMovedAt) { result.height += 1; result.hash = '99'.repeat(32); }
    const text = JSON.stringify({ jsonrpc: '2.0', id: request.id + (mode.badIdAt === calls.length ? 1 : 0), result });
    if (mode.onAccount) mode.onAccount(calls.length);
    if (mode.throwAt === calls.length) throw Error('PRIVATE_EXCHANGE_DIAGNOSTIC');
    if (mode.deferredAt === calls.length) return new NativePromise(resolve => {
      release = () => resolve(text); markBlocked();
    });
    return NativePromise.resolve(text);
  } };
  return { planner: create(options), options, context: { plannerContextVersion: 1,
    readInput: readInput(value), material: material() }, dp, calls, mode, value, blocked, release: () => release() };
}
function rejected(kind = 'operation_rejected') {
  return error => {
    assert.ok(error instanceof (kind === 'busy' ? Error : TypeError) && Object.isFrozen(error));
    assert.equal(error.code, 'zenon_supplied_material_dp_planner_' + kind);
    assert.equal(error.message, error.code);
    assert.equal(error.stack, (kind === 'busy' ? 'Error: ' : 'TypeError: ') + error.code);
    assert.equal(Object.hasOwn(error, 'cause'), false); assert.equal(error.stack.includes('PRIVATE'), false);
    return true;
  };
}
async function expected(value = rawView()) {
  const adapter = new DataAdapter(), supplied = view(value), plan = await adapter.quote(supplied);
  return (await adapter.assemble(supplied, plan, material())).accountBlock;
}
function deepFrozen(value) {
  if (value !== null && typeof value === 'object') {
    assert.ok(Object.isFrozen(value));
    for (const child of Object.values(value)) deepFrozen(child);
  }
}

test('supplied-material DP planner implements the existing structural SPI with one frozen method and exact capabilities', { timeout: 5000 }, () => {
  const f = fixture(); assert.equal(assertPlanner(f.planner), f.planner);
  assert.deepEqual(Object.keys(f.planner), ['prepareUnsigned']);
  assert.ok(Object.isFrozen(f.planner) && Object.isFrozen(f.planner.prepareUnsigned));
  let hooks = 0; const hook = () => { hooks += 1; throw Error('PRIVATE'); };
  const getter = { accountExchange: f.options.accountExchange };
  Object.defineProperty(getter, 'transports', { enumerable: true, get: hook });
  for (const bad of [null, {}, getter, { ...f.options, wallet: null },
    new Proxy(f.options, { get: hook, getPrototypeOf: hook, ownKeys: hook })]) {
    assert.throws(() => create(bad), rejected('configuration_rejected'));
  }
  assert.throws(() => create(), rejected('configuration_rejected'));
  assert.throws(() => create(f.options, null), rejected('configuration_rejected'));
  assert.equal(hooks, 0); assert.equal(f.calls.length, 0); assert.deepEqual(f.dp.positions, [0, 0]);
});

test('supplied-material DP planner returns only the exact existing final unsigned block after all four stages', { timeout: 5000 }, async () => {
  const f = fixture(), before = copy(f.context), result = await f.planner.prepareUnsigned(f.context);
  assert.deepEqual(result, await expected(f.value));
  assert.equal(result.signature, ''); assert.equal(result.amount, '5'); assert.equal(result.height, 7);
  assert.equal(result.momentumAcknowledged.height, 100); assert.equal(result.nonce, material().nonce);
  assert.equal(Object.hasOwn(result, 'paymentPayload'), false); assert.equal(Object.hasOwn(result, 'plan'), false);
  assert.equal(f.calls.length, 8); assert.deepEqual(f.dp.positions, [24, 24]);
  assert.deepEqual(f.context, before); assert.equal(Object.isFrozen(f.context), false); deepFrozen(result);
  assert.ok(f.calls.every(c => c.method === 'ledger.getFrontierAccountBlock'));
});

test('supplied-material DP planner admits one call only and refuses repeat or wrong arity without reading hostile DATA', { timeout: 5000 }, async () => {
  const f = fixture(); let hooks = 0;
  const hostile = new Proxy({}, { getPrototypeOf() { hooks += 1; throw Error('PRIVATE'); } });
  await assert.rejects(f.planner.prepareUnsigned(), rejected('input_rejected'));
  await assert.rejects(f.planner.prepareUnsigned(hostile, null), rejected('input_rejected'));
  assert.equal(f.calls.length, 0); await f.planner.prepareUnsigned(f.context);
  await assert.rejects(f.planner.prepareUnsigned(hostile), rejected('used'));
  await assert.rejects(f.planner.prepareUnsigned(), rejected('used'));
  assert.equal(hooks, 0); assert.equal(f.calls.length, 8); assert.deepEqual(f.dp.positions, [24, 24]);
  for (const key of ['quote', 'assemble', 'reset', 'validateUnsigned', 'close']) assert.equal(Object.hasOwn(f.planner, key), false);
});

test('supplied-material DP planner snapshots all context and material before the first borrowed callback', { timeout: 5000 }, async () => {
  const f = fixture(), supplied = copy(f.context), m = supplied.material; let hooks = 0;
  f.mode.onAccount = index => {
    if (index !== 1) return;
    supplied.plannerContextVersion = 99; supplied.readInput.phase = 'SIGNED';
    supplied.readInput.accepted.amount = '999'; supplied.readInput.accountInfoResultJson = 'null';
    supplied.readInput.policy.maxMomentumAdvances = 0; m.publicKey = ''; m.nonce = 'ff'.repeat(8);
    Object.defineProperty(supplied, 'material', { configurable: true, get() { hooks += 1; throw Error('PRIVATE'); } });
  };
  const result = await f.planner.prepareUnsigned(supplied);
  assert.deepEqual(result, await expected(f.value)); assert.equal(result.nonce, material().nonce);
  assert.equal(hooks, 0); assert.equal(m.publicKey, ''); assert.equal(Object.isFrozen(supplied), false);
  assert.equal(f.calls.length, 8);
});

test('supplied-material DP planner requires exact versioned descriptor DATA and rejects getters proxies or operational fields early', { timeout: 5000 }, async () => {
  let hooks = 0; const hook = () => { hooks += 1; throw Error('PRIVATE'); };
  const makers = [
    c => ({ ...c, plannerContextVersion: 2 }), c => ({ ...c, wallet: null }),
    c => ({ ...c, material: null }), c => ({ ...c, readInput: null }),
    c => { Object.defineProperty(c, 'readInput', { enumerable: true, get: hook }); return c; },
    c => { Object.defineProperty(c.material, 'nonce', { enumerable: true, get: hook }); return c; },
    c => { Object.defineProperty(c.readInput.accepted, 'amount', { enumerable: true, get: hook }); return c; },
    c => new Proxy(c, { get: hook, ownKeys: hook, getPrototypeOf: hook }),
    c => ({ ...c, readInput: new Proxy(c.readInput, { getPrototypeOf: hook }) }),
    c => ({ ...c, material: { ...c.material, privateKey: 'not-a-key' } }),
    c => ({ ...c, readInput: { ...c.readInput, accountInfoResultJson: { toString: hook, [Symbol.toPrimitive]: hook } } }),
  ];
  for (const make of makers) {
    const f = fixture(); await assert.rejects(f.planner.prepareUnsigned(make(copy(f.context))), rejected());
    assert.equal(f.calls.length, 0); assert.deepEqual(f.dp.positions, [0, 0]);
    await assert.rejects(f.planner.prepareUnsigned(f.context), rejected('used'));
  }
  assert.equal(hooks, 0);
});

test('supplied-material DP planner checks canonical supplied public key and nonce syntax before any read without production', { timeout: 5000 }, async () => {
  for (const changes of [{ materialVersion: 2 }, { publicKey: '' }, { publicKey: 7 },
    { publicKey: Buffer.alloc(33, 7).toString('base64') }, { publicKey: 'B'.repeat(43) + '=' },
    { nonce: '' }, { nonce: 'ABCDEF0123456789' }, { nonce: 0 }, { nonce: '00'.repeat(9) }]) {
    const f = fixture(); Object.assign(f.context.material, changes);
    await assert.rejects(f.planner.prepareUnsigned(f.context), rejected());
    assert.equal(f.calls.length, 0); assert.deepEqual(f.dp.positions, [0, 0]);
  }
});

test('supplied-material DP planner withholds every block until final same-block validation and read completion', { timeout: 5000 }, async () => {
  const f = fixture({ deferredAt: 8 }); let returned = 0;
  const pending = f.planner.prepareUnsigned(f.context);
  const tracked = apply(nativeThen, pending, [value => { returned += 1; return value; }]);
  await f.blocked;
  try {
    assert.equal(returned, 0); assert.equal(f.calls.length, 8); assert.deepEqual(f.dp.positions, [24, 24]);
    await assert.rejects(f.planner.prepareUnsigned(f.context), rejected('busy'));
  } finally { f.release(); }
  assert.deepEqual(await tracked, await expected(f.value)); assert.equal(returned, 1);
  await assert.rejects(f.planner.prepareUnsigned(f.context), rejected('used'));
});

test('supplied-material DP planner hides failures at every stage and cannot return a partial block or retry', { timeout: 5000 }, async () => {
  for (const at of [1, 3, 5, 7, 8]) {
    const f = fixture({ throwAt: at });
    await assert.rejects(f.planner.prepareUnsigned(f.context), rejected());
    const count = f.calls.length; assert.equal(count, at);
    await assert.rejects(f.planner.prepareUnsigned(f.context), rejected('used'));
    assert.equal(f.calls.length, count);
  }
  const f = fixture({ badIdAt: 4 });
  await assert.rejects(f.planner.prepareUnsigned(f.context), rejected());
  assert.equal(f.calls.length, 4); await assert.rejects(f.planner.prepareUnsigned(f.context), rejected('used'));
});

test('supplied-material DP planner keeps the original account sequence and refuses frontier changes at later stages', { timeout: 5000 }, async () => {
  for (const at of [3, 5, 7]) {
    const f = fixture({ frontierMovedAt: at }), before = JSON.stringify(f.context);
    await assert.rejects(f.planner.prepareUnsigned(f.context), rejected());
    assert.equal(f.calls.length, at); assert.deepEqual(f.dp.positions, [((at - 1) / 2) * 6, ((at - 1) / 2) * 6]);
    assert.equal(JSON.stringify(f.context), before);
    await assert.rejects(f.planner.prepareUnsigned(f.context), rejected('used'));
  }
});

test('supplied-material DP planner enforces explicit read v2 and the existing selected-balance gate without fallback', { timeout: 5000 }, async () => {
  const f = fixture(); f.context.readInput.observedUserSendReadVersion = 1;
  delete f.context.readInput.accountInfoResultJson;
  await assert.rejects(f.planner.prepareUnsigned(f.context), rejected());
  assert.equal(f.calls.length, 0);
  const g = fixture(); g.context.readInput.accountInfoResultJson = JSON.stringify(info(g.value, '4'));
  await assert.rejects(g.planner.prepareUnsigned(g.context), rejected());
  assert.equal(g.calls.length, 1); assert.deepEqual(g.dp.positions, [0, 0]);
  g.context.readInput.accountInfoResultJson = JSON.stringify(info(g.value));
  await assert.rejects(g.planner.prepareUnsigned(g.context), rejected('used'));
});

test('supplied-material DP planner accepts only the original quote horizon and acknowledgement during intermediate price changes', { timeout: 5000 }, async () => {
  const f = fixture();
  f.mode.onAccount = index => { if (index === 3) f.mode.advance = 1; if (index === 5) f.mode.advance = 2; };
  const result = await f.planner.prepareUnsigned(f.context);
  assert.deepEqual(result, await expected(f.value));
  assert.equal(result.momentumAcknowledged.height, 100); assert.equal(result.momentumAcknowledged.hash, '33'.repeat(32));
  assert.equal(result.nonce, material().nonce); assert.equal(f.calls.length, 8);
});

test('supplied-material DP planner refuses a final expired price horizon without replacement material quote or block', { timeout: 5000 }, async () => {
  const f = fixture(), original = JSON.stringify(f.context);
  f.mode.onAccount = index => { if (index === 7) f.mode.advance = 3; };
  await assert.rejects(f.planner.prepareUnsigned(f.context), rejected());
  assert.equal(f.calls.length, 8); assert.deepEqual(f.dp.positions, [24, 24]);
  assert.equal(JSON.stringify(f.context), original);
  await assert.rejects(f.planner.prepareUnsigned(f.context), rejected('used')); assert.equal(f.calls.length, 8);
});

test('supplied-material DP planner rejects a mismatched payer key and a single fixed nonce below positive required work', { timeout: 5000 }, async () => {
  const f = fixture(); f.context.material.publicKey = Buffer.alloc(32, 8).toString('base64');
  await assert.rejects(f.planner.prepareUnsigned(f.context), rejected());
  assert.equal(f.calls.length, 6); assert.deepEqual(f.dp.positions, [18, 18]);
  const value = rawView({ available: 0, maxFused: 0, maxDifficulty: Number.MAX_SAFE_INTEGER });
  const adapter = new DataAdapter(), supplied = view(value), plan = await adapter.quote(supplied);
  const work = await adapter.createWorkRequest(supplied, plan);
  assert.ok(work.workInput.difficulty > 0);
  // One already-supplied nonce: fixed-cost consistency only, NEVER search/increment/generate.
  const digest = createHash('sha3-256').update(Buffer.concat([
    Buffer.from(material().nonce, 'hex'), Buffer.from(work.workInput.dataHash, 'hex'),
  ])).digest();
  let number = 0n; for (let i = 7; i >= 0; i -= 1) number = (number << 8n) | BigInt(digest[i]);
  const range = 1n << 64n, threshold = range - range / BigInt(work.workInput.difficulty);
  assert.ok(number < threshold);
  const g = fixture({}, value);
  await assert.rejects(g.planner.prepareUnsigned(g.context), rejected());
  assert.equal(g.calls.length, 6); assert.deepEqual(g.dp.positions, [18, 18]);
  await assert.rejects(g.planner.prepareUnsigned(g.context), rejected('used'));
});

test('supplied-material DP planner remains busy through each borrowed-read barrier and used after successful completion', { timeout: 5000 }, async () => {
  for (const at of [1, 3, 5, 7]) {
    const f = fixture({ deferredAt: at }); let hooks = 0;
    const hostile = new Proxy({}, { getPrototypeOf() { hooks += 1; throw Error('PRIVATE'); } });
    const pending = f.planner.prepareUnsigned(f.context); await f.blocked;
    try {
      await assert.rejects(f.planner.prepareUnsigned(hostile), rejected('busy'));
      assert.equal(hooks, 0); assert.equal(f.calls.length, at);
    } finally { f.release(); }
    assert.equal((await pending).signature, ''); assert.equal(f.calls.length, 8);
    await assert.rejects(f.planner.prepareUnsigned(hostile), rejected('used')); assert.equal(hooks, 0);
  }
});

test('supplied-material DP planner bounds all snapshots including raw balance UTF8 and shields its public Promise', { timeout: 5000 }, async () => {
  const f = fixture(), large = info(f.value);
  large.balanceInfoMap[f.value.accepted.asset].token.description = 'x'.repeat(9000);
  f.context.readInput.accountInfoResultJson = JSON.stringify(large);
  assert.ok(f.context.readInput.accountInfoResultJson.length > 8192);
  assert.equal((await f.planner.prepareUnsigned(f.context)).amount, '5');
  for (const make of [
    c => { c.readInput.accountInfoResultJson = ' '.repeat(65537); },
    c => { c.readInput.accountInfoResultJson = '\u00e9'.repeat(40000); },
    c => { c.readInput.paymentRequired.resource.description = 'x'.repeat(8193); },
    c => { c.readInput.paymentRequired.resource.tags = Array(1025).fill('x'); },
    c => { const x = {}; x.self = x; c.readInput.paymentRequired.resource.tags = [x]; },
  ]) {
    const g = fixture(); make(g.context);
    await assert.rejects(g.planner.prepareUnsigned(g.context), rejected()); assert.equal(g.calls.length, 0);
  }
  const h = fixture(), saved = Object.getOwnPropertyDescriptor(NativePromise.prototype, 'constructor');
  let hooks = 0, pending;
  h.mode.onAccount = index => {
    if (index === 1) Object.defineProperty(NativePromise.prototype, 'constructor', {
      configurable: true, get() { hooks += 1; throw Error('PRIVATE_CONSTRUCTOR'); },
    });
  };
  try { pending = h.planner.prepareUnsigned(h.context); }
  finally { Object.defineProperty(NativePromise.prototype, 'constructor', saved); }
  await assert.rejects(pending, rejected()); assert.equal(hooks, 0); assert.equal(h.calls.length, 1);
});

test('supplied-material DP planner is an opt-in supplied-DATA SPI only with no SDK producer signer or native owner', { timeout: 5000 }, () => {
  assert.equal((source.match(/^export /gm) ?? []).length, 1);
  assert.match(source, /prepareUnsigned: freeze\(function prepareUnsigned/);
  assert.equal((source.match(/CREATE_ATTEMPT\(options\)/g) ?? []).length, 1);
  assert.match(source, /await apply\(steps\.quote/); assert.match(source, /await apply\(steps\.work/);
  assert.match(source, /await apply\(steps\.assemble/); assert.match(source, /await apply\(steps\.validate/);
  assert.match(source, /return assembly\.accountBlock/);
  assert.doesNotMatch(source, /node:(?:fs|https?|tls|dns|child_process|worker_threads)|fetch\s*\(|new Promise|setTimeout|this\./);
  assert.doesNotMatch(source, /generateKeyPair|crypto\.sign|crypto\.verify|prepareBlock|publishRawTransaction|WalletAdapter/);
  assert.match(source, /NOT durable custody/); assert.match(source, /active SDK unchanged/);
  assert.match(source, /must already match the plan/); assert.match(source, /real PREPARE/);
});
