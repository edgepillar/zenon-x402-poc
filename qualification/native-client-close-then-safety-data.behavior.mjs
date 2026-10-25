// Pure component controls. No SDK, SQL, socket, product timer or child entry.
// Retain the old 27 case bodies verbatim; this entry does not run their old
// fs/crypto/TAP launcher and does not relabel its historical result.
import assert from 'node:assert/strict';
import { createNativeHttpsClientCloseOwner as CREATE }
  from '../src/service-credit-native-client-close-owner.js';

const MODE = process.env.X402_NATIVE_CLOSE_THEN_DATA;
if (process.versions.node !== '24.19.0'
    || !['pre-fix-one-gap', 'current-owner-regressions-and-then-guards'].includes(MODE)) {
  throw new Error('EXPLICIT_NATIVE_CLOSE_THEN_DATA_SELECTION');
}
const legacyRegistrations = [];
function test(name, body) { legacyRegistrations.push([name, body]); }

// BEGIN RETAINED PURE 27-CASE BODY
const freeze = Object.freeze, CLOSE_UNKNOWN = 'service_credit_native_https_client_close_unknown';
const INPUT = 'service_credit_native_client_close_input_rejected';
const ZERO = { requests: 0, sockets: 0, timers: 0 };
let constructed = 0;
function fixture(counts = ZERO) {
  const f = { counts: { ...counts }, reads: 0, releases: 0, readOverride: null, releaseOverride: null, owner: null };
  const config = {
    readObservedCounts() { f.reads++; return f.readOverride === null ? freeze({ ...f.counts }) : f.readOverride(); },
    releaseLocalMaterial() { f.releases++; return f.releaseOverride === null ? undefined : f.releaseOverride(); },
  };
  f.config = config; f.owner = CREATE(config); constructed++; return f;
}
const fails = promise => assert.rejects(promise, { code: CLOSE_UNKNOWN });
function assertUnknown(f, released) {
  const s = f.owner.snapshot();
  assert.equal(s.phase, 'CLOSE_UNKNOWN'); assert.equal(s.unknown, true);
  assert.equal(s.closePromiseOutcome, 'CLOSE_UNKNOWN');
  assert.equal(s.localMaterialRelease.attempts, released ? 1 : 0);
}
test('close construction is inert and has no native effects', () => {
  const f = fixture(); assert.equal(f.reads, 0); assert.equal(f.releases, 0);
  const s = f.owner.snapshot();
  assert.equal(s.phase, 'OPEN'); assert.equal(s.closeRequested, false);
  assert.equal(s.nativeIoPerformed, false); assert.equal(s.authority, 'NONE');
  assert.equal(s.osPhysicalDrain, 'NOT_ESTABLISHED');
});
test('beginClose caches before any trusted callback or observation', async () => {
  const f = fixture(), p = f.owner.beginClose();
  assert.equal(f.owner.beginClose(), p); assert.equal(f.reads, 0); assert.equal(f.releases, 0);
  assert.equal(f.owner.snapshot().phase, 'CLOSING'); f.owner.observe(); await p;
});
test('zero actual observations return the frozen legacy clean receipt once', async () => {
  const f = fixture(), p = f.owner.beginClose(); f.owner.observe(); const result = await p;
  assert.deepEqual(result, { phase: 'CLOSED', trackedRequests: 0, trackedSockets: 0, ownedTimers: 0,
    serviceDelivery: 'NOT_ESTABLISHED' });
  assert.ok(Object.isFrozen(result)); assert.equal(f.releases, 1); assert.equal(f.reads, 2);
  for (let i = 0; i < 8; i++) f.owner.observe();
  assert.equal(f.releases, 1); assert.equal(f.owner.beginClose(), p);
  assert.equal(f.owner.snapshot().phase, 'CLOSED');
});
for (const field of ['requests','sockets','timers']) {
  test('a remaining ' + field + ' observation fences local material release', async () => {
    const f = fixture({ ...ZERO, [field]: 1 }), p = f.owner.beginClose();
    f.owner.observe(); assert.equal(f.releases, 0);
    assert.equal(f.owner.snapshot().closePromiseOutcome, 'PENDING');
    f.counts[field] = 0; f.owner.observe(); await p; assert.equal(f.releases, 1);
  });
}
test('preexisting UNKNOWN is not repaired by a zero-count close', async () => {
  const f = fixture(); f.owner.markUnknown(); const p = f.owner.beginClose(), failed = fails(p);
  f.owner.observe(); await failed; assertUnknown(f, true);
  assert.equal(f.owner.snapshot().localMaterialRelease.outcome, 'RETURNED');
});
test('a grace deadline cannot create an unrequested close', () => {
  const f = fixture(); assert.throws(() => f.owner.deadlineExpired(), {
    code: 'service_credit_native_client_close_close_not_requested' });
  assert.equal(f.owner.snapshot().phase, 'OPEN'); assert.equal(f.reads, 0);
});
test('deadline UNKNOWN settles promptly while late native observations can release once', async () => {
  const f = fixture({ requests: 1, sockets: 1, timers: 0 }), p = f.owner.beginClose(), failed = fails(p);
  f.owner.deadlineExpired(); await failed; assertUnknown(f, false); assert.equal(f.releases, 0);
  f.counts.requests = 0; f.owner.observe(); assert.equal(f.releases, 0);
  f.counts.sockets = 0; f.owner.observe(); assert.equal(f.releases, 1);
  assertUnknown(f, true); assert.equal(f.owner.snapshot().quiescenceObserved, true);
  assert.equal(f.owner.snapshot().localMaterialRelease.outcome, 'RETURNED');
  assert.equal(f.owner.beginClose(), p); await fails(p);
});
test('repeated deadlines never retry release or heal the cached rejection', async () => {
  const f = fixture({ ...ZERO, timers: 1 }), p = f.owner.beginClose(), failed = fails(p);
  f.owner.deadlineExpired(); await failed; f.counts.timers = 0; f.owner.observe();
  for (let i = 0; i < 8; i++) f.owner.deadlineExpired();
  assert.equal(f.releases, 1); assertUnknown(f, true); await fails(p);
});
test('an observation failure can later clean up but never become CLOSED', async () => {
  const f = fixture(); f.readOverride = () => { throw Error('DECLARED_READ_FAILURE'); };
  const p = f.owner.beginClose(), failed = fails(p); f.owner.observe(); await failed;
  assertUnknown(f, false); assert.equal(f.owner.snapshot().lastObservedCounts, null);
  f.readOverride = null; f.owner.observe(); assertUnknown(f, true); assert.equal(f.releases, 1);
});
test('proxy count records are rejected without invoking their traps', async () => {
  const f = fixture(); let traps = 0;
  f.readOverride = () => new Proxy({}, { ownKeys() { traps++; throw Error('TRAP'); },
    getPrototypeOf() { traps++; throw Error('TRAP'); } });
  const p = f.owner.beginClose(), failed = fails(p); f.owner.observe(); await failed;
  assert.equal(traps, 0); assertUnknown(f, false);
});
test('count getters are rejected without invocation', async () => {
  const f = fixture(); let gets = 0; const value = { sockets: 0, timers: 0 };
  Object.defineProperty(value, 'requests', { enumerable: true, get() { gets++; return 0; } });
  f.readOverride = () => freeze(value);
  const p = f.owner.beginClose(), failed = fails(p); f.owner.observe(); await failed;
  assert.equal(gets, 0); assertUnknown(f, false);
});
test('unfrozen observations cannot establish quiescence', async () => {
  const f = fixture(); f.readOverride = () => ({ ...ZERO });
  const p = f.owner.beginClose(), failed = fails(p); f.owner.observe(); await failed; assertUnknown(f, false);
});
test('invalid count numbers are never interpreted as clean observations', async () => {
  for (const bad of [-1, -0, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '0', 0n]) {
    const f = fixture(); f.readOverride = () => freeze({ ...ZERO, requests: bad });
    const p = f.owner.beginClose(), failed = fails(p); f.owner.observe(); await failed;
    assertUnknown(f, false); assert.equal(f.releases, 0);
  }
});
test('release exceptions stay UNKNOWN and are never retried', async () => {
  const f = fixture(); f.releaseOverride = () => { throw Error('DECLARED_RELEASE_FAILURE'); };
  const p = f.owner.beginClose(), failed = fails(p); f.owner.observe(); await failed;
  for (let i = 0; i < 8; i++) f.owner.observe();
  assert.equal(f.releases, 1); assertUnknown(f, true);
  assert.equal(f.owner.snapshot().localMaterialRelease.outcome, 'UNKNOWN');
});
test('non-void release results are rejected without thenable assimilation', async () => {
  let thenGets = 0; const thenable = {};
  Object.defineProperty(thenable, 'then', { get() { thenGets++; throw Error('TRAP'); } });
  for (const result of [true, 0, null, {}, Promise.resolve(), thenable]) {
    const f = fixture(); f.releaseOverride = () => result;
    const p = f.owner.beginClose(), failed = fails(p); f.owner.observe(); await failed; f.owner.observe();
    assertUnknown(f, true); assert.equal(f.releases, 1);
    assert.equal(f.owner.snapshot().localMaterialRelease.outcome, 'UNKNOWN');
  }
  assert.equal(thenGets, 0);
});
test('release reentrancy cannot duplicate cleanup or produce a clean verdict', async () => {
  const f = fixture(); f.releaseOverride = () => { f.owner.observe(); };
  const p = f.owner.beginClose(), failed = fails(p); f.owner.observe(); await failed;
  assert.equal(f.releases, 1); assertUnknown(f, true);
  assert.equal(f.owner.snapshot().localMaterialRelease.outcome, 'RETURNED');
});
test('read reentrancy remains bounded and preserves UNKNOWN', async () => {
  const f = fixture(); let once = false;
  f.readOverride = () => { if (!once) { once = true; f.owner.observe(); } return freeze({ ...ZERO }); };
  const p = f.owner.beginClose(), failed = fails(p); f.owner.observe(); await failed;
  assert.equal(f.reads, 2); assert.equal(f.releases, 1); assertUnknown(f, true);
});
test('UNKNOWN discovered during release is not overwritten by its return', async () => {
  const f = fixture(); f.releaseOverride = () => { f.owner.markUnknown(); };
  const p = f.owner.beginClose(), failed = fails(p); f.owner.observe(); await failed; assertUnknown(f, true);
});
test('new observed work after release remains uncertain without a second release', async () => {
  const f = fixture(); f.releaseOverride = () => { f.counts.sockets = 1; };
  const p = f.owner.beginClose(), failed = fails(p); f.owner.observe(); await failed;
  assert.equal(f.owner.snapshot().quiescenceObserved, false);
  f.counts.sockets = 0; f.owner.observe(); assert.equal(f.releases, 1); assertUnknown(f, true);
});
test('mutating configuration cannot replace the privately captured capabilities', async () => {
  const f = fixture();
  f.config.readObservedCounts = () => { throw Error('REPLACED_READ'); };
  f.config.releaseLocalMaterial = () => { throw Error('REPLACED_RELEASE'); };
  const p = f.owner.beginClose(); f.owner.observe(); await p; assert.equal(f.releases, 1);
});
test('late UNKNOWN downgrades current state without rewriting historical settlement', async () => {
  const f = fixture(), p = f.owner.beginClose(); f.owner.observe(); const receipt = await p;
  f.owner.markUnknown();
  const view = f.owner.snapshot();
  assert.equal(view.phase, 'CLOSE_UNKNOWN'); assert.equal(view.unknown, true);
  assert.equal(view.closePromiseOutcome, 'CLOSED'); assert.equal(await p, receipt);
  f.owner.observe(); assert.equal(f.owner.snapshot().phase, 'CLOSE_UNKNOWN'); assert.equal(f.releases, 1);
});
test('a cancelled grace callback after a clean settlement is inert', async () => {
  const f = fixture(), p = f.owner.beginClose(); f.owner.observe(); await p;
  const before = f.owner.snapshot(); f.owner.deadlineExpired(); assert.deepEqual(f.owner.snapshot(), before);
});
test('invalid method arities do not consume close or invoke callbacks', async () => {
  const f = fixture();
  for (const method of Object.values(f.owner)) assert.throws(() => method(1), { code: INPUT });
  assert.equal(f.reads, 0); assert.equal(f.releases, 0); assert.equal(f.owner.snapshot().phase, 'OPEN');
  const p = f.owner.beginClose(); f.owner.observe(); await p;
});
test('configuration accessors and proxies are rejected without invocation', () => {
  let calls = 0;
  const proxy = new Proxy({}, { ownKeys() { calls++; throw Error('TRAP'); } });
  assert.throws(() => CREATE(proxy), { code: INPUT });
  const getter = { releaseLocalMaterial() {} };
  Object.defineProperty(getter, 'readObservedCounts', { enumerable: true, get() { calls++; return () => ZERO; } });
  assert.throws(() => CREATE(getter), { code: INPUT }); assert.equal(calls, 0);
  for (const bad of [null, [], Object.create(null), {}, { readObservedCounts: true, releaseLocalMaterial() {} }])
    assert.throws(() => CREATE(bad), { code: INPUT });
});
test('snapshots are frozen observations and expose no retained callback data', async () => {
  const f = fixture(), secret = 'DECLARED_PRIVATE_MATERIAL_NOT_FOR_SNAPSHOTS';
  f.config.readObservedCounts.secret = secret;
  const p = f.owner.beginClose(); f.owner.observe(); await p;
  const snapshot = f.owner.snapshot();
  assert.ok(Object.isFrozen(snapshot)); assert.ok(Object.isFrozen(snapshot.lastObservedCounts));
  assert.ok(Object.isFrozen(snapshot.localMaterialRelease)); assert.equal(JSON.stringify(snapshot).includes(secret), false);
  assert.equal(snapshot.serviceDelivery, 'NOT_ESTABLISHED'); assert.equal(snapshot.nativeIoPerformed, false);
});
// END RETAINED PURE 27-CASE BODY

