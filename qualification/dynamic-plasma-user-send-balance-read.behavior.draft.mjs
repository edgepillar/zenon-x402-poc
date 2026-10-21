import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Native AccountInfo JSON DATA, never SDK objects or actual RPC/funds proof.
// Retain84 read/adapter cases with their source-pin guard updated only;
// add12 explicit balance/read-v2 cases. No balance endpoint or SDK runs.
assert.equal(process.argv.length, 2);
const pins = [
  ['../src/zenon/dynamic-plasma-user-send-balance-read.js', 7542,
    'ae1f3e5d309be0dc196fb6b35324d4c8287345b50a108d5030c1058645d2ed39'],
  ['../src/zenon/dynamic-plasma-observed-user-send-read-adapter.js', 17026,
    '883104f7733ae68d755da4898e776ed8b18eba0a9d271cbc169b218e7a6776d8'],
];
const sources = new Map();
for (const [path, size, sha] of pins) {
  const bytes = readFileSync(new URL(path, import.meta.url));
  assert.equal(bytes.length, size); assert.equal(createHash('sha256').update(bytes).digest('hex'), sha);
  assert.equal(/[^\x00-\x7f]/.test(bytes.toString('utf8')) || bytes.includes(0), false);
  sources.set(path, bytes.toString('ascii'));
}
const { validateZenonUserSendBalanceRead: check }
  = await import('../src/zenon/dynamic-plasma-user-send-balance-read.js');
const { createObservedDynamicPlasmaUserSendReadAdapter: create }
  = await import('../src/zenon/dynamic-plasma-observed-user-send-read-adapter.js');
const { ObservedDynamicPlasmaUserSendAdapter: DataAdapter }
  = await import('../src/zenon/dynamic-plasma-observed-user-send-adapter.js');
await import('./dynamic-plasma-observed-user-send-read-adapter.behavior.draft.mjs');
const { rawAdapterViewFixture: rawView, rawAdapterMaterialFixture: material }
  = await import('./dynamic-plasma-raw-adapter.behavior.draft.mjs');
const { requestBoundCollectionFixture: collection }
  = await import('./dynamic-plasma-request-bound-collection.behavior.draft.mjs');
const { frontierReadBlockFixture: block }
  = await import('./dynamic-plasma-account-frontier-read.behavior.draft.mjs');

