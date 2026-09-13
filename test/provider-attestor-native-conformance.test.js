import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  chmodSync,
  copyFileSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync as nodeSpawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { isDeepStrictEqual } from 'node:util';

import {
  createZenonFundingProviderAttestationSigningBytes,
  parseZenonFundingProviderAttestationAuthorityRecord,
  parseZenonFundingProviderAttestationRequest,
  verifyZenonFundingProviderAttestationEnvelope,
} from '../src/service-credit-zenon-funding-provider-attestation.js';
import {
  createZenonFundingProviderSigningChildRequest,
  deriveZenonFundingProviderSigningOperationId,
  frameZenonFundingProviderSigningChildRequest,
  parseZenonFundingProviderSigningChildRequestFrame,
  parseZenonFundingProviderSigningChildResponseFrame,
  ZENON_FUNDING_PROVIDER_SIGNING_CHILD_REQUEST_MAXIMUM_PAYLOAD_BYTES,
} from '../src/service-credit-zenon-provider-signing-child-protocol.js';

const NOW = 2_000_000_000;
const ATTESTATION_ID_DOMAIN = 'zenon-x402:funding-provider-attestation-id-v1';
const FUNDING_EVIDENCE_DOMAIN = 'zenon-x402:funding-provider-attestation-evidence-v1';
const ZERO_HASH = '0'.repeat(64);

function sanitizedNativeFailure(category) {
  const error = new Error(category);
  error.stack = category;
  return error;
}

function spawnSync(...args) {
  try {
    const result = nodeSpawnSync(...args);
    if (result === null || result === undefined || result.error !== undefined) {
      throw sanitizedNativeFailure('native fixture spawn failed');
    }
    return result;
  } catch {
    throw sanitizedNativeFailure('native fixture spawn failed');
  }
}

function assertNativeBuildSucceeded(result, category) {
  if (result?.status !== 0) throw sanitizedNativeFailure(category);
}

function assertEmptyNativeOutput(output, category) {
  if (output?.length !== 0) throw sanitizedNativeFailure(category);
}

async function runSanitizedNativeCase(name, callback, context) {
  try { return await callback(context); } catch {
    throw sanitizedNativeFailure(`native conformance case failed: ${name}`);
  }
}

function nativeConformanceTest(name, callback) {
  return test(name, t => runSanitizedNativeCase(name, callback, t));
}

function afterNativeCleanup(t, path, claimedIdentity = null) {
  t.after(() => {
    try {
      if (claimedIdentity !== null) {
        const claim = claimedIdentity();
        if (!sameManualRootIdentity(captureManualRootIdentity(path), claim)) {
          throw sanitizedNativeFailure('native fixture cleanup failed');
        }
      }
      rmSync(path, { recursive: true, force: true });
    } catch {
      throw sanitizedNativeFailure('native fixture cleanup failed');
    }
  });
}

function captureManualRootIdentity(path) {
  const parent = realpathSync('/private/tmp');
  if (parent !== '/private/tmp' || dirname(path) !== parent
      || !/^ProviderAttestorSyntheticManualGUI-[0-9a-f]{16}$/.test(basename(path))) {
    throw sanitizedNativeFailure('native manual fixture identity invalid');
  }
  const base = lstatSync(parent, { bigint: true });
  const root = lstatSync(path, { bigint: true });
  if (!base.isDirectory() || base.isSymbolicLink() || base.uid !== 0n
      || (base.mode & 0o7777n) !== 0o1777n
      || !root.isDirectory() || root.isSymbolicLink()
      || root.uid !== BigInt(process.geteuid())
      || (root.mode & 0o7777n) !== 0o700n) {
    throw sanitizedNativeFailure('native manual fixture identity invalid');
  }
  const identity = value => Object.freeze({
    dev: value.dev, ino: value.ino, uid: value.uid, gid: value.gid, mode: value.mode,
  });
  return Object.freeze({ parent: identity(base), root: identity(root) });
}

