import { createServer } from 'node:http';
import { types as utilTypes } from 'node:util';

import { SERVICE_CREDIT_HTTP_PATH } from './service-credit-http.js';

const BIND_ADDRESS = '127.0.0.1';
const MAX_HEADER_BYTES = 2_048;
const MAX_HEADER_COUNT = 8;
const MAX_CONNECTIONS = 8;
const MAX_REQUESTS_PER_SOCKET = 1;
const LISTEN_BACKLOG = 8;
const HEADERS_TIMEOUT_MS = 2_000;
const REQUEST_TIMEOUT_MS = 3_000;
const SOCKET_INACTIVITY_TIMEOUT_MS = 5_000;
const STARTUP_DEADLINE_MS = 2_000;
const SHUTDOWN_GRACE_MS = 500;
const SHUTDOWN_PROOF_TIMEOUT_MS = 250;
const CONNECTION_CHECK_INTERVAL_MS = 250;

const INVALID_CONFIGURATION = 'SERVICE_CREDIT_LOOPBACK_INVALID_CONFIGURATION';
const INVALID_INVOCATION = 'SERVICE_CREDIT_LOOPBACK_INVALID_INVOCATION';
const START_FAILED = 'SERVICE_CREDIT_LOOPBACK_START_FAILED';
const UNAVAILABLE = 'SERVICE_CREDIT_LOOPBACK_UNAVAILABLE';
const CLOSE_UNCERTAIN = 'SERVICE_CREDIT_LOOPBACK_CLOSE_UNCERTAIN';

const STATE = Object.freeze({
  NEW: 'NEW',
  STARTING: 'STARTING',
  STARTED: 'STARTED',
  CLOSING: 'CLOSING',
  CLOSED: 'CLOSED',
  QUARANTINED: 'QUARANTINED',
});

const PRIVATE_HEADERS = Object.freeze({
  'Cache-Control': 'private, no-store, max-age=0',
  'Content-Type': 'application/json',
  Vary: 'Authorization',
  'X-Content-Type-Options': 'nosniff',
  Connection: 'close',
});

const BODY = Object.freeze({
  badRequest: Buffer.from('{"error":"invalid_request"}', 'utf8'),
  unavailable: Buffer.from('{"error":"service_unavailable"}', 'utf8'),
});

const REFLECT_APPLY = Reflect.apply;
const GET_OWN_PROPERTY_DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Reflect.getPrototypeOf;
const OWN_KEYS = Reflect.ownKeys;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_HAS_OWN = Object.hasOwn;
const OBJECT_PROTOTYPE = Object.prototype;
const IS_PROXY = utilTypes.isProxy;

class ServiceCreditLoopbackError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ServiceCreditLoopbackError';
    this.code = code;
    this.stack = `ServiceCreditLoopbackError: ${code}`;
  }
}

function failure(code) {
  return new ServiceCreditLoopbackError(code);
}

function rejected(code) {
  const promise = Promise.reject(failure(code));
  void promise.catch(() => {});
  return promise;
}

function promiseCapability() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  void promise.catch(() => {});
  return OBJECT_FREEZE({ promise, resolve, reject });
}

function captureConfiguration(value) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || Array.isArray(value)
      || IS_PROXY(value)
      || GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE
    ) {
      throw failure(INVALID_CONFIGURATION);
    }
    const keys = OWN_KEYS(value);
    if (keys.length !== 1 || keys[0] !== 'handler') {
      throw failure(INVALID_CONFIGURATION);
    }
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, 'handler');
    if (
      !descriptor?.enumerable
      || !OBJECT_HAS_OWN(descriptor, 'value')
      || typeof descriptor.value !== 'function'
      || IS_PROXY(descriptor.value)
    ) {
      throw failure(INVALID_CONFIGURATION);
    }
    return descriptor.value;
  } catch (error) {
    if (error instanceof ServiceCreditLoopbackError) throw error;
    throw failure(INVALID_CONFIGURATION);
  }
}

function timer(milliseconds) {
  let handle;
  const promise = new Promise(resolve => {
    handle = setTimeout(() => resolve(false), milliseconds);
  });
  return OBJECT_FREEZE({
    promise,
    clear() {
      if (handle !== undefined) {
        clearTimeout(handle);
        handle = undefined;
      }
    },
  });
}

