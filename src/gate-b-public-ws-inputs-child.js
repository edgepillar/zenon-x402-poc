import { spawnSync } from 'node:child_process';
import { createReadStream, realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { types as utilTypes } from 'node:util';

import {
  GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS,
  GATE_B_PUBLIC_WS_INPUT_LEAVES,
  GATE_B_PUBLIC_WS_INPUT_LIMITS,
  GATE_B_PUBLIC_WS_INPUT_OPERATIONS,
  frameGateBPublicWsInputsBootstrap,
  parseGateBProtectedEndpointSource,
  parseGateBPublicWsInputsFrame,
  parseGateBQuickTunnelHostnameSource,
  serializeGateBProtectedEndpointSource,
} from './gate-b-public-ws-inputs-schema.js';
import { openGateBPublicWsPrivateWorkspace } from './gate-b-public-ws-private-workspace.js';

const ERROR_CODE = 'gate_b_public_ws_inputs_child_failed';
const IPC_VERSION = 1;
const REQUEST_ID = 1;
const BOOTSTRAP_FD = 4;
const DOCUMENT_MAX_BYTES = 64 * 1024;
const ADDRESS_MAX_BYTES = 256;
const GIT_OUTPUT_MAX_BYTES = 128;
const GIT_TIMEOUT_MS = 5000;
const GIT_EXECUTABLE = '/usr/bin/git';
const REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const REPOSITORY_ROOT = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
const WORKSPACE_INJECTION_KEYS = Object.freeze([
  'platform',
  'constants',
  'lstatPath',
  'openPath',
  'realpathPath',
  'actualCwdPath',
  'lstatActualCwd',
  'openActualCwd',
  'realpathActualCwd',
  'getuid',
  'aclInspector',
  'decorateFileHandle',
  'decorateDirectoryHandle',
]);

export class GateBPublicWsInputsChildError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBPublicWsInputsChildError';
    this.code = ERROR_CODE;
    this.stack = `GateBPublicWsInputsChildError: ${ERROR_CODE}`;
  }
}

function fail() {
  throw new GateBPublicWsInputsChildError();
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

function captureOperationInjections(injected) {
  const output = {
    gitRunner: spawnSync,
    repositoryRoot: REPOSITORY_ROOT,
    runnerLoader: () => import('./live-evidence-runner.js'),
    sdkLoader: () => import('znn-typescript-sdk'),
    canonicalLoader: () => import('./canonical.js'),
    profileLoader: () => import('./zenon/operator-trusted-testnet-profile.js'),
    attestationLoader: () => import('./public-ws-source-attestation.js'),
    sourceRevisionCapture: undefined,
    sourceTreeAttestor: undefined,
    afterReservations: async () => {},
    beforeFinalAttestation: async () => {},
    beforeAuthorizationReservation: async () => {},
  };
  const workspaceInjections = {};
  if (injected !== undefined) {
    if (!injected || typeof injected !== 'object' || IS_PROXY(injected) ||
        ARRAY_IS_ARRAY(injected) || GET_PROTOTYPE_OF(injected) !== OBJECT_PROTOTYPE) fail();
    const allowed = [...Object.keys(output), ...WORKSPACE_INJECTION_KEYS];
    const keys = REFLECT_OWN_KEYS(injected);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      const descriptor = typeof key === 'string'
        ? GET_OWN_PROPERTY_DESCRIPTOR(injected, key)
        : undefined;
      if (!allowed.includes(key) || !descriptor || !HAS_OWN(descriptor, 'value') ||
          descriptor.enumerable !== true) fail();
      if (WORKSPACE_INJECTION_KEYS.includes(key)) workspaceInjections[key] = descriptor.value;
      else output[key] = descriptor.value;
    }
  }
  const requiredFunctions = [
    'gitRunner', 'runnerLoader', 'sdkLoader', 'canonicalLoader', 'profileLoader',
    'attestationLoader', 'afterReservations', 'beforeFinalAttestation',
    'beforeAuthorizationReservation',
  ];
  if (typeof output.repositoryRoot !== 'string' || !isAbsolute(output.repositoryRoot) ||
      resolve(output.repositoryRoot) !== output.repositoryRoot) fail();
  for (let index = 0; index < requiredFunctions.length; index += 1) {
    if (typeof output[requiredFunctions[index]] !== 'function') fail();
  }
  if (output.sourceRevisionCapture !== undefined &&
      typeof output.sourceRevisionCapture !== 'function') fail();
  if (output.sourceTreeAttestor !== undefined &&
      typeof output.sourceTreeAttestor !== 'function') fail();
  return Object.freeze({
    ...output,
    workspaceInjections: Object.freeze(workspaceInjections),
  });
}

