import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  createZenonFundingProviderSigningChildRequest,
  createZenonFundingProviderSigningChildResponse,
  deriveZenonFundingProviderSigningOperationId,
  frameZenonFundingProviderSigningChildRequest,
  frameZenonFundingProviderSigningChildResponse,
  parseZenonFundingProviderSigningChildRequestFrame,
  parseZenonFundingProviderSigningChildResponseFrame,
  ZENON_FUNDING_PROVIDER_SIGNING_CHILD_REQUEST_MAXIMUM_PAYLOAD_BYTES,
  ZENON_FUNDING_PROVIDER_SIGNING_CHILD_PROTOCOL_VERSION,
} from '../src/service-credit-zenon-provider-signing-child-protocol.js';
import {
  parseZenonFundingProviderAttestationAuthorityRecord,
} from '../src/service-credit-zenon-funding-provider-attestation.js';

const NOW = 2_000_000_000;
const ATTESTATION_ID_DOMAIN = 'zenon-x402:funding-provider-attestation-id-v1';
const FUNDING_EVIDENCE_DOMAIN = 'zenon-x402:funding-provider-attestation-evidence-v1';

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function commitment(domain, value) {
  return `sha256:${createHash('sha256')
    .update(domain)
    .update('\0')
    .update(canonicalJson(value))
    .digest('hex')}`;
}

function digest(fill) {
  return `sha256:${fill.repeat(64)}`;
}

function authorityFixture(overrides = {}, keys = generateKeyPairSync('ed25519')) {
  const publicKey = keys.publicKey.export({ format: 'der', type: 'spki' })
    .subarray(-32).toString('base64url');
  const text = canonicalJson({
    authorityRecordVersion: 1,
    authorityProfileId: 'zenon.provider-attestation',
    authorityProfileVersion: 1,
    verifierVersion: 1,
    providerAuthorityId: 'provider.reference',
    generationId: 'provider.attestation.generation',
    generationVersion: 1,
    keyId: 'provider.attestation.key',
    algorithm: 'Ed25519',
    publicKey,
    network: 'zenon:testnet',
    chainProfile: {
      version: 1,
      chainIdentifier: '12345',
      genesisMomentumHash: '1'.repeat(64),
    },
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
    bootstrapCheckpoint: { height: 10, hash: 'a'.repeat(64) },
    sourcePolicyCommitment: digest('8'),
    maximumAttestationBytes: 4096,
    maximumCanonicalBytes: 524288,
    maximumInitialAgeSeconds: 300,
    maximumFutureSkewSeconds: 5,
    maximumValiditySeconds: 300,
    ...overrides,
  });
  return {
    authority: parseZenonFundingProviderAttestationAuthorityRecord(text),
    text,
  };
}

test('request wrapper has exact fixed headroom above an exact inner authority ceiling', () => {
  const keys = generateKeyPairSync('ed25519');
  const loose = authorityFixture({}, keys);
  const observedInnerBytes = Buffer.byteLength(
    canonicalJson(preparedRequest(loose.authority)),
  );
  const exact = authorityFixture({ maximumCanonicalBytes: observedInnerBytes }, keys);
  const request = preparedRequest(exact.authority);
  assert.equal(Buffer.byteLength(canonicalJson(request)), observedInnerBytes);

  const wire = createZenonFundingProviderSigningChildRequest({
    authorityRecord: exact.authority,
    request,
  });
  const frame = frameZenonFundingProviderSigningChildRequest(wire, exact.authority);
  const payloadBytes = frame.readUInt32BE(0);
  assert.equal(payloadBytes > exact.authority.maximumCanonicalBytes, true);
  assert.equal(
    ZENON_FUNDING_PROVIDER_SIGNING_CHILD_REQUEST_MAXIMUM_PAYLOAD_BYTES,
    (512 * 1024) + 610,
  );
  assert.equal(
    payloadBytes <= ZENON_FUNDING_PROVIDER_SIGNING_CHILD_REQUEST_MAXIMUM_PAYLOAD_BYTES,
    true,
  );
  assert.deepEqual(
    parseZenonFundingProviderSigningChildRequestFrame(frame, exact.authority),
    wire,
  );
});

function requestIdentity(request) {
  return {
    requestVersion: request.requestVersion,
    requestType: request.requestType,
    recordKey: request.recordKey,
    authorityRecordDigest: request.authorityRecordDigest,
    generationCommitment: request.generationCommitment,
    keyId: request.keyId,
    audienceDigest: request.audienceDigest,
    observerRecordId: request.observerRecordId,
    targetBindingDigest: request.targetBindingDigest,
    candidateDigest: request.candidateDigest,
    inclusionAuthorizationId: request.inclusionAuthorizationId,
    bootstrapCheckpoint: request.bootstrapCheckpoint,
    sourcePolicyCommitment: request.sourcePolicyCommitment,
    unsignedFundingEvidenceDigest: request.unsignedFundingEvidenceDigest,
  };
}

