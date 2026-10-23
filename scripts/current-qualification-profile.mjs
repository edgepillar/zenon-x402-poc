// Current-source qualification contract. Historical entries are never repinned.
import { createHash } from 'node:crypto';
import {
  constants, closeSync, fstatSync, lstatSync, openSync, readSync,
} from 'node:fs';
import { join, resolve, sep } from 'node:path';

export const PROFILE_ID = 'p0-current-p2-node24-v1';
export const PROFILE_PATH = 'qualification/profiles/p0-current-p2-node24-v1.json';
export const NODE_VERSION = '24.19.0';
export const ENTRY_PATHS = Object.freeze([
  'test/current-qualification-profile.test.js',
  'test/service-credit-custodied-sequential-runner-accepted-receipt-prototype.test.js',
  'qualification/service-credit-dispatch-abort-drain.behavior.draft.mjs',
]);
export const SOURCE_PATHS = Object.freeze([
  'package.json',
  'scripts/current-qualification-profile.mjs',
  'scripts/run-current-qualification.mjs',
  ...ENTRY_PATHS,
  'src/service-credit-http-execute-dispatch.js',
  'src/service-credit-custodied-sequential-runner.js',
  'src/service-credit-original-request-custody-contract.js',
  'src/service-credit-custodied-http-client.js',
  'src/service-credit-custodied-sequential-runner-core.js',
  'src/service-credit-custodied-request-owner.js',
]);
export const EXCLUDED_SCOPES = Object.freeze([
  'historical-discovery', 'sdk', 'x402-package-execution', 'sqlite',
  'native-http', 'network', 'keys-or-signatures', 'nonce-search',
  'real-prepare', 'payment', 'provider-or-pilot',
]);
const SHA = /^[a-f0-9]{64}$/;
const NAME = /^[A-Za-z0-9][A-Za-z0-9 ,:()/'._+-]{0,179}$/;
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
};
function refuse(code) {
  const error = new Error(code); error.code = code; throw error;
}
function exact(value, keys) {
  if (value === null || Array.isArray(value) || typeof value !== 'object'
      || Object.getPrototypeOf(value) !== Object.prototype
      || Object.keys(value).length !== keys.length
      || !keys.every(key => Object.hasOwn(value, key))) refuse('PROFILE_SHAPE');
}
function strings(value, expected) {
  return Array.isArray(value) && value.length === expected.length
    && value.every((item, index) => item === expected[index]);
}
export function parseCurrentQualificationProfile(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 32768
      || /[^\x09\x0a\x0d\x20-\x7e]/.test(text) || !text.endsWith('\n')) refuse('PROFILE_TEXT');
  let profile;
  try { profile = JSON.parse(text); } catch { refuse('PROFILE_JSON'); }
  exact(profile, ['schemaVersion', 'profileId', 'sourceBase', 'runtime', 'packageContract',
    'scope', 'excludedScopes', 'selections', 'sources']);
  if (profile.schemaVersion !== 1 || profile.profileId !== PROFILE_ID
      || !/^[a-f0-9]{40}$/.test(profile.sourceBase)) refuse('PROFILE_IDENTITY');
  exact(profile.runtime, ['node', 'platforms', 'installDependencies']);
  if (profile.runtime.node !== NODE_VERSION
      || !strings(profile.runtime.platforms, ['darwin-arm64', 'linux-x64', 'linux-arm64'])
      || profile.runtime.installDependencies !== false) refuse('PROFILE_RUNTIME');
  exact(profile.packageContract, ['name', 'type', 'nodeEngine', 'x402CoreDeclared',
    'x402CoreExecuted', 'sdkExecuted']);
  const pkg = profile.packageContract;
  if (pkg.name !== 'zenon-x402-poc' || pkg.type !== 'module' || pkg.nodeEngine !== '>=24'
      || pkg.x402CoreDeclared !== '2.23.0'
      || pkg.x402CoreExecuted !== false || pkg.sdkExecuted !== false) refuse('PROFILE_PACKAGE');
  if (profile.scope !== 'DECLARED_INTERFACE_COMPONENTS_AND_PROFILE_CONTRACT_ONLY'
      || !strings(profile.excludedScopes, EXCLUDED_SCOPES)) refuse('PROFILE_SCOPE');
  if (!Array.isArray(profile.selections) || profile.selections.length !== ENTRY_PATHS.length)
    refuse('PROFILE_SELECTION');
  const selected = new Set();
  for (const [index, entry] of profile.selections.entries()) {
    exact(entry, ['path', 'names']);
    if (entry.path !== ENTRY_PATHS[index] || !Array.isArray(entry.names)
        || entry.names.length !== [12, 1, 7][index]) refuse('PROFILE_SELECTION');
    for (const name of entry.names) {
      if (typeof name !== 'string' || !NAME.test(name) || selected.has(name)) refuse('PROFILE_CASE');
      selected.add(name);
    }
  }
  if (!Array.isArray(profile.sources) || profile.sources.length !== SOURCE_PATHS.length)
    refuse('PROFILE_SOURCES');
  let bytes = 0;
  for (const [index, source] of profile.sources.entries()) {
    exact(source, ['path', 'bytes', 'LF', 'sha256']);
    if (source.path !== SOURCE_PATHS[index] || !Number.isSafeInteger(source.bytes)
        || source.bytes < 1 || source.bytes > 131072
        || !Number.isSafeInteger(source.LF) || source.LF < 1 || source.LF > source.bytes
        || typeof source.sha256 !== 'string' || !SHA.test(source.sha256)) refuse('PROFILE_SOURCE');
    bytes += source.bytes;
  }
  if (bytes > 262144) refuse('PROFILE_SOURCE_BUDGET');
  return freeze(profile);
}
const identity = value => [value.dev, value.ino, value.uid, value.gid, value.mode,
  value.nlink, value.size, value.mtimeNs, value.ctimeNs].map(String);
