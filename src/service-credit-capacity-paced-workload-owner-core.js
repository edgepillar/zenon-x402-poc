import { types as utilTypes } from 'node:util';
import { createServiceCreditCapacityWindowedAsyncWorkloadOwnerCore,
  createServiceCreditCapacityWindowedAsyncWorkloadOwnerCoreWithPrivateTimingTrace } from './service-credit-capacity-windowed-async-workload-owner-core.js';
import { createServiceCreditCapacityRecorder } from './service-credit-capacity-recorder.js';

const F = Object.freeze, A = Reflect.apply, D = Object.getOwnPropertyDescriptor;
const P = Object.getPrototypeOf, K = Reflect.ownKeys, O = Object.hasOwn;
const DEFINE = Object.defineProperty, IS_PROXY = utilTypes.isProxy, IS_PROMISE = utilTypes.isPromise;
const NATIVE = Promise, PP = NATIVE.prototype, THEN = D(PP, 'then');
const CTOR = D(PP, 'constructor'), SPECIES = D(NATIVE, Symbol.species);
const CORE = createServiceCreditCapacityWindowedAsyncWorkloadOwnerCore;
const TRACED_CORE = createServiceCreditCapacityWindowedAsyncWorkloadOwnerCoreWithPrivateTimingTrace;
const RECORDER = createServiceCreditCapacityRecorder;
const MAX_NS = (1n << 128n) - 1n, MILLION = 1000000n;
const METHODS = F(['fund', 'execute', 'checkBalances', 'openMeasurementWindow', 'stopMeasurementWindow', 'close']);
const OUTCOMES = F(['SUCCEEDED', 'REJECTED', 'UNKNOWN']);

/**
 * Opt-in paced P4 source workload: one funding, unchanged warmup, then globally
 * spaced measured source entries. This composes the genuine windowed owner;
 * it does not start an application, authenticate a host or alter native R4.
 *
 * One pending pacing timer; FIFO waiters are bounded by the real lane count.
 * A late timer admits at most one entry and anchors the NEXT gap to that entry,
 * never to missed historical slots. A busy lane is never replaced/overlapped.
 * This is bounded, closed-loop, minimum-gap admission, NOT an open-loop load
 * generator, guaranteed fixed offered rate or sustainable-throughput proof.
 *
 * Core funded-call latency INCLUDES pacing wait. Separate genuine recorders
 * report queue wait and measured source-entry-to-Promise-settlement latency.
 * Cancelled pre-entry requests never enter the latter distribution. Original
 * commands/ledger capabilities are forwarded unchanged, never re-created.
 *
 * STOP withdraws only not-yet-entered work. Entered source Promises remain
 * observed; an unobservable return retains an UNKNOWN slot. Finalized HELD
 * reports cannot be upgraded by late completion. Only captured host timers
 * and Promises are coordinated: no built-in clock/timer, retry, payment, SDK,
 * SQL, socket, file, key, worker or native resource is constructed here.
 */
export function createServiceCreditCapacityPacedWorkloadOwnerCore(configuration) {
  if (arguments.length !== 1 || !invariant()) fail('configuration_rejected');
  return construct(configuration, false);
}

/** Explicit private DATA capture; ordinary reports never include raw events. */
export function createServiceCreditCapacityPacedWorkloadOwnerCoreWithPrivateTimingTrace(configuration) {
  if (arguments.length !== 1 || !invariant()) fail('configuration_rejected');
  return construct(configuration, true);
}

