import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash, generateKeyPairSync, X509Certificate } from 'node:crypto';
import {
  accessSync, chmodSync, constants as fsConstants, lstatSync, mkdtempSync,
  readFileSync, readdirSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { createServer as createNetServer } from 'node:net';
import { connect as connectTls } from 'node:tls';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodeTest from 'node:test';
import * as sdk from 'znn-typescript-sdk';

import { canonicalJson, paymentIntentDigest } from '../src/canonical.js';
import { deriveServiceCreditResourceBinding } from '../src/service-credit-activation.js';
import { deriveServiceCreditCapabilityCommitment } from '../src/service-credit-capability.js';
import {
  createServiceCreditZenonFundingIntakeHttpsOwnerV1,
} from '../src/service-credit-zenon-funding-intake-https-owner-v1.js';
import {
  createZenonFundingIntakeSqliteStore,
  deriveZenonFundingIntakeSelectionKey,
} from '../src/service-credit-zenon-funding-intake-sqlite-store.js';
import {
  parseZenonFundingProviderAttestationAuthorityRecord,
} from '../src/service-credit-zenon-funding-provider-attestation.js';
import { SERVICE_CREDIT_MODEL_VERSION } from '../src/service-credit-model.js';
import { ServiceCreditSqliteStore } from '../src/service-credit-sqlite-store.js';
import { decodeB64Json } from '../src/x402-wire.js';

const SOURCE_URL = new URL('../src/service-credit-zenon-funding-intake-https-owner-v1.js', import.meta.url);
const SOURCE = readFileSync(SOURCE_URL, 'utf8');
const NOW = 2_000_000_000_000;
const ORIGIN = 'https://127.0.0.1';
const TARGET = '/credits/zenon-fund';
const RESOURCE_URL = `${ORIGIN}${TARGET}`;
const LEDGER_DOMAIN = 'service-credit-zenon-funding-https-owner-v1-test-v1';
const OPENSSL = '/usr/bin/openssl';
const PREFIX = 'SERVICE_CREDIT_ZENON_FUNDING_INTAKE_HTTPS_OWNER_V1_';

function fixedTestFailure(codeValue) {
  const error = new Error(codeValue);
  error.stack = `Error: ${codeValue}`;
  return error;
}

function test(name, run) {
  return nodeTest(name, async t => {
    try { await run(t); }
    catch { throw fixedTestFailure('SERVICE_CREDIT_ZENON_FUNDING_INTAKE_HTTPS_OWNER_V1_TEST_FAILED'); }
  });
}

function assertValueFreeSame(actual, expected) {
  let same = false;
  try { same = canonicalJson(actual) === canonicalJson(expected); } catch {}
  assert.equal(
    same,
    true,
    'SERVICE_CREDIT_ZENON_FUNDING_INTAKE_HTTPS_OWNER_V1_TEST_VALUE_MISMATCH',
  );
}

function fixedError(codeValue) {
  const error = new Error(codeValue);
  error.stack = `Error: ${codeValue}`;
  return error;
}

function errorCode(error) {
  try { return Object.getOwnPropertyDescriptor(error, 'code')?.value; }
  catch { return undefined; }
}

function codeIs(expected) { return error => errorCode(error) === expected; }

function checksum(label) {
  return `sha256:${createHash('sha256').update(`funding-https-owner:${label}`).digest('hex')}`;
}

function keyAddress(byte) {
  const key = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, byte));
  try { return key.getAddress().toString(); } finally { key.clear(); }
}

const CHAIN_PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: '7',
  genesisMomentumHash: createHash('sha256').update('funding-https-owner-genesis').digest('hex'),
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
  providerAuthorityId: 'provider.funding.https.owner',
  generationId: 'provider.funding.https.owner.generation',
  generationVersion: 1,
  keyId: 'provider.funding.https.owner.key',
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
    hash: createHash('sha256').update('funding-https-owner-bootstrap').digest('hex'),
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
    offerId: 'offer.funding.https.owner',
    offerVersion: 1,
    holderId: keyAddress(17),
    capabilityCommitment: deriveServiceCreditCapabilityCommitment({ publicKey: CAPABILITY_PUBLIC_KEY }),
  };
}

function offer() {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    providerId: 'provider.funding.https.owner',
    serviceId: 'service.funding.https.owner',
    resourceId: 'resource.funding.https.owner',
    resourceBinding: deriveServiceCreditResourceBinding({
      resourceId: 'resource.funding.https.owner', resourceUrl: RESOURCE_URL,
    }),
    offerId: 'offer.funding.https.owner',
    offerVersion: 1,
    costPolicyId: 'cost.fixed',
    fundingPolicyId: 'funding.exact.https.owner',
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

function privateDirectory(t, prefix) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function storeFixture(t, { afterCommit } = {}) {
  const directory = privateDirectory(t, 'funding-https-owner-v1-');
  const serviceStore = ServiceCreditSqliteStore.create({
    databasePath: join(directory, 'service.sqlite'), allowedRoot: directory,
    deriveCost: () => 2, now: () => NOW,
  });
  serviceStore.registerOffer(offer());
  const intakeStore = createZenonFundingIntakeSqliteStore({
    databasePath: join(directory, 'intake.sqlite'), allowedRoot: directory,
    ledgerDomain: LEDGER_DOMAIN, maxChallenges: 4,
    ...(afterCommit === undefined ? {} : { testHooks: { afterCommit } }),
  });
  const selectionKey = deriveZenonFundingIntakeSelectionKey({
    ledgerDomain: LEDGER_DOMAIN, selection: selection(),
  });
  t.after(() => { try { intakeStore.close(); } catch {}; try { serviceStore.close(); } catch {} });
  return Object.freeze({
    directory, intakeStore, serviceStore,
    load: () => intakeStore.loadBySelectionKey(selectionKey),
  });
}

function tlsMaterial(t) {
  const binary = lstatSync(OPENSSL);
  assert.equal(binary.isFile() && binary.uid === 0 && (binary.mode & 0o022) === 0, true);
  accessSync(OPENSSL, fsConstants.X_OK);
  const directory = privateDirectory(t, 'funding-https-owner-tls-');
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
  t.after(() => { key.fill(0); cert.fill(0); });
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

function configuration({ stores, tls, port, deadlines = deadlineRuntime() }) {
  return Object.freeze({
    transport: Object.freeze({
      origin: ORIGIN,
      bind: Object.freeze({ host: '127.0.0.1', port, exclusive: true }),
      tlsMaterial: Object.freeze({ key: tls.key, cert: tls.cert }),
      generation: Object.freeze({ generationId: 'funding.https.owner.test', generationVersion: 1 }),
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
      selection: Object.freeze(selection()), resourceUrl: RESOURCE_URL,
    }),
  });
}

function httpsExchange(port, cert, options = {}) {
  const {
    path = TARGET, method = 'POST', body = Buffer.alloc(0), headers = {},
    trusted = true, servername, alpn = ['http/1.1'], maxVersion,
  } = options;
  return new Promise((resolve, reject) => {
    const chunks = [];
    const request = httpsRequest({
      hostname: '127.0.0.1', port, path, method, agent: false,
      ...(trusted ? { ca: cert } : {}), rejectUnauthorized: true,
      ...(servername === undefined ? {} : { servername }), ALPNProtocols: alpn,
      ...(maxVersion === undefined ? {} : { maxVersion }),
      headers: {
        Host: '127.0.0.1', 'Content-Length': String(body.length),
        Connection: 'close', ...headers,
      },
    }, response => {
      response.on('data', chunk => chunks.push(chunk));
      response.once('error', reject);
      response.once('end', () => resolve(Object.freeze({
        statusCode: response.statusCode, headers: response.headers, body: Buffer.concat(chunks),
      })));
    });
    request.setTimeout(5_000, () => request.destroy(fixedError('SYNTHETIC_TIMEOUT')));
    request.once('error', reject);
    request.end(body);
  });
}

function rawTlsExchange(port, cert, requestText, options = {}) {
  return new Promise(resolve => {
    const chunks = [];
    const socket = connectTls({
      host: '127.0.0.1', port, ca: cert, rejectUnauthorized: true,
      ALPNProtocols: options.alpn ?? ['http/1.1'], servername: '',
      ...(options.maxVersion === undefined ? {} : { maxVersion: options.maxVersion }),
    });
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    };
    socket.on('data', chunk => chunks.push(chunk));
    socket.once('error', finish);
    socket.once('close', finish);
    socket.once('secureConnect', () => socket.end(requestText));
    socket.setTimeout(5_000, () => socket.destroy());
  });
}

function rawTlsWriteUntilServerClose(port, cert, requestText, captureSocket) {
  return new Promise(resolve => {
    const socket = connectTls({
      host: '127.0.0.1', port, ca: cert, rejectUnauthorized: true,
      ALPNProtocols: ['http/1.1'], servername: '',
    });
    captureSocket(socket);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    socket.once('error', finish);
    socket.once('close', finish);
    socket.once('secureConnect', () => socket.write(requestText));
    socket.setTimeout(5_000, () => socket.destroy());
  });
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
        hash: sdk.Hash.digest(Buffer.from(`funding-https-owner-momentum-${variation}`)), height: 1,
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
      x402Version: 2, resource: structuredClone(paymentRequired.resource),
      accepted: structuredClone(accepted),
      payload: { transaction: signed.toJson(), intentDigest },
    };
  } finally {
    payer.clear(); payee.clear();
    zenon.ledger = originalLedger; zenon.embedded = originalEmbedded;
    sdk.Zenon.setChainID(originalChainId);
  }
}

