import { createReadStream } from 'node:fs';
import { userInfo } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { types as utilTypes } from 'node:util';

import { selectGateBBuyerWalletWorkspace } from './gate-b-buyer-wallet-selector.js';
import { canonicalJson } from './canonical.js';
import { GATE_B_PUBLIC_WS_INPUT_LEAVES } from './gate-b-public-ws-inputs-schema.js';
import { openGateBPublicWsPrivateWorkspace } from './gate-b-public-ws-private-workspace.js';
import {
  GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES,
  GATE_B_TESTNET_FAUCET_RECEIVE_LIMITS,
  frameGateBTestnetFaucetReceiveBootstrap,
  parseGateBTestnetFaucetReceiveFrame,
} from './gate-b-testnet-faucet-receive-schema.js';
import {
  GATE_B_TESTNET_FAUCET_RECEIVE_STATES,
  openGateBTestnetFaucetReceiveState,
} from './gate-b-testnet-faucet-receive-state.js';
import { liveSdkRuntime } from './live-runtime.js';
import {
  assertZenonNodeReady,
  computeBlockHash,
  normalizeConfirmationDetail,
} from './zenon-payment.js';
import { invokeLegacySdk105SignedComposite } from
  './zenon/internal/legacy-sdk-1-0-5-signed-composite.js';
import {
  GATE_B_CURRENT_TESTNET_CHAIN_PROFILE,
  GATE_B_CURRENT_TESTNET_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  GATE_B_CURRENT_TESTNET_PROFILE_NAME,
  GATE_B_CURRENT_TESTNET_SDK_NETWORK_ID,
  TESTNET_LIVE_ACKNOWLEDGEMENT,
  selectGateBCurrentTestnetPolicy,
} from './zenon/operator-trusted-testnet-profile.js';

const ERROR_CODE = 'gate_b_testnet_faucet_receive_child_failed';
const CHILD_BOOTSTRAP_FD = 4;
const READ_TIMEOUT_MS = 30_000;
const PREPARE_TIMEOUT_MS = 3 * 60_000;
const PUBLICATION_TIMEOUT_MS = 30_000;
const INCLUSION_TIMEOUT_MS = 2 * 60_000;
const INCLUSION_POLL_MS = 1000;
const HASH = /^[0-9a-f]{64}$/u;
const ADDRESS = /^z1[0-9a-z]{38}$/u;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const NONCE = /^[0-9a-f]{16}$/u;
const EXPECTED_CHAIN_ID = Number(GATE_B_CURRENT_TESTNET_CHAIN_PROFILE.chainIdentifier);
const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_PROTOTYPE = Array.prototype;
const BIGINT_TO_STRING = BigInt.prototype.toString;
const BUFFER_EQUALS = Buffer.prototype.equals;
const BUFFER_FROM = Buffer.from;
const BUFFER_IS_BUFFER = Buffer.isBuffer;
const BUFFER_TO_STRING = Buffer.prototype.toString;
const DEFINE_PROPERTY = Object.defineProperty;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const SIGNED_FIELDS = Object.freeze([
  'address', 'amount', 'blockType', 'chainIdentifier', 'data', 'difficulty',
  'fromBlockHash', 'fusedPlasma', 'hash', 'height', 'momentumAcknowledged',
  'nonce', 'previousHash', 'publicKey', 'signature', 'toAddress',
  'tokenStandard', 'version',
]);

export class GateBTestnetFaucetReceiveChildError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBTestnetFaucetReceiveChildError';
    this.code = ERROR_CODE;
    this.stack = undefined;
  }
}

function fail() {
  throw new GateBTestnetFaucetReceiveChildError();
}

function exactObject(value, fields, prototype = OBJECT_PROTOTYPE) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) ||
      ARRAY_IS_ARRAY(value) || GET_PROTOTYPE_OF(value) !== prototype) fail();
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

function ownData(value, field) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function') ||
      IS_PROXY(value)) fail();
  const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, field);
  if (!descriptor || !HAS_OWN(descriptor, 'value')) fail();
  return descriptor.value;
}

function method(value, field) {
  let current = value;
  while (current !== null) {
    if (IS_PROXY(current)) fail();
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(current, field);
    if (descriptor) {
      if (!HAS_OWN(descriptor, 'value') || typeof descriptor.value !== 'function' ||
          IS_PROXY(descriptor.value)) fail();
      return descriptor.value;
    }
    current = GET_PROTOTYPE_OF(current);
  }
  fail();
}

function defaultApplicationSupportRoot() {
  try {
    const value = userInfo();
    if (!value || typeof value !== 'object' || typeof value.homedir !== 'string' ||
        !isAbsolute(value.homedir)) fail();
    return join(value.homedir, 'Library', 'Application Support');
  } catch {
    fail();
  }
}

async function defaultLoadDependencies() {
  const sdk = await import('znn-typescript-sdk');
  const ed = await import('@noble/ed25519');
  const { sha512 } = await import('@noble/hashes/sha2');
  ed.etc.sha512Sync = (...messages) => sha512(ed.etc.concatBytes(...messages));
  return Object.freeze({ ed, sdk });
}

function defaultPolicy() {
  return selectGateBCurrentTestnetPolicy(
    GATE_B_CURRENT_TESTNET_PROFILE_NAME,
    GATE_B_CURRENT_TESTNET_OPERATOR_TRUST_ACKNOWLEDGEMENT,
    TESTNET_LIVE_ACKNOWLEDGEMENT,
  );
}

