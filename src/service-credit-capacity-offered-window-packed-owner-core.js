import { types as utilTypes } from 'node:util';
import { createServiceCreditCapacityRecorderPacked as createServiceCreditCapacityRecorder } from './service-credit-capacity-recorder-packed.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, P = Object.getPrototypeOf;
const K = Reflect.ownKeys, O = Object.hasOwn, A = Reflect.apply, DEFINE = Object.defineProperty;
const IS_PROXY = utilTypes.isProxy, IS_PROMISE = utilTypes.isPromise;
const NATIVE = Promise, PP = NATIVE.prototype, THEN = D(PP, 'then');
const CTOR = D(PP, 'constructor'), SPECIES = D(NATIVE, Symbol.species);
const RECORDER = createServiceCreditCapacityRecorder, MS = 1000000n, MAX_NS = (1n << 128n) - 1n;
const LANE_METHODS = F(['execute', 'checkBalances', 'openMeasurementWindow', 'stopMeasurementWindow']);

/**
 * Explicit P4 measurement owner over already-funded/warmed trusted source lanes.
 * No funding, native owner construction, store close, retry or replacement.
 * This owner opens/stops measurement admission; lane/resource lifetime remains
 * external. A HELD report must not be used to close/reopen borrowed resources.
 *
 * Nominal arrivals are anchored to one fixed start, independent of completions.
 * One callback admits at most one current offer. Missed slots never catch up.
 * Busy lanes reject the offer without a queue or overlapping a slow original.
 * Timing/ledger/balance callbacks are trusted SOURCE observations, not native
 * authentication, an offered-rate guarantee, sustainable load or economics.
 */
