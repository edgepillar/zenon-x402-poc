import { readFileSync } from 'node:fs';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import * as sdk from 'znn-typescript-sdk';
import { SettlementJournal } from '../src/settlement-journal.js';
import { ExactZenonFacilitator } from '../src/zenon-payment.js';

const FIXTURE = new URL('../test/fixtures/phase2a-exact-client-goldens.v1.json', import.meta.url);
const COUNT_FIELDS = ['initialize', 'network', 'sync', 'momentum', 'authenticate',
  'asset', 'frontier', 'unconfirmed', 'clear'];
const RELEASE = 'RELEASE\n';
const tripwire = () => { throw new Error('TRIPWIRE'); };

for (const [owner, methods] of [
  [net, ['connect', 'createConnection']], [tls, ['connect']],
  [http, ['request', 'get']], [https, ['request', 'get']],
  [dns, ['lookup', 'resolve']],
]) {
  for (const method of methods) owner[method] = tripwire;
}
globalThis.fetch = tripwire;
globalThis.WebSocket = class NetworkTripwire { constructor() { tripwire(); } };

for (const owner of [sdk.KeyStore, sdk.KeyStore.prototype, sdk.KeyPair, sdk.KeyPair.prototype]) {
  for (const name of Object.getOwnPropertyNames(owner)) {
    const descriptor = Object.getOwnPropertyDescriptor(owner, name);
    if (name !== 'constructor' && typeof descriptor?.value === 'function') {
      Object.defineProperty(owner, name, { ...descriptor, value: tripwire });
    }
  }
}

function waitForRelease() {
  return new Promise((resolve, reject) => {
    let input = '';
    const finish = code => {
      clearTimeout(watchdog);
      process.stdin.removeAllListeners();
      if (code === undefined) resolve();
      else reject(new Error(code));
    };
    const watchdog = setTimeout(() => finish('WATCHDOG'), 10_000);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      input += chunk;
      if (input.length > RELEASE.length || !RELEASE.startsWith(input)) {
        finish('CONTROL');
      } else if (input === RELEASE) {
        finish();
      }
    });
    process.stdin.on('end', () => {
      if (input !== RELEASE) finish('CONTROL');
    });
    process.stdin.on('error', () => finish('CONTROL'));
  });
}

async function main() {
  const label = process.argv.length === 3 ? process.argv[2] : undefined;
  if (label !== 'A' && label !== 'B') tripwire();
  const manifest = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const scenario = manifest.scenarios?.[label];
  if (manifest.oracle?.sdkVersion !== '1.0.5' || scenario?.id !== label) tripwire();
  const paymentPayload = scenario.expected.paymentPayload;
  const requirements = paymentPayload.accepted;
  const paymentRequired = {
    x402Version: paymentPayload.x402Version,
    resource: paymentPayload.resource,
    accepts: [requirements],
  };
  const counters = Object.fromEntries(COUNT_FIELDS.map(field => [field, 0]));
  const zenon = sdk.Zenon.getInstance();
  zenon.initialize = async () => {
    counters.initialize += 1;
    zenon.client = Object.freeze({ synthetic: true });
  };
  zenon.clearConnection = () => {
    counters.clear += 1;
    zenon.client = undefined;
  };
  zenon.send = tripwire;
  zenon.prepareBlock = tripwire;
  zenon.stats = new Proxy({
    networkInfo: async () => {
      counters.network += 1;
      return { numPeers: 1, self: { publicKey: 'synthetic', ip: 'synthetic' }, peers: [] };
    },
    syncInfo: async () => {
      counters.sync += 1;
      const height = scenario.inputs.readinessMomentum.height;
      return { state: sdk.SyncState.SyncDone, currentHeight: height, targetHeight: height };
    },
  }, { get: (target, name) => Reflect.has(target, name) ? target[name] : tripwire });
  zenon.embedded = new Proxy({ token: new Proxy({
    getByZts: async tokenStandard => {
      counters.asset += 1;
      return { tokenStandard };
    },
  }, { get: (target, name) => Reflect.has(target, name) ? target[name] : tripwire }) }, {
    get: (target, name) => Reflect.has(target, name) ? target[name] : tripwire,
  });
  zenon.ledger = new Proxy({
    getFrontierMomentum: async () => {
      counters.momentum += 1;
      return scenario.inputs.readinessMomentum;
    },
    getFrontierAccountBlock: async () => {
      counters.frontier += 1;
      if (counters.frontier !== 1) tripwire();
      process.stdout.write('AT_FRONTIER\n');
      await waitForRelease();
      return scenario.inputs.frontierAccountBlock;
    },
    getUnconfirmedBlocksByAddress: async () => {
      counters.unconfirmed += 1;
      return { count: 0, list: [] };
    },
    publishRawTransaction: tripwire,
  }, { get: (target, name) => Reflect.has(target, name) ? target[name] : tripwire });
  zenon.subscribe = new Proxy({}, { get: tripwire });

  const journal = new SettlementJournal();
  for (const name of Object.getOwnPropertyNames(SettlementJournal.prototype)) {
    const descriptor = Object.getOwnPropertyDescriptor(SettlementJournal.prototype, name);
    if (name !== 'constructor' && typeof descriptor?.value === 'function') {
      Object.defineProperty(journal, name, { ...descriptor, value: tripwire });
    }
  }
  const facilitator = new ExactZenonFacilitator({
    journal,
    rpcTimeoutMs: 12_000,
    environment: {
      ZENON_LIVE_ACK: 'I_UNDERSTAND_TESTNET_ONLY',
      ZENON_NETWORK_ID: '3',
      ZENON_RPC_URL: 'ws://rpc.invalid',
    },
    authenticateChainProfile: async () => {
      counters.authenticate += 1;
      return structuredClone(scenario.inputs.chainProfile);
    },
  });
  const result = await facilitator.verify(paymentPayload, requirements, paymentRequired);
  const expected = label === 'A' ? [1, 1, 1, 1, 1, 0, 1, 2, 1] : [1, 1, 1, 1, 1, 1, 1, 2, 1];
  const actual = COUNT_FIELDS.map(field => counters[field]);
  if (result.isValid !== true || result.payer !== paymentPayload.payload.transaction.address ||
      actual.some((value, index) => value !== expected[index])) tripwire();
  process.stdout.write(`RESULT ${actual.join(',')}\n`);
}

main().catch(() => {
  process.stdout.write('FAILED\n');
  process.exitCode = 1;
});
