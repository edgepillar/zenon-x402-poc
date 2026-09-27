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

const FIXTURE_NAME = 'signed-payment.json';
const MAX_FIXTURE_BYTES = 16_384;
const MARKER = 'PUBLISH_STUB_REACHED\n';
const PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: '7',
  genesisMomentumHash: '7'.repeat(64),
});

function stop(code = 'TRIPWIRE') {
  const error = new Error(code);
  error.stack = `Error: ${code}`;
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
    const encoded = readFileSync(descriptor);
    if (encoded.length !== state.size) stop('FIXTURE');
    const json = encoded.toString('utf8');
    encoded.fill(0);
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
  const requirements = paymentPayload.accepted;
  const paymentRequired = {
    x402Version: paymentPayload.x402Version,
    resource: paymentPayload.resource,
    accepts: [requirements],
  };
  const transaction = paymentPayload.payload.transaction;
  const directory = join(root, 'journal');
  const journal = new SettlementJournal({ directory, allowedRoot: root });
  const zenon = sdk.Zenon.getInstance();

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

  let publicationCalls = 0;
  zenon.ledger = new Proxy({
    getFrontierMomentum: async () => ({
      version: PROFILE.version,
      chainIdentifier: Number(PROFILE.chainIdentifier),
      height: 10,
      hash: sdk.Hash.digest(Buffer.from('synthetic frontier momentum')),
    }),
    getAccountBlockByHash: async hash => {
      if (hash.toString() !== transaction.hash) stop();
      return null;
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
      await new Promise((accept, reject) => {
        process.stdout.write(MARKER, error => {
          if (error) reject(new Error('STDOUT'));
          else accept();
        });
      });
      await new Promise(() => {});
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
    rpcTimeoutMs: 30_000,
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
  await facilitator.settle(paymentPayload, requirements, paymentRequired);
  stop('SETTLE_RETURNED');
}

const watchdog = setTimeout(() => { process.exitCode = 70; }, 12_000);
void main().catch(() => { process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
