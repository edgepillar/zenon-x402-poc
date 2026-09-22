import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash, generateKeyPairSync, X509Certificate } from 'node:crypto';
import {
  accessSync, chmodSync, constants as fsConstants, existsSync, lstatSync, mkdtempSync,
  readFileSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodeTest from 'node:test';
import * as sdk from 'znn-typescript-sdk';

import { canonicalJson, paymentIntentDigest } from '../src/canonical.js';
import { deriveServiceCreditResourceBinding } from '../src/service-credit-activation.js';
import { deriveServiceCreditCapabilityCommitment } from '../src/service-credit-capability.js';
import {
  ZENON_FUNDING_POST_V1_CLIENT_CODES as CODES,
  ZenonFundingPostV1ClientError,
  createServiceCreditZenonFundingPostV1Client,
} from '../src/service-credit-zenon-funding-post-v1-client.js';
import {
  createServiceCreditZenonFundingIntakeHttpsOwnerV1,
} from '../src/service-credit-zenon-funding-intake-https-owner-v1.js';
import {
  createZenonFundingIntakeSqliteStore,
} from '../src/service-credit-zenon-funding-intake-sqlite-store.js';
import {
  parseZenonFundingProviderAttestationAuthorityRecord,
} from '../src/service-credit-zenon-funding-provider-attestation.js';
import { SERVICE_CREDIT_MODEL_VERSION } from '../src/service-credit-model.js';
import { ServiceCreditSqliteStore } from '../src/service-credit-sqlite-store.js';
import { decodeB64Json, encodeB64Json, makePaymentRequired } from '../src/x402-wire.js';

const NOW = 2_000_000_000_000;
const TARGET = '/credits/zenon-fund';
const OPENSSL = '/usr/bin/openssl';
const LEDGER_DOMAIN = 'service-credit-zenon-funding-post-v1-client-test-v1';
const SOURCE = readFileSync(
  new URL('../src/service-credit-zenon-funding-post-v1-client.js', import.meta.url),
  'utf8',
);

function fixedFailure() {
  const error = new Error('SERVICE_CREDIT_ZENON_FUNDING_POST_V1_CLIENT_TEST_FAILED');
  error.stack = 'Error: SERVICE_CREDIT_ZENON_FUNDING_POST_V1_CLIENT_TEST_FAILED';
  return error;
}

function test(name, run) {
  return nodeTest(name, async t => {
    try { await run(t); } catch { throw fixedFailure(); }
  });
}

function errorCode(error) {
  try { return Object.getOwnPropertyDescriptor(error, 'code')?.value; }
  catch { return undefined; }
}

function rejectsCode(code) {
  return error => errorCode(error) === code;
}

function keyAddress(byte) {
  const key = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, byte));
  try { return key.getAddress().toString(); } finally { key.clear(); }
}

function checksum(label) {
  return `sha256:${createHash('sha256').update(`funding-post-client:${label}`).digest('hex')}`;
}

const CHAIN_PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: '7',
  genesisMomentumHash: createHash('sha256').update('funding-post-client-genesis').digest('hex'),
});
const CAPABILITY_PUBLIC_KEY = generateKeyPairSync('ed25519').publicKey
  .export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64url');
const PROVIDER_PUBLIC_KEY = generateKeyPairSync('ed25519').publicKey
  .export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64url');
const AUTHORITY_RECORD = canonicalJson({
  authorityRecordVersion: 1,
  authorityProfileId: 'zenon.provider-attestation',
  authorityProfileVersion: 1,
  verifierVersion: 1,
  providerAuthorityId: 'provider.funding.post.client',
  generationId: 'provider.funding.post.client.generation',
  generationVersion: 1,
  keyId: 'provider.funding.post.client.key',
  algorithm: 'Ed25519',
  publicKey: PROVIDER_PUBLIC_KEY,
  network: 'zenon:testnet',
  chainProfile: CHAIN_PROFILE,
  observerPolicy: { policyId: 'zenon.injected-observer', policyVersion: 1, verifierVersion: 1 },
  confirmationPolicy: {
    policyId: 'zenon.authenticated-momentum-inclusion',
    policyVersion: 1,
    minimumConfirmations: 3,
  },
  bootstrapCheckpoint: {
    height: 10,
    hash: createHash('sha256').update('funding-post-client-bootstrap').digest('hex'),
  },
  sourcePolicyCommitment: checksum('source-policy'),
  maximumAttestationBytes: 4096,
  maximumCanonicalBytes: 524288,
  maximumInitialAgeSeconds: 300,
  maximumFutureSkewSeconds: 5,
  maximumValiditySeconds: 300,
});
const AUTHORITY = parseZenonFundingProviderAttestationAuthorityRecord(AUTHORITY_RECORD);

