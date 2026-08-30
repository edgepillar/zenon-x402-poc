import { Buffer } from 'node:buffer';
import { performance } from 'node:perf_hooks';
import { types as utilTypes } from 'node:util';
import {
  MessagePort,
  isMainThread,
  parentPort,
} from 'node:worker_threads';

const RESPONSE_READY = 'LDR1\u0000READY\u00001';
const RESPONSE_FAILED = 'LDR1\u0000FAILED\u00001';
const MAX_FRAME_BYTES = 18 * 1024;
const MAX_ARTIFACT_BYTES = 16 * 1024;
const MAX_URL_BYTES = 128;
const LOOPBACK_URL = /^ws:\/\/(?:127\.0\.0\.1|\[::1\]):([1-9][0-9]{0,4})\/$/;
const DECIMAL = /^(?:0|[1-9][0-9]*)$/;
const EXPECTED_READS = Object.freeze([
  'stats.networkInfo',
  'stats.syncInfo',
  'ledger.getFrontierMomentum',
  'operatorTrustedChainObservation',
]);
const NETWORK_KEYS = Object.freeze(['numPeers', 'peers', 'self']);
const PEER_KEYS = Object.freeze(['ip', 'publicKey']);
const SYNC_KEYS = Object.freeze(['currentHeight', 'state', 'targetHeight']);
const MOMENTUM_KEYS = Object.freeze([
  'chainIdentifier', 'changesHash', 'content', 'data', 'hash', 'height',
  'previousHash', 'producer', 'publicKey', 'signature', 'timestamp', 'version',
]);
const MOMENTUM_LIST_KEYS = Object.freeze(['count', 'list']);
const HASH_KEYS = Object.freeze(['core']);
const CONNECTED_API_KEYS = Object.freeze(['client']);
const DISCONNECTED_API_KEYS = Object.freeze([]);
const READINESS_RESULT_KEYS = Object.freeze([
  'chainId', 'syncInfo', 'frontierMomentum', 'chainTrustEvidence', 'then',
]);

const APPLY = Reflect.apply;
const ARRAY_INCLUDES = Array.prototype.includes;
const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_PROTOTYPE = Array.prototype;
const ARRAY_SOME = Array.prototype.some;
const BUFFER_BYTE_LENGTH = Buffer.byteLength;
const BUFFER_IS_BUFFER = Buffer.isBuffer;
const BUFFER_TO_STRING = Buffer.prototype.toString;
const CLEAR_TIMEOUT = clearTimeout;
const CREATE = Object.create;
const DEFINE_PROPERTY = Object.defineProperty;
const ERROR = Error;
const FREEZE = Object.freeze;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROMISE = utilTypes.isPromise;
const IS_PROXY = utilTypes.isProxy;
const MESSAGE_PORT_CLOSE = MessagePort.prototype.close;
const MESSAGE_PORT_ON = MessagePort.prototype.on;
const MESSAGE_PORT_POST_MESSAGE = MessagePort.prototype.postMessage;
const NUMBER = Number;
const NUMBER_CONSTRUCTOR = Number;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const OBJECT = Object;
const OBJECT_PROTOTYPE = Object.prototype;
const OBJECT_PROTOTYPE_THEN_AT_IMPORT = APPLY(
  GET_OWN_PROPERTY_DESCRIPTOR,
  undefined,
  [OBJECT_PROTOTYPE, 'then'],
);
const MATH = Math;
const MATH_CEIL = Math.ceil;
const PERFORMANCE = performance;
const PERFORMANCE_NOW = performance.now;
const PROMISE = Promise;
const PROMISE_PROTOTYPE = Promise.prototype;
const PROMISE_THEN = Promise.prototype.then;
const REFLECT_CONSTRUCT = Reflect.construct;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const REGEXP_EXEC = RegExp.prototype.exec;
const SET_TIMEOUT = setTimeout;
const STRING = String;
const STRING_CHAR_CODE_AT = String.prototype.charCodeAt;
const STRING_SPLIT = String.prototype.split;
const STRING_SLICE = String.prototype.slice;

