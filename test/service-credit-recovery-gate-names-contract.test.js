import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Declared obligation-name consistency only; no obligation is satisfied here.
// Native fs/URL/intrinsics remain premises. No capture or runtime qualification.
const fixture = JSON.parse(readFileSync(
  new URL('./fixtures/service-credit-original-request-recovery-evidence-v1.json',
    import.meta.url), 'utf8'));

const EXPECTED = [
  'independentCurrentContext',
  'originalFunding',
  'providerREADY',
  'payerProviderPolicyAuthority',
  'nativeDurableOriginalState',
  'atomicWinners',
  'captureCompleteness',
  'realOSProcessBoundary'
];
const sortedExpected = [...EXPECTED].sort();

function assertExactNames(names) {
  assert.ok(Array.isArray(names), 'GATE_NAMES_LIST');
  assert.equal(names.length, 8, 'GATE_NAMES_COUNT');
  assert.ok(names.every(name => typeof name === 'string'), 'GATE_NAMES_STRINGS');
  assert.deepEqual([...names].sort(), sortedExpected, 'GATE_NAMES_MEMBERSHIP');
}

function rejectsAt(names, check) {
  assert.throws(() => assertExactNames(names), error =>
    error.code === 'ERR_ASSERTION' && error.message.includes(check));
}

test('fixture contains exactly eight obligation names in any order', () => {
  const names = fixture.UNQUALIFIED;
  const unchanged = [...names];
  assertExactNames(names);
  assertExactNames([...names].reverse());
  assert.deepEqual(names, unchanged);
});

test('each same-length foreign-name replacement is rejected', () => {
  const names = fixture.UNQUALIFIED;
  assertExactNames(names);
  for (let index = 0; index < names.length; index += 1) {
    const changed = [...names];
    changed[index] = 'SYNTHETIC_FOREIGN_OBLIGATION';
    assert.equal(changed.length, 8);
    rejectsAt(changed, 'GATE_NAMES_MEMBERSHIP');
  }
});

test('each omission and duplicate substitution is rejected', () => {
  const names = fixture.UNQUALIFIED;
  assertExactNames(names);
  for (let index = 0; index < names.length; index += 1) {
    const omitted = [...names];
    omitted.splice(index, 1);
    assert.equal(omitted.length, 7);
    rejectsAt(omitted, 'GATE_NAMES_COUNT');

    const duplicated = [...names];
    duplicated[index] = names[(index + 1) % names.length];
    assert.equal(duplicated.length, 8);
    rejectsAt(duplicated, 'GATE_NAMES_MEMBERSHIP');
  }
});
