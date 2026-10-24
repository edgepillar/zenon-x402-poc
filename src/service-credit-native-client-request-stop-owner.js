import { types as utilTypes } from 'node:util';

const F = Object.freeze, DESC = Object.getOwnPropertyDescriptor, PROTO = Object.getPrototypeOf;
const KEYS = Reflect.ownKeys, OWN = Object.hasOwn, APPLY = Reflect.apply, IS_PROXY = utilTypes.isProxy;
const FIELDS = F(['destroyRequest', 'destroySocket']);

/**
 * Internal stop gate for ONE genuine native client's owned request/socket.
 * The actual adapter hardwires native destroy capabilities; component tests
 * supply declared callbacks, not fake native builtins or native drain proof.
 * This gate starts no request, socket, timer, retry, signer, SQL or SDK work.
 *
 * Claim each destroy BEFORE entry. Reentry/throws never authorize a second
 * call. A socket assigned after stop/request close is stopped immediately;
 * it never obtains a handshake permit. Both destroy attempts are independent.
 * Only real close observations release handle references. Destroy return,
 * a zero-reference snapshot or this DATA gate is not physical close evidence.
 * The caller MUST latch its outer close owner UNKNOWN before calling stop or
 * admitting a socket after request close. This helper supplies no close permit.
 */
export function createNativeHttpsClientRequestStopOwner(configuration) {
  if (arguments.length !== 1 || configuration === null || typeof configuration !== 'object'
      || IS_PROXY(configuration) || PROTO(configuration) !== Object.prototype
      || KEYS(configuration).length !== FIELDS.length) fail('configuration_rejected');
  const callbacks = {};
  for (const name of FIELDS) {
    const d = DESC(configuration, name);
    if (!d || !OWN(d, 'value') || !d.enumerable || typeof d.value !== 'function'
        || IS_PROXY(d.value) || PROTO(d.value) !== Function.prototype || !Object.isFrozen(d.value))
      fail('configuration_rejected');
    callbacks[name] = d.value;
  }
  const DESTROY_REQUEST = callbacks.destroyRequest, DESTROY_SOCKET = callbacks.destroySocket;
  configuration = null;
  let request = null, socket = null, requestSeen = false, socketSeen = false;
  let requestClosed = false, socketClosed = false, stopped = false, firstKind = null;
  let requestDestroyEntered = false, socketDestroyEntered = false;
  let requestDestroyOutcome = 'NOT_ENTERED', socketDestroyOutcome = 'NOT_ENTERED';

  function pump() {
    if (!stopped) return;
    if (request !== null && !requestClosed && !requestDestroyEntered) {
      requestDestroyEntered = true; requestDestroyOutcome = 'PENDING';
      const owned = request;
      try { APPLY(DESTROY_REQUEST, undefined, [owned, firstKind]); requestDestroyOutcome = 'RETURNED'; }
      catch { requestDestroyOutcome = 'UNKNOWN'; }
    }
    // A request destroy may reenter, close either handle, or attach the socket.
    // Always inspect the current source-owned association after it returns.
    if (socket !== null && !socketClosed && !socketDestroyEntered) {
      socketDestroyEntered = true; socketDestroyOutcome = 'PENDING';
      const owned = socket;
      try { APPLY(DESTROY_SOCKET, undefined, [owned]); socketDestroyOutcome = 'RETURNED'; }
      catch { socketDestroyOutcome = 'UNKNOWN'; }
    }
  }
  function stopWith(kind) {
    if (!stopped) { stopped = true; firstKind = kind; }
    pump();
  }
  const attachRequest = F(function attachRequest(handle) {
    if (arguments.length !== 1 || !opaqueHandle(handle)) fail('input_rejected');
    if (requestSeen || requestClosed) return false;
    requestSeen = true; request = handle; pump(); return true;
  });
  const attachSocket = F(function attachSocket(handle) {
    if (arguments.length !== 1 || !opaqueHandle(handle)) fail('input_rejected');
    if (socketSeen || socketClosed) return false;
    socketSeen = true; socket = handle;
    if (requestClosed && !stopped) stopWith('late_socket_after_request_close');
    else pump();
    return true;
  });
  const markRequestClosed = F(function markRequestClosed() {
    if (arguments.length !== 0) fail('input_rejected');
    requestClosed = true; request = null;
    return undefined;
  });
  const markSocketClosed = F(function markSocketClosed() {
    if (arguments.length !== 0) fail('input_rejected');
    socketClosed = true; socket = null;
    return undefined;
  });
  const stop = F(function stop(kind) {
    if (arguments.length !== 1 || typeof kind !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(kind))
      fail('input_rejected');
    stopWith(kind); return undefined;
  });
  const canStartHandshake = F(function canStartHandshake() {
    if (arguments.length !== 0) fail('input_rejected');
    return requestSeen && socketSeen && !stopped && !requestClosed && !socketClosed;
  });
  const snapshot = F(function snapshot() {
    if (arguments.length !== 0) fail('input_rejected');
    return F({ requestSeen, socketSeen, requestClosed, socketClosed, stopRequested: stopped,
      firstStopKind: firstKind, requestReferenceRetained: request !== null,
      socketReferenceRetained: socket !== null, requestDestroyEntered, socketDestroyEntered,
      requestDestroyOutcome, socketDestroyOutcome, handshakePermitted: canStartHandshake(),
      nativeHandleBrandAuthenticated: false, physicalDrain: 'NOT_ESTABLISHED', authority: 'NONE' });
  });
  return F({ attachRequest, attachSocket, markRequestClosed, markSocketClosed,
    stop, canStartHandshake, snapshot });
}
function opaqueHandle(value) {
  // Do not inspect properties/prototypes of the source-owned opaque handle.
  return typeof value === 'object' && value !== null && !IS_PROXY(value);
}
function fail(kind) {
  const code = 'service_credit_native_client_request_stop_' + kind, error = new TypeError(code);
  Object.defineProperty(error, 'code', { value: code, enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: ' + code });
  throw F(error);
}
