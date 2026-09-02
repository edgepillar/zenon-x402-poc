import { canonicalJson } from './canonical.js';
import { isAbsolute, resolve } from 'node:path';
import { types as utilTypes } from 'node:util';
import { validateGateBQuickTunnelStableBinding } from './gate-b-quick-tunnel-artifact.js';

const ERROR_CODE = 'gate_b_public_ws_inputs_schema_invalid';
const BOOTSTRAP_MAX_BYTES = 8192;
const FRAME_HEADER_BYTES = 4;
const SOURCE_MAX_BYTES = 8192;
const RUN_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const LOWERCASE_HASH_64 = /^[0-9a-f]{64}$/;
const QUICK_TUNNEL_HOSTNAME =
  /^(?:[a-z0-9]|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9]))\.trycloudflare\.com$/;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

export const GATE_B_PUBLIC_WS_INPUT_OPERATIONS = Object.freeze({
  PROVISION_ENDPOINT: 'PROVISION_ENDPOINT',
  PREPARE: 'PREPARE',
  AUTHORIZE: 'AUTHORIZE',
});

export const GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS = Object.freeze({
  live: 'I_UNDERSTAND_TESTNET_ONLY',
  operatorTrust:
    'I_UNDERSTAND_THIS_CURRENT_TESTNET_ANCHOR_IS_OPERATOR_TRUSTED_AND_INDEPENDENTLY_UNVERIFIED',
  transportException:
    'I_EXPLICITLY_ACCEPT_PUBLIC_WS_FOR_EXACTLY_ONE_GATE_B_TESTNET_PAYMENT',
  payment:
    'I_ACCEPT_ONE_DISPOSABLE_MINIMALLY_FUNDED_TESTNET_PAYMENT_OVER_UNENCRYPTED_UNAUTHENTICATED_PUBLIC_RPC',
  publication:
    'I_UNDERSTAND_ARTIFACTS_MUST_NOT_BE_PUBLISHED_UNTIL_INDEPENDENT_VERIFICATION',
});

export const GATE_B_PUBLIC_WS_INPUT_STATUS_LINES = Object.freeze({
  PROVISION_ENDPOINT: 'GATE_B_PUBLIC_WS_ENDPOINT_PROVISIONED\n',
  PREPARE: 'GATE_B_PUBLIC_WS_INPUTS_PREPARED\n',
  AUTHORIZE: 'GATE_B_PUBLIC_WS_INPUTS_AUTHORIZED\n',
  FAILURE: 'GATE_B_PUBLIC_WS_INPUTS_FAILED\n',
});

export const GATE_B_PUBLIC_WS_INPUT_LEAVES = Object.freeze({
  buyerWallet: 'buyer-wallet.json',
  buyerAddress: 'buyer-address.json',
  endpointSource: 'protected-endpoint-source.json',
  hostnameSource: 'quick-tunnel-hostname-source.json',
  payeeAddress: 'payee-address.json',
  runConfig: 'run.json',
  buyerRpc: 'buyer-rpc.json',
  facilitatorRpc: 'facilitator-rpc.json',
  authorization: 'authorization.json',
});

const GATE_B_PUBLIC_WS_SOURCE_KINDS = Object.freeze({
  endpoint: 'gate-b-protected-endpoint-source',
  hostname: 'gate-b-quick-tunnel-hostname-source',
});

export const GATE_B_QUICK_TUNNEL_HOSTNAME_POLICY = Object.freeze({
  kind: GATE_B_PUBLIC_WS_SOURCE_KINDS.hostname,
  schemaVersion: 2,
  suffix: '.trycloudflare.com',
});

export const GATE_B_PUBLIC_WS_INPUT_LIMITS = Object.freeze({
  bootstrapBytes: BOOTSTRAP_MAX_BYTES,
  frameBytes: BOOTSTRAP_MAX_BYTES + FRAME_HEADER_BYTES,
  sourceBytes: SOURCE_MAX_BYTES,
});

export class GateBPublicWsInputsSchemaError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBPublicWsInputsSchemaError';
    this.code = ERROR_CODE;
    this.stack = `GateBPublicWsInputsSchemaError: ${ERROR_CODE}`;
  }
}

