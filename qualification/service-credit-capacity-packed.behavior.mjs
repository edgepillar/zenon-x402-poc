import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServiceCreditCapacityRecorder as legacy } from '../src/service-credit-capacity-recorder.js';
import { createServiceCreditCapacityRecorderPacked as packed } from '../src/service-credit-capacity-recorder-packed.js';
import { createServiceCreditCapacityOfferedWindowOwnerCore as oldWindow } from '../src/service-credit-capacity-offered-window-owner-core.js';
import { createServiceCreditCapacityOfferedWindowPackedOwnerCore as newWindow } from '../src/service-credit-capacity-offered-window-packed-owner-core.js';
import { createServiceCreditCapacityOfferedWorkloadOwnerCore as oldWorkload } from '../src/service-credit-capacity-offered-workload-owner-core.js';
import { createServiceCreditCapacityOfferedWorkloadPackedOwnerCore as newWorkload } from '../src/service-credit-capacity-offered-workload-packed-owner-core.js';
import { createWindowFixture, createWorkloadFixture, deferred } from './service-credit-capacity-packed-fixtures.mjs';

if (process.version !== 'v24.19.0'
    || process.env.X402_CAPACITY_PACKED_DATA_SELECTION !== 'packed-recorder-and-offered-chain-data-v1')
  throw new TypeError('EXACT_PACKED_CAPACITY_DATA_SELECTION_REQUIRED');
const PHASES = ['FUNDING', 'FUNDED_CALL', 'LEDGER_TRANSACTION'];
const plain = value => JSON.parse(JSON.stringify(value));
const config = (samples = 64, active = Math.min(samples, 64)) =>
  ({ maxSamplesPerPhase: samples, maxInFlightPerPhase: active });
