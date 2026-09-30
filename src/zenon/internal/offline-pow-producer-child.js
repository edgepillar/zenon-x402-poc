/**
 * Fixed child artifact for isolated offline nonce production.
 *
 * The JavaScript network denial layer below is a defense-in-depth facade for
 * this reviewed artifact. It is not a universal operating-system sandbox on
 * Node 24. The parent separately confines filesystem and process capabilities.
 */

import dgram from 'node:dgram';
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import { createHash } from 'node:crypto';
import { readSync, writeSync } from 'node:fs';
import http from 'node:http';
import http2 from 'node:http2';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import tls from 'node:tls';

const REQUEST_BYTES = 65;
const PROTOCOL_VERSION = 1;
const REQUEST_MAGIC = Buffer.from('ZNI1', 'ascii');
const RESPONSE_MAGIC = Buffer.from('ZNO1', 'ascii');
const FRAME_READY = 1;
const FRAME_WRAPPER_INVOKED = 2;
const FRAME_SUCCESS = 3;
const FRAME_REJECTION = 4;
const NETWORK_BOUNDARY_LABEL =
  'TRUSTED_ARTIFACT_JS_DENIAL_FACADE_NOT_OS_SANDBOX';
const NETWORK_DENIAL_SIGNAL = Object.freeze(new Error('network denied'));

let networkAttemptCount = 0;

function denyNetwork() {
  networkAttemptCount += 1;
  throw NETWORK_DENIAL_SIGNAL;
}

function replaceFunctions(target, names) {
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(target, name);
    if (!descriptor || typeof descriptor.value !== 'function') continue;
    Object.defineProperty(target, name, { ...descriptor, value: denyNetwork });
    if (target[name] !== denyNetwork) throw new Error('network boundary unavailable');
  }
}

function replaceGlobalFunction(name) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  if (descriptor === undefined) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: denyNetwork,
      writable: true,
    });
    return;
  }
  if (descriptor.configurable) {
    Object.defineProperty(globalThis, name, {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      value: denyNetwork,
      writable: true,
    });
    return;
  }
  if (descriptor.writable) globalThis[name] = denyNetwork;
  if (globalThis[name] !== denyNetwork) throw new Error('network boundary unavailable');
}

function installNetworkDenialFacade() {
  replaceFunctions(net, ['connect', 'createConnection', 'createServer']);
  replaceFunctions(net.Socket.prototype, ['connect']);
  replaceFunctions(net.Server.prototype, ['listen']);
  replaceFunctions(tls, ['connect', 'createServer']);
  replaceFunctions(dgram, ['createSocket']);
  replaceFunctions(dgram.Socket.prototype, ['bind', 'connect', 'send']);
  replaceFunctions(http, ['get', 'request', 'createServer']);
  replaceFunctions(http.Agent.prototype, ['addRequest', 'createConnection']);
  replaceFunctions(https, ['get', 'request', 'createServer']);
  replaceFunctions(https.Agent.prototype, ['addRequest', 'createConnection']);
  replaceFunctions(http2, ['connect', 'createServer', 'createSecureServer']);
  replaceFunctions(dns, [
    'lookup', 'lookupService', 'resolve', 'resolve4', 'resolve6', 'resolveAny',
    'resolveCaa', 'resolveCname', 'resolveMx', 'resolveNaptr', 'resolveNs',
    'resolvePtr', 'resolveSoa', 'resolveSrv', 'reverse',
  ]);
  replaceFunctions(dnsPromises, [
    'lookup', 'lookupService', 'resolve', 'resolve4', 'resolve6', 'resolveAny',
    'resolveCaa', 'resolveCname', 'resolveMx', 'resolveNaptr', 'resolveNs',
    'resolvePtr', 'resolveSoa', 'resolveSrv', 'reverse',
  ]);
  replaceGlobalFunction('fetch');
  replaceGlobalFunction('WebSocket');
  syncBuiltinESMExports();
  return NETWORK_BOUNDARY_LABEL;
}

const NETWORK_BOUNDARY_READY = installNetworkDenialFacade();

