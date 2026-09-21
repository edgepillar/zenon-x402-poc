import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { chmodSync, lstatSync, mkdtempSync, readdirSync, realpathSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import nodeTest from 'node:test';
import { types as utilTypes } from 'node:util';
import * as sdk from 'znn-typescript-sdk';
import { canonicalJson, paymentIntentDigest } from '../src/canonical.js';
import { deriveServiceCreditResourceBinding } from '../src/service-credit-activation.js';
import { deriveServiceCreditCapabilityCommitment } from '../src/service-credit-capability.js';
import { deriveZenonFundingObserverTarget } from '../src/service-credit-zenon-funding-evidence.js';
import {
  createZenonFundingIntakeSqliteStore,
  openZenonFundingIntakeSqliteStore,
} from '../src/service-credit-zenon-funding-intake-sqlite-store.js';
import {
  createZenonFundingIntake,
} from '../src/service-credit-zenon-funding-intake.js';
import { parseZenonFundingProviderAttestationAuthorityRecord } from '../src/service-credit-zenon-funding-provider-attestation.js';
import { ZenonFundingObserverSqliteStore } from '../src/service-credit-zenon-funding-observer-sqlite-store.js';
import { SERVICE_CREDIT_MODEL_VERSION } from '../src/service-credit-model.js';
import { ServiceCreditSqliteStore } from '../src/service-credit-sqlite-store.js';
import { preflightZenonPayment } from '../src/zenon-payment.js';
import { decodeB64Json } from '../src/x402-wire.js';

const NOW = 2_000_000_000_000;
const RESOURCE_URL = 'https://service.example/credits/zenon-fund';
const BOUND_RESULT_KEYS = Object.freeze([
  'status',
  'transactionHash',
  'observerRecordKey',
  'observerFileName',
]);

function assertExactBoundResult(value) {
  assertSafeEqual(Object.getPrototypeOf(value), null);
  assertSafeEqual(Object.isFrozen(value), true);
  assert.deepEqual(Reflect.ownKeys(value), BOUND_RESULT_KEYS);
  for (const key of BOUND_RESULT_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assertSafeEqual(descriptor?.configurable, false);
    assertSafeEqual(descriptor?.enumerable, true);
    assertSafeEqual(descriptor?.writable, false);
  }
}

function fixedTestFailure(code) {
  const error = new Error(code);
  error.stack = `Error: ${code}`;
  return error;
}

function assertSafeEqual(actual, expected) {
  assert.ok(Object.is(actual, expected), 'ZENON_FUNDING_INTAKE_TEST_VALUE_MISMATCH');
}

function assertSafeDifferent(actual, expected) {
  assert.ok(!Object.is(actual, expected), 'ZENON_FUNDING_INTAKE_TEST_VALUE_MISMATCH');
}

function assertSafeSame(actual, expected) {
  assert.ok(canonicalJson(actual) === canonicalJson(expected), 'ZENON_FUNDING_INTAKE_TEST_VALUE_MISMATCH');
}

function safeErrorCode(error) {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
    return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function assertThrowsCode(operation, expected) {
  let actual;
  try { operation(); } catch (error) { actual = safeErrorCode(error); }
  assertSafeEqual(actual, expected);
}

async function assertRejectsCode(operation, expected) {
  let actual;
  try { await operation; } catch (error) { actual = safeErrorCode(error); }
  assertSafeEqual(actual, expected);
}

function test(name, run) {
  return nodeTest(name, async t => {
    try { await run(t); }
    catch { throw fixedTestFailure('ZENON_FUNDING_INTAKE_TEST_FAILED'); }
  });
}
const CHAIN_PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: '7',
  genesisMomentumHash: createHash('sha256').update('intake-genesis').digest('hex'),
});
const CAPABILITY_PUBLIC_KEY = generateKeyPairSync('ed25519').publicKey
  .export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64url');
const PROVIDER_PUBLIC_KEY = generateKeyPairSync('ed25519').publicKey
  .export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64url');

