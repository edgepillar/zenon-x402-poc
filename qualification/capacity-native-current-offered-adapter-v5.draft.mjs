// CURRENT PACKED OFFERED V5 SOURCE. All old offered/unpaced/paced/R4 files stay unchanged.
/*
 * SOURCE ONLY: real existing paired supervisor bound to the actual funded
 * offered-calendar pipeline. No injected SDK, child, SQL, transport or clock.
 * No current native allowance/manifest selects this new graph. Source parsing
 * and declared pipeline tests are NOT native execution. Before any future run,
 * require a separate finite effects scope, complete parent/role admission and
 * managed storage with all reservations. No old profile kind or digest is
 * refreshed/relabelled here. Existing supervisor/child guards remain intact.
 */
import { setTimeout, clearTimeout } from 'node:timers';
import { resolve } from 'node:path';
import { types as utilTypes } from 'node:util';
import { createServiceCreditCapacityOfferedWorkloadPackedOwnerCore as CREATE_CORE } from '../src/service-credit-capacity-offered-workload-packed-owner-core.js';
import { captureNativeCapacityBalanceRead as BALANCE,
  captureNativeCapacityLedgerTimingPage as TIMING_PAGE } from '../src/service-credit-capacity-native-observation-data.js';
import { createNativeCapacityCurrentOfferedPairV4 as CREATE_PAIR } from './capacity-native-current-offered-pair-v4.supervisor.draft.mjs';
import { captureServiceCreditCapacityOfferedPlanData as PLAN_DATA } from '../src/service-credit-capacity-offered-plan-data.js';
import { createServiceCreditCapacityWindowWriterTraceData as WINDOW_TRACE } from '../src/service-credit-capacity-window-writer-trace-data.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, O = Object.hasOwn;

