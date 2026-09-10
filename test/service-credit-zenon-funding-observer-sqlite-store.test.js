import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  createZenonFundingObserverSqliteStore,
  deriveZenonFundingObserverSqliteRecordKey,
  openZenonFundingObserverSqliteStore,
  ZENON_FUNDING_OBSERVER_SQLITE_STORE_SCHEMA_VERSION,
  ZenonFundingObserverSqliteStore,
} from '../src/service-credit-zenon-funding-observer-sqlite-store.js';
import {
  applyZenonFundingInclusionObservation,
  applyZenonFundingObserverPage,
  createZenonFundingObserverState,
  planZenonFundingObserverBackfill,
  serializeZenonFundingObserverState,
  ZENON_FUNDING_OBSERVER_STATUS,
} from '../src/service-credit-zenon-funding-observer-state.js';
import {
  createZenonFundingProviderAttestationSigningBytes,
  parseZenonFundingProviderAttestationAuthorityRecord,
} from '../src/service-credit-zenon-funding-provider-attestation.js';
import { createZenonFundingEvidenceActivation } from '../src/service-credit-zenon-funding-evidence.js';
import {
  InMemoryServiceCreditModel,
  SERVICE_CREDIT_MODEL_VERSION,
} from '../src/service-credit-model.js';
import { ServiceCreditSqliteStore } from '../src/service-credit-sqlite-store.js';
import { deriveServiceCreditResourceBinding } from '../src/service-credit-activation.js';

const NOW = 2_000_000_000_000;
const ATTESTATION_NOW = 2_000_000_000;
const INITIAL_HEIGHT = 10;
const INITIAL_HASH = 'a'.repeat(64);
const TRANSACTION_HASH = 'c'.repeat(64);
const APPLICATION_ID = 0x5a464f53;
const TABLE_NAME = 'zenon_funding_observer_state';
const ENVELOPE_DOMAIN = 'zenon-x402:funding-observer-sqlite-envelope-v2';
const ATTESTATION_ID_DOMAIN = 'zenon-x402:funding-provider-attestation-id-v1';
const ATTESTATION_EVIDENCE_DOMAIN = 'zenon-x402:funding-provider-attestation-evidence-v1';
const RESOURCE_DIGEST_DOMAIN = 'zenon-x402-service-credit-payment-resource-v1';
const REQUIREMENT_DIGEST_DOMAIN = 'zenon-x402-service-credit-payment-requirement-v1';
const CHAIN_PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: '12345',
  genesisMomentumHash: '1'.repeat(64),
});

function digest(fill) {
  return `sha256:${fill.repeat(64)}`;
}

function domainCommitment(domain, value) {
  return `sha256:${createHash('sha256')
    .update(domain)
    .update('\0')
    .update(canonicalJson(value))
    .digest('hex')}`;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function envelopeChecksum(envelope) {
  const value = { ...envelope };
  delete value.checksum;
  return `sha256:${createHash('sha256')
    .update(ENVELOPE_DOMAIN)
    .update('\0')
    .update(canonicalJson(value))
    .digest('hex')}`;
}

function attestationRequestIdentity(request) {
  return {
    requestVersion: request.requestVersion,
    requestType: request.requestType,
    recordKey: request.recordKey,
    authorityRecordDigest: request.authorityRecordDigest,
    generationCommitment: request.generationCommitment,
    keyId: request.keyId,
    audienceDigest: request.audienceDigest,
    observerRecordId: request.observerRecordId,
    targetBindingDigest: request.targetBindingDigest,
    candidateDigest: request.candidateDigest,
    inclusionAuthorizationId: request.inclusionAuthorizationId,
    bootstrapCheckpoint: request.bootstrapCheckpoint,
    sourcePolicyCommitment: request.sourcePolicyCommitment,
    unsignedFundingEvidenceDigest: request.unsignedFundingEvidenceDigest,
  };
}

function rebindStoredRequest(envelope, mutate) {
  mutate(envelope.outbox.request);
  envelope.outbox.request.unsignedFundingEvidenceDigest = domainCommitment(
    ATTESTATION_EVIDENCE_DOMAIN,
    envelope.outbox.request.unsignedFundingEvidence,
  );
  envelope.outbox.request.attestationId = domainCommitment(
    ATTESTATION_ID_DOMAIN,
    attestationRequestIdentity(envelope.outbox.request),
  );
  envelope.outbox.attestationId = envelope.outbox.request.attestationId;
}

const STORE_KEY_PAIR = generateKeyPairSync('ed25519');
const STORE_PUBLIC_KEY = STORE_KEY_PAIR.publicKey
  .export({ format: 'der', type: 'spki' })
  .subarray(-32)
  .toString('base64url');
const AUTHORITY_RECORD_TEXT = canonicalJson({
  authorityRecordVersion: 1,
  authorityProfileId: 'zenon.provider-attestation',
  authorityProfileVersion: 1,
  verifierVersion: 1,
  providerAuthorityId: 'provider.reference',
  generationId: 'provider.attestation.generation',
  generationVersion: 1,
  keyId: 'provider.attestation.key',
  algorithm: 'Ed25519',
  publicKey: STORE_PUBLIC_KEY,
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
  bootstrapCheckpoint: { height: INITIAL_HEIGHT, hash: INITIAL_HASH },
  sourcePolicyCommitment: digest('8'),
  maximumAttestationBytes: 4096,
  maximumCanonicalBytes: 524288,
  maximumInitialAgeSeconds: 300,
  maximumFutureSkewSeconds: 5,
  maximumValiditySeconds: 300,
});
const AUTHORITY = parseZenonFundingProviderAttestationAuthorityRecord(
  AUTHORITY_RECORD_TEXT,
);

function momentumHash(height) {
  return createHash('sha256').update(`observer-store-momentum-${height}`).digest('hex');
}

function target(overrides = {}) {
  return {
    transactionId: `zenontx:${TRANSACTION_HASH}`,
    payer: 'z1syntheticpayer',
    payee: 'z1syntheticpayee',
    asset: 'zts1syntheticasset',
    amount: '7',
    scheme: 'exact',
    paymentFlow: 'upfront',
    settlement: 'account-block',
    network: 'zenon:testnet',
    providerId: 'provider.reference',
    serviceId: 'service.reference',
    resourceId: 'resource.zenon.funding',
    resourceBinding: digest('1'),
    paymentResourceDigest: digest('2'),
    paymentRequirementDigest: digest('3'),
    paymentIntentDigest: digest('4'),
    offerId: 'offer.zenon.reference',
    offerVersion: 1,
    fundingPolicyId: 'funding.exact.zenon.observer',
    fundingPolicyVersion: 1,
    capabilityCommitment: digest('5'),
    totalUnits: 10,
    expiresAt: NOW + 10_000,
    grantFundingCommitment: digest('6'),
    ...overrides,
  };
}

function observerConfiguration(overrides = {}) {
  const base = {
    observerPolicy: { ...AUTHORITY.observerPolicy },
    authorityGeneration: { ...AUTHORITY.authorityGeneration },
    chainProfile: { ...AUTHORITY.chainProfile },
    confirmationPolicy: { ...AUTHORITY.confirmationPolicy },
    target: target(),
    checkpoint: { height: INITIAL_HEIGHT, hash: INITIAL_HASH },
    catchUp: {
      maximumPageEntries: 4,
      maximumBackfillSpan: 8,
      maximumMembersPerMomentum: 4,
    },
  };
  return {
    ...base,
    ...overrides,
    observerPolicy: { ...base.observerPolicy, ...(overrides.observerPolicy ?? {}) },
    authorityGeneration: {
      ...base.authorityGeneration,
      ...(overrides.authorityGeneration ?? {}),
    },
    chainProfile: { ...base.chainProfile, ...(overrides.chainProfile ?? {}) },
    confirmationPolicy: {
      ...base.confirmationPolicy,
      ...(overrides.confirmationPolicy ?? {}),
    },
    target: { ...base.target, ...(overrides.target ?? {}) },
    checkpoint: { ...base.checkpoint, ...(overrides.checkpoint ?? {}) },
    catchUp: { ...base.catchUp, ...(overrides.catchUp ?? {}) },
  };
}

function initialState(overrides = {}) {
  return createZenonFundingObserverState(observerConfiguration(overrides));
}

function observerContext(state) {
  return {
    observerRecordId: state.observerRecordId,
    targetBindingDigest: state.targetBindingDigest,
    authorityGeneration: structuredClone(state.authorityGeneration),
    chainProfile: structuredClone(state.chainProfile),
  };
}

function pureBackfill(state, startCheckpoint, memberHeight = null) {
  const planned = planZenonFundingObserverBackfill({
    state,
    expectedRevision: state.revision,
    ...observerContext(state),
    source: {
      status: 'AVAILABLE',
      frontier: structuredClone(AUTHORITY.bootstrapCheckpoint),
      checkpointHash: startCheckpoint.hash,
    },
  });
  let previousHash = planned.plan.startCheckpoint.hash;
  const entries = [];
  for (let height = planned.plan.fromHeight; height <= planned.plan.throughHeight; height += 1) {
    const hash = height === AUTHORITY.bootstrapCheckpoint.height
      ? AUTHORITY.bootstrapCheckpoint.hash
      : momentumHash(height);
    entries.push({
      height,
      hash,
      previousHash,
      members: height === memberHeight
        ? [{
          transactionId: state.target.transactionId,
          targetBindingDigest: state.targetBindingDigest,
        }]
        : [],
    });
    previousHash = hash;
  }
  return applyZenonFundingObserverPage({
    state,
    expectedRevision: state.revision,
    plan: planned.plan,
    page: {
      pageVersion: 1,
      ...observerContext(state),
      planId: planned.plan.planId,
      startCheckpoint: structuredClone(planned.plan.startCheckpoint),
      frontier: structuredClone(planned.plan.frontier),
      entries,
    },
  }).state;
}

function pureObserveFound(state) {
  return applyZenonFundingInclusionObservation({
    state,
    expectedRevision: state.revision,
    ...observerContext(state),
    observation: foundObservation(state),
  }).state;
}

function privateDirectoryFor(t) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'zenon-observer-store-')));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function createOptions(directory, state = initialState(), overrides = {}) {
  return {
    databasePath: join(directory, 'observer.sqlite'),
    allowedRoot: directory,
    initialState: state,
    authorityRecord: AUTHORITY_RECORD_TEXT,
    ...overrides,
  };
}

function openOptions(configuration, recordKey, overrides = {}) {
  return {
    databasePath: configuration.databasePath,
    allowedRoot: configuration.allowedRoot,
    expectedRecordKey: recordKey,
    authorityRecord: configuration.authorityRecord,
    ...overrides,
  };
}

function momentumsFor(planned, state, { memberHeight = null, mutate = undefined } = {}) {
  let previousHash = planned.plan.startCheckpoint.hash;
  const momentums = [];
  for (let height = planned.plan.fromHeight; height <= planned.plan.throughHeight; height += 1) {
    const hash = momentumHash(height);
    momentums.push({
      height,
      hash,
      previousHash,
      members: height === memberHeight
        ? [{
          transactionId: state.target.transactionId,
          targetBindingDigest: state.targetBindingDigest,
        }]
        : [],
    });
    previousHash = hash;
  }
  if (mutate !== undefined) mutate(momentums);
  return momentums;
}

function foundObservation(state, overrides = {}) {
  const receipt = state.catchUp.lastAppliedPage;
  return {
    status: 'FOUND',
    transactionId: state.target.transactionId,
    targetBindingDigest: state.targetBindingDigest,
    momentumHeight: receipt.targetMembership.momentumHeight,
    momentumHash: receipt.targetMembership.momentumHash,
    pageDigest: receipt.pageDigest,
    ...overrides,
  };
}

function signedAttestationEnvelope(request, overrides = {}) {
  const issuedAt = overrides.issuedAt ?? ATTESTATION_NOW;
  const validUntil = overrides.validUntil ?? issuedAt + 120;
  const signingBytes = createZenonFundingProviderAttestationSigningBytes({
    request,
    issuedAt,
    validUntil,
  });
  return {
    envelopeVersion: 1,
    attestationId: request.attestationId,
    keyId: AUTHORITY.keyId,
    issuedAt,
    validUntil,
    signature: sign(null, signingBytes, STORE_KEY_PAIR.privateKey).toString('base64url'),
  };
}

function assertDeepFrozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

function expectCode(operation, code) {
  assert.throws(operation, error => {
    assert.equal(error?.name, 'ZenonFundingObserverSqliteStoreError');
    assert.equal(error?.code, code);
    assert.equal(error?.message, code);
    assert.equal(error?.stack, `ZenonFundingObserverSqliteStoreError: ${code}`);
    return true;
  });
}

