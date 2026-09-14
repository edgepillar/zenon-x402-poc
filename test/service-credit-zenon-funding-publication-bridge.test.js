import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import nodeTest from 'node:test';
import * as sdk from 'znn-typescript-sdk';

import { canonicalJson, paymentIntentDigest } from '../src/canonical.js';
import { deriveServiceCreditResourceBinding } from '../src/service-credit-activation.js';
import { deriveServiceCreditCapabilityCommitment } from '../src/service-credit-capability.js';
import {
  createZenonFundingPublicationBridge,
} from '../src/service-credit-zenon-funding-publication-bridge.js';
import {
  createZenonFundingIntakeSqliteStore,
  deriveZenonFundingIntakeSelectionKey,
  openZenonFundingIntakeSqliteStore,
  ZENON_FUNDING_INTAKE_SQLITE_STORE_SCHEMA_VERSION,
} from '../src/service-credit-zenon-funding-intake-sqlite-store.js';
import { createZenonFundingIntake } from '../src/service-credit-zenon-funding-intake.js';
import {
  parseZenonFundingProviderAttestationAuthorityRecord,
} from '../src/service-credit-zenon-funding-provider-attestation.js';
import { SERVICE_CREDIT_MODEL_VERSION } from '../src/service-credit-model.js';
import { ServiceCreditSqliteStore } from '../src/service-credit-sqlite-store.js';
import {
  DELIVERY_STATES,
  EVIDENCE_STATES,
  SettlementJournal,
} from '../src/settlement-journal.js';
import {
  computeBlockHash,
  ExactZenonFacilitator,
  preflightZenonPayment,
} from '../src/zenon-payment.js';
import { decodeB64Json } from '../src/x402-wire.js';

const NOW = 2_000_000_000_000;
const RESOURCE_URL = 'https://service.example/credits/zenon-fund';
const LEDGER_DOMAIN = 'service-credit-zenon-publication-bridge-test-v1';
const INTAKE_ENVELOPE_V1_DOMAIN = 'zenon-x402:funding-intake-envelope-v1';
const INTAKE_ENVELOPE_V2_DOMAIN = 'zenon-x402:funding-intake-envelope-v2';
const PAYMENT_PAYLOAD_DOMAIN = 'zenon-x402:funding-intake-payment-payload-v1';

function fixedTestFailure(code) {
  const error = new Error(code);
  error.stack = `Error: ${code}`;
  return error;
}

function test(name, run) {
  return nodeTest(name, async t => {
    try { await run(t); }
    catch (error) {
      const location = /service-credit-zenon-funding-publication-bridge\.test\.js:(\d+):/
        .exec(typeof error?.stack === 'string' ? error.stack : '');
      const detail = location?.[1] ?? safeErrorCode(error) ?? 'UNKNOWN';
      throw fixedTestFailure(`ZENON_FUNDING_PUBLICATION_BRIDGE_TEST_FAILED_${detail}`);
    }
  });
}

function subtest(parent, name, run) {
  return parent.test(name, async t => {
    try { await run(t); }
    catch (error) {
      const detail = safeErrorCode(error) ?? 'UNKNOWN';
      throw fixedTestFailure(`ZENON_FUNDING_PUBLICATION_BRIDGE_SUBTEST_FAILED_${detail}`);
    }
  });
}

function safeErrorCode(error) {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
    return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

async function assertRejectsCode(promise, expected) {
  let actual;
  try { await promise; } catch (error) { actual = safeErrorCode(error); }
  assert.equal(actual, expected);
}

function digest(domain, value) {
  return `sha256:${createHash('sha256')
    .update(domain)
    .update('\0')
    .update(canonicalJson(value))
    .digest('hex')}`;
}

function envelopeChecksum(schemaVersion, core) {
  return digest(
    schemaVersion === 1 ? INTAKE_ENVELOPE_V1_DOMAIN : INTAKE_ENVELOPE_V2_DOMAIN,
    core,
  );
}

function retainedPayloadDigest(paymentPayload) {
  return digest(PAYMENT_PAYLOAD_DOMAIN, {
    x402Version: paymentPayload.x402Version,
    resource: paymentPayload.resource,
    accepted: paymentPayload.accepted,
    transaction: paymentPayload.payload.transaction,
    intentDigest: paymentPayload.payload.intentDigest,
  });
}

const CHAIN_PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: '7',
  genesisMomentumHash: createHash('sha256')
    .update('publication-bridge-genesis')
    .digest('hex'),
});
const CAPABILITY_PUBLIC_KEY = generateKeyPairSync('ed25519').publicKey
  .export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64url');
