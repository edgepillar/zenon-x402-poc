import dgram from 'node:dgram';
import dns from 'node:dns';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from 'node:fs';
import http from 'node:http';
import http2 from 'node:http2';
import https from 'node:https';
import net from 'node:net';
import { isAbsolute, join, resolve } from 'node:path';
import tls from 'node:tls';
import { isDeepStrictEqual } from 'node:util';
import * as sdk from 'znn-typescript-sdk';
import { createLiveEvidenceObserver } from '../src/live-observation.js';
import { SettlementJournal } from '../src/settlement-journal.js';
import {
  FIXED_PAYER_SETTLEMENT_STARTUP_STDERR_BOUNDARY as STARTUP_STDERR_BOUNDARY,
  FIXED_PAYER_SETTLEMENT_STARTUP_STDOUT_BOUNDARY as STARTUP_STDOUT_BOUNDARY,
  prepareFreshFixedPayerSettlementChild,
} from '../src/zenon/fixed-payer-settlement-child-startup.js';
import { ExactZenonFacilitator } from '../src/zenon-payment.js';
import { runFixedPayerSettlementChild } from '../src/zenon/fixed-payer-settlement-child.js';

const FIXTURE_NAME = 'signed-payment.json';
const STARTUP_FIXTURE_NAME = 'fixed-payer-startup.json';
const MAX_FIXTURE_BYTES = 16_384;
const MAX_STARTUP_FIXTURE_BYTES = 1024;
const STARTUP_MODES = new Set([
  'NORMAL',
  'DELAY_READY',
  'EARLY_STRING',
  'EARLY_MARKER',
  'PARTIAL_STDOUT',
  'DELAY_STDERR_BOUNDARY',
  'DUPLICATE_STARTUP_ACK',
  'MISMATCHED_STARTUP_ACK',
  'HOLD_BEFORE_READY',
  'EXIT_AFTER_READY',
]);
const PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: '7',
  genesisMomentumHash: '7'.repeat(64),
});
const RELEASE = 'RELEASE\n';
const PUBLICATION_MARKER = 'PUBLICATION_BOUNDARY\n';
let ownedController = null;
let ownedZenon = null;
let ownedBootstrap = null;
let shutdownRequested = false;
let resolveStartupHold = null;

function shutdownOwnedRuntime(exitCode = undefined) {
  shutdownRequested = true;
  resolveStartupHold?.();
  ownedBootstrap?.close();
  if (exitCode !== undefined) process.exitCode = exitCode;
  try { ownedController?.close(); } catch {}
  try { process.stdin.destroy(); } catch {}
  try { ownedZenon?.clearConnection(); } catch {}
  try {
    if (process.connected) process.disconnect();
  } catch {
    if (exitCode === undefined) process.exitCode = 1;
  }
}

function stop(code = 'TRIPWIRE') {
  const error = new Error(code);
  error.name = 'FixedPayerSettlementFixtureError';
  error.stack = `FixedPayerSettlementFixtureError: ${code}`;
  throw error;
}

function replace(owner, name) {
  const descriptor = Object.getOwnPropertyDescriptor(owner, name);
  if (!descriptor || typeof descriptor.value !== 'function') stop();
  Object.defineProperty(owner, name, { ...descriptor, value: stop });
}

function installTripwires() {
  for (const [owner, names] of [
    [net, ['connect', 'createConnection']],
    [net.Socket.prototype, ['connect']],
    [tls, ['connect']],
    [http, ['request', 'get']],
    [https, ['request', 'get']],
    [http2, ['connect']],
    [dgram, ['createSocket']],
    [dns, ['lookup', 'resolve', 'resolve4', 'resolve6', 'reverse']],
    [dns.promises, ['lookup', 'resolve', 'resolve4', 'resolve6', 'reverse']],
  ]) {
    for (const name of names) replace(owner, name);
  }
  globalThis.fetch = stop;
  globalThis.WebSocket = class NetworkTripwire { constructor() { stop(); } };

  for (const owner of [sdk.KeyStore, sdk.KeyStore.prototype, sdk.KeyPair, sdk.KeyPair.prototype]) {
    for (const name of Object.getOwnPropertyNames(owner)) {
      const descriptor = Object.getOwnPropertyDescriptor(owner, name);
      if (name !== 'constructor' && typeof descriptor?.value === 'function') {
        Object.defineProperty(owner, name, { ...descriptor, value: stop });
      }
    }
  }
}

