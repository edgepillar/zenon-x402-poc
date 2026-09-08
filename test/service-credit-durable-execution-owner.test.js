import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

import * as durableOwnerModule from '../src/service-credit-durable-execution-owner.js';
import {
  REQUEST_STATE,
  SERVICE_CREDIT_ACTIVATION_VERSION,
  SERVICE_CREDIT_MODEL_VERSION,
} from '../src/service-credit-model.js';
import { ServiceCreditSqliteStore } from '../src/service-credit-sqlite-store.js';

const { createDurableServiceCreditExecutionOwner } = durableOwnerModule;
const NOW = 2_000_000_000_000;
const TEST_DEFINE_PROPERTY = Object.defineProperty;
const TEST_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const TEST_DELETE_PROPERTY = Reflect.deleteProperty;

function digest(fill) {
  return `sha256:${fill.repeat(64)}`;
}

function offer() {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    providerId: 'provider.owner',
    serviceId: 'service.owner',
    resourceId: 'resource.owner',
    resourceBinding: digest('e'),
    offerId: 'offer.owner',
    offerVersion: 1,
    costPolicyId: 'cost.owner',
    fundingPolicyId: 'funding.owner',
    fundingPolicyVersion: 1,
  };
}

function grant(overrides = {}) {
  const transactionLabel = overrides.transactionId ?? 'transaction.owner';
  const { transactionId: ignoredTransactionId, ...rest } = overrides;
  return {
    activationVersion: SERVICE_CREDIT_ACTIVATION_VERSION,
    authorityProfileId: 'authority.owner',
    authorityProfileVersion: 1,
    verifierVersion: 1,
    authorityRecordDigest: digest('d'),
    fundingPolicyId: 'funding.owner',
    fundingPolicyVersion: 1,
    sourceSettlementId: 'settlement.owner',
    transactionId: `mocktx:${createHash('sha256').update(transactionLabel).digest('hex')}`,
    providerId: 'provider.owner',
    serviceId: 'service.owner',
    resourceId: 'resource.owner',
    resourceBinding: digest('e'),
    offerId: 'offer.owner',
    offerVersion: 1,
    holderId: 'holder.owner',
    capabilityCommitment: digest('a'),
    totalUnits: 100,
    expiresAt: NOW + 1_000_000,
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
    payee: 'payee.owner',
    payer: 'holder.owner',
    paymentResourceDigest: digest('4'),
    paymentRequirementDigest: digest('2'),
    paymentIntentDigest: digest('1'),
    grantFundingCommitment: digest('3'),
    evidenceState: 'MOMENTUM_INCLUDED',
    confirmationPolicy: {
      policyId: 'mock.momentum-included',
      policyVersion: 1,
      minimumConfirmations: 1,
    },
    ...rest,
  };
}

function request(grantId, overrides = {}) {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    grantId,
    requestId: 'request.owner.1',
    method: 'POST',
    routeId: 'owner.v1',
    canonicalBodyDigest: digest('b'),
    selectedContentType: 'application/json',
    maxCostUnits: Number.MAX_SAFE_INTEGER,
    ...overrides,
  };
}

function policy(overrides = {}) {
  return {
    policyId: 'execution.owner',
    policyVersion: 1,
    maxDurationMs: 5_000,
    ...overrides,
  };
}

function directoryFor(t) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'service-credit-owner-')));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function configuration(directory, overrides = {}) {
  return {
    databasePath: join(directory, 'ledger.sqlite'),
    allowedRoot: directory,
    now: () => NOW,
    deriveCost: () => 2,
    ...overrides,
  };
}

function safeClose(store) {
  try { store.close(); } catch {}
}