function construct(configuration, traceEnabled) {
  let plan, limits, runtime, lanes, gapMs;
  try {
    const c = exact(configuration, ['plan', 'recordingLimits', 'runtime', 'lanes', 'pacing']);
    plan = F(exact(c.plan, ['warmupCallsPerLane', 'measurementCallsPerLane', 'setupBudgetMs',
      'measurementWindowMs', 'drainGraceMs', 'maxLedgerTransactionsPerOperation']));
    limits = F(exact(c.recordingLimits, ['maxSamplesPerPhase', 'maxInFlightPerPhase']));
    const pacing = exact(c.pacing, ['minimumStartGapMs']);
    gapMs = pacing.minimumStartGapMs;
    if (!Number.isSafeInteger(gapMs) || Object.is(gapMs, -0) || gapMs < 1 || gapMs > 1000) fail('configuration_rejected');
    runtime = F(exact(c.runtime, ['monotonicNowNs', 'schedule', 'cancel']));
    for (const fn of Object.values(runtime)) callable(fn);
    const values = dense(c.lanes), objects = new Set(), functions = new Set();
    lanes = values.map(value => {
      if (objects.has(value)) fail('configuration_rejected'); objects.add(value);
      const lane = F(exact(value, METHODS, true));
      for (const fn of Object.values(lane)) {
        callable(fn);
        if (functions.has(fn)) fail('configuration_rejected'); functions.add(fn);
      }
      return lane;
    });
  } catch { fail('configuration_rejected'); }
  configuration = null;

  const NOW = runtime.monotonicNowNs, SCHEDULE = runtime.schedule, CANCEL = runtime.cancel;
  const gapNs = BigInt(gapMs) * MILLION, usedTokens = new Set();
  let lastClock = null, nextStart = null, core = null, issue = null, stopped = false;
  let pumping = false, withdrawing = false, timer = null, final = null, running = null, resolveRun = null;
  let requested = 0, entered = 0, withheld = 0, pendingSource = 0, peakQueued = 0, timersStarted = 0;
  const queue = [], pending = new Set();
  const queueRecorder = RECORDER(limits), sourceRecorder = RECORDER(limits);
  const privateEvents = traceEnabled ? [] : null, maximumEvents = 4 * limits.maxSamplesPerPhase + 1;
  let privateCached = null, privateIssue = false;

  function unknown(code) { if (issue === null) issue = code; }
  function append(row) {
    if (!traceEnabled) return;
    if (privateCached !== null || privateEvents.length >= maximumEvents) {
      privateIssue = true; fail('private_timing_limit');
    }
    privateEvents.push(F({ sequence: privateEvents.length + 1, ...row }));
  }
  function clock() {
    const at = A(NOW, undefined, []);
    if (typeof at !== 'bigint' || at < 0n || at > MAX_NS || lastClock !== null && at < lastClock) fail('clock_rejected');
    lastClock = at; return at;
  }
  function schedule(callback, milliseconds) {
    const token = A(SCHEDULE, undefined, [callback, milliseconds]);
    if (token === null || token === undefined || usedTokens.has(token)) fail('timer_rejected');
    usedTokens.add(token); return token;
  }
  function cancelPacingTimer() {
    const slot = timer;
    if (slot === null || !slot.live) return;
    slot.live = false; timer = null;
    if (slot.installing) return; // The exact late token is handled after schedule returns.
    try { if (A(CANCEL, undefined, [slot.token]) !== undefined) unknown('PACING_CANCEL_UNKNOWN'); }
    catch { unknown('PACING_CANCEL_UNKNOWN'); }
  }
  function withdraw() {
    if (withdrawing) return;
    stopped = true; withdrawing = true;
    try {
      cancelPacingTimer();
      let at = null;
      if (queue.length) {
        try { at = clock(); } catch { unknown('PACING_CLOCK_UNKNOWN'); }
      }
      while (queue.length) {
        const row = queue.shift();
        if (row.state !== 'QUEUED') continue;
        row.state = 'WITHHELD'; withheld++;
        if (row.wait !== null && final === null && at !== null) {
          try { row.wait.finish('REJECTED', at); } catch { unknown('PACING_RECORDING_UNKNOWN'); }
        }
        try { append({ kind: 'WITHDRAW', request: row.request, recordedWait: row.wait !== null,
          atNs: at === null ? null : String(at) }); }
        catch { privateIssue = true; unknown('PRIVATE_TIMING_UNKNOWN'); }
        row.command = null; row.resolve('REJECTED');
      }
    } finally { withdrawing = false; }
  }
  function fault(code) {
    unknown(code); withdraw();
    // Genuine owner stops admission, marks service windows and owns fixed drain.
    if (core !== null) core.stop();
  }
  function terminal(row, value, observed) {
    if (row.state !== 'ENTERED') return;
    if (!observed) {
      // A throw or non-Promise is NOT evidence that an entered effect drained.
      row.state = 'UNOBSERVABLE';
      try { append({ kind: 'UNOBSERVABLE', request: row.request }); } catch { privateIssue = true; }
      fault('SOURCE_PROMISE_UNKNOWN'); row.resolve('UNKNOWN'); return;
    }
    row.state = 'SETTLED'; pending.delete(row); pendingSource--;
    const outcome = OUTCOMES.includes(value) ? value : 'UNKNOWN';
    if (final === null) {
      try {
        const at = clock(); row.source.finish(outcome, at);
        append({ kind: 'SOURCE_TERMINAL', request: row.request, outcome, atNs: String(at) });
      } catch { fault('PACING_RECORDING_UNKNOWN'); }
    }
    row.command = null;
    if (outcome === 'UNKNOWN') fault('SOURCE_OUTCOME_UNKNOWN');
    row.resolve(outcome); // Late observations may drain counters, never cached final DATA.
    if (!stopped) pump();
  }
  function observeSource(row, value) {
    if (!safe(value)) { terminal(row, undefined, false); return; }
    try {
      const bridge = A(THEN.value, value, [v => terminal(row, v, true), () => terminal(row, 'UNKNOWN', true)]);
      if (!safe(bridge)) throw error('promise_rejected');
      A(THEN.value, bridge, [discard, discard]);
    } catch { terminal(row, undefined, false); }
  }
  function armPacing(at) {
    const delay = Number((nextStart - at + MILLION - 1n) / MILLION);
    if (!Number.isSafeInteger(delay) || delay < 1 || delay > gapMs) { fault('PACING_DELAY_UNKNOWN'); return; }
    const slot = { token: null, live: true, installing: true, early: false };
    timer = slot;
    const callback = F(function pacingTick() {
      if (!slot.live) return undefined;
      slot.live = false; if (timer === slot) timer = null;
      if (slot.installing) { slot.early = true; return undefined; }
      if (arguments.length !== 0) { fault('PACING_TIMER_PROTOCOL_UNKNOWN'); return undefined; }
      if (!stopped && final === null) {
        let now;
        try { now = clock(); } catch { fault('PACING_CLOCK_UNKNOWN'); return undefined; }
        if (now < nextStart) fault('PACING_EARLY_TIMER_UNKNOWN');
        else pump(now);
      }
      return undefined;
    });
    try {
      slot.token = schedule(callback, delay); slot.installing = false; timersStarted++;
      if (slot.early) { slot.live = true; timer = slot; cancelPacingTimer(); fault('PACING_SYNCHRONOUS_TIMER_UNKNOWN'); }
      else if (stopped || final !== null || timer !== slot) {
        // stop/reentry may have withdrawn the installing slot before its token existed.
        slot.live = true; timer = slot; cancelPacingTimer();
      }
    } catch { slot.installing = false; slot.live = false; if (timer === slot) timer = null; fault('PACING_TIMER_SETUP_UNKNOWN'); }
  }
  function pump(observedAt) {
    if (pumping || stopped || final !== null || timer !== null || queue.length === 0) return;
    pumping = true;
    try {
      let at = observedAt;
      if (at === undefined) at = clock();
      if (stopped || final !== null || queue.length === 0) return;
      if (nextStart !== null && at < nextStart) { armPacing(at); return; }
      if (at > MAX_NS - gapNs) { fault('PACING_CLOCK_RANGE_UNKNOWN'); return; }
      const row = queue[0];
      // Reserve the next gap, both recorder handles and entry accounting BEFORE
      // entering a trusted source callback that can reenter run/stop.
      nextStart = at + gapNs;
      row.wait.finish('SUCCEEDED', at);
      row.wait = null;
      row.source = sourceRecorder.begin('FUNDED_CALL', at);
      queue.shift();
      row.state = 'ENTERED'; pending.add(row); pendingSource++; entered++;
      const command = row.command; row.command = null;
      append({ kind: 'DISPATCH', request: row.request, atNs: String(at) });
      let result;
      try { result = A(row.execute, undefined, [command]); }
      catch { terminal(row, undefined, false); return; }
      observeSource(row, result);
      if (!stopped && queue.length) armPacing(at);
    } catch { fault('PACING_RECORDING_OR_CLOCK_UNKNOWN'); }
    finally { pumping = false; }
  }
  function execute(lane, command, laneIndex) {
    if (command.cohort !== 'MEASUREMENT') return A(lane.execute, undefined, [command]);
    const cap = capability(), row = { state: 'QUEUED', execute: lane.execute, command,
      resolve: cap.resolve, wait: null, source: null };
    requested++; row.request = requested; queue.push(row); peakQueued = Math.max(peakQueued, queue.length);
    if (queue.length > lanes.length || requested > limits.maxSamplesPerPhase) {
      fault('PACING_CAPACITY_UNKNOWN'); return cap.promise;
    }
    try {
      append({ kind: 'REQUEST', request: row.request, lane: laneIndex, ordinal: command.ordinal });
      const at = clock();
      if (!stopped && row.state === 'QUEUED') {
        row.wait = queueRecorder.begin('FUNDED_CALL', at);
        append({ kind: 'WAIT_BEGIN', request: row.request, atNs: String(at) });
      }
      if (stopped) withdraw();
      else pump(at);
    } catch { fault('PACING_RECORDING_OR_CLOCK_UNKNOWN'); }
    return cap.promise;
  }

  const wrapped = F(lanes.map((lane, laneIndex) => F({
    fund: F(function fund(command) { return A(lane.fund, undefined, [command]); }),
    execute: F(function measuredExecute(command) { return execute(lane, command, laneIndex); }),
    checkBalances: F(function checkBalances() { return A(lane.checkBalances, undefined, []); }),
    openMeasurementWindow: F(function openMeasurementWindow() { return A(lane.openMeasurementWindow, undefined, []); }),
    stopMeasurementWindow: F(function stopMeasurementWindow() { withdraw(); return A(lane.stopMeasurementWindow, undefined, []); }),
    close: F(function close() { withdraw(); return A(lane.close, undefined, []); }),
  })));
  core = (traceEnabled ? TRACED_CORE : CORE)({ plan, recordingLimits: limits, lanes: wrapped, runtime: {
    monotonicNowNs: F(clock), schedule: F(schedule),
    cancel: F(function cancel(token) { return A(CANCEL, undefined, [token]); }),
  } });

  function publish(coreResult) {
    if (final !== null) return;
    withdraw();
    let waiting = null, dispatched = null;
    try { waiting = queueRecorder.finalize(); dispatched = sourceRecorder.finalize(); }
    catch { unknown('PACING_RECORDING_UNKNOWN'); }
    if (pendingSource || waiting === null || dispatched === null
        || waiting.recordingState === 'INCOMPLETE' || dispatched.recordingState === 'INCOMPLETE')
      unknown('PACING_DRAIN_UNKNOWN');
    let coreTrace = null;
    if (traceEnabled) {
      try { append({ kind: 'FINALIZE' }); } catch { privateIssue = true; }
      try { coreTrace = core.captureTimingEvidence(); } catch { privateIssue = true; }
      if (privateIssue) unknown('PRIVATE_TIMING_UNKNOWN');
    }
    final = F({
      pacedCapacityWorkloadOwnerVersion: 1, scope: 'TRUSTED_PACED_SOURCE_LANES_NOT_NATIVE_QUALIFICATION',
      outcome: issue === null && coreResult.outcome === 'OBSERVED_OWNERS_RETURNED'
        ? 'OBSERVED_OWNERS_RETURNED' : 'HELD_UNKNOWN',
      issue, minimumStartGapMs: gapMs, pacingAppliesTo: 'MEASUREMENT_ONLY',
      pacingModel: 'CLOSED_LOOP_MINIMUM_GAP_NO_CATCHUP_NOT_FIXED_OFFERED_RATE',
      requestedMeasuredCalls: requested, sourceExecuteEntries: entered, preEntryWithheld: withheld,
      pendingQueuedCalls: queue.length, pendingSourceObservations: pendingSource, peakQueuedCalls: peakQueued,
      pacingTimersStarted: timersStarted, maximumLivePacingTimers: 1,
      coreLatenciesIncludePacingWait: true, sourceLatencyExcludesPacingWait: true,
      queueWaitRecording: waiting, dispatchedCallRecording: dispatched, core: coreResult,
      nativeEventsAuthenticated: false, nativeResourcesQualified: false, fixedOfferedRateQualified: false,
      sustainableCapacityQualified: false, productionQualified: false, authority: 'NONE',
    });
    if (traceEnabled) privateCached = F({
      pacedTimingTraceVersion: 1, scope: 'PRIVATE_PACED_PARENT_SOURCE_DATA_NOT_NATIVE_AUTHENTICATION',
      clockDomain: 'PARENT_MONOTONIC_SHARED_WITH_CORE_NOT_CHILD_OR_SQL',
      limits, laneCount: lanes.length, minimumStartGapMs: gapMs, maximumEvents,
      unknown: privateIssue || final.outcome !== 'OBSERVED_OWNERS_RETURNED' || coreTrace === null
        || coreTrace.unknown || coreResult.recording === null || coreResult.recording.measurementNanoseconds === null,
      events: F(privateEvents), coreParentTimingTrace: coreTrace,
      rawIdentifiersIncluded: false, additionalClockReads: 0, nativeEventsAuthenticated: false,
      nativeResourcesQualified: false, sustainableCapacityQualified: false, authority: 'NONE',
    });
    resolveRun(final);
  }
  function start(stopFirst) {
    if (running !== null) return running;
    const cap = capability(); running = cap.promise; resolveRun = cap.resolve;
    if (stopFirst) withdraw();
    const value = stopFirst ? core.stop() : core.run();
    A(THEN.value, value, [publish, () => { fault('CORE_RESULT_UNKNOWN'); }]);
    return running;
  }
  const run = F(function run() {
    if (arguments.length !== 0) return rejected('input_rejected');
    return start(false);
  });
  const stop = F(function stop() {
    if (arguments.length !== 0) return rejected('input_rejected');
    if (running === null) return start(true);
    withdraw(); core.stop(); return running;
  });
  const inspect = F(function inspect() {
    if (arguments.length !== 0) fail('input_rejected');
    return F({ stopped, issue, requestedMeasuredCalls: requested, sourceExecuteEntries: entered,
      preEntryWithheld: withheld, pendingQueuedCalls: queue.length, pendingSourceObservations: pendingSource,
      pacingTimerPending: timer !== null, peakQueuedCalls: peakQueued, finalCached: final !== null,
      core: core.inspect(), authority: 'NONE' });
  });
  const captureTimingEvidence = F(function captureTimingEvidence() {
    if (arguments.length !== 0 || privateCached === null) fail('private_timing_not_finalized');
    return privateCached;
  });
  return traceEnabled ? F({ run, stop, inspect, captureTimingEvidence }) : F({ run, stop, inspect });
}