function selection() {
  return {
    offerId: 'offer.funding.post.client',
    offerVersion: 1,
    holderId: keyAddress(17),
    capabilityCommitment: deriveServiceCreditCapabilityCommitment({ publicKey: CAPABILITY_PUBLIC_KEY }),
  };
}

function offer(resourceUrl) {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    providerId: 'provider.funding.post.client',
    serviceId: 'service.funding.post.client',
    resourceId: 'resource.funding.post.client',
    resourceBinding: deriveServiceCreditResourceBinding({
      resourceId: 'resource.funding.post.client', resourceUrl,
    }),
    offerId: 'offer.funding.post.client',
    offerVersion: 1,
    costPolicyId: 'cost.fixed',
    fundingPolicyId: 'funding.exact.post.client',
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
      scheme: 'exact', network: 'zenon:testnet', asset: sdk.ZNN_ZTS.toString(),
      amount: '1', payTo: keyAddress(18), maxTimeoutSeconds: 30,
      extra: {
        paymentFlow: 'upfront', poc: true, settlement: 'account-block',
        zenonChain: structuredClone(CHAIN_PROFILE),
        minimumMomentumConfirmations: AUTHORITY.confirmationPolicy.minimumConfirmations,
      },
    },
  };
}

function boundedCleanup(operation, milliseconds = 8_000) {
  let timer;
  const deadline = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(fixedFailure()), milliseconds);
  });
  return Promise.race([operation, deadline]).finally(() => clearTimeout(timer));
}

function createFixtureContext(t) {
  const context = {
    owner: null,
    stores: [],
    directories: [],
    sensitiveBuffers: [],
    requests: new Set(),
    runPromise: null,
  };
  context.run = () => {
    if (context.runPromise !== null) return context.runPromise;
    context.runPromise = (async () => {
      try {
        const requestClosures = [...context.requests].map(request => new Promise(resolve => {
          request.once('close', resolve);
          try { request.destroy(); } catch {}
        }));
        await boundedCleanup(Promise.all(requestClosures));
        if (context.requests.size !== 0) throw fixedFailure();
        if (context.owner !== null) {
          const result = await boundedCleanup(context.owner.close());
          if (
            result === null
            || typeof result !== 'object'
            || Reflect.ownKeys(result).length !== 1
            || result.status !== 'CLOSED'
          ) throw fixedFailure();
        }
      } catch {
        throw fixedFailure();
      }

      try {
        for (const store of context.stores) store.close();
        for (const buffer of context.sensitiveBuffers) buffer.fill(0);
        for (let index = context.directories.length - 1; index >= 0; index -= 1) {
          rmSync(context.directories[index], { recursive: true, force: true });
        }
      } catch {
        throw fixedFailure();
      }
    })();
    return context.runPromise;
  };
  t.after(() => context.run());
  return context;
}

function privateDirectory(context, prefix) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  chmodSync(directory, 0o700);
  context.directories.push(directory);
  return directory;
}

function storeFixture(context, resourceUrl, afterCommit, failAfterServiceStore = false) {
  const directory = privateDirectory(context, 'funding-post-v1-client-');
  const serviceStore = ServiceCreditSqliteStore.create({
    databasePath: join(directory, 'service.sqlite'), allowedRoot: directory,
    deriveCost: () => 2, now: () => NOW,
  });
  context.stores.push(serviceStore);
  if (failAfterServiceStore) throw fixedFailure();
  serviceStore.registerOffer(offer(resourceUrl));
  const intakeStore = createZenonFundingIntakeSqliteStore({
    databasePath: join(directory, 'intake.sqlite'), allowedRoot: directory,
    ledgerDomain: LEDGER_DOMAIN, maxChallenges: 4,
    ...(afterCommit === undefined ? {} : { testHooks: { afterCommit } }),
  });
  context.stores.unshift(intakeStore);
  return Object.freeze({ directory, intakeStore, serviceStore });
}