function initializedLedger(t, overrides = {}) {
  const directory = overrides.directory ?? directoryFor(t);
  const config = configuration(directory, overrides.configuration);
  const store = ServiceCreditSqliteStore.create(config);
  t.after(() => safeClose(store));
  store.registerOffer(offer());
  const activeGrant = store.activateGrantFromTrustedRecord(grant(overrides.grant));
  const initialized = store.initializeDurableExecution({
    expectedRevision: store.getMetadata().revision,
    ledgerId: overrides.ledgerId ?? 'ledger.owner',
    policy: policy(overrides.policy),
    capacity: overrides.capacity ?? 8,
  });
  return { activeGrant, config, directory, initialized, store };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function expectRejectedCode(promise, code) {
  await assert.rejects(promise, error => {
    assert.equal(error?.code, code);
    assert.equal(error?.message, code);
    assert.equal(Object.hasOwn(error, 'cause'), false);
    return true;
  });
}

function callbackResult(resultCode = 'owner.completed') {
  return { resultCode };
}

function directPrepare(store, initialized, input, selectedDurationMs = 1_000) {
  return store.prepareDurableExecution({
    expectedRevision: initialized.revision,
    request: input,
    selectedDurationMs,
  });
}

test('durable execution owner exposes only the reviewed inert factory', () => {
  assert.deepEqual(Object.keys(durableOwnerModule), [
    'createDurableServiceCreditExecutionOwner',
  ]);
  assert.equal(createDurableServiceCreditExecutionOwner.length, 1);
  const source = readFileSync(
    new URL('../src/service-credit-durable-execution-owner.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /\b(?:setTimeout|setInterval|AbortController|AbortSignal|Date)\b/);
  assert.doesNotMatch(
    source,
    /from ['"]node:(?:http|https|net|tls|timers|worker_threads|child_process|fs)['"]/,
  );
  assert.doesNotMatch(source, /\bprocess\.(?:on|once|addListener|env)\b/);
});

test('factory is inert, captures exact dependencies, and exposes a frozen two-method surface', async t => {
  const directory = directoryFor(t);
  let clockCalls = 0;
  let pricingCalls = 0;
  let callbackCalls = 0;
  const store = ServiceCreditSqliteStore.create(configuration(directory, {
    now: () => { clockCalls += 1; return NOW; },
    deriveCost: () => { pricingCalls += 1; return 2; },
  }));
  t.after(() => safeClose(store));
  const before = store.load();
  const beforeClock = clockCalls;
  const beforePricing = pricingCalls;
  const execute = () => { callbackCalls += 1; return callbackResult(); };
  const options = { store, execute };
  const owner = createDurableServiceCreditExecutionOwner(options);

  assert.deepEqual(Reflect.ownKeys(owner), ['run', 'close']);
  assert.equal(Object.isFrozen(owner), true);
  assert.equal(Object.isFrozen(owner.run), true);
  assert.equal(Object.isFrozen(owner.close), true);
  assert.equal(owner.run.length, 1);
  assert.equal(owner.close.length, 0);
  assert.equal(Object.hasOwn(owner.run, 'prototype'), false);
  assert.equal(Object.hasOwn(owner.close, 'prototype'), false);
  assert.deepEqual(store.load(), before);
  assert.equal(clockCalls, beforeClock);
  assert.equal(pricingCalls, beforePricing);
  assert.equal(callbackCalls, 0);

  options.store = null;
  options.execute = () => { throw new Error('replacement'); };
  assert.deepEqual(await owner.run({
    request: request('grant_unavailable'),
    selectedDurationMs: 1,
  }), { status: 'RECOVERY_REQUIRED', cachedResult: null });
  await owner.close();
  assert.deepEqual(store.load(), before);
});

test('factory rejects wrong arity, hostile shapes, callback proxies, and reused store handles', async t => {
  const ledger = initializedLedger(t);
  const execute = () => callbackResult();
  assert.throws(
    () => createDurableServiceCreditExecutionOwner(),
    error => error?.code === 'SERVICE_CREDIT_DURABLE_OWNER_INVALID_CONFIGURATION',
  );
  assert.throws(
    () => createDurableServiceCreditExecutionOwner({
      store: ledger.store,
      execute,
      extra: true,
    }),
    error => error?.code === 'SERVICE_CREDIT_DURABLE_OWNER_INVALID_CONFIGURATION',
  );
  let trapCalls = 0;
  const hostile = new Proxy({ store: ledger.store, execute }, {
    ownKeys() { trapCalls += 1; throw new Error('hostile'); },
  });
  assert.throws(
    () => createDurableServiceCreditExecutionOwner(hostile),
    error => error?.code === 'SERVICE_CREDIT_DURABLE_OWNER_INVALID_CONFIGURATION',
  );
  assert.equal(trapCalls, 0);
  assert.throws(
    () => createDurableServiceCreditExecutionOwner({
      store: ledger.store,
      execute: new Proxy(execute, {}),
    }),
    error => error?.code === 'SERVICE_CREDIT_DURABLE_OWNER_INVALID_CONFIGURATION',
  );
  const owner = createDurableServiceCreditExecutionOwner({ store: ledger.store, execute });
  assert.throws(
    () => createDurableServiceCreditExecutionOwner({ store: ledger.store, execute }),
    error => error?.code === 'SERVICE_CREDIT_DURABLE_OWNER_INVALID_CONFIGURATION',
  );
  await owner.close();
});

test('run validates and detaches exact input before store, clock, pricing, or callback effects', async t => {
  let beginCalls = 0;
  let clockCalls = 0;
  let pricingCalls = 0;
  let callbackCalls = 0;
  const ledger = initializedLedger(t, {
    configuration: {
      now: () => { clockCalls += 1; return NOW; },
      deriveCost: () => { pricingCalls += 1; return 2; },
      testHooks: {
        beforeBegin() { beginCalls += 1; },
      },
    },
  });
  const owner = createDurableServiceCreditExecutionOwner({
    store: ledger.store,
    execute: () => { callbackCalls += 1; return callbackResult(); },
  });
  const baseline = { beginCalls, clockCalls, pricingCalls, callbackCalls };
  await expectRejectedCode(owner.run(), 'SERVICE_CREDIT_DURABLE_OWNER_INVALID_INPUT');
  await expectRejectedCode(
    owner.run({ request: request(ledger.activeGrant.grantId), selectedDurationMs: 1 }, 1),
    'SERVICE_CREDIT_DURABLE_OWNER_INVALID_INPUT',
  );
  const accessor = { selectedDurationMs: 1 };
  Object.defineProperty(accessor, 'request', {
    enumerable: true,
    get() { callbackCalls += 1; throw new Error('accessor'); },
  });
  await expectRejectedCode(owner.run(accessor), 'SERVICE_CREDIT_DURABLE_OWNER_INVALID_INPUT');
  assert.deepEqual({ beginCalls, clockCalls, pricingCalls, callbackCalls }, baseline);
  await owner.close();
});

test('fresh execution succeeds once and exact replay returns cached success without reinvocation', async t => {
  const ledger = initializedLedger(t);
  const identities = [];
  const owner = createDurableServiceCreditExecutionOwner({
    store: ledger.store,
    execute: identity => {
      identities.push(identity);
      return callbackResult();
    },
  });
  const input = { request: request(ledger.activeGrant.grantId), selectedDurationMs: 1_000 };
  const first = await owner.run(input);
  assert.deepEqual(first, {
    status: 'SUCCEEDED',
    cachedResult: {
      statusCode: 200,
      contentType: 'application/json',
      resultCode: 'owner.completed',
    },
  });
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.cachedResult), true);
  assert.equal(identities.length, 1);
  assert.deepEqual(Reflect.ownKeys(identities[0]), ['executionId']);
  assert.equal(Object.isFrozen(identities[0]), true);
  const revision = ledger.store.getMetadata().revision;
  const replay = await owner.run(input);
  assert.deepEqual(replay, { status: 'CACHED_SUCCESS', cachedResult: first.cachedResult });
  assert.notEqual(replay.cachedResult, first.cachedResult);
  assert.equal(identities.length, 1);
  assert.equal(ledger.store.getMetadata().revision, revision);
  const close = owner.close();
  assert.equal(owner.close(), close);
  await close;
  assert.equal(ledger.store.getDurableExecutionSnapshot().executionState !== null, true);
});

test('asynchronous callback success is observed and persisted without a timer or retry', async t => {
  const ledger = initializedLedger(t);
  let calls = 0;
  const owner = createDurableServiceCreditExecutionOwner({
    store: ledger.store,
    execute: async () => {
      calls += 1;
      await Promise.resolve();
      return callbackResult('owner.async');
    },
  });
  const outcome = await owner.run({
    request: request(ledger.activeGrant.grantId),
    selectedDurationMs: 1_000,
  });
  assert.equal(outcome.status, 'SUCCEEDED');
  assert.equal(outcome.cachedResult.resultCode, 'owner.async');
  assert.equal(calls, 1);
  await owner.close();
});

test('deadline equality is a latest-start rejection with zero callback starts', async t => {
  const clock = { value: NOW };
  let callbackCalls = 0;
  let armed = false;
  const ledger = initializedLedger(t, {
    configuration: {
      now: () => clock.value,
      testHooks: {
        afterCommit({ operation }) {
          if (armed && operation === 'prepareDurableExecution') clock.value = NOW + 1_000;
        },
      },
    },
  });
  const owner = createDurableServiceCreditExecutionOwner({
    store: ledger.store,
    execute: () => { callbackCalls += 1; return callbackResult(); },
  });
  armed = true;
  const outcome = await owner.run({
    request: request(ledger.activeGrant.grantId),
    selectedDurationMs: 1_000,
  });
  armed = false;
  assert.deepEqual(outcome, { status: 'NOT_INVOKED', cachedResult: null });
  assert.equal(callbackCalls, 0);
  assert.equal(ledger.store.getRequest({
    grantId: ledger.activeGrant.grantId,
    requestId: 'request.owner.1',
  }).state, REQUEST_STATE.FAILED_RELEASED);
  await owner.close();
});

test('a callback fenced before the deadline may complete after it without continuous enforcement', async t => {
  let now = NOW;
  const ledger = initializedLedger(t, {
    configuration: {
      now: () => now,
      testHooks: {
        afterCommit({ operation }) {
          if (operation === 'prepareDurableExecution') now = NOW + 999;
        },
      },
    },
  });
  let callbackCalls = 0;
  const owner = createDurableServiceCreditExecutionOwner({
    store: ledger.store,
    execute: () => {
      callbackCalls += 1;
      now = NOW + 10_000;
      return callbackResult();
    },
  });
  const outcome = await owner.run({
    request: request(ledger.activeGrant.grantId),
    selectedDurationMs: 1_000,
  });
  assert.equal(outcome.status, 'SUCCEEDED');
  assert.equal(callbackCalls, 1);
  assert.equal(now > NOW + 1_000, true);
  await owner.close();
});

test('expired grant denial performs no callback and no automatic retry', async t => {
  let clock = NOW;
  let callbackCalls = 0;
  let prepareAttempts = 0;
  const ledger = initializedLedger(t, {
    grant: { expiresAt: NOW + 10 },
    configuration: {
      now: () => clock,
      testHooks: {
        beforeBegin({ operation }) {
          if (operation === 'prepareDurableExecution') prepareAttempts += 1;
        },
      },
    },
  });
  clock = NOW + 10;
  const owner = createDurableServiceCreditExecutionOwner({
    store: ledger.store,
    execute: () => { callbackCalls += 1; return callbackResult(); },
  });
  await expectRejectedCode(owner.run({
    request: request(ledger.activeGrant.grantId),
    selectedDurationMs: 1_000,
  }), 'SERVICE_CREDIT_DURABLE_OWNER_OPERATION_FAILED');
  assert.equal(prepareAttempts, 1);
  assert.equal(callbackCalls, 0);
  assert.equal(ledger.store.getRequest({
    grantId: ledger.activeGrant.grantId,
    requestId: 'request.owner.1',
  }), null);
  await owner.close();
});

test('close before run is exact, idempotent, and never closes the borrowed store', async t => {
  const ledger = initializedLedger(t);
  const owner = createDurableServiceCreditExecutionOwner({
    store: ledger.store,
    execute: () => callbackResult(),
  });
  await expectRejectedCode(
    owner.close('extra'),
    'SERVICE_CREDIT_DURABLE_OWNER_INVALID_INPUT',
  );
  const closing = owner.close();
  assert.equal(owner.close(), closing);
  await closing;
  await expectRejectedCode(owner.run({
    request: request(ledger.activeGrant.grantId),
    selectedDurationMs: 1_000,
  }), 'SERVICE_CREDIT_DURABLE_OWNER_CLOSED');
  assert.equal(ledger.store.getDurableExecutionSnapshot().executionState !== null, true);
});

test('callback loss modes converge through exactly one conservative unknown attempt', async t => {
  const cases = [
    ['synchronous throw', () => { throw new Error('private'); }],
    ['asynchronous rejection', async () => { throw new Error('private'); }],
    ['throwing then getter', () => Object.defineProperty({}, 'then', {
      get() { throw new Error('private'); },
    })],
    ['malformed result', () => ({ resultCode: '' })],
    ['accessor result', () => Object.defineProperty({}, 'resultCode', {
      enumerable: true,
      get() { throw new Error('private'); },
    })],
    ['proxied result', () => new Proxy({ resultCode: 'owner.proxy' }, {
      get() { throw new Error('private'); },
    })],
  ];
  for (const [name, execute] of cases) {
    await t.test(name, async t => {
      let unknownAttempts = 0;
      const ledger = initializedLedger(t, {
        ledgerId: `ledger.owner.loss.${name.replaceAll(' ', '.')}`,
        configuration: {
          testHooks: {
            beforeBegin({ operation }) {
              if (operation === 'markDurableExecutionUnknown') unknownAttempts += 1;
            },
          },
        },
      });
      const owner = createDurableServiceCreditExecutionOwner({ store: ledger.store, execute });
      const outcome = await owner.run({
        request: request(ledger.activeGrant.grantId),
        selectedDurationMs: 1_000,
      });
      assert.deepEqual(outcome, { status: 'OUTCOME_UNKNOWN', cachedResult: null });
      assert.equal(unknownAttempts, 1);
      assert.equal(ledger.store.getRequest({
        grantId: ledger.activeGrant.grantId,
        requestId: 'request.owner.1',
      }).state, REQUEST_STATE.OUTCOME_UNKNOWN);
      await owner.close();
    });
  }
});

test('owner never initializes or automatically recovers null, prepared, fenced, or unknown state', async t => {
  await t.test('null execution state', async t => {
    const directory = directoryFor(t);
    const store = ServiceCreditSqliteStore.create(configuration(directory));
    t.after(() => safeClose(store));
    const revision = store.getMetadata().revision;
    let calls = 0;
    const owner = createDurableServiceCreditExecutionOwner({
      store,
      execute: () => { calls += 1; return callbackResult(); },
    });
    assert.deepEqual(await owner.run({
      request: request('grant_missing'),
      selectedDurationMs: 1,
    }), { status: 'RECOVERY_REQUIRED', cachedResult: null });
    assert.equal(store.getMetadata().revision, revision);
    assert.equal(calls, 0);
    await owner.close();
  });

  for (const phase of ['PREPARED', 'MAY_HAVE_STARTED', 'OUTCOME_UNKNOWN']) {
    await t.test(phase, async t => {
      const ledger = initializedLedger(t, { ledgerId: `ledger.owner.reopen.${phase}` });
      const input = request(ledger.activeGrant.grantId);
      const prepared = directPrepare(ledger.store, ledger.initialized, input);
      let revision = prepared.revision;
      if (phase !== 'PREPARED') {
        const fenced = ledger.store.persistDurableExecutionFence({
          expectedRevision: revision,
          executionId: prepared.execution.executionId,
        });
        revision = fenced.revision;
        if (phase === 'OUTCOME_UNKNOWN') {
          revision = ledger.store.markDurableExecutionUnknown({
            expectedRevision: revision,
            executionId: prepared.execution.executionId,
            reason: 'LOST_CONTROL',
          }).revision;
        }
      }
      ledger.store.close();
      const reopened = ServiceCreditSqliteStore.openExisting(ledger.config);
      t.after(() => safeClose(reopened));
      let calls = 0;
      const owner = createDurableServiceCreditExecutionOwner({
        store: reopened,
        execute: () => { calls += 1; return callbackResult(); },
      });
      const outcome = await owner.run({ request: input, selectedDurationMs: 1_000 });
      assert.equal(
        outcome.status,
        phase === 'OUTCOME_UNKNOWN' ? 'OUTCOME_UNKNOWN' : 'RECOVERY_REQUIRED',
      );
      assert.equal(reopened.getMetadata().revision, revision);
      assert.equal(calls, 0);
      await owner.close();
    });
  }
});

test('a stale prepare stops without retry or callback invocation', async t => {
  let competingStore;
  let armed = false;
  let injected = false;
  let activeGrantId;
  const ledger = initializedLedger(t, {
    configuration: {
      testHooks: {
        afterCommit({ operation }) {
          if (armed && !injected && operation === 'getDurableExecutionSnapshot') {
            injected = true;
            competingStore.revokeGrant({ grantId: activeGrantId });
          }
        },
      },
    },
  });
  activeGrantId = ledger.activeGrant.grantId;
  competingStore = ServiceCreditSqliteStore.openExisting(ledger.config);
  t.after(() => safeClose(competingStore));
  let callbackCalls = 0;
  const owner = createDurableServiceCreditExecutionOwner({
    store: ledger.store,
    execute: () => { callbackCalls += 1; return callbackResult(); },
  });
  armed = true;
  const outcome = await owner.run({
    request: request(ledger.activeGrant.grantId),
    selectedDurationMs: 1_000,
  });
  armed = false;
  assert.deepEqual(outcome, { status: 'STALE', cachedResult: null });
  assert.equal(callbackCalls, 0);
  assert.equal(ledger.store.getRequest({
    grantId: ledger.activeGrant.grantId,
    requestId: 'request.owner.1',
  }), null);
  await owner.close();
});

test('post-callback contention preserves invocation-aware success and mismatch safety', async t => {
  for (const winner of ['SUCCEEDED_MATCH', 'SUCCEEDED_MISMATCH', 'OUTCOME_UNKNOWN']) {
    await t.test(winner, async t => {
      const ledger = initializedLedger(t, { ledgerId: `ledger.owner.winner.${winner}` });
      const competingStore = ServiceCreditSqliteStore.openExisting(ledger.config);
      t.after(() => safeClose(competingStore));
      let calls = 0;
      let winnerRevision = null;
      const execute = () => ({
        then(resolve) {
          calls += 1;
          const snapshot = competingStore.getDurableExecutionSnapshot();
          const execution = snapshot.executionState.executions[0];
          if (winner !== 'OUTCOME_UNKNOWN') {
            competingStore.completeDurableExecution({
              expectedRevision: snapshot.revision,
              executionId: execution.executionId,
              cachedResult: {
                statusCode: 200,
                contentType: 'application/json',
                resultCode: winner === 'SUCCEEDED_MATCH'
                  ? 'owner.completed'
                  : 'owner.competing',
              },
            });
          } else {
            competingStore.markDurableExecutionUnknown({
              expectedRevision: snapshot.revision,
              executionId: execution.executionId,
              reason: 'LOST_CONTROL',
            });
          }
          winnerRevision = competingStore.getMetadata().revision;
          resolve(callbackResult());
        },
      });
      const owner = createDurableServiceCreditExecutionOwner({ store: ledger.store, execute });
      const operation = owner.run({
        request: request(ledger.activeGrant.grantId),
        selectedDurationMs: 1_000,
      });
      if (winner === 'SUCCEEDED_MISMATCH') {
        await expectRejectedCode(operation, 'SERVICE_CREDIT_DURABLE_OWNER_QUARANTINED');
        assert.equal(ledger.store.getMetadata().revision, winnerRevision);
        await expectRejectedCode(owner.run({
          request: request(ledger.activeGrant.grantId),
          selectedDurationMs: 1_000,
        }), 'SERVICE_CREDIT_DURABLE_OWNER_QUARANTINED');
      } else {
        const outcome = await operation;
        assert.equal(
          outcome.status,
          winner === 'SUCCEEDED_MATCH' ? 'SUCCEEDED' : 'OUTCOME_UNKNOWN',
        );
      }
      assert.equal(calls, 1);
      await owner.close();
    });
  }
});

test('same-owner overlap is rejected before store effects while close waits for terminal persistence', async t => {
  const ledger = initializedLedger(t);
  const gate = deferred();
  let callbackCalls = 0;
  const owner = createDurableServiceCreditExecutionOwner({
    store: ledger.store,
    execute: async () => {
      callbackCalls += 1;
      await gate.promise;
      return callbackResult();
    },
  });
  const input = { request: request(ledger.activeGrant.grantId), selectedDurationMs: 1_000 };
  const first = owner.run(input);
  const revision = ledger.store.getMetadata().revision;
  await expectRejectedCode(owner.run({
    request: request(ledger.activeGrant.grantId, { requestId: 'request.owner.2' }),
    selectedDurationMs: 1_000,
  }), 'SERVICE_CREDIT_DURABLE_OWNER_BUSY');
  assert.equal(ledger.store.getMetadata().revision, revision);
  assert.equal(callbackCalls, 1);
  const close = owner.close();
  let closed = false;
  close.then(() => { closed = true; });
  await Promise.resolve();
  assert.equal(closed, false);
  await expectRejectedCode(owner.run(input), 'SERVICE_CREDIT_DURABLE_OWNER_CLOSED');
  gate.resolve();
  assert.equal((await first).status, 'SUCCEEDED');
  await close;
  assert.equal(closed, true);
});

test('callback-context run and close fail promptly across owners without changing lifecycle', async t => {
  const firstLedger = initializedLedger(t, { ledgerId: 'ledger.owner.context.1' });
  const secondLedger = initializedLedger(t, {
    directory: directoryFor(t),
    ledgerId: 'ledger.owner.context.2',
  });
  let firstOwner;
  const secondOwner = createDurableServiceCreditExecutionOwner({
    store: secondLedger.store,
    execute: () => callbackResult('owner.second'),
  });
  firstOwner = createDurableServiceCreditExecutionOwner({
    store: firstLedger.store,
    execute: async () => {
      await expectRejectedCode(
        firstOwner.run({
          request: request(firstLedger.activeGrant.grantId, {
            requestId: 'request.reentrant',
          }),
          selectedDurationMs: 1,
        }),
        'SERVICE_CREDIT_DURABLE_OWNER_CALLBACK_CONTEXT',
      );
      await expectRejectedCode(
        firstOwner.close(),
        'SERVICE_CREDIT_DURABLE_OWNER_CALLBACK_CONTEXT',
      );
      await expectRejectedCode(
        secondOwner.run({
          request: request(secondLedger.activeGrant.grantId),
          selectedDurationMs: 1,
        }),
        'SERVICE_CREDIT_DURABLE_OWNER_CALLBACK_CONTEXT',
      );
      await expectRejectedCode(
        secondOwner.close(),
        'SERVICE_CREDIT_DURABLE_OWNER_CALLBACK_CONTEXT',
      );
      return callbackResult();
    },
  });
  assert.equal((await firstOwner.run({
    request: request(firstLedger.activeGrant.grantId),
    selectedDurationMs: 1_000,
  })).status, 'SUCCEEDED');
  assert.equal((await secondOwner.run({
    request: request(secondLedger.activeGrant.grantId),
    selectedDurationMs: 1_000,
  })).status, 'SUCCEEDED');
  await firstOwner.close();
  await secondOwner.close();
});

test('two cooperating SQLite handles start at most one callback and never coalesce', async t => {
  const ledger = initializedLedger(t);
  const secondStore = ServiceCreditSqliteStore.openExisting(ledger.config);
  t.after(() => safeClose(secondStore));
  let callbackCalls = 0;
  const firstOwner = createDurableServiceCreditExecutionOwner({
    store: ledger.store,
    execute: () => { callbackCalls += 1; return callbackResult(); },
  });
  const secondOwner = createDurableServiceCreditExecutionOwner({
    store: secondStore,
    execute: () => { callbackCalls += 1; return callbackResult(); },
  });
  const input = { request: request(ledger.activeGrant.grantId), selectedDurationMs: 1_000 };
  const outcomes = await Promise.all([firstOwner.run(input), secondOwner.run(input)]);
  assert.equal(outcomes.filter(value => value.status === 'SUCCEEDED').length, 1);
  assert.equal(outcomes.filter(value => value.status === 'RECOVERY_REQUIRED').length, 1);
  assert.equal(callbackCalls, 1);
  await firstOwner.close();
  await secondOwner.close();
});

test('commit-boundary ambiguity never reports success or retries and latches the owner', async t => {
  for (const target of [
    'prepareDurableExecution',
    'persistDurableExecutionFence',
    'completeDurableExecution',
  ]) {
    await t.test(target, async t => {
      let armed = false;
      let callbackCalls = 0;
      let targetAttempts = 0;
      const ledger = initializedLedger(t, {
        ledgerId: `ledger.owner.ambiguity.${target}`,
        configuration: {
          testHooks: {
            afterCommit({ operation }) {
              if (armed && operation === target) {
                targetAttempts += 1;
                throw new Error('private');
              }
            },
          },
        },
      });
      const owner = createDurableServiceCreditExecutionOwner({
        store: ledger.store,
        execute: () => { callbackCalls += 1; return callbackResult(); },
      });
      armed = true;
      await expectRejectedCode(owner.run({
        request: request(ledger.activeGrant.grantId),
        selectedDurationMs: 1_000,
      }), 'SERVICE_CREDIT_DURABLE_OWNER_QUARANTINED');
      armed = false;
      assert.equal(targetAttempts, 1);
      assert.equal(callbackCalls, target === 'completeDurableExecution' ? 1 : 0);
      await expectRejectedCode(owner.run({
        request: request(ledger.activeGrant.grantId),
        selectedDurationMs: 1_000,
      }), 'SERVICE_CREDIT_DURABLE_OWNER_QUARANTINED');
      await owner.close();
      const reopened = ServiceCreditSqliteStore.openExisting(ledger.config);
      t.after(() => safeClose(reopened));
      const execution = reopened.getDurableExecutionSnapshot().executionState.executions[0];
      assert.equal(
        execution.fencePhase,
        target === 'prepareDurableExecution' ? 'PREPARED' : 'MAY_HAVE_STARTED',
      );
      assert.equal(
        execution.terminalClassification,
        target === 'completeDurableExecution' ? 'SUCCEEDED' : 'NONE',
      );
    });
  }
});

test('unknown-transition commit boundaries make one attempt and remain conservative', async t => {
  for (const boundary of ['beforeCommit', 'afterCommit']) {
    await t.test(boundary, async t => {
      let armed = false;
      let callbackCalls = 0;
      let unknownAttempts = 0;
      const hook = ({ operation }) => {
        if (armed && operation === 'markDurableExecutionUnknown') {
          unknownAttempts += 1;
          throw new Error('private');
        }
      };
      const ledger = initializedLedger(t, {
        ledgerId: `ledger.owner.unknown.${boundary}`,
        configuration: {
          testHooks: { [boundary]: hook },
        },
      });
      const owner = createDurableServiceCreditExecutionOwner({
        store: ledger.store,
        execute: () => {
          callbackCalls += 1;
          throw new Error('private');
        },
      });
      armed = true;
      await expectRejectedCode(owner.run({
        request: request(ledger.activeGrant.grantId),
        selectedDurationMs: 1_000,
      }), 'SERVICE_CREDIT_DURABLE_OWNER_QUARANTINED');
      armed = false;
      assert.equal(callbackCalls, 1);
      assert.equal(unknownAttempts, 1);
      await expectRejectedCode(owner.run({
        request: request(ledger.activeGrant.grantId),
        selectedDurationMs: 1_000,
      }), 'SERVICE_CREDIT_DURABLE_OWNER_QUARANTINED');
      await owner.close();

      const reopened = ServiceCreditSqliteStore.openExisting(ledger.config);
      t.after(() => safeClose(reopened));
      const execution = reopened.getDurableExecutionSnapshot().executionState.executions[0];
      assert.equal(execution.fencePhase, 'MAY_HAVE_STARTED');
      assert.equal(
        execution.terminalClassification,
        boundary === 'afterCommit' ? 'OUTCOME_UNKNOWN' : 'NONE',
      );
      assert.equal(reopened.getRequest({
        grantId: ledger.activeGrant.grantId,
        requestId: 'request.owner.1',
      }).state, boundary === 'afterCommit'
        ? REQUEST_STATE.OUTCOME_UNKNOWN
        : REQUEST_STATE.EXECUTING);
    });
  }
});

test('before-commit failure invokes no callback and owner remains fail-closed', async t => {
  let armed = false;
  let attempts = 0;
  let callbackCalls = 0;
  const ledger = initializedLedger(t, {
    configuration: {
      testHooks: {
        beforeCommit({ operation }) {
          if (armed && operation === 'prepareDurableExecution') {
            attempts += 1;
            throw new Error('private');
          }
        },
      },
    },
  });
  const before = ledger.store.load();
  const owner = createDurableServiceCreditExecutionOwner({
    store: ledger.store,
    execute: () => { callbackCalls += 1; return callbackResult(); },
  });
  armed = true;
  await expectRejectedCode(owner.run({
    request: request(ledger.activeGrant.grantId),
    selectedDurationMs: 1_000,
  }), 'SERVICE_CREDIT_DURABLE_OWNER_QUARANTINED');
  armed = false;
  assert.equal(attempts, 1);
  assert.equal(callbackCalls, 0);
  assert.deepEqual(ledger.store.load(), before);
  await owner.close();
});

test('failure after callback settlement but before completion commit reports no success', async t => {
  let armed = false;
  let completionAttempts = 0;
  let callbackCalls = 0;
  const ledger = initializedLedger(t, {
    configuration: {
      testHooks: {
        beforeCommit({ operation }) {
          if (armed && operation === 'completeDurableExecution') {
            completionAttempts += 1;
            throw new Error('private');
          }
        },
      },
    },
  });
  const owner = createDurableServiceCreditExecutionOwner({
    store: ledger.store,
    execute: () => { callbackCalls += 1; return callbackResult(); },
  });
  armed = true;
  await expectRejectedCode(owner.run({
    request: request(ledger.activeGrant.grantId),
    selectedDurationMs: 1_000,
  }), 'SERVICE_CREDIT_DURABLE_OWNER_QUARANTINED');
  armed = false;
  assert.equal(callbackCalls, 1);
  assert.equal(completionAttempts, 1);
  assert.equal(ledger.store.getRequest({
    grantId: ledger.activeGrant.grantId,
    requestId: 'request.owner.1',
  }).state, REQUEST_STATE.EXECUTING);
  await owner.close();
});

test('a never-settling callback intentionally keeps run and close pending without owner handles', async t => {
  const ledger = initializedLedger(t);
  const never = new Promise(() => {});
  const owner = createDurableServiceCreditExecutionOwner({
    store: ledger.store,
    execute: () => never,
  });
  const run = owner.run({
    request: request(ledger.activeGrant.grantId),
    selectedDurationMs: 1_000,
  });
  const close = owner.close();
  let runSettled = false;
  let closeSettled = false;
  run.then(() => { runSettled = true; }, () => { runSettled = true; });
  close.then(() => { closeSettled = true; }, () => { closeSettled = true; });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(runSettled, false);
  assert.equal(closeSettled, false);
  assert.equal(ledger.store.getRequest({
    grantId: ledger.activeGrant.grantId,
    requestId: 'request.owner.1',
  }).state, REQUEST_STATE.EXECUTING);
});

test('captured exercised intrinsics and inherited setters survive bounded poisoning', async t => {
  const secondLedger = initializedLedger(t, {
    directory: directoryFor(t),
    ledgerId: 'ledger.owner.poison.second',
  });
  let poisonCalls = 0;
  let inheritedSetterCalls = 0;
  const poison = () => {
    poisonCalls += 1;
    throw new Error('poison');
  };
  const poisonedMethods = [
    [Reflect, 'apply'],
    [Reflect, 'getOwnPropertyDescriptor'],
    [Reflect, 'getPrototypeOf'],
    [Reflect, 'ownKeys'],
    [RegExp.prototype, 'exec'],
    [String.prototype, 'includes'],
    [WeakSet.prototype, 'has'],
    [WeakSet.prototype, 'add'],
  ];
  const originalMethodDescriptors = poisonedMethods.map(([target, name]) => (
    [target, name, TEST_GET_OWN_PROPERTY_DESCRIPTOR(target, name)]
  ));
  const inheritedKeys = ['request', 'selectedDurationMs', 'status', 'cachedResult'];
  const originalInheritedDescriptors = inheritedKeys.map(name => (
    [name, TEST_GET_OWN_PROPERTY_DESCRIPTOR(Object.prototype, name)]
  ));
  let secondOwner;
  let invalidOperation;
  try {
    for (const [target, name] of poisonedMethods) {
      TEST_DEFINE_PROPERTY(target, name, {
        value: poison,
        configurable: true,
        writable: true,
      });
    }
    for (const name of inheritedKeys) {
      TEST_DEFINE_PROPERTY(Object.prototype, name, {
        set() { inheritedSetterCalls += 1; },
        configurable: true,
      });
    }
    secondOwner = createDurableServiceCreditExecutionOwner({
      store: secondLedger.store,
      execute: () => callbackResult('owner.second'),
    });
    invalidOperation = secondOwner.run({
      request: request(secondLedger.activeGrant.grantId, { maxCostUnits: 0 }),
      selectedDurationMs: 1_000,
    });
  } finally {
    for (const [target, name, descriptor] of originalMethodDescriptors) {
      TEST_DEFINE_PROPERTY(target, name, descriptor);
    }
    for (const [name, descriptor] of originalInheritedDescriptors) {
      if (descriptor === undefined) TEST_DELETE_PROPERTY(Object.prototype, name);
      else TEST_DEFINE_PROPERTY(Object.prototype, name, descriptor);
    }
  }
  await expectRejectedCode(
    invalidOperation,
    'SERVICE_CREDIT_DURABLE_OWNER_INVALID_INPUT',
  );
  assert.equal(poisonCalls, 0);
  assert.equal(inheritedSetterCalls, 0);

  const asyncCases = [
    ['Promise', globalThis, 'Promise'],
    ['AsyncLocalStorage.run', AsyncLocalStorage.prototype, 'run'],
    ['AsyncLocalStorage.getStore', AsyncLocalStorage.prototype, 'getStore'],
    [
      'captured store snapshot method',
      ServiceCreditSqliteStore.prototype,
      'getDurableExecutionSnapshot',
    ],
  ];
  for (let index = 0; index < asyncCases.length; index += 1) {
    const [label, target, name] = asyncCases[index];
    await t.test(label, async t => {
      const ledger = initializedLedger(t, {
        directory: directoryFor(t),
        ledgerId: `ledger.owner.poison.async.${index}`,
      });
      let callbackCalls = 0;
      const owner = createDurableServiceCreditExecutionOwner({
        store: ledger.store,
        execute: () => { callbackCalls += 1; return callbackResult(); },
      });
      const descriptor = TEST_GET_OWN_PROPERTY_DESCRIPTOR(target, name);
      let successfulOperation;
      try {
        TEST_DEFINE_PROPERTY(target, name, {
          value: name === 'Promise'
            ? class PoisonPromise {
              constructor() { poisonCalls += 1; throw new Error('poison'); }
              static resolve() { poisonCalls += 1; throw new Error('poison'); }
            }
            : poison,
          configurable: true,
          writable: true,
        });
        successfulOperation = owner.run({
          request: request(ledger.activeGrant.grantId),
          selectedDurationMs: 1_000,
        });
      } finally {
        TEST_DEFINE_PROPERTY(target, name, descriptor);
      }
      assert.equal((await successfulOperation).status, 'SUCCEEDED');
      assert.equal(callbackCalls, 1);
      await owner.close();
    });
  }
  assert.equal(poisonCalls, 0);
  await secondOwner.close();
});

const CALLBACK_CRASH_SOURCE = String.raw`
  import { ServiceCreditSqliteStore } from './src/service-credit-sqlite-store.js';
  import { createDurableServiceCreditExecutionOwner } from './src/service-credit-durable-execution-owner.js';
  process.on('message', message => {
    const store = ServiceCreditSqliteStore.openExisting({
      databasePath: message.databasePath,
      allowedRoot: message.allowedRoot,
      busyTimeoutMs: 10000,
      now: () => message.now,
      deriveCost: () => message.cost,
    });
    const owner = createDurableServiceCreditExecutionOwner({
      store,
      execute: () => {
        process.send({ type: 'callback-started' });
        return new Promise(() => {});
      },
    });
    void owner.run(message.input);
  });
`;

function crashDuringCallback(config, input) {
  return new Promise((resolveCrash, rejectCrash) => {
    const child = spawn(process.execPath, [
      '--input-type=module',
      '--eval',
      CALLBACK_CRASH_SOURCE,
    ], {
      cwd: process.cwd(),
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    let started = false;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectCrash(new Error('callback crash timeout'));
    }, 15_000);
    child.on('error', error => {
      clearTimeout(timer);
      rejectCrash(error);
    });
    child.on('message', message => {
      if (message?.type !== 'callback-started') return;
      started = true;
      child.kill('SIGKILL');
    });
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      if (started && code === null && signal === 'SIGKILL') resolveCrash();
      else rejectCrash(new Error('callback child did not reach crash boundary'));
    });
    child.send({
      databasePath: config.databasePath,
      allowedRoot: config.allowedRoot,
      now: NOW,
      cost: 2,
      input,
    });
  });
}

