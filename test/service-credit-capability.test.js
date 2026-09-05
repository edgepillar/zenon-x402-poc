import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateKeyPairSync,
  sign,
} from 'node:crypto';
import {
  SERVICE_CREDIT_CAPABILITY_PROOF_VERSION,
  createServiceCreditCapabilitySigningBytes,
  deriveServiceCreditCapabilityCommitment,
  verifyServiceCreditCapability,
} from '../src/service-credit-capability.js';
import { SERVICE_CREDIT_MODEL_VERSION } from '../src/service-credit-model.js';

const BODY_DIGEST = `sha256:${'b'.repeat(64)}`;
const SPKI_ED25519_PREFIX_HEX = '302a300506032b6570032100';

function keyMaterial() {
  const pair = generateKeyPairSync('ed25519');
  const spki = pair.publicKey.export({ format: 'der', type: 'spki' });
  assert.equal(spki.subarray(0, -32).toString('hex'), SPKI_ED25519_PREFIX_HEX);
  return {
    privateKey: pair.privateKey,
    publicKey: spki.subarray(-32).toString('base64url'),
  };
}

function request(overrides = {}) {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    grantId: 'grant_public.reference.1',
    requestId: 'request.public.1',
    method: 'POST',
    routeId: 'lookup.v1',
    canonicalBodyDigest: BODY_DIGEST,
    selectedContentType: 'application/json',
    maxCostUnits: 4,
    ...overrides,
  };
}

function fixture(overrides = {}) {
  const keys = keyMaterial();
  const signedRequest = request(overrides.request);
  const proof = {
    proofVersion: SERVICE_CREDIT_CAPABILITY_PROOF_VERSION,
    grantId: signedRequest.grantId,
    requestId: signedRequest.requestId,
    publicKey: keys.publicKey,
    maxCostUnits: signedRequest.maxCostUnits,
    signature: sign(
      null,
      createServiceCreditCapabilitySigningBytes(signedRequest),
      keys.privateKey,
    ).toString('base64url'),
    ...overrides.proof,
  };
  const grant = {
    grantId: signedRequest.grantId,
    capabilityCommitment: deriveServiceCreditCapabilityCommitment({
      publicKey: keys.publicKey,
    }),
    ...overrides.grant,
  };
  return { grant, keys, proof, request: signedRequest };
}

function expectRejected(operation) {
  assert.throws(operation, error => {
    assert.equal(error?.name, 'ServiceCreditCapabilityError');
    assert.equal(error?.code, 'SERVICE_CREDIT_CAPABILITY_REJECTED');
    assert.equal(error?.message, 'SERVICE_CREDIT_CAPABILITY_REJECTED');
    assert.equal(Object.hasOwn(error, 'cause'), false);
    assert.equal(String(error?.stack).includes('synthetic-private-detail'), false);
    return true;
  });
}

test('a matching Ed25519 proof verifies with a minimal detached frozen result', () => {
  const input = fixture();
  const verified = verifyServiceCreditCapability({
    grant: input.grant,
    request: input.request,
    proof: input.proof,
  });

  assert.deepEqual(verified, {
    verified: true,
    proofVersion: SERVICE_CREDIT_CAPABILITY_PROOF_VERSION,
    grantId: input.request.grantId,
    requestId: input.request.requestId,
    maxCostUnits: input.request.maxCostUnits,
  });
  assert.equal(Object.isFrozen(verified), true);
  input.proof.grantId = 'grant_public.changed';
  input.request.requestId = 'request.public.changed';
  assert.equal(verified.grantId, 'grant_public.reference.1');
  assert.equal(verified.requestId, 'request.public.1');
});

test('an exact proof replay verifies only the same immutable request context', () => {
  const input = fixture();
  const first = verifyServiceCreditCapability({
    grant: input.grant,
    request: input.request,
    proof: input.proof,
  });
  const second = verifyServiceCreditCapability({
    grant: { ...input.grant },
    request: { ...input.request },
    proof: { ...input.proof },
  });

  assert.deepEqual(second, first);
  expectRejected(() => verifyServiceCreditCapability({
    grant: input.grant,
    request: { ...input.request, routeId: 'lookup.v2' },
    proof: input.proof,
  }));
});