function sameManualRootIdentity(left, right) {
  if (left === null || right === null) return false;
  for (const section of ['parent', 'root']) {
    for (const field of ['dev', 'ino', 'uid', 'gid', 'mode']) {
      if (left[section]?.[field] !== right[section]?.[field]) return false;
    }
  }
  return true;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function commitment(domain, value) {
  return `sha256:${createHash('sha256')
    .update(domain, 'ascii').update('\0', 'ascii').update(canonicalJson(value), 'utf8')
    .digest('hex')}`;
}

function digest(fill) {
  return `sha256:${fill.repeat(64)}`;
}

function fixedSyntheticVector({
  keyId = 'provider.synthetic.non-live.key',
  publicKey = Buffer.from(Array.from({ length: 32 }, (_unused, index) => index + 1))
    .toString('base64url'),
  transactionHash = 'c'.repeat(64),
  momentumHash = 'd'.repeat(64),
  maximumCanonicalBytes = 524288,
} = {}) {
  const authorityText = canonicalJson({
    authorityRecordVersion: 1,
    authorityProfileId: 'zenon.provider-attestation.synthetic',
    authorityProfileVersion: 1,
    verifierVersion: 1,
    providerAuthorityId: 'provider.synthetic.non-live',
    generationId: 'provider.synthetic.non-live.generation',
    generationVersion: 1,
    keyId,
    algorithm: 'Ed25519',
    publicKey,
    network: 'zenon:testnet',
    chainProfile: {
      version: 1,
      chainIdentifier: '12345',
      genesisMomentumHash: '1'.repeat(64),
    },
    observerPolicy: {
      policyId: 'zenon.synthetic-observer',
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
    maximumCanonicalBytes,
    maximumInitialAgeSeconds: 300,
    maximumFutureSkewSeconds: 5,
    maximumValiditySeconds: 300,
  });
  const authority = parseZenonFundingProviderAttestationAuthorityRecord(authorityText);
  const evidence = {
    evidenceVersion: 1,
    evidenceType: 'zenon-authenticated-funding-evidence',
    authorityProfileId: authority.authorityProfileId,
    authorityProfileVersion: authority.authorityProfileVersion,
    verifierVersion: authority.verifierVersion,
    authorityRecordDigest: authority.authorityRecordDigest,
    network: authority.network,
    chainProfile: structuredClone(authority.chainProfile),
    transactionId: `zenontx:${transactionHash}`,
    payer: 'z1syntheticnonlivepayer',
    payee: 'z1syntheticnonlivepayee',
    asset: 'zts1syntheticnonliveasset',
    amount: '7',
    paymentResourceDigest: digest('1'),
    paymentRequirementDigest: digest('2'),
    paymentIntentDigest: digest('3'),
    resourceBinding: digest('4'),
    offerId: 'offer.synthetic.non-live',
    offerVersion: 1,
    fundingPolicyId: 'funding.synthetic.non-live',
    fundingPolicyVersion: 1,
    capabilityCommitment: digest('5'),
    totalUnits: 10,
    expiresAt: NOW + 10_000,
    grantFundingCommitment: digest('6'),
    inclusionEvidence: {
      state: 'MOMENTUM_INCLUDED',
      transactionHash,
      momentumHeight: 11,
      momentumHash,
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
    unsignedFundingEvidenceDigest: commitment(FUNDING_EVIDENCE_DOMAIN, evidence),
  };
  const request = {
    ...base,
    attestationId: commitment(ATTESTATION_ID_DOMAIN, base),
    unsignedFundingEvidence: evidence,
  };
  const wire = createZenonFundingProviderSigningChildRequest({ authorityRecord: authority, request });
  const frame = frameZenonFundingProviderSigningChildRequest(wire, authority);
  const validUntil = NOW + 120;
  const signingMessage = createZenonFundingProviderAttestationSigningBytes({
    request,
    issuedAt: NOW,
    validUntil,
  });
  return { authorityText, authority, wire, frame, signingMessage, validUntil };
}

function nativeConformance(executable, temporary, label, authorityText, frame, validUntil) {
  const authorityPath = join(temporary, `${label}-authority.json`);
  const framePath = join(temporary, `${label}-request.frame`);
  writeFileSync(authorityPath, authorityText, { mode: 0o600 });
  writeFileSync(framePath, frame, { mode: 0o600 });
  const result = spawnSync(executable, [
    authorityPath, framePath, `${NOW}`, `${validUntil}`,
  ], { encoding: 'utf8', env: {} });
  assertEmptyNativeOutput(result.stderr, 'native conformance emitted standard error');
  return { result, framePath };
}

function frameCanonicalWire(wire) {
  const payload = Buffer.from(canonicalJson(wire), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length);
  return Buffer.concat([header, payload]);
}

nativeConformanceTest('synthetic JS/native parser boundaries agree on inclusion hashes and canonical framing', t => {
  if (process.platform !== 'darwin') {
    t.skip('native provider attestor is macOS-only');
    return;
  }
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const nativeDirectory = join(root, 'native', 'provider-attestor');
  const temporary = mkdtempSync(join(tmpdir(), 'provider-attestor-conformance-'));
  afterNativeCleanup(t, temporary);
  const buildDirectory = join(temporary, 'build');
  const compiled = spawnSync('/usr/bin/make', [
    '-C', nativeDirectory, 'conformance', `BUILD_DIR=${buildDirectory}`,
  ], { encoding: 'utf8' });
  assertNativeBuildSucceeded(compiled, 'native conformance build failed');

  const executable = join(buildDirectory, 'provider-attestor-conformance');
  const maxKeyId = 'k'.repeat(128);
  const loose = fixedSyntheticVector({ keyId: maxKeyId });
  const innerBytes = Buffer.byteLength(canonicalJson(loose.wire.attestationRequest));
  const cases = [
    ['baseline', fixedSyntheticVector()],
    ['zero-transaction-hash', fixedSyntheticVector({ transactionHash: ZERO_HASH })],
    ['zero-momentum-hash', fixedSyntheticVector({ momentumHash: ZERO_HASH })],
    ['maximum-key-id', fixedSyntheticVector({
      keyId: maxKeyId, maximumCanonicalBytes: innerBytes,
    })],
  ];
  for (const [label, vector] of cases) {
    assert.equal(isDeepStrictEqual(parseZenonFundingProviderSigningChildRequestFrame(
      vector.frame, vector.authority,
    ), vector.wire), true, 'native signing request did not match synthetic control');
    assert.equal(isDeepStrictEqual(parseZenonFundingProviderAttestationRequest({
      authorityRecord: vector.authority,
      request: vector.wire.attestationRequest,
    }), vector.wire.attestationRequest), true,
    'native attestation request did not match synthetic control');
    const { result, framePath } = nativeConformance(
      executable, temporary, label, vector.authorityText, vector.frame, vector.validUntil,
    );
    assert.equal(result.status, 0, `${label} native conformance failed`);
    let observed;
    try { observed = JSON.parse(result.stdout); } catch {
      throw sanitizedNativeFailure('native conformance response invalid');
    }
    assert.equal(observed.canonicalFrame === vector.frame.toString('base64url'), true,
      'native canonical frame did not match synthetic control');
    assert.equal(observed.signingMessage === vector.signingMessage.toString('base64url'), true,
      'native signing message did not match synthetic control');
    assert.equal(readFileSync(framePath).equals(vector.frame), true, label);
  }
  const maximum = cases.at(-1)[1];
  assert.equal(Buffer.byteLength(canonicalJson(maximum.wire.attestationRequest)), innerBytes);
  assert.equal(maximum.frame.readUInt32BE(0), innerBytes + 610);
  assert.equal(ZENON_FUNDING_PROVIDER_SIGNING_CHILD_REQUEST_MAXIMUM_PAYLOAD_BYTES,
    (512 * 1024) + 610);
  assert.equal(maximum.frame.readUInt32BE(0)
    <= ZENON_FUNDING_PROVIDER_SIGNING_CHILD_REQUEST_MAXIMUM_PAYLOAD_BYTES, true);

  const oversized = Buffer.alloc(ZENON_FUNDING_PROVIDER_SIGNING_CHILD_REQUEST_MAXIMUM_PAYLOAD_BYTES + 5);
  oversized.writeUInt32BE(ZENON_FUNDING_PROVIDER_SIGNING_CHILD_REQUEST_MAXIMUM_PAYLOAD_BYTES + 1);
  assert.throws(() => parseZenonFundingProviderSigningChildRequestFrame(
    oversized, maximum.authority,
  ));
  const overCap = nativeConformance(executable, temporary, 'over-wrapper-cap',
    maximum.authorityText, oversized, maximum.validUntil).result;
  assert.notEqual(overCap.status, 0);
  assertEmptyNativeOutput(overCap.stdout, 'oversized native frame emitted standard output');

  const zeroTransaction = cases[1][1];
  const bothZeroRequest = structuredClone(zeroTransaction.wire.attestationRequest);
  bothZeroRequest.unsignedFundingEvidence.inclusionEvidence.momentumHash = ZERO_HASH;
  bothZeroRequest.unsignedFundingEvidenceDigest = commitment(
    FUNDING_EVIDENCE_DOMAIN, bothZeroRequest.unsignedFundingEvidence,
  );
  const identity = { ...bothZeroRequest };
  delete identity.attestationId;
  delete identity.unsignedFundingEvidence;
  bothZeroRequest.attestationId = commitment(ATTESTATION_ID_DOMAIN, identity);
  const bothZeroWire = {
    ...zeroTransaction.wire,
    attestationId: bothZeroRequest.attestationId,
    attestationRequest: bothZeroRequest,
  };
  bothZeroWire.operationId = deriveZenonFundingProviderSigningOperationId({
    authorityRecordDigest: bothZeroWire.authorityRecordDigest,
    generationCommitment: bothZeroWire.generationCommitment,
    keyId: bothZeroWire.keyId,
    attestationId: bothZeroWire.attestationId,
  });
  const bothZeroFrame = frameCanonicalWire(bothZeroWire);
  assert.throws(() => parseZenonFundingProviderSigningChildRequestFrame(
    bothZeroFrame, zeroTransaction.authority,
  ));
  const bothZeroNative = nativeConformance(executable, temporary, 'both-inclusion-hashes-zero',
    zeroTransaction.authorityText, bothZeroFrame, zeroTransaction.validUntil).result;
  assert.notEqual(bothZeroNative.status, 0);
  assertEmptyNativeOutput(bothZeroNative.stdout, 'invalid inclusion emitted standard output');

  const baseline = cases[0][1];
  for (const [label, mutate] of [
    ['zero-genesis-hash', authority => { authority.chainProfile.genesisMomentumHash = ZERO_HASH; }],
    ['zero-bootstrap-hash', authority => { authority.bootstrapCheckpoint.hash = ZERO_HASH; }],
  ]) {
    const authority = JSON.parse(baseline.authorityText);
    mutate(authority);
    const text = canonicalJson(authority);
    assert.throws(() => parseZenonFundingProviderAttestationAuthorityRecord(text), label);
    const rejected = nativeConformance(executable, temporary, label,
      text, baseline.frame, baseline.validUntil).result;
    assert.notEqual(rejected.status, 0, label);
    assertEmptyNativeOutput(rejected.stdout, 'rejected native frame emitted standard output');
  }

  // The standalone native canonical-JSON grammar sorts object keys by UTF-16
  // code units and requires the same Unicode escaping as JSON.stringify.
  const unicodeValue = { '\uE000': '\u2028\u0001\\', '\u{10000}': '🧪' };
  const canonicalUnicode = canonicalJson(unicodeValue);
  const unicodePath = join(temporary, 'unicode-canonical.json');
  writeFileSync(unicodePath, canonicalUnicode, { mode: 0o600 });
  const unicodeNative = spawnSync(executable, ['--canonical-json', unicodePath], {
    encoding: 'utf8', env: {},
  });
  assert.equal(unicodeNative.status, 0, 'native canonical Unicode parser failed');
  assertEmptyNativeOutput(unicodeNative.stderr, 'native canonicalizer emitted standard error');
  assert.equal(unicodeNative.stdout === canonicalUnicode, true,
    'native canonicalizer returned unexpected bytes');
  const nonCanonicalUnicode = `{"\uE000":${JSON.stringify(unicodeValue['\uE000'])},`
    + `"\u{10000}":${JSON.stringify(unicodeValue['\u{10000}'])}}`;
  assert.notEqual(nonCanonicalUnicode, canonicalUnicode);
  const nonCanonicalPath = join(temporary, 'unicode-noncanonical.json');
  writeFileSync(nonCanonicalPath, nonCanonicalUnicode, { mode: 0o600 });
  const nonCanonicalNative = spawnSync(executable, ['--canonical-json', nonCanonicalPath], {
    encoding: 'utf8', env: {},
  });
  assert.notEqual(nonCanonicalNative.status, 0);
  assertEmptyNativeOutput(nonCanonicalNative.stdout,
    'noncanonical native frame emitted standard output');
  const escapedUnicode = canonicalUnicode.replace('\u2028', '\\u2028');
  assert.notEqual(escapedUnicode, canonicalUnicode);
  const escapedPath = join(temporary, 'unicode-escaped.json');
  writeFileSync(escapedPath, escapedUnicode, { mode: 0o600 });
  const escapedNative = spawnSync(executable, ['--canonical-json', escapedPath], {
    encoding: 'utf8', env: {},
  });
  assert.notEqual(escapedNative.status, 0);
  assertEmptyNativeOutput(escapedNative.stdout, 'escaped native frame emitted standard output');
});

function buildProtocolChild(t) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const nativeDirectory = join(root, 'native', 'provider-attestor');
  const temporary = mkdtempSync(join(tmpdir(), 'provider-attestor-protocol-child-'));
  afterNativeCleanup(t, temporary);
  const buildDirectory = join(temporary, 'build');
  const compiled = spawnSync('/usr/bin/make', [
    '-C', nativeDirectory, 'conformance-only', `BUILD_DIR=${buildDirectory}`,
  ], { encoding: 'utf8' });
  assert.equal(compiled.status, 0, 'native protocol child build failed');
  return join(buildDirectory, 'provider-attestor-protocol-child-conformance-only');
}

function buildTestPinnedProtocolChild(t) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const nativeDirectory = join(root, 'native', 'provider-attestor');
  const temporary = mkdtempSync(join(tmpdir(), 'provider-attestor-protocol-pinned-test-'));
  afterNativeCleanup(t, temporary);
  const vector = fixedSyntheticVector();
  const fixtureHeader = join(temporary, 'synthetic-child-pins.h');
  writeFileSync(fixtureHeader, [
    `#define PA_TEST_AUTHORITY_RECORD ${JSON.stringify(vector.authorityText)}`,
    `#define PA_TEST_AUTHORITY_RECORD_DIGEST ${JSON.stringify(vector.authority.authorityRecordDigest)}`,
    '#define PA_RELEASE_AUTHORITY_RECORD_DIGEST "synthetic-non-live"',
    '#define PA_RELEASE_PUBLIC_KEY "synthetic-non-live"',
    '#define PA_RELEASE_CONFIGURATION_DIGEST "synthetic-non-live"',
    '',
  ].join('\n'), { mode: 0o600 });
  const rejectedRelease = spawnSync('/usr/bin/make', [
    '-C', nativeDirectory, 'release-syntax-check', `RELEASE_PINS_HEADER=${fixtureHeader}`,
  ], { encoding: 'utf8' });
  assert.notEqual(rejectedRelease.status, 0, 'test-pinned child header must not compile as release');
  assert.equal(/Synthetic authority pins cannot enter the production entrypoint/
    .test(rejectedRelease.stderr), true, 'release macro guard diagnostic missing');
  const buildDirectory = join(temporary, 'build');
  const compiled = spawnSync('/usr/bin/make', [
    '-C', nativeDirectory, 'conformance-test-child', `BUILD_DIR=${buildDirectory}`,
    `CHILD_TEST_PINS_HEADER=${fixtureHeader}`,
  ], { encoding: 'utf8' });
  assert.equal(compiled.status, 0, 'synthetic native protocol child build failed');
  return { executable: join(buildDirectory, 'provider-attestor-protocol-child-synthetic-test'), vector };
}

async function assertTestPinnedControl(executable, vector) {
  const result = await exchangeWithProtocolChild(executable, vector.frame);
  assert.equal(result.code, 0);
  assert.equal(result.signal, null);
  assert.equal(result.stdout.length, 0);
  assert.equal(result.stderr.length, 0);
  assert.equal(result.response.readUInt32BE(0), result.response.length - 4);
  let response;
  try { response = JSON.parse(result.response.subarray(4).toString('utf8')); } catch {
    throw sanitizedNativeFailure('native protocol response invalid');
  }
  assert.equal(response.status === 'APPROVAL_REQUIRED', true,
    'native child approval status mismatch');
  assert.equal(response.operationId === vector.wire.operationId, true,
    'native child operation identity mismatch');
  assert.equal(response.envelope === null, true,
    'native child unexpectedly returned an envelope');
}

function exchangeWithProtocolChild(executable, frame) {
  return new Promise((resolve, reject) => {
    let child;
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      try { child?.kill('SIGKILL'); } catch {}
      reject(sanitizedNativeFailure('native protocol child spawn failed'));
    };
    try {
      child = spawn(executable, [], {
        env: {}, stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'],
      });
    } catch {
      fail();
      return;
    }
    const stdout = [];
    const stderr = [];
    const response = [];
    try {
      child.on('error', fail);
      child.stdout.on('error', fail);
      child.stderr.on('error', fail);
      child.stdio[3].on('error', fail);
      child.stdio[4].on('error', fail);
      child.stdout.on('data', chunk => stdout.push(chunk));
      child.stderr.on('data', chunk => stderr.push(chunk));
      child.stdio[4].on('data', chunk => response.push(chunk));
      child.on('close', (code, signal) => {
        if (settled) return;
        try {
          const result = {
            code, signal,
            stdout: Buffer.concat(stdout),
            stderr: Buffer.concat(stderr),
            response: Buffer.concat(response),
          };
          settled = true;
          resolve(result);
        } catch { fail(); }
      });
      child.stdio[3].end(frame);
    } catch { fail(); }
  });
}

