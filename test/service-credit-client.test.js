import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHash,
  generateKeyPairSync,
  sign,
} from 'node:crypto';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

import { createServiceCreditAuthorization } from '../src/service-credit-client.js';
import {
  SERVICE_CREDIT_CAPABILITY_PROOF_VERSION,
  createServiceCreditCapabilitySigningBytes,
  deriveServiceCreditCapabilityCommitment,
} from '../src/service-credit-capability.js';
import {
  SERVICE_CREDIT_HTTP_PATH,
  SERVICE_CREDIT_HTTP_ROUTE_ID,
  createServiceCreditHttpHandler,
} from '../src/service-credit-http.js';
import {
  SERVICE_CREDIT_ACTIVATION_VERSION,
  SERVICE_CREDIT_MODEL_VERSION,
} from '../src/service-credit-model.js';
import { ServiceCreditSqliteStore } from '../src/service-credit-sqlite-store.js';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TEST_DIRECTORY, '..');
const CLIENT_PATH = join(ROOT, 'src', 'service-credit-client.js');
const CLIENT_URL = pathToFileURL(CLIENT_PATH).href;
const NOW = 2_000_000_000_000;
const COST_UNITS = 2;
const TOTAL_UNITS = 7;
const CONTENT_TYPE = 'application/json';
const PROOF_KEYS = Object.freeze([
  'grantId',
  'maxCostUnits',
  'proofVersion',
  'publicKey',
  'requestId',
  'signature',
]);
const EMPTY_BODY_DIGEST = `sha256:${createHash('sha256')
  .update(Buffer.alloc(0))
  .digest('hex')}`;
const SPKI_ED25519_PREFIX_HEX = '302a300506032b6570032100';
const MODULE_EDGE_PARSER = [
  "import { readFileSync } from 'node:fs';",
  "import { SourceTextModule } from 'node:vm';",
  "const parsed = new SourceTextModule(readFileSync(0, 'utf8'));",
  'process.stdout.write(JSON.stringify(',
  'parsed.moduleRequests.map(request => request.specifier)',
  '));',
].join('');
const DYNAMIC_IMPORT_GUARD = /\bimport(?:(?:\s+)|(?:\/\*[\s\S]*?\*\/)|(?:\/\/[^\r\n\u2028\u2029]*(?:\r\n?|\n|\u2028|\u2029|$)))*\(/u;

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function digest(fill) {
  return `sha256:${fill.repeat(64)}`;
}

function keyMaterial() {
  const pair = generateKeyPairSync('ed25519');
  const spki = pair.publicKey.export({ format: 'der', type: 'spki' });
  assert.equal(spki.subarray(0, -32).toString('hex'), SPKI_ED25519_PREFIX_HEX);
  return {
    privateKey: pair.privateKey,
    publicKey: spki.subarray(-32).toString('base64url'),
  };
}

function request(grantId, overrides = {}) {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    grantId,
    requestId: 'request.client.1',
    method: 'POST',
    routeId: SERVICE_CREDIT_HTTP_ROUTE_ID,
    canonicalBodyDigest: EMPTY_BODY_DIGEST,
    selectedContentType: CONTENT_TYPE,
    maxCostUnits: COST_UNITS,
    ...overrides,
  };
}

function proof(keys, signedRequest, overrides = {}) {
  const signingBytes = createServiceCreditCapabilitySigningBytes(signedRequest);
  let signature;
  try {
    signature = sign(null, signingBytes, keys.privateKey).toString('base64url');
  } finally {
    signingBytes.fill(0);
  }
  return {
    proofVersion: SERVICE_CREDIT_CAPABILITY_PROOF_VERSION,
    grantId: signedRequest.grantId,
    requestId: signedRequest.requestId,
    publicKey: keys.publicKey,
    maxCostUnits: signedRequest.maxCostUnits,
    signature,
    ...overrides,
  };
}

function fixture(overrides = {}) {
  const keys = keyMaterial();
  const grant = {
    grantId: 'grant_client.reference.1',
    capabilityCommitment: deriveServiceCreditCapabilityCommitment({
      publicKey: keys.publicKey,
    }),
    ...overrides.grant,
  };
  const signedRequest = request(grant.grantId, overrides.request);
  const signedProof = proof(keys, signedRequest, overrides.proof);
  return { grant, keys, proof: signedProof, request: signedRequest };
}

