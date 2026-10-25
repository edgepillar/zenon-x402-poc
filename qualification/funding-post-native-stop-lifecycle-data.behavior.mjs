// Declared-handle DATA composition of the real stop, close and response owners.
// The native transport is not imported; these are not native event/close proofs.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createNativeHttpsClientRequestStopOwner as STOP }
  from '../src/service-credit-native-client-request-stop-owner.js';
import { createNativeHttpsClientCloseOwner as CLOSE }
  from '../src/service-credit-native-client-close-owner.js';
import { createFundingPostNativeResponseCustody as RESPONSE }
  from '../src/service-credit-funding-post-native-response.js';

if (process.versions.node !== '24.19.0'
    || process.env.X402_FUNDING_POST_STOP_DATA !== 'declared-funding-post-stop-lifecycle-v1') {
  throw new Error('EXPLICIT_FUNDING_POST_STOP_DATA_SELECTION');
}
const F = Object.freeze, cases = [];
async function check(name, run) { await run(); cases.push(name); }
function fixture(effects = {}) {
  const request = F({ synthetic: 'request' }), socket = F({ synthetic: 'socket' });
  const entries = new Set(), sockets = new Set(), calls = [], custody = RESPONSE();
  let closing = false, unknown = false, releases = 0, handshakeAdmissions = 0, tlsObservations = 0;
  let requestSeen = false, requestClosed = false, socketSeen = false, socketClosed = false;
  let closeResult = null, closePromise = null;
  const close = CLOSE({
    readObservedCounts: F(() => F({ requests: entries.size, sockets: sockets.size, timers: 0 })),
    releaseLocalMaterial: F(() => { releases++; }),
  });
  const stop = STOP({
    destroyRequest: F(handle => {
      calls.push(['request', handle]); effects.request?.(api); return undefined;
    }),
    destroySocket: F(handle => {
      // The host installs actual close tracking before passing this capability.
      assert(sockets.has(handle)); calls.push(['socket', handle]);
      effects.socket?.(api); return undefined;
    }),
  });
  function fail() {
    unknown = true; close.markUnknown(); custody.fail();
    stop.stop('funding_transport_unknown');
  }
  function event(fn) {
    if (unknown) return;
    try { fn(); } catch { fail(); }
  }
  function settle() {
    if (!requestClosed) return;
    if (!socketSeen) fail();
    else if (!socketClosed) return;
    entries.delete(request); close.observe();
  }
  const api = {
    request, socket, calls, custody, stop, close,
    attachRequest() {
      entries.add(request); requestSeen = true;
      assert.equal(stop.attachRequest(request), true);
    },
    attachSocket() {
      assert.equal(socketSeen, false);
      socketSeen = true; sockets.add(socket);
      if (requestClosed || closing || unknown) fail();
      assert.equal(stop.attachSocket(socket), true);
      if (!stop.canStartHandshake()) { close.observe(); return false; }
      handshakeAdmissions++; return true;
    },
    tls() {
      if (unknown) return false;
      if (!stop.canStartHandshake() || closing) { fail(); return false; }
      custody.acceptTls(); tlsObservations++; return true;
    },
    response() {
      custody.acceptHeaders({ statusCode: 200, rawHeaders: ['Content-Length', '2'] });
      custody.acceptChunk(Buffer.from('OK')); custody.acceptEnd();
    },
    requestClose() {
      assert(requestSeen); requestClosed = true; stop.markRequestClosed();
      event(() => custody.acceptRequestClose()); settle();
    },
    socketClose(hadError = false) {
      assert(socketSeen); socketClosed = true; stop.markSocketClosed(); sockets.delete(socket);
      event(() => custody.acceptSocketClose({ hadError })); settle();
    },
    abort: fail,
    beginClose() {
      if (closing) return closePromise;
      closing = true; closePromise = close.beginClose();
      closePromise.then(value => { closeResult = { ok: true, value }; },
        error => { closeResult = { ok: false, code: error.code }; });
      if (entries.size !== 0) fail();
      close.observe(); return closePromise;
    },
    snapshot() {
      return { unknown, releases, handshakeAdmissions, tlsObservations,
        entries: entries.size, sockets: sockets.size, closeResult,
        stop: stop.snapshot(), close: close.snapshot(), response: custody.snapshot() };
    },
  };
  return api;
}
async function unknownClose(f) {
  const p = f.beginClose();
  await assert.rejects(p, { code: 'service_credit_native_https_client_close_unknown' });
  assert.equal(f.snapshot().close.phase, 'CLOSE_UNKNOWN');
  return undefined;
}
function noResponse(f) {
  assert.throws(() => f.custody.takeResponse(), { code: 'FUNDING_POST_NATIVE_RESPONSE_UNAVAILABLE' });
}
function verifyUnknown(f) {
  const state = f.snapshot();
  assert.equal(state.unknown, true); assert.equal(state.response.unknown, true);
  assert.equal(state.stop.handshakePermitted, false);
}

