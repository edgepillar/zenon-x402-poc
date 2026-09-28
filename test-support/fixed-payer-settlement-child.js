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
import { ExactZenonFacilitator } from '../src/zenon-payment.js';
import { runFixedPayerSettlementChild } from '../src/zenon/fixed-payer-settlement-child.js';

const FIXTURE_NAME = 'signed-payment.json';
const MAX_FIXTURE_BYTES = 16_384;
const PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: '7',
  genesisMomentumHash: '7'.repeat(64),
});
const RELEASE = 'RELEASE\n';
const PUBLICATION_MARKER = 'PUBLICATION_BOUNDARY\n';
let ownedController = null;
let ownedZenon = null;
let shutdownRequested = false;

function shutdownOwnedRuntime(exitCode = undefined) {
  shutdownRequested = true;
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

async function main() {
  for (const name of Reflect.ownKeys(process.env)) {
    if (typeof name !== 'string' || !delete process.env[name]) stop('ENVIRONMENT');
  }
  if (Reflect.ownKeys(process.env).length !== 0 || process.argv.length !== 4) stop('ARGUMENTS');
  const label = process.argv[2];
  const root = process.argv[3];
  if ((label !== 'A' && label !== 'B') || !isAbsolute(root) || resolve(root) !== root) {
    stop('ARGUMENTS');
  }
  installTripwires();

  const paymentPayload = readSignedPayment(root);
  const transaction = paymentPayload.payload.transaction;
  const shardId = label === 'A' ? 'payer-shard-a' : 'payer-shard-b';
  const generation = label === 'A' ? 'fixture-generation-a' : 'fixture-generation-b';
  const directory = join(root, 'journal');
  const journal = new SettlementJournal({ directory, allowedRoot: root });
  const zenon = sdk.Zenon.getInstance();
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
          record.transactionHash !== transaction.hash || record.payer !== transaction.address ||
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

  const facilitator = new ExactZenonFacilitator({
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
  const controller = runFixedPayerSettlementChild({
    channel: process,
    facilitator,
    shardId,
    payer: transaction.address,
    generation,
    maxOperations: 16,
  });
  ownedController = controller;
  if (shutdownRequested) shutdownOwnedRuntime(process.exitCode);
  const requestClose = () => {
    shutdownOwnedRuntime();
  };
  process.once('SIGTERM', requestClose);
  try {
    await controller.done;
  } finally {
    process.removeListener('SIGTERM', requestClose);
    try { controller.close(); } catch {}
    try { zenon.clearConnection(); } catch {}
    try { process.stdin.destroy(); } catch {}
    try {
      if (process.connected) process.disconnect();
    } catch { process.exitCode = 1; }
    if (ownedController === controller) ownedController = null;
    if (ownedZenon === zenon) ownedZenon = null;
  }
}

const watchdog = setTimeout(() => shutdownOwnedRuntime(70), 45_000);
void main().catch(() => {
  if (process.exitCode === undefined || process.exitCode === 0) process.exitCode = 1;
  shutdownOwnedRuntime(process.exitCode);
}).finally(() => clearTimeout(watchdog));
