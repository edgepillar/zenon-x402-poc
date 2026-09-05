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
  ServiceCreditSqliteStore,
} from '../src/service-credit-sqlite-store.js';
import {
  GRANT_LIFECYCLE,
  REQUEST_STATE,
  SERVICE_CREDIT_ACTIVATION_VERSION,
  SERVICE_CREDIT_MODEL_VERSION,
} from '../src/service-credit-model.js';

const NOW = 2_000_000_000_000;

function digest(fill) {
  return `sha256:${fill.repeat(64)}`;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function rewriteLedgerState(configuration, mutate) {
  const database = new DatabaseSync(configuration.databasePath);
  const envelope = JSON.parse(
    database.prepare('SELECT envelope FROM service_credit_ledger').get().envelope,
  );
  mutate(envelope.state);
  envelope.checksum = `sha256:${createHash('sha256').update(canonicalJson({
    revision: envelope.revision,
    schemaVersion: envelope.schemaVersion,
    state: envelope.state,
  })).digest('hex')}`;
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

  await t.test('unknown envelope schema', t => {
    const directory = privateDirectoryFor(t);
    const configuration = options(directory);
    const store = ServiceCreditSqliteStore.create(configuration);
    store.close();
    const database = new DatabaseSync(configuration.databasePath);
    const envelope = JSON.parse(
      database.prepare('SELECT envelope FROM service_credit_ledger').get().envelope,
    );
    envelope.schemaVersion = 2;
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
    envelope.state.schemaVersion = 1;
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
    assert.equal(persisted.state.schemaVersion, 1);
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
