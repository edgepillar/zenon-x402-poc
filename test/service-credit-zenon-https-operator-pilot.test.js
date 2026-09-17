import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {
  createHash,
  generateKeyPairSync,
  sign,
  X509Certificate,
} from 'node:crypto';
import {
  accessSync,
  chmodSync,
  constants as fsConstants,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { connect as connectNet, createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createServiceCreditZenonHttpsOperatorPilot,
} from '../src/service-credit-zenon-https-operator-pilot.js';
import {
  createZenonFundingEvidenceActivation,
} from '../src/service-credit-zenon-funding-evidence.js';
import {
  createZenonFundingObserverState,
  ZENON_FUNDING_OBSERVER_STATUS,
} from '../src/service-credit-zenon-funding-observer-state.js';
import {
  createZenonFundingObserverSqliteStore,
  openZenonFundingObserverSqliteStore,
} from '../src/service-credit-zenon-funding-observer-sqlite-store.js';
import {
  createZenonFundingProviderAttestationSigningBytes,
  parseZenonFundingProviderAttestationAuthorityRecord,
} from '../src/service-credit-zenon-funding-provider-attestation.js';
import {
  createServiceCreditCapabilitySigningBytes,
  deriveServiceCreditCapabilityCommitment,
} from '../src/service-credit-capability.js';
import {
  SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_VERSION,
  createServiceCreditExternalHolderGrantDescriptorSigningBytes,
} from '../src/service-credit-external-holder-grant-descriptor-handoff.js';
import {
  SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_BYTES,
  SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_PAIRS,
} from '../src/service-credit-external-holder-grant-descriptor-handoff-http.js';
import {
  SERVICE_CREDIT_HTTP_PATH,
  SERVICE_CREDIT_HTTP_ROUTE_ID,
} from '../src/service-credit-http.js';
import { SERVICE_CREDIT_MODEL_VERSION } from '../src/service-credit-model.js';
import { ServiceCreditSqliteStore } from '../src/service-credit-sqlite-store.js';
import { decodeB64Json, HEADERS } from '../src/x402-wire.js';

const NOW = 2_100_000_000_000;
const ATTESTATION_NOW = 2_100_000_000;
const INITIAL_HEIGHT = 20;
const ORIGIN = 'https://127.0.0.1';
const HANDOFF_CHALLENGE_TARGET = '/pilot/grant-descriptor/challenge';
const HANDOFF_REDEMPTION_TARGET = '/pilot/grant-descriptor/redeem';
const RESOURCE_URL = `${ORIGIN}${SERVICE_CREDIT_HTTP_PATH}`;
const OPENSSL = '/usr/bin/openssl';
const EMPTY_BODY_DIGEST = `sha256:${createHash('sha256').update(Buffer.alloc(0)).digest('hex')}`;
const RESOURCE_DIGEST_DOMAIN = 'zenon-x402-service-credit-payment-resource-v1';
const REQUIREMENT_DIGEST_DOMAIN = 'zenon-x402-service-credit-payment-requirement-v1';
const RESOURCE_BINDING_DOMAIN = 'zenon-x402-service-credit-resource-binding-v1';
const TRANSACTION_HASH = createHash('sha256').update('operator-pilot-transaction').digest('hex');
const INITIAL_HASH = createHash('sha256').update('operator-pilot-bootstrap').digest('hex');
const CHAIN_PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: '12345',
  genesisMomentumHash: createHash('sha256').update('operator-pilot-genesis').digest('hex'),
});

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function digest(label) {
  return `sha256:${createHash('sha256').update(`operator-pilot:${label}`).digest('hex')}`;
}

function domainCommitment(domain, value) {
  return `sha256:${createHash('sha256')
    .update(domain)
    .update('\0')
    .update(canonicalJson(value))
    .digest('hex')}`;
}

function keyMaterial() {
  const pair = generateKeyPairSync('ed25519');
  const encoded = pair.publicKey.export({ format: 'der', type: 'spki' });
  return Object.freeze({
    privateKey: pair.privateKey,
    publicKey: encoded.subarray(-32).toString('base64url'),
  });
}

const PROVIDER_KEYS = keyMaterial();
const CAPABILITY_KEYS = keyMaterial();
const AUTHORITY_RECORD = canonicalJson({
  authorityRecordVersion: 1,
  authorityProfileId: 'zenon.provider-attestation',
  authorityProfileVersion: 1,
  verifierVersion: 1,
  providerAuthorityId: 'provider.operator-pilot',
  generationId: 'provider.operator-pilot.generation',
  generationVersion: 1,
  keyId: 'provider.operator-pilot.key',
  algorithm: 'Ed25519',
  publicKey: PROVIDER_KEYS.publicKey,
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
  sourcePolicyCommitment: digest('source-policy'),
  maximumAttestationBytes: 4096,
  maximumCanonicalBytes: 524288,
  maximumInitialAgeSeconds: 300,
  maximumFutureSkewSeconds: 5,
  maximumValiditySeconds: 300,
});
const AUTHORITY = parseZenonFundingProviderAttestationAuthorityRecord(AUTHORITY_RECORD);

function selection() {
  return {
    offerId: 'offer.operator.pilot',
    offerVersion: 1,
    holderId: 'z1syntheticpilot',
    capabilityCommitment: deriveServiceCreditCapabilityCommitment({
      publicKey: CAPABILITY_KEYS.publicKey,
    }),
  };
}

function offer() {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    providerId: 'provider.operator-pilot',
    serviceId: 'service.operator-pilot',
    resourceId: 'resource.operator-pilot',
    resourceBinding: domainCommitment(RESOURCE_BINDING_DOMAIN, {
      resourceId: 'resource.operator-pilot',
      resourceUrl: RESOURCE_URL,
    }),
    offerId: 'offer.operator.pilot',
    offerVersion: 1,
    costPolicyId: 'cost.fixed',
    fundingPolicyId: 'funding.exact.zenon.observer',
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
    },
  };
}