function tlsMaterial(context) {
  const binary = lstatSync(OPENSSL);
  assert.equal(binary.isFile() && binary.uid === 0 && (binary.mode & 0o022) === 0, true);
  accessSync(OPENSSL, fsConstants.X_OK);
  const directory = privateDirectory(context, 'funding-post-v1-client-tls-');
  const configurationPath = join(directory, 'tls.cnf');
  const keyPath = join(directory, 'key.pem');
  const certificatePath = join(directory, 'cert.pem');
  writeFileSync(
    configurationPath,
    '[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=v3_req\n'
      + '[dn]\nCN=127.0.0.1\n'
      + '[v3_req]\nsubjectAltName=IP:127.0.0.1\nbasicConstraints=CA:FALSE\n'
      + 'keyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n',
    { encoding: 'utf8', mode: 0o600, flag: 'wx' },
  );
  const generated = childProcess.spawnSync(OPENSSL, [
    'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1',
    '-sha256', '-nodes', '-days', '1', '-keyout', keyPath, '-out', certificatePath,
    '-config', configurationPath, '-extensions', 'v3_req',
  ], { env: {}, encoding: 'utf8', timeout: 15_000, maxBuffer: 1024 * 1024 });
  assert.equal(generated.status, 0);
  assert.equal(generated.error, undefined);
  const key = readFileSync(keyPath);
  const cert = readFileSync(certificatePath);
  assert.equal(new X509Certificate(cert).checkIP('127.0.0.1'), '127.0.0.1');
  context.sensitiveBuffers.push(key, cert);
  return Object.freeze({ key, cert });
}

function reserveLoopbackPort() {
  const server = createNetServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      const address = server.address();
      server.close(error => { if (error) reject(error); else resolve(address.port); });
    });
  });
}

function deadlineRuntime() {
  const handles = new Set();
  return Object.freeze({
    runtime: Object.freeze({
      schedule: Object.freeze((callback, milliseconds) => {
        let handle;
        handle = setTimeout(() => { handles.delete(handle); callback(); }, milliseconds);
        handles.add(handle);
        return handle;
      }),
      cancel: Object.freeze(handle => { clearTimeout(handle); handles.delete(handle); return true; }),
    }),
    empty: () => handles.size === 0,
  });
}

function ownerConfiguration({ stores, tls, port, resourceUrl, deadlines }) {
  return Object.freeze({
    transport: Object.freeze({
      origin: `https://127.0.0.1:${port}`,
      bind: Object.freeze({ host: '127.0.0.1', port, exclusive: true }),
      tlsMaterial: Object.freeze({ key: tls.key, cert: tls.cert }),
      generation: Object.freeze({ generationId: 'funding.post.client.test', generationVersion: 1 }),
      limits: Object.freeze({
        maxHeaderBytes: 16 * 1024, maxHeaderCount: 128,
        maxConcurrentSockets: 8, maxConnectionStarts: 128,
        maxConcurrentRequests: 8, maxRequestStarts: 96,
        tlsHandshakeDeadlineMs: 2_000, headerDeadlineMs: 2_000,
        requestResponseDeadlineMs: 4_000, idleSocketDeadlineMs: 5_000,
        startDeadlineMs: 3_000, closeGraceMs: 6_000, metricsCounterLimit: 10_000,
      }),
      deadlineRuntime: deadlines.runtime,
    }),
    funding: Object.freeze({
      store: stores.intakeStore, serviceCreditStore: stores.serviceStore,
      authorityRecord: AUTHORITY_RECORD,
      deriveFundingTerms: Object.freeze(fundingTerms), now: Object.freeze(() => NOW),
      observerRoot: stores.directory,
      observerCatchUp: Object.freeze({
        maximumPageEntries: 4, maximumBackfillSpan: 8, maximumMembersPerMomentum: 4,
      }),
      selection: Object.freeze(selection()), resourceUrl,
    }),
  });
}