const copy = value => JSON.parse(JSON.stringify(value)); // Owned valid DATA only.
const NativePromise = Promise, nativeThen = Promise.prototype.then, apply = Reflect.apply;
function info(value = rawView(), balance = value.accepted.amount) {
  const token = { name: 'Synthetic token', symbol: 'ZNN', domain: 'synthetic.invalid',
    totalSupply: balance, decimals: 8, owner: value.payerAddress, tokenStandard: value.accepted.asset,
    maxSupply: balance, isBurnable: true, isMintable: false, isUtility: true };
  return { address: value.payerAddress, accountHeight: value.accountFrontier.height,
    balanceInfoMap: { [value.accepted.asset]: { token, balance } } };
}
function direct(value = rawView(), resultJson = JSON.stringify(info(value))) {
  return { balanceReadVersion: 1, phase: 'UNSIGNED', paymentRequired: value.paymentRequired,
    accepted: value.accepted, payerAddress: value.payerAddress, compiledSporkIds: value.compiledSporkIds,
    accountFrontier: value.accountFrontier, resultJson };
}
function view(value = rawView()) {
  return { observedUserSendViewVersion: 1, phase: 'UNSIGNED', paymentRequired: value.paymentRequired,
    accepted: value.accepted, payerAddress: value.payerAddress, compiledSporkIds: value.compiledSporkIds,
    accountFrontierResultJson: JSON.stringify(block(value)), observation: value.observation,
    policy: value.policy, runtimeContextDigest: value.runtimeContextDigest };
}
function rejected(error) {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, 'zenon_user_send_balance_read_input_rejected');
  assert.equal(error.message, error.code); assert.equal(error.stack, 'TypeError: ' + error.code);
  assert.equal(Object.hasOwn(error, 'cause'), false); return true;
}
function readRejected(kind = 'read_or_stage_rejected') {
  return error => {
    assert.ok(error instanceof (kind === 'busy' ? Error : TypeError) && Object.isFrozen(error));
    assert.equal(error.code, 'zenon_observed_dp_read_adapter_' + kind);
    assert.equal(Object.hasOwn(error, 'cause'), false); return true;
  };
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
function fixture(value = rawView(), settings = {}) {
  const dp = collection(value), calls = [], mode = settings;
  const transports = dp.options.transports.map(transport => Object.freeze({
    callRead: Object.freeze(function callRead(request) {
      const p = transport.callRead(request), advance = mode.advance || 0;
      return advance ? apply(nativeThen, p, [text => adjust(text, request.method, advance)]) : p;
    }),
  }));
  let release;
  const adapter = create({ transports, accountExchange(body) {
    const request = JSON.parse(body); calls.push(request);
    assert.equal(request.method, 'ledger.getFrontierAccountBlock');
    assert.deepEqual(request.params, [value.payerAddress]); assert.equal(request.id, calls.length);
    if (mode.onAccount) mode.onAccount(calls.length);
    const response = JSON.stringify({ jsonrpc: '2.0', id: request.id, result: block(value) });
    if (mode.deferredAt === calls.length) return new NativePromise(resolve => { release = () => resolve(response); });
    return NativePromise.resolve(response);
  } });
  const input = { observedUserSendReadVersion: 2, phase: 'UNSIGNED', paymentRequired: value.paymentRequired,
    accepted: value.accepted, payerAddress: value.payerAddress, compiledSporkIds: value.compiledSporkIds,
    policy: value.policy, runtimeContextDigest: value.runtimeContextDigest,
    accountInfoResultJson: settings.text === undefined ? JSON.stringify(info(value)) : settings.text };
  return { adapter, input, dp, calls, mode, value, release: () => release() };
}
function invoke(f, name, input, plan, extra) {
  return name === 'quote' ? f.adapter.quote(input)
    : name === 'createWorkRequest' ? f.adapter.createWorkRequest(input, plan) : f.adapter[name](input, plan, extra);
}
async function original() {
  const value = rawView(), adapter = new DataAdapter(), plan = await adapter.quote(view(value));
  return { value, plan, assembly: await adapter.assemble(view(value), plan, material()) };
}

test('native balance read projects explicit selected atomic balance with no SDK blockCount or authority receipt', { timeout: 5000 }, () => {
  const value = rawView(), supplied = direct(value), before = JSON.stringify(supplied), result = check(supplied);
  assert.equal(result instanceof Promise, false); assert.ok(Object.isFrozen(result));
  assert.equal(result.address, value.payerAddress); assert.equal(result.accountHeight, 6);
  assert.equal(result.tokenStandard, value.accepted.asset); assert.equal(result.balance, '5'); assert.equal(result.amount, '5');
  assert.equal(result.coversAmount, true); assert.equal(result.authority, 'NONE'); assert.equal(result.afterSigningAction, 'NONE');
  for (const key of ['accountInfoChainAndFrontierHashBinding', 'observationOrigin', 'accountStateFreshness', 'spendability']) {
    assert.equal(result[key], 'NOT_ESTABLISHED');
  }
  assert.equal(JSON.stringify(supplied), before); assert.equal(Object.isFrozen(supplied), false);
  const sdk = info(value); sdk.blockCount = sdk.accountHeight; delete sdk.accountHeight;
  assert.throws(() => check(direct(value, JSON.stringify(sdk))), rejected);
});

test('native balance read compares canonical big integer strings without Number rounding or decimal rescaling', { timeout: 5000 }, () => {
  const value = rawView({ amount: '9007199254740993' });
  const supplied = balance => direct(value, JSON.stringify(info(value, balance)));
  assert.equal(check(supplied('9007199254740993')).balance, '9007199254740993');
  assert.throws(() => check(supplied('9007199254740992')), rejected);
  const huge = (1n << 512n).toString(); assert.equal(check(supplied(huge)).balance, huge);
  for (const balance of [5, null, false, '01', '+5', '5e20', ' 5', '5 ', '5\n', '-0', '-1', '5.0', 'NaN']) {
    assert.throws(() => check(supplied(balance)), rejected);
  }
  assert.throws(() => check(direct(rawView(), JSON.stringify(info(rawView(), '0')))), rejected);
});

test('native balance read binds payer height and selected token while refusing missing null and unreceived substitutions', { timeout: 5000 }, () => {
  const value = rawView(), result = info(value);
  for (const change of [r => { r.address = value.accepted.payTo; }, r => { r.accountHeight = 7; },
    r => { r.balanceInfoMap = null; }, r => { r.balanceInfoMap = {}; },
    r => { r.balanceInfoMap[value.accepted.asset] = null; },
    r => { r.balanceInfoMap[value.accepted.asset].token = null; },
    r => { r.balanceInfoMap[value.accepted.asset].token.tokenStandard = 'zts1qsrxxxxxxxxxxxxxmrhjll'; },
    r => { delete r.balanceInfoMap[value.accepted.asset].balance; r.unreceived = '999'; }]) {
    const changed = copy(result); change(changed);
    assert.throws(() => check(direct(value, JSON.stringify(changed))), rejected);
  }
  const base = JSON.stringify(result);
  for (const literal of ['"6"', '6.0', '6e0', '0', '-0', '-1', '9007199254740991.1', '9007199254740992']) {
    assert.throws(() => check(direct(value, base.replace('"accountHeight":6,', '"accountHeight":' + literal + ','))), rejected);
  }
  const supplied = direct(value);
  for (const changes of [{ address: value.accepted.payTo }, { chainIdentifier: 1 }, { height: 7 }, { hash: '0'.repeat(64) }]) {
    assert.throws(() => check({ ...supplied, accountFrontier: { ...supplied.accountFrontier, ...changes } }), rejected);
  }
});

test('native balance read reuses bounded raw scanning and captured numeric parsing without full token or frontier-hash proof', { timeout: 5000 }, () => {
  const value = rawView(), base = JSON.stringify(info(value)), supplied = direct(value, base);
  for (const text of ['null', '{}', '[]', 'not-json',
    JSON.stringify({ jsonrpc: '2.0', id: 1, result: info(value) }),
    base.replace('"accountHeight":6,', '"accountHeight":6,"accountHeight":6,'),
    base.replace('"balanceInfoMap":{', '"balanceInfoMap":{"__proto__":{},'),
    ' '.repeat(65537)]) assert.throws(() => check({ ...supplied, resultJson: text }), rejected);
  const large = info(value); large.balanceInfoMap[value.accepted.asset].token.domain = 'x'.repeat(9000);
  assert.ok(JSON.stringify(large).length > 8192); assert.equal(check(direct(value, JSON.stringify(large))).balance, '5');
  large.balanceInfoMap[value.accepted.asset].token.domain = '\u00e9'.repeat(40000);
  assert.throws(() => check(direct(value, JSON.stringify(large))), rejected);
  const unchecked = info(value); unchecked.balanceInfoMap[value.accepted.asset].token.decimals = 'unvalidated';
  unchecked.balanceInfoMap['unselected'] = { notValidated: true };
  assert.equal(check(direct(value, JSON.stringify(unchecked))).balance, '5');
  const hashChanged = { ...supplied, accountFrontier: { ...supplied.accountFrontier, hash: '99'.repeat(32) } };
  assert.deepEqual(check(hashChanged), check(supplied));
  const saved = JSON.parse; let hooks = 0;
  JSON.parse = () => { hooks += 1; throw Error('OVERRIDE'); };
  try { assert.equal(check(supplied).balance, '5'); assert.equal(hooks, 0); }
  finally { JSON.parse = saved; }
});

test('native balance read independently rechecks selected intent asset profile and compiled context', { timeout: 5000 }, () => {
  const value = rawView(), supplied = direct(value), foreign = rawView({ amount: '9' });
  assert.throws(() => check({ ...supplied, paymentRequired: foreign.paymentRequired }), rejected);
  assert.throws(() => check({ ...supplied, accepted: foreign.accepted }), rejected);
  const bad = copy(supplied); bad.compiledSporkIds.dynamicPlasmaId = bad.compiledSporkIds.libp2pId;
  assert.throws(() => check(bad), rejected);
  const json = info(value); json.balanceInfoMap[value.accepted.asset].token.tokenStandard = value.accepted.asset.toUpperCase();
  assert.throws(() => check({ ...supplied, resultJson: JSON.stringify(json) }), rejected);
  const tokenChanged = copy(value); tokenChanged.accepted.asset = 'zts1qsrxxxxxxxxxxxxxmrhjll';
  tokenChanged.paymentRequired.accepts[0].asset = tokenChanged.accepted.asset;
  assert.throws(() => check(direct(tokenChanged, supplied.resultJson)), rejected);
});

test('native balance read requires exact unsigned descriptor DATA without getters coercion proxies or operational fields', { timeout: 5000 }, () => {
  let hooks = 0; const hook = () => { hooks += 1; throw Error('PRIVATE_HOOK'); };
  const top = direct(); Object.defineProperty(top, 'resultJson', { enumerable: true, get: hook });
  const nested = direct(); Object.defineProperty(nested.accepted, 'amount', { enumerable: true, get: hook });
  const proxy = new Proxy(direct(), { get: hook, getPrototypeOf: hook, ownKeys: hook });
  const raw = direct(); raw.resultJson = { toString: hook, [Symbol.toPrimitive]: hook };
  for (const supplied of [top, nested, proxy, raw, { ...direct(), balanceReadVersion: 2 },
    { ...direct(), phase: 'SIGNED' }, { ...direct(), phase: 'VALIDATED' }, { ...direct(), wallet: null },
    { ...direct(), expectedBalance: '999' }]) assert.throws(() => check(supplied), rejected);
  assert.throws(() => check(), rejected); assert.throws(() => check(direct(), null), rejected); assert.equal(hooks, 0);
});

test('balance read v2 composes all existing unsigned stages without adding balance RPCs or changing result contracts', { timeout: 5000 }, async () => {
  const f = fixture(), expected = await new DataAdapter().quote(view(f.value)), plan = await f.adapter.quote(f.input);
  const work = await f.adapter.createWorkRequest(f.input, plan), assembly = await f.adapter.assemble(f.input, plan, material());
  assert.deepEqual(await f.adapter.validateUnsigned(f.input, plan, assembly.accountBlock), assembly.validation);
  assert.deepEqual(plan, expected); assert.equal(work.accountBlock.height, 7); assert.equal(assembly.preparation, 'NOT_PERFORMED');
  assert.equal(assembly.accountBlock.signature, ''); assert.equal(assembly.authority, 'NONE');
  assert.equal(f.calls.length, 8); assert.deepEqual(f.dp.positions, [24, 24]);
  assert.ok(f.calls.every(c => c.method === 'ledger.getFrontierAccountBlock'));
  const large = info(); large.balanceInfoMap[f.value.accepted.asset].token.domain = 'x'.repeat(9000);
  const g = fixture(rawView(), { text: JSON.stringify(large) });
  assert.deepEqual(await g.adapter.quote(g.input), expected);
});

test('balance read v2 rejects insufficient malformed or mismatched DATA before DP and holds every later stage', { timeout: 5000 }, async () => {
  const { plan, assembly } = await original();
  for (const name of ['quote', 'createWorkRequest', 'assemble', 'validateUnsigned']) {
    const value = rawView(), f = fixture(value, { text: JSON.stringify(info(value, '4')) });
    await assert.rejects(invoke(f, name, f.input, plan, name === 'assemble' ? material() : assembly.accountBlock), readRejected());
    assert.equal(f.calls.length, 1); assert.deepEqual(f.dp.positions, [0, 0]);
    await assert.rejects(f.adapter.quote(f.input), readRejected('held')); assert.equal(f.calls.length, 1);
  }
  for (const text of ['null', '{}', JSON.stringify({ ...info(), accountHeight: 7 }),
    JSON.stringify({ ...info(), address: rawView().accepted.payTo }),
    JSON.stringify({ ...info(), balanceInfoMap: {} })]) {
    const f = fixture(rawView(), { text });
    await assert.rejects(f.adapter.quote(f.input), readRejected());
    assert.equal(f.calls.length, 1); assert.deepEqual(f.dp.positions, [0, 0]);
  }
});

test('balance read v2 retains the same plan quote acknowledgement and unsigned block across the original price window', { timeout: 5000 }, async () => {
  const f = fixture(), plan = await f.adapter.quote(f.input), assembly = await f.adapter.assemble(f.input, plan, material());
  const retained = JSON.stringify([plan, assembly.accountBlock]);
  for (const advance of [1, 2]) {
    f.mode.advance = advance;
    const result = await f.adapter.validateUnsigned(f.input, plan, assembly.accountBlock);
    assert.deepEqual(result.workBinding.hashPriceBinding.accountBlock, assembly.accountBlock);
    assert.equal(result.authority, 'NONE'); assert.equal(plan.subject.momentumAcknowledged.height, 100);
  }
  f.mode.advance = 3;
  await assert.rejects(f.adapter.validateUnsigned(f.input, plan, assembly.accountBlock), readRejected());
  await assert.rejects(f.adapter.quote(f.input), readRejected('held'));
  assert.equal(JSON.stringify([plan, assembly.accountBlock]), retained);
});

test('balance read v2 captures raw balance text and all selected plan material and block DATA before callbacks', { timeout: 5000 }, async () => {
  const { plan, assembly } = await original();
  for (const name of ['quote', 'createWorkRequest', 'assemble', 'validateUnsigned']) {
    const f = fixture(), supplied = copy(f.input), originalPlan = copy(plan);
    const extra = name === 'assemble' ? material() : copy(assembly.accountBlock);
    f.mode.onAccount = index => {
      if (index !== 1) return;
      supplied.accountInfoResultJson = 'null'; supplied.phase = 'SIGNED'; supplied.accepted.amount = '999';
      originalPlan.subject.amount = '999'; originalPlan.quote.sourceQuote = null;
      if (name === 'assemble') extra.publicKey = ''; else extra.signature = 'signed';
    };
    const result = await invoke(f, name, supplied, originalPlan, extra);
    if (name === 'quote') assert.deepEqual(result, plan);
    else if (name === 'createWorkRequest') assert.equal(result.accountBlock.amount, '5');
    else if (name === 'assemble') assert.deepEqual(result.accountBlock, assembly.accountBlock);
    else assert.deepEqual(result, assembly.validation);
    assert.equal(supplied.accountInfoResultJson, 'null'); assert.equal(Object.isFrozen(supplied), false);
  }
});

test('balance read v2 selection is explicit and version1 neither silently upgrades nor claims a balance gate', { timeout: 5000 }, async () => {
  const f = fixture(), missing = copy(f.input); delete missing.accountInfoResultJson;
  const v1 = { ...missing, observedUserSendReadVersion: 1 };
  for (const supplied of [missing, { ...f.input, observedUserSendReadVersion: 3 },
    { ...f.input, observedUserSendReadVersion: 1 }, { ...f.input, accountInfoResultJson: null },
    { ...f.input, accountInfoResultJson: { toString() { throw Error('HOOK'); } } }]) {
    await assert.rejects(f.adapter.quote(supplied), readRejected('input_rejected'));
  }
  assert.equal(f.calls.length, 0); assert.deepEqual(f.dp.positions, [0, 0]);
  // V1 intentionally has no balance gate; this opt-in is not an authority or downgrade fence.
  const plan = await f.adapter.quote(v1); assert.equal(plan.subject.amount, '5'); assert.equal(plan.quote.authority, 'NONE');
});

test('balance read v2 preserves busy held capture and no signer or active SDK authority boundaries', { timeout: 5000 }, async () => {
  const f = fixture(rawView(), { deferredAt: 1 }); let hooks = 0;
  const hostile = new Proxy({}, { getPrototypeOf() { hooks += 1; throw Error('HOOK'); } });
  const pending = f.adapter.quote(f.input);
  try { await assert.rejects(f.adapter.quote(hostile), readRejected('busy')); assert.equal(hooks, 0); }
  finally { f.release(); }
  const plan = await pending; f.input.accountInfoResultJson = JSON.stringify(info(f.value, '4'));
  await assert.rejects(f.adapter.createWorkRequest(f.input, plan), readRejected());
  await assert.rejects(f.adapter.quote(hostile), readRejected('held')); assert.equal(hooks, 0);
  assert.equal(f.calls.length, 3); assert.deepEqual(f.dp.positions, [6, 6]);
  const balanceSource = sources.get(pins[0][0]), readSource = sources.get(pins[1][0]);
  assert.equal((balanceSource.match(/^export /gm) ?? []).length, 1);
  assert.equal((readSource.match(/^export /gm) ?? []).length, 1);
  assert.match(readSource, /const BALANCE = validateZenonUserSendBalanceRead/);
  assert.doesNotMatch(balanceSource, /node:(?:fs|https?|tls|dns|child_process|worker_threads)|fetch\s*\(|new Promise|await |async |generateKeyPair|crypto\.sign|crypto\.verify|prepareBlock|publishRawTransaction/);
  assert.doesNotMatch(readSource, /node:(?:fs|https?|tls|dns|child_process|worker_threads)|fetch\s*\(|generateKeyPair|crypto\.sign|prepareBlock|publishRawTransaction|setTimeout|this\./);
});
