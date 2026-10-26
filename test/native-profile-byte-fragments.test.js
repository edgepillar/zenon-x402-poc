import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { matchesNativeProfileByteFragments as matches } from '../src/native-profile-byte-fragments.js';

test('exact complete bytes match across empty and arbitrary fragment boundaries', () => {
  for (let length = 0; length <= 256; length++) {
    const raw = Buffer.from(Array.from({ length }, (_, index) => (index * 37 + length) & 255));
    const cuts = [0, Math.floor(length / 3), Math.floor(length / 2), length];
    const fragments = cuts.map((start, index) => raw.subarray(start, cuts[index + 1] ?? length));
    assert.equal(matches(raw, fragments, 512), true);
    assert.equal(matches(raw, [raw], 512), true);
    assert.equal(matches(raw, [], 512), length === 0);
  }
});

test('changed bytes are rejected at every fragment boundary and interior position', () => {
  const raw = Buffer.from('{"alpha":"complete","beta":[1,2,3],"gamma":false}\n');
  const fragments = [raw.subarray(0, 1), raw.subarray(1, 19), Buffer.alloc(0), raw.subarray(19, 35), raw.subarray(35)];
  for (let index = 0; index < raw.length; index++) {
    const changed = Buffer.from(raw); changed[index] ^= 1;
    assert.equal(matches(changed, fragments, 512), false);
  }
  assert.equal(matches(Buffer.concat([raw, Buffer.from('\n')]), fragments, 512), false);
  assert.equal(matches(raw.subarray(1), fragments, 512), false);
});

test('fixed caps refuse overflow instead of accepting a prefix', () => {
  const raw = Buffer.from('abcd');
  assert.equal(matches(raw, [Buffer.from('ab'), Buffer.from('cd')], 4), true);
  assert.equal(matches(raw, [Buffer.from('ab'), Buffer.from('cd')], 3), false);
  assert.equal(matches(raw, [Buffer.from('abcd'), Buffer.from('e')], 4), false);
  assert.equal(matches(raw, [Buffer.from('abc')], 4), false);
  assert.equal(matches(raw, [Buffer.from('abcde')], 5), false);
});

test('fragment count is bounded even for zero-length fragments', () => {
  assert.equal(matches(Buffer.alloc(0), Array.from({ length: 256 }, () => Buffer.alloc(0)), 1), true);
  assert.equal(matches(Buffer.alloc(0), Array.from({ length: 257 }, () => Buffer.alloc(0)), 1), false);
});

test('invalid values and invalid integer caps are rejected', () => {
  const raw = Buffer.from('a');
  for (const maximum of [0, -1, 1.5, NaN, Infinity, true, '1', null, 1048577]) {
    assert.equal(matches(raw, [raw], maximum), false);
  }
  for (const actual of [null, {}, new Uint8Array([97]), 'a', true]) assert.equal(matches(actual, [raw], 1), false);
  for (const fragments of [null, {}, 'a', new Set([raw])]) assert.equal(matches(raw, fragments, 1), false);
  for (const fragment of [null, {}, new Uint8Array([97]), 'a', true]) assert.equal(matches(raw, [fragment], 1), false);
  assert.equal(matches(raw, [raw]), false);
  assert.equal(matches(raw, [raw], 1, null), false);
});

test('accessors, sparse arrays and proxies cannot provide fragment callbacks', () => {
  const raw = Buffer.from('a'); let reads = 0;
  const accessor = [raw]; Object.defineProperty(accessor, '0', { get() { reads++; return raw; } });
  assert.equal(matches(raw, accessor, 1), false);
  assert.equal(matches(raw, Array(1), 1), false);
  assert.equal(matches(raw, new Proxy([raw], { get() { reads++; throw Error('must not run'); } }), 1), false);
  assert.equal(matches(new Proxy(raw, { get() { reads++; throw Error('must not run'); } }), [raw], 1), false);
  assert.equal(matches(raw, [new Proxy(raw, { get() { reads++; throw Error('must not run'); } })], 1), false);
  const revoked = Proxy.revocable([], {}); revoked.revoke();
  assert.equal(matches(raw, revoked.proxy, 1), false);
  assert.equal(reads, 0);
});