test('process death during callback leaves explicit restart recovery outside the owner', async t => {
  const ledger = initializedLedger(t);
  ledger.store.close();
  await crashDuringCallback(ledger.config, {
    request: request(ledger.activeGrant.grantId),
    selectedDurationMs: 1_000,
  });
  const reopened = ServiceCreditSqliteStore.openExisting(ledger.config);
  t.after(() => safeClose(reopened));
  const before = reopened.getDurableExecutionSnapshot();
  assert.equal(before.executionState.executions[0].fencePhase, 'MAY_HAVE_STARTED');
  assert.equal(before.executionState.executions[0].terminalClassification, 'NONE');
  const recovered = reopened.recoverDurableExecutionsAfterRestart({
    expectedRevision: before.revision,
  });
  assert.equal(recovered.disposition, 'APPLIED');
  assert.equal(recovered.outcomeUnknownCount, 1);
  assert.equal(reopened.getRequest({
    grantId: ledger.activeGrant.grantId,
    requestId: 'request.owner.1',
  }).state, REQUEST_STATE.OUTCOME_UNKNOWN);
});

const PROCESS_RACE_SOURCE = String.raw`
  import { ServiceCreditSqliteStore } from './src/service-credit-sqlite-store.js';
  import { createDurableServiceCreditExecutionOwner } from './src/service-credit-durable-execution-owner.js';
  let owner;
  let input;
  process.on('message', message => {
    if (message.type === 'initialize') {
      const store = ServiceCreditSqliteStore.openExisting({
        databasePath: message.databasePath,
        allowedRoot: message.allowedRoot,
        busyTimeoutMs: 10000,
        now: () => message.now,
        deriveCost: () => message.cost,
      });
      owner = createDurableServiceCreditExecutionOwner({
        store,
        execute: () => ({ resultCode: 'owner.process' }),
      });
      input = message.input;
      process.send({ type: 'ready' });
      return;
    }
    if (message.type !== 'go') return;
    owner.run(input).then(
      value => process.send({ type: 'done', status: value.status }, () => process.disconnect()),
      () => process.send({ type: 'done', status: 'REJECTED' }, () => process.disconnect()),
    );
  });
`;