function defaultWait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function captureExecutionInjections(value) {
  const output = {
    actualCwdPath: () => process.cwd(),
    applicationSupportRoot: defaultApplicationSupportRoot,
    assertNodeReady: assertZenonNodeReady,
    createPolicy: defaultPolicy,
    invokeComposite: invokeLegacySdk105SignedComposite,
    loadDependencies: defaultLoadDependencies,
    now: () => performance.now(),
    onExecutionMode: async () => true,
    onPublicationStart: async () => true,
    openReceiveState: openGateBTestnetFaucetReceiveState,
    openWalletWorkspace: openGateBPublicWsPrivateWorkspace,
    receiveStateInjections: undefined,
    runtime: liveSdkRuntime,
    wait: defaultWait,
    walletWorkspaceInjections: undefined,
  };
  if (value === undefined) return output;
  if (value === null || typeof value !== 'object' || IS_PROXY(value) ||
      ARRAY_IS_ARRAY(value) || GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const allowed = Object.keys(output);
  for (const key of REFLECT_OWN_KEYS(value)) {
    const descriptor = typeof key === 'string' ? GET_OWN_PROPERTY_DESCRIPTOR(value, key) : undefined;
    if (!allowed.includes(key) || !descriptor || !HAS_OWN(descriptor, 'value')) fail();
    output[key] = descriptor.value;
  }
  for (const field of [
    'actualCwdPath', 'applicationSupportRoot', 'assertNodeReady', 'createPolicy', 'invokeComposite',
    'loadDependencies', 'now', 'onExecutionMode', 'onPublicationStart', 'openReceiveState',
    'openWalletWorkspace', 'wait',
  ]) {
    if (typeof output[field] !== 'function' || IS_PROXY(output[field])) fail();
  }
  if (!output.runtime || typeof output.runtime.withOwner !== 'function') fail();
  return output;
}

function walletWorkspaceRoot(dependencies) {
  const supportRoot = REFLECT_APPLY(dependencies.applicationSupportRoot, undefined, []);
  const actualCwd = REFLECT_APPLY(dependencies.actualCwdPath, undefined, []);
  if (typeof supportRoot !== 'string' || !isAbsolute(supportRoot) ||
      resolve(supportRoot) !== supportRoot || typeof actualCwd !== 'string' ||
      !isAbsolute(actualCwd) || resolve(actualCwd) !== actualCwd) fail();
  try {
    return selectGateBBuyerWalletWorkspace(actualCwd, supportRoot).walletWorkspaceRoot;
  } catch {
    fail();
  }
}

function parseJsonLine(bytes, fields) {
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length < 3 || bytes.length > 64 * 1024 ||
        bytes[bytes.length - 1] !== 0x0a) fail();
    const text = bytes.subarray(0, bytes.length - 1).toString('utf8');
    if (Buffer.byteLength(text, 'utf8') !== bytes.length - 1 || text.includes('\n') ||
        text.includes('\r')) fail();
    return exactObject(JSON.parse(text), fields);
  } catch {
    fail();
  }
}

function parseAddressInput(bytes) {
  const value = parseJsonLine(bytes, ['accountIndex', 'address', 'addressVersion']);
  if (value.addressVersion !== 1 || value.accountIndex !== 0 ||
      typeof value.address !== 'string' || !ADDRESS.test(value.address)) fail();
  return value.address;
}

function parseWalletInput(bytes) {
  const value = parseJsonLine(bytes, ['accountIndex', 'mnemonic', 'secretVersion']);
  if (value.secretVersion !== 1 || value.accountIndex !== 0 ||
      typeof value.mnemonic !== 'string' || value.mnemonic.length < 1 ||
      value.mnemonic.length > 4096 || /[\u0000-\u001f\u007f]/u.test(value.mnemonic)) fail();
  return value.mnemonic;
}

function clearBuffer(value) {
  try {
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) value.fill(0);
  } catch {}
}

function clearSecrets(wallet, keyPair) {
  try {
    const clear = keyPair && method(keyPair, 'clear');
    if (clear) REFLECT_APPLY(clear, keyPair, []);
  } catch {}
  if (keyPair && typeof keyPair === 'object' && !IS_PROXY(keyPair)) {
    try { clearBuffer(ownData(keyPair, 'privateKey')); } catch {}
    try { clearBuffer(ownData(keyPair, 'publicKey')); } catch {}
  }
  if (wallet && typeof wallet === 'object' && !IS_PROXY(wallet)) {
    for (const field of ['mnemonic', 'entropy', 'seed']) {
      try {
        const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(wallet, field);
        if (descriptor && HAS_OWN(descriptor, 'value') && descriptor.writable === true) {
          Object.defineProperty(wallet, field, { ...descriptor, value: '' });
        }
      } catch {}
    }
  }
}

function exactSdkValue(value, expectedPrototype) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) ||
      GET_PROTOTYPE_OF(value) !== expectedPrototype) fail();
  return value;
}

function exactBuffer(value, expectedLength) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) ||
      !BUFFER_IS_BUFFER(value) || GET_PROTOTYPE_OF(value) !== Buffer.prototype ||
      (expectedLength !== undefined && value.length !== expectedLength)) fail();
  return value;
}

function sdkCore(value, expectedPrototype, expectedLength) {
  exactSdkValue(value, expectedPrototype);
  return exactBuffer(ownData(value, 'core'), expectedLength);
}

function prototypeMethod(prototype, field) {
  if (prototype === null || typeof prototype !== 'object' || IS_PROXY(prototype)) fail();
  const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(prototype, field);
  if (!descriptor || !HAS_OWN(descriptor, 'value') ||
      typeof descriptor.value !== 'function' || IS_PROXY(descriptor.value)) fail();
  return descriptor.value;
}

function sdkHashString(value, sdk) {
  return REFLECT_APPLY(BUFFER_TO_STRING, sdkCore(value, sdk.Hash.prototype, 32), ['hex']);
}

function sdkAddressString(value, sdk) {
  sdkCore(value, sdk.Address.prototype, 20);
  const hrp = ownData(value, 'hrp');
  if (typeof hrp !== 'string' || hrp.length < 1 || hrp.length > 16) fail();
  return REFLECT_APPLY(prototypeMethod(sdk.Address.prototype, 'toString'), value, []);
}

function sdkTokenString(value, sdk) {
  sdkCore(value, sdk.TokenStandard.prototype, 10);
  return REFLECT_APPLY(prototypeMethod(sdk.TokenStandard.prototype, 'toString'), value, []);
}

function defineEnumerable(target, field, value) {
  REFLECT_APPLY(DEFINE_PROPERTY, undefined, [target, field, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  }]);
}