function clearBuffer(value) {
  try {
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) value.fill(0);
  } catch {}
}

function clearSecrets(wallet, keyPairs) {
  for (let index = 0; index < keyPairs.length; index += 1) {
    const keyPair = keyPairs[index];
    try { if (keyPair && typeof keyPair.clear === 'function') keyPair.clear(); } catch {}
    if (keyPair && typeof keyPair === 'object') {
      clearBuffer(keyPair.privateKey);
      clearBuffer(keyPair.publicKey);
    }
  }
  if (wallet && typeof wallet === 'object') {
    for (const field of ['mnemonic', 'entropy', 'seed']) {
      try {
        const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(wallet, field);
        if (descriptor && HAS_OWN(descriptor, 'value') && descriptor.writable === true) {
          wallet[field] = '';
        }
      } catch {}
    }
  }
}

function strictJsonLine(bytes) {
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length < 3 || bytes[bytes.length - 1] !== 0x0a) fail();
    const body = bytes.subarray(0, bytes.length - 1);
    if (body.includes(0x0a) || body.includes(0x0d)) fail();
    const text = UTF8_DECODER.decode(body);
    if (Buffer.byteLength(text, 'utf8') !== body.length) fail();
    const value = JSON.parse(text);
    if (JSON.stringify(value) !== text) fail();
    return { text, value };
  } catch {
    fail();
  }
}

function canonicalJsonLine(value, canonical) {
  const text = `${Reflect.apply(canonical.canonicalJson, undefined, [value])}\n`;
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length < 1 || bytes.length > DOCUMENT_MAX_BYTES) {
    bytes.fill(0);
    fail();
  }
  return bytes;
}

function parseAddressRecord(bytes, expectedIndex, sdk) {
  const parsed = strictJsonLine(bytes);
  exactPlainObject(parsed.value, ['addressVersion', 'address', 'accountIndex']);
  if (parsed.value.addressVersion !== 1 || parsed.value.accountIndex !== expectedIndex) fail();
  exactString(parsed.value.address, ADDRESS_MAX_BYTES);
  if (!sdk.Address || typeof sdk.Address.parse !== 'function') fail();
  let canonicalAddress;
  try {
    canonicalAddress = Reflect.apply(sdk.Address.parse, sdk.Address, [parsed.value.address]);
  } catch {
    fail();
  }
  if (!canonicalAddress || typeof canonicalAddress.toString !== 'function' ||
      Reflect.apply(canonicalAddress.toString, canonicalAddress, []) !== parsed.value.address) fail();
  return parsed.value;
}

function parseWallet(bytes, runner) {
  const parsed = strictJsonLine(bytes);
  const wallet = Reflect.apply(runner.parsePublicWsOnceRoleInput, undefined, [
    `${parsed.text}\n`,
    'buyer-wallet',
  ]);
  if (wallet.accountIndex !== 0) fail();
  return wallet;
}

function deriveAccounts(walletInput, buyerAddressInput, runner, sdk) {
  let wallet;
  const keyPairs = [];
  try {
    const secret = parseWallet(walletInput, runner);
    const storedBuyer = parseAddressRecord(buyerAddressInput, 0, sdk);
    if (!sdk.KeyStore || typeof sdk.KeyStore.fromMnemonic !== 'function') fail();
    wallet = Reflect.apply(sdk.KeyStore.fromMnemonic, sdk.KeyStore, [secret.mnemonic]);
    if (!wallet || typeof wallet.getKeyPair !== 'function') fail();
    for (const index of [0, 1]) {
      const keyPair = Reflect.apply(wallet.getKeyPair, wallet, [index]);
      if (!keyPair || typeof keyPair.getAddress !== 'function') fail();
      keyPairs.push(keyPair);
    }
    const addresses = keyPairs.map(keyPair => {
      const value = Reflect.apply(keyPair.getAddress, keyPair, []);
      if (!value || typeof value.toString !== 'function') fail();
      return exactString(Reflect.apply(value.toString, value, []), ADDRESS_MAX_BYTES);
    });
    for (let index = 0; index < addresses.length; index += 1) {
      const parsed = Reflect.apply(sdk.Address.parse, sdk.Address, [addresses[index]]);
      if (!parsed || Reflect.apply(parsed.toString, parsed, []) !== addresses[index]) fail();
    }
    if (addresses[0] !== storedBuyer.address || addresses[0] === addresses[1]) fail();
    return Object.freeze({ payer: addresses[0], payee: addresses[1] });
  } catch {
    fail();
  } finally {
    clearSecrets(wallet, keyPairs);
  }
}

