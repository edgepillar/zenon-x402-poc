import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, realpath } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { types as utilTypes } from 'node:util';

import { openGateBPublicWsPrivateWorkspace } from './gate-b-public-ws-private-workspace.js';

const IPC_VERSION = 1;
const REQUEST_ID = 1;
const BOOTSTRAP_FD = 4;
const BOOTSTRAP_MAX_BYTES = 8192;
const WORKSPACE_NAME = 'zenon-x402-gate-b-wallet';
const WALLET_NAME = 'buyer-wallet.json';
const ADDRESS_NAME = 'buyer-address.json';
const ENTROPY_BYTES = 32;
const MAX_MNEMONIC_BYTES = 4096;
const MAX_ADDRESS_BYTES = 256;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;

class GateBBuyerWalletChildError extends Error {
  constructor() {
    super('gate_b_buyer_wallet_child_failed');
    this.name = 'GateBBuyerWalletChildError';
    this.code = 'gate_b_buyer_wallet_child_failed';
    this.stack = 'GateBBuyerWalletChildError: gate_b_buyer_wallet_child_failed';
  }
}

function fail() {
  throw new GateBBuyerWalletChildError();
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

function exactAbsolutePath(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 4096 ||
      value.includes('\0') || !isAbsolute(value) || resolve(value) !== value) fail();
  return value;
}

function defaultApplicationSupportRoot() {
  try {
    const value = userInfo();
    if (!value || typeof value !== 'object') fail();
    return join(exactAbsolutePath(value.homedir), 'Library', 'Application Support');
  } catch {
    fail();
  }
}

export function parseGateBBuyerWalletBootstrap(text) {
  try {
    if (typeof text !== 'string' || text.length < 1 ||
        Buffer.byteLength(text, 'utf8') > BOOTSTRAP_MAX_BYTES) fail();
    const value = exactPlainObject(JSON.parse(text), ['workspaceRoot']);
    if (JSON.stringify(value) !== text) fail();
    return exactAbsolutePath(value.workspaceRoot);
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
      if (error) rejectSend(new GateBBuyerWalletChildError());
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
    applicationSupportRoot: defaultApplicationSupportRoot,
    realpathPath: realpath,
    readDirectory: readdir,
    openPrivateWorkspace: openGateBPublicWsPrivateWorkspace,
    privateWorkspaceInjections: undefined,
    sdkLoader: () => import('znn-typescript-sdk'),
    entropySource: size => randomBytes(size),
    afterReservations: async () => {},
    afterEntropy: async () => {},
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
  for (const name of [
    'applicationSupportRoot',
    'realpathPath',
    'readDirectory',
    'openPrivateWorkspace',
    'sdkLoader',
    'entropySource',
    'afterReservations',
    'afterEntropy',
  ]) {
    if (typeof output[name] !== 'function') fail();
  }
  return output;
}

function captureChildOptions(options) {
  if (!options || typeof options !== 'object' || IS_PROXY(options) || ARRAY_IS_ARRAY(options) ||
      GET_PROTOTYPE_OF(options) !== OBJECT_PROTOTYPE) fail();
  const output = {
    channel: process,
    readBootstrap: readBootstrapFd,
    createWallet: createGateBBuyerWallet,
    forceExit: code => process.exit(code),
    creationInjections: undefined,
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
      typeof output.readBootstrap !== 'function' || typeof output.createWallet !== 'function' ||
      typeof output.forceExit !== 'function') fail();
  return output;
}

async function assertWorkspacePlacement(workspaceRoot, dependencies) {
  exactAbsolutePath(workspaceRoot);
  const supportRoot = exactAbsolutePath(Reflect.apply(
    dependencies.applicationSupportRoot,
    undefined,
    [],
  ));
  if (workspaceRoot !== join(supportRoot, WORKSPACE_NAME)) fail();
  const [canonicalSupportRoot, canonicalWorkspaceRoot] = await Promise.all([
    Reflect.apply(dependencies.realpathPath, undefined, [supportRoot]),
    Reflect.apply(dependencies.realpathPath, undefined, [workspaceRoot]),
  ]);
  if (canonicalSupportRoot !== supportRoot || canonicalWorkspaceRoot !== workspaceRoot) fail();
}

async function assertEmptyWorkspace(workspaceRoot, dependencies) {
  const entries = await Reflect.apply(dependencies.readDirectory, undefined, [workspaceRoot]);
  if (!ARRAY_IS_ARRAY(entries) || IS_PROXY(entries) ||
      GET_PROTOTYPE_OF(entries) !== Array.prototype || entries.length !== 0 ||
      REFLECT_OWN_KEYS(entries).length !== 1) fail();
}

function exactCapability(value) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) ||
      ARRAY_IS_ARRAY(value) || !Object.isFrozen(value)) fail();
  for (const method of [
    'assertAbsent',
    'reserveOutputs',
    'assertDistinct',
    'verify',
    'write',
    'syncDirectories',
    'close',
  ]) {
    if (typeof value[method] !== 'function') fail();
  }
  return value;
}

