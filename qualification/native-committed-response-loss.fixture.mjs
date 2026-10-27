// SOURCE ONLY. Actual Node objects and the existing genuine HTTPS factory.
// No native prototype patch, replacement response, TLS bypass or extra server.
import { Socket } from 'node:net';
import { ServiceCreditSqliteStore } from '../src/service-credit-sqlite-store.js';
import { createCommittedResponseLossGate } from './committed-response-loss-gate.mjs';

const F = Object.freeze, A = Reflect.apply, DESTROY = Socket.prototype.destroy;
const STORE = ServiceCreditSqliteStore.prototype, READ = STORE.getOriginalRequestExecutionSnapshot;
const KEYS = F(['connection', 'secureConnection', 'request', 'checkContinue', 'checkExpectation',
  'upgrade', 'connect', 'clientError', 'tlsClientError', 'dropRequest', 'drop', 'timeout', 'listening', 'close', 'error']);
function require(value) { if (!value) throw new TypeError('NATIVE_COMMITTED_RESPONSE_LOSS_FIXTURE_REFUSED'); }
function singleHeader(request, name, expected) {
  const raw = request.rawHeaders;
  if (!Array.isArray(raw) || raw.length > 32 || raw.length % 2 !== 0) return false;
  let count = 0;
  for (let i = 0; i < raw.length; i += 2) {
    if (typeof raw[i] !== 'string' || typeof raw[i + 1] !== 'string') return false;
    if (raw[i].toLowerCase() === name) { if (raw[i + 1] !== expected) return false; count++; }
  }
  return count === 1;
}

export function createNativeCommittedResponseLossSelection(original, store) {
  require(arguments.length === 2 && typeof original.originalRequestJson === 'string');
  const expectedRequest = F(JSON.parse(original.originalRequestJson));
  const url = new URL(original.serviceResourceUrl);
  require(url.protocol === 'https:' && url.hostname === '127.0.0.1'
    && url.pathname === '/service-credit/v1/execute' && url.search === '' && url.hash === '');
  require(store !== null && Object.getPrototypeOf(store) === STORE && Reflect.ownKeys(store).length === 0);
  const gate = createCommittedResponseLossGate(F({ expectedRequest,
    readSnapshot: F(function readSnapshot() { return A(READ, store, [expectedRequest]); }),
    enqueue: F(function enqueue(callback) { queueMicrotask(callback); return undefined; }),
  }));
  return F({ gate, host: url.host, authorizationHeader: original.authorizationHeader });
}

export function wrapNativeCommittedResponseLossFactory(factory, readSelection) {
  require(arguments.length === 2 && typeof factory === 'function' && Object.isFrozen(factory)
    && typeof readSelection === 'function' && Object.isFrozen(readSelection));
  return F(function actualRequestFactory(options, callbacks) {
    require(arguments.length === 2 && Object.isFrozen(callbacks)
      && Reflect.ownKeys(callbacks).length === KEYS.length);
    const captured = {};
    for (const key of KEYS) { require(typeof callbacks[key] === 'function'); captured[key] = callbacks[key]; }
    const original = captured.request;
    captured.request = F(function actualRequest(request, response) {
      const selection = readSelection();
      if (selection !== null && request.method === 'POST' && request.url === '/service-credit/v1/execute'
          && singleHeader(request, 'host', selection.host)
          && singleHeader(request, 'authorization', selection.authorizationHeader)) {
        const socket = request.socket;
        require(Socket.prototype.isPrototypeOf(socket));
        const stop = F(function stopKnownResponseSocket() { A(DESTROY, socket, []); return undefined; });
        if (selection.gate.arm(stop)) {
          require(selection.gate.beginForward());
          try { return A(original, undefined, [request, response]); }
          catch (error) { selection.gate.refuse(); throw error; }
        }
      }
      return A(original, undefined, [request, response]);
    });
    return A(factory, undefined, [options, F(captured)]);
  });
}
