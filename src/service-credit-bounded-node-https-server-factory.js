import { EventEmitter } from 'node:events';
import { createServer as createNativeHttpsServer, Server as NativeHttpsServer } from 'node:https';
import { types as utilTypes } from 'node:util';

const NATIVE_ARRAY = Array;
const ARRAY_IS_ARRAY = NATIVE_ARRAY.isArray;
const ARRAY_PROTOTYPE = NATIVE_ARRAY.prototype;
const ARRAY_PUSH = ARRAY_PROTOTYPE.push;
const NATIVE_ARRAY_BUFFER = ArrayBuffer;
const ARRAY_BUFFER_PROTOTYPE = NATIVE_ARRAY_BUFFER.prototype;
const NATIVE_BUFFER = Buffer;
const BUFFER_ALLOC = NATIVE_BUFFER.alloc;
const BUFFER_IS_BUFFER = NATIVE_BUFFER.isBuffer;
const BUFFER_PROTOTYPE = NATIVE_BUFFER.prototype;
const BUFFER_FILL = BUFFER_PROTOTYPE.fill;
const NATIVE_UINT8_ARRAY = Uint8Array;
const UINT8_ARRAY_PROTOTYPE = NATIVE_UINT8_ARRAY.prototype;
const NATIVE_NUMBER = Number;
const NUMBER_IS_SAFE_INTEGER = NATIVE_NUMBER.isSafeInteger;
const NATIVE_OBJECT = Object;
const OBJECT_CREATE = NATIVE_OBJECT.create;
const OBJECT_DEFINE_PROPERTY = NATIVE_OBJECT.defineProperty;
const OBJECT_FREEZE = NATIVE_OBJECT.freeze;
const OBJECT_HAS_OWN = NATIVE_OBJECT.hasOwn;
const OBJECT_IS_FROZEN = NATIVE_OBJECT.isFrozen;
const OBJECT_PROTOTYPE = NATIVE_OBJECT.prototype;
const NATIVE_REFLECT = Reflect;
const REFLECT_APPLY = NATIVE_REFLECT.apply;
const REFLECT_GET = NATIVE_REFLECT.get;
const REFLECT_GET_OWN_PROPERTY_DESCRIPTOR = NATIVE_REFLECT.getOwnPropertyDescriptor;
const REFLECT_GET_PROTOTYPE_OF = NATIVE_REFLECT.getPrototypeOf;
const REFLECT_OWN_KEYS = NATIVE_REFLECT.ownKeys;
const REFLECT_SET = NATIVE_REFLECT.set;
const NATIVE_REGEXP = RegExp;
const REGEXP_EXEC = NATIVE_REGEXP.prototype.exec;
const NATIVE_TYPE_ERROR = TypeError;
const IS_PROXY = utilTypes.isProxy;
const EVENT_EMITTER_ON = EventEmitter.prototype.on;
const EVENT_EMITTER_REMOVE_LISTENER = EventEmitter.prototype.removeListener;
const CREATE_NATIVE_HTTPS_SERVER = createNativeHttpsServer;
const NATIVE_HTTPS_SERVER_PROTOTYPE = NativeHttpsServer.prototype;
const TYPED_ARRAY_PROTOTYPE = REFLECT_APPLY(
  REFLECT_GET_PROTOTYPE_OF,
  NATIVE_REFLECT,
  [UINT8_ARRAY_PROTOTYPE],
);