function preparedRequest(authority) {
  const transactionHash = 'c'.repeat(64);
  const record = {
    evidenceVersion: 1,
    evidenceType: 'zenon-authenticated-funding-evidence',
    authorityProfileId: authority.authorityProfileId,
    authorityProfileVersion: authority.authorityProfileVersion,
    verifierVersion: authority.verifierVersion,
    authorityRecordDigest: authority.authorityRecordDigest,
    network: authority.network,
    chainProfile: structuredClone(authority.chainProfile),
    transactionId: `zenontx:${transactionHash}`,
    payer: 'z1syntheticpayer',
    payee: 'z1syntheticpayee',
    asset: 'zts1syntheticasset',
    amount: '7',
    paymentResourceDigest: digest('1'),
    paymentRequirementDigest: digest('2'),
    paymentIntentDigest: digest('3'),
    resourceBinding: digest('4'),
    offerId: 'offer.zenon.reference',
    offerVersion: 1,
    fundingPolicyId: 'funding.exact.zenon.observer',
    fundingPolicyVersion: 1,
    capabilityCommitment: digest('5'),
    totalUnits: 10,
    expiresAt: NOW + 10_000,
    grantFundingCommitment: digest('6'),
    inclusionEvidence: {
      state: 'MOMENTUM_INCLUDED',
      transactionHash,
      momentumHeight: 11,
      momentumHash: 'd'.repeat(64),
      observedConfirmations: 3,
    },
    confirmationPolicy: structuredClone(authority.confirmationPolicy),
  };
  const base = {
    requestVersion: 1,
    requestType: 'zenon-funding-provider-attestation-request',
    recordKey: digest('9'),
    authorityRecordDigest: authority.authorityRecordDigest,
    generationCommitment: authority.authorityGeneration.generationCommitment,
    keyId: authority.keyId,
    audienceDigest: digest('a'),
    observerRecordId: digest('b'),
    targetBindingDigest: digest('c'),
    candidateDigest: digest('d'),
    inclusionAuthorizationId: digest('e'),
    bootstrapCheckpoint: structuredClone(authority.bootstrapCheckpoint),
    sourcePolicyCommitment: authority.sourcePolicyCommitment,
    unsignedFundingEvidenceDigest: commitment(FUNDING_EVIDENCE_DOMAIN, record),
  };
  return {
    ...base,
    attestationId: commitment(ATTESTATION_ID_DOMAIN, base),
    unsignedFundingEvidence: record,
  };
}

function protocolFixture() {
  const fixture = authorityFixture();
  const request = preparedRequest(fixture.authority);
  const wire = createZenonFundingProviderSigningChildRequest({
    authorityRecord: fixture.authority,
    request,
  });
  return { ...fixture, request, wire };
}

function responseFor(wire, status = 'APPROVAL_REQUIRED') {
  if (status === 'READY') {
    return createZenonFundingProviderSigningChildResponse({
      protocolVersion: 1,
      messageType: 'zenon-funding-provider-signing-response',
      operationId: wire.operationId,
      status,
      reasonCode: null,
      envelope: {
        envelopeVersion: 1,
        attestationId: wire.attestationId,
        keyId: wire.keyId,
        issuedAt: NOW,
        validUntil: NOW + 120,
        signature: 'A'.repeat(86),
      },
    });
  }
  return createZenonFundingProviderSigningChildResponse({
    protocolVersion: 1,
    messageType: 'zenon-funding-provider-signing-response',
    operationId: wire.operationId,
    status,
    reasonCode: status === 'APPROVAL_REQUIRED'
      ? 'OPERATOR_APPROVAL_REQUIRED'
      : 'POLICY_REJECTED',
    envelope: null,
  });
}

function rawFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(payload.length);
  return Buffer.concat([prefix, payload]);
}

function expectProtocolCode(fn, code) {
  assert.throws(fn, error => error?.code === code && error?.message === code);
}

