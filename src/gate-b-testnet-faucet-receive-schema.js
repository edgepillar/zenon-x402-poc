import { BlockList, isIP } from 'node:net';
import { TextDecoder, types as utilTypes } from 'node:util';

import { canonicalJson } from './canonical.js';

const ERROR_CODE = 'gate_b_testnet_faucet_receive_schema_invalid';
const BOOTSTRAP_MAX_BYTES = 4096;
const FRAME_HEADER_BYTES = 4;
const ARRAY_IS_ARRAY = Array.isArray;
const BUFFER_BYTE_LENGTH = Buffer.byteLength;
const BUFFER_FROM = Buffer.from;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const PUBLIC_ADDRESS_BLOCKLIST = new BlockList();

for (const [network, prefix, family] of [
  ['0.0.0.0', 8, 'ipv4'], ['10.0.0.0', 8, 'ipv4'], ['100.64.0.0', 10, 'ipv4'],
  ['127.0.0.0', 8, 'ipv4'], ['169.254.0.0', 16, 'ipv4'], ['172.16.0.0', 12, 'ipv4'],
  ['192.0.0.0', 24, 'ipv4'], ['192.0.2.0', 24, 'ipv4'], ['192.168.0.0', 16, 'ipv4'],
  ['198.18.0.0', 15, 'ipv4'], ['198.51.100.0', 24, 'ipv4'], ['203.0.113.0', 24, 'ipv4'],
  ['224.0.0.0', 4, 'ipv4'], ['240.0.0.0', 4, 'ipv4'],
  ['::', 128, 'ipv6'], ['::1', 128, 'ipv6'], ['64:ff9b::', 96, 'ipv6'],
  ['64:ff9b:1::', 48, 'ipv6'], ['100::', 64, 'ipv6'], ['2001::', 23, 'ipv6'],
  ['2001:db8::', 32, 'ipv6'], ['2002::', 16, 'ipv6'], ['fc00::', 7, 'ipv6'],
  ['fec0::', 10, 'ipv6'], ['fe80::', 10, 'ipv6'], ['ff00::', 8, 'ipv6'],
]) {
  PUBLIC_ADDRESS_BLOCKLIST.addSubnet(network, prefix, family);
}

export const GATE_B_TESTNET_FAUCET_RECEIVE_ACKNOWLEDGEMENT =
  'I_CONFIRM_THE_TWO_PENDING_NATIVE_TESTNET_SENDS_ARE_THE_INTENDED_FAUCET_FUNDING_AND_AUTHORIZE_ONE_POW_RECEIVE_FOR_EACH';

export const GATE_B_TESTNET_FAUCET_RECEIVE_STATUS_LINES = Object.freeze({
  COMPLETE: 'GATE_B_TESTNET_FAUCET_RECEIVE_COMPLETE\n',
  RECOVERED: 'GATE_B_TESTNET_FAUCET_RECEIVE_RECOVERED\n',
  OUTCOME_UNKNOWN: 'GATE_B_TESTNET_FAUCET_RECEIVE_OUTCOME_UNKNOWN\n',
  FAILURE: 'GATE_B_TESTNET_FAUCET_RECEIVE_FAILED\n',
});

export const GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES = Object.freeze({
  FRESH: 'MODE_FRESH',
  PARTIAL_RECOVERY: 'MODE_PARTIAL_RECOVERY',
  READ_ONLY_RECOVERY: 'MODE_READ_ONLY_RECOVERY',
});

export const GATE_B_TESTNET_FAUCET_RECEIVE_LIMITS = Object.freeze({
  bootstrapBytes: BOOTSTRAP_MAX_BYTES,
  frameBytes: BOOTSTRAP_MAX_BYTES + FRAME_HEADER_BYTES,
  expectedTransfers: 2,
  pageSize: 50,
});

export class GateBTestnetFaucetReceiveSchemaError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBTestnetFaucetReceiveSchemaError';
    this.code = ERROR_CODE;
    this.stack = undefined;
  }
}

function fail() {
  throw new GateBTestnetFaucetReceiveSchemaError();
}

function exactPlainObject(value, fields) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) ||
      ARRAY_IS_ARRAY(value) || GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const keys = REFLECT_OWN_KEYS(value);
  if (keys.length !== fields.length) fail();
  for (let index = 0; index < fields.length; index += 1) {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, fields[index]);
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail();
  }
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== 'string' || !fields.includes(keys[index])) fail();
  }
  return value;
}

function exactPublicWsEndpoint(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 512 ||
      BUFFER_BYTE_LENGTH(value, 'utf8') !== value.length || /[\u0000-\u0020\u007f]/u.test(value) ||
      value.includes('%') || value.includes('?') || value.includes('#')) fail();
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail();
  }
  if (parsed.protocol !== 'ws:' || parsed.username || parsed.password || parsed.search ||
      parsed.hash || parsed.pathname !== '/' || parsed.port === '' || parsed.port === '80' ||
      parsed.href !== value) fail();
  const address = parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
    ? parsed.hostname.slice(1, -1)
    : parsed.hostname;
  const family = isIP(address);
  if ((family !== 4 && family !== 6) ||
      (family === 6 && /^::ffff:/iu.test(address)) ||
      PUBLIC_ADDRESS_BLOCKLIST.check(address, family === 4 ? 'ipv4' : 'ipv6')) fail();
  const port = Number(parsed.port);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) fail();
  return value;
}

function validateBootstrap(value) {
  exactPlainObject(value, ['acknowledgement', 'rpcEndpoint', 'schemaVersion']);
  if (value.schemaVersion !== 1 ||
      value.acknowledgement !== GATE_B_TESTNET_FAUCET_RECEIVE_ACKNOWLEDGEMENT) fail();
  exactPublicWsEndpoint(value.rpcEndpoint);
  return value;
}

function serializeBootstrap(value) {
  validateBootstrap(value);
  const text = canonicalJson(value);
  const bytes = BUFFER_FROM(text, 'utf8');
  if (bytes.length < 1 || bytes.length > BOOTSTRAP_MAX_BYTES) {
    bytes.fill(0);
    fail();
  }
  return bytes;
}

export function frameGateBTestnetFaucetReceiveBootstrap(value) {
  let payload;
  try {
    payload = serializeBootstrap(value);
    const frame = Buffer.alloc(FRAME_HEADER_BYTES + payload.length);
    frame.writeUInt32BE(payload.length, 0);
    payload.copy(frame, FRAME_HEADER_BYTES);
    return frame;
  } catch {
    fail();
  } finally {
    if (Buffer.isBuffer(payload)) payload.fill(0);
  }
}

export function parseGateBTestnetFaucetReceiveFrame(frame) {
  try {
    if (!Buffer.isBuffer(frame) || IS_PROXY(frame) ||
        frame.length < FRAME_HEADER_BYTES + 1 ||
        frame.length > BOOTSTRAP_MAX_BYTES + FRAME_HEADER_BYTES) fail();
    const length = frame.readUInt32BE(0);
    if (length < 1 || length > BOOTSTRAP_MAX_BYTES ||
        frame.length !== FRAME_HEADER_BYTES + length) fail();
    const payload = frame.subarray(FRAME_HEADER_BYTES);
    const text = UTF8_DECODER.decode(payload);
    if (BUFFER_BYTE_LENGTH(text, 'utf8') !== payload.length) fail();
    const value = JSON.parse(text);
    validateBootstrap(value);
    if (canonicalJson(value) !== text) fail();
    return Object.freeze({
      acknowledgement: value.acknowledgement,
      rpcEndpoint: value.rpcEndpoint,
      schemaVersion: 1,
    });
  } catch {
    fail();
  }
}
