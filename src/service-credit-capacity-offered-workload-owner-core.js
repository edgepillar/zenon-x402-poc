import { types as utilTypes } from 'node:util';
import { createServiceCreditCapacityRecorder } from './service-credit-capacity-recorder.js';
import { createServiceCreditCapacityOfferedWindowOwnerCore } from './service-credit-capacity-offered-window-owner-core.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, P = Object.getPrototypeOf;
const K = Reflect.ownKeys, O = Object.hasOwn, A = Reflect.apply, DEFINE = Object.defineProperty;
const IS_PROXY = utilTypes.isProxy, IS_PROMISE = utilTypes.isPromise;
const NATIVE = Promise, PP = NATIVE.prototype, THEN = D(PP, 'then');
const CTOR = D(PP, 'constructor'), SPECIES = D(NATIVE, Symbol.species);
const RECORDER = createServiceCreditCapacityRecorder, MEASUREMENT = createServiceCreditCapacityOfferedWindowOwnerCore;
const MS = 1000000n, MAX_NS = (1n << 128n) - 1n;
const METHODS = F(['fund', 'execute', 'checkBalances', 'openMeasurementWindow', 'stopMeasurementWindow', 'close']);

/**
 * SOURCE composition: one funding per captured owner, a fresh all-lane balance
 * barrier, per-lane warmup, the genuine independent offered calendar, then one
 * delegated close per owner. Constructor is inert. No injected inner factory.
 *
 * Source owners retain actual native/store authority. Only their captured close
 * capabilities are invoked; no DB close, kill, repair or restart is invented.
 * The inner calendar BORROWS measurement capabilities; this outer coordinator
 * alone requests source-owner close. Unknown work/close stays HELD.
 */