function checksum(label) {
  return `sha256:${createHash('sha256').update(`intake:${label}`).digest('hex')}`;
}

const AUTHORITY_RECORD = canonicalJson({
  authorityRecordVersion: 1,
  authorityProfileId: 'zenon.provider-attestation',
  authorityProfileVersion: 1,
  verifierVersion: 1,
  providerAuthorityId: 'provider.intake',
  generationId: 'provider.intake.generation',
  generationVersion: 1,
  keyId: 'provider.intake.key',
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
    hash: createHash('sha256').update('intake-bootstrap').digest('hex'),
  },
  sourcePolicyCommitment: checksum('source-policy'),
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

function offer() {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    providerId: 'provider.intake',
    serviceId: 'service.intake',
    resourceId: 'resource.intake',
    resourceBinding: deriveServiceCreditResourceBinding({
      resourceId: 'resource.intake', resourceUrl: RESOURCE_URL,
    }),
    offerId: 'offer.intake',
    offerVersion: 1,
    costPolicyId: 'cost.fixed',
    fundingPolicyId: 'funding.exact.intake',
    fundingPolicyVersion: 1,
  };
}

function selectedHolder() {
  return {
    offerId: 'offer.intake',
    offerVersion: 1,
    holderId: keyAddress(17),
    capabilityCommitment: deriveServiceCreditCapabilityCommitment({
      publicKey: CAPABILITY_PUBLIC_KEY,
    }),
  };
}

function terms(input) {
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
      maxTimeoutSeconds: 30,
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
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'zenon-intake-')));
  chmodSync(directory, 0o700);
  const rootIdentity = lstatSync(directory, { bigint: true });
  const serviceConfiguration = {
    databasePath: join(directory, 'service.sqlite'),
    allowedRoot: directory,
    deriveCost: () => 2,
    now: () => NOW,
  };
  const intakeConfiguration = {
    databasePath: join(directory, 'intake.sqlite'),
    allowedRoot: directory,
    ledgerDomain: 'service-credit-zenon-intake-test-v1',
    maxChallenges: 4,
  };
  let serviceStore = ServiceCreditSqliteStore.create(serviceConfiguration);
  serviceStore.registerOffer(offer());
  let intakeStore = createZenonFundingIntakeSqliteStore({
    ...intakeConfiguration,
    ...(afterCommit ? { testHooks: { afterCommit } } : {}),
  });
  let nowValue = NOW;
  let policy = terms;
  function owner(selectedStore = intakeStore, overrides = {}) {
    return createZenonFundingIntake({
      store: selectedStore,
      serviceCreditStore: serviceStore,
      authorityRecord: overrides.authorityRecord ?? AUTHORITY_RECORD,
      deriveFundingTerms: input => policy(input),
      now: overrides.now ?? (() => nowValue),
      observerRoot: overrides.observerRoot ?? directory,
      observerCatchUp: {
        maximumPageEntries: 4,
        maximumBackfillSpan: 8,
        maximumMembersPerMomentum: 4,
      },
    });
  }
  function reopen() {
    intakeStore.close();
    serviceStore.close();
    serviceStore = ServiceCreditSqliteStore.openExisting(serviceConfiguration);
    intakeStore = openZenonFundingIntakeSqliteStore(intakeConfiguration);
  }
  t.after(() => {
    try {
      try { intakeStore.close(); } catch {}
      try { serviceStore.close(); } catch {}
      const current = lstatSync(directory, { bigint: true });
      assertSafeEqual(current.dev, rootIdentity.dev);
      assertSafeEqual(current.ino, rootIdentity.ino);
      assertSafeEqual(current.uid, rootIdentity.uid);
      assertSafeEqual(current.mode, rootIdentity.mode);
      const entries = readdirSync(directory);
      const ownedFiles = entries.map(entry => {
        assert.ok(entry === 'service.sqlite' || entry === 'intake.sqlite'
          || /^funding-observer-[0-9a-f]{64}\.sqlite$/.test(entry),
        'ZENON_FUNDING_INTAKE_TEST_UNEXPECTED_FILE');
        const path = join(directory, entry);
        const stat = lstatSync(path, { bigint: true });
        assertSafeEqual(stat.isFile(), true);
        assertSafeEqual(stat.isSymbolicLink(), false);
        assertSafeEqual(stat.uid, rootIdentity.uid);
        assertSafeEqual(stat.nlink, 1n);
        assertSafeEqual(stat.mode & 0o777n, 0o600n);
        return { path, stat };
      });
      for (const { path, stat } of ownedFiles) {
        const reread = lstatSync(path, { bigint: true });
        assertSafeEqual(reread.dev, stat.dev);
        assertSafeEqual(reread.ino, stat.ino);
        unlinkSync(path);
      }
      rmdirSync(directory);
    } catch {
      throw fixedTestFailure('ZENON_FUNDING_INTAKE_TEST_CLEANUP_UNCERTAIN');
    }
  });
  return {
    directory,
    intakeConfiguration,
    owner,
    reopen,
    setNow(value) { nowValue = value; },
    setPolicy(value) { policy = value; },
    get intakeStore() { return intakeStore; },
  };
}

