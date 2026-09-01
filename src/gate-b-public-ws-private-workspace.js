import { spawnSync } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { types as utilTypes } from 'node:util';

import { GATE_B_PUBLIC_WS_INPUT_LEAVES } from './gate-b-public-ws-inputs-schema.js';

const ERROR_CODE = 'gate_b_public_ws_private_workspace_invalid';
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const FILE_MAX_BYTES = 64 * 1024;
const ACL_OUTPUT_MAX_BYTES = 8192;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const ALLOWED_LEAVES = new Set(Object.values(GATE_B_PUBLIC_WS_INPUT_LEAVES));
const ACL_TARGETS = new Set([
  '.',
  ...Object.values(GATE_B_PUBLIC_WS_INPUT_LEAVES).map(name => `./${name}`),
]);
const CAPABILITY_STATES = new WeakMap();
const RECORD_STATES = new WeakMap();

class GateBPublicWsPrivateWorkspaceError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBPublicWsPrivateWorkspaceError';
    this.code = ERROR_CODE;
    this.stack = `GateBPublicWsPrivateWorkspaceError: ${ERROR_CODE}`;
  }
}

function fail() {
  throw new GateBPublicWsPrivateWorkspaceError();
}

function missing(error) {
  return Boolean(error && typeof error === 'object' && error.code === 'ENOENT');
}

function mode(stat) {
  return Number(stat.mode & 0o777n);
}

