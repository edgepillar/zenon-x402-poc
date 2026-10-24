import { types as utilTypes } from 'node:util';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, O = Object.hasOwn;
const MAX_NS = 1n << 128n;

/** Strict DATA capture only: no SQL read, native-event authentication or
 * economic authority. The hardwired adapter must call the real pair anew.
 * Expectations come from its finite plan and independently observed completed
 * originals, never from the returned balance object itself.
 */
export function captureNativeCapacityBalanceRead(value, expectation) {
  if (arguments.length !== 2) fail();
  const e = exact(expectation, ['totalCalls', 'completedCalls']);
  integer(e.totalCalls, 1, 256); integer(e.completedCalls, 0, e.totalCalls);
  const v = exact(value, ['availableUnits', 'heldUnits', 'consumedUnits', 'finished', 'totalUnits', 'source']);
  for (const name of ['availableUnits', 'heldUnits', 'consumedUnits', 'finished', 'totalUnits'])
    integer(v[name], 0, 512);
  if (v.source !== 'ACTUAL_SERVICE_STORE_READ_NOT_CLIENT_DECLARATION'
      || v.totalUnits !== 2 * e.totalCalls || v.finished !== e.completedCalls
      || v.availableUnits !== 2 * (e.totalCalls - e.completedCalls) || v.heldUnits !== 0
      || v.consumedUnits !== 2 * e.completedCalls) fail();
  return F({
    observed: F({ availableUnits: BigInt(v.availableUnits), heldUnits: BigInt(v.heldUnits), consumedUnits: BigInt(v.consumedUnits) }),
    expected: F({ availableUnits: BigInt(2 * (e.totalCalls - e.completedCalls)), heldUnits: 0n, consumedUnits: BigInt(2 * e.completedCalls) }),
  });
}

/** Capture child-local writer brackets without merging clock domains.
 * Raw operation names and original request ids are validated but NOT retained.
 * Missing/unknown/active traces or changing page totals withhold measurement.
 * These records are declared DATA until bound to actual source-pinned IPC.
 */
export function captureNativeCapacityLedgerTimingPage(value, expectation) {
  if (arguments.length !== 2) fail();
  const e = exact(expectation, ['from', 'maximum', 'totalCalls', 'expectedTotal', 'previousAfterCommitNs']);
  integer(e.totalCalls, 1, 256); const limit = 12 * e.totalCalls + 64;
  integer(e.from, 0, limit); integer(e.maximum, 1, 64);
  if (e.expectedTotal !== null) integer(e.expectedTotal, 0, limit);
  if (e.from === 0 ? e.previousAfterCommitNs !== null : e.previousAfterCommitNs === null) fail();
  let previous = e.previousAfterCommitNs === null ? null : ns(e.previousAfterCommitNs);
  const v = exact(value, ['records', 'next', 'total', 'started', 'active', 'unknown', 'clockDomain']);
  integer(v.total, 0, limit); integer(v.started, 0, limit); integer(v.next, 0, v.total);
  if (v.active !== false || v.unknown !== false || v.clockDomain !== 'SERVICE_CHILD_LOCAL'
      || v.started !== v.total || e.from > v.total
      || e.expectedTotal !== null && e.expectedTotal !== v.total
      || v.next !== Math.min(v.total, e.from + e.maximum)) fail();
  const records = dense(v.records, v.next - e.from);
  const intervals = records.map((item, index) => {
    const row = exact(item, ['ordinal', 'operation', 'command', 'beforeBeginNs', 'afterBeginNs',
      'beforeCommitNs', 'afterCommitNs', 'changed', 'timingKind']);
    if (row.ordinal !== e.from + index + 1 || typeof row.operation !== 'string'
        || !/^[A-Za-z0-9_.:-]{1,96}$/.test(row.operation) || typeof row.command !== 'string'
        || row.command !== 'CONTROL' && !/^[0-9a-f]{64}$/.test(row.command)
        || typeof row.changed !== 'boolean'
        || row.timingKind !== 'ACTUAL_STORE_WRITER_BRACKET_INCLUDES_JS_AND_IDENTITY_CHECKS') fail();
    const before = ns(row.beforeBeginNs), afterBegin = ns(row.afterBeginNs);
    const beforeCommit = ns(row.beforeCommitNs), after = ns(row.afterCommitNs);
    if (previous !== null && before < previous || afterBegin < before || beforeCommit < afterBegin || after < beforeCommit) fail();
    previous = after;
    return F({ ordinal: row.ordinal, commandClass: row.command === 'CONTROL' ? 'CONTROL' : 'APPLICATION_ORIGINAL',
      changed: row.changed, beforeBeginNs: row.beforeBeginNs, afterBeginNs: row.afterBeginNs,
      beforeCommitNs: row.beforeCommitNs, afterCommitNs: row.afterCommitNs,
      bracketElapsedNs: String(after - before), insideTransactionElapsedNs: String(beforeCommit - afterBegin) });
  });
  return F({ next: v.next, total: v.total, started: v.started, intervals: F(intervals),
    lastAfterCommitNs: previous === null ? null : String(previous), clockDomain: 'SERVICE_CHILD_LOCAL',
    timingKind: 'WRITER_BRACKET_INCLUDES_JS_AND_IDENTITY_CHECKS_NOT_PURE_SQL_LATENCY',
    nativeEventsAuthenticated: false, authority: 'NONE' });
}

function ns(value) {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,38})$/.test(value)) fail();
  const n = BigInt(value); if (n >= MAX_NS) fail(); return n;
}
function integer(value, min, max) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < min || value > max) fail();
}
function exact(value, fields) {
  if (value === null || typeof value !== 'object' || utilTypes.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype || !Object.isFrozen(value)
      || Reflect.ownKeys(value).length !== fields.length) fail();
  const out = Object.create(null);
  for (const name of fields) {
    const d = D(value, name); if (!d || !O(d, 'value') || !d.enumerable) fail();
    Object.defineProperty(out, name, { value: d.value, enumerable: true });
  }
  return out;
}
function dense(value, length) {
  if (value === null || typeof value !== 'object' || utilTypes.isProxy(value)
      || Object.getPrototypeOf(value) !== Array.prototype || !Object.isFrozen(value)
      || value.length !== length || Reflect.ownKeys(value).length !== length + 1) fail();
  const out = [];
  for (let i = 0; i < length; i++) {
    const d = D(value, String(i)); if (!d || !O(d, 'value') || !d.enumerable) fail(); out.push(d.value);
  }
  return out;
}
function fail() {
  const code = 'NATIVE_CAPACITY_OBSERVATION_DATA_REJECTED', e = new TypeError(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code }); throw F(e);
}