async function syntheticSignedPayload(paymentRequired, payerByte = 17, variation = 1) {
  const originalChainId = sdk.Zenon.getChainIdentifier();
  sdk.Zenon.setChainID(7);
  const zenon = sdk.Zenon.getInstance();
  const originalLedger = zenon.ledger;
  const originalEmbedded = zenon.embedded;
  const payer = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, payerByte));
  const payee = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, 18));
  try {
    zenon.ledger = {
      getFrontierAccountBlock: async () => null,
      getFrontierMomentum: async () => ({
        hash: sdk.Hash.digest(Buffer.from(`intake-momentum-${variation}`)),
        height: 1,
      }),
    };
    zenon.embedded = {
      plasma: { getRequiredPoWForAccountBlock: async () => ({ requiredDifficulty: 0, basePlasma: 0 }) },
    };
    const accepted = paymentRequired.accepts[0];
    const block = sdk.AccountBlockTemplate.send(payee.getAddress(), sdk.ZNN_ZTS, 1n);
    const intentDigest = paymentIntentDigest(paymentRequired, accepted);
    block.data = Buffer.from(intentDigest, 'hex');
    const signed = await zenon.prepareBlock(block, payer);
    return {
      x402Version: 2,
      resource: structuredClone(paymentRequired.resource),
      accepted: structuredClone(accepted),
      payload: { transaction: signed.toJson(), intentDigest },
    };
  } finally {
    payer.clear();
    payee.clear();
    zenon.ledger = originalLedger;
    zenon.embedded = originalEmbedded;
    sdk.Zenon.setChainID(originalChainId);
  }
}

test('the default-off funding intake exports explicit owner and store factories', () => {
  assertSafeEqual(typeof createZenonFundingIntakeSqliteStore, 'function');
  assertSafeEqual(typeof createZenonFundingIntake, 'function');
});

test('the committed 402 frame survives an orphaned response and policy drift', t => {
  const context = fixture(t);
  const first = context.owner().issue({ selection: selectedHolder(), resourceUrl: RESOURCE_URL });
  assertSafeEqual(first.status, 402);
  assertSafeEqual(first.body, 'Payment Required');
  assertSafeEqual(decodeB64Json(first.paymentRequiredHeader).resource.url, RESOURCE_URL);
  context.reopen();
  context.setPolicy(() => { throw new Error('policy must not run for replay'); });
  context.setNow(NOW + 1_000);
  const replay = context.owner().issue({ selection: selectedHolder(), resourceUrl: RESOURCE_URL });
  assertSafeSame(replay, first);
  context.setNow(NOW + 60_000);
  assertThrowsCode(() => context.owner().issue({
    selection: selectedHolder(), resourceUrl: RESOURCE_URL,
  }), 'ZENON_FUNDING_INTAKE_EXPIRED');
});

