import { isAbsolute, resolve } from 'node:path';
import { types as utilTypes } from 'node:util';

import { canonicalJson } from './canonical.js';
import {
  GATE_B_CURRENT_TESTNET_WSS_ENDPOINT,
  GATE_B_CURRENT_TESTNET_WSS_INPUT_ACKNOWLEDGEMENTS,
  GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS,
} from './gate-b-public-ws-inputs-schema.js';
import {
  GATE_B_QUICK_TUNNEL_TELEMETRY_ACKNOWLEDGEMENTS,
  GATE_B_QUICK_TUNNEL_TELEMETRY_MODES,
} from './gate-b-quick-tunnel-schema.js';

const ERROR_CODE = 'gate_b_operator_coordinator_schema_invalid';
const FRAME_HEADER_BYTES = 4;
const BOOTSTRAP_MAX_BYTES = 8192;
const REVIEW_MAX_BYTES = 2048;
const RUN_MAX_BYTES = 512;
const RESULT_MAX_BYTES = 1024;
const ORIGIN_RELEASE_REQUEST_ID = 1;
const RUN_ACKNOWLEDGEMENT =
  'I_AUTHORIZE_EXACTLY_ONE_PUBLIC_TESTNET_GATE_B_PAYMENT_NOW_WITH_NO_RECOVERY_OR_PUBLICATION';
const RUN_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const LOWERCASE_HASH_64 = /^[0-9a-f]{64}$/;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

export const GATE_B_OPERATOR_COORDINATOR_ACKNOWLEDGEMENTS = Object.freeze({
  live: GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.live,
  operatorTrust: GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.operatorTrust,
  payment: GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.payment,
  currentTestnetWssPayment: GATE_B_CURRENT_TESTNET_WSS_INPUT_ACKNOWLEDGEMENTS.payment,
  publication: GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.publication,
  run: RUN_ACKNOWLEDGEMENT,
  transportException: GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.transportException,
});

export const GATE_B_OPERATOR_COORDINATOR_LIMITS = Object.freeze({
  bootstrapBytes: BOOTSTRAP_MAX_BYTES,
  bootstrapFrameBytes: BOOTSTRAP_MAX_BYTES + FRAME_HEADER_BYTES,
  initialFrameTimeoutMs: 30_000,
  originReleaseTimeoutMs: 4_000,
  gracefulStopMs: 4 * 60_000,
  lifetimeMs: 9 * 60_000,
  resultBytes: RESULT_MAX_BYTES,
  resultFrameBytes: RESULT_MAX_BYTES + FRAME_HEADER_BYTES,
  reviewBytes: REVIEW_MAX_BYTES,
  reviewChildTimeoutMs: 30_000,
  reviewFrameBytes: REVIEW_MAX_BYTES + FRAME_HEADER_BYTES,
  reviewFrameTimeoutMs: 120_000,
  runBytes: RUN_MAX_BYTES,
  runFrameBytes: RUN_MAX_BYTES + FRAME_HEADER_BYTES,
  runFrameTimeoutMs: 120_000,
});

export const GATE_B_OPERATOR_COORDINATOR_STATUS_LINES = Object.freeze({
  REVIEW_REQUIRED: 'GATE_B_CONTROLLER_REVIEW_REQUIRED_RUN_NOT_AUTHORIZED\n',
  PREFLIGHT_VALID: 'GATE_B_CONTROLLER_PREFLIGHT_VALID_RUN_NOT_AUTHORIZED\n',
  PENDING: 'GATE_B_CONTROLLER_PENDING_INDEPENDENT_VERIFICATION\n',
  CLOSED: 'GATE_B_CONTROLLER_CLOSED_RUN_NOT_EXECUTED\n',
  CLOSED_PENDING: 'GATE_B_CONTROLLER_CLOSED_PENDING_INDEPENDENT_VERIFICATION\n',
  QUARANTINED: 'GATE_B_CONTROLLER_FAILED_WORKSPACE_QUARANTINED\n',
});

