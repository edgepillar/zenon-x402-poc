import { Buffer } from 'node:buffer';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  openSync,
  readSync,
} from 'node:fs';
import { TextDecoder, types as utilTypes } from 'node:util';

import {
  OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT,
  OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_LANE,
  createOperatorTrustedLocalDevnetPolicy,
  parseOperatorTrustedLocalDevnetProfileArtifact,
} from './operator-trusted-local-devnet-profile.js';
import {
  selectOperatorTrustedTestnetPolicy,
} from './operator-trusted-testnet-profile.js';

const ERROR_CODE = 'operator_trusted_local_devnet_execution_invalid';
const ARTIFACT_MAX_BYTES = 16 * 1024;
const FILENAME = /^[a-z0-9][a-z0-9_-]{0,122}\.json$/;
const LOOPBACK_RPC_URL = /^ws:\/\/(?:127\.0\.0\.1|\[::1\]):([1-9][0-9]{0,4})\/$/;
const GENERATION_FIELDS = [
  'dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs',
];
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const MODE_TYPE_MASK = BigInt(fsConstants.S_IFMT);
const MODE_REGULAR = BigInt(fsConstants.S_IFREG);
const OPEN_FLAGS_AVAILABLE = Number.isInteger(fsConstants.O_RDONLY) &&
  Number.isInteger(fsConstants.O_NOFOLLOW) && Number.isInteger(fsConstants.O_NONBLOCK);
const OPEN_FLAGS = OPEN_FLAGS_AVAILABLE
  ? fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK
  : 0;
const IS_PROXY = utilTypes.isProxy;

export const OPERATOR_TRUSTED_LOCAL_DEVNET_ARTIFACT_FILE_ENV =
  'ZENON_LOCAL_DEVNET_ARTIFACT_FILE';
export const OPERATOR_TRUSTED_LOCAL_DEVNET_ACK_ENV = 'ZENON_LOCAL_DEVNET_ACK';

class OperatorTrustedLocalDevnetExecutionError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'OperatorTrustedLocalDevnetExecutionError';
    this.code = ERROR_CODE;
    this.stack = undefined;
  }
}

function fail() {
  throw new OperatorTrustedLocalDevnetExecutionError();
}

function asciiString(value, maximumBytes) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') !== value.length ||
      value.length < 1 || value.length > maximumBytes) fail();
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 0x7f) fail();
  }
  return value;
}

function validateArtifactFileName(value) {
  asciiString(value, 128);
  if (!FILENAME.test(value)) fail();
  return value;
}

function validateLoopbackRpcUrl(value) {
  asciiString(value, 128);
  const match = LOOPBACK_RPC_URL.exec(value);
  if (match === null) fail();
  const port = Number(match[1]);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535 || port === 80) fail();
  return value;
}

function ownEnvironmentDescriptor(env, field) {
  if (IS_PROXY(env)) fail();
  let descriptor;
  try {
    descriptor = Object.getOwnPropertyDescriptor(env, field);
  } catch {
    fail();
  }
  if (descriptor && !Object.hasOwn(descriptor, 'value')) fail();
  return descriptor;
}

function ownDataEnvironmentValue(env, field) {
  const descriptor = ownEnvironmentDescriptor(env, field);
  if (!descriptor) fail();
  return descriptor.value;
}

function ownDefinedEnvironmentValue(env, field) {
  const descriptor = ownEnvironmentDescriptor(env, field);
  if (!descriptor) return undefined;
  return descriptor.value;
}

function rejectPresentFamilyInputs(env, fields) {
  for (const field of fields) {
    if (ownEnvironmentDescriptor(env, field) !== undefined) fail();
  }
}

function snapshotGeneration(stats) {
  if (stats === null || typeof stats !== 'object') fail();
  const snapshot = {};
  for (const field of GENERATION_FIELDS) {
    if (!Object.hasOwn(stats, field)) fail();
    snapshot[field] = stats[field];
  }
  return snapshot;
}

function validateGeneration(generation) {
  if (typeof process.getuid !== 'function') fail();
  const uid = process.getuid();
  if (!Number.isSafeInteger(uid) ||
      (generation.mode & MODE_TYPE_MASK) !== MODE_REGULAR || generation.nlink !== 1n ||
      generation.uid !== BigInt(uid) || generation.size < 1n ||
      generation.size > BigInt(ARTIFACT_MAX_BYTES) || (generation.mode & 0o022n) !== 0n ||
      (generation.mode & 0o7000n) !== 0n) fail();
}

function sameGeneration(left, right) {
  return GENERATION_FIELDS.every(field => left[field] === right[field]);
}

