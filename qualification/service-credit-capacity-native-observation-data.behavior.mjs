import test from 'node:test';
import assert from 'node:assert/strict';
import { captureNativeCapacityBalanceRead as balance,
  captureNativeCapacityLedgerTimingPage as page } from '../src/service-credit-capacity-native-observation-data.js';

const F = Object.freeze, code = 'NATIVE_CAPACITY_OBSERVATION_DATA_REJECTED';
const expected = (change = {}) => F({ totalCalls: 5, completedCalls: 2, ...change });
const observed = (change = {}) => F({ availableUnits: 6, heldUnits: 0, consumedUnits: 4, finished: 2, totalUnits: 10,
  source: 'ACTUAL_SERVICE_STORE_READ_NOT_CLIENT_DECLARATION', ...change });
const row = (ordinal = 1, change = {}) => F({ ordinal, operation: 'getGrant', command: 'CONTROL',
  beforeBeginNs: String(10 * ordinal), afterBeginNs: String(10 * ordinal + 1),
  beforeCommitNs: String(10 * ordinal + 2), afterCommitNs: String(10 * ordinal + 3), changed: false,
  timingKind: 'ACTUAL_STORE_WRITER_BRACKET_INCLUDES_JS_AND_IDENTITY_CHECKS', ...change });
const frame = (change = {}) => F({ records: F([row()]), next: 1, total: 1, started: 1, active: false, unknown: false,
  clockDomain: 'SERVICE_CHILD_LOCAL', ...change });
const request = (change = {}) => F({ from: 0, maximum: 64, totalCalls: 5, expectedTotal: null, previousAfterCommitNs: null, ...change });
const refuses = work => assert.throws(work, { code });

test('actual balance DATA helper derives independent expected values and exact bigint recorder DTOs', () => {
  const got = balance(observed(), expected());
  assert.deepEqual(got, F({ observed: F({ availableUnits: 6n, heldUnits: 0n, consumedUnits: 4n }),
    expected: F({ availableUnits: 6n, heldUnits: 0n, consumedUnits: 4n }) }));
  assert.equal(Object.isFrozen(got), true); assert.equal(Object.isFrozen(got.observed), true);
});

test('balance expectations cannot be learned from an unrelated successful-looking balance', () => {
  refuses(() => balance(observed(), expected({ completedCalls: 3 })));
  refuses(() => balance(observed(), expected({ totalCalls: 6 })));
  for (const edit of [{ availableUnits: 7 }, { heldUnits: 1 }, { consumedUnits: 5 }, { finished: 3 },
    { totalUnits: 12 }, { source: 'CLIENT_DECLARATION' }]) refuses(() => balance(observed(edit), expected()));
});

test('balance rejects coercion, unsafe integers, negative zero and out-of-plan counts', () => {
  let hooks = 0;
  for (const v of ['6', true, -0, -1, NaN, Infinity, { valueOf() { hooks++; return 6; } }])
    refuses(() => balance(observed({ availableUnits: v }), expected()));
  for (const edit of [{ totalCalls: 0 }, { totalCalls: 257 }, { completedCalls: -0 }, { completedCalls: 6 }])
    refuses(() => balance(observed(), expected(edit)));
  assert.equal(hooks, 0);
});

test('balance capture rejects getters and proxies without invoking their hooks', () => {
  let hooks = 0;
  const accessor = F({ ...observed(), get source() { hooks++; return 'ACTUAL_SERVICE_STORE_READ_NOT_CLIENT_DECLARATION'; } });
  refuses(() => balance(accessor, expected()));
  refuses(() => balance(new Proxy(observed(), { getPrototypeOf() { hooks++; return Object.prototype; } }), expected()));
  const bad = F({ ...expected(), get completedCalls() { hooks++; return 2; } }); refuses(() => balance(observed(), bad));
  assert.equal(hooks, 0);
});

test('balance DTO and expectation must be exact frozen plain DATA', () => {
  refuses(() => balance({ ...observed() }, expected()));
  refuses(() => balance(F({ ...observed(), privateField: 'PRIVATE' }), expected()));
  refuses(() => balance(observed(), F({ ...expected(), extra: 1 })));
  refuses(() => balance(Object.assign(Object.create({ inherited: true }), observed()), expected()));
});

test('empty and exhausted finite-plan balances are representable without claiming a native read', () => {
  const before = balance(observed({ availableUnits: 10, consumedUnits: 0, finished: 0 }), expected({ completedCalls: 0 }));
  const after = balance(observed({ availableUnits: 0, consumedUnits: 10, finished: 5 }), expected({ completedCalls: 5 }));
  assert.equal(before.expected.availableUnits, 10n); assert.equal(after.observed.availableUnits, 0n);
});