function rpcObservedBinaryField(value, expectedLength) {
  exactBuffer(value);
  if (value.length === expectedLength) {
    return Object.freeze({
      encoding: 'binary',
      value: REFLECT_APPLY(BUFFER_TO_STRING, value, ['base64']),
    });
  }
  const expectedEncodedLength = expectedLength === 32 ? 44 : expectedLength === 64 ? 88 : 0;
  if (value.length !== expectedEncodedLength) fail();
  const encoded = REFLECT_APPLY(BUFFER_TO_STRING, value, ['utf8']);
  if (!BASE64.test(encoded)) fail();
  let decoded;
  let ascii;
  try {
    ascii = REFLECT_APPLY(BUFFER_FROM, Buffer, [encoded, 'ascii']);
    if (!REFLECT_APPLY(BUFFER_EQUALS, ascii, [value])) fail();
    decoded = REFLECT_APPLY(BUFFER_FROM, Buffer, [encoded, 'base64']);
    if (decoded.length !== expectedLength ||
        REFLECT_APPLY(BUFFER_TO_STRING, decoded, ['base64']) !== encoded) fail();
  } finally {
    try { ascii?.fill(0); } catch {}
    try { decoded?.fill(0); } catch {}
  }
  return Object.freeze({ encoding: 'base64-ascii', value: encoded });
}

function signedBlockSnapshot(value, expectedPrototype, sdk, rpcObservation = false) {
  exactSdkValue(value, expectedPrototype);
  const momentum = exactSdkValue(
    ownData(value, 'momentumAcknowledged'),
    sdk.HashHeight.prototype,
  );
  const data = exactBuffer(ownData(value, 'data'));
  const rawPublicKey = ownData(value, 'publicKey');
  const rawSignature = ownData(value, 'signature');
  let publicKey;
  let signature;
  if (rpcObservation) {
    publicKey = rpcObservedBinaryField(rawPublicKey, 32);
    signature = rpcObservedBinaryField(rawSignature, 64);
    if (publicKey.encoding !== signature.encoding) fail();
  } else {
    publicKey = Object.freeze({
      encoding: 'binary',
      value: REFLECT_APPLY(BUFFER_TO_STRING, exactBuffer(rawPublicKey, 32), ['base64']),
    });
    signature = Object.freeze({
      encoding: 'binary',
      value: REFLECT_APPLY(BUFFER_TO_STRING, exactBuffer(rawSignature, 64), ['base64']),
    });
  }
  const output = {};
  for (const [field, fieldValue] of [
    ['address', sdkAddressString(ownData(value, 'address'), sdk)],
    ['amount', REFLECT_APPLY(BIGINT_TO_STRING, ownData(value, 'amount'), [])],
    ['blockType', ownData(value, 'blockType')],
    ['chainIdentifier', ownData(value, 'chainIdentifier')],
    ['data', REFLECT_APPLY(BUFFER_TO_STRING, data, ['base64'])],
    ['difficulty', ownData(value, 'difficulty')],
    ['fromBlockHash', sdkHashString(ownData(value, 'fromBlockHash'), sdk)],
    ['fusedPlasma', ownData(value, 'fusedPlasma')],
    ['hash', sdkHashString(ownData(value, 'hash'), sdk)],
    ['height', ownData(value, 'height')],
    ['momentumAcknowledged', {
      hash: sdkHashString(ownData(momentum, 'hash'), sdk),
      height: ownData(momentum, 'height'),
    }],
    ['nonce', ownData(value, 'nonce')],
    ['previousHash', sdkHashString(ownData(value, 'previousHash'), sdk)],
    ['publicKey', publicKey.value],
    ['signature', signature.value],
    ['toAddress', sdkAddressString(ownData(value, 'toAddress'), sdk)],
    ['tokenStandard', sdkTokenString(ownData(value, 'tokenStandard'), sdk)],
    ['version', ownData(value, 'version')],
  ]) defineEnumerable(output, field, fieldValue);
  return output;
}

function normalizeNativeSource(block, sdk, expectedAddress) {
  exactSdkValue(block, sdk.AccountBlock.prototype);
  const blockType = ownData(block, 'blockType');
  const hashObject = exactSdkValue(ownData(block, 'hash'), sdk.Hash.prototype);
  const addressObject = exactSdkValue(ownData(block, 'toAddress'), sdk.Address.prototype);
  const tokenObject = exactSdkValue(ownData(block, 'tokenStandard'), sdk.TokenStandard.prototype);
  const amount = ownData(block, 'amount');
  const hash = sdkHashString(hashObject, sdk);
  const address = sdkAddressString(addressObject, sdk);
  const asset = sdkTokenString(tokenObject, sdk);
  const znn = sdkTokenString(sdk.ZNN_ZTS, sdk);
  const qsr = sdkTokenString(sdk.QSR_ZTS, sdk);
  if ((blockType !== sdk.BlockTypeEnum.UserSend &&
      blockType !== sdk.BlockTypeEnum.ContractSend) || typeof amount !== 'bigint' ||
      amount <= 0n || !HASH.test(hash) || address !== expectedAddress ||
      (asset !== znn && asset !== qsr)) fail();
  return Object.freeze({
    address,
    amount: REFLECT_APPLY(BIGINT_TO_STRING, amount, []),
    asset,
    blockType,
    hash,
    hashObject,
  });
}

function sourceIdentity(source) {
  return Object.freeze({
    address: source.address,
    amount: source.amount,
    asset: source.asset,
    blockType: source.blockType,
    confirmationMomentumHeight: source.confirmationMomentumHeight,
    hash: source.hash,
  });
}

function pendingSourceIdentity(source) {
  return Object.freeze({
    address: source.address,
    amount: source.amount,
    asset: source.asset,
    blockType: source.blockType,
    hash: source.hash,
  });
}

function secondReceiveAttempt(record, source) {
  const first = record.blocks[0];
  const signed = first.signedAccountBlock;
  return Object.freeze({
    firstReceive: Object.freeze({
      hash: signed.hash,
      height: signed.height,
      momentumAcknowledgedHeight: signed.momentumAcknowledged.height,
      sourceHash: first.sourceHash,
    }),
    schemaVersion: 1,
    secondSource: pendingSourceIdentity(source),
  });
}