function fail() {
  throw new GateBPublicWsInputsSchemaError();
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

function exactString(value, maximumBytes = 4096) {
  if (typeof value !== 'string' || value.length < 1 ||
      Buffer.byteLength(value, 'utf8') > maximumBytes ||
      /[\u0000-\u001f\u007f]/u.test(value)) fail();
  return value;
}

function exactWorkspaceRoot(value) {
  exactString(value);
  if (!isAbsolute(value) || resolve(value) !== value) fail();
  return value;
}

function exactOperation(value) {
  if (!Object.values(GATE_B_PUBLIC_WS_INPUT_OPERATIONS).includes(value)) fail();
  return value;
}

function exactAcknowledgements(value, fields) {
  exactPlainObject(value, fields);
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (value[field] !== GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS[field]) fail();
  }
  return value;
}

function validateBootstrap(value, expectedOperation) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) || ARRAY_IS_ARRAY(value) ||
      GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const operationDescriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, 'operation');
  if (!operationDescriptor || !HAS_OWN(operationDescriptor, 'value') ||
      operationDescriptor.enumerable !== true) fail();
  const operation = exactOperation(operationDescriptor.value);
  if (expectedOperation !== undefined && operation !== expectedOperation) fail();
  if (operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PROVISION_ENDPOINT) {
    exactPlainObject(value, ['operation', 'rpcEndpoint', 'schemaVersion', 'workspaceRoot']);
    if (value.schemaVersion !== 1) fail();
    exactWorkspaceRoot(value.workspaceRoot);
    exactString(value.rpcEndpoint);
  } else if (operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PREPARE) {
    exactPlainObject(value, [
      'acknowledgements', 'operation', 'runName', 'schemaVersion', 'workspaceRoot',
    ]);
    if (value.schemaVersion !== 1 || typeof value.runName !== 'string' ||
        !RUN_NAME.test(value.runName)) fail();
    exactWorkspaceRoot(value.workspaceRoot);
    exactAcknowledgements(value.acknowledgements, ['live', 'operatorTrust']);
  } else {
    exactPlainObject(value, [
      'acknowledgements', 'operation', 'reviewedConfigDigest', 'runName',
      'schemaVersion', 'workspaceRoot',
    ]);
    if (value.schemaVersion !== 1 || typeof value.runName !== 'string' ||
        !RUN_NAME.test(value.runName) ||
        typeof value.reviewedConfigDigest !== 'string' ||
        !LOWERCASE_HASH_64.test(value.reviewedConfigDigest)) fail();
    exactWorkspaceRoot(value.workspaceRoot);
    exactAcknowledgements(
      value.acknowledgements,
      ['payment', 'publication', 'transportException'],
    );
  }
  return value;
}

function freezeBootstrap(value) {
  if (value.acknowledgements !== undefined) Object.freeze(value.acknowledgements);
  return Object.freeze(value);
}

function exactQuickTunnelHostname(value) {
  exactString(value, 253);
  const label = value.slice(0, value.length - GATE_B_QUICK_TUNNEL_HOSTNAME_POLICY.suffix.length);
  if (!QUICK_TUNNEL_HOSTNAME.test(value) || label.startsWith('xn--') ||
      value !== value.toLowerCase()) fail();
  return value;
}

export function validateGateBQuickTunnelHostname(value) {
  try {
    exactQuickTunnelHostname(value);
    return true;
  } catch {
    fail();
  }
}

function serializeSource(value) {
  const bytes = Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
  if (bytes.length < 2 || bytes.length > SOURCE_MAX_BYTES) {
    bytes.fill(0);
    fail();
  }
  return bytes;
}

function parseSource(bytes, fields) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 3 || bytes.length > SOURCE_MAX_BYTES ||
      bytes[bytes.length - 1] !== 0x0a) fail();
  const body = bytes.subarray(0, bytes.length - 1);
  if (body.includes(0x0a) || body.includes(0x0d)) fail();
  const text = UTF8_DECODER.decode(body);
  if (Buffer.byteLength(text, 'utf8') !== body.length) fail();
  const value = JSON.parse(text);
  exactPlainObject(value, fields);
  if (`${canonicalJson(value)}\n` !== bytes.toString('utf8')) fail();
  return value;
}

