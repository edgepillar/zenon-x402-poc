import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, mkdir, open, realpath, rename, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { types as utilTypes } from 'node:util';

import {
  GATE_B_TESTNET_FAUCET_RECEIVE_LEGACY_STATE_NAME,
  selectGateBBuyerWalletWorkspace,
} from './gate-b-buyer-wallet-selector.js';
import { canonicalJson } from './canonical.js';
import { GATE_B_CURRENT_TESTNET_CHAIN_PROFILE } from
  './zenon/operator-trusted-testnet-profile.js';

const ERROR_CODE = 'gate_b_testnet_faucet_receive_state_invalid';
const MARKER_NAME = '.faucet-receive-once';
const RECORD_NAME = 'faucet-receive-recovery.json';
const SECOND_ATTEMPT_NAME = 'faucet-receive-second-attempt.json';
const MAX_RECORD_BYTES = 64 * 1024;
const MAX_SECOND_ATTEMPT_BYTES = 4096;
const ACL_OUTPUT_MAX_BYTES = 8192;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const JSON_PARSE = JSON.parse;
const JSON_STRINGIFY = JSON.stringify;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const HASH = /^[0-9a-f]{64}$/u;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const ADDRESS = /^z1[0-9a-z]{38}$/u;
const TOKEN = /^zts1[0-9a-z]{22}$/u;
const NONCE = /^[0-9a-f]{16}$/u;
const POSITIVE_DECIMAL = /^[1-9][0-9]*$/u;
const EXPECTED_CHAIN_ID = Number(GATE_B_CURRENT_TESTNET_CHAIN_PROFILE.chainIdentifier);
const RECOVERABLE_STATES = new Set([
  'PREPARED', 'PUBLISHING', 'UNKNOWN', 'INCLUDED',
]);
const ALLOWED_TRANSITIONS = new Set([
  'ARMED:PREPARED', 'PREPARED:PUBLISHING', 'PREPARED:UNKNOWN',
  'PREPARED:INCLUDED', 'PUBLISHING:INCLUDED', 'PUBLISHING:UNKNOWN',
  'UNKNOWN:INCLUDED', 'INCLUDED:PREPARED',
  'INCLUDED:COMPLETE', 'PREPARED:RECOVERED', 'PUBLISHING:RECOVERED',
  'UNKNOWN:RECOVERED', 'INCLUDED:RECOVERED',
]);
const SET_HAS = Set.prototype.has;
const SIGNED_FIELDS = Object.freeze([
  'address', 'amount', 'blockType', 'chainIdentifier', 'data', 'difficulty',
  'fromBlockHash', 'fusedPlasma', 'hash', 'height', 'momentumAcknowledged',
  'nonce', 'previousHash', 'publicKey', 'signature', 'toAddress',
  'tokenStandard', 'version',
]);
const SECOND_SOURCE_FIELDS = Object.freeze([
  'address', 'amount', 'asset', 'blockType', 'hash',
]);
const FIRST_RECEIVE_FIELDS = Object.freeze([
  'hash', 'height', 'momentumAcknowledgedHeight', 'sourceHash',
]);
const SECOND_ATTEMPT_FIELDS = Object.freeze([
  'firstReceive', 'schemaVersion', 'secondSource',
]);

export const GATE_B_TESTNET_FAUCET_RECEIVE_STATES = Object.freeze({
  ARMED: 'ARMED',
  PREPARED: 'PREPARED',
  PUBLISHING: 'PUBLISHING',
  INCLUDED: 'INCLUDED',
  UNKNOWN: 'UNKNOWN',
  COMPLETE: 'COMPLETE',
  RECOVERED: 'RECOVERED',
});

export class GateBTestnetFaucetReceiveStateError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBTestnetFaucetReceiveStateError';
    this.code = ERROR_CODE;
    this.stack = undefined;
  }
}

function fail() {
  throw new GateBTestnetFaucetReceiveStateError();
}