function httpsFetch(cert, state = {}, cleanup = null) {
  return (url, options) => new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const headers = {};
    for (const [name, value] of Object.entries(options.headers)) headers[name] = value;
    headers.Host = parsed.host;
    headers.Connection = 'close';
    let closed = false;
    let settled = false;
    let terminalError = null;
    let responseValue = null;
    const finish = () => {
      if (settled || !closed || (terminalError === null && responseValue === null)) return;
      settled = true;
      if (terminalError !== null) reject(terminalError);
      else resolve(responseValue);
    };
    const request = httpsRequest({
      hostname: parsed.hostname,
      port: Number(parsed.port),
      path: parsed.pathname,
      method: options.method,
      ca: cert,
      rejectUnauthorized: true,
      agent: false,
      ALPNProtocols: ['http/1.1'],
      headers,
      signal: options.signal,
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.once('error', error => { terminalError = error; finish(); });
      response.once('end', () => {
        const bytes = Buffer.concat(chunks);
        const body = new Response(bytes).body;
        responseValue = Object.freeze({
          status: response.statusCode,
          url,
          redirected: false,
          headers: new Headers(response.headers),
          body,
        });
        finish();
      });
    });
    state.request = request;
    if (cleanup !== null) cleanup.requests.add(request);
    request.once('close', () => {
      closed = true;
      if (state.request === request) state.request = null;
      if (cleanup !== null) cleanup.requests.delete(request);
      finish();
    });
    request.once('error', error => { terminalError = error; finish(); });
    request.end();
  });
}

async function startOwner(t, afterCommit) {
  const cleanup = createFixtureContext(t);
  const port = await reserveLoopbackPort();
  const resourceUrl = `https://127.0.0.1:${port}${TARGET}`;
  const stores = storeFixture(cleanup, resourceUrl, afterCommit);
  const tls = tlsMaterial(cleanup);
  const deadlines = deadlineRuntime();
  const owner = createServiceCreditZenonFundingIntakeHttpsOwnerV1(ownerConfiguration({
    stores, tls, port, resourceUrl, deadlines,
  }));
  cleanup.owner = owner;
  assert.deepEqual(await owner.start(), { status: 'LISTENING' });
  return { owner, port, resourceUrl, stores, tls, deadlines, cleanup };
}

async function signedPayload(paymentRequired, variation = 1) {
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
        hash: sdk.Hash.digest(Buffer.from(`funding-post-client-momentum-${variation}`)), height: 1,
      }),
    };
    zenon.embedded = { plasma: {
      getRequiredPoWForAccountBlock: async () => ({ requiredDifficulty: 0, basePlasma: 0 }),
    } };
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

function fakeResponse(resourceUrl, status, body, extraHeaders = {}, overrides = {}) {
  const bytes = Buffer.from(body, 'utf8');
  const headers = new Headers({
    'Cache-Control': 'private, no-store, max-age=0',
    'Content-Type': 'text/plain; charset=utf-8',
    Vary: 'PAYMENT-SIGNATURE',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': String(bytes.length),
    ...extraHeaders,
  });
  return Object.freeze({
    status,
    url: resourceUrl,
    redirected: false,
    headers,
    body: new Response(bytes).body,
    ...overrides,
  });
}

function staticChallenge(resourceUrl) {
  const configuredOffer = offer(resourceUrl);
  const terms = fundingTerms({ offer: configuredOffer });
  return makePaymentRequired({ resourceUrl, requirement: terms.requirement });
}

function client(resourceUrl, fetchImpl, deadlineMs = 2_000) {
  return createServiceCreditZenonFundingPostV1Client(Object.freeze({
    resourceUrl, deadlineMs, fetchImpl,
  }));
}

test('construction is inert, exact, default-off, and owns no signer or persistence authority', async () => {
  let calls = 0;
  const resourceUrl = 'https://service.example/credits/zenon-fund';
  const owner = client(resourceUrl, async () => {
    calls += 1;
    throw fixedFailure();
  });
  assert.deepEqual(Object.keys(owner), ['requestChallenge', 'submitAuthorizedPayment']);
  assert.equal(Object.isFrozen(owner), true);
  assert.equal(calls, 0);
  for (const invalid of [
    'http://service.example/credits/zenon-fund',
    'https://service.example/',
    'https://user@service.example/credits/zenon-fund',
    'https://service.example/credits/../fund',
    'https://service.example/credits/fund?x=1',
    'https://service.example/credits/fund#x',
  ]) {
    assert.throws(
      () => createServiceCreditZenonFundingPostV1Client({
        resourceUrl: invalid, deadlineMs: 2_000, fetchImpl: async () => {},
      }),
      rejectsCode(CODES.invalidConfiguration),
    );
  }
  assert.doesNotMatch(SOURCE, /privateKey|mnemonic|keyfile|create.*Signer|process\.env|console\./i);
  assert.deepEqual(
    [...SOURCE.matchAll(/from '([^']+)';/g)].map(match => match[1]),
    ['node:util', './zenon-payment.js', './x402-wire.js'],
  );
});