function processRace(config, input) {
  return new Promise((resolveRace, rejectRace) => {
    const children = [0, 1].map(() => spawn(process.execPath, [
      '--input-type=module',
      '--eval',
      PROCESS_RACE_SOURCE,
    ], {
      cwd: process.cwd(),
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    }));
    const statuses = new Array(children.length);
    let ready = 0;
    let done = 0;
    let settled = false;
    const timer = setTimeout(() => finish(new Error('race timeout')), 15_000);
    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      for (const child of children) {
        if (child.connected) child.disconnect();
        if (error && child.exitCode === null) child.kill('SIGKILL');
      }
      if (error) rejectRace(error);
      else resolveRace(statuses);
    }
    children.forEach((child, index) => {
      child.on('error', finish);
      child.on('message', message => {
        if (message?.type === 'ready') {
          ready += 1;
          if (ready === children.length) {
            for (const candidate of children) candidate.send({ type: 'go' });
          }
        } else if (message?.type === 'done') {
          statuses[index] = message.status;
          done += 1;
          if (done === children.length) finish();
        }
      });
      child.send({
        type: 'initialize',
        databasePath: config.databasePath,
        allowedRoot: config.allowedRoot,
        now: NOW,
        cost: 2,
        input,
      });
    });
  });
}

test('real-process SQLite contention admits at most one fresh callback fence winner', async t => {
  const ledger = initializedLedger(t);
  ledger.store.close();
  const statuses = await processRace(ledger.config, {
    request: request(ledger.activeGrant.grantId),
    selectedDurationMs: 1_000,
  });
  assert.equal(statuses.filter(status => status === 'SUCCEEDED').length, 1);
  assert.equal(
    statuses.filter(status => (
      status === 'RECOVERY_REQUIRED'
      || status === 'CACHED_SUCCESS'
      || status === 'STALE'
    )).length,
    1,
  );
  const reopened = ServiceCreditSqliteStore.openExisting(ledger.config);
  t.after(() => safeClose(reopened));
  assert.equal(reopened.getRequest({
    grantId: ledger.activeGrant.grantId,
    requestId: 'request.owner.1',
  }).state, REQUEST_STATE.SUCCEEDED);
});