test('provider signing child protocol starts at schema version 1 and stays pure', () => {
  assert.equal(ZENON_FUNDING_PROVIDER_SIGNING_CHILD_PROTOCOL_VERSION, 1);
  const source = readFileSync(
    new URL('../src/service-credit-zenon-provider-signing-child-protocol.js', import.meta.url),
    'utf8',
  );
  const imports = [...source.matchAll(/from '([^']+)'/g)].map(match => match[1]).sort();
  assert.deepEqual(imports, [
    './service-credit-zenon-funding-provider-attestation.js',
    'node:crypto',
    'node:util',
  ]);
  assert.doesNotMatch(source, /node:(?:fs|net|http|https|tls|child_process)|process\.env|setTimeout|WebSocket|fetch\(/u);
});

test('stable operation identity excludes attempt time and changes for every authority field', () => {
  const { wire } = protocolFixture();
  const input = {
    authorityRecordDigest: wire.authorityRecordDigest,
    generationCommitment: wire.generationCommitment,
    keyId: wire.keyId,
    attestationId: wire.attestationId,
  };
  assert.equal(deriveZenonFundingProviderSigningOperationId(input), wire.operationId);
  assert.equal(deriveZenonFundingProviderSigningOperationId(structuredClone(input)), wire.operationId);
  for (const field of Object.keys(input)) {
    const changed = { ...input };
    changed[field] = field === 'keyId' ? 'provider.attestation.other' : digest('f');
    assert.notEqual(deriveZenonFundingProviderSigningOperationId(changed), wire.operationId);
  }
});

test('request and all response statuses round-trip as canonical frozen frames', () => {
  const { authority, wire } = protocolFixture();
  const requestFrame = frameZenonFundingProviderSigningChildRequest(wire, authority);
  const parsedRequest = parseZenonFundingProviderSigningChildRequestFrame(
    requestFrame,
    authority,
  );
  assert.deepEqual(parsedRequest, wire);
  assert.equal(Object.isFrozen(parsedRequest), true);
  assert.equal(Object.isFrozen(parsedRequest.attestationRequest), true);
  for (const status of ['APPROVAL_REQUIRED', 'REJECTED', 'READY']) {
    const response = responseFor(wire, status);
    const frame = frameZenonFundingProviderSigningChildResponse(response);
    const parsed = parseZenonFundingProviderSigningChildResponseFrame(
      frame,
      wire.operationId,
    );
    assert.deepEqual(parsed, response);
    assert.equal(Object.isFrozen(parsed), true);
  }
});

test('framing rejects short, long, trailing, oversized, and invalid UTF-8 inputs', () => {
  const { wire } = protocolFixture();
  const frame = frameZenonFundingProviderSigningChildResponse(responseFor(wire));
  const code = 'ZENON_FUNDING_PROVIDER_SIGNING_PROTOCOL_INVALID_RESPONSE';
  const declaredLong = Buffer.from(frame);
  declaredLong.writeUInt32BE(declaredLong.readUInt32BE(0) + 1, 0);
  const declaredShort = Buffer.from(frame);
  declaredShort.writeUInt32BE(declaredShort.readUInt32BE(0) - 1, 0);
  for (const hostile of [
    frame.subarray(0, 3),
    declaredLong,
    declaredShort,
    Buffer.concat([frame, Buffer.from([0])]),
    Buffer.from([0, 0, 0, 2, 0xc3, 0x28]),
    Buffer.alloc(1029),
  ]) {
    expectProtocolCode(
      () => parseZenonFundingProviderSigningChildResponseFrame(
        hostile,
        wire.operationId,
        1024,
      ),
      code,
    );
  }
});

test('noncanonical JSON, duplicate fields, unknown fields, and mismatched identities reject', () => {
  const { wire } = protocolFixture();
  const response = responseFor(wire);
  const code = 'ZENON_FUNDING_PROVIDER_SIGNING_PROTOCOL_INVALID_RESPONSE';
  const canonical = canonicalJson(response);
  const duplicate = canonical.replace('{', `{"status":"APPROVAL_REQUIRED",`);
  for (const text of [
    `${canonical}\n`,
    duplicate,
    canonical.replace(/}$/, ',"extra":true}'),
    canonical.replace(wire.operationId, digest('f')),
  ]) {
    expectProtocolCode(
      () => parseZenonFundingProviderSigningChildResponseFrame(
        rawFrame(text),
        wire.operationId,
      ),
      code,
    );
  }
});

test('hostile request and response objects fail without invoking accessors', () => {
  const { authority, request, wire } = protocolFixture();
  let getterCalls = 0;
  const accessor = { authorityRecord: authority };
  Object.defineProperty(accessor, 'request', {
    enumerable: true,
    get() { getterCalls += 1; throw new Error('not invoked'); },
  });
  const cycle = { authorityRecord: authority, request: null };
  cycle.request = cycle;
  const requestCode = 'ZENON_FUNDING_PROVIDER_SIGNING_PROTOCOL_INVALID_REQUEST';
  for (const hostile of [
    new Proxy({ authorityRecord: authority, request }, {}),
    accessor,
    cycle,
    { authorityRecord: authority, request, approved: true },
  ]) {
    expectProtocolCode(
      () => createZenonFundingProviderSigningChildRequest(hostile),
      requestCode,
    );
  }
  assert.equal(getterCalls, 0);
  const responseCode = 'ZENON_FUNDING_PROVIDER_SIGNING_PROTOCOL_INVALID_RESPONSE';
  for (const hostile of [
    new Proxy(responseFor(wire), {}),
    { ...responseFor(wire), then() {} },
    { ...responseFor(wire), envelope: { signature: 'A'.repeat(600_000) } },
  ]) {
    expectProtocolCode(
      () => createZenonFundingProviderSigningChildResponse(hostile),
      responseCode,
    );
  }
});