function preliminaryChallenge(store) {
  const activation = createZenonFundingEvidenceActivation({
    store,
    deriveFundingTerms: fundingTerms,
    verifyFundingEvidence: async () => { throw new Error('unused'); },
    authorityProfile: structuredClone(AUTHORITY.authorityProfile),
    now: () => NOW,
  });
  return activation.createFundingResource({ selection: selection(), resourceUrl: RESOURCE_URL });
}

function observerTarget(prepared) {
  const accepted = prepared.paymentRequired.accepts[0];
  const tags = prepared.paymentRequired.resource.tags;
  return {
    transactionId: `zenontx:${TRANSACTION_HASH}`,
    payer: prepared.activationIntent.holderId,
    payee: accepted.payTo,
    asset: accepted.asset,
    amount: accepted.amount,
    scheme: accepted.scheme,
    paymentFlow: accepted.extra.paymentFlow,
    settlement: accepted.extra.settlement,
    network: accepted.network,
    providerId: prepared.activationIntent.providerId,
    serviceId: prepared.activationIntent.serviceId,
    resourceId: prepared.activationIntent.resourceId,
    resourceBinding: offer().resourceBinding,
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
    fundingPolicyId: offer().fundingPolicyId,
    fundingPolicyVersion: offer().fundingPolicyVersion,
    capabilityCommitment: prepared.activationIntent.capabilityCommitment,
    totalUnits: prepared.activationIntent.totalUnits,
    expiresAt: prepared.activationIntent.expiresAt,
    grantFundingCommitment: `sha256:${tags[1]}${tags[2]}`,
  };
}

function observerState(prepared) {
  return createZenonFundingObserverState({
    observerPolicy: structuredClone(AUTHORITY.observerPolicy),
    authorityGeneration: structuredClone(AUTHORITY.authorityGeneration),
    chainProfile: structuredClone(AUTHORITY.chainProfile),
    confirmationPolicy: structuredClone(AUTHORITY.confirmationPolicy),
    target: observerTarget(prepared),
    checkpoint: structuredClone(AUTHORITY.bootstrapCheckpoint),
    catchUp: {
      maximumPageEntries: 4,
      maximumBackfillSpan: 8,
      maximumMembersPerMomentum: 4,
    },
  });
}

function momentumHash(height) {
  return createHash('sha256').update(`operator-pilot-momentum-${height}`).digest('hex');
}

function signedEnvelope(request) {
  const issuedAt = ATTESTATION_NOW;
  const validUntil = issuedAt + 120;
  return {
    envelopeVersion: 1,
    attestationId: request.attestationId,
    keyId: AUTHORITY.keyId,
    issuedAt,
    validUntil,
    signature: sign(
      null,
      createZenonFundingProviderAttestationSigningBytes({ request, issuedAt, validUntil }),
      PROVIDER_KEYS.privateKey,
    ).toString('base64url'),
  };
}

function commitReady(store) {
  const before = store.load().state;
  const frontier = {
    height: INITIAL_HEIGHT + 3,
    hash: momentumHash(INITIAL_HEIGHT + 3),
  };
  const planned = store.planBackfill({ expectedRevision: before.revision, frontier });
  let previousHash = planned.plan.startCheckpoint.hash;
  const momentums = [];
  for (let height = planned.plan.fromHeight; height <= planned.plan.throughHeight; height += 1) {
    const hash = momentumHash(height);
    momentums.push({
      height,
      hash,
      previousHash,
      members: height === INITIAL_HEIGHT + 1
        ? [{
          transactionId: before.target.transactionId,
          targetBindingDigest: before.targetBindingDigest,
        }]
        : [],
    });
    previousHash = hash;
  }
  const advanced = store.applyPage({
    expectedRevision: before.revision,
    plan: planned.plan,
    momentums,
  });
  const receipt = advanced.state.catchUp.lastAppliedPage;
  const observed = store.applyInclusion({
    expectedRevision: advanced.state.revision,
    target: structuredClone(advanced.state.target),
    observation: {
      status: 'FOUND',
      transactionId: advanced.state.target.transactionId,
      targetBindingDigest: advanced.state.targetBindingDigest,
      momentumHeight: receipt.targetMembership.momentumHeight,
      momentumHash: receipt.targetMembership.momentumHash,
      pageDigest: receipt.pageDigest,
    },
  });
  assert.equal(observed.state.status, ZENON_FUNDING_OBSERVER_STATUS.THRESHOLD_OBSERVED);
  const request = store.peekPreparedAttestation();
  store.commitAuthenticatedEnvelope({
    expectedObserverRevision: observed.state.revision,
    expectedOutboxRevision: 1,
    attestationId: request.attestationId,
    envelope: signedEnvelope(request),
    nowEpochSeconds: ATTESTATION_NOW,
  });
  assert.equal(store.load().outbox.status, 'READY');
}

function activationInput(context) {
  return {
    intent: structuredClone(context.prepared.activationIntent),
    paymentRequired: structuredClone(context.prepared.paymentRequired),
  };
}

function privateDirectory(t) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'zenon-operator-pilot-')));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function createStoreContext(t, { hooks } = {}) {
  const directory = privateDirectory(t);
  const serviceConfiguration = {
    databasePath: join(directory, 'service.sqlite'),
    allowedRoot: directory,
    deriveCost: () => 2,
    now: () => NOW,
    ...(hooks === undefined ? {} : { testHooks: hooks }),
  };
  const serviceOpenConfiguration = {
    databasePath: serviceConfiguration.databasePath,
    allowedRoot: directory,
    deriveCost: () => 2,
    now: () => NOW,
  };
  const serviceStore = ServiceCreditSqliteStore.create(serviceConfiguration);
  serviceStore.registerOffer(offer());
  const prepared = preliminaryChallenge(serviceStore);
  const observerConfiguration = {
    databasePath: join(directory, 'observer.sqlite'),
    allowedRoot: directory,
    initialState: observerState(prepared),
    authorityRecord: AUTHORITY_RECORD,
  };
  const observerStore = createZenonFundingObserverSqliteStore(observerConfiguration);
  const context = {
    directory,
    serviceConfiguration,
    serviceOpenConfiguration,
    observerConfiguration,
    observerRecordKey: observerStore.load().recordKey,
    serviceStore,
    observerStore,
    prepared,
  };
  t.after(() => {
    try { context.serviceStore?.close(); } catch {}
    try { context.observerStore?.close(); } catch {}
  });
  return context;
}