function paymentHeader(payment) { return Buffer.from(JSON.stringify(payment), 'utf8').toString('base64'); }
function challenge(response) {
  return decodeB64Json(response.headers['payment-required'], { maxEncodedBytes: 8192 });
}

async function startRealOwner(t, options = {}) {
  const stores = storeFixture(t, options);
  const tls = tlsMaterial(t);
  const port = await reserveLoopbackPort();
  const deadlines = deadlineRuntime();
  const owner = createServiceCreditZenonFundingIntakeHttpsOwnerV1(configuration({ stores, tls, port, deadlines }));
  t.after(async () => { try { await owner.close(); } catch {} });
  assert.deepEqual(await owner.start(), { status: 'LISTENING' });
  return { stores, tls, port, deadlines, owner };
}

function controlled() {
  let resolve;
  let reject;
  const promise = new Promise((accept, refuse) => { resolve = accept; reject = refuse; });
  Object.defineProperty(promise, 'constructor', {
    value: undefined, enumerable: false, writable: false, configurable: false,
  });
  Promise.prototype.then.call(promise, () => {}, () => {});
  return Object.freeze({ promise: Object.freeze(promise), resolve, reject });
}

function initiallyUnhandled() {
  let resolve;
  let reject;
  const promise = new Promise((accept, refuse) => { resolve = accept; reject = refuse; });
  Object.defineProperty(promise, 'constructor', {
    value: undefined, enumerable: false, writable: false, configurable: false,
  });
  return Object.freeze({ promise: Object.freeze(promise), resolve, reject });
}

function settled(value, rejected = false) {
  const capability = controlled();
  if (rejected) capability.reject(value); else capability.resolve(value);
  return capability.promise;
}

let moduleSequence = 0;
async function loadWithDependencies(factories) {
  const key = `__funding_https_owner_v1_${moduleSequence += 1}`;
  Object.defineProperty(globalThis, key, { value: factories, configurable: true });
  const url = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
  const ingress = `export const createServiceCreditBoundedHttpsIngressOwner = globalThis[${JSON.stringify(key)}].ingress;`;
  const native = `export const createServiceCreditBoundedNodeHttpsServerFactory = globalThis[${JSON.stringify(key)}].native;`;
  const adapter = `export const createZenonFundingIntakeHttpPostV1Adapter = globalThis[${JSON.stringify(key)}].adapter;`;
  const nativeSpecifier = "'./service-credit-bounded-node-https-server-" + "factory.js'";
  const adapterSpecifier = "'./service-credit-zenon-funding-intake-http-" + "post-v1.js'";
  const transformed = SOURCE
    .replace("'./service-credit-bounded-https-ingress-owner.js'", JSON.stringify(url(ingress)))
    .replace(nativeSpecifier, JSON.stringify(url(native)))
    .replace(adapterSpecifier, JSON.stringify(url(adapter)));
  try { return await import(`${url(transformed)}#${moduleSequence}`); }
  finally { delete globalThis[key]; }
}

function fakeConfiguration() {
  const noop = Object.freeze(() => undefined);
  return Object.freeze({
    transport: Object.freeze({
      origin: 'https://service.example',
      bind: Object.freeze({ host: '127.0.0.1', port: 41001, exclusive: true }),
      tlsMaterial: Object.freeze({ key: Buffer.from([1]), cert: Buffer.from([2]) }),
      generation: Object.freeze({ generationId: 'fake.owner', generationVersion: 1 }),
      limits: Object.freeze({
        maxHeaderBytes: 16384, maxHeaderCount: 128,
        maxConcurrentSockets: 8, maxConnectionStarts: 128,
        maxConcurrentRequests: 8, maxRequestStarts: 96,
        tlsHandshakeDeadlineMs: 2000, headerDeadlineMs: 2000,
        requestResponseDeadlineMs: 4000, idleSocketDeadlineMs: 5000,
        startDeadlineMs: 3000, closeGraceMs: 6000, metricsCounterLimit: 10000,
      }),
      deadlineRuntime: Object.freeze({ schedule: noop, cancel: noop }),
    }),
    funding: Object.freeze({
      store: Object.freeze({ ledgerDomain: 'fake' }), serviceCreditStore: Object.freeze({}),
      authorityRecord: '{}', deriveFundingTerms: noop, now: noop, observerRoot: '/synthetic',
      observerCatchUp: Object.freeze({ maximumPageEntries: 4, maximumBackfillSpan: 8, maximumMembersPerMomentum: 4 }),
      selection: Object.freeze({
        offerId: 'offer.fake', offerVersion: 1, holderId: 'holder.fake',
        capabilityCommitment: `sha256:${'0'.repeat(64)}`,
      }),
      resourceUrl: 'https://service.example/credits/fund',
    }),
  });
}

