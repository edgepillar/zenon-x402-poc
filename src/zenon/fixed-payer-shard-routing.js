import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { closeSync, constants as fsConstants, fstatSync, lstatSync, openSync, readSync,
  realpathSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { TextDecoder, types as utilTypes } from 'node:util';
const MANIFEST_BYTES_MAX = 4096;
const PATH_BYTES_MAX = 4096;
const KIND = 'zenon-fixed-payer-shard-routing';
const DOMAIN = 'zenon-x402-fixed-payer-shard-routing-v1';
const CONFIGURATION_FIELDS = ['schemaVersion', 'kind', 'routingVersion', 'shardIds'];
const OPTION_FIELDS = ['privateRoot', 'expectedManifestFingerprint', 'expectedConfiguration'];
const GENERATION_FIELDS = ['dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs'];
const SHARD_ID = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const FINGERPRINT = /^sha256:[0-9a-f]{64}$/;
const BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
export const FIXED_PAYER_SHARD_MANIFEST_FILE = 'fixed-payer-shards.v1.json';
export const FIXED_PAYER_SHARD_ROUTING_VERSION = 1;
export const FIXED_PAYER_SHARD_ROUTING_ERROR_CODES = Object.freeze({
  INVALID_CONFIGURATION: 'INVALID_CONFIGURATION', UNSAFE_PRIVATE_ROOT: 'UNSAFE_PRIVATE_ROOT',
  UNSAFE_MANIFEST: 'UNSAFE_MANIFEST', MANIFEST_MISMATCH: 'MANIFEST_MISMATCH',
  INVALID_PAYER: 'INVALID_PAYER',
});
const CODES = FIXED_PAYER_SHARD_ROUTING_ERROR_CODES;
export class FixedPayerShardRoutingError extends Error {
  constructor(code) {
    super(code);
    this.name = 'FixedPayerShardRoutingError';
    this.code = code;
    this.stack = undefined;
  }
}
function fail(code) {
  throw new FixedPayerShardRoutingError(code);
}
function exactRecord(value, fields, code) {
  if (value === null || typeof value !== 'object' || utilTypes.isProxy(value) ||
      Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).length !== fields.length) fail(code);
  return fields.map(field => {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (descriptor === undefined || descriptor.enumerable !== true ||
        !Object.hasOwn(descriptor, 'value')) fail(code);
    return descriptor.value;
  });
}
function exactShardIds(value, code) {
  if (!Array.isArray(value) || utilTypes.isProxy(value) ||
      Object.getPrototypeOf(value) !== Array.prototype || value.length !== 2 ||
      Reflect.ownKeys(value).length !== 3) fail(code);
  const result = [];
  for (let index = 0; index < 2; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || descriptor.enumerable !== true ||
        !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'string' ||
        !SHARD_ID.test(descriptor.value)) fail(code);
    result[index] = descriptor.value;
  }
  if (result[0] === result[1]) fail(code);
  return Object.freeze(result);
}
function routingConfiguration(value, code) {
  const [schemaVersion, kind, routingVersion, shardIds] = exactRecord(
    value, CONFIGURATION_FIELDS, code,
  );
  if (schemaVersion !== 1 || kind !== KIND ||
      routingVersion !== FIXED_PAYER_SHARD_ROUTING_VERSION) fail(code);
  return Object.freeze({
    schemaVersion, kind, routingVersion, shardIds: exactShardIds(shardIds, code),
  });
}

function captureOptions(value) {
  const [privateRoot, expectedManifestFingerprint, expectedConfiguration] = exactRecord(
    value, OPTION_FIELDS, CODES.INVALID_CONFIGURATION,
  );
  if (typeof privateRoot !== 'string' || privateRoot.length < 1 ||
      Buffer.byteLength(privateRoot, 'utf8') > PATH_BYTES_MAX ||
      !isAbsolute(privateRoot) || resolve(privateRoot) !== privateRoot ||
      typeof expectedManifestFingerprint !== 'string' ||
      !FINGERPRINT.test(expectedManifestFingerprint)) fail(CODES.INVALID_CONFIGURATION);
  return Object.freeze({
    privateRoot,
    expectedManifestFingerprint,
    expectedConfiguration: routingConfiguration(expectedConfiguration, CODES.INVALID_CONFIGURATION),
  });
}
function sameGeneration(left, right) {
  return GENERATION_FIELDS.every(field => left[field] === right[field]);
}

function currentUid() {
  if (typeof process.getuid !== 'function') fail(CODES.UNSAFE_PRIVATE_ROOT);
  const uid = process.getuid();
  if (!Number.isSafeInteger(uid) || uid < 0) fail(CODES.UNSAFE_PRIVATE_ROOT);
  return BigInt(uid);
}
function safeRoot(stat, uid) {
  return stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === uid &&
    stat.nlink >= 1n && (stat.mode & 0o7777n) === 0o700n;
}