nativeConformanceTest('native fixture failures expose only fixed categories', async () => {
  const expected = 'synthetic native build failed';
  const raw = 'synthetic private compiler diagnostic';
  assert.throws(() => assertNativeBuildSucceeded({ status: 1, stderr: raw }, expected),
    error => error.message === expected && error.stack === expected);
  assert.throws(() => assertEmptyNativeOutput(raw, expected),
    error => error.message === expected && error.stack === expected);
  assert.throws(() => spawnSync('/nonexistent/synthetic-native-compiler', [], {
    encoding: 'utf8',
  }), error => error.message === 'native fixture spawn failed'
    && error.stack === 'native fixture spawn failed');
  await assert.rejects(runSanitizedNativeCase('synthetic assertion privacy', () => {
    assert.equal(raw, 'expected synthetic result');
  }), error => error.message === 'native conformance case failed: synthetic assertion privacy'
    && error.stack === 'native conformance case failed: synthetic assertion privacy');
});

nativeConformanceTest('native protocol child spawn failures expose only a fixed category', async () => {
  await assert.rejects(
    exchangeWithProtocolChild('/nonexistent/synthetic-provider-attestor-child', Buffer.alloc(0)),
    error => error instanceof Error
      && error.message === 'native protocol child spawn failed'
      && error.stack === 'native protocol child spawn failed',
  );
});

nativeConformanceTest('manual synthetic cleanup preserves a substituted same-user root', t => {
  if (process.platform !== 'darwin') {
    t.skip('native provider attestor is macOS-only');
    return;
  }
  const holding = realpathSync(mkdtempSync(join(tmpdir(), 'pa-manual-cleanup-')));
  const holdingIdentity = lstatSync(holding, { bigint: true });
  const tag = randomBytes(8).toString('hex');
  const root = join(realpathSync('/private/tmp'), `ProviderAttestorSyntheticManualGUI-${tag}`);
  const replacement = join(holding, 'replacement');
  let originalIdentity = null;
  let replacementIdentity = null;
  try {
    assert.equal(existsSync(root), false);
    mkdirSync(root, { mode: 0o700 });
    originalIdentity = captureManualRootIdentity(root);
    mkdirSync(replacement, { mode: 0o700 });
    writeFileSync(join(replacement, 'sentinel'), 'preserve', { mode: 0o600 });
    renameSync(root, join(holding, 'original'));
    renameSync(replacement, root);
    replacementIdentity = captureManualRootIdentity(root);
    let cleanup;
    afterNativeCleanup({ after(callback) { cleanup = callback; } }, root, () => originalIdentity);
    assert.throws(cleanup, { message: 'native fixture cleanup failed' });
    assert.equal(readFileSync(join(root, 'sentinel'), 'utf8'), 'preserve');
  } finally {
    if (existsSync(root)) {
      const current = captureManualRootIdentity(root);
      if (!sameManualRootIdentity(current, originalIdentity)
          && !sameManualRootIdentity(current, replacementIdentity)) {
        throw sanitizedNativeFailure('native manual fixture test cleanup refused');
      }
      rmSync(root, { recursive: true });
    }
    const currentHolding = lstatSync(holding, { bigint: true });
    if (!currentHolding.isDirectory() || currentHolding.isSymbolicLink()
        || currentHolding.dev !== holdingIdentity.dev
        || currentHolding.ino !== holdingIdentity.ino
        || currentHolding.uid !== holdingIdentity.uid
        || currentHolding.gid !== holdingIdentity.gid
        || currentHolding.mode !== holdingIdentity.mode) {
      throw sanitizedNativeFailure('native manual fixture test cleanup refused');
    }
    rmSync(holding, { recursive: true });
  }
});

nativeConformanceTest('release candidate revalidates pins in a reused build directory', t => {
  if (process.platform !== 'darwin') {
    t.skip('native provider attestor is macOS-only');
    return;
  }
  const repository = dirname(dirname(fileURLToPath(import.meta.url)));
  const nativeDirectory = join(repository, 'native', 'provider-attestor');
  const temporary = mkdtempSync(join(tmpdir(), 'provider-attestor-release-pins-'));
  afterNativeCleanup(t, temporary);
  const buildDirectory = join(temporary, 'build');
  const candidate = join(buildDirectory, 'provider-attestor-release-candidate');
  const headerA = join(temporary, 'pins-a.h');
  const headerB = join(temporary, 'pins-b.h');
  const headerWithTestMacro = join(temporary, 'pins-test-macro.h');
  const markerA = 'inert-release-authority-pin-a';
  const markerB = 'inert-release-authority-pin-b';
  const pinHeader = marker => [
    `#define PA_RELEASE_AUTHORITY_RECORD_DIGEST ${JSON.stringify(marker)}`,
    '#define PA_RELEASE_PUBLIC_KEY "inert-release-public-key"',
    '#define PA_RELEASE_CONFIGURATION_DIGEST "inert-release-configuration"',
    '',
  ].join('\n');
  writeFileSync(headerA, pinHeader(markerA), { mode: 0o600 });
  writeFileSync(headerB, pinHeader(markerB), { mode: 0o600 });
  writeFileSync(headerWithTestMacro, `${pinHeader(markerB)}#define PA_TESTING 1\n`, {
    mode: 0o600,
  });
  const old = new Date('2000-01-01T00:00:00.000Z');
  utimesSync(headerB, old, old);
  const build = header => spawnSync('/usr/bin/make', [
    '-C', nativeDirectory, 'release-candidate', `BUILD_DIR=${buildDirectory}`,
    ...(header === null ? [] : [`RELEASE_PINS_HEADER=${header}`]),
  ], { encoding: 'utf8' });
  const first = build(headerA);
  assert.equal(first.status, 0, 'initial inert release-candidate build failed');
  const firstImage = readFileSync(candidate);
  assert.equal(firstImage.includes(Buffer.from(markerA)), true,
    'initial candidate did not contain its inert pin');
  const second = build(headerB);
  assert.equal(second.status, 0, 'changed-pin release-candidate build failed');
  const secondImage = readFileSync(candidate);
  assert.equal(secondImage.includes(Buffer.from(markerB)), true,
    'candidate did not incorporate changed inert pins');
  assert.equal(secondImage.includes(Buffer.from(markerA)), false,
    'candidate retained stale inert pins');
  assert.notEqual(build(null).status, 0, 'missing pins must fail with a cached candidate');
  assert.notEqual(build(headerWithTestMacro).status, 0,
    'test macros must fail with a cached candidate');
});

nativeConformanceTest('native protocol child fails closed without an independently pinned authority', async t => {
  if (process.platform !== 'darwin') {
    t.skip('native provider attestor is macOS-only');
    return;
  }
  const executable = buildProtocolChild(t);
  const result = await exchangeWithProtocolChild(executable, fixedSyntheticVector().frame);
  assert.notEqual(result.code, 0);
  assert.equal(result.signal, null);
  assert.equal(result.response.length, 0);
  assert.equal(result.stdout.length, 0);
  assert.equal(result.stderr.length, 0);
});

nativeConformanceTest('test-pinned native child parses a valid control and rejects a semantic frame mutation', async t => {
  if (process.platform !== 'darwin') {
    t.skip('native provider attestor is macOS-only');
    return;
  }
  const { executable, vector } = buildTestPinnedProtocolChild(t);
  await assertTestPinnedControl(executable, vector);
  const malformed = Buffer.from(vector.frame);
  const marker = Buffer.from('"protocolVersion":1');
  const markerOffset = malformed.indexOf(marker);
  assert.notEqual(markerOffset, -1);
  malformed[markerOffset + marker.length - 1] = '2'.charCodeAt(0);
  const result = await exchangeWithProtocolChild(executable, malformed);
  assert.notEqual(result.code, 0);
  assert.equal(result.signal, null);
  assert.equal(result.response.length, 0);
  assert.equal(result.stdout.length, 0);
  assert.equal(result.stderr.length, 0);
});

nativeConformanceTest('test-pinned native child rejects trailing bytes after a valid control', async t => {
  if (process.platform !== 'darwin') {
    t.skip('native provider attestor is macOS-only');
    return;
  }
  const { executable, vector } = buildTestPinnedProtocolChild(t);
  await assertTestPinnedControl(executable, vector);
  const result = await exchangeWithProtocolChild(executable,
    Buffer.concat([vector.frame, Buffer.from([0])]));
  assert.notEqual(result.code, 0);
  assert.equal(result.signal, null);
  assert.equal(result.response.length, 0);
  assert.equal(result.stdout.length, 0);
  assert.equal(result.stderr.length, 0);
});

nativeConformanceTest('test-pinned native child rejects an empty frame after a valid control', async t => {
  if (process.platform !== 'darwin') {
    t.skip('native provider attestor is macOS-only');
    return;
  }
  const { executable, vector } = buildTestPinnedProtocolChild(t);
  await assertTestPinnedControl(executable, vector);
  const result = await exchangeWithProtocolChild(executable, Buffer.alloc(4));
  assert.notEqual(result.code, 0);
  assert.equal(result.signal, null);
  assert.equal(result.response.length, 0);
  assert.equal(result.stdout.length, 0);
  assert.equal(result.stderr.length, 0);
});

