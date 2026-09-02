import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { BlockList, isIP } from 'node:net';
import { pathToFileURL } from 'node:url';
import { types as utilTypes } from 'node:util';

import {
  GATE_B_QUICK_TUNNEL_ARTIFACT_MANIFEST,
  GATE_B_QUICK_TUNNEL_HOSTNAME_PERSISTENCE_POLICY,
  GATE_B_QUICK_TUNNEL_RUNTIME_CONTROL_POLICY,
  GATE_B_QUICK_TUNNEL_TELEMETRY_POLICIES,
} from './gate-b-quick-tunnel-artifact.js';
import {
  GATE_B_OPERATOR_COORDINATOR_ACKNOWLEDGEMENTS,
  GATE_B_OPERATOR_REVIEW_CHILD_IPC_TYPES,
  createGateBOperatorReviewChildIpcMessage,
  frameGateBOperatorReviewResult,
  parseGateBOperatorReviewChildIpcMessage,
} from './gate-b-operator-coordinator-schema.js';
import {
  GATE_B_PUBLIC_WS_INPUT_LEAVES,
} from './gate-b-public-ws-inputs-schema.js';
import { openGateBPublicWsPrivateWorkspace } from './gate-b-public-ws-private-workspace.js';
import { attestPublicWsOnceSourceTree } from './public-ws-source-attestation.js';
import {
  GATE_B_CURRENT_TESTNET_CHAIN_PROFILE,
  GATE_B_CURRENT_TESTNET_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  GATE_B_CURRENT_TESTNET_PROFILE_NAME,
  TESTNET_LIVE_ACKNOWLEDGEMENT,
} from './zenon/operator-trusted-testnet-profile.js';
import * as sdkModule from 'znn-typescript-sdk';

const ERROR_CODE = 'gate_b_operator_config_review_failed';
const DOCUMENT_MAX_BYTES = 64 * 1024;
const ADDRESS_MAX_BYTES = 256;
const REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const HASH_64 = /^[0-9a-f]{64}$/;
const HOSTNAME =
  /^(?:[a-z0-9]|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9]))\.trycloudflare\.com$/;
const CONFIG_DIGEST_DOMAIN = 'zenon-x402-public-ws-once-config-v2';
const REVIEW_RESULT_FD = 4;
const PUBLIC_ADDRESS_BLOCKLIST = new BlockList();
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROMISE = utilTypes.isPromise;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

for (const [network, prefix, family] of [
  ['0.0.0.0', 8, 'ipv4'], ['10.0.0.0', 8, 'ipv4'], ['100.64.0.0', 10, 'ipv4'],
  ['127.0.0.0', 8, 'ipv4'], ['169.254.0.0', 16, 'ipv4'], ['172.16.0.0', 12, 'ipv4'],
  ['192.0.0.0', 24, 'ipv4'], ['192.0.2.0', 24, 'ipv4'], ['192.168.0.0', 16, 'ipv4'],
  ['198.18.0.0', 15, 'ipv4'], ['198.51.100.0', 24, 'ipv4'], ['203.0.113.0', 24, 'ipv4'],
  ['224.0.0.0', 4, 'ipv4'], ['240.0.0.0', 4, 'ipv4'],
  ['::', 128, 'ipv6'], ['::1', 128, 'ipv6'],
  ['64:ff9b::', 96, 'ipv6'], ['64:ff9b:1::', 48, 'ipv6'],
  ['100::', 64, 'ipv6'], ['2001::', 23, 'ipv6'], ['2001:db8::', 32, 'ipv6'],
  ['2002::', 16, 'ipv6'], ['fc00::', 7, 'ipv6'], ['fec0::', 10, 'ipv6'],
  ['fe80::', 10, 'ipv6'], ['ff00::', 8, 'ipv6'],
]) PUBLIC_ADDRESS_BLOCKLIST.addSubnet(network, prefix, family);

export const GATE_B_OPERATOR_REVIEW_LEAVES = Object.freeze([
  GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerAddress,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.endpointSource,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.payeeAddress,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc,
]);

