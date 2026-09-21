import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodeTest from 'node:test';
import * as sdk from 'znn-typescript-sdk';

import { canonicalJson, paymentIntentDigest } from '../src/canonical.js';
import { deriveServiceCreditResourceBinding } from '../src/service-credit-activation.js';
import { deriveServiceCreditCapabilityCommitment } from '../src/service-credit-capability.js';
import { createDurableServiceCreditHttpSession } from '../src/service-credit-durable-http-session.js';
import { SERVICE_CREDIT_HTTP_PATH } from '../src/service-credit-http.js';
import { SERVICE_CREDIT_MODEL_VERSION } from '../src/service-credit-model.js';
import { ServiceCreditSqliteStore } from '../src/service-credit-sqlite-store.js';
import { createZenonFundingComposition } from '../src/service-credit-zenon-funding-composition.js';
import { createZenonFundingIntake } from '../src/service-credit-zenon-funding-intake.js';
import {
  createZenonFundingIntakeSqliteStore,
  deriveZenonFundingIntakeSelectionKey,
  openZenonFundingIntakeSqliteStore,
} from '../src/service-credit-zenon-funding-intake-sqlite-store.js';
import { createZenonFundingObservationProducer } from '../src/service-credit-zenon-funding-observation-producer.js';
import { openZenonFundingObserverSqliteStore } from '../src/service-credit-zenon-funding-observer-sqlite-store.js';
import { createZenonFundingPublicationBridge } from '../src/service-credit-zenon-funding-publication-bridge.js';
import { parseZenonFundingProviderAttestationAuthorityRecord } from '../src/service-credit-zenon-funding-provider-attestation.js';
import { DELIVERY_STATES, EVIDENCE_STATES, SettlementJournal } from '../src/settlement-journal.js';
import { computeBlockHash, ExactZenonFacilitator, preflightZenonPayment } from '../src/zenon-payment.js';
import { decodeB64Json } from '../src/x402-wire.js';

// This is an offline composition test, not a live payment or finality claim.
// The SDK signing primitive is used only for a process-local synthetic fixture.
// Private keys are cleared immediately; the retained public signed block lives
// only in the real owners' private, disposable test stores. No READY envelope,
// provider signature, grant, debit, successful service request, or network is made.
const NOW = 2_000_000_000_000;
const RESOURCE_URL = 'https://service.example/credits/zenon-fund';
const LEDGER_DOMAIN = 'publication-observation-offline-test-v1';
const hash = label => createHash('sha256').update(`publication-observation:${label}`).digest('hex');
const momentumHash = height => hash(`momentum.${height}`);
const CHAIN_PROFILE = Object.freeze({
  version: 1, chainIdentifier: '7', genesisMomentumHash: hash('genesis'),
});

function syntheticIdentity(byte) {
  const key = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, byte));
  try {
    return Object.freeze({
      address: key.getAddress().toString(),
      publicKey: key.getPublicKey().toString('base64url'),
    });
  } finally { key.clear(); }
}
const PAYER = syntheticIdentity(17);
const PAYEE = syntheticIdentity(18);
const OTHER = syntheticIdentity(19);
const AUTHORITY_RECORD = canonicalJson({
  authorityRecordVersion: 1,
  authorityProfileId: 'zenon.provider-attestation',
  authorityProfileVersion: 1,
  verifierVersion: 1,
  providerAuthorityId: 'provider.publication-observation.offline',
  generationId: 'generation.publication-observation.offline',
  generationVersion: 1,
  keyId: 'key.publication-observation.offline',
  algorithm: 'Ed25519',
  publicKey: OTHER.publicKey,
  network: 'zenon:testnet',
  chainProfile: CHAIN_PROFILE,
  observerPolicy: { policyId: 'zenon.injected-observer', policyVersion: 1, verifierVersion: 1 },
  confirmationPolicy: {
    policyId: 'zenon.authenticated-momentum-inclusion', policyVersion: 1, minimumConfirmations: 3,
  },
  bootstrapCheckpoint: { height: 10, hash: momentumHash(10) },
  sourcePolicyCommitment: `sha256:${hash('source-policy')}`,
  maximumAttestationBytes: 4096,
  maximumCanonicalBytes: 524288,
  maximumInitialAgeSeconds: 300,
  maximumFutureSkewSeconds: 5,
  maximumValiditySeconds: 300,
});
const AUTHORITY = parseZenonFundingProviderAttestationAuthorityRecord(AUTHORITY_RECORD);

function frozen(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}
const SOURCE_BINDING = frozen({
  sourcePolicyCommitment: AUTHORITY.sourcePolicyCommitment,
  authorityGeneration: structuredClone(AUTHORITY.authorityGeneration),
  chainProfile: structuredClone(AUTHORITY.chainProfile),
  bootstrapCheckpoint: structuredClone(AUTHORITY.bootstrapCheckpoint),
});