nativeConformanceTest('native journal runner proves ordering and replay only with synthetic READY', async t => {
  if (process.platform !== 'darwin') {
    t.skip('native provider attestor is macOS-only');
    return;
  }
  const repository = dirname(dirname(fileURLToPath(import.meta.url)));
  const nativeDirectory = join(repository, 'native', 'provider-attestor');
  const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'provider-attestor-journal-')));
  afterNativeCleanup(t, temporary);
  const buildDirectory = join(temporary, 'build');
  const vector = fixedSyntheticVector();
  const config = {
    authorityRecord: vector.authorityText,
    authorityRecordDigest: vector.authority.authorityRecordDigest,
    configurationVersion: 1,
    developmentMode: 'Development/Testnet Software Attestor',
    generationCommitment: vector.authority.authorityGeneration.generationCommitment,
    journalSchemaVersion: 1,
    keyId: vector.authority.keyId,
    keychain: { account: 'synthetic-account', service: 'synthetic-service' },
    opensslVerifier: { path: '/non-live', sha256: digest('f') },
    pkcs11: {
      modulePath: '/non-live', moduleSha256: digest('e'),
      objectId: Buffer.alloc(16, 1).toString('base64url'), tokenSerial: 'SYNTHETIC',
    },
    publicKey: vector.authority.publicKey,
    validitySeconds: 120,
  };
  const fixtureHeader = join(temporary, 'synthetic-fixture-pins.h');
  writeFileSync(fixtureHeader, [
    '#define PA_TEST_FIXTURE_ONLY 1',
    `#define PA_TEST_AUTHORITY_RECORD_DIGEST ${JSON.stringify(vector.authority.authorityRecordDigest)}`,
    `#define PA_TEST_PUBLIC_KEY ${JSON.stringify(vector.authority.publicKey)}`,
    `#define PA_TEST_CONFIGURATION_DIGEST ${JSON.stringify(commitment('zenon-x402:provider-attestor-configuration-v1', config))}`,
    '',
  ].join('\n'), { mode: 0o600 });
  const missingPins = spawnSync('/usr/bin/make', [
    '-C', nativeDirectory, 'runtime-test', `BUILD_DIR=${join(temporary, 'missing-pins')}`,
  ], { encoding: 'utf8' });
  assert.notEqual(missingPins.status, 0, 'missing test pins must fail the native build');
  const testPinsInRelease = spawnSync('/usr/bin/make', [
    '-C', nativeDirectory, 'release-syntax-check', `RELEASE_PINS_HEADER=${fixtureHeader}`,
  ], { encoding: 'utf8' });
  assert.notEqual(testPinsInRelease.status, 0, 'test fixture cannot compile as a release');
  const compiled = spawnSync('/usr/bin/make', [
    '-C', nativeDirectory, 'runtime-test', `BUILD_DIR=${buildDirectory}`,
    `TEST_PINS_HEADER=${fixtureHeader}`,
  ], { encoding: 'utf8' });
  assert.equal(compiled.status, 0, 'strict native runtime build failed');
  const executable = join(buildDirectory, 'provider-attestor-runtime-test');
  const artifact = readFileSync(executable);
  for (const pin of [
    vector.authority.authorityRecordDigest,
    vector.authority.publicKey,
    commitment('zenon-x402:provider-attestor-configuration-v1', config),
  ]) {
    assert.equal(artifact.includes(Buffer.from(pin)), true,
      'the synthetic pins must be embedded in the executable');
  }
  assert.equal(artifact.includes(Buffer.from('synthetic-service')), false,
    'the generation configuration must not be embedded in the executable');
  const requestPath = join(temporary, 'request.frame');
  writeFileSync(requestPath, vector.frame, { mode: 0o600 });
  let rootNumber = 0;
  function newRoot(rootOverride = null, onRootCreated = null) {
    rootNumber += 1;
    const root = rootOverride ?? join(temporary, `authority-${rootNumber}`);
    const generations = join(root, 'generations');
    const generation = join(generations, 'provider.synthetic.non-live.generation');
    mkdirSync(root, { mode: 0o700 });
    onRootCreated?.(root);
    mkdirSync(generations, { mode: 0o700 });
    mkdirSync(generation, { mode: 0o700 });
    const configurationPath = join(root, 'configuration.json');
    writeFileSync(configurationPath, canonicalJson(config), { mode: 0o600 });
    return { root, generation, configurationPath, config,
      journalPath: join(generation, 'journal.sqlite3') };
  }
  function invoke(target, mode, path = requestPath) {
    const child = spawnSync(executable, [target.root, path, mode], {
      env: { PROVIDER_ATTESTOR_CONFIG: '/non-live-inherited-override' },
      stdio: ['ignore', 'pipe', 'pipe', 'ignore', 'pipe'],
    });
    assert.equal(child.error === undefined, true, 'synthetic runner failed to start');
    assert.equal(child.stdout.length, 0);
    assert.equal(child.stderr.length, 0);
    return { code: child.status, frame: child.output[4] };
  }
  function addSyntheticACL(path) {
    const before = statSync(path);
    const result = spawnSync('/bin/chmod', ['+a', 'everyone allow read', path], {
      encoding: 'utf8', env: {},
    });
    assert.equal(result.status, 0, 'synthetic ACL fixture creation failed');
    const after = statSync(path);
    assert.ok(before.uid === after.uid && (before.mode & 0o7777) === (after.mode & 0o7777),
      'synthetic ACL fixture must retain owner and mode');
  }
  function invokeAsync(target, mode) {
    let child;
    try {
      child = spawn(executable, [target.root, requestPath, mode], {
        env: { PROVIDER_ATTESTOR_CONFIG: '/non-live-inherited-override' },
        stdio: ['ignore', 'pipe', 'pipe', mode === 'slow_grant' ? 'pipe' : 'ignore', 'pipe'],
      });
    } catch {
      throw sanitizedNativeFailure('native journal child spawn failed');
    }
    const completion = new Promise((resolve, reject) => {
      const stdout = [];
      const stderr = [];
      const frames = [];
      let settled = false;
      const fail = () => {
        if (settled) return;
        settled = true;
        try { child.kill('SIGKILL'); } catch {}
        reject(sanitizedNativeFailure('native journal child channel failed'));
      };
      try {
        child.on('error', fail);
        child.stdout.on('error', fail);
        child.stderr.on('error', fail);
        child.stdio[4].on('error', fail);
        child.stdout.on('data', part => stdout.push(part));
        child.stderr.on('data', part => stderr.push(part));
        child.stdio[4].on('data', part => frames.push(part));
        child.on('close', code => {
          if (settled) return;
          try {
            const result = {
              code, frame: Buffer.concat(frames),
              stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr),
            };
            settled = true;
            resolve(result);
          } catch { fail(); }
        });
      } catch { fail(); }
    });
    return { child, completion };
  }
  function waitForApprovalLatch(child) {
    return new Promise((resolve, reject) => {
      const signal = child?.stdio?.[3];
      if (signal === null || signal === undefined) {
        reject(sanitizedNativeFailure('approval latch signal unavailable'));
        return;
      }
      const timer = setTimeout(() => finish(sanitizedNativeFailure(
        'approval latch signal timed out')), 15_000);
      const onData = chunk => finish(Buffer.isBuffer(chunk) && chunk.equals(Buffer.from('L'))
        ? null : sanitizedNativeFailure('invalid approval latch signal'));
      const onEnd = () => finish(sanitizedNativeFailure('approval latch signal closed'));
      const onError = () => finish(sanitizedNativeFailure('approval latch signal failed'));
      function finish(error) {
        clearTimeout(timer);
        try {
          signal.off('data', onData);
          signal.off('end', onEnd);
          signal.off('error', onError);
        } catch { error = sanitizedNativeFailure('approval latch signal failed'); }
        if (error) reject(error);
        else resolve();
      }
      try {
        signal.on('data', onData);
        signal.on('end', onEnd);
        signal.on('error', onError);
      } catch { finish(sanitizedNativeFailure('approval latch signal failed')); }
    });
  }
  function readJournal(target) {
    const database = new DatabaseSync(target.journalPath, { readOnly: true });
    try {
      return {
        row: database.prepare('SELECT * FROM operations').get(),
        rowCount: database.prepare('SELECT COUNT(*) AS count FROM operations').get().count,
        metadata: database.prepare('SELECT * FROM metadata').get(),
        journalMode: database.prepare('PRAGMA journal_mode').get().journal_mode,
      };
    } finally { database.close(); }
  }
  function parseResponse(frame) {
    assert.ok(frame.length > 4);
    assert.equal(frame.readUInt32BE(0), frame.length - 4);
    const payload = frame.subarray(4).toString('utf8');
    let response;
    try { response = JSON.parse(payload); } catch {
      throw sanitizedNativeFailure('native journal response invalid');
    }
    assert.equal(payload === canonicalJson(response), true,
      'native journal response was not canonical');
    assert.equal(response.operationId === vector.wire.operationId, true,
      'native journal operation identity mismatch');
    return response;
  }

  const malformedFixtureHeader = join(temporary, 'malformed-fixture-pins.h');
  writeFileSync(malformedFixtureHeader, readFileSync(fixtureHeader, 'utf8').replace(
    commitment('zenon-x402:provider-attestor-configuration-v1', config), digest('0'),
  ), { mode: 0o600 });
  const malformedBuildDirectory = join(temporary, 'malformed-pin-build');
  const malformedBuild = spawnSync('/usr/bin/make', [
    '-C', nativeDirectory, 'runtime-test', `BUILD_DIR=${malformedBuildDirectory}`,
    `TEST_PINS_HEADER=${malformedFixtureHeader}`,
  ], { encoding: 'utf8' });
  assert.equal(malformedBuild.status, 0, 'malformed fixture should compile for runtime rejection');
  const malformedExecutable = join(malformedBuildDirectory, 'provider-attestor-runtime-test');
  const malformed = spawnSync(malformedExecutable, [newRoot().root, requestPath, 'grant'], {
    env: {}, stdio: ['ignore', 'pipe', 'pipe', 'ignore', 'pipe'],
  });
  assert.notEqual(malformed.status, 0);
  assert.equal(malformed.output[4].length, 0);
  assert.equal(malformed.stdout.length, 0);
  assert.equal(malformed.stderr.length, 0);

  for (const targetPath of ['root', 'configurationPath', 'generation']) {
    const aclFixture = newRoot();
    addSyntheticACL(aclFixture[targetPath]);
    const rejectedACL = invoke(aclFixture, 'unavailable');
    assert.notEqual(rejectedACL.code, 0);
    assert.equal(rejectedACL.frame.length, 0);
    assert.equal(existsSync(aclFixture.journalPath), false);
  }

  const pinned = newRoot();
  const unavailable = invoke(pinned, 'unavailable');
  assert.equal(unavailable.code, 0);
  assert.equal(isDeepStrictEqual(parseResponse(unavailable.frame), {
    protocolVersion: 1,
    messageType: 'zenon-funding-provider-signing-response',
    operationId: vector.wire.operationId,
    status: 'APPROVAL_REQUIRED', reasonCode: 'OPERATOR_APPROVAL_REQUIRED', envelope: null,
  }), true, 'native journal approval response mismatch');
  const reserved = readJournal(pinned);
  assert.equal(reserved.row.state, 'RESERVED');
  assert.equal(reserved.row.approval_started, 0);
  assert.equal(reserved.row.issued_at, NOW);
  assert.equal(reserved.row.valid_until, vector.validUntil);
  assert.equal(Buffer.from(reserved.row.signing_bytes).equals(vector.signingMessage), true);
  assert.equal(Buffer.from(reserved.row.request_payload).equals(vector.frame.subarray(4)), true);
  assert.equal(reserved.metadata.operation_count, 1);
  assert.equal(reserved.journalMode, 'delete');

  const pinnedData = { ...pinned.config, validitySeconds: 121 };
  writeFileSync(pinned.configurationPath, canonicalJson(pinnedData));
  const rejectedConfig = invoke(pinned, 'grant');
  assert.notEqual(rejectedConfig.code, 0);
  assert.equal(rejectedConfig.frame.length, 0);
  assert.equal(readJournal(pinned).row.state, 'RESERVED');
  // A digest or executable claim inside the config cannot replace binary pins.
  for (const selfClaim of [
    { configurationDigest: commitment('zenon-x402:provider-attestor-configuration-v1', pinnedData) },
    { executableSha256: digest('0') },
  ]) {
    writeFileSync(pinned.configurationPath, canonicalJson({ ...pinned.config, ...selfClaim }));
    const spoofed = invoke(pinned, 'grant');
    assert.notEqual(spoofed.code, 0);
    assert.equal(spoofed.frame.length, 0);
    assert.equal(readJournal(pinned).row.state, 'RESERVED');
  }
  writeFileSync(pinned.configurationPath, canonicalJson(pinned.config));

  const granted = newRoot();
  const ready = invoke(granted, 'grant');
  assert.equal(ready.code, 0);
  const readyResponse = parseResponse(ready.frame);
  assert.equal(readyResponse.status, 'READY');
  // The fake signer emits a fixed non-signature. READY here tests journal
  // ordering/replay, never cryptographic attestation or parent acceptance.
  assert.throws(() => verifyZenonFundingProviderAttestationEnvelope({
    authorityRecord: vector.authority,
    request: vector.wire.attestationRequest,
    envelope: readyResponse.envelope,
    nowEpochSeconds: NOW,
    replayMode: 'INITIAL',
  }), { code: 'ZENON_FUNDING_PROVIDER_ATTESTATION_REJECTED' });
  assert.equal(readyResponse.envelope.issuedAt, NOW);
  assert.equal(readyResponse.envelope.validUntil, vector.validUntil);
  const readyJournal = readJournal(granted);
  assert.equal(readyJournal.row.state, 'READY');
  assert.equal(readyJournal.row.approval_started, 1);
  assert.equal(Buffer.from(readyJournal.row.response_frame).equals(ready.frame), true);
  const replay = invoke(granted, 'replay');
  assert.equal(replay.code, 0);
  assert.equal(replay.frame.equals(ready.frame), true);

  const responseLost = newRoot();
  const lostEmission = invoke(responseLost, 'drop_ready_output');
  assert.equal(lostEmission.code, 4);
  assert.equal(lostEmission.frame.length, 0);
  const committedReady = readJournal(responseLost);
  assert.equal(committedReady.rowCount, 1);
  assert.equal(committedReady.metadata.operation_count, 1);
  assert.equal(committedReady.row.state, 'READY');
  assert.equal(committedReady.row.approval_started, 1);
  const storedFrame = Buffer.from(committedReady.row.response_frame);
  const storedResponse = parseResponse(storedFrame);
  assert.equal(storedResponse.status, 'READY');
  assert.throws(() => verifyZenonFundingProviderAttestationEnvelope({
    authorityRecord: vector.authority,
    request: vector.wire.attestationRequest,
    envelope: storedResponse.envelope,
    nowEpochSeconds: NOW,
    replayMode: 'INITIAL',
  }), { code: 'ZENON_FUNDING_PROVIDER_ATTESTATION_REJECTED' });
  const recovered = invoke(responseLost, 'replay');
  assert.equal(recovered.code, 0);
  assert.equal(recovered.frame.equals(storedFrame), true);
  const replayedReady = readJournal(responseLost);
  assert.equal(replayedReady.rowCount, 1);
  assert.equal(replayedReady.metadata.operation_count, 1);
  assert.equal(replayedReady.row.checksum === committedReady.row.checksum, true,
    'native journal replay checksum mismatch');
  assert.equal(Buffer.from(replayedReady.row.response_frame).equals(storedFrame), true);

  // The real-AppKit-linked manual child is never run with dialogs enabled here.
  // A separate no-dialog compile guard makes an unexpected prompt impossible.
  const manualTag = randomBytes(8).toString('hex');
  const manualRoot = join(realpathSync('/private/tmp'),
    `ProviderAttestorSyntheticManualGUI-${manualTag}`);
  let manualRootIdentity = null;
  afterNativeCleanup(t, manualRoot, () => manualRootIdentity);
  const manualPinsPath = join(temporary, 'synthetic-manual-gui-pins.h');
  writeFileSync(manualPinsPath, [
    readFileSync(fixtureHeader, 'utf8').trimEnd(),
    `#define PA_SYNTHETIC_MANUAL_ROOT_TAG ${JSON.stringify(manualTag)}`,
    `#define PA_DEV_MODULE_PATH ${JSON.stringify(config.pkcs11.modulePath)}`,
    `#define PA_DEV_MODULE_SHA256 ${JSON.stringify(config.pkcs11.moduleSha256)}`,
    `#define PA_DEV_TOKEN_SERIAL ${JSON.stringify(config.pkcs11.tokenSerial)}`,
    `#define PA_DEV_OBJECT_ID_BASE64URL ${JSON.stringify(config.pkcs11.objectId)}`,
    `#define PA_DEV_TOKEN_CONFIGURATION_SHA256 ${JSON.stringify(digest('d'))}`,
    '',
  ].join('\n'), { mode: 0o600 });
  const manualBuild = join(temporary, 'synthetic-manual-gui-build');
  const manualCompiled = spawnSync('/usr/bin/make', [
    '-C', nativeDirectory,
    'development-testnet-synthetic-manual-gui',
    'development-testnet-synthetic-manual-gui-no-dialog-test',
    `BUILD_DIR=${manualBuild}`, `DEV_TESTNET_PINS_HEADER=${manualPinsPath}`,
  ], { encoding: 'utf8' });
  assert.equal(manualCompiled.status, 0, 'synthetic manual GUI source builds must pass');
  const noDialogExecutable = join(manualBuild,
    'provider-attestor-development-testnet-synthetic-manual-gui-no-dialog-test');
  assert.equal(existsSync(manualRoot), false);
  const absentManual = await exchangeWithProtocolChild(noDialogExecutable, vector.frame);
  assert.notEqual(absentManual.code, 0);
  assert.equal(absentManual.response.length, 0);
  assert.equal(absentManual.stdout.length, 0);
  assert.equal(absentManual.stderr.length, 0);
  assert.equal(existsSync(manualRoot), false);
  const manualFixture = newRoot(manualRoot, root => {
    manualRootIdentity = captureManualRootIdentity(root);
  });
  const manualDropped = invoke(manualFixture, 'drop_ready_output');
  assert.equal(manualDropped.code, 4);
  assert.equal(manualDropped.frame.length, 0);
  const manualJournal = readJournal(manualFixture);
  assert.equal(manualJournal.row.state, 'READY');
  const manualStoredFrame = Buffer.from(manualJournal.row.response_frame);
  assert.equal(existsSync(join(manualRoot, 'softhsm2.conf')), false);
  const journalBeforeManual = readJournal(manualFixture);
  const malformedManual = await exchangeWithProtocolChild(noDialogExecutable, Buffer.from('bad'));
  assert.notEqual(malformedManual.code, 0);
  assert.equal(malformedManual.response.length, 0);
  assert.equal(malformedManual.stdout.length, 0);
  assert.equal(malformedManual.stderr.length, 0);
  const manualReplay = await exchangeWithProtocolChild(noDialogExecutable, vector.frame);
  assert.equal(manualReplay.code, 0);
  assert.equal(manualReplay.response.equals(manualStoredFrame), true);
  assert.equal(manualReplay.stdout.length, 0);
  assert.equal(manualReplay.stderr.length, 0);
  writeFileSync(manualFixture.configurationPath,
    canonicalJson({ ...config, validitySeconds: 121 }));
  try {
    const invalidManual = await exchangeWithProtocolChild(noDialogExecutable, vector.frame);
    assert.notEqual(invalidManual.code, 0);
    assert.equal(invalidManual.response.length, 0);
    assert.equal(invalidManual.stdout.length, 0);
    assert.equal(invalidManual.stderr.length, 0);
  } finally {
    writeFileSync(manualFixture.configurationPath, canonicalJson(config));
  }
  const journalAfterManual = readJournal(manualFixture);
  assert.equal(journalAfterManual.rowCount, journalBeforeManual.rowCount);
  assert.equal(journalAfterManual.metadata.operation_count,
    journalBeforeManual.metadata.operation_count);
  assert.equal(journalAfterManual.row.checksum === journalBeforeManual.row.checksum, true,
    'native manual fixture checksum changed');
  assert.equal(existsSync(join(manualRoot, 'softhsm2.conf')), false);
  addSyntheticACL(manualRoot);
  const manualACL = await exchangeWithProtocolChild(noDialogExecutable, vector.frame);
  assert.notEqual(manualACL.code, 0);
  assert.equal(manualACL.response.length, 0);
  assert.equal(manualACL.stdout.length, 0);
  assert.equal(manualACL.stderr.length, 0);
  assert.equal(readJournal(manualFixture).row.checksum === journalBeforeManual.row.checksum,
    true, 'native manual ACL fixture checksum changed');

  const different = structuredClone(vector.wire);
  different.attestationRequest.unsignedFundingEvidence.amount = '8';
  const differentPayload = Buffer.from(canonicalJson(different));
  const differentHeader = Buffer.alloc(4);
  differentHeader.writeUInt32BE(differentPayload.length);
  const differentPath = join(temporary, 'different.frame');
  writeFileSync(differentPath, Buffer.concat([differentHeader, differentPayload]), { mode: 0o600 });
  const conflict = invoke(granted, 'replay', differentPath);
  assert.notEqual(conflict.code, 0);
  assert.equal(conflict.frame.length, 0);
  assert.equal(readJournal(granted).row.checksum === readyJournal.row.checksum, true,
    'native conflict changed committed checksum');
  assert.equal(Buffer.from(readJournal(granted).row.response_frame).equals(ready.frame), true);

  const interruptedDisplay = newRoot();
  const displayExit = invoke(interruptedDisplay, 'interrupt_display');
  assert.equal(displayExit.code, 23);
  assert.equal(displayExit.frame.length, 0);
  assert.equal(readJournal(interruptedDisplay).row.state, 'RESERVED');
  assert.equal(readJournal(interruptedDisplay).row.approval_started, 1);
  const displayRestart = invoke(interruptedDisplay, 'replay');
  assert.notEqual(displayRestart.code, 0);
  assert.equal(displayRestart.frame.length, 0);
  assert.equal(readJournal(interruptedDisplay).row.state, 'QUARANTINED');

  const interruptedSign = newRoot();
  const signExit = invoke(interruptedSign, 'interrupt_sign');
  assert.equal(signExit.code, 24);
  assert.equal(signExit.frame.length, 0);
  assert.equal(readJournal(interruptedSign).row.state, 'SIGN_ATTEMPTED');
  assert.equal(readJournal(interruptedSign).row.approval_started, 1);
  const signRestart = invoke(interruptedSign, 'replay');
  assert.notEqual(signRestart.code, 0);
  assert.equal(signRestart.frame.length, 0);
  assert.equal(readJournal(interruptedSign).row.state, 'QUARANTINED');

  const failedSign = newRoot();
  const failed = invoke(failedSign, 'fail_sign');
  assert.notEqual(failed.code, 0);
  assert.equal(failed.frame.length, 0);
  assert.equal(readJournal(failedSign).row.state, 'QUARANTINED');
  assert.equal(readJournal(failedSign).row.approval_started, 1);

  const deniedDisplay = newRoot();
  const denied = invoke(deniedDisplay, 'deny');
  assert.equal(denied.code, 0);
  assert.equal(parseResponse(denied.frame).status, 'REJECTED');
  assert.equal(parseResponse(denied.frame).reasonCode, 'POLICY_REJECTED');
  assert.equal(readJournal(deniedDisplay).row.state, 'REJECTED');
  assert.equal(readJournal(deniedDisplay).row.approval_started, 1);

  const expiredAfterApproval = newRoot();
  const expired = invoke(expiredAfterApproval, 'post_expired');
  assert.equal(expired.code, 0);
  assert.equal(parseResponse(expired.frame).status, 'REJECTED');
  assert.equal(parseResponse(expired.frame).reasonCode, 'POLICY_REJECTED');
  assert.equal(readJournal(expiredAfterApproval).row.state, 'REJECTED');
  assert.equal(readJournal(expiredAfterApproval).row.approval_started, 1);

  const missingOperation = new DatabaseSync(granted.journalPath);
  try { missingOperation.exec('DELETE FROM operations'); }
  finally { missingOperation.close(); }
  const deletionRestart = invoke(granted, 'replay');
  assert.notEqual(deletionRestart.code, 0);
  assert.equal(deletionRestart.frame.length, 0);
  assert.equal(readJournal(granted).metadata.operation_count, 1);

  const missingDatabase = newRoot();
  assert.equal(invoke(missingDatabase, 'unavailable').code, 0);
  unlinkSync(missingDatabase.journalPath);
  const missingRestart = invoke(missingDatabase, 'replay');
  assert.notEqual(missingRestart.code, 0);
  assert.equal(missingRestart.frame.length, 0);

  const missingMetadata = newRoot();
  assert.equal(invoke(missingMetadata, 'unavailable').code, 0);
  const erasedMetadata = new DatabaseSync(missingMetadata.journalPath);
  try { erasedMetadata.exec('DELETE FROM metadata'); }
  finally { erasedMetadata.close(); }
  const metadataRestart = invoke(missingMetadata, 'replay');
  assert.notEqual(metadataRestart.code, 0);
  assert.equal(metadataRestart.frame.length, 0);
  assert.equal(readJournal(missingMetadata).metadata, undefined);

  const unsafeMode = newRoot();
  assert.equal(invoke(unsafeMode, 'unavailable').code, 0);
  chmodSync(unsafeMode.journalPath, 0o644);
  const modeRestart = invoke(unsafeMode, 'replay');
  assert.notEqual(modeRestart.code, 0);
  assert.equal(modeRestart.frame.length, 0);
  chmodSync(unsafeMode.journalPath, 0o600);

  const extraSchema = newRoot();
  assert.equal(invoke(extraSchema, 'unavailable').code, 0);
  const tamperedSchema = new DatabaseSync(extraSchema.journalPath);
  try { tamperedSchema.exec('CREATE TRIGGER unexpected AFTER UPDATE ON operations BEGIN SELECT 1; END'); }
  finally { tamperedSchema.close(); }
  const schemaRestart = invoke(extraSchema, 'replay');
  assert.notEqual(schemaRestart.code, 0);
  assert.equal(schemaRestart.frame.length, 0);

  const concurrent = newRoot();
  const firstHandle = invokeAsync(concurrent, 'slow_grant');
  let secondHandle;
  try {
    await waitForApprovalLatch(firstHandle.child);
    const latched = readJournal(concurrent).row;
    assert.equal(latched?.state, 'RESERVED');
    assert.equal(latched.approval_started, 1);
    secondHandle = invokeAsync(concurrent, 'replay');
    firstHandle.child.stdio[3].end(Buffer.from('R'));
    const [first, second] = await Promise.all([
      firstHandle.completion, secondHandle.completion,
    ]);
    for (const child of [first, second]) {
      assert.equal(child.code, 0);
      assert.equal(child.stdout.length, 0);
      assert.equal(child.stderr.length, 0);
    }
    assert.equal(first.frame.equals(second.frame), true);
    assert.equal(parseResponse(first.frame).status, 'READY');
    assert.equal(readJournal(concurrent).metadata.operation_count, 1);
  } finally {
    if (!firstHandle.child.stdio[3].writableEnded) {
      firstHandle.child.stdio[3].end(Buffer.from('R'));
    }
    await Promise.allSettled([firstHandle.completion, secondHandle?.completion].filter(Boolean));
  }
});