function exactObject(value, fields) {
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

function safeInteger(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function validateSignedBlock(value) {
  exactObject(value, SIGNED_FIELDS);
  if (value.version !== 1 || value.chainIdentifier !== EXPECTED_CHAIN_ID ||
      value.blockType !== 3 || !safeInteger(value.height, 1) ||
      !safeInteger(value.fusedPlasma) || !safeInteger(value.difficulty, 1) ||
      value.fusedPlasma !== 0 || !HASH.test(value.hash) ||
      !HASH.test(value.previousHash) || !HASH.test(value.fromBlockHash) ||
      !ADDRESS.test(value.address) || !ADDRESS.test(value.toAddress) ||
      !TOKEN.test(value.tokenStandard) || value.amount !== '0' || value.data !== '' ||
      !NONCE.test(value.nonce) || value.nonce === '0000000000000000' ||
      !BASE64.test(value.publicKey) || !BASE64.test(value.signature)) fail();
  exactObject(value.momentumAcknowledged, ['hash', 'height']);
  if (!HASH.test(value.momentumAcknowledged.hash) ||
      !safeInteger(value.momentumAcknowledged.height)) fail();
  return value;
}

function validateBlockRecord(value, expectedIndex) {
  exactObject(value, ['index', 'signedAccountBlock', 'sourceHash', 'state']);
  if (value.index !== expectedIndex || !HASH.test(value.sourceHash) ||
      value.sourceHash !== value.signedAccountBlock?.fromBlockHash ||
      !['PREPARED', 'PUBLISHING', 'INCLUDED', 'UNKNOWN'].includes(value.state)) fail();
  validateSignedBlock(value.signedAccountBlock);
  return value;
}

function terminalRecord(value) {
  return value.activeIndex === null && value.blocks.length === 2 &&
    value.blocks.every(block => block.state === 'INCLUDED');
}

function validateRecord(value) {
  exactObject(value, ['activeIndex', 'blocks', 'revision', 'schemaVersion', 'state']);
  if (value.schemaVersion !== 1 || !safeInteger(value.revision) ||
      !Object.values(GATE_B_TESTNET_FAUCET_RECEIVE_STATES).includes(value.state) ||
      !ARRAY_IS_ARRAY(value.blocks) || IS_PROXY(value.blocks) ||
      GET_PROTOTYPE_OF(value.blocks) !== Array.prototype || value.blocks.length > 2) fail();
  for (let index = 0; index < value.blocks.length; index += 1) {
    validateBlockRecord(value.blocks[index], index);
  }
  const active = value.activeIndex;
  if (value.state === 'ARMED') {
    if (active !== null || value.blocks.length !== 0) fail();
  } else if (value.state === 'COMPLETE' || value.state === 'RECOVERED') {
    if (!terminalRecord(value)) fail();
  } else {
    if (!safeInteger(active) || active >= 2 || value.blocks.length !== active + 1 ||
        value.blocks[active].state !== value.state ||
        (active === 1 && value.blocks[0].state !== 'INCLUDED')) fail();
  }
  return value;
}

function validateSecondSource(value, expectedAddress) {
  exactObject(value, SECOND_SOURCE_FIELDS);
  if (!ADDRESS.test(value.address) || value.address !== expectedAddress ||
      typeof value.amount !== 'string' || !POSITIVE_DECIMAL.test(value.amount) ||
      !TOKEN.test(value.asset) || (value.blockType !== 2 && value.blockType !== 4) ||
      !HASH.test(value.hash)) fail();
  return value;
}

function validateSecondAttempt(value, record) {
  exactObject(value, SECOND_ATTEMPT_FIELDS);
  if (value.schemaVersion !== 1 || !record || record.blocks.length < 1) fail();
  const firstBlock = record.blocks[0];
  const firstSigned = firstBlock.signedAccountBlock;
  exactObject(value.firstReceive, FIRST_RECEIVE_FIELDS);
  if (value.firstReceive.hash !== firstSigned.hash ||
      value.firstReceive.height !== firstSigned.height ||
      value.firstReceive.momentumAcknowledgedHeight !==
        firstSigned.momentumAcknowledged.height ||
      value.firstReceive.sourceHash !== firstBlock.sourceHash) fail();
  validateSecondSource(value.secondSource, firstSigned.address);
  if (firstBlock.sourceHash === value.secondSource.hash) fail();
  if (record.blocks.length === 2 &&
      value.secondSource.hash !== record.blocks[1].sourceHash) fail();
  return value;
}

function cloneRecord(value) {
  return JSON_PARSE(JSON_STRINGIFY(value));
}

function cloneSecondAttempt(value) {
  return JSON_PARSE(JSON_STRINGIFY(value));
}

function missing(error) {
  try {
    if (error === null || typeof error !== 'object' || IS_PROXY(error)) return false;
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(error, 'code');
    return Boolean(descriptor && HAS_OWN(descriptor, 'value') && descriptor.value === 'ENOENT');
  } catch {
    return false;
  }
}

function validAclTarget(target) {
  if (typeof target !== 'string' || !isAbsolute(target) || resolve(target) !== target) return false;
  const leaf = basename(target);
  const generatedState = leaf.startsWith(
    `${GATE_B_TESTNET_FAUCET_RECEIVE_LEGACY_STATE_NAME}-`,
  ) && /^[0-9a-f]{32}$/u.test(leaf.slice(
    GATE_B_TESTNET_FAUCET_RECEIVE_LEGACY_STATE_NAME.length + 1,
  ));
  return leaf === GATE_B_TESTNET_FAUCET_RECEIVE_LEGACY_STATE_NAME || generatedState ||
    leaf === MARKER_NAME || leaf === RECORD_NAME ||
    leaf === SECOND_ATTEMPT_NAME ||
    (leaf.startsWith(`.${RECORD_NAME}.`) && leaf.endsWith('.tmp'));
}

function inspectDarwinAcl(target, expectedMode) {
  let stdout;
  let stderr;
  try {
    if (!validAclTarget(target) ||
        (expectedMode !== 'drwx------' && expectedMode !== '-rw-------')) fail();
    const result = spawnSync('/bin/ls', ['-lde', target], {
      env: {},
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 2000,
      maxBuffer: ACL_OUTPUT_MAX_BYTES,
      killSignal: 'SIGKILL',
      shell: false,
    });
    stdout = result.stdout;
    stderr = result.stderr;
    if (result.error !== undefined || result.status !== 0 || result.signal !== null ||
        !Buffer.isBuffer(stdout) || !Buffer.isBuffer(stderr) || stderr.length !== 0 ||
        stdout.length < expectedMode.length + 2 || stdout.length > ACL_OUTPUT_MAX_BYTES) fail();
    let newlines = 0;
    for (let index = 0; index < stdout.length; index += 1) {
      if (stdout[index] === 0x0a) newlines += 1;
    }
    if (newlines !== 1 ||
        stdout.subarray(0, expectedMode.length).toString('ascii') !== expectedMode ||
        stdout[expectedMode.length] === 0x2b) fail();
    return true;
  } catch {
    fail();
  } finally {
    if (Buffer.isBuffer(stdout)) stdout.fill(0);
    if (Buffer.isBuffer(stderr)) stderr.fill(0);
  }
}

function exactInjections(value) {
  const output = {
    aclInspector: inspectDarwinAcl,
    constants: fsConstants,
    decorateDirectoryHandle: handle => handle,
    decorateFileHandle: handle => handle,
    getuid: process.getuid?.bind(process),
    lstatPath: lstat,
    mkdirPath: mkdir,
    openPath: open,
    platform: process.platform,
    randomBytes,
    realpathPath: realpath,
    renamePath: rename,
    unlinkPath: unlink,
  };
  if (value !== undefined) {
    if (value === null || typeof value !== 'object' || IS_PROXY(value) ||
        ARRAY_IS_ARRAY(value) || GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
    const allowed = Object.keys(output);
    for (const key of REFLECT_OWN_KEYS(value)) {
      const descriptor = typeof key === 'string' ? GET_OWN_PROPERTY_DESCRIPTOR(value, key) : undefined;
      if (!allowed.includes(key) || !descriptor || !HAS_OWN(descriptor, 'value')) fail();
      output[key] = descriptor.value;
    }
  }
  for (const field of [
    'aclInspector', 'decorateDirectoryHandle', 'decorateFileHandle', 'getuid',
    'lstatPath', 'mkdirPath', 'openPath', 'randomBytes', 'realpathPath',
    'renamePath', 'unlinkPath',
  ]) {
    if (typeof output[field] !== 'function' || IS_PROXY(output[field])) fail();
  }
  if (!output.constants || typeof output.constants !== 'object' ||
      typeof output.platform !== 'string') fail();
  return output;
}

function directoryValid(stat, uid) {
  return stat && typeof stat.isDirectory === 'function' && stat.isDirectory() &&
    !stat.isSymbolicLink() && stat.uid === BigInt(uid) && (stat.mode & 0o777n) === 0o700n &&
    (stat.mode & 0o7000n) === 0n;
}

function fileValid(stat, uid, maximumBytes, expectedBytes) {
  return stat && typeof stat.isFile === 'function' && stat.isFile() &&
    !stat.isSymbolicLink() && stat.uid === BigInt(uid) && stat.nlink === 1n &&
    (stat.mode & 0o777n) === 0o600n && (stat.mode & 0o7000n) === 0n &&
    stat.size >= 0n && stat.size <= BigInt(maximumBytes) &&
    (expectedBytes === undefined || stat.size === BigInt(expectedBytes));
}

function sameInode(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameGeneration(left, right) {
  return sameInode(left, right) && left.mode === right.mode &&
    left.nlink === right.nlink && left.uid === right.uid && left.gid === right.gid &&
    left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

async function assertRootStable(state) {
  const dependencies = state.dependencies;
  const canonical = await REFLECT_APPLY(dependencies.realpathPath, undefined, [state.root]);
  if (canonical !== state.root) fail();
  const [pathBefore, handleBefore] = await Promise.all([
    REFLECT_APPLY(dependencies.lstatPath, undefined, [state.root, { bigint: true }]),
    state.handle.stat({ bigint: true }),
  ]);
  if (!directoryValid(pathBefore, state.uid) || !directoryValid(handleBefore, state.uid) ||
      !sameInode(pathBefore, state.identity) || !sameInode(handleBefore, state.identity) ||
      !sameGeneration(pathBefore, handleBefore)) fail();
  if (await REFLECT_APPLY(
    dependencies.aclInspector,
    undefined,
    [state.root, 'drwx------'],
  ) !== true) fail();
  const [canonicalAfter, pathAfter, handleAfter] = await Promise.all([
    REFLECT_APPLY(dependencies.realpathPath, undefined, [state.root]),
    REFLECT_APPLY(dependencies.lstatPath, undefined, [state.root, { bigint: true }]),
    state.handle.stat({ bigint: true }),
  ]);
  if (canonicalAfter !== state.root || !sameGeneration(pathBefore, pathAfter) ||
      !sameGeneration(handleBefore, handleAfter) || !sameGeneration(pathAfter, handleAfter)) fail();
}

async function assertFileStable(state, record, expectedBytes) {
  await assertRootStable(state);
  const dependencies = state.dependencies;
  const [pathBefore, handleBefore] = await Promise.all([
    REFLECT_APPLY(dependencies.lstatPath, undefined, [record.path, { bigint: true }]),
    record.handle.stat({ bigint: true }),
  ]);
  if (!fileValid(pathBefore, state.uid, record.maximumBytes, expectedBytes) ||
      !fileValid(handleBefore, state.uid, record.maximumBytes, expectedBytes) ||
      !sameInode(pathBefore, record.identity) || !sameInode(handleBefore, record.identity) ||
      !sameGeneration(pathBefore, handleBefore)) fail();
  if (await REFLECT_APPLY(
    dependencies.aclInspector,
    undefined,
    [record.path, '-rw-------'],
  ) !== true) fail();
  const [pathAfter, handleAfter] = await Promise.all([
    REFLECT_APPLY(dependencies.lstatPath, undefined, [record.path, { bigint: true }]),
    record.handle.stat({ bigint: true }),
  ]);
  if (!sameGeneration(pathBefore, pathAfter) || !sameGeneration(handleBefore, handleAfter) ||
      !sameGeneration(pathAfter, handleAfter)) fail();
  await assertRootStable(state);
}

function validFileHandle(handle, writable) {
  return handle && typeof handle.stat === 'function' && typeof handle.close === 'function' &&
    typeof handle.read === 'function' && (!writable ||
      (typeof handle.write === 'function' && typeof handle.sync === 'function'));
}

async function openExistingFile(state, path, maximumBytes) {
  const dependencies = state.dependencies;
  let rawHandle;
  let handle;
  try {
    await assertRootStable(state);
    const before = await REFLECT_APPLY(dependencies.lstatPath, undefined, [path, { bigint: true }]);
    if (!fileValid(before, state.uid, maximumBytes)) fail();
    const { O_CLOEXEC = 0, O_NOFOLLOW, O_NONBLOCK, O_RDONLY } = dependencies.constants;
    if (![O_CLOEXEC, O_NOFOLLOW, O_NONBLOCK, O_RDONLY].every(Number.isInteger) ||
        O_NOFOLLOW === 0 || O_NONBLOCK === 0) fail();
    rawHandle = await REFLECT_APPLY(dependencies.openPath, undefined, [
      path,
      O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC,
    ]);
    handle = REFLECT_APPLY(dependencies.decorateFileHandle, undefined, [rawHandle, basename(path)]);
    if (!validFileHandle(handle, false)) fail();
    const opened = await handle.stat({ bigint: true });
    if (!fileValid(opened, state.uid, maximumBytes) || !sameGeneration(before, opened)) fail();
    const record = { handle, identity: opened, maximumBytes, path };
    await assertFileStable(state, record);
    return record;
  } catch {
    try { await (handle ?? rawHandle)?.close(); } catch {}
    fail();
  }
}

async function existsSafeFile(state, path, maximumBytes) {
  let record;
  try {
    try {
      await REFLECT_APPLY(state.dependencies.lstatPath, undefined, [path, { bigint: true }]);
    } catch (error) {
      if (missing(error)) {
        await assertRootStable(state);
        return false;
      }
      fail();
    }
    record = await openExistingFile(state, path, maximumBytes);
    return true;
  } catch {
    fail();
  } finally {
    try { await record?.handle.close(); } catch { fail(); }
  }
}

async function createNewFile(state, path, bytes, maximumBytes = MAX_RECORD_BYTES) {
  const dependencies = state.dependencies;
  let rawHandle;
  let handle;
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length > maximumBytes) fail();
    await assertRootStable(state);
    const { O_CLOEXEC = 0, O_CREAT, O_EXCL, O_NOFOLLOW, O_RDWR } = dependencies.constants;
    if (![O_CLOEXEC, O_CREAT, O_EXCL, O_NOFOLLOW, O_RDWR].every(Number.isInteger) ||
        O_CREAT === 0 || O_EXCL === 0 || O_NOFOLLOW === 0) fail();
    rawHandle = await REFLECT_APPLY(dependencies.openPath, undefined, [
      path,
      O_CREAT | O_EXCL | O_NOFOLLOW | O_RDWR | O_CLOEXEC,
      0o600,
    ]);
    handle = REFLECT_APPLY(dependencies.decorateFileHandle, undefined, [rawHandle, basename(path)]);
    if (!validFileHandle(handle, true)) fail();
    const initial = await handle.stat({ bigint: true });
    const record = { handle, identity: initial, maximumBytes, path };
    if (!fileValid(initial, state.uid, maximumBytes, 0)) fail();
    await assertFileStable(state, record, 0);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await handle.write(bytes, offset, bytes.length - offset, offset);
      if (!result || !safeInteger(result.bytesWritten, 1) ||
          result.bytesWritten > bytes.length - offset) fail();
      offset += result.bytesWritten;
    }
    await handle.sync();
    await assertFileStable(state, record, bytes.length);
    return record;
  } catch {
    try { await (handle ?? rawHandle)?.close(); } catch {}
    fail();
  }
}

async function syncDirectory(state) {
  await assertRootStable(state);
  try {
    await state.handle.sync();
  } catch {
    fail();
  }
  await assertRootStable(state);
}

async function readExactFile(state, path, maximumBytes) {
  let record;
  let bytes;
  try {
    record = await openExistingFile(state, path, maximumBytes);
    const before = await record.handle.stat({ bigint: true });
    const size = Number(before.size);
    bytes = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const result = await record.handle.read(bytes, offset, size - offset, offset);
      if (!result || !safeInteger(result.bytesRead, 1) || result.bytesRead > size - offset) fail();
      offset += result.bytesRead;
    }
    const extra = Buffer.alloc(1);
    try {
      const trailing = await record.handle.read(extra, 0, 1, size);
      if (!trailing || trailing.bytesRead !== 0) fail();
    } finally {
      extra.fill(0);
    }
    await assertFileStable(state, record, size);
    return bytes;
  } catch {
    if (Buffer.isBuffer(bytes)) bytes.fill(0);
    fail();
  } finally {
    try { await record?.handle.close(); } catch { fail(); }
  }
}

async function writeRecord(state, recordPath, record) {
  validateRecord(record);
  const bytes = Buffer.from(`${canonicalJson(record)}\n`, 'utf8');
  if (bytes.length < 2 || bytes.length > MAX_RECORD_BYTES) fail();
  const suffix = REFLECT_APPLY(state.dependencies.randomBytes, undefined, [8]).toString('hex');
  if (!/^[0-9a-f]{16}$/u.test(suffix)) fail();
  const temporary = join(state.root, `.${RECORD_NAME}.${suffix}.tmp`);
  let created;
  let renamed = false;
  try {
    created = await createNewFile(state, temporary, bytes);
    await REFLECT_APPLY(state.dependencies.renamePath, undefined, [temporary, recordPath]);
    renamed = true;
    created.path = recordPath;
    await syncDirectory(state);
    await assertFileStable(state, created, bytes.length);
  } catch {
    fail();
  } finally {
    bytes.fill(0);
    try { await created?.handle.close(); } catch { fail(); }
    if (created && !renamed) {
      try { await REFLECT_APPLY(state.dependencies.unlinkPath, undefined, [temporary]); } catch {}
    }
  }
}

async function readRecord(state, recordPath) {
  const bytes = await readExactFile(state, recordPath, MAX_RECORD_BYTES);
  try {
    if (bytes.length < 2 || bytes[bytes.length - 1] !== 0x0a) fail();
    const text = bytes.subarray(0, bytes.length - 1).toString('utf8');
    const value = JSON_PARSE(text);
    validateRecord(value);
    if (`${canonicalJson(value)}\n` !== bytes.toString('utf8')) fail();
    return cloneRecord(value);
  } catch {
    fail();
  } finally {
    bytes.fill(0);
  }
}

async function readSecondAttempt(state, attemptPath, record) {
  const bytes = await readExactFile(state, attemptPath, MAX_SECOND_ATTEMPT_BYTES);
  try {
    if (bytes.length < 2 || bytes[bytes.length - 1] !== 0x0a) fail();
    const text = bytes.subarray(0, bytes.length - 1).toString('utf8');
    const value = JSON_PARSE(text);
    validateSecondAttempt(value, record);
    if (`${canonicalJson(value)}\n` !== bytes.toString('utf8')) fail();
    return cloneSecondAttempt(value);
  } catch {
    fail();
  } finally {
    bytes.fill(0);
  }
}

function immutableBlocks(previous, next) {
  if (next.blocks.length !== previous.blocks.length) return false;
  for (let index = 0; index < previous.blocks.length; index += 1) {
    const prior = previous.blocks[index];
    const current = next.blocks[index];
    if (prior.index !== current.index || prior.sourceHash !== current.sourceHash ||
        canonicalJson(prior.signedAccountBlock) !== canonicalJson(current.signedAccountBlock)) {
      return false;
    }
  }
  return true;
}

function validTransition(previous, next) {
  if (next.revision !== previous.revision + 1 || next.schemaVersion !== 1 ||
      !REFLECT_APPLY(SET_HAS, ALLOWED_TRANSITIONS, [`${previous.state}:${next.state}`])) {
    return false;
  }
  if (next.state === 'RECOVERED') {
    return RECOVERABLE_STATES.has(previous.state) && previous.blocks.length === 2 &&
      terminalRecord(next) && immutableBlocks(previous, next);
  }
  if (previous.state === GATE_B_TESTNET_FAUCET_RECEIVE_STATES.INCLUDED &&
      next.state === GATE_B_TESTNET_FAUCET_RECEIVE_STATES.PREPARED) {
    return previous.activeIndex === 0 && previous.blocks.length === 1 &&
      previous.blocks[0].index === 0 &&
      previous.blocks[0].state === GATE_B_TESTNET_FAUCET_RECEIVE_STATES.INCLUDED &&
      next.activeIndex === 1 && next.blocks.length === 2 &&
      next.blocks[1].index === 1 &&
      next.blocks[1].state === GATE_B_TESTNET_FAUCET_RECEIVE_STATES.PREPARED &&
      canonicalJson(previous.blocks[0]) === canonicalJson(next.blocks[0]);
  }
  if (next.blocks.length < previous.blocks.length || next.blocks.length > previous.blocks.length + 1) {
    return false;
  }
  const immutableCount = next.blocks.length > previous.blocks.length
    ? previous.blocks.length
    : Math.max(0, previous.blocks.length - 1);
  for (let index = 0; index < immutableCount; index += 1) {
    if (canonicalJson(previous.blocks[index]) !== canonicalJson(next.blocks[index])) return false;
  }
  if (previous.blocks.length > 0 && next.blocks.length === previous.blocks.length) {
    const prior = previous.blocks[previous.blocks.length - 1];
    const current = next.blocks[next.blocks.length - 1];
    if (prior.index !== current.index || prior.sourceHash !== current.sourceHash ||
        canonicalJson(prior.signedAccountBlock) !== canonicalJson(current.signedAccountBlock)) {
      return false;
    }
  }
  return true;
}

export async function openGateBTestnetFaucetReceiveState(walletWorkspaceRoot, injected) {
  const dependencies = exactInjections(injected);
  let rawHandle;
  let handle;
  try {
    if (dependencies.platform !== 'darwin' || typeof walletWorkspaceRoot !== 'string' ||
        !isAbsolute(walletWorkspaceRoot) || resolve(walletWorkspaceRoot) !== walletWorkspaceRoot) {
      fail();
    }
    const uid = REFLECT_APPLY(dependencies.getuid, undefined, []);
    if (!safeInteger(uid)) fail();
    const parent = dirname(walletWorkspaceRoot);
    let root;
    try {
      root = selectGateBBuyerWalletWorkspace(
        walletWorkspaceRoot,
        parent,
      ).stateWorkspaceRoot;
    } catch {
      fail();
    }
    try {
      await REFLECT_APPLY(dependencies.mkdirPath, undefined, [root, { mode: 0o700 }]);
    } catch (error) {
      if (error === null || typeof error !== 'object' || IS_PROXY(error)) fail();
      const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(error, 'code');
      if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.value !== 'EEXIST') fail();
    }
    const [canonicalParent, canonicalRoot, pathStat] = await Promise.all([
      REFLECT_APPLY(dependencies.realpathPath, undefined, [parent]),
      REFLECT_APPLY(dependencies.realpathPath, undefined, [root]),
      REFLECT_APPLY(dependencies.lstatPath, undefined, [root, { bigint: true }]),
    ]);
    if (canonicalParent !== parent || canonicalRoot !== root || !directoryValid(pathStat, uid)) fail();
    const { O_CLOEXEC = 0, O_DIRECTORY, O_NOFOLLOW, O_RDONLY } = dependencies.constants;
    if (![O_CLOEXEC, O_DIRECTORY, O_NOFOLLOW, O_RDONLY].every(Number.isInteger) ||
        O_DIRECTORY === 0 || O_NOFOLLOW === 0) fail();
    rawHandle = await REFLECT_APPLY(dependencies.openPath, undefined, [
      root,
      O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC,
    ]);
    handle = REFLECT_APPLY(dependencies.decorateDirectoryHandle, undefined, [rawHandle]);
    if (!handle || typeof handle.stat !== 'function' || typeof handle.sync !== 'function' ||
        typeof handle.close !== 'function') fail();
    const opened = await handle.stat({ bigint: true });
    if (!directoryValid(opened, uid) || !sameGeneration(pathStat, opened)) fail();
    const state = { dependencies, handle, identity: opened, root, uid };
    await assertRootStable(state);
    const markerPath = join(root, MARKER_NAME);
    const recordPath = join(root, RECORD_NAME);
    const secondAttemptPath = join(root, SECOND_ATTEMPT_NAME);
    let closed = false;
    const assertOpen = () => { if (closed) fail(); };
    return Object.freeze({
      async load() {
        assertOpen();
        const marker = await existsSafeFile(state, markerPath, 0);
        const record = await existsSafeFile(state, recordPath, MAX_RECORD_BYTES);
        if (!marker && !record) return null;
        if (!marker || !record) fail();
        return readRecord(state, recordPath);
      },
      async loadSecondReceiveAttempt() {
        assertOpen();
        if (!await existsSafeFile(
          state,
          secondAttemptPath,
          MAX_SECOND_ATTEMPT_BYTES,
        )) return null;
        const record = await readRecord(state, recordPath);
        return readSecondAttempt(state, secondAttemptPath, record);
      },
      async commitSecondReceiveAttempt(attempt) {
        assertOpen();
        const recordBefore = await readRecord(state, recordPath);
        if (recordBefore.state !== GATE_B_TESTNET_FAUCET_RECEIVE_STATES.INCLUDED ||
            recordBefore.activeIndex !== 0 || recordBefore.blocks.length !== 1 ||
            recordBefore.blocks[0].state !== GATE_B_TESTNET_FAUCET_RECEIVE_STATES.INCLUDED) fail();
        validateSecondAttempt(attempt, recordBefore);
        const bytes = Buffer.from(`${canonicalJson(attempt)}\n`, 'utf8');
        if (bytes.length < 2 || bytes.length > MAX_SECOND_ATTEMPT_BYTES) fail();
        let created;
        try {
          created = await createNewFile(
            state,
            secondAttemptPath,
            bytes,
            MAX_SECOND_ATTEMPT_BYTES,
          );
          await syncDirectory(state);
          await assertFileStable(state, created, bytes.length);
        } finally {
          bytes.fill(0);
          try { await created?.handle.close(); } catch { fail(); }
        }
        const recordAfter = await readRecord(state, recordPath);
        validateSecondAttempt(attempt, recordAfter);
        const persisted = await readSecondAttempt(state, secondAttemptPath, recordAfter);
        if (canonicalJson(persisted) !== canonicalJson(attempt)) fail();
        return persisted;
      },
      async arm() {
        assertOpen();
        if (await existsSafeFile(state, markerPath, 0) ||
            await existsSafeFile(state, recordPath, MAX_RECORD_BYTES)) fail();
        let marker;
        try {
          marker = await createNewFile(state, markerPath, Buffer.alloc(0));
          await syncDirectory(state);
          await assertFileStable(state, marker, 0);
        } finally {
          try { await marker?.handle.close(); } catch { fail(); }
        }
        const record = {
          activeIndex: null,
          blocks: [],
          revision: 0,
          schemaVersion: 1,
          state: GATE_B_TESTNET_FAUCET_RECEIVE_STATES.ARMED,
        };
        await writeRecord(state, recordPath, record);
        return cloneRecord(record);
      },
      async update(next) {
        assertOpen();
        validateRecord(next);
        const previous = await readRecord(state, recordPath);
        if (!validTransition(previous, next)) fail();
        await writeRecord(state, recordPath, next);
        return cloneRecord(next);
      },
      async close() {
        if (closed) return;
        closed = true;
        try { await handle.close(); } catch { fail(); }
      },
    });
  } catch {
    try { await (handle ?? rawHandle)?.close(); } catch {}
    fail();
  }
}