function readSignedPayment(root) {
  let descriptor;
  let encoded;
  try {
    const rootState = lstatSync(root);
    if (!rootState.isDirectory() || (rootState.mode & 0o777) !== 0o700 ||
        !Number.isInteger(fsConstants.O_NOFOLLOW)) stop('FIXTURE');
    descriptor = openSync(
      join(root, FIXTURE_NAME),
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
    const state = fstatSync(descriptor);
    if (!state.isFile() || state.nlink !== 1 || (state.mode & 0o777) !== 0o600 ||
        state.size < 1 || state.size > MAX_FIXTURE_BYTES) stop('FIXTURE');
    encoded = readFileSync(descriptor);
    if (encoded.length !== state.size) stop('FIXTURE');
    const json = encoded.toString('utf8');
    const paymentPayload = JSON.parse(json);
    if (JSON.stringify(paymentPayload) !== json ||
        paymentPayload?.accepted?.extra?.paymentFlow !== 'upfront' ||
        !isDeepStrictEqual(paymentPayload.accepted.extra.zenonChain, PROFILE)) {
      stop('FIXTURE');
    }
    return paymentPayload;
  } catch {
    stop('FIXTURE');
  } finally {
    encoded?.fill(0);
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { stop('FIXTURE'); }
    }
  }
}

function readStartupMode(root) {
  let descriptor;
  let encoded;
  const path = join(root, STARTUP_FIXTURE_NAME);
  try {
    let pathState;
    try {
      pathState = lstatSync(path);
    } catch (error) {
      if (error?.code === 'ENOENT') return 'NORMAL';
      stop('STARTUP_FIXTURE');
    }
    if (!pathState.isFile() || pathState.nlink !== 1 ||
        (pathState.mode & 0o777) !== 0o600) stop('STARTUP_FIXTURE');
    descriptor = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const state = fstatSync(descriptor);
    if (!state.isFile() || state.nlink !== 1 || (state.mode & 0o777) !== 0o600 ||
        state.size < 1 || state.size > MAX_STARTUP_FIXTURE_BYTES ||
        state.dev !== pathState.dev || state.ino !== pathState.ino) stop('STARTUP_FIXTURE');
    encoded = readFileSync(descriptor);
    if (encoded.length !== state.size) stop('STARTUP_FIXTURE');
    const json = encoded.toString('utf8');
    const parsed = JSON.parse(json);
    if (JSON.stringify(parsed) !== json || Object.getPrototypeOf(parsed) !== Object.prototype ||
        Reflect.ownKeys(parsed).length !== 2 || parsed.schemaVersion !== 1 ||
        !STARTUP_MODES.has(parsed.mode)) stop('STARTUP_FIXTURE');
    return parsed.mode;
  } catch {
    stop('STARTUP_FIXTURE');
  } finally {
    encoded?.fill(0);
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { stop('STARTUP_FIXTURE'); }
    }
  }
}

function waitForStartupDelay(milliseconds) {
  if (shutdownRequested) return Promise.resolve();
  return new Promise(resolvePromise => {
    const timer = setTimeout(finish, milliseconds);
    function finish() {
      clearTimeout(timer);
      if (resolveStartupHold === finish) resolveStartupHold = null;
      resolvePromise();
    }
    resolveStartupHold = finish;
  });
}

function waitForStartupHold() {
  if (shutdownRequested) return Promise.resolve();
  return new Promise(resolvePromise => {
    resolveStartupHold = () => {
      resolveStartupHold = null;
      resolvePromise();
    };
  });
}