const OTHER_CAPABILITY_PUBLIC_KEY = generateKeyPairSync('ed25519').publicKey
  .export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64url');
const PROVIDER_PUBLIC_KEY = generateKeyPairSync('ed25519').publicKey
  .export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64url');

const AUTHORITY_RECORD = canonicalJson({
  authorityRecordVersion: 1,
  authorityProfileId: 'zenon.provider-attestation',
  authorityProfileVersion: 1,
  verifierVersion: 1,
  providerAuthorityId: 'provider.publication-bridge',
  generationId: 'provider.publication-bridge.generation',
  generationVersion: 1,
  keyId: 'provider.publication-bridge.key',
  algorithm: 'Ed25519',
  publicKey: PROVIDER_PUBLIC_KEY,
  network: 'zenon:testnet',
  chainProfile: CHAIN_PROFILE,
  observerPolicy: {
    policyId: 'zenon.injected-observer',
    policyVersion: 1,
    verifierVersion: 1,
  },
  confirmationPolicy: {
    policyId: 'zenon.authenticated-momentum-inclusion',
    policyVersion: 1,
    minimumConfirmations: 3,
  },
  bootstrapCheckpoint: {
    height: 10,
    hash: createHash('sha256').update('publication-bridge-bootstrap').digest('hex'),
  },
  sourcePolicyCommitment: digest('publication-bridge-source-policy', { version: 1 }),
  maximumAttestationBytes: 4096,
  maximumCanonicalBytes: 524288,
  maximumInitialAgeSeconds: 300,
  maximumFutureSkewSeconds: 5,
  maximumValiditySeconds: 300,
});
const AUTHORITY = parseZenonFundingProviderAttestationAuthorityRecord(AUTHORITY_RECORD);

function keyAddress(byte) {
  const key = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, byte));
  try { return key.getAddress().toString(); } finally { key.clear(); }
}

function selection(publicKey = CAPABILITY_PUBLIC_KEY) {
  return {
    offerId: 'offer.publication-bridge',
    offerVersion: 1,
    holderId: keyAddress(17),
    capabilityCommitment: deriveServiceCreditCapabilityCommitment({ publicKey }),
  };
}

function offer() {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    providerId: 'provider.publication-bridge',
    serviceId: 'service.publication-bridge',
    resourceId: 'resource.publication-bridge',
    resourceBinding: deriveServiceCreditResourceBinding({
      resourceId: 'resource.publication-bridge',
      resourceUrl: RESOURCE_URL,
    }),
    offerId: 'offer.publication-bridge',
    offerVersion: 1,
    costPolicyId: 'cost.fixed',
    fundingPolicyId: 'funding.exact.publication-bridge',
    fundingPolicyVersion: 1,
  };
}

function fundingTerms(input) {
  return {
    fundingPolicyId: input.offer.fundingPolicyId,
    fundingPolicyVersion: input.offer.fundingPolicyVersion,
    totalUnits: 10,
    expiresAt: NOW + 60_000,
    requirement: {
      scheme: 'exact',
      network: 'zenon:testnet',
      asset: sdk.ZNN_ZTS.toString(),
      amount: '1',
      payTo: keyAddress(18),
      maxTimeoutSeconds: 1,
      extra: {
        paymentFlow: 'upfront',
        poc: true,
        settlement: 'account-block',
        zenonChain: structuredClone(CHAIN_PROFILE),
        minimumMomentumConfirmations: AUTHORITY.confirmationPolicy.minimumConfirmations,
      },
    },
  };
}