async function bridgeHarness(options = {}) {
  const log = [];
  const handleCapabilities = [];
  const adapterCloseCapability = controlled();
  const ingressCloseCapability = controlled();
  let downstream;
  let recoverCalls = 0;
  let handleCalls = 0;
  let adapterCloseCalls = 0;
  let nativeFactoryCalls = 0;
  let ingressFactoryCalls = 0;
  let ingressStartCalls = 0;
  let requestSuccess = 0;
  let requestFailure = 0;
  let closeSuccess = 0;
  let closeFailure = 0;
  const adapter = Object.freeze(() => Object.freeze({
    recover: Object.freeze(() => {
      recoverCalls += 1; log.push('recover');
      if (options.recoverThrows) throw fixedError('private recovery failure');
      return Object.hasOwn(options, 'recoverValue')
        ? options.recoverValue
        : Object.freeze({ status: 'RECOVERED' });
    }),
    handle: Object.freeze(() => {
      handleCalls += 1; log.push('handle');
      const supplied = Object.hasOwn(options, 'handleValue');
      const capability = supplied ? options.handleValue : controlled();
      if (options.installDriftDuringHandle) options.installDriftDuringHandle();
      handleCapabilities.push(capability);
      return supplied ? capability : capability.promise;
    }),
    close: Object.freeze(() => {
      adapterCloseCalls += 1; log.push('adapter-close');
      if (options.installDriftDuringAdapterClose) options.installDriftDuringAdapterClose();
      return Object.hasOwn(options, 'adapterCloseValue')
        ? options.adapterCloseValue
        : adapterCloseCapability.promise;
    }),
  }));
  const native = Object.freeze(() => {
    nativeFactoryCalls += 1;
    return Object.freeze(() => undefined);
  });
  const ingress = Object.freeze(optionsValue => {
    ingressFactoryCalls += 1;
    downstream = optionsValue.downstream;
    const start = Object.freeze(() => {
      ingressStartCalls += 1;
      log.push('ingress-start');
      if (options.installDriftDuringStart) options.installDriftDuringStart();
      return Object.hasOwn(options, 'startValue')
        ? options.startValue
        : settled(Object.freeze({ status: 'LISTENING' }));
    });
    const close = Object.freeze(() => {
      log.push('ingress-close');
      const completion = Object.freeze({
        success: Object.freeze(() => {
          closeSuccess += 1;
          ingressCloseCapability.resolve(Object.freeze({ status: 'CLOSED' }));
        }),
        failure: Object.freeze(() => { closeFailure += 1; ingressCloseCapability.reject(fixedError('private close failure')); }),
      });
      assert.equal(downstream.close(completion), undefined);
      if (options.installDriftDuringIngressClose) options.installDriftDuringIngressClose();
      return Object.hasOwn(options, 'ingressCloseValue')
        ? options.ingressCloseValue
        : ingressCloseCapability.promise;
    });
    return Object.freeze({ start, close, snapshotMetrics: Object.freeze(() => Object.freeze({})) });
  });
  const module = await loadWithDependencies({ adapter, native, ingress });
  const owner = module.createServiceCreditZenonFundingIntakeHttpsOwnerV1(fakeConfiguration());
  return {
    owner, log, adapterCloseCapability, handleCapabilities,
    get downstream() { return downstream; },
    get recoverCalls() { return recoverCalls; }, get handleCalls() { return handleCalls; },
    get adapterCloseCalls() { return adapterCloseCalls; },
    get nativeFactoryCalls() { return nativeFactoryCalls; },
    get ingressFactoryCalls() { return ingressFactoryCalls; },
    get ingressStartCalls() { return ingressStartCalls; },
    get requestSuccess() { return requestSuccess; }, get requestFailure() { return requestFailure; },
    get closeSuccess() { return closeSuccess; }, get closeFailure() { return closeFailure; },
    admit(completionOverride) {
      const completion = completionOverride ?? Object.freeze({
        success: Object.freeze(() => { requestSuccess += 1; }),
        failure: Object.freeze(() => { requestFailure += 1; }),
      });
      return downstream.handle(Object.freeze({}), Object.freeze({}), Object.freeze({}), completion);
    },
  };
}

async function tick() { await new Promise(resolve => setImmediate(resolve)); }

async function bounded(operation, milliseconds = 5_000) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(fixedTestFailure('SERVICE_CREDIT_ZENON_FUNDING_INTAKE_HTTPS_OWNER_V1_TEST_DEADLINE')),
      milliseconds,
    );
  });
  try { return await Promise.race([operation, deadline]); }
  finally { clearTimeout(timer); }
}

async function waitForLoopbackRelease(port) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const released = await new Promise(resolve => {
      const server = createNetServer();
      server.once('error', () => resolve(false));
      server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
        server.close(() => resolve(true));
      });
    });
    if (released) return true;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return false;
}