function sendStartupFrame(frame, code) {
  return new Promise((resolvePromise, rejectPromise) => {
    let returned = false;
    let accepted = false;
    let callbacks = 0;
    let callbackOk = false;
    const finish = () => {
      if (!returned || callbacks !== 1) return;
      if (accepted && callbackOk) resolvePromise();
      else rejectPromise(new Error(code));
    };
    const callback = error => {
      callbacks += 1;
      callbackOk = callbacks === 1 && error == null;
      if (callbacks > 1) {
        rejectPromise(new Error(code));
        return;
      }
      finish();
    };
    try {
      accepted = process.send(frame, callback) === true;
    } catch {
      returned = true;
      rejectPromise(new Error(code));
      return;
    }
    returned = true;
    if (!accepted) {
      rejectPromise(new Error(code));
      return;
    }
    finish();
  });
}

function exactStartupCommit(message, descriptor) {
  if (!message || typeof message !== 'object' || Array.isArray(message) ||
      Object.getPrototypeOf(message) !== Object.prototype) return false;
  const fields = ['ipcVersion', 'type', 'correlationId', 'shardId', 'payer', 'generation'];
  const keys = Reflect.ownKeys(message);
  if (keys.length !== fields.length || keys.some(key =>
    typeof key !== 'string' || !fields.includes(key))) return false;
  for (const field of fields) {
    const property = Object.getOwnPropertyDescriptor(message, field);
    if (!property || !Object.hasOwn(property, 'value') || property.enumerable !== true) {
      return false;
    }
  }
  return message.ipcVersion === 1 && message.type === 'STARTUP_COMMIT' &&
    message.correlationId === `${descriptor.generation}:${descriptor.shardId}:startup-commit` &&
    message.shardId === descriptor.shardId && message.payer === descriptor.payer &&
    message.generation === descriptor.generation;
}

function beginStartupBootstrap(descriptor) {
  let phase = 'WAITING';
  let resolveCommit;
  const committed = new Promise(resolvePromise => { resolveCommit = resolvePromise; });
  const remove = () => {
    process.removeListener('message', onMessage);
    process.removeListener('disconnect', onDisconnect);
    process.removeListener('error', onError);
  };
  const close = () => {
    if (phase === 'CLOSED' || phase === 'HANDED_OFF') return;
    phase = 'CLOSED';
    remove();
    resolveCommit(false);
  };
  const rejectBootstrap = () => {
    close();
    shutdownOwnedRuntime(71);
  };
  const onMessage = message => {
    if (phase !== 'WAITING' || !exactStartupCommit(message, descriptor)) {
      rejectBootstrap();
      return;
    }
    phase = 'COMMITTED';
    resolveCommit(true);
  };
  const onDisconnect = () => close();
  const onError = () => close();
  process.on('message', onMessage);
  process.on('disconnect', onDisconnect);
  process.on('error', onError);
  return Object.freeze({
    committed,
    handoff() {
      if (phase !== 'COMMITTED') stop('STARTUP_HANDOFF');
      phase = 'HANDED_OFF';
      remove();
    },
    close,
  });
}

function committedFrame(descriptor) {
  return Object.freeze({
    ipcVersion: 1,
    type: 'STARTUP_COMMITTED',
    correlationId: `${descriptor.generation}:${descriptor.shardId}:startup-commit`,
    shardId: descriptor.shardId,
    payer: descriptor.payer,
    generation: descriptor.generation,
  });
}

function mismatchedCommittedFrame(descriptor) {
  return Object.freeze({
    ...committedFrame(descriptor),
    correlationId: `${descriptor.generation}:${descriptor.shardId}:startup-commit-mismatch`,
  });
}

function writeStartupBoundaries(delayStderr) {
  if (delayStderr) process.stderr.cork();
  process.stdout.write(STARTUP_STDOUT_BOUNDARY, error => {
    if (error != null && !shutdownRequested) shutdownOwnedRuntime(72);
  });
  process.stderr.write(STARTUP_STDERR_BOUNDARY, error => {
    if (error != null && !shutdownRequested) shutdownOwnedRuntime(72);
  });
}

function sendEarlyString() {
  return new Promise((resolvePromise, rejectPromise) => {
    try {
      if (process.send('EARLY_STRING', error => {
        if (error == null) resolvePromise();
        else rejectPromise(new Error('EARLY_STRING_FAILED'));
      }) !== true) rejectPromise(new Error('EARLY_STRING_FAILED'));
    } catch {
      rejectPromise(new Error('EARLY_STRING_FAILED'));
    }
  });
}