function readArtifactFile(fileName) {
  if (!OPEN_FLAGS_AVAILABLE) fail();
  let descriptor;
  let text;
  let closeFailed = false;
  try {
    descriptor = openSync(fileName, OPEN_FLAGS);
    const before = snapshotGeneration(fstatSync(descriptor, { bigint: true }));
    validateGeneration(before);
    const size = Number(before.size);
    const content = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const bytesRead = readSync(descriptor, content, offset, size - offset, offset);
      if (!Number.isSafeInteger(bytesRead) || bytesRead < 1) fail();
      offset += bytesRead;
    }
    if (readSync(descriptor, Buffer.alloc(1), 0, 1, size) !== 0) fail();
    const after = snapshotGeneration(fstatSync(descriptor, { bigint: true }));
    validateGeneration(after);
    if (!sameGeneration(before, after)) fail();
    text = UTF8_DECODER.decode(content);
  } catch {
    fail();
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        closeFailed = true;
      }
    }
  }
  if (closeFailed || text === undefined) fail();
  return text;
}

function publicTestnetSelection(selector, operatorTrustAcknowledgement, liveAcknowledgement) {
  const policy = selectOperatorTrustedTestnetPolicy(
    selector,
    operatorTrustAcknowledgement,
    liveAcknowledgement,
  );
  return Object.freeze({
    chainProfile: Object.freeze(policy.chainProfile()),
    policy,
    profileName: policy.profileName,
    trustMode: policy.trustMode,
    warning: policy.warning,
  });
}

function localDevnetSelection(env, selector) {
  if (selector !== OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_LANE) fail();
  rejectPresentFamilyInputs(env, ['ZENON_OPERATOR_TRUST_ACK', 'ZENON_LIVE_ACK']);
  if (ownDataEnvironmentValue(env, 'ZENON_LOCAL_DEVNET_ACK') !==
      OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT) fail();
  const rpcUrl = validateLoopbackRpcUrl(ownDataEnvironmentValue(env, 'ZENON_RPC_URL'));
  const artifact = parseOperatorTrustedLocalDevnetProfileArtifact(
    readArtifactFile(validateArtifactFileName(
      ownDataEnvironmentValue(env, OPERATOR_TRUSTED_LOCAL_DEVNET_ARTIFACT_FILE_ENV),
    )),
  );
  const policy = createOperatorTrustedLocalDevnetPolicy(artifact);
  return Object.freeze({
    chainProfile: policy.chainProfile,
    policy,
    profileName: OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_LANE,
    rpcUrl,
    trustMode: policy.trustMode,
    warning: 'Warning: this self-created local devnet profile is operator trusted and does not authenticate remote chain identity.',
  });
}

function selectOperatorTrustedExecutionPolicyFromEnvironment(env) {
  let selector;
  try {
    selector = ownDefinedEnvironmentValue(env, 'ZENON_CHAIN_PROFILE_NAME');
  } catch {
    fail();
  }
  if (selector !== OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_LANE) {
    let operatorTrustAcknowledgement;
    let liveAcknowledgement;
    try {
      rejectPresentFamilyInputs(env, [
        OPERATOR_TRUSTED_LOCAL_DEVNET_ACK_ENV,
        OPERATOR_TRUSTED_LOCAL_DEVNET_ARTIFACT_FILE_ENV,
      ]);
      operatorTrustAcknowledgement = ownDefinedEnvironmentValue(env, 'ZENON_OPERATOR_TRUST_ACK');
      liveAcknowledgement = ownDefinedEnvironmentValue(env, 'ZENON_LIVE_ACK');
    } catch {
      fail();
    }
    return publicTestnetSelection(selector, operatorTrustAcknowledgement, liveAcknowledgement);
  }
  try {
    return localDevnetSelection(env, selector);
  } catch {
    fail();
  }
}

export function selectOperatorTrustedExecutionPolicy(env) {
  if (env === null || typeof env !== 'object') fail();
  return selectOperatorTrustedExecutionPolicyFromEnvironment(env);
}

export function selectOperatorTrustedCliExecution(env) {
  if (env === null || typeof env !== 'object') fail();
  let mode;
  try {
    mode = ownDefinedEnvironmentValue(env, 'PAYMENT_MODE') ?? 'mock';
  } catch {
    fail();
  }
  if (mode !== 'mock' && mode !== 'zenon') throw new Error('unsupported payment mode');
  const operatorTrust = mode === 'zenon'
    ? selectOperatorTrustedExecutionPolicyFromEnvironment(env)
    : undefined;
  return Object.freeze({ mode, operatorTrust });
}