function authorize(value) {
  return createServiceCreditAuthorization({
    grant: value.grant,
    request: value.request,
    proof: value.proof,
  });
}

function assertFixedFailure(operation) {
  assert.throws(operation, error => {
    assert.equal(error?.name, 'ServiceCreditClientError');
    assert.equal(error?.code, 'SERVICE_CREDIT_AUTHORIZATION_FAILED');
    assert.equal(error?.message, 'SERVICE_CREDIT_AUTHORIZATION_FAILED');
    assert.equal(
      error?.stack,
      'ServiceCreditClientError: SERVICE_CREDIT_AUTHORIZATION_FAILED',
    );
    assert.equal(Object.hasOwn(error, 'cause'), false);
    return true;
  });
}

function assertCanonicalAuthorization(authorization, signedProof) {
  assert.equal(typeof authorization, 'string');
  assert.equal(authorization.startsWith('ServiceCredit '), true);
  assert.equal(authorization.includes('\n'), false);
  assert.equal(Buffer.byteLength(authorization, 'utf8') <= 1_024, true);
  const encoded = authorization.slice('ServiceCredit '.length);
  assert.equal(/^[A-Za-z0-9_-]+$/.test(encoded), true);
  assert.equal(encoded.includes('='), false);
  const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
  assert.equal(decoded === canonicalJson(signedProof), true);
  const decodedKeys = Object.keys(JSON.parse(decoded)).sort();
  assert.deepEqual(decodedKeys, PROOF_KEYS);
}

function grantAccounting(store, grantId) {
  const state = store.load();
  const grant = store.getGrant(grantId);
  return Object.freeze({
    revision: state.revision,
    availableUnits: grant.availableUnits,
    heldUnits: grant.heldUnits,
    consumedUnits: grant.consumedUnits,
  });
}

function reverseObject(value) {
  return Object.fromEntries(Object.entries(value).reverse());
}

function staticImportSpecifiers(source) {
  const parsed = spawnSync(process.execPath, [
    '--no-warnings',
    '--experimental-vm-modules',
    '--input-type=module',
    '--eval',
    MODULE_EDGE_PARSER,
  ], {
    encoding: 'utf8',
    input: source,
  });
  assert.equal(parsed.status, 0);
  assert.doesNotMatch(source, DYNAMIC_IMPORT_GUARD);
  return JSON.parse(parsed.stdout);
}

function importClosure(entry) {
  const visited = new Set();
  const external = new Set();
  const pending = [entry];
  while (pending.length > 0) {
    const current = pending.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    for (const specifier of staticImportSpecifiers(readFileSync(current, 'utf8'))) {
      if (!specifier.startsWith('.')) {
        external.add(specifier);
        continue;
      }
      const target = resolve(dirname(current), specifier);
      const fromSourceRoot = relative(join(ROOT, 'src'), target);
      assert.equal(
        fromSourceRoot !== ''
          && fromSourceRoot !== '..'
          && !fromSourceRoot.startsWith('../')
          && !isAbsolute(fromSourceRoot),
        true,
      );
      pending.push(target);
    }
  }
  return { external, visited };
}

function fullGrant(keys) {
  return {
    activationVersion: SERVICE_CREDIT_ACTIVATION_VERSION,
    authorityProfileId: 'authority.mock.client',
    authorityProfileVersion: 1,
    verifierVersion: 1,
    authorityRecordDigest: digest('d'),
    fundingPolicyId: 'funding.fixed',
    fundingPolicyVersion: 1,
    sourceSettlementId: 'settlement.client.1',
    transactionId: `mocktx:${createHash('sha256').update('transaction.client.1').digest('hex')}`,
    providerId: 'provider.client',
    serviceId: 'service.client',
    resourceId: 'resource.client',
    resourceBinding: digest('e'),
    offerId: 'offer.client',
    offerVersion: 1,
    holderId: 'holder.client',
    capabilityCommitment: deriveServiceCreditCapabilityCommitment({
      publicKey: keys.publicKey,
    }),
    totalUnits: TOTAL_UNITS,
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
    payee: 'payee.client',
    payer: 'holder.client',
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
  };
}