export function serializeGateBProtectedEndpointSource(rpcEndpoint) {
  try {
    exactString(rpcEndpoint);
    return serializeSource({
      kind: GATE_B_PUBLIC_WS_SOURCE_KINDS.endpoint,
      rpcEndpoint,
      schemaVersion: 1,
    });
  } catch {
    fail();
  }
}

export function parseGateBProtectedEndpointSource(bytes) {
  try {
    const value = parseSource(bytes, ['kind', 'rpcEndpoint', 'schemaVersion']);
    if (value.kind !== GATE_B_PUBLIC_WS_SOURCE_KINDS.endpoint || value.schemaVersion !== 1) fail();
    exactString(value.rpcEndpoint);
    return Object.freeze(value);
  } catch {
    fail();
  }
}

export function serializeGateBQuickTunnelHostnameSource(hostname, quickTunnel) {
  try {
    exactQuickTunnelHostname(hostname);
    if (validateGateBQuickTunnelStableBinding(quickTunnel) !== true) fail();
    return serializeSource({
      hostname,
      kind: GATE_B_QUICK_TUNNEL_HOSTNAME_POLICY.kind,
      quickTunnel,
      schemaVersion: GATE_B_QUICK_TUNNEL_HOSTNAME_POLICY.schemaVersion,
    });
  } catch {
    fail();
  }
}

export function parseGateBQuickTunnelHostnameSource(bytes) {
  try {
    const value = parseSource(bytes, ['hostname', 'kind', 'quickTunnel', 'schemaVersion']);
    if (value.kind !== GATE_B_QUICK_TUNNEL_HOSTNAME_POLICY.kind ||
        value.schemaVersion !== GATE_B_QUICK_TUNNEL_HOSTNAME_POLICY.schemaVersion) fail();
    exactQuickTunnelHostname(value.hostname);
    if (validateGateBQuickTunnelStableBinding(value.quickTunnel) !== true) fail();
    Object.freeze(value.quickTunnel.artifact);
    Object.freeze(value.quickTunnel.hostnamePersistence);
    Object.freeze(value.quickTunnel.runtimeControl);
    Object.freeze(value.quickTunnel.telemetry);
    Object.freeze(value.quickTunnel);
    return Object.freeze(value);
  } catch {
    fail();
  }
}

export function serializeGateBPublicWsInputsBootstrap(value) {
  try {
    validateBootstrap(value);
    const text = canonicalJson(value);
    const bytes = Buffer.from(text, 'utf8');
    if (bytes.length < 1 || bytes.length > BOOTSTRAP_MAX_BYTES) fail();
    return bytes;
  } catch {
    fail();
  }
}

export function parseGateBPublicWsInputsBootstrap(bytes, expectedOperation) {
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > BOOTSTRAP_MAX_BYTES) fail();
    const text = UTF8_DECODER.decode(bytes);
    if (Buffer.byteLength(text, 'utf8') !== bytes.length) fail();
    const value = JSON.parse(text);
    validateBootstrap(value, expectedOperation);
    if (canonicalJson(value) !== text) fail();
    return freezeBootstrap(value);
  } catch {
    fail();
  }
}

export function frameGateBPublicWsInputsBootstrap(value) {
  let payload;
  try {
    payload = serializeGateBPublicWsInputsBootstrap(value);
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

export function parseGateBPublicWsInputsFrame(frame, expectedOperation) {
  try {
    if (!Buffer.isBuffer(frame) || frame.length < FRAME_HEADER_BYTES + 1 ||
        frame.length > BOOTSTRAP_MAX_BYTES + FRAME_HEADER_BYTES) fail();
    const length = frame.readUInt32BE(0);
    if (length < 1 || length > BOOTSTRAP_MAX_BYTES ||
        frame.length !== FRAME_HEADER_BYTES + length) fail();
    return parseGateBPublicWsInputsBootstrap(
      frame.subarray(FRAME_HEADER_BYTES),
      expectedOperation,
    );
  } catch {
    fail();
  }
}