function fixture(t, { afterCommit } = {}) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'zenon-publication-bridge-')));
  chmodSync(directory, 0o700);
  const serviceConfiguration = {
    databasePath: join(directory, 'service.sqlite'),
    allowedRoot: directory,
    deriveCost: () => 2,
    now: () => NOW,
  };
  const intakeConfiguration = {
    databasePath: join(directory, 'intake.sqlite'),
    allowedRoot: directory,
    ledgerDomain: LEDGER_DOMAIN,
    maxChallenges: 4,
  };
  let serviceStore = ServiceCreditSqliteStore.create(serviceConfiguration);
  serviceStore.registerOffer(offer());
  let intakeStore = createZenonFundingIntakeSqliteStore({
    ...intakeConfiguration,
    ...(afterCommit === undefined ? {} : { testHooks: { afterCommit } }),
  });

  function owner() {
    return createZenonFundingIntake({
      store: intakeStore,
      serviceCreditStore: serviceStore,
      authorityRecord: AUTHORITY_RECORD,
      deriveFundingTerms: fundingTerms,
      now: () => NOW,
      observerRoot: directory,
      observerCatchUp: {
        maximumPageEntries: 4,
        maximumBackfillSpan: 8,
        maximumMembersPerMomentum: 4,
      },
    });
  }

  function reopenIntake() {
    intakeStore.close();
    intakeStore = openZenonFundingIntakeSqliteStore(intakeConfiguration);
  }

  function reopenAfterExternalWrite() {
    intakeStore = openZenonFundingIntakeSqliteStore(intakeConfiguration);
  }

  t.after(() => {
    try { intakeStore.close(); } catch {}
    try { serviceStore.close(); } catch {}
    rmSync(directory, { recursive: true, force: true });
  });

  return {
    directory,
    intakeConfiguration,
    owner,
    reopenIntake,
    reopenAfterExternalWrite,
    get intakeStore() { return intakeStore; },
    get serviceStore() { return serviceStore; },
  };
}

function issue(owner) {
  const frame = owner.issue({ selection: selection(), resourceUrl: RESOURCE_URL });
  return decodeB64Json(frame.paymentRequiredHeader);
}

function syntheticSignedPayment(paymentRequired, variation = 1) {
  const payer = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, 17));
  try {
    const accepted = paymentRequired.accepts[0];
    const block = sdk.AccountBlockTemplate.send(
      sdk.Address.parse(accepted.payTo),
      sdk.TokenStandard.parse(accepted.asset),
      BigInt(accepted.amount),
    );
    block.chainIdentifier = Number(accepted.extra.zenonChain.chainIdentifier);
    block.address = payer.getAddress();
    block.height = 1;
    block.momentumAcknowledged = new sdk.HashHeight(
      sdk.Hash.digest(Buffer.from(`publication-bridge-momentum-${variation}`)),
      1,
    );
    block.data = Buffer.from(paymentIntentDigest(paymentRequired, accepted), 'hex');
    block.nonce = '0000000000000000';
    block.publicKey = payer.getPublicKey();
    block.hash = computeBlockHash(block, sdk);
    block.signature = payer.sign(block.hash.getBytes());
    return {
      x402Version: paymentRequired.x402Version,
      resource: structuredClone(paymentRequired.resource),
      accepted: structuredClone(accepted),
      payload: {
        transaction: block.toJson(),
        intentDigest: paymentIntentDigest(paymentRequired, accepted),
      },
    };
  } finally {
    payer.clear();
  }
}

function selectionKey() {
  return deriveZenonFundingIntakeSelectionKey({
    ledgerDomain: LEDGER_DOMAIN,
    selection: selection(),
  });
}

