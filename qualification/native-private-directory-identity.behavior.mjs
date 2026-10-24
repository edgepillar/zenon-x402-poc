// Actual DATA helper only. No fs, SQLite, SDK, key, signer, socket or child.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureNativePrivateDirectoryStatIdentity as capture } from '../src/native-private-directory-identity.js';

const UID = 501n;
const fixture = () => ({ dev: 4n, ino: 123n, uid: UID, gid: 20n, mode: 0o040700n });
const rejects = value => assert.throws(() => capture(value, UID), { code: 'NATIVE_PRIVATE_DIRECTORY_IDENTITY_REJECTED' });

test('exact stable directory tuple is frozen and detached', () => {
  const value = fixture(), actual = capture(value, UID);
  assert.deepEqual(actual, ['4', '123', '501', '20', '16832']);
  assert.equal(Object.isFrozen(actual), true);
  value.ino = 456n;
  assert.equal(actual[1], '123');
});

test('declared entry-count changes do not change the five selected identity fields', () => {
  const before = { ...fixture(), nlink: 7n, size: 224n, mtimeNs: 100n, ctimeNs: 100n };
  const after = { ...fixture(), nlink: 13n, size: 416n, mtimeNs: 200n, ctimeNs: 200n };
  const selected = s => ({ dev: s.dev, ino: s.ino, uid: s.uid, gid: s.gid, mode: s.mode });
  assert.notDeepEqual(before, after);
  assert.deepEqual(capture(selected(before), UID), capture(selected(after), UID));
  // These are declared records, NOT a new native APFS experiment.
});

for (const name of ['dev', 'ino', 'gid']) test('changed stable ' + name + ' is detectable', () => {
  const before = capture(fixture(), UID), after = fixture(); after[name]++;
  assert.notDeepEqual(capture(after, UID), before);
});
test('foreign owner is rejected', () => rejects({ ...fixture(), uid: UID + 1n }));
for (const mode of [0o040755n, 0o040600n, 0o044700n, 0o100700n, 0o120700n])
  test('nonprivate, special or nondirectory mode ' + mode.toString(8) + ' is rejected', () => rejects({ ...fixture(), mode }));
test('zero inode and overflowing scalar are rejected', () => {
  rejects({ ...fixture(), ino: 0n }); rejects({ ...fixture(), dev: 1n << 64n });
});
test('number/string coercion and negative scalar are rejected', () => {
  rejects({ ...fixture(), dev: 4 }); rejects({ ...fixture(), dev: '4' }); rejects({ ...fixture(), gid: -1n });
});
test('missing, extra and symbolic fields are rejected', () => {
  const missing = fixture(); delete missing.gid; rejects(missing);
  rejects({ ...fixture(), nlink: 1n }); rejects({ ...fixture(), [Symbol('extra')]: 1n });
});
test('accessor is refused without invoking it', () => {
  let entered = 0; const value = fixture();
  Object.defineProperty(value, 'ino', { enumerable: true, get() { entered++; throw new Error('unreachable'); } });
  rejects(value); assert.equal(entered, 0);
});
test('proxy and custom prototype are refused without invoking traps', () => {
  let entered = 0;
  rejects(new Proxy(fixture(), { getPrototypeOf() { entered++; throw new Error('unreachable'); } }));
  assert.equal(entered, 0); rejects(Object.assign(Object.create(null), fixture()));
});
test('expected owner and arity are exact', () => {
  assert.throws(() => capture(fixture(), 501)); assert.throws(() => capture(fixture(), -1n));
  assert.throws(() => capture(fixture(), UID, 'extra')); assert.throws(() => capture(fixture()));
});