test('commitments are deterministic, domain-separated, and accept only canonical raw keys', () => {
  const { publicKey } = keyMaterial();
  const first = deriveServiceCreditCapabilityCommitment({ publicKey });
  const second = deriveServiceCreditCapabilityCommitment({ publicKey });
  assert.equal(first, second);
  assert.match(first, /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(first, `sha256:${Buffer.from(publicKey, 'base64url').toString('hex')}`);

  for (const candidate of [
    `${publicKey}=`,
    publicKey.slice(1),
    `${publicKey.slice(0, -1)}+`,
    'bearer-secret',
  ]) {
    assert.throws(
      () => deriveServiceCreditCapabilityCommitment({ publicKey: candidate }),
      error => error?.code === 'SERVICE_CREDIT_CAPABILITY_INVALID_INPUT',
    );
  }
});

test('signing bytes are deterministic, detached, and independent of object key order', () => {
  const value = request();
  const reordered = Object.fromEntries(Object.entries(value).reverse());
  const first = createServiceCreditCapabilitySigningBytes(value);
  const second = createServiceCreditCapabilitySigningBytes(reordered);
  assert.notEqual(first, second);
  assert.deepEqual(first, second);
  const saved = Buffer.from(second);
  first.fill(0);
  assert.deepEqual(second, saved);
});

test('every request-binding field and duplicated proof identity is authenticated', async t => {
  const cases = [
    ['model version', { request: { modelVersion: 2 } }],
    ['grant', { request: { grantId: 'grant_public.changed' }, proof: { grantId: 'grant_public.changed' } }],
    ['request', { request: { requestId: 'request.public.changed' }, proof: { requestId: 'request.public.changed' } }],
    ['method', { request: { method: 'GET' } }],
    ['route', { request: { routeId: 'lookup.v2' } }],
    ['body', { request: { canonicalBodyDigest: `sha256:${'c'.repeat(64)}` } }],
    ['content type', { request: { selectedContentType: 'text/plain' } }],
    ['cost ceiling', { request: { maxCostUnits: 5 }, proof: { maxCostUnits: 5 } }],
    ['proof grant copy', { proof: { grantId: 'grant_public.changed' } }],
    ['proof request copy', { proof: { requestId: 'request.public.changed' } }],
    ['proof ceiling copy', { proof: { maxCostUnits: 5 } }],
  ];

  for (const [name, changes] of cases) {
    await t.test(name, () => {
      const baseline = fixture();
      Object.assign(baseline.request, changes.request);
      Object.assign(baseline.proof, changes.proof);
      expectRejected(() => verifyServiceCreditCapability({
        grant: baseline.grant,
        request: baseline.request,
        proof: baseline.proof,
      }));
    });
  }
});

test('proofs cannot cross grants, keys, or capability commitments', () => {
  const first = fixture();
  const second = fixture({ request: {
    grantId: 'grant_public.reference.2',
    requestId: 'request.public.2',
  } });

  for (const candidate of [
    { grant: second.grant, request: first.request, proof: first.proof },
    { grant: first.grant, request: first.request, proof: { ...first.proof, publicKey: second.proof.publicKey } },
    { grant: { ...first.grant, capabilityCommitment: second.grant.capabilityCommitment }, request: first.request, proof: first.proof },
  ]) {
    expectRejected(() => verifyServiceCreditCapability(candidate));
  }
});

test('raw bearer modes, malformed encodings, and invalid signatures fail closed', async t => {
  const baseline = fixture();
  const candidates = [
    ['raw bearer field', { ...baseline.proof, bearer: 'synthetic-value' }],
    ['raw bearer replacement', {
      proofVersion: 1,
      grantId: baseline.proof.grantId,
      requestId: baseline.proof.requestId,
      maxCostUnits: baseline.proof.maxCostUnits,
      bearer: 'synthetic-value',
    }],
    ['padded key', { ...baseline.proof, publicKey: `${baseline.proof.publicKey}=` }],
    ['short key', { ...baseline.proof, publicKey: baseline.proof.publicKey.slice(1) }],
    ['padded signature', { ...baseline.proof, signature: `${baseline.proof.signature}=` }],
    ['short signature', { ...baseline.proof, signature: baseline.proof.signature.slice(1) }],
    ['invalid signature', { ...baseline.proof, signature: Buffer.alloc(64).toString('base64url') }],
    ['invalid key bytes', { ...baseline.proof, publicKey: Buffer.alloc(32).toString('base64url') }],
    ['wrong version', { ...baseline.proof, proofVersion: 2 }],
  ];

  for (const [name, proof] of candidates) {
    await t.test(name, () => {
      expectRejected(() => verifyServiceCreditCapability({
        grant: baseline.grant,
        request: baseline.request,
        proof,
      }));
    });
  }
});

test('a degenerate raw key with its own commitment cannot validate a signature', () => {
  const baseline = fixture();
  const publicKey = Buffer.alloc(32).toString('base64url');
  const signature = Buffer.alloc(64).toString('base64url');

  expectRejected(() => verifyServiceCreditCapability({
    grant: {
      ...baseline.grant,
      capabilityCommitment: deriveServiceCreditCapabilityCommitment({ publicKey }),
    },
    request: baseline.request,
    proof: { ...baseline.proof, publicKey, signature },
  }));
});

test('hostile shapes and descriptors are rejected without evaluating values', async t => {
  const baseline = fixture();
  const inherited = Object.assign(Object.create({ inherited: true }), baseline.proof);
  const nullPrototype = Object.assign(Object.create(null), baseline.proof);
  const accessor = { ...baseline.proof };
  let getterCalls = 0;
  Object.defineProperty(accessor, 'signature', {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error('synthetic-private-detail');
    },
  });
  const symbol = { ...baseline.proof, [Symbol('hidden')]: true };
  const proxied = new Proxy(baseline.proof, {
    ownKeys() { throw new Error('synthetic-private-detail'); },
  });

  for (const [name, proof] of [
    ['array', Object.values(baseline.proof)],
    ['inherited prototype', inherited],
    ['null prototype', nullPrototype],
    ['accessor', accessor],
    ['symbol', symbol],
    ['proxy', proxied],
  ]) {
    await t.test(name, () => {
      expectRejected(() => verifyServiceCreditCapability({
        grant: baseline.grant,
        request: baseline.request,
        proof,
      }));
    });
  }
  assert.equal(getterCalls, 0);
});