function fixedFailure(detail) {
  const code = `PUBLICATION_OBSERVATION_OFFLINE_TEST_FAILED_${detail}`;
  const error = new Error(code);
  error.stack = `Error: ${code}`;
  return error;
}
function test(name, run) {
  return nodeTest(name, { concurrency: false }, async t => {
    try { await run(t); }
    catch (error) {
      // Even an assertion comparing retained blocks must not print their bytes.
      const location = /service-credit-zenon-publication-observation-offline\.test\.js:(\d+):/
        .exec(typeof error?.stack === 'string' ? error.stack : '');
      throw fixedFailure(location?.[1] ?? 'ASSERTION');
    }
  });
}
function codeIs(code) { return error => error?.code === code; }
function producerCode(suffix) { return `ZENON_FUNDING_OBSERVATION_PRODUCER_${suffix}`; }
function selection() {
  return {
    offerId: 'offer.publication-observation.offline', offerVersion: 1,
    holderId: PAYER.address,
    capabilityCommitment: deriveServiceCreditCapabilityCommitment({ publicKey: PAYEE.publicKey }),
  };
}
function offer() {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    providerId: 'provider.publication-observation.offline',
    serviceId: 'service.publication-observation.offline',
    resourceId: 'resource.publication-observation.offline',
    resourceBinding: deriveServiceCreditResourceBinding({
      resourceId: 'resource.publication-observation.offline', resourceUrl: RESOURCE_URL,
    }),
    offerId: selection().offerId, offerVersion: 1, costPolicyId: 'cost.fixed',
    fundingPolicyId: 'funding.publication-observation.offline', fundingPolicyVersion: 1,
  };
}
function fundingTerms(input) {
  return {
    fundingPolicyId: input.offer.fundingPolicyId,
    fundingPolicyVersion: input.offer.fundingPolicyVersion,
    totalUnits: 10, expiresAt: NOW + 60_000,
    requirement: {
      scheme: 'exact', network: 'zenon:testnet', asset: sdk.ZNN_ZTS.toString(),
      amount: '1', payTo: PAYEE.address, maxTimeoutSeconds: 1,
      extra: {
        paymentFlow: 'upfront', poc: true, settlement: 'account-block',
        zenonChain: structuredClone(CHAIN_PROFILE), minimumMomentumConfirmations: 3,
      },
    },
  };
}

// A test-only use of the repository's existing synthetic signing path. It is
// deliberately not an injected production signing capability or retained key.
let syntheticSignatures = 0;
function syntheticSignedPayment(required, { variation = 1, payerByte = 17 } = {}) {
  const key = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, payerByte));
  try {
    const accepted = required.accepts[0];
    const block = sdk.AccountBlockTemplate.send(
      sdk.Address.parse(accepted.payTo), sdk.TokenStandard.parse(accepted.asset), BigInt(accepted.amount),
    );
    block.chainIdentifier = Number(CHAIN_PROFILE.chainIdentifier);
    block.address = key.getAddress();
    block.height = 1;
    block.momentumAcknowledged = new sdk.HashHeight(sdk.Hash.parse(hash(`acknowledged.${variation}`)), 1);
    block.data = Buffer.from(paymentIntentDigest(required, accepted), 'hex');
    block.nonce = '0000000000000000';
    block.publicKey = key.getPublicKey();
    block.hash = computeBlockHash(block, sdk);
    syntheticSignatures += 1;
    block.signature = key.sign(block.hash.getBytes());
    return {
      x402Version: required.x402Version,
      resource: structuredClone(required.resource), accepted: structuredClone(accepted),
      payload: { transaction: block.toJson(), intentDigest: paymentIntentDigest(required, accepted) },
    };
  } finally { key.clear(); }
}

function accountInfo(address) {
  const token = new sdk.Token('Synthetic', 'SYN', '', 1n, 8, address, sdk.ZNN_ZTS, 1n, false, false, false);
  return new sdk.AccountInfo(address, 0, {
    [sdk.ZNN_ZTS.toString()]: new sdk.BalanceInfoListItem(token, 1n),
  });
}
function observedBlock(transaction) {
  const block = sdk.AccountBlockTemplate.fromJson(transaction);
  block.publicKey = Buffer.from(transaction.publicKey, 'base64');
  block.signature = Buffer.from(transaction.signature, 'base64');
  block.confirmationDetail = {
    numConfirmations: 3, momentumHeight: 11,
    momentumHash: sdk.Hash.parse(momentumHash(11)), momentumTimestamp: 11,
  };
  return block;
}

