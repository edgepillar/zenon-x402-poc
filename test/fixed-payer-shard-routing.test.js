import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs, { chmodSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync,
  symlinkSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
const ioMethods = ['closeSync', 'fstatSync', 'lstatSync', 'openSync', 'readSync', 'realpathSync'];
const moduleSource = readFileSync(new URL('../src/zenon/fixed-payer-shard-routing.js', import.meta.url));
const originals = Object.fromEntries(ioMethods.map(name => [name, fs[name]])); let importIoCalls = 0;
try {
  for (const name of ioMethods) fs[name] = (...args) => {
    importIoCalls += 1;
    return originals[name](...args);
  };
  syncBuiltinESMExports();
} catch {
  assert.fail('unable to install import I/O probe');
}
let routingModule;
try {
  routingModule = await import(`data:text/javascript;base64,${moduleSource.toString('base64')}`);
} finally {
  for (const name of ioMethods) fs[name] = originals[name];
  syncBuiltinESMExports();
}
const { FIXED_PAYER_SHARD_MANIFEST_FILE: MANIFEST_FILE,
  FIXED_PAYER_SHARD_ROUTING_ERROR_CODES: CODES, FixedPayerShardRoutingError,
  createFixedPayerShardRouting } = routingModule;
const CONFIGURATION = Object.freeze({
  schemaVersion: 1,
  kind: 'zenon-fixed-payer-shard-routing',
  routingVersion: 1,
  shardIds: Object.freeze(['payer-shard-a', 'payer-shard-b']),
});
const GENERATION_FIELDS = [
  'dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs',
];
const BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
function manifestText(configuration = CONFIGURATION) {
  return `${JSON.stringify(configuration)}\n`;
}
function fingerprint(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}
function fixture(t, text = manifestText()) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'fixed-payer-shards-'));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, MANIFEST_FILE), text, { flag: 'wx', mode: 0o600 });
  return { root, text };
}
function options(root, text, expectedConfiguration = CONFIGURATION) {
  return {
    privateRoot: root,
    expectedManifestFingerprint: fingerprint(text),
    expectedConfiguration,
  };
}
function rejects(code) {
  return error => {
    assert.equal(error instanceof FixedPayerShardRoutingError, true);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    assert.equal(error.stack, undefined);
    return true;
  };
}
function step(checksum, word) {
  const top = checksum >>> 25;
  let result = ((checksum & 0x1ffffff) << 5) ^ word;
  for (let index = 0; index < 5; index += 1) {
    if ((top >>> index) & 1) result ^= GENERATORS[index];
  }
  return result >>> 0;
}
function address(payload) {
  let output = 'z1';
  let checksum = step(step(step(1, 3), 0), 26);
  let accumulator = 0;
  let bits = 0;
  for (const byte of payload) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      const word = (accumulator >>> bits) & 31;
      output += BECH32[word];
      checksum = step(checksum, word);
    }
  }
  assert.equal(bits, 0);
  for (let index = 0; index < 6; index += 1) checksum = step(checksum, 0);
  checksum = (checksum ^ 1) >>> 0;
  for (let index = 5; index >= 0; index -= 1) output += BECH32[(checksum >>> (5 * index)) & 31];
  return output;
}
function payer(fill = 7) {
  return address([0, ...Array(19).fill(fill)]);
}
function generation(path) {
  const stat = lstatSync(path, { bigint: true });
  return Object.fromEntries(GENERATION_FIELDS.map(field => [field, stat[field]]));
}
test('module import is I/O-inert and routing returns only a frozen descriptor', t => {
  assert.equal(importIoCalls, 0);
  const h = fixture(t);
  const manifestPath = join(h.root, MANIFEST_FILE);
  const before = {
    root: generation(h.root), file: generation(manifestPath), bytes: readFileSync(manifestPath),
  };
  const router = createFixedPayerShardRouting(options(h.root, h.text));
  const descriptor = router.route(payer());
  assert.equal(Object.isFrozen(router), true);
  assert.equal(Object.isFrozen(router.route), true);
  assert.equal(Object.isFrozen(descriptor), true);
  assert.deepEqual(Reflect.ownKeys(descriptor), ['version', 'shardId']);
  assert.equal(CONFIGURATION.shardIds.includes(descriptor.shardId), true);
  assert.deepEqual(generation(h.root), before.root);
  assert.deepEqual(generation(manifestPath), before.file);
  assert.deepEqual(readFileSync(manifestPath), before.bytes);
});
test('missing, extra, malformed and non-exact manifests fail closed', t => {
  const missing = mkdtempSync(join(realpathSync(tmpdir()), 'fixed-payer-shards-missing-'));
  chmodSync(missing, 0o700);
  t.after(() => rmSync(missing, { recursive: true, force: true }));
  assert.throws(() => createFixedPayerShardRouting(options(missing, manifestText())),
    rejects(CODES.UNSAFE_MANIFEST));
  const cases = [
    '{',
    `${JSON.stringify({ ...CONFIGURATION, extra: true })}\n`,
    `${JSON.stringify({ ...CONFIGURATION, schemaVersion: 2 })}\n`,
    `${JSON.stringify({ ...CONFIGURATION, shardIds: ['a', 'b', 'c'] })}\n`,
    `${JSON.stringify({ ...CONFIGURATION, shardIds: ['same', 'same'] })}\n`,
    ` ${manifestText()}`,
  ];
  for (const text of cases) {
    const h = fixture(t, text);
    assert.throws(() => createFixedPayerShardRouting(options(h.root, text)),
      rejects(CODES.MANIFEST_MISMATCH));
  }
});
test('private root and manifest metadata reject unsafe modes, symlinks and owners', t => {
  const rootMode = fixture(t);
  chmodSync(rootMode.root, 0o755);
  assert.throws(() => createFixedPayerShardRouting(options(rootMode.root, rootMode.text)),
    rejects(CODES.UNSAFE_PRIVATE_ROOT));
  const fileMode = fixture(t);
  chmodSync(join(fileMode.root, MANIFEST_FILE), 0o644);
  assert.throws(() => createFixedPayerShardRouting(options(fileMode.root, fileMode.text)),
    rejects(CODES.UNSAFE_MANIFEST));
  const linked = fixture(t);
  const manifestPath = join(linked.root, MANIFEST_FILE);
  const target = join(linked.root, 'target.json');
  writeFileSync(target, linked.text, { mode: 0o600 });
  rmSync(manifestPath);
  symlinkSync(target, manifestPath);
  assert.throws(() => createFixedPayerShardRouting(options(linked.root, linked.text)),
    rejects(CODES.UNSAFE_MANIFEST));
  if (typeof process.getuid === 'function') {
    const owned = fixture(t);
    const actual = process.getuid();
    t.mock.method(process, 'getuid', () => actual + 1);
    assert.throws(() => createFixedPayerShardRouting(options(owned.root, owned.text)),
      rejects(CODES.UNSAFE_PRIVATE_ROOT));
    t.mock.restoreAll();
  }
});
test('fingerprint and expected configuration mismatches never fall back', t => {
  const h = fixture(t);
  const wrongFingerprint = {
    ...options(h.root, h.text), expectedManifestFingerprint: `sha256:${'0'.repeat(64)}`,
  };
  assert.throws(() => createFixedPayerShardRouting(wrongFingerprint),
    rejects(CODES.MANIFEST_MISMATCH));
  const different = { ...CONFIGURATION, shardIds: ['payer-shard-a', 'payer-shard-c'] };
  assert.throws(() => createFixedPayerShardRouting(options(h.root, h.text, different)),
    rejects(CODES.MANIFEST_MISMATCH));
});
test('mapping is stable after re-open and selects exactly the configured two shards', t => {
  const h = fixture(t);
  const first = createFixedPayerShardRouting(options(h.root, h.text));
  const selected = new Set();
  let sample;
  for (let value = 1; value < 256 && selected.size < 2; value += 1) {
    const candidate = payer(value);
    const descriptor = first.route(candidate);
    selected.add(descriptor.shardId);
    sample ??= candidate;
  }
  assert.deepEqual([...selected].sort(), [...CONFIGURATION.shardIds].sort());
  const reopened = createFixedPayerShardRouting(options(h.root, h.text));
  assert.deepEqual(reopened.route(sample), first.route(sample));
});
test('invalid and noncanonical payer addresses are rejected without routing', t => {
  const h = fixture(t);
  const router = createFixedPayerShardRouting(options(h.root, h.text));
  const valid = payer();
  const invalid = [
    '', valid.toUpperCase(), `${valid.slice(0, -1)}!`, `${valid}q`,
    address(Array(20).fill(0)), address([1, ...Array(19).fill(7)]),
    new String(valid), null,
  ];
  for (const candidate of invalid) {
    assert.throws(() => router.route(candidate), rejects(CODES.INVALID_PAYER));
  }
  assert.throws(() => router.route(valid, 'extra'), rejects(CODES.INVALID_PAYER));
});