export const GATE_B_OPERATOR_COORDINATOR_IPC_TYPES = Object.freeze({
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  PREFLIGHT_VALID: 'PREFLIGHT_VALID',
  PENDING: 'PENDING',
  STOP: 'STOP',
  STOPPED: 'STOPPED',
  QUARANTINED: 'QUARANTINED',
});

export const GATE_B_OPERATOR_ORIGIN_RELEASE_IPC_TYPES = Object.freeze({
  RELEASE_ORIGIN: 'RELEASE_ORIGIN',
  ORIGIN_RELEASED: 'ORIGIN_RELEASED',
});

export const GATE_B_OPERATOR_REVIEW_CHILD_IPC_TYPES = Object.freeze({
  READY: 'READY',
  REVIEW: 'REVIEW',
  REVIEWED: 'REVIEWED',
  STOP: 'STOP',
  STOPPED: 'STOPPED',
});

export class GateBOperatorCoordinatorSchemaError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBOperatorCoordinatorSchemaError';
    this.code = ERROR_CODE;
    this.stack = `GateBOperatorCoordinatorSchemaError: ${ERROR_CODE}`;
  }
}

function fail() {
  throw new GateBOperatorCoordinatorSchemaError();
}

function exactPlainObject(value, fields) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) || ARRAY_IS_ARRAY(value) ||
      GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const keys = REFLECT_OWN_KEYS(value);
  if (keys.length !== fields.length) fail();
  const output = {};
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, field);
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail();
    output[field] = descriptor.value;
  }
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== 'string' || !fields.includes(keys[index])) fail();
  }
  return output;
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

function freezeBootstrap(value) {
  const root = exactPlainObject(value, [
    'acknowledgements', 'quickTunnel', 'rpcEndpoint', 'runName',
    'schemaVersion', 'workspaceRoot',
  ]);
  if ((root.schemaVersion !== 1 && root.schemaVersion !== 2) ||
      typeof root.runName !== 'string' ||
      !RUN_NAME.test(root.runName)) fail();
  exactAbsolutePath(root.workspaceRoot);
  exactString(root.rpcEndpoint);
  if (root.schemaVersion === 2 && root.rpcEndpoint !== GATE_B_CURRENT_TESTNET_WSS_ENDPOINT) {
    fail();
  }
  const acknowledgements = exactPlainObject(root.acknowledgements, [
    'live', 'operatorTrust',
  ]);
  if (acknowledgements.live !== GATE_B_OPERATOR_COORDINATOR_ACKNOWLEDGEMENTS.live ||
      acknowledgements.operatorTrust !==
        GATE_B_OPERATOR_COORDINATOR_ACKNOWLEDGEMENTS.operatorTrust) fail();
  const quickTunnel = exactPlainObject(root.quickTunnel, [
    'cloudflaredExecutable', 'sourcePin', 'telemetryAcknowledgement', 'telemetryMode',
  ]);
  exactAbsolutePath(quickTunnel.cloudflaredExecutable);
  if (typeof quickTunnel.sourcePin !== 'string' ||
      !LOWERCASE_HASH_64.test(quickTunnel.sourcePin) ||
      !Object.values(GATE_B_QUICK_TUNNEL_TELEMETRY_MODES)
        .includes(quickTunnel.telemetryMode) ||
      !Object.values(GATE_B_QUICK_TUNNEL_TELEMETRY_ACKNOWLEDGEMENTS)
        .includes(quickTunnel.telemetryAcknowledgement)) fail();
  const expectedTelemetryAcknowledgement = quickTunnel.telemetryMode ===
    GATE_B_QUICK_TUNNEL_TELEMETRY_MODES.EXTERNAL_SENTRY_EGRESS_CONTROL_ATTESTED
    ? GATE_B_QUICK_TUNNEL_TELEMETRY_ACKNOWLEDGEMENTS
      .EXTERNAL_SENTRY_EGRESS_CONTROL_ATTESTED
    : GATE_B_QUICK_TUNNEL_TELEMETRY_ACKNOWLEDGEMENTS
      .ACCEPT_POSSIBLE_ERROR_TELEMETRY;
  if (quickTunnel.telemetryAcknowledgement !== expectedTelemetryAcknowledgement) fail();
  return Object.freeze({
    acknowledgements: Object.freeze({
      live: acknowledgements.live,
      operatorTrust: acknowledgements.operatorTrust,
    }),
    quickTunnel: Object.freeze({
      cloudflaredExecutable: quickTunnel.cloudflaredExecutable,
      sourcePin: quickTunnel.sourcePin,
      telemetryAcknowledgement: quickTunnel.telemetryAcknowledgement,
      telemetryMode: quickTunnel.telemetryMode,
    }),
    rpcEndpoint: root.rpcEndpoint,
    runName: root.runName,
    schemaVersion: root.schemaVersion,
    workspaceRoot: root.workspaceRoot,
  });
}