const CONFIGURATION_KEYS = OBJECT_FREEZE(['bind', 'tlsMaterial']);
const BIND_KEYS = OBJECT_FREEZE(['host', 'port', 'exclusive']);
const TLS_MATERIAL_KEYS = OBJECT_FREEZE(['key', 'cert']);
const SERVER_OPTION_KEYS = OBJECT_FREEZE([
  'minVersion',
  'maxVersion',
  'ALPNProtocols',
  'requestCert',
  'handshakeTimeout',
  'maxHeaderSize',
  'insecureHTTPParser',
  'requireHostHeader',
  'joinDuplicateHeaders',
  'rejectNonStandardBodyWrites',
  'headersTimeout',
  'requestTimeout',
  'keepAliveTimeout',
  'maxHeadersCount',
  'maxRequestsPerSocket',
  'maxConnections',
  'timeout',
]);
const SERVER_CALLBACK_KEYS = OBJECT_FREEZE([
  'connection',
  'secureConnection',
  'request',
  'checkContinue',
  'checkExpectation',
  'upgrade',
  'connect',
  'clientError',
  'tlsClientError',
  'dropRequest',
  'drop',
  'timeout',
  'listening',
  'close',
  'error',
]);
const SERVER_CAPABILITY_KEYS = OBJECT_FREEZE([
  'listen',
  'close',
  'closeAllConnections',
]);

const HOST = /^[A-Za-z0-9.:[\]-]+$/;
const MAX_HOST_BYTES = 255;
const MAX_TLS_MATERIAL_BYTES = 1024 * 1024;
const MAX_HEADER_BYTES = 65_536;
const MAX_HEADER_COUNT = 256;
const MAX_CONCURRENT_CONNECTIONS = 10_000;
const MAX_DEADLINE_MS = 60_000;
const MAX_PROTOTYPE_DEPTH = 32;

const CODE = OBJECT_FREEZE({
  unsupportedRuntime:
    'SERVICE_CREDIT_BOUNDED_NODE_HTTPS_SERVER_FACTORY_UNSUPPORTED_RUNTIME',
  invalidConfiguration:
    'SERVICE_CREDIT_BOUNDED_NODE_HTTPS_SERVER_FACTORY_INVALID_CONFIGURATION',
  invalidInvocation:
    'SERVICE_CREDIT_BOUNDED_NODE_HTTPS_SERVER_FACTORY_INVALID_INVOCATION',
  alreadyUsed:
    'SERVICE_CREDIT_BOUNDED_NODE_HTTPS_SERVER_FACTORY_ALREADY_USED',
  constructionFailed:
    'SERVICE_CREDIT_BOUNDED_NODE_HTTPS_SERVER_FACTORY_NATIVE_CONSTRUCTION_FAILED',
  setupFailed:
    'SERVICE_CREDIT_BOUNDED_NODE_HTTPS_SERVER_FACTORY_NATIVE_SETUP_FAILED',
  listenFailed:
    'SERVICE_CREDIT_BOUNDED_NODE_HTTPS_SERVER_FACTORY_LISTEN_FAILED',
  closeFailed:
    'SERVICE_CREDIT_BOUNDED_NODE_HTTPS_SERVER_FACTORY_CLOSE_FAILED',
  closeAllFailed:
    'SERVICE_CREDIT_BOUNDED_NODE_HTTPS_SERVER_FACTORY_CLOSE_ALL_CONNECTIONS_FAILED',
});

function capturePrototypeFunction(prototype, name) {
  let current = prototype;
  for (let depth = 0; current !== null && depth < MAX_PROTOTYPE_DEPTH; depth += 1) {
    const descriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [current, name],
    );
    if (descriptor !== undefined) {
      if (!OBJECT_HAS_OWN(descriptor, 'value') || typeof descriptor.value !== 'function') {
        throw failure(CODE.unsupportedRuntime);
      }
      return descriptor.value;
    }
    current = REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, NATIVE_REFLECT, [current]);
  }
  throw failure(CODE.unsupportedRuntime);
}

function capturePrototypeGetter(prototype, name) {
  const descriptor = REFLECT_APPLY(
    REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
    NATIVE_REFLECT,
    [prototype, name],
  );
  if (descriptor === undefined || typeof descriptor.get !== 'function') {
    throw failure(CODE.unsupportedRuntime);
  }
  return descriptor.get;
}

