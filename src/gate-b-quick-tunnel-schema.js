import { isAbsolute, resolve } from 'node:path';
import { types as utilTypes } from 'node:util';

import { canonicalJson } from './canonical.js';
import {
  parseGateBQuickTunnelHostnameSource,
  serializeGateBQuickTunnelHostnameSource,
} from './gate-b-public-ws-inputs-schema.js';

const ERROR_CODE = 'gate_b_quick_tunnel_schema_invalid';
const BOOTSTRAP_MAX_BYTES = 8192;
const FRAME_HEADER_BYTES = 4;
const HTTP_BODY_MAX_BYTES = 256;
const LSOF_MAX_BYTES = 1024;
const ORIGIN_LISTENER_PORT = 41000;
const LOWERCASE_HASH_64 = /^[0-9a-f]{64}$/;
const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

export const GATE_B_QUICK_TUNNEL_OPERATIONS = Object.freeze({
  START: 'START',
});

export const GATE_B_QUICK_TUNNEL_TELEMETRY_MODES = Object.freeze({
  ACCEPT_POSSIBLE_ERROR_TELEMETRY: 'ACCEPT_POSSIBLE_ERROR_TELEMETRY',
  EXTERNAL_SENTRY_EGRESS_CONTROL_ATTESTED: 'EXTERNAL_SENTRY_EGRESS_CONTROL_ATTESTED',
});

export const GATE_B_QUICK_TUNNEL_TELEMETRY_ACKNOWLEDGEMENTS = Object.freeze({
  ACCEPT_POSSIBLE_ERROR_TELEMETRY:
    'I_ACCEPT_THAT_CLOUDFLARED_MAY_SEND_ERROR_TELEMETRY',
  EXTERNAL_SENTRY_EGRESS_CONTROL_ATTESTED:
    'I_ATTEST_THAT_EXTERNAL_EGRESS_CONTROL_BLOCKS_CLOUDFLARED_SENTRY_TELEMETRY',
});

const TELEMETRY_PAIRS = Object.freeze({
  [GATE_B_QUICK_TUNNEL_TELEMETRY_MODES.ACCEPT_POSSIBLE_ERROR_TELEMETRY]:
    GATE_B_QUICK_TUNNEL_TELEMETRY_ACKNOWLEDGEMENTS.ACCEPT_POSSIBLE_ERROR_TELEMETRY,
  [GATE_B_QUICK_TUNNEL_TELEMETRY_MODES.EXTERNAL_SENTRY_EGRESS_CONTROL_ATTESTED]:
    GATE_B_QUICK_TUNNEL_TELEMETRY_ACKNOWLEDGEMENTS.EXTERNAL_SENTRY_EGRESS_CONTROL_ATTESTED,
});

export const GATE_B_QUICK_TUNNEL_IPC_TYPES = Object.freeze({
  READY: 'READY',
  START: 'START',
  ACTIVE: 'ACTIVE',
  CHECK: 'CHECK',
  CHECKED: 'CHECKED',
  STOP: 'STOP',
  STOPPED: 'STOPPED',
});

export const GATE_B_QUICK_TUNNEL_LIMITS = Object.freeze({
  bootstrapBytes: BOOTSTRAP_MAX_BYTES,
  frameBytes: BOOTSTRAP_MAX_BYTES + FRAME_HEADER_BYTES,
  httpBodyBytes: HTTP_BODY_MAX_BYTES,
  lsofBytes: LSOF_MAX_BYTES,
});

export class GateBQuickTunnelSchemaError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBQuickTunnelSchemaError';
    this.code = ERROR_CODE;
    this.stack = `GateBQuickTunnelSchemaError: ${ERROR_CODE}`;
  }
}

function fail() {
  throw new GateBQuickTunnelSchemaError();
}

function exactPlainObject(value, fields) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) || ARRAY_IS_ARRAY(value) ||
      GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
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

function exactArray(value, expectedLength) {
  if (!ARRAY_IS_ARRAY(value) || IS_PROXY(value) ||
      GET_PROTOTYPE_OF(value) !== Array.prototype || value.length !== expectedLength) fail();
  const keys = REFLECT_OWN_KEYS(value);
  if (keys.length !== expectedLength + 1 || keys[keys.length - 1] !== 'length') fail();
  for (let index = 0; index < expectedLength; index += 1) {
    if (keys[index] !== String(index)) fail();
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, String(index));
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail();
  }
  return value;
}