test('one synthetic signed payment binds once and creates one exact observer', async t => {
  const context = fixture(t);
  const owner = context.owner();
  const challenge = decodeB64Json(owner.issue({ selection: selectedHolder(), resourceUrl: RESOURCE_URL }).paymentRequiredHeader);
  const payment = await syntheticSignedPayload(challenge);
  const checked = await preflightZenonPayment(payment, challenge.accepts[0], challenge);
  assertSafeEqual(checked.payer, selectedHolder().holderId);
  const tags = challenge.resource.tags;
  const issued = context.intakeStore.loadByFundingCommitment(`sha256:${tags[1]}${tags[2]}`);
  const target = deriveZenonFundingObserverTarget({
    offer: issued.issue.offer,
    challenge: issued.issue.challenge,
    authorityProfile: AUTHORITY.authorityProfile,
    transactionHash: checked.transactionHash,
    payer: checked.payer,
    resourceUrl: RESOURCE_URL,
  });
  assertSafeEqual(target.transactionId, `zenontx:${checked.transactionHash}`);
  const first = await owner.bind(payment);
  assertSafeEqual(first.status, 'BOUND');
  assertSafeEqual(first.transactionHash, payment.payload.transaction.hash);
  const replay = await owner.bind(payment);
  assertSafeSame(replay, first);
  context.reopen();
  context.setPolicy(() => { throw new Error('policy must not run for bound replay'); });
  context.setNow(NOW + 120_000);
  const recovered = context.owner().recoverBound();
  assertSafeSame(recovered, [first]);
  assertSafeSame(await context.owner().bind(payment), first);
});