const sanitizedTestChildFailures = new WeakSet();

function sanitizedTestChildFailure(category) {
  const failure = new Error(category);
  failure.stack = category;
  sanitizedTestChildFailures.add(failure);
  return failure;
}

function sanitizedDisposableFailure(error, category) {
  if (error !== null && typeof error === 'object'
      && sanitizedTestChildFailures.has(error)) return error;
  return sanitizedTestChildFailure(category);
}

function sanitizedDisposableTokenTest(callback) {
  return async t => {
    try {
      return await callback(t);
    } catch (error) {
      throw sanitizedDisposableFailure(error, 'disposable token test failed');
    }
  };
}

function runDisposableTokenChild(executable, args, pin) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(executable, args, {
        env: {}, stdio: ['ignore', 'pipe', 'pipe', 'ignore', 'pipe', 'pipe'],
      });
    } catch {
      reject(sanitizedTestChildFailure('disposable test child spawn failed'));
      return;
    }
    const output = [];
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, 10_000);
    const failOutput = () => reject(sanitizedTestChildFailure(
      'disposable test child output stream failed'));
    child.stdio[4].on('data', part => output.push(part));
    child.stdio[4].on('error', failOutput);
    child.stdout.on('data', part => stdout.push(part));
    child.stdout.on('error', failOutput);
    child.stderr.on('data', part => stderr.push(part));
    child.stderr.on('error', failOutput);
    child.stdio[5].on('error', () => {});
    child.on('error', () => {
      clearTimeout(timeout);
      reject(sanitizedTestChildFailure('disposable test child spawn failed'));
    });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      resolve({
        code, signal, timedOut, output: Buffer.concat(output),
        stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr),
      });
    });
    if (pin !== null) child.stdio[5].end(pin);
  });
}

