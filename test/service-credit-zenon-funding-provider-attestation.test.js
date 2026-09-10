import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  createZenonFundingProviderAttestationSigningBytes,
  parseZenonFundingProviderAttestationAuthorityRecord,
  parseZenonFundingProviderAttestationRequest,
  verifyZenonFundingProviderAttestationEnvelope,
} from '../src/service-credit-zenon-funding-provider-attestation.js';

const NOW = 2_000_000_000;
const INITIAL_HEIGHT = 10;
const INITIAL_HASH = 'a'.repeat(64);
const TRANSACTION_HASH = 'c'.repeat(64);
const ATTESTATION_ID_DOMAIN = 'zenon-x402:funding-provider-attestation-id-v1';
const FUNDING_EVIDENCE_DOMAIN = 'zenon-x402:funding-provider-attestation-evidence-v1';
const SIGNING_DOMAIN = Buffer.from(
  'zenon-x402:funding-provider-attestation-signature-v1\0',
  'ascii',
);

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function digest(fill) {
  return `sha256:${fill.repeat(64)}`;
}

function commitment(domain, value) {
  return `sha256:${createHash('sha256')
    .update(domain)
    .update('\0')
    .update(canonicalJson(value))
    .digest('hex')}`;
}

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

function reboundRequest(request, mutate) {
  const changed = structuredClone(request);
  mutate(changed);
  changed.unsignedFundingEvidenceDigest = commitment(
    FUNDING_EVIDENCE_DOMAIN,
    changed.unsignedFundingEvidence,
  );
  changed.attestationId = commitment(ATTESTATION_ID_DOMAIN, requestIdentity(changed));
  return changed;
}

function rawSigningBytes(request, issuedAt, validUntil) {
  return Buffer.concat([SIGNING_DOMAIN, Buffer.from(canonicalJson({
    signaturePayloadVersion: 1,
    algorithm: 'Ed25519',
    request,
    issuedAt,
    validUntil,
  }))]);
}

function requestFixture(fixture, recordOverrides = {}) {
  const payment = target();
  const unsignedFundingEvidence = {
    evidenceVersion: 1,
    evidenceType: 'zenon-authenticated-funding-evidence',
    authorityProfileId: fixture.authority.authorityProfileId,
    authorityProfileVersion: fixture.authority.authorityProfileVersion,
    verifierVersion: fixture.authority.verifierVersion,
    authorityRecordDigest: fixture.authority.authorityRecordDigest,
    network: fixture.authority.network,
    chainProfile: structuredClone(fixture.authority.chainProfile),
    transactionId: payment.transactionId,
    payer: payment.payer,
    payee: payment.payee,
    asset: payment.asset,
    amount: payment.amount,
    paymentResourceDigest: payment.paymentResourceDigest,
    paymentRequirementDigest: payment.paymentRequirementDigest,
    paymentIntentDigest: payment.paymentIntentDigest,
    resourceBinding: payment.resourceBinding,
    offerId: payment.offerId,
    offerVersion: payment.offerVersion,
    fundingPolicyId: payment.fundingPolicyId,
    fundingPolicyVersion: payment.fundingPolicyVersion,
    capabilityCommitment: payment.capabilityCommitment,
    totalUnits: payment.totalUnits,
    expiresAt: payment.expiresAt,
    grantFundingCommitment: payment.grantFundingCommitment,
    inclusionEvidence: {
      state: 'MOMENTUM_INCLUDED',
      transactionHash: TRANSACTION_HASH,
      momentumHeight: INITIAL_HEIGHT + 1,
      momentumHash: momentumHash(INITIAL_HEIGHT + 1),
      observedConfirmations: fixture.authority.confirmationPolicy.minimumConfirmations,
    },
    confirmationPolicy: structuredClone(fixture.authority.confirmationPolicy),
    ...recordOverrides,
  };
  const base = {
    requestVersion: 1,
    requestType: 'zenon-funding-provider-attestation-request',
    recordKey: digest('9'),
    authorityRecordDigest: fixture.authority.authorityRecordDigest,
    generationCommitment: fixture.authority.authorityGeneration.generationCommitment,
    keyId: fixture.authority.keyId,
    audienceDigest: digest('a'),
    observerRecordId: digest('b'),
    targetBindingDigest: digest('c'),
    candidateDigest: digest('d'),
    inclusionAuthorizationId: digest('e'),
    bootstrapCheckpoint: structuredClone(fixture.authority.bootstrapCheckpoint),
    sourcePolicyCommitment: fixture.authority.sourcePolicyCommitment,
    unsignedFundingEvidenceDigest: commitment(
      FUNDING_EVIDENCE_DOMAIN,
      unsignedFundingEvidence,
    ),
  };
  return {
    ...base,
    attestationId: commitment(ATTESTATION_ID_DOMAIN, base),
    unsignedFundingEvidence,
  };
}

