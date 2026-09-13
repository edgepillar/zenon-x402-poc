// Read-only, opt-in preflight. This file never creates a token, root, key, or UI.
import { createHash } from 'node:crypto';
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readSync,
  realpathSync,
} from 'node:fs';
import { userInfo } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  parseZenonFundingProviderAttestationAuthorityRecord,
} from '../../../src/service-credit-zenon-funding-provider-attestation.js';

const PURPOSE = 'zenon-x402-development-testnet-disposable-provider-attestor';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const MAX_PLAN_BYTES = 64 * 1024;
const MAX_IMAGE_BYTES = 64 * 1024 * 1024;
const ROOT_NAME = 'ProviderAttestorDevelopmentTestnet';
const STAGING_NAME = 'ProviderAttestorDevelopmentTestnetStaging';
const TEMPLATE_KEYS = [
  'authorityRecordVersion', 'authorityProfileId', 'authorityProfileVersion',
  'verifierVersion', 'providerAuthorityId', 'generationId', 'generationVersion',
  'keyId', 'algorithm', 'network', 'chainProfile', 'observerPolicy',
  'confirmationPolicy', 'bootstrapCheckpoint', 'sourcePolicyCommitment',
  'maximumAttestationBytes', 'maximumCanonicalBytes',
  'maximumInitialAgeSeconds', 'maximumFutureSkewSeconds', 'maximumValiditySeconds',
];
// Only a parser input, never a candidate key or an output pin.
const VALIDATION_PUBLIC_KEY = Buffer.from(Array.from({ length: 32 }, (_unused, index) =>
  index + 1)).toString('base64url');

function invalid() { throw new Error('DEVELOPMENT_PROVISION_PLAN_INVALID'); }

function exactObject(value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid();
  const observed = Object.keys(value);
  if (observed.length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) invalid();
  return value;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function pinnedPath(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 4096
      || value.includes('\0') || !isAbsolute(value) || resolve(value) !== value) invalid();
  return value;
}

function pinnedImage(value) {
  exactObject(value, ['path', 'sha256']);
  pinnedPath(value.path);
  if (typeof value.sha256 !== 'string' || !DIGEST.test(value.sha256)) invalid();
  return Object.freeze({ path: value.path, sha256: value.sha256 });
}

export function parseDevelopmentProvisionPlanBytes(bytes) {
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > MAX_PLAN_BYTES) invalid();
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const parsed = JSON.parse(source);
    if (canonicalJson(parsed) !== source) invalid();
    exactObject(parsed, [
      'planVersion', 'purpose', 'authorityRecordTemplate',
      'bootstrapExecutable', 'module', 'validitySeconds',
    ]);
    if (parsed.planVersion !== 1 || parsed.purpose !== PURPOSE) invalid();
    const template = exactObject(parsed.authorityRecordTemplate, TEMPLATE_KEYS);
    if (Object.hasOwn(template, 'publicKey')) invalid();
    const checkedAuthority = parseZenonFundingProviderAttestationAuthorityRecord(
      canonicalJson({ ...template, publicKey: VALIDATION_PUBLIC_KEY }),
    );
    if (checkedAuthority.network !== 'zenon:testnet'
        || !Number.isSafeInteger(parsed.validitySeconds)
        || parsed.validitySeconds < 1
        || parsed.validitySeconds > template.maximumValiditySeconds) invalid();
    const bootstrapExecutable = pinnedImage(parsed.bootstrapExecutable);
    const module = pinnedImage(parsed.module);
    if (bootstrapExecutable.path === module.path) invalid();
    return Object.freeze({
      authorityRecordTemplate: Object.freeze(structuredClone(template)),
      bootstrapExecutable,
      module,
      validitySeconds: parsed.validitySeconds,
    });
  } catch { invalid(); }
}

function uid() {
  if (typeof process.geteuid !== 'function') invalid();
  const value = process.geteuid();
  if (!Number.isSafeInteger(value) || value < 0) invalid();
  return BigInt(value);
}