function normalizeHistoricalNativeSource(
  block,
  sdk,
  expectedAddress,
  expectedHash,
  maximumMomentumHeight,
) {
  const source = normalizeNativeSource(block, sdk, expectedAddress);
  if (source.hash !== expectedHash ||
      sdkHashString(computeBlockHash(block, sdk), sdk) !== expectedHash) fail();
  const confirmation = ownData(block, 'confirmationDetail');
  if (confirmation === undefined || confirmation === null) fail();
  const normalized = normalizeConfirmationDetail(confirmation);
  if (!Number.isSafeInteger(normalized.numConfirmations) ||
      normalized.numConfirmations < 1 ||
      !Number.isSafeInteger(normalized.momentumHeight) ||
      normalized.momentumHeight < 1 ||
      normalized.momentumHeight > maximumMomentumHeight) fail();
  return Object.freeze({
    ...source,
    confirmationMomentumHeight: normalized.momentumHeight,
  });
}

function exactComplementaryNativeSources(first, second, sdk) {
  const znn = sdkTokenString(sdk.ZNN_ZTS, sdk);
  const qsr = sdkTokenString(sdk.QSR_ZTS, sdk);
  if (first.hash === second.hash || first.address !== second.address ||
      !((first.asset === znn && second.asset === qsr) ||
        (first.asset === qsr && second.asset === znn))) fail();
}

function normalizePendingList(result, sdk, expectedAddress, expectedCount = 2) {
  exactSdkValue(result, sdk.AccountBlockList.prototype);
  const count = ownData(result, 'count');
  const list = ownData(result, 'list');
  const more = ownData(result, 'more');
  if ((expectedCount !== 1 &&
      expectedCount !== GATE_B_TESTNET_FAUCET_RECEIVE_LIMITS.expectedTransfers) ||
      count !== expectedCount || more !== false ||
      !ARRAY_IS_ARRAY(list) || IS_PROXY(list) || GET_PROTOTYPE_OF(list) !== ARRAY_PROTOTYPE ||
      list.length !== count) fail();
  const output = [];
  const seen = new Set();
  for (let index = 0; index < list.length; index += 1) {
    const source = normalizeNativeSource(list[index], sdk, expectedAddress);
    if (seen.has(source.hash)) fail();
    seen.add(source.hash);
    output.push(source);
  }
  if (expectedCount === GATE_B_TESTNET_FAUCET_RECEIVE_LIMITS.expectedTransfers) {
    exactComplementaryNativeSources(output[0], output[1], sdk);
  }
  return Object.freeze(output);
}

function stablePendingSnapshot(first, second) {
  const normalize = blocks => blocks.map(block => ({
    address: block.address,
    amount: block.amount,
    asset: block.asset,
    blockType: block.blockType,
    hash: block.hash,
  }));
  if (canonicalJson(normalize(first)) !== canonicalJson(normalize(second))) fail();
  return first;
}

function exactZeroUnconfirmed(result, sdk) {
  exactSdkValue(result, sdk.AccountBlockList.prototype);
  const list = ownData(result, 'list');
  if (ownData(result, 'count') !== 0 || ownData(result, 'more') !== false ||
      !ARRAY_IS_ARRAY(list) || IS_PROXY(list) ||
      GET_PROTOTYPE_OF(list) !== ARRAY_PROTOTYPE || list.length !== 0) fail();
}

function exactBase64(value, bytes) {
  if (typeof value !== 'string' || !BASE64.test(value)) fail();
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== bytes || decoded.toString('base64') !== value) fail();
  return decoded;
}

function exactSignedJson(value, source, expectedAddress, sdk, ed, prepared) {
  exactObject(value, SIGNED_FIELDS);
  if (value.version !== 1 || value.chainIdentifier !== EXPECTED_CHAIN_ID ||
      value.blockType !== sdk.BlockTypeEnum.UserReceive || !HASH.test(value.hash) ||
      !HASH.test(value.previousHash) || !Number.isSafeInteger(value.height) || value.height < 1 ||
      value.address !== expectedAddress || value.toAddress !== sdk.EMPTY_ADDRESS.toString() ||
      value.amount !== '0' || value.tokenStandard !== sdk.EMPTY_ZTS.toString() ||
      value.fromBlockHash !== source.hash || value.data !== '' || value.fusedPlasma !== 0 ||
      !Number.isSafeInteger(value.difficulty) || value.difficulty < 1 ||
      !NONCE.test(value.nonce) || value.nonce === '0000000000000000') fail();
  exactObject(value.momentumAcknowledged, ['hash', 'height']);
  if (!HASH.test(value.momentumAcknowledged.hash) ||
      !Number.isSafeInteger(value.momentumAcknowledged.height) ||
      value.momentumAcknowledged.height < 0) fail();
  const publicKey = exactBase64(value.publicKey, 32);
  const signature = exactBase64(value.signature, 64);
  const publicAddress = sdkAddressString(sdk.Address.fromPublicKey(publicKey), sdk);
  if (publicAddress !== expectedAddress) fail();
  const computed = computeBlockHash(prepared, sdk);
  if (computed.toString() !== value.hash ||
      ed.verify(signature, computed.getBytes(), publicKey, { zip215: false }) !== true) fail();
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}

function observedBaseJson(observed, sdk) {
  return signedBlockSnapshot(observed, sdk.AccountBlock.prototype, sdk, true);
}

function exactIncludedObservation(observed, preparedJson, sdk) {
  if (observed === null) return null;
  const base = observedBaseJson(observed, sdk);
  if (canonicalJson(base) !== canonicalJson(preparedJson) ||
      computeBlockHash(observed, sdk).toString() !== preparedJson.hash) fail();
  const confirmation = ownData(observed, 'confirmationDetail');
  if (confirmation === undefined || confirmation === null) return null;
  const normalized = normalizeConfirmationDetail(confirmation);
  if (!Number.isSafeInteger(normalized.numConfirmations) || normalized.numConfirmations < 1) fail();
  return observed;
}

function cloneRecord(record) {
  return JSON.parse(JSON.stringify(record));
}