function momentumHash(height) {
  return Buffer.from(`provider-attestation-momentum-${height}`)
    .toString('hex')
    .padEnd(64, '0')
    .slice(0, 64);
}

function authorityFixture(overrides = {}, keys = generateKeyPairSync('ed25519')) {
  const encoded = keys.publicKey.export({ format: 'der', type: 'spki' });
  const record = {
    authorityRecordVersion: 1,
    authorityProfileId: 'zenon.provider-attestation',
    authorityProfileVersion: 1,
    verifierVersion: 1,
    providerAuthorityId: 'provider.reference',
    generationId: 'provider.attestation.generation',
    generationVersion: 1,
    keyId: 'provider.attestation.key',
    algorithm: 'Ed25519',
    publicKey: encoded.subarray(-32).toString('base64url'),
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
    bootstrapCheckpoint: { height: INITIAL_HEIGHT, hash: INITIAL_HASH },
    sourcePolicyCommitment: digest('8'),
    maximumAttestationBytes: 4096,
    maximumCanonicalBytes: 524288,
    maximumInitialAgeSeconds: 300,
    maximumFutureSkewSeconds: 5,
    maximumValiditySeconds: 300,
    ...overrides,
  };
  return { keys, text: canonicalJson(record) };
}

function target(overrides = {}) {
  return {
    transactionId: `zenontx:${TRANSACTION_HASH}`,
    payer: 'z1syntheticpayer',
    payee: 'z1syntheticpayee',
    asset: 'zts1syntheticasset',
    amount: '7',
    scheme: 'exact',
    paymentFlow: 'upfront',
    settlement: 'account-block',
    network: 'zenon:testnet',
    providerId: 'provider.reference',
    serviceId: 'service.reference',
    resourceId: 'resource.zenon.funding',
    resourceBinding: digest('1'),
    paymentResourceDigest: digest('2'),
    paymentRequirementDigest: digest('3'),
    paymentIntentDigest: digest('4'),
    offerId: 'offer.zenon.reference',
    offerVersion: 1,
    fundingPolicyId: 'funding.exact.zenon.observer',
    fundingPolicyVersion: 1,
    capabilityCommitment: digest('5'),
    totalUnits: 10,
    expiresAt: NOW + 10_000,
    grantFundingCommitment: digest('6'),
    ...overrides,
  };
}

function envelopeFor(fixture, request, overrides = {}) {
  const issuedAt = NOW;
  const validUntil = NOW + 120;
  const bytes = createZenonFundingProviderAttestationSigningBytes({
    request,
    issuedAt,
    validUntil,
  });
  return {
    envelopeVersion: 1,
    attestationId: request.attestationId,
    keyId: fixture.authority.keyId,
    issuedAt,
    validUntil,
    signature: sign(null, bytes, fixture.keys.privateKey).toString('base64url'),
    ...overrides,
  };
}

function rawEnvelopeFor(fixture, request, overrides = {}) {
  const issuedAt = overrides.issuedAt ?? NOW;
  const validUntil = overrides.validUntil ?? NOW + 120;
  return {
    envelopeVersion: 1,
    attestationId: request.attestationId,
    keyId: fixture.authority.keyId,
    issuedAt,
    validUntil,
    signature: sign(
      null,
      rawSigningBytes(request, issuedAt, validUntil),
      fixture.keys.privateKey,
    ).toString('base64url'),
  };
}