export class GateBOperatorConfigReviewError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBOperatorConfigReviewError';
    this.code = ERROR_CODE;
    this.stack = `GateBOperatorConfigReviewError: ${ERROR_CODE}`;
  }
}

function fail() {
  throw new GateBOperatorConfigReviewError();
}

function dataProperty(value, name) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function') ||
      IS_PROXY(value)) return undefined;
  let current = value;
  while (current !== null) {
    if (IS_PROXY(current)) return undefined;
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(current, name);
    if (descriptor) return HAS_OWN(descriptor, 'value') ? descriptor.value : undefined;
    current = GET_PROTOTYPE_OF(current);
  }
  return undefined;
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

function exactArray(value, length) {
  if (!ARRAY_IS_ARRAY(value) || IS_PROXY(value) ||
      GET_PROTOTYPE_OF(value) !== Array.prototype || value.length !== length ||
      REFLECT_OWN_KEYS(value).length !== length + 1) fail();
  for (let index = 0; index < length; index += 1) {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, String(index));
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail();
  }
  return value;
}

function exactString(value, maximumBytes = 4096) {
  if (typeof value !== 'string' || value.length < 1 ||
      Buffer.byteLength(value, 'utf8') > maximumBytes ||
      /[\u0000-\u001f\u007f]/u.test(value) || hasUnpairedSurrogate(value)) fail();
  return value;
}

function hasUnpairedSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
}

function exactNativePromise(value) {
  if (!IS_PROMISE(value) || IS_PROXY(value) ||
      GET_PROTOTYPE_OF(value) !== Promise.prototype ||
      GET_OWN_PROPERTY_DESCRIPTOR(value, 'then') !== undefined) fail();
  return value;
}

function callAsync(fn, receiver, args) {
  if (typeof fn !== 'function') fail();
  return exactNativePromise(Reflect.apply(fn, receiver, args));
}

function independentCanonicalJson(value, state = { depth: 0, nodes: 0 }) {
  state.nodes += 1;
  if (state.nodes > 512 || state.depth > 16) fail();
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (ARRAY_IS_ARRAY(value)) {
    exactArray(value, value.length);
    const prior = state.depth;
    state.depth += 1;
    const output = `[${value.map(item => independentCanonicalJson(item, state)).join(',')}]`;
    state.depth = prior;
    return output;
  }
  if (IS_PROXY(value) || GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const keys = REFLECT_OWN_KEYS(value);
  const stringKeys = [];
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = typeof key === 'string'
      ? GET_OWN_PROPERTY_DESCRIPTOR(value, key)
      : undefined;
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail();
    stringKeys.push(key);
  }
  stringKeys.sort();
  const prior = state.depth;
  state.depth += 1;
  const output = `{${stringKeys.map(key => `${JSON.stringify(key)}:${
    independentCanonicalJson(GET_OWN_PROPERTY_DESCRIPTOR(value, key).value, state)
  }`).join(',')}}`;
  state.depth = prior;
  return output;
}

function strictJsonLine(bytes) {
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length < 3 || bytes.length > DOCUMENT_MAX_BYTES ||
        bytes[bytes.length - 1] !== 0x0a) fail();
    const body = bytes.subarray(0, bytes.length - 1);
    if (body.includes(0x0a) || body.includes(0x0d)) fail();
    const text = UTF8_DECODER.decode(body);
    if (Buffer.byteLength(text, 'utf8') !== body.length) fail();
    const value = JSON.parse(text);
    if (independentCanonicalJson(value) !== text) fail();
    return Object.freeze({ text, value });
  } catch {
    fail();
  }
}

function exactPublicWsEndpoint(value) {
  exactString(value);
  if (value.includes('%') || value.includes('?') || value.includes('#')) fail();
  let parsed;
  try { parsed = new URL(value); } catch { fail(); }
  if (parsed.protocol !== 'ws:' || parsed.username || parsed.password || parsed.search ||
      parsed.hash || parsed.pathname !== '/' || parsed.port === '' || parsed.port === '80' ||
      parsed.href !== value || !parsed.hostname) fail();
  const host = parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
    ? parsed.hostname.slice(1, -1)
    : parsed.hostname;
  const family = isIP(host);
  if (family !== 4 && family !== 6) fail();
  if ((family === 6 && /^::ffff:/i.test(host)) ||
      PUBLIC_ADDRESS_BLOCKLIST.check(host, family === 4 ? 'ipv4' : 'ipv6')) fail();
  const port = Number(parsed.port);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) fail();
  return value;
}

