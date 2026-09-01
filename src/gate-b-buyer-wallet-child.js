import { spawnSync } from 'node:child_process';
import { createReadStream, constants as fsConstants } from 'node:fs';
import {
  lstat,
  open,
  realpath,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { types as utilTypes } from 'node:util';

const IPC_VERSION = 1;
const REQUEST_ID = 1;
const BOOTSTRAP_FD = 4;
const BOOTSTRAP_MAX_BYTES = 8192;
const WALLET_NAME = 'buyer-wallet.json';
const ADDRESS_NAME = 'buyer-address.json';
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const MAX_MNEMONIC_BYTES = 4096;
const MAX_ADDRESS_BYTES = 256;
const ACL_OUTPUT_MAX_BYTES = 8192;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;

function fail() {
  throw new Error('gate_b_buyer_wallet_child_failed');
}

function inspectDarwinAcl(path, expectedMode) {
  let stdout;
  let stderr;
  try {
    if (process.platform !== 'darwin' || typeof path !== 'string' ||
        path.length === 0 || path.length > 4096 || !isAbsolute(path) ||
        (expectedMode !== 'drwx------' && expectedMode !== '-rw-------')) fail();
    const result = spawnSync('/bin/ls', ['-lde', path], {
      env: {},
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 2000,
      maxBuffer: ACL_OUTPUT_MAX_BYTES,
      killSignal: 'SIGKILL',
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

function missing(error) {
  return Boolean(error && typeof error === 'object' && error.code === 'ENOENT');
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

export function parseGateBBuyerWalletBootstrap(text) {
  try {
    if (typeof text !== 'string' || text.length < 1 ||
        Buffer.byteLength(text, 'utf8') > BOOTSTRAP_MAX_BYTES) fail();
    const value = exactPlainObject(JSON.parse(text), ['workspaceRoot']);
    if (JSON.stringify(value) !== text || typeof value.workspaceRoot !== 'string' ||
        value.workspaceRoot.length === 0 || value.workspaceRoot.length > 4096 ||
        value.workspaceRoot.includes('\0') || !isAbsolute(value.workspaceRoot)) fail();
    return value.workspaceRoot;
  } catch {
    fail();
  }
}

function exactControlMessage(message) {
  exactPlainObject(message, ['ipcVersion', 'requestId', 'type']);
  if (message.ipcVersion !== IPC_VERSION || message.requestId !== REQUEST_ID ||
      message.type !== 'CREATE') fail();
}

function send(channel, type) {
  return new Promise((resolveSend, rejectSend) => {
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      if (error) rejectSend(new Error('gate_b_buyer_wallet_child_failed'));
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

async function readBootstrapFd() {
  const chunks = [];
  let total = 0;
  try {
    const stream = createReadStream(null, {
      fd: BOOTSTRAP_FD,
      autoClose: true,
      highWaterMark: 1024,
    });
    for await (const chunk of stream) {
      if (!Buffer.isBuffer(chunk)) fail();
      total += chunk.length;
      if (total < 1 || total > BOOTSTRAP_MAX_BYTES) fail();
      chunks.push(chunk);
    }
    if (total < 1) fail();
    const bytes = Buffer.concat(chunks, total);
    try {
      return parseGateBBuyerWalletBootstrap(bytes.toString('utf8'));
    } finally {
      bytes.fill(0);
    }
  } catch {
    fail();
  } finally {
    for (let index = 0; index < chunks.length; index += 1) chunks[index].fill(0);
  }
}

function captureCreationInjections(injected) {
  const output = {
    constants: fsConstants,
    lstatPath: lstat,
    openPath: open,
    realpathPath: realpath,
    getuid: typeof process.getuid === 'function' ? () => process.getuid() : undefined,
    aclInspector: inspectDarwinAcl,
    sdkLoader: () => import('znn-typescript-sdk'),
    decorateFileHandle: handle => handle,
    decorateDirectoryHandle: handle => handle,
    afterReservations: async () => {},
    afterRandomness: async () => {},
  };
  if (injected === undefined) return output;
  exactPlainObject(injected, REFLECT_OWN_KEYS(injected).map(key => {
    if (typeof key !== 'string') fail();
    return key;
  }));
  const allowed = [
    'constants', 'lstatPath', 'openPath', 'realpathPath', 'getuid', 'aclInspector',
    'sdkLoader', 'decorateFileHandle', 'decorateDirectoryHandle',
    'afterReservations', 'afterRandomness',
  ];
  const keys = REFLECT_OWN_KEYS(injected);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (!allowed.includes(key)) fail();
    output[key] = injected[key];
  }
  if (!output.constants || typeof output.constants !== 'object' ||
      typeof output.lstatPath !== 'function' || typeof output.openPath !== 'function' ||
      typeof output.realpathPath !== 'function' ||
      typeof output.getuid !== 'function' || typeof output.aclInspector !== 'function' ||
      typeof output.sdkLoader !== 'function' ||
      typeof output.decorateFileHandle !== 'function' ||
      typeof output.decorateDirectoryHandle !== 'function' ||
      typeof output.afterReservations !== 'function' ||
      typeof output.afterRandomness !== 'function') fail();
  return output;
}

function captureChildOptions(options) {
  exactPlainObject(options, REFLECT_OWN_KEYS(options).map(key => {
    if (typeof key !== 'string') fail();
    return key;
  }));
  const output = {
    channel: process,
    readBootstrap: readBootstrapFd,
    createWallet: createGateBBuyerWallet,
    forceExit: code => process.exit(code),
  };
  const allowed = ['channel', 'readBootstrap', 'createWallet', 'forceExit', 'creationInjections'];
  const keys = REFLECT_OWN_KEYS(options);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (!allowed.includes(key)) fail();
    output[key] = options[key];
  }
  if (!output.channel || typeof output.channel.once !== 'function' ||
      typeof output.channel.on !== 'function' || typeof output.channel.send !== 'function' ||
      typeof output.readBootstrap !== 'function' || typeof output.createWallet !== 'function' ||
      typeof output.forceExit !== 'function') fail();
  return output;
}

function mode(stat) {
  return Number(stat.mode & 0o777n);
}

function sameInode(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function directoryStat(stat, uid) {
  return stat && typeof stat.isDirectory === 'function' && stat.isDirectory() &&
    stat.uid === BigInt(uid) && mode(stat) === PRIVATE_DIRECTORY_MODE;
}

function fileStat(stat, uid, expectedSize) {
  return stat && typeof stat.isFile === 'function' && stat.isFile() &&
    stat.uid === BigInt(uid) && stat.nlink === 1n && mode(stat) === PRIVATE_FILE_MODE &&
    (expectedSize === undefined || stat.size === BigInt(expectedSize));
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

async function assertWorkspaceStable(workspace, dependencies) {
  const canonical = await Reflect.apply(dependencies.realpathPath, undefined, [workspace.root]);
  if (canonical !== workspace.root) fail();
  const validate = async () => {
    const [pathStat, handleStat] = await Promise.all([
      Reflect.apply(dependencies.lstatPath, undefined, [workspace.root, { bigint: true }]),
      workspace.handle.stat({ bigint: true }),
    ]);
    if (!directoryStat(pathStat, workspace.uid) ||
        !directoryStat(handleStat, workspace.uid) ||
        !sameInode(pathStat, workspace.identity) ||
        !sameInode(handleStat, workspace.identity)) fail();
  };
  await validate();
  if (await Reflect.apply(dependencies.aclInspector, undefined, [
    workspace.root,
    'drwx------',
  ]) !== true) fail();
  await validate();
}

async function assertCreatedPath(record, workspace, dependencies, expectedSize) {
  await assertWorkspaceStable(workspace, dependencies);
  const validate = async () => {
    const [pathStat, handleStat] = await Promise.all([
      Reflect.apply(dependencies.lstatPath, undefined, [record.path, { bigint: true }]),
      record.handle.stat({ bigint: true }),
    ]);
    if (!fileStat(pathStat, workspace.uid, expectedSize) ||
        !fileStat(handleStat, workspace.uid, expectedSize) ||
        !sameInode(pathStat, record.identity) || !sameInode(handleStat, record.identity)) fail();
  };
  await validate();
  if (await Reflect.apply(dependencies.aclInspector, undefined, [
    record.path,
    '-rw-------',
  ]) !== true) fail();
  await validate();
}

async function openWorkspace(workspaceRoot, dependencies) {
  if (typeof workspaceRoot !== 'string' || workspaceRoot.length === 0 ||
      workspaceRoot.length > 4096 || workspaceRoot.includes('\0') ||
      !isAbsolute(workspaceRoot) || resolve(workspaceRoot) !== workspaceRoot) fail();
  const canonical = await Reflect.apply(dependencies.realpathPath, undefined, [workspaceRoot]);
  if (canonical !== workspaceRoot) fail();
  const uid = Reflect.apply(dependencies.getuid, undefined, []);
  if (!Number.isSafeInteger(uid) || uid < 0) fail();
  const pathStat = await Reflect.apply(dependencies.lstatPath, undefined, [workspaceRoot, {
    bigint: true,
  }]);
  if (!directoryStat(pathStat, uid)) fail();
  await assertOutsideGit(workspaceRoot, dependencies);

  const { O_DIRECTORY, O_NOFOLLOW, O_RDONLY } = dependencies.constants;
  if (![O_DIRECTORY, O_NOFOLLOW, O_RDONLY].every(Number.isInteger)) fail();
  const rawHandle = await Reflect.apply(dependencies.openPath, undefined, [
    workspaceRoot,
    O_RDONLY | O_DIRECTORY | O_NOFOLLOW,
  ]);
  let handle;
  try {
    handle = Reflect.apply(dependencies.decorateDirectoryHandle, undefined, [rawHandle]);
    if (!handle || typeof handle.stat !== 'function' || typeof handle.sync !== 'function' ||
        typeof handle.close !== 'function') fail();
    const handleStat = await handle.stat({ bigint: true });
    if (!directoryStat(handleStat, uid) || !sameInode(pathStat, handleStat)) fail();
    const workspace = { root: workspaceRoot, uid, handle, identity: handleStat };
    await assertWorkspaceStable(workspace, dependencies);
    return workspace;
  } catch {
    try { await (handle ?? rawHandle).close(); } catch {}
    fail();
  }
}

async function assertAbsent(path, dependencies) {
  try {
    await Reflect.apply(dependencies.lstatPath, undefined, [path, { bigint: true }]);
    fail();
  } catch (error) {
    if (!missing(error)) fail();
  }
}

async function reserveFile(path, label, workspace, dependencies, records) {
  const { O_CLOEXEC = 0, O_CREAT, O_EXCL, O_NOFOLLOW, O_WRONLY } = dependencies.constants;
  if (![O_CLOEXEC, O_CREAT, O_EXCL, O_NOFOLLOW, O_WRONLY].every(Number.isInteger) ||
      O_CREAT === 0 || O_EXCL === 0 || O_NOFOLLOW === 0) fail();
  await assertWorkspaceStable(workspace, dependencies);
  const rawHandle = await Reflect.apply(dependencies.openPath, undefined, [
    path,
    O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC,
    PRIVATE_FILE_MODE,
  ]);
  let handle;
  let initial;
  try {
    handle = Reflect.apply(dependencies.decorateFileHandle, undefined, [rawHandle, label]);
    if (!handle || typeof handle.stat !== 'function' || typeof handle.chmod !== 'function' ||
        typeof handle.write !== 'function' || typeof handle.sync !== 'function' ||
        typeof handle.close !== 'function') fail();
    initial = await handle.stat({ bigint: true });
    if (!initial || typeof initial.isFile !== 'function' || !initial.isFile() ||
        initial.uid !== BigInt(workspace.uid) || initial.nlink !== 1n || initial.size !== 0n) fail();
  } catch {
    try { await (handle ?? rawHandle).close(); } catch {}
    fail();
  }
  const record = { path, handle, identity: initial, closed: false };
  records.push(record);
  await handle.chmod(PRIVATE_FILE_MODE);
  await assertCreatedPath(record, workspace, dependencies, 0);
  return record;
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

async function closeRecord(record) {
  if (!record || record.closed) return;
  record.closed = true;
  try { await record.handle.close(); } catch {}
}

function clearBuffer(value) {
  try {
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) value.fill(0);
  } catch {}
}

function clearSecrets(wallet, keyPair) {
  try { if (keyPair && typeof keyPair.clear === 'function') keyPair.clear(); } catch {}
  if (keyPair && typeof keyPair === 'object') {
    clearBuffer(keyPair.privateKey);
    clearBuffer(keyPair.publicKey);
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

function safeString(value, maximumBytes) {
  if (typeof value !== 'string' || value.length === 0 ||
      Buffer.byteLength(value, 'utf8') > maximumBytes ||
      /[\u0000-\u001f\u007f]/u.test(value)) fail();
  return value;
}

export async function createGateBBuyerWallet(workspaceRoot, injected) {
  const dependencies = captureCreationInjections(injected);
  const records = [];
  let workspace;
  let wallet;
  let keyPair;
  let walletBytes;
  let addressBytes;
  try {
    workspace = await openWorkspace(workspaceRoot, dependencies);
    const walletPath = join(workspace.root, WALLET_NAME);
    const addressPath = join(workspace.root, ADDRESS_NAME);
    await assertAbsent(walletPath, dependencies);
    await assertAbsent(addressPath, dependencies);

    const walletRecord = await reserveFile(
      walletPath,
      'wallet',
      workspace,
      dependencies,
      records,
    );
    const addressRecord = await reserveFile(
      addressPath,
      'address',
      workspace,
      dependencies,
      records,
    );
    if (sameInode(walletRecord.identity, addressRecord.identity)) fail();
    await assertCreatedPath(walletRecord, workspace, dependencies, 0);
    await assertCreatedPath(addressRecord, workspace, dependencies, 0);
    await Reflect.apply(dependencies.afterReservations, undefined, []);
    await assertCreatedPath(walletRecord, workspace, dependencies, 0);
    await assertCreatedPath(addressRecord, workspace, dependencies, 0);

    const sdk = await Reflect.apply(dependencies.sdkLoader, undefined, []);
    if (!sdk || typeof sdk !== 'object' || !sdk.KeyStore ||
        typeof sdk.KeyStore.newRandom !== 'function') fail();
    wallet = Reflect.apply(sdk.KeyStore.newRandom, sdk.KeyStore, []);
    if (!wallet || typeof wallet !== 'object' || typeof wallet.getKeyPair !== 'function') fail();
    const mnemonic = safeString(wallet.mnemonic, MAX_MNEMONIC_BYTES);
    keyPair = Reflect.apply(wallet.getKeyPair, wallet, [0]);
    if (!keyPair || typeof keyPair !== 'object' || typeof keyPair.getAddress !== 'function') fail();
    const addressObject = Reflect.apply(keyPair.getAddress, keyPair, []);
    if (!addressObject || typeof addressObject.toString !== 'function') fail();
    const address = safeString(Reflect.apply(addressObject.toString, addressObject, []),
      MAX_ADDRESS_BYTES);
    await Reflect.apply(dependencies.afterRandomness, undefined, []);

    walletBytes = Buffer.from(`${JSON.stringify({
      secretVersion: 1,
      mnemonic,
      accountIndex: 0,
    })}\n`, 'utf8');
    addressBytes = Buffer.from(`${JSON.stringify({
      addressVersion: 1,
      address,
      accountIndex: 0,
    })}\n`, 'utf8');
    await assertCreatedPath(walletRecord, workspace, dependencies, 0);
    await assertCreatedPath(addressRecord, workspace, dependencies, 0);
    await fullWrite(walletRecord.handle, walletBytes);
    await walletRecord.handle.sync();
    await assertCreatedPath(walletRecord, workspace, dependencies, walletBytes.length);
    await assertCreatedPath(addressRecord, workspace, dependencies, 0);
    await fullWrite(addressRecord.handle, addressBytes);
    await addressRecord.handle.sync();
    await assertCreatedPath(walletRecord, workspace, dependencies, walletBytes.length);
    await assertCreatedPath(addressRecord, workspace, dependencies, addressBytes.length);
    await workspace.handle.sync();
    await assertWorkspaceStable(workspace, dependencies);
    await assertCreatedPath(walletRecord, workspace, dependencies, walletBytes.length);
    await assertCreatedPath(addressRecord, workspace, dependencies, addressBytes.length);
    return { status: 'created' };
  } catch {
    fail();
  } finally {
    if (Buffer.isBuffer(walletBytes)) walletBytes.fill(0);
    if (Buffer.isBuffer(addressBytes)) addressBytes.fill(0);
    clearSecrets(wallet, keyPair);
    for (let index = records.length - 1; index >= 0; index -= 1) {
      await closeRecord(records[index]);
    }
    if (workspace) {
      try { await workspace.handle.close(); } catch {}
    }
  }
}

export async function runGateBBuyerWalletChild(options = {}) {
  const dependencies = captureChildOptions(options);
  let handling = false;
  let finished = false;
  const terminate = code => {
    if (finished) return;
    finished = true;
    try { Reflect.apply(dependencies.forceExit, undefined, [code]); } catch {}
  };
  try {
    const workspaceRoot = await Reflect.apply(dependencies.readBootstrap, undefined, []);
    dependencies.channel.once('disconnect', () => terminate(1));
    dependencies.channel.on('message', async message => {
      if (handling || finished) return terminate(1);
      handling = true;
      try {
        exactControlMessage(message);
        const result = await Reflect.apply(dependencies.createWallet, undefined, [
          workspaceRoot,
          dependencies.creationInjections,
        ]);
        if (finished || !result || typeof result !== 'object' ||
            REFLECT_OWN_KEYS(result).length !== 1 || result.status !== 'created') fail();
        await send(dependencies.channel, 'CREATED');
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
  await runGateBBuyerWalletChild();
}

void launch().catch(() => {
  try { process.exit(1); } catch {}
});