function preparedRecord(record, index, sourceHash, signedAccountBlock) {
  const next = cloneRecord(record);
  next.revision += 1;
  next.activeIndex = index;
  next.state = GATE_B_TESTNET_FAUCET_RECEIVE_STATES.PREPARED;
  next.blocks.push({ index, signedAccountBlock, sourceHash, state: 'PREPARED' });
  return next;
}

function advanceRecord(record, state) {
  const next = cloneRecord(record);
  next.revision += 1;
  next.state = state;
  next.blocks[next.blocks.length - 1].state = state;
  return next;
}

function completeRecord(record) {
  const next = cloneRecord(record);
  next.revision += 1;
  next.activeIndex = null;
  next.state = GATE_B_TESTNET_FAUCET_RECEIVE_STATES.COMPLETE;
  return next;
}

function recoveredRecord(record) {
  const next = cloneRecord(record);
  next.revision += 1;
  next.activeIndex = null;
  next.state = GATE_B_TESTNET_FAUCET_RECEIVE_STATES.RECOVERED;
  for (let index = 0; index < next.blocks.length; index += 1) {
    next.blocks[index].state = GATE_B_TESTNET_FAUCET_RECEIVE_STATES.INCLUDED;
  }
  return next;
}

async function runRead(scope, operation, execute, timeoutMs = READ_TIMEOUT_MS) {
  return scope.runRpcWithDeadline({
    category: 'read', operation, timeoutMs, execute,
  });
}

async function lookupIncluded({ scope, zenon, sdk, preparedJson, dependencies, waitForMore }) {
  const deadline = dependencies.now() + INCLUSION_TIMEOUT_MS;
  let first = true;
  while (first || (waitForMore && dependencies.now() < deadline)) {
    first = false;
    const observed = await runRead(
      scope,
      'ledger.getAccountBlockByHash',
      () => zenon.ledger.getAccountBlockByHash(sdk.Hash.parse(preparedJson.hash)),
    );
    const included = exactIncludedObservation(observed, preparedJson, sdk);
    if (included) return included;
    if (!waitForMore || dependencies.now() >= deadline) return null;
    await REFLECT_APPLY(dependencies.wait, undefined, [
      Math.min(INCLUSION_POLL_MS, Math.max(1, deadline - dependencies.now())),
    ]);
  }
  return null;
}

async function recoverExisting(record, context) {
  if (!['PREPARED', 'PUBLISHING', 'UNKNOWN', 'INCLUDED', 'COMPLETE', 'RECOVERED']
    .includes(record.state) || record.blocks.length < 1 || record.blocks.length > 2) fail();
  const outcomeUnknown = () => {
    try { context.scope.poison(new GateBTestnetFaucetReceiveChildError()); } catch {}
    return 'outcome-unknown';
  };
  let secondAttempt;
  try {
    secondAttempt = await context.state.loadSecondReceiveAttempt();
  } catch {
    return outcomeUnknown();
  }
  if (record.blocks.length === GATE_B_TESTNET_FAUCET_RECEIVE_LIMITS.expectedTransfers) {
    for (let index = 0; index < record.blocks.length; index += 1) {
      let included;
      try {
        included = await lookupIncluded({
          ...context,
          preparedJson: record.blocks[index].signedAccountBlock,
          waitForMore: false,
        });
      } catch {
        return outcomeUnknown();
      }
      if (!included) return outcomeUnknown();
    }
    if (record.state !== GATE_B_TESTNET_FAUCET_RECEIVE_STATES.COMPLETE &&
        record.state !== GATE_B_TESTNET_FAUCET_RECEIVE_STATES.RECOVERED) {
      try {
        await context.state.update(recoveredRecord(record));
      } catch {
        return outcomeUnknown();
      }
    }
    return 'recovered';
  }

  if (secondAttempt !== null) return outcomeUnknown();

  const firstRecord = record.blocks[0];
  const firstSigned = firstRecord.signedAccountBlock;
  let emptyHash;
  try {
    emptyHash = sdkHashString(context.sdk.EMPTY_HASH, context.sdk);
  } catch {
    return outcomeUnknown();
  }
  if (firstSigned.height !== 1 || firstSigned.previousHash !== emptyHash) {
    return outcomeUnknown();
  }
  let included;
  try {
    included = await lookupIncluded({
      ...context,
      preparedJson: firstRecord.signedAccountBlock,
      waitForMore: false,
    });
  } catch {
    return outcomeUnknown();
  }
  if (!included) return outcomeUnknown();
  if (record.state !== GATE_B_TESTNET_FAUCET_RECEIVE_STATES.INCLUDED) {
    try {
      record = await context.state.update(advanceRecord(
        record,
        GATE_B_TESTNET_FAUCET_RECEIVE_STATES.INCLUDED,
      ));
    } catch {
      return outcomeUnknown();
    }
  }

  try {
    const expectedAddress = firstSigned.address;
    const addressObject = context.sdk.Address.parse(expectedAddress);
    if (sdkAddressString(addressObject, context.sdk) !== expectedAddress) fail();
    const frontier = await runRead(
      context.scope,
      'ledger.getFrontierAccountBlock.recovery',
      () => context.zenon.ledger.getFrontierAccountBlock(addressObject),
    );
    if (!exactIncludedObservation(frontier, firstSigned, context.sdk)) fail();
    const maximumMomentumHeight = firstSigned.momentumAcknowledged.height;
    const sourceObserved = await runRead(
      context.scope,
      'ledger.getAccountBlockByHash.source.0',
      () => context.zenon.ledger.getAccountBlockByHash(
        context.sdk.Hash.parse(firstRecord.sourceHash),
      ),
    );
    const firstSource = normalizeHistoricalNativeSource(
      sourceObserved,
      context.sdk,
      expectedAddress,
      firstRecord.sourceHash,
      maximumMomentumHeight,
    );
    const firstPending = normalizePendingList(await runRead(
      context.scope,
      'ledger.getUnreceivedBlocksByAddress.recovery.first',
      () => context.zenon.ledger.getUnreceivedBlocksByAddress(
        addressObject,
        0,
        GATE_B_TESTNET_FAUCET_RECEIVE_LIMITS.pageSize,
      ),
    ), context.sdk, expectedAddress, 1);
    const secondPending = normalizePendingList(await runRead(
      context.scope,
      'ledger.getUnreceivedBlocksByAddress.recovery.second',
      () => context.zenon.ledger.getUnreceivedBlocksByAddress(
        addressObject,
        0,
        GATE_B_TESTNET_FAUCET_RECEIVE_LIMITS.pageSize,
      ),
    ), context.sdk, expectedAddress, 1);
    const pending = stablePendingSnapshot(firstPending, secondPending);
    for (const label of ['first', 'second']) {
      exactZeroUnconfirmed(await runRead(
        context.scope,
        `ledger.getUnconfirmedBlocksByAddress.recovery.${label}`,
        () => context.zenon.ledger.getUnconfirmedBlocksByAddress(
          addressObject,
          0,
          GATE_B_TESTNET_FAUCET_RECEIVE_LIMITS.pageSize,
        ),
      ), context.sdk);
    }
    const remainingObserved = await runRead(
      context.scope,
      'ledger.getAccountBlockByHash.source.1',
      () => context.zenon.ledger.getAccountBlockByHash(pending[0].hashObject),
    );
    const remainingSource = normalizeHistoricalNativeSource(
      remainingObserved,
      context.sdk,
      expectedAddress,
      pending[0].hash,
      maximumMomentumHeight,
    );
    if (canonicalJson(pendingSourceIdentity(remainingSource)) !==
        canonicalJson(pendingSourceIdentity(pending[0]))) fail();
    exactComplementaryNativeSources(firstSource, remainingSource, context.sdk);
    const attempt = secondReceiveAttempt(record, remainingSource);
    const expectedHistoricalSource = sourceIdentity(remainingSource);
    const committed = await context.state.commitSecondReceiveAttempt(attempt);
    if (canonicalJson(committed) !== canonicalJson(attempt)) fail();
    const remainingRecheck = normalizeHistoricalNativeSource(
      await runRead(
        context.scope,
        'ledger.getAccountBlockByHash.source.1.recheck',
        () => context.zenon.ledger.getAccountBlockByHash(
          context.sdk.Hash.parse(attempt.secondSource.hash),
        ),
      ),
      context.sdk,
      expectedAddress,
      remainingSource.hash,
      maximumMomentumHeight,
    );
    if (canonicalJson(sourceIdentity(remainingRecheck)) !==
        canonicalJson(expectedHistoricalSource) ||
        canonicalJson(pendingSourceIdentity(remainingRecheck)) !==
        canonicalJson(attempt.secondSource)) fail();
    return Object.freeze({
      expectedAddress,
      record,
      workItems: Object.freeze([Object.freeze({
        index: 1,
        requiredSuccessor: Object.freeze({
          height: firstSigned.height + 1,
          previousHash: firstSigned.hash,
        }),
        source: remainingRecheck,
      })]),
    });
  } catch {
    return outcomeUnknown();
  }
}