export function createServiceCreditCapacityOfferedWindowPackedOwnerCore(configuration) {
  let plan, runtime, limits, lanes;
  try {
    if (arguments.length !== 1 || !invariant()) fail('configuration_rejected');
    const c = exact(configuration, ['plan', 'runtime', 'recordingLimits', 'lanes']);
    plan = F(exact(c.plan, ['setupBudgetMs', 'measurementWindowMs', 'arrivalIntervalMs',
      'drainGraceMs', 'maxLedgerTransactionsPerOperation']));
    integer(plan.setupBudgetMs, 1, 60000); integer(plan.measurementWindowMs, 1, 60000);
    integer(plan.arrivalIntervalMs, 1, 1000); integer(plan.drainGraceMs, 1, 60000);
    integer(plan.maxLedgerTransactionsPerOperation, 1, 8);
    limits = F(exact(c.recordingLimits, ['maxSamplesPerPhase', 'maxInFlightPerPhase']));
    integer(limits.maxSamplesPerPhase, 1, 4096); integer(limits.maxInFlightPerPhase, 1, 64);
    runtime = F(exact(c.runtime, ['monotonicNowNs', 'schedule', 'cancel']));
    for (const fn of Object.values(runtime)) callable(fn);
    const values = dense(c.lanes), objects = new Set(), functions = new Set();
    lanes = values.map(value => {
      if (objects.has(value)) fail('configuration_rejected'); objects.add(value);
      const row = exact(value, LANE_METHODS, true);
      for (const fn of Object.values(row)) {
        callable(fn); if (functions.has(fn)) fail('configuration_rejected'); functions.add(fn);
      }
      return { ...row, busy: false, operation: null, entered: 0, openEntered: false,
        openOutcome: 'NOT_REQUESTED', stopEntered: false, stopOutcome: 'NOT_REQUESTED' };
    });
    const slots = Math.ceil(plan.measurementWindowMs / plan.arrivalIntervalMs);
    if (slots * plan.maxLedgerTransactionsPerOperation > limits.maxSamplesPerPhase
        || 2 * lanes.length > limits.maxSamplesPerPhase
        || lanes.length > limits.maxInFlightPerPhase) fail('configuration_rejected');
  } catch { fail('configuration_rejected'); }
  configuration = null;
  const NOW = runtime.monotonicNowNs, SCHEDULE = runtime.schedule, CANCEL = runtime.cancel;
  const planned = Math.ceil(plan.measurementWindowMs / plan.arrivalIntervalMs);
  const interval = BigInt(plan.arrivalIntervalMs) * MS;
  const recording = RECORDER(limits), postStopLedger = RECORDER(limits), startDelay = RECORDER(limits);
  const timers = { setup: null, window: null, arrival: null, drain: null }, tokens = new Set();
  let phase = 'IDLE', issue = null, stopped = false, final = null, running = null, resolveRun = null;
  let lastClock = null, setupDue = null, startedAt = null, endAt = null, stoppedAt = null, drainAt = null;
  let next = 0, cursor = 0, entered = 0, busyRejected = 0, missed = 0, withdrawn = 0;
  let pendingOperations = 0, pendingLedger = 0, pendingControls = 0, controlsInstalling = 0, timerInstalling = 0;
  let opensObserved = 0, stopsObserved = 0, balanceChecks = 0, ledgerStarts = 0, maxConcurrent = 0;
  let stopSweepStarted = false, drainAttempted = false, drainExpired = false, postcheckStarted = false;
  let postcheckFinished = false, progressing = false;
  let stopReason = null, scheduledTimers = 0, cancelledTimers = 0;

  function hold(code) { if (issue === null) issue = code; }
  function clock() {
    if (!invariant()) fail('intrinsics_rejected');
    const value = A(NOW, undefined, []);
    // A trusted clock can change the Promise contract before returning.
    // Fence new work before its timestamp grants admission to a callback.
    if (!invariant() || typeof value !== 'bigint' || value < 0n || value > MAX_NS
        || lastClock !== null && value < lastClock) fail('clock_rejected');
    lastClock = value; return value;
  }
  function cancel(kind) {
    const slot = timers[kind];
    if (slot === null || !slot.live) return;
    slot.live = false; timers[kind] = null;
    if (slot.installing) return; // Cancel this exact late token after schedule returns.
    try {
      if (A(CANCEL, undefined, [slot.token]) !== undefined) throw error('cancel_rejected');
      cancelledTimers++;
    } catch { hold('TIMER_CANCEL_UNKNOWN'); }
  }
  function arm(kind, due, at, work) {
    if (final !== null || timers[kind] !== null || due < at || due > MAX_NS) { timerFault(kind, 'TIMER_RANGE_UNKNOWN'); return; }
    const delay = Number((due - at + MS - 1n) / MS);
    if (!Number.isSafeInteger(delay) || delay < 1 || delay > 60000) { timerFault(kind, 'TIMER_RANGE_UNKNOWN'); return; }
    const slot = { kind, live: true, installing: true, early: false, token: null };
    timers[kind] = slot; timerInstalling++;
    const callback = F(function offeredWindowTick() {
      if (!slot.live) return undefined;
      slot.live = false; if (timers[kind] === slot) timers[kind] = null;
      if (slot.installing) { slot.early = true; return undefined; }
      if (arguments.length !== 0) { timerFault(kind, 'TIMER_PROTOCOL_UNKNOWN'); return undefined; }
      if (final !== null) return undefined;
      try {
        const now = clock();
        if (now < due) { timerFault(kind, 'EARLY_TIMER_UNKNOWN'); return undefined; }
        work(now);
      } catch { timerFault(kind, 'TIMER_OR_CLOCK_UNKNOWN'); }
      return undefined;
    });
    try {
      slot.token = A(SCHEDULE, undefined, [callback, delay]); scheduledTimers++;
      if (slot.token === undefined || slot.token === null || tokens.has(slot.token)) fail('timer_rejected');
      tokens.add(slot.token); slot.installing = false;
      if (slot.early) {
        slot.live = true; timers[kind] = slot; cancel(kind); timerFault(kind, 'SYNCHRONOUS_TIMER_UNKNOWN');
      } else if (!slot.live || final !== null || stopped && kind !== 'drain') {
        slot.live = true; timers[kind] = slot; cancel(kind);
      }
    } catch {
      slot.installing = false; slot.live = false;
      if (timers[kind] === slot) timers[kind] = null;
      timerFault(kind, 'TIMER_SETUP_UNKNOWN');
    } finally { timerInstalling--; progress(); }
  }
  function observe(value, yes, no) {
    if (!safe(value)) { no(false); return; }
    try {
      const bridge = A(THEN.value, value, [
        result => { try { yes(result); } catch { fault('OBSERVATION_UNKNOWN'); } },
        () => { try { no(true); } catch { fault('OBSERVATION_UNKNOWN'); } },
      ]);
      if (!safe(bridge)) fail('promise_rejected');
      A(THEN.value, bridge, [discard, discard]);
    } catch { no(false); }
  }
  function finish(handle, outcome, at) {
    if (final !== null) return;
    try { handle.finish(outcome, at); } catch { fault('RECORDING_UNKNOWN'); }
  }
  function fault(code) { hold(code); stopWork('FAULT'); }
  function timerFault(kind, code) {
    // The only drain callback cannot be retried/replaced when its observation
    // is unavailable. Preserve pending originals in an immediate HELD result.
    if (kind === 'drain') drainExpired = true;
    fault(code);
  }
  function setupObservation() {
    try {
      const now = clock();
      if (stopped || final !== null) return null;
      if (setupDue === null || now >= setupDue) {
        hold('SETUP_DEADLINE_UNKNOWN'); stopWork('SETUP_EXPIRED', now); return null;
      }
      return now;
    } catch { fault('SETUP_CLOCK_UNKNOWN'); return null; }
  }

  function sweepStops() {
    if (stopSweepStarted) return;
    stopSweepStarted = true; controlsInstalling++;
    // Reserve every entered window before the first trusted cleanup can reenter.
    const selected = lanes.filter(lane => lane.openEntered && !lane.stopEntered);
    for (const lane of selected) {
      lane.stopEntered = true; lane.stopOutcome = 'PENDING'; pendingControls++;
    }
    try {
      for (const lane of selected) {
        let settled = false;
        function terminal(value, observed) {
          if (settled) return;
          if (observed) { settled = true; pendingControls--; }
          lane.stopOutcome = observed && value === undefined ? 'RETURNED' : 'UNKNOWN';
          if (lane.stopOutcome === 'RETURNED') stopsObserved++;
          else hold('WINDOW_STOP_UNKNOWN');
          progress();
        }
        try { observe(A(lane.stopMeasurementWindow, undefined, []), v => terminal(v, true), known => terminal(null, known)); }
        catch { terminal(null, false); }
      }
    } finally { controlsInstalling--; }
  }
  function stopWork(reason, observedAt) {
    if (final !== null) return;
    if (!stopped) {
      stopped = true; stopReason = reason; phase = 'DRAINING';
      // Reserve the ENTIRE stop initialization before cancel/clock callbacks
      // can reenter progress. Every captured stop must remain callable.
      controlsInstalling++;
      try {
        cancel('setup'); cancel('arrival'); cancel('window');
        let expiredWindow = reason === 'WINDOW_EXPIRED';
        try {
          stoppedAt = observedAt === undefined ? clock() : observedAt;
          expiredWindow = endAt !== null && stoppedAt >= endAt;
          const expiredSetup = startedAt === null && setupDue !== null && stoppedAt >= setupDue;
          if (expiredWindow) stopReason = 'WINDOW_EXPIRED';
          else if (expiredSetup) { stopReason = 'SETUP_EXPIRED'; hold('SETUP_DEADLINE_UNKNOWN'); }
          // Manual stop/fault is not permission to renew an already expired
          // setup/window budget while its timer callback is still queued.
          const base = expiredWindow ? endAt : expiredSetup ? setupDue : stoppedAt;
          if (base > MAX_NS - BigInt(plan.drainGraceMs) * MS) fail('clock_rejected');
          drainAt = base + BigInt(plan.drainGraceMs) * MS;
        } catch { hold('STOP_CLOCK_UNKNOWN'); drainExpired = true; }
        if (expiredWindow) missed += planned - next;
        else withdrawn += planned - next;
        next = planned;
        sweepStops();
      } finally { controlsInstalling--; }
    }
    progress();
  }
  function controlBarrier(kind) {
    controlsInstalling++;
    let left = lanes.length, failed = false;
    const opening = kind === 'OPEN';
    const method = opening ? 'openMeasurementWindow' : 'checkBalances';
    function complete() {
      if (left !== 0 || controlsInstalling !== 0 || final !== null) return;
      if (failed) { fault(opening ? 'WINDOW_OPEN_UNKNOWN' : 'BALANCE_UNKNOWN'); return; }
      if (kind === 'POSTCHECK') { postcheckFinished = true; progress(); return; }
      if (stopped) { progress(); return; }
      if (kind === 'PRECHECK') {
        if (setupObservation() === null) return;
        phase = 'OPENING'; controlBarrier('OPEN');
      }
      else startMeasurement();
    }
    try {
      for (const lane of lanes) {
        if (final !== null || stopped && kind !== 'POSTCHECK'
            || kind === 'POSTCHECK' && issue !== null) { left--; continue; }
        if (kind !== 'POSTCHECK' && setupObservation() === null) { left--; continue; }
        if (kind === 'POSTCHECK') {
          try {
            const now = clock();
            if (drainAt === null || now >= drainAt) {
              failed = true; drainExpired = true; hold('DRAIN_DEADLINE_UNKNOWN'); left--; continue;
            }
          } catch { failed = true; drainExpired = true; hold('DRAIN_CLOCK_UNKNOWN'); left--; continue; }
        }
        let settled = false;
        if (opening) { lane.openEntered = true; lane.openOutcome = 'PENDING'; }
        pendingControls++;
        function terminal(value, observed) {
          if (settled) return;
          if (observed) { settled = true; pendingControls--; left--; }
          if (final === null) {
            try {
              if (!observed) fail('control_unobservable');
              if (opening) {
                if (value !== undefined) fail('window_rejected');
                lane.openOutcome = 'RETURNED'; opensObserved++;
              } else {
                const result = exact(value, ['observed', 'expected'], true);
                if (recording.recordLedgerBalanceCheck(result) !== true) fail('balance_rejected');
                balanceChecks++;
              }
            } catch {
              failed = true; hold(opening ? 'WINDOW_OPEN_UNKNOWN' : 'BALANCE_UNKNOWN');
              stopWork('FAULT');
            }
          }
          complete(); progress();
        }
        try { observe(A(lane[method], undefined, []), v => terminal(v, true), known => terminal(null, known)); }
        catch { terminal(null, false); }
      }
    } finally { controlsInstalling--; }
    complete(); progress();
  }

  function startMeasurement() {
    if (stopped || final !== null) return;
    const now = setupObservation();
    if (now === null) return;
    cancel('setup');
    if (issue !== null || stopped || final !== null) { stopWork('FAULT'); return; }
    try {
      // Cancellation is a trusted callback too; capture the actual start only
      // after it returns, and never beat an expired setup timer via microtasks.
      const now = setupObservation();
      if (now === null) return;
      if (stopped || final !== null) return;
      if (now > MAX_NS - BigInt(plan.measurementWindowMs + plan.drainGraceMs) * MS) fail('clock_rejected');
      startedAt = now; endAt = now + BigInt(plan.measurementWindowMs) * MS; phase = 'MEASURING';
      arm('window', endAt, now, at => stopWork('WINDOW_EXPIRED', at));
      if (!stopped && final === null) tick();
    } catch { fault('MEASUREMENT_CLOCK_UNKNOWN'); }
  }
  function tick() {
    if (phase !== 'MEASURING' || stopped || final !== null) return;
    try {
      const now = clock();
      if (stopped || final !== null) return;
      if (now >= endAt) { stopWork('WINDOW_EXPIRED', now); return; }
      const slot = Number((now - startedAt) / interval);
      if (slot < next || slot >= planned) { fault('ARRIVAL_CLOCK_UNKNOWN'); return; }
      missed += slot - next; next = slot + 1;
      let selected = -1;
      for (let offset = 0; offset < lanes.length; offset++) {
        const index = (cursor + offset) % lanes.length;
        if (!lanes[index].busy) { selected = index; break; }
      }
      if (selected === -1) busyRejected++;
      else {
        cursor = (selected + 1) % lanes.length;
        dispatch(lanes[selected], now, startedAt + BigInt(slot) * interval);
      }
      // Completions never enter tick; only this independent nominal calendar does.
      if (!stopped && final === null && next < planned) {
        const after = clock();
        if (stopped || final !== null) return;
        const due = startedAt + BigInt(next) * interval;
        // Time spent in a source callback can miss more slots. Schedule a
        // cooperative future wake, never recursively enter catch-up calls.
        const target = due > after ? due : after + MS;
        if (target < endAt) arm('arrival', target, after, () => tick());
      }
    } catch { fault('ARRIVAL_OR_RECORDING_UNKNOWN'); }
  }
  function dispatch(lane, at, scheduledAt) {
    const wait = startDelay.begin('FUNDED_CALL', scheduledAt);
    wait.finish('SUCCEEDED', at);
    const handle = recording.begin('FUNDED_CALL', at);
    const op = { active: true, known: false, terminal: false, ledgerPending: 0, ledgerStarts: 0, ledgerOpening: false, handle };
    lane.busy = true; lane.operation = op;
    const ordinal = lane.entered++; entered++; pendingOperations++;
    maxConcurrent = Math.max(maxConcurrent, pendingOperations);
    const beginLedgerTransaction = F(function beginLedgerTransaction() {
      if (arguments.length !== 0 || !op.active || op.ledgerOpening || op.ledgerPending !== 0 || final !== null
          || op.ledgerStarts >= plan.maxLedgerTransactionsPerOperation || ledgerStarts >= limits.maxSamplesPerPhase) {
        fault('LEDGER_BOUNDARY_UNKNOWN'); fail('ledger_rejected');
      }
      op.ledgerOpening = true;
      let target, item;
      try {
        const now = clock();
        if (!op.active || final !== null) fail('ledger_rejected');
        target = stopped ? postStopLedger : recording;
        item = target.begin('LEDGER_TRANSACTION', now);
      } catch { fault('LEDGER_BOUNDARY_UNKNOWN'); fail('ledger_rejected'); }
      finally { op.ledgerOpening = false; }
      op.ledgerPending++; pendingLedger++; op.ledgerStarts++; ledgerStarts++;
      let done = false;
      return F({ finish: F(function finishLedger(outcome) {
        if (arguments.length !== 1 || done || !['SUCCEEDED', 'REJECTED', 'UNKNOWN'].includes(outcome)) {
          fault('LEDGER_BOUNDARY_UNKNOWN'); fail('ledger_rejected');
        }
        done = true; op.ledgerPending--; pendingLedger--;
        try { if (final === null) item.finish(outcome, clock()); }
        catch { fault('LEDGER_RECORDING_UNKNOWN'); }
        if (outcome === 'UNKNOWN') fault('LEDGER_OUTCOME_UNKNOWN');
        releaseOperation(lane, op); progress();
      }) });
    });
    const command = F({ cohort: 'MEASUREMENT', ordinal, beginLedgerTransaction });
    function terminal(value, observed) {
      if (op.terminal) return;
      if (!observed) {
        op.active = false; fault('SOURCE_PROMISE_UNKNOWN'); return;
      }
      op.terminal = true; op.known = true; op.active = false;
      const outcome = ['SUCCEEDED', 'REJECTED', 'UNKNOWN'].includes(value) ? value : 'UNKNOWN';
      if (final === null) {
        try { finish(op.handle, outcome, clock()); } catch { fault('SOURCE_CLOCK_UNKNOWN'); }
      }
      if (op.ledgerPending !== 0) fault('SOURCE_SETTLED_WITH_LEDGER_PENDING');
      if (outcome === 'UNKNOWN') fault('SOURCE_OUTCOME_UNKNOWN');
      releaseOperation(lane, op); progress();
    }
    try { observe(A(lane.execute, undefined, [command]), v => terminal(v, true), known => terminal('UNKNOWN', known)); }
    catch { terminal(null, false); }
  }
  function releaseOperation(lane, op) {
    if (!op.known || op.ledgerPending !== 0 || lane.operation !== op) return;
    lane.operation = null; lane.busy = false; pendingOperations--;
  }
  function progress() {
    if (!stopped || final !== null || controlsInstalling !== 0 || timerInstalling !== 0 || progressing) return;
    progressing = true;
    try {
      let at = null;
      if (!drainExpired) {
        try {
          at = clock();
          if (drainAt === null || at >= drainAt) drainExpired = true;
        } catch { hold('DRAIN_CLOCK_UNKNOWN'); drainExpired = true; }
      }
      if (drainExpired) { hold('DRAIN_UNKNOWN'); publish(); return; }
      if (pendingOperations === 0 && pendingLedger === 0 && pendingControls === 0) {
        // Postcheck shares the ORIGINAL deadline, including late microtasks.
        if (startedAt === null || issue !== null || postcheckFinished) { publish(); return; }
        if (!postcheckStarted) { postcheckStarted = true; phase = 'POSTCHECK'; controlBarrier('POSTCHECK'); }
        if (drainExpired) { hold('DRAIN_UNKNOWN'); publish(); }
        return;
      }
      if (!drainAttempted) {
        drainAttempted = true;
        arm('drain', drainAt, at, () => { drainExpired = true; progress(); });
        if (drainExpired) { hold('DRAIN_UNKNOWN'); publish(); }
      }
    } finally { progressing = false; }
  }
  function publish() {
    if (final !== null || controlsInstalling !== 0 || timerInstalling !== 0) return;
    for (const kind of K(timers)) cancel(kind);
    // A trusted cancel can reenter/block too. Historical acknowledgements do
    // not turn a now-expired fixed observation budget into clean success.
    if (!drainExpired) {
      try {
        if (drainAt === null || clock() >= drainAt) { hold('DRAIN_DEADLINE_UNKNOWN'); drainExpired = true; }
      } catch { hold('DRAIN_CLOCK_UNKNOWN'); drainExpired = true; }
    }
    let measured = null, delay = null, drain = null;
    try { measured = recording.finalize(); delay = startDelay.finalize(); drain = postStopLedger.finalize(); }
    catch { hold('FINAL_RECORDING_UNKNOWN'); }
    if (pendingOperations || pendingLedger || pendingControls || measured === null || delay === null || drain === null
        || measured.recordingState === 'INCOMPLETE' || delay.recordingState === 'INCOMPLETE'
        || drain.recordingState === 'INCOMPLETE') hold('INCOMPLETE_OBSERVATION');
    if (entered + busyRejected + missed + withdrawn !== planned) hold('SLOT_ACCOUNTING_UNKNOWN');
    final = F({
      offeredWindowOwnerVersion: 1, scope: 'TRUSTED_SOURCE_MEASUREMENT_NOT_NATIVE_QUALIFICATION',
      outcome: issue === null ? 'OBSERVED_SOURCES_SETTLED' : 'HELD_UNKNOWN', issue, stopReason,
      plan, laneCount: lanes.length, scheduledSlots: planned, evaluatedOffers: entered + busyRejected,
      sourceEntries: entered, busyRejectedOffers: busyRejected, schedulerMissedSlots: missed, withdrawnSlots: withdrawn,
      pendingOriginalOperations: pendingOperations, pendingLedgerObservations: pendingLedger, pendingControlObservations: pendingControls,
      peakConcurrentOriginals: maxConcurrent, queueCapacity: 0, opensObserved, stopsObserved, balanceChecks, ledgerStarts,
      nominalIntervalNanoseconds: String(interval), measurementStartNanoseconds: startedAt === null ? null : String(startedAt),
      measurementEndNanoseconds: endAt === null ? null : String(endAt),
      admissionStoppedNanoseconds: stoppedAt === null ? null : String(stoppedAt),
      dispatchedCallRecording: measured, sourceStartDelayRecording: delay, postStopLedgerRecording: drain,
      timerScheduleCalls: scheduledTimers, timerCancelReturns: cancelledTimers, borrowedResourcesClosed: false,
      clockAuthenticated: false, fixedOfferedRateQualified: false, sustainableCapacityQualified: false,
      nativeResourcesQualified: false, productionQualified: false, authority: 'NONE',
    });
    phase = final.outcome;
    // Drop only this controller's callback/token references, never lane data or resources.
    for (const lane of lanes) for (const method of LANE_METHODS) lane[method] = null;
    tokens.clear(); resolveRun(final);
  }
  function start(stopFirst) {
    if (running !== null) return running;
    const cap = capability(); running = cap.promise; resolveRun = cap.resolve;
    if (stopFirst) { stopWork('MANUAL'); return running; }
    phase = 'PRECHECK';
    try {
      const at = clock();
      if (stopped || final !== null) return running;
      const due = at + BigInt(plan.setupBudgetMs) * MS;
      setupDue = due;
      arm('setup', due, at, now => { hold('SETUP_DEADLINE_UNKNOWN'); stopWork('SETUP_EXPIRED', now); });
      if (!stopped && final === null) controlBarrier('PRECHECK');
    } catch { fault('SETUP_CLOCK_UNKNOWN'); }
    return running;
  }
  const run = F(function run() { return arguments.length === 0 ? start(false) : rejected('input_rejected'); });
  const stop = F(function stop() {
    if (arguments.length !== 0) return rejected('input_rejected');
    if (running === null) return start(true);
    stopWork('MANUAL'); return running;
  });
  const inspect = F(function inspect() {
    if (arguments.length !== 0 || !invariant()) fail('input_rejected');
    return F({ phase, issue, stopped, finalCached: final !== null, scheduledSlots: planned,
      sourceEntries: entered, busyRejectedOffers: busyRejected, schedulerMissedSlots: missed, withdrawnSlots: withdrawn,
      pendingOriginalOperations: pendingOperations, pendingLedgerObservations: pendingLedger, pendingControlObservations: pendingControls,
      knownTimerSlots: Object.values(timers).filter(slot => slot !== null && slot.live).length,
      borrowedResourcesClosed: false, authority: 'NONE' });
  });
  return F({ run, stop, inspect });
}
function exact(value, fields, frozen = false) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) || P(value) !== Object.prototype
      || K(value).length !== fields.length || frozen && !Object.isFrozen(value)) fail('input_rejected');
  const out = {};
  for (const name of fields) {
    const item = D(value, name);
    if (!item || !O(item, 'value') || !item.enumerable) fail('input_rejected');
    DEFINE(out, name, { value: item.value, enumerable: true });
  }
  return out;
}
function dense(value) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) || P(value) !== Array.prototype || !Object.isFrozen(value))
    fail('input_rejected');
  const length = D(value, 'length');
  if (!length || !O(length, 'value') || !Number.isSafeInteger(length.value) || length.value < 1 || length.value > 16
      || K(value).length !== length.value + 1) fail('input_rejected');
  const result = [];
  for (let i = 0; i < length.value; i++) {
    const item = D(value, String(i)); if (!item || !O(item, 'value') || !item.enumerable) fail('input_rejected');
    result.push(item.value);
  }
  return result;
}
function integer(value, low, high) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < low || value > high) fail('input_rejected');
}
function callable(value) { if (typeof value !== 'function' || IS_PROXY(value) || !Object.isFrozen(value)) fail('input_rejected'); }
function same(a, b) { return !!a && !!b && K(a).length === K(b).length && K(b).every(k => O(a, k) && a[k] === b[k]); }
function invariant() {
  return D(Object.prototype, 'then') === undefined && D(Object.prototype, 'toJSON') === undefined
    && same(D(PP, 'then'), THEN) && same(D(PP, 'constructor'), CTOR) && same(D(NATIVE, Symbol.species), SPECIES);
}
function safe(value) {
  if (!invariant() || !IS_PROMISE(value) || IS_PROXY(value) || P(value) !== PP || D(value, 'then') !== undefined) return false;
  const own = D(value, 'constructor');
  return own === undefined || O(own, 'value') && own.value === NATIVE && !own.enumerable && !own.writable && !own.configurable;
}
function capability() {
  let resolve; const promise = new NATIVE(yes => { resolve = yes; });
  DEFINE(promise, 'constructor', { value: NATIVE }); A(THEN.value, promise, [discard, discard]);
  return { promise, resolve };
}
function rejected(kind) {
  const promise = new NATIVE((yes, no) => no(error(kind)));
  DEFINE(promise, 'constructor', { value: NATIVE }); A(THEN.value, promise, [discard, discard]); return promise;
}
function error(kind) {
  const code = 'service_credit_capacity_offered_window_' + kind, value = new TypeError(code);
  DEFINE(value, 'code', { value: code, enumerable: true }); DEFINE(value, 'stack', { value: 'TypeError: ' + code });
  return F(value);
}
function fail(kind) { throw error(kind); }
function discard() {}