test('partial fixture setup uses one ordered cleanup and removes files only after store release', async t => {
  const cleanup = createFixtureContext(t);
  const resourceUrl = 'https://service.example/credits/zenon-fund';
  assert.throws(
    () => storeFixture(cleanup, resourceUrl, undefined, true),
    /SERVICE_CREDIT_ZENON_FUNDING_POST_V1_CLIENT_TEST_FAILED/,
  );
  assert.equal(cleanup.stores.length, 1);
  const directory = cleanup.directories[0];
  assert.equal(existsSync(directory), true);
  await cleanup.run();
  assert.equal(existsSync(directory), false);
});

test('real loopback TLS performs canonical unsigned 402 then one authorized zero-body POST to BOUND', async t => {
  const runtime = await startOwner(t);
  const transportState = {};
  const calls = [];
  const transport = httpsFetch(runtime.tls.cert, transportState, runtime.cleanup);
  const wrapped = async (url, options) => {
    calls.push(Object.freeze({
      url,
      method: options.method,
      redirect: options.redirect,
      cache: options.cache,
      credentials: options.credentials,
      contentLength: options.headers['Content-Length'],
      payment: options.headers['PAYMENT-SIGNATURE'] ?? null,
    }));
    return transport(url, options);
  };
  const buyer = client(runtime.resourceUrl, wrapped);
  const challenge = await buyer.requestChallenge();
  assert.equal(Object.getPrototypeOf(challenge), null);
  assert.equal(Object.isFrozen(challenge), true);
  assert.equal(Object.isFrozen(challenge.paymentRequired), true);
  assert.equal(challenge.status, 'PAYMENT_REQUIRED');
  assert.equal(challenge.resourceUrl, runtime.resourceUrl);
  assert.equal(calls[0].payment, null);
  assert.equal(calls[0].contentLength, '0');
  let signingCalls = 0;
  signingCalls += 1;
  const payment = await signedPayload(challenge.paymentRequired);
  const paymentSignatureHeader = encodeB64Json(payment);
  const result = await buyer.submitAuthorizedPayment(Object.freeze({
    challenge,
    paymentSignatureHeader,
  }));
  assert.equal(Object.getPrototypeOf(result), null);
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(Object.keys(result), ['status']);
  assert.equal(result.status, 'BOUND');
  assert.equal(signingCalls, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].payment, paymentSignatureHeader);
  assert.equal(calls[1].contentLength, '0');
  assert.equal(calls.every(call => call.url === runtime.resourceUrl), true);
  assert.equal(calls.every(call => call.method === 'POST'), true);
  assert.equal(calls.every(call => call.redirect === 'manual'), true);
  assert.equal(calls.every(call => call.cache === 'no-store'), true);
  assert.equal(calls.every(call => call.credentials === 'omit'), true);
  assert.equal(transportState.request, null);
  assert.deepEqual(await runtime.owner.close(), { status: 'CLOSED' });
  assert.equal(runtime.deadlines.empty(), true);
});

test('lost response latches ambiguity and a fresh client replays the identical payment without resigning', async t => {
  const state = { request: null, dropAfterCommit: false };
  const runtime = await startOwner(t, () => {
    if (state.dropAfterCommit && state.request !== null) state.request.destroy();
  });
  const transport = httpsFetch(runtime.tls.cert, state, runtime.cleanup);
  const first = client(runtime.resourceUrl, transport);
  const challenge = await first.requestChallenge();
  let signingCalls = 0;
  signingCalls += 1;
  const paymentSignatureHeader = encodeB64Json(await signedPayload(challenge.paymentRequired));
  state.dropAfterCommit = true;
  await assert.rejects(
    first.submitAuthorizedPayment({ challenge, paymentSignatureHeader }),
    rejectsCode(CODES.outcomeUnknown),
  );
  state.dropAfterCommit = false;
  const persistedChallenge = JSON.parse(JSON.stringify(challenge));
  const recovered = client(runtime.resourceUrl, transport);
  const result = await recovered.submitAuthorizedPayment({
    challenge: persistedChallenge,
    paymentSignatureHeader,
  });
  assert.equal(result.status, 'BOUND');
  assert.equal(signingCalls, 1);
  assert.equal(state.request, null);
  await runtime.cleanup.run();
  assert.equal(existsSync(runtime.stores.directory), false);
});