function runBoundedGit(repositoryRoot, runner) {
  let stdout;
  try {
    if (typeof repositoryRoot !== 'string' || !isAbsolute(repositoryRoot) ||
        resolve(repositoryRoot) !== repositoryRoot || typeof runner !== 'function') fail();
    const result = Reflect.apply(runner, undefined, [
      GIT_EXECUTABLE,
      [
        '--no-pager', '--no-optional-locks',
        '-c', 'color.ui=false',
        '-c', 'core.fsmonitor=false',
        '-c', 'core.untrackedCache=false',
        '-C', repositoryRoot,
        'rev-parse', '--verify', 'HEAD^{commit}',
      ],
      {
        env: {
          GIT_ATTR_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_NO_LAZY_FETCH: '1',
          GIT_NO_REPLACE_OBJECTS: '1',
          GIT_OPTIONAL_LOCKS: '0',
          GIT_PAGER: 'cat',
          GIT_PROTOCOL_FROM_USER: '0',
          GIT_TERMINAL_PROMPT: '0',
          LANG: 'C',
          LC_ALL: 'C',
        },
        encoding: null,
        input: undefined,
        killSignal: 'SIGKILL',
        maxBuffer: GIT_OUTPUT_MAX_BYTES,
        shell: false,
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: GIT_TIMEOUT_MS,
        windowsHide: true,
      },
    ]);
    stdout = result?.stdout;
    if (!result || result.error !== undefined || result.status !== 0 ||
        result.signal !== null || !Buffer.isBuffer(stdout) ||
        (stdout.length !== 41 && stdout.length !== 65) ||
        stdout[stdout.length - 1] !== 0x0a) fail();
    const revision = stdout.subarray(0, stdout.length - 1).toString('ascii');
    if (!REVISION.test(revision)) fail();
    return revision;
  } catch {
    fail();
  } finally {
    if (Buffer.isBuffer(stdout)) stdout.fill(0);
  }
}

async function captureSourceRevision(dependencies) {
  const revision = dependencies.sourceRevisionCapture === undefined
    ? runBoundedGit(dependencies.repositoryRoot, dependencies.gitRunner)
    : await Reflect.apply(dependencies.sourceRevisionCapture, undefined, []);
  if (typeof revision !== 'string' || !REVISION.test(revision)) fail();
  return revision;
}

async function loadModules(dependencies, needAttestation) {
  const loaders = [
    dependencies.runnerLoader,
    dependencies.sdkLoader,
    dependencies.canonicalLoader,
    dependencies.profileLoader,
  ];
  if (needAttestation && dependencies.sourceTreeAttestor === undefined) {
    loaders.push(dependencies.attestationLoader);
  }
  const modules = await Promise.all(loaders.map(loader => Reflect.apply(loader, undefined, [])));
  const [runner, sdk, canonical, profile, attestation] = modules;
  if (!runner || typeof runner.parsePublicWsOnceRoleInput !== 'function' ||
      typeof runner.parsePublicWsOnceRunConfig !== 'function' ||
      typeof runner.parsePublicWsOnceAuthorization !== 'function' ||
      typeof runner.publicWsOnceConfigDigest !== 'function' ||
      !runner.PUBLIC_WS_ONCE_POLICY || !sdk || !canonical ||
      typeof canonical.canonicalJson !== 'function' ||
      typeof canonical.paymentIntentDigest !== 'function' || !profile) fail();
  const sourceTreeAttestor = dependencies.sourceTreeAttestor ??
    attestation?.attestPublicWsOnceSourceTree;
  if (needAttestation && typeof sourceTreeAttestor !== 'function') fail();
  return { runner, sdk, canonical, profile, sourceTreeAttestor };
}

async function attestRevision(revision, sourceTreeAttestor) {
  if (await Reflect.apply(sourceTreeAttestor, undefined, [revision]) !== true) fail();
}

function validateEndpointSource(bytes, modules) {
  const source = parseGateBProtectedEndpointSource(bytes);
  const rpcBytes = canonicalJsonLine({
    secretVersion: 2,
    rpcEndpoint: source.rpcEndpoint,
  }, modules.canonical);
  try {
    Reflect.apply(modules.runner.parsePublicWsOnceRoleInput, undefined, [
      rpcBytes.toString('utf8'),
      'buyer-rpc',
    ]);
  } finally {
    rpcBytes.fill(0);
  }
  return source;
}

function validateHostnameSource(bytes) {
  return parseGateBQuickTunnelHostnameSource(bytes);
}

