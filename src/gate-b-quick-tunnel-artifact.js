import { types as utilTypes } from 'node:util';

const ERROR_CODE = 'gate_b_quick_tunnel_artifact_invalid';
const HASH_64 = /^[0-9a-f]{64}$/;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;

const ARTIFACT_FIELDS = Object.freeze([
  'architecture', 'archiveSha256', 'asset', 'executableSha256',
  'manifestVersion', 'platform', 'release',
]);
const RUNTIME_CONTROL_FIELDS = Object.freeze([
  'autoUpdate', 'configuration', 'credentials', 'managementDiagnostics',
  'originCertificate', 'policyVersion', 'prechecks', 'processTopology',
  'runtimeStorage',
]);
const HOSTNAME_PERSISTENCE_FIELDS = Object.freeze([
  'lifetime', 'policyVersion', 'storage',
]);
const TELEMETRY_FIELDS = Object.freeze([
  'acknowledgement', 'classification', 'mode',
]);

export const GATE_B_QUICK_TUNNEL_ARTIFACT_MANIFEST = Object.freeze({
  architecture: 'arm64',
  archiveSha256: '9042c2c5d8b2de78e60f313d5fb31b6c5c1cebde787a3caf1f2c9588084ac442',
  asset: 'cloudflared-darwin-arm64.tgz',
  executableBasename: 'cloudflared',
  executableSha256: 'b61054d3d6326ea558cb49826eebf5676e0d0a36d51b546975096ca3e0e3c89d',
  manifestVersion: 1,
  platform: 'darwin',
  release: '2026.8.2',
  versionOutputGrammar:
    '^cloudflared version 2026\\.8\\.2 \\(built [A-Za-z0-9:+._ -]{1,96}\\)\\n$',
});

export const GATE_B_QUICK_TUNNEL_RUNTIME_CONTROL_POLICY = Object.freeze({
  autoUpdate: 'disabled-by-fixed-argument',
  configuration: 'dev-null-by-fixed-argument',
  credentials: 'dev-null-by-fixed-argument',
  managementDiagnostics: 'disabled-by-fixed-argument',
  originCertificate: 'dev-null-by-fixed-argument',
  policyVersion: 1,
  prechecks: 'disabled-by-fixed-argument',
  processTopology: 'non-detached-child-of-retained-supervisor',
  runtimeStorage: 'owner-private-temporary-cleanup-or-quarantine',
});

export const GATE_B_QUICK_TUNNEL_HOSTNAME_PERSISTENCE_POLICY = Object.freeze({
  lifetime: 'persists-with-protected-one-shot-workspace-beyond-lease-closure',
  policyVersion: 1,
  storage: 'protected-workspace-durable',
});

export const GATE_B_QUICK_TUNNEL_TELEMETRY_POLICIES = Object.freeze({
  ACCEPT_POSSIBLE_ERROR_TELEMETRY: Object.freeze({
    acknowledgement: 'I_ACCEPT_THAT_CLOUDFLARED_MAY_SEND_ERROR_TELEMETRY',
    classification: 'possible-error-telemetry-accepted',
    mode: 'ACCEPT_POSSIBLE_ERROR_TELEMETRY',
  }),
  EXTERNAL_SENTRY_EGRESS_CONTROL_ATTESTED: Object.freeze({
    acknowledgement:
      'I_ATTEST_THAT_EXTERNAL_EGRESS_CONTROL_BLOCKS_CLOUDFLARED_SENTRY_TELEMETRY',
    classification: 'external-sentry-egress-control-operator-asserted',
    mode: 'EXTERNAL_SENTRY_EGRESS_CONTROL_ATTESTED',
  }),
});

export class GateBQuickTunnelArtifactError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBQuickTunnelArtifactError';
    this.code = ERROR_CODE;
    this.stack = `GateBQuickTunnelArtifactError: ${ERROR_CODE}`;
  }
}

function fail() {
  throw new GateBQuickTunnelArtifactError();
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

function exactArtifactIdentity(value) {
  exactPlainObject(value, ARTIFACT_FIELDS);
  const manifest = GATE_B_QUICK_TUNNEL_ARTIFACT_MANIFEST;
  if (value.architecture !== manifest.architecture ||
      value.archiveSha256 !== manifest.archiveSha256 ||
      value.asset !== manifest.asset ||
      value.executableSha256 !== manifest.executableSha256 ||
      value.manifestVersion !== manifest.manifestVersion ||
      value.platform !== manifest.platform || value.release !== manifest.release ||
      !HASH_64.test(value.archiveSha256) || !HASH_64.test(value.executableSha256)) fail();
  return value;
}

function exactRuntimeControl(value) {
  exactPlainObject(value, RUNTIME_CONTROL_FIELDS);
  const expected = GATE_B_QUICK_TUNNEL_RUNTIME_CONTROL_POLICY;
  for (const field of RUNTIME_CONTROL_FIELDS) {
    if (value[field] !== expected[field]) fail();
  }
  return value;
}

function exactHostnamePersistence(value) {
  exactPlainObject(value, HOSTNAME_PERSISTENCE_FIELDS);
  const expected = GATE_B_QUICK_TUNNEL_HOSTNAME_PERSISTENCE_POLICY;
  for (const field of HOSTNAME_PERSISTENCE_FIELDS) {
    if (value[field] !== expected[field]) fail();
  }
  return value;
}

function exactTelemetry(value) {
  exactPlainObject(value, TELEMETRY_FIELDS);
  const expected = GATE_B_QUICK_TUNNEL_TELEMETRY_POLICIES[value.mode];
  if (!expected || value.acknowledgement !== expected.acknowledgement ||
      value.classification !== expected.classification) fail();
  return value;
}

export function validateGateBQuickTunnelArtifactIdentity(value) {
  try {
    exactArtifactIdentity(value);
    return true;
  } catch {
    fail();
  }
}

export function validateGateBQuickTunnelArtifactSelection(value) {
  try {
    exactPlainObject(value, ['architecture', 'platform', 'sourcePin']);
    const manifest = GATE_B_QUICK_TUNNEL_ARTIFACT_MANIFEST;
    if (value.architecture !== manifest.architecture || value.platform !== manifest.platform ||
        value.sourcePin !== manifest.executableSha256 || !HASH_64.test(value.sourcePin)) fail();
    return true;
  } catch {
    fail();
  }
}

export function matchesGateBQuickTunnelCanonicalVersionOutput(value) {
  try {
    if (typeof value !== 'string' ||
        !/^cloudflared version 2026\.8\.2 \(built [A-Za-z0-9:+._ -]{1,96}\)\n$/.test(value)) {
      fail();
    }
    return true;
  } catch {
    fail();
  }
}

export function validateGateBQuickTunnelStableBinding(value) {
  try {
    exactPlainObject(value, [
      'artifact', 'hostnamePersistence', 'runtimeControl', 'telemetry',
    ]);
    exactArtifactIdentity(value.artifact);
    exactHostnamePersistence(value.hostnamePersistence);
    exactRuntimeControl(value.runtimeControl);
    exactTelemetry(value.telemetry);
    return true;
  } catch {
    fail();
  }
}