function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino
    && left.mode === right.mode && left.uid === right.uid && left.gid === right.gid
    && left.nlink === right.nlink && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function checkAncestors(path, effectiveUid) {
  let current = dirname(path);
  while (true) {
    if (realpathSync(current) !== current) invalid();
    const stat = lstatSync(current, { bigint: true });
    if ((stat.mode & 0o170000n) !== 0o040000n || stat.nlink < 1n
        || (stat.uid !== effectiveUid && stat.uid !== 0n)) invalid();
    const writable = (stat.mode & 0o022n) !== 0n;
    const special = stat.mode & 0o7000n;
    if ((!writable && special !== 0n)
        || (writable && (stat.uid !== 0n || special !== 0o1000n))) invalid();
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

export function inspectPinnedImageReadOnly(image, maximumBytes = MAX_IMAGE_BYTES) {
  let descriptor;
  try {
    pinnedImage(image);
    const effectiveUid = uid();
    checkAncestors(image.path, effectiveUid);
    if (realpathSync(image.path) !== image.path) invalid();
    const before = lstatSync(image.path, { bigint: true });
    if ((before.mode & 0o170000n) !== 0o100000n
        || (before.uid !== effectiveUid && before.uid !== 0n)
        || before.nlink !== 1n || (before.mode & 0o022n) !== 0n
        || (before.mode & 0o7000n) !== 0n || before.size < 1n
        || before.size > BigInt(maximumBytes)
        || !Number.isInteger(constants.O_NOFOLLOW) || constants.O_NOFOLLOW === 0) invalid();
    descriptor = openSync(image.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(descriptor, { bigint: true });
    if (!sameFile(before, opened)) invalid();
    const hasher = createHash('sha256');
    const buffer = Buffer.alloc(16384);
    let observed = 0n;
    while (observed < opened.size) {
      const wanted = Number(opened.size - observed < BigInt(buffer.length)
        ? opened.size - observed : BigInt(buffer.length));
      const count = readSync(descriptor, buffer, 0, wanted, null);
      if (count <= 0) invalid();
      hasher.update(buffer.subarray(0, count));
      observed += BigInt(count);
    }
    const extra = readSync(descriptor, buffer, 0, 1, null);
    if (extra !== 0 || !sameFile(opened, fstatSync(descriptor, { bigint: true }))
        || !sameFile(opened, lstatSync(image.path, { bigint: true }))
        || `sha256:${hasher.digest('hex')}` !== image.sha256) invalid();
    return true;
  } catch { invalid(); }
  finally { if (descriptor !== undefined) { try { closeSync(descriptor); } catch { invalid(); } } }
}

function absent(path) {
  try { lstatSync(path); invalid(); }
  catch (error) { if (error?.code !== 'ENOENT') invalid(); }
}

export function inspectFixedDevelopmentTargetsAbsentReadOnly(baseDirectory) {
  try {
    pinnedPath(baseDirectory);
    const effectiveUid = uid();
    checkAncestors(baseDirectory, effectiveUid);
    if (realpathSync(baseDirectory) !== baseDirectory) invalid();
    const base = lstatSync(baseDirectory, { bigint: true });
    if ((base.mode & 0o170000n) !== 0o040000n || base.uid !== effectiveUid
        || (base.mode & 0o7777n) !== 0o700n) invalid();
    absent(join(baseDirectory, ROOT_NAME));
    absent(join(baseDirectory, STAGING_NAME));
    return true;
  } catch { invalid(); }
}

export function preflightDevelopmentProvisionPlanReadOnly(plan, baseDirectory) {
  inspectFixedDevelopmentTargetsAbsentReadOnly(baseDirectory);
  inspectPinnedImageReadOnly(plan.bootstrapExecutable);
  inspectPinnedImageReadOnly(plan.module);
  return true;
}

export function readPrivatePlanBytes(path) {
  let descriptor;
  try {
    pinnedPath(path);
    checkAncestors(path, uid());
    if (realpathSync(path) !== path) invalid();
    if (!Number.isInteger(constants.O_NOFOLLOW) || constants.O_NOFOLLOW === 0) invalid();
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(descriptor, { bigint: true });
    if ((before.mode & 0o170000n) !== 0o100000n || before.uid !== uid()
        || before.nlink !== 1n || (before.mode & 0o7777n) !== 0o600n
        || before.size < 1n || before.size > BigInt(MAX_PLAN_BYTES)) invalid();
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, null);
      if (count <= 0) invalid();
      offset += count;
    }
    const probe = Buffer.alloc(1);
    if (readSync(descriptor, probe, 0, 1, null) !== 0
        || !sameFile(before, fstatSync(descriptor, { bigint: true }))
        || !sameFile(before, lstatSync(path, { bigint: true }))) invalid();
    return bytes;
  } catch { invalid(); }
  finally { if (descriptor !== undefined) { try { closeSync(descriptor); } catch { invalid(); } } }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  let passed = false;
  try {
    if (process.argv.length !== 3) invalid();
    const account = userInfo();
    if (account.uid !== process.geteuid() || !isAbsolute(account.homedir)) invalid();
    const baseDirectory = join(account.homedir, 'Library', 'Application Support', 'ZenonX402');
    const plan = parseDevelopmentProvisionPlanBytes(readPrivatePlanBytes(process.argv[2]));
    passed = preflightDevelopmentProvisionPlanReadOnly(plan, baseDirectory);
  } catch {}
  process.stdout.write(passed ? 'PLAN_PREFLIGHT=PASS\n' : 'PLAN_PREFLIGHT=FAIL\n');
  if (!passed) process.exitCode = 1;
}