test('construction is inert, exact, frozen, default-off, and close preserves borrowed stores', async t => {
  const stores = storeFixture(t);
  const tls = tlsMaterial(t);
  const port = await reserveLoopbackPort();
  const deadlines = deadlineRuntime();
  const config = configuration({ stores, tls, port, deadlines });
  const owner = createServiceCreditZenonFundingIntakeHttpsOwnerV1(config);
  assert.deepEqual(Reflect.ownKeys(owner), ['start', 'close']);
  assert.equal(Object.isFrozen(owner), true);
  assert.equal(Object.isFrozen(owner.start), true);
  assert.equal(Object.isFrozen(owner.close), true);
  assert.equal(stores.load(), null);
  const first = owner.close();
  assert.equal(owner.close(), first);
  assert.deepEqual(await first, { status: 'CLOSED' });
  assert.equal(stores.load(), null);
  assert.equal(stores.serviceStore.load().state.offers.length, 1);
  assert.equal(deadlines.empty(), true);
  assert.throws(
    () => createServiceCreditZenonFundingIntakeHttpsOwnerV1(Object.freeze({ ...config, active: true })),
    codeIs(`${PREFIX}INVALID_CONFIGURATION`),
  );
  assert.throws(
    () => createServiceCreditZenonFundingIntakeHttpsOwnerV1(new Proxy(config, {})),
    codeIs(`${PREFIX}INVALID_CONFIGURATION`),
  );
  let coercions = 0;
  const hostileResource = Object.freeze({
    [Symbol.toPrimitive]: Object.freeze(() => { coercions += 1; return RESOURCE_URL; }),
    toString: Object.freeze(() => { coercions += 1; return RESOURCE_URL; }),
  });
  assert.throws(
    () => createServiceCreditZenonFundingIntakeHttpsOwnerV1(Object.freeze({
      transport: config.transport,
      funding: Object.freeze({ ...config.funding, resourceUrl: hostileResource }),
    })),
    codeIs(`${PREFIX}INVALID_CONFIGURATION`),
  );
  assert.equal(coercions, 0);

  const maximumTarget = `/${'a'.repeat(2047)}`;
  assert.equal(maximumTarget.length, 2048);
  const maximumOwner = createServiceCreditZenonFundingIntakeHttpsOwnerV1(Object.freeze({
    transport: config.transport,
    funding: Object.freeze({ ...config.funding, resourceUrl: `${ORIGIN}${maximumTarget}` }),
  }));
  assert.deepEqual(await maximumOwner.close(), { status: 'CLOSED' });
  for (const rejected of [
    Object.freeze({
      transport: config.transport,
      funding: Object.freeze({ ...config.funding, resourceUrl: ORIGIN }),
    }),
    Object.freeze({
      transport: config.transport,
      funding: Object.freeze({ ...config.funding, resourceUrl: `${ORIGIN}/a/../b` }),
    }),
    Object.freeze({
      transport: config.transport,
      funding: Object.freeze({ ...config.funding, resourceUrl: `${ORIGIN}${maximumTarget}a` }),
    }),
    Object.freeze({
      transport: Object.freeze({ ...config.transport, origin: 'https://localhost' }),
      funding: config.funding,
    }),
  ]) {
    assert.throws(
      () => createServiceCreditZenonFundingIntakeHttpsOwnerV1(rejected),
      codeIs(`${PREFIX}INVALID_CONFIGURATION`),
    );
  }
});

test('recovery failure happens before listen and cannot be reported as clean close', async t => {
  const stores = storeFixture(t);
  const tls = tlsMaterial(t);
  const port = await reserveLoopbackPort();
  const deadlines = deadlineRuntime();
  const owner = createServiceCreditZenonFundingIntakeHttpsOwnerV1(configuration({ stores, tls, port, deadlines }));
  stores.intakeStore.close();
  await assert.rejects(owner.start(), codeIs(`${PREFIX}RECOVERY_REQUIRED`));
  await assert.rejects(owner.close(), codeIs(`${PREFIX}CLOSE_UNCERTAIN`));
  const proof = createNetServer();
  await new Promise((resolve, reject) => {
    proof.once('error', reject);
    proof.listen({ host: '127.0.0.1', port, exclusive: true }, resolve);
  });
  await new Promise(resolve => proof.close(resolve));
  assert.equal(stores.serviceStore.load().state.offers.length, 1);
  assert.equal(deadlines.empty(), true);
});

test('recovery and asynchronous lifecycle contracts are exact before admission or clean close', async () => {
  let thenReads = 0;
  const thenable = Object.freeze(Object.defineProperty({}, 'then', {
    enumerable: true,
    get() { thenReads += 1; throw fixedError('private then getter'); },
  }));
  let proxyTraps = 0;
  const proxy = new Proxy(Object.freeze({ status: 'RECOVERED' }), {
    get() { proxyTraps += 1; throw fixedError('private proxy get'); },
    getOwnPropertyDescriptor() {
      proxyTraps += 1;
      throw fixedError('private proxy descriptor');
    },
    getPrototypeOf() { proxyTraps += 1; throw fixedError('private proxy prototype'); },
    ownKeys() { proxyTraps += 1; throw fixedError('private proxy keys'); },
  });
  const invalidRecoveryValues = [
    undefined,
    null,
    { status: 'RECOVERED' },
    Object.freeze({ status: 'WRONG' }),
    Object.freeze({ status: 'RECOVERED', extra: true }),
    settled(Object.freeze({ status: 'RECOVERED' })),
    thenable,
    proxy,
  ];
  for (const recoverValue of invalidRecoveryValues) {
    const h = await bridgeHarness({ recoverValue });
    await assert.rejects(h.owner.start(), codeIs(`${PREFIX}RECOVERY_REQUIRED`));
    assert.equal(h.recoverCalls, 1);
    assert.equal(h.nativeFactoryCalls, 0);
    assert.equal(h.ingressFactoryCalls, 0);
    assert.equal(h.ingressStartCalls, 0);
    assert.equal(h.adapterCloseCalls, 1);
    h.adapterCloseCapability.resolve(undefined);
    await assert.rejects(h.owner.close(), codeIs(`${PREFIX}CLOSE_UNCERTAIN`));
  }
  assert.equal(thenReads, 0);
  assert.equal(proxyTraps, 0);

  {
    const h = await bridgeHarness({
      startValue: settled(Object.freeze({ status: 'WRONG' })),
    });
    await assert.rejects(h.owner.start(), codeIs(`${PREFIX}START_UNAVAILABLE`));
    assert.equal(h.nativeFactoryCalls, 1);
    assert.equal(h.ingressFactoryCalls, 1);
    assert.equal(h.ingressStartCalls, 1);
    h.adapterCloseCapability.resolve(undefined);
    await assert.rejects(h.owner.close(), codeIs(`${PREFIX}CLOSE_UNCERTAIN`));
  }

  {
    const h = await bridgeHarness({ handleValue: settled('not-undefined') });
    assert.deepEqual(await h.owner.start(), { status: 'LISTENING' });
    assert.equal(h.admit(), undefined);
    await tick();
    assert.equal(h.requestSuccess, 0);
    assert.equal(h.requestFailure, 1);
    const closing = h.owner.close();
    h.adapterCloseCapability.resolve(undefined);
    await assert.rejects(closing, codeIs(`${PREFIX}CLOSE_UNCERTAIN`));
  }

  {
    const h = await bridgeHarness({ adapterCloseValue: settled('not-undefined') });
    assert.deepEqual(await h.owner.start(), { status: 'LISTENING' });
    await assert.rejects(h.owner.close(), codeIs(`${PREFIX}CLOSE_UNCERTAIN`));
    assert.equal(h.closeSuccess, 0);
    assert.equal(h.closeFailure, 1);
  }

  {
    const h = await bridgeHarness({
      ingressCloseValue: settled(Object.freeze({ status: 'WRONG' })),
    });
    assert.deepEqual(await h.owner.start(), { status: 'LISTENING' });
    const closing = h.owner.close();
    h.adapterCloseCapability.resolve(undefined);
    await assert.rejects(closing, codeIs(`${PREFIX}CLOSE_UNCERTAIN`));
  }
});

