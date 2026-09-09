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

const {
  createDurableServiceCreditExecutionOwner: createReviewedDurableExecutionOwner,
} = durableOwnerModule;
const NOW = 2_000_000_000_000;
const EXPECTED_ABORT_REASON = 'SERVICE_CREDIT_DURABLE_EXECUTION_OUTCOME_UNKNOWN';
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

function passiveDeadlineRuntime() {
  return {
    monotonicNowNs: () => 0n,
    schedule: () => Object.freeze({}),
    cancel: () => undefined,
  };
}

function createDurableServiceCreditExecutionOwner({
  store,
  execute,
  deadlineRuntime = passiveDeadlineRuntime(),
}) {
  return createReviewedDurableExecutionOwner({ store, execute, deadlineRuntime });
}

function controlledDeadlineRuntime(initialNowNs = 0n) {
  let nowNs = initialNowNs;
  let nextIdentifier = 1;
  const scheduled = new Set();
  const runtime = {
    monotonicNowNs: () => nowNs,
    schedule(callback, delayMs) {
      const handle = { callback, delayMs, identifier: nextIdentifier };
      nextIdentifier += 1;
      scheduled.add(handle);
      return handle;
    },
    cancel(handle) {
      scheduled.delete(handle);
    },
  };
  return {
    runtime,
    setNowNs(value) { nowNs = value; },
    fireNext() {
      const [handle] = scheduled;
      assert.notEqual(handle, undefined);
      scheduled.delete(handle);
      handle.callback();
    },
    nextDelayMs() {
      const [handle] = scheduled;
      return handle?.delayMs ?? null;
    },
    scheduledCount() { return scheduled.size; },
  };
}