let started = false;
let finished = false;

function apply(functionValue, receiver, args) {
  return APPLY(APPLY, undefined, [functionValue, receiver, args]);
}

function fail() {
  const error = apply(REFLECT_CONSTRUCT, undefined, [ERROR, ['local_devnet_readiness_worker_failed']]);
  apply(DEFINE_PROPERTY, undefined, [error, 'stack', {
    configurable: false,
    enumerable: false,
    value: undefined,
    writable: false,
  }]);
  throw error;
}

function isProxy(value) {
  return apply(IS_PROXY, undefined, [value]);
}

function descriptor(value, key) {
  let result;
  try {
    result = apply(GET_OWN_PROPERTY_DESCRIPTOR, undefined, [value, key]);
  } catch {
    fail();
  }
  if (!result || !apply(HAS_OWN, undefined, [result, 'value'])) fail();
  return result;
}

function ownValue(value, key) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function') || isProxy(value)) fail();
  return descriptor(value, key).value;
}

function exactOwnKeys(value, expected, prototype) {
  if (value === null || typeof value !== 'object' || isProxy(value)) fail();
  let actualPrototype;
  let keys;
  try {
    actualPrototype = apply(GET_PROTOTYPE_OF, undefined, [value]);
    keys = apply(REFLECT_OWN_KEYS, undefined, [value]);
  } catch {
    fail();
  }
  if (actualPrototype !== prototype || keys.length !== expected.length) fail();
  for (let index = 0; index < expected.length; index += 1) {
    if (!apply(HAS_OWN, undefined, [value, expected[index]])) fail();
    descriptor(value, expected[index]);
  }
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== 'string' || !fixedIncludes(expected, keys[index])) fail();
  }
  return value;
}

function fixedIncludes(values, candidate) {
  return apply(ARRAY_INCLUDES, values, [candidate]);
}

function safeInteger(value) {
  return apply(NUMBER_IS_SAFE_INTEGER, NUMBER_CONSTRUCTOR, [value]);
}

function assertObjectPrototypeThenSafe() {
  let current;
  try {
    current = apply(GET_OWN_PROPERTY_DESCRIPTOR, undefined, [OBJECT_PROTOTYPE, 'then']);
  } catch {
    fail();
  }
  if (OBJECT_PROTOTYPE_THEN_AT_IMPORT !== undefined || current !== undefined) fail();
}

function promise(executor) {
  return apply(REFLECT_CONSTRUCT, undefined, [PROMISE, [executor]]);
}

function promiseRaceTwo(left, right) {
  return promise((resolve, reject) => {
    apply(PROMISE_THEN, left, [resolve, reject]);
    apply(PROMISE_THEN, right, [resolve, reject]);
  });
}

function immutableRecord(entries) {
  const result = apply(CREATE, undefined, [null]);
  for (let index = 0; index < entries.length; index += 1) {
    const key = entries[index][0];
    const value = entries[index][1];
    apply(DEFINE_PROPERTY, undefined, [result, key, {
      configurable: false,
      enumerable: true,
      value,
      writable: false,
    }]);
  }
  return apply(FREEZE, OBJECT, [result]);
}

function appendArray(values, value) {
  apply(DEFINE_PROPERTY, undefined, [values, values.length, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  }]);
}

function immutablePlainRecord(entries) {
  const result = {};
  for (let index = 0; index < entries.length; index += 1) {
    const key = entries[index][0];
    const value = entries[index][1];
    apply(DEFINE_PROPERTY, undefined, [result, key, {
      configurable: false,
      enumerable: true,
      value,
      writable: false,
    }]);
  }
  return apply(FREEZE, OBJECT, [result]);
}