function writeStartupOutput(text) {
  return new Promise((resolvePromise, rejectPromise) => {
    process.stdout.write(text, error => {
      if (error == null) resolvePromise();
      else rejectPromise(new Error('STARTUP_STDOUT_FAILED'));
    });
  });
}

function accountInfo(transaction) {
  const address = sdk.Address.parse(transaction.address);
  const tokenStandard = sdk.TokenStandard.parse(transaction.tokenStandard);
  const balance = BigInt(transaction.amount);
  const token = new sdk.Token(
    'Synthetic', 'SYN', '', balance, 8, address, tokenStandard, balance,
    false, false, false,
  );
  return new sdk.AccountInfo(address, transaction.height - 1, {
    [transaction.tokenStandard]: new sdk.BalanceInfoListItem(token, balance),
  });
}

function observedBlock(transaction) {
  const block = sdk.AccountBlockTemplate.fromJson(transaction);
  block.publicKey = Buffer.from(transaction.publicKey, 'base64');
  block.signature = Buffer.from(transaction.signature, 'base64');
  block.confirmationDetail = {
    numConfirmations: 1,
    momentumHeight: 11,
    momentumHash: sdk.Hash.digest(Buffer.from('synthetic inclusion momentum')),
    momentumTimestamp: 1,
  };
  return block;
}

function waitForRelease() {
  return new Promise((resolvePromise, rejectPromise) => {
    let input = '';
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      process.stdin.removeAllListeners('data');
      process.stdin.removeAllListeners('end');
      process.stdin.removeAllListeners('error');
      if (error === undefined) resolvePromise();
      else rejectPromise(error);
    };
    const watchdog = setTimeout(() => finish(new Error('CONTROL_TIMEOUT')), 20_000);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      input += chunk;
      if (input.length > RELEASE.length || !RELEASE.startsWith(input)) {
        finish(new Error('CONTROL_INVALID'));
      } else if (input === RELEASE) {
        finish();
      }
    });
    process.stdin.on('end', () => {
      if (input !== RELEASE) finish(new Error('CONTROL_INCOMPLETE'));
    });
    process.stdin.on('error', () => finish(new Error('CONTROL_FAILED')));
  });
}