test('authority records are canonical, pinned, detached, and deeply frozen', () => {
  const fixture = authorityFixture();
  const authority = parseZenonFundingProviderAttestationAuthorityRecord(fixture.text);
  assert.equal(authority.algorithm, 'Ed25519');
  assert.equal(authority.authorityProfile.recordDigest, authority.authorityRecordDigest);
  assert.equal(authority.authorityGeneration.generationId, authority.generationId);
  assert.equal(Object.isFrozen(authority), true);
  assert.equal(Object.isFrozen(authority.authorityProfile), true);
  assert.throws(
    () => parseZenonFundingProviderAttestationAuthorityRecord(`${fixture.text}\n`),
    error => error?.code === 'ZENON_FUNDING_PROVIDER_ATTESTATION_INVALID_AUTHORITY',
  );
});

test('the pure module is inert and exposes no signer or caller-state authority path', async () => {
  const source = readFileSync(
    new URL('../src/service-credit-zenon-funding-provider-attestation.js', import.meta.url),
    'utf8',
  );
  const imports = [...source.matchAll(/from '([^']+)'/g)].map(match => match[1]).sort();
  assert.deepEqual(imports, ['node:crypto', 'node:util']);
  for (const forbidden of [
    'node:fs', 'node:http', 'node:https', 'node:net', 'node:tls', 'WebSocket',
    'fetch(', 'process.env', 'setTimeout(', 'setInterval(', 'createPrivateKey',
    'generateKeyPair', 'service-credit-zenon-funding-observer-state',
  ]) {
    assert.equal(source.includes(forbidden), false);
  }
  const module = await import('../src/service-credit-zenon-funding-provider-attestation.js');
  assert.equal(Object.hasOwn(module, 'deriveZenonFundingProviderAttestationRequest'), false);
  assert.equal(Object.hasOwn(module, 'signZenonFundingProviderAttestation'), false);
});

test('authority, request, and envelope exact schemas reject hostile shapes', () => {
  const base = authorityFixture();
  const fixture = {
    ...base,
    authority: parseZenonFundingProviderAttestationAuthorityRecord(base.text),
  };
  for (const mutate of [
    value => { value.algorithm = 'dynamic'; },
    value => { value.publicKey = value.publicKey.slice(1); },
    value => { value.network = 'zenon:other'; },
    value => { value.extra = true; },
  ]) {
    const record = JSON.parse(base.text);
    mutate(record);
    assert.throws(
      () => parseZenonFundingProviderAttestationAuthorityRecord(canonicalJson(record)),
      error => error?.code === 'ZENON_FUNDING_PROVIDER_ATTESTATION_INVALID_AUTHORITY',
    );
  }
  const request = requestFixture(fixture);
  const envelope = envelopeFor(fixture, request);
  assert.throws(
    () => parseZenonFundingProviderAttestationRequest({
      authorityRecord: fixture.authority,
      request: new Proxy(structuredClone(request), {}),
    }),
    error => error?.code === 'ZENON_FUNDING_PROVIDER_ATTESTATION_INVALID_INPUT',
  );
  const accessor = structuredClone(envelope);
  Object.defineProperty(accessor, 'signature', {
    enumerable: true,
    get() { throw new Error('must not execute'); },
  });
  const cycle = structuredClone(envelope);
  cycle.extra = cycle;
  for (const hostile of [
    new Proxy(structuredClone(envelope), {}),
    accessor,
    cycle,
    { ...envelope, extra: true },
    { ...envelope, signature: 'x'.repeat(600_000) },
  ]) {
    assert.throws(
      () => verifyZenonFundingProviderAttestationEnvelope({
        authorityRecord: fixture.authority,
        request,
        envelope: hostile,
        nowEpochSeconds: NOW,
        replayMode: 'INITIAL',
      }),
      error => error?.name === 'ZenonFundingProviderAttestationError',
    );
  }
});

