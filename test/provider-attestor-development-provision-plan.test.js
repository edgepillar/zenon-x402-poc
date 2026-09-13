import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  appendFileSync, chmodSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test as nodeTest } from 'node:test';

import {
  inspectFixedDevelopmentTargetsAbsentReadOnly,
  inspectPinnedImageReadOnly,
  parseDevelopmentProvisionPlanBytes,
  preflightDevelopmentProvisionPlanReadOnly,
  readPrivatePlanBytes,
} from '../native/provider-attestor/tests/development_testnet_provision_plan.mjs';

const PURPOSE = 'zenon-x402-development-testnet-disposable-provider-attestor';
const INVALID = 'DEVELOPMENT_PROVISION_PLAN_INVALID';

function sanitizedPlanFailure(category) {
  const error = new Error(category);
  error.stack = category;
  return error;
}

function test(name, callback) {
  return nodeTest(name, async t => {
    try { return await callback(t); } catch {
      throw sanitizedPlanFailure(`synthetic plan case failed: ${name}`);
    }
  });
}

function expectInvalid(action) {
  try { action(); } catch (error) {
    let exact = false;
    try { exact = error instanceof Error && error.message === INVALID; } catch {}
    if (exact) return;
    throw sanitizedPlanFailure('unexpected plan validation error');
  }
  throw sanitizedPlanFailure('expected plan validation error');
}

function assertPrivateBytesEqual(observed, expected) {
  if (!Buffer.isBuffer(observed) || !observed.equals(expected)) {
    throw sanitizedPlanFailure('private synthetic plan bytes mismatch');
  }
}

function samePrivateDirectory(observed, expected) {
  return observed.isDirectory() && !observed.isSymbolicLink()
    && observed.uid === process.getuid() && (observed.mode & 0o7777) === 0o700
    && observed.dev === expected.dev && observed.ino === expected.ino;
}

function removeVerifiedDirectory(path, expected) {
  if (!samePrivateDirectory(lstatSync(path), expected)) {
    throw sanitizedPlanFailure('synthetic plan cleanup failed');
  }
  rmSync(path, { recursive: true });
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function syntheticTemplate() {
  return {
    authorityRecordVersion: 1,
    authorityProfileId: 'zenon.provider-attestation.synthetic',
    authorityProfileVersion: 1,
    verifierVersion: 1,
    providerAuthorityId: 'provider.synthetic.non-live',
    generationId: 'provider.synthetic.non-live.generation',
    generationVersion: 1,
    keyId: 'provider.synthetic.non-live.key',
    algorithm: 'Ed25519',
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
    sourcePolicyCommitment: `sha256:${'8'.repeat(64)}`,
    maximumAttestationBytes: 4096,
    maximumCanonicalBytes: 524288,
    maximumInitialAgeSeconds: 300,
    maximumFutureSkewSeconds: 5,
    maximumValiditySeconds: 300,
  };
}

function fixture(t) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'pa-provision-plan-')));
  const createdDirectory = lstatSync(directory);
  t.after(() => {
    try { removeVerifiedDirectory(directory, createdDirectory); } catch {
      throw sanitizedPlanFailure('synthetic plan cleanup failed');
    }
  });
  const bootstrapPath = join(directory, 'synthetic-bootstrap');
  const modulePath = join(directory, 'synthetic-module');
  const bootstrapBytes = Buffer.from('non-executable synthetic bootstrap fixture');
  const moduleBytes = Buffer.from('non-module synthetic bytes');
  writeFileSync(bootstrapPath, bootstrapBytes, { mode: 0o600, flag: 'wx' });
  writeFileSync(modulePath, moduleBytes, { mode: 0o600, flag: 'wx' });
  const pin = (path, bytes) => ({
    path,
    sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  });
  const plan = {
    planVersion: 1,
    purpose: PURPOSE,
    authorityRecordTemplate: syntheticTemplate(),
    bootstrapExecutable: pin(bootstrapPath, bootstrapBytes),
    module: pin(modulePath, moduleBytes),
    validitySeconds: 120,
  };
  return { directory, plan, bootstrapPath, modulePath };
}

function parse(plan) {
  return parseDevelopmentProvisionPlanBytes(Buffer.from(canonicalJson(plan)));
}

test('plan validator refuses raw-suffixed errors with a fixed category', () => {
  assert.throws(() => expectInvalid(() => {
    throw new Error('DEVELOPMENT_PROVISION_PLAN_INVALID synthetic private detail');
  }), error => error?.message === 'unexpected plan validation error'
    && error.stack === 'unexpected plan validation error');
  assert.throws(() => assertPrivateBytesEqual(
    Buffer.from('synthetic private fixture path and digest'), Buffer.from('expected fixture'),
  ), error => error?.message === 'private synthetic plan bytes mismatch'
    && error.stack === 'private synthetic plan bytes mismatch');
});