function exactReservationRecords(value) {
  if (!ARRAY_IS_ARRAY(value) || IS_PROXY(value) ||
      GET_PROTOTYPE_OF(value) !== Array.prototype || value.length !== 2 ||
      REFLECT_OWN_KEYS(value).length !== 3 || !Object.isFrozen(value)) fail();
  return value;
}

async function reserveWalletOutputs(workspace, names) {
  try {
    return exactReservationRecords(await workspace.reserveOutputs(names));
  } catch {
    try {
      await workspace.assertAbsent(names);
    } catch {
      fail();
    }
    fail();
  }
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
  const names = [WALLET_NAME, ADDRESS_NAME];
  let workspace;
  let wallet;
  let keyPair;
  let entropy;
  let entropyText;
  let mnemonic;
  let walletBytes;
  let addressBytes;
  try {
    await assertWorkspacePlacement(workspaceRoot, dependencies);
    workspace = exactCapability(await Reflect.apply(
      dependencies.openPrivateWorkspace,
      undefined,
      [workspaceRoot, dependencies.privateWorkspaceInjections],
    ));
    await workspace.assertAbsent(names);
    await assertEmptyWorkspace(workspaceRoot, dependencies);
    await workspace.assertAbsent(names);

    const records = await reserveWalletOutputs(workspace, names);
    const walletRecord = records[0];
    const addressRecord = records[1];
    if (workspace.assertDistinct(records) !== true) fail();
    await workspace.verify(walletRecord, 0);
    await workspace.verify(addressRecord, 0);
    await Reflect.apply(dependencies.afterReservations, undefined, []);
    await workspace.verify(walletRecord, 0);
    await workspace.verify(addressRecord, 0);

    const loadedSdk = await Reflect.apply(dependencies.sdkLoader, undefined, []);
    if (!loadedSdk || typeof loadedSdk !== 'object' || !loadedSdk.KeyStore ||
        typeof loadedSdk.KeyStore.fromEntropy !== 'function') fail();
    entropy = await Reflect.apply(dependencies.entropySource, undefined, [ENTROPY_BYTES]);
    if (!Buffer.isBuffer(entropy) || entropy.length !== ENTROPY_BYTES) fail();
    entropyText = entropy.toString('hex');
    wallet = Reflect.apply(loadedSdk.KeyStore.fromEntropy, loadedSdk.KeyStore, [entropyText]);
    if (!wallet || typeof wallet !== 'object' || typeof wallet.getKeyPair !== 'function') fail();
    mnemonic = safeString(wallet.mnemonic, MAX_MNEMONIC_BYTES);
    keyPair = Reflect.apply(wallet.getKeyPair, wallet, [0]);
    if (!keyPair || typeof keyPair !== 'object' || typeof keyPair.getAddress !== 'function') fail();
    const addressObject = Reflect.apply(keyPair.getAddress, keyPair, []);
    if (!addressObject || typeof addressObject.toString !== 'function') fail();
    const address = safeString(
      Reflect.apply(addressObject.toString, addressObject, []),
      MAX_ADDRESS_BYTES,
    );
    await Reflect.apply(dependencies.afterEntropy, undefined, []);

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
    await workspace.verify(walletRecord, 0);
    await workspace.verify(addressRecord, 0);
    await workspace.write(walletRecord, walletBytes);
    await workspace.verify(walletRecord, walletBytes.length);
    await workspace.verify(addressRecord, 0);
    await workspace.write(addressRecord, addressBytes);
    await workspace.verify(walletRecord, walletBytes.length);
    await workspace.verify(addressRecord, addressBytes.length);
    await workspace.syncDirectories();
    await workspace.verify(walletRecord, walletBytes.length);
    await workspace.verify(addressRecord, addressBytes.length);
    return { status: 'created' };
  } catch {
    fail();
  } finally {
    clearBuffer(entropy);
    clearBuffer(walletBytes);
    clearBuffer(addressBytes);
    entropyText = undefined;
    mnemonic = undefined;
    clearSecrets(wallet, keyPair);
    if (workspace) {
      try { await workspace.close(); } catch {}
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
        exactPlainObject(result, ['status']);
        if (finished || result.status !== 'created') fail();
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