test('redirects never forward payment and exact rejection frames remain distinct from unknown', async () => {
  const resourceUrl = 'https://service.example/credits/zenon-fund';
  const paymentRequired = staticChallenge(resourceUrl);
  const paymentRequiredHeader = encodeB64Json(paymentRequired);
  const challenge = Object.freeze({
    status: 'PAYMENT_REQUIRED', resourceUrl, paymentRequiredHeader, paymentRequired,
  });
  const paymentSignatureHeader = encodeB64Json(await signedPayload(paymentRequired, 2));
  const cases = [
    [400, 'Bad Request', CODES.paymentRejected],
    [409, 'Conflict', CODES.paymentConflict],
    [503, 'Service Unavailable', CODES.outcomeUnknown],
    [302, 'Redirect', CODES.outcomeUnknown],
  ];
  for (const [status, body, code] of cases) {
    const observed = [];
    const buyer = client(resourceUrl, async (url, options) => {
      observed.push({ url, options });
      return fakeResponse(resourceUrl, status, body);
    });
    await assert.rejects(
      buyer.submitAuthorizedPayment({ challenge, paymentSignatureHeader }),
      rejectsCode(code),
    );
    assert.equal(observed.length, 1);
    assert.equal(observed[0].options.redirect, 'manual');
    assert.equal(observed[0].options.headers['PAYMENT-SIGNATURE'], paymentSignatureHeader);
  }
});

test('ambiguity is monotonic and cannot be cleared by a later rejection or conflicting payment', async () => {
  const resourceUrl = 'https://service.example/credits/zenon-fund';
  const paymentRequired = staticChallenge(resourceUrl);
  const paymentRequiredHeader = encodeB64Json(paymentRequired);
  const challenge = { status: 'PAYMENT_REQUIRED', resourceUrl, paymentRequiredHeader, paymentRequired };
  const paymentSignatureHeader = encodeB64Json(await signedPayload(paymentRequired, 3));
  const responses = [
    fakeResponse(resourceUrl, 503, 'Service Unavailable'),
    fakeResponse(resourceUrl, 409, 'Conflict'),
    fakeResponse(resourceUrl, 202, 'BOUND'),
  ];
  const sent = [];
  const buyer = client(resourceUrl, async (url, options) => {
    sent.push(options.headers['PAYMENT-SIGNATURE']);
    return responses.shift();
  });
  await assert.rejects(
    buyer.submitAuthorizedPayment({ challenge, paymentSignatureHeader }),
    rejectsCode(CODES.outcomeUnknown),
  );
  await assert.rejects(
    buyer.submitAuthorizedPayment({ challenge, paymentSignatureHeader }),
    rejectsCode(CODES.outcomeUnknown),
  );
  const conflicting = encodeB64Json(await signedPayload(paymentRequired, 33));
  await assert.rejects(
    buyer.submitAuthorizedPayment({ challenge, paymentSignatureHeader: conflicting }),
    rejectsCode(CODES.paymentConflict),
  );
  assert.equal((await buyer.submitAuthorizedPayment({ challenge, paymentSignatureHeader })).status, 'BOUND');
  assert.deepEqual(sent, [paymentSignatureHeader, paymentSignatureHeader, paymentSignatureHeader]);
});