test('BOUND fulfillment records resist inherited assimilation across bind replay and recovery', async t => {
  const context = fixture(t);
  const owner = context.owner();
  const challenge = decodeB64Json(owner.issue({
    selection: selectedHolder(),
    resourceUrl: RESOURCE_URL,
  }).paymentRequiredHeader);
  const payment = await syntheticSignedPayload(challenge);
  const inheritedKeys = ['then', 'get', 'set'];
  const safeGetPrototypeOf = Reflect.getPrototypeOf;
  const safeGetOwnPropertyDescriptor = Reflect.getOwnPropertyDescriptor;
  const safeOwnKeys = Reflect.ownKeys;
  const safeHasOwn = Object.hasOwn;
  const safeIsProxy = utilTypes.isProxy;
  const ordinaryPrototype = Object.prototype;
  const hasExactOldBoundShape = value => {
    try {
      if (value === null || typeof value !== 'object'
        || safeIsProxy(value)
        || safeGetPrototypeOf(value) !== ordinaryPrototype) return false;
      const keys = safeOwnKeys(value);
      if (keys.length !== BOUND_RESULT_KEYS.length) return false;
      for (let index = 0; index < BOUND_RESULT_KEYS.length; index += 1) {
        if (keys[index] !== BOUND_RESULT_KEYS[index]) return false;
        const descriptor = safeGetOwnPropertyDescriptor(value, keys[index]);
        if (descriptor?.enumerable !== true || !safeHasOwn(descriptor, 'value')) return false;
      }
      return true;
    } catch {
      return false;
    }
  };
  let proxyTrapCalls = 0;
  const hostileProxy = new Proxy({
    status: 'BOUND',
    transactionHash: '',
    observerRecordKey: '',
    observerFileName: '',
  }, {
    get() { proxyTrapCalls += 1; throw new Error('proxy_get_trap'); },
    getOwnPropertyDescriptor() {
      proxyTrapCalls += 1;
      throw new Error('proxy_descriptor_trap');
    },
    getPrototypeOf() { proxyTrapCalls += 1; throw new Error('proxy_prototype_trap'); },
    ownKeys() { proxyTrapCalls += 1; throw new Error('proxy_keys_trap'); },
  });
  assertSafeEqual(hasExactOldBoundShape(hostileProxy), false);
  assertSafeEqual(proxyTrapCalls, 0);
  const originals = new Map(inheritedKeys.map(key => [
    key,
    Object.getOwnPropertyDescriptor(Object.prototype, key),
  ]));
  let matchingThenGetterCalls = 0;
  let unrelatedThenGetterCalls = 0;
  let descriptorGetterCalls = 0;
  let descriptorSetterCalls = 0;
  const unhandled = [];
  const onUnhandled = value => unhandled.push(value);
  process.on('unhandledRejection', onUnhandled);
  const originalObserverClose = ZenonFundingObserverSqliteStore.prototype.close;
  let armDescriptorPoison = false;
  const mockedObserverClose = t.mock.method(
    ZenonFundingObserverSqliteStore.prototype,
    'close',
    function closeAndArmDescriptorPoison() {
      originalObserverClose.call(this);
      if (!armDescriptorPoison) return;
      for (const key of ['get', 'set']) {
        Object.defineProperty(Object.prototype, key, {
          configurable: true,
          get() { descriptorGetterCalls += 1; return undefined; },
          set() { descriptorSetterCalls += 1; },
        });
      }
    },
  );
  const restoreDescriptorPoison = () => {
    for (const key of ['get', 'set']) {
      const original = originals.get(key);
      if (original === undefined) delete Object.prototype[key];
      else Object.defineProperty(Object.prototype, key, original);
    }
  };
  const withLateDescriptorPoison = async operation => {
    armDescriptorPoison = true;
    let cancelDeadline;
    let timer;
    const deadline = new Promise((resolve, reject) => {
      cancelDeadline = resolve;
      timer = setTimeout(() => {
        reject(fixedTestFailure('ZENON_FUNDING_INTAKE_TEST_TIMEOUT'));
      }, 2_000);
    });
    const handledDeadline = deadline.catch(() => undefined);
    try {
      return await Promise.race([operation(), deadline]);
    }
    finally {
      clearTimeout(timer);
      cancelDeadline();
      await handledDeadline;
      armDescriptorPoison = false;
      restoreDescriptorPoison();
    }
  };
  const withLateDescriptorPoisonSync = operation => {
    armDescriptorPoison = true;
    try { return operation(); }
    finally {
      armDescriptorPoison = false;
      restoreDescriptorPoison();
    }
  };
  let first;
  let replay;
  let recovered;
  let recoveredReplay;
  try {
    Object.defineProperty(Object.prototype, 'then', {
      configurable: true,
      get() {
        if (hasExactOldBoundShape(this)) matchingThenGetterCalls += 1;
        else unrelatedThenGetterCalls += 1;
        return undefined;
      },
      set() { descriptorSetterCalls += 1; },
    });
    first = await withLateDescriptorPoison(() => owner.bind(payment));
    replay = await withLateDescriptorPoison(() => owner.bind(payment));
    owner.close();
    context.reopen();
    const reopened = context.owner();
    recovered = withLateDescriptorPoisonSync(() => reopened.recoverBound());
    recoveredReplay = await withLateDescriptorPoison(() => reopened.bind(payment));
    reopened.close();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(unhandled, []);
  } finally {
    for (const [key, original] of originals) {
      if (original === undefined) delete Object.prototype[key];
      else Object.defineProperty(Object.prototype, key, original);
    }
    process.off('unhandledRejection', onUnhandled);
    mockedObserverClose.mock.restore();
  }

  assertSafeEqual(matchingThenGetterCalls, 0);
  assertSafeEqual(descriptorGetterCalls, 0);
  assertSafeEqual(descriptorSetterCalls, 0);
  assertSafeEqual(Number.isSafeInteger(unrelatedThenGetterCalls), true);
  assertSafeEqual(context.intakeStore.loadBound().length, 1);
  assertSafeEqual(recovered.length, 1);
  for (const value of [first, replay, recovered[0], recoveredReplay]) {
    assertExactBoundResult(value);
    assertSafeEqual(value.transactionHash, payment.payload.transaction.hash);
    const spread = { ...value };
    assert.deepEqual(Reflect.ownKeys(spread), BOUND_RESULT_KEYS);
    assertSafeSame(spread, value);
    assertSafeEqual(JSON.stringify(value), JSON.stringify(spread));
    assertSafeEqual(canonicalJson(value), canonicalJson(spread));
  }
});