function freezeReview(value) {
  const root = exactPlainObject(value, ['acknowledgements', 'schemaVersion']);
  if (root.schemaVersion !== 1 && root.schemaVersion !== 2) fail();
  const fields = root.schemaVersion === 1
    ? ['payment', 'publication', 'transportException']
    : ['payment', 'publication'];
  const acknowledgements = exactPlainObject(root.acknowledgements, fields);
  const expectedPayment = root.schemaVersion === 1
    ? GATE_B_OPERATOR_COORDINATOR_ACKNOWLEDGEMENTS.payment
    : GATE_B_OPERATOR_COORDINATOR_ACKNOWLEDGEMENTS.currentTestnetWssPayment;
  if (acknowledgements.payment !== expectedPayment ||
      acknowledgements.publication !==
        GATE_B_OPERATOR_COORDINATOR_ACKNOWLEDGEMENTS.publication ||
      (root.schemaVersion === 1 && acknowledgements.transportException !==
        GATE_B_OPERATOR_COORDINATOR_ACKNOWLEDGEMENTS.transportException)) fail();
  const snapshot = {
    payment: acknowledgements.payment,
    publication: acknowledgements.publication,
  };
  if (root.schemaVersion === 1) {
    snapshot.transportException = acknowledgements.transportException;
  }
  return Object.freeze({
    acknowledgements: Object.freeze(snapshot),
    schemaVersion: root.schemaVersion,
  });
}

function freezeRun(value) {
  const root = exactPlainObject(value, ['acknowledgement', 'schemaVersion']);
  if ((root.schemaVersion !== 1 && root.schemaVersion !== 2) ||
      root.acknowledgement !== RUN_ACKNOWLEDGEMENT) fail();
  return Object.freeze({
    acknowledgement: RUN_ACKNOWLEDGEMENT,
    schemaVersion: root.schemaVersion,
  });
}

function freezeReviewResult(value) {
  const root = exactPlainObject(value, ['configDigest', 'resultVersion', 'type']);
  if ((root.resultVersion !== 1 && root.resultVersion !== 2) ||
      root.type !== 'REVIEW_VALID' ||
      typeof root.configDigest !== 'string' || !LOWERCASE_HASH_64.test(root.configDigest)) fail();
  return Object.freeze({
    configDigest: root.configDigest,
    resultVersion: root.resultVersion,
    type: 'REVIEW_VALID',
  });
}

function serialize(value, validator, maximumBytes) {
  const validated = validator(value);
  const bytes = Buffer.from(canonicalJson(validated), 'utf8');
  if (bytes.length < 1 || bytes.length > maximumBytes) {
    bytes.fill(0);
    fail();
  }
  return bytes;
}

function parsePayload(bytes, validator, maximumBytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > maximumBytes) fail();
  const text = UTF8_DECODER.decode(bytes);
  if (Buffer.byteLength(text, 'utf8') !== bytes.length) fail();
  const parsed = JSON.parse(text);
  const validated = validator(parsed);
  if (canonicalJson(validated) !== text) fail();
  return validated;
}

function frame(value, validator, maximumBytes) {
  let payload;
  try {
    payload = serialize(value, validator, maximumBytes);
    const output = Buffer.allocUnsafe(FRAME_HEADER_BYTES + payload.length);
    output.writeUInt32BE(payload.length, 0);
    payload.copy(output, FRAME_HEADER_BYTES);
    return output;
  } catch {
    fail();
  } finally {
    if (Buffer.isBuffer(payload)) payload.fill(0);
  }
}