function safeManifest(stat, uid) {
  return stat.isFile() && !stat.isSymbolicLink() && stat.uid === uid &&
    stat.nlink === 1n && (stat.mode & 0o7777n) === 0o600n &&
    stat.size >= 1n && stat.size <= BigInt(MANIFEST_BYTES_MAX);
}
function readManifest(privateRoot) {
  let rootDescriptor;
  let manifestDescriptor;
  let content;
  let phase = CODES.UNSAFE_PRIVATE_ROOT;
  let failureCode;
  try {
    const { O_CLOEXEC = 0, O_DIRECTORY = 0, O_NOFOLLOW = 0, O_NONBLOCK = 0,
      O_RDONLY } = fsConstants;
    if (![O_CLOEXEC, O_DIRECTORY, O_NOFOLLOW, O_NONBLOCK, O_RDONLY]
      .every(Number.isInteger) || O_DIRECTORY === 0 || O_NOFOLLOW === 0 ||
      O_NONBLOCK === 0) fail(phase);
    const uid = currentUid();
    const rootBefore = lstatSync(privateRoot, { bigint: true });
    if (!safeRoot(rootBefore, uid) || realpathSync(privateRoot) !== privateRoot) fail(phase);
    rootDescriptor = openSync(
      privateRoot, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC,
    );
    if (!sameGeneration(rootBefore, fstatSync(rootDescriptor, { bigint: true }))) fail(phase);
    phase = CODES.UNSAFE_MANIFEST;
    const manifestPath = join(privateRoot, FIXED_PAYER_SHARD_MANIFEST_FILE);
    const before = lstatSync(manifestPath, { bigint: true });
    if (!safeManifest(before, uid) || realpathSync(manifestPath) !== manifestPath) fail(phase);
    manifestDescriptor = openSync(manifestPath, O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC);
    const opened = fstatSync(manifestDescriptor, { bigint: true });
    if (!safeManifest(opened, uid) || !sameGeneration(before, opened)) fail(phase);
    const buffer = Buffer.alloc(MANIFEST_BYTES_MAX + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const count = readSync(manifestDescriptor, buffer, offset, buffer.length - offset, offset);
      if (!Number.isSafeInteger(count) || count < 0) fail(phase);
      if (count === 0) break;
      offset += count;
    }
    const after = fstatSync(manifestDescriptor, { bigint: true });
    const pathAfter = lstatSync(manifestPath, { bigint: true });
    if (offset !== Number(opened.size) || offset > MANIFEST_BYTES_MAX || !safeManifest(after, uid) ||
        !sameGeneration(opened, after) || !sameGeneration(after, pathAfter) ||
        realpathSync(manifestPath) !== manifestPath) fail(phase);
    content = buffer.subarray(0, offset);
    phase = CODES.UNSAFE_PRIVATE_ROOT;
    const rootAfter = lstatSync(privateRoot, { bigint: true });
    if (!safeRoot(rootAfter, uid) || !sameGeneration(rootBefore, rootAfter) ||
        realpathSync(privateRoot) !== privateRoot) fail(phase);
  } catch {
    failureCode = phase;
  } finally {
    for (const descriptor of [manifestDescriptor, rootDescriptor]) {
      if (descriptor !== undefined) {
        try { closeSync(descriptor); } catch { failureCode ??= phase; }
      }
    }
  }
  if (failureCode !== undefined || content === undefined) fail(failureCode ?? phase);
  return content;
}

function canonicalManifest(configuration) {
  return `${JSON.stringify({
    schemaVersion: configuration.schemaVersion, kind: configuration.kind,
    routingVersion: configuration.routingVersion, shardIds: configuration.shardIds,
  })}\n`;
}
function parseManifest(bytes, expectedFingerprint, expectedConfiguration) {
  const fingerprint = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (fingerprint !== expectedFingerprint) fail(CODES.MANIFEST_MISMATCH);
  let parsed;
  let text;
  try {
    text = UTF8.decode(bytes);
    parsed = routingConfiguration(JSON.parse(text), CODES.MANIFEST_MISMATCH);
  } catch (error) {
    if (error instanceof FixedPayerShardRoutingError) throw error;
    fail(CODES.MANIFEST_MISMATCH);
  }
  if (text !== canonicalManifest(parsed) || canonicalManifest(parsed) !==
      canonicalManifest(expectedConfiguration)) fail(CODES.MANIFEST_MISMATCH);
  return parsed;
}

function polymodStep(checksum, word) {
  const top = checksum >>> 25;
  let result = ((checksum & 0x1ffffff) << 5) ^ word;
  for (let index = 0; index < 5; index += 1) {
    if ((top >>> index) & 1) result ^= BECH32_GENERATORS[index];
  }
  return result >>> 0;
}
function canonicalUserAddress(value) {
  if (typeof value !== 'string' || value.length !== 40 || value[0] !== 'z' ||
      value[1] !== '1') return false;
  let checksum = polymodStep(polymodStep(polymodStep(1, 3), 0), 26);
  const words = [];
  for (let index = 2; index < 40; index += 1) {
    const word = BECH32.indexOf(value[index]);
    if (word < 0) return false;
    words.push(word);
    checksum = polymodStep(checksum, word);
  }
  if (checksum !== 1) return false;
  let accumulator = 0;
  let bits = 0;
  let nonzero = false;
  const bytes = [];
  for (let index = 0; index < 32; index += 1) {
    accumulator = (accumulator << 5) | words[index];
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      const byte = (accumulator >>> bits) & 255;
      bytes.push(byte);
      if (byte !== 0) nonzero = true;
    }
  }
  return bytes.length === 20 && bits === 0 && bytes[0] === 0 && nonzero;
}
export function createFixedPayerShardRouting(options) {
  if (arguments.length !== 1) fail(CODES.INVALID_CONFIGURATION);
  const captured = captureOptions(options);
  const manifest = parseManifest(readManifest(captured.privateRoot),
    captured.expectedManifestFingerprint, captured.expectedConfiguration);
  const route = Object.freeze(function route(payer) {
    if (arguments.length !== 1 || !canonicalUserAddress(payer)) fail(CODES.INVALID_PAYER);
    const digest = createHash('sha256').update(DOMAIN).update('\0').update(payer).digest();
    return Object.freeze({
      version: manifest.routingVersion,
      shardId: manifest.shardIds[digest[0] & 1],
    });
  });
  return Object.freeze({ route });
}