function writeSocketResponse(socket, statusLine, body) {
  try {
    if (socket.destroyed) return;
    const response = Buffer.from(
      `HTTP/1.1 ${statusLine}\r\n`
      + `Cache-Control: ${PRIVATE_HEADERS['Cache-Control']}\r\n`
      + `Content-Type: ${PRIVATE_HEADERS['Content-Type']}\r\n`
      + `Vary: ${PRIVATE_HEADERS.Vary}\r\n`
      + `X-Content-Type-Options: ${PRIVATE_HEADERS['X-Content-Type-Options']}\r\n`
      + 'Connection: close\r\n'
      + `Content-Length: ${body.length}\r\n\r\n`,
      'ascii',
    );
    socket.end(Buffer.concat([response, body]));
  } catch {
    try { socket.destroy(); } catch {}
  }
}

function sendResponse(response, statusCode, body) {
  try {
    if (response.destroyed || response.writableEnded) return;
    response.statusCode = statusCode;
    response.sendDate = false;
    response.shouldKeepAlive = false;
    for (const [name, value] of Object.entries(PRIVATE_HEADERS)) {
      response.setHeader(name, value);
    }
    response.setHeader('Content-Length', body.length);
    response.end(body);
  } catch {
    try { response.destroy(); } catch {}
  }
}

function exactRawHeaderCount(request) {
  try {
    const rawHeaders = request.rawHeaders;
    if (!Array.isArray(rawHeaders) || rawHeaders.length % 2 !== 0) return null;
    for (let index = 0; index < rawHeaders.length; index += 1) {
      if (typeof rawHeaders[index] !== 'string') return null;
    }
    return rawHeaders.length / 2;
  } catch {
    return null;
  }
}

function hasRawHeader(request, wantedName) {
  try {
    const rawHeaders = request.rawHeaders;
    if (!Array.isArray(rawHeaders) || rawHeaders.length % 2 !== 0) return true;
    for (let index = 0; index < rawHeaders.length; index += 2) {
      if (rawHeaders[index].toLowerCase() === wantedName) return true;
    }
    return false;
  } catch {
    return true;
  }
}

function destroySocket(socket) {
  try { socket.destroy(); } catch {}
}

function safeUnref(server) {
  try { server.unref(); } catch {}
}

/**
 * Owns one explicitly started, process-local IPv4 loopback listener around a
 * trusted caller-supplied handler. It owns only transport lifecycle. It does
 * not own or close the handler's store and it does not cancel handler work.
 */
