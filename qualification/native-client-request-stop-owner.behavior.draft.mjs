/*
 * Eighteen selected SDK/SQL/TLS/socket/timer-free component cases.
 * Actual stop-gate and close-owner modules; declared opaque handles/callbacks
 * are NOT native brands, native request replacement or physical drain proof.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
if (process.versions.node !== '24.19.0'
    || process.env.X402_NATIVE_CLIENT_STOP_SELECTION !== 'eighteen-stop-component-cases-only'
    || process.env.NODE_OPTIONS !== undefined || process.env.NODE_PATH !== undefined
    || process.env.NODE_TEST_CONTEXT !== undefined || process.env.NODE_V8_COVERAGE !== undefined) {
  throw new TypeError('NATIVE_CLIENT_STOP_COMPONENT_SELECTION_REJECTED');
}
const [{ createNativeHttpsClientRequestStopOwner: CREATE },
  { createNativeHttpsClientCloseOwner: CLOSE }] = await Promise.all([
  import('../src/service-credit-native-client-request-stop-owner.js'),
  import('../src/service-credit-native-client-close-owner.js'),
]);
const F = Object.freeze, OPTIONS = { timeout: 2000, concurrency: false };
let entered = 0, completed = 0, declaredDestroyEntries = 0;
async function scenario(name, run) {
  await test(name, OPTIONS, async () => { entered++; await run(); completed++; });
}
function fixture(requestEffect = () => undefined, socketEffect = () => undefined) {
  const request = F({ label: 'synthetic-request' }), socket = F({ label: 'synthetic-socket' }), calls = [];
  let owner;
  owner = CREATE({ destroyRequest: F((handle, kind) => {
    declaredDestroyEntries++; calls.push(['request', handle, kind]); return requestEffect(owner);
  }), destroySocket: F(handle => {
    declaredDestroyEntries++; calls.push(['socket', handle]); return socketEffect(owner);
  }) });
  return { owner, request, socket, calls };
}
function attached(f) {
  assert.equal(f.owner.attachRequest(f.request), true);
  assert.equal(f.owner.attachSocket(f.socket), true);
}
function inputError(value) { return value instanceof TypeError && Object.isFrozen(value)
  && value.code === 'service_credit_native_client_request_stop_input_rejected'; }

await scenario('construction is inert and exposes no close or handshake authority', () => {
  const f = fixture(), s = f.owner.snapshot();
  assert.equal(f.calls.length, 0); assert.equal(s.stopRequested, false);
  assert.equal(s.handshakePermitted, false); assert.equal(s.authority, 'NONE');
  assert.equal(s.nativeHandleBrandAuthenticated, false); assert.equal(s.physicalDrain, 'NOT_ESTABLISHED');
  assert.equal(Object.hasOwn(f.owner, 'close'), false);
});
await scenario('stop before either assignment destroys each later owned handle once', () => {
  const f = fixture(); f.owner.stop('close_requested');
  assert.equal(f.calls.length, 0); attached(f);
  assert.deepEqual(f.calls, [['request', f.request, 'close_requested'], ['socket', f.socket]]);
  assert.equal(f.owner.canStartHandshake(), false);
});
await scenario('normal associations permit handshake and normal close destroys nothing', () => {
  const f = fixture(); attached(f); assert.equal(f.owner.canStartHandshake(), true);
  f.owner.markRequestClosed(); f.owner.markSocketClosed();
  const s = f.owner.snapshot();
  assert.equal(s.requestReferenceRetained, false); assert.equal(s.socketReferenceRetained, false);
  assert.equal(s.handshakePermitted, false); assert.equal(s.stopRequested, false);
  assert.equal(f.calls.length, 0);
});
await scenario('repeated stop reasons do not repeat destroys or replace the original reason', () => {
  const f = fixture(); attached(f);
  for (let i = 0; i < 32; i++) f.owner.stop(i === 0 ? 'deadline' : 'close_requested');
  assert.deepEqual(f.calls, [['request', f.request, 'deadline'], ['socket', f.socket]]);
  assert.equal(f.owner.snapshot().firstStopKind, 'deadline');
});
await scenario('late socket after request stop is destroyed immediately without handshake', () => {
  const f = fixture(); f.owner.attachRequest(f.request); f.owner.stop('close_requested');
  assert.equal(f.calls.length, 1); f.owner.attachSocket(f.socket);
  assert.equal(f.calls.length, 2); assert.equal(f.owner.canStartHandshake(), false);
  f.owner.stop('tls_deadline'); assert.equal(f.calls.length, 2);
});
await scenario('late socket after observed request close never destroys the closed request', () => {
  const f = fixture(); f.owner.attachRequest(f.request); f.owner.markRequestClosed();
  assert.equal(f.owner.attachSocket(f.socket), true);
  assert.deepEqual(f.calls, [['socket', f.socket]]);
  assert.equal(f.owner.snapshot().firstStopKind, 'late_socket_after_request_close');
  assert.equal(f.owner.canStartHandshake(), false);
});
await scenario('observed socket close prevents a later socket destroy entry', () => {
  const f = fixture(); attached(f); f.owner.markSocketClosed(); f.owner.stop('request_error');
  assert.deepEqual(f.calls, [['request', f.request, 'request_error']]);
  assert.equal(f.owner.snapshot().socketReferenceRetained, false);
});
await scenario('request destroy throw still attempts the socket and never retries either', () => {
  const f = fixture(() => { throw new Error('DECLARED_REQUEST_FAILURE'); }); attached(f);
  f.owner.stop('deadline'); f.owner.stop('close_requested');
  assert.equal(f.calls.length, 2);
  assert.equal(f.owner.snapshot().requestDestroyOutcome, 'UNKNOWN');
  assert.equal(f.owner.snapshot().socketDestroyOutcome, 'RETURNED');
});
await scenario('socket destroy throw is permanently unknown without a second call', () => {
  const f = fixture(undefined, () => { throw new Error('DECLARED_SOCKET_FAILURE'); }); attached(f);
  f.owner.stop('deadline'); f.owner.stop('request_error');
  assert.equal(f.calls.length, 2);
  assert.equal(f.owner.snapshot().requestDestroyOutcome, 'RETURNED');
  assert.equal(f.owner.snapshot().socketDestroyOutcome, 'UNKNOWN');
});
await scenario('request destroy reentry cannot acquire another destroy claim', () => {
  const f = fixture(owner => owner.stop('request_error')); attached(f);
  f.owner.stop('close_requested');
  assert.equal(f.calls.length, 2);
  assert.equal(f.owner.snapshot().firstStopKind, 'close_requested');
});
await scenario('socket attached inside request destroy is stopped once before returning', () => {
  let f;
  f = fixture(owner => { assert.equal(owner.attachSocket(f.socket), true); owner.stop('socket_error'); });
  f.owner.attachRequest(f.request); f.owner.stop('deadline');
  assert.deepEqual(f.calls, [['request', f.request, 'deadline'], ['socket', f.socket]]);
  assert.equal(f.owner.canStartHandshake(), false);
});
await scenario('reentrant genuine-close observations release references without redundant destroys', () => {
  const f = fixture(owner => { owner.markRequestClosed(); owner.markSocketClosed(); });
  attached(f); f.owner.stop('close_requested');
  const s = f.owner.snapshot();
  assert.equal(f.calls.length, 1); assert.equal(s.requestClosed, true); assert.equal(s.socketClosed, true);
  assert.equal(s.requestReferenceRetained, false); assert.equal(s.socketReferenceRetained, false);
  assert.equal(s.stopRequested, true); assert.equal(s.handshakePermitted, false);
});
await scenario('duplicate assignments cannot replace ownership or destroy unrelated handles', () => {
  const f = fixture(), otherRequest = F({ other: 'request' }), otherSocket = F({ other: 'socket' });
  attached(f);
  assert.equal(f.owner.attachRequest(otherRequest), false); assert.equal(f.owner.attachSocket(otherSocket), false);
  f.owner.stop('close_requested');
  assert.deepEqual(f.calls, [['request', f.request, 'close_requested'], ['socket', f.socket]]);
});
await scenario('configuration proxies and getters are refused without invoking their traps', () => {
  let hooks = 0;
  const proxy = new Proxy({}, { get() { hooks++; }, ownKeys() { hooks++; }, getPrototypeOf() { hooks++; } });
  assert.throws(() => CREATE(proxy), { code: 'service_credit_native_client_request_stop_configuration_rejected' });
  const config = { get destroyRequest() { hooks++; return F(() => undefined); }, destroySocket: F(() => undefined) };
  assert.throws(() => CREATE(config), { code: 'service_credit_native_client_request_stop_configuration_rejected' });
  const callbackProxy = new Proxy(F(() => undefined), { apply() { hooks++; } });
  assert.throws(() => CREATE({ destroyRequest: callbackProxy, destroySocket: F(() => undefined) }));
  assert.equal(hooks, 0);
});
await scenario('opaque handle properties stay unread and proxy handles are refused', () => {
  const f = fixture(); let hooks = 0;
  const opaque = F({ get privateData() { hooks++; throw new Error('UNREAD'); } });
  assert.equal(f.owner.attachRequest(opaque), true);
  const proxy = new Proxy({}, { get() { hooks++; }, getPrototypeOf() { hooks++; } });
  assert.throws(() => f.owner.attachSocket(proxy), inputError);
  f.owner.stop('deadline'); assert.equal(hooks, 0); assert.equal(f.calls[0][1], opaque);
});
await scenario('late stop and drain never repair the actual close-owner unknown verdict in DATA composition', async () => {
  const f = fixture(); f.owner.attachRequest(f.request);
  let requests = 1, sockets = 0, releases = 0;
  const closeOwner = CLOSE({ readObservedCounts: F(() => F({ requests, sockets, timers: 0 })),
    releaseLocalMaterial: F(() => { releases++; }) });
  const p = closeOwner.beginClose(); const rejected = assert.rejects(p, { code: 'service_credit_native_https_client_close_unknown' });
  closeOwner.markUnknown(); f.owner.stop('close_requested'); closeOwner.observe();
  sockets = 1; f.owner.attachSocket(f.socket); closeOwner.observe();
  assert.equal(f.calls.length, 2); assert.equal(releases, 0);
  f.owner.markRequestClosed(); requests = 0; closeOwner.observe(); assert.equal(releases, 0);
  f.owner.markSocketClosed(); sockets = 0; closeOwner.observe(); await rejected;
  closeOwner.observe(); assert.equal(releases, 1);
  assert.equal(closeOwner.snapshot().phase, 'CLOSE_UNKNOWN');
  assert.equal(f.owner.canStartHandshake(), false);
});
await scenario('wrong arities and after-close reassociation do not mutate live ownership', () => {
  const f = fixture();
  assert.throws(() => f.owner.attachRequest(f.request, 'extra'), inputError);
  assert.throws(() => f.owner.markRequestClosed('extra'), inputError);
  assert.throws(() => f.owner.markSocketClosed('extra'), inputError);
  assert.throws(() => f.owner.canStartHandshake('extra'), inputError);
  assert.throws(() => f.owner.snapshot('extra'), inputError);
  attached(f); f.owner.markRequestClosed(); f.owner.markSocketClosed();
  assert.equal(f.owner.attachRequest(F({ new: 1 })), false);
  assert.equal(f.owner.attachSocket(F({ new: 2 })), false);
  assert.equal(f.calls.length, 0);
});
await scenario('invalid stop data is rejected before callbacks and inspection stays immutable', () => {
  const f = fixture(); attached(f);
  for (const kind of ['', 'UPPERCASE', 'with space', null, 42, 'x'.repeat(65)])
    assert.throws(() => f.owner.stop(kind), inputError);
  assert.throws(() => f.owner.stop('deadline', 'extra'), inputError);
  assert.equal(f.calls.length, 0); assert.equal(f.owner.canStartHandshake(), true);
  const before = f.owner.snapshot(); assert.ok(Object.isFrozen(before));
  assert.throws(() => { before.stopRequested = true; }, TypeError);
  f.owner.stop('deadline');
  assert.equal(before.stopRequested, false); assert.equal(f.owner.snapshot().stopRequested, true);
});
assert.equal(entered, 18); assert.equal(completed, 18);
console.log('# native-client-request-stop-component ' + JSON.stringify({
  entered, completed, declaredDestroyEntries, nativeClientImported: false,
  nativeBuiltinAliases: 0, sourceTransforms: 0, applicationSockets: 0, TLS: false,
  applicationTimers: 0, SDK: false, SQLite: false, nonce: false, signing: false,
  physicalDrainQualified: false, authority: 'NONE',
}));