function exact(value, fields, frozen = false) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) || P(value) !== Object.prototype
      || K(value).length !== fields.length || frozen && !Object.isFrozen(value)) fail('input_rejected');
  const out = {};
  for (const name of fields) {
    const descriptor = D(value, name);
    if (!descriptor || !O(descriptor, 'value') || !descriptor.enumerable) fail('input_rejected');
    DEFINE(out, name, { value: descriptor.value, enumerable: true });
  }
  return out;
}
function dense(value) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) || P(value) !== Array.prototype
      || !Object.isFrozen(value)) fail('input_rejected');
  const size = D(value, 'length');
  if (!size || !O(size, 'value') || !Number.isSafeInteger(size.value) || size.value < 1 || size.value > 16
      || K(value).length !== size.value + 1) fail('input_rejected');
  const out = [];
  for (let i = 0; i < size.value; i++) {
    const item = D(value, String(i));
    if (!item || !O(item, 'value') || !item.enumerable) fail('input_rejected');
    out.push(item.value);
  }
  return out;
}
function callable(value) { if (typeof value !== 'function' || IS_PROXY(value) || !Object.isFrozen(value)) fail('input_rejected'); }
function same(a, b) { return !!a && !!b && K(a).length === K(b).length && K(b).every(k => O(a, k) && a[k] === b[k]); }
function invariant() {
  return D(Object.prototype, 'then') === undefined && D(Object.prototype, 'toJSON') === undefined
    && same(D(PP, 'then'), THEN) && same(D(PP, 'constructor'), CTOR) && same(D(NATIVE, Symbol.species), SPECIES);
}
function safe(value) {
  if (!invariant() || !IS_PROMISE(value) || IS_PROXY(value) || P(value) !== PP || D(value, 'then') !== undefined) return false;
  const descriptor = D(value, 'constructor');
  return descriptor === undefined || O(descriptor, 'value') && descriptor.value === NATIVE
    && !descriptor.enumerable && !descriptor.writable && !descriptor.configurable;
}
function capability() {
  let resolve;
  const promise = new NATIVE(yes => { resolve = yes; });
  DEFINE(promise, 'constructor', { value: NATIVE }); A(THEN.value, promise, [discard, discard]);
  return { promise, resolve };
}
function rejected(code) {
  const promise = new NATIVE((yes, no) => no(error(code)));
  DEFINE(promise, 'constructor', { value: NATIVE }); A(THEN.value, promise, [discard, discard]); return promise;
}
function error(kind) {
  const code = 'service_credit_capacity_paced_workload_' + kind, value = new TypeError(code);
  DEFINE(value, 'code', { value: code, enumerable: true }); DEFINE(value, 'stack', { value: 'TypeError: ' + code });
  return F(value);
}
function fail(kind) { throw error(kind); }
function discard() {}