export function createNativeCapacityCurrentOfferedAdapterV5(configuration) {
  if (arguments.length !== 1) fail();
  const c = exact(configuration, ['context', 'plan', 'recordingLimits', 'laneProfiles', 'payeeAddress', 'commandBudgetMs', 'closeBudgetMs']);
  const context = F(exact(c.context, ['runId']));
  if (typeof context.runId !== 'string' || !/^[0-9a-f]{64}$/.test(context.runId)
      || typeof c.payeeAddress !== 'string' || !/^z1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38}$/.test(c.payeeAddress)) fail();
  // Validate the entire native plan before any profile read or paired owner.
  const admission = PLAN_DATA({ plan: c.plan, recordingLimits: c.recordingLimits,
    laneCount: dense(c.laneProfiles, 1, 16).length, commandBudgetMs: c.commandBudgetMs, closeBudgetMs: c.closeBudgetMs });
  const plan = admission.adapterPlan, limits = admission.recordingLimits;
  const globalOffers = admission.globalScheduledOffers, totalCalls = admission.serviceCallReservationPerLane;
  const ids = new Set(), paths = new Set(), digests = new Set();
  const states = dense(c.laneProfiles, 1, 16).map(value => {
    const row = exact(value, ['laneId', 'payerProfile', 'serviceProfile']);
    if (typeof row.laneId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(row.laneId) || ids.has(row.laneId)) fail();
    ids.add(row.laneId);
    function profile(input) {
      const out = F(exact(input, ['path', 'sha256']));
      if (typeof out.path !== 'string' || out.path.length > 4096 || !out.path.startsWith('/') || resolve(out.path) !== out.path
          || /[\r\n\0]/.test(out.path) || typeof out.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(out.sha256)
          || paths.has(out.path) || digests.has(out.sha256)) fail();
      paths.add(out.path); digests.add(out.sha256); return out;
    }
    return { laneId: row.laneId, payerProfile: profile(row.payerProfile), serviceProfile: profile(row.serviceProfile),
      pair: null, acquisitionEntered: false, funded: false, held: false, warmupCompleted: 0, measuredCompleted: 0,
      balanceReadsEntered: 0, balanceReadsPending: 0, balanceReadNs: [], intervals: [], timingPages: 0,
      finalTraceObserved: false, windowTrace: null, windowAttribution: [], measurementUnknown: false, closing: null, closeStatus: 'NOT_REQUESTED' };
  });
  let owner, running = null;
  function live(state) { if (state.held || state.closing !== null || state.pair === null) fail(); }
  const lanes = F(states.map(state => {
    const fund = F(async function fund(command) {
      try {
        const p = exact(command, ['cohort', 'ordinal', 'beginLedgerTransaction']);
        if (p.cohort !== 'WARMUP' || p.ordinal !== 0 || state.acquisitionEntered || state.closing !== null) fail();
        state.acquisitionEntered = true;
        state.pair = CREATE_PAIR(F({ context: F({ ...context, laneId: state.laneId }),
          plan: F({ warmupCallsPerLane: plan.warmupCallsPerLane, measurementCallsPerLane: plan.measurementCallsPerLane }),
          payerProfile: state.payerProfile, serviceProfile: state.serviceProfile, payeeAddress: c.payeeAddress,
          commandBudgetMs: c.commandBudgetMs, closeBudgetMs: c.closeBudgetMs }));
        const value = exact(await state.pair.fund(), ['status', 'authority']); live(state);
        if (value.status !== 'FUNDED' || value.authority !== 'NONE') fail();
        state.funded = true; return 'SUCCEEDED';
      } catch { state.held = true; throw problem(); }
    });
    const execute = F(async function execute(command) {
      try {
        live(state); const p = exact(command, ['cohort', 'ordinal', 'beginLedgerTransaction']);
        const warmup = state.warmupCompleted < plan.warmupCallsPerLane;
        const cohort = warmup ? 'WARMUP' : 'MEASUREMENT', ordinal = warmup ? state.warmupCompleted : state.measuredCompleted;
        if (!state.funded || p.cohort !== cohort || p.ordinal !== ordinal
            || ordinal >= (warmup ? plan.warmupCallsPerLane : plan.measurementCallsPerLane)) fail();
        const value = exact(await state.pair.execute(F({ cohort, ordinal })), ['status', 'cohort', 'ordinal', 'ledgerSource', 'authority']);
        live(state);
        if (value.status !== 'SUCCEEDED' || value.cohort !== cohort || value.ordinal !== ordinal
            || value.ledgerSource !== 'ACTUAL_SERVICE_STORE' || value.authority !== 'NONE') fail();
        if (warmup) state.warmupCompleted++; else state.measuredCompleted++;
        return 'SUCCEEDED';
      } catch { state.held = true; throw problem(); }
    });
    const openMeasurementWindow = F(async function openMeasurementWindow() {
      if (arguments.length !== 0) fail();
      try { live(state); await state.pair.openMeasurementWindow(); return undefined; }
      catch { state.measurementUnknown = true; throw problem(); }
    });
    const stopMeasurementWindow = F(async function stopMeasurementWindow() {
      if (arguments.length !== 0) fail();
      try {
        if (state.pair === null) fail();
        // Do not wait for the in-flight original, and do not convert a
        // measurement failure into operation failure or immediate app close.
        await state.pair.stopMeasurementWindow(); return undefined;
      } catch { state.measurementUnknown = true; throw problem(); }
    });
    const checkBalances = F(async function checkBalances() {
      let entered = false;
      try {
        if (arguments.length !== 0) fail(); live(state);
        if (!state.funded || state.balanceReadsPending !== 0 || state.balanceReadsEntered >= 3) fail();
        state.balanceReadsEntered++; state.balanceReadsPending++; entered = true;
        const start = now(), finalBarrier = owner.inspect().measurementPhase === 'POSTCHECK';
        if ((state.balanceReadsEntered === 3) !== finalBarrier) fail();
        // Always the real pair's new BALANCES command; never state.pair.inspect()
        // or a previous cached balance. SQL read overhead remains observable.
        const value = await state.pair.readBalances(); live(state);
        const captured = BALANCE(value, F({ totalCalls, completedCalls: state.warmupCompleted + state.measuredCompleted }));
        if (finalBarrier) {
          let from = 0, expectedTotal = null, previousAfterCommitNs = null;
          const trace = WINDOW_TRACE(F({ context: state.pair.serviceWindowContext(),
            plan: F({ warmupCallsPerLane: plan.warmupCallsPerLane, measurementCallsPerLane: plan.measurementCallsPerLane }),
            completion: F({ warmupCompleted: state.warmupCompleted, measuredCompleted: state.measuredCompleted }),
            window: state.pair.measurementWindowSnapshot() }));
          const maximumPages = Math.ceil((12 * totalCalls + 64) / 64);
          do {
            live(state); if (state.timingPages >= maximumPages) fail();
            const raw = await state.pair.ledgerPage(F({ from, maximum: 64 })); live(state);
            const page = TIMING_PAGE(raw, F({ from, maximum: 64, totalCalls, expectedTotal, previousAfterCommitNs }));
            state.timingPages++; if (page.total === 0) fail();
            const attributed = trace.append(raw);
            // PRIVATE evidence only. Retain the genuine raw command binding
            // beside its sanitized cohort/window row so an independent
            // controller can recompute every group and percentile. No raw
            // operation name, header, key or witness enters report().
            const rawRows = D(raw, 'records').value;
            const bindings = attributed.intervals.map((row, index) => {
              const command = D(rawRows[index], 'command').value;
              return F({ ...row, originalCommandDigest: command === 'CONTROL' ? null : command });
            });
            state.windowAttribution.push(...bindings); state.intervals.push(...page.intervals);
            from = page.next; expectedTotal = page.total;
            previousAfterCommitNs = page.lastAfterCommitNs;
          } while (from < expectedTotal);
          state.windowTrace = trace.finalize();
          if (state.windowTrace.status !== 'COMPLETE_DECLARED_WINDOW_TRACE_DATA') fail();
          state.finalTraceObserved = true;
        }
        const end = now(); if (end < start) fail(); state.balanceReadNs.push(end - start);
        return captured;
      } catch { state.held = true; throw problem(); }
      finally { if (entered) state.balanceReadsPending--; }
    });
    const close = F(function close() {
      if (arguments.length !== 0) return rejected();
      if (state.closing !== null) return state.closing;
      const cap = capability(); state.closing = cap.promise; state.closeStatus = 'PENDING';
      // Reserve the close Promise BEFORE the actual owned stop. Do not postpone
      // it behind trace paging: paging belongs to the tracked final read above.
      (async () => {
        try {
          if (state.pair === null) {
            if (state.acquisitionEntered) fail();
          } else {
            const value = exact(await state.pair.close(), ['status', 'held', 'activeOperation', 'children', 'nativeQualified', 'authority']);
            if (value.status !== 'CLOSED' || value.held !== false || value.activeOperation !== false
                || value.nativeQualified !== false || value.authority !== 'NONE') fail();
            const children = dense(value.children, 2, 2), roles = new Set();
            for (const child of children) {
              const r = exact(child, ['role', 'exited', 'closed', 'disconnected', 'exitCode', 'signal', 'fault', 'pending', 'stdout', 'stderr']);
              if (!['PAYER', 'SERVICE'].includes(r.role) || roles.has(r.role) || r.exited !== true || r.closed !== true
                  || r.disconnected !== true || r.exitCode !== 0 || r.signal !== null || r.fault !== false || r.pending !== 0) fail();
              roles.add(r.role);
              for (const name of ['stdout', 'stderr']) {
                const s = exact(r[name], ['observedBytes', 'retainedBytes', 'overflow', 'eof', 'prefixSha256']);
                integer(s.observedBytes, 0, name === 'stdout' ? 1024 : 8192);
                if (s.retainedBytes !== s.observedBytes || s.overflow !== false || s.eof !== true
                    || typeof s.prefixSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(s.prefixSha256)) fail();
              }
            }
          }
          state.closeStatus = 'RETURNED'; cap.resolve(undefined);
        } catch { state.held = true; state.closeStatus = 'UNKNOWN'; cap.reject(problem()); }
      })();
      return state.closing;
    });
    return F({ fund, execute, checkBalances, openMeasurementWindow, stopMeasurementWindow, close });
  }));
  owner = CREATE_CORE({ plan: { ...plan, closeGraceMs: c.closeBudgetMs }, recordingLimits: limits, lanes, runtime: {
    monotonicNowNs: F(now), schedule: F((callback, milliseconds) => setTimeout(callback, milliseconds)),
    cancel: F(token => { clearTimeout(token); return undefined; }),
  } });
  configuration = null;
  function report(core) {
    const unknown = core.outcome !== 'OBSERVED_SOURCE_OWNERS_RETURNED' || states.some(s => s.held || s.measurementUnknown);
    return F({ nativeOfferedCapacityWorkloadAdapterVersion: 5, status: unknown ? 'HELD_UNKNOWN' : 'OBSERVED_COMPONENT_ONLY',
      core, arrivalModel: 'FIXED_NOMINAL_CALENDAR_NO_QUEUE_OR_CATCHUP',
      globalScheduledOffers: globalOffers, perLaneFundedServiceCallCapacity: totalCalls,
      fundingIsSyntheticAndNotEconomicAcceptance: true,
      lanes: F(states.map(s => F({ laneId: s.laneId, pairAcquisitionEntered: s.acquisitionEntered,
        balanceReadsEntered: s.balanceReadsEntered, pendingBalanceReads: s.balanceReadsPending,
        balanceObservationRoundTripNs: summarizeOwned([...s.balanceReadNs]), timingPages: s.timingPages,
        serviceWriterTraceBeforeCloseObserved: s.finalTraceObserved, serviceWriterIntervals: s.intervals.length,
        writerBracketNs: summarizeOwned(s.intervals.map(r => BigInt(r.bracketElapsedNs))),
        insideWriterTransactionNs: summarizeOwned(s.intervals.map(r => BigInt(r.insideTransactionElapsedNs))),
        serviceChildWindowWriterTrace: s.windowTrace, measurementUnknown: s.measurementUnknown,
        closeStatus: s.closeStatus, held: s.held }))),
      parentClockDomain: 'PARENT_MONOTONIC_IPC_ROUNDTRIP_NOT_CHILD_OR_SQL_LATENCY',
      payerClockDomain: 'PAYER_CHILD_LOCAL', ledgerClockDomain: 'SERVICE_CHILD_LOCAL',
      childClockDomainsMerged: false, ledgerTimeInferredFromPromise: false,
      writerTraceCovers: 'WHOLE_RUN_BRACKETS_CLASSIFIED_AGAINST_SEPARATE_SERVICE_CHILD_WINDOW',
      parentAndServiceWindowsAligned: false, writerBracketsClipped: false, measurementWindowIsolationQualified: false,
      sustainedCapacityQualified: false, nativeEventsAuthenticated: false, nativeResourcesQualified: false,
      nativeOsNetworkSandbox: false, productionQualified: false, authority: 'NONE' });
  }
  function start(stopping) {
    if (running !== null) { if (stopping) owner.stop(); return running; }
    const cap = capability(); running = cap.promise;
    try { (stopping ? owner.stop() : owner.run()).then(value => {
      try { cap.resolve(report(value)); } catch { cap.reject(problem()); }
    }, () => cap.reject(problem())); } catch { cap.reject(problem()); }
    return running;
  }
  const run = F(function run() { if (arguments.length !== 0) return rejected(); return start(false); });
  const stop = F(function stop() { if (arguments.length !== 0) return rejected(); return start(true); });
  const inspect = F(function inspect() {
    if (arguments.length !== 0) fail();
    return F({ runRequested: running !== null, core: owner.inspect(), pairAcquisitionsEntered: states.filter(s => s.acquisitionEntered).length,
      pairHandlesCaptured: states.filter(s => s.pair !== null).length, nativeResourcesQualified: false, authority: 'NONE' });
  });
  // PRIVATE evidence capability for the future approved manager, never a public
  // JSON result. No raw profile path, witness, headers or stream is in report().
  const privateEvidence = F(function privateEvidence() {
    if (arguments.length !== 0) fail();
    return F(states.map(s => F({ laneId: s.laneId, serviceWriterIntervals: F([...s.intervals]),
      serviceWriterAttribution: F([...s.windowAttribution]),
      serviceMeasurementWindow: s.pair === null ? null : s.pair.measurementWindowSnapshot(),
      pairSnapshot: s.pair === null ? null : s.pair.inspect(),
      payerOperationTimings: s.pair === null ? F([]) : s.pair.payerOperationTimings(),
      privateStreams: s.pair === null ? F([]) : s.pair.privateStreams() })));
  });
  // No fabricated parent timing capsule: the new source owner publishes its
  // genuine prefix/measurement recordings; real child traces stay above.
  return F({ run, stop, inspect, privateEvidence });
}