function installSyntheticNode(context) {
  const zenon = sdk.Zenon.getInstance();
  const original = {
    initialize: zenon.initialize, clearConnection: zenon.clearConnection,
    ledger: zenon.ledger, stats: zenon.stats, subscribe: zenon.subscribe, embedded: zenon.embedded,
    hadClient: Object.hasOwn(zenon, 'client'), client: zenon.client,
    chainIdentifier: sdk.Zenon.getChainIdentifier(), networkId: sdk.Zenon.getNetworkID(),
  };
  const node = {
    initialize: 0, lookups: [], frontier: 0, unconfirmed: 0, publications: [],
    validatedBeforePublication: false, mode: 'included', published: false, include: false,
  };
  // Every capability used by ExactZenonFacilitator is replaced before admission.
  // No SDK initialize, network client, socket, subscription, or live publish runs.
  zenon.initialize = async () => { node.initialize += 1; zenon.client = { synthetic: true }; };
  zenon.clearConnection = () => { zenon.client = undefined; };
  zenon.stats = {
    networkInfo: async () => ({ numPeers: 1, self: { publicKey: 'synthetic-node-key', ip: 'loopback' }, peers: [] }),
    syncInfo: async () => ({ state: sdk.SyncState.SyncDone, currentHeight: 10, targetHeight: 10 }),
  };
  zenon.embedded = { token: { getByZts: async tokenStandard => ({ tokenStandard }) } };
  zenon.ledger = {
    getFrontierMomentum: async () => ({
      chainIdentifier: 7, height: 10, hash: sdk.Hash.parse(momentumHash(10)),
    }),
    getAccountBlockByHash: async requestedHash => {
      node.lookups.push(requestedHash.toString());
      if (node.include || (node.published && node.mode === 'included')) {
        return observedBlock(context.payment.payload.transaction);
      }
      if (node.published && node.mode === 'acknowledged') throw fixedFailure('SYNTHETIC_SOURCE_UNAVAILABLE');
      return null;
    },
    getAccountInfoByAddress: async address => accountInfo(address),
    getFrontierAccountBlock: async () => { node.frontier += 1; return null; },
    getUnconfirmedBlocksByAddress: async () => { node.unconfirmed += 1; return { count: 0, list: [] }; },
    publishRawTransaction: async block => {
      const entry = await context.journal.get(context.preflight.authorizationKey, context.preflight.transactionHash);
      node.validatedBeforePublication = entry?.evidenceState === EVIDENCE_STATES.VALIDATED
        && canonicalJson(entry.signedAccountBlock) === canonicalJson(context.payment.payload.transaction);
      node.publications.push(block.toJson());
      node.published = true;
      if (node.mode === 'unknown') throw fixedFailure('SYNTHETIC_PUBLICATION_AMBIGUITY');
    },
  };
  zenon.subscribe = { toAccountBlocksByAddress: async () => ({ onNotification() {} }) };
  node.restore = () => {
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
  return node;
}

async function fixture(t, { afterIntakeCommit } = {}) {
  const initialSignatureCount = syntheticSignatures;
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'publication-observation-offline-')));
  chmodSync(directory, 0o700);
  const owners = [];
  const serviceOperations = [];
  const observerOperations = [];
  let serviceStore;
  let intakeStore;
  let observerStore;
  let node;
  t.after(async () => {
    try {
      for (const owner of owners.reverse()) await owner.close();
      observerStore?.close();
      intakeStore?.close();
      serviceStore?.close();
    } catch { throw fixedFailure('CLEANUP_OWNER'); }
    finally {
      node?.restore();
      try {
        rmSync(directory, { recursive: true, force: true });
        assert.equal(existsSync(directory), false);
      } catch { throw fixedFailure('CLEANUP_STORES'); }
    }
  });
  serviceStore = ServiceCreditSqliteStore.create({
    databasePath: join(directory, 'service.sqlite'), allowedRoot: directory,
    deriveCost: () => 2, now: () => NOW,
    testHooks: { afterCommit({ operation, changed }) { if (changed) serviceOperations.push(operation); } },
  });
  serviceStore.registerOffer(offer());
  serviceStore.initializeDurableExecution({
    expectedRevision: serviceStore.getMetadata().revision,
    ledgerId: 'ledger.publication-observation.offline',
    policy: { policyId: 'execution.publication-observation.offline', policyVersion: 1, maxDurationMs: 1000 },
    capacity: 8,
  });
  const intakeConfiguration = {
    databasePath: join(directory, 'intake.sqlite'), allowedRoot: directory,
    ledgerDomain: LEDGER_DOMAIN, maxChallenges: 4,
  };
  intakeStore = createZenonFundingIntakeSqliteStore({
    ...intakeConfiguration,
    ...(afterIntakeCommit ? { testHooks: { afterCommit: afterIntakeCommit } } : {}),
  });
  const selectionKey = deriveZenonFundingIntakeSelectionKey({ ledgerDomain: LEDGER_DOMAIN, selection: selection() });
  const context = {
    directory, serviceStore, serviceOperations, observerOperations,
    get signingCalls() { return syntheticSignatures - initialSignatureCount; },
    get intakeStore() { return intakeStore; },
    get observerStore() { return observerStore; },
    bound() { return intakeStore.loadBySelectionKey(selectionKey); },
    owner() {
      const owner = createZenonFundingIntake({
        store: intakeStore, serviceCreditStore: serviceStore, authorityRecord: AUTHORITY_RECORD,
        deriveFundingTerms: fundingTerms, now: () => NOW, observerRoot: directory,
        observerCatchUp: { maximumPageEntries: 2, maximumBackfillSpan: 8, maximumMembersPerMomentum: 4 },
      });
      owners.push(owner);
      return owner;
    },
    reopenIntake() {
      intakeStore.close();
      intakeStore = openZenonFundingIntakeSqliteStore(intakeConfiguration);
      return context.owner();
    },
    openObserver(afterCommit) {
      observerStore?.close();
      const binding = context.bound().binding;
      observerStore = openZenonFundingObserverSqliteStore({
        databasePath: join(directory, binding.observerFileName), allowedRoot: directory,
        expectedRecordKey: binding.observerRecordKey, authorityRecord: AUTHORITY_RECORD,
        testHooks: { afterCommit(event) {
          if (event.changed) observerOperations.push(event.operation);
          afterCommit?.(event);
        } },
      });
      context.producer = createZenonFundingObservationProducer(Object.freeze({
        fundingObserverStore: observerStore, authorityRecord: AUTHORITY_RECORD, sourceBinding: SOURCE_BINDING,
        limits: frozen({ maximumReplyBytes: 65536, maximumContentHeaders: 4 }),
      }));
      return observerStore;
    },
    newBridge(chosen = selection()) {
      context.journal = new SettlementJournal({
        directory: join(directory, 'journal'), allowedRoot: directory, clock: () => new Date(NOW),
      });
      const facilitator = new ExactZenonFacilitator({
        journal: context.journal,
        // Required admission configuration, never read from the host environment.
        // The in-process SDK stubs above consume all capabilities; this address
        // is never connected to or returned by the public bridge projection.
        environment: {
          ZENON_LIVE_ACK: 'I_UNDERSTAND_TESTNET_ONLY',
          ZENON_NETWORK_ID: '3', ZENON_RPC_URL: 'ws://rpc.invalid',
        },
        rpcTimeoutMs: 100, authenticateChainProfile: async () => structuredClone(CHAIN_PROFILE),
      });
      const bridge = createZenonFundingPublicationBridge({ store: intakeStore, facilitator, selection: chosen });
      owners.push(bridge);
      context.bridge = bridge;
      return bridge;
    },
    async bind() {
      context.bindingResult = await context.intake.bind(context.payment);
      context.openObserver();
      return context.bindingResult;
    },
    own(owner) { owners.push(owner); return owner; },
  };
  node = installSyntheticNode(context);
  context.node = node;
  context.intake = context.owner();
  const issued = context.intake.issue({ selection: selection(), resourceUrl: RESOURCE_URL });
  assert.equal(issued.status, 402);
  context.required = decodeB64Json(issued.paymentRequiredHeader);
  context.payment = syntheticSignedPayment(context.required);
  context.preflight = await preflightZenonPayment(context.payment, context.required.accepts[0], context.required);
  context.serviceBefore = serviceStore.load();
  context.serviceOperationsBefore = serviceOperations.slice();
  return context;
}