test('real loopback TLS serves persisted 402 only for canonical POST framing and trust', async t => {
  const pathOwner = await startRealOwner(t);
  const wrongPath = await httpsExchange(pathOwner.port, pathOwner.tls.cert, { path: '/other' });
  assert.notEqual(wrongPath.statusCode, 402);
  assert.equal(pathOwner.stores.load(), null);
  assert.deepEqual(await pathOwner.owner.close(), { status: 'CLOSED' });

  const methodOwner = await startRealOwner(t);
  const wrongMethod = await httpsExchange(methodOwner.port, methodOwner.tls.cert, { method: 'GET' });
  assert.notEqual(wrongMethod.statusCode, 402);
  assert.equal(methodOwner.stores.load(), null);
  assert.deepEqual(await methodOwner.owner.close(), { status: 'CLOSED' });

  const framingOwner = await startRealOwner(t);
  const framed = await httpsExchange(framingOwner.port, framingOwner.tls.cert, {
    body: Buffer.from('x'), headers: { 'Content-Type': 'application/octet-stream' },
  });
  assert.equal(framed.statusCode, 400);
  assert.equal(framingOwner.stores.load(), null);
  assert.deepEqual(await framingOwner.owner.close(), { status: 'CLOSED' });

  const legacyOwner = await startRealOwner(t);
  const legacy = await rawTlsExchange(
    legacyOwner.port, legacyOwner.tls.cert,
    `POST ${TARGET} HTTP/1.0\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\n\r\n`,
  );
  assert.equal(legacy.includes(Buffer.from('Payment Required')), false);
  assert.equal(legacyOwner.stores.load(), null);
  assert.deepEqual(await legacyOwner.owner.close(), { status: 'CLOSED' });

  const started = await startRealOwner(t);
  const response = await httpsExchange(started.port, started.tls.cert);
  assert.equal(response.statusCode, 402);
  assert.equal(response.body.toString('utf8'), 'Payment Required');
  assert.equal(response.headers['cache-control'], 'private, no-store, max-age=0');
  assert.equal(response.headers['content-type'], 'text/plain; charset=utf-8');
  assert.equal(response.headers.vary, 'PAYMENT-SIGNATURE');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['content-length'], String(response.body.length));
  assert.equal(typeof response.headers['payment-required'], 'string');
  assert.equal(Object.hasOwn(response.headers, 'payment-response'), false);
  assert.equal(started.stores.load().status, 'ISSUED');
  assert.deepEqual(await started.owner.close(), { status: 'CLOSED' });
  assert.equal(started.deadlines.empty(), true);

  const untrusted = await startRealOwner(t);
  await assert.rejects(httpsExchange(untrusted.port, untrusted.tls.cert, { trusted: false }));
  assert.equal(untrusted.stores.load(), null);
  assert.deepEqual(await untrusted.owner.close(), { status: 'CLOSED' });

  const wrongSni = await startRealOwner(t);
  await assert.rejects(httpsExchange(wrongSni.port, wrongSni.tls.cert, { servername: 'wrong.invalid' }));
  assert.equal(wrongSni.stores.load(), null);
  assert.deepEqual(await wrongSni.owner.close(), { status: 'CLOSED' });

  const wrongHost = await startRealOwner(t);
  const wrongHostResponse = await httpsExchange(wrongHost.port, wrongHost.tls.cert, {
    headers: { Host: 'wrong.invalid' }, servername: '',
  });
  assert.notEqual(wrongHostResponse.statusCode, 402);
  assert.equal(wrongHost.stores.load(), null);
  assert.deepEqual(await wrongHost.owner.close(), { status: 'CLOSED' });

  const h2Only = await startRealOwner(t);
  const h2Bytes = await rawTlsExchange(
    h2Only.port,
    h2Only.tls.cert,
    `POST ${TARGET} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\n\r\n`,
    { alpn: ['h2'] },
  );
  assert.equal(h2Bytes.includes(Buffer.from('Payment Required')), false);
  assert.equal(h2Only.stores.load(), null);
  assert.deepEqual(await h2Only.owner.close(), { status: 'CLOSED' });

  const tls12Only = await startRealOwner(t);
  const tls12Bytes = await rawTlsExchange(
    tls12Only.port,
    tls12Only.tls.cert,
    `POST ${TARGET} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\n\r\n`,
    { maxVersion: 'TLSv1.2' },
  );
  assert.equal(tls12Bytes.includes(Buffer.from('Payment Required')), false);
  assert.equal(tls12Only.stores.load(), null);
  assert.deepEqual(await tls12Only.owner.close(), { status: 'CLOSED' });

  const duplicateHeader = await startRealOwner(t);
  const duplicateBytes = await rawTlsExchange(
    duplicateHeader.port,
    duplicateHeader.tls.cert,
    `POST ${TARGET} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\n`
      + 'PAYMENT-SIGNATURE: e30=\r\nPAYMENT-SIGNATURE: e30=\r\n\r\n',
  );
  assert.equal(duplicateBytes.includes(Buffer.from('Payment Required')), false);
  assert.equal(duplicateHeader.stores.load(), null);
  assert.deepEqual(await duplicateHeader.owner.close(), { status: 'CLOSED' });
});

test('real loopback TLS commits BOUND before 202 and converges replay without replacement', async t => {
  const started = await startRealOwner(t);
  const required = challenge(await httpsExchange(started.port, started.tls.cert));
  const paymentA = await signedPayload(required, 1);
  const paymentB = await signedPayload(required, 2);
  const accepted = await httpsExchange(started.port, started.tls.cert, {
    headers: { 'PAYMENT-SIGNATURE': paymentHeader(paymentA) },
  });
  assert.equal(accepted.statusCode, 202);
  assert.equal(accepted.body.toString('utf8'), 'BOUND');
  assert.equal(accepted.headers['cache-control'], 'private, no-store, max-age=0');
  assert.equal(accepted.headers['content-type'], 'text/plain; charset=utf-8');
  assert.equal(accepted.headers.vary, 'PAYMENT-SIGNATURE');
  assert.equal(accepted.headers['x-content-type-options'], 'nosniff');
  assert.equal(accepted.headers['content-length'], String(accepted.body.length));
  assert.equal(Object.hasOwn(accepted.headers, 'payment-required'), false);
  assert.equal(Object.hasOwn(accepted.headers, 'payment-response'), false);
  assert.equal(started.stores.load().status, 'BOUND');
  const saved = structuredClone(started.stores.load());
  const replay = await httpsExchange(started.port, started.tls.cert, {
    headers: { 'PAYMENT-SIGNATURE': paymentHeader(paymentA) },
  });
  const conflict = await httpsExchange(started.port, started.tls.cert, {
    headers: { 'PAYMENT-SIGNATURE': paymentHeader(paymentB) },
  });
  assert.equal(replay.statusCode, 202);
  assert.equal(conflict.statusCode, 409);
  assertValueFreeSame(started.stores.load(), saved);
  assert.equal(started.stores.intakeStore.loadBound().length, 1);

  const diagnosticDirectory = privateDirectory(t, 'funding-https-owner-privacy-diagnostic-');
  const diagnosticPath = join(diagnosticDirectory, 'intentional-failure.mjs');
  const retainedPayloadMarker = paymentHeader(paymentA);
  const privateStoreMarker = started.stores.directory;
  writeFileSync(
    diagnosticPath,
    `import assert from 'node:assert/strict';\n`
      + `import test from 'node:test';\n`
      + `const retained = ${JSON.stringify(retainedPayloadMarker)};\n`
      + `const location = ${JSON.stringify(privateStoreMarker)};\n`
      + `function fixed() { const error = new Error('SANITIZED_TEST_FAILURE'); error.stack = 'Error: SANITIZED_TEST_FAILURE'; return error; }\n`
      + `test('intentional sanitized failure', async () => { try { assert.equal(JSON.stringify({ retained, location }) === JSON.stringify({ retained: 'different', location: 'different' }), true, 'VALUE_MISMATCH'); } catch { throw fixed(); } });\n`,
    { encoding: 'utf8', mode: 0o600, flag: 'wx' },
  );
  const diagnostic = childProcess.spawnSync(
    process.execPath,
    ['--test', diagnosticPath],
    { env: {}, encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024 },
  );
  rmSync(diagnosticPath, { force: true });
  const diagnosticOutput = `${diagnostic.stdout ?? ''}${diagnostic.stderr ?? ''}`;
  assert.notEqual(diagnostic.status, 0);
  assert.equal(diagnosticOutput.includes(retainedPayloadMarker), false);
  assert.equal(diagnosticOutput.includes(privateStoreMarker), false);
  assert.equal(diagnosticOutput.includes('SANITIZED_TEST_FAILURE'), true);

  assert.deepEqual(await started.owner.close(), { status: 'CLOSED' });
  assert.equal(started.stores.serviceStore.load().state.grants.length, 0);
});