function readEnvelope(configuration) {
  const database = new DatabaseSync(configuration.databasePath, { readOnly: true });
  const row = database.prepare(
    `SELECT record_key, envelope FROM ${TABLE_NAME} WHERE singleton = 1`,
  ).get();
  const metadata = {
    applicationId: database.prepare('PRAGMA application_id').get().application_id,
    userVersion: database.prepare('PRAGMA user_version').get().user_version,
  };
  database.close();
  return { envelope: JSON.parse(row.envelope), envelopeText: row.envelope, metadata, row };
}

function writeEnvelope(configuration, mutate, { recompute = true } = {}) {
  const database = new DatabaseSync(configuration.databasePath);
  const row = database.prepare(
    `SELECT record_key, envelope FROM ${TABLE_NAME} WHERE singleton = 1`,
  ).get();
  const envelope = JSON.parse(row.envelope);
  mutate(envelope);
  if (recompute) envelope.checksum = envelopeChecksum(envelope);
  database.prepare(`UPDATE ${TABLE_NAME} SET envelope = ? WHERE singleton = 1`)
    .run(canonicalJson(envelope));
  database.close();
}

function replaceRecord(configuration, replacementConfiguration) {
  const replacement = readEnvelope(replacementConfiguration);
  const database = new DatabaseSync(configuration.databasePath);
  database.prepare(
    `UPDATE ${TABLE_NAME} SET record_key = ?, envelope = ? WHERE singleton = 1`,
  ).run(replacement.row.record_key, replacement.envelopeText);
  database.close();
}

function reachThreshold(store) {
  const before = store.load().state;
  const planned = store.planBackfill({
    expectedRevision: before.revision,
    frontier: { height: INITIAL_HEIGHT + 3, hash: momentumHash(INITIAL_HEIGHT + 3) },
  });
  const advanced = store.applyPage({
    expectedRevision: before.revision,
    plan: planned.plan,
    momentums: momentumsFor(planned, before, { memberHeight: INITIAL_HEIGHT + 1 }),
  });
  const applied = store.applyInclusion({
    expectedRevision: advanced.state.revision,
    target: structuredClone(advanced.state.target),
    observation: foundObservation(advanced.state),
  });
  assert.equal(applied.state.status, ZENON_FUNDING_OBSERVER_STATUS.THRESHOLD_OBSERVED);
  return applied;
}

const RACE_CHILD_SOURCE = String.raw`
  import { openZenonFundingObserverSqliteStore } from './src/service-credit-zenon-funding-observer-sqlite-store.js';
  let store;
  let operation;
  process.on('message', message => {
    if (message.type === 'initialize') {
      operation = message.operation;
      try {
        store = openZenonFundingObserverSqliteStore({
          databasePath: message.databasePath,
          allowedRoot: message.allowedRoot,
          expectedRecordKey: message.recordKey,
          authorityRecord: message.authorityRecord,
          busyTimeoutMs: 10000,
        });
        process.send({ type: 'ready' });
      } catch (error) {
        process.send({ type: 'done', response: { ok: false, code: error?.code ?? 'UNKNOWN' } });
      }
      return;
    }
    if (message.type !== 'go') return;
    let response;
    try {
      const result = store.applyPage(operation);
      response = { ok: true, disposition: result.disposition, revision: result.state.revision };
    } catch (error) {
      response = { ok: false, code: error?.code ?? 'UNKNOWN' };
    }
    try { store?.close(); } catch {}
    process.send({ type: 'done', response }, () => process.disconnect());
  });
`;

function runWriterRace(configuration, recordKey, operation) {
  return new Promise((resolveRace, rejectRace) => {
    const children = [0, 1].map(() => spawn(
      process.execPath,
      ['--input-type=module', '--eval', RACE_CHILD_SOURCE],
      { cwd: process.cwd(), stdio: ['ignore', 'ignore', 'ignore', 'ipc'] },
    ));
    const responses = new Array(children.length);
    let ready = 0;
    let done = 0;
    let settled = false;
    const timer = setTimeout(() => finish(new Error('writer-race-timeout')), 15_000);
    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      for (const child of children) {
        if (child.connected) child.disconnect();
        if (error && child.exitCode === null) child.kill('SIGKILL');
      }
      if (error) rejectRace(error);
      else resolveRace(responses);
    }
    children.forEach((child, index) => {
      child.on('error', finish);
      child.on('exit', code => {
        if (!settled && code !== 0 && responses[index] === undefined) {
          finish(new Error('writer-race-child-failed'));
        }
      });
      child.on('message', message => {
        if (message?.type === 'ready') {
          ready += 1;
          if (ready === children.length) {
            for (const candidate of children) candidate.send({ type: 'go' });
          }
        } else if (message?.type === 'done') {
          responses[index] = message.response;
          done += 1;
          if (done === children.length) finish();
        }
      });
      child.send({
        type: 'initialize',
        databasePath: configuration.databasePath,
        allowedRoot: configuration.allowedRoot,
        recordKey,
        authorityRecord: configuration.authorityRecord,
        operation,
      });
    });
  });
}

const CRASH_CHILD_SOURCE = String.raw`
  import { openZenonFundingObserverSqliteStore } from './src/service-credit-zenon-funding-observer-sqlite-store.js';
  process.on('message', message => {
    const hook = ({ operation }) => {
      if (operation === 'applyPage') process.kill(process.pid, 'SIGKILL');
    };
    const store = openZenonFundingObserverSqliteStore({
      databasePath: message.databasePath,
      allowedRoot: message.allowedRoot,
      expectedRecordKey: message.recordKey,
      authorityRecord: message.authorityRecord,
      busyTimeoutMs: 10000,
      testHooks: { [message.phase]: hook },
    });
    store.applyPage(message.operation);
  });
`;

function crashAt(configuration, recordKey, phase, operation) {
  return new Promise((resolveCrash, rejectCrash) => {
    const child = spawn(process.execPath, ['--input-type=module', '--eval', CRASH_CHILD_SOURCE], {
      cwd: process.cwd(),
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectCrash(new Error('crash-boundary-timeout'));
    }, 10_000);
    child.once('error', error => {
      clearTimeout(timer);
      rejectCrash(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (code === null && signal === 'SIGKILL') resolveCrash();
      else rejectCrash(new Error('crash-boundary-child-did-not-crash'));
    });
    child.send({
      databasePath: configuration.databasePath,
      allowedRoot: configuration.allowedRoot,
      recordKey,
      authorityRecord: configuration.authorityRecord,
      phase,
      operation,
    });
  });
}

const SNAPSHOT_WRITER_CHILD_SOURCE = String.raw`
  import { createHash } from 'node:crypto';
  import { openZenonFundingObserverSqliteStore } from './src/service-credit-zenon-funding-observer-sqlite-store.js';
  const momentumHash = height => createHash('sha256').update('observer-store-momentum-' + height).digest('hex');
  process.once('message', message => {
    let store;
    try {
      store = openZenonFundingObserverSqliteStore({
        databasePath: message.databasePath,
        allowedRoot: message.allowedRoot,
        expectedRecordKey: message.recordKey,
        authorityRecord: message.authorityRecord,
        busyTimeoutMs: 10000,
      });
      process.send({ type: 'ready' });
      process.once('message', command => {
        if (command.type !== 'go') return;
        try {
          for (let index = 0; index < message.iterations; index += 1) {
            const state = store.load().state;
            const nextHeight = state.checkpoint.height + 1;
            const planned = store.planBackfill({
              expectedRevision: state.revision,
              frontier: { height: nextHeight, hash: momentumHash(nextHeight) },
            });
            store.applyPage({
              expectedRevision: state.revision,
              plan: planned.plan,
              momentums: [{
                height: nextHeight,
                hash: momentumHash(nextHeight),
                previousHash: state.checkpoint.hash,
                members: [],
              }],
            });
          }
          store.close();
          process.send({ type: 'done', ok: true }, () => process.disconnect());
        } catch (error) {
          process.send({ type: 'done', ok: false, code: error?.code ?? 'UNKNOWN' }, () => process.disconnect());
        }
      });
    } catch (error) {
      process.send({ type: 'done', ok: false, code: error?.code ?? 'UNKNOWN' }, () => process.disconnect());
    }
  });
`;

function startSnapshotWriter(configuration, recordKey, iterations) {
  const child = spawn(
    process.execPath,
    ['--input-type=module', '--eval', SNAPSHOT_WRITER_CHILD_SOURCE],
    { cwd: process.cwd(), stdio: ['ignore', 'ignore', 'ignore', 'ipc'] },
  );
  let readyResolve;
  let readyReject;
  let doneResolve;
  let doneReject;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  const done = new Promise((resolve, reject) => {
    doneResolve = resolve;
    doneReject = reject;
  });
  const timer = setTimeout(() => {
    child.kill('SIGKILL');
    const error = new Error('snapshot-writer-timeout');
    readyReject(error);
    doneReject(error);
  }, 20_000);
  child.once('error', error => {
    clearTimeout(timer);
    readyReject(error);
    doneReject(error);
  });
  child.on('message', message => {
    if (message?.type === 'ready') readyResolve();
    if (message?.type === 'done') {
      clearTimeout(timer);
      if (message.ok) doneResolve();
      else doneReject(new Error('snapshot-writer-failed'));
    }
  });
  child.send({
    databasePath: configuration.databasePath,
    allowedRoot: configuration.allowedRoot,
    recordKey,
    authorityRecord: configuration.authorityRecord,
    iterations,
  });
  return { child, ready, done };
}

test('import is inert and dependency closure remains offline and default-inactive', () => {
  assert.equal(ZENON_FUNDING_OBSERVER_SQLITE_STORE_SCHEMA_VERSION, 2);
  assert.equal(typeof ZenonFundingObserverSqliteStore.create, 'function');
  assert.equal(typeof deriveZenonFundingObserverSqliteRecordKey, 'function');
  const source = readFileSync(
    new URL('../src/service-credit-zenon-funding-observer-sqlite-store.js', import.meta.url),
    'utf8',
  );
  const imports = [...source.matchAll(/from '([^']+)'/g)].map(match => match[1]).sort();
  assert.deepEqual(imports, [
    './service-credit-zenon-funding-observer-state.js',
    './service-credit-zenon-funding-provider-attestation.js',
    'node:crypto',
    'node:fs',
    'node:path',
    'node:sqlite',
    'node:util',
  ]);
  for (const forbidden of [
    'node:http', 'node:https', 'node:net', 'node:tls', 'WebSocket', 'fetch(',
    'process.env', 'setTimeout(', 'setInterval(', 'wallet', 'sign(', 'rpc',
    'service-credit-zenon-funding-evidence.js', 'service-credit-sqlite-store.js',
  ]) {
    assert.equal(source.includes(forbidden), false);
  }
  const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  assert.equal(packageJson.includes('service-credit-zenon-funding-observer-sqlite-store'), false);
});

test('exclusive create and explicit open preserve exact frozen state and stable record key', t => {
  const directory = privateDirectoryFor(t);
  const state = initialState();
  const configuration = createOptions(directory, state);
  const store = createZenonFundingObserverSqliteStore(configuration);
  const created = store.load();
  assert.equal(created.storeSchemaVersion, 2);
  assert.deepEqual(created.state, state);
  assertDeepFrozen(created);
  const recordKey = created.recordKey;
  assert.match(recordKey, /^sha256:[0-9a-f]{64}$/);
  const stat = lstatSync(configuration.databasePath);
  assert.equal(stat.mode & 0o777, 0o600);
  assert.equal(stat.nlink, 1);
  store.close();
  store.close();

  const reopened = openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey));
  assert.deepEqual(reopened.load(), created);
  assert.equal(reopened.load().recordKey, recordKey);
  reopened.close();
  expectCode(
    () => createZenonFundingObserverSqliteStore(configuration),
    'ZENON_FUNDING_OBSERVER_STORE_ALREADY_EXISTS',
  );
});

test('record key derivation is pure, strict, and identical to exclusive create', t => {
  const directory = privateDirectoryFor(t);
  const state = initialState();
  const recordKey = deriveZenonFundingObserverSqliteRecordKey(state, AUTHORITY_RECORD_TEXT);
  assert.match(recordKey, /^sha256:[0-9a-f]{64}$/);
  assert.equal(
    deriveZenonFundingObserverSqliteRecordKey(
      structuredClone(state),
      AUTHORITY_RECORD_TEXT,
    ),
    recordKey,
  );
  const store = createZenonFundingObserverSqliteStore(createOptions(directory, state));
  assert.equal(store.load().recordKey, recordKey);
  store.close();

  const extra = structuredClone(state);
  extra.extra = true;
  expectCode(
    () => deriveZenonFundingObserverSqliteRecordKey(extra, AUTHORITY_RECORD_TEXT),
    'ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT',
  );
  expectCode(
    () => deriveZenonFundingObserverSqliteRecordKey(
      new Proxy(structuredClone(state), {}),
      AUTHORITY_RECORD_TEXT,
    ),
    'ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT',
  );
});