function reopenStores(context) {
  context.serviceStore = ServiceCreditSqliteStore.openExisting(
    context.serviceOpenConfiguration,
  );
  context.observerStore = openZenonFundingObserverSqliteStore({
    databasePath: context.observerConfiguration.databasePath,
    allowedRoot: context.directory,
    expectedRecordKey: context.observerRecordKey,
    authorityRecord: AUTHORITY_RECORD,
  });
}

function syntheticTlsMaterial(t) {
  const binary = lstatSync(OPENSSL);
  assert.equal(binary.isFile() && binary.uid === 0 && (binary.mode & 0o022) === 0, true);
  accessSync(OPENSSL, fsConstants.X_OK);
  const directory = privateDirectory(t);
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
    'req', '-x509', '-newkey', 'ec', '-pkeyopt',
    'ec_paramgen_curve:prime256v1', '-sha256', '-nodes', '-days', '1',
    '-keyout', keyPath, '-out', certificatePath,
    '-config', configurationPath, '-extensions', 'v3_req',
  ], {
    env: {},
    encoding: 'utf8',
    timeout: 15_000,
    maxBuffer: 1024 * 1024,
  });
  assert.equal(generated.status, 0, 'SYNTHETIC_TLS_GENERATION_FAILED');
  assert.equal(generated.error, undefined, 'SYNTHETIC_TLS_GENERATION_FAILED');
  const key = readFileSync(keyPath);
  const cert = readFileSync(certificatePath);
  assert.equal(new X509Certificate(cert).checkIP('127.0.0.1'), '127.0.0.1');
  t.after(() => {
    key.fill(0);
    cert.fill(0);
  });
  return Object.freeze({ key, cert });
}

function reserveLoopbackPort() {
  const server = createNetServer();
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      try { server.close(); } catch {}
      reject(new Error('SYNTHETIC_LOOPBACK_RESERVATION_FAILED'));
    };
    server.once('error', fail);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      let address;
      try { address = server.address(); } catch { fail(); return; }
      if (address === null || typeof address !== 'object' || address.port < 1) {
        fail();
        return;
      }
      server.close(error => {
        if (settled) return;
        if (error !== undefined) { fail(); return; }
        settled = true;
        resolve(address.port);
      });
    });
  });
}

function deadlineRuntime() {
  const handles = new Set();
  return Object.freeze({
    runtime: Object.freeze({
      schedule: Object.freeze((callback, milliseconds) => {
        let handle = null;
        handle = setTimeout(() => {
          handles.delete(handle);
          callback();
        }, milliseconds);
        handles.add(handle);
        return handle;
      }),
      cancel: Object.freeze(handle => {
        clearTimeout(handle);
        handles.delete(handle);
        return true;
      }),
    }),
    empty: () => handles.size === 0,
  });
}

function controlledDeadlineRuntime() {
  const entries = new Map();
  const runtime = Object.freeze({
    schedule: Object.freeze((callback, milliseconds) => {
      const handle = Object.freeze({});
      entries.set(handle, Object.freeze({ callback, milliseconds }));
      return handle;
    }),
    cancel: Object.freeze(handle => entries.delete(handle)),
  });
  return Object.freeze({
    runtime,
    fire(milliseconds) {
      let selectedHandle = null;
      let selectedEntry = null;
      for (const [handle, entry] of entries) {
        if (entry.milliseconds !== milliseconds) continue;
        if (selectedHandle !== null) return 0;
        selectedHandle = handle;
        selectedEntry = entry;
      }
      if (selectedHandle === null) return 0;
      entries.delete(selectedHandle);
      selectedEntry.callback();
      return 1;
    },
    empty: () => entries.size === 0,
  });
}

function durableDeadlineRuntime() {
  return Object.freeze({
    monotonicNowNs: Object.freeze(() => 0n),
    schedule: Object.freeze(() => Object.freeze({})),
    cancel: Object.freeze(() => undefined),
  });
}

function pilotConfiguration({
  context,
  tls,
  port,
  execute,
  transportRuntime,
  handoffRuntime,
}) {
  return Object.freeze({
    transport: Object.freeze({
      origin: ORIGIN,
      bind: Object.freeze({ host: '127.0.0.1', port, exclusive: true }),
      tlsMaterial: Object.freeze({ key: tls.key, cert: tls.cert }),
      generation: Object.freeze({
        generationId: 'synthetic.operator.pilot',
        generationVersion: 1,
      }),
      limits: Object.freeze({
        maxHeaderBytes:
          SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_BYTES,
        maxHeaderCount:
          SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_PAIRS * 2,
        maxConcurrentSockets: 8,
        maxConnectionStarts: 128,
        maxConcurrentRequests: 8,
        maxRequestStarts: 96,
        tlsHandshakeDeadlineMs: 2_000,
        headerDeadlineMs: 2_000,
        requestResponseDeadlineMs: 4_000,
        idleSocketDeadlineMs: 5_000,
        startDeadlineMs: 3_000,
        closeGraceMs: 6_000,
        metricsCounterLimit: 10_000,
      }),
      deadlineRuntime: transportRuntime,
    }),
    routes: Object.freeze({
      serviceCredit: SERVICE_CREDIT_HTTP_PATH,
      handoffChallenge: HANDOFF_CHALLENGE_TARGET,
      handoffRedemption: HANDOFF_REDEMPTION_TARGET,
    }),
    funding: Object.freeze({
      serviceCreditStore: context.serviceStore,
      fundingObserverStore: context.observerStore,
      authorityRecord: AUTHORITY_RECORD,
      deriveFundingTerms: Object.freeze(fundingTerms),
      now: Object.freeze(() => NOW),
      selection: Object.freeze(selection()),
      resourceUrl: RESOURCE_URL,
    }),
    durable: Object.freeze({
      execution: Object.freeze({
        ledgerId: 'ledger.operator.pilot',
        policy: Object.freeze({
          policyId: 'execution.operator.pilot',
          policyVersion: 1,
          maxDurationMs: 1_000,
        }),
        capacity: 8,
        selectedDurationMs: 1_000,
      }),
      execute: Object.freeze(execute),
      deadlineRuntime: durableDeadlineRuntime(),
    }),
    handoff: Object.freeze({
      challengeLifetimeMs: 1_000,
      now: Object.freeze(() => NOW),
      deadlineRuntime: handoffRuntime,
      bodyDeadlineMs: 2_000,
      responseDeadlineMs: 2_000,
      closeGraceMs: 3_000,
      metricsCounterLimit: 10_000,
    }),
  });
}