function exactPolicy(modules) {
  const policy = modules.runner.PUBLIC_WS_ONCE_POLICY;
  if (policy.transportException !== GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.transportException ||
      policy.paymentAcknowledgement !== GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.payment ||
      policy.publicationAcknowledgement !== GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.publication ||
      modules.profile.TESTNET_LIVE_ACKNOWLEDGEMENT !==
        GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.live ||
      modules.profile.GATE_B_CURRENT_TESTNET_OPERATOR_TRUST_ACKNOWLEDGEMENT !==
        GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.operatorTrust) fail();
  return policy;
}

function buildRunConfig(bootstrap, revision, endpointSource, hostnameSource, accounts, modules) {
  exactPolicy(modules);
  const asset = modules.sdk.ZNN_ZTS?.toString?.();
  exactString(asset, 128);
  const config = {
    runnerVersion: 2,
    sourceRevision: revision,
    profileName: modules.profile.GATE_B_CURRENT_TESTNET_PROFILE_NAME,
    quickTunnel: hostnameSource.quickTunnel,
    acknowledgements: {
      live: bootstrap.acknowledgements.live,
      operatorTrust: bootstrap.acknowledgements.operatorTrust,
    },
    expectedPaymentRequired: {
      x402Version: 2,
      resource: {
        url: `https://${hostnameSource.hostname}/paid`,
        description: 'Zenon x402 PoC protected resource',
        mimeType: 'application/json',
      },
      accepts: [{
        scheme: 'exact',
        network: 'zenon:testnet',
        asset,
        amount: '1',
        payTo: accounts.payee,
        maxTimeoutSeconds: 60,
        extra: {
          paymentFlow: 'upfront',
          poc: true,
          settlement: 'account-block',
          zenonChain: { ...modules.profile.GATE_B_CURRENT_TESTNET_CHAIN_PROFILE },
        },
      }],
    },
    runtime: {
      listenPort: 41000,
      rpcTimeoutMs: 30000,
      maxRecoveryAttempts: 0,
      recoveryDelayMs: 0,
      maxRecoveryElapsedMs: 1,
    },
  };
  const configBytes = canonicalJsonLine(config, modules.canonical);
  const rpcBytes = canonicalJsonLine({
    secretVersion: 2,
    rpcEndpoint: endpointSource.rpcEndpoint,
  }, modules.canonical);
  const payeeBytes = canonicalJsonLine({
    addressVersion: 1,
    address: accounts.payee,
    accountIndex: 1,
  }, modules.canonical);
  try {
    Reflect.apply(modules.runner.parsePublicWsOnceRunConfig, undefined, [
      configBytes.toString('utf8'),
    ]);
    Reflect.apply(modules.runner.parsePublicWsOnceRoleInput, undefined, [
      rpcBytes.toString('utf8'),
      'buyer-rpc',
    ]);
    Reflect.apply(modules.runner.parsePublicWsOnceRoleInput, undefined, [
      rpcBytes.toString('utf8'),
      'facilitator-rpc',
    ]);
    parseAddressRecord(payeeBytes, 1, modules.sdk);
    return { config, configBytes, rpcBytes, payeeBytes };
  } catch {
    configBytes.fill(0);
    rpcBytes.fill(0);
    payeeBytes.fill(0);
    fail();
  }
}

function assertFrozenPreparation(
  bootstrap,
  configuration,
  endpointSource,
  hostnameSource,
  buyerAddress,
  payeeAddress,
  accounts,
  buyerRpc,
  facilitatorRpc,
  modules,
) {
  exactPolicy(modules);
  const accepted = configuration.expectedPaymentRequired?.accepts?.[0];
  const expectedProfile = modules.profile.GATE_B_CURRENT_TESTNET_CHAIN_PROFILE;
  if (configuration.runnerVersion !== 2 ||
      configuration.profileName !== modules.profile.GATE_B_CURRENT_TESTNET_PROFILE_NAME ||
      configuration.acknowledgements.live !== GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.live ||
      configuration.acknowledgements.operatorTrust !==
        GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.operatorTrust ||
      configuration.runtime.listenPort !== 41000 ||
      configuration.runtime.rpcTimeoutMs !== 30000 ||
      configuration.runtime.maxRecoveryAttempts !== 0 ||
      configuration.runtime.recoveryDelayMs !== 0 ||
      configuration.runtime.maxRecoveryElapsedMs !== 1 ||
      configuration.expectedPaymentRequired.x402Version !== 2 ||
      configuration.expectedPaymentRequired.resource.url !==
        `https://${hostnameSource.hostname}/paid` ||
      configuration.expectedPaymentRequired.resource.description !==
        'Zenon x402 PoC protected resource' ||
      configuration.expectedPaymentRequired.resource.mimeType !== 'application/json' ||
      !accepted || configuration.expectedPaymentRequired.accepts.length !== 1 ||
      accepted.scheme !== 'exact' || accepted.network !== 'zenon:testnet' ||
      accepted.asset !== modules.sdk.ZNN_ZTS.toString() || accepted.amount !== '1' ||
      accepted.payTo !== accounts.payee || accepted.payTo !== payeeAddress.address ||
      accepted.maxTimeoutSeconds !== 60 || accepted.extra.paymentFlow !== 'upfront' ||
      accepted.extra.poc !== true || accepted.extra.settlement !== 'account-block' ||
      modules.canonical.canonicalJson(accepted.extra.zenonChain) !==
        modules.canonical.canonicalJson(expectedProfile) ||
      buyerAddress.address !== accounts.payer || buyerAddress.accountIndex !== 0 ||
      payeeAddress.accountIndex !== 1 || accounts.payer === accounts.payee ||
      buyerRpc.rpcEndpoint !== endpointSource.rpcEndpoint ||
      facilitatorRpc.rpcEndpoint !== endpointSource.rpcEndpoint ||
      buyerRpc.rpcEndpoint !== facilitatorRpc.rpcEndpoint ||
      modules.canonical.canonicalJson(configuration.quickTunnel) !==
        modules.canonical.canonicalJson(hostnameSource.quickTunnel) ||
      bootstrap.runName.length < 1) fail();
}