test('create faults reconcile from initial state through the pure record key only', async t => {
  for (const [name, phase, createCode, committed] of [
    ['before commit', 'beforeCommit', 'ZENON_FUNDING_OBSERVER_STORE_TEST_HOOK_FAILED', false],
    ['at commit attempt', 'commitAttempt', 'ZENON_FUNDING_OBSERVER_STORE_COMMIT_OUTCOME_UNKNOWN', false],
    ['after commit', 'afterCommit', 'ZENON_FUNDING_OBSERVER_STORE_COMMIT_OUTCOME_UNKNOWN', true],
  ]) {
    await t.test(name, t => {
      const directory = privateDirectoryFor(t);
      const state = initialState();
      const configuration = createOptions(directory, state, {
        testHooks: { [phase]: () => { throw new Error('synthetic'); } },
      });
      const expectedRecordKey = deriveZenonFundingObserverSqliteRecordKey(
        state,
        AUTHORITY_RECORD_TEXT,
      );
      expectCode(() => createZenonFundingObserverSqliteStore(configuration), createCode);
      if (!committed) {
        expectCode(
          () => openZenonFundingObserverSqliteStore(
            openOptions(configuration, expectedRecordKey),
          ),
          'ZENON_FUNDING_OBSERVER_STORE_SCHEMA_UNSUPPORTED',
        );
        return;
      }
      const reopened = openZenonFundingObserverSqliteStore(
        openOptions(configuration, expectedRecordKey),
      );
      assert.deepEqual(reopened.load().state, state);
      reopened.close();
    });
  }
});

test('open never creates a missing database and close is bounded and idempotent', t => {
  const directory = privateDirectoryFor(t);
  const configuration = createOptions(directory);
  expectCode(
    () => openZenonFundingObserverSqliteStore(openOptions(configuration, digest('a'))),
    'ZENON_FUNDING_OBSERVER_STORE_MISSING',
  );
  assert.equal(existsSync(configuration.databasePath), false);
  const store = createZenonFundingObserverSqliteStore(configuration);
  store.close();
  store.close();
  expectCode(() => store.load(), 'ZENON_FUNDING_OBSERVER_STORE_CLOSED');
});

test('path, ownership, type, mode, symlink, and hard-link guards fail closed without repair', async t => {
  await t.test('outside allowed root', t => {
    const root = privateDirectoryFor(t);
    const outside = privateDirectoryFor(t);
    expectCode(
      () => createZenonFundingObserverSqliteStore(createOptions(root, initialState(), {
        databasePath: join(outside, 'observer.sqlite'),
      })),
      'ZENON_FUNDING_OBSERVER_STORE_PATH_OUTSIDE_ALLOWED_ROOT',
    );
  });
  await t.test('permissive root', t => {
    const directory = privateDirectoryFor(t);
    chmodSync(directory, 0o755);
    expectCode(
      () => createZenonFundingObserverSqliteStore(createOptions(directory)),
      'ZENON_FUNDING_OBSERVER_STORE_UNSAFE_DIRECTORY',
    );
  });
  await t.test('exclusive create rejects a pre-existing private journal sidecar', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    const sidecar = `${configuration.databasePath}-journal`;
    writeFileSync(sidecar, 'stale', { mode: 0o600 });
    expectCode(
      () => createZenonFundingObserverSqliteStore(configuration),
      'ZENON_FUNDING_OBSERVER_STORE_UNEXPECTED_SIDECAR',
    );
    assert.equal(existsSync(sidecar), true);
    assert.equal(existsSync(configuration.databasePath), false);
  });
  await t.test('open never repairs mode', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    const store = createZenonFundingObserverSqliteStore(configuration);
    const recordKey = store.load().recordKey;
    store.close();
    chmodSync(configuration.databasePath, 0o644);
    expectCode(
      () => openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey)),
      'ZENON_FUNDING_OBSERVER_STORE_UNSAFE_FILE',
    );
    assert.equal(lstatSync(configuration.databasePath).mode & 0o777, 0o644);
  });
  await t.test('hard link', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    const store = createZenonFundingObserverSqliteStore(configuration);
    const recordKey = store.load().recordKey;
    store.close();
    linkSync(configuration.databasePath, join(directory, 'linked.sqlite'));
    expectCode(
      () => openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey)),
      'ZENON_FUNDING_OBSERVER_STORE_UNSAFE_FILE',
    );
  });
  await t.test('symlink', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    const store = createZenonFundingObserverSqliteStore(configuration);
    const recordKey = store.load().recordKey;
    store.close();
    const alias = join(directory, 'alias.sqlite');
    symlinkSync(configuration.databasePath, alias);
    expectCode(
      () => openZenonFundingObserverSqliteStore({
        ...openOptions(configuration, recordKey),
        databasePath: alias,
      }),
      'ZENON_FUNDING_OBSERVER_STORE_UNSAFE_FILE',
    );
  });
});

test('SQLite application, schema, row, envelope, checksum, and size grammar is exact', async t => {
  await t.test('created metadata and strict table', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    const store = createZenonFundingObserverSqliteStore(configuration);
    const recordKey = store.load().recordKey;
    store.close();
    const persisted = readEnvelope(configuration);
    assert.equal(persisted.metadata.applicationId, APPLICATION_ID);
    assert.equal(persisted.metadata.userVersion, 2);
    assert.equal(persisted.row.record_key, recordKey);
    assert.equal(persisted.envelope.checksum, envelopeChecksum(persisted.envelope));
    assert.equal(persisted.envelope.stateBytes, serializeZenonFundingObserverState(initialState()));
  });
  await t.test('wrong application id', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    const store = createZenonFundingObserverSqliteStore(configuration);
    const recordKey = store.load().recordKey;
    store.close();
    const database = new DatabaseSync(configuration.databasePath);
    database.exec('PRAGMA application_id = 1');
    database.close();
    expectCode(
      () => openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey)),
      'ZENON_FUNDING_OBSERVER_STORE_SCHEMA_UNSUPPORTED',
    );
  });
  await t.test('future user version', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    const store = createZenonFundingObserverSqliteStore(configuration);
    const recordKey = store.load().recordKey;
    store.close();
    const database = new DatabaseSync(configuration.databasePath);
    database.exec('PRAGMA user_version = 3');
    database.close();
    expectCode(
      () => openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey)),
      'ZENON_FUNDING_OBSERVER_STORE_SCHEMA_UNSUPPORTED',
    );
  });
  await t.test('extra schema object', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    const store = createZenonFundingObserverSqliteStore(configuration);
    const recordKey = store.load().recordKey;
    store.close();
    const database = new DatabaseSync(configuration.databasePath);
    database.exec('CREATE TABLE unexpected(value TEXT) STRICT');
    database.close();
    expectCode(
      () => openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey)),
      'ZENON_FUNDING_OBSERVER_STORE_CORRUPT',
    );
  });
  await t.test('ANALYZE-created internal statistics schema is rejected', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    const store = createZenonFundingObserverSqliteStore(configuration);
    const recordKey = store.load().recordKey;
    store.close();
    const database = new DatabaseSync(configuration.databasePath);
    database.exec('ANALYZE');
    database.close();
    expectCode(
      () => openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey)),
      'ZENON_FUNDING_OBSERVER_STORE_CORRUPT',
    );
  });
  await t.test('internal sequence residue is rejected', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    const store = createZenonFundingObserverSqliteStore(configuration);
    const recordKey = store.load().recordKey;
    store.close();
    const database = new DatabaseSync(configuration.databasePath);
    database.exec('CREATE TABLE transient_sequence_owner(id INTEGER PRIMARY KEY AUTOINCREMENT) STRICT');
    database.exec('DROP TABLE transient_sequence_owner');
    database.close();
    expectCode(
      () => openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey)),
      'ZENON_FUNDING_OBSERVER_STORE_CORRUPT',
    );
  });
  await t.test('checksum-valid extra envelope field', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    const store = createZenonFundingObserverSqliteStore(configuration);
    const recordKey = store.load().recordKey;
    store.close();
    writeEnvelope(configuration, envelope => { envelope.extra = true; });
    expectCode(
      () => openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey)),
      'ZENON_FUNDING_OBSERVER_STORE_CORRUPT',
    );
  });
  await t.test('invalid checksum', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    const store = createZenonFundingObserverSqliteStore(configuration);
    const recordKey = store.load().recordKey;
    store.close();
    writeEnvelope(configuration, envelope => { envelope.checksum = digest('f'); }, {
      recompute: false,
    });
    expectCode(
      () => openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey)),
      'ZENON_FUNDING_OBSERVER_STORE_CORRUPT',
    );
  });
  await t.test('future observer state', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    const store = createZenonFundingObserverSqliteStore(configuration);
    const recordKey = store.load().recordKey;
    store.close();
    writeEnvelope(configuration, envelope => {
      const state = JSON.parse(envelope.stateBytes);
      state.schemaVersion = 2;
      envelope.observerStateSchemaVersion = 2;
      envelope.stateBytes = canonicalJson(state);
    });
    expectCode(
      () => openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey)),
      'ZENON_FUNDING_OBSERVER_STORE_SCHEMA_UNSUPPORTED',
    );
  });
  await t.test('oversized persisted text', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    const store = createZenonFundingObserverSqliteStore(configuration);
    const recordKey = store.load().recordKey;
    store.close();
    const database = new DatabaseSync(configuration.databasePath);
    database.prepare(`UPDATE ${TABLE_NAME} SET envelope = ? WHERE singleton = 1`)
      .run('x'.repeat(600_000));
    database.close();
    expectCode(
      () => openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey)),
      'ZENON_FUNDING_OBSERVER_STORE_CORRUPT',
    );
  });
  await t.test('oversized persisted record key is rejected before value materialization', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    const store = createZenonFundingObserverSqliteStore(configuration);
    const recordKey = store.load().recordKey;
    store.close();
    const database = new DatabaseSync(configuration.databasePath);
    database.prepare(`UPDATE ${TABLE_NAME} SET record_key = ? WHERE singleton = 1`)
      .run('x'.repeat(600_000));
    database.close();
    expectCode(
      () => openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey)),
      'ZENON_FUNDING_OBSERVER_STORE_CORRUPT',
    );
  });
});

test('planner reads only committed state and its direct plan applies without caller cloning', t => {
  const directory = privateDirectoryFor(t);
  const configuration = createOptions(directory);
  const store = createZenonFundingObserverSqliteStore(configuration);
  const before = store.load();
  const planned = store.planBackfill({
    expectedRevision: before.state.revision,
    frontier: { height: INITIAL_HEIGHT + 3, hash: momentumHash(INITIAL_HEIGHT + 3) },
  });
  assert.equal(planned.disposition, 'BACKFILL_REQUIRED');
  assert.equal(planned.state.revision, 0);
  assertDeepFrozen(planned);

  const applied = store.applyPage({
    expectedRevision: planned.state.revision,
    plan: planned.plan,
    momentums: momentumsFor(planned, planned.state),
  });
  assert.equal(applied.disposition, 'APPLIED');
  assert.equal(applied.state.revision, 1);
  assert.equal(applied.state.checkpoint.height, INITIAL_HEIGHT + 3);
  assert.deepEqual(store.load().state, applied.state);
  assertDeepFrozen(applied);
  store.close();
});

test('page, inclusion, threshold, candidate, and later strengthening survive reopen exactly', t => {
  const directory = privateDirectoryFor(t);
  const configuration = createOptions(directory);
  let store = createZenonFundingObserverSqliteStore(configuration);
  const recordKey = store.load().recordKey;
  assert.equal(store.projectCommittedCandidate(), null);

  const threshold = reachThreshold(store);
  const candidate = store.projectCommittedCandidate();
  assert.equal(candidate.candidateType, 'zenon-funding-observation-candidate');
  assert.equal(candidate.trustClassification, 'injected-observation-only');
  assert.equal(candidate.authorization, 'NONE');
  assertDeepFrozen(candidate);
  const stableCandidate = canonicalJson(candidate);
  const thresholdState = serializeZenonFundingObserverState(threshold.state);
  store.close();

  store = openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey));
  assert.equal(serializeZenonFundingObserverState(store.load().state), thresholdState);
  assert.equal(canonicalJson(store.projectCommittedCandidate()), stableCandidate);

  const beforeGrowth = store.load().state;
  const planned = store.planBackfill({
    expectedRevision: beforeGrowth.revision,
    frontier: {
      height: beforeGrowth.checkpoint.height + 2,
      hash: momentumHash(beforeGrowth.checkpoint.height + 2),
    },
  });
  const grown = store.applyPage({
    expectedRevision: beforeGrowth.revision,
    plan: planned.plan,
    momentums: momentumsFor(planned, beforeGrowth),
  });
  assert.equal(
    grown.state.inclusion.currentConfirmations,
    beforeGrowth.inclusion.currentConfirmations + 2,
  );
  assert.equal(canonicalJson(store.projectCommittedCandidate()), stableCandidate);
  store.close();
});