test('initial freshness and committed replay use distinct fail-closed windows', () => {
  const base = authorityFixture();
  const fixture = {
    ...base,
    authority: parseZenonFundingProviderAttestationAuthorityRecord(base.text),
  };
  const request = requestFixture(fixture);
  for (const envelope of [
    envelopeFor(fixture, request, { issuedAt: NOW + 6, validUntil: NOW + 100 }),
    envelopeFor(fixture, request, { issuedAt: NOW - 301, validUntil: NOW + 1 }),
    envelopeFor(fixture, request, { issuedAt: NOW - 100, validUntil: NOW }),
  ]) {
    assert.throws(
      () => verifyZenonFundingProviderAttestationEnvelope({
        authorityRecord: fixture.authority,
        request,
        envelope,
        nowEpochSeconds: NOW,
        replayMode: 'INITIAL',
      }),
      error => error?.code === 'ZENON_FUNDING_PROVIDER_ATTESTATION_REJECTED',
    );
  }
  const expired = envelopeFor(fixture, request);
  const replay = verifyZenonFundingProviderAttestationEnvelope({
    authorityRecord: fixture.authority,
    request,
    envelope: expired,
    nowEpochSeconds: NOW + 10_000,
    replayMode: 'COMMITTED_REPLAY',
  });
  assert.equal(replay.attestationId, request.attestationId);
});

test('a pinned Ed25519 envelope authenticates only the exact signing request', () => {
  const base = authorityFixture();
  const fixture = {
    ...base,
    authority: parseZenonFundingProviderAttestationAuthorityRecord(base.text),
  };
  const request = requestFixture(fixture);
  const envelope = envelopeFor(fixture, request);
  const verified = verifyZenonFundingProviderAttestationEnvelope({
    authorityRecord: fixture.authority,
    request,
    envelope,
    nowEpochSeconds: NOW,
    replayMode: 'INITIAL',
  });
  assert.equal(verified.attestationId, request.attestationId);
  assert.equal(Object.hasOwn(verified, 'verifiedRecord'), false);
  assert.deepEqual(Object.keys(verified).sort(), ['attestationId', 'envelopeDigest']);
  assert.equal(Object.isFrozen(verified), true);
});

test('changed authority, audience, signed time, and signature fail closed', () => {
  const base = authorityFixture();
  const fixture = {
    ...base,
    authority: parseZenonFundingProviderAttestationAuthorityRecord(base.text),
  };
  const request = requestFixture(fixture);
  const envelope = envelopeFor(fixture, request);
  for (const changed of [
    { ...envelope, keyId: 'provider.attestation.other' },
    { ...envelope, validUntil: envelope.validUntil + 1 },
    { ...envelope, signature: Buffer.alloc(64).toString('base64url') },
  ]) {
    assert.throws(
      () => verifyZenonFundingProviderAttestationEnvelope({
        authorityRecord: fixture.authority,
        request,
        envelope: changed,
        nowEpochSeconds: NOW,
        replayMode: 'INITIAL',
      }),
      error => error?.code === 'ZENON_FUNDING_PROVIDER_ATTESTATION_REJECTED',
    );
  }
});

test('signed records outside the complete authenticated-evidence grammar fail closed', () => {
  const base = authorityFixture();
  const fixture = {
    ...base,
    authority: parseZenonFundingProviderAttestationAuthorityRecord(base.text),
  };
  const request = requestFixture(fixture);
  const mutations = [
    value => { value.unsignedFundingEvidence.payer = 'invalid/value'; },
    value => { value.unsignedFundingEvidence.payee = 'invalid/value'; },
    value => { value.unsignedFundingEvidence.asset = 'invalid/value'; },
    value => { value.unsignedFundingEvidence.amount = '0'; },
    value => { value.unsignedFundingEvidence.amount = '1'.repeat(78); },
    value => { value.unsignedFundingEvidence.paymentIntentDigest = 'invalid'; },
    value => { value.unsignedFundingEvidence.totalUnits = 0; },
    value => { value.unsignedFundingEvidence.chainProfile.chainIdentifier = '0'; },
    value => { value.unsignedFundingEvidence.inclusionEvidence.momentumHeight = 0; },
    value => { value.unsignedFundingEvidence.inclusionEvidence.observedConfirmations = 2; },
    value => { value.unsignedFundingEvidence.inclusionEvidence.transactionHash = 'd'.repeat(64); },
    value => { value.unsignedFundingEvidence.evidenceType = 'operator-trusted'; },
  ];
  for (const mutate of mutations) {
    const changed = reboundRequest(request, mutate);
    assert.throws(
      () => verifyZenonFundingProviderAttestationEnvelope({
        authorityRecord: fixture.authority,
        request: changed,
        envelope: rawEnvelopeFor(fixture, changed),
        nowEpochSeconds: NOW,
        replayMode: 'INITIAL',
      }),
      error => error?.name === 'ZenonFundingProviderAttestationError',
    );
  }
});