function readIntakeEnvelope(context) {
  const database = new DatabaseSync(context.intakeConfiguration.databasePath, { readOnly: true });
  try {
    const userVersion = database.prepare('PRAGMA user_version').get().user_version;
    const row = database.prepare(
      'SELECT envelope FROM intake_challenges WHERE selection_key = ?',
    ).get(selectionKey());
    return { userVersion, envelopeText: row.envelope, envelope: JSON.parse(row.envelope) };
  } finally {
    database.close();
  }
}

function replaceIntakeEnvelope(context, binding, schemaVersion) {
  const current = context.intakeStore.loadBySelectionKey(selectionKey());
  const core = { schemaVersion, issue: current.issue, binding };
  const envelope = { ...core, checksum: envelopeChecksum(schemaVersion, core) };
  context.intakeStore.close();
  const database = new DatabaseSync(context.intakeConfiguration.databasePath);
  try {
    database.prepare(
      'UPDATE intake_challenges SET payload_digest = ?, envelope = ? WHERE selection_key = ?',
    ).run(binding.payloadDigest, canonicalJson(envelope), selectionKey());
  } finally {
    database.close();
  }
  context.reopenAfterExternalWrite();
  return envelope;
}

function observedBlock(transaction, confirmations = 3) {
  const block = sdk.AccountBlockTemplate.fromJson(transaction);
  block.publicKey = Buffer.from(transaction.publicKey, 'base64');
  block.signature = Buffer.from(transaction.signature, 'base64');
  block.confirmationDetail = {
    numConfirmations: confirmations,
    momentumHeight: 11,
    momentumHash: sdk.Hash.digest(Buffer.from('publication-bridge-inclusion')),
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

function installSyntheticNode(t, behavior = {}) {
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
  const counters = {
    initialize: 0,
    lookup: 0,
    frontier: 0,
    unconfirmed: 0,
    publish: 0,
  };
  zenon.initialize = async () => {
    counters.initialize += 1;
    zenon.client = { synthetic: true };
  };
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
      chainIdentifier: Number(CHAIN_PROFILE.chainIdentifier),
      height: 10,
      hash: sdk.Hash.digest(Buffer.from('publication-bridge-frontier')),
    }),
    getAccountBlockByHash: async hash => {
      counters.lookup += 1;
      return behavior.lookup?.(hash, counters.lookup) ?? null;
    },
    getAccountInfoByAddress: async address => accountInfo(address),
    getFrontierAccountBlock: async () => {
      counters.frontier += 1;
      return null;
    },
    getUnconfirmedBlocksByAddress: async () => {
      counters.unconfirmed += 1;
      return { count: 0, list: [] };
    },
    publishRawTransaction: async block => {
      counters.publish += 1;
      return behavior.publish?.(block, counters.publish);
    },
  };
  zenon.subscribe = {
    toAccountBlocksByAddress: async () => ({ onNotification() {} }),
  };
  t.after(() => {
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
  });
  return counters;
}

function facilitator(journal) {
  return new ExactZenonFacilitator({
    journal,
    environment: {
      ZENON_LIVE_ACK: 'I_UNDERSTAND_TESTNET_ONLY',
      ZENON_NETWORK_ID: '3',
      ZENON_RPC_URL: 'ws://rpc.invalid',
    },
    rpcTimeoutMs: 100,
    authenticateChainProfile: async () => structuredClone(CHAIN_PROFILE),
  });
}

function bridge(context, exact, chosen = selection()) {
  return createZenonFundingPublicationBridge({
    store: context.intakeStore,
    facilitator: exact,
    selection: chosen,
  });
}

async function bindPayment(context, variation = 1) {
  const owner = context.owner();
  const paymentRequired = issue(owner);
  const paymentPayload = syntheticSignedPayment(paymentRequired, variation);
  await owner.bind(paymentPayload);
  return { paymentPayload, paymentRequired };
}