test('threshold, prepared request, and authenticated READY artifact commit atomically', t => {
  const directory = privateDirectoryFor(t);
  const configuration = createOptions(directory);
  let store = createZenonFundingObserverSqliteStore(configuration);
  assert.deepEqual(store.load().outbox, {
    outboxVersion: 1,
    revision: 0,
    status: 'NONE',
  });
  assert.equal(store.peekPreparedAttestation(), null);
  const threshold = reachThreshold(store);
  assert.deepEqual(store.load().outbox, {
    outboxVersion: 1,
    revision: 1,
    status: 'PREPARED',
  });
  const request = store.peekPreparedAttestation();
  assert.equal(request.requestType, 'zenon-funding-provider-attestation-request');
  assertDeepFrozen(request);
  const committed = store.commitAuthenticatedEnvelope({
    expectedObserverRevision: threshold.state.revision,
    expectedOutboxRevision: 1,
    attestationId: request.attestationId,
    envelope: signedAttestationEnvelope(request),
    nowEpochSeconds: ATTESTATION_NOW,
  });
  assert.equal(committed.disposition, 'READY');
  assert.equal(committed.fundingEvidence.artifact.artifactType,
    'zenon-provider-attestation-ready-reference');
  assert.deepEqual(store.projectCommittedFundingEvidence(), committed.fundingEvidence);
  const verified = store.matchReadyFundingEvidence(committed.fundingEvidence);
  assert.equal(verified.evidenceType, 'zenon-authenticated-funding-evidence');
  assert.equal(verified.transactionId, threshold.state.target.transactionId);
  assertDeepFrozen(committed);
  assertDeepFrozen(verified);
  for (const ineligible of [
    store.projectCommittedCandidate(),
    { authenticated: true },
    { trustClassification: 'operator-trusted', gate: 'Gate-B' },
    { transport: 'ws', paymentObserved: true },
  ]) {
    expectCode(
      () => store.matchReadyFundingEvidence(ineligible),
      'ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT',
    );
  }
  const genericLoad = JSON.stringify(store.load());
  for (const forbidden of [
    'publicKey', 'signature', 'unsignedFundingEvidence', 'attestationId',
    'authorityRecordText', 'envelopeDigest',
  ]) {
    assert.equal(genericLoad.includes(forbidden), false);
  }
  const recordKey = store.load().recordKey;
  store.close();
  store = openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey));
  assert.deepEqual(store.projectCommittedFundingEvidence(), committed.fundingEvidence);
  assert.deepEqual(store.matchReadyFundingEvidence(committed.fundingEvidence), verified);
  store.close();
});

test('PREPARED request remains byte-stable across reopen and confirmation growth', t => {
  const directory = privateDirectoryFor(t);
  const configuration = createOptions(directory);
  let store = createZenonFundingObserverSqliteStore(configuration);
  const threshold = reachThreshold(store);
  const request = store.peekPreparedAttestation();
  const requestBytes = canonicalJson(request);
  const recordKey = store.load().recordKey;
  store.close();

  store = openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey));
  assert.equal(canonicalJson(store.peekPreparedAttestation()), requestBytes);
  const beforeGrowth = store.load().state;
  const planned = store.planBackfill({
    expectedRevision: beforeGrowth.revision,
    frontier: {
      height: beforeGrowth.checkpoint.height + 1,
      hash: momentumHash(beforeGrowth.checkpoint.height + 1),
    },
  });
  const grown = store.applyPage({
    expectedRevision: beforeGrowth.revision,
    plan: planned.plan,
    momentums: momentumsFor(planned, beforeGrowth),
  });
  assert.equal(canonicalJson(store.peekPreparedAttestation()), requestBytes);
  assert.equal(store.load().outbox.revision, 1);
  const committed = store.commitAuthenticatedEnvelope({
    expectedObserverRevision: grown.state.revision,
    expectedOutboxRevision: 1,
    attestationId: request.attestationId,
    envelope: signedAttestationEnvelope(request),
    nowEpochSeconds: ATTESTATION_NOW,
  });
  assert.equal(committed.disposition, 'READY');
  assert.equal(threshold.state.firstThreshold.confirmations,
    grown.state.firstThreshold.confirmations);
  store.close();
});

test('only the exact committed store artifact can activate #104 once', async t => {
  const directory = privateDirectoryFor(t);
  const resourceUrl = 'https://service.example/credits/zenon-fund';
  const resourceBinding = deriveServiceCreditResourceBinding({
    resourceId: 'resource.zenon.funding',
    resourceUrl,
  });
  const activationOffer = {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    providerId: 'provider.reference',
    serviceId: 'service.reference',
    resourceId: 'resource.zenon.funding',
    resourceBinding,
    offerId: 'offer.zenon.reference',
    offerVersion: 1,
    costPolicyId: 'cost.fixed',
    fundingPolicyId: 'funding.exact.zenon.observer',
    fundingPolicyVersion: 1,
  };
  const requirement = {
    scheme: 'exact',
    network: 'zenon:testnet',
    asset: 'zts1syntheticasset',
    amount: '7',
    payTo: 'z1syntheticpayee',
    maxTimeoutSeconds: 30,
    extra: {
      paymentFlow: 'upfront',
      poc: true,
      settlement: 'account-block',
      zenonChain: structuredClone(AUTHORITY.chainProfile),
      minimumMomentumConfirmations: AUTHORITY.confirmationPolicy.minimumConfirmations,
    },
  };
  const deriveFundingTerms = input => ({
    fundingPolicyId: input.offer.fundingPolicyId,
    fundingPolicyVersion: input.offer.fundingPolicyVersion,
    totalUnits: 10,
    expiresAt: NOW + 10_000,
    requirement: structuredClone(requirement),
  });
  const model = new InMemoryServiceCreditModel({ deriveCost: () => 1, now: () => NOW });
  model.registerOffer(activationOffer);
  let store;
  const activation = createZenonFundingEvidenceActivation({
    store: {
      getOffer: input => model.getOffer(input),
      activateGrantFromTrustedRecord: input => model.activateGrantFromTrustedRecord(input),
    },
    deriveFundingTerms,
    verifyFundingEvidence: async evidence => store.matchReadyFundingEvidence(evidence),
    authorityProfile: structuredClone(AUTHORITY.authorityProfile),
    now: () => NOW,
  });
  const prepared = activation.createFundingResource({
    selection: {
      offerId: activationOffer.offerId,
      offerVersion: activationOffer.offerVersion,
      holderId: 'z1syntheticpayer',
      capabilityCommitment: digest('5'),
    },
    resourceUrl,
  });
  const accepted = prepared.paymentRequired.accepts[0];
  const tags = prepared.paymentRequired.resource.tags;
  const liveState = initialState({
    target: {
      transactionId: `zenontx:${TRANSACTION_HASH}`,
      payer: prepared.activationIntent.holderId,
      payee: accepted.payTo,
      asset: accepted.asset,
      amount: accepted.amount,
      scheme: 'exact',
      paymentFlow: 'upfront',
      settlement: 'account-block',
      network: 'zenon:testnet',
      providerId: prepared.activationIntent.providerId,
      serviceId: prepared.activationIntent.serviceId,
      resourceId: prepared.activationIntent.resourceId,
      resourceBinding,
      paymentResourceDigest: domainCommitment(
        RESOURCE_DIGEST_DOMAIN,
        prepared.paymentRequired.resource,
      ),
      paymentRequirementDigest: domainCommitment(REQUIREMENT_DIGEST_DOMAIN, accepted),
      paymentIntentDigest: `sha256:${createHash('sha256').update(canonicalJson({
        x402Version: prepared.paymentRequired.x402Version,
        resource: prepared.paymentRequired.resource,
        accepted,
      })).digest('hex')}`,
      offerId: prepared.activationIntent.offerId,
      offerVersion: prepared.activationIntent.offerVersion,
      fundingPolicyId: activationOffer.fundingPolicyId,
      fundingPolicyVersion: activationOffer.fundingPolicyVersion,
      capabilityCommitment: prepared.activationIntent.capabilityCommitment,
      totalUnits: prepared.activationIntent.totalUnits,
      expiresAt: prepared.activationIntent.expiresAt,
      grantFundingCommitment: `sha256:${tags[1]}${tags[2]}`,
    },
  });
  const configuration = createOptions(directory, liveState);
  store = createZenonFundingObserverSqliteStore(configuration);
  const threshold = reachThreshold(store);
  const request = store.peekPreparedAttestation();
  const committed = store.commitAuthenticatedEnvelope({
    expectedObserverRevision: threshold.state.revision,
    expectedOutboxRevision: 1,
    attestationId: request.attestationId,
    envelope: signedAttestationEnvelope(request),
    nowEpochSeconds: ATTESTATION_NOW,
  });
  const first = await activation.activate({
    intent: prepared.activationIntent,
    paymentRequired: prepared.paymentRequired,
    fundingEvidence: committed.fundingEvidence,
  });
  const replay = await activation.activate({
    intent: prepared.activationIntent,
    paymentRequired: prepared.paymentRequired,
    fundingEvidence: structuredClone(committed.fundingEvidence),
  });
  assert.deepEqual(replay, first);
  assert.equal(model.exportState().grants.length, 1);
  const forged = structuredClone(committed.fundingEvidence);
  forged.artifact.attestationId = digest('f');
  await assert.rejects(
    () => activation.activate({
      intent: prepared.activationIntent,
      paymentRequired: prepared.paymentRequired,
      fundingEvidence: forged,
    }),
    error => error?.code === 'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED',
  );
  assert.equal(model.exportState().grants.length, 1);

  const creditConfiguration = {
    databasePath: join(directory, 'service-credit.sqlite'),
    allowedRoot: directory,
    deriveCost: () => 1,
    now: () => NOW,
  };
  let creditStore = ServiceCreditSqliteStore.create(creditConfiguration);
  creditStore.registerOffer(activationOffer);
  let sqliteActivation = createZenonFundingEvidenceActivation({
    store: creditStore,
    deriveFundingTerms,
    verifyFundingEvidence: async evidence => store.matchReadyFundingEvidence(evidence),
    authorityProfile: structuredClone(AUTHORITY.authorityProfile),
    now: () => NOW,
  });
  const sqliteFirst = await sqliteActivation.activate({
    intent: prepared.activationIntent,
    paymentRequired: prepared.paymentRequired,
    fundingEvidence: committed.fundingEvidence,
  });
  creditStore.close();
  creditStore = ServiceCreditSqliteStore.openExisting(creditConfiguration);
  sqliteActivation = createZenonFundingEvidenceActivation({
    store: creditStore,
    deriveFundingTerms,
    verifyFundingEvidence: async evidence => store.matchReadyFundingEvidence(evidence),
    authorityProfile: structuredClone(AUTHORITY.authorityProfile),
    now: () => NOW,
  });
  const sqliteReplay = await sqliteActivation.activate({
    intent: prepared.activationIntent,
    paymentRequired: prepared.paymentRequired,
    fundingEvidence: structuredClone(committed.fundingEvidence),
  });
  assert.deepEqual(sqliteReplay, sqliteFirst);
  assert.equal(creditStore.load().state.grants.length, 1);
  creditStore.close();
  store.close();
});

test('exact READY replay survives expiry and confirmation growth without identity change', t => {
  const directory = privateDirectoryFor(t);
  const configuration = createOptions(directory);
  const store = createZenonFundingObserverSqliteStore(configuration);
  const threshold = reachThreshold(store);
  const request = store.peekPreparedAttestation();
  const envelope = signedAttestationEnvelope(request);
  const first = store.commitAuthenticatedEnvelope({
    expectedObserverRevision: threshold.state.revision,
    expectedOutboxRevision: 1,
    attestationId: request.attestationId,
    envelope,
    nowEpochSeconds: ATTESTATION_NOW,
  });
  const replay = store.commitAuthenticatedEnvelope({
    expectedObserverRevision: threshold.state.revision,
    expectedOutboxRevision: 1,
    attestationId: request.attestationId,
    envelope: structuredClone(envelope),
    nowEpochSeconds: ATTESTATION_NOW + 10_000,
  });
  assert.deepEqual(replay, first);
  assert.equal(store.load().outbox.revision, 2);

  const beforeGrowth = store.load().state;
  const planned = store.planBackfill({
    expectedRevision: beforeGrowth.revision,
    frontier: {
      height: beforeGrowth.checkpoint.height + 1,
      hash: momentumHash(beforeGrowth.checkpoint.height + 1),
    },
  });
  store.applyPage({
    expectedRevision: beforeGrowth.revision,
    plan: planned.plan,
    momentums: momentumsFor(planned, beforeGrowth),
  });
  assert.deepEqual(store.projectCommittedFundingEvidence(), first.fundingEvidence);
  assert.equal(store.load().outbox.revision, 2);
  store.close();
});