const SERVER_LISTEN = capturePrototypeFunction(NATIVE_HTTPS_SERVER_PROTOTYPE, 'listen');
const SERVER_CLOSE = capturePrototypeFunction(NATIVE_HTTPS_SERVER_PROTOTYPE, 'close');
const SERVER_CLOSE_ALL_CONNECTIONS = capturePrototypeFunction(
  NATIVE_HTTPS_SERVER_PROTOTYPE,
  'closeAllConnections',
);
const SERVER_SET_TIMEOUT = capturePrototypeFunction(
  NATIVE_HTTPS_SERVER_PROTOTYPE,
  'setTimeout',
);
const TYPED_ARRAY_BUFFER_GETTER = capturePrototypeGetter(
  TYPED_ARRAY_PROTOTYPE,
  'buffer',
);
const TYPED_ARRAY_BYTE_LENGTH_GETTER = capturePrototypeGetter(
  TYPED_ARRAY_PROTOTYPE,
  'byteLength',
);
const TYPED_ARRAY_LENGTH_GETTER = capturePrototypeGetter(
  TYPED_ARRAY_PROTOTYPE,
  'length',
);
const TYPED_ARRAY_SET = capturePrototypeFunction(TYPED_ARRAY_PROTOTYPE, 'set');

function failure(code) {
  const error = new NATIVE_TYPE_ERROR(code);
  OBJECT_DEFINE_PROPERTY(error, 'code', {
    value: code,
    enumerable: true,
    writable: false,
    configurable: false,
  });
  OBJECT_DEFINE_PROPERTY(error, 'stack', {
    value: `TypeError: ${code}`,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return OBJECT_FREEZE(error);
}

function allowedKey(expected, candidate) {
  if (typeof candidate !== 'string') return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index] === candidate) return true;
  }
  return false;
}

function exactDataObject(value, expected, requireFrozen = false) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || REFLECT_APPLY(ARRAY_IS_ARRAY, NATIVE_ARRAY, [value])
      || REFLECT_APPLY(IS_PROXY, undefined, [value])
      || REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, NATIVE_REFLECT, [value])
        !== OBJECT_PROTOTYPE
      || (requireFrozen
        && !REFLECT_APPLY(OBJECT_IS_FROZEN, NATIVE_OBJECT, [value]))
    ) return null;
    const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, NATIVE_REFLECT, [value]);
    if (keys.length !== expected.length) return null;
    const captured = REFLECT_APPLY(OBJECT_CREATE, NATIVE_OBJECT, [null]);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (!allowedKey(expected, key)) return null;
      const descriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        NATIVE_REFLECT,
        [value, key],
      );
      if (
        descriptor === undefined
        || descriptor.enumerable !== true
        || !OBJECT_HAS_OWN(descriptor, 'value')
      ) return null;
      captured[key] = descriptor.value;
    }
    for (let index = 0; index < expected.length; index += 1) {
      if (!OBJECT_HAS_OWN(captured, expected[index])) return null;
    }
    return captured;
  } catch {
    return null;
  }
}

function safeCallable(value, requireFrozen = false) {
  try {
    return typeof value === 'function'
      && !REFLECT_APPLY(IS_PROXY, undefined, [value])
      && (!requireFrozen
        || REFLECT_APPLY(OBJECT_IS_FROZEN, NATIVE_OBJECT, [value]));
  } catch {
    return false;
  }
}

function boundedInteger(value, minimum, maximum) {
  return NUMBER_IS_SAFE_INTEGER(value) && value >= minimum && value <= maximum;
}

function regexpMatches(expression, value) {
  return REFLECT_APPLY(REGEXP_EXEC, expression, [value]) !== null;
}

function captureBind(value) {
  const captured = exactDataObject(value, BIND_KEYS, true);
  if (
    captured === null
    || typeof captured.host !== 'string'
    || captured.host.length < 1
    || captured.host.length > MAX_HOST_BYTES
    || !regexpMatches(HOST, captured.host)
    || !boundedInteger(captured.port, 1, 65_535)
    || captured.exclusive !== true
  ) return null;
  return OBJECT_FREEZE({
    host: captured.host,
    port: captured.port,
    exclusive: true,
  });
}

