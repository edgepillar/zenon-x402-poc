// Only extracted pure report/summary definitions execute. No native adapter module import.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';

if (process.version !== 'v24.19.0'
    || process.env.X402_WRITER_SUMMARY_DATA_SELECTION !== 'exact-v5-owned-writer-summary-data-v1')
  throw new TypeError('EXACT_WRITER_SUMMARY_DATA_SELECTION_REQUIRED');
const currentText = readFileSync(new URL('./capacity-native-current-offered-adapter-v5.draft.mjs', import.meta.url), 'utf8');
const baselineText = readFileSync(new URL('./capacity-native-current-offered-adapter-v4.draft.mjs', import.meta.url), 'utf8');
const NATIVE_SORT = Array.prototype.sort, NATIVE_MAP = Array.prototype.map;
const names = [], metrics = {};
let entered = 0, completed = 0;
function check(name, body) {
  names.push(name); test(name, { concurrency: false, timeout: 5000 }, () => { entered++; body(); completed++; });
}
function definitions(text) {
  const helperName = text.includes('function summarizeOwned(values)') ? 'summarizeOwned' : 'summarize';
  const hs = text.indexOf('function ' + helperName + '(values) {'), he = text.indexOf('\nfunction exact(', hs);
  const rs = text.indexOf('  function report(core) {'), re = text.indexOf('\n  function start(stopping)', rs);
  assert.ok(hs >= 0 && he > hs && rs >= 0 && re > rs);
  return { helperName, helper: text.slice(hs, he), report: text.slice(rs, re) };
}
const current = definitions(currentText), baseline = definitions(baselineText);
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function reference(values) {
  const sorted = [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  if (!sorted.length) return { samples: 0, min: null, p50: null, p95: null, p99: null, max: null };
  const rank = p => String(sorted[Math.ceil(sorted.length * p / 100) - 1]);
  return { samples: sorted.length, min: String(sorted[0]), p50: rank(50), p95: rank(95), p99: rank(99), max: String(sorted.at(-1)) };
}
function runHelper(def, values) {
  const owned = [...values], observed = { inputIteratorCalls: 0, inputIteratorValues: 0, ownedSortCalls: 0 };
  Object.defineProperty(owned, Symbol.iterator, { value: function* counted() {
    observed.inputIteratorCalls++; for (let i = 0; i < this.length; i++) { observed.inputIteratorValues++; yield this[i]; }
  } });
  Object.defineProperty(owned, 'sort', { value: function ownedSort(compare) {
    observed.ownedSortCalls++; return Reflect.apply(NATIVE_SORT, this, [compare]);
  } });
  const context = createContext({ F: Object.freeze, owned }, { codeGeneration: { strings: false, wasm: false } });
  const code = def.helper + '\n' + def.helperName + '(owned);';
  const report = new Script(code, { filename: 'exact-adapter-summary-definition' }).runInContext(context, { timeout: 2000 });
  assert.equal(Object.isFrozen(report), true);
  return { report: plain(report), observed, sortedInput: owned.slice() };
}
check('actual summary sorts its owned scratch array without another sorted copy', () => {
  const result = runHelper(current, [3n, 1n, 2n]);
  assert.equal(result.observed.ownedSortCalls, 1);
  assert.deepEqual(result.sortedInput, [1n, 2n, 3n]);
});
check('actual summary does not iterate its owned scratch array to duplicate values', () => {
  const result = runHelper(current, [7n, 0n, 7n]);
  assert.equal(result.observed.inputIteratorCalls, 0);
  assert.equal(result.observed.inputIteratorValues, 0);
});
for (const count of [0, 1, 2, 3, 5, 16, 31, 99, 100, 127, 3136]) {
  check('exact owned ranks match independent and baseline results for ' + count + ' samples', () => {
    const values = Array.from({ length: count }, (_, i) => BigInt((i * 7919) % 104729));
    const result = runHelper(current, values);
    assert.deepEqual(result.report, reference(values));
    assert.deepEqual(result.report, runHelper(baseline, values).report);
  });
}
check('zero ties odd ranks and maximum 128-bit durations retain exact strings', () => {
  for (const values of [
    [0n, 0n, 0n], [2n, 1n, 2n, 1n, 2n],
    [0n, 9007199254740993n, (1n << 128n) - 1n],
  ]) assert.deepEqual(runHelper(current, values).report, reference(values));
});
function statesFor(lanes, rows, observed, held = false) {
  return Array.from({ length: lanes }, (_, lane) => {
    const intervals = Array.from({ length: rows }, (_, i) => Object.freeze({
      ordinal: i + 1, bracketElapsedNs: String(BigInt(((rows - i) * 37 + lane) % 100003)),
      insideTransactionElapsedNs: String(BigInt((i * 17 + lane) % 101)),
    }));
    Object.defineProperty(intervals, 'map', { value: function mapWriter(fn) {
      const scratch = Reflect.apply(NATIVE_MAP, this, [fn]);
      observed.mappedWriterValues += scratch.length;
      Object.defineProperty(scratch, Symbol.iterator, { value: function* copiedWriter() {
        observed.writerCopies++; for (let i = 0; i < this.length; i++) { observed.copiedWriterValues++; yield this[i]; }
      } });
      Object.defineProperty(scratch, 'sort', { value: function ownedWriterSort(compare) {
        observed.ownedWriterSorts++; return Reflect.apply(NATIVE_SORT, this, [compare]);
      } });
      return scratch;
    } });
    Object.freeze(intervals);
    const balanceReadNs = [9n, 2n, 5n];
    Object.defineProperty(balanceReadNs, 'sort', { value() { throw new Error('RAW_BALANCE_ORDER_MUST_NOT_CHANGE'); } });
    Object.defineProperty(balanceReadNs, Symbol.iterator, { value: function* copiedBalance() {
      observed.balanceCopies++; for (let i = 0; i < this.length; i++) { observed.copiedBalanceValues++; yield this[i]; }
    } });
    Object.freeze(balanceReadNs);
    return Object.freeze({ laneId: 'lane.' + lane, acquisitionEntered: true, held, measurementUnknown: false,
      balanceReadsEntered: 3, balanceReadsPending: 0, balanceReadNs, timingPages: Math.ceil(rows / 64),
      finalTraceObserved: true, intervals, windowTrace: Object.freeze({ declared: true }), closeStatus: 'RETURNED' });
  });
}
function runReport(def, lanes, rows, held = false) {
  const observed = { mappedWriterValues: 0, writerCopies: 0, copiedWriterValues: 0, ownedWriterSorts: 0,
    balanceCopies: 0, copiedBalanceValues: 0 };
  const states = statesFor(lanes, rows, observed, held);
  const rawBefore = states.map(s => JSON.stringify(s.intervals)), balancesBefore = states.map(s => s.balanceReadNs.map(String));
  const identities = states.map(s => s.intervals.slice());
  const core = Object.freeze({ outcome: held ? 'HELD_UNKNOWN' : 'OBSERVED_SOURCE_OWNERS_RETURNED' });
  const context = createContext({ F: Object.freeze, states, globalOffers: 4, totalCalls: 256, core },
    { codeGeneration: { strings: false, wasm: false } });
  const result = new Script(def.helper + '\n' + def.report + '\nreport(core);',
    { filename: 'exact-adapter-report-and-summary-definitions' }).runInContext(context, { timeout: 2000 });
  assert.equal(Object.isFrozen(result), true); assert.equal(Object.isFrozen(result.lanes), true);
  assert.deepEqual(states.map(s => JSON.stringify(s.intervals)), rawBefore);
  assert.deepEqual(states.map(s => s.balanceReadNs.map(String)), balancesBefore);
  for (let lane = 0; lane < lanes; lane++)
    for (let i = 0; i < rows; i++) assert.strictEqual(states[lane].intervals[i], identities[lane][i]);
  const report = plain(result), version = report.nativeOfferedCapacityWorkloadAdapterVersion;
  delete report.nativeOfferedCapacityWorkloadAdapterVersion;
  return { report, version, observed };
}
for (const [label, lanes, rows, held] of [
  ['empty', 1, 0, false], ['small', 1, 7, false], ['held', 2, 64, true],
  ['full_lane', 1, 3136, false], ['maximum_lanes', 16, 3136, false],
]) check('actual report preserves raw evidence and exact baseline payload for ' + label, () => {
  const before = runReport(baseline, lanes, rows, held), after = runReport(current, lanes, rows, held);
  assert.equal(before.version, 4); assert.equal(after.version, 5);
  assert.deepEqual(after.report, before.report);
  assert.equal(after.observed.mappedWriterValues, 2 * lanes * rows);
  if (label === 'maximum_lanes') {
    assert.equal(before.observed.copiedWriterValues, 100352);
    metrics.fullWriterReport = { lanes, rowsPerLane: rows, mappedWriterValues: after.observed.mappedWriterValues,
      duplicateWriterValuesBefore: before.observed.copiedWriterValues,
      duplicateWriterValuesAfter: after.observed.copiedWriterValues,
      copiedBalanceValuesBefore: before.observed.copiedBalanceValues,
      copiedBalanceValuesAfter: after.observed.copiedBalanceValues,
      rawRowsRetained: lanes * rows, rawEvidenceChanged: false, heapBytesMeasured: false };
  }
});
after(() => console.log(JSON.stringify({
  event: 'EXACT_NATIVE_ADAPTER_OWNED_WRITER_SUMMARY_DATA', selected: names.length, entered, completed, names, ...metrics,
  actualDefinitionsExtracted: true, nativeAdapterImported: false, statesAndCoreDeclared: true,
  SDKImported: false, SQLite: false, keysOrSignatures: false, nonce: false, sockets: false,
  storageRootRead: false, managedTasksCreated: 0, nativeExecuted: false, productionQualified: false, authority: 'NONE',
})));