test('a multi-page threshold retains the creation bootstrap through reopen', t => {
  const directory = privateDirectoryFor(t);
  const configuration = createOptions(directory, initialState({
    catchUp: { maximumPageEntries: 2, maximumBackfillSpan: 4 },
  }));
  let store = createZenonFundingObserverSqliteStore(configuration);
  const initial = store.load().state;
  const firstPlan = store.planBackfill({
    expectedRevision: initial.revision,
    frontier: { height: INITIAL_HEIGHT + 4, hash: momentumHash(INITIAL_HEIGHT + 4) },
  });
  const firstPage = store.applyPage({
    expectedRevision: initial.revision,
    plan: firstPlan.plan,
    momentums: momentumsFor(firstPlan, initial, { memberHeight: INITIAL_HEIGHT + 1 }),
  });
  const included = store.applyInclusion({
    expectedRevision: firstPage.state.revision,
    target: structuredClone(firstPage.state.target),
    observation: foundObservation(firstPage.state),
  });
  assert.equal(included.state.status, ZENON_FUNDING_OBSERVER_STATUS.INCLUDED_BELOW_THRESHOLD);
  const secondPlan = store.planBackfill({
    expectedRevision: included.state.revision,
    frontier: { height: INITIAL_HEIGHT + 4, hash: momentumHash(INITIAL_HEIGHT + 4) },
  });
  const threshold = store.applyPage({
    expectedRevision: included.state.revision,
    plan: secondPlan.plan,
    momentums: momentumsFor(secondPlan, included.state),
  });
  assert.equal(threshold.state.status, ZENON_FUNDING_OBSERVER_STATUS.THRESHOLD_OBSERVED);
  assert.equal(store.load().outbox.status, 'PREPARED');
  assert.notDeepEqual(
    threshold.state.firstThreshold.lineageReceipt.startCheckpoint,
    AUTHORITY.bootstrapCheckpoint,
  );
  const stableRequest = store.peekPreparedAttestation();
  const recordKey = store.load().recordKey;
  store.close();
  store = openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey));
  assert.deepEqual(store.peekPreparedAttestation(), stableRequest);
  assert.equal(store.load().state.status, ZENON_FUNDING_OBSERVER_STATUS.THRESHOLD_OBSERVED);
  store.close();
});

test('create and record-key derivation reject every valid non-pristine bootstrap snapshot', async t => {
  const awaitingStart = initialState({
    checkpoint: { height: INITIAL_HEIGHT - 1, hash: momentumHash(INITIAL_HEIGHT - 1) },
  });
  const awaiting = pureBackfill(awaitingStart, awaitingStart.checkpoint);

  const includedStart = initialState({
    checkpoint: { height: INITIAL_HEIGHT - 1, hash: momentumHash(INITIAL_HEIGHT - 1) },
  });
  const included = pureObserveFound(
    pureBackfill(includedStart, includedStart.checkpoint, INITIAL_HEIGHT),
  );

  const thresholdStart = initialState({
    checkpoint: { height: INITIAL_HEIGHT - 3, hash: momentumHash(INITIAL_HEIGHT - 3) },
  });
  const threshold = pureObserveFound(
    pureBackfill(thresholdStart, thresholdStart.checkpoint, INITIAL_HEIGHT - 2),
  );

  const quarantineStart = initialState();
  const quarantined = planZenonFundingObserverBackfill({
    state: quarantineStart,
    expectedRevision: quarantineStart.revision,
    ...observerContext(quarantineStart),
    source: {
      status: 'AVAILABLE',
      frontier: structuredClone(AUTHORITY.bootstrapCheckpoint),
      checkpointHash: 'b'.repeat(64),
    },
  }).state;

  const cases = [
    ['revision and retained page', awaiting, ZENON_FUNDING_OBSERVER_STATUS.AWAITING_INCLUSION],
    ['latched inclusion', included, ZENON_FUNDING_OBSERVER_STATUS.INCLUDED_BELOW_THRESHOLD],
    ['first threshold receipt', threshold, ZENON_FUNDING_OBSERVER_STATUS.THRESHOLD_OBSERVED],
    ['terminal quarantine', quarantined, ZENON_FUNDING_OBSERVER_STATUS.QUARANTINED],
  ];

  for (const [name, state, expectedStatus] of cases) {
    await t.test(name, t => {
      assert.equal(state.status, expectedStatus);
      assert.equal(state.revision > 0, true);
      assert.deepEqual(state.checkpoint, AUTHORITY.bootstrapCheckpoint);
      expectCode(
        () => deriveZenonFundingObserverSqliteRecordKey(state, AUTHORITY_RECORD_TEXT),
        'ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT',
      );
      const directory = privateDirectoryFor(t);
      const configuration = createOptions(directory, state);
      expectCode(
        () => createZenonFundingObserverSqliteStore(configuration),
        'ZENON_FUNDING_OBSERVER_STORE_INVALID_CONFIGURATION',
      );
      assert.equal(existsSync(configuration.databasePath), false);
    });
  }
});

test('disconnected initial state, authority substitution, and v1 rollback fail read-only', async t => {
  await t.test('disconnected initial state is rejected before database creation', t => {
    const directory = privateDirectoryFor(t);
    const disconnected = initialState({
      checkpoint: { height: INITIAL_HEIGHT + 1, hash: momentumHash(INITIAL_HEIGHT + 1) },
    });
    const configuration = createOptions(directory, disconnected);
    expectCode(
      () => createZenonFundingObserverSqliteStore(configuration),
      'ZENON_FUNDING_OBSERVER_STORE_INVALID_CONFIGURATION',
    );
    assert.equal(existsSync(configuration.databasePath), false);
  });

  await t.test('a different pinned authority cannot open the same namespace', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    const store = createZenonFundingObserverSqliteStore(configuration);
    const recordKey = store.load().recordKey;
    store.close();
    const otherKey = generateKeyPairSync('ed25519').publicKey
      .export({ format: 'der', type: 'spki' })
      .subarray(-32)
      .toString('base64url');
    const otherRecord = { ...JSON.parse(AUTHORITY_RECORD_TEXT), publicKey: otherKey };
    expectCode(
      () => openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey, {
        authorityRecord: canonicalJson(otherRecord),
      })),
      'ZENON_FUNDING_OBSERVER_STORE_AUTHORITY_MISMATCH',
    );
  });

  await t.test('a v1 user version is rejected without modifying bytes', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    const store = createZenonFundingObserverSqliteStore(configuration);
    const recordKey = store.load().recordKey;
    store.close();
    const database = new DatabaseSync(configuration.databasePath);
    database.exec('PRAGMA user_version = 1');
    database.close();
    const before = readFileSync(configuration.databasePath);
    expectCode(
      () => openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey)),
      'ZENON_FUNDING_OBSERVER_STORE_SCHEMA_UNSUPPORTED',
    );
    assert.deepEqual(readFileSync(configuration.databasePath), before);
  });
});

test('invalid assertions are no-write and READY commit ambiguity reconciles on reopen', async t => {
  await t.test('invalid signature preserves PREPARED bytes', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    const store = createZenonFundingObserverSqliteStore(configuration);
    const threshold = reachThreshold(store);
    const request = store.peekPreparedAttestation();
    const before = readEnvelope(configuration).envelopeText;
    const invalid = signedAttestationEnvelope(request);
    invalid.signature = Buffer.alloc(64).toString('base64url');
    expectCode(
      () => store.commitAuthenticatedEnvelope({
        expectedObserverRevision: threshold.state.revision,
        expectedOutboxRevision: 1,
        attestationId: request.attestationId,
        envelope: invalid,
        nowEpochSeconds: ATTESTATION_NOW,
      }),
      'ZENON_FUNDING_OBSERVER_STORE_ATTESTATION_REJECTED',
    );
    assert.equal(readEnvelope(configuration).envelopeText, before);
    assert.equal(store.load().outbox.status, 'PREPARED');
    store.close();
  });

  for (const [name, phase, expectedStatus, expectedCode] of [
    ['before write', 'beforeWrite', 'PREPARED', 'ZENON_FUNDING_OBSERVER_STORE_TEST_HOOK_FAILED'],
    ['after write', 'afterWrite', 'PREPARED', 'ZENON_FUNDING_OBSERVER_STORE_TEST_HOOK_FAILED'],
    ['before commit', 'beforeCommit', 'PREPARED', 'ZENON_FUNDING_OBSERVER_STORE_TEST_HOOK_FAILED'],
    ['at commit attempt', 'commitAttempt', 'PREPARED', 'ZENON_FUNDING_OBSERVER_STORE_COMMIT_OUTCOME_UNKNOWN'],
    ['after commit', 'afterCommit', 'READY', 'ZENON_FUNDING_OBSERVER_STORE_COMMIT_OUTCOME_UNKNOWN'],
  ]) {
    await t.test(name, t => {
      const directory = privateDirectoryFor(t);
      const configuration = createOptions(directory);
      let store = createZenonFundingObserverSqliteStore(configuration);
      const threshold = reachThreshold(store);
      const request = store.peekPreparedAttestation();
      const recordKey = store.load().recordKey;
      store.close();
      store = openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey, {
        testHooks: { [phase]: ({ operation }) => {
          if (operation === 'commitAuthenticatedEnvelope') throw new Error('synthetic');
        } },
      }));
      expectCode(
        () => store.commitAuthenticatedEnvelope({
          expectedObserverRevision: threshold.state.revision,
          expectedOutboxRevision: 1,
          attestationId: request.attestationId,
          envelope: signedAttestationEnvelope(request),
          nowEpochSeconds: ATTESTATION_NOW,
        }),
        expectedCode,
      );
      try { store.close(); } catch {}
      const reopened = openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey));
      assert.equal(reopened.load().outbox.status, expectedStatus);
      assert.equal(
        reopened.projectCommittedFundingEvidence() === null,
        expectedStatus === 'PREPARED',
      );
      reopened.close();
    });
  }
});

test('threshold state and PREPARED request commit both-or-neither', async t => {
  for (const [name, phase, committed, expectedCode] of [
    ['before write', 'beforeWrite', false, 'ZENON_FUNDING_OBSERVER_STORE_TEST_HOOK_FAILED'],
    ['after write', 'afterWrite', false, 'ZENON_FUNDING_OBSERVER_STORE_TEST_HOOK_FAILED'],
    ['before commit', 'beforeCommit', false, 'ZENON_FUNDING_OBSERVER_STORE_TEST_HOOK_FAILED'],
    ['at commit attempt', 'commitAttempt', false, 'ZENON_FUNDING_OBSERVER_STORE_COMMIT_OUTCOME_UNKNOWN'],
    ['after commit', 'afterCommit', true, 'ZENON_FUNDING_OBSERVER_STORE_COMMIT_OUTCOME_UNKNOWN'],
  ]) {
    await t.test(name, t => {
      const directory = privateDirectoryFor(t);
      const configuration = createOptions(directory);
      let store = createZenonFundingObserverSqliteStore(configuration);
      const initial = store.load().state;
      const planned = store.planBackfill({
        expectedRevision: initial.revision,
        frontier: { height: INITIAL_HEIGHT + 3, hash: momentumHash(INITIAL_HEIGHT + 3) },
      });
      const pending = store.applyPage({
        expectedRevision: initial.revision,
        plan: planned.plan,
        momentums: momentumsFor(planned, initial, { memberHeight: INITIAL_HEIGHT + 1 }),
      });
      const recordKey = store.load().recordKey;
      store.close();
      store = openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey, {
        testHooks: { [phase]: ({ operation }) => {
          if (operation === 'applyInclusion') throw new Error('synthetic');
        } },
      }));
      expectCode(
        () => store.applyInclusion({
          expectedRevision: pending.state.revision,
          target: structuredClone(pending.state.target),
          observation: foundObservation(pending.state),
        }),
        expectedCode,
      );
      try { store.close(); } catch {}
      const reopened = openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey));
      const loaded = reopened.load();
      assert.equal(
        loaded.state.status === ZENON_FUNDING_OBSERVER_STATUS.THRESHOLD_OBSERVED,
        committed,
      );
      assert.equal(loaded.outbox.status, committed ? 'PREPARED' : 'NONE');
      assert.equal(reopened.peekPreparedAttestation() === null, !committed);
      reopened.close();
    });
  }
});