test('approval cannot be supplied as a flag and rejection reasons are closed allowlists', () => {
  const { wire } = protocolFixture();
  const base = responseFor(wire);
  const code = 'ZENON_FUNDING_PROVIDER_SIGNING_PROTOCOL_INVALID_RESPONSE';
  for (const hostile of [
    { ...base, approved: true },
    { ...base, reasonCode: 'APPROVED' },
    { ...base, status: 'READY', reasonCode: null, envelope: null },
    { ...base, status: 'REJECTED', reasonCode: 'arbitrary' },
    {
      ...responseFor(wire, 'READY'),
      envelope: {
        ...responseFor(wire, 'READY').envelope,
        signature: `${'A'.repeat(85)}B`,
      },
    },
  ]) {
    expectProtocolCode(
      () => createZenonFundingProviderSigningChildResponse(hostile),
      code,
    );
  }
});

test('request-frame parsing requires the independently pinned authority', () => {
  const { authority, wire } = protocolFixture();
  const frame = frameZenonFundingProviderSigningChildRequest(wire, authority);
  const code = 'ZENON_FUNDING_PROVIDER_SIGNING_PROTOCOL_INVALID_REQUEST';
  expectProtocolCode(
    () => parseZenonFundingProviderSigningChildRequestFrame(frame),
    code,
  );
  const otherAuthority = authorityFixture().authority;
  expectProtocolCode(
    () => parseZenonFundingProviderSigningChildRequestFrame(frame, otherAuthority),
    code,
  );
  const changed = structuredClone(wire);
  changed.attestationRequest.unsignedFundingEvidence.amount = '8';
  expectProtocolCode(
    () => parseZenonFundingProviderSigningChildRequestFrame(
      rawFrame(canonicalJson(changed)),
      authority,
    ),
    code,
  );
});

test('request framing requires the pinned authority and rejects every nested semantic drift', () => {
  const { authority, wire } = protocolFixture();
  const code = 'ZENON_FUNDING_PROVIDER_SIGNING_PROTOCOL_INVALID_REQUEST';
  expectProtocolCode(() => frameZenonFundingProviderSigningChildRequest(wire), code);
  const mutators = [
    value => { value.attestationRequest.authorityRecordDigest = digest('f'); },
    value => { value.attestationRequest.generationCommitment = digest('f'); },
    value => { value.attestationRequest.keyId = 'provider.attestation.other'; },
    value => { value.attestationRequest.attestationId = digest('f'); },
    value => { value.attestationRequest.sourcePolicyCommitment = digest('f'); },
    value => { value.attestationRequest.audienceDigest = digest('f'); },
    value => { value.attestationRequest.unsignedFundingEvidence.expiresAt += 1; },
    value => { value.attestationRequest.unsignedFundingEvidence.amount = '8'; },
  ];
  for (const mutate of mutators) {
    const changed = structuredClone(wire);
    mutate(changed);
    expectProtocolCode(
      () => frameZenonFundingProviderSigningChildRequest(changed, authority),
      code,
    );
  }
  expectProtocolCode(
    () => frameZenonFundingProviderSigningChildRequest(wire, {
      ...authority,
      publicKey: 'not_base64url',
    }),
    code,
  );
  expectProtocolCode(
    () => frameZenonFundingProviderSigningChildRequest(
      new Proxy(structuredClone(wire), {}),
      authority,
    ),
    code,
  );
});

test('response accessors and prototype-pollution fields are rejected without evaluation', () => {
  const { wire } = protocolFixture();
  let getterCalls = 0;
  const accessor = structuredClone(responseFor(wire));
  Object.defineProperty(accessor, 'status', {
    enumerable: true,
    get() { getterCalls += 1; return 'APPROVAL_REQUIRED'; },
  });
  const polluted = { ...responseFor(wire), __proto__: { approved: true } };
  const code = 'ZENON_FUNDING_PROVIDER_SIGNING_PROTOCOL_INVALID_RESPONSE';
  expectProtocolCode(() => createZenonFundingProviderSigningChildResponse(accessor), code);
  expectProtocolCode(() => createZenonFundingProviderSigningChildResponse(polluted), code);
  assert.equal(getterCalls, 0);
});