async function createStartedPilot(t, context, execute, {
  transport = deadlineRuntime(),
  handoff = deadlineRuntime(),
} = {}) {
  const tls = syntheticTlsMaterial(t);
  const port = await reserveLoopbackPort();
  const pilot = createServiceCreditZenonHttpsOperatorPilot(pilotConfiguration({
    context,
    tls,
    port,
    execute,
    transportRuntime: transport.runtime,
    handoffRuntime: handoff.runtime,
  }));
  t.after(async () => {
    try { await pilot.close(); } catch {}
    assert.equal(transport.empty(), true);
    assert.equal(handoff.empty(), true);
  });
  assert.deepEqual(await pilot.start(), { status: 'CHALLENGE' });
  return Object.freeze({ pilot, tls, port, transport, handoff });
}

function request(route, {
  path = SERVICE_CREDIT_HTTP_PATH,
  body = Buffer.alloc(0),
  headers = {},
  method = 'POST',
}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;
    let client = null;
    const fail = () => {
      if (settled) return;
      settled = true;
      try { client?.destroy(); } catch {}
      reject(new Error('SYNTHETIC_HTTPS_REQUEST_FAILED'));
    };
    client = httpsRequest({
      hostname: '127.0.0.1',
      port: route.port,
      path,
      method,
      agent: false,
      ca: route.cert,
      rejectUnauthorized: true,
      ALPNProtocols: ['http/1.1'],
      headers: {
        Host: '127.0.0.1',
        'Content-Length': String(body.length),
        Connection: 'close',
        ...headers,
      },
    }, response => {
      response.on('data', chunk => chunks.push(chunk));
      response.once('error', fail);
      response.once('aborted', fail);
      response.once('end', () => {
        if (settled) return;
        settled = true;
        resolve(Object.freeze({
          statusCode: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks),
        }));
      });
    });
    client.setTimeout(5_000, fail);
    client.once('error', fail);
    client.end(body);
  });
}

function parsePublicChallenge(body) {
  const value = JSON.parse(body.toString('utf8'));
  assert.deepEqual(Reflect.ownKeys(value), ['challenge', 'expiresAtMs', 'handoffVersion']);
  assert.equal(
    value.handoffVersion,
    SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_VERSION,
  );
  return value;
}

function redemption(challenge, selected = selection()) {
  return {
    challenge,
    publicKey: CAPABILITY_KEYS.publicKey,
    signature: sign(
      null,
      createServiceCreditExternalHolderGrantDescriptorSigningBytes({
        ...challenge,
        origin: ORIGIN,
        selection: selected,
      }),
      CAPABILITY_KEYS.privateKey,
    ).toString('base64url'),
  };
}

async function obtainGrant(route, selected = selection()) {
  const challengeResponse = await request(route, { path: HANDOFF_CHALLENGE_TARGET });
  assert.equal(challengeResponse.statusCode, 200);
  const challenge = parsePublicChallenge(challengeResponse.body);
  const body = Buffer.from(canonicalJson(redemption(challenge, selected)), 'utf8');
  const response = await request(route, {
    path: HANDOFF_REDEMPTION_TARGET,
    body,
    headers: { 'Content-Type': 'application/json' },
  });
  return Object.freeze({ response, challenge });
}

function requestDescription(grantId, requestId) {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    grantId,
    requestId,
    method: 'POST',
    routeId: SERVICE_CREDIT_HTTP_ROUTE_ID,
    canonicalBodyDigest: EMPTY_BODY_DIGEST,
    selectedContentType: 'application/json',
    maxCostUnits: 2,
  };
}

function authorization(description, grant) {
  const proof = {
    proofVersion: 1,
    grantId: description.grantId,
    requestId: description.requestId,
    publicKey: CAPABILITY_KEYS.publicKey,
    maxCostUnits: description.maxCostUnits,
    signature: sign(
      null,
      createServiceCreditCapabilitySigningBytes(description),
      CAPABILITY_KEYS.privateKey,
    ).toString('base64url'),
  };
  assert.equal(grant.grantId, description.grantId);
  return `ServiceCredit ${Buffer.from(canonicalJson(proof), 'utf8').toString('base64url')}`;
}

function route(started) {
  return Object.freeze({ port: started.port, cert: started.tls.cert });
}

function errorCode(error) {
  try { return Object.getOwnPropertyDescriptor(error, 'code')?.value ?? null; }
  catch { return null; }
}