function exactTunnelHostname(value) {
  exactString(value, 253);
  if (!HOSTNAME.test(value) || value !== value.toLowerCase() || value.startsWith('xn--')) fail();
  return value;
}

function parseEndpointSource(bytes) {
  const { value } = strictJsonLine(bytes);
  exactPlainObject(value, ['kind', 'rpcEndpoint', 'schemaVersion']);
  if (value.kind !== 'gate-b-protected-endpoint-source' || value.schemaVersion !== 1) fail();
  exactPublicWsEndpoint(value.rpcEndpoint);
  return value;
}

function parseHostnameSource(bytes) {
  const { value } = strictJsonLine(bytes);
  exactPlainObject(value, ['hostname', 'kind', 'quickTunnel', 'schemaVersion']);
  if (value.kind !== 'gate-b-quick-tunnel-hostname-source' || value.schemaVersion !== 2) fail();
  exactTunnelHostname(value.hostname);
  exactQuickTunnelBinding(value.quickTunnel);
  return value;
}

function exactQuickTunnelBinding(value) {
  exactPlainObject(value, [
    'artifact', 'hostnamePersistence', 'runtimeControl', 'telemetry',
  ]);
  exactPlainObject(value.artifact, [
    'architecture', 'archiveSha256', 'asset', 'executableSha256',
    'manifestVersion', 'platform', 'release',
  ]);
  const manifest = GATE_B_QUICK_TUNNEL_ARTIFACT_MANIFEST;
  for (const field of [
    'architecture', 'archiveSha256', 'asset', 'executableSha256',
    'manifestVersion', 'platform', 'release',
  ]) if (value.artifact[field] !== manifest[field]) fail();
  exactPlainObject(value.hostnamePersistence, ['lifetime', 'policyVersion', 'storage']);
  for (const field of ['lifetime', 'policyVersion', 'storage']) {
    if (value.hostnamePersistence[field] !==
        GATE_B_QUICK_TUNNEL_HOSTNAME_PERSISTENCE_POLICY[field]) fail();
  }
  exactPlainObject(value.runtimeControl, [
    'autoUpdate', 'configuration', 'credentials', 'managementDiagnostics',
    'originCertificate', 'policyVersion', 'prechecks', 'processTopology',
    'runtimeStorage',
  ]);
  for (const field of [
    'autoUpdate', 'configuration', 'credentials', 'managementDiagnostics',
    'originCertificate', 'policyVersion', 'prechecks', 'processTopology',
    'runtimeStorage',
  ]) if (value.runtimeControl[field] !== GATE_B_QUICK_TUNNEL_RUNTIME_CONTROL_POLICY[field]) fail();
  exactPlainObject(value.telemetry, ['acknowledgement', 'classification', 'mode']);
  const telemetry = GATE_B_QUICK_TUNNEL_TELEMETRY_POLICIES[value.telemetry.mode];
  if (!telemetry || value.telemetry.acknowledgement !== telemetry.acknowledgement ||
      value.telemetry.classification !== telemetry.classification) fail();
  return value;
}

function parseRpc(bytes) {
  const { value } = strictJsonLine(bytes);
  exactPlainObject(value, ['rpcEndpoint', 'secretVersion']);
  if (value.secretVersion !== 2) fail();
  exactPublicWsEndpoint(value.rpcEndpoint);
  return value;
}