function nativeMomentum(height, content = []) {
  return {
    version: 1, chainIdentifier: 7, hash: momentumHash(height), previousHash: momentumHash(height - 1),
    height, timestamp: height, data: '', content, changesHash: hash('changes'),
    publicKey: '', signature: '', producer: OTHER.address,
  };
}
function batch(context, frontier = 14) {
  const state = context.observerStore.load().state;
  const accountBlock = structuredClone(context.payment.payload.transaction);
  accountBlock.confirmationDetail = {
    // The raw count is deliberately untrusted. The linked pages prove only 2,
    // then 4 confirmations, never this advertised number.
    numConfirmations: 9999, momentumHeight: 11, momentumHash: momentumHash(11), momentumTimestamp: 11,
  };
  const header = { address: accountBlock.address, hash: accountBlock.hash, height: accountBlock.height };
  const list = [];
  const through = Math.min(frontier, state.checkpoint.height + state.catchUp.maximumPageEntries);
  for (let height = state.checkpoint.height + 1; height <= through; height += 1) {
    list.push(nativeMomentum(height, height === 11 ? [header] : []));
  }
  return {
    checkpoint: nativeMomentum(state.checkpoint.height), frontier: nativeMomentum(frontier),
    momentums: { count: list.length, list }, accountBlock,
    inclusionMomentum: nativeMomentum(11, [header]),
  };
}
function input(context, reply = batch(context)) {
  return Object.freeze({
    expectedRevision: context.observerStore.load().state.revision,
    sourceBinding: SOURCE_BINDING, reply: reply === null ? null : JSON.stringify(reply),
  });
}
function noEconomicProgress(context) {
  assert.deepEqual(context.serviceStore.load(), context.serviceBefore);
  assert.deepEqual(context.serviceOperations, context.serviceOperationsBefore);
  assert.equal(context.serviceStore.load().state.grants.length, 0);
  assert.equal(context.serviceStore.load().state.requests.length, 0);
  assert.equal(context.observerStore?.projectCommittedFundingEvidence() ?? null, null);
}
function publicProjection(context, value, expectedKeys) {
  assert.deepEqual(Object.keys(value), expectedKeys);
  assert.equal(Object.isFrozen(value), true);
  const text = JSON.stringify(value);
  for (const privateValue of [
    context.directory, context.payment.payload.transaction.hash,
    context.payment.payload.transaction.signature, context.payment.payload.transaction.publicKey,
    context.payment.payload.intentDigest, PAYER.address, PAYEE.address, AUTHORITY_RECORD,
    AUTHORITY.authorityRecordDigest, 'ws://rpc.invalid', canonicalJson(context.payment),
  ]) {
    assert.equal(typeof privateValue, 'string');
    assert.equal(text.includes(privateValue), false);
  }
  assert.doesNotMatch(text, /paymentPayload|signedAccountBlock|signature|sourceBinding|databasePath|allowedRoot|credential/);
}
function privateFailure(context, error, expectedCode) {
  assert.equal(error?.code, expectedCode);
  assert.equal(error.message, expectedCode);
  assert.equal(Object.hasOwn(error, 'cause'), false);
  assert.equal(Object.getOwnPropertyNames(error).every(key => ['name', 'message', 'stack', 'code'].includes(key)), true);
  const text = JSON.stringify({ ...error, message: error.message, stack: error.stack });
  for (const value of [context.directory, context.payment.payload.transaction.signature, AUTHORITY_RECORD, 'ws://rpc.invalid']) {
    assert.equal(text.includes(value), false);
  }
  assert.equal(String(error.stack).includes('\n'), false);
}
async function publishIncluded(context) {
  const bridge = context.newBridge();
  publicProjection(context, await bridge.recover(), ['status']);
  const result = await bridge.settleBound();
  assert.deepEqual(result, { status: 'INCLUDED', evidenceState: EVIDENCE_STATES.MOMENTUM_INCLUDED });
  publicProjection(context, result, ['status', 'evidenceState']);
  assert.equal(context.node.validatedBeforePublication, true);
  assert.equal(context.node.publications.length, 1);
  assert.deepEqual(context.node.publications[0], context.payment.payload.transaction);
  return result;
}
function prepare(context) {
  const first = context.producer.apply(input(context));
  assert.equal(first.observerStatus, 'INCLUDED_BELOW_THRESHOLD');
  assert.equal(first.outboxStatus, 'NONE');
  assert.equal(context.observerStore.load().state.inclusion.currentConfirmations, 2);
  const request = input(context);
  const second = context.producer.apply(request);
  assert.equal(second.observerStatus, 'THRESHOLD_OBSERVED');
  assert.equal(second.outboxStatus, 'PREPARED');
  assert.equal(context.observerStore.load().state.inclusion.currentConfirmations, 4);
  publicProjection(context, first, ['status', 'observerStatus', 'outboxStatus', 'revision']);
  publicProjection(context, second, ['status', 'observerStatus', 'outboxStatus', 'revision']);
  return { request, result: second, attestation: context.observerStore.peekPreparedAttestation() };
}
async function assertIdentity(context) {
  const row = context.bound();
  const block = context.payment.payload.transaction;
  const record = context.observerStore.load();
  assert.equal(row.status, 'BOUND');
  assert.equal(context.bindingResult.transactionHash, block.hash);
  assert.equal(row.binding.transactionHash, block.hash);
  assert.equal(row.binding.payer, PAYER.address);
  assert.equal(row.binding.authorizationKey, context.preflight.authorizationKey);
  assert.deepEqual(row.binding.publication.paymentPayload, context.payment);
  assert.deepEqual(row.binding.publication.paymentRequired, context.required);
  assert.deepEqual(row.binding.publication.acceptedRequirement, context.required.accepts[0]);
  assert.deepEqual(record.state.target, row.binding.observerTarget);
  assert.equal(record.recordKey, row.binding.observerRecordKey);
  assert.equal(record.state.target.transactionId, `zenontx:${block.hash}`);
  assert.equal(record.state.target.payer, PAYER.address);
  assert.equal(record.state.target.paymentIntentDigest, `sha256:${context.payment.payload.intentDigest}`);
  const entry = await context.journal.get(context.preflight.authorizationKey, block.hash);
  assert.equal(entry.transactionHash, block.hash);
  assert.equal(entry.authorizationKey, row.binding.authorizationKey);
  assert.equal(entry.payer, PAYER.address);
  assert.equal(entry.intentDigest, context.payment.payload.intentDigest);
  assert.deepEqual(entry.signedAccountBlock, row.binding.publication.paymentPayload.payload.transaction);
  assert.equal(entry.deliveryState, DELIVERY_STATES.NONE);
  assert.equal((await context.journal.list()).length, 1);
  assert.equal(context.node.lookups.every(value => value === block.hash), true);
  const request = context.observerStore.peekPreparedAttestation();
  if (request !== null) {
    assert.equal(request.recordKey, record.recordKey);
    assert.equal(request.targetBindingDigest, record.state.targetBindingDigest);
    // The public attestation-request schema projects these identity fields;
    // targetBindingDigest above also commits the unprojected scope/flow fields.
    for (const key of [
      'transactionId', 'payer', 'payee', 'asset', 'amount', 'network',
      'resourceBinding', 'paymentResourceDigest', 'paymentRequirementDigest', 'paymentIntentDigest',
      'offerId', 'offerVersion', 'fundingPolicyId', 'fundingPolicyVersion',
      'capabilityCommitment', 'totalUnits', 'expiresAt', 'grantFundingCommitment',
    ]) {
      assert.deepEqual(request.unsignedFundingEvidence[key], record.state.target[key]);
    }
    // load() intentionally exposes only an outbox summary. The attestation is
    // retrieved through its public owner method, never by reading store schema.
    assert.deepEqual(Object.keys(record.outbox), ['outboxVersion', 'revision', 'status']);
    assert.equal(record.outbox.revision, 1);
    assert.equal(record.outbox.status, 'PREPARED');
  }
  noEconomicProgress(context);
}