const names = [], metrics = {};
let entered = 0, completed = 0;
function check(name, body) {
  names.push(name);
  test(name, { concurrency: false, timeout: 15000 }, async () => { entered++; await body(); completed++; });
}
function reference(values) {
  const v = [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  if (!v.length) return { samples: 0, min: null, p50: null, p95: null, p99: null, max: null };
  const rank = p => String(v[Math.ceil(v.length * p / 100) - 1]);
  return { samples: v.length, min: String(v[0]), p50: rank(50), p95: rank(95), p99: rank(99), max: String(v.at(-1)) };
}
function caught(action) {
  try { action(); return null; } catch (error) {
    return { name: error.name, code: error.code, message: error.message, stack: error.stack,
      frozen: Object.isFrozen(error), cause: Object.hasOwn(error, 'cause') };
  }
}
function trace(create, outcomes, phase = 'FUNDED_CALL') {
  const r = create(config(Math.max(1, outcomes.length), Math.max(1, Math.min(64, outcomes.length))));
  const expected = [], success = [], handles = [];
  let at = 0n;
  for (let i = 0; i < outcomes.length; i++) handles.push({ handle: r.begin(phase, at++), start: at - 1n });
  for (let n = 0; n < handles.length; n++) {
    const i = (n % 2 === 0) ? Math.floor(n / 2) : handles.length - 1 - Math.floor(n / 2);
    at += BigInt((n * 37) % 101);
    const item = handles[i], duration = at - item.start, outcome = outcomes[i];
    item.handle.finish(outcome, at);
    expected.push(duration); if (outcome === 'SUCCEEDED') success.push(duration);
  }
  const retained = r.inspect().retainedDurationReferences, report = r.finalize();
  assert.deepEqual(plain(report.phases[phase].terminalLatencyNanoseconds), reference(expected));
  assert.deepEqual(plain(report.phases[phase].successfulLatencyNanoseconds), reference(success));
  assert.equal(r.inspect().retainedDurationReferences, 0);
  assert.strictEqual(r.finalize(), report);
  return { report: plain(report), retained };
}
check('empty reports and deeply frozen public records preserve the existing schema', () => {
  for (const create of [legacy, packed]) {
    const r = create(config()), report = r.finalize();
    assert.equal(Object.isFrozen(r), true); assert.equal(Object.isFrozen(report), true);
    assert.equal(Object.isFrozen(report.phases.FUNDING.successfulLatencyNanoseconds), true);
    assert.equal(report.authority, 'NONE'); assert.equal(report.recordingState, 'EMPTY');
  }
  assert.deepEqual(plain(packed(config()).finalize()), plain(legacy(config()).finalize()));
});
check('all 364 short outcome streams retain exact independent terminal and successful ranks', () => {
  let streams = 0;
  for (let count = 0; count <= 5; count++) {
    for (let code = 0; code < 3 ** count; code++) {
      let digits = code;
      const outcomes = Array.from({ length: count }, () => {
        const value = ['SUCCEEDED', 'REJECTED', 'UNKNOWN'][digits % 3]; digits = Math.floor(digits / 3); return value;
      });
      const before = trace(legacy, outcomes), after = trace(packed, outcomes);
      assert.deepEqual(after.report, before.report);
      assert.equal(after.retained, count);
      assert.equal(before.retained, count + outcomes.filter(v => v === 'SUCCEEDED').length);
      streams++;
    }
  }
  assert.equal(streams, 364); metrics.exhaustiveOutcomeStreams = streams;
});
for (const phase of PHASES) check('64 concurrent out-of-order completions preserve ' + phase + ' ranks', () => {
  const outcomes = Array.from({ length: 64 }, (_, i) => i % 5 === 0 ? 'REJECTED' : 'SUCCEEDED');
  assert.deepEqual(trace(packed, outcomes, phase).report, trace(legacy, outcomes, phase).report);
});
for (const duration of [0n, 1n, 9007199254740993n, (1n << 128n) - 1n])
  check('exact duration survives the success bit at ' + duration, () => {
    for (const outcome of ['SUCCEEDED', 'REJECTED', 'UNKNOWN']) {
      const reports = [];
      for (const create of [legacy, packed]) {
        const r = create(config(1, 1)); r.begin('FUNDING', 0n).finish(outcome, duration);
        const report = r.finalize(); reports.push(plain(report));
        assert.equal(report.phases.FUNDING.terminalLatencyNanoseconds.p99, String(duration));
        assert.equal(report.phases.FUNDING.successfulLatencyNanoseconds.samples, outcome === 'SUCCEEDED' ? 1 : 0);
      }
      assert.deepEqual(reports[0], reports[1]);
    }
  });
check('full 12288-sample all-success recording halves duration references and sort calls', () => {
  const observations = [];
  for (const create of [legacy, packed]) {
    const r = create(config(4096, 1)); let at = 0n;
    for (const phase of PHASES) for (let i = 0; i < 4096; i++) {
      const item = r.begin(phase, at); at += BigInt((i * 7919) % 1009);
      item.finish('SUCCEEDED', at); at++;
    }
    const retained = r.inspect().retainedDurationReferences;
    const original = Array.prototype.sort; let sorts = 0; let report;
    Array.prototype.sort = function sort(compare) { sorts++; return Reflect.apply(original, this, [compare]); };
    try { report = r.finalize(); } finally { Array.prototype.sort = original; }
    assert.equal(r.inspect().retainedDurationReferences, 0);
    observations.push({ retained, sorts, report: plain(report) });
  }
  assert.deepEqual(observations[0].report, observations[1].report);
  assert.deepEqual(observations.map(o => o.retained), [24576, 12288]);
  assert.deepEqual(observations.map(o => o.sorts), [6, 3]);
  metrics.fullBudget = { samples: 12288, durationReferencesBefore: 24576, durationReferencesAfter: 12288,
    sortCallsBefore: 6, sortCallsAfter: 3, finalDurationReferences: 0, heapBytesMeasured: false };
});
check('a full rejected-only phase needs one sort and produces an empty success series', () => {
  const reports = [];
  for (const create of [legacy, packed]) {
    const r = create(config(4096, 1)); let at = 0n;
    for (let i = 0; i < 4096; i++) { r.begin('LEDGER_TRANSACTION', at).finish('REJECTED', at + BigInt(i)); at += BigInt(i + 1); }
    assert.equal(r.inspect().retainedDurationReferences, 4096);
    reports.push(plain(r.finalize()));
  }
  assert.deepEqual(reports[0], reports[1]);
  assert.equal(reports[1].phases.LEDGER_TRANSACTION.successfulLatencyNanoseconds.samples, 0);
});
check('limits unknown duplicate finish and finalization retain exact refusal states', () => {
  const scripts = [
    r => { const a = r.begin('FUNDED_CALL', 0n); return [caught(() => r.begin('FUNDED_CALL', 1n)), caught(() => a.finish('SUCCEEDED', 2n))]; },
    r => { const a = r.begin('FUNDED_CALL', 0n); a.finish('UNKNOWN', 1n); return [caught(() => r.begin('FUNDING', 2n))]; },
    r => { const a = r.begin('FUNDED_CALL', 0n); a.finish('REJECTED', 1n); return [caught(() => a.finish('SUCCEEDED', 2n))]; },
    r => { r.begin('FUNDED_CALL', 0n); r.finalize(); return [caught(() => r.begin('FUNDED_CALL', 2n))]; },
    r => { const a = r.begin('FUNDED_CALL', 0n); return [caught(() => a.finish('OTHER', 1n)), caught(() => a.finish('SUCCEEDED', 2n))]; },
    r => { r.begin('FUNDING', 5n); return [caught(() => r.begin('FUNDED_CALL', 4n))]; },
    r => [caught(() => r.inspect(1)), caught(() => r.finalize(1))],
  ];
  for (const script of scripts) {
    const run = create => { const r = create(config(1, 1)); const errors = script(r); return { errors, report: plain(r.finalize()) }; };
    assert.deepEqual(run(packed), run(legacy));
  }
});
check('configuration balance and accessor boundaries are unchanged', () => {
  for (const input of [null, [], {}, { maxSamplesPerPhase: 1, maxInFlightPerPhase: 2 },
    { maxSamplesPerPhase: 4097, maxInFlightPerPhase: 1 }, { maxSamplesPerPhase: 1, maxInFlightPerPhase: -0 }])
    assert.deepEqual(caught(() => packed(input)), caught(() => legacy(input)));
  let hooks = 0;
  const bad = { get maxSamplesPerPhase() { hooks++; return 1; }, maxInFlightPerPhase: 1 };
  assert.deepEqual(caught(() => packed(bad)), caught(() => legacy(bad))); assert.equal(hooks, 0);
  const unit = (available, held = 0n) => ({ availableUnits: available, heldUnits: held, consumedUnits: 0n });
  const run = create => {
    const r = create(config(2, 1));
    assert.equal(r.recordLedgerBalanceCheck({ observed: unit(10n), expected: unit(10n) }), true);
    assert.equal(r.recordLedgerBalanceCheck({ observed: unit(9n, 1n), expected: unit(10n) }), false);
    return { error: caught(() => r.begin('FUNDING', 0n)), report: plain(r.finalize()) };
  };
  assert.deepEqual(run(packed), run(legacy));
});
async function compareOwner(kind, optionsFactory, prepare = null) {
  const fixture = kind === 'window' ? createWindowFixture : createWorkloadFixture;
  const oldCreate = kind === 'window' ? oldWindow : oldWorkload;
  const newCreate = kind === 'window' ? newWindow : newWorkload;
  const reports = [];
  for (const create of [oldCreate, newCreate]) {
    const h = fixture(create, optionsFactory());
    assert.equal(h.clockCalls, 0); assert.equal(h.timers.length, 0);
    const run = h.owner.run();
    if (prepare) await prepare(h);
    const report = await h.drive(); assert.strictEqual(await run, report);
    assert.strictEqual(await h.owner.run(), report);
    assert.equal(report.nativeResourcesQualified, false); assert.equal(report.productionQualified, false);
    reports.push(plain(report));
  }
  assert.deepEqual(reports[0], reports[1]);
  metrics.ownerCompositionsCompared = (metrics.ownerCompositionsCompared ?? 0) + 1;
  return reports[1];
}
for (const kind of ['window', 'workload']) {
  check(kind + ' packed chain is inert then completes the genuine source-owner lifecycle', async () => {
    const report = await compareOwner(kind, () => ({}));
    assert.equal(report.outcome, kind === 'window' ? 'OBSERVED_SOURCES_SETTLED' : 'OBSERVED_SOURCE_OWNERS_RETURNED');
  });
  check(kind + ' packed chain preserves rejected source outcomes and denominators', async () => {
    await compareOwner(kind, () => ({ execute: item => Promise.resolve(item.command.ordinal === 0 ? 'REJECTED' : 'SUCCEEDED') }));
  });
  check(kind + ' packed chain preserves UNKNOWN with one original and no replacement', async () => {
    const report = await compareOwner(kind, () => ({ execute: () => Promise.resolve('UNKNOWN') }));
    assert.equal(report.outcome, 'HELD_UNKNOWN');
  });
  check(kind + ' packed chain preserves unresolved original at its bounded deadline', async () => {
    const report = await compareOwner(kind, () => ({ execute: () => new Promise(() => {}) }));
    assert.equal(report.outcome, 'HELD_UNKNOWN');
  });
  check(kind + ' packed chain preserves stop and delegated ownership rules', async () => {
    await compareOwner(kind, () => ({}), async h => { h.owner.stop(); });
  });
  check(kind + ' packed chain preserves late timer observations', async () => {
    await compareOwner(kind, () => ({}), async h => {
      for (let i = 0; i < 80; i++) await undefined;
      const first = h.next(); if (first) await h.fire(first, first.due / 1000000n + 2n);
    });
  });
}
check('packed workload keeps an unresolved delegated close HELD', async () => {
  const report = await compareOwner('workload', () => ({ close: () => new Promise(() => {}) }));
  assert.equal(report.outcome, 'HELD_UNKNOWN');
});
check('packed workload preserves malformed close uncertainty', async () => {
  const report = await compareOwner('workload', () => ({ close: () => Promise.resolve(false) }));
  assert.equal(report.outcome, 'HELD_UNKNOWN');
});
for (const kind of ['window', 'workload']) check(kind + ' full 16-lane 4096-offer composition has identical complete reports', async () => {
  const report = await compareOwner(kind, () => ({ laneCount: 16,
    limits: { maxSamplesPerPhase: 4096, maxInFlightPerPhase: 16 },
    plan: { measurementWindowMs: 4096, arrivalIntervalMs: 1, ...(kind === 'workload' ? { measurementCallsPerLane: 4096 } : {}) } }));
  assert.equal(report.outcome, kind === 'window' ? 'OBSERVED_SOURCES_SETTLED' : 'OBSERVED_SOURCE_OWNERS_RETURNED');
});
after(() => {
  console.log(JSON.stringify({ event: 'CAPACITY_PACKED_RECORDER_AND_GENUINE_OFFERED_CHAIN_DATA',
    selected: names.length, entered, completed, names, ...metrics, nativeExecuted: false,
    callerClocksAndLanesDeclared: true, sockets: 0, SQLite: false, SDKImported: false,
    keysOrSignatures: false, nonce: false, profilesWritten: 0, managedTasksCreated: 0,
    productionQualified: false, authority: 'NONE' }));
});