function parseFrame(value, validator, maximumBytes) {
  try {
    if (!Buffer.isBuffer(value) || value.length < FRAME_HEADER_BYTES + 1 ||
        value.length > FRAME_HEADER_BYTES + maximumBytes) fail();
    const length = value.readUInt32BE(0);
    if (length < 1 || length > maximumBytes ||
        value.length !== FRAME_HEADER_BYTES + length) fail();
    return parsePayload(value.subarray(FRAME_HEADER_BYTES), validator, maximumBytes);
  } catch {
    fail();
  }
}

export function frameGateBOperatorCoordinatorBootstrap(value) {
  return frame(value, freezeBootstrap, BOOTSTRAP_MAX_BYTES);
}

export function parseGateBOperatorCoordinatorBootstrapFrame(value) {
  return parseFrame(value, freezeBootstrap, BOOTSTRAP_MAX_BYTES);
}

export function frameGateBOperatorCoordinatorReview(value) {
  return frame(value, freezeReview, REVIEW_MAX_BYTES);
}

export function parseGateBOperatorCoordinatorReviewFrame(value) {
  return parseFrame(value, freezeReview, REVIEW_MAX_BYTES);
}

export function frameGateBOperatorCoordinatorRun(value) {
  return frame(value, freezeRun, RUN_MAX_BYTES);
}

export function parseGateBOperatorCoordinatorRunFrame(value) {
  return parseFrame(value, freezeRun, RUN_MAX_BYTES);
}

export function frameGateBOperatorReviewResult(value) {
  return frame(value, freezeReviewResult, RESULT_MAX_BYTES);
}

export function parseGateBOperatorReviewResultFrame(value) {
  return parseFrame(value, freezeReviewResult, RESULT_MAX_BYTES);
}

export function createGateBOperatorCoordinatorIpcMessage(type) {
  if (!Object.values(GATE_B_OPERATOR_COORDINATOR_IPC_TYPES).includes(type)) fail();
  return Object.freeze({ ipcVersion: 1, type });
}

export function parseGateBOperatorCoordinatorIpcMessage(value) {
  const message = exactPlainObject(value, ['ipcVersion', 'type']);
  if (message.ipcVersion !== 1 ||
      !Object.values(GATE_B_OPERATOR_COORDINATOR_IPC_TYPES).includes(message.type)) fail();
  return Object.freeze({ ipcVersion: 1, type: message.type });
}

export function createGateBOperatorOriginReleaseIpcMessage(type) {
  if (!Object.values(GATE_B_OPERATOR_ORIGIN_RELEASE_IPC_TYPES).includes(type)) fail();
  return Object.freeze({
    ipcVersion: 1,
    requestId: ORIGIN_RELEASE_REQUEST_ID,
    type,
  });
}

export function parseGateBOperatorOriginReleaseIpcMessage(value) {
  const message = exactPlainObject(value, ['ipcVersion', 'requestId', 'type']);
  if (message.ipcVersion !== 1 || message.requestId !== ORIGIN_RELEASE_REQUEST_ID ||
      !Object.values(GATE_B_OPERATOR_ORIGIN_RELEASE_IPC_TYPES).includes(message.type)) fail();
  return Object.freeze({
    ipcVersion: 1,
    requestId: ORIGIN_RELEASE_REQUEST_ID,
    type: message.type,
  });
}

export function createGateBOperatorReviewChildIpcMessage(type) {
  if (!Object.values(GATE_B_OPERATOR_REVIEW_CHILD_IPC_TYPES).includes(type)) fail();
  return Object.freeze({ ipcVersion: 1, type });
}

export function parseGateBOperatorReviewChildIpcMessage(value) {
  const message = exactPlainObject(value, ['ipcVersion', 'type']);
  if (message.ipcVersion !== 1 ||
      !Object.values(GATE_B_OPERATOR_REVIEW_CHILD_IPC_TYPES).includes(message.type)) fail();
  return Object.freeze({ ipcVersion: 1, type: message.type });
}