test('committed BOUND publishes the retained identity and bounded native pages prepare only that identity', async t => {
  const context = await fixture(t);
  await context.bind();
  assert.equal(context.observerStore.load().state.revision, 0);
  assert.equal(context.observerStore.peekPreparedAttestation(), null);
  assert.equal(context.node.publications.length, 0);
  await publishIncluded(context);
  prepare(context);
  await assertIdentity(context);
  assert.equal(context.signingCalls, 1);
});

test('exact replay and reopen cannot republish, advance, prepare twice, grant, debit, or execute', async t => {
  const context = await fixture(t);
  await context.bind();
  await publishIncluded(context);
  const prepared = prepare(context);
  const before = context.observerStore.load();
  const operations = context.observerOperations.slice();
  const publication = await context.journal.list();
  const nodeBefore = { lookups: context.node.lookups.length, frontier: context.node.frontier };
  for (let count = 0; count < 3; count += 1) {
    assert.deepEqual(await context.intake.bind(structuredClone(context.payment)), context.bindingResult);
    assert.equal(context.producer.apply(prepared.request), prepared.result);
    assert.equal((await context.bridge.settleBound()).status, 'INCLUDED');
  }
  assert.deepEqual(context.observerStore.load(), before);
  assert.deepEqual(context.observerOperations, operations);
  assert.deepEqual(await context.journal.list(), publication);
  assert.equal(context.node.lookups.length, nodeBefore.lookups);
  assert.equal(context.node.frontier, nodeBefore.frontier);
  const recoveredOwner = context.reopenIntake();
  assert.deepEqual(recoveredOwner.recoverBound(), [context.bindingResult]);
  context.openObserver();
  assert.deepEqual(context.observerStore.load(), before);
  context.producer.apply(input(context));
  const reopenedBridge = context.newBridge();
  assert.equal((await reopenedBridge.recover()).status, 'RECOVERED');
  assert.equal((await reopenedBridge.settleBound()).status, 'INCLUDED');
  assert.deepEqual(context.observerStore.load(), before);
  assert.deepEqual(context.observerStore.peekPreparedAttestation(), prepared.attestation);
  assert.equal(context.node.publications.length, 1);
  assert.equal(context.signingCalls, 1);
  await assertIdentity(context);
});

for (const substitution of ['transaction', 'payer', 'intent', 'requirement']) {
  test(`substituted ${substitution} cannot replace BOUND or make publication or observer progress`, async t => {
    const context = await fixture(t);
    await context.bind();
    const bound = context.bound();
    const observed = context.observerStore.load();
    let replacement = structuredClone(context.payment);
    if (substitution === 'transaction') replacement = syntheticSignedPayment(context.required, { variation: 2 });
    if (substitution === 'payer') replacement = syntheticSignedPayment(context.required, { payerByte: 19 });
    if (substitution === 'intent') replacement.payload.intentDigest = hash('substituted-intent');
    if (substitution === 'requirement') replacement.accepted.amount = '2';
    let refusal;
    try { await context.intake.bind(replacement); } catch (error) { refusal = error; }
    privateFailure(context, refusal, substitution === 'transaction'
      ? 'ZENON_FUNDING_INTAKE_CONFLICT' : 'ZENON_FUNDING_INTAKE_REJECTED');
    assert.deepEqual(context.bound(), bound);
    assert.deepEqual(context.observerStore.load(), observed);
    assert.equal(context.node.publications.length, 0);
    assert.equal(context.node.initialize, 0);
    assert.equal(context.observerStore.peekPreparedAttestation(), null);
    noEconomicProgress(context);
  });
}