function sameInode(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameGeneration(left, right) {
  return sameInode(left, right) && left.size === right.size &&
    left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs &&
    left.mode === right.mode && left.nlink === right.nlink;
}

function directoryStat(stat, uid) {
  return stat && typeof stat.isDirectory === 'function' && stat.isDirectory() &&
    !stat.isSymbolicLink() && stat.uid === BigInt(uid) &&
    mode(stat) === PRIVATE_DIRECTORY_MODE;
}

function fileStat(stat, uid, expectedSize) {
  return stat && typeof stat.isFile === 'function' && stat.isFile() &&
    !stat.isSymbolicLink() && stat.uid === BigInt(uid) && stat.nlink === 1n &&
    mode(stat) === PRIVATE_FILE_MODE && stat.size >= 0n &&
    stat.size <= BigInt(FILE_MAX_BYTES) &&
    (expectedSize === undefined || stat.size === BigInt(expectedSize));
}

function inspectDarwinAcl(target, expectedMode) {
  let stdout;
  let stderr;
  try {
    if (!ACL_TARGETS.has(target) ||
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
    let newlineCount = 0;
    for (let index = 0; index < stdout.length; index += 1) {
      if (stdout[index] === 0x0a) newlineCount += 1;
    }
    if (newlineCount !== 1 ||
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

function captureInjections(injected) {
  const output = {
    platform: process.platform,
    constants: fsConstants,
    lstatPath: lstat,
    openPath: open,
    realpathPath: realpath,
    actualCwdPath: () => process.cwd(),
    lstatActualCwd: () => lstat('.', { bigint: true }),
    openActualCwd: flags => open('.', flags),
    realpathActualCwd: () => realpath('.'),
    getuid: typeof process.getuid === 'function' ? () => process.getuid() : undefined,
    aclInspector: inspectDarwinAcl,
    decorateFileHandle: handle => handle,
    decorateDirectoryHandle: handle => handle,
  };
  if (injected === undefined) return output;
  if (!injected || typeof injected !== 'object' || IS_PROXY(injected) ||
      ARRAY_IS_ARRAY(injected) || GET_PROTOTYPE_OF(injected) !== OBJECT_PROTOTYPE) fail();
  const allowed = Object.keys(output);
  const keys = REFLECT_OWN_KEYS(injected);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = typeof key === 'string'
      ? GET_OWN_PROPERTY_DESCRIPTOR(injected, key)
      : undefined;
    if (!allowed.includes(key) || !descriptor || !HAS_OWN(descriptor, 'value') ||
        descriptor.enumerable !== true) fail();
    output[key] = descriptor.value;
  }
  const functions = [
    'lstatPath', 'openPath', 'realpathPath', 'actualCwdPath', 'lstatActualCwd',
    'openActualCwd', 'realpathActualCwd', 'getuid', 'aclInspector',
    'decorateFileHandle', 'decorateDirectoryHandle',
  ];
  if (!output.constants || typeof output.constants !== 'object') fail();
  if (typeof output.platform !== 'string') fail();
  for (let index = 0; index < functions.length; index += 1) {
    if (typeof output[functions[index]] !== 'function') fail();
  }
  return output;
}

function exactLeafNames(value) {
  if (!ARRAY_IS_ARRAY(value) || IS_PROXY(value) ||
      GET_PROTOTYPE_OF(value) !== Array.prototype || value.length < 1 ||
      value.length > ALLOWED_LEAVES.size || REFLECT_OWN_KEYS(value).length !== value.length + 1) {
    fail();
  }
  const names = [];
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, String(index));
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true ||
        typeof descriptor.value !== 'string' || !ALLOWED_LEAVES.has(descriptor.value) ||
        seen.has(descriptor.value)) fail();
    seen.add(descriptor.value);
    names.push(descriptor.value);
  }
  return names;
}

function capabilityState(capability) {
  const state = CAPABILITY_STATES.get(capability);
  if (!state || state.closed) fail();
  return state;
}

function recordState(capability, record, expectedKind) {
  const state = capabilityState(capability);
  const value = RECORD_STATES.get(record);
  if (!value || value.workspace !== state || value.closed ||
      (expectedKind !== undefined && value.kind !== expectedKind)) fail();
  return value;
}

async function assertOutsideGit(workspaceRoot, dependencies) {
  let cursor = workspaceRoot;
  while (true) {
    try {
      await Reflect.apply(dependencies.lstatPath, undefined, [join(cursor, '.git'), {
        bigint: true,
      }]);
      fail();
    } catch (error) {
      if (!missing(error)) fail();
    }
    const parent = dirname(cursor);
    if (parent === cursor) return;
    cursor = parent;
  }
}

async function assertWorkspaceStableState(state) {
  const dependencies = state.dependencies;
  const [canonicalPath, actualCwdPath, canonicalCwd] = await Promise.all([
    Reflect.apply(dependencies.realpathPath, undefined, [state.root]),
    Reflect.apply(dependencies.actualCwdPath, undefined, []),
    Reflect.apply(dependencies.realpathActualCwd, undefined, []),
  ]);
  if (canonicalPath !== state.root || actualCwdPath !== state.root ||
      canonicalCwd !== state.root) fail();
  const [pathStat, handleStat, cwdPathStat, cwdHandleStat] = await Promise.all([
    Reflect.apply(dependencies.lstatPath, undefined, [state.root, { bigint: true }]),
    state.handle.stat({ bigint: true }),
    Reflect.apply(dependencies.lstatActualCwd, undefined, []),
    state.cwdHandle.stat({ bigint: true }),
  ]);
  if (!directoryStat(pathStat, state.uid) || !directoryStat(handleStat, state.uid) ||
      !directoryStat(cwdPathStat, state.uid) ||
      !directoryStat(cwdHandleStat, state.uid) ||
      !sameInode(pathStat, state.identity) || !sameInode(handleStat, state.identity) ||
      !sameInode(cwdPathStat, state.identity) || !sameInode(cwdHandleStat, state.identity)) fail();
  if (await Reflect.apply(dependencies.aclInspector, undefined, ['.', 'drwx------']) !== true) {
    fail();
  }
  const [pathAfter, handleAfter, cwdAfter, cwdHandleAfter] = await Promise.all([
    Reflect.apply(dependencies.lstatPath, undefined, [state.root, { bigint: true }]),
    state.handle.stat({ bigint: true }),
    Reflect.apply(dependencies.lstatActualCwd, undefined, []),
    state.cwdHandle.stat({ bigint: true }),
  ]);
  if (!sameGeneration(pathStat, pathAfter) || !sameGeneration(handleStat, handleAfter) ||
      !sameGeneration(cwdPathStat, cwdAfter) ||
      !sameGeneration(cwdHandleStat, cwdHandleAfter)) fail();
}

async function assertRecordState(state, record, expectedSize) {
  await assertWorkspaceStableState(state);
  const dependencies = state.dependencies;
  const [pathStat, handleStat] = await Promise.all([
    Reflect.apply(dependencies.lstatPath, undefined, [record.path, { bigint: true }]),
    record.handle.stat({ bigint: true }),
  ]);
  if (!fileStat(pathStat, state.uid, expectedSize) ||
      !fileStat(handleStat, state.uid, expectedSize) ||
      !sameInode(pathStat, record.identity) || !sameInode(handleStat, record.identity) ||
      !sameGeneration(pathStat, handleStat)) fail();
  if (await Reflect.apply(
    dependencies.aclInspector,
    undefined,
    [`./${record.name}`, '-rw-------'],
  ) !== true) fail();
  const [pathAfter, handleAfter] = await Promise.all([
    Reflect.apply(dependencies.lstatPath, undefined, [record.path, { bigint: true }]),
    record.handle.stat({ bigint: true }),
  ]);
  if (!sameGeneration(pathStat, pathAfter) || !sameGeneration(handleStat, handleAfter)) fail();
  await assertWorkspaceStableState(state);
}

function opaqueRecord(state, record) {
  const token = Object.freeze(Object.create(null));
  RECORD_STATES.set(token, { ...record, workspace: state });
  state.records.push(token);
  return token;
}

async function openInputRecord(state, name) {
  const dependencies = state.dependencies;
  const { O_CLOEXEC = 0, O_NOFOLLOW, O_RDONLY } = dependencies.constants;
  if (![O_CLOEXEC, O_NOFOLLOW, O_RDONLY].every(Number.isInteger) || O_NOFOLLOW === 0) fail();
  await assertWorkspaceStableState(state);
  const path = join(state.root, name);
  const pathStat = await Reflect.apply(dependencies.lstatPath, undefined, [path, {
    bigint: true,
  }]);
  if (!fileStat(pathStat, state.uid)) fail();
  const rawHandle = await Reflect.apply(dependencies.openPath, undefined, [
    path,
    O_RDONLY | O_NOFOLLOW | O_CLOEXEC,
  ]);
  let handle;
  try {
    handle = Reflect.apply(dependencies.decorateFileHandle, undefined, [rawHandle, name]);
    if (!handle || typeof handle.stat !== 'function' || typeof handle.read !== 'function' ||
        typeof handle.close !== 'function') fail();
    const handleStat = await handle.stat({ bigint: true });
    if (!fileStat(handleStat, state.uid) || !sameGeneration(pathStat, handleStat)) fail();
    const token = opaqueRecord(state, {
      name, path, handle, identity: handleStat, closed: false, kind: 'input',
    });
    await assertRecordState(state, RECORD_STATES.get(token));
    return token;
  } catch {
    try { await (handle ?? rawHandle).close(); } catch {}
    fail();
  }
}

async function reserveOutputRecord(state, name) {
  const dependencies = state.dependencies;
  const { O_CLOEXEC = 0, O_CREAT, O_EXCL, O_NOFOLLOW, O_RDWR } = dependencies.constants;
  if (![O_CLOEXEC, O_CREAT, O_EXCL, O_NOFOLLOW, O_RDWR].every(Number.isInteger) ||
      O_CREAT === 0 || O_EXCL === 0 || O_NOFOLLOW === 0) fail();
  await assertWorkspaceStableState(state);
  const path = join(state.root, name);
  const rawHandle = await Reflect.apply(dependencies.openPath, undefined, [
    path,
    O_RDWR | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC,
    PRIVATE_FILE_MODE,
  ]);
  let handle;
  try {
    handle = Reflect.apply(dependencies.decorateFileHandle, undefined, [rawHandle, name]);
    if (!handle || typeof handle.stat !== 'function' || typeof handle.chmod !== 'function' ||
        typeof handle.read !== 'function' || typeof handle.write !== 'function' ||
        typeof handle.sync !== 'function' || typeof handle.close !== 'function') fail();
    const initial = await handle.stat({ bigint: true });
    if (!fileStat(initial, state.uid, 0)) fail();
    const token = opaqueRecord(state, {
      name, path, handle, identity: initial, closed: false, kind: 'output',
    });
    await handle.chmod(PRIVATE_FILE_MODE);
    await assertRecordState(state, RECORD_STATES.get(token), 0);
    return token;
  } catch {
    try { await (handle ?? rawHandle).close(); } catch {}
    fail();
  }
}

function assertDistinctRecordStates(state, records) {
  if (!ARRAY_IS_ARRAY(records) || IS_PROXY(records) ||
      GET_PROTOTYPE_OF(records) !== Array.prototype || records.length < 1 ||
      REFLECT_OWN_KEYS(records).length !== records.length + 1) fail();
  const identities = new Set();
  for (let index = 0; index < records.length; index += 1) {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(records, String(index));
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail();
    const record = RECORD_STATES.get(descriptor.value);
    if (!record || record.workspace !== state || record.closed) fail();
    const identity = `${record.identity.dev}:${record.identity.ino}`;
    if (identities.has(identity)) fail();
    identities.add(identity);
  }
}

async function attemptRetainedDirectorySyncs(state) {
  let firstFailed = false;
  let secondFailed = false;
  try { await state.handle.sync(); } catch { firstFailed = true; }
  try { await state.cwdHandle.sync(); } catch { secondFailed = true; }
  return !firstFailed && !secondFailed;
}

async function syncDirectoryState(state) {
  await assertWorkspaceStableState(state);
  if (!await attemptRetainedDirectorySyncs(state)) fail();
  await assertWorkspaceStableState(state);
}

async function readRecordState(state, record) {
  await assertRecordState(state, record);
  const before = await record.handle.stat({ bigint: true });
  if (!fileStat(before, state.uid) || before.size < 1n ||
      before.size > BigInt(FILE_MAX_BYTES)) fail();
  const length = Number(before.size);
  const bytes = Buffer.allocUnsafe(length);
  let offset = 0;
  try {
    while (offset < length) {
      const result = await record.handle.read(bytes, offset, length - offset, offset);
      if (!result || !Number.isSafeInteger(result.bytesRead) || result.bytesRead < 1 ||
          result.bytesRead > length - offset) fail();
      offset += result.bytesRead;
    }
    const terminal = Buffer.alloc(1);
    try {
      const result = await record.handle.read(terminal, 0, 1, length);
      if (!result || result.bytesRead !== 0) fail();
    } finally {
      terminal.fill(0);
    }
    const after = await record.handle.stat({ bigint: true });
    const pathAfter = await Reflect.apply(state.dependencies.lstatPath, undefined, [
      record.path,
      { bigint: true },
    ]);
    if (!sameGeneration(before, after) || !sameGeneration(before, pathAfter)) fail();
    await assertRecordState(state, record, length);
    return bytes;
  } catch {
    bytes.fill(0);
    fail();
  }
}

async function fullWrite(handle, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const result = await handle.write(bytes, offset, bytes.length - offset, offset);
    if (!result || !Number.isSafeInteger(result.bytesWritten) || result.bytesWritten < 1 ||
        result.bytesWritten > bytes.length - offset) fail();
    offset += result.bytesWritten;
  }
}