function ascii(value, maximum) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum ||
      apply(BUFFER_BYTE_LENGTH, Buffer, [value, 'utf8']) !== value.length) fail();
  for (let index = 0; index < value.length; index += 1) {
    if (apply(STRING_CHAR_CODE_AT, value, [index]) > 0x7f) fail();
  }
  return value;
}

function canonicalDecimal(value, minimum, maximum) {
  if (typeof value !== 'string' || apply(REGEXP_EXEC, DECIMAL, [value]) === null) fail();
  const number = apply(NUMBER, undefined, [value]);
  if (!apply(NUMBER_IS_SAFE_INTEGER, NUMBER_CONSTRUCTOR, [number]) ||
      number < minimum || number > maximum ||
      apply(STRING, undefined, [number]) !== value) fail();
  return number;
}

function parseFrame(frame) {
  if (typeof frame !== 'string' || frame.length < 1 || frame.length > MAX_FRAME_BYTES ||
      apply(BUFFER_BYTE_LENGTH, Buffer, [frame, 'utf8']) !== frame.length) fail();
  const fields = apply(STRING_SPLIT, frame, ['\u0000']);
  if (!apply(ARRAY_IS_ARRAY, undefined, [fields]) || fields.length !== 7 ||
      fields[0] !== 'LDR1' || fields[1] !== 'START' || fields[2] !== '1') fail();
  const timeoutMs = canonicalDecimal(fields[3], 1_000, 30_000);
  const urlBytes = canonicalDecimal(fields[4], 1, MAX_URL_BYTES);
  const artifactBytes = canonicalDecimal(fields[5], 1, MAX_ARTIFACT_BYTES);
  const payload = fields[6];
  if (typeof payload !== 'string' || payload.length !== urlBytes + artifactBytes) fail();
  const rpcUrl = apply(STRING_SLICE, payload, [0, urlBytes]);
  const artifactText = apply(STRING_SLICE, payload, [urlBytes]);
  ascii(rpcUrl, MAX_URL_BYTES);
  ascii(artifactText, MAX_ARTIFACT_BYTES);
  const urlMatch = apply(REGEXP_EXEC, LOOPBACK_URL, [rpcUrl]);
  if (urlMatch === null) fail();
  const port = canonicalDecimal(descriptor(urlMatch, '1').value, 1, 65_535);
  if (port === 80) fail();
  return immutableRecord([
    ['artifactText', artifactText],
    ['rpcUrl', rpcUrl],
    ['timeoutMs', timeoutMs],
  ]);
}

function suppressConsole() {
  const noOutput = () => {};
  const names = ['debug', 'error', 'info', 'log', 'warn'];
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    try {
      apply(DEFINE_PROPERTY, undefined, [console, name, {
        configurable: false,
        enumerable: false,
        value: noOutput,
        writable: false,
      }]);
    } catch {
      fail();
    }
  }
}

function dataMethod(constructor, name) {
  if (typeof constructor !== 'function' || isProxy(constructor)) fail();
  const prototype = descriptor(constructor, 'prototype').value;
  if (prototype === null || typeof prototype !== 'object' || isProxy(prototype)) fail();
  const method = descriptor(prototype, name).value;
  if (typeof method !== 'function' || isProxy(method)) fail();
  return method;
}

function exactNativePromise(value) {
  if (value === null || typeof value !== 'object') return false;
  if (isProxy(value)) return false;
  if (!apply(IS_PROMISE, undefined, [value])) return false;
  let prototype;
  let keys;
  try {
    prototype = apply(GET_PROTOTYPE_OF, undefined, [value]);
    keys = apply(REFLECT_OWN_KEYS, undefined, [value]);
  } catch {
    fail();
  }
  if (prototype !== PROMISE_PROTOTYPE || keys.length !== 0) fail();
  return true;
}

function invokeRequiredNativePromise(method, receiver, args) {
  let raw;
  try {
    raw = apply(method, receiver, args);
  } catch {
    fail();
  }
  if (!exactNativePromise(raw)) fail();
  return raw;
}