async function readWorkspaceInput(workspace, name) {
  const records = await workspace.openInputs([name]);
  if (!ARRAY_IS_ARRAY(records) || records.length !== 1 ||
      workspace.assertDistinct(records) !== true) fail();
  const bytes = await workspace.read(records[0]);
  await workspace.verify(records[0], bytes.length);
  return bytes;
}

function exactPolicy(policy) {
  if (!policy || typeof policy !== 'object' || typeof policy.chainProfile !== 'function') fail();
  const profile = policy.chainProfile();
  if (!profile || profile.chainIdentifier !== GATE_B_CURRENT_TESTNET_CHAIN_PROFILE.chainIdentifier) fail();
  return { policy, profile };
}

export async function executeGateBTestnetFaucetReceive(bootstrap, injected) {
  const dependencies = captureExecutionInjections(injected);
  let keyPair;
  let wallet;
  let walletBytes;
  let addressBytes;
  let workspace;
  let state;
  let zenon;
  let connectionCleared = false;
  const clearConnection = () => {
    if (connectionCleared || !zenon) return;
    REFLECT_APPLY(method(zenon, 'clearConnection'), zenon, []);
    connectionCleared = true;
  };
  try {
    let normalizedFrame;
    try {
      normalizedFrame = frameGateBTestnetFaucetReceiveBootstrap(bootstrap);
      bootstrap = parseGateBTestnetFaucetReceiveFrame(normalizedFrame);
    } finally {
      if (Buffer.isBuffer(normalizedFrame)) normalizedFrame.fill(0);
    }
    const workspaceRoot = walletWorkspaceRoot(dependencies);
    const loaded = await REFLECT_APPLY(dependencies.loadDependencies, undefined, []);
    if (!loaded || typeof loaded !== 'object' || !loaded.sdk || !loaded.ed) fail();
    const { sdk, ed } = loaded;
    const { policy, profile } = exactPolicy(
      REFLECT_APPLY(dependencies.createPolicy, undefined, []),
    );
    if (Number(GATE_B_CURRENT_TESTNET_SDK_NETWORK_ID) !== 3 ||
        !Number.isSafeInteger(EXPECTED_CHAIN_ID) || EXPECTED_CHAIN_ID < 1 ||
        Number(profile.chainIdentifier) !== EXPECTED_CHAIN_ID ||
        sdk.Zenon.getPowProvider() !== undefined) fail();
    sdk.Zenon.setNetworkID(Number(GATE_B_CURRENT_TESTNET_SDK_NETWORK_ID));
    zenon = sdk.Zenon.getInstance();
    if (zenon.client !== undefined) fail();
    return await dependencies.runtime.withOwner(
      'gate-b.testnet-faucet-receive',
      async scope => {
        try {
          await scope.runRpcWithDeadline({
            category: 'read',
            operation: 'zenon.initialize',
            timeoutMs: READ_TIMEOUT_MS,
            execute: () => zenon.initialize(bootstrap.rpcEndpoint, READ_TIMEOUT_MS, {
              autoconnect: true,
              followRedirects: false,
              max_reconnects: 0,
              reconnect: false,
            }),
            teardown: clearConnection,
          });
          const readiness = await REFLECT_APPLY(dependencies.assertNodeReady, undefined, [
            zenon,
            sdk,
            undefined,
            profile,
            {
              callRead: (operation, execute) => runRead(scope, operation, execute),
              operatorTrustedChainPolicy: policy,
            },
          ]);
          if (!readiness || readiness.chainId !== EXPECTED_CHAIN_ID) fail();
          sdk.Zenon.setChainID(EXPECTED_CHAIN_ID);

          state = await REFLECT_APPLY(dependencies.openReceiveState, undefined, [
            workspaceRoot,
            dependencies.receiveStateInjections,
          ]);
          const existing = await state.load();
          let expectedAddress;
          let record;
          let workItems;
          let completionStatus = 'complete';
          let secondAttemptCommitted = false;
          if (existing) {
            if (existing.blocks.length ===
                GATE_B_TESTNET_FAUCET_RECEIVE_LIMITS.expectedTransfers &&
                await REFLECT_APPLY(dependencies.onExecutionMode, undefined, [
                  GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.READ_ONLY_RECOVERY,
                ]) !== true) fail();
            const recovery = await recoverExisting(
              existing,
              { dependencies, scope, sdk, state, zenon },
            );
            if (typeof recovery === 'string') return recovery;
            if (await REFLECT_APPLY(dependencies.onExecutionMode, undefined, [
              GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.PARTIAL_RECOVERY,
            ]) !== true) fail();
            expectedAddress = recovery.expectedAddress;
            record = recovery.record;
            workItems = recovery.workItems;
            completionStatus = 'partial-complete';
            secondAttemptCommitted = true;
          } else {
            if (await REFLECT_APPLY(dependencies.onExecutionMode, undefined, [
              GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.FRESH,
            ]) !== true) fail();
            workspace = await REFLECT_APPLY(dependencies.openWalletWorkspace, undefined, [
              workspaceRoot,
              dependencies.walletWorkspaceInjections,
            ]);
            addressBytes = await readWorkspaceInput(
              workspace,
              GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerAddress,
            );
            expectedAddress = parseAddressInput(addressBytes);
            addressBytes.fill(0);
            addressBytes = undefined;
            const addressObject = sdk.Address.parse(expectedAddress);
            if (addressObject.toString() !== expectedAddress) fail();

            const firstPending = normalizePendingList(await runRead(
              scope,
              'ledger.getUnreceivedBlocksByAddress.first',
              () => zenon.ledger.getUnreceivedBlocksByAddress(
                addressObject,
                0,
                GATE_B_TESTNET_FAUCET_RECEIVE_LIMITS.pageSize,
              ),
            ), sdk, expectedAddress);
            const secondPending = normalizePendingList(await runRead(
              scope,
              'ledger.getUnreceivedBlocksByAddress.second',
              () => zenon.ledger.getUnreceivedBlocksByAddress(
                addressObject,
                0,
                GATE_B_TESTNET_FAUCET_RECEIVE_LIMITS.pageSize,
              ),
            ), sdk, expectedAddress);
            const pending = stablePendingSnapshot(firstPending, secondPending);
            for (const label of ['first', 'second']) {
              exactZeroUnconfirmed(await runRead(
                scope,
                `ledger.getUnconfirmedBlocksByAddress.${label}`,
                () => zenon.ledger.getUnconfirmedBlocksByAddress(
                  addressObject,
                  0,
                  GATE_B_TESTNET_FAUCET_RECEIVE_LIMITS.pageSize,
                ),
              ), sdk);
            }
            record = await state.arm();
            workItems = Object.freeze(pending.map((source, index) => Object.freeze({
              index,
              source,
            })));
          }

          if (!workspace) {
            workspace = await REFLECT_APPLY(dependencies.openWalletWorkspace, undefined, [
              workspaceRoot,
              dependencies.walletWorkspaceInjections,
            ]);
            addressBytes = await readWorkspaceInput(
              workspace,
              GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerAddress,
            );
            const protectedAddress = parseAddressInput(addressBytes);
            addressBytes.fill(0);
            addressBytes = undefined;
            if (protectedAddress !== expectedAddress) fail();
          }
          walletBytes = await readWorkspaceInput(
            workspace,
            GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet,
          );
          const mnemonic = parseWalletInput(walletBytes);
          wallet = sdk.KeyStore.fromMnemonic(mnemonic);
          walletBytes.fill(0);
          walletBytes = undefined;
          keyPair = wallet.getKeyPair(0);
          const derived = keyPair.getAddress().toString();
          if (derived !== expectedAddress ||
              workItems.some(item => item.source.address !== derived)) fail();

          for (let itemIndex = 0; itemIndex < workItems.length; itemIndex += 1) {
            const { index, requiredSuccessor, source } = workItems[itemIndex];
            if (index === 1 && !secondAttemptCommitted) {
              try {
                const attempt = secondReceiveAttempt(record, source);
                const committed = await state.commitSecondReceiveAttempt(attempt);
                if (canonicalJson(committed) !== canonicalJson(attempt)) fail();
                secondAttemptCommitted = true;
              } catch {
                try { scope.poison(new GateBTestnetFaucetReceiveChildError()); } catch {}
                return 'outcome-unknown';
              }
            }
            const template = sdk.AccountBlockTemplate.receive(source.hashObject);
            const prepared = await scope.runRpcWithDeadline({
              category: 'read',
              operation: `prepare.receive.${index}`,
              timeoutMs: PREPARE_TIMEOUT_MS,
              execute: () => REFLECT_APPLY(
                dependencies.invokeComposite,
                undefined,
                [zenon, template, keyPair],
              ),
              teardown: clearConnection,
            });
            if (prepared !== template || GET_PROTOTYPE_OF(prepared) !== sdk.AccountBlockTemplate.prototype) {
              fail();
            }
            const preparedJson = exactSignedJson(
              signedBlockSnapshot(prepared, sdk.AccountBlockTemplate.prototype, sdk),
              source,
              expectedAddress,
              sdk,
              ed,
              prepared,
            );
            if (requiredSuccessor &&
                (preparedJson.height !== requiredSuccessor.height ||
                  preparedJson.previousHash !== requiredSuccessor.previousHash)) fail();
            record = await state.update(preparedRecord(
              record,
              index,
              source.hash,
              preparedJson,
            ));
            record = await state.update(advanceRecord(record, 'PUBLISHING'));
            if (await REFLECT_APPLY(dependencies.onPublicationStart, undefined, [index]) !== true) {
              record = await state.update(advanceRecord(record, 'UNKNOWN'));
              scope.poison(new GateBTestnetFaucetReceiveChildError());
              return 'outcome-unknown';
            }
            let publicationFailed = false;
            try {
              const published = await scope.runRpcWithDeadline({
                category: 'publication',
                operation: `ledger.publishRawTransaction.${index}`,
                timeoutMs: PUBLICATION_TIMEOUT_MS,
                execute: () => zenon.ledger.publishRawTransaction(prepared),
                teardown: clearConnection,
              });
              if (published !== prepared) fail();
            } catch {
              publicationFailed = true;
            }
            let included;
            try {
              included = await lookupIncluded({
                dependencies,
                preparedJson,
                scope,
                sdk,
                waitForMore: !publicationFailed,
                zenon,
              });
            } catch {
              included = null;
            }
            if (!included) {
              record = await state.update(advanceRecord(record, 'UNKNOWN'));
              try { scope.poison(new GateBTestnetFaucetReceiveChildError()); } catch {}
              return 'outcome-unknown';
            }
            record = await state.update(advanceRecord(record, 'INCLUDED'));
          }
          record = await state.update(completeRecord(record));
          return record.state === 'COMPLETE' ? completionStatus : fail();
        } finally {
          clearConnection();
        }
      },
    );
  } catch {
    fail();
  } finally {
    if (addressBytes) addressBytes.fill(0);
    if (walletBytes) walletBytes.fill(0);
    clearSecrets(wallet, keyPair);
    wallet = undefined;
    keyPair = undefined;
    try { await workspace?.close(); } catch {}
    try { await state?.close(); } catch {}
    try { clearConnection(); } catch {}
  }
}

