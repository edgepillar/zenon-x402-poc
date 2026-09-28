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
import { ExactZenonFacilitator, preflightZenonPayment } from '../src/zenon-payment.js';
import { runFixedPayerSettlementChild } from '../src/zenon/fixed-payer-settlement-child.js';

const FIXTURE_NAME = 'signed-payment.json';
const STARTUP_FIXTURE_NAME = 'fixed-payer-startup.json';
const MAX_FIXTURE_BYTES = 16_384;
const MAX_STARTUP_FIXTURE_BYTES = 1024;
const STARTUP_MODES = new Set([
  'NORMAL',
  'OWNER_FACADE_SUCCESS',
  'OWNER_FACADE_DUAL_PAYMENT',
  'DELAY_READY',
  'EARLY_STRING',
  'EARLY_MARKER',
  'PARTIAL_STDOUT',
  'RETIRED_V1_STDOUT_BOUNDARY',
  'RETIRED_V1_STDERR_BOUNDARY',
  'DELAY_STDERR_BOUNDARY',
  'DUPLICATE_STARTUP_ACK',
  'MISMATCHED_STARTUP_ACK',
  'RUNTIME_LEGACY_STDOUT',
  'OWNER_MISMATCHED_PUBLICATION_OBSERVATION',
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
const RETIRED_V1_STDOUT_BOUNDARY = 'FIXED_PAYER_STARTUP_STDOUT_BOUNDARY_V1\n';
const RETIRED_V1_STDERR_BOUNDARY = 'FIXED_PAYER_STARTUP_STDERR_BOUNDARY_V1\n';
const PUBLICATION_OBSERVATION_FIELDS = Object.freeze([
  'ipcVersion', 'type', 'correlationId', 'shardId', 'payer', 'generation',
  'sequence', 'operation', 'transaction', 'authorizationKey', 'network',
]);
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

function exactFixtureFields(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some((key, index) =>
    key !== fields[index])) return false;
  return fields.every(field => {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    return descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable === true;
  });
}

function readSignedPaymentFixture(root) {
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
    const parsed = JSON.parse(json);
    if (JSON.stringify(parsed) !== json) stop('FIXTURE');
    const wrapperCandidate = Object.hasOwn(parsed, 'schemaVersion') ||
      Object.hasOwn(parsed, 'payments');
    let kind = 'SINGLE';
    let payments;
    if (wrapperCandidate) {
      if (!exactFixtureFields(parsed, ['schemaVersion', 'payments']) ||
          parsed.schemaVersion !== 1 || !Array.isArray(parsed.payments) ||
          Object.getPrototypeOf(parsed.payments) !== Array.prototype ||
          parsed.payments.length !== 2 ||
          !isDeepStrictEqual(Reflect.ownKeys(parsed.payments), ['0', '1', 'length'])) {
        stop('FIXTURE');
      }
      kind = 'DUAL';
      payments = parsed.payments;
    } else {
      payments = [parsed];
    }
    if (payments.some(paymentPayload =>
      paymentPayload?.accepted?.extra?.paymentFlow !== 'upfront' ||
      !isDeepStrictEqual(paymentPayload.accepted.extra.zenonChain, PROFILE))) {
      stop('FIXTURE');
    }
    return Object.freeze({ kind, payments: Object.freeze(payments) });
  } catch {
    stop('FIXTURE');
  } finally {
    encoded?.fill(0);
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { stop('FIXTURE'); }
    }
  }
}

function fixturePaymentRequired(paymentPayload) {
  return {
    x402Version: paymentPayload.x402Version,
    resource: structuredClone(paymentPayload.resource),
    accepts: [structuredClone(paymentPayload.accepted)],
  };
}