test('pilot import and construction are inert and expose one exact frozen owner', async t => {
  const context = createStoreContext(t);
  const transport = deadlineRuntime();
  const handoff = deadlineRuntime();
  const configuration = pilotConfiguration({
    context,
    tls: Object.freeze({ key: Buffer.from([1]), cert: Buffer.from([2]) }),
    port: 41_001,
    execute: () => ({ resultCode: 'unused' }),
    transportRuntime: transport.runtime,
    handoffRuntime: handoff.runtime,
  });
  const pilot = createServiceCreditZenonHttpsOperatorPilot(configuration);
  assert.deepEqual(Reflect.ownKeys(pilot), [
    'start', 'activateCommittedReady', 'close', 'snapshot',
  ]);
  assert.equal(Object.isFrozen(pilot), true);
  for (const operation of Object.values(pilot)) assert.equal(Object.isFrozen(operation), true);
  assert.deepEqual(pilot.snapshot(), Object.freeze({
    phase: 'UNAVAILABLE',
    startAttempts: 0,
    activationAttempts: 0,
    closeAttempts: 0,
    handoffAdmissions: 0,
    descriptorReads: 0,
    connectionStarts: 0,
    requestsAdmitted: 0,
    requestsRejected: 0,
    handlerFailures: 0,
    trackedSockets: 0,
    trackedRequests: 0,
    trackedHandlers: 0,
    ownedTimers: 0,
    transportCloseClean: 0,
    transportCloseUncertain: 0,
  }));
  assert.equal(transport.empty(), true);
  assert.equal(handoff.empty(), true);
  assert.equal(context.observerStore.load().outbox.status, 'NONE');
  assert.equal(context.serviceStore.load().state.grants.length, 0);

  assert.throws(
    () => createServiceCreditZenonHttpsOperatorPilot(Object.freeze({
      ...configuration,
      approved: true,
    })),
    error => errorCode(error)
      === 'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_INVALID_CONFIGURATION',
  );
  await pilot.close();
  assert.equal(context.observerStore.load().outbox.status, 'NONE');
  assert.equal(context.serviceStore.load().state.grants.length, 0);
});

test('pilot publishes CHALLENGE after transport and ACTIVE only after exact committed READY', async t => {
  let pilot = null;
  let phaseAtGrantCommit = null;
  const context = createStoreContext(t, {
    hooks: {
      afterCommit({ operation, changed }) {
        if (changed && operation === 'activateGrantFromTrustedRecord') {
          phaseAtGrantCommit = pilot.snapshot().phase;
        }
      },
    },
  });
  let firstExecutions = 0;
  const started = await createStartedPilot(t, context, () => {
    firstExecutions += 1;
    return { resultCode: 'operator.pilot.delivered' };
  });
  pilot = started.pilot;
  assert.equal(pilot.snapshot().phase, 'CHALLENGE');
  const challenge = await request(route(started), {});
  assert.equal(challenge.statusCode, 402);
  assert.deepEqual(
    decodeB64Json(challenge.headers[HEADERS.PAYMENT_REQUIRED]),
    context.prepared.paymentRequired,
  );
  assert.equal((await request(route(started), {
    path: HANDOFF_CHALLENGE_TARGET,
  })).statusCode, 503);

  commitReady(context.observerStore);
  const input = activationInput(context);
  const firstActivation = pilot.activateCommittedReady(input);
  const repeatedActivation = pilot.activateCommittedReady(structuredClone(input));
  assert.equal(repeatedActivation, firstActivation);
  assert.deepEqual(await firstActivation, { status: 'ACTIVE' });
  assert.equal(phaseAtGrantCommit, 'ACTIVATING');
  assert.equal(pilot.snapshot().phase, 'ACTIVE');

  const changed = activationInput(context);
  changed.intent.totalUnits += 1;
  await assert.rejects(
    pilot.activateCommittedReady(changed),
    error => errorCode(error)
      === 'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_ACTIVATION_CONFLICT',
  );
  assert.equal(pilot.snapshot().phase, 'ACTIVE');

  const wrong = selection();
  wrong.holderId = 'z1otherholder';
  const wrongGrant = await obtainGrant(route(started), wrong);
  assert.equal(wrongGrant.response.statusCode, 503);

  const granted = await obtainGrant(route(started));
  assert.equal(granted.response.statusCode, 200);
  const descriptor = JSON.parse(granted.response.body.toString('utf8'));
  assert.deepEqual(Reflect.ownKeys(descriptor), ['capabilityCommitment', 'grantId']);
  assert.equal(descriptor.capabilityCommitment, selection().capabilityCommitment);

  const requestA = requestDescription(descriptor.grantId, 'request.operator.pilot.a');
  const authA = authorization(requestA, descriptor);
  const first = await request(route(started), { headers: { Authorization: authA } });
  assert.equal(first.statusCode, 200);
  assert.equal(firstExecutions, 1);
  const afterFirst = context.serviceStore.load();
  const replay = await request(route(started), { headers: { Authorization: authA } });
  assert.equal(replay.statusCode, 200);
  assert.deepEqual(replay.body, first.body);
  assert.deepEqual(context.serviceStore.load(), afterFirst);
  assert.equal(firstExecutions, 1);

  assert.deepEqual(await pilot.close(), { status: 'CLOSED' });
  assert.equal(pilot.snapshot().phase, 'CLOSED');
  reopenStores(context);

  let reopenedExecutions = 0;
  const reopened = await createStartedPilot(t, context, () => {
    reopenedExecutions += 1;
    return { resultCode: 'operator.pilot.delivered' };
  });
  assert.deepEqual(
    await reopened.pilot.activateCommittedReady(activationInput(context)),
    { status: 'ACTIVE' },
  );
  const reopenedReplay = await request(route(reopened), { headers: { Authorization: authA } });
  assert.equal(reopenedReplay.statusCode, 200);
  assert.deepEqual(reopenedReplay.body, first.body);
  assert.equal(reopenedExecutions, 0);
  assert.equal(context.serviceStore.load().state.grants[0].consumedUnits, 2);

  const requestB = requestDescription(descriptor.grantId, 'request.operator.pilot.b');
  const second = await request(route(reopened), {
    headers: { Authorization: authorization(requestB, descriptor) },
  });
  assert.equal(second.statusCode, 200);
  assert.equal(reopenedExecutions, 1);
  assert.equal(context.serviceStore.load().state.grants[0].consumedUnits, 4);
  assert.deepEqual(await reopened.pilot.close(), { status: 'CLOSED' });
});