function parseAddress(bytes, expectedIndex, sdk, producerOrder) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 3 || bytes.length > DOCUMENT_MAX_BYTES ||
      bytes[bytes.length - 1] !== 0x0a) fail();
  const text = UTF8_DECODER.decode(bytes.subarray(0, bytes.length - 1));
  if (Buffer.byteLength(text, 'utf8') !== bytes.length - 1 ||
      text.includes('\n') || text.includes('\r')) fail();
  let value;
  try { value = JSON.parse(text); } catch { fail(); }
  exactPlainObject(value, ['accountIndex', 'address', 'addressVersion']);
  if (value.addressVersion !== 1 || value.accountIndex !== expectedIndex) fail();
  exactString(value.address, ADDRESS_MAX_BYTES);
  const Address = sdk && !IS_PROXY(sdk)
    ? GET_OWN_PROPERTY_DESCRIPTOR(sdk, 'Address')?.value
    : undefined;
  const parse = Address && !IS_PROXY(Address)
    ? GET_OWN_PROPERTY_DESCRIPTOR(Address, 'parse')?.value
    : undefined;
  if (typeof parse !== 'function') fail();
  let parsed;
  try { parsed = Reflect.apply(parse, Address, [value.address]); } catch { fail(); }
  const toString = parsed && typeof parsed === 'object' && !IS_PROXY(parsed)
    ? GET_OWN_PROPERTY_DESCRIPTOR(GET_PROTOTYPE_OF(parsed), 'toString')?.value
    : undefined;
  if (typeof toString !== 'function' || Reflect.apply(toString, parsed, []) !== value.address) fail();
  const expectedText = producerOrder === 'wallet'
    ? JSON.stringify({
      addressVersion: value.addressVersion,
      address: value.address,
      accountIndex: value.accountIndex,
    })
    : independentCanonicalJson(value);
  if (text !== expectedText) fail();
  return value;
}

function exactResource(value, hostname) {
  exactPlainObject(value, ['description', 'mimeType', 'url']);
  if (value.url !== `https://${hostname}/paid` ||
      value.description !== 'Zenon x402 PoC protected resource' ||
      value.mimeType !== 'application/json') fail();
}

function exactAccepted(value, payee, asset) {
  exactPlainObject(value, [
    'amount', 'asset', 'extra', 'maxTimeoutSeconds', 'network', 'payTo', 'scheme',
  ]);
  if (value.scheme !== 'exact' || value.network !== 'zenon:testnet' ||
      value.asset !== asset || value.amount !== '1' || value.payTo !== payee ||
      value.maxTimeoutSeconds !== 60) fail();
  exactPlainObject(value.extra, ['paymentFlow', 'poc', 'settlement', 'zenonChain']);
  if (value.extra.paymentFlow !== 'upfront' || value.extra.poc !== true ||
      value.extra.settlement !== 'account-block') fail();
  exactPlainObject(value.extra.zenonChain, [
    'chainIdentifier', 'genesisMomentumHash', 'version',
  ]);
  const profile = GATE_B_CURRENT_TESTNET_CHAIN_PROFILE;
  if (value.extra.zenonChain.version !== profile.version ||
      value.extra.zenonChain.chainIdentifier !== profile.chainIdentifier ||
      value.extra.zenonChain.genesisMomentumHash !== profile.genesisMomentumHash) fail();
}