test('publication recovery admits only its committed selection and accepts no replacement arguments', async t => {
  const context = await fixture(t);
  await context.bind();
  const before = context.observerStore.load();
  const wrong = context.newBridge({ ...selection(), holderId: OTHER.address });
  await assert.rejects(wrong.recover(), codeIs('ZENON_FUNDING_PUBLICATION_BRIDGE_BOUND_NOT_FOUND'));
  const bridge = context.newBridge();
  await assert.rejects(bridge.recover({ paymentPayload: context.payment }), codeIs('ZENON_FUNDING_PUBLICATION_BRIDGE_INVALID_INPUT'));
  assert.equal((await bridge.recover()).status, 'RECOVERED');
  await assert.rejects(bridge.settleBound({ paymentPayload: context.payment }), codeIs('ZENON_FUNDING_PUBLICATION_BRIDGE_INVALID_INPUT'));
  assert.equal(context.node.initialize, 0);
  assert.equal(context.node.publications.length, 0);
  assert.deepEqual(context.observerStore.load(), before);
  noEconomicProgress(context);
});

for (const substitution of ['transaction', 'payer', 'intent', 'amount', 'payee']) {
  test(`raw observation with substituted ${substitution} cannot advance the committed target`, async t => {
    const context = await fixture(t);
    await context.bind();
    const before = context.observerStore.load();
    const reply = batch(context);
    if (substitution === 'transaction') reply.accountBlock.hash = hash('other-transaction');
    if (substitution === 'payer') reply.accountBlock.address = OTHER.address;
    if (substitution === 'intent') reply.accountBlock.data = Buffer.from(hash('other-intent'), 'hex').toString('base64');
    if (substitution === 'amount') reply.accountBlock.amount = '2';
    if (substitution === 'payee') reply.accountBlock.toAddress = OTHER.address;
    let refusal;
    try { context.producer.apply(input(context, reply)); } catch (error) { refusal = error; }
    privateFailure(context, refusal, producerCode('TARGET_MISMATCH'));
    assert.deepEqual(context.observerStore.load(), before);
    assert.equal(context.node.publications.length, 0);
    assert.equal(context.observerStore.peekPreparedAttestation(), null);
    noEconomicProgress(context);
  });
}

for (const mode of ['unknown', 'acknowledged']) {
  test(`${mode} publication is reconciled across reopen using only the original retained block`, async t => {
    const context = await fixture(t);
    await context.bind();
    context.node.mode = mode;
    const before = context.observerStore.load();
    const bridge = context.newBridge();
    assert.equal((await bridge.recover()).status, 'RECOVERED');
    const first = await bridge.settleBound();
    const state = mode === 'unknown' ? EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN : EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED;
    assert.deepEqual(first, { status: 'RECONCILIATION_REQUIRED', evidenceState: state });
    publicProjection(context, first, ['status', 'evidenceState']);
    assert.equal(context.node.validatedBeforePublication, true);
    const entry = await context.journal.get(context.preflight.authorizationKey, context.preflight.transactionHash);
    assert.equal(entry.evidenceState, state);
    const frontierBefore = context.node.frontier;
    const unconfirmedBefore = context.node.unconfirmed;
    for (let count = 0; count < 2; count += 1) {
      const current = context.newBridge();
      await current.recover();
      assert.deepEqual(await current.settleBound(), first);
      assert.equal(context.node.publications.length, 1);
      assert.equal(context.node.frontier, frontierBefore);
      assert.equal(context.node.unconfirmed, unconfirmedBefore);
      assert.deepEqual(context.observerStore.load(), before);
      assert.equal(context.observerStore.peekPreparedAttestation(), null);
    }
    context.node.include = true;
    const recovered = context.newBridge();
    await recovered.recover();
    assert.equal((await recovered.settleBound()).status, 'INCLUDED');
    assert.equal(context.node.publications.length, 1);
    assert.deepEqual(context.node.publications[0], context.payment.payload.transaction);
    assert.equal(context.node.frontier, frontierBefore);
    assert.equal(context.node.unconfirmed, unconfirmedBefore);
    prepare(context);
    assert.equal(context.signingCalls, 1);
    await assertIdentity(context);
  });
}

test('the observation producer accepts no caller-selected replacement target', async t => {
  const context = await fixture(t);
  await context.bind();
  const before = context.observerStore.load();
  const substituted = { ...before.state.target, transactionId: `zenontx:${hash('replacement-target')}` };
  assert.throws(() => context.producer.apply(Object.freeze({
    ...input(context), target: frozen(substituted),
  })), codeIs(producerCode('INVALID_INPUT')));
  assert.deepEqual(context.observerStore.load(), before);
  assert.equal(context.node.publications.length, 0);
  assert.equal(context.node.initialize, 0);
  noEconomicProgress(context);
});

for (const missing of ['accountBlock', 'inclusionMomentum']) {
  test(`missing ${missing} cannot promote the published payment's remaining raw claims`, async t => {
    const context = await fixture(t);
    await context.bind();
    await publishIncluded(context);
    const before = context.observerStore.load();
    const reply = batch(context);
    reply[missing] = null;
    if (missing === 'accountBlock') reply.inclusionMomentum = null;
    assert.throws(() => context.producer.apply(input(context, reply)), codeIs(producerCode('TARGET_MISMATCH')));
    assert.deepEqual(context.observerStore.load(), before);
    assert.equal(context.observerStore.peekPreparedAttestation(), null);
    assert.equal(context.node.publications.length, 1);
    noEconomicProgress(context);
  });
}