test('activation rejects injected authority without publishing ACTIVE', async t => {
  const context = createStoreContext(t);
  const started = await createStartedPilot(t, context, () => ({ resultCode: 'unused' }));
  commitReady(context.observerStore);
  await assert.rejects(
    started.pilot.activateCommittedReady({
      ...activationInput(context),
      approved: true,
      evidence: Object.freeze({ status: 'READY' }),
    }),
    error => errorCode(error)
      === 'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_INVALID_INPUT',
  );
  assert.equal(started.pilot.snapshot().phase, 'CHALLENGE');
  assert.equal(context.serviceStore.load().state.grants.length, 0);
});

test('pre-READY activation failure keeps borrowed stores open and cannot restart', async t => {
  const context = createStoreContext(t);
  const started = await createStartedPilot(t, context, () => ({ resultCode: 'unused' }));
  await assert.rejects(
    started.pilot.activateCommittedReady(activationInput(context)),
    error => errorCode(error)
      === 'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_PRE_ACTIVATION_UNAVAILABLE',
  );
  assert.equal(started.pilot.snapshot().phase, 'PRE_ACTIVATION_UNAVAILABLE');
  assert.equal(context.observerStore.load().outbox.status, 'NONE');
  assert.equal(context.serviceStore.load().state.grants.length, 0);
  assert.deepEqual(await started.pilot.start(), { status: 'CHALLENGE' });
  assert.equal(started.pilot.snapshot().phase, 'PRE_ACTIVATION_UNAVAILABLE');
  await assert.rejects(
    started.pilot.close(),
    error => errorCode(error)
      === 'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_PRE_ACTIVATION_UNAVAILABLE',
  );
  assert.equal(context.observerStore.load().outbox.status, 'NONE');
});

test('committed activation ambiguity preserves RECOVERY_REQUIRED and durable custody', async t => {
  let armed = false;
  const context = createStoreContext(t, {
    hooks: {
      afterCommit({ operation, changed }) {
        if (armed && changed && operation === 'activateGrantFromTrustedRecord') {
          throw new Error('synthetic commit ambiguity');
        }
      },
    },
  });
  const started = await createStartedPilot(t, context, () => ({ resultCode: 'unused' }));
  commitReady(context.observerStore);
  armed = true;
  await assert.rejects(
    started.pilot.activateCommittedReady(activationInput(context)),
    error => errorCode(error)
      === 'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_RECOVERY_REQUIRED',
  );
  assert.equal(started.pilot.snapshot().phase, 'RECOVERY_REQUIRED');
  await assert.rejects(
    started.pilot.close(),
    error => errorCode(error)
      === 'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_RECOVERY_REQUIRED',
  );
  assert.throws(() => context.serviceStore.load());
  assert.throws(() => context.observerStore.load());
});

test('close reentry preserves a later genuine post-commit recovery outcome', async t => {
  let pilot = null;
  let closePromise = null;
  let armed = false;
  let postCommitFailures = 0;
  const context = createStoreContext(t, {
    hooks: {
      afterCommit({ operation, changed }) {
        if (
          armed
          && changed
          && operation === 'activateGrantFromTrustedRecord'
        ) {
          postCommitFailures += 1;
          if (closePromise === null) closePromise = pilot.close();
          throw new Error('synthetic post-commit ambiguity');
        }
      },
    },
  });
  const started = await createStartedPilot(t, context, () => ({ resultCode: 'unused' }));
  pilot = started.pilot;
  commitReady(context.observerStore);
  armed = true;
  await assert.rejects(
    pilot.activateCommittedReady(activationInput(context)),
    error => errorCode(error)
      === 'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_ACTIVATED_UNAVAILABLE',
  );
  assert.notEqual(closePromise, null);
  await assert.rejects(
    closePromise,
    error => errorCode(error)
      === 'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_RECOVERY_REQUIRED',
  );
  assert.equal(postCommitFailures, 1);
  assert.equal(pilot.snapshot().phase, 'RECOVERY_REQUIRED');
  assert.equal(pilot.snapshot().activationAttempts, 1);
  assert.notEqual(pilot.snapshot().phase, 'ACTIVE');

  reopenStores(context);
  const durable = context.serviceStore.load().state;
  assert.equal(durable.grants.length, 1);
  assert.equal(durable.grants[0].consumedUnits, 0);
});