test('disconnect during pending bind drains uncertain and restart replays the one durable BOUND', async t => {
  let armed = false;
  let clientSocket = null;
  let firstOwner = null;
  let firstClose = null;
  let afterCommitCalls = 0;
  const stores = storeFixture(t, {
    afterCommit() {
      if (!armed) return;
      afterCommitCalls += 1;
      armed = false;
      clientSocket.destroy();
      firstClose = firstOwner.close();
    },
  });
  const tls = tlsMaterial(t);
  const firstPort = await reserveLoopbackPort();
  const firstDeadlines = deadlineRuntime();
  firstOwner = createServiceCreditZenonFundingIntakeHttpsOwnerV1(configuration({
    stores, tls, port: firstPort, deadlines: firstDeadlines,
  }));
  t.after(async () => { try { await firstOwner.close(); } catch {} });
  assert.deepEqual(await firstOwner.start(), { status: 'LISTENING' });

  const required = challenge(await httpsExchange(firstPort, tls.cert));
  const payment = await signedPayload(required, 3);
  const header = paymentHeader(payment);
  armed = true;
  await rawTlsWriteUntilServerClose(
    firstPort,
    tls.cert,
    `POST ${TARGET} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\n`
      + `PAYMENT-SIGNATURE: ${header}\r\nConnection: close\r\n\r\n`,
    socket => { clientSocket = socket; },
  );
  assert.equal(afterCommitCalls, 1);
  assert.notEqual(firstClose, null);
  await assert.rejects(firstClose, codeIs(`${PREFIX}CLOSE_UNCERTAIN`));
  assert.equal(stores.load().status, 'BOUND');
  assert.equal(stores.intakeStore.loadBound().length, 1);
  assert.equal(
    readdirSync(stores.directory).filter(name => name.startsWith('funding-observer-')).length,
    1,
  );
  assert.equal(firstDeadlines.empty(), true);

  const secondPort = await reserveLoopbackPort();
  const secondDeadlines = deadlineRuntime();
  const secondOwner = createServiceCreditZenonFundingIntakeHttpsOwnerV1(configuration({
    stores, tls, port: secondPort, deadlines: secondDeadlines,
  }));
  t.after(async () => { try { await secondOwner.close(); } catch {} });
  assert.deepEqual(await secondOwner.start(), { status: 'LISTENING' });
  const replay = await httpsExchange(secondPort, tls.cert, {
    headers: { 'PAYMENT-SIGNATURE': header },
  });
  assert.equal(replay.statusCode, 202);
  assert.equal(replay.body.toString('utf8'), 'BOUND');
  assert.equal(stores.load().status, 'BOUND');
  assert.equal(stores.intakeStore.loadBound().length, 1);
  assert.equal(
    readdirSync(stores.directory).filter(name => name.startsWith('funding-observer-')).length,
    1,
  );
  assert.deepEqual(await secondOwner.close(), { status: 'CLOSED' });
  assert.equal(secondDeadlines.empty(), true);
});

test('callback bridge returns undefined exactly once and clean close waits for durable drain', async () => {
  const h = await bridgeHarness();
  assert.deepEqual(await h.owner.start(), { status: 'LISTENING' });
  assert.equal(h.recoverCalls, 1);
  assert.equal(h.admit(), undefined);
  assert.equal(h.handleCalls, 1);
  const closing = h.owner.close();
  assert.equal(h.owner.close(), closing);
  assert.equal(h.adapterCloseCalls, 1);
  let settled = false;
  closing.then(() => { settled = true; }, () => { settled = true; });
  await tick();
  assert.equal(settled, false);
  h.handleCapabilities[0].resolve(undefined);
  await tick();
  assert.equal(h.requestSuccess, 1);
  assert.equal(h.requestFailure, 0);
  assert.equal(settled, false);
  h.adapterCloseCapability.resolve(undefined);
  assert.deepEqual(await closing, { status: 'CLOSED' });
  assert.equal(h.closeSuccess, 1);
  assert.equal(h.closeFailure, 0);
  h.handleCapabilities[0].reject(fixedError('late'));
  assert.equal(h.requestSuccess, 1);
  assert.deepEqual(h.log, ['recover', 'ingress-start', 'handle', 'ingress-close', 'adapter-close']);
});

test('missing or rejected durable close proof never releases a clean close', async () => {
  {
    const h = await bridgeHarness();
    await h.owner.start();
    const closing = h.owner.close();
    let settled = false;
    closing.then(() => { settled = true; }, () => { settled = true; });
    await tick();
    assert.equal(settled, false);
    h.adapterCloseCapability.resolve(undefined);
    await closing;
  }
  {
    const h = await bridgeHarness();
    await h.owner.start();
    const closing = h.owner.close();
    h.adapterCloseCapability.reject(fixedError('private close failure'));
    await assert.rejects(closing, codeIs(`${PREFIX}CLOSE_UNCERTAIN`));
    assert.equal(h.closeSuccess, 0);
    assert.equal(h.closeFailure, 1);
  }
});