export function validateIndependentGateBOperatorConfig(value, context) {
  try {
    exactPlainObject(context, ['asset', 'hostname', 'payee', 'quickTunnel']);
    exactString(context.asset, 128);
    exactTunnelHostname(context.hostname);
    exactString(context.payee, ADDRESS_MAX_BYTES);
    exactQuickTunnelBinding(context.quickTunnel);
    exactPlainObject(value, [
      'acknowledgements', 'expectedPaymentRequired', 'profileName', 'runnerVersion',
      'quickTunnel', 'runtime', 'sourceRevision',
    ]);
    if (value.runnerVersion !== 2 || typeof value.sourceRevision !== 'string' ||
        !REVISION.test(value.sourceRevision) ||
        value.profileName !== GATE_B_CURRENT_TESTNET_PROFILE_NAME) fail();
    exactPlainObject(value.acknowledgements, ['live', 'operatorTrust']);
    if (value.acknowledgements.live !== TESTNET_LIVE_ACKNOWLEDGEMENT ||
        value.acknowledgements.operatorTrust !==
          GATE_B_CURRENT_TESTNET_OPERATOR_TRUST_ACKNOWLEDGEMENT ||
        value.acknowledgements.live !==
          GATE_B_OPERATOR_COORDINATOR_ACKNOWLEDGEMENTS.live ||
        value.acknowledgements.operatorTrust !==
          GATE_B_OPERATOR_COORDINATOR_ACKNOWLEDGEMENTS.operatorTrust) fail();
    exactQuickTunnelBinding(value.quickTunnel);
    if (independentCanonicalJson(value.quickTunnel) !==
        independentCanonicalJson(context.quickTunnel)) fail();
    exactPlainObject(value.expectedPaymentRequired, ['accepts', 'resource', 'x402Version']);
    if (value.expectedPaymentRequired.x402Version !== 2) fail();
    exactResource(value.expectedPaymentRequired.resource, context.hostname);
    exactArray(value.expectedPaymentRequired.accepts, 1);
    exactAccepted(value.expectedPaymentRequired.accepts[0], context.payee, context.asset);
    exactPlainObject(value.runtime, [
      'listenPort', 'maxRecoveryAttempts', 'maxRecoveryElapsedMs',
      'recoveryDelayMs', 'rpcTimeoutMs',
    ]);
    if (value.runtime.listenPort !== 41000 || value.runtime.rpcTimeoutMs !== 30000 ||
        value.runtime.maxRecoveryAttempts !== 0 || value.runtime.recoveryDelayMs !== 0 ||
        value.runtime.maxRecoveryElapsedMs !== 1) fail();
    return value;
  } catch {
    fail();
  }
}

export function independentGateBOperatorConfigDigest(value) {
  try {
    const canonical = independentCanonicalJson(value);
    return createHash('sha256')
      .update(`${CONFIG_DIGEST_DOMAIN}\n${canonical}`, 'utf8')
      .digest('hex');
  } catch {
    fail();
  }
}

function captureDependencies(injected) {
  const output = {
    attestSourceTree: attestPublicWsOnceSourceTree,
    beforeFinalVerification: async () => {},
    cwd: () => process.cwd(),
    openWorkspace: openGateBPublicWsPrivateWorkspace,
    sdk: sdkModule,
    workspaceInjections: undefined,
  };
  if (injected !== undefined) {
    const supplied = exactPlainObject(injected, Object.keys(output));
    for (const key of Object.keys(output)) output[key] = supplied[key];
  }
  for (const key of [
    'attestSourceTree', 'beforeFinalVerification', 'cwd', 'openWorkspace',
  ]) if (typeof output[key] !== 'function') fail();
  if (!output.sdk || typeof output.sdk !== 'object' || IS_PROXY(output.sdk)) fail();
  return Object.freeze(output);
}

function assetFromSdk(sdk) {
  const asset = !IS_PROXY(sdk)
    ? GET_OWN_PROPERTY_DESCRIPTOR(sdk, 'ZNN_ZTS')?.value
    : undefined;
  const toString = asset && !IS_PROXY(asset) &&
      (typeof asset === 'object' || typeof asset === 'function')
    ? GET_OWN_PROPERTY_DESCRIPTOR(GET_PROTOTYPE_OF(asset), 'toString')?.value
    : undefined;
  if (typeof toString !== 'function') fail();
  return exactString(Reflect.apply(toString, asset, []), 128);
}

function mapRecords(records) {
  exactArray(records, GATE_B_OPERATOR_REVIEW_LEAVES.length);
  const output = Object.create(null);
  for (let index = 0; index < records.length; index += 1) {
    output[GATE_B_OPERATOR_REVIEW_LEAVES[index]] = records[index];
  }
  return output;
}

function snapshotWorkspace(workspace) {
  if (!workspace || typeof workspace !== 'object' || IS_PROXY(workspace)) fail();
  const snapshot = {
    assertAbsent: dataProperty(workspace, 'assertAbsent'),
    assertDistinct: dataProperty(workspace, 'assertDistinct'),
    close: dataProperty(workspace, 'close'),
    openInputs: dataProperty(workspace, 'openInputs'),
    read: dataProperty(workspace, 'read'),
    verify: dataProperty(workspace, 'verify'),
    workspace,
  };
  for (const field of [
    'assertAbsent', 'assertDistinct', 'close', 'openInputs', 'read', 'verify',
  ]) if (typeof snapshot[field] !== 'function') fail();
  return Object.freeze(snapshot);
}