export function createServiceCreditCapacityOfferedWorkloadOwnerCore(configuration) {
  let plan, limits, runtime, lanes;
  try {
    if (arguments.length !== 1 || !invariant()) fail('configuration_rejected');
    const c = exact(configuration, ['plan', 'recordingLimits', 'runtime', 'lanes']);
    plan = F(exact(c.plan, ['warmupCallsPerLane', 'measurementCallsPerLane', 'setupBudgetMs',
      'measurementWindowMs', 'arrivalIntervalMs', 'drainGraceMs', 'closeGraceMs', 'maxLedgerTransactionsPerOperation']));
    integer(plan.warmupCallsPerLane, 0, 255); integer(plan.measurementCallsPerLane, 1, 4096);
    for (const name of ['setupBudgetMs', 'measurementWindowMs', 'drainGraceMs', 'closeGraceMs']) integer(plan[name], 1, 60000);
    integer(plan.arrivalIntervalMs, 1, 1000); integer(plan.maxLedgerTransactionsPerOperation, 1, 8);
    const slots = Math.ceil(plan.measurementWindowMs / plan.arrivalIntervalMs);
    // Any lane can receive every offer. Do not silently overrun its funding
    // reservation merely because the old closed-loop plan divided calls evenly.
    if (slots > plan.measurementCallsPerLane
        || plan.setupBudgetMs + plan.measurementWindowMs + plan.drainGraceMs + plan.closeGraceMs > 60000)
      fail('configuration_rejected');
    limits = F(exact(c.recordingLimits, ['maxSamplesPerPhase', 'maxInFlightPerPhase']));
    runtime = F(exact(c.runtime, ['monotonicNowNs', 'schedule', 'cancel']));
    for (const fn of Object.values(runtime)) callable(fn);
    const objects = new Set(), functions = new Set();
    lanes = dense(c.lanes).map(value => {
      if (objects.has(value)) fail('configuration_rejected'); objects.add(value);
      const row = exact(value, METHODS, true);
      for (const fn of Object.values(row)) {
        callable(fn); if (functions.has(fn)) fail('configuration_rejected'); functions.add(fn);
      }
      return { ...row, funded: false, warmup: 0, busy: false, operation: null, closeEntered: false, closeOutcome: 'NOT_REQUESTED' };
    });
    integer(limits.maxSamplesPerPhase, 1, 4096); integer(limits.maxInFlightPerPhase, 1, 64);
    if (limits.maxInFlightPerPhase > limits.maxSamplesPerPhase || lanes.length > limits.maxInFlightPerPhase
        || lanes.length * (1 + plan.warmupCallsPerLane) * plan.maxLedgerTransactionsPerOperation > limits.maxSamplesPerPhase
        || slots * plan.maxLedgerTransactionsPerOperation > limits.maxSamplesPerPhase || 2 * lanes.length > limits.maxSamplesPerPhase)
      fail('configuration_rejected');
  } catch { fail('configuration_rejected'); }
  configuration = null;
  const NOW = runtime.monotonicNowNs, SCHEDULE = runtime.schedule, CANCEL = runtime.cancel;
  const recording = RECORDER(limits), postStopLedger = RECORDER(limits);
  const timers = { total: null, setup: null, stop: null }, tokens = new Set();
  let lastClock = null, setupDue = null, totalDue = null, stopDue = null;
  let phase = 'IDLE', stopped = false, stopReason = null, issue = null, final = null;
  let running = null, resolveRun = null, inner = null, innerPromise = null, innerPending = false, offered = null, innerStopRequested = false;
  let innerStopReceipt = null;
  let pendingOriginals = 0, pendingLedger = 0, pendingBalances = 0, pendingCloses = 0;
  let transitions = 0, installing = 0, closeSweepStarted = false, stopTimerAttempted = false, expired = false, progressing = false;
  let fundingEntries = 0, warmupEntries = 0, balanceChecks = 0, ledgerStarts = 0, peakOriginals = 0;

  function hold(code) { if (issue === null) issue = code; }
  function clock() {
    if (!invariant()) fail('intrinsics_rejected');
    const at = A(NOW, undefined, []);
    if (!invariant() || typeof at !== 'bigint' || at < 0n || at > MAX_NS
        || lastClock !== null && at < lastClock) fail('clock_rejected');
    lastClock = at; return at;
  }
  function cancel(kind) {
    const slot = timers[kind];
    if (slot === null || !slot.live) return;
    slot.live = false; timers[kind] = null;
    if (slot.installing) return;
    try { if (A(CANCEL, undefined, [slot.token]) !== undefined) throw error('cancel_rejected'); }
    catch { hold('TIMER_CANCEL_UNKNOWN'); }
  }
  function timerFault(kind) {
    hold('TIMER_UNKNOWN');
    if (kind === 'stop') expired = true;
    stopWork('FAULT');
  }
  function arm(kind, due, at, work) {
    const delay = Number((due - at + MS - 1n) / MS);
    if (final !== null || timers[kind] !== null || due > MAX_NS || delay < 1 || delay > 60000 || !Number.isSafeInteger(delay)) {
      timerFault(kind); return;
    }
    const slot = { live: true, installing: true, early: false, token: null };
    timers[kind] = slot; installing++;
    const callback = F(function offeredWorkloadTimer() {
      if (!slot.live) return undefined;
      slot.live = false; if (timers[kind] === slot) timers[kind] = null;
      if (slot.installing) { slot.early = true; return undefined; }
      if (final !== null) return undefined;
      try {
        if (arguments.length !== 0) fail('timer_rejected');
        const now = clock(); if (now < due) fail('timer_rejected');
        work(now);
      } catch { timerFault(kind); }
      return undefined;
    });
    try {
      slot.token = A(SCHEDULE, undefined, [callback, delay]);
      if (slot.token === undefined || slot.token === null || tokens.has(slot.token)) fail('timer_rejected');
      tokens.add(slot.token); slot.installing = false;
      if (slot.early) { slot.live = true; timers[kind] = slot; cancel(kind); timerFault(kind); }
      else if (!slot.live || final !== null || stopped && kind !== 'stop') {
        slot.live = true; timers[kind] = slot; cancel(kind);
      }
    } catch {
      slot.installing = false; slot.live = false;
      if (timers[kind] === slot) timers[kind] = null;
      timerFault(kind);
    } finally { installing--; progress(); }
  }
  function observe(value, yes, no) {
    if (!safe(value)) { no(false); return; }
    try {
      const bridge = A(THEN.value, value, [
        result => { try { yes(result); } catch { hold('OBSERVATION_UNKNOWN'); stopWork('FAULT'); } },
        () => { try { no(true); } catch { hold('OBSERVATION_UNKNOWN'); stopWork('FAULT'); } },
      ]);
      if (!safe(bridge)) fail('promise_rejected');
      A(THEN.value, bridge, [discard, discard]);
    } catch { no(false); }
  }
  function join(values) {
    const cap = capability(); let remaining = values.length, refused = false;
    if (remaining === 0) cap.resolve(undefined);
    for (const value of values) observe(value, () => {
      if (--remaining === 0 && !refused) cap.resolve(undefined);
    }, () => { if (!refused) { refused = true; cap.reject(error('source_unavailable')); } });
    return cap.promise;
  }
  function setupOpen() {
    if (stopped || final !== null) return false;
    try {
      const at = clock();
      if (stopped || final !== null) return false;
      if (setupDue === null || at >= setupDue) { hold('SETUP_DEADLINE_UNKNOWN'); stopWork('SETUP_EXPIRED', at); return false; }
      return true;
    } catch { hold('SETUP_CLOCK_UNKNOWN'); stopWork('FAULT'); return false; }
  }
  function release(lane, op) {
    if (!op.known || op.ledgerPending !== 0 || lane.operation !== op) return;
    lane.busy = false; lane.operation = null; pendingOriginals--;
  }
  function beginOperation(lane, funding, ordinal) {
    const cap = capability();
    if (!setupOpen() || lane.busy) { cap.reject(error('source_unavailable')); return cap.promise; }
    let at;
    try {
      at = clock();
      if (stopped || final !== null) { cap.reject(error('source_unavailable')); return cap.promise; }
      if (setupDue === null || at >= setupDue) {
        hold('SETUP_DEADLINE_UNKNOWN'); stopWork('SETUP_EXPIRED', at); cap.reject(error('source_unavailable')); return cap.promise;
      }
    } catch { hold('SETUP_CLOCK_UNKNOWN'); stopWork('FAULT'); cap.reject(error('source_unavailable')); return cap.promise; }
    const op = { active: true, known: false, terminal: false, ledgerPending: 0, ledgerStarted: 0, ledgerOpening: false };
    lane.busy = true; lane.operation = op; pendingOriginals++;
    peakOriginals = Math.max(peakOriginals, pendingOriginals);
    if (funding) fundingEntries++; else warmupEntries++;
    let handle;
    try { handle = recording.begin(funding ? 'FUNDING' : 'FUNDED_CALL', at); }
    catch { hold('RECORDING_UNKNOWN'); stopWork('FAULT'); cap.reject(error('source_unavailable')); return cap.promise; }
    const beginLedgerTransaction = F(function beginLedgerTransaction() {
      if (arguments.length !== 0 || !op.active || op.ledgerOpening || op.ledgerPending !== 0 || final !== null
          || op.ledgerStarted >= plan.maxLedgerTransactionsPerOperation || ledgerStarts >= limits.maxSamplesPerPhase) {
        hold('LEDGER_BOUNDARY_UNKNOWN'); stopWork('FAULT'); fail('ledger_rejected');
      }
      op.ledgerOpening = true; let item;
      try {
        const at = clock(); if (!op.active || final !== null) fail('ledger_rejected');
        item = (stopped ? postStopLedger : recording).begin('LEDGER_TRANSACTION', at);
      } catch { hold('LEDGER_BOUNDARY_UNKNOWN'); stopWork('FAULT'); fail('ledger_rejected'); }
      finally { op.ledgerOpening = false; }
      op.ledgerStarted++; ledgerStarts++; op.ledgerPending++; pendingLedger++;
      let done = false;
      return F({ finish: F(function finishLedger(outcome) {
        if (arguments.length !== 1 || done || !['SUCCEEDED', 'REJECTED', 'UNKNOWN'].includes(outcome)) {
          hold('LEDGER_BOUNDARY_UNKNOWN'); stopWork('FAULT'); fail('ledger_rejected');
        }
        done = true; op.ledgerPending--; pendingLedger--;
        try { if (final === null) item.finish(outcome, clock()); } catch { hold('LEDGER_RECORDING_UNKNOWN'); stopWork('FAULT'); }
        if (outcome === 'UNKNOWN') { hold('LEDGER_OUTCOME_UNKNOWN'); stopWork('FAULT'); }
        release(lane, op); progress();
      }) });
    });
    function terminal(value, known) {
      if (op.terminal) return;
      if (!known) {
        op.active = false; hold('SOURCE_UNOBSERVABLE'); stopWork('FAULT'); cap.reject(error('source_unavailable')); return;
      }
      op.terminal = true; op.known = true; op.active = false;
      const outcome = ['SUCCEEDED', 'REJECTED', 'UNKNOWN'].includes(value) ? value : 'UNKNOWN';
      try { if (final === null) handle.finish(outcome, clock()); } catch { hold('RECORDING_UNKNOWN'); stopWork('FAULT'); }
      if (outcome !== 'SUCCEEDED' || op.ledgerPending !== 0) {
        hold('SOURCE_OUTCOME_UNKNOWN'); stopWork('FAULT'); cap.reject(error('source_unavailable'));
      } else {
        if (funding) lane.funded = true; else lane.warmup++;
        cap.resolve(undefined);
      }
      release(lane, op); progress();
    }
    const command = F({ cohort: 'WARMUP', ordinal, beginLedgerTransaction });
    try { observe(A(funding ? lane.fund : lane.execute, undefined, [command]), v => terminal(v, true), known => terminal('UNKNOWN', known)); }
    catch { terminal(null, false); }
    return cap.promise;
  }
  function balanceAfterFunding(lane) {
    const cap = capability();
    if (!setupOpen() || lane.busy || !lane.funded) { cap.reject(error('source_unavailable')); return cap.promise; }
    pendingBalances++; let settled = false;
    function terminal(value, known) {
      if (settled) return;
      if (known) { settled = true; pendingBalances--; }
      try {
        if (!known || stopped || final !== null || !setupOpen()) fail('balance_rejected');
        if (recording.recordLedgerBalanceCheck(exact(value, ['observed', 'expected'], true)) !== true) fail('balance_rejected');
        balanceChecks++; cap.resolve(undefined);
      } catch { hold('BALANCE_UNKNOWN'); stopWork('FAULT'); cap.reject(error('source_unavailable')); }
      progress();
    }
    try { observe(A(lane.checkBalances, undefined, []), v => terminal(v, true), known => terminal(null, known)); }
    catch { terminal(null, false); }
    return cap.promise;
  }

  function closeAll() {
    if (closeSweepStarted) return;
    closeSweepStarted = true; transitions++;
    for (const lane of lanes) { lane.closeEntered = true; lane.closeOutcome = 'PENDING'; pendingCloses++; }
    try {
      for (const lane of lanes) {
        let done = false;
        function terminal(value, known) {
          if (done) return;
          if (known) { done = true; pendingCloses--; }
          lane.closeOutcome = known && value === undefined ? 'RETURNED' : 'UNKNOWN';
          if (lane.closeOutcome !== 'RETURNED') hold('SOURCE_CLOSE_UNKNOWN');
          progress();
        }
        try { observe(A(lane.close, undefined, []), v => terminal(v, true), known => terminal(null, known)); }
        catch { terminal(null, false); }
      }
    } finally { transitions--; }
  }
  function stopWork(reason, observedAt) {
    if (final !== null) return;
    if (!stopped) {
      stopped = true; stopReason = reason; phase = 'STOPPING'; transitions++;
      try {
        cancel('setup'); cancel('total');
        try {
          const at = observedAt === undefined ? clock() : observedAt;
          const base = inner === null && setupDue !== null && at >= setupDue ? setupDue : at;
          const desired = base + BigInt(plan.closeGraceMs) * MS;
          stopDue = totalDue !== null && totalDue < desired ? totalDue : desired;
          if (stopDue > MAX_NS || at >= stopDue) expired = true;
        } catch { hold('STOP_CLOCK_UNKNOWN'); expired = true; }
        if (innerPending && !innerStopRequested) {
          innerStopRequested = true;
          try {
            innerStopReceipt = inner.stop();
            // run() reserves its genuine Promise before callbacks, but our
            // assignment may still be waiting for that reentrant call to return.
            if (innerPromise !== null && innerStopReceipt !== innerPromise) throw error('inner_rejected');
          }
          catch { hold('MEASUREMENT_STOP_UNKNOWN'); }
        }
        if (!innerPending || expired) closeAll();
      } finally { transitions--; }
    }
    progress();
  }
  function progress() {
    if (!stopped || final !== null || transitions || installing || progressing) return;
    progressing = true;
    try {
      let at = null;
      if (!expired) {
        try { at = clock(); if (stopDue === null || at >= stopDue) expired = true; }
        catch { hold('STOP_CLOCK_UNKNOWN'); expired = true; }
      }
      if (expired) { hold('STOP_DEADLINE_UNKNOWN'); closeAll(); publish(); return; }
      if (!innerPending) closeAll();
      if (!innerPending && pendingOriginals === 0 && pendingLedger === 0 && pendingBalances === 0 && pendingCloses === 0) {
        publish(); return;
      }
      if (!stopTimerAttempted) {
        stopTimerAttempted = true;
        arm('stop', stopDue, at, () => { expired = true; progress(); });
        if (expired) { hold('STOP_DEADLINE_UNKNOWN'); closeAll(); publish(); }
      }
    } finally { progressing = false; }
  }
  function publish() {
    if (final !== null || transitions || installing) return;
    for (const kind of K(timers)) cancel(kind);
    if (!expired) {
      try { if (stopDue === null || clock() >= stopDue) hold('STOP_DEADLINE_UNKNOWN'); }
      catch { hold('STOP_CLOCK_UNKNOWN'); }
    }
    let prefix = null, drain = null;
    try { prefix = recording.finalize(); drain = postStopLedger.finalize(); }
    catch { hold('RECORDING_UNKNOWN'); }
    if (pendingOriginals || pendingLedger || pendingBalances || pendingCloses || innerPending
        || prefix === null || drain === null || prefix.recordingState === 'INCOMPLETE' || drain.recordingState === 'INCOMPLETE'
        || lanes.some(lane => lane.closeOutcome !== 'RETURNED')) hold('INCOMPLETE_OBSERVATION');
    final = F({
      offeredWorkloadOwnerVersion: 1, scope: 'TRUSTED_FUNDED_SOURCE_OWNERS_NOT_NATIVE_QUALIFICATION',
      outcome: issue === null ? 'OBSERVED_SOURCE_OWNERS_RETURNED' : 'HELD_UNKNOWN', issue, stopReason, plan,
      fundingEntries, warmupEntries, fundingBalanceChecks: balanceChecks, prefixLedgerStarts: ledgerStarts,
      peakPrefixOriginals: peakOriginals, pendingPrefixOriginals: pendingOriginals, pendingPrefixLedger: pendingLedger,
      pendingFundingBalanceReads: pendingBalances, pendingOwnerCloses: pendingCloses, measurementPending: innerPending,
      prefixRecording: prefix, postStopPrefixLedgerRecording: drain, offeredMeasurement: offered,
      lanes: F(lanes.map(lane => F({ funded: lane.funded, warmupCompleted: lane.warmup,
        closeEntered: lane.closeEntered, closeOutcome: lane.closeOutcome }))),
      sourceOwnersCloseRequested: closeSweepStarted, actualResourceLifetime: 'CAPTURED_SOURCE_OWNERS',
      automaticRetry: false, replacement: false, nativeResourcesQualified: false,
      sustainedCapacityQualified: false, productionQualified: false, authority: 'NONE',
    });
    phase = final.outcome; tokens.clear(); resolveRun(final);
  }
  function measurementNow() {
    const at = clock(), observed = inner.inspect().phase;
    if (['IDLE', 'PRECHECK', 'OPENING'].includes(observed) && (setupDue === null || at >= setupDue)) {
      hold('SETUP_DEADLINE_UNKNOWN'); throw error('setup_rejected');
    }
    if (observed === 'MEASURING' && !stopped) {
      phase = 'MEASURING'; cancel('setup');
      // The inner timer contract may be healthy while THIS outer cancellation
      // is unknown. Fence the genuine inner owner before its next dispatch.
      if (issue !== null) stopWork('FAULT');
    }
    return at;
  }
  async function pipeline() {
    try {
      phase = 'FUNDING';
      await join(lanes.map(lane => beginOperation(lane, true, 0)));
      if (!setupOpen()) return;
      phase = 'AFTER_FUNDING_BALANCE';
      await join(lanes.map(balanceAfterFunding));
      if (!setupOpen()) return;
      phase = 'WARMUP';
      await join(lanes.map(async lane => {
        for (let ordinal = 0; ordinal < plan.warmupCallsPerLane; ordinal++) {
          if (!setupOpen()) return;
          await beginOperation(lane, false, ordinal);
        }
      }));
      if (!setupOpen()) return;
      const at = clock();
      if (!setupOpen()) return;
      const remaining = Number((setupDue - at) / MS);
      if (!Number.isSafeInteger(remaining) || remaining < 1) { hold('SETUP_DEADLINE_UNKNOWN'); stopWork('SETUP_EXPIRED', at); return; }
      phase = 'MEASUREMENT_SETUP';
      inner = MEASUREMENT({
        plan: { setupBudgetMs: remaining, measurementWindowMs: plan.measurementWindowMs,
          arrivalIntervalMs: plan.arrivalIntervalMs, drainGraceMs: plan.drainGraceMs,
          maxLedgerTransactionsPerOperation: plan.maxLedgerTransactionsPerOperation },
        recordingLimits: limits,
        runtime: { monotonicNowNs: F(measurementNow), schedule: F((fn, ms) => A(SCHEDULE, undefined, [fn, ms])),
          cancel: F(token => A(CANCEL, undefined, [token])) },
        lanes: F(lanes.map(lane => F({ execute: lane.execute, checkBalances: lane.checkBalances,
          openMeasurementWindow: lane.openMeasurementWindow, stopMeasurementWindow: lane.stopMeasurementWindow }))),
      });
      innerPending = true; transitions++;
      try {
        innerPromise = inner.run();
        if (innerStopRequested && innerStopReceipt !== innerPromise) { hold('MEASUREMENT_STOP_UNKNOWN'); stopWork('FAULT'); }
      } finally { transitions--; progress(); }
      observe(innerPromise, value => {
        innerPending = false;
        try {
          if (data(value, 'offeredWindowOwnerVersion') !== 1 || !['OBSERVED_SOURCES_SETTLED', 'HELD_UNKNOWN'].includes(data(value, 'outcome')))
            fail('inner_rejected');
          offered = value;
          if (value.outcome !== 'OBSERVED_SOURCES_SETTLED') hold('MEASUREMENT_UNKNOWN');
        } catch { hold('MEASUREMENT_UNKNOWN'); }
        stopWork('MEASUREMENT_FINISHED'); progress();
      }, known => {
        if (known) innerPending = false;
        hold('MEASUREMENT_UNKNOWN'); stopWork('FAULT'); progress();
      });
    } catch { hold('SOURCE_PIPELINE_UNKNOWN'); stopWork('FAULT'); }
  }
  function start(stopFirst) {
    if (running !== null) return running;
    const cap = capability(); running = cap.promise; resolveRun = cap.resolve; phase = 'STARTING';
    if (stopFirst) { stopWork('MANUAL'); return running; }
    transitions++;
    try {
      const at = clock();
      if (stopped || final !== null) return running;
      setupDue = at + BigInt(plan.setupBudgetMs) * MS;
      totalDue = setupDue + BigInt(plan.measurementWindowMs + plan.drainGraceMs + plan.closeGraceMs) * MS;
      if (totalDue > MAX_NS) fail('clock_rejected');
      arm('total', totalDue, at, now => { hold('TOTAL_DEADLINE_UNKNOWN'); stopWork('TOTAL_EXPIRED', now); });
      if (!stopped && final === null) arm('setup', setupDue, at, now => {
        const state = inner === null ? null : inner.inspect().phase;
        if (state === null || ['IDLE', 'PRECHECK', 'OPENING'].includes(state)) {
          hold('SETUP_DEADLINE_UNKNOWN'); stopWork('SETUP_EXPIRED', now);
        }
      });
      if (!stopped && final === null) pipeline();
    } catch { hold('START_UNKNOWN'); stopWork('FAULT'); }
    finally { transitions--; progress(); }
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
    return F({ phase, stopped, issue, finalCached: final !== null, fundingEntries, warmupEntries,
      pendingPrefixOriginals: pendingOriginals, pendingPrefixLedger: pendingLedger, pendingFundingBalanceReads: pendingBalances,
      pendingOwnerCloses: pendingCloses, measurementPending: innerPending,
      measurementPhase: inner === null ? null : inner.inspect().phase,
      sourceOwnerClosesEntered: lanes.filter(lane => lane.closeEntered).length, authority: 'NONE' });
  });
  return F({ run, stop, inspect });
}
function exact(value, fields, frozen = false) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) || P(value) !== Object.prototype
      || K(value).length !== fields.length || frozen && !Object.isFrozen(value)) fail('input_rejected');
  const out = {};
  for (const name of fields) {
    const item = D(value, name); if (!item || !O(item, 'value') || !item.enumerable) fail('input_rejected');
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
  return Array.from({ length: length.value }, (_, index) => {
    const item = D(value, String(index)); if (!item || !O(item, 'value') || !item.enumerable) fail('input_rejected'); return item.value;
  });
}
function integer(value, low, high) { if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < low || value > high) fail('input_rejected'); }
function callable(value) { if (typeof value !== 'function' || IS_PROXY(value) || !Object.isFrozen(value)) fail('input_rejected'); }
function data(value, name) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) || P(value) !== Object.prototype || !Object.isFrozen(value)) fail('input_rejected');
  const item = D(value, name); if (!item || !O(item, 'value') || !item.enumerable) fail('input_rejected'); return item.value;
}
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
  let resolve, reject; const promise = new NATIVE((yes, no) => { resolve = yes; reject = no; });
  DEFINE(promise, 'constructor', { value: NATIVE }); A(THEN.value, promise, [discard, discard]); return { promise, resolve, reject };
}
function rejected(kind) { const cap = capability(); cap.reject(error(kind)); return cap.promise; }
function error(kind) {
  const code = 'service_credit_capacity_offered_workload_' + kind, value = new TypeError(code);
  DEFINE(value, 'code', { value: code, enumerable: true }); DEFINE(value, 'stack', { value: 'TypeError: ' + code }); return F(value);
}
function fail(kind) { throw error(kind); }
function discard() {}