function journalInput(preflight) {
  return {
    authorizationKey: preflight.authorizationKey,
    transactionHash: preflight.transactionHash,
    chainProfile: preflight.chainProfile,
    intentDigest: preflight.intentDigest,
    resourceIdentity: preflight.resourceIdentity,
    resourceDigest: preflight.resourceDigest,
    payer: preflight.payer,
    signedAccountBlock: preflight.signedAccountBlock,
  };
}

test('physical schema v1 stores a new BOUND as one envelope-v2 exact settlement tuple', async t => {
  const context = fixture(t);
  const { paymentPayload, paymentRequired } = await bindPayment(context);
  const onDisk = readIntakeEnvelope(context);

  assert.equal(ZENON_FUNDING_INTAKE_SQLITE_STORE_SCHEMA_VERSION, 1);
  assert.equal(onDisk.userVersion, 1);
  assert.equal(onDisk.envelope.schemaVersion, 2);
  assert.deepEqual(onDisk.envelope.binding.publication, {
    version: 1,
    paymentPayload,
    acceptedRequirement: paymentRequired.accepts[0],
    paymentRequired,
  });
  assert.deepEqual(
    onDisk.envelope.binding.publication.paymentRequired,
    onDisk.envelope.issue.challenge.paymentRequired,
  );
  assert.equal(
    onDisk.envelope.binding.payloadDigest,
    retainedPayloadDigest(paymentPayload),
  );
  assert.equal(context.serviceStore.load().state.grants.length, 0);
});

test('restart after an ambiguous BOUND revalidates retained bytes before exact facilitator publication', async t => {
  let armed = false;
  const context = fixture(t, {
    afterCommit: () => { if (armed) throw fixedTestFailure('SYNTHETIC_COMMIT_AMBIGUITY'); },
  });
  const owner = context.owner();
  const paymentRequired = issue(owner);
  const paymentPayload = syntheticSignedPayment(paymentRequired);
  const expectedPayload = structuredClone(paymentPayload);
  const expectedRequired = structuredClone(paymentRequired);
  const expectedPreflight = await preflightZenonPayment(
    expectedPayload,
    expectedRequired.accepts[0],
    expectedRequired,
  );
  armed = true;
  await assertRejectsCode(
    owner.bind(paymentPayload),
    'ZENON_FUNDING_INTAKE_OUTCOME_UNKNOWN',
  );
  armed = false;
  context.reopenIntake();

  const journal = new SettlementJournal({
    directory: join(context.directory, 'journal'),
    allowedRoot: context.directory,
  });
  let published = false;
  let durableBeforePublication = false;
  let exactBlockPublished = false;
  const included = observedBlock(expectedPayload.payload.transaction);
  const counters = installSyntheticNode(t, {
    lookup: hash => {
      if (hash.toString() !== expectedPreflight.transactionHash) {
        throw fixedTestFailure('WRONG_RECONCILIATION_BLOCK');
      }
      return published ? included : null;
    },
    publish: async block => {
      const record = await journal.get(
        expectedPreflight.authorizationKey,
        expectedPreflight.transactionHash,
      );
      durableBeforePublication = record?.evidenceState === EVIDENCE_STATES.VALIDATED
        && canonicalJson(record.signedAccountBlock)
          === canonicalJson(expectedPayload.payload.transaction);
      exactBlockPublished = canonicalJson(block.toJson())
        === canonicalJson(expectedPayload.payload.transaction);
      published = true;
    },
  });
  const publicationBridge = bridge(context, facilitator(journal));

  await assertRejectsCode(
    publicationBridge.settleBound(),
    'ZENON_FUNDING_PUBLICATION_BRIDGE_NOT_RECOVERED',
  );
  assert.equal(counters.publish, 0);
  assert.deepEqual(await publicationBridge.recover(), { status: 'RECOVERED' });

  paymentPayload.payload.transaction.chainIdentifier = 8;
  paymentRequired.accepts[0].amount = '2';
  const result = await publicationBridge.settleBound();
  assert.deepEqual(result, {
    status: 'INCLUDED',
    evidenceState: EVIDENCE_STATES.MOMENTUM_INCLUDED,
  });
  assert.equal(durableBeforePublication, true);
  assert.equal(exactBlockPublished, true);
  assert.equal(counters.publish, 1);
  assert.deepEqual(
    (await journal.get(
      expectedPreflight.authorizationKey,
      expectedPreflight.transactionHash,
    )).signedAccountBlock,
    expectedPayload.payload.transaction,
  );
  assert.equal(context.serviceStore.load().state.grants.length, 0);
  await publicationBridge.close();
});