test('publication inclusion and a raw confirmation count cannot replace a linked membership receipt', async t => {
  const context = await fixture(t);
  await context.bind();
  await publishIncluded(context);
  const reply = batch(context);
  reply.momentums.list[0].content = [];
  const result = context.producer.apply(input(context, reply));
  assert.equal(result.status, 'QUARANTINED');
  assert.equal(context.observerStore.load().state.quarantine.reason, 'MEMBERSHIP_NOT_LINKED');
  assert.equal(context.observerStore.peekPreparedAttestation(), null);
  assert.equal(context.node.publications.length, 1);
  noEconomicProgress(context);
});

test('missing or behind raw source stays unavailable despite completed publication and preserves prior progress', async t => {
  const context = await fixture(t);
  await context.bind();
  await publishIncluded(context);
  assert.equal(context.producer.apply(input(context)).outboxStatus, 'NONE');
  const before = context.observerStore.load();
  const missing = batch(context);
  missing.checkpoint = null;
  const behind = batch(context, 11);
  behind.checkpoint = null;
  for (const [reply, status] of [[null, 'SOURCE_UNAVAILABLE'], [missing, 'SOURCE_UNAVAILABLE'], [behind, 'SOURCE_BEHIND']]) {
    const result = context.producer.apply(input(context, reply));
    assert.equal(result.status, status);
    publicProjection(context, result, ['status', 'observerStatus', 'outboxStatus', 'revision']);
    assert.deepEqual(context.observerStore.load(), before);
    assert.equal(context.observerStore.peekPreparedAttestation(), null);
  }
  assert.equal(context.node.publications.length, 1);
  noEconomicProgress(context);
});

for (const conflict of ['parent', 'checkpoint', 'frontier']) {
  test(`${conflict} conflict cannot create PREPARED even after publication inclusion`, async t => {
    const context = await fixture(t);
    await context.bind();
    await publishIncluded(context);
    const reply = batch(context, 12);
    if (conflict === 'parent') reply.momentums.list[1].previousHash = hash('wrong-parent');
    if (conflict === 'checkpoint') {
      reply.checkpoint.hash = hash('wrong-checkpoint');
      reply.momentums.list[0].previousHash = reply.checkpoint.hash;
    }
    if (conflict === 'frontier') reply.frontier.hash = hash('wrong-frontier');
    const result = context.producer.apply(input(context, reply));
    assert.equal(result.status, 'QUARANTINED');
    assert.equal(result.observerStatus, 'QUARANTINED');
    assert.equal(context.observerStore.peekPreparedAttestation(), null);
    const before = context.observerStore.load();
    assert.equal(context.producer.apply(input(context)).status, 'QUARANTINED');
    assert.deepEqual(context.observerStore.load(), before);
    assert.equal(context.node.publications.length, 1);
    noEconomicProgress(context);
  });
}

test('bounded raw replies reject oversize and malformed evidence before observer commitment', async t => {
  const context = await fixture(t);
  await context.bind();
  await publishIncluded(context);
  const before = context.observerStore.load();
  const replies = [`${JSON.stringify(batch(context))}${' '.repeat(65536)}`, '{"checkpoint":', '[null]'];
  for (const reply of replies) {
    assert.throws(() => context.producer.apply(Object.freeze({
      expectedRevision: before.state.revision, sourceBinding: SOURCE_BINDING, reply,
    })), codeIs(producerCode('INVALID_INPUT')));
    assert.deepEqual(context.observerStore.load(), before);
  }
  assert.equal(context.observerStore.peekPreparedAttestation(), null);
  noEconomicProgress(context);
});

test('BOUND commit acknowledgement ambiguity returns no success and reopens only the original identity', async t => {
  let armed = false;
  const context = await fixture(t, { afterIntakeCommit() {
    if (armed) { armed = false; throw fixedFailure('SYNTHETIC_COMMIT_AMBIGUITY'); }
  } });
  armed = true;
  let result;
  let refusal;
  try { result = await context.intake.bind(context.payment); } catch (error) { refusal = error; }
  assert.equal(result, undefined);
  privateFailure(context, refusal, 'ZENON_FUNDING_INTAKE_OUTCOME_UNKNOWN');
  assert.equal(context.node.publications.length, 0);
  assert.equal(context.node.initialize, 0);
  const owner = context.reopenIntake();
  const recovered = owner.recoverBound();
  assert.equal(recovered.length, 1);
  context.bindingResult = recovered[0];
  assert.equal(context.bindingResult.transactionHash, context.payment.payload.transaction.hash);
  context.openObserver();
  assert.equal(context.observerStore.load().state.revision, 0);
  await assert.rejects(owner.bind(syntheticSignedPayment(context.required, { variation: 2 })), codeIs('ZENON_FUNDING_INTAKE_CONFLICT'));
  const signaturesBeforePublication = context.signingCalls;
  await publishIncluded(context);
  prepare(context);
  await assertIdentity(context);
  assert.equal(context.signingCalls, signaturesBeforePublication);
});