test('close during an inconsistent bind suppresses success and becomes uncertain', async () => {
  const h = await bridgeHarness();
  await h.owner.start();
  assert.equal(h.admit(), undefined);
  const closing = h.owner.close();
  h.adapterCloseCapability.resolve(undefined);
  let closeSettled = false;
  Promise.prototype.then.call(closing, () => { closeSettled = true; }, () => { closeSettled = true; });
  await tick();
  assert.equal(closeSettled, false);
  assert.equal(h.requestSuccess, 0);
  assert.equal(h.requestFailure, 0);
  h.handleCapabilities[0].resolve(undefined);
  await assert.rejects(closing, codeIs(`${PREFIX}CLOSE_UNCERTAIN`));
  await tick();
  assert.equal(h.requestSuccess, 0);
  assert.equal(h.requestFailure, 1);
});

test('hostile callbacks, thenables, proxies, and accessors are never assimilated', async () => {
  let thenReads = 0;
  const hostile = {};
  Object.defineProperty(hostile, 'then', {
    get() { thenReads += 1; throw fixedError('private then'); },
  });
  const h = await bridgeHarness({ handleValue: hostile });
  await h.owner.start();
  assert.equal(h.admit(), undefined);
  assert.equal(thenReads, 0);
  assert.equal(h.requestFailure, 1);
  const invalidCompletion = {};
  let completionReads = 0;
  Object.defineProperty(invalidCompletion, 'success', {
    enumerable: true, get() { completionReads += 1; throw fixedError('private accessor'); },
  });
  Object.defineProperty(invalidCompletion, 'failure', {
    enumerable: true, value: Object.freeze(() => undefined),
  });
  assert.equal(h.admit(invalidCompletion), undefined);
  assert.equal(completionReads, 0);
  const closing = h.owner.close();
  h.adapterCloseCapability.resolve(undefined);
  await assert.rejects(closing, codeIs(`${PREFIX}CLOSE_UNCERTAIN`));

  let resultProxyTraps = 0;
  const proxiedResult = new Proxy({}, {
    get() { resultProxyTraps += 1; throw fixedError('private proxy get'); },
    getOwnPropertyDescriptor() {
      resultProxyTraps += 1;
      throw fixedError('private proxy descriptor');
    },
    getPrototypeOf() { resultProxyTraps += 1; throw fixedError('private proxy prototype'); },
    ownKeys() { resultProxyTraps += 1; throw fixedError('private proxy keys'); },
  });
  const proxyResultHarness = await bridgeHarness({ handleValue: proxiedResult });
  await proxyResultHarness.owner.start();
  assert.equal(proxyResultHarness.admit(), undefined);
  assert.equal(resultProxyTraps, 0);
  assert.equal(proxyResultHarness.requestFailure, 1);
  const proxyResultClose = proxyResultHarness.owner.close();
  proxyResultHarness.adapterCloseCapability.resolve(undefined);
  await assert.rejects(proxyResultClose, codeIs(`${PREFIX}CLOSE_UNCERTAIN`));

  let completionProxyTraps = 0;
  const proxiedCompletion = new Proxy({}, {
    get() { completionProxyTraps += 1; throw fixedError('private completion get'); },
    getOwnPropertyDescriptor() {
      completionProxyTraps += 1;
      throw fixedError('private completion descriptor');
    },
    getPrototypeOf() {
      completionProxyTraps += 1;
      throw fixedError('private completion prototype');
    },
    ownKeys() { completionProxyTraps += 1; throw fixedError('private completion keys'); },
  });
  const proxyCompletionHarness = await bridgeHarness();
  await proxyCompletionHarness.owner.start();
  assert.equal(proxyCompletionHarness.admit(proxiedCompletion), undefined);
  assert.equal(completionProxyTraps, 0);
  assert.equal(proxyCompletionHarness.handleCalls, 0);
  const proxyCompletionClose = proxyCompletionHarness.owner.close();
  proxyCompletionHarness.adapterCloseCapability.resolve(undefined);
  await assert.rejects(proxyCompletionClose, codeIs(`${PREFIX}CLOSE_UNCERTAIN`));

  const throwingHarness = await bridgeHarness();
  await throwingHarness.owner.start();
  let throwingSuccessCalls = 0;
  let throwingFailureCalls = 0;
  const throwingCompletion = Object.freeze({
    success: Object.freeze(() => {
      throwingSuccessCalls += 1;
      throw fixedError('private callback failure');
    }),
    failure: Object.freeze(() => { throwingFailureCalls += 1; }),
  });
  assert.equal(throwingHarness.admit(throwingCompletion), undefined);
  throwingHarness.handleCapabilities[0].resolve(undefined);
  await tick();
  assert.equal(throwingSuccessCalls, 1);
  assert.equal(throwingFailureCalls, 0);
  const throwingClose = throwingHarness.owner.close();
  throwingHarness.adapterCloseCapability.resolve(undefined);
  await assert.rejects(throwingClose, codeIs(`${PREFIX}CLOSE_UNCERTAIN`));

  const reentrantHarness = await bridgeHarness();
  await reentrantHarness.owner.start();
  let reentrantSuccessCalls = 0;
  let reentrantFailureCalls = 0;
  let reentrantClose = null;
  const reentrantCompletion = Object.freeze({
    success: Object.freeze(() => {
      reentrantSuccessCalls += 1;
      reentrantClose = reentrantHarness.owner.close();
    }),
    failure: Object.freeze(() => { reentrantFailureCalls += 1; }),
  });
  assert.equal(reentrantHarness.admit(reentrantCompletion), undefined);
  reentrantHarness.handleCapabilities[0].resolve(undefined);
  await tick();
  assert.equal(reentrantSuccessCalls, 1);
  assert.equal(reentrantFailureCalls, 0);
  assert.notEqual(reentrantClose, null);
  reentrantHarness.adapterCloseCapability.resolve(undefined);
  assert.deepEqual(await reentrantClose, { status: 'CLOSED' });
  assert.equal(reentrantSuccessCalls, 1);
  assert.equal(reentrantFailureCalls, 0);
});