async function expectRejectedCode(promise, code) {
  await assert.rejects(promise, error => {
    assert.equal(error?.code, code);
    assert.equal(error?.message, code);
    assert.equal(Object.hasOwn(error, 'cause'), false);
    assert.equal(Object.isFrozen(error), true);
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
  assert.equal(createReviewedDurableExecutionOwner.length, 1);
  const source = readFileSync(
    new URL('../src/service-credit-durable-execution-owner.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /\b(?:setTimeout|setInterval|Date)\b/);
  assert.doesNotMatch(
    source,
    /from ['"]node:(?:http|https|net|tls|timers|worker_threads|child_process|fs)['"]/,
  );
  assert.doesNotMatch(source, /\bprocess\.(?:on|once|addListener|env)\b/);
});

test('documentation classifies the opt-in deadline runtime as implemented and narrows future gates', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const security = readFileSync(new URL('../SECURITY.md', import.meta.url), 'utf8');
  const plan = readFileSync(
    new URL('../docs/IMPLEMENTATION_PLAN.md', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(readme, /does not implement the runtime callback-deadline contract/);
  assert.doesNotMatch(
    readme,
    /Runtime monotonic enforcement and late-settlement draining[\s\S]*future work/,
  );
  assert.doesNotMatch(security, /unchanged by this documentation gate/);
  assert.doesNotMatch(plan, /\*\*Required future red tests\.\*\*/);
  assert.doesNotMatch(plan, /The deadline milestone remains deferred/);
  for (const document of [readme, security, plan]) {
    assert.match(document, /trusted same-process/);
    assert.match(document, /abort listener/);
    assert.match(document, /not process-isolated/);
  }
});

test('factory is inert, captures exact dependencies, and exposes a frozen two-method surface', async t => {
  const directory = directoryFor(t);
  let clockCalls = 0;
  let pricingCalls = 0;
  let callbackCalls = 0;
  let runtimeCalls = 0;
  const store = ServiceCreditSqliteStore.create(configuration(directory, {
    now: () => { clockCalls += 1; return NOW; },
    deriveCost: () => { pricingCalls += 1; return 2; },
  }));
  t.after(() => safeClose(store));
  const before = store.load();
  const beforeClock = clockCalls;
  const beforePricing = pricingCalls;
  const execute = () => { callbackCalls += 1; return callbackResult(); };
  const runtime = {
    monotonicNowNs: () => { runtimeCalls += 1; return 0n; },
    schedule: () => { runtimeCalls += 1; return Object.freeze({}); },
    cancel: () => { runtimeCalls += 1; },
  };
  const options = { store, execute, deadlineRuntime: runtime };
  const owner = createReviewedDurableExecutionOwner(options);

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
  assert.equal(runtimeCalls, 0);

  options.store = null;
  options.execute = () => { throw new Error('replacement'); };
  options.deadlineRuntime = null;
  assert.deepEqual(await owner.run({
    request: request('grant_unavailable'),
    selectedDurationMs: 1,
  }), { status: 'RECOVERY_REQUIRED', cachedResult: null });
  assert.equal(runtimeCalls, 0);
  await owner.close();
  assert.deepEqual(store.load(), before);
});

test('factory rejects wrong arity, hostile shapes, callback proxies, and reused store handles', async t => {
  const ledger = initializedLedger(t);
  const execute = () => callbackResult();
  assert.throws(
    () => createReviewedDurableExecutionOwner(),
    error => error?.code === 'SERVICE_CREDIT_DURABLE_OWNER_INVALID_CONFIGURATION',
  );
  assert.throws(
    () => createReviewedDurableExecutionOwner({
      store: ledger.store,
      execute,
      extra: true,
    }),
    error => error?.code === 'SERVICE_CREDIT_DURABLE_OWNER_INVALID_CONFIGURATION',
  );
  let trapCalls = 0;
  const hostile = new Proxy({
    store: ledger.store,
    execute,
    deadlineRuntime: passiveDeadlineRuntime(),
  }, {
    ownKeys() { trapCalls += 1; throw new Error('hostile'); },
  });
  assert.throws(
    () => createReviewedDurableExecutionOwner(hostile),
    error => error?.code === 'SERVICE_CREDIT_DURABLE_OWNER_INVALID_CONFIGURATION',
  );
  assert.equal(trapCalls, 0);
  assert.throws(
    () => createReviewedDurableExecutionOwner({
      store: ledger.store,
      execute: new Proxy(execute, {}),
      deadlineRuntime: passiveDeadlineRuntime(),
    }),
    error => error?.code === 'SERVICE_CREDIT_DURABLE_OWNER_INVALID_CONFIGURATION',
  );
  assert.throws(
    () => createReviewedDurableExecutionOwner({ store: ledger.store, execute }),
    error => error?.code === 'SERVICE_CREDIT_DURABLE_OWNER_INVALID_CONFIGURATION',
  );
  assert.throws(
    () => createReviewedDurableExecutionOwner({
      store: ledger.store,
      execute,
      deadlineRuntime: { ...passiveDeadlineRuntime(), extra: true },
    }),
    error => error?.code === 'SERVICE_CREDIT_DURABLE_OWNER_INVALID_CONFIGURATION',
  );
  assert.throws(
    () => createReviewedDurableExecutionOwner({
      store: ledger.store,
      execute,
      deadlineRuntime: {
        ...passiveDeadlineRuntime(),
        schedule: new Proxy(() => Object.freeze({}), {}),
      },
    }),
    error => error?.code === 'SERVICE_CREDIT_DURABLE_OWNER_INVALID_CONFIGURATION',
  );
  const capturedRuntime = passiveDeadlineRuntime();
  const owner = createReviewedDurableExecutionOwner({
    store: ledger.store,
    execute,
    deadlineRuntime: capturedRuntime,
  });
  capturedRuntime.monotonicNowNs = () => { throw new Error('replacement'); };
  capturedRuntime.schedule = () => { throw new Error('replacement'); };
  capturedRuntime.cancel = () => { throw new Error('replacement'); };
  assert.throws(
    () => createReviewedDurableExecutionOwner({
      store: ledger.store,
      execute,
      deadlineRuntime: passiveDeadlineRuntime(),
    }),
    error => error?.code === 'SERVICE_CREDIT_DURABLE_OWNER_INVALID_CONFIGURATION',
  );
  assert.equal((await owner.run({
    request: request(ledger.activeGrant.grantId),
    selectedDurationMs: 1_000,
  })).status, 'SUCCEEDED');
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
  assert.deepEqual(Reflect.ownKeys(identities[0]), ['executionId', 'signal']);
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

test('asynchronous callback success is observed and persisted before deadline without retry', async t => {
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

test('transactional completion adjudication rejects callback success after the deadline', async t => {
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
  let aborts = 0;
  let signal;
  const owner = createDurableServiceCreditExecutionOwner({
    store: ledger.store,
    execute: identity => {
      callbackCalls += 1;
      signal = identity.signal;
      signal.addEventListener('abort', () => { aborts += 1; }, { once: true });
      now = NOW + 10_000;
      return callbackResult();
    },
  });
  const outcome = await owner.run({
    request: request(ledger.activeGrant.grantId),
    selectedDurationMs: 1_000,
  });
  assert.equal(outcome.status, 'OUTCOME_UNKNOWN');
  assert.equal(callbackCalls, 1);
  assert.equal(signal.aborted, true);
  assert.equal(aborts, 1);
  assert.equal(now > NOW + 1_000, true);
  await owner.close();
});

test('runtime deadline persists unknown, aborts once, returns early, and drains before close', async t => {
  let now = NOW;
  const runtime = controlledDeadlineRuntime(1_000_000n);
  const ledger = initializedLedger(t, { configuration: { now: () => now } });
  const callback = deferred();
  let callbackCalls = 0;
  let observedIdentity;
  let observedSignal;
  const owner = createDurableServiceCreditExecutionOwner({
    store: ledger.store,
    deadlineRuntime: runtime.runtime,
    execute: identity => {
      callbackCalls += 1;
      observedIdentity = identity;
      observedSignal = identity.signal;
      return callback.promise;
    },
  });
  const operation = owner.run({
    request: request(ledger.activeGrant.grantId),
    selectedDurationMs: 1_000,
  });
  await Promise.resolve();
  assert.equal(callbackCalls, 1);
  assert.deepEqual(Reflect.ownKeys(observedIdentity), ['executionId', 'signal']);
  assert.equal(Object.isFrozen(observedIdentity), true);
  assert.equal(observedSignal.aborted, false);
  assert.equal(runtime.scheduledCount(), 1);

  const closing = owner.close();
  let closed = false;
  closing.then(() => { closed = true; });
  await Promise.resolve();
  assert.equal(closed, false);

  now = NOW + 1_000;
  runtime.setNowNs(1_001_000_000n);
  runtime.fireNext();
  assert.deepEqual(await operation, { status: 'OUTCOME_UNKNOWN', cachedResult: null });
  assert.equal(observedSignal.aborted, true);
  await Promise.resolve();
  assert.equal(closed, false);
  callback.resolve(callbackResult('owner.late'));
  await closing;
  assert.equal(closed, true);
  assert.equal(callbackCalls, 1);
});

test('deadline unknown drains a late rejection without another durable transition', async t => {
  let now = NOW;
  let unknownAttempts = 0;
  let completionAttempts = 0;
  const runtime = controlledDeadlineRuntime();
  const ledger = initializedLedger(t, {
    ledgerId: 'ledger.owner.timer.late-rejection',
    configuration: {
      now: () => now,
      testHooks: {
        beforeBegin({ operation }) {
          if (operation === 'markDurableExecutionUnknown') unknownAttempts += 1;
          if (operation === 'completeDurableExecution') completionAttempts += 1;
        },
      },
    },
  });
  const callback = deferred();
  let callbackCalls = 0;
  let observedSignal;
  let abortReason;
  const owner = createDurableServiceCreditExecutionOwner({
    store: ledger.store,
    deadlineRuntime: runtime.runtime,
    execute: identity => {
      callbackCalls += 1;
      observedSignal = identity.signal;
      identity.signal.addEventListener('abort', () => {
        abortReason = identity.signal.reason;
      }, { once: true });
      return callback.promise;
    },
  });
  const operation = owner.run({
    request: request(ledger.activeGrant.grantId),
    selectedDurationMs: 1_000,
  });
  await Promise.resolve();
  now = NOW + 1_000;
  runtime.setNowNs(1_000_000_000n);
  runtime.fireNext();
  assert.deepEqual(await operation, { status: 'OUTCOME_UNKNOWN', cachedResult: null });
  assert.equal(observedSignal.aborted, true);
  assert.equal(abortReason, EXPECTED_ABORT_REASON);
  assert.equal(typeof abortReason, 'string');
  assert.equal(Object.hasOwn(Object(abortReason), 'stack'), false);
  assert.equal(Object.hasOwn(Object(abortReason), 'cause'), false);
  assert.equal(abortReason.includes(ledger.activeGrant.grantId), false);
  assert.equal(abortReason.includes('request.owner.1'), false);
  assert.equal(callbackCalls, 1);
  assert.equal(unknownAttempts, 1);
  assert.equal(completionAttempts, 0);
  const durableRevision = ledger.store.getMetadata().revision;

  const closing = owner.close();
  let closed = false;
  closing.then(() => { closed = true; });
  await Promise.resolve();
  assert.equal(closed, false);
  callback.reject(new Error('private late rejection'));
  await closing;
  assert.equal(closed, true);
  assert.equal(unknownAttempts, 1);
  assert.equal(completionAttempts, 0);
  assert.equal(ledger.store.getMetadata().revision, durableRevision);
  assert.equal(ledger.store.getRequest({
    grantId: ledger.activeGrant.grantId,
    requestId: 'request.owner.1',
  }).state, REQUEST_STATE.OUTCOME_UNKNOWN);
});

test('a durable success that precedes timer uncertainty suppresses abort and waits for local drain', async t => {
  let unknownAttempts = 0;
  let completionAttempts = 0;
  const runtime = controlledDeadlineRuntime();
  const ledger = initializedLedger(t, {
    ledgerId: 'ledger.owner.timer.success-winner',
    configuration: {
      testHooks: {
        beforeBegin({ operation }) {
          if (operation === 'markDurableExecutionUnknown') unknownAttempts += 1;
          if (operation === 'completeDurableExecution') completionAttempts += 1;
        },
      },
    },
  });
  const competingStore = ServiceCreditSqliteStore.openExisting(ledger.config);
  t.after(() => safeClose(competingStore));
  const callback = deferred();
  let callbackCalls = 0;
  let aborts = 0;
  let observedSignal;
  const owner = createDurableServiceCreditExecutionOwner({
    store: ledger.store,
    deadlineRuntime: runtime.runtime,
    execute: identity => {
      callbackCalls += 1;
      observedSignal = identity.signal;
      identity.signal.addEventListener('abort', () => { aborts += 1; }, { once: true });
      return callback.promise;
    },
  });
  const operation = owner.run({
    request: request(ledger.activeGrant.grantId),
    selectedDurationMs: 1_000,
  });
  await Promise.resolve();
  const snapshot = competingStore.getDurableExecutionSnapshot();
  const execution = snapshot.executionState.executions[0];
  const competingResult = competingStore.completeDurableExecution({
    expectedRevision: snapshot.revision,
    executionId: execution.executionId,
    cachedResult: {
      statusCode: 200,
      contentType: 'application/json',
      resultCode: 'owner.completed',
    },
  });
  assert.equal(competingResult.winner, 'SUCCEEDED');
  const durableRevision = competingStore.getMetadata().revision;
  const completionAttemptsAfterWinner = completionAttempts;

  runtime.setNowNs(1_000_000_000n);
  runtime.fireNext();
  await expectRejectedCode(operation, 'SERVICE_CREDIT_DURABLE_OWNER_QUARANTINED');
  assert.equal(callbackCalls, 1);
  assert.equal(observedSignal.aborted, false);
  assert.equal(aborts, 0);
  assert.equal(unknownAttempts, 1);
  assert.equal(completionAttempts, completionAttemptsAfterWinner);
  assert.equal(ledger.store.getMetadata().revision, durableRevision);
  assert.equal(ledger.store.getRequest({
    grantId: ledger.activeGrant.grantId,
    requestId: 'request.owner.1',
  }).state, REQUEST_STATE.SUCCEEDED);

  const closing = owner.close();
  let closed = false;
  closing.then(() => { closed = true; });
  await Promise.resolve();
  assert.equal(closed, false);
  callback.resolve(callbackResult());
  await closing;
  assert.equal(closed, true);
  assert.equal(aborts, 0);
  assert.equal(unknownAttempts, 1);
  assert.equal(completionAttempts, completionAttemptsAfterWinner);
  assert.equal(ledger.store.getMetadata().revision, durableRevision);
});

test('deadline runtime handles early wakes, delayed control, chunking, and clock regression', async t => {
  await t.test('early wake reschedules and pre-target completion succeeds', async t => {
    const runtime = controlledDeadlineRuntime();
    const ledger = initializedLedger(t, { ledgerId: 'ledger.owner.timer.early' });
    const callback = deferred();
    const owner = createDurableServiceCreditExecutionOwner({
      store: ledger.store,
      deadlineRuntime: runtime.runtime,
      execute: () => callback.promise,
    });
    const operation = owner.run({
      request: request(ledger.activeGrant.grantId),
      selectedDurationMs: 1_000,
    });
    await Promise.resolve();
    assert.equal(runtime.nextDelayMs(), 1_000);
    runtime.setNowNs(500_000_000n);
    runtime.fireNext();
    assert.equal(runtime.nextDelayMs(), 500);
    runtime.setNowNs(999_000_000n);
    callback.resolve(callbackResult('owner.early'));
    assert.equal((await operation).status, 'SUCCEEDED');
    assert.equal(runtime.scheduledCount(), 0);
    await owner.close();
  });

  await t.test('delayed event-loop control at exact target invokes no callback', async t => {
    const ledger = initializedLedger(t, { ledgerId: 'ledger.owner.timer.delayed' });
    let reads = 0;
    let schedules = 0;
    let callbackCalls = 0;
    const owner = createDurableServiceCreditExecutionOwner({
      store: ledger.store,
      deadlineRuntime: {
        monotonicNowNs() {
          reads += 1;
          return reads === 1 ? 0n : 1_000_000_000n;
        },
        schedule() { schedules += 1; return Object.freeze({}); },
        cancel() {},
      },
      execute: () => { callbackCalls += 1; return callbackResult(); },
    });
    assert.deepEqual(await owner.run({
      request: request(ledger.activeGrant.grantId),
      selectedDurationMs: 1_000,
    }), { status: 'OUTCOME_UNKNOWN', cachedResult: null });
    assert.equal(reads, 2);
    assert.equal(schedules, 0);
    assert.equal(callbackCalls, 0);
    await owner.close();
  });

  await t.test('duplicate synchronous wakes are collapsed before callback start', async t => {
    const ledger = initializedLedger(t, { ledgerId: 'ledger.owner.timer.synchronous' });
    let nowNs = 0n;
    let schedules = 0;
    let cancels = 0;
    let callbackCalls = 0;
    const owner = createDurableServiceCreditExecutionOwner({
      store: ledger.store,
      deadlineRuntime: {
        monotonicNowNs: () => nowNs,
        schedule(wake) {
          schedules += 1;
          nowNs = 1_000_000_000n;
          wake();
          wake();
          return Object.freeze({});
        },
        cancel() { cancels += 1; },
      },
      execute: () => { callbackCalls += 1; return callbackResult(); },
    });
    assert.equal((await owner.run({
      request: request(ledger.activeGrant.grantId),
      selectedDurationMs: 1_000,
    })).status, 'OUTCOME_UNKNOWN');
    assert.equal(schedules, 1);
    assert.equal(cancels, 1);
    assert.equal(callbackCalls, 0);
    await owner.close();
  });

  await t.test('large safe duration is scheduled in bounded chunks', async t => {
    const selectedDurationMs = 3_000_000_000;
    const runtime = controlledDeadlineRuntime();
    const ledger = initializedLedger(t, {
      ledgerId: 'ledger.owner.timer.chunked',
      policy: { maxDurationMs: selectedDurationMs },
    });
    const callback = deferred();
    const owner = createDurableServiceCreditExecutionOwner({
      store: ledger.store,
      deadlineRuntime: runtime.runtime,
      execute: () => callback.promise,
    });
    const operation = owner.run({
      request: request(ledger.activeGrant.grantId),
      selectedDurationMs,
    });
    await Promise.resolve();
    assert.equal(runtime.nextDelayMs(), 2_147_483_646);
    callback.resolve(callbackResult('owner.chunked'));
    assert.equal((await operation).status, 'SUCCEEDED');
    assert.equal(runtime.scheduledCount(), 0);
    await owner.close();
  });

  await t.test('synchronous callback crossing the monotonic target cannot complete', async t => {
    const runtime = controlledDeadlineRuntime();
    const ledger = initializedLedger(t, { ledgerId: 'ledger.owner.timer.crossed' });
    let signal;
    const owner = createDurableServiceCreditExecutionOwner({
      store: ledger.store,
      deadlineRuntime: runtime.runtime,
      execute: identity => {
        signal = identity.signal;
        runtime.setNowNs(1_000_000_000n);
        return callbackResult('owner.crossed');
      },
    });
    assert.equal((await owner.run({
      request: request(ledger.activeGrant.grantId),
      selectedDurationMs: 1_000,
    })).status, 'OUTCOME_UNKNOWN');
    assert.equal(signal.aborted, true);
    assert.equal(runtime.scheduledCount(), 0);
    await owner.close();
  });

  await t.test('monotonic regression persists uncertainty and latches', async t => {
    const ledger = initializedLedger(t, { ledgerId: 'ledger.owner.timer.regression' });
    let reads = 0;
    let callbackCalls = 0;
    const owner = createDurableServiceCreditExecutionOwner({
      store: ledger.store,
      deadlineRuntime: {
        monotonicNowNs() { reads += 1; return reads === 1 ? 10n : 9n; },
        schedule() { return Object.freeze({}); },
        cancel() {},
      },
      execute: () => { callbackCalls += 1; return callbackResult(); },
    });
    await expectRejectedCode(owner.run({
      request: request(ledger.activeGrant.grantId),
      selectedDurationMs: 1_000,
    }), 'SERVICE_CREDIT_DURABLE_OWNER_QUARANTINED');
    assert.equal(callbackCalls, 0);
    assert.equal(ledger.store.getRequest({
      grantId: ledger.activeGrant.grantId,
      requestId: 'request.owner.1',
    }).state, REQUEST_STATE.OUTCOME_UNKNOWN);
    await owner.close();
  });
});

test('deadline runtime control faults report no success and retain uncertain cleanup', async t => {
  for (const fault of ['schedule', 'cancel']) {
    await t.test(fault, async t => {
      const ledger = initializedLedger(t, { ledgerId: `ledger.owner.timer.${fault}` });
      let callbackCalls = 0;
      const owner = createDurableServiceCreditExecutionOwner({
        store: ledger.store,
        deadlineRuntime: {
          monotonicNowNs: () => 0n,
          schedule() {
            if (fault === 'schedule') throw new Error('private');
            return Object.freeze({});
          },
          cancel() {
            if (fault === 'cancel') throw new Error('private');
          },
        },
        execute: () => { callbackCalls += 1; return callbackResult(); },
      });
      await expectRejectedCode(owner.run({
        request: request(ledger.activeGrant.grantId),
        selectedDurationMs: 1_000,
      }), 'SERVICE_CREDIT_DURABLE_OWNER_QUARANTINED');
      assert.equal(callbackCalls, fault === 'cancel' ? 1 : 0);
      assert.equal(ledger.store.getRequest({
        grantId: ledger.activeGrant.grantId,
        requestId: 'request.owner.1',
      }).state, REQUEST_STATE.OUTCOME_UNKNOWN);
      const closing = owner.close();
      let closed = false;
      closing.then(() => { closed = true; });
      await Promise.resolve();
      assert.equal(closed, false);
    });
  }
});

test('deadline abort context rejects same-owner and cross-owner reentry before effects', async t => {
  const firstLedger = initializedLedger(t, { ledgerId: 'ledger.owner.abort.1' });
  const secondLedger = initializedLedger(t, {
    directory: directoryFor(t),
    ledgerId: 'ledger.owner.abort.2',
  });
  const runtime = controlledDeadlineRuntime();
  const callback = deferred();
  const reentry = [];
  let firstOwner;
  const secondOwner = createDurableServiceCreditExecutionOwner({
    store: secondLedger.store,
    execute: () => callbackResult('owner.second'),
  });
  firstOwner = createDurableServiceCreditExecutionOwner({
    store: firstLedger.store,
    deadlineRuntime: runtime.runtime,
    execute: identity => {
      identity.signal.addEventListener('abort', () => {
        reentry.push(firstOwner.run({
          request: request(firstLedger.activeGrant.grantId, {
            requestId: 'request.abort.reentry',
          }),
          selectedDurationMs: 1,
        }));
        reentry.push(firstOwner.close());
        reentry.push(secondOwner.run({
          request: request(secondLedger.activeGrant.grantId),
          selectedDurationMs: 1,
        }));
        reentry.push(secondOwner.close());
      }, { once: true });
      return callback.promise;
    },
  });
  const operation = firstOwner.run({
    request: request(firstLedger.activeGrant.grantId),
    selectedDurationMs: 1_000,
  });
  await Promise.resolve();
  runtime.setNowNs(1_000_000_000n);
  runtime.fireNext();
  assert.equal((await operation).status, 'OUTCOME_UNKNOWN');
  assert.equal(reentry.length, 4);
  for (const rejected of reentry) {
    await expectRejectedCode(rejected, 'SERVICE_CREDIT_DURABLE_OWNER_CALLBACK_CONTEXT');
  }
  callback.resolve(callbackResult('owner.late'));
  await firstOwner.close();
  assert.equal((await secondOwner.run({
    request: request(secondLedger.activeGrant.grantId),
    selectedDurationMs: 1_000,
  })).status, 'SUCCEEDED');
  await secondOwner.close();
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
      let aborts = 0;
      let winnerRevision = null;
      const execute = identity => ({
        then(resolve) {
          calls += 1;
          identity.signal.addEventListener('abort', () => { aborts += 1; }, { once: true });
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
      assert.equal(aborts, winner === 'OUTCOME_UNKNOWN' ? 1 : 0);
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

test('an ignored abort can return unknown while a never-settling callback keeps close pending', async t => {
  const ledger = initializedLedger(t);
  const runtime = controlledDeadlineRuntime();
  const never = new Promise(() => {});
  let signal;
  const owner = createDurableServiceCreditExecutionOwner({
    store: ledger.store,
    deadlineRuntime: runtime.runtime,
    execute: identity => {
      signal = identity.signal;
      return never;
    },
  });
  const run = owner.run({
    request: request(ledger.activeGrant.grantId),
    selectedDurationMs: 1_000,
  });
  await Promise.resolve();
  const close = owner.close();
  let closeSettled = false;
  close.then(() => { closeSettled = true; }, () => { closeSettled = true; });
  runtime.setNowNs(1_000_000_000n);
  runtime.fireNext();
  assert.deepEqual(await run, { status: 'OUTCOME_UNKNOWN', cachedResult: null });
  assert.equal(signal.aborted, true);
  await Promise.resolve();
  assert.equal(closeSettled, false);
  assert.equal(ledger.store.getRequest({
    grantId: ledger.activeGrant.grantId,
    requestId: 'request.owner.1',
  }).state, REQUEST_STATE.OUTCOME_UNKNOWN);
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
  const inheritedKeys = [
    'request',
    'selectedDurationMs',
    'status',
    'cachedResult',
    'executionId',
    'signal',
  ];
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

  await t.test('captured abort constructor and prototype operations', async t => {
    const ledger = initializedLedger(t, {
      directory: directoryFor(t),
      ledgerId: 'ledger.owner.poison.abort',
    });
    const runtime = controlledDeadlineRuntime();
    const callback = deferred();
    let signal;
    const owner = createDurableServiceCreditExecutionOwner({
      store: ledger.store,
      deadlineRuntime: runtime.runtime,
      execute: identity => {
        signal = identity.signal;
        return callback.promise;
      },
    });
    const controllerDescriptor = TEST_GET_OWN_PROPERTY_DESCRIPTOR(globalThis, 'AbortController');
    const abortDescriptor = TEST_GET_OWN_PROPERTY_DESCRIPTOR(AbortController.prototype, 'abort');
    const signalDescriptor = TEST_GET_OWN_PROPERTY_DESCRIPTOR(AbortController.prototype, 'signal');
    let operation;
    try {
      TEST_DEFINE_PROPERTY(globalThis, 'AbortController', {
        ...controllerDescriptor,
        value: poison,
      });
      TEST_DEFINE_PROPERTY(controllerDescriptor.value.prototype, 'abort', {
        ...abortDescriptor,
        value: poison,
      });
      TEST_DEFINE_PROPERTY(controllerDescriptor.value.prototype, 'signal', {
        configurable: true,
        get: poison,
      });
      operation = owner.run({
        request: request(ledger.activeGrant.grantId),
        selectedDurationMs: 1_000,
      });
      await Promise.resolve();
      runtime.setNowNs(1_000_000_000n);
      runtime.fireNext();
    } finally {
      TEST_DEFINE_PROPERTY(globalThis, 'AbortController', controllerDescriptor);
      TEST_DEFINE_PROPERTY(controllerDescriptor.value.prototype, 'abort', abortDescriptor);
      TEST_DEFINE_PROPERTY(controllerDescriptor.value.prototype, 'signal', signalDescriptor);
    }
    assert.equal((await operation).status, 'OUTCOME_UNKNOWN');
    assert.equal(signal.aborted, true);
    callback.resolve(callbackResult('owner.late'));
    await owner.close();
  });
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
      deadlineRuntime: {
        monotonicNowNs: () => 0n,
        schedule: () => Object.freeze({}),
        cancel: () => undefined,
      },
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
        deadlineRuntime: {
          monotonicNowNs: () => 0n,
          schedule: () => Object.freeze({}),
          cancel: () => undefined,
        },
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