async function readBootstrapFrame() {
  const chunks = [];
  let total = 0;
  try {
    const stream = createReadStream(null, {
      fd: CHILD_BOOTSTRAP_FD,
      autoClose: true,
      highWaterMark: 1024,
    });
    for await (const chunk of stream) {
      if (!Buffer.isBuffer(chunk)) fail();
      total += chunk.length;
      if (total > GATE_B_TESTNET_FAUCET_RECEIVE_LIMITS.frameBytes) fail();
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, total);
  } catch {
    fail();
  } finally {
    for (const chunk of chunks) chunk.fill(0);
  }
}

function captureChildOptions(value) {
  const output = {
    channel: process,
    execute: executeGateBTestnetFaucetReceive,
    executionInjections: undefined,
    forceExit: code => process.exit(code),
    readBootstrap: readBootstrapFrame,
  };
  if (value === undefined) return output;
  if (value === null || typeof value !== 'object' || IS_PROXY(value) ||
      ARRAY_IS_ARRAY(value) || GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  for (const key of REFLECT_OWN_KEYS(value)) {
    const descriptor = typeof key === 'string' ? GET_OWN_PROPERTY_DESCRIPTOR(value, key) : undefined;
    if (!Object.keys(output).includes(key) || !descriptor || !HAS_OWN(descriptor, 'value')) fail();
    output[key] = descriptor.value;
  }
  return output;
}

async function send(channel, message) {
  if (typeof message !== 'string' || typeof channel.send !== 'function') fail();
  await new Promise((resolveSend, rejectSend) => {
    try {
      channel.send(message, error => error ? rejectSend(new Error(ERROR_CODE)) : resolveSend());
    } catch {
      rejectSend(new Error(ERROR_CODE));
    }
  });
}

export async function runGateBTestnetFaucetReceiveChild(options = {}) {
  const dependencies = captureChildOptions(options);
  let finished = false;
  let handling = false;
  let frame;
  const terminate = code => {
    if (finished) return;
    finished = true;
    try { REFLECT_APPLY(dependencies.forceExit, undefined, [code]); } catch {}
  };
  try {
    frame = await REFLECT_APPLY(dependencies.readBootstrap, undefined, []);
    const bootstrap = parseGateBTestnetFaucetReceiveFrame(frame);
    dependencies.channel.once('disconnect', () => terminate(1));
    dependencies.channel.on('message', async message => {
      if (handling || finished || message !== 'EXECUTE') return terminate(1);
      handling = true;
      try {
        const status = await REFLECT_APPLY(dependencies.execute, undefined, [
          bootstrap,
          {
            ...(dependencies.executionInjections ?? {}),
            onExecutionMode: async mode => {
              if (mode !== GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.FRESH &&
                  mode !== GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.PARTIAL_RECOVERY &&
                  mode !== GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.READ_ONLY_RECOVERY) fail();
              await send(dependencies.channel, mode);
              return true;
            },
            onPublicationStart: async index => {
              if (index !== 0 && index !== 1) fail();
              await send(dependencies.channel, `PUBLISHING_${index}`);
              return true;
            },
          },
        ]);
        const terminal = status === 'complete'
          ? 'COMPLETE'
          : status === 'partial-complete'
            ? 'PARTIAL_COMPLETE'
          : status === 'recovered'
            ? 'RECOVERED'
            : status === 'outcome-unknown'
              ? 'OUTCOME_UNKNOWN'
              : fail();
        await send(dependencies.channel, terminal);
        terminate(status === 'outcome-unknown' ? 2 : 0);
      } catch {
        try { await send(dependencies.channel, 'FAILED'); } catch {}
        terminate(1);
      }
    });
    await send(dependencies.channel, 'READY');
  } catch {
    terminate(1);
  } finally {
    if (Buffer.isBuffer(frame)) frame.fill(0);
  }
}

async function launch() {
  if (typeof process.argv[1] !== 'string' ||
      pathToFileURL(process.argv[1]).href !== import.meta.url) return;
  await runGateBTestnetFaucetReceiveChild();
}

void launch().catch(() => {
  process.exit(1);
});