function createLedger(t) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'service-credit-client-')));
  chmodSync(directory, 0o700);
  const keys = keyMaterial();
  const store = ServiceCreditSqliteStore.create({
    databasePath: join(directory, 'ledger.sqlite'),
    allowedRoot: directory,
    deriveCost: () => COST_UNITS,
    now: () => NOW,
  });
  store.registerOffer({
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    providerId: 'provider.client',
    serviceId: 'service.client',
    resourceId: 'resource.client',
    resourceBinding: digest('e'),
    offerId: 'offer.client',
    offerVersion: 1,
    costPolicyId: 'policy.fixed',
    fundingPolicyId: 'funding.fixed',
    fundingPolicyVersion: 1,
  });
  const activated = store.activateGrantFromTrustedRecord(fullGrant(keys));
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { activated, keys, store };
}

async function exchange(handler, authorization) {
  const httpRequest = Object.freeze({
    url: SERVICE_CREDIT_HTTP_PATH,
    method: 'POST',
    rawHeaders: Object.freeze(['Authorization', authorization, 'Content-Length', '0']),
  });
  const headers = Object.create(null);
  let body;
  const response = {
    destroyed: false,
    writableEnded: false,
    statusCode: 0,
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = String(value);
    },
    end(value) {
      this.writableEnded = true;
      body = Buffer.from(value);
    },
    destroy() {
      this.destroyed = true;
    },
  };
  await handler(httpRequest, response);
  return { body, headers, statusCode: response.statusCode };
}

test('client import is inert and creates no local state', () => {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'service-credit-client-import-')));
  chmodSync(parent, 0o700);
  try {
    const result = spawnSync(process.execPath, [
      '--input-type=module',
      '--eval',
      `await import(${JSON.stringify(CLIENT_URL)}); process.stdout.write('IMPORT_OK\\n');`,
    ], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: parent },
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'IMPORT_OK\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('client import closure is exact and excludes effectful runtime capabilities', () => {
  const closure = importClosure(CLIENT_PATH);
  assert.deepEqual(
    [...closure.visited].map(path => path.slice(ROOT.length + 1)).sort(),
    [
      'src/service-credit-capability.js',
      'src/service-credit-client.js',
      'src/service-credit-model.js',
    ],
  );
  assert.deepEqual([...closure.external].sort(), ['node:crypto', 'node:util']);
});

test('authorization is canonical, deterministic, unpadded, bounded, and primitive', () => {
  const value = fixture();
  const first = authorize(value);
  const reordered = createServiceCreditAuthorization({
    proof: reverseObject(value.proof),
    request: reverseObject(value.request),
    grant: reverseObject(value.grant),
  });
  assert.equal(first === reordered, true);
  assertCanonicalAuthorization(first, value.proof);
});

test('authorization is accepted by the real handler and exact replay changes nothing', async t => {
  const ledger = createLedger(t);
  const modelRequest = request(ledger.activated.grantId);
  const signedProof = proof(ledger.keys, modelRequest);
  const input = {
    grant: {
      grantId: ledger.activated.grantId,
      capabilityCommitment: ledger.activated.capabilityCommitment,
    },
    request: modelRequest,
    proof: signedProof,
  };
  const firstAuthorization = createServiceCreditAuthorization(input);
  const replayAuthorization = createServiceCreditAuthorization({
    grant: { ...input.grant },
    request: { ...input.request },
    proof: { ...input.proof },
  });
  assertCanonicalAuthorization(firstAuthorization, signedProof);
  assert.equal(firstAuthorization === replayAuthorization, true);

  let executions = 0;
  const handler = createServiceCreditHttpHandler({
    store: ledger.store,
    execute: () => {
      executions += 1;
      return { resultCode: 'service.client.completed' };
    },
  });
  const before = ledger.store.load().revision;
  const first = await exchange(handler, firstAuthorization);
  const afterFirst = ledger.store.load().revision;
  const replay = await exchange(handler, replayAuthorization);
  const afterReplay = ledger.store.load().revision;
  assert.equal(first.statusCode, 200);
  assert.equal(replay.statusCode, 200);
  assert.deepEqual(first.body, replay.body);
  assert.equal(executions, 1);
  assert.equal(afterFirst, before + 3);
  assert.equal(afterReplay, afterFirst);
  const grant = ledger.store.getGrant(ledger.activated.grantId);
  assert.deepEqual(
    {
      availableUnits: grant.availableUnits,
      heldUnits: grant.heldUnits,
      consumedUnits: grant.consumedUnits,
    },
    { availableUnits: 5, heldUnits: 0, consumedUnits: 2 },
  );
});