function recordMap(names, records) {
  const output = Object.create(null);
  for (let index = 0; index < names.length; index += 1) output[names[index]] = records[index];
  return output;
}

async function provisionEndpoint(bootstrap, dependencies) {
  let workspace;
  let sourceBytes;
  let writtenBytes;
  try {
    const modules = await loadModules(dependencies, false);
    sourceBytes = serializeGateBProtectedEndpointSource(bootstrap.rpcEndpoint);
    validateEndpointSource(sourceBytes, modules);
    workspace = await openGateBPublicWsPrivateWorkspace(
      bootstrap.workspaceRoot,
      dependencies.workspaceInjections,
    );
    await workspace.assertAbsent([GATE_B_PUBLIC_WS_INPUT_LEAVES.endpointSource]);
    const [output] = await workspace.reserveOutputs([
      GATE_B_PUBLIC_WS_INPUT_LEAVES.endpointSource,
    ]);
    await workspace.write(output, sourceBytes);
    writtenBytes = await workspace.read(output);
    if (!writtenBytes.equals(sourceBytes)) fail();
    validateEndpointSource(writtenBytes, modules);
    await workspace.syncDirectories();
    await workspace.verify(output, sourceBytes.length);
    return Object.freeze({ status: 'endpoint-provisioned' });
  } catch {
    fail();
  } finally {
    clearBuffer(sourceBytes);
    clearBuffer(writtenBytes);
    if (workspace) await workspace.close();
  }
}