function same(left, right) { return left.every((value, index) => value === right[index]); }
function boundedFile(repoRoot, relative, cap) {
  const path = join(repoRoot, relative);
  if (resolve(repoRoot, relative) !== path || !path.startsWith(repoRoot + sep)) refuse('SOURCE_PATH');
  // Check the leaf through its descriptor. The caller selects a trusted,
  // physical checkout; this is not authentication of hostile parent directories.
  const before = lstatSync(path, { bigint: true }), beforeId = identity(before);
  if (!before.isFile() || before.nlink !== 1n || before.size < 1n || before.size > BigInt(cap))
    refuse('SOURCE_FILE');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let raw;
  try {
    if (!same(identity(fstatSync(fd, { bigint: true })), beforeId)) refuse('SOURCE_IDENTITY');
    const buffer = Buffer.alloc(cap + 1);
    let used = 0, count;
    while (used <= cap && (count = readSync(fd, buffer, used, cap + 1 - used, null)) !== 0)
      used += count;
    if (used !== Number(before.size) || !same(identity(fstatSync(fd, { bigint: true })), beforeId))
      refuse('SOURCE_CHANGED');
    raw = buffer.subarray(0, used);
  } finally { closeSync(fd); }
  if (!same(identity(lstatSync(path, { bigint: true })), beforeId)) refuse('SOURCE_CHANGED');
  return { raw, identity: beforeId, sha256: createHash('sha256').update(raw).digest('hex') };
}
export function inspectCurrentQualificationProfile(repoRoot) {
  if (typeof repoRoot !== 'string' || resolve(repoRoot) !== repoRoot) refuse('SOURCE_ROOT');
  const manifest = boundedFile(repoRoot, PROFILE_PATH, 32768);
  const profile = parseCurrentQualificationProfile(manifest.raw.toString('utf8'));
  if (process.versions.node !== profile.runtime.node
      || !profile.runtime.platforms.includes(process.platform + '-' + process.arch))
    refuse('RUNTIME_NOT_SELECTED');
  const rows = profile.sources.map(source => {
    const file = boundedFile(repoRoot, source.path, 131072), text = file.raw.toString('utf8');
    if (file.raw.length !== source.bytes || file.sha256 !== source.sha256
        || text.split('\n').length - 1 !== source.LF || !text.endsWith('\n')
        || /[^\x09\x0a\x0d\x20-\x7e]/.test(text)) refuse('SOURCE_PIN_MISMATCH');
    if (source.path === 'package.json') {
      let pkg;
      try { pkg = JSON.parse(text); } catch { refuse('PACKAGE_JSON'); }
      if (pkg.name !== profile.packageContract.name || pkg.type !== 'module'
          || pkg.engines?.node !== profile.packageContract.nodeEngine
          || pkg.devDependencies?.['@x402/core'] !== profile.packageContract.x402CoreDeclared)
        refuse('PACKAGE_CONTRACT');
    }
    return { path: source.path, sha256: file.sha256, identity: file.identity };
  });
  return freeze({ profile, manifestSha256: manifest.sha256, manifestIdentity: manifest.identity, rows });
}
export function requireUnchangedProfile(before, after) {
  if (JSON.stringify(before) !== JSON.stringify(after)) refuse('SOURCE_CHANGED_DURING_RUN');
}
export function requireCompleteCaseResults(names, rows, counts, ended, reporterDone) {
  if (!Array.isArray(names) || new Set(names).size !== names.length
      || !Array.isArray(rows) || rows.length !== names.length || !ended || !reporterDone)
    refuse('INCOMPLETE_RESULTS');
  const seen = new Set();
  for (const row of rows) {
    if (!names.includes(row.name) || seen.has(row.name) || row.nesting !== 0
        || row.pass !== true || row.skip !== false || row.todo !== false)
      refuse('INCOMPLETE_RESULTS');
    seen.add(row.name);
  }
  const expected = { tests: names.length, suites: 0, pass: names.length,
    fail: 0, cancelled: 0, skipped: 0, todo: 0 };
  if (!counts || Object.keys(counts).length !== 7
      || !Object.entries(expected).every(([key, value]) => counts[key] === value))
    refuse('INCOMPLETE_RESULTS');
}