async function validateFixturePayments(fixture, startupMode) {
  const dualMode = startupMode === 'OWNER_FACADE_DUAL_PAYMENT';
  if ((fixture.kind === 'DUAL') !== dualMode ||
      fixture.payments.length !== (dualMode ? 2 : 1)) stop('FIXTURE');
  let entries;
  try {
    entries = await Promise.all(fixture.payments.map(async (paymentPayload, index) => {
      const paymentRequired = fixturePaymentRequired(paymentPayload);
      const preflight = await preflightZenonPayment(
        paymentPayload,
        paymentPayload.accepted,
        paymentRequired,
      );
      return Object.freeze({
        index,
        paymentPayload,
        paymentRequired,
        transaction: paymentPayload.payload.transaction,
        authorizationKey: preflight.authorizationKey,
        transactionHash: preflight.transactionHash,
        payer: preflight.payer,
        network: paymentPayload.accepted.network,
        intentDigest: preflight.intentDigest,
      });
    }));
  } catch {
    stop('FIXTURE');
  }
  const first = entries[0];
  if (entries.some(entry => entry.payer !== first.payer ||
      entry.network !== first.network || entry.network !== 'zenon:testnet')) stop('FIXTURE');
  if (dualMode) {
    const second = entries[1];
    if (!isDeepStrictEqual(first.paymentPayload.accepted, second.paymentPayload.accepted) ||
        isDeepStrictEqual(first.paymentPayload.resource, second.paymentPayload.resource) ||
        first.transaction.height !== 1 ||
        first.transaction.previousHash !== sdk.EMPTY_HASH.toString() ||
        second.transaction.height !== 2 ||
        (second.transaction.previousHash !== first.transactionHash &&
          second.transaction.previousHash !== sdk.EMPTY_HASH.toString()) ||
        first.transactionHash === second.transactionHash ||
        first.authorizationKey === second.authorizationKey ||
        first.intentDigest === second.intentDigest) stop('FIXTURE');
  }
  return Object.freeze(entries);
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
  return message.ipcVersion === 2 && message.type === 'STARTUP_COMMIT' &&
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
    ipcVersion: 2,
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

function writeStartupBoundaries(delayStderr, startupMode) {
  const stdoutBoundary = startupMode === 'RETIRED_V1_STDOUT_BOUNDARY'
    ? RETIRED_V1_STDOUT_BOUNDARY
    : STARTUP_STDOUT_BOUNDARY;
  const stderrBoundary = startupMode === 'RETIRED_V1_STDERR_BOUNDARY'
    ? RETIRED_V1_STDERR_BOUNDARY
    : STARTUP_STDERR_BOUNDARY;
  if (delayStderr) process.stderr.cork();
  process.stdout.write(stdoutBoundary, error => {
    if (error != null && !shutdownRequested) shutdownOwnedRuntime(72);
  });
  process.stderr.write(stderrBoundary, error => {
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

function accountInfo(
  transaction,
  blockCount = transaction.height - 1,
  balance = BigInt(transaction.amount),
  tokenSupply = balance,
) {
  const address = sdk.Address.parse(transaction.address);
  const tokenStandard = sdk.TokenStandard.parse(transaction.tokenStandard);
  const token = new sdk.Token(
    'Synthetic', 'SYN', '', tokenSupply, 8, address, tokenStandard, tokenSupply,
    false, false, false,
  );
  return new sdk.AccountInfo(address, blockCount, {
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

    const fixture = readSignedPaymentFixture(root);
    const transaction = fixture.payments[0].payload.transaction;
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
    const fixtureEntries = await validateFixturePayments(fixture, startupMode);
    const paymentPayload = fixtureEntries[0].paymentPayload;
    const transactions = fixtureEntries.map(entry => entry.transaction);
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
    let activeSettleOperation = null;
    let publicationInterception = null;
    const observedOperationTokens = new WeakSet();
    const accountObservationTokens = new WeakSet();
    const frontierObservationTokens = new WeakSet();
    const initialBalance = transactions.reduce(
      (total, candidate) => total + BigInt(candidate.amount),
      0n,
    );
    const requireActiveOperation = () => {
      if (activeSettleOperation === null) stop('SDK_OPERATION');
      return activeSettleOperation;
    };
    const recordMatchesEntry = (record, entry) => record !== undefined &&
      record.authorizationKey === entry.authorizationKey &&
      record.transactionHash === entry.transactionHash &&
      record.payer === entry.payer &&
      record.intentDigest === entry.intentDigest &&
      isDeepStrictEqual(record.signedAccountBlock, entry.transaction);
    const initializeFacilitator = () => {
      if (activeFacilitator !== null) return activeFacilitator;
      zenon = sdk.Zenon.getInstance();
      ownedZenon = zenon;
      let publishedCount = 0;

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
        getByZts: async tokenStandard => {
          const operation = requireActiveOperation();
          if (tokenStandard.toString() !== operation.entry.transaction.tokenStandard) stop();
          return { tokenStandard };
        },
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
          const operation = requireActiveOperation();
          if (hash.toString() !== operation.entry.transactionHash) stop();
          return operation.entry.index < publishedCount
            ? observedBlock(operation.entry.transaction)
            : null;
        },
        getAccountInfoByAddress: async address => {
          const operation = requireActiveOperation();
          if (address.toString() !== operation.entry.payer) stop();
          accountObservationTokens.add(operation.token);
          const spent = transactions.slice(0, publishedCount).reduce(
            (total, candidate) => total + BigInt(candidate.amount),
            0n,
          );
          const balance = initialBalance - spent;
          if (balance < 0n) stop('ACCOUNT_STATE');
          return accountInfo(transactions[0], publishedCount, balance, initialBalance);
        },
        getFrontierAccountBlock: async address => {
          const operation = requireActiveOperation();
          if (address.toString() !== operation.entry.payer) stop();
          frontierObservationTokens.add(operation.token);
          return publishedCount === 0 ? null : observedBlock(transactions[publishedCount - 1]);
        },
        getUnconfirmedBlocksByAddress: async (address, page, pageSize) => {
          const operation = requireActiveOperation();
          if (address.toString() !== operation.entry.payer || page !== 0 || pageSize !== 50) {
            stop();
          }
          return { count: 0, list: [] };
        },
        publishRawTransaction: async block => {
          const operation = activeSettleOperation;
          if (operation === null || observedOperationTokens.has(operation.token) ||
              operation.entry.index !== publishedCount ||
              !isDeepStrictEqual(block.toJson(), operation.entry.transaction)) {
            stop('PUBLICATION_OPERATION');
          }
          observedOperationTokens.add(operation.token);
          const durable = await new SettlementJournal({
            directory,
            allowedRoot: root,
            existingOnly: true,
          }).list({ includeTombstones: true });
          const expectedEntries = fixtureEntries.slice(0, operation.entry.index + 1);
          const record = durable.records.find(candidate =>
            candidate.authorizationKey === operation.entry.authorizationKey &&
            candidate.transactionHash === operation.entry.transactionHash);
          if (durable.records.length !== expectedEntries.length ||
              durable.tombstones.length !== 0 ||
              expectedEntries.some(entry => !durable.records.some(candidate =>
                recordMatchesEntry(candidate, entry))) ||
              !recordMatchesEntry(record, operation.entry) ||
              record.evidenceState !== 'VALIDATED' ||
              operation.entry.network !== paymentPayload.accepted.network) stop('DURABILITY');
          const previous = operation.entry.index === 0
            ? null
            : fixtureEntries[operation.entry.index - 1];
          if ((previous === null &&
                (operation.entry.transaction.height !== 1 ||
                  operation.entry.transaction.previousHash !== sdk.EMPTY_HASH.toString())) ||
              (previous !== null &&
                (operation.entry.transaction.height !== previous.transaction.height + 1 ||
                  operation.entry.transaction.previousHash !== previous.transactionHash))) {
            stop('PUBLICATION_FRONTIER');
          }
          if (startupMode === 'OWNER_MISMATCHED_PUBLICATION_OBSERVATION') {
            if (publicationInterception !== null) stop('PUBLICATION_INTERCEPTION');
            publicationInterception = {
              consumed: false,
              correlationId: `${generation}:${shardId}:1`,
              shardId,
              payer: operation.entry.payer,
              generation,
              mismatchedGeneration: label === 'A'
                ? 'fixture-generation-b'
                : 'fixture-generation-a',
              sequence: 1,
              transaction: operation.entry.transactionHash,
              authorizationKey: operation.entry.authorizationKey,
              network: operation.entry.network,
            };
          }
          try {
            await operation.observePublication();
          } finally {
            if (startupMode === 'OWNER_MISMATCHED_PUBLICATION_OBSERVATION') {
              if (publicationInterception?.consumed !== true) stop('PUBLICATION_INTERCEPTION');
              publicationInterception = null;
            }
          }
          if (activeSettleOperation !== operation) stop('PUBLICATION_OPERATION');
          if (startupMode !== 'OWNER_FACADE_SUCCESS' &&
              startupMode !== 'OWNER_FACADE_DUAL_PAYMENT' &&
              startupMode !== 'OWNER_MISMATCHED_PUBLICATION_OBSERVATION') {
            await waitForRelease();
          }
          if (activeSettleOperation !== operation || publishedCount !== operation.entry.index) {
            stop('PUBLICATION_OPERATION');
          }
          publishedCount += 1;
        },
      }, { get: (target, name) => Reflect.has(target, name) ? target[name] : stop });
      zenon.subscribe = new Proxy({
        toAccountBlocksByAddress: async address => {
          const operation = requireActiveOperation();
          if (address.toString() !== operation.entry.payer) stop();
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
      async settle(paymentPayload, requirements, paymentRequired, observePublication) {
        if (arguments.length !== 4 || typeof observePublication !== 'function' ||
            !Object.isFrozen(observePublication) || observePublication.length !== 0 ||
            activeSettleOperation !== null) stop('PUBLICATION_CAPABILITY');
        const entry = fixtureEntries.find(candidate =>
          isDeepStrictEqual(paymentPayload, candidate.paymentPayload) &&
          isDeepStrictEqual(requirements, candidate.paymentPayload.accepted) &&
          isDeepStrictEqual(paymentRequired, candidate.paymentRequired));
        if (entry === undefined) stop('PAYMENT_FIXTURE');
        const operation = Object.freeze({
          token: Object.freeze({}),
          observePublication,
          entry,
        });
        activeSettleOperation = operation;
        try {
          const result = await invokeFacilitator('settle', [
            paymentPayload,
            requirements,
            paymentRequired,
          ]);
          const staleSuccessor = entry.index === 1 &&
            entry.transaction.previousHash === sdk.EMPTY_HASH.toString();
          if (staleSuccessor) {
            if (!accountObservationTokens.has(operation.token) ||
                !frontierObservationTokens.has(operation.token) ||
                observedOperationTokens.has(operation.token) || result.success !== false ||
                result.errorReason !== 'stale_frontier' || result.state !== 'VALIDATED' ||
                result.authorizationKey !== entry.authorizationKey ||
                result.transaction !== entry.transactionHash || result.payer !== entry.payer ||
                result.network !== entry.network || result.retrySamePayment !== false ||
                result.deliveryState !== 'NONE') stop('STALE_FRONTIER_FENCE');
          } else if (startupMode === 'OWNER_FACADE_DUAL_PAYMENT' &&
              result.success === true && result.deliveryState === 'NONE' &&
              (!accountObservationTokens.has(operation.token) ||
                !frontierObservationTokens.has(operation.token) ||
                !observedOperationTokens.has(operation.token))) {
            stop('EVOLVING_FRONTIER');
          }
          return result;
        } finally {
          if (activeSettleOperation === operation) activeSettleOperation = null;
        }
      },
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
    writeStartupBoundaries(delayedStderr, startupMode);
    const sendDescriptor = Object.getOwnPropertyDescriptor(process, 'send');
    if (!sendDescriptor || typeof sendDescriptor.value !== 'function') stop('IPC_CHANNEL');
    const originalSend = sendDescriptor.value;
    const fixtureSend = function fixtureSend(...args) {
      if (this !== process || publicationInterception === null) {
        return Reflect.apply(originalSend, this, args);
      }
      const [frame] = args;
      let parsed;
      try {
        parsed = JSON.parse(frame);
      } catch {
        stop('PUBLICATION_INTERCEPTION');
      }
      const expected = publicationInterception;
      if (expected.consumed || JSON.stringify(parsed) !== frame ||
          !isDeepStrictEqual(Object.keys(parsed), PUBLICATION_OBSERVATION_FIELDS) ||
          parsed.ipcVersion !== 2 || parsed.type !== 'PUBLICATION_OBSERVED' ||
          parsed.correlationId !== expected.correlationId ||
          parsed.shardId !== expected.shardId || parsed.payer !== expected.payer ||
          parsed.generation !== expected.generation || parsed.sequence !== expected.sequence ||
          parsed.operation !== 'SETTLE' || parsed.transaction !== expected.transaction ||
          parsed.authorizationKey !== expected.authorizationKey ||
          parsed.network !== expected.network ||
          expected.mismatchedGeneration === expected.generation) {
        stop('PUBLICATION_INTERCEPTION');
      }
      expected.consumed = true;
      args[0] = JSON.stringify({
        ...parsed,
        generation: expected.mismatchedGeneration,
      });
      return Reflect.apply(originalSend, this, args);
    };
    let controller;
    if (startupMode === 'OWNER_MISMATCHED_PUBLICATION_OBSERVATION') {
      Object.defineProperty(process, 'send', { ...sendDescriptor, value: fixtureSend });
    }
    try {
      controller = runFixedPayerSettlementChild({
        channel: process,
        facilitator,
        shardId,
        payer: transaction.address,
        generation,
        maxOperations: 16,
      });
    } finally {
      if (startupMode === 'OWNER_MISMATCHED_PUBLICATION_OBSERVATION') {
        Object.defineProperty(process, 'send', sendDescriptor);
      }
    }
    ownedController = controller;
    bootstrap.handoff();
    if (ownedBootstrap === bootstrap) ownedBootstrap = null;
    if (shutdownRequested) shutdownOwnedRuntime(process.exitCode);
    if (!shutdownRequested) {
      await sendStartupFrame(committedFrame(descriptor), 'STARTUP_COMMITTED_FAILED');
    }
    if (!shutdownRequested && startupMode === 'RUNTIME_LEGACY_STDOUT') {
      await writeStartupOutput(PUBLICATION_MARKER);
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