test('pinned URL, retained challenge, requirement, resource, and payment intent cannot cross-bind', async () => {
  const resourceUrl = 'https://service.example/credits/zenon-fund';
  const otherUrl = 'https://service.example/credits/other-fund';
  const paymentRequired = staticChallenge(resourceUrl);
  const paymentRequiredHeader = encodeB64Json(paymentRequired);
  const challenge = { status: 'PAYMENT_REQUIRED', resourceUrl, paymentRequiredHeader, paymentRequired };
  const payment = await signedPayload(paymentRequired, 6);
  const paymentSignatureHeader = encodeB64Json(payment);
  let calls = 0;
  const buyer = client(resourceUrl, async () => {
    calls += 1;
    return fakeResponse(resourceUrl, 202, 'BOUND');
  });

  const otherRequired = staticChallenge(otherUrl);
  const otherChallenge = {
    status: 'PAYMENT_REQUIRED',
    resourceUrl: otherUrl,
    paymentRequiredHeader: encodeB64Json(otherRequired),
    paymentRequired: otherRequired,
  };
  await assert.rejects(
    buyer.submitAuthorizedPayment({ challenge: otherChallenge, paymentSignatureHeader }),
    rejectsCode(CODES.invalidInput),
  );

  const mismatchedChallenge = {
    status: 'PAYMENT_REQUIRED',
    resourceUrl,
    paymentRequiredHeader,
    paymentRequired: otherRequired,
  };
  await assert.rejects(
    buyer.submitAuthorizedPayment({ challenge: mismatchedChallenge, paymentSignatureHeader }),
    rejectsCode(CODES.invalidInput),
  );

  const changedPayment = structuredClone(payment);
  changedPayment.resource.url = otherUrl;
  await assert.rejects(
    buyer.submitAuthorizedPayment({
      challenge,
      paymentSignatureHeader: encodeB64Json(changedPayment),
    }),
    rejectsCode(CODES.invalidInput),
  );
  assert.equal(calls, 0);
});

test('inputs are snapshotted before asynchronous preflight and concurrent submission is rejected', async () => {
  const resourceUrl = 'https://service.example/credits/zenon-fund';
  const paymentRequired = staticChallenge(resourceUrl);
  const paymentRequiredHeader = encodeB64Json(paymentRequired);
  const challenge = { status: 'PAYMENT_REQUIRED', resourceUrl, paymentRequiredHeader, paymentRequired };
  const paymentSignatureHeader = encodeB64Json(await signedPayload(paymentRequired, 4));
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const sent = [];
  const buyer = client(resourceUrl, async (url, options) => {
    await gate;
    sent.push(options.headers['PAYMENT-SIGNATURE']);
    return fakeResponse(resourceUrl, 202, 'BOUND');
  });
  const mutable = { challenge, paymentSignatureHeader };
  const first = buyer.submitAuthorizedPayment(mutable);
  mutable.paymentSignatureHeader = 'changed';
  mutable.challenge = null;
  await assert.rejects(
    buyer.submitAuthorizedPayment({ challenge, paymentSignatureHeader }),
    rejectsCode(CODES.operationInFlight),
  );
  release();
  assert.equal((await first).status, 'BOUND');
  assert.deepEqual(sent, [paymentSignatureHeader]);
});

test('deadline, truncation, and malformed post-submission responses are outcome unknown and value-free', async () => {
  const resourceUrl = 'https://service.example/credits/zenon-fund';
  const paymentRequired = staticChallenge(resourceUrl);
  const challenge = {
    status: 'PAYMENT_REQUIRED',
    resourceUrl,
    paymentRequiredHeader: encodeB64Json(paymentRequired),
    paymentRequired,
  };
  const paymentSignatureHeader = encodeB64Json(await signedPayload(paymentRequired, 5));
  let observedSignal;
  const pending = client(resourceUrl, async (url, options) => {
    observedSignal = options.signal;
    return new Promise(() => {});
  }, 10);
  await assert.rejects(
    pending.submitAuthorizedPayment({ challenge, paymentSignatureHeader }),
    error => {
      assert.equal(errorCode(error), CODES.outcomeUnknown);
      assert.equal(String(error), `ZenonFundingPostV1ClientError: ${CODES.outcomeUnknown}`);
      assert.deepEqual(Reflect.ownKeys(error).sort(), ['code', 'message', 'name', 'stack'].sort());
      return true;
    },
  );
  assert.equal(observedSignal.aborted, true);

  const truncated = fakeResponse(resourceUrl, 202, 'BOUND');
  truncated.headers.set('Content-Length', '6');
  const buyer = client(resourceUrl, async () => truncated);
  await assert.rejects(
    buyer.submitAuthorizedPayment({ challenge, paymentSignatureHeader }),
    rejectsCode(CODES.outcomeUnknown),
  );

  const spoofed = client(resourceUrl, async () => {
    const error = new ZenonFundingPostV1ClientError(CODES.paymentRejected);
    error.transportDetail = 'SYNTHETIC_PRIVATE_DETAIL';
    throw error;
  });
  await assert.rejects(
    spoofed.submitAuthorizedPayment({ challenge, paymentSignatureHeader }),
    error => {
      assert.equal(errorCode(error), CODES.outcomeUnknown);
      assert.equal(Object.hasOwn(error, 'transportDetail'), false);
      assert.equal(String(error).includes('SYNTHETIC_PRIVATE_DETAIL'), false);
      return true;
    },
  );
});