function exactString(value, maximumBytes = 4096) {
  if (typeof value !== 'string' || value.length < 1 ||
      Buffer.byteLength(value, 'utf8') > maximumBytes ||
      /[\u0000-\u001f\u007f]/u.test(value)) fail();
  return value;
}

function exactAbsolutePath(value) {
  exactString(value);
  if (!isAbsolute(value) || resolve(value) !== value) fail();
  return value;
}

function exactPositiveSafeInteger(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail();
  return value;
}

function exactEnum(value, enumeration) {
  if (typeof value !== 'string' || !Object.values(enumeration).includes(value)) fail();
  return value;
}

function validateBootstrap(value) {
  exactPlainObject(value, [
    'cloudflaredExecutable', 'operation', 'schemaVersion', 'sourcePin',
    'telemetryAcknowledgement', 'telemetryMode', 'workspaceRoot',
  ]);
  if (value.schemaVersion !== 1 ||
      value.operation !== GATE_B_QUICK_TUNNEL_OPERATIONS.START ||
      typeof value.sourcePin !== 'string' || !LOWERCASE_HASH_64.test(value.sourcePin)) fail();
  exactAbsolutePath(value.workspaceRoot);
  exactAbsolutePath(value.cloudflaredExecutable);
  exactEnum(value.telemetryMode, GATE_B_QUICK_TUNNEL_TELEMETRY_MODES);
  if (value.telemetryAcknowledgement !== TELEMETRY_PAIRS[value.telemetryMode]) fail();
  return value;
}

function serializeBootstrap(value) {
  validateBootstrap(value);
  const bytes = Buffer.from(canonicalJson(value), 'utf8');
  if (bytes.length < 1 || bytes.length > BOOTSTRAP_MAX_BYTES) {
    bytes.fill(0);
    fail();
  }
  return bytes;
}

export function frameGateBQuickTunnelBootstrap(value) {
  let payload;
  try {
    payload = serializeBootstrap(value);
    const frame = Buffer.allocUnsafe(FRAME_HEADER_BYTES + payload.length);
    frame.writeUInt32BE(payload.length, 0);
    payload.copy(frame, FRAME_HEADER_BYTES);
    return frame;
  } catch {
    fail();
  } finally {
    if (Buffer.isBuffer(payload)) payload.fill(0);
  }
}

export function parseGateBQuickTunnelBootstrapFrame(frame) {
  try {
    if (!Buffer.isBuffer(frame) || IS_PROXY(frame) ||
        frame.length < FRAME_HEADER_BYTES + 1 ||
        frame.length > BOOTSTRAP_MAX_BYTES + FRAME_HEADER_BYTES) fail();
    const length = frame.readUInt32BE(0);
    if (length < 1 || length > BOOTSTRAP_MAX_BYTES ||
        frame.length !== FRAME_HEADER_BYTES + length) fail();
    const payload = frame.subarray(FRAME_HEADER_BYTES);
    const text = UTF8_DECODER.decode(payload);
    if (Buffer.byteLength(text, 'utf8') !== payload.length) fail();
    const value = JSON.parse(text);
    validateBootstrap(value);
    if (canonicalJson(value) !== text) fail();
    return Object.freeze(value);
  } catch {
    fail();
  }
}

function validateIpcMessage(value, expectedType, expectedRequestId) {
  exactPlainObject(value, ['ipcVersion', 'requestId', 'type']);
  if (value.ipcVersion !== 1) fail();
  exactPositiveSafeInteger(value.requestId);
  exactEnum(value.type, GATE_B_QUICK_TUNNEL_IPC_TYPES);
  if (expectedType !== undefined) {
    exactEnum(expectedType, GATE_B_QUICK_TUNNEL_IPC_TYPES);
    if (value.type !== expectedType) fail();
  }
  if (expectedRequestId !== undefined) {
    exactPositiveSafeInteger(expectedRequestId);
    if (value.requestId !== expectedRequestId) fail();
  }
  return value;
}

export function createGateBQuickTunnelIpcMessage(type, requestId) {
  try {
    const value = { ipcVersion: 1, requestId, type };
    validateIpcMessage(value);
    return Object.freeze(value);
  } catch {
    fail();
  }
}