function settleNativeControl(nativePromise, validate) {
  const bridge = promise((resolve, reject) => {
    apply(PROMISE_THEN, nativePromise, [
      value => {
        try {
          assertObjectPrototypeThenSafe();
          validate(value);
          assertObjectPrototypeThenSafe();
          resolve(true);
        } catch {
          reject(apply(REFLECT_CONSTRUCT, undefined, [ERROR, ['invalid_sdk_result']]));
        }
      },
      () => {
        reject(apply(REFLECT_CONSTRUCT, undefined, [ERROR, ['sdk_read_failed']]));
      },
    ]);
  });
  return bridge;
}

function requiredSdkRead(method, receiver, args, transform) {
  let snapshot;
  const control = settleNativeControl(
    invokeRequiredNativePromise(method, receiver, args),
    value => {
      snapshot = transform(value);
    },
  );
  return promise((resolve, reject) => {
    apply(PROMISE_THEN, control, [
      marker => {
        try {
          if (marker !== true || snapshot === undefined) fail();
          assertObjectPrototypeThenSafe();
          const result = snapshot;
          snapshot = undefined;
          resolve(result);
        } catch {
          reject(apply(REFLECT_CONSTRUCT, undefined, [ERROR, ['invalid_sdk_result']]));
        }
      },
      () => {
        reject(apply(REFLECT_CONSTRUCT, undefined, [ERROR, ['sdk_read_failed']]));
      },
    ]);
  });
}

function exactDisconnectedApiReceiver(value, constructor) {
  const prototype = descriptor(constructor, 'prototype').value;
  exactOwnKeys(value, DISCONNECTED_API_KEYS, prototype);
  return value;
}

function exactConnectedApiReceiver(value, constructor, client) {
  if (client === null || (typeof client !== 'object' && typeof client !== 'function') || isProxy(client)) fail();
  const prototype = descriptor(constructor, 'prototype').value;
  exactOwnKeys(value, CONNECTED_API_KEYS, prototype);
  if (ownValue(value, 'client') !== client) fail();
  return value;
}

function closeSynchronously(method, receiver) {
  let result;
  try {
    result = apply(method, receiver, []);
  } catch {
    fail();
  }
  if (result !== undefined) fail();
}

function hashString(value, sdk) {
  const Hash = ownValue(sdk, 'Hash');
  exactOwnKeys(value, HASH_KEYS, descriptor(Hash, 'prototype').value);
  const core = ownValue(value, 'core');
  if (core === null || (typeof core !== 'object' && typeof core !== 'function') || isProxy(core)) fail();
  if (!apply(BUFFER_IS_BUFFER, Buffer, [core]) || core.length !== 32) fail();
  const result = apply(BUFFER_TO_STRING, core, ['hex']);
  if (typeof result !== 'string' || result.length !== 64) fail();
  return result;
}

function peerSnapshot(value, expectedPrototype) {
  exactOwnKeys(value, PEER_KEYS, expectedPrototype);
  const ip = ownValue(value, 'ip');
  const publicKey = ownValue(value, 'publicKey');
  if (typeof ip !== 'string' || ip.length < 1 || ip.length > 512 ||
      typeof publicKey !== 'string' || publicKey.length < 1 || publicKey.length > 1024) fail();
  return immutableRecord([['ip', ip], ['publicKey', publicKey]]);
}