test('Promise and Object prototype drift prevents durable admission with no unhandled rejection', async t => {
  for (const drift of ['then', 'constructor', 'species', 'get', 'set']) {
    {
      const h = await bridgeHarness();
      await h.owner.start();
      const target = drift === 'constructor' ? Promise.prototype
        : drift === 'species' ? Promise : Object.prototype;
      const key = drift === 'species' ? Symbol.species : drift;
      const original = Object.getOwnPropertyDescriptor(target, key);
      let getterReads = 0;
      const unhandled = [];
      const observeUnhandled = value => unhandled.push(value);
      process.on('unhandledRejection', observeUnhandled);
      try {
        Object.defineProperty(target, key, drift === 'constructor' || drift === 'species'
          ? { configurable: true, get() { getterReads += 1; throw fixedError('private getter'); } }
          : { configurable: true, value: Object.freeze(() => undefined) });
        assert.equal(h.admit(), undefined);
      } finally {
        if (original === undefined) delete target[key];
        else Object.defineProperty(target, key, original);
      }
      assert.equal(h.handleCalls, 0);
      assert.equal(getterReads, 0);
      const closing = h.owner.close();
      h.adapterCloseCapability.resolve(undefined);
      await assert.rejects(closing, codeIs(`${PREFIX}CLOSE_UNCERTAIN`));
      await tick();
      process.off('unhandledRejection', observeUnhandled);
      assert.equal(unhandled.length, 0);
    }
  }

  const original = Object.getOwnPropertyDescriptor(Object.prototype, 'then');
  let getterReads = 0;
  let restored = false;
  const barrier = controlled();
  const h = await bridgeHarness({
    installDriftDuringHandle() {
      Object.defineProperty(Object.prototype, 'then', {
        configurable: true,
        get() { getterReads += 1; throw fixedError('private then getter'); },
      });
      setImmediate(() => {
        if (original === undefined) delete Object.prototype.then;
        else Object.defineProperty(Object.prototype, 'then', original);
        restored = true;
        barrier.resolve(undefined);
      });
    },
  });
  await h.owner.start();
  assert.equal(h.admit(), undefined);
  await barrier.promise;
  h.handleCapabilities[0].resolve(undefined);
  await tick();
  assert.equal(restored, true);
  assert.equal(getterReads, 0);
  assert.equal(h.requestSuccess, 0);
  assert.equal(h.requestFailure, 1);
  const closing = h.owner.close();
  h.adapterCloseCapability.resolve(undefined);
  await assert.rejects(closing, codeIs(`${PREFIX}CLOSE_UNCERTAIN`));

  for (const seam of ['start', 'handle', 'close']) {
    const returnedCapability = initiallyUnhandled();
    const originalThen = Object.getOwnPropertyDescriptor(Object.prototype, 'then');
    const unhandled = [];
    let getterReads = 0;
    let installed = false;
    const observeUnhandled = value => { unhandled.push(value); };
    const installDrift = () => {
      installed = true;
      Object.defineProperty(Object.prototype, 'then', {
        configurable: true,
        get() { getterReads += 1; throw fixedError('private then getter'); },
      });
    };
    const restore = () => {
      if (!installed) return;
      if (originalThen === undefined) delete Object.prototype.then;
      else Object.defineProperty(Object.prototype, 'then', originalThen);
      installed = false;
    };
    process.on('unhandledRejection', observeUnhandled);
    try {
      if (seam === 'start') {
        const startHarness = await bridgeHarness({
          startValue: returnedCapability.promise,
          installDriftDuringStart: installDrift,
        });
        const starting = startHarness.owner.start();
        restore();
        returnedCapability.reject(fixedError('private delayed start rejection'));
        await assert.rejects(bounded(starting), codeIs(`${PREFIX}START_UNAVAILABLE`));
        const cleanup = startHarness.owner.close();
        startHarness.adapterCloseCapability.resolve(undefined);
        await assert.rejects(bounded(cleanup), codeIs(`${PREFIX}CLOSE_UNCERTAIN`));
        assert.equal(startHarness.log.includes('ingress-close'), true);
      } else if (seam === 'handle') {
        const handleHarness = await bridgeHarness({
          handleValue: returnedCapability.promise,
          installDriftDuringHandle: installDrift,
        });
        await handleHarness.owner.start();
        assert.equal(handleHarness.admit(), undefined);
        restore();
        const cleanup = handleHarness.owner.close();
        handleHarness.adapterCloseCapability.resolve(undefined);
        let closeSettled = false;
        Promise.prototype.then.call(cleanup, () => { closeSettled = true; }, () => { closeSettled = true; });
        await tick();
        assert.equal(closeSettled, false);
        returnedCapability.reject(fixedError('private delayed handle rejection'));
        await assert.rejects(bounded(cleanup), codeIs(`${PREFIX}CLOSE_UNCERTAIN`));
        assert.equal(handleHarness.requestSuccess, 0);
        assert.equal(handleHarness.requestFailure, 1);
      } else {
        const closeHarness = await bridgeHarness({
          adapterCloseValue: returnedCapability.promise,
          installDriftDuringAdapterClose: installDrift,
        });
        await closeHarness.owner.start();
        const cleanup = closeHarness.owner.close();
        restore();
        returnedCapability.reject(fixedError('private delayed close rejection'));
        await assert.rejects(bounded(cleanup), codeIs(`${PREFIX}CLOSE_UNCERTAIN`));
        assert.equal(closeHarness.adapterCloseCalls, 1);
      }
      await tick();
      await tick();
      assert.equal(getterReads, 0);
      assert.equal(unhandled.length, 0);
    } finally {
      restore();
      returnedCapability.reject(fixedError('private delayed dependency rejection'));
      await tick();
      await tick();
      process.off('unhandledRejection', observeUnhandled);
    }
  }

  {
    const live = await startRealOwner(t);
    const originalThen = Object.getOwnPropertyDescriptor(Object.prototype, 'then');
    let getterReads = 0;
    let installed = false;
    try {
      Object.defineProperty(Object.prototype, 'then', {
        configurable: true,
        get() { getterReads += 1; throw fixedError('private then getter'); },
      });
      installed = true;
      const stableClose = live.owner.close();
      if (originalThen === undefined) delete Object.prototype.then;
      else Object.defineProperty(Object.prototype, 'then', originalThen);
      installed = false;
      await assert.rejects(bounded(stableClose), codeIs(`${PREFIX}CLOSE_UNCERTAIN`));
      assert.equal(live.owner.close(), stableClose);
      await assert.rejects(bounded(live.owner.close()), codeIs(`${PREFIX}CLOSE_UNCERTAIN`));
      assert.equal(await bounded(waitForLoopbackRelease(live.port)), true);
      assert.equal(live.deadlines.empty(), true);
      assert.equal(getterReads, 0);
    } finally {
      if (installed) {
        if (originalThen === undefined) delete Object.prototype.then;
        else Object.defineProperty(Object.prototype, 'then', originalThen);
      }
    }
  }
});

test('static boundary is unmounted and contains no publication, READY, wallet, RPC, or DP authority', () => {
  assert.equal(SOURCE.includes('publication'), false);
  assert.equal(SOURCE.includes('activateCommittedReady'), false);
  assert.equal(SOURCE.includes('createServiceCreditGrant'), false);
  assert.equal(SOURCE.includes('wallet'), false);
  assert.equal(SOURCE.includes('WebSocket'), false);
  assert.equal(SOURCE.includes('dynamic-plasma'), false);
  assert.equal(SOURCE.includes('console.'), false);
  const boundedIngressSpecifier = './service-credit-bounded-https-ingress-' + 'owner.js';
  const boundedFactorySpecifier = './service-credit-bounded-node-https-server-' + 'factory.js';
  const postAdapterSpecifier = './service-credit-zenon-funding-intake-http-' + 'post-v1.js';
  assert.deepEqual(
    [...SOURCE.matchAll(/from ['"]([^'"]+)['"];?/g)].map(match => match[1]),
    [
      'node:util',
      boundedIngressSpecifier,
      boundedFactorySpecifier,
      postAdapterSpecifier,
    ],
  );
});
