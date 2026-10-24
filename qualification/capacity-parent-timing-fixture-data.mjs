// Generate declared DATA from the genuine source core. Never a native workload,
// namespace, application/SDK/SQL substitute or authenticated timing observation.
import { createServiceCreditCapacityWindowedAsyncWorkloadOwnerCoreWithPrivateTimingTrace as create } from '../src/service-credit-capacity-windowed-async-workload-owner-core.js';
import { checkServiceCreditCapacityParentTimingTraceData as check } from '../src/service-credit-capacity-parent-timing-trace-data.js';

if (process.version !== 'v24.19.0' || process.env.X402_CAPACITY_PARENT_FIXTURE_DATA !== 'source-recorder-fixtures-v1')
  throw new TypeError('CAPACITY_PARENT_FIXTURE_DATA_SELECTION_REQUIRED');
const F = Object.freeze, zero = F({ availableUnits: 10n, heldUnits: 0n, consumedUnits: 0n });
const balance = F({ observed: zero, expected: zero });
async function ticks() { for (let i = 0; i < 100; i++) await Promise.resolve(); }
async function scenario(partial) {
  let time = 0n; const timers = [], pending = [];
  const owner = create({
    plan: { warmupCallsPerLane: 1, measurementCallsPerLane: 4, setupBudgetMs: 30000,
      measurementWindowMs: 1000, drainGraceMs: 1000, maxLedgerTransactionsPerOperation: 3 },
    recordingLimits: { maxSamplesPerPhase: 128, maxInFlightPerPhase: 4 },
    runtime: { monotonicNowNs: F(() => ++time),
      schedule: F((callback, budget) => { const token = F({ n: timers.length });
        timers.push({ callback, budget, token, cancelled: false }); return token; }),
      cancel: F(token => { timers.find(t => t.token === token).cancelled = true; return undefined; }) },
    lanes: F([0, 1].map(() => F({ fund: F(() => Promise.resolve('SUCCEEDED')),
      execute: F(command => partial && command.cohort === 'MEASUREMENT'
        ? new Promise(resolve => { pending.push(resolve); }) : Promise.resolve('SUCCEEDED')),
      checkBalances: F(() => Promise.resolve(balance)), openMeasurementWindow: F(() => Promise.resolve(undefined)),
      stopMeasurementWindow: F(() => Promise.resolve(undefined)), close: F(() => Promise.resolve(undefined)) }))),
  });
  const promise = owner.run(); await ticks();
  if (partial) {
    if (pending.length !== 2 || owner.inspect().activeOperations !== 2) throw new TypeError('DATA_FIXTURE_PENDING_MISMATCH');
    const timer = timers.find(t => t.budget === 1000 && !t.cancelled);
    if (!timer) throw new TypeError('DATA_FIXTURE_WINDOW_NOT_ENTERED');
    timer.cancelled = true; timer.callback();
    for (const resolve of pending) resolve('SUCCEEDED');
    await ticks();
  }
  if (!owner.inspect().finalCached) throw new TypeError('DATA_FIXTURE_NOT_COMPLETE');
  const result = await promise, trace = owner.captureTimingEvidence();
  if (result.outcome !== 'OBSERVED_OWNERS_RETURNED' || result.plannedCallsCompleted !== !partial)
    throw new TypeError('DATA_FIXTURE_RESULT_MISMATCH');
  return F({ completedOriginalCallsPerLane: partial ? 2 : 5, trace, recording: result.recording,
    recomputed: check(F({ trace, recording: result.recording })) });
}
const cases = F({ full: await scenario(false), partial: await scenario(true) });
process.stdout.write(JSON.stringify(F({ fixtureVersion: 1, kind: 'SYNTHETIC_SOURCE_RECORDER_DATA_NOT_NATIVE_EVIDENCE',
  scenarios: cases, SDK: false, SQLite: false, keys: false, signatures: false, nonceSearch: false,
  sockets: false, applicationTimers: false, nativeChildren: false, authority: 'NONE' })) + '\n');