async function prepareInputs(bootstrap, dependencies) {
  const buffers = [];
  let workspace;
  let prepared;
  try {
    const revision = await captureSourceRevision(dependencies);
    const modules = await loadModules(dependencies, true);
    await attestRevision(revision, modules.sourceTreeAttestor);
    workspace = await openGateBPublicWsPrivateWorkspace(
      bootstrap.workspaceRoot,
      dependencies.workspaceInjections,
    );
    const outputNames = [
      GATE_B_PUBLIC_WS_INPUT_LEAVES.payeeAddress,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc,
    ];
    await workspace.assertAbsent([
      GATE_B_PUBLIC_WS_INPUT_LEAVES.authorization,
      ...outputNames,
    ]);
    const outputRecords = await workspace.reserveOutputs(outputNames);
    const outputs = recordMap(outputNames, outputRecords);
    await Reflect.apply(dependencies.afterReservations, undefined, []);
    for (let index = 0; index < outputRecords.length; index += 1) {
      await workspace.verify(outputRecords[index], 0);
    }

    const inputNames = [
      GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerAddress,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.endpointSource,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
    ];
    const inputRecords = await workspace.openInputs(inputNames);
    const inputs = recordMap(inputNames, inputRecords);
    workspace.assertDistinct([...outputRecords, ...inputRecords]);
    const read = async record => {
      const bytes = await workspace.read(record);
      buffers.push(bytes);
      return bytes;
    };
    const endpointBytes = await read(inputs[GATE_B_PUBLIC_WS_INPUT_LEAVES.endpointSource]);
    const hostnameBytes = await read(inputs[GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource]);
    const walletBytes = await read(inputs[GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet]);
    const buyerAddressBytes = await read(inputs[GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerAddress]);
    const endpointSource = validateEndpointSource(endpointBytes, modules);
    const hostnameSource = validateHostnameSource(hostnameBytes);
    const accounts = deriveAccounts(walletBytes, buyerAddressBytes, modules.runner, modules.sdk);
    prepared = buildRunConfig(
      bootstrap,
      revision,
      endpointSource,
      hostnameSource,
      accounts,
      modules,
    );
    buffers.push(prepared.configBytes, prepared.rpcBytes, prepared.payeeBytes);

    await workspace.write(
      outputs[GATE_B_PUBLIC_WS_INPUT_LEAVES.payeeAddress],
      prepared.payeeBytes,
    );
    await workspace.write(
      outputs[GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig],
      prepared.configBytes,
    );
    await workspace.write(
      outputs[GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc],
      prepared.rpcBytes,
    );
    await workspace.write(
      outputs[GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc],
      prepared.rpcBytes,
    );

    const payeeWritten = await workspace.read(
      outputs[GATE_B_PUBLIC_WS_INPUT_LEAVES.payeeAddress],
    );
    const configWritten = await workspace.read(
      outputs[GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig],
    );
    const buyerRpcWritten = await workspace.read(
      outputs[GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc],
    );
    const facilitatorRpcWritten = await workspace.read(
      outputs[GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc],
    );
    buffers.push(payeeWritten, configWritten, buyerRpcWritten, facilitatorRpcWritten);
    const payee = parseAddressRecord(payeeWritten, 1, modules.sdk);
    const configuration = Reflect.apply(modules.runner.parsePublicWsOnceRunConfig, undefined, [
      configWritten.toString('utf8'),
    ]);
    const buyerRpc = Reflect.apply(modules.runner.parsePublicWsOnceRoleInput, undefined, [
      buyerRpcWritten.toString('utf8'), 'buyer-rpc',
    ]);
    const facilitatorRpc = Reflect.apply(modules.runner.parsePublicWsOnceRoleInput, undefined, [
      facilitatorRpcWritten.toString('utf8'), 'facilitator-rpc',
    ]);
    const buyerAddress = parseAddressRecord(buyerAddressBytes, 0, modules.sdk);
    assertFrozenPreparation(
      bootstrap, configuration, endpointSource, hostnameSource, buyerAddress, payee,
      accounts, buyerRpc, facilitatorRpc, modules,
    );
    if (configuration.sourceRevision !== revision) fail();
    await workspace.syncDirectories();
    for (const record of [...outputRecords, ...inputRecords]) await workspace.verify(record);
    await workspace.assertAbsent([GATE_B_PUBLIC_WS_INPUT_LEAVES.authorization]);
    await Reflect.apply(dependencies.beforeFinalAttestation, undefined, []);
    await attestRevision(revision, modules.sourceTreeAttestor);
    return Object.freeze({ status: 'prepared' });
  } catch {
    fail();
  } finally {
    for (let index = 0; index < buffers.length; index += 1) clearBuffer(buffers[index]);
    if (workspace) await workspace.close();
  }
}