test('early streaming rejection stays busy until response cancellation actually completes', async () => {
  const resourceUrl = 'https://service.example/credits/zenon-fund';
  const paymentRequired = staticChallenge(resourceUrl);
  const paymentRequiredHeader = encodeB64Json(paymentRequired);
  let releaseCancellation;
  let cancellationStarted;
  const started = new Promise(resolve => { cancellationStarted = resolve; });
  const cancellationGate = new Promise(resolve => { releaseCancellation = resolve; });
  let cancellationCalls = 0;
  let cancellationCompleted = false;
  const stream = new ReadableStream({
    cancel() {
      cancellationCalls += 1;
      cancellationStarted();
      return cancellationGate.then(() => { cancellationCompleted = true; });
    },
  });
  const headers = new Headers({
    'Cache-Control': 'private, no-store, max-age=0',
    'Content-Type': 'text/plain; charset=utf-8',
    Vary: 'PAYMENT-SIGNATURE',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': '0',
  });
  const responses = [
    Object.freeze({ status: 500, url: resourceUrl, redirected: false, headers, body: stream }),
    fakeResponse(resourceUrl, 402, 'Payment Required', {
      'PAYMENT-REQUIRED': paymentRequiredHeader,
    }),
  ];
  let calls = 0;
  const buyer = client(resourceUrl, async () => {
    calls += 1;
    return responses.shift();
  }, 20);
  const first = buyer.requestChallenge();
  await started;
  await assert.rejects(first, rejectsCode(CODES.challengeUnavailable));
  assert.equal(cancellationCalls, 1);
  assert.equal(cancellationCompleted, false);
  assert.throws(() => buyer.requestChallenge(), rejectsCode(CODES.operationInFlight));
  assert.equal(calls, 1);
  releaseCancellation();
  await cancellationGate;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancellationCompleted, true);
  const retained = await buyer.requestChallenge();
  assert.equal(retained.status, 'PAYMENT_REQUIRED');
  assert.equal(calls, 2);
});

test('challenge response is exact, bounded, pinned, canonical, and cannot carry a redirect', async () => {
  const resourceUrl = 'https://service.example/credits/zenon-fund';
  const paymentRequired = staticChallenge(resourceUrl);
  const paymentRequiredHeader = encodeB64Json(paymentRequired);
  const buyer = client(resourceUrl, async () => fakeResponse(
    resourceUrl,
    402,
    'Payment Required',
    { 'PAYMENT-REQUIRED': paymentRequiredHeader },
  ));
  const retained = await buyer.requestChallenge();
  assert.equal(retained.paymentRequiredHeader, paymentRequiredHeader);
  assert.deepEqual(retained.paymentRequired, decodeB64Json(paymentRequiredHeader));
  assert.equal(Object.isFrozen(retained.paymentRequired), true);

  const redirected = client(resourceUrl, async () => fakeResponse(
    resourceUrl,
    302,
    'Redirect',
    {},
    { redirected: true },
  ));
  await assert.rejects(redirected.requestChallenge(), rejectsCode(CODES.challengeUnavailable));
});

test('static boundary is test-imported only and has no active mount or authority acquisition', () => {
  const packageText = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  assert.equal(packageText.includes('service-credit-zenon-funding-post-v1-client.js'), false);
  assert.doesNotMatch(SOURCE, /listen\s*\(|createServer|WebSocket|node:fs|node:https/);
  assert.doesNotMatch(SOURCE, /prepareBlock|\.send\s*\(|createServer|\.listen\s*\(/);
  assert.doesNotMatch(SOURCE, /NODE_TLS_REJECT_UNAUTHORIZED|rejectUnauthorized/);
  assert.match(SOURCE, /const DEFAULT_FETCH = globalThis\.fetch;/);
  assert.match(SOURCE, /preflightZenonPayment/);
  assert.match(SOURCE, /redirect: 'manual'/);
  assert.match(SOURCE, /credentials: 'omit'/);
  assert.match(SOURCE, /cache: 'no-store'/);
});
