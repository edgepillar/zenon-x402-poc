import { join } from 'node:path';

import {
  createServiceCreditExternalHolderGrantDescriptorHandoff,
} from '../../src/service-credit-external-holder-grant-descriptor-handoff.js';
import {
  createZenonDurableHttpComposition,
} from '../../src/service-credit-zenon-durable-http-composition.js';
import {
  openZenonFundingObserverSqliteStore,
} from '../../src/service-credit-zenon-funding-observer-sqlite-store.js';
import { ServiceCreditSqliteStore } from '../../src/service-credit-sqlite-store.js';

const NOW = 2_000_000_000_000;
const ORIGIN = 'https://service.example';
const IPC_VERSION = 1;
const MAX_COMMANDS = 4;
const UNAVAILABLE = 'SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_UNAVAILABLE';

let owner = null;
let handoff = null;
let ownerReads = 0;
let commands = 0;
let busy = false;
let stopping = false;

function exactObject(value, keys) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Reflect.ownKeys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}

function send(message) {
  return new Promise((resolve, reject) => {
    if (typeof process.send !== 'function') {
      reject(new Error('CHILD_IPC_UNAVAILABLE'));
      return;
    }
    process.send(message, error => {
      if (error) reject(new Error('CHILD_IPC_FAILED'));
      else resolve();
    });
  });
}

async function stop(type, exitCode) {
  if (stopping) return;
  stopping = true;
  try { await owner?.close(); } catch { exitCode = 1; }
  try { await send({ ipcVersion: IPC_VERSION, type }); } catch { exitCode = 1; }
  process.exitCode = exitCode;
  if (process.connected) process.disconnect();
}

async function command(message) {
  if (
    busy
    || stopping
    || commands >= MAX_COMMANDS
    || message?.ipcVersion !== IPC_VERSION
  ) throw new Error('CHILD_COMMAND_INVALID');
  busy = true;
  commands += 1;
  try {
    if (exactObject(message, ['ipcVersion', 'type']) && message.type === 'ISSUE') {
      await send({ ipcVersion: IPC_VERSION, type: 'CHALLENGE', challenge: handoff.issueChallenge() });
      return;
    }
    if (exactObject(message, ['ipcVersion', 'type', 'redemption']) && message.type === 'REDEEM') {
      try {
        const descriptor = handoff.redeem(message.redemption);
        await send({ ipcVersion: IPC_VERSION, type: 'REDEEMED', descriptor, ownerReads });
      } catch (error) {
        if (error?.code !== UNAVAILABLE) throw error;
        await send({ ipcVersion: IPC_VERSION, type: 'UNAVAILABLE', ownerReads });
      }
      return;
    }
    if (exactObject(message, ['ipcVersion', 'type']) && message.type === 'STOP') {
      await stop('STOPPED', 0);
      return;
    }
    throw new Error('CHILD_COMMAND_INVALID');
  } finally {
    busy = false;
  }
}

async function start(message) {
  if (!exactObject(message, [
    'ipcVersion',
    'type',
    'directory',
    'observerRecordKey',
    'authorityRecord',
    'activationInput',
    'fundingTerms',
    'durableExecution',
    'selection',
  ]) || message.ipcVersion !== IPC_VERSION || message.type !== 'START') {
    throw new Error('CHILD_START_INVALID');
  }
  const serviceCreditStore = ServiceCreditSqliteStore.openExisting({
    databasePath: join(message.directory, 'service.sqlite'),
    allowedRoot: message.directory,
    deriveCost: () => 2,
    now: () => NOW,
  });
  const fundingObserverStore = openZenonFundingObserverSqliteStore({
    databasePath: join(message.directory, 'observer.sqlite'),
    allowedRoot: message.directory,
    expectedRecordKey: message.observerRecordKey,
    authorityRecord: message.authorityRecord,
  });
  owner = createZenonDurableHttpComposition({
    serviceCreditStore,
    fundingObserverStore,
    authorityRecord: message.authorityRecord,
    deriveFundingTerms: () => structuredClone(message.fundingTerms),
    now: () => NOW,
    durableExecution: message.durableExecution,
    execute: () => ({ resultCode: 'runtime.resource.delivered' }),
    deadlineRuntime: {
      monotonicNowNs: () => 0n,
      schedule: () => Object.freeze({}),
      cancel: () => undefined,
    },
  });
  await owner.start(message.activationInput);
  handoff = createServiceCreditExternalHolderGrantDescriptorHandoff({
    origin: ORIGIN,
    selection: message.selection,
    challengeLifetimeMs: 1_000,
    now: () => NOW,
    getActiveGrantDescriptorForSelection: requestedSelection => {
      ownerReads += 1;
      return owner.getActiveGrantDescriptorForSelection(requestedSelection);
    },
  });
  process.on('message', next => { void command(next).catch(() => stop('FAILED', 1)); });
  await send({ ipcVersion: IPC_VERSION, type: 'ACTIVE' });
}

process.once('message', message => { void start(message).catch(() => stop('FAILED', 1)); });
process.once('disconnect', () => {
  if (!stopping) void stop('FAILED', 1);
});
