import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodeTest from 'node:test';
import * as sdk from 'znn-typescript-sdk';

import { canonicalJson, paymentIntentDigest } from '../src/canonical.js';
import { deriveServiceCreditResourceBinding } from '../src/service-credit-activation.js';
import { deriveServiceCreditCapabilityCommitment } from '../src/service-credit-capability.js';
import {
  createZenonFundingIntakeHttpAdapter,
  ZENON_FUNDING_INTAKE_HTTP_MAX_PAYMENT_SIGNATURE_BYTES,
  ZENON_FUNDING_INTAKE_HTTP_MAX_RAW_HEADER_BYTES,
  ZENON_FUNDING_INTAKE_HTTP_MAX_RAW_HEADER_PAIRS,
} from '../src/service-credit-zenon-funding-intake-http.js';
import {
  createZenonFundingIntakeSqliteStore,
  deriveZenonFundingIntakeSelectionKey,
  openZenonFundingIntakeSqliteStore,
} from '../src/service-credit-zenon-funding-intake-sqlite-store.js';
import {
  parseZenonFundingProviderAttestationAuthorityRecord,
} from '../src/service-credit-zenon-funding-provider-attestation.js';
import { SERVICE_CREDIT_MODEL_VERSION } from '../src/service-credit-model.js';
import { ServiceCreditSqliteStore } from '../src/service-credit-sqlite-store.js';
import { decodeB64Json } from '../src/x402-wire.js';

const NOW = 2_000_000_000_000;
const RESOURCE_URL = 'https://service.example/credits/zenon-fund';
const REQUEST_TARGET = '/credits/zenon-fund';
const LEDGER_DOMAIN = 'service-credit-zenon-intake-http-test-v1';
const FIXTURE_PAYMENT_SIGNATURE_BYTES = 2100;
const NATIVE_FREEZE = Object.freeze;

function fixedTestFailure(code) {
  const error = new Error(code);
  error.stack = `Error: ${code}`;
  return error;
}

function test(name, run) {
  return nodeTest(name, async t => {
    try { await run(t); }
    catch { throw fixedTestFailure('ZENON_FUNDING_INTAKE_HTTP_TEST_FAILED'); }
  });
}

function assertSafeEqual(actual, expected) {
  assert.ok(Object.is(actual, expected), 'ZENON_FUNDING_INTAKE_HTTP_TEST_VALUE_MISMATCH');
}

function assertSafeSame(actual, expected) {
  assert.ok(
    canonicalJson(actual) === canonicalJson(expected),
    'ZENON_FUNDING_INTAKE_HTTP_TEST_VALUE_MISMATCH',
  );
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
  let code;
  let stack;
  try { operation(); } catch (error) { code = safeErrorCode(error); stack = error?.stack; }
  assertSafeEqual(code, expected);
  assertSafeEqual(stack, `TypeError: ${expected}`);
}

async function assertRejectsCode(operation, expected) {
  let code;
  let stack;
  try { await operation; } catch (error) { code = safeErrorCode(error); stack = error?.stack; }
  assertSafeEqual(code, expected);
  assertSafeEqual(stack, `TypeError: ${expected}`);
}

const CHAIN_PROFILE = NATIVE_FREEZE({
  version: 1,
  chainIdentifier: '7',
  genesisMomentumHash: createHash('sha256').update('intake-http-genesis').digest('hex'),
});
const CAPABILITY_PUBLIC_KEY = generateKeyPairSync('ed25519').publicKey
  .export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64url');
const OTHER_CAPABILITY_PUBLIC_KEY = generateKeyPairSync('ed25519').publicKey
  .export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64url');
const PROVIDER_PUBLIC_KEY = generateKeyPairSync('ed25519').publicKey
  .export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64url');

function checksum(label) {
  return `sha256:${createHash('sha256').update(`intake-http:${label}`).digest('hex')}`;
}

