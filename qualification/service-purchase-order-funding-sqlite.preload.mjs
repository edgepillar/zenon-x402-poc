// Cooperative source admission before the native entry's imports. No loader
// hooks, source replacement, package evaluation, SQL engine or file creation.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const expected = [
  'package.json',
  'src/canonical.js',
  'src/service-credit-activation.js',
  'src/service-credit-model.js',
  'src/service-credit-original-request-custody-contract.js',
  'src/service-credit-pilot-original-payment-checkpoint.js',
  'src/service-credit-purchased-original-recovery.js',
  'src/service-credit-zenon-funding-evidence.js',
  'src/service-purchase-fulfillment.js',
  'src/service-purchase-order-funding.js',
  'src/service-purchase-order-funding-cas-contract.js',
  'src/service-purchase-order-funding-sqlite-store.js',
  'src/service-purchase-storage-contract.js',
  'src/service-purchase-terms.js',
  'src/x402-wire.js',
  'qualification/service-purchase-order-funding.fixture.mjs',
  'qualification/service-purchase-order-funding-sqlite.native.mjs',
  'qualification/service-purchase-order-funding-sqlite.preload.mjs',
].sort();
assert.equal(process.versions.node, '24.19.0');
assert.equal(process.env.X402_ORDER_FUNDING_SQLITE_SCOPE, 'purchase-order-funding-cas-v1');
assert.equal(process.env.X402_ORDER_FUNDING_NATIVE_PRELOADED, undefined);
for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'NODE_V8_COVERAGE']) assert.equal(process.env[key], undefined);
const raw = process.env.X402_ORDER_FUNDING_SOURCE_PINS;
assert.equal(typeof raw, 'string'); assert.ok(Buffer.byteLength(raw) <= 32768);
const pins = JSON.parse(raw);
assert.deepEqual(pins.map(row => row.path), expected);
const identity = s => [s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink, s.size, s.mtimeNs, s.ctimeNs].map(String);
let bytes = 0;
for (const pin of pins) {
  const file = path.join(repo, pin.path);
  for (let at = file; ; at = path.dirname(at)) {
    assert.equal(lstatSync(at).isSymbolicLink(), false);
    if (at === path.dirname(at)) break;
  }
  const before = lstatSync(file, { bigint: true });
  assert.ok(before.isFile()); assert.equal(before.nlink, 1n); assert.equal(before.uid, BigInt(process.getuid()));
  assert.deepEqual(identity(before), pin.identity); assert.equal(Number(before.size), pin.bytes);
  bytes += pin.bytes; assert.ok(bytes <= 524288);
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    assert.deepEqual(identity(fstatSync(fd, { bigint: true })), pin.identity);
    const source = readFileSync(fd); assert.equal(source.length, pin.bytes);
    assert.equal(createHash('sha256').update(source).digest('hex'), pin.sha256);
    assert.deepEqual(identity(fstatSync(fd, { bigint: true })), pin.identity);
  } finally { closeSync(fd); }
  assert.deepEqual(identity(lstatSync(file, { bigint: true })), pin.identity);
}
process.env.X402_ORDER_FUNDING_NATIVE_PRELOADED = 'source-pins-verified';