test('transport uncertainty waits for genuine post-commit recovery classification', async t => {
  let pilot = null;
  let closePromise = null;
  let closeObservation = null;
  let phaseAtPostCommit = null;
  let uncertaintyBeforeClassification = null;
  let closeDeadlineFires = 0;
  let postCommitFailures = 0;
  let executionCalls = 0;
  let armed = false;
  const transport = controlledDeadlineRuntime();
  const handoff = deadlineRuntime();
  const context = createStoreContext(t, {
    hooks: {
      afterCommit({ operation, changed }) {
        if (
          armed
          && changed
          && operation === 'activateGrantFromTrustedRecord'
        ) {
          postCommitFailures += 1;
          phaseAtPostCommit = pilot.snapshot().phase;
          if (closePromise === null) {
            closePromise = pilot.close();
            closeObservation = closePromise.then(
              () => Object.freeze({ status: 'FULFILLED', code: null }),
              error => Object.freeze({
                status: 'REJECTED',
                code: errorCode(error),
              }),
            );
            closeDeadlineFires += transport.fire(6_000);
            uncertaintyBeforeClassification =
              pilot.snapshot().transportCloseUncertain;
          }
          throw new Error('synthetic post-commit ambiguity');
        }
      },
    },
  });
  const started = await createStartedPilot(t, context, () => {
    executionCalls += 1;
    return { resultCode: 'unused' };
  }, { transport, handoff });
  pilot = started.pilot;

  let peerConnected = false;
  let peerClosed = false;
  let connectionSettled = false;
  let resolvePeerConnection;
  let resolvePeerClose;
  const peerConnection = new Promise(resolve => { resolvePeerConnection = resolve; });
  const peerClose = new Promise(resolve => { resolvePeerClose = resolve; });
  const peer = connectNet({ host: '127.0.0.1', port: started.port });
  peer.once('connect', () => {
    peerConnected = true;
    connectionSettled = true;
    resolvePeerConnection(true);
  });
  peer.on('error', () => {
    if (connectionSettled) return;
    connectionSettled = true;
    resolvePeerConnection(false);
  });
  peer.once('close', () => {
    peerClosed = true;
    if (!connectionSettled) {
      connectionSettled = true;
      resolvePeerConnection(false);
    }
    resolvePeerClose();
  });
  peer.resume();

  try {
    let connectionDeadline = null;
    const connectedWithinBound = await Promise.race([
      peerConnection,
      new Promise(resolve => {
        connectionDeadline = setTimeout(() => resolve(false), 5_000);
      }),
    ]);
    if (connectionDeadline !== null) clearTimeout(connectionDeadline);
    assert.equal(connectedWithinBound, true);
    assert.equal(peerConnected, true);
    for (
      let attempt = 0;
      attempt < 128 && pilot.snapshot().connectionStarts !== 1;
      attempt += 1
    ) await new Promise(resolve => setImmediate(resolve));
    assert.equal(pilot.snapshot().connectionStarts, 1);

    commitReady(context.observerStore);
    armed = true;
    const activationPromise = pilot.activateCommittedReady(activationInput(context));
    const activationObservation = activationPromise.then(
      () => Object.freeze({ status: 'FULFILLED', code: null }),
      error => Object.freeze({
        status: 'REJECTED',
        code: errorCode(error),
      }),
    );
    const activationOutcome = await activationObservation;
    assert.notEqual(closePromise, null);
    assert.notEqual(closeObservation, null);
    const closeOutcome = await closeObservation;

    assert.deepEqual(activationOutcome, Object.freeze({
      status: 'REJECTED',
      code: 'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_ACTIVATED_UNAVAILABLE',
    }));
    assert.equal(phaseAtPostCommit, 'ACTIVATING');
    assert.equal(closeDeadlineFires, 1);
    assert.equal(uncertaintyBeforeClassification, 1);
    assert.equal(closeOutcome.status, 'REJECTED');
    assert.equal(
      closeOutcome.code,
      'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_RECOVERY_REQUIRED',
      'CLOSE_CLASSIFICATION_WEAKER_THAN_RECOVERY',
    );
    assert.equal(postCommitFailures, 1);
    assert.equal(executionCalls, 0);

    const terminal = pilot.snapshot();
    assert.equal(terminal.phase, 'RECOVERY_REQUIRED');
    assert.equal(terminal.activationAttempts, 1);
    assert.equal(terminal.startAttempts, 1);
    assert.equal(terminal.connectionStarts, 1);
    assert.equal(terminal.transportCloseClean, 0);
    assert.equal(terminal.transportCloseUncertain, 1);
    assert.notEqual(terminal.phase, 'ACTIVE');
    assert.throws(
      () => context.serviceStore.load(),
      error => errorCode(error) === 'SERVICE_CREDIT_STORE_CLOSED',
    );
    assert.equal(typeof context.observerStore.load(), 'object');
    const independentServiceReader = ServiceCreditSqliteStore.openExisting(
      context.serviceOpenConfiguration,
    );
    try {
      const retainedServiceState = independentServiceReader.load().state;
      assert.equal(retainedServiceState.grants.length, 1);
      assert.equal(retainedServiceState.grants[0].consumedUnits, 0);
    } finally {
      independentServiceReader.close();
    }

    if (!peerClosed) peer.destroy();
    let peerCloseDeadline = null;
    const peerCloseObserved = await Promise.race([
      peerClose.then(() => true),
      new Promise(resolve => {
        peerCloseDeadline = setTimeout(() => resolve(false), 5_000);
      }),
    ]);
    if (peerCloseDeadline !== null) clearTimeout(peerCloseDeadline);
    assert.equal(peerCloseObserved, true);
  } finally {
    if (!peerClosed) {
      peer.destroy();
      let cleanupDeadline = null;
      await Promise.race([
        peerClose,
        new Promise(resolve => {
          cleanupDeadline = setTimeout(resolve, 5_000);
        }),
      ]);
      if (cleanupDeadline !== null) clearTimeout(cleanupDeadline);
    }
  }
});

test('terminal activation replay returns recovery without re-entering the durable owner', async t => {
  let armed = false;
  let postCommitFailures = 0;
  const context = createStoreContext(t, {
    hooks: {
      afterCommit({ operation, changed }) {
        if (
          armed
          && changed
          && operation === 'activateGrantFromTrustedRecord'
        ) {
          postCommitFailures += 1;
          throw new Error('synthetic commit ambiguity');
        }
      },
    },
  });
  const started = await createStartedPilot(t, context, () => ({ resultCode: 'unused' }));
  commitReady(context.observerStore);
  const input = activationInput(context);
  armed = true;
  await assert.rejects(
    started.pilot.activateCommittedReady(input),
    error => errorCode(error)
      === 'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_RECOVERY_REQUIRED',
  );
  await assert.rejects(
    started.pilot.close(),
    error => errorCode(error)
      === 'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_RECOVERY_REQUIRED',
  );
  const beforeReplay = started.pilot.snapshot();
  await assert.rejects(
    started.pilot.activateCommittedReady(structuredClone(input)),
    error => errorCode(error)
      === 'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_RECOVERY_REQUIRED',
  );
  await new Promise(resolve => setImmediate(resolve));
  const afterReplay = started.pilot.snapshot();
  assert.equal(postCommitFailures, 1);
  assert.equal(afterReplay.phase, 'RECOVERY_REQUIRED');
  assert.equal(afterReplay.activationAttempts, 1);
  assert.equal(afterReplay.startAttempts, 1);
  assert.equal(afterReplay.connectionStarts, beforeReplay.connectionStarts);
  assert.equal(afterReplay.handoffAdmissions, 0);

  reopenStores(context);
  const durable = context.serviceStore.load().state;
  assert.equal(durable.grants.length, 1);
  assert.equal(durable.grants[0].consumedUnits, 0);
});