const AUTHORITY_RECORD = canonicalJson({
  authorityRecordVersion: 1,
  authorityProfileId: 'zenon.provider-attestation',
  authorityProfileVersion: 1,
  verifierVersion: 1,
  providerAuthorityId: 'provider.intake.http',
  generationId: 'provider.intake.http.generation',
  generationVersion: 1,
  keyId: 'provider.intake.http.key',
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
    hash: createHash('sha256').update('intake-http-bootstrap').digest('hex'),
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

function selectedHolder(publicKey = CAPABILITY_PUBLIC_KEY) {
  return {
    offerId: 'offer.intake.http',
    offerVersion: 1,
    holderId: keyAddress(17),
    capabilityCommitment: deriveServiceCreditCapabilityCommitment({
      publicKey,
    }),
  };
}

function offer() {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    providerId: 'provider.intake.http',
    serviceId: 'service.intake.http',
    resourceId: 'resource.intake.http',
    resourceBinding: deriveServiceCreditResourceBinding({
      resourceId: 'resource.intake.http',
      resourceUrl: RESOURCE_URL,
    }),
    offerId: 'offer.intake.http',
    offerVersion: 1,
    costPolicyId: 'cost.fixed',
    fundingPolicyId: 'funding.exact.intake.http',
    fundingPolicyVersion: 1,
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
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'zenon-intake-http-')));
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
    ledgerDomain: LEDGER_DOMAIN,
    maxChallenges: 4,
  };
  let serviceStore = ServiceCreditSqliteStore.create(serviceConfiguration);
  serviceStore.registerOffer(offer());
  let intakeStore = createZenonFundingIntakeSqliteStore({
    ...intakeConfiguration,
    ...(afterCommit === undefined ? {} : { testHooks: { afterCommit } }),
  });
  let nowValue = NOW;
  let policy = terms;
  let policyCalls = 0;

  function adapter(overrides = {}) {
    return createZenonFundingIntakeHttpAdapter({
      store: intakeStore,
      serviceCreditStore: serviceStore,
      authorityRecord: AUTHORITY_RECORD,
      deriveFundingTerms: input => {
        policyCalls += 1;
        return policy(input);
      },
      now: () => nowValue,
      observerRoot: directory,
      observerCatchUp: {
        maximumPageEntries: 4,
        maximumBackfillSpan: 8,
        maximumMembersPerMomentum: 4,
      },
      selection: selectedHolder(),
      resourceUrl: RESOURCE_URL,
      ...overrides,
    });
  }

  function selectionRow(chosen = selectedHolder()) {
    const selectionKey = deriveZenonFundingIntakeSelectionKey({
      ledgerDomain: LEDGER_DOMAIN,
      selection: chosen,
    });
    return intakeStore.loadBySelectionKey(selectionKey);
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
      const currentRoot = lstatSync(directory, { bigint: true });
      assertSafeEqual(currentRoot.dev, rootIdentity.dev);
      assertSafeEqual(currentRoot.ino, rootIdentity.ino);
      assertSafeEqual(currentRoot.uid, rootIdentity.uid);
      assertSafeEqual(currentRoot.mode, rootIdentity.mode);
      const entries = readdirSync(directory);
      for (const entry of entries) {
        assert.ok(
          entry === 'service.sqlite'
            || entry === 'intake.sqlite'
            || /^funding-observer-[0-9a-f]{64}\.sqlite$/.test(entry),
          'ZENON_FUNDING_INTAKE_HTTP_TEST_UNEXPECTED_FILE',
        );
        const path = join(directory, entry);
        const stat = lstatSync(path, { bigint: true });
        assertSafeEqual(stat.isFile(), true);
        assertSafeEqual(stat.isSymbolicLink(), false);
        assertSafeEqual(stat.uid, rootIdentity.uid);
        assertSafeEqual(stat.nlink, 1n);
        assertSafeEqual(stat.mode & 0o777n, 0o600n);
        unlinkSync(path);
      }
      rmdirSync(directory);
    } catch {
      throw fixedTestFailure('ZENON_FUNDING_INTAKE_HTTP_TEST_CLEANUP_UNCERTAIN');
    }
  });

  return {
    adapter,
    directory,
    reopen,
    selectionRow,
    setNow(value) { nowValue = value; },
    setPolicy(value) { policy = value; },
    get intakeStore() { return intakeStore; },
    get policyCalls() { return policyCalls; },
  };
}

