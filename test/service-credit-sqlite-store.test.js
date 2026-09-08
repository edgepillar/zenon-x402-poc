import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  openSync,
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
  SERVICE_CREDIT_SQLITE_SCHEMA_VERSION,
  ServiceCreditSqliteStore,
  migrateServiceCreditSqliteStore,
} from '../src/service-credit-sqlite-store.js';
import {
  GRANT_LIFECYCLE,
  REQUEST_STATE,
  SERVICE_CREDIT_ACTIVATION_VERSION,
  SERVICE_CREDIT_MODEL_VERSION,
} from '../src/service-credit-model.js';

const NOW = 2_000_000_000_000;
const APPLICATION_ID = 0x53435244;
const PHYSICAL_V2_CHECKSUM_DOMAIN = 'zenon-x402:service-credit-sqlite-physical-v2';

function digest(fill) {
  return `sha256:${fill.repeat(64)}`;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function publicChecksumFor(schemaVersion, revision, state) {
  return `sha256:${createHash('sha256').update(canonicalJson({
    revision,
    schemaVersion,
    state,
  })).digest('hex')}`;
}

function physicalV2ChecksumFor(physicalVersion, revision, ledgerState, executionState) {
  return `sha256:${createHash('sha256')
    .update(PHYSICAL_V2_CHECKSUM_DOMAIN)
    .update('\0')
    .update(canonicalJson({
      executionState,
      ledgerState,
      physicalVersion,
      revision,
    }))
    .digest('hex')}`;
}

function physicalV2Envelope(revision, ledgerState, executionState = null) {
  const envelope = {
    physicalVersion: 2,
    revision,
    ledgerState,
    executionState,
  };
  return {
    ...envelope,
    checksum: physicalV2ChecksumFor(
      envelope.physicalVersion,
      envelope.revision,
      envelope.ledgerState,
      envelope.executionState,
    ),
  };
}

function publicEnvelope(revision, state) {
  return {
    schemaVersion: 1,
    revision,
    state,
    checksum: publicChecksumFor(1, revision, state),
  };
}

function readPersistedEnvelope(configuration) {
  const database = new DatabaseSync(configuration.databasePath, { readOnly: true });
  const userVersion = database.prepare('PRAGMA user_version').get().user_version;
  const envelopeText = database.prepare(
    'SELECT envelope FROM service_credit_ledger WHERE singleton = 1',
  ).get().envelope;
  database.close();
  return { envelope: JSON.parse(envelopeText), envelopeText, userVersion };
}

function writePersistedEnvelope(configuration, userVersion, envelopeText) {
  const database = new DatabaseSync(configuration.databasePath);
  database.prepare(
    'UPDATE service_credit_ledger SET envelope = ? WHERE singleton = 1',
  ).run(envelopeText);
  database.exec(`PRAGMA user_version = ${userVersion}`);
  database.close();
}

function rewriteAsPhysicalV1(configuration) {
  const persisted = readPersistedEnvelope(configuration);
  const legacy = publicEnvelope(persisted.envelope.revision, persisted.envelope.ledgerState);
  const envelopeText = canonicalJson(legacy);
  writePersistedEnvelope(configuration, 1, envelopeText);
  return { envelope: legacy, envelopeText };
}

function rewriteLedgerState(configuration, mutate) {
  const database = new DatabaseSync(configuration.databasePath);
  const envelope = JSON.parse(
    database.prepare('SELECT envelope FROM service_credit_ledger').get().envelope,
  );
  mutate(envelope.ledgerState);
  envelope.checksum = physicalV2ChecksumFor(
    envelope.physicalVersion,
    envelope.revision,
    envelope.ledgerState,
    envelope.executionState,
  );
  database.prepare('UPDATE service_credit_ledger SET envelope = ?').run(canonicalJson(envelope));
  database.close();
}

function offer() {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    providerId: 'provider.alpha',
    serviceId: 'service.lookup',
    resourceId: 'resource.lookup',
    resourceBinding: digest('e'),
    offerId: 'offer.standard',
    offerVersion: 1,
    costPolicyId: 'policy.fixed',
    fundingPolicyId: 'funding.fixed',
    fundingPolicyVersion: 1,
  };
}

function grant(overrides = {}) {
  const transactionLabel = overrides.transactionId ?? 'transaction.public.1';
  const paymentIntent = overrides.paymentIntent ?? {};
  const holderId = overrides.holderId ?? 'holder.public.1';
  const payer = overrides.payer ?? holderId;
  const {
    modelVersion: ignoredModelVersion,
    paymentIntent: ignoredPaymentIntent,
    holderId: ignoredHolderId,
    payer: ignoredPayer,
    ...rest
  } = overrides;
  return {
    activationVersion: SERVICE_CREDIT_ACTIVATION_VERSION,
    authorityProfileId: 'authority.mock.reference',
    authorityProfileVersion: 1,
    verifierVersion: 1,
    authorityRecordDigest: digest('d'),
    fundingPolicyId: 'funding.fixed',
    fundingPolicyVersion: 1,
    sourceSettlementId: 'settlement.public.1',
    transactionId: `mocktx:${createHash('sha256').update(transactionLabel).digest('hex')}`,
    providerId: 'provider.alpha',
    serviceId: 'service.lookup',
    resourceId: 'resource.lookup',
    resourceBinding: digest('e'),
    offerId: 'offer.standard',
    offerVersion: 1,
    holderId,
    capabilityCommitment: digest('a'),
    totalUnits: 10,
    expiresAt: NOW + 10_000,
    scheme: 'exact',
    paymentFlow: 'upfront',
    network: 'zenon:mock',
    chainProfile: {
      version: 1,
      chainIdentifier: Number.MAX_SAFE_INTEGER.toString(),
      genesisMomentumHash: '0'.repeat(64),
    },
    asset: 'zts1mockasset',
    amount: '1',
    payee: 'payee.mock.1',
    payer,
    paymentResourceDigest: digest('4'),
    paymentRequirementDigest: paymentIntent.requirementId
      ? `sha256:${createHash('sha256').update(paymentIntent.requirementId).digest('hex')}`
      : digest('2'),
    paymentIntentDigest: paymentIntent.intentId
      ? `sha256:${createHash('sha256').update(paymentIntent.intentId).digest('hex')}`
      : digest('1'),
    grantFundingCommitment: digest('3'),
    evidenceState: 'MOMENTUM_INCLUDED',
    confirmationPolicy: {
      policyId: 'mock.momentum-included',
      policyVersion: 1,
      minimumConfirmations: 1,
    },
    ...rest,
    transactionId: `mocktx:${createHash('sha256').update(transactionLabel).digest('hex')}`,
  };
}

function request(grantId, overrides = {}) {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    grantId,
    requestId: 'request.1',
    method: 'POST',
    routeId: 'lookup.v1',
    canonicalBodyDigest: digest('b'),
    selectedContentType: 'application/json',
    maxCostUnits: Number.MAX_SAFE_INTEGER,
    ...overrides,
  };
}

function result(overrides = {}) {
  return {
    statusCode: 200,
    contentType: 'application/json',
    resultCode: 'lookup.completed',
    ...overrides,
  };
}

function executionPolicy(overrides = {}) {
  return {
    policyId: 'execution.local.fixed',
    policyVersion: 1,
    maxDurationMs: 5_000,
    ...overrides,
  };
}

function withPrivateDirectory(run) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'service-credit-store-')));
  chmodSync(directory, 0o700);
  try {
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function options(directory, overrides = {}) {
  return {
    databasePath: join(directory, 'ledger.sqlite'),
    allowedRoot: directory,
    now: () => NOW,
    deriveCost: () => 3,
    ...overrides,
  };
}

function expectCode(operation, code) {
  assert.throws(operation, error => {
    assert.equal(error?.code, code);
    assert.equal(error?.message, code);
    return true;
  });
}

function privateDirectoryFor(t) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'service-credit-store-')));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function initializedStore(directory, overrides = {}, grantOverrides = {}) {
  const store = ServiceCreditSqliteStore.create(options(directory, overrides));
  store.registerOffer(offer());
  const activeGrant = store.activateGrantFromTrustedRecord(grant(grantOverrides));
  return { activeGrant, store };
}

function createPhysicalV1(configuration, populate = () => {}) {
  const store = ServiceCreditSqliteStore.create(configuration);
  populate(store);
  const projection = store.load();
  store.close();
  const legacy = rewriteAsPhysicalV1(configuration);
  return { legacy, projection };
}

const RACE_CHILD_SOURCE = String.raw`
  import { ServiceCreditSqliteStore } from './src/service-credit-sqlite-store.js';
  let store;
  let operation;
  process.on('message', message => {
    if (message.type === 'initialize') {
      operation = message.operation;
      try {
        store = ServiceCreditSqliteStore.openExisting({
          databasePath: message.databasePath,
          allowedRoot: message.allowedRoot,
          busyTimeoutMs: 10000,
          now: () => message.now,
          deriveCost: () => message.cost,
        });
        process.send({ type: 'ready' });
      } catch (error) {
        process.send({ type: 'openError', code: error?.code ?? 'UNKNOWN' });
      }
      return;
    }
    if (message.type !== 'go') return;
    let response;
    try {
      if (operation.kind === 'reserve') {
        const value = store.reserveRequest(operation.input);
        response = { ok: true, replayed: value.replayed, state: value.request.state };
      } else if (operation.kind === 'begin') {
        const value = store.beginExecution(operation.input);
        response = { ok: true, executionAuthorized: value.executionAuthorized };
      } else if (operation.kind === 'revoke') {
        const value = store.revokeGrant(operation.input);
        response = { ok: true, lifecycle: value.lifecycle };
      } else if (operation.kind === 'activate') {
        const value = store.activateGrantFromTrustedRecord(operation.input);
        response = {
          ok: true,
          activationId: value.activationId,
          grantId: value.grantId,
        };
      } else if (operation.kind === 'durablePrepare') {
        const value = store.prepareDurableExecution(operation.input);
        response = { ok: true, disposition: value.disposition };
      } else if (operation.kind === 'durableInitialize') {
        const value = store.initializeDurableExecution(operation.input);
        response = { ok: true, disposition: value.disposition };
      } else if (operation.kind === 'durableFence') {
        const value = store.persistDurableExecutionFence(operation.input);
        response = { ok: true, disposition: value.disposition };
      } else if (operation.kind === 'durableComplete') {
        const value = store.completeDurableExecution(operation.input);
        response = { ok: true, disposition: value.disposition, winner: value.winner };
      } else if (operation.kind === 'durableUnknown') {
        const value = store.markDurableExecutionUnknown(operation.input);
        response = { ok: true, disposition: value.disposition, winner: value.winner };
      } else if (operation.kind === 'durableRecover') {
        const value = store.recoverDurableExecutionsAfterRestart(operation.input);
        response = { ok: true, disposition: value.disposition };
      } else {
        response = { ok: false, code: 'UNKNOWN_OPERATION' };
      }
    } catch (error) {
      response = { ok: false, code: error?.code ?? 'UNKNOWN' };
    }
    try { store.close(); } catch {}
    process.send({ type: 'done', response }, () => process.disconnect());
  });
`;

function runBarrierRace(directory, operations, { cost = 3, now = NOW } = {}) {
  return new Promise((resolveRace, rejectRace) => {
    const children = operations.map(() => spawn(
      process.execPath,
      ['--input-type=module', '--eval', RACE_CHILD_SOURCE],
      {
        cwd: process.cwd(),
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      },
    ));
    const responses = new Array(children.length);
    let ready = 0;
    let done = 0;
    let settled = false;
    const timer = setTimeout(() => finish(new Error('child-race-timeout')), 15_000);

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
          finish(new Error('child-race-failed'));
        }
      });
      child.on('message', message => {
        if (message?.type === 'openError') {
          finish(new Error(`child-open-${message.code}`));
        } else if (message?.type === 'ready') {
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
        databasePath: join(directory, 'ledger.sqlite'),
        allowedRoot: directory,
        cost,
        now,
        operation: operations[index],
      });
    });
  });
}

const CRASH_CHILD_SOURCE = String.raw`
  import { ServiceCreditSqliteStore } from './src/service-credit-sqlite-store.js';
  process.on('message', message => {
    const hook = ({ operation }) => {
      if (operation === 'beginExecution') process.kill(process.pid, 'SIGKILL');
    };
    const store = ServiceCreditSqliteStore.openExisting({
      databasePath: message.databasePath,
      allowedRoot: message.allowedRoot,
      busyTimeoutMs: 10000,
      now: () => message.now,
      deriveCost: () => message.cost,
      testHooks: { [message.phase]: hook },
    });
    store.beginExecution(message.reference);
  });
`;

function crashAtCommitBoundary(directory, phase, reference) {
  return new Promise((resolveCrash, rejectCrash) => {
    const child = spawn(process.execPath, [
      '--input-type=module',
      '--eval',
      CRASH_CHILD_SOURCE,
    ], {
      cwd: process.cwd(),
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectCrash(new Error('commit-boundary-timeout'));
    }, 10_000);
    child.once('error', error => {
      clearTimeout(timer);
      rejectCrash(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (code === null && signal === 'SIGKILL') resolveCrash();
      else rejectCrash(new Error('commit-boundary-child-did-not-crash'));
    });
    child.send({
      databasePath: join(directory, 'ledger.sqlite'),
      allowedRoot: directory,
      cost: 3,
      now: NOW,
      phase,
      reference,
    });
  });
}

const MIGRATION_RACE_CHILD_SOURCE = String.raw`
  import { migrateServiceCreditSqliteStore } from './src/service-credit-sqlite-store.js';
  let configuration;
  process.on('message', message => {
    if (message.type === 'initialize') {
      configuration = {
        databasePath: message.databasePath,
        allowedRoot: message.allowedRoot,
        busyTimeoutMs: 10000,
        now: () => message.now,
        deriveCost: () => message.cost,
      };
      process.send({ type: 'ready' });
      return;
    }
    if (message.type !== 'go') return;
    let response;
    try {
      const store = migrateServiceCreditSqliteStore(configuration);
      store.close();
      response = { ok: true };
    } catch (error) {
      response = { ok: false, code: error?.code ?? 'UNKNOWN' };
    }
    process.send({ type: 'done', response }, () => process.disconnect());
  });
`;

function runMigrationRace(directory) {
  return new Promise((resolveRace, rejectRace) => {
    const children = [0, 1].map(() => spawn(
      process.execPath,
      ['--input-type=module', '--eval', MIGRATION_RACE_CHILD_SOURCE],
      {
        cwd: process.cwd(),
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      },
    ));
    const responses = new Array(children.length);
    let ready = 0;
    let done = 0;
    let settled = false;
    const timer = setTimeout(() => finish(new Error('migration-race-timeout')), 15_000);

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
          finish(new Error('migration-race-child-failed'));
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
        databasePath: join(directory, 'ledger.sqlite'),
        allowedRoot: directory,
        cost: 3,
        now: NOW,
      });
    });
  });
}

const MIGRATION_CRASH_CHILD_SOURCE = String.raw`
  import { migrateServiceCreditSqliteStore } from './src/service-credit-sqlite-store.js';
  process.on('message', message => {
    const hook = () => process.kill(process.pid, 'SIGKILL');
    migrateServiceCreditSqliteStore({
      databasePath: message.databasePath,
      allowedRoot: message.allowedRoot,
      busyTimeoutMs: 10000,
      now: () => message.now,
      deriveCost: () => message.cost,
      testHooks: { [message.phase]: hook },
    });
  });
`;