const OBJECT = Object.prototype, DEFINE = Object.defineProperty;
const GET_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const originalThen = GET_DESCRIPTOR(OBJECT, 'then');
assert.equal(originalThen, undefined);
const cases = [];
async function check(name, body) { await body(); cases.push(name); }
function withThen(descriptor, operation) {
  assert.equal(GET_DESCRIPTOR(OBJECT, 'then'), undefined);
  DEFINE(OBJECT, 'then', { ...descriptor, configurable: true });
  try { operation(); }
  finally { delete OBJECT.then; }
  assert.equal(GET_DESCRIPTOR(OBJECT, 'then'), undefined);
}
function handled(f) {
  const promise = f.owner.beginClose();
  promise.then(() => undefined, () => undefined);
  return promise;
}
async function refusedWithoutHooks(descriptor, getterCalls, options = {}) {
  const f = fixture(), p = handled(f);
  if (options.read) f.readOverride = () => {
    DEFINE(OBJECT, 'then', { ...descriptor, configurable: true });
    return freeze({ ...ZERO });
  };
  if (options.release) f.releaseOverride = () => {
    DEFINE(OBJECT, 'then', { ...descriptor, configurable: true });
  };
  if (options.secondRead) {
    let reads = 0;
    f.readOverride = () => {
      if (++reads === 2) DEFINE(OBJECT, 'then', { ...descriptor, configurable: true });
      return freeze({ ...ZERO });
    };
  }
  if (options.read || options.release || options.secondRead) {
    try { f.owner.observe(); }
    finally { delete OBJECT.then; }
  } else withThen(descriptor, () => f.owner.observe());
  await assert.rejects(p, { code: CLOSE_UNKNOWN });
  assert.equal(getterCalls(), 0);
  assertUnknown(f, true);
  assert.equal(f.owner.snapshot().localMaterialRelease.outcome, 'RETURNED');
  return f;
}