test('generic authorizations for altered contexts fail closed at the fixed handler', async t => {
  const ledger = createLedger(t);
  const grant = {
    grantId: ledger.activated.grantId,
    capabilityCommitment: ledger.activated.capabilityCommitment,
  };
  let executions = 0;
  const handler = createServiceCreditHttpHandler({
    store: ledger.store,
    execute: () => {
      executions += 1;
      return { resultCode: 'service.client.completed' };
    },
  });
  const cases = [
    ['method', 'GET'],
    ['routeId', 'service-credit.execute.alternate'],
    ['canonicalBodyDigest', digest('9')],
    ['selectedContentType', 'application/cbor'],
  ];

  for (const [field, alteredValue] of cases) {
    await t.test(field, async () => {
      const alteredRequest = request(grant.grantId, { [field]: alteredValue });
      const alteredProof = proof(ledger.keys, alteredRequest);
      const authorization = createServiceCreditAuthorization({
        grant,
        request: alteredRequest,
        proof: alteredProof,
      });
      assertCanonicalAuthorization(authorization, alteredProof);

      const before = grantAccounting(ledger.store, grant.grantId);
      const response = await exchange(handler, authorization);
      const after = grantAccounting(ledger.store, grant.grantId);
      assert.equal(response.statusCode, 401);
      assert.equal(response.body.toString('utf8') === '{"error":"unauthorized"}', true);
      assert.deepEqual(after, before);
      assert.equal(executions, 0);

      const unsignedMutation = request(grant.grantId);
      const originalProof = proof(ledger.keys, unsignedMutation);
      unsignedMutation[field] = alteredValue;
      assertFixedFailure(() => createServiceCreditAuthorization({
        grant,
        request: unsignedMutation,
        proof: originalProof,
      }));
    });
  }
});

test('every grant, request, and proof binding mismatch returns one fixed failure', async t => {
  const cases = [
    ['grant commitment', value => { value.grant.capabilityCommitment = digest('f'); }],
    ['request grant', value => { value.request.grantId = 'grant_client.changed'; }],
    ['request id', value => { value.request.requestId = 'request.client.changed'; }],
    ['request cost', value => { value.request.maxCostUnits += 1; }],
    ['proof version', value => { value.proof.proofVersion += 1; }],
    ['proof grant', value => { value.proof.grantId = 'grant_client.changed'; }],
    ['proof request', value => { value.proof.requestId = 'request.client.changed'; }],
    ['proof cost', value => { value.proof.maxCostUnits += 1; }],
    ['proof key', value => { value.proof.publicKey = Buffer.alloc(32).toString('base64url'); }],
    ['proof signature', value => { value.proof.signature = Buffer.alloc(64).toString('base64url'); }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, () => {
      const value = fixture();
      mutate(value);
      assertFixedFailure(() => authorize(value));
    });
  }
});

test('expanded, missing, and noncanonical values fail without credential output', async t => {
  const baseline = fixture();
  const candidates = [
    { grant: baseline.grant, request: baseline.request, proof: baseline.proof, privateKey: true },
    { grant: baseline.grant, request: baseline.request, proof: baseline.proof, sign: () => {} },
    { grant: { ...baseline.grant, extra: true }, request: baseline.request, proof: baseline.proof },
    { grant: baseline.grant, request: { ...baseline.request, extra: true }, proof: baseline.proof },
    { grant: baseline.grant, request: baseline.request, proof: { ...baseline.proof, extra: true } },
    { grant: baseline.grant, request: baseline.request },
    { grant: baseline.grant, request: { ...baseline.request, requestId: 'bad/value' }, proof: baseline.proof },
    { grant: baseline.grant, request: baseline.request, proof: { ...baseline.proof, publicKey: `${baseline.proof.publicKey}=` } },
    { grant: baseline.grant, request: baseline.request, proof: { ...baseline.proof, signature: `${baseline.proof.signature}=` } },
  ];
  for (const [index, candidate] of candidates.entries()) {
    await t.test(String(index), () => assertFixedFailure(
      () => createServiceCreditAuthorization(candidate),
    ));
  }
  assertFixedFailure(() => createServiceCreditAuthorization());
  assertFixedFailure(() => createServiceCreditAuthorization(baseline, baseline));
});