export async function reviewGateBOperatorConfiguration(injected) {
  const dependencies = captureDependencies(injected);
  const buffers = [];
  let workspace;
  let workspaceClose;
  let workspaceSnapshot;
  try {
    const root = Reflect.apply(dependencies.cwd, undefined, []);
    exactString(root);
    workspace = await callAsync(dependencies.openWorkspace, undefined, [
      root,
      dependencies.workspaceInjections,
    ]);
    workspaceClose = dataProperty(workspace, 'close');
    workspaceSnapshot = snapshotWorkspace(workspace);
    await callAsync(workspaceSnapshot.assertAbsent, workspace, [[
      GATE_B_PUBLIC_WS_INPUT_LEAVES.authorization,
    ]]);
    const records = await callAsync(workspaceSnapshot.openInputs, workspace, [
      [...GATE_B_OPERATOR_REVIEW_LEAVES],
    ]);
    const mapped = mapRecords(records);
    Reflect.apply(workspaceSnapshot.assertDistinct, workspace, [records]);
    const read = async name => {
      const bytes = await callAsync(workspaceSnapshot.read, workspace, [mapped[name]]);
      if (!Buffer.isBuffer(bytes)) fail();
      buffers.push(bytes);
      return bytes;
    };
    const buyerAddress = parseAddress(
      await read(GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerAddress),
      0,
      dependencies.sdk,
      'wallet',
    );
    const endpointSource = parseEndpointSource(
      await read(GATE_B_PUBLIC_WS_INPUT_LEAVES.endpointSource),
    );
    const hostnameSource = parseHostnameSource(
      await read(GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource),
    );
    const payeeAddress = parseAddress(
      await read(GATE_B_PUBLIC_WS_INPUT_LEAVES.payeeAddress),
      1,
      dependencies.sdk,
      'canonical',
    );
    const configBytes = await read(GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig);
    const buyerRpcBytes = await read(GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc);
    const facilitatorRpcBytes = await read(GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc);
    const buyerRpc = parseRpc(buyerRpcBytes);
    const facilitatorRpc = parseRpc(facilitatorRpcBytes);
    if (buyerAddress.address === payeeAddress.address ||
        endpointSource.rpcEndpoint !== buyerRpc.rpcEndpoint ||
        endpointSource.rpcEndpoint !== facilitatorRpc.rpcEndpoint ||
        !buyerRpcBytes.equals(facilitatorRpcBytes)) fail();
    const { value: config } = strictJsonLine(configBytes);
    const asset = assetFromSdk(dependencies.sdk);
    validateIndependentGateBOperatorConfig(config, {
      asset,
      hostname: hostnameSource.hostname,
      payee: payeeAddress.address,
      quickTunnel: hostnameSource.quickTunnel,
    });
    const independentDigest = independentGateBOperatorConfigDigest(config);
    if (!HASH_64.test(independentDigest)) fail();
    if (await callAsync(dependencies.attestSourceTree, undefined, [config.sourceRevision]) !== true) {
      fail();
    }
    await callAsync(dependencies.beforeFinalVerification, undefined, []);
    for (let index = 0; index < records.length; index += 1) {
      await callAsync(workspaceSnapshot.verify, workspace, [records[index]]);
    }
    await callAsync(workspaceSnapshot.assertAbsent, workspace, [[
      GATE_B_PUBLIC_WS_INPUT_LEAVES.authorization,
    ]]);
    if (await callAsync(dependencies.attestSourceTree, undefined, [config.sourceRevision]) !== true) {
      fail();
    }
    return Object.freeze({
      configDigest: independentDigest,
      resultVersion: 1,
      type: 'REVIEW_VALID',
    });
  } catch {
    fail();
  } finally {
    for (let index = 0; index < buffers.length; index += 1) {
      try { buffers[index].fill(0); } catch {}
    }
    if (workspace && typeof workspaceClose === 'function') {
      try { await callAsync(workspaceClose, workspace, []); } catch {}
    }
  }
}