async function syntheticSignedPayload(paymentRequired, variation = 1) {
  const originalChainId = sdk.Zenon.getChainIdentifier();
  sdk.Zenon.setChainID(7);
  const zenon = sdk.Zenon.getInstance();
  const originalLedger = zenon.ledger;
  const originalEmbedded = zenon.embedded;
  const payer = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, 17));
  const payee = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, 18));
  try {
    zenon.ledger = {
      getFrontierAccountBlock: async () => null,
      getFrontierMomentum: async () => ({
        hash: sdk.Hash.digest(Buffer.from(`intake-http-momentum-${variation}`)),
        height: 1,
      }),
    };
    zenon.embedded = {
      plasma: {
        getRequiredPoWForAccountBlock: async () => ({ requiredDifficulty: 0, basePlasma: 0 }),
      },
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

function encodePayment(payment) {
  return Buffer.from(JSON.stringify(payment), 'utf8').toString('base64');
}

function requestEnvelope(paymentHeader = null, overrides = {}) {
  const rawHeaders = Object.hasOwn(overrides, 'rawHeaders')
    ? overrides.rawHeaders
    : (paymentHeader === null
      ? ['Host', 'attacker.invalid']
      : ['Host', 'attacker.invalid', 'PAYMENT-SIGNATURE', paymentHeader]);
  const request = {
    method: overrides.method ?? 'GET',
    url: overrides.url ?? REQUEST_TARGET,
    rawHeaders: NATIVE_FREEZE(rawHeaders),
  };
  if (Object.hasOwn(overrides, 'body')) request.body = overrides.body;
  return NATIVE_FREEZE(request);
}

function exchange(handle, paymentHeader = null, overrides = {}) {
  const request = requestEnvelope(paymentHeader, overrides);
  const headers = Object.create(null);
  let body;
  const response = {
    destroyed: false,
    writableEnded: false,
    statusCode: 0,
    setHeader(name, value) { headers[String(name).toLowerCase()] = String(value); },
    end(value) {
      this.writableEnded = true;
      body = Buffer.from(value);
    },
    destroy() { this.destroyed = true; },
  };
  return handle(request, response).then(() => NATIVE_FREEZE({
    statusCode: response.statusCode,
    headers: NATIVE_FREEZE({ ...headers }),
    body,
  }));
}

function assertPrivateText(response) {
  assertSafeEqual(response.headers['cache-control'], 'private, no-store, max-age=0');
  assertSafeEqual(response.headers['content-type'], 'text/plain; charset=utf-8');
  assertSafeEqual(response.headers.vary, 'PAYMENT-SIGNATURE');
  assertSafeEqual(response.headers['x-content-type-options'], 'nosniff');
  assertSafeEqual(response.headers['content-length'], String(response.body.length));
}

function challengeFrom(response) {
  return decodeB64Json(response.headers['payment-required'], {
    maxEncodedBytes: ZENON_FUNDING_INTAKE_HTTP_MAX_PAYMENT_SIGNATURE_BYTES,
  });
}

test('the adapter is frozen, default-off, listenerless, and unavailable before explicit recovery', async t => {
  const context = fixture(t);
  const source = readFileSync(
    new URL('../src/service-credit-zenon-funding-intake-http.js', import.meta.url),
    'utf8',
  );
  assertSafeEqual(source.includes("from 'node:http'"), false);
  assertSafeEqual(source.includes('createServer'), false);
  assertSafeEqual(source.includes('.listen('), false);
  assertSafeEqual(source.includes('wallet'), false);
  assertSafeEqual(source.includes('rpc'), false);
  assertSafeEqual(source.includes('WebSocket'), false);

  const adapter = context.adapter();
  assertSafeSame(Reflect.ownKeys(adapter), ['recover', 'handle', 'close']);
  assertSafeEqual(Object.isFrozen(adapter), true);
  assertSafeEqual(Object.isFrozen(adapter.recover), true);
  assertSafeEqual(Object.isFrozen(adapter.handle), true);
  assertSafeEqual(Object.isFrozen(adapter.close), true);
  assertSafeEqual(context.selectionRow(), null);

  const unavailable = await exchange(adapter.handle);
  assertSafeEqual(unavailable.statusCode, 503);
  assertSafeEqual(unavailable.body.toString('utf8'), 'Service Unavailable');
  assertPrivateText(unavailable);
  assertSafeEqual(context.selectionRow(), null);
  assertSafeEqual(context.policyCalls, 0);
  assertSafeSame(adapter.recover(), { status: 'RECOVERED' });
  assertSafeEqual(adapter.recover(), adapter.recover());
  await adapter.close();
});

test('configuration fixes one canonical HTTPS target and never derives authority from Host or body', async t => {
  const context = fixture(t);
  for (const resourceUrl of [
    'http://service.example/credits/zenon-fund',
    'https://SERVICE.example/credits/zenon-fund',
    'https://service.example:443/credits/zenon-fund',
    'https://service.example/credits/zenon-fund?selection=caller',
    'https://service.example/credits/zenon-fund#fragment',
  ]) {
    assertThrowsCode(
      () => context.adapter({ resourceUrl }),
      'ZENON_FUNDING_INTAKE_HTTP_INVALID_CONFIGURATION',
    );
  }
  assertSafeEqual(context.selectionRow(), null);

  const adapter = context.adapter();
  adapter.recover();
  const bodyAttempt = await exchange(adapter.handle, null, {
    body: { selection: selectedHolder(), resourceUrl: 'https://attacker.invalid/fund' },
  });
  assertSafeEqual(bodyAttempt.statusCode, 400);
  assertSafeEqual(context.selectionRow(), null);
  assertSafeEqual(context.policyCalls, 0);

  const wrongPath = await exchange(adapter.handle, null, { url: '/credits/other' });
  const wrongMethod = await exchange(adapter.handle, null, { method: 'POST' });
  assertSafeEqual(wrongPath.statusCode, 404);
  assertSafeEqual(wrongMethod.statusCode, 405);
  assertSafeEqual(wrongMethod.headers.allow, 'GET');
  assertSafeEqual(context.selectionRow(), null);

  const response = await exchange(adapter.handle, null, {
    rawHeaders: ['Host', 'different.invalid', 'X-Selection', 'attacker-controlled'],
  });
  assertSafeEqual(response.statusCode, 402);
  assertSafeEqual(challengeFrom(response).resource.url, RESOURCE_URL);
  assertSafeEqual(context.selectionRow().issue.resourceUrl, RESOURCE_URL);
  await adapter.close();
});

test('the first HTTP 402 is the exact persisted frame and replay does not rerun policy', async t => {
  const context = fixture(t);
  const adapter = context.adapter();
  adapter.recover();
  const first = await exchange(adapter.handle);
  assertSafeEqual(first.statusCode, 402);
  assertSafeEqual(first.body.toString('utf8'), 'Payment Required');
  assertPrivateText(first);
  const row = context.selectionRow();
  assertSafeEqual(row.status, 'ISSUED');
  assertSafeEqual(first.headers['payment-required'], row.issue.frame.paymentRequiredHeader);
  assertSafeEqual(first.body.toString('utf8'), row.issue.frame.body);
  assertSafeEqual(context.policyCalls, 1);

  context.setPolicy(() => { throw fixedTestFailure('POLICY_MUST_NOT_RUN'); });
  const replay = await exchange(adapter.handle);
  assertSafeEqual(replay.statusCode, 402);
  assertSafeEqual(replay.headers['payment-required'], first.headers['payment-required']);
  assertSafeEqual(replay.body.equals(first.body), true);
  assertSafeEqual(context.policyCalls, 1);
  await adapter.close();
});

test('same-URL same-payer payments cannot cross fixed capability selections after recovery', async t => {
  const context = fixture(t);
  let fixed = context.adapter();
  const otherSelection = selectedHolder(OTHER_CAPABILITY_PUBLIC_KEY);
  const other = context.adapter({ selection: otherSelection });
  fixed.recover();
  other.recover();
  const fixedChallenge = challengeFrom(await exchange(fixed.handle));
  const otherChallenge = challengeFrom(await exchange(other.handle));
  const fixedHeader = encodePayment(await syntheticSignedPayload(fixedChallenge));
  const otherHeader = encodePayment(await syntheticSignedPayload(otherChallenge));
  assertSafeEqual(context.selectionRow().status, 'ISSUED');
  assertSafeEqual(context.selectionRow(otherSelection).status, 'ISSUED');

  const rejected = await exchange(fixed.handle, otherHeader);
  assertSafeEqual(rejected.statusCode, 400);
  assertSafeEqual(rejected.body.toString('utf8'), 'Bad Request');
  assertPrivateText(rejected);
  assertSafeEqual(context.selectionRow().status, 'ISSUED');
  assertSafeEqual(context.selectionRow(otherSelection).status, 'ISSUED');
  assertSafeEqual(context.intakeStore.loadBound().length, 0);

  const accepted = await exchange(fixed.handle, fixedHeader);
  assertSafeEqual(accepted.statusCode, 202);
  assertSafeEqual(accepted.body.toString('utf8'), 'BOUND');
  assertPrivateText(accepted);
  const originalBound = structuredClone(context.selectionRow());
  assertSafeEqual(originalBound.status, 'BOUND');
  assertSafeEqual(context.selectionRow(otherSelection).status, 'ISSUED');
  assertSafeEqual(context.intakeStore.loadBound().length, 1);
  assertSafeEqual(
    readdirSync(context.directory).filter(name => name.startsWith('funding-observer-')).length,
    1,
  );
  await fixed.close();
  await other.close();
  context.reopen();
  context.setPolicy(() => { throw fixedTestFailure('POLICY_MUST_NOT_RUN'); });

  fixed = context.adapter();
  assertSafeSame(fixed.recover(), { status: 'RECOVERED' });
  const rejectedAfterRecovery = await exchange(fixed.handle, otherHeader);
  assertSafeEqual(rejectedAfterRecovery.statusCode, 400);
  assertSafeEqual(rejectedAfterRecovery.body.toString('utf8'), 'Bad Request');
  assertPrivateText(rejectedAfterRecovery);
  assertSafeEqual(context.selectionRow(otherSelection).status, 'ISSUED');
  assertSafeSame(context.selectionRow(), originalBound);
  assertSafeEqual(context.intakeStore.loadBound().length, 1);
  assertSafeEqual(
    readdirSync(context.directory).filter(name => name.startsWith('funding-observer-')).length,
    1,
  );

  const replay = await exchange(fixed.handle, fixedHeader);
  assertSafeEqual(replay.statusCode, 202);
  assertSafeEqual(replay.body.toString('utf8'), 'BOUND');
  assertPrivateText(replay);
  assertSafeEqual(context.selectionRow(otherSelection).status, 'ISSUED');
  assertSafeSame(context.selectionRow(), originalBound);
  assertSafeEqual(context.intakeStore.loadBound().length, 1);
  assertSafeEqual(
    readdirSync(context.directory).filter(name => name.startsWith('funding-observer-')).length,
    1,
  );
  await fixed.close();
});

test('duplicate, oversized, malformed, and body-framed requests fail before durable effects', async t => {
  const context = fixture(t);
  const adapter = context.adapter();
  adapter.recover();
  const oversized = 'A'.repeat(ZENON_FUNDING_INTAKE_HTTP_MAX_PAYMENT_SIGNATURE_BYTES + 1);
  const tooMany = [];
  for (let index = 0; index <= ZENON_FUNDING_INTAKE_HTTP_MAX_RAW_HEADER_PAIRS; index += 1) {
    tooMany.push('X-Pad', 'x');
  }
  const unsafePayment = {
    x402Version: 2,
    resource: { url: RESOURCE_URL },
    accepted: terms({ offer: offer() }).requirement,
    payload: {
      transaction: { unsafeInteger: Number.MAX_SAFE_INTEGER + 1 },
      intentDigest: '0'.repeat(64),
    },
  };
  const cases = [
    { rawHeaders: ['PAYMENT-SIGNATURE', 'e30=', 'payment-signature', 'e30='] },
    { rawHeaders: ['PAYMENT-SIGNATURE', oversized] },
    { rawHeaders: ['PAYMENT-SIGNATURE', 'not-base64'] },
    { rawHeaders: ['PAYMENT-SIGNATURE', Buffer.from('{"x402Version":2}').toString('base64')] },
    { rawHeaders: ['PAYMENT-SIGNATURE', encodePayment(unsafePayment)] },
    { rawHeaders: ['Content-Length', '0'] },
    { rawHeaders: ['Transfer-Encoding', 'chunked'] },
    { rawHeaders: ['Content-Type', 'application/json'] },
    { rawHeaders: ['Expect', '100-continue'] },
    { rawHeaders: tooMany },
    { rawHeaders: ['X-Pad', 'x'.repeat(ZENON_FUNDING_INTAKE_HTTP_MAX_RAW_HEADER_BYTES)] },
  ];
  for (const request of cases) {
    const response = await exchange(adapter.handle, null, request);
    assertSafeEqual(response.statusCode, 400);
    assertSafeEqual(response.body.toString('utf8'), 'Bad Request');
    assertPrivateText(response);
    assertSafeEqual(context.selectionRow(), null);
    assertSafeEqual(context.policyCalls, 0);
  }
  await adapter.close();
});

test('one measured bounded PAYMENT-SIGNATURE binds once and exposes only fixed 202 BOUND', async t => {
  const context = fixture(t);
  const adapter = context.adapter();
  adapter.recover();
  const challenge = challengeFrom(await exchange(adapter.handle));
  const payment = await syntheticSignedPayload(challenge);
  const paymentHeader = encodePayment(payment);
  const measuredBytes = Buffer.byteLength(paymentHeader, 'utf8');
  assertSafeEqual(measuredBytes, FIXTURE_PAYMENT_SIGNATURE_BYTES);
  assertSafeEqual(measuredBytes, paymentHeader.length);
  assertSafeEqual(measuredBytes < ZENON_FUNDING_INTAKE_HTTP_MAX_PAYMENT_SIGNATURE_BYTES, true);
  assertSafeEqual(ZENON_FUNDING_INTAKE_HTTP_MAX_PAYMENT_SIGNATURE_BYTES, 8192);
  assertSafeEqual(ZENON_FUNDING_INTAKE_HTTP_MAX_RAW_HEADER_BYTES, 16384);
  assertSafeEqual(ZENON_FUNDING_INTAKE_HTTP_MAX_RAW_HEADER_PAIRS, 64);

  const first = await exchange(adapter.handle, paymentHeader);
  assertSafeEqual(first.statusCode, 202);
  assertSafeEqual(first.body.toString('utf8'), 'BOUND');
  assertPrivateText(first);
  assertSafeEqual(Object.hasOwn(first.headers, 'payment-response'), false);
  assertSafeEqual(first.body.includes(Buffer.from('READY')), false);
  assertSafeEqual(first.body.includes(Buffer.from('credit')), false);
  assertSafeEqual(first.body.includes(Buffer.from(payment.payload.transaction.hash)), false);
  const row = context.selectionRow();
  assertSafeEqual(row.status, 'BOUND');
  assertSafeEqual(row.binding.transactionHash, payment.payload.transaction.hash);

  const replay = await exchange(adapter.handle, paymentHeader);
  assertSafeEqual(replay.statusCode, 202);
  assertSafeEqual(replay.body.equals(first.body), true);
  assertSafeEqual(context.intakeStore.loadBound().length, 1);
  assertSafeEqual(
    readdirSync(context.directory).filter(name => name.startsWith('funding-observer-')).length,
    1,
  );
  await adapter.close();
});

test('tampering is rejected and a competing signed transaction cannot replace BOUND', async t => {
  const context = fixture(t);
  const adapter = context.adapter();
  adapter.recover();
  const challenge = challengeFrom(await exchange(adapter.handle));
  const firstPayment = await syntheticSignedPayload(challenge, 1);
  const secondPayment = await syntheticSignedPayload(challenge, 2);
  const tampered = structuredClone(firstPayment);
  const signature = tampered.payload.transaction.signature;
  tampered.payload.transaction.signature = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
  const changedResource = structuredClone(firstPayment);
  changedResource.resource.url = 'https://attacker.invalid/credits';

  const nonCanonicalHeader = Buffer.from(
    ` ${JSON.stringify(firstPayment)}`,
    'utf8',
  ).toString('base64');
  const nonCanonical = await exchange(adapter.handle, nonCanonicalHeader);
  assertSafeEqual(nonCanonical.statusCode, 400);
  assertSafeEqual(context.intakeStore.loadBound().length, 0);

  for (const candidate of [tampered, changedResource]) {
    const rejected = await exchange(adapter.handle, encodePayment(candidate));
    assertSafeEqual(rejected.statusCode, 400);
    assertSafeEqual(rejected.body.toString('utf8'), 'Bad Request');
    assertSafeEqual(context.intakeStore.loadBound().length, 0);
  }

  const accepted = await exchange(adapter.handle, encodePayment(firstPayment));
  const conflict = await exchange(adapter.handle, encodePayment(secondPayment));
  const replay = await exchange(adapter.handle, encodePayment(firstPayment));
  assertSafeEqual(accepted.statusCode, 202);
  assertSafeEqual(conflict.statusCode, 409);
  assertSafeEqual(conflict.body.toString('utf8'), 'Conflict');
  assertSafeEqual(replay.statusCode, 202);
  assertSafeEqual(context.selectionRow().binding.transactionHash, firstPayment.payload.transaction.hash);
  await adapter.close();
});

test('restart recovery is mandatory and paid replay creates no second binding or observer', async t => {
  const context = fixture(t);
  let adapter = context.adapter();
  adapter.recover();
  const challenge = challengeFrom(await exchange(adapter.handle));
  const paymentHeader = encodePayment(await syntheticSignedPayload(challenge));
  assertSafeEqual((await exchange(adapter.handle, paymentHeader)).statusCode, 202);
  await adapter.close();
  context.reopen();
  context.setPolicy(() => { throw fixedTestFailure('POLICY_MUST_NOT_RUN'); });

  adapter = context.adapter();
  const beforeRecovery = await exchange(adapter.handle, paymentHeader);
  assertSafeEqual(beforeRecovery.statusCode, 503);
  assertSafeSame(adapter.recover(), { status: 'RECOVERED' });
  const replay = await exchange(adapter.handle, paymentHeader);
  const unsigned = await exchange(adapter.handle);
  assertSafeEqual(replay.statusCode, 202);
  assertSafeEqual(unsigned.statusCode, 409);
  assertSafeEqual(context.policyCalls, 1);
  assertSafeEqual(context.intakeStore.loadBound().length, 1);
  assertSafeEqual(
    readdirSync(context.directory).filter(name => name.startsWith('funding-observer-')).length,
    1,
  );
  await adapter.close();
});

test('ambiguous BOUND returns no 202 and requires reopen recovery before admission', async t => {
  let armed = false;
  const context = fixture(t, {
    afterCommit: () => { if (armed) throw fixedTestFailure('SYNTHETIC_COMMIT_UNCERTAINTY'); },
  });
  let adapter = context.adapter();
  adapter.recover();
  const challenge = challengeFrom(await exchange(adapter.handle));
  const paymentHeader = encodePayment(await syntheticSignedPayload(challenge));
  armed = true;
  const ambiguous = await exchange(adapter.handle, paymentHeader);
  assertSafeEqual(ambiguous.statusCode, 503);
  assertSafeEqual(ambiguous.body.toString('utf8'), 'Service Unavailable');
  assertThrowsCode(
    () => adapter.recover(),
    'ZENON_FUNDING_INTAKE_HTTP_RECOVERY_REQUIRED',
  );
  assertSafeEqual((await exchange(adapter.handle, paymentHeader)).statusCode, 503);
  await assertRejectsCode(
    adapter.close(),
    'ZENON_FUNDING_INTAKE_HTTP_RECOVERY_REQUIRED',
  );

  armed = false;
  context.reopen();
  adapter = context.adapter();
  adapter.recover();
  assertSafeEqual((await exchange(adapter.handle, paymentHeader)).statusCode, 202);
  assertSafeEqual(context.intakeStore.loadBound().length, 1);
  await adapter.close();
});

test('close drains an admitted binding, is idempotent, and rejects later admission', async t => {
  const context = fixture(t);
  const adapter = context.adapter();
  adapter.recover();
  const challenge = challengeFrom(await exchange(adapter.handle));
  const paymentHeader = encodePayment(await syntheticSignedPayload(challenge));
  const pending = exchange(adapter.handle, paymentHeader);
  const firstClose = adapter.close();
  const secondClose = adapter.close();
  assertSafeEqual(firstClose, secondClose);
  const response = await pending;
  assertSafeEqual(response.statusCode, 202);
  await firstClose;
  assertSafeEqual(context.intakeStore.loadBound().length, 1);
  const afterClose = await exchange(adapter.handle, paymentHeader);
  assertSafeEqual(afterClose.statusCode, 503);
  assertSafeEqual(adapter.close(), firstClose);
});

test('lifecycle errors and public failures remain fixed and value-free', async t => {
  const context = fixture(t);
  assertThrowsCode(
    () => context.adapter({ unexpected: RESOURCE_URL }),
    'ZENON_FUNDING_INTAKE_HTTP_INVALID_CONFIGURATION',
  );
  const adapter = context.adapter();
  assertThrowsCode(
    () => adapter.recover(RESOURCE_URL),
    'ZENON_FUNDING_INTAKE_HTTP_INVALID_INPUT',
  );
  await assertRejectsCode(
    adapter.close(RESOURCE_URL),
    'ZENON_FUNDING_INTAKE_HTTP_INVALID_INPUT',
  );
  const unavailable = await exchange(adapter.handle, Buffer.from(RESOURCE_URL).toString('base64'));
  assertSafeEqual(unavailable.statusCode, 503);
  for (const value of [RESOURCE_URL, selectedHolder().holderId, 'READY', 'transactionHash']) {
    assertSafeEqual(unavailable.body.includes(Buffer.from(value)), false);
  }
  await adapter.close();
});