test('accessors, proxies, symbols, and exotic prototypes are rejected inertly', async t => {
  await t.test('outer accessor', () => {
    const value = fixture();
    let getterCalls = 0;
    const hostile = { grant: value.grant, request: value.request };
    Object.defineProperty(hostile, 'proof', {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('synthetic-private-detail');
      },
    });
    assertFixedFailure(() => createServiceCreditAuthorization(hostile));
    assert.equal(getterCalls, 0);
  });
  await t.test('outer proxy', () => {
    const value = fixture();
    let trapCalls = 0;
    const hostile = new Proxy({
      grant: value.grant,
      request: value.request,
      proof: value.proof,
    }, {
      ownKeys() {
        trapCalls += 1;
        throw new Error('synthetic-private-detail');
      },
    });
    assertFixedFailure(() => createServiceCreditAuthorization(hostile));
    assert.equal(trapCalls, 0);
  });

  const fields = ['grant', 'request', 'proof'];
  for (const field of fields) {
    await t.test(`${field} accessor`, () => {
      const value = fixture();
      let getterCalls = 0;
      const hostile = { ...value[field] };
      const key = Object.keys(hostile)[0];
      Object.defineProperty(hostile, key, {
        enumerable: true,
        get() {
          getterCalls += 1;
          throw new Error('synthetic-private-detail');
        },
      });
      assertFixedFailure(() => createServiceCreditAuthorization({
        grant: field === 'grant' ? hostile : value.grant,
        request: field === 'request' ? hostile : value.request,
        proof: field === 'proof' ? hostile : value.proof,
      }));
      assert.equal(getterCalls, 0);
    });
    await t.test(`${field} proxy`, () => {
      const value = fixture();
      let trapCalls = 0;
      const hostile = new Proxy(value[field], {
        ownKeys() {
          trapCalls += 1;
          throw new Error('synthetic-private-detail');
        },
      });
      assertFixedFailure(() => createServiceCreditAuthorization({
        grant: field === 'grant' ? hostile : value.grant,
        request: field === 'request' ? hostile : value.request,
        proof: field === 'proof' ? hostile : value.proof,
      }));
      assert.equal(trapCalls, 0);
    });
  }

  for (const field of fields) {
    const value = fixture();
    assertFixedFailure(() => createServiceCreditAuthorization({
      grant: field === 'grant' ? { ...value.grant, [Symbol('hidden')]: true } : value.grant,
      request: field === 'request'
        ? { ...value.request, [Symbol('hidden')]: true }
        : value.request,
      proof: field === 'proof' ? { ...value.proof, [Symbol('hidden')]: true } : value.proof,
    }));
  }
  const value = fixture();
  assertFixedFailure(() => createServiceCreditAuthorization({
    grant: value.grant,
    request: value.request,
    proof: value.proof,
    [Symbol('hidden')]: true,
  }));
  assertFixedFailure(() => createServiceCreditAuthorization({
    grant: Object.assign(Object.create(null), value.grant),
    request: value.request,
    proof: value.proof,
  }));
  assertFixedFailure(() => createServiceCreditAuthorization({
    grant: value.grant,
    request: Object.values(value.request),
    proof: value.proof,
  }));
});

test('caller mutation after authorization cannot alter the primitive result', () => {
  const value = fixture();
  const authorization = authorize(value);
  const saved = authorization;
  value.grant.grantId = 'grant_client.changed';
  value.request.requestId = 'request.client.changed';
  value.proof.signature = Buffer.alloc(64).toString('base64url');
  assert.equal(authorization === saved, true);
  assert.equal(typeof authorization, 'string');
});

test('client source has no output, persistence, transport, or signing capability', () => {
  const source = readFileSync(CLIENT_PATH, 'utf8');
  assert.doesNotMatch(source, /\bconsole\s*\./u);
  assert.doesNotMatch(source, /process\s*\.\s*(?:stdout|stderr)/u);
  assert.doesNotMatch(source, /\b(?:fetch|WebSocket|createServer|createConnection|spawn)\b/u);
  assert.doesNotMatch(source, /\b(?:privateKey|generateKeyPair|\bsign\s*\()/u);
  assert.doesNotMatch(source, /node:(?:fs|http|https|net|tls|child_process)/u);
});