function now() { const n = process.hrtime.bigint(); if (typeof n !== 'bigint' || n < 0n || n >= 1n << 128n) fail(); return n; }
// Each caller transfers a fresh scratch array; raw evidence stays untouched.
function summarizeOwned(values) {
  if (values.length === 0) return F({ samples: 0, min: null, p50: null, p95: null, p99: null, max: null });
  const sorted = values.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const rank = p => String(sorted[Math.ceil(sorted.length * p / 100) - 1]);
  return F({ samples: values.length, min: String(sorted[0]), p50: rank(50), p95: rank(95), p99: rank(99), max: String(sorted.at(-1)) });
}
function exact(value, names) {
  if (value === null || typeof value !== 'object' || utilTypes.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {};
  for (const name of names) {
    const d = D(value, name); if (!d || !O(d, 'value') || !d.enumerable) fail();
    Object.defineProperty(out, name, { value: d.value, enumerable: true });
  }
  return out;
}
function dense(value, min, max) {
  if (value === null || typeof value !== 'object' || utilTypes.isProxy(value)
      || Object.getPrototypeOf(value) !== Array.prototype || !Object.isFrozen(value)) fail();
  integer(value.length, min, max); if (Reflect.ownKeys(value).length !== value.length + 1) fail();
  const out = [];
  for (let i = 0; i < value.length; i++) {
    const d = D(value, String(i)); if (!d || !O(d, 'value') || !d.enumerable) fail(); out.push(d.value);
  }
  return out;
}
function integer(n, min, max) { if (!Number.isSafeInteger(n) || Object.is(n, -0) || n < min || n > max) fail(); }
function capability() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  Object.defineProperty(promise, 'constructor', { value: Promise }); promise.catch(() => undefined); return { promise, resolve, reject }; }
function rejected() { const cap = capability(); cap.reject(problem()); return cap.promise; }
function problem() { const e = new TypeError('NATIVE_CAPACITY_OFFERED_WORKLOAD_BINDING_UNAVAILABLE');
  Object.defineProperty(e, 'stack', { value: 'TypeError: NATIVE_CAPACITY_OFFERED_WORKLOAD_BINDING_UNAVAILABLE' }); return F(e); }
function fail() { throw problem(); }