function ordinaryBoundedBuffer(value) {
  try {
    if (
      REFLECT_APPLY(IS_PROXY, undefined, [value])
      || !REFLECT_APPLY(BUFFER_IS_BUFFER, NATIVE_BUFFER, [value])
      || REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, NATIVE_REFLECT, [value])
        !== BUFFER_PROTOTYPE
    ) return false;
    const backing = REFLECT_APPLY(TYPED_ARRAY_BUFFER_GETTER, value, []);
    const byteLength = REFLECT_APPLY(TYPED_ARRAY_BYTE_LENGTH_GETTER, value, []);
    const length = REFLECT_APPLY(TYPED_ARRAY_LENGTH_GETTER, value, []);
    return REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, NATIVE_REFLECT, [backing])
        === ARRAY_BUFFER_PROTOTYPE
      && boundedInteger(length, 1, MAX_TLS_MATERIAL_BYTES)
      && byteLength === length;
  } catch {
    return false;
  }
}

function copyBuffer(value) {
  try {
    const length = REFLECT_APPLY(TYPED_ARRAY_LENGTH_GETTER, value, []);
    const copy = REFLECT_APPLY(BUFFER_ALLOC, NATIVE_BUFFER, [length]);
    const copied = REFLECT_APPLY(TYPED_ARRAY_SET, copy, [value, 0]);
    return copied === undefined && ordinaryBoundedBuffer(copy) ? copy : null;
  } catch {
    return null;
  }
}

function clearBuffer(value) {
  if (value === null) return;
  try {
    REFLECT_APPLY(BUFFER_FILL, value, [0]);
  } catch {}
}

function captureAlpnProtocols(value) {
  try {
    if (
      !REFLECT_APPLY(ARRAY_IS_ARRAY, NATIVE_ARRAY, [value])
      || REFLECT_APPLY(IS_PROXY, undefined, [value])
      || REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, NATIVE_REFLECT, [value])
        !== ARRAY_PROTOTYPE
      || !REFLECT_APPLY(OBJECT_IS_FROZEN, NATIVE_OBJECT, [value])
    ) return null;
    const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, NATIVE_REFLECT, [value]);
    if (keys.length !== 2 || keys[0] !== '0' || keys[1] !== 'length') return null;
    const entry = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [value, '0'],
    );
    const length = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [value, 'length'],
    );
    if (
      entry === undefined
      || length === undefined
      || !OBJECT_HAS_OWN(entry, 'value')
      || !OBJECT_HAS_OWN(length, 'value')
      || entry.value !== 'http/1.1'
      || length.value !== 1
    ) return null;
    return OBJECT_FREEZE(['http/1.1']);
  } catch {
    return null;
  }
}