test('legacy envelope-v1 BOUND remains unchanged and is permanently unpublishable', async t => {
  const context = fixture(t);
  const { paymentPayload } = await bindPayment(context);
  const row = context.intakeStore.loadBySelectionKey(selectionKey());
  const { publication: _publication, ...legacyBinding } = row.binding;
  const legacy = replaceIntakeEnvelope(context, legacyBinding, 1);
  const before = readIntakeEnvelope(context).envelopeText;

  const replay = await context.owner().bind(paymentPayload);
  assert.equal(replay.status, 'BOUND');
  assert.equal(readIntakeEnvelope(context).envelopeText, before);
  assert.equal(JSON.parse(before).schemaVersion, legacy.schemaVersion);

  const journal = new SettlementJournal({
    directory: join(context.directory, 'journal'),
    allowedRoot: context.directory,
  });
  const counters = installSyntheticNode(t);
  const publicationBridge = bridge(context, facilitator(journal));
  await assertRejectsCode(
    publicationBridge.recover(),
    'ZENON_FUNDING_PUBLICATION_BRIDGE_LEGACY_BOUND_UNPUBLISHABLE',
  );
  await assertRejectsCode(
    publicationBridge.settleBound(),
    'ZENON_FUNDING_PUBLICATION_BRIDGE_QUARANTINED',
  );
  assert.equal(readIntakeEnvelope(context).envelopeText, before);
  assert.equal((await journal.load()).records.length, 0);
  assert.equal(counters.initialize, 0);
  assert.equal(counters.publish, 0);
  assert.equal(context.serviceStore.load().state.grants.length, 0);
});

test('selection and retained signed-block mismatches fail before facilitator effects', async t => {
  await subtest(t, 'selection mismatch', async t => {
    const context = fixture(t);
    await bindPayment(context);
    const journal = new SettlementJournal({
      directory: join(context.directory, 'journal'),
      allowedRoot: context.directory,
    });
    const counters = installSyntheticNode(t);
    const publicationBridge = bridge(
      context,
      facilitator(journal),
      selection(OTHER_CAPABILITY_PUBLIC_KEY),
    );
    await assertRejectsCode(
      publicationBridge.recover(),
      'ZENON_FUNDING_PUBLICATION_BRIDGE_BOUND_NOT_FOUND',
    );
    assert.equal(counters.initialize, 0);
    assert.equal(counters.publish, 0);
    assert.equal((await journal.load()).records.length, 0);
  });

  for (const [name, mutate] of [
    ['signature mismatch', payment => {
      const signature = payment.payload.transaction.signature;
      payment.payload.transaction.signature = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
    }],
    ['chain/profile mismatch', payment => { payment.payload.transaction.chainIdentifier = 8; }],
  ]) {
    await subtest(t, name, async t => {
      const context = fixture(t);
      await bindPayment(context);
      const row = context.intakeStore.loadBySelectionKey(selectionKey());
      const changedBinding = structuredClone(row.binding);
      mutate(changedBinding.publication.paymentPayload);
      changedBinding.payloadDigest = retainedPayloadDigest(
        changedBinding.publication.paymentPayload,
      );
      replaceIntakeEnvelope(context, changedBinding, 2);

      const journal = new SettlementJournal({
        directory: join(context.directory, 'journal'),
        allowedRoot: context.directory,
      });
      const counters = installSyntheticNode(t);
      const publicationBridge = bridge(context, facilitator(journal));
      await assertRejectsCode(
        publicationBridge.recover(),
        'ZENON_FUNDING_PUBLICATION_BRIDGE_RETAINED_PAYMENT_INVALID',
      );
      assert.equal(counters.initialize, 0);
      assert.equal(counters.publish, 0);
      assert.equal((await journal.load()).records.length, 0);
      assert.equal(context.serviceStore.load().state.grants.length, 0);
    });
  }
});