export async function runFixedPayerSettlementOfflineFixture(options) {
  if (!options || Object.getPrototypeOf(options) !== Object.prototype ||
      Reflect.ownKeys(options).length !== 2 ||
      !Object.hasOwn(options, 'label') || !Object.hasOwn(options, 'privateRoot')) {
    stop('ARGUMENTS');
  }
  const { label, privateRoot: root } = options;
  if ((label !== 'A' && label !== 'B') || !isAbsolute(root) || resolve(root) !== root) {
    stop('ARGUMENTS');
  }
  const requestClose = () => { shutdownOwnedRuntime(); };
  const watchdog = setTimeout(() => shutdownOwnedRuntime(70), 45_000);
  process.once('SIGTERM', requestClose);
  try {
    for (const name of Reflect.ownKeys(process.env)) {
      if (typeof name !== 'string' || !delete process.env[name]) stop('ENVIRONMENT');
    }
    if (Reflect.ownKeys(process.env).length !== 0 || process.argv.length !== 5) stop('ARGUMENTS');
    installTripwires();

    const paymentPayload = readSignedPayment(root);
    const transaction = paymentPayload.payload.transaction;
    const shardId = label === 'A' ? 'payer-shard-a' : 'payer-shard-b';
    const generation = label === 'A' ? 'fixture-generation-a' : 'fixture-generation-b';
    const directory = join(root, 'journal');
    const startup = await prepareFreshFixedPayerSettlementChild({
      privateRoot: root,
      shardId,
      payer: transaction.address,
      generation,
    });
    const startupMode = readStartupMode(root);
    if (startupMode === 'HOLD_BEFORE_READY') {
      await waitForStartupHold();
      return;
    }
    if (shutdownRequested) return;
    const descriptor = Object.freeze({
      shardId,
      payer: transaction.address,
      generation,
    });
    const bootstrap = beginStartupBootstrap(descriptor);
    ownedBootstrap = bootstrap;
    if (startupMode === 'EARLY_MARKER') await writeStartupOutput(PUBLICATION_MARKER);
    if (startupMode === 'PARTIAL_STDOUT') await writeStartupOutput('PARTIAL_STDOUT');
    if (shutdownRequested) return;
    const journal = startup.journal;
    let zenon = null;
    let activeFacilitator = null;
    const initializeFacilitator = () => {
      if (activeFacilitator !== null) return activeFacilitator;
      zenon = sdk.Zenon.getInstance();
      ownedZenon = zenon;
      let published = false;
      let publicationCalls = 0;

      zenon.initialize = async rpcUrl => {
        if (rpcUrl !== 'ws://rpc.invalid') stop();
        zenon.client = Object.freeze({ synthetic: true });
      };
      zenon.clearConnection = () => { zenon.client = undefined; };
      zenon.send = stop;
      zenon.prepareBlock = stop;
      zenon.stats = new Proxy({
        networkInfo: async () => ({
          numPeers: 1,
          self: { publicKey: 'synthetic', ip: 'synthetic' },
          peers: [],
        }),
        syncInfo: async () => ({
          state: sdk.SyncState.SyncDone,
          currentHeight: 10,
          targetHeight: 10,
        }),
      }, { get: (target, name) => Reflect.has(target, name) ? target[name] : stop });
      zenon.embedded = new Proxy({ token: new Proxy({
        getByZts: async tokenStandard => ({ tokenStandard }),
      }, { get: (target, name) => Reflect.has(target, name) ? target[name] : stop }) }, {
        get: (target, name) => Reflect.has(target, name) ? target[name] : stop,
      });
      zenon.ledger = new Proxy({
        getFrontierMomentum: async () => ({
          version: PROFILE.version,
          chainIdentifier: Number(PROFILE.chainIdentifier),
          height: 10,
          hash: sdk.Hash.digest(Buffer.from('synthetic frontier momentum')),
        }),
        getAccountBlockByHash: async hash => {
          if (hash.toString() !== transaction.hash) stop();
          return published ? observedBlock(transaction) : null;
        },
        getAccountInfoByAddress: async address => {
          if (address.toString() !== transaction.address) stop();
          return accountInfo(transaction);
        },
        getFrontierAccountBlock: async address => {
          if (address.toString() !== transaction.address) stop();
          return null;
        },
        getUnconfirmedBlocksByAddress: async (address, page, pageSize) => {
          if (address.toString() !== transaction.address || page !== 0 || pageSize !== 50) stop();
          return { count: 0, list: [] };
        },
        publishRawTransaction: async block => {
          publicationCalls += 1;
          const durable = await new SettlementJournal({
            directory,
            allowedRoot: root,
            existingOnly: true,
          }).list({ includeTombstones: true });
          const record = durable.records[0];
          if (publicationCalls !== 1 || durable.records.length !== 1 ||
              durable.tombstones.length !== 0 || record.evidenceState !== 'VALIDATED' ||
              record.transactionHash !== transaction.hash ||
              record.payer !== transaction.address ||
              !isDeepStrictEqual(record.signedAccountBlock, transaction) ||
              !isDeepStrictEqual(block.toJson(), transaction)) stop('DURABILITY');
          await new Promise((resolvePromise, rejectPromise) => {
            process.stdout.write(PUBLICATION_MARKER, error => {
              if (error) rejectPromise(new Error('STDOUT'));
              else resolvePromise();
            });
          });
          await waitForRelease();
          published = true;
        },
      }, { get: (target, name) => Reflect.has(target, name) ? target[name] : stop });
      zenon.subscribe = new Proxy({
        toAccountBlocksByAddress: async address => {
          if (address.toString() !== transaction.address) stop();
          return { onNotification(callback) { if (typeof callback !== 'function') stop(); } };
        },
      }, { get: (target, name) => Reflect.has(target, name) ? target[name] : stop });

      activeFacilitator = new ExactZenonFacilitator({
        journal,
        rpcTimeoutMs: 15_000,
        environment: {
          ZENON_LIVE_ACK: 'I_UNDERSTAND_TESTNET_ONLY',
          ZENON_NETWORK_ID: '3',
          ZENON_RPC_URL: 'ws://rpc.invalid',
        },
        authenticateChainProfile: async ({ expectedChainProfile }) => {
          if (!isDeepStrictEqual(expectedChainProfile, PROFILE)) stop();
          return structuredClone(PROFILE);
        },
        lifecycleObserver: createLiveEvidenceObserver({
          utcNow: () => '2026-01-01T00:00:00.000Z',
          monotonicNow: () => 1,
        }),
      });
      return activeFacilitator;
    };
    const invokeFacilitator = (name, args) => {
      const facilitator = initializeFacilitator();
      return Reflect.apply(facilitator[name], facilitator, args);
    };
    const facilitator = Object.freeze({
      settle(...args) { return invokeFacilitator('settle', args); },
      markDeliveryPending(...args) { return invokeFacilitator('markDeliveryPending', args); },
      markDelivered(...args) { return invokeFacilitator('markDelivered', args); },
    });
    if (startupMode === 'DELAY_READY') await waitForStartupDelay(150);
    if (shutdownRequested) shutdownOwnedRuntime(process.exitCode);
    if (!shutdownRequested) await sendStartupFrame(startup.readyFrame, 'READY_FAILED');
    if (!shutdownRequested && startupMode === 'EARLY_STRING') await sendEarlyString();
    if (!await bootstrap.committed || shutdownRequested) return;
    const delayedStderr = startupMode === 'DELAY_STDERR_BOUNDARY' ||
      startupMode === 'DUPLICATE_STARTUP_ACK' ||
      startupMode === 'MISMATCHED_STARTUP_ACK';
    writeStartupBoundaries(delayedStderr);
    const controller = runFixedPayerSettlementChild({
      channel: process,
      facilitator,
      shardId,
      payer: transaction.address,
      generation,
      maxOperations: 16,
    });
    ownedController = controller;
    bootstrap.handoff();
    if (ownedBootstrap === bootstrap) ownedBootstrap = null;
    if (shutdownRequested) shutdownOwnedRuntime(process.exitCode);
    if (!shutdownRequested) {
      await sendStartupFrame(committedFrame(descriptor), 'STARTUP_COMMITTED_FAILED');
    }
    if (!shutdownRequested && startupMode === 'DUPLICATE_STARTUP_ACK') {
      await sendStartupFrame(committedFrame(descriptor), 'DUPLICATE_STARTUP_ACK_FAILED');
    }
    if (!shutdownRequested && startupMode === 'MISMATCHED_STARTUP_ACK') {
      await sendStartupFrame(
        mismatchedCommittedFrame(descriptor),
        'MISMATCHED_STARTUP_ACK_FAILED',
      );
    }
    if (delayedStderr && !shutdownRequested) {
      await waitForStartupDelay(250);
      process.stderr.uncork();
    }
    let exitAfterReady;
    if (!shutdownRequested && startupMode === 'EXIT_AFTER_READY') {
      exitAfterReady = setTimeout(() => shutdownOwnedRuntime(), 150);
    }
    try {
      await controller.done;
    } finally {
      clearTimeout(exitAfterReady);
      if (delayedStderr) process.stderr.uncork();
      try { controller.close(); } catch {}
      try { zenon?.clearConnection(); } catch {}
      try { process.stdin.destroy(); } catch {}
      try {
        if (process.connected) process.disconnect();
      } catch { process.exitCode = 1; }
      if (ownedController === controller) ownedController = null;
      if (ownedZenon === zenon) ownedZenon = null;
    }
  } finally {
    clearTimeout(watchdog);
    process.removeListener('SIGTERM', requestClose);
    resolveStartupHold = null;
    ownedBootstrap?.close();
    ownedBootstrap = null;
    try { ownedController?.close(); } catch {}
    try { ownedZenon?.clearConnection(); } catch {}
    ownedController = null;
    ownedZenon = null;
  }
}