function captureServerOptions(value) {
  const captured = exactDataObject(value, SERVER_OPTION_KEYS, true);
  if (captured === null) return null;
  const protocols = captureAlpnProtocols(captured.ALPNProtocols);
  if (
    protocols === null
    || captured.minVersion !== 'TLSv1.3'
    || captured.maxVersion !== 'TLSv1.3'
    || captured.requestCert !== false
    || !boundedInteger(captured.handshakeTimeout, 1, MAX_DEADLINE_MS)
    || !boundedInteger(captured.maxHeaderSize, 512, MAX_HEADER_BYTES)
    || captured.insecureHTTPParser !== false
    || captured.requireHostHeader !== true
    || captured.joinDuplicateHeaders !== false
    || captured.rejectNonStandardBodyWrites !== true
    || !boundedInteger(captured.headersTimeout, 1, MAX_DEADLINE_MS)
    || !boundedInteger(captured.requestTimeout, 1, MAX_DEADLINE_MS)
    || !boundedInteger(captured.keepAliveTimeout, 1, MAX_DEADLINE_MS)
    || !boundedInteger(captured.maxHeadersCount, 1, MAX_HEADER_COUNT)
    || captured.maxRequestsPerSocket !== 1
    || !boundedInteger(
      captured.maxConnections,
      1,
      MAX_CONCURRENT_CONNECTIONS,
    )
    || !boundedInteger(captured.timeout, 1, MAX_DEADLINE_MS)
    || captured.headersTimeout > captured.requestTimeout
    || captured.handshakeTimeout > captured.timeout
    || captured.keepAliveTimeout !== captured.timeout
  ) return null;
  return OBJECT_FREEZE({
    minVersion: captured.minVersion,
    maxVersion: captured.maxVersion,
    ALPNProtocols: protocols,
    requestCert: captured.requestCert,
    handshakeTimeout: captured.handshakeTimeout,
    maxHeaderSize: captured.maxHeaderSize,
    insecureHTTPParser: captured.insecureHTTPParser,
    requireHostHeader: captured.requireHostHeader,
    joinDuplicateHeaders: captured.joinDuplicateHeaders,
    rejectNonStandardBodyWrites: captured.rejectNonStandardBodyWrites,
    headersTimeout: captured.headersTimeout,
    requestTimeout: captured.requestTimeout,
    keepAliveTimeout: captured.keepAliveTimeout,
    maxHeadersCount: captured.maxHeadersCount,
    maxRequestsPerSocket: captured.maxRequestsPerSocket,
    maxConnections: captured.maxConnections,
    timeout: captured.timeout,
  });
}

function captureCallbacks(value) {
  const captured = exactDataObject(value, SERVER_CALLBACK_KEYS, true);
  if (captured === null) return null;
  const callbacks = {};
  for (let index = 0; index < SERVER_CALLBACK_KEYS.length; index += 1) {
    const key = SERVER_CALLBACK_KEYS[index];
    if (!safeCallable(captured[key], true)) return null;
    callbacks[key] = captured[key];
  }
  return OBJECT_FREEZE(callbacks);
}

function nativeServer(value) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || REFLECT_APPLY(IS_PROXY, undefined, [value])
    ) return false;
    let current = value;
    for (let depth = 0; current !== null && depth < MAX_PROTOTYPE_DEPTH; depth += 1) {
      current = REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, NATIVE_REFLECT, [current]);
      if (current === NATIVE_HTTPS_SERVER_PROTOTYPE) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function removeInstalledListeners(server, installed) {
  for (let index = installed.length - 1; index >= 0; index -= 1) {
    const entry = installed[index];
    if (entry.name === 'error' || entry.name === 'close') continue;
    try {
      REFLECT_APPLY(EVENT_EMITTER_REMOVE_LISTENER, server, [
        entry.name,
        entry.listener,
      ]);
    } catch {}
  }
}

