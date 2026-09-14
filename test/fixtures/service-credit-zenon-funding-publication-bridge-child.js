import { existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import * as sdk from 'znn-typescript-sdk';

import { canonicalJson } from '../../src/canonical.js';
import {
  createZenonFundingPublicationBridge,
} from '../../src/service-credit-zenon-funding-publication-bridge.js';
import {
  deriveZenonFundingIntakeSelectionKey,
  openZenonFundingIntakeSqliteStore,
} from '../../src/service-credit-zenon-funding-intake-sqlite-store.js';
import { createZenonFundingIntake } from '../../src/service-credit-zenon-funding-intake.js';
import { ServiceCreditSqliteStore } from '../../src/service-credit-sqlite-store.js';
import {
  DELIVERY_STATES,
  EVIDENCE_STATES,
  SettlementJournal,
} from '../../src/settlement-journal.js';
import {
  ExactZenonFacilitator,
  preflightZenonPayment,
} from '../../src/zenon-payment.js';

function fail(code) {
  const error = new Error(code);
  error.code = code;
  error.stack = `Error: ${code}`;
  throw error;
}

function check(value, code) {
  if (!value) fail(code);
}

function safeErrorCode(error) {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
    return descriptor && Object.hasOwn(descriptor, 'value')
      && typeof descriptor.value === 'string'
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

function privateMode(path, expected) {
  try {
    const stat = lstatSync(path, { bigint: true });
    return !stat.isSymbolicLink() && (stat.mode & 0o777n) === expected;
  } catch {
    return false;
  }
}

function receiveInput() {
  return new Promise(resolve => process.once('message', resolve));
}

function send(message) {
  return new Promise((resolve, reject) => {
    if (typeof process.send !== 'function') {
      reject(new Error('BRIDGE_CHILD_IPC_UNAVAILABLE'));
      return;
    }
    process.send(message, error => {
      if (error) reject(new Error('BRIDGE_CHILD_IPC_FAILED'));
      else resolve();
    });
  });
}

function observedBlock(transaction) {
  const block = sdk.AccountBlockTemplate.fromJson(transaction);
  block.publicKey = Buffer.from(transaction.publicKey, 'base64');
  block.signature = Buffer.from(transaction.signature, 'base64');
  block.confirmationDetail = {
    numConfirmations: 3,
    momentumHeight: 11,
    momentumHash: sdk.Hash.digest(Buffer.from('kill-reopen-inclusion')),
    momentumTimestamp: 1,
  };
  return block;
}

function accountInfo(address) {
  const token = new sdk.Token(
    'Synthetic',
    'SYN',
    '',
    1n,
    8,
    address,
    sdk.ZNN_ZTS,
    1n,
    false,
    false,
    false,
  );
  return new sdk.AccountInfo(address, 0, {
    [sdk.ZNN_ZTS.toString()]: new sdk.BalanceInfoListItem(token, 1n),
  });
}

function installFakePublisher(journal, originalPreflight, originalPayment, substitutePayment) {
  const zenon = sdk.Zenon.getInstance();
  const original = {
    initialize: zenon.initialize,
    clearConnection: zenon.clearConnection,
    ledger: zenon.ledger,
    stats: zenon.stats,
    subscribe: zenon.subscribe,
    embedded: zenon.embedded,
    hadClient: Object.hasOwn(zenon, 'client'),
    client: zenon.client,
    chainIdentifier: sdk.Zenon.getChainIdentifier(),
    networkId: sdk.Zenon.getNetworkID(),
  };
  const state = {
    durableBeforePublication: false,
    exactPaymentPublished: false,
    lookupOnlyOriginal: true,
    publicationCount: 0,
    published: false,
    substitutePublished: false,
  };
  const included = observedBlock(originalPayment.payload.transaction);
  zenon.initialize = async () => { zenon.client = { synthetic: true }; };
  zenon.clearConnection = () => { zenon.client = undefined; };
  zenon.stats = {
    networkInfo: async () => ({
      numPeers: 1,
      self: { publicKey: 'synthetic-node-key', ip: 'loopback' },
      peers: [],
    }),
    syncInfo: async () => ({
      state: sdk.SyncState.SyncDone,
      currentHeight: 10,
      targetHeight: 10,
    }),
  };
  zenon.embedded = {
    token: { getByZts: async tokenStandard => ({ tokenStandard }) },
  };
  zenon.ledger = {
    getFrontierMomentum: async () => ({
      chainIdentifier: Number(originalPreflight.chainProfile.chainIdentifier),
      height: 10,
      hash: sdk.Hash.digest(Buffer.from('kill-reopen-frontier')),
    }),
    getAccountBlockByHash: async hash => {
      if (hash.toString() !== originalPreflight.transactionHash) {
        state.lookupOnlyOriginal = false;
        return null;
      }
      return state.published ? included : null;
    },
    getAccountInfoByAddress: async address => accountInfo(address),
    getFrontierAccountBlock: async () => null,
    getUnconfirmedBlocksByAddress: async () => ({ count: 0, list: [] }),
    publishRawTransaction: async block => {
      state.publicationCount += 1;
      const published = block.toJson();
      const durable = await journal.get(
        originalPreflight.authorizationKey,
        originalPreflight.transactionHash,
      );
      state.durableBeforePublication = durable?.evidenceState === EVIDENCE_STATES.VALIDATED
        && canonicalJson(durable.signedAccountBlock)
          === canonicalJson(originalPayment.payload.transaction);
      state.exactPaymentPublished = canonicalJson(published)
        === canonicalJson(originalPayment.payload.transaction);
      state.substitutePublished = canonicalJson(published)
        === canonicalJson(substitutePayment.payload.transaction);
      state.published = true;
    },
  };
  zenon.subscribe = {
    toAccountBlocksByAddress: async () => ({ onNotification() {} }),
  };
  const restore = () => {
    zenon.initialize = original.initialize;
    zenon.clearConnection = original.clearConnection;
    zenon.ledger = original.ledger;
    zenon.stats = original.stats;
    zenon.subscribe = original.subscribe;
    zenon.embedded = original.embedded;
    if (original.hadClient) zenon.client = original.client;
    else delete zenon.client;
    sdk.Zenon.setChainID(original.chainIdentifier);
    sdk.Zenon.setNetworkID(original.networkId);
  };
  return { restore, state };
}

async function expectCode(operation, expected) {
  let actual;
  try { await operation(); } catch (error) { actual = safeErrorCode(error); }
  check(actual === expected, 'BRIDGE_CHILD_UNEXPECTED_ERROR_CODE');
}

async function bindAndWait(input) {
  check(input?.ipcVersion === 1, 'BRIDGE_CHILD_INPUT_INVALID');
  const serviceStore = ServiceCreditSqliteStore.openExisting({
    databasePath: input.serviceDatabasePath,
    allowedRoot: input.directory,
    deriveCost: () => 2,
    now: () => input.now,
  });
  const intakeStore = openZenonFundingIntakeSqliteStore(input.intakeConfiguration);
  const owner = createZenonFundingIntake({
    store: intakeStore,
    serviceCreditStore: serviceStore,
    authorityRecord: input.authorityRecord,
    deriveFundingTerms: () => fail('BRIDGE_BIND_CHILD_MUST_NOT_REISSUE'),
    now: () => input.now,
    observerRoot: input.directory,
    observerCatchUp: input.observerCatchUp,
  });
  const bound = await owner.bind(input.originalPayment);
  check(bound.status === 'BOUND', 'BRIDGE_CHILD_BOUND_NOT_COMMITTED');
  await expectCode(
    () => owner.bind(input.substitutePayment),
    'ZENON_FUNDING_INTAKE_CONFLICT',
  );

  const verificationStore = openZenonFundingIntakeSqliteStore(input.intakeConfiguration);
  const selectionKey = deriveZenonFundingIntakeSelectionKey({
    ledgerDomain: verificationStore.ledgerDomain,
    selection: input.selection,
  });
  const retained = verificationStore.loadBySelectionKey(selectionKey);
  const exactPaymentRetained = retained?.status === 'BOUND'
    && canonicalJson(retained.binding?.publication?.paymentPayload)
      === canonicalJson(input.originalPayment);
  verificationStore.close();
  const sqlitePrivate = privateMode(input.serviceDatabasePath, 0o600n)
    && privateMode(input.intakeConfiguration.databasePath, 0o600n)
    && privateMode(join(input.directory, bound.observerFileName), 0o600n);
  check(exactPaymentRetained, 'BRIDGE_CHILD_REOPENED_BOUND_MISMATCH');
  check(sqlitePrivate, 'BRIDGE_CHILD_SQLITE_NOT_PRIVATE');
  check(!existsSync(input.journalDirectory), 'BRIDGE_CHILD_JOURNAL_CREATED_BEFORE_KILL');
  check(serviceStore.load().state.grants.length === 0, 'BRIDGE_CHILD_CREDIT_ACTIVATED');

  await send({
    ipcVersion: 1,
    type: 'BOUND_COMMITTED',
    exactPaymentRetained,
    journalAbsent: true,
    sqlitePrivate,
    substituteRejected: true,
  });
  await new Promise(resolve => process.once('disconnect', resolve));
  fail('BRIDGE_BIND_CHILD_PARENT_DISCONNECTED');
}

async function recoverAndSettle(input) {
  check(input?.ipcVersion === 1, 'BRIDGE_CHILD_INPUT_INVALID');
  const intakeStore = openZenonFundingIntakeSqliteStore(input.intakeConfiguration);
  const journal = new SettlementJournal({
    directory: input.journalDirectory,
    allowedRoot: input.directory,
  });
  let originalBridge;
  let fake;
  let report;
  try {
    const initialJournal = await journal.load();
    check(initialJournal.records.length === 0, 'BRIDGE_CHILD_JOURNAL_NOT_EMPTY');
    const journalPrivate = privateMode(input.journalDirectory, 0o700n)
      && privateMode(join(input.journalDirectory, 'settlement-journal.json'), 0o600n)
      && privateMode(join(input.journalDirectory, '.settlement-journal.initialized'), 0o600n);
    check(journalPrivate, 'BRIDGE_CHILD_JOURNAL_NOT_PRIVATE');
    const originalPreflight = await preflightZenonPayment(
      input.originalPayment,
      input.paymentRequired.accepts[0],
      input.paymentRequired,
    );
    const substitutePreflight = await preflightZenonPayment(
      input.substitutePayment,
      input.paymentRequired.accepts[0],
      input.paymentRequired,
    );
    check(
      originalPreflight.transactionHash !== substitutePreflight.transactionHash,
      'BRIDGE_CHILD_SUBSTITUTE_NOT_DISTINCT',
    );
    fake = installFakePublisher(
      journal,
      originalPreflight,
      input.originalPayment,
      input.substitutePayment,
    );
    const facilitator = new ExactZenonFacilitator({
      journal,
      environment: {
        ZENON_LIVE_ACK: 'I_UNDERSTAND_TESTNET_ONLY',
        ZENON_NETWORK_ID: '3',
        ZENON_RPC_URL: 'ws://rpc.invalid',
      },
      rpcTimeoutMs: 100,
      authenticateChainProfile: async () => structuredClone(originalPreflight.chainProfile),
    });
    const unboundBridge = createZenonFundingPublicationBridge({
      store: intakeStore,
      facilitator,
      selection: input.unboundSelection,
    });
    await expectCode(
      () => unboundBridge.recover(),
      'ZENON_FUNDING_PUBLICATION_BRIDGE_BOUND_NOT_FOUND',
    );
    await expectCode(
      () => unboundBridge.settleBound(),
      'ZENON_FUNDING_PUBLICATION_BRIDGE_NOT_RECOVERED',
    );
    check(fake.state.publicationCount === 0, 'BRIDGE_CHILD_UNBOUND_PUBLISHED');
    check((await journal.load()).records.length === 0, 'BRIDGE_CHILD_UNBOUND_JOURNALED');
    await unboundBridge.close();

    originalBridge = createZenonFundingPublicationBridge({
      store: intakeStore,
      facilitator,
      selection: input.selection,
    });
    const recovered = await originalBridge.recover();
    check(recovered.status === 'RECOVERED', 'BRIDGE_CHILD_BOUND_NOT_RECOVERED');
    const result = await originalBridge.settleBound();
    const finalJournal = await journal.load();
    const retained = finalJournal.records[0];
    const exactPaymentRetained = finalJournal.records.length === 1
      && canonicalJson(retained?.signedAccountBlock)
        === canonicalJson(input.originalPayment.payload.transaction);
    check(result.status === 'INCLUDED', 'BRIDGE_CHILD_SETTLEMENT_NOT_INCLUDED');
    check(
      result.evidenceState === EVIDENCE_STATES.MOMENTUM_INCLUDED,
      'BRIDGE_CHILD_SETTLEMENT_EVIDENCE_INVALID',
    );
    check(
      retained?.deliveryState === DELIVERY_STATES.NONE,
      'BRIDGE_CHILD_DELIVERY_STATE_CHANGED',
    );
    report = {
      ipcVersion: 1,
      type: 'RECOVERY_COMPLETE',
      durableBeforePublication: fake.state.durableBeforePublication,
      evidenceState: result.evidenceState,
      exactPaymentRetained,
      exactPaymentPublished: fake.state.exactPaymentPublished,
      journalPrivate,
      journalRecords: finalJournal.records.length,
      lookupOnlyOriginal: fake.state.lookupOnlyOriginal,
      publicationCount: fake.state.publicationCount,
      status: result.status,
      substitutePublished: fake.state.substitutePublished,
      unboundRecoveryRejected: true,
      unboundSettleRejected: true,
    };
  } finally {
    try { await originalBridge?.close(); } catch {}
    try { fake?.restore(); } catch {}
    try { intakeStore.close(); } catch {}
  }
  await send(report);
  if (process.connected) process.disconnect();
}

async function main() {
  const mode = process.argv[2];
  const input = await receiveInput();
  if (mode === 'bind') return bindAndWait(input);
  if (mode === 'recover') return recoverAndSettle(input);
  fail('BRIDGE_CHILD_MODE_INVALID');
}

if (typeof process.send === 'function') {
  try {
    await main();
  } catch (error) {
    const code = safeErrorCode(error);
    try {
      await send({
        ipcVersion: 1,
        type: 'FAILED',
        code: /^[A-Z0-9_]+$/.test(code ?? '') ? code : 'BRIDGE_CHILD_FAILED',
      });
    } catch {}
    process.exit(1);
  }
}