test('invalid outer, grant, and request inputs normalize to one rejection without hooks', () => {
  const baseline = fixture();
  let effectCalls = 0;
  const effect = () => { effectCalls += 1; };
  for (const candidate of [
    { grant: baseline.grant, request: baseline.request, proof: baseline.proof, effect },
    { grant: { ...baseline.grant, extra: true }, request: baseline.request, proof: baseline.proof },
    { grant: baseline.grant, request: { ...baseline.request, maxCostUnits: 0 }, proof: baseline.proof },
    { grant: baseline.grant, request: { ...baseline.request, query: 'changed=true' }, proof: baseline.proof },
  ]) {
    expectRejected(() => verifyServiceCreditCapability(candidate));
  }
  assert.equal(effectCalls, 0);
});

test('outer, grant, and request accessors and proxies are rejected without evaluation', () => {
  const baseline = fixture();
  let getterCalls = 0;
  const accessorGrant = { ...baseline.grant };
  Object.defineProperty(accessorGrant, 'capabilityCommitment', {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error('synthetic-private-detail');
    },
  });
  const accessorRequest = { ...baseline.request };
  Object.defineProperty(accessorRequest, 'routeId', {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error('synthetic-private-detail');
    },
  });
  const accessorOuter = {
    grant: baseline.grant,
    request: baseline.request,
  };
  Object.defineProperty(accessorOuter, 'proof', {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error('synthetic-private-detail');
    },
  });

  for (const candidate of [
    { grant: accessorGrant, request: baseline.request, proof: baseline.proof },
    { grant: baseline.grant, request: accessorRequest, proof: baseline.proof },
    accessorOuter,
    new Proxy(
      { grant: baseline.grant, request: baseline.request, proof: baseline.proof },
      { ownKeys() { throw new Error('synthetic-private-detail'); } },
    ),
    { grant: new Proxy(baseline.grant, {}), request: baseline.request, proof: baseline.proof },
    { grant: baseline.grant, request: new Proxy(baseline.request, {}), proof: baseline.proof },
  ]) {
    expectRejected(() => verifyServiceCreditCapability(candidate));
  }
  assert.equal(getterCalls, 0);
});
