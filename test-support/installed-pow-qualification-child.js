import dgram from 'node:dgram';
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import { createHash } from 'node:crypto';
import { writeSync } from 'node:fs';
import http from 'node:http';
import http2 from 'node:http2';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import tls from 'node:tls';

const MODES = Object.freeze([
  'import-only',
  'generate-2',
  'generate-3',
  'empty',
  'truncated',
  'malformed',
  'high-bit',
  'oversized',
  'invalid-nonce',
  'nonzero',
  'child-error',
  'delayed',
]);
const ADDRESS_CORE = Buffer.concat([
  Buffer.alloc(1),
  createHash('sha3-256')
    .update('installed-pow-qualification-public-payer')
    .digest()
    .subarray(0, 19),
]);
const PREVIOUS_ACCOUNT_HASH = createHash('sha3-256')
  .update('installed-pow-qualification-public-previous-hash')
  .digest();
const KNOWN_INVALID_NONCE = '0200000000000000';
const NETWORK_DENIED_FRAME = 'NETWORK_DENIED\n';
const SDK_INVOCATION_FRAME = 'SDK_INVOCATION\n';
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
  if (!descriptor) {
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

function installNetworkDenial() {
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
  return true;
}

const NETWORK_BOUNDARY_READY = installNetworkDenial();

function probeConfirmedNetworkDenial() {
  const confirmedDeny = net.connect;
  if (confirmedDeny !== denyNetwork) {
    throw new Error('network safeguard unavailable');
  }
  let denied = false;
  try {
    confirmedDeny();
  } catch (error) {
    denied = error === NETWORK_DENIAL_SIGNAL;
  }
  if (!denied || networkAttemptCount !== 1) {
    throw new Error('network safeguard rejected');
  }
  return true;
}

const NETWORK_DENIAL_PROBE_READY = probeConfirmedNetworkDenial();

function boundaryIsQuiet() {
  if (NETWORK_BOUNDARY_READY !== true ||
      NETWORK_DENIAL_PROBE_READY !== true || networkAttemptCount !== 1) {
    throw new Error('child boundary rejected');
  }
}

function writePrivateBytes(frame) {
  boundaryIsQuiet();
  let offset = 0;
  while (offset < frame.length) {
    const written = writeSync(3, frame, offset, frame.length - offset);
    if (!Number.isInteger(written) || written <= 0) throw new Error('pipe rejected');
    offset += written;
  }
}

function writePrivateFrame(value) {
  const frame = Buffer.from(value, 'ascii');
  try {
    writePrivateBytes(frame);
  } finally {
    frame.fill(0);
  }
}

function writeHighBitFrame() {
  const frame = Buffer.from(KNOWN_INVALID_NONCE, 'ascii');
  frame[frame.length - 1] = 0xb0;
  try {
    writePrivateBytes(frame);
  } finally {
    frame.fill(0);
  }
}

function exactGeneratedNonce(value) {
  if (typeof value !== 'string' || value.length !== 16) {
    throw new Error('generated nonce rejected');
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (!((code >= 48 && code <= 57) || (code >= 97 && code <= 102))) {
      throw new Error('generated nonce rejected');
    }
  }
  return value;
}

function importPowModule() {
  return import('../node_modules/znn-typescript-sdk/dist/pow/pow.js');
}

async function generateInstalledSdk(difficulty) {
  const domain = createHash('sha3-256')
    .update(ADDRESS_CORE)
    .update(PREVIOUS_ACCOUNT_HASH)
    .digest('hex');
  const { generate } = await importPowModule();
  const generated = generate(domain, difficulty);
  // This acknowledges the SDK wrapper call, not native or WASM entry.
  writePrivateFrame(SDK_INVOCATION_FRAME);
  const nonce = exactGeneratedNonce(await generated);
  boundaryIsQuiet();
  writePrivateFrame(nonce);
}

function isReadDenied(error) {
  return error !== null && typeof error === 'object' &&
    error.code === 'ERR_ACCESS_DENIED' &&
    error.permission === 'FileSystemRead';
}

async function diagnoseImport() {
  try {
    await importPowModule();
    boundaryIsQuiet();
    writePrivateFrame('IMPORT_READY');
  } catch (error) {
    writePrivateFrame(isReadDenied(error) ? 'READ_DENIED' : 'IMPORT_REJECTED');
  }
}

async function main() {
  if (process.argv.length !== 3 || !MODES.includes(process.argv[2])) {
    throw new Error('mode rejected');
  }
  const mode = process.argv[2];
  writePrivateFrame(NETWORK_DENIED_FRAME);
  if (mode === 'import-only') {
    await diagnoseImport();
    return;
  }
  if (mode === 'generate-2' || mode === 'generate-3') {
    await generateInstalledSdk(mode === 'generate-2' ? 2 : 3);
    return;
  }
  if (mode === 'truncated') writePrivateFrame('000000000000000');
  if (mode === 'malformed') writePrivateFrame('000000000000000g');
  if (mode === 'high-bit') writeHighBitFrame();
  if (mode === 'oversized') writePrivateFrame('00000000000000000');
  if (mode === 'invalid-nonce') writePrivateFrame(KNOWN_INVALID_NONCE);
  if (mode === 'nonzero') {
    writePrivateFrame(KNOWN_INVALID_NONCE);
    process.exitCode = 7;
  }
  if (mode === 'child-error') throw new Error('fixed child error');
  if (mode === 'delayed') {
    await new Promise(resolve => setTimeout(resolve, 60_000));
    writePrivateFrame(KNOWN_INVALID_NONCE);
  }
  boundaryIsQuiet();
}

main().catch(() => {
  process.exitCode = 1;
});