export function parseGateBQuickTunnelIpcMessage(
  value,
  expectedType,
  expectedRequestId,
) {
  try {
    validateIpcMessage(value, expectedType, expectedRequestId);
    return Object.freeze({
      ipcVersion: value.ipcVersion,
      requestId: value.requestId,
      type: value.type,
    });
  } catch {
    fail();
  }
}

function canonicalDecimal(value) {
  return /^(?:0|[1-9][0-9]*)$/.test(value);
}

export function parseGateBQuickTunnelLsofSnapshot(bytes, expectedPid) {
  try {
    exactPositiveSafeInteger(expectedPid);
    if (!Buffer.isBuffer(bytes) || IS_PROXY(bytes) || bytes.length < 1 ||
        bytes.length > LSOF_MAX_BYTES || bytes[bytes.length - 1] !== 0x0a) fail();
    for (let index = 0; index < bytes.length; index += 1) {
      if (bytes[index] !== 0x00 && bytes[index] !== 0x0a &&
          (bytes[index] < 0x20 || bytes[index] > 0x7e)) fail();
    }
    const text = bytes.toString('latin1');
    const match = new RegExp(
      `^p${expectedPid}\\0\\nf(0|[1-9][0-9]*)\\0tIPv4\\0` +
      'n127\\.0\\.0\\.1:([1-9][0-9]{0,4})\\0PTCP\\0TST=LISTEN\\0\\n$',
    ).exec(text);
    if (!match) fail();
    const port = Number(match[2]);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535 ||
        port === ORIGIN_LISTENER_PORT || String(port) !== match[2]) fail();
    return Object.freeze({ address: '127.0.0.1', pid: expectedPid, port });
  } catch {
    fail();
  }
}

function validateHttpSnapshot(value) {
  exactPlainObject(value, [
    'body', 'complete', 'httpVersion', 'rawHeaders', 'rawTrailers', 'statusCode',
  ]);
  if (!Buffer.isBuffer(value.body) || IS_PROXY(value.body) || value.body.length < 1 ||
      value.body.length > HTTP_BODY_MAX_BYTES || value.complete !== true ||
      value.httpVersion !== '1.1' || value.statusCode !== 200) fail();
  exactArray(value.rawHeaders, 4);
  exactArray(value.rawTrailers, 0);
  if (value.rawHeaders[0] !== 'Content-Type' ||
      value.rawHeaders[1] !== 'text/plain; charset=utf-8' ||
      value.rawHeaders[2] !== 'Content-Length' ||
      value.rawHeaders[3] !== String(value.body.length) ||
      !canonicalDecimal(value.rawHeaders[3])) fail();
  return value.body;
}

function exactUtf8(bytes) {
  const text = UTF8_DECODER.decode(bytes);
  if (Buffer.byteLength(text, 'utf8') !== bytes.length) fail();
  return text;
}

export function parseGateBQuickTunnelHttpSnapshot(value) {
  let sourceBytes;
  try {
    const text = exactUtf8(validateHttpSnapshot(value));
    const body = JSON.parse(text);
    exactPlainObject(body, ['hostname']);
    exactString(body.hostname, 253);
    if (text !== `{"hostname":${JSON.stringify(body.hostname)}}`) fail();
    sourceBytes = serializeGateBQuickTunnelHostnameSource(body.hostname);
    const source = parseGateBQuickTunnelHostnameSource(sourceBytes);
    return Object.freeze({ hostname: source.hostname });
  } catch {
    fail();
  } finally {
    if (Buffer.isBuffer(sourceBytes)) sourceBytes.fill(0);
  }
}

export function parseGateBQuickTunnelReadyHttpSnapshot(value) {
  try {
    const text = exactUtf8(validateHttpSnapshot(value));
    const body = JSON.parse(text);
    exactPlainObject(body, ['status', 'readyConnections', 'connectorId']);
    if (body.status !== 200 || body.readyConnections !== 1 ||
        typeof body.connectorId !== 'string' || body.connectorId === NIL_UUID ||
        !CANONICAL_UUID.test(body.connectorId) ||
        text !== `{"status":200,"readyConnections":1,"connectorId":${
          JSON.stringify(body.connectorId)
        }}`) fail();
    return Object.freeze({
      connectorId: body.connectorId,
      readyConnections: body.readyConnections,
      status: body.status,
    });
  } catch {
    fail();
  }
}