function writeResultFrame(frame, fd = REVIEW_RESULT_FD) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const stream = createWriteStream(null, { fd, autoClose: true });
    const finish = success => {
      if (settled) return;
      settled = true;
      if (success) resolve(true);
      else reject(new GateBOperatorConfigReviewError());
    };
    stream.once('error', () => finish(false));
    stream.end(frame, error => finish(error === undefined || error === null));
  });
}

export async function runGateBOperatorConfigReviewChild(options = undefined) {
  const supplied = options === undefined ? {} : exactPlainObject(options, [
    'channel', 'review', 'writeResult',
  ]);
  const channel = supplied.channel ?? process;
  const review = supplied.review ?? reviewGateBOperatorConfiguration;
  const writeResult = supplied.writeResult ?? writeResultFrame;
  const on = dataProperty(channel, 'on');
  const removeListener = dataProperty(channel, 'removeListener');
  const send = dataProperty(channel, 'send');
  if (typeof on !== 'function' || typeof removeListener !== 'function' ||
      typeof send !== 'function' || typeof review !== 'function' ||
      typeof writeResult !== 'function') fail();
  let accepting = true;
  let started = false;
  let terminal = false;
  const sendMessage = type => new Promise((resolve, reject) => {
    if (!accepting && type !== GATE_B_OPERATOR_REVIEW_CHILD_IPC_TYPES.STOPPED) {
      reject(new GateBOperatorConfigReviewError());
      return;
    }
    try {
      Reflect.apply(send, channel, [createGateBOperatorReviewChildIpcMessage(type), error => {
        if (error) reject(new GateBOperatorConfigReviewError());
        else resolve(true);
      }]);
    } catch {
      reject(new GateBOperatorConfigReviewError());
    }
  });
  let resolveTerminal;
  const terminalPromise = new Promise(resolve => { resolveTerminal = resolve; });
  const finish = success => {
    if (terminal) return;
    terminal = true;
    accepting = false;
    try { Reflect.apply(removeListener, channel, ['message', onMessage]); } catch {}
    resolveTerminal(success);
  };
  const onMessage = message => {
    if (!accepting || terminal) return;
    let parsed;
    try { parsed = parseGateBOperatorReviewChildIpcMessage(message); } catch {
      finish(false);
      return;
    }
    if (parsed.type === GATE_B_OPERATOR_REVIEW_CHILD_IPC_TYPES.STOP) {
      accepting = false;
      void sendMessage(GATE_B_OPERATOR_REVIEW_CHILD_IPC_TYPES.STOPPED).then(
        () => finish(true),
        () => finish(false),
      );
      return;
    }
    if (parsed.type !== GATE_B_OPERATOR_REVIEW_CHILD_IPC_TYPES.REVIEW || started) {
      finish(false);
      return;
    }
    started = true;
    let pending;
    try { pending = exactNativePromise(Reflect.apply(review, undefined, [])); } catch {
      finish(false);
      return;
    }
    void pending.then(async result => {
      if (!accepting || terminal) return;
      let frame;
      try {
        frame = frameGateBOperatorReviewResult(result);
        await exactNativePromise(Reflect.apply(writeResult, undefined, [frame]));
        if (!accepting || terminal) return;
        await sendMessage(GATE_B_OPERATOR_REVIEW_CHILD_IPC_TYPES.REVIEWED);
        finish(true);
      } catch {
        finish(false);
      } finally {
        if (Buffer.isBuffer(frame)) frame.fill(0);
      }
    }, () => finish(false));
  };
  Reflect.apply(on, channel, ['message', onMessage]);
  try {
    await sendMessage(GATE_B_OPERATOR_REVIEW_CHILD_IPC_TYPES.READY);
  } catch {
    finish(false);
  }
  return terminalPromise;
}

async function launch() {
  if (typeof process.argv[1] !== 'string' ||
      pathToFileURL(process.argv[1]).href !== import.meta.url ||
      typeof process.send !== 'function') return;
  const success = await runGateBOperatorConfigReviewChild();
  process.exitCode = success ? 0 : 1;
  try { process.disconnect(); } catch {}
}

void launch().catch(() => {
  process.exitCode = 1;
});