test('ACKNOWLEDGED and UNKNOWN restart recovery reconcile only the retained block', async t => {
  for (const evidenceState of [
    EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
    EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
  ]) {
    await subtest(t, evidenceState, async t => {
      const context = fixture(t);
      const { paymentPayload, paymentRequired } = await bindPayment(context);
      const preflight = await preflightZenonPayment(
        paymentPayload,
        paymentRequired.accepts[0],
        paymentRequired,
      );
      const journalDirectory = join(context.directory, 'journal');
      const firstJournal = new SettlementJournal({
        directory: journalDirectory,
        allowedRoot: context.directory,
      });
      await firstJournal.putValidated(journalInput(preflight));
      await firstJournal.updateEvidence(
        preflight.authorizationKey,
        preflight.transactionHash,
        evidenceState,
      );
      context.reopenIntake();

      const reloadedJournal = new SettlementJournal({
        directory: journalDirectory,
        allowedRoot: context.directory,
      });
      let exactLookup = false;
      const counters = installSyntheticNode(t, {
        lookup: hash => {
          exactLookup = hash.toString() === preflight.transactionHash;
          return null;
        },
        publish: () => { throw fixedTestFailure('MUST_NOT_REPUBLISH'); },
      });
      const publicationBridge = bridge(context, facilitator(reloadedJournal));
      assert.deepEqual(await publicationBridge.recover(), { status: 'RECOVERED' });
      const result = await publicationBridge.settleBound();
      assert.deepEqual(result, {
        status: 'RECONCILIATION_REQUIRED',
        evidenceState,
      });
      assert.equal(exactLookup, true);
      assert.equal(counters.lookup, 1);
      assert.equal(counters.frontier, 0);
      assert.equal(counters.unconfirmed, 0);
      assert.equal(counters.publish, 0);
      const retained = await reloadedJournal.get(
        preflight.authorizationKey,
        preflight.transactionHash,
      );
      assert.equal(retained.evidenceState, evidenceState);
      assert.equal(retained.deliveryState, DELIVERY_STATES.NONE);
      assert.deepEqual(retained.signedAccountBlock, paymentPayload.payload.transaction);
      assert.equal(context.serviceStore.load().state.grants.length, 0);
      await publicationBridge.close();
    });
  }
});

test('journal durability failure blocks fake publication and the bridge has no active wiring', async t => {
  const context = fixture(t);
  await bindPayment(context);
  const source = readFileSync(
    new URL('../src/service-credit-zenon-funding-publication-bridge.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /node:http|createServer|\.listen\(|markDelivery|activate|READY/);

  const journal = new SettlementJournal({
    directory: join(context.directory, 'journal'),
    allowedRoot: context.directory,
    maxFileBytes: 1024,
  });
  const counters = installSyntheticNode(t, {
    publish: () => { throw fixedTestFailure('MUST_NOT_PUBLISH_WITHOUT_JOURNAL'); },
  });
  const publicationBridge = bridge(context, facilitator(journal));
  assert.deepEqual(Reflect.ownKeys(publicationBridge), ['recover', 'settleBound', 'close']);
  assert.equal(Object.isFrozen(publicationBridge), true);
  assert.deepEqual(await publicationBridge.recover(), { status: 'RECOVERED' });
  const result = await publicationBridge.settleBound();
  assert.deepEqual(result, {
    status: 'FAILED',
    evidenceState: EVIDENCE_STATES.VALIDATED,
  });
  assert.equal(counters.publish, 0);
  assert.equal(context.serviceStore.load().state.grants.length, 0);
  await publicationBridge.close();
});