function networkSnapshot(value, sdk) {
  const NetworkInfo = ownValue(sdk, 'NetworkInfo');
  exactOwnKeys(value, NETWORK_KEYS, descriptor(NetworkInfo, 'prototype').value);
  const numPeers = ownValue(value, 'numPeers');
  const self = ownValue(value, 'self');
  const peers = ownValue(value, 'peers');
  if (!safeInteger(numPeers) || numPeers < 1 || self === null || typeof self !== 'object' ||
      isProxy(self) || !apply(ARRAY_IS_ARRAY, undefined, [peers]) || isProxy(peers) ||
      apply(GET_PROTOTYPE_OF, undefined, [peers]) !== ARRAY_PROTOTYPE) fail();
  const peerPrototype = apply(GET_PROTOTYPE_OF, undefined, [self]);
  if (peerPrototype === null || peerPrototype === OBJECT_PROTOTYPE || isProxy(peerPrototype)) fail();
  const copiedPeers = [];
  for (let index = 0; index < peers.length; index += 1) {
    appendArray(copiedPeers, peerSnapshot(
      descriptor(peers, apply(STRING, undefined, [index])).value,
      peerPrototype,
    ));
  }
  apply(DEFINE_PROPERTY, undefined, [copiedPeers, 'some', {
    configurable: false,
    enumerable: false,
    value: function safeSome(callback) {
      return apply(ARRAY_SOME, copiedPeers, [callback]);
    },
    writable: false,
  }]);
  apply(FREEZE, OBJECT, [copiedPeers]);
  return immutableRecord([
    ['numPeers', numPeers],
    ['self', peerSnapshot(self, peerPrototype)],
    ['peers', copiedPeers],
  ]);
}

function syncSnapshot(value, sdk) {
  const SyncInfo = ownValue(sdk, 'SyncInfo');
  exactOwnKeys(value, SYNC_KEYS, descriptor(SyncInfo, 'prototype').value);
  const state = ownValue(value, 'state');
  const currentHeight = ownValue(value, 'currentHeight');
  const targetHeight = ownValue(value, 'targetHeight');
  if (!safeInteger(state) || !safeInteger(currentHeight) || !safeInteger(targetHeight)) fail();
  return immutableRecord([
    ['state', state],
    ['currentHeight', currentHeight],
    ['targetHeight', targetHeight],
  ]);
}

function momentumSnapshot(value, sdk, heightTwo = false) {
  const Momentum = ownValue(sdk, 'Momentum');
  exactOwnKeys(value, MOMENTUM_KEYS, descriptor(Momentum, 'prototype').value);
  const version = ownValue(value, 'version');
  const chainIdentifier = ownValue(value, 'chainIdentifier');
  const height = ownValue(value, 'height');
  if (!safeInteger(version) || !safeInteger(chainIdentifier) || !safeInteger(height)) fail();
  const entries = [
    ['chainIdentifier', chainIdentifier],
    ['hash', hashString(ownValue(value, 'hash'), sdk)],
    ['height', height],
  ];
  if (heightTwo) {
    appendArray(entries, ['previousHash', hashString(ownValue(value, 'previousHash'), sdk)]);
    appendArray(entries, ['version', version]);
  }
  return immutablePlainRecord(entries);
}

function momentumListSnapshot(value, sdk) {
  const MomentumList = ownValue(sdk, 'MomentumList');
  exactOwnKeys(value, MOMENTUM_LIST_KEYS, descriptor(MomentumList, 'prototype').value);
  const count = ownValue(value, 'count');
  const list = ownValue(value, 'list');
  if (!safeInteger(count) || count < 0 || !apply(ARRAY_IS_ARRAY, undefined, [list]) ||
      isProxy(list) || apply(GET_PROTOTYPE_OF, undefined, [list]) !== ARRAY_PROTOTYPE || list.length !== 1) fail();
  const copied = [momentumSnapshot(descriptor(list, '0').value, sdk, true)];
  apply(FREEZE, OBJECT, [copied]);
  return immutablePlainRecord([['count', count], ['list', copied]]);
}

function remaining(deadline) {
  const value = apply(MATH_CEIL, MATH, [deadline - apply(PERFORMANCE_NOW, PERFORMANCE, [])]);
  if (!safeInteger(value) || value < 1) fail();
  return value;
}

