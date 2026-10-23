/*
 * New runtime client-role qualification only. No legacy qualification/test
 * entry is imported, no official SDK is imported, and no raw signer runs.
 * All transaction/hash/signature fields below are fixed declared DATA.
 * One selected managed command, not a full suite or HTTP/SDK conformance run.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createSelectedPaymentClientBridge as CREATE } from '../src/x402-selected-payment-client-bridge.js';
import { validatePaymentRequired } from '../src/x402-wire.js';

assert.equal(process.argv.length, 2);
const OPTIONS = { timeout: 5000, concurrency: false };
const NativePromise = Promise, nativeThen = Promise.prototype.then, apply = Reflect.apply;
const copy = value => JSON.parse(JSON.stringify(value)); // Finite test-owned DATA only.
const PREFIX = 'x402_selected_client_bridge_';
const totals = { fixtures: 0, schemas: 0, creators: 0 };
function requirement() {
  return { scheme: 'exact', network: 'zenon:mock', asset: 'zts1declaredasset', amount: '1',
    payTo: 'z1declaredrecipient', maxTimeoutSeconds: 60,
    extra: { paymentFlow: 'upfront', poc: true, settlement: 'account-block',
      zenonChain: { version: 1, chainIdentifier: String(Number.MAX_SAFE_INTEGER), genesisMomentumHash: '0'.repeat(64) } } };
}
function cap() {
  let resolve, reject; const promise = new NativePromise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
function outcome(p) { return apply(nativeThen, p, [value => ({ value }), error => ({ error })]); }
function rejected(kind) {
  return error => {
    assert.ok(error instanceof TypeError && Object.isFrozen(error));
    assert.equal(error.code, PREFIX + kind); assert.equal(error.message, error.code);
    assert.equal(error.stack, 'TypeError: ' + error.code); assert.equal(Object.hasOwn(error, 'cause'), false);
    return true;
  };
}
function frozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value));
  for (const key of Object.keys(value)) frozen(value[key]);
}
function fixture(mode = {}) {
  totals.fixtures++;
  const f = { mode, req: requirement(), calls: { schema: 0, creator: 0 }, seen: [] };
  f.challenge = { x402Version: 2, resource: { url: 'https://client-role.invalid/paid',
    description: 'Declared resource.', mimeType: 'application/json', tags: ['one', 'two', 'one'] },
    accepts: [f.req] };
  f.view = f.req;
  f.payload = { x402Version: 2, resource: copy(f.challenge.resource), accepted: copy(f.req),
    payload: { transaction: { hash: 'a'.repeat(64), signature: 'DECLARED_NOT_A_WALLET_SIGNATURE',
      nonce: '0000000000000000' }, intentDigest: 'b'.repeat(64) } };
  class Client {
    createPaymentPayload(...args) {
      assert.equal(this, f.client); assert.equal(args.length, 2);
      f.calls.creator++; totals.creators++; f.seen.push(args);
      frozen(args[0]); assert.equal(args[0].accepts.length, 1); assert.equal(args[0].accepts[0], args[1]);
      assert.deepEqual(args[1], f.payload.accepted);
      return mode.onCreate ? mode.onCreate(args[0], args[1], f) : copy(f.payload);
    }
  }
  f.client = new Client();
  f.options = { requirement: f.req, localClient: f.client,
    validateChallenge: function validateChallenge(data) {
      assert.equal(this, undefined); assert.equal(arguments.length, 1); frozen(data);
      f.calls.schema++; totals.schemas++; validatePaymentRequired(data);
      return mode.onSchema ? mode.onSchema(data, f) : undefined;
    },
    assetInfo: { asset: f.req.asset, decimals: 8, symbol: 'DECLARED' },
    contextLimit: mode.limit ?? 8 };
  f.bridge = CREATE(f.options); f.adapter = f.bridge.adapter;
  f.before = (challenge = f.challenge, selected = f.view) =>
    f.adapter.schemeHooks.onBeforePaymentCreation({ paymentRequired: challenge, selectedRequirements: selected });
  f.create = (context = undefined) => f.adapter.createPaymentPayload(2, f.view, context);
  f.failure = () => f.adapter.schemeHooks.onPaymentCreationFailure({ selectedRequirements: f.view });
  return f;
}
const snap = f => f.bridge.getSnapshot();

test('selected client bridge exposes immutable SDK shaped roles and captures configuration without caller hooks', OPTIONS, () => {
  const f = fixture();
  assert.deepEqual(Object.keys(f.bridge), ['adapter', 'getSnapshot']);
  for (const x of [f.bridge, f.adapter, f.adapter.schemeHooks, ...Object.values(f.adapter.schemeHooks),
    f.adapter.createPaymentPayload, f.adapter.findDefaultAsset, f.bridge.getSnapshot]) assert.ok(Object.isFrozen(x));
  assert.equal(f.adapter.scheme, 'exact');
  let hooks = 0; const hook = () => { hooks++; throw Error('PRIVATE_CONFIGURATION'); };
  const getter = { ...f.options }; Object.defineProperty(getter, 'requirement', { enumerable: true, get: hook });
  const client = {}; Object.defineProperty(client, 'createPaymentPayload', { get: hook });
  const proxy = new Proxy(f.options, { getPrototypeOf: hook, ownKeys: hook });
  for (const invalid of [null, {}, getter, proxy, { ...f.options, localClient: client },
    { ...f.options, contextLimit: 0 }, { ...f.options, contextLimit: 65 }, { ...f.options, contextLimit: -0 },
    { ...f.options, assetInfo: { ...f.options.assetInfo, asset: 'foreign' } },
    { ...f.options, assetInfo: { ...f.options.assetInfo, decimals: -0 } },
    { ...f.options, validateChallenge: new Proxy(function () {}, { apply: hook }) }])
    assert.throws(() => CREATE(invalid), rejected('configuration_rejected'));
  assert.throws(() => CREATE(), rejected('configuration_rejected'));
  assert.throws(() => CREATE(f.options, null), rejected('configuration_rejected'));
  assert.equal(hooks, 0); assert.deepEqual(f.calls, { schema: 0, creator: 0 });
});

test('selected client bridge returns only explicit fixed asset metadata without opening payment authority', OPTIONS, () => {
  const f = fixture(), info = f.adapter.findDefaultAsset(f.req.asset, f.req.network);
  assert.deepEqual(info, f.options.assetInfo); info.decimals = 0;
  f.options.assetInfo.symbol = 'CHANGED';
  assert.deepEqual(f.adapter.findDefaultAsset(f.req.asset, f.req.network),
    { asset: f.req.asset, decimals: 8, symbol: 'DECLARED' });
  assert.equal(f.adapter.findDefaultAsset('foreign', f.req.network), undefined);
  assert.equal(f.adapter.findDefaultAsset(f.req.asset, 'foreign'), undefined);
  assert.equal(f.adapter.findDefaultAsset(f.req.asset, f.req.network, true), undefined);
  assert.deepEqual(f.calls, { schema: 0, creator: 0 }); assert.equal(snap(f).authority, 'NONE');
});

test('selected client bridge captures the exact ordered selected view and creates one detached original payload', OPTIONS, async () => {
  const f = fixture(), alternative = copy(f.req); alternative.amount = '2';
  f.challenge.accepts = [alternative, f.view]; f.challenge.error = undefined;
  const original = JSON.stringify(f.challenge); await f.before();
  const part = await f.create();
  assert.equal(Object.getPrototypeOf(part), null); frozen(part);
  assert.deepEqual(Object.keys(part), ['x402Version', 'payload']);
  assert.deepEqual(part.payload, f.payload.payload); assert.notEqual(part.payload, f.payload.payload);
  assert.equal(JSON.stringify(f.challenge), original); assert.equal(f.seen.length, 1);
  assert.deepEqual(f.seen[0][0].resource.tags, ['one', 'two', 'one']);
  assert.equal(f.challenge.accepts[0], alternative); assert.equal(f.challenge.accepts[1], f.view);
  f.payload.payload.transaction.signature = 'LATE_MUTATION';
  assert.equal(part.payload.transaction.signature, 'DECLARED_NOT_A_WALLET_SIGNATURE');
  assert.deepEqual(f.calls, { schema: 1, creator: 1 });
  assert.equal(snap(f).created, 1); assert.equal(snap(f).retainedInputs, 0);
});

test('selected client bridge denies missing cloned duplicate and consumed identities without a second creator call', OPTIONS, async () => {
  const f = fixture();
  await assert.rejects(f.create(), rejected('context_consumed_or_missing'));
  await assert.rejects(f.before(f.challenge, copy(f.view)), rejected('capture_rejected'));
  await f.before(); await f.create();
  await assert.rejects(f.create(), rejected('context_consumed_or_missing'));
  await assert.rejects(f.before(), rejected('capture_rejected'));
  await f.failure(); await assert.rejects(f.before(), rejected('capture_rejected'));
  assert.equal(f.calls.creator, 1); assert.equal(snap(f).consumedContexts, 1);
  const duplicate = fixture(); duplicate.challenge.accepts = [duplicate.view, duplicate.view];
  await assert.rejects(duplicate.before(), rejected('capture_rejected'));
  assert.equal(duplicate.calls.creator, 0);
});

test('selected client bridge failure hook cancels an idle context without releasing its one shot identity', OPTIONS, async () => {
  const f = fixture(); await f.before(); await f.failure(); await f.failure();
  assert.equal(snap(f).consumedContexts, 1); assert.equal(snap(f).retainedInputs, 0);
  await assert.rejects(f.create(), rejected('context_consumed_or_missing'));
  await assert.rejects(f.before(), rejected('capture_rejected'));
  assert.equal(f.calls.creator, 0); assert.equal(snap(f).uncertainCreations, 0);
});

test('selected client bridge rejects changed source resource requirement order and view identity before creator entry', OPTIONS, async () => {
  const mutations = [
    f => { f.challenge.resource.tags = ['two', 'one', 'one']; },
    f => { f.req.amount = '3'; },
    f => { f.challenge.accepts = [copy(f.view)]; },
    f => { f.challenge.resource.url += '/changed'; },
  ];
  for (const mutate of mutations) {
    const f = fixture(); await f.before(); mutate(f);
    await assert.rejects(f.create(), rejected('creation_rejected'));
    assert.equal(f.calls.creator, 0); assert.equal(snap(f).uncertainCreations, 0);
    await assert.rejects(f.create(), rejected('context_consumed_or_missing'));
  }
});

test('selected client bridge snapshots schema input and refuses mutation substitution async replies and capture reentry', OPTIONS, async () => {
  const changed = fixture({ onSchema: (_, f) => { f.challenge.resource.url += '/changed'; } });
  await assert.rejects(changed.before(), rejected('capture_rejected'));
  assert.equal(snap(changed).contexts, 0); assert.equal(changed.calls.creator, 0);
  const substitute = fixture({ onSchema: data => copy(data) });
  await assert.rejects(substitute.before(), rejected('capture_rejected'));
  const asyncReply = fixture({ onSchema: () => Promise.resolve(undefined) });
  await assert.rejects(asyncReply.before(), rejected('capture_rejected'));
  let hooks = 0, nested;
  const reentrant = fixture({ onSchema: (_, f) => {
    const hostile = new Proxy({}, { getPrototypeOf() { hooks++; throw Error('PRIVATE_REENTRY'); } });
    nested = outcome(f.adapter.schemeHooks.onBeforePaymentCreation(hostile));
  } });
  await reentrant.before(); rejected('busy')((await nested).error);
  assert.equal(hooks, 0); assert.equal(reentrant.calls.schema, 1); await reentrant.create();
});

test('selected client bridge duplicate and failure hook refusals do not poison the first pending creation', OPTIONS, async () => {
  const ready = cap(), f = fixture({ onCreate: () => ready.promise });
  await f.before(); const first = f.create();
  assert.equal(f.calls.creator, 1);
  await assert.rejects(f.create(), rejected('context_consumed_or_missing'));
  await assert.rejects(f.failure(), rejected('failure_hook_rejected'));
  assert.equal(snap(f).retainedInputs, 1); assert.equal(snap(f).uncertainCreations, 0);
  ready.resolve(copy(f.payload)); const part = await first;
  assert.deepEqual(part.payload, f.payload.payload); assert.equal(snap(f).created, 1);
  assert.equal(snap(f).consumedContexts, 1); assert.equal(snap(f).retainedInputs, 0);
});

test('selected client bridge retains consumed ambiguity on thrown rejected or malformed creator outcomes', OPTIONS, async () => {
  const modes = [
    { onCreate: () => { throw Error('PRIVATE_CREATOR_FAILURE'); } },
    { onCreate: () => Promise.reject(Error('PRIVATE_CREATOR_REJECTION')) },
    { onCreate: () => ({ x402Version: 2 }) },
    { onCreate: (_, __, f) => ({ ...copy(f.payload), resource: { url: 'https://foreign.invalid/' } }) },
    { onCreate: (_, __, f) => ({ ...copy(f.payload), accepted: { ...copy(f.req), amount: '4' } }) },
  ];
  for (const mode of modes) {
    const f = fixture(mode); await f.before();
    await assert.rejects(f.create(), rejected('creation_rejected'));
    assert.equal(f.calls.creator, 1); assert.equal(snap(f).uncertainCreations, 1);
    assert.equal(snap(f).retainedInputs, 0);
    await f.failure(); await assert.rejects(f.create(), rejected('context_consumed_or_missing'));
  }
});

test('selected client bridge snapshots raw fulfilled DATA without invoking callback proxy getter or thenable hooks', OPTIONS, async () => {
  let hooks = 0; const hook = () => { hooks++; throw Error('PRIVATE_PAYLOAD_HOOK'); };
  for (const build of [
    f => new Proxy(f.payload, { getPrototypeOf: hook, ownKeys: hook }),
    f => Object.defineProperty(copy(f.payload), 'payload', { enumerable: true, get: hook }),
    f => Object.defineProperty(copy(f.payload), 'then', { enumerable: true, get: hook }),
    f => ({ ...copy(f.payload), then: hook }),
  ]) {
    const f = fixture({ onCreate: (_, __, current) => build(current) }); await f.before();
    await assert.rejects(f.create(), rejected('creation_rejected'));
    assert.equal(f.calls.creator, 1); assert.equal(snap(f).uncertainCreations, 1);
  }
  assert.equal(hooks, 0);
});

test('selected client bridge observes supported native promises with captured then and refuses unsafe receipts', OPTIONS, async () => {
  let hooks = 0; const hook = () => { hooks++; throw Error('PRIVATE_PROMISE_HOOK'); };
  const ready = cap(); Object.defineProperty(ready.promise, 'then', { get: hook });
  const supported = fixture({ onCreate: () => ready.promise });
  await supported.before(); const pending = supported.create(); ready.resolve(copy(supported.payload));
  assert.deepEqual((await pending).payload, supported.payload.payload);
  const raw = Promise.reject(Error('OWNER_PREHANDLED_REJECTION'));
  apply(nativeThen, raw, [undefined, () => undefined]);
  Object.defineProperty(raw, 'constructor', { get: hook });
  const unsafe = fixture({ onCreate: () => raw }); await unsafe.before();
  await assert.rejects(unsafe.create(), rejected('creation_rejected'));
  const dependency = fixture({ onCreate: (_, __, f) => f.publicHookReceipt });
  dependency.publicHookReceipt = dependency.before(); await dependency.publicHookReceipt;
  await assert.rejects(dependency.create(), rejected('creation_rejected'));
  assert.equal(hooks, 0); assert.equal(snap(unsafe).uncertainCreations, 1);
});

test('selected client bridge rechecks original context after pending fulfillment without replacement or second creation', OPTIONS, async () => {
  const ready = cap(), f = fixture({ onCreate: () => ready.promise });
  await f.before(); const first = f.create(); f.challenge.resource.description = 'CHANGED_WHILE_PENDING';
  ready.resolve(copy(f.payload)); await assert.rejects(first, rejected('creation_rejected'));
  assert.equal(snap(f).uncertainCreations, 1); assert.equal(f.calls.creator, 1);
  await assert.rejects(f.create(), rejected('context_consumed_or_missing'));
  assert.equal(f.calls.creator, 1); assert.equal(snap(f).retainedInputs, 0);
});

test('selected client bridge preserves explicit empty extension context without adding unsupported extension semantics', OPTIONS, async () => {
  const absent = fixture(); await absent.before(); await absent.create({});
  const empty = fixture(); empty.challenge.extensions = {}; await empty.before();
  const part = await empty.create({ extensions: {} }); assert.equal(Object.hasOwn(part, 'extensions'), false);
  const output = fixture({ onCreate: (_, __, f) => ({ ...copy(f.payload), extensions: {} }) });
  output.challenge.extensions = {}; await output.before();
  assert.deepEqual((await output.create({ extensions: {} })).extensions, {});
  const mismatch = fixture(); await mismatch.before();
  await assert.rejects(mismatch.create({ extensions: {} }), rejected('creation_rejected'));
  assert.equal(mismatch.calls.creator, 0); assert.equal(snap(mismatch).uncertainCreations, 0);
  const nonempty = fixture(); nonempty.challenge.extensions = { unsupported: {} };
  await assert.rejects(nonempty.before(), rejected('capture_rejected'));
  assert.equal(nonempty.calls.creator, 0);
});

test('selected client bridge bounds failed capture attempts dense offers descriptor hooks and text before callbacks', OPTIONS, async () => {
  let hooks = 0; const hook = () => { hooks++; throw Error('PRIVATE_CAPTURE_HOOK'); };
  const capped = fixture({ limit: 1 });
  await assert.rejects(capped.before({}, capped.view), rejected('capture_rejected'));
  await assert.rejects(capped.before(), rejected('capture_rejected'));
  assert.equal(snap(capped).captureAttempts, 1); assert.equal(capped.calls.schema, 0);
  const getter = fixture();
  Object.defineProperty(getter.challenge.resource, 'description', { enumerable: true, get: hook });
  await assert.rejects(getter.before(), rejected('capture_rejected'));
  const huge = fixture(); huge.challenge.resource.description = 'x'.repeat(131073);
  await assert.rejects(huge.before(), rejected('capture_rejected'));
  const offers = fixture(); offers.challenge.accepts = Array(17).fill(offers.view);
  await assert.rejects(offers.before(), rejected('capture_rejected'));
  const sparse = fixture(); sparse.challenge.accepts = [, sparse.view];
  await assert.rejects(sparse.before(), rejected('capture_rejected'));
  const proxy = fixture();
  await assert.rejects(proxy.adapter.schemeHooks.onBeforePaymentCreation(new Proxy({}, {
    getPrototypeOf: hook, ownKeys: hook })), rejected('capture_rejected'));
  assert.equal(hooks, 0); assert.equal(snap(proxy).creationAttempts, 0);
});

test('selected client bridge captures operational methods and keeps precreator drift distinct from an older creation', OPTIONS, async () => {
  const f = fixture(); await f.before(); await f.create();
  f.client.createPaymentPayload = () => { throw Error('REPLACED_METHOD_MUST_NOT_RUN'); };
  const second = copy(f.challenge), selected = second.accepts[0]; await f.before(second, selected);
  second.resource.description = 'DRIFT_BEFORE_CREATOR';
  await assert.rejects(f.adapter.createPaymentPayload(2, selected), rejected('creation_rejected'));
  assert.equal(f.calls.creator, 1); assert.equal(snap(f).uncertainCreations, 0);
  const captured = fixture(); captured.client.createPaymentPayload = () => { throw Error('REPLACED'); };
  await captured.before(); await captured.create(); assert.equal(captured.calls.creator, 1);
  const wrongArity = fixture(); await wrongArity.before();
  await assert.rejects(wrongArity.adapter.createPaymentPayload(2), rejected('input_rejected'));
  await wrongArity.create(); assert.equal(wrongArity.calls.creator, 1);
});

test('selected client bridge refuses changed intrinsic premises and keeps snapshots powerless and payload free', OPTIONS, () => {
  const f = fixture(); let hooks = 0;
  const old = Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON');
  try {
    Object.defineProperty(Object.prototype, 'toJSON', { configurable: true, value() { hooks++; throw Error('PRIVATE_JSON_HOOK'); } });
    assert.throws(() => CREATE(f.options), rejected('configuration_rejected'));
  } finally {
    if (old === undefined) delete Object.prototype.toJSON;
    else Object.defineProperty(Object.prototype, 'toJSON', old);
  }
  assert.equal(hooks, 0); const s = snap(f); assert.ok(Object.isFrozen(s));
  assert.equal(s.authority, 'NONE'); assert.equal(s.signingAuthorization, 'NOT_ESTABLISHED');
  assert.equal(s.qualification, 'SDK_FREE_LOCAL_COMPONENT_ONLY');
  for (const key of ['payload', 'transaction', 'signature', 'resource', 'privateKey', 'submit', 'retry', 'ready'])
    assert.equal(Object.hasOwn(s, key), false);
  assert.throws(() => f.bridge.getSnapshot(null), rejected('input_rejected'));
});
after(t => {
  assert.deepEqual(totals, { fixtures: 43, schemas: 33, creators: 23 });
  t.diagnostic(JSON.stringify({ kind: 'P1B_SELECTED_PAYMENT_CLIENT_BRIDGE', version: 1,
    selectedCases: 16, ...totals, officialSdkImports: 0, keys: 0, signatures: 0,
    sql: 0, network: 0, nonceSearch: 0, realPrepare: 0, authority: 'NONE',
    qualification: 'LOCAL_SDK_FREE_COMPONENT_NOT_OFFICIAL_CORE_OR_LIVE_PAYMENT_QUALIFICATION' }));
});