test('own Buffer length accessors or forged lengths are refused without getter access', () => {
  const raw = Buffer.from('a'), expected = Buffer.from('a'); let reads = 0;
  Object.defineProperty(raw, 'length', { get() { reads++; throw Error('must not run'); } });
  assert.equal(matches(raw, [expected], 1), false);
  assert.equal(matches(expected, [raw], 1), false);
  assert.equal(reads, 0);
  const forged = Buffer.from('a'); Object.defineProperty(forged, 'length', { value: 0 });
  assert.equal(matches(forged, [expected], 1), false);
});

test('post-import Buffer comparison replacement is not dispatched', () => {
  const original = Buffer.prototype.compare; let calls = 0; let result;
  try {
    Buffer.prototype.compare = function() { calls++; throw Error('must not run'); };
    result = matches(Buffer.from('abc'), [Buffer.from('a'), Buffer.from('bc')], 3);
  } finally { Buffer.prototype.compare = original; }
  assert.equal(result, true); assert.equal(calls, 0);
});

test('no full expected Buffer concatenation is used during comparison', () => {
  const original = Buffer.concat, actual = Buffer.from('abc'); let calls = 0; let result;
  try {
    Buffer.concat = function() { calls++; throw Error('must not run'); };
    result = matches(actual, [Buffer.from('a'), Buffer.from('bc')], 3);
  } finally { Buffer.concat = original; }
  assert.equal(result, true); assert.equal(calls, 0);
});

test('all 32 whole profiles match the independent complete JSON reference', () => {
  const fields = {
    inputs: Array.from({ length: 558 }, (_, index) => ({ logicalPath: 'app/source-' + index,
      url: 'file:///synthetic/source-' + index, bytes: 100 + index, sha256: String(index).padStart(64, '0'),
      identity: ['1', String(index + 100), '501', '20', '33152', '1', String(100 + index), '100', '100'] })),
    runtime: { node: '24.19.0', platform: 'darwin', arch: 'arm64', nodeSha256: 'a'.repeat(64) },
    bareBindings: Array.from({ length: 16 }, (_, index) => ({ parentURL: 'file:///synthetic/parent-' + index,
      specifier: 'synthetic-package-' + index, targetURL: 'file:///synthetic/target-' + index }))
  };
  const shared = new Map(Object.entries(fields).map(([name, value]) => [name, Buffer.from(JSON.stringify(value))]));
  for (let index = 0; index < 32; index++) {
    const expected = { ...fields, laneId: 'lane-' + Math.floor(index / 2), profileVersion: 5,
      role: index % 2 ? 'SERVICE' : 'PAYER', runId: 'b'.repeat(64), childProfiles: [], rootPath: '/synthetic/private-' + index };
    const keys = Object.keys(expected).sort();
    const complete = Buffer.from(JSON.stringify(Object.fromEntries(keys.map(name => [name, expected[name]]))) + '\n');
    const fragments = [Buffer.from('{')];
    for (const [offset, name] of keys.entries()) {
      if (offset) fragments.push(Buffer.from(','));
      fragments.push(Buffer.from(JSON.stringify(name) + ':'), shared.get(name) ?? Buffer.from(JSON.stringify(expected[name])));
    }
    fragments.push(Buffer.from('}\n'));
    assert.equal(matches(complete, fragments, 524288), true);
    const changed = Buffer.from(complete); changed[Math.floor(changed.length / 2)] ^= 1;
    assert.equal(matches(changed, fragments, 524288), false);
  }
});

test('byte equality does not reinterpret noncanonical or reordered JSON', () => {
  const expected = Buffer.from('{"a":1,"b":2}\n');
  for (const raw of [Buffer.from('{"b":2,"a":1}\n'), Buffer.from('{ "a":1,"b":2}\n'),
    Buffer.from('{"a":1.0,"b":2}\n'), Buffer.from('{"a":1,"b":2,"b":2}\n')]) {
    assert.equal(matches(raw, [expected], 512), false);
  }
});