test('authority-specific canonical request bytes are enforced at the exact boundary', () => {
  const keys = generateKeyPairSync('ed25519');
  const longIdentifier = prefix => `${prefix}${'x'.repeat(128 - prefix.length)}`;
  const authorityOverrides = {
    authorityProfileId: longIdentifier('a'),
    providerAuthorityId: longIdentifier('p'),
    generationId: longIdentifier('g'),
    keyId: longIdentifier('k'),
  };
  const recordOverrides = {
    payer: longIdentifier('p'),
    payee: longIdentifier('q'),
    asset: longIdentifier('a'),
    offerId: longIdentifier('o'),
    fundingPolicyId: longIdentifier('f'),
    amount: '1'.repeat(77),
  };
  const looseBase = authorityFixture(authorityOverrides, keys);
  const loose = {
    ...looseBase,
    authority: parseZenonFundingProviderAttestationAuthorityRecord(looseBase.text),
  };
  const observedBytes = Buffer.byteLength(canonicalJson(requestFixture(loose, recordOverrides)));
  assert.equal(observedBytes > 1024, true);

  const exactBase = authorityFixture({
    ...authorityOverrides,
    maximumCanonicalBytes: observedBytes,
  }, keys);
  const exact = {
    ...exactBase,
    authority: parseZenonFundingProviderAttestationAuthorityRecord(exactBase.text),
  };
  const exactRequest = requestFixture(exact, recordOverrides);
  assert.equal(Buffer.byteLength(canonicalJson(exactRequest)), observedBytes);
  assert.deepEqual(
    parseZenonFundingProviderAttestationRequest({
      authorityRecord: exact.authority,
      request: exactRequest,
    }),
    exactRequest,
  );
  verifyZenonFundingProviderAttestationEnvelope({
    authorityRecord: exact.authority,
    request: exactRequest,
    envelope: envelopeFor(exact, exactRequest),
    nowEpochSeconds: NOW,
    replayMode: 'INITIAL',
  });

  const overBase = authorityFixture({
    ...authorityOverrides,
    maximumCanonicalBytes: observedBytes - 1,
  }, keys);
  const over = {
    ...overBase,
    authority: parseZenonFundingProviderAttestationAuthorityRecord(overBase.text),
  };
  const overRequest = requestFixture(over, recordOverrides);
  assert.equal(Buffer.byteLength(canonicalJson(overRequest)), observedBytes);
  assert.throws(
    () => verifyZenonFundingProviderAttestationEnvelope({
      authorityRecord: over.authority,
      request: overRequest,
      envelope: rawEnvelopeFor(over, overRequest),
      nowEpochSeconds: NOW,
      replayMode: 'INITIAL',
    }),
    error => error?.code === 'ZENON_FUNDING_PROVIDER_ATTESTATION_REJECTED',
  );
});

test('no public API derives #104 evidence from caller-supplied observer state', async () => {
  const module = await import('../src/service-credit-zenon-funding-provider-attestation.js');
  assert.equal(Object.hasOwn(module, 'deriveZenonFundingProviderAttestationRequest'), false);
  assert.equal(Object.hasOwn(module, 'projectZenonFundingEvidence'), false);
});