export function createServiceCreditBoundedNodeHttpsServerFactory(...args) {
  if (args.length !== 1) throw failure(CODE.invalidConfiguration);
  let configuration = exactDataObject(args[0], CONFIGURATION_KEYS, true);
  const bind = configuration === null ? null : captureBind(configuration.bind);
  let material = configuration === null
    ? null
    : exactDataObject(configuration.tlsMaterial, TLS_MATERIAL_KEYS, true);
  if (
    configuration === null
    || bind === null
    || material === null
    || !ordinaryBoundedBuffer(material.key)
    || !ordinaryBoundedBuffer(material.cert)
  ) throw failure(CODE.invalidConfiguration);

  let keyCopy = copyBuffer(material.key);
  let certCopy = copyBuffer(material.cert);
  if (keyCopy === null || certCopy === null) {
    clearBuffer(keyCopy);
    clearBuffer(certCopy);
    keyCopy = null;
    certCopy = null;
    throw failure(CODE.invalidConfiguration);
  }
  args = null;
  configuration = null;
  material = null;
  let state = 'READY';

  function clearCapturedMaterial() {
    const key = keyCopy;
    const cert = certCopy;
    keyCopy = null;
    certCopy = null;
    clearBuffer(key);
    clearBuffer(cert);
  }

  return OBJECT_FREEZE(function serviceCreditBoundedNodeHttpsServerFactory(...factoryArgs) {
    if (state !== 'READY') throw failure(CODE.alreadyUsed);
    state = 'INVOKING';
    if (factoryArgs.length !== 2) {
      state = 'FAILED';
      clearCapturedMaterial();
      throw failure(CODE.invalidInvocation);
    }
    const capturedOptions = captureServerOptions(factoryArgs[0]);
    let capturedCallbacks = captureCallbacks(factoryArgs[1]);
    if (capturedOptions === null || capturedCallbacks === null) {
      state = 'FAILED';
      clearCapturedMaterial();
      throw failure(CODE.invalidInvocation);
    }
    factoryArgs = null;

    const dispatchCell = {
      callbacks: capturedCallbacks,
      terminal: false,
    };
    capturedCallbacks = null;
    const serverCell = { server: null };
    const installed = [];
    let closeRequested = false;

    function forward(name, forwardedArgs) {
      const callbacks = dispatchCell.callbacks;
      if (callbacks === null) return;
      REFLECT_APPLY(callbacks[name], undefined, forwardedArgs);
    }

    function detachTerminal() {
      if (dispatchCell.terminal) return null;
      const callbacks = dispatchCell.callbacks;
      dispatchCell.terminal = true;
      closeRequested = true;
      dispatchCell.callbacks = null;
      serverCell.server = null;
      server = null;
      installed.length = 0;
      state = 'TERMINAL';
      clearCapturedMaterial();
      return callbacks;
    }

    const forwarders = OBJECT_FREEZE({
      connection: OBJECT_FREEZE(function boundedNodeHttpsConnection(socket) {
        forward('connection', [socket]);
      }),
      secureConnection: OBJECT_FREEZE(function boundedNodeHttpsSecureConnection(socket) {
        forward('secureConnection', [socket]);
      }),
      request: OBJECT_FREEZE(function boundedNodeHttpsRequest(request, response) {
        forward('request', [request, response]);
      }),
      checkContinue: OBJECT_FREEZE(function boundedNodeHttpsCheckContinue(request, response) {
        forward('checkContinue', [request, response]);
      }),
      checkExpectation: OBJECT_FREEZE(function boundedNodeHttpsCheckExpectation(request, response) {
        forward('checkExpectation', [request, response]);
      }),
      upgrade: OBJECT_FREEZE(function boundedNodeHttpsUpgrade(request, socket, head) {
        forward('upgrade', [request, socket, head]);
      }),
      connect: OBJECT_FREEZE(function boundedNodeHttpsConnect(request, socket, head) {
        forward('connect', [request, socket, head]);
      }),
      clientError: OBJECT_FREEZE(function boundedNodeHttpsClientError(error, socket) {
        forward('clientError', [error, socket]);
      }),
      tlsClientError: OBJECT_FREEZE(function boundedNodeHttpsTlsClientError(error, socket) {
        forward('tlsClientError', [error, socket]);
      }),
      dropRequest: OBJECT_FREEZE(function boundedNodeHttpsDropRequest(request, socket) {
        forward('dropRequest', [request, socket]);
      }),
      drop: OBJECT_FREEZE(function boundedNodeHttpsDrop(data) {
        forward('drop', [data]);
      }),
      timeout: OBJECT_FREEZE(function boundedNodeHttpsTimeout(socket) {
        forward('timeout', [socket]);
      }),
      listening: OBJECT_FREEZE(function boundedNodeHttpsListening() {
        forward('listening', []);
      }),
      close: OBJECT_FREEZE(function boundedNodeHttpsClose() {
        const callbacks = detachTerminal();
        if (callbacks === null) return;
        REFLECT_APPLY(callbacks.close, undefined, []);
      }),
      error: OBJECT_FREEZE(function boundedNodeHttpsError(error) {
        forward('error', [error]);
      }),
    });

    let nativeOptions = {
      key: keyCopy,
      cert: certCopy,
      minVersion: capturedOptions.minVersion,
      maxVersion: capturedOptions.maxVersion,
      ALPNProtocols: capturedOptions.ALPNProtocols,
      requestCert: capturedOptions.requestCert,
      handshakeTimeout: capturedOptions.handshakeTimeout,
      maxHeaderSize: capturedOptions.maxHeaderSize,
      insecureHTTPParser: capturedOptions.insecureHTTPParser,
      requireHostHeader: capturedOptions.requireHostHeader,
      joinDuplicateHeaders: capturedOptions.joinDuplicateHeaders,
      rejectNonStandardBodyWrites: capturedOptions.rejectNonStandardBodyWrites,
      headersTimeout: capturedOptions.headersTimeout,
      requestTimeout: capturedOptions.requestTimeout,
      keepAliveTimeout: capturedOptions.keepAliveTimeout,
      maxHeadersCount: capturedOptions.maxHeadersCount,
      maxRequestsPerSocket: capturedOptions.maxRequestsPerSocket,
      maxConnections: capturedOptions.maxConnections,
      timeout: capturedOptions.timeout,
    };

    let server;
    try {
      server = REFLECT_APPLY(CREATE_NATIVE_HTTPS_SERVER, undefined, [
        nativeOptions,
        forwarders.request,
      ]);
    } catch {
      nativeOptions = null;
      dispatchCell.callbacks = null;
      dispatchCell.terminal = true;
      state = 'FAILED';
      clearCapturedMaterial();
      throw failure(CODE.constructionFailed);
    }
    nativeOptions = null;
    if (!nativeServer(server)) {
      dispatchCell.callbacks = null;
      dispatchCell.terminal = true;
      state = 'FAILED';
      clearCapturedMaterial();
      throw failure(CODE.constructionFailed);
    }
    serverCell.server = server;
    REFLECT_APPLY(ARRAY_PUSH, installed, [{
      name: 'request',
      listener: forwarders.request,
    }]);

    function register(name, listener, once) {
      let registeredListener = listener;
      if (once) {
        registeredListener = OBJECT_FREEZE(
          function boundedNodeHttpsOneShotEvent(...eventArgs) {
            const activeServer = serverCell.server;
            if (activeServer === null) return;
            REFLECT_APPLY(EVENT_EMITTER_REMOVE_LISTENER, activeServer, [
              name,
              registeredListener,
            ]);
            REFLECT_APPLY(listener, undefined, eventArgs);
          },
        );
      }
      const returned = REFLECT_APPLY(EVENT_EMITTER_ON, server, [
        name,
        registeredListener,
      ]);
      if (returned !== server) throw failure(CODE.setupFailed);
      REFLECT_APPLY(ARRAY_PUSH, installed, [{
        name,
        listener: registeredListener,
      }]);
      if (dispatchCell.terminal) throw failure(CODE.setupFailed);
    }

    function cleanupPartialSetup() {
      closeRequested = true;
      dispatchCell.callbacks = null;
      dispatchCell.terminal = true;
      const activeServer = serverCell.server;
      if (activeServer !== null) {
        removeInstalledListeners(activeServer, installed);
        try { REFLECT_APPLY(SERVER_CLOSE_ALL_CONNECTIONS, activeServer, []); } catch {}
        try { REFLECT_APPLY(SERVER_CLOSE, activeServer, []); } catch {}
      }
      serverCell.server = null;
      server = null;
      installed.length = 0;
      state = 'FAILED';
      clearCapturedMaterial();
    }

    function applyNativeProperty(name, value) {
      if (!REFLECT_APPLY(REFLECT_SET, NATIVE_REFLECT, [
        server,
        name,
        value,
        server,
      ])) throw failure(CODE.setupFailed);
      if (REFLECT_APPLY(REFLECT_GET, NATIVE_REFLECT, [
        server,
        name,
        server,
      ]) !== value) throw failure(CODE.setupFailed);
    }

    try {
      register('close', forwarders.close, true);
      register('error', forwarders.error, false);
      applyNativeProperty('maxHeadersCount', capturedOptions.maxHeadersCount);
      applyNativeProperty('maxConnections', capturedOptions.maxConnections);
      applyNativeProperty('maxRequestsPerSocket', capturedOptions.maxRequestsPerSocket);
      applyNativeProperty('headersTimeout', capturedOptions.headersTimeout);
      applyNativeProperty('requestTimeout', capturedOptions.requestTimeout);
      applyNativeProperty('keepAliveTimeout', capturedOptions.keepAliveTimeout);
      if (
        REFLECT_APPLY(SERVER_SET_TIMEOUT, server, [capturedOptions.timeout])
          !== server
      ) throw failure(CODE.setupFailed);
      register('timeout', forwarders.timeout, false);
      register('connection', forwarders.connection, false);
      register('secureConnection', forwarders.secureConnection, false);
      register('checkContinue', forwarders.checkContinue, false);
      register('checkExpectation', forwarders.checkExpectation, false);
      register('upgrade', forwarders.upgrade, false);
      register('connect', forwarders.connect, false);
      register('clientError', forwarders.clientError, false);
      register('tlsClientError', forwarders.tlsClientError, false);
      register('dropRequest', forwarders.dropRequest, false);
      register('drop', forwarders.drop, false);
      register('listening', forwarders.listening, true);
    } catch {
      cleanupPartialSetup();
      throw failure(CODE.setupFailed);
    }

    let listenAttempted = false;
    const listen = OBJECT_FREEZE(function listenBoundedNodeHttpsServer(...operationArgs) {
      if (
        operationArgs.length !== 0
        || listenAttempted
        || closeRequested
        || dispatchCell.terminal
        || serverCell.server === null
      ) throw failure(CODE.listenFailed);
      listenAttempted = true;
      const activeServer = serverCell.server;
      try {
        REFLECT_APPLY(SERVER_LISTEN, activeServer, [{
          host: bind.host,
          port: bind.port,
          exclusive: true,
        }]);
      } catch {
        throw failure(CODE.listenFailed);
      }
      if (dispatchCell.terminal || serverCell.server !== activeServer) {
        throw failure(CODE.listenFailed);
      }
    });
    const close = OBJECT_FREEZE(function closeBoundedNodeHttpsServer(...operationArgs) {
      if (operationArgs.length !== 0) throw failure(CODE.closeFailed);
      if (dispatchCell.terminal || closeRequested) return;
      closeRequested = true;
      const activeServer = serverCell.server;
      if (activeServer === null) throw failure(CODE.closeFailed);
      try {
        REFLECT_APPLY(SERVER_CLOSE, activeServer, []);
      } catch {
        throw failure(CODE.closeFailed);
      }
    });
    const closeAllConnections = OBJECT_FREEZE(
      function closeAllBoundedNodeHttpsConnections(...operationArgs) {
        if (operationArgs.length !== 0) throw failure(CODE.closeAllFailed);
        if (dispatchCell.terminal) return;
        const activeServer = serverCell.server;
        if (activeServer === null) throw failure(CODE.closeAllFailed);
        try {
          REFLECT_APPLY(SERVER_CLOSE_ALL_CONNECTIONS, activeServer, []);
        } catch {
          throw failure(CODE.closeAllFailed);
        }
      },
    );
    const capability = OBJECT_FREEZE({ listen, close, closeAllConnections });
    if (
      REFLECT_APPLY(REFLECT_OWN_KEYS, NATIVE_REFLECT, [capability]).length
        !== SERVER_CAPABILITY_KEYS.length
    ) {
      cleanupPartialSetup();
      throw failure(CODE.setupFailed);
    }
    state = 'PUBLISHED';
    return capability;
  });
}