function runDevelopmentTestChild(executable, frame, pin, deadlineMs = 10_000) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(executable, [], {
        env: {}, stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe'],
      });
    } catch {
      reject(sanitizedTestChildFailure('development test child spawn failed'));
      return;
    }
    const output = [];
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, deadlineMs);
    child.stdio[3].on('error', () => {});
    const failOutput = () => reject(sanitizedTestChildFailure(
      'development test child output stream failed'));
    child.stdio[4].on('data', part => output.push(part));
    child.stdio[4].on('error', failOutput);
    child.stdout.on('data', part => stdout.push(part));
    child.stdout.on('error', failOutput);
    child.stderr.on('data', part => stderr.push(part));
    child.stderr.on('error', failOutput);
    child.stdio[5].on('error', () => {});
    child.on('error', () => {
      clearTimeout(timeout);
      reject(sanitizedTestChildFailure('development test child spawn failed'));
    });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      resolve({
        code, signal, timedOut, output: Buffer.concat(output),
        stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr),
      });
    });
    child.stdio[3].end(frame);
    if (pin !== null) child.stdio[5].end(pin);
  });
}

test('explicit disposable SoftHSM signer bridges real Ed25519 into journaled READY',
  sanitizedDisposableTokenTest(async t => {
  if (process.platform !== 'darwin') {
    t.skip('native provider attestor is macOS-only');
    return;
  }
  if (process.env.PA_RUN_DISPOSABLE_TOKEN_TEST !== '1') {
    t.skip('disposable-token signing requires an explicit focused opt-in');
    return;
  }
  const moduleCandidate = [
    '/opt/homebrew/opt/softhsm/lib/softhsm/libsofthsm2.so',
    '/usr/local/opt/softhsm/lib/softhsm/libsofthsm2.so',
  ].find(existsSync);
  if (moduleCandidate === undefined) {
    t.skip('isolated SoftHSM module is unavailable');
    return;
  }
  const modulePath = realpathSync(moduleCandidate);
  if (!modulePath.includes('/softhsm/2.7.0/')) {
    t.skip('the disposable signing profile requires SoftHSM 2.7.0');
    return;
  }
  const moduleDigest = `sha256:${createHash('sha256')
    .update(readFileSync(modulePath)).digest('hex')}`;
  const repository = dirname(dirname(fileURLToPath(import.meta.url)));
  const nativeDirectory = join(repository, 'native', 'provider-attestor');
  const temporaryParent = realpathSync(tmpdir());
  const temporary = realpathSync(mkdtempSync(
    join(temporaryParent, 'provider-attestor-real-journal-')));
  const temporaryIdentity = lstatSync(temporary);
  const parentIdentity = lstatSync(temporaryParent);
  const privateWorkspaceIdentity = () => {
    try {
      const current = lstatSync(temporary);
      const parent = lstatSync(temporaryParent);
      const acl = spawnSync('/bin/ls', ['-lde', temporary], { encoding: 'utf8' });
      return dirname(temporary) === temporaryParent
        && /^provider-attestor-real-journal-[A-Za-z0-9]{6}$/.test(basename(temporary))
        && realpathSync(temporaryParent) === temporaryParent
        && realpathSync(temporary) === temporary
        && current.isDirectory() && !current.isSymbolicLink()
        && current.uid === process.getuid() && (current.mode & 0o7777) === 0o700
        && current.dev === temporaryIdentity.dev
        && current.ino === temporaryIdentity.ino
        && current.gid === temporaryIdentity.gid
        && parent.dev === parentIdentity.dev && parent.ino === parentIdentity.ino
        && parent.uid === parentIdentity.uid && parent.mode === parentIdentity.mode
        && acl.status === 0 && acl.stderr.length === 0
        && !/^\s*\d+:/m.test(acl.stdout);
    } catch {
      return false;
    }
  };
  if (!privateWorkspaceIdentity()) {
    throw new Error('private disposable test workspace preflight failed');
  }
  const preKeyPinsPath = join(temporary, 'development-child-pre-key-pins.h');
  writeFileSync(preKeyPinsPath, [
    '#define PA_TEST_FIXTURE_ONLY 1',
    `#define PA_TEST_AUTHORITY_RECORD_DIGEST ${JSON.stringify(digest('0'))}`,
    `#define PA_TEST_PUBLIC_KEY ${JSON.stringify(Buffer.alloc(32).toString('base64url'))}`,
    `#define PA_TEST_CONFIGURATION_DIGEST ${JSON.stringify(digest('0'))}`,
    '#define PA_DEV_MODULE_PATH "/non-live"',
    `#define PA_DEV_MODULE_SHA256 ${JSON.stringify(digest('0'))}`,
    '#define PA_DEV_TOKEN_SERIAL "SYNTHETIC"',
    `#define PA_DEV_OBJECT_ID_BASE64URL ${JSON.stringify(Buffer.alloc(16).toString('base64url'))}`,
    `#define PA_DEV_TOKEN_CONFIGURATION_SHA256 ${JSON.stringify(digest('0'))}`,
    '',
  ].join('\n'), { mode: 0o600, flag: 'wx' });
  const preKeyBuild = join(temporary, 'development-child-pre-key-build');
  const preKeyCompiled = spawnSync('/usr/bin/make', [
    '-C', nativeDirectory, 'development-testnet-child', `BUILD_DIR=${preKeyBuild}`,
    `DEV_TESTNET_PINS_HEADER=${preKeyPinsPath}`,
  ], { encoding: 'utf8' });
  assert.equal(preKeyCompiled.status, 0, 'development GUI child pre-key compile gate failed');
  let verifiedDisposableRun = false;
  const pin = randomBytes(16);
  for (let index = 0; index < pin.length; index += 1) pin[index] = 0x30 + (pin[index] % 10);
  t.after(() => {
    try {
      pin.fill(0);
      if (!privateWorkspaceIdentity()) {
        throw sanitizedTestChildFailure('private disposable test workspace identity changed; preserved');
      }
      if (!verifiedDisposableRun) return;
      try {
        rmSync(temporary, { recursive: true, force: false });
      } catch {
        throw sanitizedTestChildFailure('private disposable test workspace cleanup failed');
      }
    } catch (error) {
      throw sanitizedDisposableFailure(error, 'disposable token test teardown failed');
    }
  });

  const bootstrapBuild = join(temporary, 'bootstrap-build');
  const bootstrapCompiled = spawnSync('/usr/bin/make', [
    '-C', nativeDirectory, 'disposable-token-bootstrap-test', `BUILD_DIR=${bootstrapBuild}`,
  ], { encoding: 'utf8' });
  assert.equal(bootstrapCompiled.status, 0, 'test-only token bootstrap build failed');
  const bootstrapExecutable = join(bootstrapBuild,
    'provider-attestor-disposable-token-bootstrap-test');
  const rejectedTokenRoot = join(temporary, 'rejected-token');
  mkdirSync(rejectedTokenRoot, { mode: 0o700 });
  const rejectedModule = await runDisposableTokenChild(
    bootstrapExecutable, [rejectedTokenRoot, modulePath, digest('0')], null,
  );
  assert.notEqual(rejectedModule.code, 0);
  assert.equal(rejectedModule.timedOut, false);
  assert.equal(rejectedModule.signal, null);
  assert.equal(rejectedModule.output.length, 0);
  assert.equal(rejectedModule.stdout.length, 0);
  assert.equal(rejectedModule.stderr.length, 0);
  assert.equal(readdirSync(join(rejectedTokenRoot, 'tokens')).length, 0);
  const tokenRoot = join(temporary, 'token');
  mkdirSync(tokenRoot, { mode: 0o700 });
  const bootstrap = await runDisposableTokenChild(
    bootstrapExecutable, [tokenRoot, modulePath, moduleDigest], pin,
  );
  assert.equal(bootstrap.code, 0, 'disposable token bootstrap failed');
  assert.equal(bootstrap.signal, null);
  assert.equal(bootstrap.stdout.length, 0);
  assert.equal(bootstrap.stderr.length, 0);
  assert.equal(bootstrap.output.length, 64);
  const publicKey = bootstrap.output.subarray(0, 32).toString('base64url');
  const objectId = bootstrap.output.subarray(32, 48).toString('base64url');
  const tokenSerial = bootstrap.output.subarray(48, 64).toString('ascii').trim();
  assert.match(tokenSerial, /^[!-~]{1,16}$/);
  const vector = fixedSyntheticVector({ publicKey });
  const config = {
    authorityRecord: vector.authorityText,
    authorityRecordDigest: vector.authority.authorityRecordDigest,
    configurationVersion: 1,
    developmentMode: 'Development/Testnet Software Attestor',
    generationCommitment: vector.authority.authorityGeneration.generationCommitment,
    journalSchemaVersion: 1,
    keyId: vector.authority.keyId,
    keychain: { account: 'synthetic-account', service: 'synthetic-service' },
    opensslVerifier: { path: '/non-live', sha256: digest('f') },
    pkcs11: {
      modulePath,
      moduleSha256: moduleDigest,
      objectId,
      tokenSerial,
    },
    publicKey,
    validitySeconds: 120,
  };
  const fixtureHeader = join(temporary, 'disposable-token-fixture-pins.h');
  writeFileSync(fixtureHeader, [
    '#define PA_TEST_FIXTURE_ONLY 1',
    `#define PA_TEST_AUTHORITY_RECORD_DIGEST ${JSON.stringify(vector.authority.authorityRecordDigest)}`,
    `#define PA_TEST_PUBLIC_KEY ${JSON.stringify(publicKey)}`,
    `#define PA_TEST_CONFIGURATION_DIGEST ${JSON.stringify(commitment('zenon-x402:provider-attestor-configuration-v1', config))}`,
    '',
  ].join('\n'), { mode: 0o600 });
  const buildDirectory = join(temporary, 'runtime-build');
  const compiled = spawnSync('/usr/bin/make', [
    '-C', nativeDirectory, 'runtime-disposable-token-test', `BUILD_DIR=${buildDirectory}`,
    `TEST_PINS_HEADER=${fixtureHeader}`,
  ], { encoding: 'utf8' });
  assert.equal(compiled.status, 0, 'test-only real-signing runtime build failed');
  const executable = join(buildDirectory, 'provider-attestor-runtime-disposable-token-test');
  const requestPath = join(temporary, 'request.frame');
  writeFileSync(requestPath, vector.frame, { mode: 0o600 });
  let rootNumber = 0;
  function newRoot(configuration = config) {
    rootNumber += 1;
    const root = join(temporary, `journal-${rootNumber}`);
    const generations = join(root, 'generations');
    const generation = join(generations, 'provider.synthetic.non-live.generation');
    mkdirSync(root, { mode: 0o700 });
    mkdirSync(generations, { mode: 0o700 });
    mkdirSync(generation, { mode: 0o700 });
    writeFileSync(join(root, 'configuration.json'), canonicalJson(configuration), { mode: 0o600 });
    return { root, journalPath: join(generation, 'journal.sqlite3') };
  }
  function readJournal(target) {
    const database = new DatabaseSync(target.journalPath, { readOnly: true });
    try {
      return {
        row: database.prepare('SELECT * FROM operations').get(),
        count: database.prepare('SELECT COUNT(*) AS count FROM operations').get().count,
        operationCount: database.prepare('SELECT operation_count FROM metadata').get().operation_count,
      };
    } finally { database.close(); }
  }
  async function invoke(target, mode, credential = pin, childExecutable = executable) {
    const result = await runDisposableTokenChild(childExecutable,
      [target.root, requestPath, mode, join(tokenRoot, 'softhsm2.conf')], credential);
    assert.equal(result.signal, null);
    assert.equal(result.stdout.length, 0);
    assert.equal(result.stderr.length, 0);
    return result;
  }
  function validReady(frame) {
    const response = parseZenonFundingProviderSigningChildResponseFrame(
      frame, vector.wire.operationId,
    );
    assert.equal(response.status, 'READY');
    verifyZenonFundingProviderAttestationEnvelope({
      authorityRecord: vector.authority,
      request: vector.wire.attestationRequest,
      envelope: response.envelope,
      nowEpochSeconds: NOW,
      replayMode: 'INITIAL',
    });
  }

  const rejectedConfig = structuredClone(config);
  rejectedConfig.pkcs11.moduleSha256 = digest('0');
  const rejectedPins = join(temporary, 'rejected-module-pins.h');
  writeFileSync(rejectedPins, [
    '#define PA_TEST_FIXTURE_ONLY 1',
    `#define PA_TEST_AUTHORITY_RECORD_DIGEST ${JSON.stringify(vector.authority.authorityRecordDigest)}`,
    `#define PA_TEST_PUBLIC_KEY ${JSON.stringify(publicKey)}`,
    `#define PA_TEST_CONFIGURATION_DIGEST ${JSON.stringify(commitment('zenon-x402:provider-attestor-configuration-v1', rejectedConfig))}`,
    '',
  ].join('\n'), { mode: 0o600 });
  const rejectedBuild = join(temporary, 'rejected-runtime-build');
  const rejectedCompiled = spawnSync('/usr/bin/make', [
    '-C', nativeDirectory, 'runtime-disposable-token-test', `BUILD_DIR=${rejectedBuild}`,
    `TEST_PINS_HEADER=${rejectedPins}`,
  ], { encoding: 'utf8' });
  assert.equal(rejectedCompiled.status, 0, 'mismatched test-only runtime build failed');
  const rejectedRuntime = newRoot(rejectedConfig);
  const rejectedBeforePIN = await invoke(rejectedRuntime, 'grant', null,
    join(rejectedBuild, 'provider-attestor-runtime-disposable-token-test'));
  assert.notEqual(rejectedBeforePIN.code, 0);
  assert.equal(rejectedBeforePIN.timedOut, false);
  assert.equal(rejectedBeforePIN.output.length, 0);
  assert.equal(readJournal(rejectedRuntime).row.state, 'QUARANTINED');

  const granted = newRoot();
  const first = await invoke(granted, 'grant');
  const firstState = existsSync(granted.journalPath)
    ? readJournal(granted).row?.state : 'NO_JOURNAL';
  assert.equal(first.code, 0, `disposable grant state: ${firstState}`);
  validReady(first.output);
  const firstJournal = readJournal(granted);
  assert.equal(firstJournal.row.state, 'READY');
  assert.equal(firstJournal.row.approval_started, 1);
  assert.equal(firstJournal.count, 1);
  assert.equal(firstJournal.operationCount, 1);
  assert.equal(Buffer.from(firstJournal.row.signing_bytes).equals(vector.signingMessage), true);
  assert.equal(Buffer.from(firstJournal.row.response_frame).equals(first.output), true);

  const lost = newRoot();
  const dropped = await invoke(lost, 'drop_ready_output');
  assert.equal(dropped.code, 4);
  assert.equal(dropped.output.length, 0);
  const committed = readJournal(lost);
  assert.equal(committed.row.state, 'READY');
  assert.equal(committed.count, 1);
  assert.equal(committed.operationCount, 1);
  const stored = Buffer.from(committed.row.response_frame);
  validReady(stored);
  const replay = await invoke(lost, 'replay', Buffer.alloc(0));
  assert.equal(replay.code, 0);
  assert.equal(replay.output.equals(stored), true);
  const afterReplay = readJournal(lost);
  assert.equal(afterReplay.count, 1);
  assert.equal(afterReplay.operationCount, 1);
  assert.equal(afterReplay.row.checksum, committed.row.checksum);

  const wrong = Buffer.from(pin);
  wrong[0] = wrong[0] === 0x30 ? 0x31 : 0x30;
  try {
    const badPin = newRoot();
    const denied = await invoke(badPin, 'bad_pin', wrong);
    assert.notEqual(denied.code, 0);
    assert.equal(denied.output.length, 0);
    const badPinJournal = readJournal(badPin);
    assert.equal(badPinJournal.row.state, 'QUARANTINED');
    assert.equal(badPinJournal.row.approval_started, 1);
    assert.equal(badPinJournal.row.response_frame, null);
    assert.equal(badPinJournal.count, 1);
    assert.notEqual((await invoke(badPin, 'replay', Buffer.alloc(0))).code, 0);
    assert.equal(readJournal(badPin).row.checksum, badPinJournal.row.checksum);
  } finally { wrong.fill(0); }

  const failedSign = newRoot();
  const failed = await invoke(failedSign, 'fail_sign');
  assert.notEqual(failed.code, 0);
  assert.equal(failed.output.length, 0);
  const failedJournal = readJournal(failedSign);
  assert.equal(failedJournal.row.state, 'QUARANTINED');
  assert.equal(failedJournal.row.approval_started, 1);
  assert.equal(failedJournal.row.response_frame, null);
  assert.equal(failedJournal.count, 1);
  assert.notEqual((await invoke(failedSign, 'replay', Buffer.alloc(0))).code, 0);
  assert.equal(readJournal(failedSign).row.checksum, failedJournal.row.checksum);

  const corruptedSignature = newRoot();
  const corrupted = await invoke(corruptedSignature, 'corrupt_signature');
  assert.notEqual(corrupted.code, 0);
  assert.equal(corrupted.output.length, 0);
  const corruptedJournal = readJournal(corruptedSignature);
  assert.equal(corruptedJournal.row.state, 'QUARANTINED');
  assert.equal(corruptedJournal.row.approval_started, 1);
  assert.equal(corruptedJournal.row.response_frame, null);
  assert.equal(corruptedJournal.count, 1);
  assert.equal(corruptedJournal.operationCount, 1);
  const corruptedReplay = await invoke(corruptedSignature, 'replay', Buffer.alloc(0));
  assert.equal(corruptedReplay.code, 3);
  assert.equal(corruptedReplay.output.length, 0);
  assert.equal(readJournal(corruptedSignature).row.checksum, corruptedJournal.row.checksum);
  assert.equal(readJournal(corruptedSignature).operationCount, 1);

  const developmentRoot = join(temporary, 'development-child-root');
  const developmentGeneration = join(developmentRoot, 'generations',
    'provider.synthetic.non-live.generation');
  mkdirSync(developmentRoot, { mode: 0o700 });
  mkdirSync(join(developmentRoot, 'generations'), { mode: 0o700 });
  mkdirSync(developmentGeneration, { mode: 0o700 });
  writeFileSync(join(developmentRoot, 'configuration.json'), canonicalJson(config), { mode: 0o600 });
  const tokenConfiguration = join(developmentRoot, 'softhsm2.conf');
  copyFileSync(join(tokenRoot, 'softhsm2.conf'), tokenConfiguration);
  chmodSync(tokenConfiguration, 0o600);
  const tokenConfigurationDigest = `sha256:${createHash('sha256')
    .update(readFileSync(tokenConfiguration)).digest('hex')}`;
  const developmentPins = [
    '#define PA_TEST_FIXTURE_ONLY 1',
    `#define PA_TEST_AUTHORITY_RECORD_DIGEST ${JSON.stringify(vector.authority.authorityRecordDigest)}`,
    `#define PA_TEST_PUBLIC_KEY ${JSON.stringify(publicKey)}`,
    `#define PA_TEST_CONFIGURATION_DIGEST ${JSON.stringify(commitment('zenon-x402:provider-attestor-configuration-v1', config))}`,
    `#define PA_DEV_MODULE_PATH ${JSON.stringify(modulePath)}`,
    `#define PA_DEV_MODULE_SHA256 ${JSON.stringify(moduleDigest)}`,
    `#define PA_DEV_TOKEN_SERIAL ${JSON.stringify(tokenSerial)}`,
    `#define PA_DEV_OBJECT_ID_BASE64URL ${JSON.stringify(objectId)}`,
    `#define PA_DEV_TOKEN_CONFIGURATION_SHA256 ${JSON.stringify(tokenConfigurationDigest)}`,
  ];
  const developmentPinsPath = join(temporary, 'development-child-pins.h');
  writeFileSync(developmentPinsPath, [...developmentPins, ''].join('\n'), { mode: 0o600 });
  const developmentBuild = join(temporary, 'development-child-build');
  const developmentCompiled = spawnSync('/usr/bin/make', [
    '-C', nativeDirectory, 'development-testnet-child', `BUILD_DIR=${developmentBuild}`,
    `DEV_TESTNET_PINS_HEADER=${developmentPinsPath}`,
  ], { encoding: 'utf8' });
  assert.equal(developmentCompiled.status, 0, 'development-only GUI child source build failed');
  const developmentTestPinsPath = join(temporary, 'development-child-test-pins.h');
  writeFileSync(developmentTestPinsPath, [
    ...developmentPins,
    `#define PA_DEV_TEST_ROOT ${JSON.stringify(developmentRoot)}`,
    '#define PA_DEV_TEST_GENERATION_ID "provider.synthetic.non-live.generation"',
    '',
  ].join('\n'), { mode: 0o600 });
  const developmentTestBuild = join(temporary, 'development-child-test-build');
  const developmentTestCompiled = spawnSync('/usr/bin/make', [
    '-C', nativeDirectory, 'development-testnet-child-test', `BUILD_DIR=${developmentTestBuild}`,
    `DEV_TESTNET_PINS_HEADER=${developmentTestPinsPath}`,
  ], { encoding: 'utf8' });
  assert.equal(developmentTestCompiled.status, 0, 'development-only fake-UI child build failed');
  const developmentTestExecutable = join(developmentTestBuild,
    'provider-attestor-development-testnet-child-test');
  const developmentJournalPath = join(developmentGeneration, 'journal.sqlite3');
  const setDevelopmentMode = mode => writeFileSync(join(developmentRoot, 'test-mode'), mode,
    { mode: 0o600 });
  const readDevelopmentJournal = () => readJournal({ journalPath: developmentJournalPath });
  const resetDevelopmentJournal = () => {
    if (existsSync(developmentJournalPath)) unlinkSync(developmentJournalPath);
    const lockPath = join(developmentGeneration, 'attestor.lock');
    if (existsSync(lockPath)) unlinkSync(lockPath);
  };
  const invokeDevelopment = async (frame, credential = pin, deadlineMs = 10_000,
    childExecutable = developmentTestExecutable) => {
    const result = await runDevelopmentTestChild(childExecutable, frame, credential, deadlineMs);
    assert.equal(result.stdout.length, 0);
    assert.equal(result.stderr.length, 0);
    return result;
  };

  setDevelopmentMode('grant');
  const malformedDevelopment = await invokeDevelopment(Buffer.from('bad'), null);
  assert.notEqual(malformedDevelopment.code, 0);
  assert.equal(malformedDevelopment.timedOut, false);
  assert.equal(malformedDevelopment.output.length, 0);
  assert.equal(malformedDevelopment.stdout.length, 0);
  assert.equal(malformedDevelopment.stderr.length, 0);
  assert.equal(existsSync(developmentJournalPath), false);

  setDevelopmentMode('deny');
  const cancelled = await invokeDevelopment(vector.frame, null);
  assert.equal(cancelled.code, 0);
  assert.equal(parseZenonFundingProviderSigningChildResponseFrame(
    cancelled.output, vector.wire.operationId).status, 'REJECTED');
  assert.equal(readDevelopmentJournal().row.state, 'REJECTED');
  assert.equal(readDevelopmentJournal().row.approval_started, 1);
  const cancelledReplay = await invokeDevelopment(vector.frame, null);
  assert.equal(cancelledReplay.code, 0);
  assert.equal(cancelledReplay.output.equals(cancelled.output), true);
  resetDevelopmentJournal();

  setDevelopmentMode('stall_approval');
  const stalled = await invokeDevelopment(vector.frame, null, 500);
  assert.equal(stalled.timedOut, true);
  assert.equal(stalled.output.length, 0);
  assert.equal(readDevelopmentJournal().row.state, 'RESERVED');
  assert.equal(readDevelopmentJournal().row.approval_started, 1);
  setDevelopmentMode('grant');
  const afterStall = await invokeDevelopment(vector.frame, null);
  assert.notEqual(afterStall.code, 0);
  assert.equal(afterStall.timedOut, false);
  assert.equal(afterStall.output.length, 0);
  assert.equal(readDevelopmentJournal().row.state, 'QUARANTINED');
  resetDevelopmentJournal();

  setDevelopmentMode('drop_ready_output');
  const developmentDropped = await invokeDevelopment(vector.frame);
  assert.equal(developmentDropped.code, 4);
  assert.equal(developmentDropped.output.length, 0);
  const developmentCommitted = readDevelopmentJournal();
  assert.equal(developmentCommitted.row.state, 'READY');
  assert.equal(developmentCommitted.operationCount, 1);
  const developmentStored = Buffer.from(developmentCommitted.row.response_frame);
  validReady(developmentStored);
  setDevelopmentMode('replay');
  const developmentReplay = await invokeDevelopment(vector.frame, null);
  assert.equal(developmentReplay.code, 0);
  assert.equal(developmentReplay.timedOut, false);
  assert.equal(developmentReplay.output.equals(developmentStored), true);
  assert.equal(readDevelopmentJournal().row.checksum, developmentCommitted.row.checksum);
  assert.equal(readDevelopmentJournal().operationCount, 1);
  resetDevelopmentJournal();

  setDevelopmentMode('grant');
  const invalidDevelopmentPIN = Buffer.from(pin);
  invalidDevelopmentPIN[0] = invalidDevelopmentPIN[0] === 0x30 ? 0x31 : 0x30;
  try {
    const failedDevelopmentPIN = await invokeDevelopment(vector.frame, invalidDevelopmentPIN);
    assert.notEqual(failedDevelopmentPIN.code, 0);
    assert.equal(failedDevelopmentPIN.output.length, 0);
    assert.equal(readDevelopmentJournal().row.state, 'QUARANTINED');
  } finally { invalidDevelopmentPIN.fill(0); }
  resetDevelopmentJournal();

  const cancelledDevelopmentPIN = await invokeDevelopment(vector.frame, Buffer.alloc(0));
  assert.notEqual(cancelledDevelopmentPIN.code, 0);
  assert.equal(cancelledDevelopmentPIN.timedOut, false);
  assert.equal(cancelledDevelopmentPIN.output.length, 0);
  assert.equal(readDevelopmentJournal().row.state, 'QUARANTINED');
  assert.equal(readDevelopmentJournal().row.approval_started, 1);
  resetDevelopmentJournal();

  async function rejectCompiledDevelopmentPin(name, definition, replacement) {
    const rejectedHeader = join(temporary, `${name}-development-pins.h`);
    writeFileSync(rejectedHeader, [
      ...developmentPins.map(line => line.startsWith(`#define ${definition} `)
        ? `#define ${definition} ${JSON.stringify(replacement)}` : line),
      `#define PA_DEV_TEST_ROOT ${JSON.stringify(developmentRoot)}`,
      '#define PA_DEV_TEST_GENERATION_ID "provider.synthetic.non-live.generation"',
      '',
    ].join('\n'), { mode: 0o600 });
    const rejectedDirectory = join(temporary, `${name}-development-build`);
    const rejectedBuildResult = spawnSync('/usr/bin/make', [
      '-C', nativeDirectory, 'development-testnet-child-test', `BUILD_DIR=${rejectedDirectory}`,
      `DEV_TESTNET_PINS_HEADER=${rejectedHeader}`,
    ], { encoding: 'utf8' });
    assert.equal(rejectedBuildResult.status, 0, 'mismatched development test child build failed');
    const rejectedExecutable = join(rejectedDirectory,
      'provider-attestor-development-testnet-child-test');
    const result = await invokeDevelopment(vector.frame, null, 1_000, rejectedExecutable);
    assert.notEqual(result.code, 0);
    assert.equal(result.timedOut, false);
    assert.equal(result.output.length, 0);
    assert.equal(readDevelopmentJournal().row.state, 'QUARANTINED');
    resetDevelopmentJournal();
  }
  await rejectCompiledDevelopmentPin('module', 'PA_DEV_MODULE_SHA256', digest('0'));
  await rejectCompiledDevelopmentPin('object', 'PA_DEV_OBJECT_ID_BASE64URL',
    Buffer.alloc(16).toString('base64url'));
  verifiedDisposableRun = true;
}));