test('untrusted nested getters are rejected before invocation or binding', async t => {
  const context = fixture(t);
  const owner = context.owner();
  const challenge = decodeB64Json(owner.issue({ selection: selectedHolder(), resourceUrl: RESOURCE_URL }).paymentRequiredHeader);
  const valid = await syntheticSignedPayload(challenge);
  let invoked = 0;
  const accessorTag = structuredClone(valid);
  Object.defineProperty(accessorTag.resource.tags, '1', {
    enumerable: true,
    configurable: true,
    get() { invoked += 1; return challenge.resource.tags[1]; },
  });
  await assertRejectsCode(owner.bind(accessorTag), 'ZENON_FUNDING_INTAKE_REJECTED');
  const accessorBlock = structuredClone(valid);
  Object.defineProperty(accessorBlock.payload.transaction, 'signature', {
    enumerable: true,
    configurable: true,
    get() { invoked += 1; return valid.payload.transaction.signature; },
  });
  await assertRejectsCode(owner.bind(accessorBlock), 'ZENON_FUNDING_INTAKE_REJECTED');
  assertSafeEqual(invoked, 0);
  assertSafeEqual(context.intakeStore.loadBound().length, 0);
});

test('closing the owner during pending preflight prevents a later binding', async t => {
  const context = fixture(t);
  const owner = context.owner();
  const challenge = decodeB64Json(owner.issue({
    selection: selectedHolder(), resourceUrl: RESOURCE_URL,
  }).paymentRequiredHeader);
  const payment = await syntheticSignedPayload(challenge);
  const pending = owner.bind(payment);
  owner.close();
  await assertRejectsCode(pending, 'ZENON_FUNDING_INTAKE_CLOSED');
  assertSafeEqual(context.intakeStore.loadBound().length, 0);
  assertSafeEqual(readdirSync(context.directory).filter(name => name.startsWith('funding-observer-')).length, 0);
});

test('an ambiguous 402 commit returns no frame and reopens the exact orphan', t => {
  let armed = true;
  const context = fixture(t, { afterCommit: () => { if (armed) throw new Error('synthetic commit uncertainty'); } });
  assertThrowsCode(() => context.owner().issue({
    selection: selectedHolder(), resourceUrl: RESOURCE_URL,
  }), 'ZENON_FUNDING_INTAKE_OUTCOME_UNKNOWN');
  armed = false;
  context.reopen();
  const persisted = context.owner().issue({ selection: selectedHolder(), resourceUrl: RESOURCE_URL });
  assertSafeEqual(persisted.status, 402);
  assertSafeEqual(decodeB64Json(persisted.paymentRequiredHeader).resource.url, RESOURCE_URL);
});

test('an ambiguous BOUND commit recovers the same payment before observer creation', async t => {
  let armed = false;
  const context = fixture(t, { afterCommit: () => { if (armed) throw new Error('synthetic commit uncertainty'); } });
  const owner = context.owner();
  const challenge = decodeB64Json(owner.issue({ selection: selectedHolder(), resourceUrl: RESOURCE_URL }).paymentRequiredHeader);
  const payment = await syntheticSignedPayload(challenge);
  armed = true;
  await assertRejectsCode(owner.bind(payment), 'ZENON_FUNDING_INTAKE_OUTCOME_UNKNOWN');
  assertSafeEqual(readdirSync(context.directory).filter(name => name.startsWith('funding-observer-')).length, 0);
  armed = false;
  context.reopen();
  const recovered = context.owner().recoverBound();
  assertSafeEqual(recovered.length, 1);
  assertSafeEqual(recovered[0].transactionHash, payment.payload.transaction.hash);
  assertSafeEqual(readdirSync(context.directory).filter(name => name.startsWith('funding-observer-')).length, 1);
  assertSafeSame(await context.owner().bind(payment), recovered[0]);
});