assert.equal(legacyRegistrations.length, 27);
if (MODE === 'pre-fix-one-gap') {
  const f = fixture(), p = handled(f);
  let getterReads = 0;
  withThen({ get() { getterReads++; return undefined; } }, () => f.owner.observe());
  const receipt = await p;
  assert.equal(getterReads, 1);
  assert.equal(receipt.phase, 'CLOSED');
  assert.equal(f.owner.snapshot().closePromiseOutcome, 'CLOSED');
  assert.equal(f.releases, 1);
  console.log(JSON.stringify({ event: 'PRE_FIX_NATIVE_CLOSE_INHERITED_THEN_GETTER_OBSERVED',
    gapConfirmed: true, selectedCases: 1, actualProductionComponentUsed: true,
    inheritedGetterReads: getterReads, settledCleanWithGetterRead: true,
    legacyCasesRegisteredButNotRun: legacyRegistrations.length,
    prototypeRestored: GET_DESCRIPTOR(OBJECT, 'then') === undefined,
    nativeTransportImported: false, SDK: false, SQLite: false, sockets: 0,
    productTimers: 0, children: 0, authority: 'NONE' }));
} else {
  for (const [name, body] of legacyRegistrations) await check('legacy: ' + name, body);
  assert.equal(constructed, 38);

  for (const [name, result] of [
    ['undefined', undefined], ['callable', () => undefined], ['throwing', 'THROW'],
  ]) {
    await check('inherited_then_getter_' + name + '_is_not_read_or_assimilated', async () => {
      let reads = 0;
      await refusedWithoutHooks({ get() {
        reads++; if (result === 'THROW') throw new Error('DECLARED_GETTER_MUST_NOT_RUN');
        return result;
      } }, () => reads);
    });
  }
  await check('inherited_callable_then_is_never_called', async () => {
    let calls = 0;
    await refusedWithoutHooks({ value() { calls++; } }, () => calls);
  });
  for (const [name, value] of [
    ['undefined', undefined], ['false', false], ['string', 'DECLARED_THEN_VALUE'],
    ['number', 1], ['symbol', Symbol('declared')],
  ]) {
    await check('any_inherited_then_data_member_refuses_clean_handoff_' + name, async () => {
      await refusedWithoutHooks({ value }, () => 0);
    });
  }
  for (const [name, option] of [['read', 'read'], ['release', 'release'], ['second_read', 'secondRead']]) {
    await check('then_introduced_by_' + name + '_is_checked_at_final_handoff', async () => {
      let reads = 0;
      await refusedWithoutHooks({ get() { reads++; return undefined; } }, () => reads, { [option]: true });
    });
  }
  await check('restoring_then_after_refusal_never_upgrades_or_repeats_release', async () => {
    let reads = 0;
    const f = await refusedWithoutHooks({ get() { reads++; return undefined; } }, () => reads);
    const p = f.owner.beginClose();
    for (let i = 0; i < 8; i++) f.owner.observe();
    await assert.rejects(p, { code: CLOSE_UNKNOWN });
    assertUnknown(f, true); assert.equal(f.releases, 1); assert.equal(reads, 0);
  });
  await check('transient_member_removed_before_handoff_does_not_change_legacy_receipt', async () => {
    const f = fixture(), p = handled(f);
    f.releaseOverride = () => { DEFINE(OBJECT, 'then', { value: undefined, configurable: true }); delete OBJECT.then; };
    f.owner.observe();
    assert.deepEqual(await p, { phase: 'CLOSED', trackedRequests: 0, trackedSockets: 0,
      ownedTimers: 0, serviceDelivery: 'NOT_ESTABLISHED' });
    assert.equal(f.releases, 1);
  });
  await check('already_unknown_rejection_does_not_assimilate_any_then_member', async () => {
    const f = fixture(); f.owner.markUnknown(); const p = handled(f);
    let reads = 0;
    withThen({ get() { reads++; return () => undefined; } }, () => f.owner.observe());
    await assert.rejects(p, { code: CLOSE_UNKNOWN }); assertUnknown(f, true); assert.equal(reads, 0);
  });
  await check('late_member_cannot_rewrite_an_already_fulfilled_promise', async () => {
    const f = fixture(), p = handled(f); f.owner.observe(); const receipt = await p;
    let reads = 0;
    withThen({ get() { reads++; return undefined; } }, () => {
      f.owner.observe(); f.owner.deadlineExpired();
    });
    assert.equal(await p, receipt); assert.equal(f.releases, 1); assert.equal(reads, 0);
  });
  await check('captured_descriptor_reader_is_not_replaced_by_callback_mutation', async () => {
    const f = fixture(), p = handled(f), saved = Object.getOwnPropertyDescriptor;
    let reads = 0;
    f.releaseOverride = () => {
      Object.getOwnPropertyDescriptor = () => undefined;
      DEFINE(OBJECT, 'then', { configurable: true, get() { reads++; return undefined; } });
    };
    try { f.owner.observe(); }
    finally { Object.getOwnPropertyDescriptor = saved; delete OBJECT.then; }
    await assert.rejects(p, { code: CLOSE_UNKNOWN }); assertUnknown(f, true); assert.equal(reads, 0);
  });
  await check('busy_observation_after_refusal_does_not_repeat_local_release', async () => {
    const f = await refusedWithoutHooks({ value: undefined }, () => 0);
    f.counts.sockets = 1; f.owner.observe(); assert.equal(f.releases, 1);
    f.counts.sockets = 0; f.owner.observe(); assertUnknown(f, true); assert.equal(f.releases, 1);
  });

  assert.equal(cases.length, 45); assert.equal(new Set(cases).size, cases.length);
  assert.equal(GET_DESCRIPTOR(OBJECT, 'then'), originalThen);
  console.log(JSON.stringify({ event: 'NATIVE_CLOSE_THEN_SAFETY_ACTUAL_DATA_CONTROLS',
    successful: true, selectedCases: cases.length, legacyRegressionCases: 27, newThenSafetyCases: 18,
    cases, legacyConstructedOwners: 38, legacyCaseBodiesRetainedVerbatim: true,
    actualProductionCloseOwnerUsed: true, normalCleanReceiptShapeUnchanged: true,
    inheritedThenHooksReadOrCalled: 0, prototypeRestored: true,
    nativeTransportImported: false, SDK: false, SQLite: false, keysSignaturesNonce: false,
    sockets: 0, productTimers: 0, children: 0, nativePhysicalDrain: 'NOT_ESTABLISHED',
    fullApplicationQualified: false, authority: 'NONE' }));
}