export function createServiceCreditLoopbackServer(options) {
  if (arguments.length !== 1) throw failure(INVALID_CONFIGURATION);
  const handler = captureConfiguration(options);

  let state = STATE.NEW;
  let server = null;
  let descriptor = null;
  let startCapability = null;
  let closeCapability = null;
  let shutdownStarted = false;
  let serverCloseCalled = false;
  let listeningObserved = false;
  let startupDeadlineHandle = null;
  const sockets = new Set();
  const usedSockets = new WeakSet();
  const activeHandlers = new Set();
  const activeWaiters = new Set();
  const socketWaiters = new Set();

  function settleActiveWaiters() {
    if (activeHandlers.size !== 0) return;
    for (const resolve of activeWaiters) {
      try { resolve(true); } catch {}
    }
    activeWaiters.clear();
  }

  function waitForHandlers() {
    if (activeHandlers.size === 0) return Promise.resolve(true);
    return new Promise(resolve => activeWaiters.add(resolve));
  }

  function settleSocketWaiters() {
    if (sockets.size !== 0) return;
    for (const resolve of socketWaiters) {
      try { resolve(true); } catch {}
    }
    socketWaiters.clear();
  }

  function waitForSockets() {
    if (sockets.size === 0) return Promise.resolve(true);
    return new Promise(resolve => socketWaiters.add(resolve));
  }

  function destroyOwnedSockets() {
    for (const socket of sockets) destroySocket(socket);
  }

  function listenerIsAbsent() {
    try {
      return server !== null && server.listening === false && server.address() === null;
    } catch {
      return false;
    }
  }

  function clearStartupDeadline() {
    if (startupDeadlineHandle === null) return;
    clearTimeout(startupDeadlineHandle);
    startupDeadlineHandle = null;
  }

  function ensureCloseCapability() {
    if (closeCapability === null) closeCapability = promiseCapability();
    return closeCapability;
  }

  function markQuarantined() {
    state = STATE.QUARANTINED;
  }

  async function performShutdown(quarantinedAtEntry) {
    const serverClosed = promiseCapability();
    let closeCallbackObserved = false;
    let closeCallbackClean = false;

    if (server === null) {
      if (quarantinedAtEntry) throw failure(CLOSE_UNCERTAIN);
      state = STATE.CLOSED;
      return;
    }

    if (!serverCloseCalled) {
      serverCloseCalled = true;
      try {
        server.close(error => {
          closeCallbackObserved = true;
          closeCallbackClean = error === undefined || listenerIsAbsent();
          serverClosed.resolve(true);
        });
      } catch {
        closeCallbackObserved = true;
        closeCallbackClean = listenerIsAbsent();
        serverClosed.resolve(true);
      }
    }
    try { server.closeIdleConnections(); } catch { markQuarantined(); }

    const grace = timer(SHUTDOWN_GRACE_MS);
    const handlersSettled = await Promise.race([waitForHandlers(), grace.promise]);
    grace.clear();
    if (handlersSettled !== true || activeHandlers.size !== 0) {
      markQuarantined();
      destroyOwnedSockets();
      try { server.closeAllConnections(); } catch {}
      safeUnref(server);
      throw failure(CLOSE_UNCERTAIN);
    }

    destroyOwnedSockets();
    try { server.closeAllConnections(); } catch { markQuarantined(); }
    const proof = timer(SHUTDOWN_PROOF_TIMEOUT_MS);
    const closeObserved = await Promise.race([
      Promise.all([serverClosed.promise, waitForSockets()]).then(() => true),
      proof.promise,
    ]);
    proof.clear();
    safeUnref(server);

    if (
      quarantinedAtEntry
      || state === STATE.QUARANTINED
      || closeObserved !== true
      || !closeCallbackObserved
      || !closeCallbackClean
      || !listenerIsAbsent()
      || sockets.size !== 0
      || activeHandlers.size !== 0
    ) {
      markQuarantined();
      throw failure(CLOSE_UNCERTAIN);
    }
    state = STATE.CLOSED;
  }

  function beginShutdown(quarantinedAtEntry = state === STATE.QUARANTINED) {
    const capability = ensureCloseCapability();
    if (shutdownStarted) return capability.promise;
    shutdownStarted = true;
    void performShutdown(quarantinedAtEntry).then(
      () => capability.resolve(),
      () => {
        markQuarantined();
        capability.reject(failure(CLOSE_UNCERTAIN));
      },
    );
    return capability.promise;
  }

  function quarantineTransport() {
    markQuarantined();
    void beginShutdown(true).catch(() => {});
  }

  function observeHandler(operation, response) {
    void operation.then(
      () => {
        activeHandlers.delete(operation);
        if (!response.destroyed && !response.writableEnded) {
          sendResponse(response, 503, BODY.unavailable);
          quarantineTransport();
        }
        settleActiveWaiters();
      },
      () => {
        activeHandlers.delete(operation);
        sendResponse(response, 503, BODY.unavailable);
        quarantineTransport();
        settleActiveWaiters();
      },
    ).catch(() => {
      activeHandlers.delete(operation);
      quarantineTransport();
      settleActiveWaiters();
    });
  }

  function invokeHandler(request, response) {
    const operation = Promise.resolve().then(() => REFLECT_APPLY(
      handler,
      undefined,
      [request, response],
    ));
    activeHandlers.add(operation);
    observeHandler(operation, response);
  }

  function requestListener(request, response) {
    const socket = request.socket;
    response.sendDate = false;
    if (state !== STATE.STARTED) {
      sendResponse(response, 503, BODY.unavailable);
      return;
    }
    const headerCount = exactRawHeaderCount(request);
    if (
      headerCount === null
      || headerCount > MAX_HEADER_COUNT
      || hasRawHeader(request, 'expect')
      || hasRawHeader(request, 'upgrade')
      || request.method === 'CONNECT'
    ) {
      sendResponse(response, 400, BODY.badRequest);
      return;
    }
    if (usedSockets.has(socket)) {
      sendResponse(response, 503, BODY.unavailable);
      return;
    }
    usedSockets.add(socket);
    response.shouldKeepAlive = false;
    try { response.setHeader('Connection', 'close'); } catch {
      sendResponse(response, 503, BODY.unavailable);
      quarantineTransport();
      return;
    }
    invokeHandler(request, response);
  }

  function configureServer(created) {
    created.maxHeadersCount = MAX_HEADER_COUNT;
    created.maxConnections = MAX_CONNECTIONS;
    created.maxRequestsPerSocket = MAX_REQUESTS_PER_SOCKET;
    created.headersTimeout = HEADERS_TIMEOUT_MS;
    created.requestTimeout = REQUEST_TIMEOUT_MS;
    created.setTimeout(SOCKET_INACTIVITY_TIMEOUT_MS, socket => destroySocket(socket));

    created.on('connection', socket => {
      sockets.add(socket);
      socket.once('close', () => {
        sockets.delete(socket);
        settleSocketWaiters();
      });
      socket.on('error', () => {});
    });
    created.on('checkContinue', (_request, response) => {
      sendResponse(response, 400, BODY.badRequest);
    });
    created.on('checkExpectation', (_request, response) => {
      sendResponse(response, 400, BODY.badRequest);
    });
    created.on('upgrade', (_request, socket) => {
      writeSocketResponse(socket, '400 Bad Request', BODY.badRequest);
    });
    created.on('connect', (_request, socket) => {
      writeSocketResponse(socket, '400 Bad Request', BODY.badRequest);
    });
    created.on('clientError', (_error, socket) => {
      writeSocketResponse(socket, '400 Bad Request', BODY.badRequest);
    });
    created.on('error', () => {
      if (!listeningObserved) {
        clearStartupDeadline();
        startCapability?.reject(failure(START_FAILED));
      }
      quarantineTransport();
    });
    created.on('close', () => {
      if (!shutdownStarted && state === STATE.STARTED) quarantineTransport();
    });
  }

  const start = OBJECT_FREEZE(function startServiceCreditLoopbackServer() {
    if (arguments.length !== 0) return rejected(INVALID_INVOCATION);
    if (state === STATE.STARTING) return startCapability.promise;
    if (state === STATE.STARTED) return startCapability.promise;
    if (state !== STATE.NEW) return rejected(UNAVAILABLE);

    state = STATE.STARTING;
    startCapability = promiseCapability();
    try {
      server = createServer({
        maxHeaderSize: MAX_HEADER_BYTES,
        insecureHTTPParser: false,
        requireHostHeader: true,
        joinDuplicateHeaders: false,
        rejectNonStandardBodyWrites: true,
        connectionsCheckingInterval: CONNECTION_CHECK_INTERVAL_MS,
      }, requestListener);
      configureServer(server);
      startupDeadlineHandle = setTimeout(() => {
        startupDeadlineHandle = null;
        if (state !== STATE.STARTING) return;
        startCapability.reject(failure(START_FAILED));
        markQuarantined();
        destroyOwnedSockets();
        safeUnref(server);
        void beginShutdown(true).catch(() => {});
      }, STARTUP_DEADLINE_MS);
      server.listen({
        host: BIND_ADDRESS,
        port: 0,
        exclusive: true,
        reusePort: false,
        backlog: LISTEN_BACKLOG,
      }, () => {
        try {
          clearStartupDeadline();
          listeningObserved = true;
          if (state !== STATE.STARTING) {
            startCapability.reject(failure(UNAVAILABLE));
            void beginShutdown(state === STATE.QUARANTINED).catch(() => {});
            return;
          }
          const address = server.address();
          if (
            address === null
            || typeof address !== 'object'
            || address.address !== BIND_ADDRESS
            || address.family !== 'IPv4'
            || !Number.isSafeInteger(address.port)
            || address.port < 1
            || address.port > 65_535
          ) {
            throw failure(START_FAILED);
          }
          descriptor = OBJECT_FREEZE({
            origin: `http://${BIND_ADDRESS}:${address.port}`,
            path: SERVICE_CREDIT_HTTP_PATH,
          });
          state = STATE.STARTED;
          startCapability.resolve(descriptor);
        } catch {
          startCapability.reject(failure(START_FAILED));
          quarantineTransport();
        }
      });
    } catch {
      clearStartupDeadline();
      startCapability.reject(failure(START_FAILED));
      quarantineTransport();
    }
    return startCapability.promise;
  });

  const close = OBJECT_FREEZE(function closeServiceCreditLoopbackServer() {
    if (arguments.length !== 0) return rejected(INVALID_INVOCATION);
    if (closeCapability !== null) return closeCapability.promise;
    const capability = ensureCloseCapability();
    if (state === STATE.NEW) {
      state = STATE.CLOSING;
      state = STATE.CLOSED;
      capability.resolve();
      return capability.promise;
    }
    if (state === STATE.STARTING) {
      state = STATE.CLOSING;
      clearStartupDeadline();
      startCapability.reject(failure(UNAVAILABLE));
      return beginShutdown(false);
    }
    if (state === STATE.STARTED) state = STATE.CLOSING;
    if (state === STATE.CLOSING || state === STATE.QUARANTINED) {
      return beginShutdown(state === STATE.QUARANTINED);
    }
    return capability.promise;
  });

  return OBJECT_FREEZE({ start, close });
}