test('two handles converge on one READY envelope and never duplicate outbox revision', t => {
  const directory = privateDirectoryFor(t);
  const configuration = createOptions(directory);
  const first = createZenonFundingObserverSqliteStore(configuration);
  const threshold = reachThreshold(first);
  const request = first.peekPreparedAttestation();
  const envelope = signedAttestationEnvelope(request);
  const recordKey = first.load().recordKey;
  const second = openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey));
  const winner = first.commitAuthenticatedEnvelope({
    expectedObserverRevision: threshold.state.revision,
    expectedOutboxRevision: 1,
    attestationId: request.attestationId,
    envelope,
    nowEpochSeconds: ATTESTATION_NOW,
  });
  const converged = second.commitAuthenticatedEnvelope({
    expectedObserverRevision: threshold.state.revision,
    expectedOutboxRevision: 1,
    attestationId: request.attestationId,
    envelope: structuredClone(envelope),
    nowEpochSeconds: ATTESTATION_NOW + 10_000,
  });
  assert.deepEqual(converged, winner);
  assert.equal(first.load().outbox.revision, 2);
  assert.equal(second.load().outbox.revision, 2);
  first.close();
  second.close();
});

test('checksum-valid removal of a required PREPARED outbox fails closed', t => {
  const directory = privateDirectoryFor(t);
  const configuration = createOptions(directory);
  const store = createZenonFundingObserverSqliteStore(configuration);
  const threshold = reachThreshold(store);
  const recordKey = store.load().recordKey;
  assert.equal(store.load().outbox.status, 'PREPARED');
  store.close();
  writeEnvelope(configuration, envelope => {
    envelope.outboxRevision = 0;
    envelope.outbox = {
      outboxVersion: 1,
      revision: 0,
      status: 'NONE',
      attestationId: null,
      request: null,
      envelope: null,
      envelopeDigest: null,
      conflictingEnvelope: null,
      conflictingEnvelopeDigest: null,
      priorStatus: null,
      invalidationReason: null,
    };
  });
  const before = readFileSync(configuration.databasePath);
  expectCode(
    () => openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey)),
    'ZENON_FUNDING_OBSERVER_STORE_CORRUPT',
  );
  assert.deepEqual(readFileSync(configuration.databasePath), before);
  assert.equal(threshold.state.status, ZENON_FUNDING_OBSERVER_STATUS.THRESHOLD_OBSERVED);
});

test('self-consistent stored request drift fails every immutable binding before projection', async t => {
  const mutations = [
    ['authority generation', request => { request.generationCommitment = digest('0'); }],
    ['audience', request => { request.audienceDigest = digest('0'); }],
    ['observer', request => { request.observerRecordId = digest('0'); }],
    ['target', request => { request.targetBindingDigest = digest('0'); }],
    ['candidate', request => { request.candidateDigest = digest('0'); }],
    ['inclusion authorization', request => { request.inclusionAuthorizationId = digest('0'); }],
    ['bootstrap', request => { request.bootstrapCheckpoint.hash = 'b'.repeat(64); }],
    ['source policy', request => { request.sourcePolicyCommitment = digest('0'); }],
    ['chain genesis', request => {
      request.unsignedFundingEvidence.chainProfile.genesisMomentumHash = '2'.repeat(64);
    }],
    ['payer target', request => { request.unsignedFundingEvidence.payer = 'z1otherpayer'; }],
    ['payment intent', request => {
      request.unsignedFundingEvidence.paymentIntentDigest = digest('0');
    }],
    ['economic amount', request => { request.unsignedFundingEvidence.amount = '8'; }],
    ['unit grant', request => { request.unsignedFundingEvidence.totalUnits += 1; }],
    ['expiry', request => { request.unsignedFundingEvidence.expiresAt += 1; }],
    ['inclusion tuple', request => {
      request.unsignedFundingEvidence.inclusionEvidence.momentumHash = 'f'.repeat(64);
    }],
    ['confirmation observation', request => {
      request.unsignedFundingEvidence.inclusionEvidence.observedConfirmations += 1;
    }],
  ];
  for (const [name, mutate] of mutations) {
    await t.test(name, t => {
      const directory = privateDirectoryFor(t);
      const configuration = createOptions(directory);
      const store = createZenonFundingObserverSqliteStore(configuration);
      reachThreshold(store);
      const recordKey = store.load().recordKey;
      store.close();
      writeEnvelope(configuration, envelope => rebindStoredRequest(envelope, mutate));
      const before = readFileSync(configuration.databasePath);
      expectCode(
        () => openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey)),
        'ZENON_FUNDING_OBSERVER_STORE_CORRUPT',
      );
      assert.deepEqual(readFileSync(configuration.databasePath), before);
    });
  }
});

test('quarantine and valid equivocation durably suppress every projection', async t => {
  await t.test('pre-READY quarantine invalidates PREPARED', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    let store = createZenonFundingObserverSqliteStore(configuration);
    const threshold = reachThreshold(store);
    assert.notEqual(store.peekPreparedAttestation(), null);
    const conflict = store.planBackfill({
      expectedRevision: threshold.state.revision,
      frontier: {
        height: threshold.state.checkpoint.height,
        hash: 'f'.repeat(64),
      },
    });
    assert.equal(conflict.state.status, ZENON_FUNDING_OBSERVER_STATUS.QUARANTINED);
    assert.equal(store.load().outbox.status, 'INVALIDATED');
    assert.equal(store.peekPreparedAttestation(), null);
    assert.equal(store.projectCommittedCandidate(), null);
    assert.equal(store.projectCommittedFundingEvidence(), null);
    const recordKey = store.load().recordKey;
    store.close();
    store = openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey));
    assert.equal(store.load().outbox.status, 'INVALIDATED');
    assert.equal(store.peekPreparedAttestation(), null);
    store.close();
  });

  await t.test('post-READY quarantine invalidates the outbox', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    let store = createZenonFundingObserverSqliteStore(configuration);
    const threshold = reachThreshold(store);
    const request = store.peekPreparedAttestation();
    const ready = store.commitAuthenticatedEnvelope({
      expectedObserverRevision: threshold.state.revision,
      expectedOutboxRevision: 1,
      attestationId: request.attestationId,
      envelope: signedAttestationEnvelope(request),
      nowEpochSeconds: ATTESTATION_NOW,
    });
    const conflict = store.planBackfill({
      expectedRevision: threshold.state.revision,
      frontier: {
        height: threshold.state.checkpoint.height,
        hash: 'f'.repeat(64),
      },
    });
    assert.equal(conflict.state.status, ZENON_FUNDING_OBSERVER_STATUS.QUARANTINED);
    assert.equal(store.load().outbox.status, 'INVALIDATED');
    assert.equal(store.projectCommittedCandidate(), null);
    assert.equal(store.projectCommittedFundingEvidence(), null);
    expectCode(
      () => store.matchReadyFundingEvidence(ready.fundingEvidence),
      'ZENON_FUNDING_OBSERVER_STORE_ATTESTATION_UNAVAILABLE',
    );
    const recordKey = store.load().recordKey;
    store.close();
    store = openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey));
    assert.equal(store.load().outbox.status, 'INVALIDATED');
    assert.equal(store.projectCommittedCandidate(), null);
    assert.equal(store.projectCommittedFundingEvidence(), null);
    store.close();

    writeEnvelope(configuration, envelope => {
      envelope.outboxRevision = 0;
      envelope.outbox = {
        outboxVersion: 1,
        revision: 0,
        status: 'NONE',
        attestationId: null,
        request: null,
        envelope: null,
        envelopeDigest: null,
        conflictingEnvelope: null,
        conflictingEnvelopeDigest: null,
        priorStatus: null,
        invalidationReason: null,
      };
    });
    const before = readFileSync(configuration.databasePath);
    expectCode(
      () => openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey)),
      'ZENON_FUNDING_OBSERVER_STORE_CORRUPT',
    );
    assert.deepEqual(readFileSync(configuration.databasePath), before);
  });

  await t.test('a second distinct valid assertion is terminal equivocation', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    let store = createZenonFundingObserverSqliteStore(configuration);
    const threshold = reachThreshold(store);
    const request = store.peekPreparedAttestation();
    const first = store.commitAuthenticatedEnvelope({
      expectedObserverRevision: threshold.state.revision,
      expectedOutboxRevision: 1,
      attestationId: request.attestationId,
      envelope: signedAttestationEnvelope(request),
      nowEpochSeconds: ATTESTATION_NOW,
    });
    const second = store.commitAuthenticatedEnvelope({
      expectedObserverRevision: threshold.state.revision,
      expectedOutboxRevision: 2,
      attestationId: request.attestationId,
      envelope: signedAttestationEnvelope(request, {
        issuedAt: ATTESTATION_NOW + 1,
        validUntil: ATTESTATION_NOW + 121,
      }),
      nowEpochSeconds: ATTESTATION_NOW + 1,
    });
    assert.equal(second.disposition, 'EQUIVOCATED');
    assert.equal(second.fundingEvidence, null);
    assert.equal(store.load().outbox.status, 'EQUIVOCATED');
    assert.equal(store.projectCommittedCandidate(), null);
    assert.equal(store.projectCommittedFundingEvidence(), null);
    expectCode(
      () => store.matchReadyFundingEvidence(first.fundingEvidence),
      'ZENON_FUNDING_OBSERVER_STORE_ATTESTATION_UNAVAILABLE',
    );
    const recordKey = store.load().recordKey;
    store.close();
    store = openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey));
    assert.equal(store.load().outbox.status, 'EQUIVOCATED');
    assert.equal(store.projectCommittedCandidate(), null);
    assert.equal(store.projectCommittedFundingEvidence(), null);
    store.close();
  });
});

test('pending membership and terminal quarantine remain durable across reconnect', t => {
  const directory = privateDirectoryFor(t);
  const configuration = createOptions(directory);
  let store = createZenonFundingObserverSqliteStore(configuration);
  const initial = store.load();
  const planned = store.planBackfill({
    expectedRevision: initial.state.revision,
    frontier: { height: INITIAL_HEIGHT + 2, hash: momentumHash(INITIAL_HEIGHT + 2) },
  });
  const pending = store.applyPage({
    expectedRevision: initial.state.revision,
    plan: planned.plan,
    momentums: momentumsFor(planned, initial.state, { memberHeight: INITIAL_HEIGHT + 1 }),
  });
  assert.notEqual(pending.state.catchUp.lastAppliedPage.targetMembership, null);
  assert.equal(pending.state.inclusion, null);
  const recordKey = initial.recordKey;
  store.close();

  store = openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey));
  const blocked = store.planBackfill({
    expectedRevision: pending.state.revision,
    frontier: { height: INITIAL_HEIGHT + 3, hash: momentumHash(INITIAL_HEIGHT + 3) },
  });
  assert.equal(blocked.disposition, 'INCLUSION_OBSERVATION_REQUIRED');
  assert.equal(blocked.plan, null);
  assert.equal(blocked.state.revision, pending.state.revision);

  const quarantined = store.applyInclusion({
    expectedRevision: pending.state.revision,
    target: structuredClone(pending.state.target),
    observation: {
      ...foundObservation(pending.state),
      momentumHash: 'f'.repeat(64),
    },
  });
  assert.equal(quarantined.disposition, 'QUARANTINED');
  assert.equal(quarantined.state.status, ZENON_FUNDING_OBSERVER_STATUS.QUARANTINED);
  assert.equal(store.projectCommittedCandidate(), null);
  store.close();

  store = openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey));
  assert.equal(store.load().state.status, ZENON_FUNDING_OBSERVER_STATUS.QUARANTINED);
  const terminal = store.planBackfill({
    expectedRevision: store.load().state.revision,
    frontier: structuredClone(store.load().state.checkpoint),
  });
  assert.equal(terminal.disposition, 'QUARANTINED');
  assert.equal(terminal.state.revision, quarantined.state.revision);
  store.close();
});