test('a different valid payer cannot bind the selected holder', async t => {
  const context = fixture(t);
  const owner = context.owner();
  const challenge = decodeB64Json(owner.issue({ selection: selectedHolder(), resourceUrl: RESOURCE_URL }).paymentRequiredHeader);
  const otherPayer = await syntheticSignedPayload(challenge, 19);
  await assertRejectsCode(owner.bind(otherPayer), 'ZENON_FUNDING_INTAKE_REJECTED');
  assertSafeEqual(context.intakeStore.loadBound().length, 0);
});

test('expiry crossing during offline preflight cannot create BOUND or renew a challenge', async t => {
  const context = fixture(t);
  const challenge = decodeB64Json(context.owner().issue({ selection: selectedHolder(), resourceUrl: RESOURCE_URL }).paymentRequiredHeader);
  const payment = await syntheticSignedPayload(challenge);
  let reads = 0;
  const owner = context.owner(context.intakeStore, {
    now: () => (++reads === 1 ? NOW : NOW + 60_000),
  });
  await assertRejectsCode(owner.bind(payment), 'ZENON_FUNDING_INTAKE_EXPIRED');
  assertSafeEqual(reads, 2);
  assertSafeEqual(context.intakeStore.loadBound().length, 0);
});

test('a competing valid transaction for the same challenge conflicts without replacing BOUND', async t => {
  const context = fixture(t);
  const owner = context.owner();
  const challenge = decodeB64Json(owner.issue({ selection: selectedHolder(), resourceUrl: RESOURCE_URL }).paymentRequiredHeader);
  const firstPayment = await syntheticSignedPayload(challenge, 17, 1);
  const secondPayment = await syntheticSignedPayload(challenge, 17, 2);
  assertSafeDifferent(secondPayment.payload.transaction.hash, firstPayment.payload.transaction.hash);
  assertSafeEqual((await preflightZenonPayment(secondPayment, challenge.accepts[0], challenge)).transactionHash,
    secondPayment.payload.transaction.hash);
  const first = await owner.bind(firstPayment);
  const retained = context.intakeStore.loadBound()[0].binding.publication;
  assertSafeSame(retained.paymentPayload, firstPayment);
  await assertRejectsCode(owner.bind(secondPayment), 'ZENON_FUNDING_INTAKE_CONFLICT');
  assertSafeSame(await owner.bind(firstPayment), first);
  assertSafeSame(context.intakeStore.loadBound()[0].binding.publication, retained);
  assertSafeEqual(context.intakeStore.loadBound().length, 1);
});

test('two independent SQLite connections CAS competing transactions to at most one BOUND', async t => {
  const context = fixture(t);
  const firstOwner = context.owner();
  const challenge = decodeB64Json(firstOwner.issue({ selection: selectedHolder(), resourceUrl: RESOURCE_URL }).paymentRequiredHeader);
  const firstPayment = await syntheticSignedPayload(challenge, 17, 1);
  const secondPayment = await syntheticSignedPayload(challenge, 17, 2);
  const secondStore = openZenonFundingIntakeSqliteStore(context.intakeConfiguration);
  try {
    const outcomes = await Promise.allSettled([
      firstOwner.bind(firstPayment),
      context.owner(secondStore).bind(secondPayment),
    ]);
    assertSafeEqual(outcomes.filter(item => item.status === 'fulfilled').length, 1);
    assertSafeEqual(outcomes.filter(item => item.status === 'rejected'
      && safeErrorCode(item.reason) === 'ZENON_FUNDING_INTAKE_CONFLICT').length, 1);
    assertSafeEqual(context.intakeStore.loadBound().length, 1);
    assertSafeEqual(secondStore.loadBound().length, 1);
    assertSafeEqual(readdirSync(context.directory).filter(name => name.startsWith('funding-observer-')).length, 1);
  } finally {
    secondStore.close();
  }
});