function confirmNetworkFacade() {
  if (NETWORK_BOUNDARY_READY !== NETWORK_BOUNDARY_LABEL || net.connect !== denyNetwork) {
    throw new Error('network boundary rejected');
  }
  let denied = false;
  try {
    net.connect();
  } catch (error) {
    denied = error === NETWORK_DENIAL_SIGNAL;
  }
  if (!denied || networkAttemptCount !== 1) throw new Error('network boundary rejected');
}

function boundaryIsQuiet() {
  if (NETWORK_BOUNDARY_READY !== NETWORK_BOUNDARY_LABEL ||
      networkAttemptCount !== 1 || net.connect !== denyNetwork) {
    throw new Error('network boundary rejected');
  }
}

function writePrivateBytes(bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const written = writeSync(4, bytes, offset, bytes.length - offset);
    if (!Number.isInteger(written) || written <= 0) throw new Error('pipe rejected');
    offset += written;
  }
}

function writePrivateFrame(type, payload = Buffer.alloc(0)) {
  const frame = Buffer.alloc(7 + payload.length);
  RESPONSE_MAGIC.copy(frame, 0);
  frame[4] = PROTOCOL_VERSION;
  frame[5] = type;
  frame[6] = payload.length;
  payload.copy(frame, 7);
  try {
    writePrivateBytes(frame);
  } finally {
    frame.fill(0);
  }
}

function readRequestFrame() {
  const frame = Buffer.alloc(REQUEST_BYTES + 1);
  let length = 0;
  while (length < frame.length) {
    const read = readSync(3, frame, length, frame.length - length, null);
    if (!Number.isInteger(read) || read < 0) throw new Error('pipe rejected');
    if (read === 0) break;
    length += read;
  }
  if (length !== REQUEST_BYTES || !frame.subarray(0, 4).equals(REQUEST_MAGIC) ||
      frame[4] !== PROTOCOL_VERSION || frame[5] !== 0) {
    frame.fill(0);
    throw new Error('request rejected');
  }
  const difficultyValue = frame.readBigUInt64BE(57);
  if (difficultyValue < 1n || difficultyValue > BigInt(Number.MAX_SAFE_INTEGER)) {
    frame.fill(0);
    throw new Error('request rejected');
  }
  return {
    difficulty: Number(difficultyValue),
    frame,
    payerCore: frame.subarray(5, 25),
    previousAccountHash: frame.subarray(25, 57),
  };
}

function exactNonceBytes(value) {
  if (typeof value !== 'string' || value.length !== 16) {
    throw new Error('generated nonce rejected');
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const decimal = code >= 48 && code <= 57;
    const lowercase = code >= 97 && code <= 102;
    if (!decimal && !lowercase) throw new Error('generated nonce rejected');
  }
  const nonce = Buffer.from(value, 'hex');
  if (nonce.length !== 8 || nonce.toString('hex') !== value) {
    nonce.fill(0);
    throw new Error('generated nonce rejected');
  }
  return nonce;
}

async function main() {
  if (process.argv.length !== 2) throw new Error('arguments rejected');
  confirmNetworkFacade();
  const { generate } = await import('../../../node_modules/znn-typescript-sdk/dist/pow/pow.js');
  if (typeof generate !== 'function') throw new Error('wrapper rejected');
  boundaryIsQuiet();
  writePrivateFrame(FRAME_READY);

  const request = readRequestFrame();
  let domain;
  try {
    domain = createHash('sha3-256')
      .update(request.payerCore)
      .update(request.previousAccountHash)
      .digest('hex');
  } finally {
    request.frame.fill(0);
  }

  let generated;
  try {
    generated = generate(domain, request.difficulty);
  } catch {
    writePrivateFrame(FRAME_WRAPPER_INVOKED);
    writePrivateFrame(FRAME_REJECTION);
    return;
  }
  // This marker confirms only the JavaScript wrapper call, not native/WASM entry.
  writePrivateFrame(FRAME_WRAPPER_INVOKED);
  try {
    const nonce = exactNonceBytes(await generated);
    try {
      boundaryIsQuiet();
      writePrivateFrame(FRAME_SUCCESS, nonce);
    } finally {
      nonce.fill(0);
    }
  } catch {
    writePrivateFrame(FRAME_REJECTION);
  }
}

main().catch(() => {
  process.exitCode = 1;
});