test('child-local writer bracket DATA retains exact timing without exporting raw operation or original id', () => {
  const original = 'f'.repeat(64), input = frame({ records: F([row(1, { command: original, operation: 'PRIVATE_OPERATION_NAME' })]) });
  const got = page(input, request()), record = got.intervals[0];
  assert.equal(record.commandClass, 'APPLICATION_ORIGINAL'); assert.equal(record.bracketElapsedNs, '3');
  assert.equal(record.insideTransactionElapsedNs, '1'); assert.equal(record.beforeBeginNs, '10');
  assert.equal(got.clockDomain, 'SERVICE_CHILD_LOCAL'); assert.equal(got.nativeEventsAuthenticated, false);
  assert.equal(got.authority, 'NONE'); assert.equal(JSON.stringify(got).includes(original), false);
  assert.equal(JSON.stringify(got).includes('PRIVATE_OPERATION_NAME'), false); assert.equal(Object.isFrozen(record), true);
});

test('timing pages require stable totals and contiguous actual row ordinals', () => {
  const first = page(frame({ records: F([row(1), row(2)]), next: 2, total: 3, started: 3 }), request({ maximum: 2 }));
  const second = page(frame({ records: F([row(3)]), next: 3, total: 3, started: 3 }),
    request({ from: 2, maximum: 2, expectedTotal: 3, previousAfterCommitNs: first.lastAfterCommitNs }));
  assert.equal(second.next, 3); assert.equal(second.lastAfterCommitNs, '33');
  refuses(() => page(frame({ records: F([row(3)]), next: 3, total: 4, started: 4 }),
    request({ from: 2, maximum: 1, expectedTotal: 3, previousAfterCommitNs: '23' })));
});

test('empty timing DATA does not manufacture transactions or native qualification', () => {
  const got = page(frame({ records: F([]), next: 0, total: 0, started: 0 }), request());
  assert.equal(got.intervals.length, 0); assert.equal(got.lastAfterCommitNs, null); assert.equal(got.nativeEventsAuthenticated, false);
});

test('unknown active incomplete and foreign clock timing observations are rejected', () => {
  for (const edit of [{ active: true }, { active: 0 }, { unknown: true }, { started: 2 },
    { clockDomain: 'PARENT_MONOTONIC' }, { total: 2 }, { next: 0 }]) refuses(() => page(frame(edit), request()));
});

test('timing pages reject missing reordered and overflowing local boundaries', () => {
  for (const edit of [{ ordinal: 2 }, { beforeBeginNs: '12', afterBeginNs: '11' }, { beforeCommitNs: '9' },
    { afterCommitNs: '11' }, { beforeBeginNs: '01' }, { afterCommitNs: '-1' }, { afterCommitNs: '9'.repeat(39) }])
    refuses(() => page(frame({ records: F([row(1, edit)]) }), request()));
  refuses(() => page(frame({ records: F([row(1), row(2, { beforeBeginNs: '12' })]), next: 2, total: 2, started: 2 }), request()));
});

test('timing metadata labels and original-id shape are closed', () => {
  for (const edit of [{ operation: '../private' }, { operation: '' }, { command: 'PRIVATE_UNBOUNDED_VALUE' },
    { timingKind: 'PURE_SQL_LATENCY' }, { changed: 'false' }])
    refuses(() => page(frame({ records: F([row(1, edit)]) }), request()));
});

test('timing page source and policy limits cannot expand or reset across pages', () => {
  for (const edit of [{ maximum: 65 }, { maximum: 0 }, { from: -0 }, { from: 125 },
    { totalCalls: 0 }, { totalCalls: 257 }, { from: 1, previousAfterCommitNs: null },
    { previousAfterCommitNs: '9' }, { expectedTotal: 2 }]) refuses(() => page(frame(), request(edit)));
  refuses(() => page(frame({ total: 125, started: 125 }), request())); // Five calls permit at most 124 brackets.
});

test('array holes extra keys accessors and proxy traps cannot become timing evidence', () => {
  let hooks = 0; const holes = new Array(1); F(holes); refuses(() => page(frame({ records: holes }), request()));
  const extra = [row()]; extra.private = 'PRIVATE'; F(extra); refuses(() => page(frame({ records: extra }), request()));
  const trap = new Proxy(F([row()]), { getPrototypeOf() { hooks++; return Array.prototype; } });
  refuses(() => page(frame({ records: trap }), request()));
  const getter = []; Object.defineProperty(getter, '0', { enumerable: true, get() { hooks++; return row(); } }); F(getter);
  refuses(() => page(frame({ records: getter }), request())); assert.equal(hooks, 0);
});

test('timing captures detach DATA and reject mutable or extra-field rows', () => {
  const got = page(frame(), request());
  assert.equal(Object.isFrozen(got.intervals), true); assert.equal(Object.isFrozen(got), true);
  refuses(() => page(frame({ records: F([{ ...row() }]) }), request()));
  refuses(() => page(frame({ records: F([F({ ...row(), message: 'PRIVATE' })]) }), request()));
  refuses(() => page(F({ ...frame(), extra: true }), request()));
});

test('DATA helper public arity never adds authority or executes caller conversion', () => {
  refuses(() => balance(observed())); refuses(() => balance(observed(), expected(), 'extra'));
  refuses(() => page(frame())); refuses(() => page(frame(), request(), 'extra'));
  let hooks = 0; refuses(() => page(frame(), request({ previousAfterCommitNs: { toString() { hooks++; return '1'; } } })));
  assert.equal(hooks, 0);
});