async function authorizeInputs(bootstrap, dependencies) {
  const buffers = [];
  let workspace;
  let authorizationBytes;
  try {
    const modules = await loadModules(dependencies, true);
    exactPolicy(modules);
    workspace = await openGateBPublicWsPrivateWorkspace(
      bootstrap.workspaceRoot,
      dependencies.workspaceInjections,
    );
    await workspace.assertAbsent([GATE_B_PUBLIC_WS_INPUT_LEAVES.authorization]);
    const inputNames = [
      GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerAddress,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.endpointSource,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.payeeAddress,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc,
    ];
    const inputRecords = await workspace.openInputs(inputNames);
    const inputs = recordMap(inputNames, inputRecords);
    const read = async name => {
      const bytes = await workspace.read(inputs[name]);
      buffers.push(bytes);
      return bytes;
    };
    const walletBytes = await read(GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet);
    const buyerAddressBytes = await read(GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerAddress);
    const endpointBytes = await read(GATE_B_PUBLIC_WS_INPUT_LEAVES.endpointSource);
    const hostnameBytes = await read(GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource);
    const payeeBytes = await read(GATE_B_PUBLIC_WS_INPUT_LEAVES.payeeAddress);
    const configBytes = await read(GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig);
    const buyerRpcBytes = await read(GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc);
    const facilitatorRpcBytes = await read(GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc);

    const endpointSource = validateEndpointSource(endpointBytes, modules);
    const hostnameSource = validateHostnameSource(hostnameBytes);
    const accounts = deriveAccounts(walletBytes, buyerAddressBytes, modules.runner, modules.sdk);
    const buyerAddress = parseAddressRecord(buyerAddressBytes, 0, modules.sdk);
    const payeeAddress = parseAddressRecord(payeeBytes, 1, modules.sdk);
    const configuration = Reflect.apply(modules.runner.parsePublicWsOnceRunConfig, undefined, [
      configBytes.toString('utf8'),
    ]);
    const buyerRpc = Reflect.apply(modules.runner.parsePublicWsOnceRoleInput, undefined, [
      buyerRpcBytes.toString('utf8'), 'buyer-rpc',
    ]);
    const facilitatorRpc = Reflect.apply(modules.runner.parsePublicWsOnceRoleInput, undefined, [
      facilitatorRpcBytes.toString('utf8'), 'facilitator-rpc',
    ]);
    assertFrozenPreparation(
      bootstrap, configuration, endpointSource, hostnameSource, buyerAddress, payeeAddress,
      accounts, buyerRpc, facilitatorRpc, modules,
    );
    const digest = Reflect.apply(modules.runner.publicWsOnceConfigDigest, undefined, [
      configuration,
    ]);
    if (digest !== bootstrap.reviewedConfigDigest) fail();
    const currentRevision = await captureSourceRevision(dependencies);
    if (configuration.sourceRevision !== currentRevision) fail();
    const intentDigest = Reflect.apply(modules.canonical.paymentIntentDigest, undefined, [
      configuration.expectedPaymentRequired,
      configuration.expectedPaymentRequired.accepts[0],
    ]);
    const authorization = {
      authorizationVersion: 2,
      transportException: bootstrap.acknowledgements.transportException,
      runName: bootstrap.runName,
      sourceRevision: configuration.sourceRevision,
      profileName: configuration.profileName,
      configDigest: digest,
      paymentIntentDigest: intentDigest,
      rpcEndpoint: buyerRpc.rpcEndpoint,
      quickTunnel: configuration.quickTunnel,
      acknowledgements: {
        payment: bootstrap.acknowledgements.payment,
        publication: bootstrap.acknowledgements.publication,
      },
    };
    authorizationBytes = canonicalJsonLine(authorization, modules.canonical);
    Reflect.apply(modules.runner.parsePublicWsOnceAuthorization, undefined, [
      authorizationBytes.toString('utf8'),
    ]);
    for (let index = 0; index < inputRecords.length; index += 1) {
      await workspace.verify(inputRecords[index]);
    }
    await Reflect.apply(dependencies.beforeAuthorizationReservation, undefined, []);
    await attestRevision(currentRevision, modules.sourceTreeAttestor);
    const [output] = await workspace.reserveOutputs([
      GATE_B_PUBLIC_WS_INPUT_LEAVES.authorization,
    ]);
    workspace.assertDistinct([...inputRecords, output]);
    await workspace.write(output, authorizationBytes);
    const written = await workspace.read(output);
    buffers.push(written);
    const parsedAuthorization = Reflect.apply(
      modules.runner.parsePublicWsOnceAuthorization,
      undefined,
      [written.toString('utf8')],
    );
    if (!written.equals(authorizationBytes) ||
        parsedAuthorization.configDigest !== digest ||
        parsedAuthorization.runName !== bootstrap.runName ||
        parsedAuthorization.rpcEndpoint !== endpointSource.rpcEndpoint ||
        modules.canonical.canonicalJson(parsedAuthorization.quickTunnel) !==
          modules.canonical.canonicalJson(hostnameSource.quickTunnel) ||
        parsedAuthorization.sourceRevision !== currentRevision) fail();
    await workspace.syncDirectories();
    await workspace.verify(output, authorizationBytes.length);
    return Object.freeze({ status: 'authorized' });
  } catch {
    fail();
  } finally {
    clearBuffer(authorizationBytes);
    for (let index = 0; index < buffers.length; index += 1) clearBuffer(buffers[index]);
    if (workspace) await workspace.close();
  }
}

export async function executeGateBPublicWsInputs(bootstrap, injected) {
  let snapshotFrame;
  try {
    snapshotFrame = frameGateBPublicWsInputsBootstrap(bootstrap);
    bootstrap = parseGateBPublicWsInputsFrame(snapshotFrame);
    const dependencies = captureOperationInjections(injected);
    if (bootstrap.operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PROVISION_ENDPOINT) {
      return await provisionEndpoint(bootstrap, dependencies);
    }
    if (bootstrap.operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PREPARE) {
      return await prepareInputs(bootstrap, dependencies);
    }
    if (bootstrap.operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.AUTHORIZE) {
      return await authorizeInputs(bootstrap, dependencies);
    }
    fail();
  } catch {
    fail();
  } finally {
    clearBuffer(snapshotFrame);
  }
}