test('reopen resumes bounded backfill and cannot skip a gap or replace the cursor', async t => {
  await t.test('bounded reconnect resumes at the next committed height', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory, initialState({
      catchUp: { maximumPageEntries: 2, maximumBackfillSpan: 4 },
    }));
    let store = createZenonFundingObserverSqliteStore(configuration);
    const initial = store.load();
    const firstPlan = store.planBackfill({
      expectedRevision: initial.state.revision,
      frontier: { height: INITIAL_HEIGHT + 5, hash: momentumHash(INITIAL_HEIGHT + 5) },
    });
    assert.equal(firstPlan.plan.fromHeight, INITIAL_HEIGHT + 1);
    assert.equal(firstPlan.plan.throughHeight, INITIAL_HEIGHT + 2);
    const first = store.applyPage({
      expectedRevision: initial.state.revision,
      plan: firstPlan.plan,
      momentums: momentumsFor(firstPlan, initial.state),
    });
    store.close();
    store = openZenonFundingObserverSqliteStore(openOptions(configuration, initial.recordKey));
    const secondPlan = store.planBackfill({
      expectedRevision: first.state.revision,
      frontier: { height: INITIAL_HEIGHT + 5, hash: momentumHash(INITIAL_HEIGHT + 5) },
    });
    assert.equal(secondPlan.plan.fromHeight, INITIAL_HEIGHT + 3);
    assert.equal(secondPlan.plan.throughHeight, INITIAL_HEIGHT + 4);
    store.close();
  });
  await t.test('gap becomes durable quarantine', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    const store = createZenonFundingObserverSqliteStore(configuration);
    const initial = store.load().state;
    const planned = store.planBackfill({
      expectedRevision: initial.revision,
      frontier: { height: INITIAL_HEIGHT + 2, hash: momentumHash(INITIAL_HEIGHT + 2) },
    });
    const page = momentumsFor(planned, initial);
    page[0].height += 1;
    const result = store.applyPage({
      expectedRevision: initial.revision,
      plan: planned.plan,
      momentums: page,
    });
    assert.equal(result.disposition, 'QUARANTINED');
    assert.equal(result.state.status, ZENON_FUNDING_OBSERVER_STATUS.QUARANTINED);
    assert.equal(store.load().state.status, ZENON_FUNDING_OBSERVER_STATUS.QUARANTINED);
    store.close();
  });
  await t.test('behind source never moves the cursor', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    const store = createZenonFundingObserverSqliteStore(configuration);
    const initial = store.load().state;
    const persisted = readEnvelope(configuration).envelopeText;
    const behind = store.planBackfill({
      expectedRevision: initial.revision,
      frontier: { height: INITIAL_HEIGHT - 1, hash: momentumHash(INITIAL_HEIGHT - 1) },
    });
    assert.equal(behind.disposition, 'SOURCE_BEHIND');
    assert.equal(behind.state.revision, initial.revision);
    assert.equal(readEnvelope(configuration).envelopeText, persisted);
    store.close();
  });
  await t.test('same-height replacement durably quarantines and disables projection', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    let store = createZenonFundingObserverSqliteStore(configuration);
    const recordKey = store.load().recordKey;
    const threshold = reachThreshold(store);
    assert.notEqual(store.projectCommittedCandidate(), null);
    const beforeEnvelope = readEnvelope(configuration).envelopeText;
    const conflict = store.planBackfill({
      expectedRevision: threshold.state.revision,
      frontier: { height: threshold.state.checkpoint.height, hash: 'f'.repeat(64) },
    });
    assert.equal(conflict.disposition, 'QUARANTINED');
    assert.equal(conflict.plan, null);
    assert.equal(conflict.state.status, ZENON_FUNDING_OBSERVER_STATUS.QUARANTINED);
    assert.equal(conflict.state.revision, threshold.state.revision + 1);
    assert.notEqual(readEnvelope(configuration).envelopeText, beforeEnvelope);
    assert.equal(store.projectCommittedCandidate(), null);
    store.close();
    store = openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey));
    assert.equal(store.load().state.status, ZENON_FUNDING_OBSERVER_STATUS.QUARANTINED);
    assert.equal(store.projectCommittedCandidate(), null);
    store.close();
  });
});

test('stale revisions fail closed while exact replay is byte-stable and write-free', t => {
  const directory = privateDirectoryFor(t);
  const configuration = createOptions(directory);
  const store = createZenonFundingObserverSqliteStore(configuration);
  const initial = store.load().state;
  const planned = store.planBackfill({
    expectedRevision: initial.revision,
    frontier: { height: INITIAL_HEIGHT + 2, hash: momentumHash(INITIAL_HEIGHT + 2) },
  });
  const operation = {
    expectedRevision: initial.revision,
    plan: planned.plan,
    momentums: momentumsFor(planned, initial),
  };
  const first = store.applyPage(operation);
  const persistedAfterFirst = readEnvelope(configuration).envelopeText;
  expectCode(
    () => store.applyPage(operation),
    'ZENON_FUNDING_OBSERVER_STORE_STALE_REVISION',
  );
  assert.equal(readEnvelope(configuration).envelopeText, persistedAfterFirst);

  const replay = store.applyPage({ ...operation, expectedRevision: first.state.revision });
  assert.equal(replay.disposition, 'REPLAY');
  assert.equal(replay.state.revision, first.state.revision);
  assert.equal(readEnvelope(configuration).envelopeText, persistedAfterFirst);
  store.close();
});

test('wrong record, target, authority, chain, and state schema fail before mutation', async t => {
  await t.test('wrong record key', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    const store = createZenonFundingObserverSqliteStore(configuration);
    store.close();
    expectCode(
      () => openZenonFundingObserverSqliteStore(openOptions(configuration, digest('f'))),
      'ZENON_FUNDING_OBSERVER_STORE_RECORD_KEY_MISMATCH',
    );
  });
  await t.test('target drift', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    const store = createZenonFundingObserverSqliteStore(configuration);
    const before = store.load().state;
    const persisted = readEnvelope(configuration).envelopeText;
    expectCode(
      () => store.applyInclusion({
        expectedRevision: before.revision,
        target: { ...structuredClone(before.target), amount: '8' },
        observation: { status: 'NOT_FOUND', transactionId: before.target.transactionId },
      }),
      'ZENON_FUNDING_OBSERVER_STORE_TARGET_MISMATCH',
    );
    assert.equal(readEnvelope(configuration).envelopeText, persisted);
    store.close();
  });
  for (const [name, mutatePlan] of [
    ['authority drift', plan => {
      plan.authorityGeneration.generationVersion += 1;
    }],
    ['chain drift', plan => {
      plan.chainProfile.chainIdentifier = '12346';
    }],
    ['target-binding drift', plan => {
      plan.targetBindingDigest = digest('f');
    }],
  ]) {
    await t.test(name, t => {
      const directory = privateDirectoryFor(t);
      const configuration = createOptions(directory);
      const store = createZenonFundingObserverSqliteStore(configuration);
      const before = store.load().state;
      const planned = store.planBackfill({
        expectedRevision: before.revision,
        frontier: { height: INITIAL_HEIGHT + 1, hash: momentumHash(INITIAL_HEIGHT + 1) },
      });
      const changedPlan = structuredClone(planned.plan);
      mutatePlan(changedPlan);
      const persisted = readEnvelope(configuration).envelopeText;
      expectCode(
        () => store.applyPage({
          expectedRevision: before.revision,
          plan: changedPlan,
          momentums: momentumsFor(planned, before),
        }),
        'ZENON_FUNDING_OBSERVER_STORE_CONTEXT_MISMATCH',
      );
      assert.equal(readEnvelope(configuration).envelopeText, persisted);
      store.close();
    });
  }
  await t.test('future observer schema', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    const store = createZenonFundingObserverSqliteStore(configuration);
    const recordKey = store.load().recordKey;
    store.close();
    writeEnvelope(configuration, envelope => {
      const state = JSON.parse(envelope.stateBytes);
      state.schemaVersion += 1;
      envelope.observerStateSchemaVersion += 1;
      envelope.stateBytes = canonicalJson(state);
    });
    expectCode(
      () => openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey)),
      'ZENON_FUNDING_OBSERVER_STORE_SCHEMA_UNSUPPORTED',
    );
  });
});

test('every entrypoint remains pinned to the handle record key after a valid row swap', async t => {
  for (const name of ['load', 'plan', 'applyPage', 'applyInclusion', 'project']) {
    await t.test(name, t => {
      const directory = privateDirectoryFor(t);
      const configuration = createOptions(directory);
      const store = createZenonFundingObserverSqliteStore(configuration);
      const initial = store.load();
      const planned = store.planBackfill({
        expectedRevision: initial.state.revision,
        frontier: { height: INITIAL_HEIGHT + 1, hash: momentumHash(INITIAL_HEIGHT + 1) },
      });
      const replacementConfiguration = createOptions(
        directory,
        initialState({ target: { transactionId: `zenontx:${'d'.repeat(64)}` } }),
        { databasePath: join(directory, 'replacement-record.sqlite') },
      );
      const replacementStore = createZenonFundingObserverSqliteStore(replacementConfiguration);
      replacementStore.close();
      replaceRecord(configuration, replacementConfiguration);

      const operations = {
        load: () => store.load(),
        plan: () => store.planBackfill({
          expectedRevision: initial.state.revision,
          frontier: { height: INITIAL_HEIGHT + 1, hash: momentumHash(INITIAL_HEIGHT + 1) },
        }),
        applyPage: () => store.applyPage({
          expectedRevision: initial.state.revision,
          plan: planned.plan,
          momentums: momentumsFor(planned, initial.state),
        }),
        applyInclusion: () => store.applyInclusion({
          expectedRevision: initial.state.revision,
          target: structuredClone(initial.state.target),
          observation: {
            status: 'NOT_FOUND',
            transactionId: initial.state.target.transactionId,
          },
        }),
        project: () => store.projectCommittedCandidate(),
      };
      expectCode(
        operations[name],
        'ZENON_FUNDING_OBSERVER_STORE_RECORD_KEY_MISMATCH',
      );
      expectCode(() => store.load(), 'ZENON_FUNDING_OBSERVER_STORE_CLOSED');
    });
  }
});

test('two handles serialize writers and reconcile one committed winner', t => {
  const directory = privateDirectoryFor(t);
  const configuration = createOptions(directory);
  const first = createZenonFundingObserverSqliteStore(configuration);
  const recordKey = first.load().recordKey;
  const second = openZenonFundingObserverSqliteStore(openOptions(configuration, recordKey));
  const initial = first.load().state;
  const planned = first.planBackfill({
    expectedRevision: initial.revision,
    frontier: { height: INITIAL_HEIGHT + 1, hash: momentumHash(INITIAL_HEIGHT + 1) },
  });
  const operation = {
    expectedRevision: initial.revision,
    plan: planned.plan,
    momentums: momentumsFor(planned, initial),
  };
  const winner = first.applyPage(operation);
  expectCode(
    () => second.applyPage(structuredClone(operation)),
    'ZENON_FUNDING_OBSERVER_STORE_STALE_REVISION',
  );
  assert.deepEqual(second.load().state, winner.state);
  first.close();
  second.close();
});

test('two independent processes produce one winner and one stale result', async t => {
  const directory = privateDirectoryFor(t);
  const configuration = createOptions(directory);
  const store = createZenonFundingObserverSqliteStore(configuration);
  const initial = store.load();
  const planned = store.planBackfill({
    expectedRevision: initial.state.revision,
    frontier: { height: INITIAL_HEIGHT + 1, hash: momentumHash(INITIAL_HEIGHT + 1) },
  });
  const operation = {
    expectedRevision: initial.state.revision,
    plan: planned.plan,
    momentums: momentumsFor(planned, initial.state),
  };
  store.close();
  const responses = await runWriterRace(configuration, initial.recordKey, operation);
  assert.equal(responses.filter(value => value.ok).length, 1);
  assert.equal(responses.filter(value => (
    !value.ok && value.code === 'ZENON_FUNDING_OBSERVER_STORE_STALE_REVISION'
  )).length, 1);
  const reopened = openZenonFundingObserverSqliteStore(
    openOptions(configuration, initial.recordKey),
  );
  assert.equal(reopened.load().state.revision, 1);
  reopened.close();
});

test('concurrent committed readers and writer observe only complete old-or-new snapshots', async t => {
  const directory = privateDirectoryFor(t);
  const configuration = createOptions(directory);
  const reader = createZenonFundingObserverSqliteStore(configuration);
  const recordKey = reader.load().recordKey;
  const writer = startSnapshotWriter(configuration, recordKey, 32);
  t.after(() => {
    if (writer.child.exitCode === null && writer.child.connected) writer.child.kill('SIGKILL');
  });
  await writer.ready;
  writer.child.send({ type: 'go' });
  let previousRevision = 0;
  for (let index = 0; index < 96; index += 1) {
    const loaded = reader.load();
    assert.equal(loaded.recordKey, recordKey);
    assert.equal(loaded.state.revision >= previousRevision, true);
    previousRevision = loaded.state.revision;
    assert.equal(reader.projectCommittedCandidate(), null);
    if (index % 8 === 0) {
      const additional = openZenonFundingObserverSqliteStore(
        openOptions(configuration, recordKey, { busyTimeoutMs: 10_000 }),
      );
      const snapshot = additional.load();
      assert.equal(snapshot.recordKey, recordKey);
      assert.equal(snapshot.state.status, ZENON_FUNDING_OBSERVER_STATUS.AWAITING_INCLUSION);
      additional.close();
    }
  }
  await writer.done;
  assert.equal(reader.load().state.revision, 32);
  reader.close();
});