test('post-observer close uncertainty quarantines the owner without claiming READY', async t => {
  const context = fixture(t);
  const owner = context.owner();
  const challenge = decodeB64Json(owner.issue({ selection: selectedHolder(), resourceUrl: RESOURCE_URL }).paymentRequiredHeader);
  const payment = await syntheticSignedPayload(challenge);
  const originalClose = ZenonFundingObserverSqliteStore.prototype.close;
  const mockedClose = t.mock.method(ZenonFundingObserverSqliteStore.prototype, 'close', function closeThenFail() {
    originalClose.call(this);
    throw new Error('synthetic close uncertainty');
  });
  try {
    await assertRejectsCode(owner.bind(payment), 'ZENON_FUNDING_INTAKE_OBSERVER_UNCERTAIN');
    assertThrowsCode(() => owner.recoverBound(), 'ZENON_FUNDING_INTAKE_QUARANTINED');
  } finally {
    mockedClose.mock.restore();
  }
  context.reopen();
  const recovered = context.owner().recoverBound();
  assertSafeEqual(recovered.length, 1);
  assertSafeEqual(recovered[0].status, 'BOUND');
});

test('reopen rejects changed authority and observer root without regenerating the challenge', t => {
  const context = fixture(t);
  const first = context.owner().issue({ selection: selectedHolder(), resourceUrl: RESOURCE_URL });
  context.reopen();
  const changedAuthority = canonicalJson({
    ...JSON.parse(AUTHORITY_RECORD),
    publicKey: generateKeyPairSync('ed25519').publicKey
      .export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64url'),
  });
  assertThrowsCode(() => context.owner(context.intakeStore, { authorityRecord: changedAuthority })
    .issue({ selection: selectedHolder(), resourceUrl: RESOURCE_URL }),
  'ZENON_FUNDING_INTAKE_AUTHORITY_MISMATCH');
  const otherRoot = realpathSync(mkdtempSync(join(tmpdir(), 'zenon-intake-other-')));
  chmodSync(otherRoot, 0o700);
  const identity = lstatSync(otherRoot, { bigint: true });
  t.after(() => {
    try {
      const current = lstatSync(otherRoot, { bigint: true });
      assertSafeEqual(current.dev, identity.dev);
      assertSafeEqual(current.ino, identity.ino);
      assertSafeSame(readdirSync(otherRoot), []);
      rmdirSync(otherRoot);
    } catch {
      throw fixedTestFailure('ZENON_FUNDING_INTAKE_TEST_CLEANUP_UNCERTAIN');
    }
  });
  assertThrowsCode(() => context.owner(context.intakeStore, { observerRoot: otherRoot })
    .issue({ selection: selectedHolder(), resourceUrl: RESOURCE_URL }),
  'ZENON_FUNDING_INTAKE_AUTHORITY_MISMATCH');
  assertSafeSame(context.owner().issue({ selection: selectedHolder(), resourceUrl: RESOURCE_URL }), first);
});

test('mismatched observer storage quarantines recovery rather than substituting a target', async t => {
  const context = fixture(t);
  const owner = context.owner();
  const challenge = decodeB64Json(owner.issue({ selection: selectedHolder(), resourceUrl: RESOURCE_URL }).paymentRequiredHeader);
  const payment = await syntheticSignedPayload(challenge);
  const bound = await owner.bind(payment);
  const database = new DatabaseSync(join(context.directory, bound.observerFileName));
  try {
    database.prepare('UPDATE zenon_funding_observer_state SET record_key = ? WHERE singleton = 1')
      .run(checksum('wrong-observer-record'));
  } finally {
    database.close();
  }
  const reopened = context.owner();
  assertThrowsCode(() => reopened.recoverBound(), 'ZENON_FUNDING_INTAKE_OBSERVER_UNCERTAIN');
  assertThrowsCode(() => reopened.recoverBound(), 'ZENON_FUNDING_INTAKE_QUARANTINED');
  assertSafeEqual(context.intakeStore.loadBound().length, 1);
});