for (const operation of ['applyPage', 'applyInclusion']) {
  test(`${operation} commit acknowledgement ambiguity returns no success and resumes only the committed target`, async t => {
    const context = await fixture(t);
    await context.bind();
    await publishIncluded(context);
    let armed = true;
    context.openObserver(event => {
      if (event.operation === operation && armed) { armed = false; throw fixedFailure('SYNTHETIC_OBSERVER_AMBIGUITY'); }
    });
    let result;
    let refusal;
    try { result = context.producer.apply(input(context)); } catch (error) { refusal = error; }
    assert.equal(result, undefined);
    privateFailure(context, refusal, producerCode('STORE_RECOVERY_REQUIRED'));
    assert.throws(() => context.producer.apply(Object.freeze({
      expectedRevision: 0, sourceBinding: SOURCE_BINDING, reply: null,
    })), codeIs(producerCode('STORE_RECOVERY_REQUIRED')));
    context.openObserver();
    const committed = context.observerStore.load();
    assert.equal(committed.state.target.transactionId, `zenontx:${context.payment.payload.transaction.hash}`);
    assert.notEqual(committed.state.catchUp.lastAppliedPage.targetMembership, null);
    assert.equal(committed.outbox.status, 'NONE');
    assert.equal(context.observerStore.peekPreparedAttestation(), null);
    const resumed = context.producer.apply(input(context));
    assert.equal(resumed.observerStatus, 'THRESHOLD_OBSERVED');
    assert.equal(resumed.outboxStatus, 'PREPARED');
    const prepared = context.observerStore.load();
    context.producer.apply(input(context));
    assert.deepEqual(context.observerStore.load(), prepared);
    assert.equal(context.node.publications.length, 1);
    await assertIdentity(context);
  });
}

test('a committed PREPARED acknowledgement loss returns no success and reopens one original request', async t => {
  const context = await fixture(t);
  await context.bind();
  await publishIncluded(context);
  assert.equal(context.producer.apply(input(context)).outboxStatus, 'NONE');
  let armed = true;
  context.openObserver(({ operation, changed }) => {
    if (armed && changed && operation === 'applyPage') {
      armed = false;
      throw fixedFailure('SYNTHETIC_PREPARED_ACKNOWLEDGEMENT_LOSS');
    }
  });
  let result;
  let refusal;
  try { result = context.producer.apply(input(context)); } catch (error) { refusal = error; }
  assert.equal(result, undefined);
  privateFailure(context, refusal, producerCode('STORE_RECOVERY_REQUIRED'));
  context.openObserver();
  const committed = context.observerStore.load();
  const request = context.observerStore.peekPreparedAttestation();
  assert.equal(committed.outbox.status, 'PREPARED');
  assert.equal(committed.outbox.revision, 1);
  assert.notEqual(request, null);
  assert.equal(request.unsignedFundingEvidence.transactionId, `zenontx:${context.payment.payload.transaction.hash}`);
  const first = context.producer.apply(input(context));
  assert.equal(first.outboxStatus, 'PREPARED');
  const afterReconciliation = context.observerStore.load();
  context.producer.apply(input(context));
  assert.deepEqual(context.observerStore.load(), afterReconciliation);
  assert.deepEqual(context.observerStore.peekPreparedAttestation(), request);
  assert.equal(context.observerStore.load().outbox.revision, 1);
  assert.equal(context.node.publications.length, 1);
  assert.equal(context.signingCalls, 1);
  await assertIdentity(context);
});

async function serviceExchange(handle, authorization) {
  const request = Object.freeze({
    url: SERVICE_CREDIT_HTTP_PATH, method: 'POST',
    rawHeaders: Object.freeze(['Authorization', authorization, 'Content-Length', '0']),
  });
  const headers = Object.create(null);
  let body;
  const response = {
    destroyed: false, writableEnded: false, statusCode: 0,
    setHeader(name, value) { headers[String(name).toLowerCase()] = String(value); },
    end(value) { this.writableEnded = true; body = Buffer.from(value).toString('utf8'); },
    destroy() { this.destroyed = true; },
  };
  await handle(request, response);
  return { statusCode: response.statusCode, headers: { ...headers }, body };
}

test('PREPARED is not READY, grant authorization, a debit, or permission to execute the service', async t => {
  const context = await fixture(t);
  await context.bind();
  await publishIncluded(context);
  const prepared = prepare(context);
  const before = context.observerStore.load();
  const row = context.bound();
  const composition = createZenonFundingComposition({
    serviceCreditStore: context.serviceStore, fundingObserverStore: context.observerStore,
    authorityRecord: AUTHORITY_RECORD, deriveFundingTerms: fundingTerms, now: () => NOW,
  });
  const activationInput = { intent: row.issue.challenge.activationIntent, paymentRequired: row.issue.challenge.paymentRequired };
  for (let count = 0; count < 2; count += 1) {
    await assert.rejects(composition.activateCommittedFunding(activationInput), codeIs('SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_NOT_READY'));
  }
  let executions = 0;
  const session = context.own(createDurableServiceCreditHttpSession({
    store: context.serviceStore,
    execute() { executions += 1; return { resultCode: 'offline.unexpected' }; },
    deadlineRuntime: { monotonicNowNs: () => 0n, schedule: () => Object.freeze({}), cancel: () => undefined },
    selectedDurationMs: 1000,
  }));
  // Deliberately submit the real PREPARED object as untrusted authorization,
  // not a fabricated grant or a provider-signed READY envelope.
  const authorization = `ServiceCredit ${Buffer.from(canonicalJson(prepared.attestation)).toString('base64url')}`;
  const first = await serviceExchange(session.handle, authorization);
  const replay = await serviceExchange(session.handle, authorization);
  assert.equal(first.statusCode, 401);
  assert.deepEqual(replay, first);
  assert.equal(executions, 0);
  assert.equal(JSON.stringify(first).includes(context.payment.payload.transaction.signature), false);
  assert.equal(JSON.stringify(first).includes(context.directory), false);
  assert.equal(JSON.stringify(first).includes(canonicalJson(prepared.attestation)), false);
  assert.deepEqual(context.observerStore.load(), before);
  assert.equal(context.observerStore.projectCommittedFundingEvidence(), null);
  noEconomicProgress(context);
  await assertIdentity(context);
});