function crashMigrationAtBoundary(directory, phase) {
  return new Promise((resolveCrash, rejectCrash) => {
    const child = spawn(process.execPath, [
      '--input-type=module',
      '--eval',
      MIGRATION_CRASH_CHILD_SOURCE,
    ], {
      cwd: process.cwd(),
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectCrash(new Error('migration-crash-timeout'));
    }, 10_000);
    child.once('error', error => {
      clearTimeout(timer);
      rejectCrash(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (code === null && signal === 'SIGKILL') resolveCrash();
      else rejectCrash(new Error('migration-child-did-not-crash'));
    });
    child.send({
      databasePath: join(directory, 'ledger.sqlite'),
      allowedRoot: directory,
      cost: 3,
      now: NOW,
      phase,
    });
  });
}

test('explicit create persists a reservation and openExisting recovers it without repricing', () => {
  withPrivateDirectory(directory => {
    const pricing = { calls: 0, fail: false };
    const configuration = options(directory, {
      deriveCost: () => {
        pricing.calls += 1;
        if (pricing.fail) throw new Error('synthetic-pricing-detail');
        return 3;
      },
    });
    const created = ServiceCreditSqliteStore.create(configuration);
    created.registerOffer(offer());
    const activeGrant = created.activateGrantFromTrustedRecord(grant());
    const reserved = created.reserveRequest(request(activeGrant.grantId));
    assert.equal(reserved.request.state, REQUEST_STATE.RESERVED);
    assert.equal(pricing.calls, 1);
    const revision = created.getMetadata().revision;
    created.close();

    pricing.fail = true;
    const reopened = ServiceCreditSqliteStore.openExisting(configuration);
    const replay = reopened.reserveRequest(request(activeGrant.grantId));
    assert.equal(replay.replayed, true);
    assert.equal(replay.request.costUnits, 3);
    assert.equal(pricing.calls, 1);
    assert.equal(reopened.getMetadata().revision, revision);
    reopened.close();
  });
});

test('openExisting never creates a missing database', () => {
  withPrivateDirectory(directory => {
    assert.throws(
      () => ServiceCreditSqliteStore.openExisting(options(directory)),
      error => error?.code === 'SERVICE_CREDIT_STORE_MISSING',
    );
  });
});

test('restart preserves every request state, pinned cost/result, lifecycle, and counters', async t => {
  const states = [
    REQUEST_STATE.RESERVED,
    REQUEST_STATE.EXECUTING,
    REQUEST_STATE.OUTCOME_UNKNOWN,
    REQUEST_STATE.SUCCEEDED,
    REQUEST_STATE.FAILED_RELEASED,
  ];

  for (const state of states) {
    await t.test(state, t => {
      const directory = privateDirectoryFor(t);
      let pricingCalls = 0;
      const configuration = options(directory, {
        deriveCost: () => {
          pricingCalls += 1;
          return 3;
        },
      });
      const store = ServiceCreditSqliteStore.create(configuration);
      store.registerOffer(offer());
      const activeGrant = store.activateGrantFromTrustedRecord(grant());
      const input = request(activeGrant.grantId);
      store.reserveRequest(input);
      if ([
        REQUEST_STATE.EXECUTING,
        REQUEST_STATE.OUTCOME_UNKNOWN,
        REQUEST_STATE.SUCCEEDED,
      ].includes(state)) {
        store.beginExecution({ grantId: activeGrant.grantId, requestId: input.requestId });
      }
      if (state === REQUEST_STATE.OUTCOME_UNKNOWN) {
        store.markOutcomeUnknown({ grantId: activeGrant.grantId, requestId: input.requestId });
      } else if (state === REQUEST_STATE.SUCCEEDED) {
        store.completeExecution({
          grantId: activeGrant.grantId,
          requestId: input.requestId,
          cachedResult: result(),
        });
      } else if (state === REQUEST_STATE.FAILED_RELEASED) {
        store.releaseBeforeExecution({ grantId: activeGrant.grantId, requestId: input.requestId });
      }
      const expected = store.load();
      const expectedRevision = expected.revision;
      store.close();

      const reopened = ServiceCreditSqliteStore.openExisting(options(directory, {
        now: () => { throw new Error('recovery-must-not-read-clock'); },
        deriveCost: () => { throw new Error('replay-must-not-reprice'); },
      }));
      assert.deepEqual(reopened.load(), expected);
      const replay = reopened.reserveRequest(input);
      assert.equal(replay.replayed, true);
      assert.equal(replay.request.state, state);
      assert.equal(replay.request.costUnits, 3);
      assert.deepEqual(
        replay.request.cachedResult,
        state === REQUEST_STATE.SUCCEEDED ? result() : null,
      );
      assert.equal(reopened.getMetadata().revision, expectedRevision);
      if (state !== REQUEST_STATE.RESERVED) {
        assert.equal(
          reopened.beginExecution({
            grantId: activeGrant.grantId,
            requestId: input.requestId,
          }).executionAuthorized,
          false,
        );
      }
      assert.equal(pricingCalls, 1);
      reopened.close();
    });
  }
});

test('expiry and revocation persist monotonically and opening is clock-free', () => {
  withPrivateDirectory(directory => {
    const clock = { value: NOW };
    const configuration = options(directory, { now: () => clock.value });
    const { activeGrant, store } = initializedStore(directory, {
      now: () => clock.value,
    }, { expiresAt: NOW + 10 });
    const beforeExpiry = store.getMetadata().revision;
    clock.value = NOW + 10;
    assert.equal(store.getGrant(activeGrant.grantId).lifecycle, GRANT_LIFECYCLE.EXPIRED);
    assert.equal(store.getMetadata().revision, beforeExpiry + 1);
    store.close();

    const recovered = ServiceCreditSqliteStore.openExisting({
      ...configuration,
      now: () => { throw new Error('open-must-not-read-clock'); },
      deriveCost: () => { throw new Error('open-must-not-price'); },
    });
    assert.equal(recovered.load().state.grants[0].lifecycle, GRANT_LIFECYCLE.EXPIRED);
    recovered.close();
  });

  withPrivateDirectory(directory => {
    const clock = { value: NOW };
    const configuration = options(directory, { now: () => clock.value });
    const { activeGrant, store } = initializedStore(directory, { now: () => clock.value });
    assert.equal(store.revokeGrant({ grantId: activeGrant.grantId }).lifecycle, GRANT_LIFECYCLE.REVOKED);
    store.close();
    clock.value = NOW + 20_000;
    const recovered = ServiceCreditSqliteStore.openExisting(configuration);
    assert.equal(recovered.getGrant(activeGrant.grantId).lifecycle, GRANT_LIFECYCLE.REVOKED);
    recovered.close();
  });
});

test('an expiry caused by a failing domain operation is committed before that error returns', () => {
  withPrivateDirectory(directory => {
    const clock = { value: NOW };
    const { activeGrant, store } = initializedStore(directory, {
      now: () => clock.value,
    }, { expiresAt: NOW + 10 });
    const revision = store.getMetadata().revision;
    clock.value = NOW + 10;

    expectCode(
      () => store.reserveRequest(request(activeGrant.grantId, { requestId: 'request.new' })),
      'GRANT_NOT_ACTIVE',
    );
    assert.equal(store.getMetadata().revision, revision + 1);
    assert.equal(store.load().state.grants[0].lifecycle, GRANT_LIFECYCLE.EXPIRED);
    store.close();

    const reopened = ServiceCreditSqliteStore.openExisting(options(directory));
    assert.equal(reopened.getGrant(activeGrant.grantId).lifecycle, GRANT_LIFECYCLE.EXPIRED);
    reopened.close();
  });
});

test('no-op replays do not advance the durable revision', () => {
  withPrivateDirectory(directory => {
    const { activeGrant, store } = initializedStore(directory);
    const input = request(activeGrant.grantId);
    store.reserveRequest(input);
    const afterReserve = store.getMetadata().revision;
    store.reserveRequest(input);
    store.getOffer({ offerId: 'offer.standard', offerVersion: 1 });
    store.getRequest({ grantId: activeGrant.grantId, requestId: input.requestId });
    assert.equal(store.getMetadata().revision, afterReserve);
    store.beginExecution({ grantId: activeGrant.grantId, requestId: input.requestId });
    const afterBegin = store.getMetadata().revision;
    assert.equal(
      store.beginExecution({ grantId: activeGrant.grantId, requestId: input.requestId })
        .executionAuthorized,
      false,
    );
    assert.equal(store.getMetadata().revision, afterBegin);
    store.close();
  });
});

test('create is exclusive and produces a private single-link DELETE-mode database', () => {
  withPrivateDirectory(directory => {
    const configuration = options(directory);
    const store = ServiceCreditSqliteStore.create(configuration);
    const metadata = store.getMetadata();
    assert.equal(metadata.revision, 0);
    const stat = lstatSync(configuration.databasePath);
    assert.equal(stat.isFile(), true);
    assert.equal(stat.isSymbolicLink(), false);
    assert.equal(stat.mode & 0o777, 0o600);
    assert.equal(stat.nlink, 1);
    store.close();

    expectCode(
      () => ServiceCreditSqliteStore.create(configuration),
      'SERVICE_CREDIT_STORE_ALREADY_EXISTS',
    );
    const database = new DatabaseSync(configuration.databasePath, { readOnly: true });
    assert.equal(database.prepare('PRAGMA journal_mode').get().journal_mode, 'delete');
    database.close();
    assert.equal(existsSync(`${configuration.databasePath}-wal`), false);
    assert.equal(existsSync(`${configuration.databasePath}-shm`), false);
  });
});

test('path escape, permissive directories, symlinks, hardlinks, and mode drift fail closed', async t => {
  await t.test('path escape', t => {
    const allowedRoot = privateDirectoryFor(t);
    const outside = privateDirectoryFor(t);
    expectCode(
      () => ServiceCreditSqliteStore.create(options(allowedRoot, {
        databasePath: join(outside, 'ledger.sqlite'),
      })),
      'SERVICE_CREDIT_STORE_PATH_OUTSIDE_ALLOWED_ROOT',
    );
  });

  await t.test('permissive directory', t => {
    const directory = privateDirectoryFor(t);
    chmodSync(directory, 0o755);
    expectCode(
      () => ServiceCreditSqliteStore.create(options(directory)),
      'SERVICE_CREDIT_STORE_UNSAFE_DIRECTORY',
    );
  });

  await t.test('database mode is never repaired on open', t => {
    const directory = privateDirectoryFor(t);
    const configuration = options(directory);
    const store = ServiceCreditSqliteStore.create(configuration);
    store.close();
    chmodSync(configuration.databasePath, 0o644);
    expectCode(
      () => ServiceCreditSqliteStore.openExisting(configuration),
      'SERVICE_CREDIT_STORE_UNSAFE_FILE',
    );
    assert.equal(lstatSync(configuration.databasePath).mode & 0o777, 0o644);
  });

  await t.test('hardlink', t => {
    const directory = privateDirectoryFor(t);
    const configuration = options(directory);
    const store = ServiceCreditSqliteStore.create(configuration);
    store.close();
    linkSync(configuration.databasePath, join(directory, 'linked.sqlite'));
    expectCode(
      () => ServiceCreditSqliteStore.openExisting(configuration),
      'SERVICE_CREDIT_STORE_UNSAFE_FILE',
    );
  });

  await t.test('symlink', t => {
    const directory = privateDirectoryFor(t);
    const configuration = options(directory);
    const store = ServiceCreditSqliteStore.create(configuration);
    store.close();
    const alias = join(directory, 'alias.sqlite');
    symlinkSync(configuration.databasePath, alias);
    expectCode(
      () => ServiceCreditSqliteStore.openExisting({
        ...configuration,
        databasePath: alias,
      }),
      'SERVICE_CREDIT_STORE_UNSAFE_FILE',
    );
  });
});

test('an open store detects unexpected pathname replacement before another operation', () => {
  withPrivateDirectory(directory => {
    const configuration = options(directory);
    const store = ServiceCreditSqliteStore.create(configuration);
    const displaced = join(directory, 'displaced.sqlite');
    renameSync(configuration.databasePath, displaced);
    copyFileSync(displaced, configuration.databasePath);
    chmodSync(configuration.databasePath, 0o600);

    expectCode(() => store.getMetadata(), 'SERVICE_CREDIT_STORE_UNSAFE_FILE');
    store.close();
  });
});

test('unknown schema, invalid checksum, malformed bytes, and schema drift are rejected safely', async t => {
  await t.test('unknown database schema', t => {
    const directory = privateDirectoryFor(t);
    const configuration = options(directory);
    const database = new DatabaseSync(configuration.databasePath);
    database.close();
    chmodSync(configuration.databasePath, 0o600);
    expectCode(
      () => ServiceCreditSqliteStore.openExisting(configuration),
      'SERVICE_CREDIT_STORE_SCHEMA_UNSUPPORTED',
    );
  });

  await t.test('invalid checksum', t => {
    const directory = privateDirectoryFor(t);
    const configuration = options(directory);
    const store = ServiceCreditSqliteStore.create(configuration);
    store.close();
    const database = new DatabaseSync(configuration.databasePath);
    const row = database.prepare('SELECT envelope FROM service_credit_ledger').get();
    const envelope = JSON.parse(row.envelope);
    envelope.checksum = digest('f');
    database.prepare('UPDATE service_credit_ledger SET envelope = ?').run(
      JSON.stringify(envelope),
    );
    database.close();
    expectCode(
      () => ServiceCreditSqliteStore.openExisting(configuration),
      'SERVICE_CREDIT_STORE_CORRUPT',
    );
  });

  await t.test('unknown physical envelope schema', t => {
    const directory = privateDirectoryFor(t);
    const configuration = options(directory);
    const store = ServiceCreditSqliteStore.create(configuration);
    store.close();
    const database = new DatabaseSync(configuration.databasePath);
    const envelope = JSON.parse(
      database.prepare('SELECT envelope FROM service_credit_ledger').get().envelope,
    );
    envelope.physicalVersion = 3;
    database.prepare('UPDATE service_credit_ledger SET envelope = ?').run(
      JSON.stringify(envelope),
    );
    database.close();
    expectCode(
      () => ServiceCreditSqliteStore.openExisting(configuration),
      'SERVICE_CREDIT_STORE_SCHEMA_UNSUPPORTED',
    );
  });

  await t.test('state schema v1 is rejected without migration or deletion', t => {
    const directory = privateDirectoryFor(t);
    const configuration = options(directory);
    const store = ServiceCreditSqliteStore.create(configuration);
    store.close();
    const database = new DatabaseSync(configuration.databasePath);
    const envelope = JSON.parse(
      database.prepare('SELECT envelope FROM service_credit_ledger').get().envelope,
    );
    envelope.ledgerState.schemaVersion = 1;
    database.prepare('UPDATE service_credit_ledger SET envelope = ?').run(
      JSON.stringify(envelope),
    );
    database.close();
    expectCode(
      () => ServiceCreditSqliteStore.openExisting(configuration),
      'SERVICE_CREDIT_STORE_SCHEMA_UNSUPPORTED',
    );
    assert.equal(existsSync(configuration.databasePath), true);
    const verify = new DatabaseSync(configuration.databasePath, { readOnly: true });
    const persisted = JSON.parse(
      verify.prepare('SELECT envelope FROM service_credit_ledger').get().envelope,
    );
    verify.close();
    assert.equal(persisted.ledgerState.schemaVersion, 1);
  });

  await t.test('malformed SQLite bytes', t => {
    const directory = privateDirectoryFor(t);
    const configuration = options(directory);
    writeFileSync(configuration.databasePath, 'not-a-sqlite-database', { mode: 0o600 });
    chmodSync(configuration.databasePath, 0o600);
    expectCode(
      () => ServiceCreditSqliteStore.openExisting(configuration),
      'SERVICE_CREDIT_STORE_CORRUPT',
    );
  });

  await t.test('unexpected extra table', t => {
    const directory = privateDirectoryFor(t);
    const configuration = options(directory);
    const store = ServiceCreditSqliteStore.create(configuration);
    store.close();
    const database = new DatabaseSync(configuration.databasePath);
    database.exec('CREATE TABLE unexpected(value TEXT) STRICT');
    database.close();
    expectCode(
      () => ServiceCreditSqliteStore.openExisting(configuration),
      'SERVICE_CREDIT_STORE_CORRUPT',
    );
  });
});

test('openExisting rejects a WAL-mode database without silently converting it', () => {
  withPrivateDirectory(directory => {
    const configuration = options(directory);
    const store = ServiceCreditSqliteStore.create(configuration);
    store.close();
    const database = new DatabaseSync(configuration.databasePath);
    assert.equal(database.prepare('PRAGMA journal_mode = WAL').get().journal_mode, 'wal');
    database.close();

    expectCode(
      () => ServiceCreditSqliteStore.openExisting(configuration),
      'SERVICE_CREDIT_STORE_SCHEMA_UNSUPPORTED',
    );
    const verify = new DatabaseSync(configuration.databasePath);
    assert.equal(verify.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
    verify.close();
  });
});

test('openExisting rejects checksum-valid corrupt and duplicate activation records', async t => {
  await t.test('corrupt activation binding', t => {
    const directory = privateDirectoryFor(t);
    const configuration = options(directory);
    const store = ServiceCreditSqliteStore.create(configuration);
    store.registerOffer(offer());
    store.activateGrantFromTrustedRecord(grant());
    store.close();
    rewriteLedgerState(configuration, state => {
      state.grants[0].activation.paymentIntentDigest = digest('9');
    });
    expectCode(
      () => ServiceCreditSqliteStore.openExisting(configuration),
      'SERVICE_CREDIT_STORE_CORRUPT',
    );
  });

  await t.test('duplicate activation record', t => {
    const directory = privateDirectoryFor(t);
    const configuration = options(directory);
    const store = ServiceCreditSqliteStore.create(configuration);
    store.registerOffer(offer());
    store.activateGrantFromTrustedRecord(grant());
    store.close();
    rewriteLedgerState(configuration, state => {
      state.grants.push(structuredClone(state.grants[0]));
    });
    expectCode(
      () => ServiceCreditSqliteStore.openExisting(configuration),
      'SERVICE_CREDIT_STORE_CORRUPT',
    );
  });
});

test('record-capacity failure rolls back the entire candidate ledger', () => {
  withPrivateDirectory(directory => {
    const configuration = options(directory, { maxRequests: 1 });
    const store = ServiceCreditSqliteStore.create(configuration);
    store.registerOffer(offer());
    const activeGrant = store.activateGrantFromTrustedRecord(grant());
    store.reserveRequest(request(activeGrant.grantId, { requestId: 'request.first' }));
    const before = store.load();

    expectCode(
      () => store.reserveRequest(request(activeGrant.grantId, { requestId: 'request.second' })),
      'SERVICE_CREDIT_STORE_CAPACITY_EXCEEDED',
    );
    assert.deepEqual(store.load(), before);
    assert.equal(
      store.getRequest({ grantId: activeGrant.grantId, requestId: 'request.second' }),
      null,
    );
    store.close();

    const reopened = ServiceCreditSqliteStore.openExisting(configuration);
    assert.deepEqual(reopened.load(), before);
    reopened.close();
  });
});

test('before-commit failure rolls back while after-commit ambiguity never returns authorization', async t => {
  await t.test('before commit', t => {
    const directory = privateDirectoryFor(t);
    let failCommit = false;
    const configuration = options(directory, {
      testHooks: {
        beforeCommit({ operation }) {
          if (failCommit && operation === 'reserveRequest') {
            throw new Error('synthetic-before-commit-detail');
          }
        },
      },
    });
    const store = ServiceCreditSqliteStore.create(configuration);
    store.registerOffer(offer());
    const activeGrant = store.activateGrantFromTrustedRecord(grant());
    const before = store.load();
    failCommit = true;
    expectCode(
      () => store.reserveRequest(request(activeGrant.grantId)),
      'SERVICE_CREDIT_STORE_CALLBACK_FAILED',
    );
    failCommit = false;
    assert.deepEqual(store.load(), before);
    store.close();
  });

  await t.test('after commit', t => {
    const directory = privateDirectoryFor(t);
    let failAfterCommit = false;
    const configuration = options(directory, {
      testHooks: {
        afterCommit({ operation }) {
          if (failAfterCommit && operation === 'beginExecution') {
            throw new Error('synthetic-after-commit-detail');
          }
        },
      },
    });
    const store = ServiceCreditSqliteStore.create(configuration);
    store.registerOffer(offer());
    const activeGrant = store.activateGrantFromTrustedRecord(grant());
    store.reserveRequest(request(activeGrant.grantId));
    failAfterCommit = true;
    expectCode(
      () => store.beginExecution({
        grantId: activeGrant.grantId,
        requestId: 'request.1',
      }),
      'SERVICE_CREDIT_STORE_COMMIT_FAILED',
    );

    const reopened = ServiceCreditSqliteStore.openExisting(options(directory));
    const persisted = reopened.getRequest({
      grantId: activeGrant.grantId,
      requestId: 'request.1',
    });
    assert.equal(persisted.state, REQUEST_STATE.EXECUTING);
    assert.equal(
      reopened.beginExecution({
        grantId: activeGrant.grantId,
        requestId: 'request.1',
      }).executionAuthorized,
      false,
    );
    expectCode(
      () => reopened.reserveRequest(request(activeGrant.grantId, {
        requestId: 'request.after-ambiguous-begin',
      })),
      'UNRESOLVED_EXECUTION',
    );
    reopened.close();
  });
});

test('process death around COMMIT recovers conservatively across restart', async t => {
  await t.test('death before commit rolls back the authorization', async t => {
    const directory = privateDirectoryFor(t);
    const { activeGrant, store } = initializedStore(directory);
    const reference = { grantId: activeGrant.grantId, requestId: 'request.1' };
    store.reserveRequest(request(activeGrant.grantId));
    const before = store.load();
    store.close();

    await crashAtCommitBoundary(directory, 'beforeCommit', reference);
    const journalPath = `${join(directory, 'ledger.sqlite')}-journal`;
    assert.equal(existsSync(journalPath), true);
    assert.equal(lstatSync(journalPath).mode & 0o077, 0);

    const recovered = ServiceCreditSqliteStore.openExisting(options(directory));
    assert.deepEqual(recovered.load(), before);
    assert.equal(recovered.getRequest(reference).state, REQUEST_STATE.RESERVED);
    assert.equal(recovered.beginExecution(reference).executionAuthorized, true);
    recovered.close();
  });

  await t.test('death after commit leaves execution non-reauthorizable', async t => {
    const directory = privateDirectoryFor(t);
    const { activeGrant, store } = initializedStore(directory);
    const reference = { grantId: activeGrant.grantId, requestId: 'request.1' };
    store.reserveRequest(request(activeGrant.grantId));
    store.close();

    await crashAtCommitBoundary(directory, 'afterCommit', reference);
    const recovered = ServiceCreditSqliteStore.openExisting(options(directory));
    assert.equal(recovered.getRequest(reference).state, REQUEST_STATE.EXECUTING);
    assert.equal(recovered.beginExecution(reference).executionAuthorized, false);
    expectCode(
      () => recovered.reserveRequest(request(activeGrant.grantId, {
        requestId: 'request.after-crash',
      })),
      'UNRESOLVED_EXECUTION',
    );
    recovered.close();
  });
});

test('SQLite rollback-journal sidecars are private and removed after a normal commit', () => {
  withPrivateDirectory(directory => {
    const configuration = options(directory, {
      testHooks: {
        beforeCommit({ operation, changed }) {
          if (operation !== 'reserveRequest' || !changed) return;
          const journalPath = `${join(directory, 'ledger.sqlite')}-journal`;
          const stat = lstatSync(journalPath);
          assert.equal(stat.isFile(), true);
          assert.equal(stat.mode & 0o077, 0);
          assert.equal(stat.nlink, 1);
        },
      },
    });
    const store = ServiceCreditSqliteStore.create(configuration);
    store.registerOffer(offer());
    const activeGrant = store.activateGrantFromTrustedRecord(grant());
    store.reserveRequest(request(activeGrant.grantId));
    assert.equal(existsSync(`${configuration.databasePath}-journal`), false);
    assert.equal(existsSync(`${configuration.databasePath}-wal`), false);
    assert.equal(existsSync(`${configuration.databasePath}-shm`), false);
    store.close();
  });
});

test('caught callback-to-store reentry fails the outer operation without mutation', async t => {
  await t.test('pricing callback', t => {
    const directory = privateDirectoryFor(t);
    let store;
    let armed = false;
    const nestedCodes = [];
    const configuration = options(directory, {
      deriveCost: () => {
        if (armed) {
          try {
            store.getMetadata();
          } catch (error) {
            nestedCodes.push(error?.code);
          }
        }
        return 3;
      },
    });
    store = ServiceCreditSqliteStore.create(configuration);
    store.registerOffer(offer());
    const activeGrant = store.activateGrantFromTrustedRecord(grant());
    const before = store.load();
    armed = true;
    expectCode(
      () => store.reserveRequest(request(activeGrant.grantId)),
      'INVALID_COST',
    );
    armed = false;
    assert.deepEqual(nestedCodes, ['SERVICE_CREDIT_STORE_REENTRANT_OPERATION']);
    assert.deepEqual(store.load(), before);
    store.close();
  });

  await t.test('clock callback', t => {
    const directory = privateDirectoryFor(t);
    let store;
    let armed = false;
    const nestedCodes = [];
    const configuration = options(directory, {
      now: () => {
        if (armed) {
          try {
            store.getMetadata();
          } catch (error) {
            nestedCodes.push(error?.code);
          }
        }
        return NOW;
      },
    });
    store = ServiceCreditSqliteStore.create(configuration);
    store.registerOffer(offer());
    const activeGrant = store.activateGrantFromTrustedRecord(grant());
    const before = store.load();
    armed = true;
    expectCode(() => store.getGrant(activeGrant.grantId), 'INVALID_CLOCK');
    armed = false;
    assert.deepEqual(nestedCodes, ['SERVICE_CREDIT_STORE_REENTRANT_OPERATION']);
    assert.deepEqual(store.load(), before);
    store.close();
  });
});

test('cross-process reservations near exhaustion have one winner and conserve restart state', async t => {
  const directory = privateDirectoryFor(t);
  const { activeGrant, store } = initializedStore(directory, {
    deriveCost: () => 4,
  }, { totalUnits: 5 });
  store.close();

  const responses = await runBarrierRace(directory, [
    {
      kind: 'reserve',
      input: request(activeGrant.grantId, { requestId: 'request.alpha' }),
    },
    {
      kind: 'reserve',
      input: request(activeGrant.grantId, { requestId: 'request.beta' }),
    },
  ], { cost: 4 });
  assert.equal(responses.filter(response => response.ok).length, 1);
  assert.deepEqual(
    responses.filter(response => !response.ok).map(response => response.code),
    ['INSUFFICIENT_UNITS'],
  );

  const reopened = ServiceCreditSqliteStore.openExisting(options(directory, {
    deriveCost: () => 4,
  }));
  const grantAfter = reopened.getGrant(activeGrant.grantId);
  assert.deepEqual(
    {
      availableUnits: grantAfter.availableUnits,
      heldUnits: grantAfter.heldUnits,
      consumedUnits: grantAfter.consumedUnits,
    },
    { availableUnits: 1, heldUnits: 4, consumedUnits: 0 },
  );
  assert.equal(reopened.load().state.requests.length, 1);
  reopened.close();
});

test('cross-process beginExecution authorizes exactly one contender', async t => {
  const directory = privateDirectoryFor(t);
  const { activeGrant, store } = initializedStore(directory);
  const reference = { grantId: activeGrant.grantId, requestId: 'request.1' };
  store.reserveRequest(request(activeGrant.grantId));
  store.close();

  const responses = await runBarrierRace(directory, [
    { kind: 'begin', input: reference },
    { kind: 'begin', input: reference },
  ]);
  assert.equal(responses.every(response => response.ok), true);
  assert.equal(responses.filter(response => response.executionAuthorized).length, 1);

  const reopened = ServiceCreditSqliteStore.openExisting(options(directory));
  assert.equal(reopened.getRequest(reference).state, REQUEST_STATE.EXECUTING);
  assert.equal(reopened.beginExecution(reference).executionAuthorized, false);
  reopened.close();
});

test('unresolved admission survives reopen and blocked operations preserve revision', t => {
  const directory = privateDirectoryFor(t);
  const { activeGrant, store } = initializedStore(directory, {}, { totalUnits: 12 });
  const blocker = { grantId: activeGrant.grantId, requestId: 'request.blocker' };
  const waiting = { grantId: activeGrant.grantId, requestId: 'request.waiting' };
  store.reserveRequest(request(activeGrant.grantId, { requestId: blocker.requestId }));
  store.reserveRequest(request(activeGrant.grantId, { requestId: waiting.requestId }));
  store.beginExecution(blocker);
  const revision = store.getMetadata().revision;

  expectCode(
    () => store.reserveRequest(request(activeGrant.grantId, { requestId: 'request.new' })),
    'UNRESOLVED_EXECUTION',
  );
  expectCode(() => store.beginExecution(waiting), 'UNRESOLVED_EXECUTION');
  assert.equal(store.getMetadata().revision, revision);
  store.close();

  const reopened = ServiceCreditSqliteStore.openExisting(options(directory));
  assert.equal(reopened.getMetadata().revision, revision);
  expectCode(() => reopened.beginExecution(waiting), 'UNRESOLVED_EXECUTION');
  reopened.markOutcomeUnknown(blocker);
  const unknownRevision = reopened.getMetadata().revision;
  expectCode(
    () => reopened.reserveRequest(request(activeGrant.grantId, { requestId: 'request.later' })),
    'UNRESOLVED_EXECUTION',
  );
  assert.equal(reopened.getMetadata().revision, unknownRevision);
  reopened.reconcileRequest({ ...blocker, outcome: REQUEST_STATE.FAILED_RELEASED });
  assert.equal(reopened.beginExecution(waiting).executionAuthorized, true);
  reopened.close();
});

test('cross-process distinct pre-reserved begins have one unresolved-admission winner', async t => {
  const directory = privateDirectoryFor(t);
  const { activeGrant, store } = initializedStore(directory, {}, { totalUnits: 12 });
  const first = { grantId: activeGrant.grantId, requestId: 'request.first' };
  const second = { grantId: activeGrant.grantId, requestId: 'request.second' };
  store.reserveRequest(request(activeGrant.grantId, { requestId: first.requestId }));
  store.reserveRequest(request(activeGrant.grantId, { requestId: second.requestId }));
  store.close();

  const responses = await runBarrierRace(directory, [
    { kind: 'begin', input: first },
    { kind: 'begin', input: second },
  ]);
  assert.equal(responses.filter(response => response.ok).length, 1);
  assert.equal(
    responses.filter(response => response.ok)[0].executionAuthorized,
    true,
  );
  assert.deepEqual(
    responses.filter(response => !response.ok).map(response => response.code),
    ['UNRESOLVED_EXECUTION'],
  );

  const reopened = ServiceCreditSqliteStore.openExisting(options(directory));
  const states = [reopened.getRequest(first).state, reopened.getRequest(second).state].sort();
  assert.deepEqual(states, [REQUEST_STATE.EXECUTING, REQUEST_STATE.RESERVED].sort());
  reopened.close();
});

test('cross-process beginExecution versus revocation has one serialized authorization outcome', async t => {
  const directory = privateDirectoryFor(t);
  const { activeGrant, store } = initializedStore(directory);
  const reference = { grantId: activeGrant.grantId, requestId: 'request.1' };
  store.reserveRequest(request(activeGrant.grantId));
  store.close();

  const responses = await runBarrierRace(directory, [
    { kind: 'begin', input: reference },
    { kind: 'revoke', input: { grantId: activeGrant.grantId } },
  ]);
  const beginResponse = responses[0];
  const revokeResponse = responses[1];
  assert.equal(revokeResponse.ok, true);
  assert.equal(revokeResponse.lifecycle, GRANT_LIFECYCLE.REVOKED);
  assert.equal(
    beginResponse.ok
      ? beginResponse.executionAuthorized === true
      : beginResponse.code === 'GRANT_NOT_ACTIVE',
    true,
  );

  const reopened = ServiceCreditSqliteStore.openExisting(options(directory));
  assert.equal(reopened.getGrant(activeGrant.grantId).lifecycle, GRANT_LIFECYCLE.REVOKED);
  assert.equal(
    reopened.getRequest(reference).state,
    beginResponse.ok ? REQUEST_STATE.EXECUTING : REQUEST_STATE.RESERVED,
  );
  if (beginResponse.ok) {
    assert.equal(reopened.beginExecution(reference).executionAuthorized, false);
  } else {
    expectCode(() => reopened.beginExecution(reference), 'GRANT_NOT_ACTIVE');
  }
  reopened.close();
});

test('a competing writer times out without partial mutation and a later attempt remains usable', () => {
  withPrivateDirectory(directory => {
    const configuration = options(directory, { busyTimeoutMs: 20 });
    const store = ServiceCreditSqliteStore.create(configuration);
    store.registerOffer(offer());
    const activeGrant = store.activateGrantFromTrustedRecord(grant());
    const before = store.load();
    const blocker = new DatabaseSync(configuration.databasePath, { timeout: 20 });
    blocker.exec('BEGIN IMMEDIATE');
    try {
      expectCode(
        () => store.reserveRequest(request(activeGrant.grantId)),
        'SERVICE_CREDIT_STORE_TRANSACTION_FAILED',
      );
    } finally {
      blocker.exec('ROLLBACK');
      blocker.close();
    }

    assert.deepEqual(store.load(), before);
    assert.equal(store.reserveRequest(request(activeGrant.grantId)).replayed, false);
    store.close();
  });
});

test('busy timeout and path configuration are explicitly bounded', () => {
  withPrivateDirectory(directory => {
    for (const busyTimeoutMs of [0, -1, 60_001, 1.5]) {
      expectCode(
        () => ServiceCreditSqliteStore.create(options(directory, {
          busyTimeoutMs,
          databasePath: join(directory, `ledger-${String(busyTimeoutMs)}.sqlite`),
        })),
        'SERVICE_CREDIT_STORE_INVALID_CONFIGURATION',
      );
    }
    expectCode(
      () => ServiceCreditSqliteStore.create(options(directory, {
        databasePath: 'relative-ledger.sqlite',
      })),
      'SERVICE_CREDIT_STORE_INVALID_CONFIGURATION',
    );
  });
});

test('cost ceiling rejection is durable no-op and pricing cannot observe the ceiling', () => {
  withPrivateDirectory(directory => {
    let pricingContext;
    const { activeGrant, store } = initializedStore(directory, {
      deriveCost: context => {
        pricingContext = context;
        return 3;
      },
    });
    const before = store.load();
    const revision = store.getMetadata().revision;

    expectCode(
      () => store.reserveRequest(request(activeGrant.grantId, { maxCostUnits: 2 })),
      'COST_NOT_AUTHORIZED',
    );
    assert.deepEqual(store.load(), before);
    assert.equal(store.getMetadata().revision, revision);
    assert.equal(Object.hasOwn(pricingContext.request, 'maxCostUnits'), false);
    assert.equal(
      store.getRequest({ grantId: activeGrant.grantId, requestId: 'request.1' }),
      null,
    );
    store.close();
  });
});

test('restart preserves maxCostUnits and changed ceilings conflict without repricing', () => {
  withPrivateDirectory(directory => {
    const created = initializedStore(directory, { deriveCost: () => 3 });
    created.store.reserveRequest(request(created.activeGrant.grantId, { maxCostUnits: 3 }));
    created.store.close();

    let pricingCalls = 0;
    const reopened = ServiceCreditSqliteStore.openExisting(options(directory, {
      deriveCost: () => {
        pricingCalls += 1;
        return 3;
      },
    }));
    const before = reopened.load();
    const revision = reopened.getMetadata().revision;
    expectCode(
      () => reopened.reserveRequest(request(created.activeGrant.grantId, { maxCostUnits: 4 })),
      'REQUEST_ID_CONFLICT',
    );
    assert.equal(pricingCalls, 0);
    assert.deepEqual(reopened.load(), before);
    assert.equal(reopened.getMetadata().revision, revision);
    const replay = reopened.reserveRequest(request(created.activeGrant.grantId, { maxCostUnits: 3 }));
    assert.equal(replay.replayed, true);
    assert.equal(replay.request.maxCostUnits, 3);
    assert.equal(pricingCalls, 0);
    reopened.close();
  });
});

test('cross-process changed ceilings yield one reservation and one identity conflict', async t => {
  const directory = privateDirectoryFor(t);
  const { activeGrant, store } = initializedStore(directory, { deriveCost: () => 3 });
  store.close();

  const responses = await runBarrierRace(directory, [
    {
      kind: 'reserve',
      input: request(activeGrant.grantId, { maxCostUnits: 3 }),
    },
    {
      kind: 'reserve',
      input: request(activeGrant.grantId, { maxCostUnits: 4 }),
    },
  ], { cost: 3 });
  assert.equal(responses.filter(response => response.ok).length, 1);
  assert.deepEqual(
    responses.filter(response => !response.ok).map(response => response.code),
    ['REQUEST_ID_CONFLICT'],
  );

  const reopened = ServiceCreditSqliteStore.openExisting(options(directory));
  const stored = reopened.getRequest({
    grantId: activeGrant.grantId,
    requestId: 'request.1',
  });
  assert.equal([3, 4].includes(stored.maxCostUnits), true);
  assert.equal(stored.costUnits, 3);
  assert.equal(reopened.load().state.requests.length, 1);
  reopened.close();
});

test('same-process exact activation contenders converge and changed bindings have one winner', async t => {
  await t.test('exact replay', async t => {
    const directory = privateDirectoryFor(t);
    const store = ServiceCreditSqliteStore.create(options(directory));
    store.registerOffer(offer());
    const before = store.getMetadata().revision;
    const outcomes = await Promise.all([
      Promise.resolve().then(() => store.activateGrantFromTrustedRecord(grant())),
      Promise.resolve().then(() => store.activateGrantFromTrustedRecord(grant())),
    ]);
    assert.equal(outcomes[0].activationId, outcomes[1].activationId);
    assert.equal(outcomes[0].grantId, outcomes[1].grantId);
    assert.equal(store.getMetadata().revision, before + 1);
    assert.equal(store.load().state.grants.length, 1);
    store.close();
  });

  await t.test('conflicting binding', async t => {
    const directory = privateDirectoryFor(t);
    const store = ServiceCreditSqliteStore.create(options(directory));
    store.registerOffer(offer());
    const before = store.getMetadata().revision;
    const outcomes = await Promise.allSettled([
      Promise.resolve().then(() => store.activateGrantFromTrustedRecord(grant({ totalUnits: 10 }))),
      Promise.resolve().then(() => store.activateGrantFromTrustedRecord(grant({ totalUnits: 11 }))),
    ]);
    assert.equal(outcomes.filter(entry => entry.status === 'fulfilled').length, 1);
    assert.equal(outcomes.find(entry => entry.status === 'rejected').reason.code, 'GRANT_IDENTITY_CONFLICT');
    assert.equal(store.getMetadata().revision, before + 1);
    assert.equal(store.load().state.grants.length, 1);
    store.close();
  });
});

test('cross-process exact activation races converge and conflicting races commit one winner', async t => {
  await t.test('exact', async t => {
    const directory = privateDirectoryFor(t);
    const store = ServiceCreditSqliteStore.create(options(directory));
    store.registerOffer(offer());
    const before = store.getMetadata().revision;
    store.close();
    const results = await runBarrierRace(directory, [
      { kind: 'activate', input: grant() },
      { kind: 'activate', input: grant() },
    ]);
    assert.deepEqual(results.map(entry => entry.ok), [true, true]);
    assert.equal(results[0].activationId, results[1].activationId);
    assert.equal(results[0].grantId, results[1].grantId);
    const reopened = ServiceCreditSqliteStore.openExisting(options(directory));
    assert.equal(reopened.getMetadata().revision, before + 1);
    assert.equal(reopened.load().state.grants.length, 1);
    reopened.close();
  });

  await t.test('conflicting', async t => {
    const directory = privateDirectoryFor(t);
    const store = ServiceCreditSqliteStore.create(options(directory));
    store.registerOffer(offer());
    const before = store.getMetadata().revision;
    store.close();
    const results = await runBarrierRace(directory, [
      { kind: 'activate', input: grant({ totalUnits: 10 }) },
      { kind: 'activate', input: grant({ totalUnits: 11 }) },
    ]);
    assert.equal(results.filter(entry => entry.ok).length, 1);
    assert.equal(
      results.find(entry => !entry.ok).code,
      'GRANT_IDENTITY_CONFLICT',
    );
    const reopened = ServiceCreditSqliteStore.openExisting(options(directory));
    assert.equal(reopened.getMetadata().revision, before + 1);
    assert.equal(reopened.load().state.grants.length, 1);
    reopened.close();
  });
});

test('new databases use the physical-v2 compound envelope', t => {
  const directory = privateDirectoryFor(t);
  const configuration = options(directory);
  const store = ServiceCreditSqliteStore.create(configuration);
  assert.equal(SERVICE_CREDIT_SQLITE_SCHEMA_VERSION, 2);
  const initialProjection = store.load();
  assert.deepEqual(Object.keys(initialProjection), [
    'schemaVersion',
    'revision',
    'state',
    'checksum',
  ]);
  assert.equal(initialProjection.schemaVersion, 1);
  assert.equal(
    initialProjection.checksum,
    publicChecksumFor(1, initialProjection.revision, initialProjection.state),
  );
  assert.deepEqual(store.getMetadata(), {
    schemaVersion: 1,
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    revision: initialProjection.revision,
    checksum: initialProjection.checksum,
  });

  store.registerOffer(offer());
  const projection = store.load();
  store.close();
  const persisted = readPersistedEnvelope(configuration);
  const expected = physicalV2Envelope(projection.revision, projection.state);

  assert.equal(persisted.userVersion, 2);
  assert.deepEqual(Object.keys(persisted.envelope).sort(), [
    'checksum',
    'executionState',
    'ledgerState',
    'physicalVersion',
    'revision',
  ]);
  assert.equal(persisted.envelope.physicalVersion, 2);
  assert.equal(persisted.envelope.executionState, null);
  assert.deepEqual(persisted.envelope, expected);
  assert.equal(persisted.envelopeText, canonicalJson(expected));

  const reopened = ServiceCreditSqliteStore.openExisting(configuration);
  assert.deepEqual(reopened.load(), projection);
  reopened.close();
});

test('explicit physical-v1 migration accepts only eligible ledger states', async t => {
  const scenarios = [
    { name: 'empty', populate() {} },
    {
      name: 'reserved',
      populate(store) {
        store.registerOffer(offer());
        const activeGrant = store.activateGrantFromTrustedRecord(grant());
        store.reserveRequest(request(activeGrant.grantId));
      },
    },
    {
      name: 'terminal success',
      populate(store) {
        store.registerOffer(offer());
        const activeGrant = store.activateGrantFromTrustedRecord(grant());
        const reference = { grantId: activeGrant.grantId, requestId: 'request.1' };
        store.reserveRequest(request(activeGrant.grantId));
        store.beginExecution(reference);
        store.completeExecution({ ...reference, cachedResult: result() });
      },
    },
  ];

  for (const [index, scenario] of scenarios.entries()) {
    await t.test(scenario.name, t => {
      const directory = privateDirectoryFor(t);
      const configuration = options(directory);
      const { legacy, projection } = createPhysicalV1(configuration, scenario.populate);
      const beforeOpen = readFileSync(configuration.databasePath);

      expectCode(
        () => ServiceCreditSqliteStore.openExisting(configuration),
        'SERVICE_CREDIT_STORE_SCHEMA_UNSUPPORTED',
      );
      assert.deepEqual(readFileSync(configuration.databasePath), beforeOpen);
      assert.deepEqual(readPersistedEnvelope(configuration), {
        envelope: legacy.envelope,
        envelopeText: legacy.envelopeText,
        userVersion: 1,
      });

      const migrated = index % 2 === 0
        ? ServiceCreditSqliteStore.migrateExisting(configuration)
        : migrateServiceCreditSqliteStore(configuration);
      assert.deepEqual(migrated.load(), projection);
      assert.deepEqual(migrated.getMetadata(), {
        schemaVersion: 1,
        modelVersion: SERVICE_CREDIT_MODEL_VERSION,
        revision: projection.revision,
        checksum: projection.checksum,
      });
      migrated.close();

      const persisted = readPersistedEnvelope(configuration);
      const expected = physicalV2Envelope(projection.revision, projection.state);
      assert.equal(persisted.userVersion, 2);
      assert.equal(persisted.envelopeText, canonicalJson(expected));
      assert.deepEqual(persisted.envelope, expected);
      const reopened = ServiceCreditSqliteStore.openExisting(configuration);
      assert.deepEqual(reopened.load(), projection);
      reopened.close();
    });
  }
});

test('physical-v1 migration is deterministic and migrated stores retain ledger operations', t => {
  const migratedEnvelopes = [];
  for (let index = 0; index < 2; index += 1) {
    const directory = privateDirectoryFor(t);
    const configuration = options(directory);
    const { projection } = createPhysicalV1(configuration, store => {
      store.registerOffer(offer());
      const activeGrant = store.activateGrantFromTrustedRecord(grant());
      store.reserveRequest(request(activeGrant.grantId));
    });
    const migrated = migrateServiceCreditSqliteStore(configuration);
    assert.deepEqual(migrated.load(), projection);
    const migratedEnvelope = readPersistedEnvelope(configuration);
    assert.equal(
      migratedEnvelope.envelopeText,
      canonicalJson(physicalV2Envelope(projection.revision, projection.state)),
    );
    migratedEnvelopes.push(migratedEnvelope.envelopeText);
    const reference = {
      grantId: projection.state.grants[0].grantId,
      requestId: 'request.1',
    };
    assert.equal(migrated.beginExecution(reference).executionAuthorized, true);
    migrated.completeExecution({ ...reference, cachedResult: result() });
    const completed = migrated.load();
    migrated.close();
    const persisted = readPersistedEnvelope(configuration);
    assert.equal(persisted.envelope.executionState, null);
    assert.deepEqual(persisted.envelope.ledgerState, completed.state);
    const reopened = ServiceCreditSqliteStore.openExisting(configuration);
    assert.equal(reopened.getRequest(reference).state, REQUEST_STATE.SUCCEEDED);
    reopened.close();
  }
  assert.equal(migratedEnvelopes[0], migratedEnvelopes[1]);
});

test('migration rejects physical-v2 and unresolved physical-v1 databases without writes', async t => {
  await t.test('physical v2', t => {
    const directory = privateDirectoryFor(t);
    const configuration = options(directory);
    const store = ServiceCreditSqliteStore.create(configuration);
    store.close();
    const before = readFileSync(configuration.databasePath);
    expectCode(
      () => ServiceCreditSqliteStore.migrateExisting(configuration),
      'SERVICE_CREDIT_STORE_SCHEMA_UNSUPPORTED',
    );
    expectCode(
      () => migrateServiceCreditSqliteStore(configuration),
      'SERVICE_CREDIT_STORE_SCHEMA_UNSUPPORTED',
    );
    assert.deepEqual(readFileSync(configuration.databasePath), before);
  });

  for (const state of [REQUEST_STATE.EXECUTING, REQUEST_STATE.OUTCOME_UNKNOWN]) {
    await t.test(state, t => {
      const directory = privateDirectoryFor(t);
      const configuration = options(directory);
      const { projection } = createPhysicalV1(configuration, store => {
        store.registerOffer(offer());
        const activeGrant = store.activateGrantFromTrustedRecord(grant());
        const reference = { grantId: activeGrant.grantId, requestId: 'request.1' };
        store.reserveRequest(request(activeGrant.grantId));
        store.beginExecution(reference);
        if (state === REQUEST_STATE.OUTCOME_UNKNOWN) store.markOutcomeUnknown(reference);
      });
      const before = readFileSync(configuration.databasePath);
      expectCode(
        () => migrateServiceCreditSqliteStore(configuration),
        'SERVICE_CREDIT_STORE_MIGRATION_UNSAFE',
      );
      assert.deepEqual(readFileSync(configuration.databasePath), before);
      const persisted = readPersistedEnvelope(configuration);
      assert.equal(persisted.userVersion, 1);
      assert.deepEqual(persisted.envelope, publicEnvelope(
        projection.revision,
        projection.state,
      ));
    });
  }
});

test('physical-v2 and migration validation reject corrupt or incompatible envelopes', async t => {
  await t.test('non-null execution state', t => {
    const directory = privateDirectoryFor(t);
    const configuration = options(directory);
    const store = ServiceCreditSqliteStore.create(configuration);
    const projection = store.load();
    store.close();
    const invalid = physicalV2Envelope(projection.revision, projection.state, {});
    writePersistedEnvelope(configuration, 2, canonicalJson(invalid));
    expectCode(
      () => ServiceCreditSqliteStore.openExisting(configuration),
      'SERVICE_CREDIT_STORE_CORRUPT',
    );
  });

  await t.test('extra physical key', t => {
    const directory = privateDirectoryFor(t);
    const configuration = options(directory);
    const store = ServiceCreditSqliteStore.create(configuration);
    store.close();
    const persisted = readPersistedEnvelope(configuration);
    persisted.envelope.extra = null;
    writePersistedEnvelope(configuration, 2, canonicalJson(persisted.envelope));
    expectCode(
      () => ServiceCreditSqliteStore.openExisting(configuration),
      'SERVICE_CREDIT_STORE_CORRUPT',
    );
  });

  await t.test('noncanonical physical bytes', t => {
    const directory = privateDirectoryFor(t);
    const configuration = options(directory);
    const store = ServiceCreditSqliteStore.create(configuration);
    store.close();
    const persisted = readPersistedEnvelope(configuration);
    const noncanonical = {
      physicalVersion: persisted.envelope.physicalVersion,
      revision: persisted.envelope.revision,
      ledgerState: persisted.envelope.ledgerState,
      executionState: persisted.envelope.executionState,
      checksum: persisted.envelope.checksum,
    };
    writePersistedEnvelope(configuration, 2, JSON.stringify(noncanonical));
    expectCode(
      () => ServiceCreditSqliteStore.openExisting(configuration),
      'SERVICE_CREDIT_STORE_CORRUPT',
    );
  });

  await t.test('noncanonical legacy bytes', t => {
    const directory = privateDirectoryFor(t);
    const configuration = options(directory);
    const { legacy } = createPhysicalV1(configuration);
    writePersistedEnvelope(configuration, 1, JSON.stringify(legacy.envelope));
    expectCode(
      () => migrateServiceCreditSqliteStore(configuration),
      'SERVICE_CREDIT_STORE_CORRUPT',
    );
  });

  await t.test('legacy extra key', t => {
    const directory = privateDirectoryFor(t);
    const configuration = options(directory);
    const { legacy } = createPhysicalV1(configuration);
    legacy.envelope.extra = null;
    writePersistedEnvelope(configuration, 1, canonicalJson(legacy.envelope));
    expectCode(
      () => migrateServiceCreditSqliteStore(configuration),
      'SERVICE_CREDIT_STORE_CORRUPT',
    );
  });

  await t.test('legacy checksum mismatch', t => {
    const directory = privateDirectoryFor(t);
    const configuration = options(directory);
    const { legacy } = createPhysicalV1(configuration);
    legacy.envelope.checksum = digest('f');
    writePersistedEnvelope(configuration, 1, canonicalJson(legacy.envelope));
    expectCode(
      () => migrateServiceCreditSqliteStore(configuration),
      'SERVICE_CREDIT_STORE_CORRUPT',
    );
  });

  await t.test('legacy model schema mismatch', t => {
    const directory = privateDirectoryFor(t);
    const configuration = options(directory);
    const { legacy } = createPhysicalV1(configuration);
    legacy.envelope.state.schemaVersion = 1;
    legacy.envelope.checksum = publicChecksumFor(
      1,
      legacy.envelope.revision,
      legacy.envelope.state,
    );
    writePersistedEnvelope(configuration, 1, canonicalJson(legacy.envelope));
    expectCode(
      () => migrateServiceCreditSqliteStore(configuration),
      'SERVICE_CREDIT_STORE_SCHEMA_UNSUPPORTED',
    );
  });

  await t.test('crossed user version and physical envelope', t => {
    const directory = privateDirectoryFor(t);
    const configuration = options(directory);
    const store = ServiceCreditSqliteStore.create(configuration);
    store.close();
    const persisted = readPersistedEnvelope(configuration);
    writePersistedEnvelope(configuration, 1, persisted.envelopeText);
    expectCode(
      () => migrateServiceCreditSqliteStore(configuration),
      'SERVICE_CREDIT_STORE_CORRUPT',
    );
    expectCode(
      () => ServiceCreditSqliteStore.openExisting(configuration),
      'SERVICE_CREDIT_STORE_SCHEMA_UNSUPPORTED',
    );
  });

  await t.test('configured request capacity', t => {
    const directory = privateDirectoryFor(t);
    const baseConfiguration = options(directory);
    createPhysicalV1(baseConfiguration, store => {
      store.registerOffer(offer());
      const activeGrant = store.activateGrantFromTrustedRecord(grant({ totalUnits: 10 }));
      store.reserveRequest(request(activeGrant.grantId, { requestId: 'request.first' }));
      store.reserveRequest(request(activeGrant.grantId, { requestId: 'request.second' }));
    });
    const before = readFileSync(baseConfiguration.databasePath);
    expectCode(
      () => migrateServiceCreditSqliteStore(options(directory, { maxRequests: 1 })),
      'SERVICE_CREDIT_STORE_CAPACITY_EXCEEDED',
    );
    assert.deepEqual(readFileSync(baseConfiguration.databasePath), before);
  });
});

test('migration commit boundaries fail closed without retry', async t => {
  await t.test('pre-commit callback failure preserves physical v1', t => {
    const directory = privateDirectoryFor(t);
    const baseConfiguration = options(directory);
    const { legacy } = createPhysicalV1(baseConfiguration);
    const before = readFileSync(baseConfiguration.databasePath);
    expectCode(
      () => migrateServiceCreditSqliteStore(options(directory, {
        testHooks: {
          beforeCommit({ operation, changed }) {
            assert.equal(operation, 'migrateExisting');
            assert.equal(changed, true);
            throw new Error('synthetic-migration-precommit');
          },
        },
      })),
      'SERVICE_CREDIT_STORE_CALLBACK_FAILED',
    );
    assert.deepEqual(readFileSync(baseConfiguration.databasePath), before);
    assert.deepEqual(readPersistedEnvelope(baseConfiguration), {
      envelope: legacy.envelope,
      envelopeText: legacy.envelopeText,
      userVersion: 1,
    });
  });

  await t.test('post-commit acknowledgement ambiguity requires reopen', t => {
    const directory = privateDirectoryFor(t);
    const baseConfiguration = options(directory);
    const { projection } = createPhysicalV1(baseConfiguration);
    expectCode(
      () => migrateServiceCreditSqliteStore(options(directory, {
        testHooks: {
          afterCommit({ operation, changed }) {
            assert.equal(operation, 'migrateExisting');
            assert.equal(changed, true);
            throw new Error('synthetic-migration-postcommit');
          },
        },
      })),
      'SERVICE_CREDIT_STORE_COMMIT_FAILED',
    );
    const reopened = ServiceCreditSqliteStore.openExisting(baseConfiguration);
    assert.deepEqual(reopened.load(), projection);
    reopened.close();
    expectCode(
      () => migrateServiceCreditSqliteStore(baseConfiguration),
      'SERVICE_CREDIT_STORE_SCHEMA_UNSUPPORTED',
    );
  });

  for (const phase of ['beforeCommit', 'afterCommit']) {
    await t.test(`process death at ${phase}`, async t => {
      const directory = privateDirectoryFor(t);
      const configuration = options(directory);
      const { projection } = createPhysicalV1(configuration);
      await crashMigrationAtBoundary(directory, phase);
      if (phase === 'beforeCommit') {
        const persisted = readPersistedEnvelope(configuration);
        assert.equal(persisted.userVersion, 1);
        const migrated = migrateServiceCreditSqliteStore(configuration);
        assert.deepEqual(migrated.load(), projection);
        migrated.close();
      } else {
        const reopened = ServiceCreditSqliteStore.openExisting(configuration);
        assert.deepEqual(reopened.load(), projection);
        reopened.close();
        expectCode(
          () => migrateServiceCreditSqliteStore(configuration),
          'SERVICE_CREDIT_STORE_SCHEMA_UNSUPPORTED',
        );
      }
    });
  }
});

test('concurrent migration has one durable winner and no second rewrite', async t => {
  const directory = privateDirectoryFor(t);
  const configuration = options(directory);
  const { projection } = createPhysicalV1(configuration, store => {
    store.registerOffer(offer());
  });
  const responses = await runMigrationRace(directory);
  assert.equal(responses.filter(response => response.ok).length, 1);
  assert.deepEqual(
    responses.filter(response => !response.ok).map(response => response.code),
    ['SERVICE_CREDIT_STORE_SCHEMA_UNSUPPORTED'],
  );
  const persisted = readPersistedEnvelope(configuration);
  assert.equal(persisted.userVersion, 2);
  assert.deepEqual(persisted.envelope, physicalV2Envelope(
    projection.revision,
    projection.state,
  ));
  const reopened = ServiceCreditSqliteStore.openExisting(configuration);
  assert.deepEqual(reopened.load(), projection);
  reopened.close();
});

test('migration retains filesystem, hostile-input, and callback-inert boundaries', async t => {
  await t.test('symlink and hardlink targets', t => {
    const directory = privateDirectoryFor(t);
    const configuration = options(directory);
    createPhysicalV1(configuration);
    const alias = join(directory, 'alias.sqlite');
    symlinkSync(configuration.databasePath, alias);
    expectCode(
      () => migrateServiceCreditSqliteStore({ ...configuration, databasePath: alias }),
      'SERVICE_CREDIT_STORE_UNSAFE_FILE',
    );
    const linked = join(directory, 'linked.sqlite');
    linkSync(configuration.databasePath, linked);
    expectCode(
      () => migrateServiceCreditSqliteStore(configuration),
      'SERVICE_CREDIT_STORE_UNSAFE_FILE',
    );
  });

  await t.test('hostile configuration shapes', t => {
    const directory = privateDirectoryFor(t);
    const configuration = options(directory);
    createPhysicalV1(configuration);
    const before = readFileSync(configuration.databasePath);
    expectCode(
      () => migrateServiceCreditSqliteStore(new Proxy(configuration, {
        ownKeys() { throw new Error('hostile-own-keys'); },
      })),
      'SERVICE_CREDIT_STORE_INVALID_CONFIGURATION',
    );
    const accessor = { ...configuration };
    Object.defineProperty(accessor, 'databasePath', {
      enumerable: true,
      get() { throw new Error('hostile-accessor'); },
    });
    expectCode(
      () => ServiceCreditSqliteStore.migrateExisting(accessor),
      'SERVICE_CREDIT_STORE_INVALID_CONFIGURATION',
    );
    assert.deepEqual(readFileSync(configuration.databasePath), before);
  });

  await t.test('migration performs no clock or pricing callback', t => {
    const directory = privateDirectoryFor(t);
    const baseConfiguration = options(directory);
    const { projection } = createPhysicalV1(baseConfiguration);
    const migrated = migrateServiceCreditSqliteStore(options(directory, {
      now: () => { throw new Error('migration-clock-must-remain-inert'); },
      deriveCost: () => { throw new Error('migration-pricing-must-remain-inert'); },
    }));
    assert.deepEqual(migrated.load(), projection);
    migrated.close();
    assert.equal(existsSync(`${baseConfiguration.databasePath}-journal`), false);
    assert.equal(existsSync(`${baseConfiguration.databasePath}-wal`), false);
    assert.equal(existsSync(`${baseConfiguration.databasePath}-shm`), false);
  });
});

test('durable execution activation is explicit and preserves physical format v2', t => {
  const directory = privateDirectoryFor(t);
  const configuration = options(directory);
  const store = ServiceCreditSqliteStore.create(configuration);

  assert.deepEqual(store.getDurableExecutionSnapshot(), {
    revision: 0,
    executionState: null,
  });
  const initialized = store.initializeDurableExecution({
    expectedRevision: 0,
    ledgerId: 'ledger.local.1',
    policy: executionPolicy(),
    capacity: 8,
  });
  assert.equal(initialized.disposition, 'APPLIED');
  assert.equal(initialized.revision, 1);
  assert.equal(initialized.executionState.ledgerId, 'ledger.local.1');
  assert.equal(Object.isFrozen(initialized), true);
  assert.equal(Object.isFrozen(initialized.executionState), true);
  assert.equal(store.load().revision, 1);
  store.close();

  const persisted = readPersistedEnvelope(configuration);
  assert.equal(persisted.userVersion, 2);
  assert.equal(persisted.envelope.physicalVersion, 2);
  assert.notEqual(persisted.envelope.executionState, null);

  const reopened = ServiceCreditSqliteStore.openExisting(configuration);
  assert.deepEqual(
    reopened.getDurableExecutionSnapshot(),
    { revision: 1, executionState: initialized.executionState },
  );
  reopened.close();
});

test('durable prepare, fence, completion, replay, and public projection converge', t => {
  const directory = privateDirectoryFor(t);
  let now = NOW;
  let clockCalls = 0;
  const { activeGrant, store } = initializedStore(directory, {
    now: () => {
      clockCalls += 1;
      return now;
    },
  });
  const initialized = store.initializeDurableExecution({
    expectedRevision: store.getMetadata().revision,
    ledgerId: 'ledger.local.lifecycle',
    policy: executionPolicy(),
    capacity: 8,
  });
  const input = request(activeGrant.grantId);
  const callsBeforePrepare = clockCalls;
  const prepared = store.prepareDurableExecution({
    expectedRevision: initialized.revision,
    request: input,
    selectedDurationMs: 1_000,
  });
  assert.equal(prepared.disposition, 'APPLIED');
  assert.equal(prepared.request.state, REQUEST_STATE.EXECUTING);
  assert.equal(prepared.execution.fencePhase, 'PREPARED');
  assert.equal(prepared.execution.terminalClassification, 'NONE');
  assert.equal(clockCalls, callsBeforePrepare + 1);

  const fenced = store.persistDurableExecutionFence({
    expectedRevision: prepared.revision,
    executionId: prepared.execution.executionId,
  });
  assert.equal(fenced.disposition, 'APPLIED');
  assert.equal(fenced.execution.fencePhase, 'MAY_HAVE_STARTED');
  assert.equal(fenced.execution.terminalClassification, 'NONE');
  assert.equal(clockCalls, callsBeforePrepare + 2);

  const completed = store.completeDurableExecution({
    expectedRevision: fenced.revision,
    executionId: fenced.execution.executionId,
    cachedResult: result(),
  });
  assert.equal(completed.disposition, 'APPLIED');
  assert.equal(completed.winner, 'SUCCEEDED');
  assert.equal(completed.request.state, REQUEST_STATE.SUCCEEDED);
  assert.match(completed.execution.resultCommitment, /^sha256:[0-9a-f]{64}$/);

  const replay = store.completeDurableExecution({
    expectedRevision: completed.revision,
    executionId: completed.execution.executionId,
    cachedResult: result(),
  });
  assert.equal(replay.disposition, 'UNCHANGED');
  assert.equal(replay.winner, 'SUCCEEDED');
  assert.equal(replay.revision, completed.revision);
  const requestReplay = store.prepareDurableExecution({
    expectedRevision: completed.revision,
    request: input,
    selectedDurationMs: 1_000,
  });
  assert.equal(requestReplay.disposition, 'UNCHANGED');
  assert.equal(requestReplay.execution.terminalClassification, 'SUCCEEDED');
  assert.equal(clockCalls, callsBeforePrepare + 2);

  const projection = store.load();
  assert.equal(projection.revision, completed.revision);
  assert.equal(projection.state.requests[0].state, REQUEST_STATE.SUCCEEDED);
  assert.equal(projection.state.grants[0].availableUnits, 7);
  assert.equal(projection.state.grants[0].heldUnits, 0);
  assert.equal(projection.state.grants[0].consumedUnits, 3);
  store.close();

  const reopened = ServiceCreditSqliteStore.openExisting(options(directory));
  assert.deepEqual(reopened.load(), projection);
  assert.equal(
    reopened.getDurableExecutionSnapshot().executionState.executions[0]
      .terminalClassification,
    'SUCCEEDED',
  );
  reopened.close();
});

test('durable fence releases at deadline equality or clock regression without persisting unknown', async t => {
  for (const scenario of [
    { name: 'deadline equality', nextNow: NOW + 1_000, reason: 'DEADLINE_REACHED' },
    { name: 'clock regression', nextNow: NOW - 1, reason: 'CLOCK_REGRESSION' },
  ]) {
    await t.test(scenario.name, t => {
      const directory = privateDirectoryFor(t);
      let now = NOW;
      const { activeGrant, store } = initializedStore(directory, { now: () => now });
      const initialized = store.initializeDurableExecution({
        expectedRevision: store.getMetadata().revision,
        ledgerId: `ledger.local.${scenario.name.replace(' ', '.')}`,
        policy: executionPolicy(),
        capacity: 8,
      });
      const prepared = store.prepareDurableExecution({
        expectedRevision: initialized.revision,
        request: request(activeGrant.grantId),
        selectedDurationMs: 1_000,
      });
      now = scenario.nextNow;
      const fenced = store.persistDurableExecutionFence({
        expectedRevision: prepared.revision,
        executionId: prepared.execution.executionId,
      });
      assert.equal(fenced.disposition, 'APPLIED');
      assert.equal(fenced.execution.terminalClassification, 'NOT_INVOKED');
      assert.equal(fenced.execution.terminalReason, scenario.reason);
      const persistedRequest = store.getRequest({
        grantId: activeGrant.grantId,
        requestId: 'request.1',
      });
      assert.equal(persistedRequest.state, REQUEST_STATE.FAILED_RELEASED);
      const persisted = readPersistedEnvelope(options(directory));
      assert.equal(
        persisted.envelope.ledgerState.requests.some(
          entry => entry.state === REQUEST_STATE.OUTCOME_UNKNOWN,
        ),
        false,
      );
      assert.equal(persisted.envelope.ledgerState.grants[0].availableUnits, 10);
      assert.equal(persisted.envelope.ledgerState.grants[0].heldUnits, 0);
      store.close();
    });
  }
});

test('durable success and uncertainty have one persisted winner in either order', async t => {
  for (const first of ['success', 'unknown']) {
    await t.test(first, t => {
      const directory = privateDirectoryFor(t);
      const { activeGrant, store } = initializedStore(directory);
      const initialized = store.initializeDurableExecution({
        expectedRevision: store.getMetadata().revision,
        ledgerId: `ledger.local.winner.${first}`,
        policy: executionPolicy(),
        capacity: 8,
      });
      const prepared = store.prepareDurableExecution({
        expectedRevision: initialized.revision,
        request: request(activeGrant.grantId),
        selectedDurationMs: 1_000,
      });
      const fenced = store.persistDurableExecutionFence({
        expectedRevision: prepared.revision,
        executionId: prepared.execution.executionId,
      });
      const complete = revision => store.completeDurableExecution({
        expectedRevision: revision,
        executionId: fenced.execution.executionId,
        cachedResult: result(),
      });
      const unknown = revision => store.markDurableExecutionUnknown({
        expectedRevision: revision,
        executionId: fenced.execution.executionId,
        reason: 'LOST_CONTROL',
      });
      const winner = first === 'success' ? complete(fenced.revision) : unknown(fenced.revision);
      const loser = first === 'success' ? unknown(winner.revision) : complete(winner.revision);
      assert.equal(winner.disposition, 'APPLIED');
      assert.equal(loser.disposition, 'UNCHANGED');
      assert.equal(loser.winner, first === 'success' ? 'SUCCEEDED' : 'OUTCOME_UNKNOWN');
      assert.equal(
        store.getRequest({ grantId: activeGrant.grantId, requestId: 'request.1' }).state,
        first === 'success' ? REQUEST_STATE.SUCCEEDED : REQUEST_STATE.OUTCOME_UNKNOWN,
      );
      assert.equal(
        store.getDurableExecutionSnapshot().executionState.generation.state,
        first === 'success' ? 'OPEN' : 'SEALED',
      );
      store.close();
    });
  }
});

test('explicit durable restart recovery classifies prepared, fenced, and terminal work', async t => {
  for (const phase of ['prepared', 'fenced', 'succeeded']) {
    await t.test(phase, t => {
      const directory = privateDirectoryFor(t);
      const { activeGrant, store } = initializedStore(directory);
      const initialized = store.initializeDurableExecution({
        expectedRevision: store.getMetadata().revision,
        ledgerId: `ledger.local.recovery.${phase}`,
        policy: executionPolicy(),
        capacity: 8,
      });
      const prepared = store.prepareDurableExecution({
        expectedRevision: initialized.revision,
        request: request(activeGrant.grantId),
        selectedDurationMs: 1_000,
      });
      let revision = prepared.revision;
      let execution = prepared.execution;
      if (phase !== 'prepared') {
        const fenced = store.persistDurableExecutionFence({
          expectedRevision: revision,
          executionId: execution.executionId,
        });
        revision = fenced.revision;
        execution = fenced.execution;
      }
      if (phase === 'succeeded') {
        const completed = store.completeDurableExecution({
          expectedRevision: revision,
          executionId: execution.executionId,
          cachedResult: result(),
        });
        revision = completed.revision;
      }
      store.close();

      const reopened = ServiceCreditSqliteStore.openExisting(options(directory));
      const recovered = reopened.recoverDurableExecutionsAfterRestart({
        expectedRevision: revision,
      });
      const expectedDisposition = phase === 'succeeded' ? 'UNCHANGED' : 'APPLIED';
      assert.equal(recovered.disposition, expectedDisposition);
      assert.equal(recovered.noInvocationCount, phase === 'prepared' ? 1 : 0);
      assert.equal(recovered.outcomeUnknownCount, phase === 'fenced' ? 1 : 0);
      const storedRequest = reopened.getRequest({
        grantId: activeGrant.grantId,
        requestId: 'request.1',
      });
      assert.equal(storedRequest.state, {
        prepared: REQUEST_STATE.FAILED_RELEASED,
        fenced: REQUEST_STATE.OUTCOME_UNKNOWN,
        succeeded: REQUEST_STATE.SUCCEEDED,
      }[phase]);
      reopened.close();
    });
  }
});

test('durable mode blocks every legacy request mutation before callbacks or revision changes', t => {
  const directory = privateDirectoryFor(t);
  let clockCalls = 0;
  let pricingCalls = 0;
  const { activeGrant, store } = initializedStore(directory, {
    now: () => {
      clockCalls += 1;
      return NOW;
    },
    deriveCost: () => {
      pricingCalls += 1;
      return 3;
    },
  });
  store.initializeDurableExecution({
    expectedRevision: store.getMetadata().revision,
    ledgerId: 'ledger.local.legacy-block',
    policy: executionPolicy(),
    capacity: 8,
  });
  const before = store.load();
  const beforeClock = clockCalls;
  const beforePricing = pricingCalls;
  const reference = { grantId: activeGrant.grantId, requestId: 'request.1' };
  const operations = [
    () => store.reserveRequest(request(activeGrant.grantId)),
    () => store.beginExecution(reference),
    () => store.releaseBeforeExecution(reference),
    () => store.completeExecution({ ...reference, cachedResult: result() }),
    () => store.markOutcomeUnknown(reference),
    () => store.reconcileRequest({ ...reference, outcome: REQUEST_STATE.FAILED_RELEASED }),
  ];
  for (const operation of operations) {
    expectCode(operation, 'SERVICE_CREDIT_STORE_LEGACY_EXECUTION_MUTATION_BLOCKED');
  }
  assert.deepEqual(store.load(), before);
  assert.equal(clockCalls, beforeClock);
  assert.equal(pricingCalls, beforePricing);
  store.close();
});

test('cross-process durable prepare, fence, and terminal races have one applied writer', async t => {
  const directory = privateDirectoryFor(t);
  const { activeGrant, store } = initializedStore(directory);
  const initialized = store.initializeDurableExecution({
    expectedRevision: store.getMetadata().revision,
    ledgerId: 'ledger.local.process-race',
    policy: executionPolicy(),
    capacity: 8,
  });
  store.close();

  const prepareInput = {
    expectedRevision: initialized.revision,
    request: request(activeGrant.grantId),
    selectedDurationMs: 1_000,
  };
  const prepareRace = await runBarrierRace(directory, [
    { kind: 'durablePrepare', input: prepareInput },
    { kind: 'durablePrepare', input: prepareInput },
  ]);
  assert.deepEqual(
    prepareRace.map(entry => entry.disposition).sort(),
    ['APPLIED', 'STALE'],
  );

  let reopened = ServiceCreditSqliteStore.openExisting(options(directory));
  let durable = reopened.getDurableExecutionSnapshot();
  const executionId = durable.executionState.executions[0].executionId;
  reopened.close();
  const fenceInput = { expectedRevision: durable.revision, executionId };
  const fenceRace = await runBarrierRace(directory, [
    { kind: 'durableFence', input: fenceInput },
    { kind: 'durableFence', input: fenceInput },
  ]);
  assert.deepEqual(
    fenceRace.map(entry => entry.disposition).sort(),
    ['APPLIED', 'STALE'],
  );

  reopened = ServiceCreditSqliteStore.openExisting(options(directory));
  durable = reopened.getDurableExecutionSnapshot();
  reopened.close();
  const terminalRace = await runBarrierRace(directory, [
    {
      kind: 'durableComplete',
      input: {
        expectedRevision: durable.revision,
        executionId,
        cachedResult: result(),
      },
    },
    {
      kind: 'durableUnknown',
      input: {
        expectedRevision: durable.revision,
        executionId,
        reason: 'LOST_CONTROL',
      },
    },
  ]);
  assert.deepEqual(
    terminalRace.map(entry => entry.disposition).sort(),
    ['APPLIED', 'STALE'],
  );
  reopened = ServiceCreditSqliteStore.openExisting(options(directory));
  const terminal = reopened.getDurableExecutionSnapshot().executionState.executions[0];
  assert.equal(['SUCCEEDED', 'OUTCOME_UNKNOWN'].includes(terminal.terminalClassification), true);
  reopened.close();
});

test('durable APIs reject wrong arity, accessors, proxies, and stale revisions without effects', t => {
  const directory = privateDirectoryFor(t);
  let clockCalls = 0;
  let pricingCalls = 0;
  const { activeGrant, store } = initializedStore(directory, {
    now: () => {
      clockCalls += 1;
      return NOW;
    },
    deriveCost: () => {
      pricingCalls += 1;
      return 3;
    },
  });
  const baseRevision = store.getMetadata().revision;
  expectCode(
    () => store.getDurableExecutionSnapshot(null),
    'SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT',
  );
  for (const invoke of [
    () => store.initializeDurableExecution(),
    () => store.prepareDurableExecution(),
    () => store.persistDurableExecutionFence(),
    () => store.completeDurableExecution(),
    () => store.markDurableExecutionUnknown(),
    () => store.recoverDurableExecutionsAfterRestart(),
  ]) {
    expectCode(invoke, 'SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT');
  }
  const hostile = new Proxy({
    expectedRevision: baseRevision,
    ledgerId: 'ledger.local.hostile',
    policy: executionPolicy(),
    capacity: 8,
  }, {});
  expectCode(
    () => store.initializeDurableExecution(hostile),
    'SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT',
  );
  const accessor = {
    expectedRevision: baseRevision,
    request: request(activeGrant.grantId),
    selectedDurationMs: 1_000,
  };
  Object.defineProperty(accessor, 'request', {
    enumerable: true,
    get() { throw new Error('hostile-request-accessor'); },
  });
  expectCode(
    () => store.prepareDurableExecution(accessor),
    'SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT',
  );

  const initialized = store.initializeDurableExecution({
    expectedRevision: baseRevision,
    ledgerId: 'ledger.local.strict-input',
    policy: executionPolicy(),
    capacity: 8,
  });
  const before = store.load();
  const beforeClock = clockCalls;
  const beforePricing = pricingCalls;
  const stale = store.prepareDurableExecution({
    expectedRevision: baseRevision,
    request: request(activeGrant.grantId),
    selectedDurationMs: 1_000,
  });
  assert.deepEqual(stale, {
    disposition: 'STALE',
    revision: initialized.revision,
    request: null,
    execution: null,
  });
  assert.deepEqual(store.load(), before);
  assert.equal(clockCalls, beforeClock);
  assert.equal(pricingCalls, beforePricing);
  store.close();
});

test('durable receipts remain detached and frozen under inherited setter poisoning', t => {
  const directory = privateDirectoryFor(t);
  const store = ServiceCreditSqliteStore.create(options(directory));
  let setterCalls = 0;
  Object.defineProperty(Object.prototype, 'disposition', {
    configurable: true,
    set() { setterCalls += 1; },
  });
  Object.defineProperty(Array.prototype, '0', {
    configurable: true,
    set() { setterCalls += 1; },
  });
  try {
    const initialized = store.initializeDurableExecution({
      expectedRevision: 0,
      ledgerId: 'ledger.local.setter-poison',
      policy: executionPolicy(),
      capacity: 8,
    });
    assert.equal(initialized.disposition, 'APPLIED');
    assert.equal(Object.isFrozen(initialized), true);
    assert.equal(Object.isFrozen(initialized.executionState.executions), true);
    assert.equal(setterCalls, 0);
  } finally {
    delete Object.prototype.disposition;
    delete Array.prototype[0];
    store.close();
  }
});

test('durable store-local snapshot and cross-link helpers use captured String and Set', t => {
  const nullDirectory = privateDirectoryFor(t);
  const durableDirectory = privateDirectoryFor(t);
  const nullStore = ServiceCreditSqliteStore.create(options(nullDirectory));
  const durableStore = ServiceCreditSqliteStore.create(options(durableDirectory));
  const initialized = durableStore.initializeDurableExecution({
    expectedRevision: 0,
    ledgerId: 'ledger.local.intrinsic-differential',
    policy: executionPolicy(),
    capacity: 8,
  });
  const originalStringDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'String');
  const originalSetDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Set');
  const OriginalString = globalThis.String;
  const OriginalSet = globalThis.Set;
  let stringHookCalls = 0;
  let setHookCalls = 0;
  let nullHydrationSetCalls;
  let durableHydrationSetCalls;
  Object.defineProperty(globalThis, 'Set', {
    ...originalSetDescriptor,
    value: function PoisonedSet(iterable) {
      setHookCalls += 1;
      return new OriginalSet(iterable);
    },
  });
  try {
    nullStore.getMetadata();
    nullHydrationSetCalls = setHookCalls;
    setHookCalls = 0;
    durableStore.getMetadata();
    durableHydrationSetCalls = setHookCalls;
  } finally {
    Object.defineProperty(globalThis, 'Set', originalSetDescriptor);
  }
  assert.equal(durableHydrationSetCalls, nullHydrationSetCalls);

  durableStore.registerOffer(offer());
  const activeGrant = durableStore.activateGrantFromTrustedRecord(grant());
  const prepared = durableStore.prepareDurableExecution({
    expectedRevision: durableStore.getMetadata().revision,
    request: request(activeGrant.grantId),
    selectedDurationMs: 1_000,
  });
  let metadataStringCalls;
  let snapshotStringCalls;
  let snapshot;
  Object.defineProperty(globalThis, 'String', {
    ...originalStringDescriptor,
    value(value) {
      stringHookCalls += 1;
      return OriginalString(value);
    },
  });
  try {
    durableStore.getMetadata();
    metadataStringCalls = stringHookCalls;
    stringHookCalls = 0;
    snapshot = durableStore.getDurableExecutionSnapshot();
    snapshotStringCalls = stringHookCalls;
  } finally {
    Object.defineProperty(globalThis, 'String', originalStringDescriptor);
    nullStore.close();
    durableStore.close();
  }
  assert.equal(snapshotStringCalls, metadataStringCalls);
  assert.equal(prepared.disposition, 'APPLIED');
  assert.equal(prepared.request.state, REQUEST_STATE.EXECUTING);
  assert.equal(snapshot.executionState.executions.length, 1);
  assert.equal(Object.isFrozen(snapshot.executionState.executions), true);
});

test('every durable mutation rolls back before commit and quarantines after ambiguous acknowledgement', async t => {
  const operations = [
    'initializeDurableExecution',
    'prepareDurableExecution',
    'persistDurableExecutionFence',
    'completeDurableExecution',
    'markDurableExecutionUnknown',
    'recoverDurableExecutionsAfterRestart',
  ];

  function scenario(directory, target, testHooks) {
    const configuration = options(directory, { testHooks });
    const { activeGrant, store } = initializedStore(directory, { testHooks });
    let initialized;
    let prepared;
    let fenced;
    if (target !== 'initializeDurableExecution') {
      initialized = store.initializeDurableExecution({
        expectedRevision: store.getMetadata().revision,
        ledgerId: `ledger.local.fault.${target}`,
        policy: executionPolicy(),
        capacity: 8,
      });
    }
    if (!['initializeDurableExecution', 'prepareDurableExecution'].includes(target)) {
      prepared = store.prepareDurableExecution({
        expectedRevision: initialized.revision,
        request: request(activeGrant.grantId),
        selectedDurationMs: 1_000,
      });
    }
    if (['completeDurableExecution', 'markDurableExecutionUnknown'].includes(target)) {
      fenced = store.persistDurableExecutionFence({
        expectedRevision: prepared.revision,
        executionId: prepared.execution.executionId,
      });
    }
    const invoke = {
      initializeDurableExecution: () => store.initializeDurableExecution({
        expectedRevision: store.getMetadata().revision,
        ledgerId: 'ledger.local.fault.initialize',
        policy: executionPolicy(),
        capacity: 8,
      }),
      prepareDurableExecution: () => store.prepareDurableExecution({
        expectedRevision: initialized.revision,
        request: request(activeGrant.grantId),
        selectedDurationMs: 1_000,
      }),
      persistDurableExecutionFence: () => store.persistDurableExecutionFence({
        expectedRevision: prepared.revision,
        executionId: prepared.execution.executionId,
      }),
      completeDurableExecution: () => store.completeDurableExecution({
        expectedRevision: fenced.revision,
        executionId: fenced.execution.executionId,
        cachedResult: result(),
      }),
      markDurableExecutionUnknown: () => store.markDurableExecutionUnknown({
        expectedRevision: fenced.revision,
        executionId: fenced.execution.executionId,
        reason: 'LOST_CONTROL',
      }),
      recoverDurableExecutionsAfterRestart: () => store.recoverDurableExecutionsAfterRestart({
        expectedRevision: prepared.revision,
      }),
    }[target];
    return { configuration, invoke, store };
  }

  for (const phase of ['beforeCommit', 'afterCommit']) {
    for (const operation of operations) {
      await t.test(`${operation} ${phase}`, t => {
        const directory = privateDirectoryFor(t);
        let armed = false;
        const hooks = {
          [phase]({ operation: observed, changed }) {
            if (!armed || observed !== operation) return;
            assert.equal(changed, true);
            throw new Error('synthetic-durable-commit-boundary');
          },
        };
        const candidate = scenario(directory, operation, hooks);
        const before = readPersistedEnvelope(candidate.configuration);
        armed = true;
        expectCode(
          candidate.invoke,
          phase === 'beforeCommit'
            ? 'SERVICE_CREDIT_STORE_CALLBACK_FAILED'
            : 'SERVICE_CREDIT_STORE_COMMIT_FAILED',
        );
        armed = false;
        if (phase === 'beforeCommit') {
          assert.deepEqual(readPersistedEnvelope(candidate.configuration), before);
          candidate.store.close();
        } else {
          expectCode(
            () => candidate.store.getDurableExecutionSnapshot(),
            'SERVICE_CREDIT_STORE_CLOSED',
          );
          const reopened = ServiceCreditSqliteStore.openExisting(candidate.configuration);
          assert.equal(reopened.getMetadata().revision, before.envelope.revision + 1);
          assert.notDeepEqual(readPersistedEnvelope(candidate.configuration), before);
          reopened.close();
        }
      });
    }
  }
});

test('durable initialization and capacity guards fail closed without automatic activation', async t => {
  await t.test('disabled until explicit initialization', t => {
    const directory = privateDirectoryFor(t);
    const { activeGrant, store } = initializedStore(directory);
    const before = store.load();
    expectCode(
      () => store.prepareDurableExecution({
        expectedRevision: before.revision,
        request: request(activeGrant.grantId),
        selectedDurationMs: 1_000,
      }),
      'SERVICE_CREDIT_STORE_DURABLE_EXECUTION_DISABLED',
    );
    assert.deepEqual(store.load(), before);
    store.close();
  });

  await t.test('initialization replay and conflict', t => {
    const directory = privateDirectoryFor(t);
    const store = ServiceCreditSqliteStore.create(options(directory));
    const first = store.initializeDurableExecution({
      expectedRevision: 0,
      ledgerId: 'ledger.local.initialization',
      policy: executionPolicy(),
      capacity: 8,
    });
    const replay = store.initializeDurableExecution({
      expectedRevision: first.revision,
      ledgerId: 'ledger.local.initialization',
      policy: executionPolicy(),
      capacity: 8,
    });
    assert.equal(replay.disposition, 'UNCHANGED');
    expectCode(
      () => store.initializeDurableExecution({
        expectedRevision: first.revision,
        ledgerId: 'ledger.local.changed',
        policy: executionPolicy(),
        capacity: 8,
      }),
      'SERVICE_CREDIT_STORE_EXECUTION_CONFLICT',
    );
    store.close();
  });

  for (const unresolvedState of [REQUEST_STATE.EXECUTING, REQUEST_STATE.OUTCOME_UNKNOWN]) {
    await t.test(`legacy ${unresolvedState}`, t => {
      const directory = privateDirectoryFor(t);
      const { activeGrant, store } = initializedStore(directory);
      const reference = { grantId: activeGrant.grantId, requestId: 'request.1' };
      store.reserveRequest(request(activeGrant.grantId));
      store.beginExecution(reference);
      if (unresolvedState === REQUEST_STATE.OUTCOME_UNKNOWN) {
        store.markOutcomeUnknown(reference);
      }
      const before = store.load();
      expectCode(
        () => store.initializeDurableExecution({
          expectedRevision: before.revision,
          ledgerId: `ledger.local.unsafe.${unresolvedState.toLowerCase()}`,
          policy: executionPolicy(),
          capacity: 8,
        }),
        'SERVICE_CREDIT_STORE_EXECUTION_INITIALIZATION_UNSAFE',
      );
      assert.deepEqual(store.load(), before);
      store.close();
    });
  }

  await t.test('configured and execution capacity', t => {
    const directory = privateDirectoryFor(t);
    const { activeGrant, store } = initializedStore(directory, { maxRequests: 1 });
    const revision = store.getMetadata().revision;
    expectCode(
      () => store.initializeDurableExecution({
        expectedRevision: revision,
        ledgerId: 'ledger.local.too-large',
        policy: executionPolicy(),
        capacity: 2,
      }),
      'SERVICE_CREDIT_STORE_CAPACITY_EXCEEDED',
    );
    const initialized = store.initializeDurableExecution({
      expectedRevision: revision,
      ledgerId: 'ledger.local.capacity',
      policy: executionPolicy(),
      capacity: 1,
    });
    const prepared = store.prepareDurableExecution({
      expectedRevision: initialized.revision,
      request: request(activeGrant.grantId),
      selectedDurationMs: 1_000,
    });
    const fenced = store.persistDurableExecutionFence({
      expectedRevision: prepared.revision,
      executionId: prepared.execution.executionId,
    });
    const completed = store.completeDurableExecution({
      expectedRevision: fenced.revision,
      executionId: fenced.execution.executionId,
      cachedResult: result(),
    });
    const before = store.load();
    expectCode(
      () => store.prepareDurableExecution({
        expectedRevision: completed.revision,
        request: request(activeGrant.grantId, { requestId: 'request.2' }),
        selectedDurationMs: 1_000,
      }),
      'SERVICE_CREDIT_STORE_CAPACITY_EXCEEDED',
    );
    assert.deepEqual(store.load(), before);
    store.close();
  });
});

test('durable initialization requires a clean cutover with no legacy reservation', async t => {
  const scenarios = [
    { name: 'active grant' },
    { name: 'revoked grant', revoke: true },
    { name: 'expired grant', expire: true },
    { name: 'execution capacity constrained', maxRequests: 1, capacity: 1 },
  ];
  for (const scenario of scenarios) {
    await t.test(scenario.name, t => {
      const directory = privateDirectoryFor(t);
      let now = NOW;
      let clockCalls = 0;
      let pricingCalls = 0;
      const { activeGrant, store } = initializedStore(directory, {
        maxRequests: scenario.maxRequests,
        now: () => {
          clockCalls += 1;
          return now;
        },
        deriveCost: () => {
          pricingCalls += 1;
          return 3;
        },
      }, scenario.expire ? { expiresAt: NOW + 1 } : {});
      const reference = { grantId: activeGrant.grantId, requestId: 'request.1' };
      store.reserveRequest(request(activeGrant.grantId));
      if (scenario.revoke) store.revokeGrant({ grantId: activeGrant.grantId });
      if (scenario.expire) now = NOW + 2;
      const before = store.load();
      const beforeClock = clockCalls;
      const beforePricing = pricingCalls;
      expectCode(
        () => store.initializeDurableExecution({
          expectedRevision: before.revision,
          ledgerId: `ledger.local.clean-cutover.${scenario.name.replaceAll(' ', '.')}`,
          policy: executionPolicy(),
          capacity: scenario.capacity ?? 8,
        }),
        'SERVICE_CREDIT_STORE_EXECUTION_INITIALIZATION_UNSAFE',
      );
      assert.deepEqual(store.load(), before);
      assert.equal(clockCalls, beforeClock);
      assert.equal(pricingCalls, beforePricing);
      assert.equal(store.getRequest(reference).state, REQUEST_STATE.RESERVED);
      const released = store.releaseBeforeExecution(reference);
      assert.equal(released.request.state, REQUEST_STATE.FAILED_RELEASED);
      const grantState = store.getGrant(activeGrant.grantId);
      assert.equal(grantState.availableUnits, 10);
      assert.equal(grantState.heldUnits, 0);
      assert.equal(grantState.consumedUnits, 0);
      store.close();
    });
  }

  await t.test('two concurrent handles reject without activating or stranding the hold', async t => {
    const directory = privateDirectoryFor(t);
    const { activeGrant, store } = initializedStore(directory);
    const reference = { grantId: activeGrant.grantId, requestId: 'request.1' };
    store.reserveRequest(request(activeGrant.grantId));
    const before = store.load();
    store.close();
    const initialization = {
      expectedRevision: before.revision,
      ledgerId: 'ledger.local.clean-cutover.concurrent',
      policy: executionPolicy(),
      capacity: 8,
    };
    const responses = await runBarrierRace(directory, [
      { kind: 'durableInitialize', input: initialization },
      { kind: 'durableInitialize', input: initialization },
    ]);
    assert.deepEqual(responses, [
      { ok: false, code: 'SERVICE_CREDIT_STORE_EXECUTION_INITIALIZATION_UNSAFE' },
      { ok: false, code: 'SERVICE_CREDIT_STORE_EXECUTION_INITIALIZATION_UNSAFE' },
    ]);
    const reopened = ServiceCreditSqliteStore.openExisting(options(directory));
    assert.deepEqual(reopened.load(), before);
    assert.equal(reopened.getDurableExecutionSnapshot().executionState, null);
    const released = reopened.releaseBeforeExecution(reference);
    assert.equal(released.request.state, REQUEST_STATE.FAILED_RELEASED);
    assert.equal(reopened.getGrant(activeGrant.grantId).heldUnits, 0);
    reopened.close();
  });

  await t.test('hydration rejects a durable compound state with an unlinked reservation', t => {
    const directory = privateDirectoryFor(t);
    const reservedConfiguration = options(directory, {
      databasePath: join(directory, 'reserved.sqlite'),
    });
    const { activeGrant, store } = initializedStore(directory, {
      databasePath: reservedConfiguration.databasePath,
    });
    store.reserveRequest(request(activeGrant.grantId));
    store.close();

    const emptyDirectory = privateDirectoryFor(t);
    const emptyConfiguration = options(emptyDirectory);
    const emptyStore = ServiceCreditSqliteStore.create(emptyConfiguration);
    const initialized = emptyStore.initializeDurableExecution({
      expectedRevision: 0,
      ledgerId: 'ledger.local.clean-cutover.corrupt',
      policy: executionPolicy(),
      capacity: 8,
    });
    emptyStore.close();

    const persisted = readPersistedEnvelope(reservedConfiguration);
    persisted.envelope.executionState = initialized.executionState;
    persisted.envelope.checksum = physicalV2ChecksumFor(
      persisted.envelope.physicalVersion,
      persisted.envelope.revision,
      persisted.envelope.ledgerState,
      persisted.envelope.executionState,
    );
    writePersistedEnvelope(reservedConfiguration, 2, canonicalJson(persisted.envelope));
    expectCode(
      () => ServiceCreditSqliteStore.openExisting(reservedConfiguration),
      'SERVICE_CREDIT_STORE_CORRUPT',
    );
  });
});

test('durable preparation validates duration before clock and pricing effects', async t => {
  await t.test('stale and replay or conflict precedence remains pre-effect', t => {
    const directory = privateDirectoryFor(t);
    let clockCalls = 0;
    let pricingCalls = 0;
    const { activeGrant, store } = initializedStore(directory, {
      now: () => {
        clockCalls += 1;
        return NOW;
      },
      deriveCost: () => {
        pricingCalls += 1;
        return 3;
      },
    });
    const baseRevision = store.getMetadata().revision;
    const initialized = store.initializeDurableExecution({
      expectedRevision: baseRevision,
      ledgerId: 'ledger.local.duration-precedence',
      policy: executionPolicy({ maxDurationMs: 1_000 }),
      capacity: 8,
    });
    const input = request(activeGrant.grantId);
    const beforeStaleClock = clockCalls;
    const beforeStalePricing = pricingCalls;
    const stale = store.prepareDurableExecution({
      expectedRevision: baseRevision,
      request: input,
      selectedDurationMs: 1_001,
    });
    assert.equal(stale.disposition, 'STALE');
    assert.equal(clockCalls, beforeStaleClock);
    assert.equal(pricingCalls, beforeStalePricing);

    const prepared = store.prepareDurableExecution({
      expectedRevision: initialized.revision,
      request: input,
      selectedDurationMs: 1_000,
    });
    const beforeReplay = store.load();
    const beforeReplayClock = clockCalls;
    const beforeReplayPricing = pricingCalls;
    assert.equal(store.prepareDurableExecution({
      expectedRevision: prepared.revision,
      request: input,
      selectedDurationMs: 1_000,
    }).disposition, 'UNCHANGED');
    expectCode(
      () => store.prepareDurableExecution({
        expectedRevision: prepared.revision,
        request: { ...input, canonicalBodyDigest: digest('c') },
        selectedDurationMs: 1_001,
      }),
      'REQUEST_ID_CONFLICT',
    );
    expectCode(
      () => store.prepareDurableExecution({
        expectedRevision: prepared.revision,
        request: input,
        selectedDurationMs: 1_001,
      }),
      'SERVICE_CREDIT_STORE_EXECUTION_CONFLICT',
    );
    assert.deepEqual(store.load(), beforeReplay);
    assert.equal(clockCalls, beforeReplayClock);
    assert.equal(pricingCalls, beforeReplayPricing);
    store.close();
  });

  await t.test('over-policy duration performs zero callbacks or writes', t => {
    const directory = privateDirectoryFor(t);
    let clockCalls = 0;
    let pricingCalls = 0;
    const { activeGrant, store } = initializedStore(directory, {
      now: () => {
        clockCalls += 1;
        return NOW;
      },
      deriveCost: () => {
        pricingCalls += 1;
        return 3;
      },
    });
    const initialized = store.initializeDurableExecution({
      expectedRevision: store.getMetadata().revision,
      ledgerId: 'ledger.local.duration-over-policy',
      policy: executionPolicy({ maxDurationMs: 1_000 }),
      capacity: 8,
    });
    const before = store.load();
    const beforeClock = clockCalls;
    const beforePricing = pricingCalls;
    expectCode(
      () => store.prepareDurableExecution({
        expectedRevision: initialized.revision,
        request: request(activeGrant.grantId),
        selectedDurationMs: 1_001,
      }),
      'SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT',
    );
    assert.deepEqual(store.load(), before);
    assert.equal(clockCalls, beforeClock);
    assert.equal(pricingCalls, beforePricing);
    store.close();
  });

  await t.test('deadline overflow performs one clock callback and zero pricing or writes', t => {
    const directory = privateDirectoryFor(t);
    let now = NOW;
    let clockCalls = 0;
    let pricingCalls = 0;
    const { activeGrant, store } = initializedStore(directory, {
      now: () => {
        clockCalls += 1;
        return now;
      },
      deriveCost: () => {
        pricingCalls += 1;
        return 3;
      },
    }, { expiresAt: Number.MAX_SAFE_INTEGER });
    const initialized = store.initializeDurableExecution({
      expectedRevision: store.getMetadata().revision,
      ledgerId: 'ledger.local.duration-overflow',
      policy: executionPolicy(),
      capacity: 8,
    });
    now = Number.MAX_SAFE_INTEGER - 1;
    const before = store.load();
    const beforeClock = clockCalls;
    const beforePricing = pricingCalls;
    expectCode(
      () => store.prepareDurableExecution({
        expectedRevision: initialized.revision,
        request: request(activeGrant.grantId),
        selectedDurationMs: 2,
      }),
      'SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT',
    );
    assert.deepEqual(store.load(), before);
    assert.equal(clockCalls, beforeClock + 1);
    assert.equal(pricingCalls, beforePricing);
    store.close();
  });
});

test('durable recovery and completion races honor the expected compound revision', async t => {
  for (const winner of ['recovery', 'completion']) {
    await t.test(winner, t => {
      const directory = privateDirectoryFor(t);
      const { activeGrant, store } = initializedStore(directory);
      const initialized = store.initializeDurableExecution({
        expectedRevision: store.getMetadata().revision,
        ledgerId: `ledger.local.recovery-race.${winner}`,
        policy: executionPolicy(),
        capacity: 8,
      });
      const prepared = store.prepareDurableExecution({
        expectedRevision: initialized.revision,
        request: request(activeGrant.grantId),
        selectedDurationMs: 1_000,
      });
      const fenced = store.persistDurableExecutionFence({
        expectedRevision: prepared.revision,
        executionId: prepared.execution.executionId,
      });
      store.close();

      const first = ServiceCreditSqliteStore.openExisting(options(directory));
      const second = ServiceCreditSqliteStore.openExisting(options(directory));
      const recover = candidate => candidate.recoverDurableExecutionsAfterRestart({
        expectedRevision: fenced.revision,
      });
      const complete = candidate => candidate.completeDurableExecution({
        expectedRevision: fenced.revision,
        executionId: fenced.execution.executionId,
        cachedResult: result(),
      });
      const applied = winner === 'recovery' ? recover(first) : complete(first);
      const stale = winner === 'recovery' ? complete(second) : recover(second);
      assert.equal(applied.disposition, 'APPLIED');
      assert.equal(stale.disposition, 'STALE');
      const requestState = first.getRequest({
        grantId: activeGrant.grantId,
        requestId: 'request.1',
      });
      assert.equal(
        requestState.state,
        winner === 'recovery' ? REQUEST_STATE.OUTCOME_UNKNOWN : REQUEST_STATE.SUCCEEDED,
      );
      first.close();
      second.close();
    });
  }
});

test('durable compound cross-links and result commitments reject checksum-valid corruption', async t => {
  async function fixture(name, terminal = false) {
    const directory = privateDirectoryFor(t);
    const configuration = options(directory, { databasePath: join(directory, `${name}.sqlite`) });
    const store = ServiceCreditSqliteStore.create(configuration);
    store.registerOffer(offer());
    const activeGrant = store.activateGrantFromTrustedRecord(grant({
      transactionId: `transaction.${name}`,
    }));
    const initialized = store.initializeDurableExecution({
      expectedRevision: store.getMetadata().revision,
      ledgerId: `ledger.local.corrupt.${name}`,
      policy: executionPolicy(),
      capacity: 8,
    });
    const prepared = store.prepareDurableExecution({
      expectedRevision: initialized.revision,
      request: request(activeGrant.grantId),
      selectedDurationMs: 1_000,
    });
    if (terminal) {
      const fenced = store.persistDurableExecutionFence({
        expectedRevision: prepared.revision,
        executionId: prepared.execution.executionId,
      });
      store.completeDurableExecution({
        expectedRevision: fenced.revision,
        executionId: fenced.execution.executionId,
        cachedResult: result(),
      });
    }
    store.close();
    return configuration;
  }

  await t.test('ledger state mismatch', async () => {
    const configuration = await fixture('ledger-mismatch');
    const persisted = readPersistedEnvelope(configuration);
    persisted.envelope.ledgerState.requests[0].state = REQUEST_STATE.RESERVED;
    persisted.envelope.checksum = physicalV2ChecksumFor(
      persisted.envelope.physicalVersion,
      persisted.envelope.revision,
      persisted.envelope.ledgerState,
      persisted.envelope.executionState,
    );
    writePersistedEnvelope(configuration, 2, canonicalJson(persisted.envelope));
    expectCode(
      () => ServiceCreditSqliteStore.openExisting(configuration),
      'SERVICE_CREDIT_STORE_CORRUPT',
    );
  });

  await t.test('duplicate execution', async () => {
    const configuration = await fixture('duplicate-execution');
    const persisted = readPersistedEnvelope(configuration);
    persisted.envelope.executionState.executions.push(
      structuredClone(persisted.envelope.executionState.executions[0]),
    );
    persisted.envelope.checksum = physicalV2ChecksumFor(
      persisted.envelope.physicalVersion,
      persisted.envelope.revision,
      persisted.envelope.ledgerState,
      persisted.envelope.executionState,
    );
    writePersistedEnvelope(configuration, 2, canonicalJson(persisted.envelope));
    expectCode(
      () => ServiceCreditSqliteStore.openExisting(configuration),
      'SERVICE_CREDIT_STORE_CORRUPT',
    );
  });

  await t.test('result commitment mismatch', async () => {
    const configuration = await fixture('result-mismatch', true);
    const persisted = readPersistedEnvelope(configuration);
    persisted.envelope.executionState.executions[0].resultCommitment = digest('f');
    persisted.envelope.checksum = physicalV2ChecksumFor(
      persisted.envelope.physicalVersion,
      persisted.envelope.revision,
      persisted.envelope.ledgerState,
      persisted.envelope.executionState,
    );
    writePersistedEnvelope(configuration, 2, canonicalJson(persisted.envelope));
    expectCode(
      () => ServiceCreditSqliteStore.openExisting(configuration),
      'SERVICE_CREDIT_STORE_CORRUPT',
    );
  });
});

test('durable revision exhaustion and sealed admission fail without mutation', async t => {
  await t.test('revision exhaustion', t => {
    const directory = privateDirectoryFor(t);
    const configuration = options(directory);
    const store = ServiceCreditSqliteStore.create(configuration);
    store.close();
    const persisted = readPersistedEnvelope(configuration);
    persisted.envelope.revision = Number.MAX_SAFE_INTEGER;
    persisted.envelope.checksum = physicalV2ChecksumFor(
      persisted.envelope.physicalVersion,
      persisted.envelope.revision,
      persisted.envelope.ledgerState,
      persisted.envelope.executionState,
    );
    writePersistedEnvelope(configuration, 2, canonicalJson(persisted.envelope));
    const reopened = ServiceCreditSqliteStore.openExisting(configuration);
    const before = readPersistedEnvelope(configuration);
    expectCode(
      () => reopened.initializeDurableExecution({
        expectedRevision: Number.MAX_SAFE_INTEGER,
        ledgerId: 'ledger.local.revision-max',
        policy: executionPolicy(),
        capacity: 8,
      }),
      'SERVICE_CREDIT_STORE_CAPACITY_EXCEEDED',
    );
    assert.deepEqual(readPersistedEnvelope(configuration), before);
    reopened.close();
  });

  await t.test('sealed generation', t => {
    const directory = privateDirectoryFor(t);
    const { activeGrant, store } = initializedStore(directory);
    const initialized = store.initializeDurableExecution({
      expectedRevision: store.getMetadata().revision,
      ledgerId: 'ledger.local.sealed',
      policy: executionPolicy(),
      capacity: 8,
    });
    const prepared = store.prepareDurableExecution({
      expectedRevision: initialized.revision,
      request: request(activeGrant.grantId),
      selectedDurationMs: 1_000,
    });
    const fenced = store.persistDurableExecutionFence({
      expectedRevision: prepared.revision,
      executionId: prepared.execution.executionId,
    });
    const unknown = store.markDurableExecutionUnknown({
      expectedRevision: fenced.revision,
      executionId: fenced.execution.executionId,
      reason: 'LOST_CONTROL',
    });
    const before = store.load();
    expectCode(
      () => store.prepareDurableExecution({
        expectedRevision: unknown.revision,
        request: request(activeGrant.grantId, { requestId: 'request.2' }),
        selectedDurationMs: 1_000,
      }),
      'SERVICE_CREDIT_STORE_EXECUTION_GENERATION_SEALED',
    );
    assert.deepEqual(store.load(), before);
    store.close();
  });
});

test('durable receipts expose no invocation authority and admin writes preserve execution state', t => {
  const directory = privateDirectoryFor(t);
  const { activeGrant, store } = initializedStore(directory);
  const initialized = store.initializeDurableExecution({
    expectedRevision: store.getMetadata().revision,
    ledgerId: 'ledger.local.no-authority',
    policy: executionPolicy(),
    capacity: 8,
  });
  const prepared = store.prepareDurableExecution({
    expectedRevision: initialized.revision,
    request: request(activeGrant.grantId),
    selectedDurationMs: 1_000,
  });
  const fenced = store.persistDurableExecutionFence({
    expectedRevision: prepared.revision,
    executionId: prepared.execution.executionId,
  });
  const serialized = JSON.stringify({ initialized, prepared, fenced });
  assert.equal(/authoriz|permission|token/i.test(serialized), false);
  const beforeExecution = store.getDurableExecutionSnapshot().executionState;
  const revoked = store.revokeGrant({ grantId: activeGrant.grantId });
  assert.equal(revoked.lifecycle, GRANT_LIFECYCLE.REVOKED);
  const after = store.getDurableExecutionSnapshot();
  assert.deepEqual(after.executionState, beforeExecution);
  assert.equal(after.revision, fenced.revision + 1);
  store.close();
});

test('durable SQLite integration exposes only the reviewed inert store boundary', () => {
  const durableMethods = Object.getOwnPropertyNames(ServiceCreditSqliteStore.prototype)
    .filter(name => name === 'getDurableExecutionSnapshot' || name.includes('DurableExecution'))
    .sort();
  assert.deepEqual(durableMethods, [
    'completeDurableExecution',
    'getDurableExecutionSnapshot',
    'initializeDurableExecution',
    'markDurableExecutionUnknown',
    'persistDurableExecutionFence',
    'prepareDurableExecution',
    'recoverDurableExecutionsAfterRestart',
  ]);

  const source = readFileSync(
    new URL('../src/service-credit-sqlite-store.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    source,
    /from ['"]node:(?:http|https|net|tls|timers|worker_threads|child_process)['"];/,
  );
  assert.doesNotMatch(source, /\bprocess\.(?:on|once|addListener|env)\b/);
  assert.doesNotMatch(source, /\bset(?:Timeout|Interval|Immediate)\s*\(/);
});