async function writeRecordState(state, record, bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > FILE_MAX_BYTES) fail();
  await assertRecordState(state, record, 0);
  await fullWrite(record.handle, bytes);
  await record.handle.sync();
  await assertRecordState(state, record, bytes.length);
}

async function closeState(state) {
  if (state.closed) return;
  state.closed = true;
  for (let index = state.records.length - 1; index >= 0; index -= 1) {
    const record = RECORD_STATES.get(state.records[index]);
    if (!record || record.closed) continue;
    record.closed = true;
    try { await record.handle.close(); } catch {}
  }
  try { await state.handle.close(); } catch {}
  try { await state.cwdHandle.close(); } catch {}
}

function createCapability(state) {
  let capability;
  capability = Object.freeze({
    async assertAbsent(names) {
      const current = capabilityState(capability);
      names = exactLeafNames(names);
      for (let index = 0; index < names.length; index += 1) {
        await assertWorkspaceStableState(current);
        try {
          await Reflect.apply(current.dependencies.lstatPath, undefined, [
            join(current.root, names[index]),
            { bigint: true },
          ]);
          fail();
        } catch (error) {
          if (!missing(error)) fail();
        }
        await assertWorkspaceStableState(current);
      }
    },
    async reserveOutputs(names) {
      const current = capabilityState(capability);
      names = exactLeafNames(names);
      const records = [];
      let reservationAttempted = false;
      try {
        for (let index = 0; index < names.length; index += 1) {
          reservationAttempted = true;
          records.push(await reserveOutputRecord(current, names[index]));
        }
        assertDistinctRecordStates(current, records);
        await syncDirectoryState(current);
        for (let index = 0; index < records.length; index += 1) {
          await assertRecordState(current, RECORD_STATES.get(records[index]), 0);
        }
        return Object.freeze(records);
      } catch {
        if (reservationAttempted) {
          try { await attemptRetainedDirectorySyncs(current); } catch {}
        }
        fail();
      }
    },
    async openInputs(names) {
      const current = capabilityState(capability);
      names = exactLeafNames(names);
      const records = [];
      for (let index = 0; index < names.length; index += 1) {
        records.push(await openInputRecord(current, names[index]));
      }
      assertDistinctRecordStates(current, records);
      return Object.freeze(records);
    },
    assertDistinct(records) {
      const current = capabilityState(capability);
      assertDistinctRecordStates(current, records);
      return true;
    },
    async verify(record, expectedSize) {
      const current = capabilityState(capability);
      if (expectedSize !== undefined &&
          (!Number.isSafeInteger(expectedSize) || expectedSize < 0 ||
            expectedSize > FILE_MAX_BYTES)) fail();
      await assertRecordState(
        current,
        recordState(capability, record),
        expectedSize,
      );
      return true;
    },
    async read(record) {
      const current = capabilityState(capability);
      return readRecordState(current, recordState(capability, record));
    },
    async write(record, bytes) {
      const current = capabilityState(capability);
      await writeRecordState(current, recordState(capability, record, 'output'), bytes);
      return true;
    },
    async syncDirectories() {
      await syncDirectoryState(capabilityState(capability));
      return true;
    },
    async close() {
      const current = CAPABILITY_STATES.get(capability);
      if (current) await closeState(current);
    },
  });
  CAPABILITY_STATES.set(capability, state);
  return capability;
}