async function executeReadiness(frame) {
  suppressConsole();
  const localPolicy = await import('./zenon/operator-trusted-local-devnet-profile.js');
  const chainPolicy = await import('./zenon/operator-trusted-chain-policy.js');
  const zenonPayment = await import('./zenon-payment.js');
  const sdk = await import('znn-typescript-sdk');
  const OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT = ownValue(
    localPolicy,
    'OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT',
  );
  const createOperatorTrustedLocalDevnetPolicy = ownValue(
    localPolicy,
    'createOperatorTrustedLocalDevnetPolicy',
  );
  const parseOperatorTrustedLocalDevnetProfileArtifact = ownValue(
    localPolicy,
    'parseOperatorTrustedLocalDevnetProfileArtifact',
  );
  const assertOperatorTrustedChainEvidence = ownValue(
    chainPolicy,
    'assertOperatorTrustedChainEvidence',
  );
  const assertZenonNodeReady = ownValue(zenonPayment, 'assertZenonNodeReady');
  assertObjectPrototypeThenSafe();
  const artifact = parseOperatorTrustedLocalDevnetProfileArtifact(frame.artifactText);
  if (artifact.acknowledgement !== OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT) fail();
  const policy = createOperatorTrustedLocalDevnetPolicy(artifact);
  const deadline = apply(PERFORMANCE_NOW, PERFORMANCE, []) + frame.timeoutMs;

  const Zenon = ownValue(sdk, 'Zenon');
  const StatsApi = ownValue(sdk, 'StatsApi');
  const LedgerApi = ownValue(sdk, 'LedgerApi');
  const initialize = dataMethod(Zenon, 'initialize');
  const clearConnection = dataMethod(Zenon, 'clearConnection');
  const networkInfo = dataMethod(StatsApi, 'networkInfo');
  const syncInfo = dataMethod(StatsApi, 'syncInfo');
  const frontier = dataMethod(LedgerApi, 'getFrontierMomentum');
  const heightTwo = dataMethod(LedgerApi, 'getMomentumsByHeight');
  const zenon = apply(REFLECT_CONSTRUCT, undefined, [Zenon, []]);
  if (zenon === null || typeof zenon !== 'object' || isProxy(zenon) ||
      apply(GET_PROTOTYPE_OF, undefined, [zenon]) !== descriptor(Zenon, 'prototype').value) fail();
  const statsApi = ownValue(zenon, 'stats');
  const ledgerApi = ownValue(zenon, 'ledger');
  exactDisconnectedApiReceiver(statsApi, StatsApi);
  exactDisconnectedApiReceiver(ledgerApi, LedgerApi);
  const SyncState = ownValue(sdk, 'SyncState');
  const SyncDone = ownValue(SyncState, 'SyncDone');

  let initialized = false;
  let readinessValid = false;
  try {
    initialized = true;
    const connectionOptions = immutableRecord([
      ['autoconnect', true],
      ['followRedirects', false],
      ['handshakeTimeout', remaining(deadline)],
      ['maxPayload', 65_536],
      ['maxRedirects', 0],
      ['max_reconnects', 0],
      ['perMessageDeflate', false],
      ['reconnect', false],
    ]);
    const initializeControl = settleNativeControl(
      invokeRequiredNativePromise(
        initialize,
        zenon,
        [frame.rpcUrl, remaining(deadline), connectionOptions],
      ),
      value => {
        if (value !== undefined) fail();
      },
    );
    if (await initializeControl !== true) fail();

    const client = ownValue(zenon, 'client');
    exactConnectedApiReceiver(statsApi, StatsApi, client);
    exactConnectedApiReceiver(ledgerApi, LedgerApi, client);

    const stats = immutableRecord([
      ['networkInfo', function readNetworkInfo() {
        exactConnectedApiReceiver(statsApi, StatsApi, client);
        return requiredSdkRead(networkInfo, statsApi, [], value => networkSnapshot(value, sdk));
      }],
      ['syncInfo', function readSyncInfo() {
        exactConnectedApiReceiver(statsApi, StatsApi, client);
        return requiredSdkRead(syncInfo, statsApi, [], value => syncSnapshot(value, sdk));
      }],
    ]);
    const ledger = immutableRecord([
      ['getFrontierMomentum', function readFrontier() {
        exactConnectedApiReceiver(ledgerApi, LedgerApi, client);
        return requiredSdkRead(frontier, ledgerApi, [], value => momentumSnapshot(value, sdk));
      }],
      ['getMomentumsByHeight', function readHeightTwo(height, count) {
        if (height !== 2 || count !== 1) fail();
        exactConnectedApiReceiver(ledgerApi, LedgerApi, client);
        return requiredSdkRead(heightTwo, ledgerApi, [height, count], value => momentumListSnapshot(value, sdk));
      }],
    ]);
    const readOnlyZenon = immutableRecord([['ledger', ledger], ['stats', stats]]);
    const sdkView = immutableRecord([['SyncState', immutableRecord([['SyncDone', SyncDone]])]]);
    let readIndex = 0;
    const callRead = (operation, execute) => {
      if (readIndex >= EXPECTED_READS.length || operation !== EXPECTED_READS[readIndex] ||
          typeof execute !== 'function' || isProxy(execute)) fail();
      readIndex += 1;
      return apply(execute, undefined, []);
    };
    const result = await assertZenonNodeReady(
      readOnlyZenon,
      sdkView,
      undefined,
      policy.chainProfile,
      { callRead, operatorTrustedChainPolicy: policy },
    );
    if (readIndex !== EXPECTED_READS.length || result === null || typeof result !== 'object' || isProxy(result) ||
        apply(GET_PROTOTYPE_OF, undefined, [result]) !== OBJECT_PROTOTYPE) fail();
    const resultKeys = apply(REFLECT_OWN_KEYS, undefined, [result]);
    for (let index = 0; index < READINESS_RESULT_KEYS.length; index += 1) {
      if (!fixedIncludes(resultKeys, READINESS_RESULT_KEYS[index])) fail();
    }
    const thenDescriptor = descriptor(result, 'then');
    if (thenDescriptor.value !== undefined || thenDescriptor.enumerable !== false ||
        thenDescriptor.configurable !== false || thenDescriptor.writable !== false) fail();
    const evidence = ownValue(result, 'chainTrustEvidence');
    if (assertOperatorTrustedChainEvidence(policy, evidence) !== evidence ||
        ownValue(evidence, 'remoteChainAuthenticated') !== false ||
        apply(HAS_OWN, undefined, [evidence, 'authenticatedProfile'])) fail();
    const nonClaims = ownValue(evidence, 'nonClaims');
    if (ownValue(nonClaims, 'fourNodeTopologyVerified') !== false) fail();
    readinessValid = true;
  } finally {
    if (initialized) {
      closeSynchronously(clearConnection, zenon);
    }
  }
  if (!readinessValid) fail();
  return true;
}

function respond(value) {
  if (finished || parentPort === null) return;
  finished = true;
  try { apply(MESSAGE_PORT_POST_MESSAGE, parentPort, [value]); } catch {}
  try { apply(MESSAGE_PORT_CLOSE, parentPort, []); } catch {}
}

async function processMessage(message) {
  if (started) {
    respond(RESPONSE_FAILED);
    return;
  }
  started = true;
  let frame;
  try {
    frame = parseFrame(message);
  } catch {
    respond(RESPONSE_FAILED);
    return;
  }
  let timeout;
  try {
    const run = executeReadiness(frame);
    const timer = promise(resolve => {
      timeout = apply(SET_TIMEOUT, undefined, [() => resolve(false), frame.timeoutMs]);
    });
    const result = await promiseRaceTwo(run, timer);
    respond(result === true ? RESPONSE_READY : RESPONSE_FAILED);
  } catch {
    respond(RESPONSE_FAILED);
  } finally {
    if (timeout !== undefined) apply(CLEAR_TIMEOUT, undefined, [timeout]);
  }
}

if (!isMainThread && parentPort !== null) {
  apply(MESSAGE_PORT_ON, parentPort, ['message', message => { void processMessage(message); }]);
}