test('definite pre-commit failure rolls back while commit ambiguity latches closed', async t => {
  for (const [name, phase, expectedCode, expectedRevision] of [
    ['before commit is definite', 'beforeCommit', 'ZENON_FUNDING_OBSERVER_STORE_TEST_HOOK_FAILED', 0],
    ['commit-attempt is ambiguous', 'commitAttempt', 'ZENON_FUNDING_OBSERVER_STORE_COMMIT_OUTCOME_UNKNOWN', 0],
    ['after commit is ambiguous', 'afterCommit', 'ZENON_FUNDING_OBSERVER_STORE_COMMIT_OUTCOME_UNKNOWN', 1],
  ]) {
    await t.test(name, t => {
      const directory = privateDirectoryFor(t);
      const configuration = createOptions(directory);
      let store = createZenonFundingObserverSqliteStore(configuration);
      const initial = store.load();
      const planned = store.planBackfill({
        expectedRevision: initial.state.revision,
        frontier: { height: INITIAL_HEIGHT + 1, hash: momentumHash(INITIAL_HEIGHT + 1) },
      });
      const operation = {
        expectedRevision: initial.state.revision,
        plan: planned.plan,
        momentums: momentumsFor(planned, initial.state),
      };
      store.close();
      store = openZenonFundingObserverSqliteStore(openOptions(configuration, initial.recordKey, {
        testHooks: { [phase]: () => { throw new Error('synthetic'); } },
      }));
      expectCode(() => store.applyPage(operation), expectedCode);
      if (phase === 'beforeCommit') {
        assert.equal(store.load().state.revision, 0);
        store.close();
      } else {
        expectCode(() => store.load(), 'ZENON_FUNDING_OBSERVER_STORE_CLOSED');
      }
      const reopened = openZenonFundingObserverSqliteStore(
        openOptions(configuration, initial.recordKey),
      );
      assert.equal(reopened.load().state.revision, expectedRevision);
      reopened.close();
    });
  }
});

test('hook-reentrant close is fixed, rolls back, and leaves the handle usable', t => {
  const directory = privateDirectoryFor(t);
  const configuration = createOptions(directory);
  let store = createZenonFundingObserverSqliteStore(configuration);
  const initial = store.load();
  const planned = store.planBackfill({
    expectedRevision: initial.state.revision,
    frontier: { height: INITIAL_HEIGHT + 1, hash: momentumHash(INITIAL_HEIGHT + 1) },
  });
  const operation = {
    expectedRevision: initial.state.revision,
    plan: planned.plan,
    momentums: momentumsFor(planned, initial.state),
  };
  store.close();
  store = openZenonFundingObserverSqliteStore(openOptions(configuration, initial.recordKey, {
    testHooks: {
      beforeCommit: () => {
        expectCode(
          () => store.close(),
          'ZENON_FUNDING_OBSERVER_STORE_REENTRANT_OPERATION',
        );
      },
    },
  }));
  expectCode(
    () => store.applyPage(operation),
    'ZENON_FUNDING_OBSERVER_STORE_TEST_HOOK_FAILED',
  );
  assert.equal(store.load().state.revision, initial.state.revision);
  store.close();
});

test('process crash before commit reveals old state and after commit reveals new state', async t => {
  for (const [phase, expectedRevision] of [['beforeCommit', 0], ['afterCommit', 1]]) {
    await t.test(phase, async t => {
      const directory = privateDirectoryFor(t);
      const configuration = createOptions(directory);
      const store = createZenonFundingObserverSqliteStore(configuration);
      const initial = store.load();
      const planned = store.planBackfill({
        expectedRevision: initial.state.revision,
        frontier: { height: INITIAL_HEIGHT + 1, hash: momentumHash(INITIAL_HEIGHT + 1) },
      });
      const operation = {
        expectedRevision: initial.state.revision,
        plan: planned.plan,
        momentums: momentumsFor(planned, initial.state),
      };
      store.close();
      await crashAt(configuration, initial.recordKey, phase, operation);
      if (phase === 'beforeCommit') {
        assert.equal(existsSync(`${configuration.databasePath}-journal`), true);
      }
      const reopened = openZenonFundingObserverSqliteStore(
        openOptions(configuration, initial.recordKey),
      );
      assert.equal(reopened.load().state.revision, expectedRevision);
      if (expectedRevision === 0) {
        assert.equal(reopened.applyPage(operation).state.revision, 1);
      } else {
        assert.equal(reopened.applyPage({ ...operation, expectedRevision: 1 }).disposition, 'REPLAY');
      }
      reopened.close();
    });
  }
});

test('replacement, corruption, and unexpected sidecars latch fail closed without repair', async t => {
  await t.test('file replacement', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    const store = createZenonFundingObserverSqliteStore(configuration);
    const replacement = join(directory, 'replacement.sqlite');
    copyFileSync(configuration.databasePath, replacement);
    chmodSync(replacement, 0o600);
    renameSync(configuration.databasePath, join(directory, 'original.sqlite'));
    renameSync(replacement, configuration.databasePath);
    expectCode(() => store.load(), 'ZENON_FUNDING_OBSERVER_STORE_UNSAFE_FILE');
    expectCode(() => store.load(), 'ZENON_FUNDING_OBSERVER_STORE_CLOSED');
    assert.equal(existsSync(join(directory, 'original.sqlite')), true);
    assert.equal(existsSync(configuration.databasePath), true);
  });
  await t.test('corrupt envelope', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    const store = createZenonFundingObserverSqliteStore(configuration);
    const database = new DatabaseSync(configuration.databasePath);
    database.prepare(`UPDATE ${TABLE_NAME} SET envelope = ? WHERE singleton = 1`).run('{}');
    database.close();
    expectCode(() => store.load(), 'ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
    expectCode(() => store.load(), 'ZENON_FUNDING_OBSERVER_STORE_CLOSED');
    assert.equal(readFileSync(configuration.databasePath).length > 0, true);
  });
  await t.test('unexpected sidecar', t => {
    const directory = privateDirectoryFor(t);
    const configuration = createOptions(directory);
    const store = createZenonFundingObserverSqliteStore(configuration);
    const sidecar = `${configuration.databasePath}-wal`;
    writeFileSync(sidecar, 'unexpected', { mode: 0o600 });
    expectCode(
      () => store.load(),
      'ZENON_FUNDING_OBSERVER_STORE_UNEXPECTED_SIDECAR',
    );
    assert.equal(existsSync(sidecar), true);
  });
});

test('hostile and oversized method inputs fail before committed state changes', async t => {
  const directory = privateDirectoryFor(t);
  const configuration = createOptions(directory);
  const store = createZenonFundingObserverSqliteStore(configuration);
  const before = store.load().state;
  const persisted = readEnvelope(configuration).envelopeText;
  const getter = {};
  Object.defineProperty(getter, 'height', { enumerable: true, get() { throw new Error('getter'); } });
  getter.hash = momentumHash(INITIAL_HEIGHT + 1);
  for (const [name, operation] of [
    ['proxy', () => store.planBackfill({
      expectedRevision: before.revision,
      frontier: new Proxy({ height: INITIAL_HEIGHT + 1, hash: momentumHash(INITIAL_HEIGHT + 1) }, {}),
    })],
    ['accessor', () => store.planBackfill({ expectedRevision: before.revision, frontier: getter })],
    ['cycle', () => {
      const frontier = { height: INITIAL_HEIGHT + 1, hash: momentumHash(INITIAL_HEIGHT + 1) };
      frontier.self = frontier;
      return store.planBackfill({ expectedRevision: before.revision, frontier });
    }],
    ['oversized', () => store.planBackfill({
      expectedRevision: before.revision,
      frontier: { height: INITIAL_HEIGHT + 1, hash: 'x'.repeat(600_000) },
    })],
  ]) {
    await t.test(name, () => {
      expectCode(operation, 'ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
      assert.equal(readEnvelope(configuration).envelopeText, persisted);
    });
  }
  store.close();
});

test('projected committed candidate remains privacy-safe and cannot activate service credit', async t => {
  const directory = privateDirectoryFor(t);
  const configuration = createOptions(directory);
  const store = createZenonFundingObserverSqliteStore(configuration);
  reachThreshold(store);
  const candidate = store.projectCommittedCandidate();
  const serialized = JSON.stringify(candidate);
  for (const forbidden of [
    'endpoint', 'authorizationHeader', 'signedBlock', 'signature', 'wallet',
    'rawTransaction', 'rawPayment', 'privateKey', 'mnemonic',
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.equal(serialized.includes('"authenticated":true'), false);
  assert.equal(Object.hasOwn(candidate, 'evidenceVersion'), false);
  assert.equal(Object.hasOwn(candidate, 'evidenceType'), false);

  const model = new InMemoryServiceCreditModel({ deriveCost: () => 1, now: () => NOW });
  const resourceUrl = 'https://service.example/credits/zenon-fund';
  const activationOffer = {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    providerId: 'provider.reference',
    serviceId: 'service.reference',
    resourceId: 'resource.zenon.funding',
    resourceBinding: deriveServiceCreditResourceBinding({
      resourceId: 'resource.zenon.funding',
      resourceUrl,
    }),
    offerId: 'offer.zenon.reference',
    offerVersion: 1,
    costPolicyId: 'cost.fixed',
    fundingPolicyId: 'funding.exact.zenon.authenticated-evidence',
    fundingPolicyVersion: 1,
  };
  model.registerOffer(activationOffer);
  let mutationCalls = 0;
  const activation = createZenonFundingEvidenceActivation({
    store: {
      getOffer: input => model.getOffer(input),
      activateGrantFromTrustedRecord: input => {
        mutationCalls += 1;
        return model.activateGrantFromTrustedRecord(input);
      },
    },
    deriveFundingTerms: input => ({
      fundingPolicyId: input.offer.fundingPolicyId,
      fundingPolicyVersion: input.offer.fundingPolicyVersion,
      totalUnits: 10,
      expiresAt: NOW + 10_000,
      requirement: {
        scheme: 'exact',
        network: 'zenon:testnet',
        asset: 'zts1syntheticasset',
        amount: '7',
        payTo: 'z1syntheticpayee',
        maxTimeoutSeconds: 30,
        extra: {
          paymentFlow: 'upfront',
          poc: true,
          settlement: 'account-block',
          zenonChain: { ...CHAIN_PROFILE },
          minimumMomentumConfirmations: 3,
        },
      },
    }),
    verifyFundingEvidence: async value => value,
    authorityProfile: {
      profileId: 'authority.zenon.authenticated.reference',
      profileVersion: 1,
      verifierVersion: 1,
      recordDigest: digest('9'),
      network: 'zenon:testnet',
      chainProfile: { ...CHAIN_PROFILE },
      confirmationPolicy: {
        policyId: 'zenon.authenticated-momentum-inclusion',
        policyVersion: 1,
        minimumConfirmations: 3,
      },
    },
    now: () => NOW,
  });
  const prepared = activation.createFundingResource({
    selection: {
      offerId: activationOffer.offerId,
      offerVersion: activationOffer.offerVersion,
      holderId: 'z1syntheticpayer',
      capabilityCommitment: digest('5'),
    },
    resourceUrl,
  });
  await assert.rejects(
    () => activation.activate({
      intent: prepared.activationIntent,
      paymentRequired: prepared.paymentRequired,
      fundingEvidence: candidate,
    }),
    error => (
      error?.code === 'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_INVALID_INPUT'
      || error?.code === 'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED'
    ),
  );
  assert.equal(mutationCalls, 0);
  assert.equal(model.exportState().grants.length, 0);
  store.close();
});

test('store has no migration, deletion, active export, or live-source surface', () => {
  const source = readFileSync(
    new URL('../src/service-credit-zenon-funding-observer-sqlite-store.js', import.meta.url),
    'utf8',
  );
  for (const forbidden of [
    'migrate', 'repair', 'downgrade', 'unlinkSync', 'rmSync', 'renameSync',
    'verifyFundingEvidence', 'activateGrantFromTrustedRecord', 'WebSocket', 'fetch(',
  ]) {
    assert.equal(source.includes(forbidden), false);
  }
  const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  assert.equal(packageJson.includes('service-credit-zenon-funding-observer-sqlite-store'), false);
});