await check('construction admits no work or response', () => {
  const f = fixture(), s = f.snapshot();
  assert.equal(s.entries, 0); assert.equal(s.sockets, 0); assert.equal(f.calls.length, 0);
  assert.equal(s.handshakeAdmissions, 0); assert.equal(s.releases, 0);
});
for (const order of ['request-first', 'socket-first']) {
  await check('normal_complete_response_' + order, async () => {
    const f = fixture(); f.attachRequest(); assert(f.attachSocket()); assert(f.tls()); f.response();
    if (order === 'request-first') { f.requestClose(); f.socketClose(); }
    else { f.socketClose(); f.requestClose(); }
    const data = f.custody.takeResponse();
    assert.equal(data.body.toString(), 'OK'); assert.equal(data.statusCode, 200); data.body.fill(0);
    await f.beginClose();
    const s = f.snapshot(); assert.equal(s.close.phase, 'CLOSED'); assert.equal(s.releases, 1);
    assert.equal(s.entries, 0); assert.equal(s.sockets, 0); assert.equal(f.calls.length, 0);
  });
}
await check('abort_before_any_association_stops_later_request_and_socket_once', () => {
  const f = fixture(); f.abort(); f.attachRequest(); assert.equal(f.attachSocket(), false);
  assert.deepEqual(f.calls, [['request', f.request], ['socket', f.socket]]);
  assert.equal(f.snapshot().handshakeAdmissions, 0); verifyUnknown(f); noResponse(f);
});
await check('abort_before_socket_never_grants_handshake_or_retries_destroy', () => {
  const f = fixture(); f.attachRequest(); f.abort(); assert.equal(f.attachSocket(), false);
  for (let i = 0; i < 16; i++) f.abort();
  assert.equal(f.calls.length, 2); assert.equal(f.snapshot().handshakeAdmissions, 0);
  assert.equal(f.tls(), false); assert.equal(f.snapshot().tlsObservations, 0); verifyUnknown(f);
});
await check('request_close_before_socket_stops_only_the_late_socket', () => {
  const f = fixture(); f.attachRequest(); f.requestClose();
  assert.equal(f.calls.length, 0); assert.equal(f.snapshot().entries, 0);
  assert.equal(f.attachSocket(), false);
  assert.deepEqual(f.calls, [['socket', f.socket]]);
  assert.equal(f.snapshot().sockets, 1); assert.equal(f.snapshot().handshakeAdmissions, 0);
  verifyUnknown(f); noResponse(f);
});
await check('request_close_without_socket_can_release_local_material_but_never_close_cleanly', async () => {
  const f = fixture(); f.attachRequest(); f.requestClose();
  await unknownClose(f);
  assert.equal(f.snapshot().releases, 1); assert.equal(f.snapshot().entries, 0);
  assert.equal(f.snapshot().close.osPhysicalDrain, 'NOT_ESTABLISHED');
});
await check('late_socket_after_unknown_settlement_is_tracked_without_releasing_twice', async () => {
  const f = fixture(); f.attachRequest(); f.requestClose(); await unknownClose(f);
  const original = f.beginClose(); assert.equal(f.attachSocket(), false);
  assert.equal(f.snapshot().sockets, 1); assert.equal(f.snapshot().releases, 1);
  f.socketClose(); f.close.observe(); await unknownClose(f);
  assert.equal(f.beginClose(), original); assert.equal(f.snapshot().releases, 1);
  assert.equal(f.snapshot().close.closePromiseOutcome, 'CLOSE_UNKNOWN');
});
for (const order of ['request-first', 'socket-first']) {
  await check('aborted_pair_retains_observed_ownership_until_both_close_' + order, async () => {
    const f = fixture(); f.attachRequest(); f.attachSocket(); f.abort(); const p = f.beginClose();
    await Promise.resolve(); assert.equal(f.snapshot().closeResult, null); assert.equal(f.snapshot().releases, 0);
    if (order === 'request-first') { f.requestClose(); assert.equal(f.snapshot().sockets, 1); f.socketClose(); }
    else { f.socketClose(); assert.equal(f.snapshot().entries, 1); f.requestClose(); }
    await assert.rejects(p); assert.equal(f.snapshot().releases, 1);
    assert.equal(f.calls.length, 2); verifyUnknown(f); noResponse(f);
  });
}
await check('close_before_socket_stops_late_assignment_and_stays_unknown', async () => {
  const f = fixture(); f.attachRequest(); const p = f.beginClose();
  assert.equal(f.attachSocket(), false); assert.equal(f.snapshot().handshakeAdmissions, 0);
  f.requestClose(); f.socketClose(); await assert.rejects(p);
  assert.equal(f.calls.length, 2); assert.equal(f.snapshot().releases, 1); verifyUnknown(f);
});
await check('request_destroy_reentry_does_not_acquire_a_second_claim', () => {
  const f = fixture({ request: owner => owner.abort() }); f.attachRequest(); f.attachSocket(); f.abort();
  assert.equal(f.calls.length, 2); assert.equal(f.snapshot().stop.requestDestroyOutcome, 'RETURNED');
  verifyUnknown(f);
});
await check('socket_assignment_during_request_destroy_is_tracked_and_stopped_before_return', () => {
  const f = fixture({ request: owner => assert.equal(owner.attachSocket(), false) });
  f.attachRequest(); f.abort();
  assert.deepEqual(f.calls, [['request', f.request], ['socket', f.socket]]);
  assert.equal(f.snapshot().handshakeAdmissions, 0); verifyUnknown(f);
});
await check('request_destroy_throw_still_stops_socket_without_retry', () => {
  const f = fixture({ request: () => { throw new Error('DECLARED_REQUEST_STOP_THROW'); } });
  f.attachRequest(); f.attachSocket(); f.abort(); f.abort();
  assert.equal(f.calls.length, 2); assert.equal(f.snapshot().stop.requestDestroyOutcome, 'UNKNOWN');
  assert.equal(f.snapshot().stop.socketDestroyOutcome, 'RETURNED'); verifyUnknown(f);
});
await check('socket_destroy_throw_stays_unknown_without_retry', () => {
  const f = fixture({ socket: () => { throw new Error('DECLARED_SOCKET_STOP_THROW'); } });
  f.attachRequest(); f.attachSocket(); f.abort(); f.abort();
  assert.equal(f.calls.length, 2); assert.equal(f.snapshot().stop.socketDestroyOutcome, 'UNKNOWN');
  assert.equal(f.snapshot().sockets, 1); verifyUnknown(f);
});
await check('synchronous_close_observations_during_destroy_release_no_live_handle', async () => {
  const f = fixture({ request: owner => owner.requestClose(), socket: owner => owner.socketClose() });
  f.attachRequest(); f.attachSocket(); f.abort(); await unknownClose(f);
  assert.equal(f.snapshot().entries, 0); assert.equal(f.snapshot().sockets, 0);
  assert.equal(f.snapshot().releases, 1); assert.equal(f.calls.length, 2);
});
await check('socket_closed_before_stop_is_not_destroyed_again', () => {
  const f = fixture(); f.attachRequest(); f.attachSocket(); f.tls(); f.response(); f.socketClose(); f.abort();
  assert.deepEqual(f.calls, [['request', f.request]]); assert.equal(f.snapshot().sockets, 0);
});
await check('closed_request_is_not_destroyed_again_while_socket_remains_owned', () => {
  const f = fixture(); f.attachRequest(); f.attachSocket(); f.tls(); f.response(); f.requestClose(); f.abort();
  assert.deepEqual(f.calls, [['socket', f.socket]]); assert.equal(f.snapshot().sockets, 1);
});
await check('late_tls_after_socket_close_obtains_no_new_authentication', () => {
  const f = fixture(); f.attachRequest(); f.attachSocket(); f.tls(); f.response(); f.socketClose();
  assert.equal(f.tls(), false); assert.equal(f.snapshot().tlsObservations, 1); verifyUnknown(f);
});
await check('partial_response_then_abort_never_exposes_body', () => {
  const f = fixture(); f.attachRequest(); f.attachSocket(); f.tls();
  f.custody.acceptHeaders({ statusCode: 200, rawHeaders: ['Content-Length', '2'] });
  f.custody.acceptChunk(Buffer.from('O')); f.abort(); noResponse(f); verifyUnknown(f);
});
await check('errored_socket_close_cannot_become_a_complete_response', () => {
  const f = fixture(); f.attachRequest(); f.attachSocket(); f.tls(); f.response();
  f.socketClose(true); f.requestClose(); noResponse(f); verifyUnknown(f);
});
await check('deadline_verdict_is_not_repaired_by_late_pair_drain', async () => {
  const f = fixture(); f.attachRequest(); f.attachSocket(); const p = f.beginClose();
  f.close.deadlineExpired(); await assert.rejects(p); assert.equal(f.snapshot().releases, 0);
  f.requestClose(); f.socketClose(); f.close.observe();
  assert.equal(f.snapshot().close.closePromiseOutcome, 'CLOSE_UNKNOWN');
  assert.equal(f.snapshot().releases, 1); verifyUnknown(f);
});
await check('response_handoff_requires_both_observed_close_events', () => {
  const f = fixture(); f.attachRequest(); f.attachSocket(); f.tls(); f.response(); f.requestClose();
  noResponse(f); f.abort(); f.socketClose(); verifyUnknown(f);
});
await check('component_exposes_no_retry_signer_store_or_dispatch_capability', () => {
  const f = fixture();
  for (const name of ['retry', 'sign', 'dispatch', 'store', 'reopen', 'fetchImpl'])
    assert.equal(Object.hasOwn(f.stop, name), false);
  assert.equal(f.stop.snapshot().physicalDrain, 'NOT_ESTABLISHED');
  assert.equal(f.close.snapshot().authority, 'NONE');
});
assert.equal(cases.length, 24); assert.equal(new Set(cases).size, cases.length);
console.log(JSON.stringify({ event: 'FUNDING_POST_STOP_LIFECYCLE_DECLARED_DATA_COMPOSITION',
  successful: true, selectedCases: cases.length, cases,
  actualStopCloseResponseOwners: true, declaredHandlesAndCallbacks: true,
  nativeTransportImported: false, nativeBuiltinAliases: 0, sourceTransforms: 0,
  SDK: false, SQLite: false, keysSignaturesNonce: false, sockets: 0, productTimers: 0,
  children: 0, nativeEventProvenance: 'NOT_ESTABLISHED', nativePhysicalDrain: 'NOT_ESTABLISHED',
  nativeAdapterQualified: false, authority: 'NONE' }));
