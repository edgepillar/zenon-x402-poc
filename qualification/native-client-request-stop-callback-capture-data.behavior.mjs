/*
 * Actual stop-owner callback capture plus the unchanged eighteen component
 * scenarios. Declared callbacks/opaque handles are DATA, not native brands or
 * physical drain. No SDK, SQL, application socket/timer, key, signer or nonce.
 * Prototype fixtures are synchronous, transient and restored before returning.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
if (process.version !== 'v24.19.0'
    || process.env.X402_NATIVE_CLIENT_STOP_CAPTURE_DATA !== 'own-data-callback-capture-only'
    || process.env.X402_NATIVE_CLIENT_STOP_SELECTION !== 'eighteen-stop-component-cases-only'
    || process.env.NODE_DISABLE_COMPILE_CACHE !== '1'
    || ['NODE_OPTIONS', 'NODE_PATH', 'NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'NODE_COMPILE_CACHE']
      .some(key => process.env[key] !== undefined)) {
  throw new TypeError('NATIVE_STOP_CALLBACK_CAPTURE_DATA_SELECTION_REJECTED');
}
// Reuse the real historical cases verbatim against CURRENT actual modules.
// This produces a new result; it never relabels their historical result file.
await import('./native-client-request-stop-owner.behavior.draft.mjs');
const { createNativeHttpsClientRequestStopOwner: CREATE } =
  await import('../src/service-credit-native-client-request-stop-owner.js');
const F = Object.freeze, DEFINE = Object.defineProperty, DESC = Object.getOwnPropertyDescriptor;
const DELETE = Reflect.deleteProperty, OBJECT = Object.prototype;
const FIELDS = F(['destroyRequest', 'destroySocket']);
const OPTIONS = F({ timeout: 2000, concurrency: false });
const names = [];
let entered = 0, completed = 0, inheritedGets = 0, inheritedSets = 0;
let substitutedEntries = 0, publishedCapabilities = 0, providedRequestEntries = 0, providedSocketEntries = 0;

function withInherited(descriptors, run) {
  const originals = new Map(FIELDS.map(name => [name, DESC(OBJECT, name)]));
  for (const name of FIELDS) assert.equal(originals.get(name), undefined);
  try {
    for (const name of FIELDS) if (Object.hasOwn(descriptors, name))
      DEFINE(OBJECT, name, { ...descriptors[name], configurable: true, enumerable: false });
    return run();
  } finally {
    for (const name of FIELDS) {
      const original = originals.get(name);
      if (original === undefined) assert.equal(DELETE(OBJECT, name), true);
      else DEFINE(OBJECT, name, original);
    }
  }
}
function accessor() {
  return { get() { inheritedGets++; return F(function substituted() { substitutedEntries++; }); },
    set(value) { inheritedSets++; if (typeof value === 'function') publishedCapabilities++; } };
}
function fixture(requestEffect = () => undefined, socketEffect = () => undefined) {
  const request = F({ declared: 'request' }), socket = F({ declared: 'socket' }), calls = [];
  let owner;
  const requestCallback = F(function requestCallback(handle, kind) {
    providedRequestEntries++; calls.push(['request', handle, kind, this]); return requestEffect(owner);
  });
  const socketCallback = F(function socketCallback(handle) {
    providedSocketEntries++; calls.push(['socket', handle, this]); return socketEffect(owner);
  });
  const configuration = { destroyRequest: requestCallback, destroySocket: socketCallback };
  owner = CREATE(configuration);
  assert.equal(calls.length, 0);
  return { owner, request, socket, calls, configuration, requestCallback, socketCallback };
}
function exercise(f) {
  assert.equal(f.owner.attachRequest(f.request), true); assert.equal(f.owner.attachSocket(f.socket), true);
  assert.equal(f.owner.canStartHandshake(), true);
  f.owner.stop('deadline'); f.owner.stop('close_requested');
  assert.deepEqual(f.calls, [['request', f.request, 'deadline', undefined], ['socket', f.socket, undefined]]);
  const s = f.owner.snapshot();
  assert.equal(s.requestDestroyOutcome, 'RETURNED'); assert.equal(s.socketDestroyOutcome, 'RETURNED');
  assert.equal(s.firstStopKind, 'deadline'); assert.equal(s.handshakePermitted, false);
  assert.equal(s.nativeHandleBrandAuthenticated, false); assert.equal(s.physicalDrain, 'NOT_ESTABLISHED');
}
function noPrototypeEntries() {
  assert.equal(inheritedGets, 0); assert.equal(inheritedSets, 0);
  assert.equal(substitutedEntries, 0); assert.equal(publishedCapabilities, 0);
}
async function selected(name, run) {
  let passed = false;
  await test(name, OPTIONS, () => {
    entered++; const result = run(); assert.equal(result, undefined); noPrototypeEntries(); completed++; passed = true;
  });
  if (!passed) throw new Error('STOP_CALLBACK_CAPTURE_CASE_FAILED');
  names.push(name);
}
for (const field of FIELDS) {
  await selected('capture ignores inherited getter and setter for ' + field, () => {
    withInherited({ [field]: accessor() }, () => { exercise(fixture()); });
  });
  await selected('capture ignores inherited getter-only field ' + field, () => {
    withInherited({ [field]: { get() { inheritedGets++; throw new Error('GETTER_MUST_STAY_UNREAD'); } } },
      () => { exercise(fixture()); });
  });
  await selected('capture ignores inherited throwing setter for ' + field, () => {
    withInherited({ [field]: { set() { inheritedSets++; throw new Error('SETTER_MUST_STAY_UNENTERED'); } } },
      () => { exercise(fixture()); });
  });
  await selected('capture shadows inherited read-only data for ' + field, () => {
    withInherited({ [field]: { value: F(() => { substitutedEntries++; }), writable: false } },
      () => { exercise(fixture()); });
  });
  await selected('capture preserves inherited writable-data shadowing for ' + field, () => {
    withInherited({ [field]: { value: F(() => { substitutedEntries++; }), writable: true } },
      () => { exercise(fixture()); });
  });
}
await selected('both callback capabilities remain private under inherited accessors', () => {
  withInherited({ destroyRequest: accessor(), destroySocket: accessor() }, () => { exercise(fixture()); });
});
await selected('invalid second callback never publishes the first validated capability', () => {
  const requestCallback = F(() => { providedRequestEntries++; });
  withInherited({ destroyRequest: accessor(), destroySocket: accessor() }, () => {
    assert.throws(() => CREATE({ destroyRequest: requestCallback, destroySocket: null }),
      { code: 'service_credit_native_client_request_stop_configuration_rejected' });
  });
});
await selected('own getter rejection does not invoke own or inherited accessors', () => {
  let ownGets = 0;
  withInherited({ destroyRequest: accessor(), destroySocket: accessor() }, () => {
    const configuration = { destroyRequest: F(() => undefined), get destroySocket() { ownGets++; return F(() => undefined); } };
    assert.throws(() => CREATE(configuration), { code: 'service_credit_native_client_request_stop_configuration_rejected' });
  });
  assert.equal(ownGets, 0);
});
await selected('callback proxy rejection never enters inherited capability setters', () => {
  let traps = 0;
  withInherited({ destroyRequest: accessor(), destroySocket: accessor() }, () => {
    const callback = new Proxy(F(() => undefined), { apply() { traps++; }, getPrototypeOf() { traps++; } });
    assert.throws(() => CREATE({ destroyRequest: F(() => undefined), destroySocket: callback }),
      { code: 'service_credit_native_client_request_stop_configuration_rejected' });
  });
  assert.equal(traps, 0);
});
await selected('later input mutation cannot replace either captured callback', () => {
  withInherited({ destroyRequest: accessor(), destroySocket: accessor() }, () => {
    const f = fixture();
    f.configuration.destroyRequest = F(() => { substitutedEntries++; });
    f.configuration.destroySocket = F(() => { substitutedEntries++; });
    exercise(f);
  });
});
await selected('late socket stop still calls the exact captured capabilities once', () => {
  withInherited({ destroyRequest: accessor(), destroySocket: accessor() }, () => {
    const f = fixture(); f.owner.attachRequest(f.request); f.owner.stop('deadline');
    assert.equal(f.calls.length, 1); f.owner.attachSocket(f.socket); f.owner.stop('request_error');
    assert.deepEqual(f.calls, [['request', f.request, 'deadline', undefined], ['socket', f.socket, undefined]]);
    assert.equal(f.owner.canStartHandshake(), false);
  });
});
await selected('reentrant request destroy cannot reenter either captured capability', () => {
  withInherited({ destroyRequest: accessor(), destroySocket: accessor() }, () => {
    const f = fixture(owner => { owner.stop('request_error'); }); exercise(f);
  });
});
await selected('captured request failure preserves independent socket stop and no retry', () => {
  withInherited({ destroyRequest: accessor(), destroySocket: accessor() }, () => {
    const f = fixture(() => { throw new Error('DECLARED_REQUEST_FAILURE'); });
    f.owner.attachRequest(f.request); f.owner.attachSocket(f.socket); f.owner.stop('deadline'); f.owner.stop('request_error');
    assert.equal(f.calls.length, 2); assert.equal(f.owner.snapshot().requestDestroyOutcome, 'UNKNOWN');
    assert.equal(f.owner.snapshot().socketDestroyOutcome, 'RETURNED');
  });
});
await selected('close observations still release references without redundant destroy entries', () => {
  withInherited({ destroyRequest: accessor(), destroySocket: accessor() }, () => {
    const f = fixture(owner => { owner.markRequestClosed(); owner.markSocketClosed(); });
    f.owner.attachRequest(f.request); f.owner.attachSocket(f.socket); f.owner.stop('deadline');
    assert.equal(f.calls.length, 1); const s = f.owner.snapshot();
    assert.equal(s.requestReferenceRetained, false); assert.equal(s.socketReferenceRetained, false);
    assert.equal(s.handshakePermitted, false); assert.equal(s.physicalDrain, 'NOT_ESTABLISHED');
  });
});
await selected('invalid stop input remains rejected before either captured callback', () => {
  withInherited({ destroyRequest: accessor(), destroySocket: accessor() }, () => {
    const f = fixture(); f.owner.attachRequest(f.request); f.owner.attachSocket(f.socket);
    assert.throws(() => f.owner.stop('INVALID'), { code: 'service_credit_native_client_request_stop_input_rejected' });
    assert.equal(f.calls.length, 0); assert.equal(f.owner.canStartHandshake(), true);
  });
});
assert.equal(entered, 20); assert.equal(completed, 20); assert.equal(names.length, 20);
for (const field of FIELDS) assert.equal(DESC(OBJECT, field), undefined);
noPrototypeEntries();
console.log('# native-client-stop-callback-capture-data ' + JSON.stringify({
  legacySelectedCases: 18, newEntered: entered, newCompleted: completed, selectedCases: 38, names,
  inheritedGets, inheritedSets, substitutedEntries, publishedCapabilities,
  providedRequestEntries, providedSocketEntries, constructorCapabilityCopyIsOwnData: true,
  nativeAdapterImported: false, nativeBuiltinAliases: 0, sourceTransforms: 0,
  applicationSockets: 0, applicationTimers: 0, SDK: false, SQLite: false, nonce: false, signing: false,
  physicalDrainQualified: false, remoteExploitEstablished: false, authority: 'NONE',
}));