export async function openGateBPublicWsPrivateWorkspace(workspaceRoot, injected) {
  const dependencies = captureInjections(injected);
  let rawHandle;
  let rawCwdHandle;
  let handle;
  let cwdHandle;
  try {
    if (dependencies.platform !== 'darwin') fail();
    if (typeof workspaceRoot !== 'string' || workspaceRoot.length < 1 ||
        workspaceRoot.length > 4096 || workspaceRoot.includes('\0') ||
        !isAbsolute(workspaceRoot) || resolve(workspaceRoot) !== workspaceRoot) fail();
    const canonical = await Reflect.apply(dependencies.realpathPath, undefined, [workspaceRoot]);
    if (canonical !== workspaceRoot) fail();
    const uid = Reflect.apply(dependencies.getuid, undefined, []);
    if (!Number.isSafeInteger(uid) || uid < 0 ||
        Reflect.apply(dependencies.actualCwdPath, undefined, []) !== workspaceRoot) fail();
    const pathStat = await Reflect.apply(dependencies.lstatPath, undefined, [workspaceRoot, {
      bigint: true,
    }]);
    if (!directoryStat(pathStat, uid)) fail();
    await assertOutsideGit(workspaceRoot, dependencies);
    const { O_DIRECTORY, O_NOFOLLOW, O_RDONLY } = dependencies.constants;
    if (![O_DIRECTORY, O_NOFOLLOW, O_RDONLY].every(Number.isInteger) ||
        O_DIRECTORY === 0 || O_NOFOLLOW === 0) fail();
    rawHandle = await Reflect.apply(dependencies.openPath, undefined, [
      workspaceRoot,
      O_RDONLY | O_DIRECTORY | O_NOFOLLOW,
    ]);
    rawCwdHandle = await Reflect.apply(dependencies.openActualCwd, undefined, [
      O_RDONLY | O_DIRECTORY | O_NOFOLLOW,
    ]);
    handle = Reflect.apply(dependencies.decorateDirectoryHandle, undefined, [rawHandle, 'path']);
    cwdHandle = Reflect.apply(
      dependencies.decorateDirectoryHandle,
      undefined,
      [rawCwdHandle, 'cwd'],
    );
    for (const candidate of [handle, cwdHandle]) {
      if (!candidate || typeof candidate.stat !== 'function' ||
          typeof candidate.sync !== 'function' || typeof candidate.close !== 'function') fail();
    }
    const [handleStat, cwdHandleStat] = await Promise.all([
      handle.stat({ bigint: true }),
      cwdHandle.stat({ bigint: true }),
    ]);
    if (!directoryStat(handleStat, uid) || !directoryStat(cwdHandleStat, uid) ||
        !sameInode(pathStat, handleStat) || !sameInode(pathStat, cwdHandleStat)) fail();
    const state = {
      root: workspaceRoot,
      uid,
      handle,
      cwdHandle,
      identity: handleStat,
      dependencies,
      records: [],
      closed: false,
    };
    await assertWorkspaceStableState(state);
    return createCapability(state);
  } catch {
    try { await (handle ?? rawHandle)?.close(); } catch {}
    try { await (cwdHandle ?? rawCwdHandle)?.close(); } catch {}
    fail();
  }
}