test('synthetic read-only plan preflight accepts exact private absent targets and pinned images', t => {
  const { directory, plan } = fixture(t);
  const checked = parse(plan);
  assert.equal(preflightDevelopmentProvisionPlanReadOnly(checked, directory), true);
  assert.equal(inspectFixedDevelopmentTargetsAbsentReadOnly(directory), true);
});

test('plan schema refuses noncanonical input, missing authority choices, and added fields', t => {
  const { plan } = fixture(t);
  expectInvalid(() => parseDevelopmentProvisionPlanBytes(Buffer.from(JSON.stringify(plan))));
  expectInvalid(() => parseDevelopmentProvisionPlanBytes(Buffer.from(
    canonicalJson(plan).replace('"planVersion":1', '"planVersion":1,"planVersion":1'),
  )));
  for (const remove of ['chainProfile', 'bootstrapCheckpoint', 'sourcePolicyCommitment']) {
    const altered = structuredClone(plan);
    delete altered.authorityRecordTemplate[remove];
    expectInvalid(() => parse(altered));
  }
  const withPublicKey = structuredClone(plan);
  withPublicKey.authorityRecordTemplate.publicKey = 'forbidden';
  expectInvalid(() => parse(withPublicKey));
  const withUnknown = structuredClone(plan);
  withUnknown.unknown = true;
  expectInvalid(() => parse(withUnknown));
  const withInvalidValidity = structuredClone(plan);
  withInvalidValidity.validitySeconds = 301;
  expectInvalid(() => parse(withInvalidValidity));
  const withSameImage = structuredClone(plan);
  withSameImage.module = withSameImage.bootstrapExecutable;
  expectInvalid(() => parse(withSameImage));
});

test('pinned-image preflight refuses wrong digest, symlink, and unsafe mode', t => {
  const { plan, directory, bootstrapPath } = fixture(t);
  const checked = parse(plan);
  const wrongDigest = { ...checked.bootstrapExecutable, sha256: `sha256:${'0'.repeat(64)}` };
  expectInvalid(() => inspectPinnedImageReadOnly(wrongDigest));
  const alias = join(directory, 'synthetic-alias');
  symlinkSync(bootstrapPath, alias);
  expectInvalid(() => inspectPinnedImageReadOnly({ ...checked.bootstrapExecutable, path: alias }));
  chmodSync(bootstrapPath, 0o666);
  expectInvalid(() => inspectPinnedImageReadOnly(checked.bootstrapExecutable));
});

test('private canonical plan input refuses relaxed mode and symlink', t => {
  const { plan, directory } = fixture(t);
  const bytes = Buffer.from(canonicalJson(plan));
  const planPath = join(directory, 'synthetic-plan.json');
  writeFileSync(planPath, bytes, { mode: 0o600, flag: 'wx' });
  assertPrivateBytesEqual(readPrivatePlanBytes(planPath), bytes);
  chmodSync(planPath, 0o644);
  expectInvalid(() => readPrivatePlanBytes(planPath));
  chmodSync(planPath, 0o600);
  const alias = join(directory, 'synthetic-plan-alias');
  symlinkSync(planPath, alias);
  expectInvalid(() => readPrivatePlanBytes(alias));
});

test('private plan reader bounds the bytes it accepts', t => {
  const { directory } = fixture(t);
  const path = join(directory, 'bounded-synthetic-input');
  const maximum = Buffer.alloc(64 * 1024, 0x31);
  writeFileSync(path, maximum, { mode: 0o600, flag: 'wx' });
  assertPrivateBytesEqual(readPrivatePlanBytes(path), maximum);
  appendFileSync(path, Buffer.from([0x31]));
  expectInvalid(() => readPrivatePlanBytes(path));
});

test('fixed output preflight refuses either existing target and unsafe base', t => {
  const { directory } = fixture(t);
  const root = join(directory, 'ProviderAttestorDevelopmentTestnet');
  mkdirSync(root, { mode: 0o700 });
  const createdRoot = lstatSync(root);
  expectInvalid(() => inspectFixedDevelopmentTargetsAbsentReadOnly(directory));
  removeVerifiedDirectory(root, createdRoot);
  const staging = join(directory, 'ProviderAttestorDevelopmentTestnetStaging');
  mkdirSync(staging, { mode: 0o700 });
  const createdStaging = lstatSync(staging);
  expectInvalid(() => inspectFixedDevelopmentTargetsAbsentReadOnly(directory));
  removeVerifiedDirectory(staging, createdStaging);
  chmodSync(directory, 0o755);
  expectInvalid(() => inspectFixedDevelopmentTargetsAbsentReadOnly(directory));
  chmodSync(directory, 0o700);
});