export async function readGateBPublicWsInputsChildBootstrap(fd = BOOTSTRAP_FD) {
  const chunks = [];
  let total = 0;
  let frame;
  try {
    if (!Number.isSafeInteger(fd) || fd < 0) fail();
    const stream = createReadStream(null, {
      fd,
      autoClose: true,
      highWaterMark: 1024,
    });
    for await (const chunk of stream) {
      if (!Buffer.isBuffer(chunk)) fail();
      total += chunk.length;
      if (!Number.isSafeInteger(total) || total > GATE_B_PUBLIC_WS_INPUT_LIMITS.frameBytes) {
        fail();
      }
      chunks.push(chunk);
    }
    if (total < 5) fail();
    frame = Buffer.concat(chunks, total);
    return parseGateBPublicWsInputsFrame(frame);
  } catch {
    fail();
  } finally {
    if (Buffer.isBuffer(frame)) frame.fill(0);
    for (let index = 0; index < chunks.length; index += 1) chunks[index].fill(0);
  }
}

function exactControlMessage(message) {
  exactPlainObject(message, ['ipcVersion', 'requestId', 'type']);
  if (message.ipcVersion !== IPC_VERSION || message.requestId !== REQUEST_ID ||
      message.type !== 'EXECUTE') fail();
}

function terminalType(operation) {
  if (operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PROVISION_ENDPOINT) {
    return 'ENDPOINT_PROVISIONED';
  }
  if (operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PREPARE) return 'INPUTS_PREPARED';
  if (operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.AUTHORIZE) return 'INPUTS_AUTHORIZED';
  fail();
}

function send(channel, type) {
  return new Promise((resolveSend, rejectSend) => {
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      if (error) rejectSend(new GateBPublicWsInputsChildError());
      else resolveSend();
    };
    try {
      const accepted = channel.send({
        ipcVersion: IPC_VERSION,
        requestId: REQUEST_ID,
        type,
      }, finish);
      if (accepted === false && channel.connected === false) finish(new Error());
    } catch {
      finish(new Error());
    }
  });
}

function captureChildOptions(options) {
  if (!options || typeof options !== 'object' || IS_PROXY(options) ||
      ARRAY_IS_ARRAY(options) || GET_PROTOTYPE_OF(options) !== OBJECT_PROTOTYPE) fail();
  const output = {
    channel: process,
    readBootstrap: () => readGateBPublicWsInputsChildBootstrap(),
    execute: executeGateBPublicWsInputs,
    forceExit: code => process.exit(code),
    operationInjections: undefined,
  };
  const allowed = Object.keys(output);
  const keys = REFLECT_OWN_KEYS(options);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = typeof key === 'string'
      ? GET_OWN_PROPERTY_DESCRIPTOR(options, key)
      : undefined;
    if (!allowed.includes(key) || !descriptor || !HAS_OWN(descriptor, 'value') ||
        descriptor.enumerable !== true) fail();
    output[key] = descriptor.value;
  }
  if (!output.channel || typeof output.channel.once !== 'function' ||
      typeof output.channel.on !== 'function' || typeof output.channel.send !== 'function' ||
      typeof output.readBootstrap !== 'function' || typeof output.execute !== 'function' ||
      typeof output.forceExit !== 'function') fail();
  return output;
}

export async function runGateBPublicWsInputsChild(options = {}) {
  const dependencies = captureChildOptions(options);
  let handling = false;
  let finished = false;
  const terminate = code => {
    if (finished) return;
    finished = true;
    try { Reflect.apply(dependencies.forceExit, undefined, [code]); } catch {}
  };
  try {
    const bootstrap = await Reflect.apply(dependencies.readBootstrap, undefined, []);
    dependencies.channel.once('disconnect', () => terminate(1));
    dependencies.channel.on('message', async message => {
      if (handling || finished) return terminate(1);
      handling = true;
      try {
        exactControlMessage(message);
        const result = await Reflect.apply(dependencies.execute, undefined, [
          bootstrap,
          dependencies.operationInjections,
        ]);
        const expectedStatus = bootstrap.operation ===
          GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PROVISION_ENDPOINT
          ? 'endpoint-provisioned'
          : bootstrap.operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PREPARE
            ? 'prepared'
            : 'authorized';
        if (finished || !result || typeof result !== 'object' ||
            REFLECT_OWN_KEYS(result).length !== 1 || result.status !== expectedStatus) fail();
        await send(dependencies.channel, terminalType(bootstrap.operation));
        if (!finished) terminate(0);
      } catch {
        terminate(1);
      }
    });
    await send(dependencies.channel, 'READY');
  } catch {
    terminate(1);
  }
}

async function launch() {
  if (typeof process.argv[1] !== 'string' ||
      pathToFileURL(process.argv[1]).href !== import.meta.url) return;
  await runGateBPublicWsInputsChild();
}

void launch().catch(() => {
  try { process.exit(1); } catch {}
});