test('close reentry during activation never publishes ACTIVE and keeps the stronger outcome', async t => {
  let pilot = null;
  let closePromise = null;
  let armed = false;
  const context = createStoreContext(t, {
    hooks: {
      afterCommit({ operation, changed }) {
        if (
          armed
          && closePromise === null
          && changed
          && operation === 'activateGrantFromTrustedRecord'
        ) closePromise = pilot.close();
      },
    },
  });
  const started = await createStartedPilot(t, context, () => ({ resultCode: 'unused' }));
  pilot = started.pilot;
  commitReady(context.observerStore);
  armed = true;
  await assert.rejects(
    pilot.activateCommittedReady(activationInput(context)),
    error => errorCode(error)
      === 'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_ACTIVATED_UNAVAILABLE',
  );
  assert.notEqual(closePromise, null);
  await assert.rejects(
    closePromise,
    error => errorCode(error)
      === 'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_ACTIVATED_UNAVAILABLE',
  );
  assert.equal(pilot.snapshot().phase, 'ACTIVATED_UNAVAILABLE');
  assert.notEqual(pilot.snapshot().phase, 'ACTIVE');
});

test('close drains an in-flight durable use before the durable owner closes its stores', async t => {
  const context = createStoreContext(t);
  let releaseExecution;
  let executionStarted;
  const began = new Promise(resolve => { executionStarted = resolve; });
  const execution = new Promise(resolve => { releaseExecution = resolve; });
  const started = await createStartedPilot(t, context, () => {
    executionStarted();
    return execution.then(() => ({ resultCode: 'operator.pilot.drained' }));
  });
  commitReady(context.observerStore);
  await started.pilot.activateCommittedReady(activationInput(context));
  const granted = await obtainGrant(route(started));
  const descriptor = JSON.parse(granted.response.body.toString('utf8'));
  const description = requestDescription(descriptor.grantId, 'request.operator.pilot.drain');
  const response = request(route(started), {
    headers: { Authorization: authorization(description, descriptor) },
  }).catch(() => null);
  await began;
  let closeSettled = false;
  const closing = started.pilot.close();
  closing.then(
    () => { closeSettled = true; },
    () => { closeSettled = true; },
  );
  await Promise.resolve();
  assert.equal(closeSettled, false);
  assert.equal(started.pilot.snapshot().phase, 'CLOSING');
  releaseExecution();
  await response;
  assert.deepEqual(await closing, { status: 'CLOSED' });
  assert.equal(closeSettled, true);
  assert.throws(() => context.serviceStore.load());
  assert.throws(() => context.observerStore.load());
});

test('uncertain transport close preserves durable custody before test cleanup', async t => {
  const context = createStoreContext(t);
  let releaseExecution;
  let executionStarted;
  const began = new Promise(resolve => { executionStarted = resolve; });
  const execution = new Promise(resolve => { releaseExecution = resolve; });
  const transport = controlledDeadlineRuntime();
  const handoff = deadlineRuntime();
  const started = await createStartedPilot(t, context, () => {
    executionStarted();
    return execution.then(() => ({ resultCode: 'operator.pilot.uncertain-close' }));
  }, { transport, handoff });
  commitReady(context.observerStore);
  await started.pilot.activateCommittedReady(activationInput(context));
  const granted = await obtainGrant(route(started));
  const descriptor = JSON.parse(granted.response.body.toString('utf8'));
  const description = requestDescription(
    descriptor.grantId,
    'request.operator.pilot.uncertain-close',
  );
  const pendingResponse = request(route(started), {
    headers: { Authorization: authorization(description, descriptor) },
  }).catch(() => null);
  await began;

  const closing = started.pilot.close();
  assert.equal(started.pilot.snapshot().phase, 'CLOSING');
  assert.equal(transport.fire(6_000), 1);
  await assert.rejects(
    closing,
    error => errorCode(error)
      === 'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_CLOSE_UNCERTAIN',
  );
  const terminal = started.pilot.snapshot();
  assert.equal(terminal.phase, 'TRANSPORT_UNCERTAIN');
  assert.equal(terminal.transportCloseClean, 0);
  assert.equal(terminal.transportCloseUncertain, 1);

  const retainedServiceState = context.serviceStore.load().state;
  const retainedObserverState = context.observerStore.load();
  assert.equal(retainedServiceState.grants.length, 1);
  assert.equal(typeof retainedObserverState, 'object');

  releaseExecution();
  await pendingResponse;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.serviceStore.load().state.grants.length, 1);
  assert.equal(typeof context.observerStore.load(), 'object');
});

test('source keeps handoff publication and ACTIVE last and remains default-off', () => {
  const source = readFileSync(
    new URL('../src/service-credit-zenon-https-operator-pilot.js', import.meta.url),
    'utf8',
  );
  const handoff = source.indexOf(
    'CREATE_EXTERNAL_HOLDER_HANDOFF_INGRESS',
    source.indexOf('function publishActive'),
  );
  const publish = source.indexOf('handoffController = nextController;', handoff);
  const active = source.indexOf("phase = PHASE.ACTIVE;", publish);
  assert.equal(handoff >= 0 && handoff < publish && publish < active, true);
  assert.doesNotMatch(
    source,
    /process\.env|node:(?:fs|child_process|async_hooks|v8)|promiseHooks|createHook|\.listen\s*\(/,
  );
  assert.doesNotMatch(
    source,
    /\bprocess\s*\.\s*(?:on|once|addListener|prependListener|prependOnceListener)\s*\(/,
  );
  assert.doesNotMatch(source, /approved|authenticated|evidence\s*:/);
});
