import { types as utilTypes } from 'node:util';
import { createServiceCreditCapacityWindowRecorder } from './service-credit-capacity-window-recorder.js';
import { createServiceCreditCapacityRecorder } from './service-credit-capacity-recorder.js';

const F = Object.freeze, A = Reflect.apply, D = Object.getOwnPropertyDescriptor;
const K = Reflect.ownKeys, P = Object.getPrototypeOf, O = Object.hasOwn, DEFINE = Object.defineProperty;
const IS_PROXY = utilTypes.isProxy, IS_PROMISE = utilTypes.isPromise;
const NativePromise = Promise, PP = NativePromise.prototype, THEN = D(PP, 'then');
const CTOR = D(PP, 'constructor'), SPECIES = D(NativePromise, Symbol.species);
const WINDOW = createServiceCreditCapacityWindowRecorder, BASE = createServiceCreditCapacityRecorder;
const MAX_NS = (1n << 128n) - 1n;
const OUTCOMES = F(['SUCCEEDED', 'REJECTED', 'UNKNOWN']);

/**
 * Explicit P4 workload coordination over trusted SOURCE-OWNED lane capabilities.
 * This core does not construct or authenticate a native application/worker.
 * Each actual native adapter must own an independent lane; the genuine P1
 * client permits only one active operation, so this core NEVER overlaps two
 * operations in one lane. A callback fixture is DATA, not native qualification.
 *
 * No built-in clock, timer, SDK, SQL, socket, signer, worker or process is used.
 * Construction performs no work. run/stop alone call captured host capabilities.
 * Accepted Promise outcomes are trusted classifications, not economic authority.
 * Fund all lanes, check balances, warm up, check again, measure, stop dispatch,
 * drain entered operations/explicit ledger boundaries, check, then close owners.
 *
 * UNKNOWN, rejected funding, bad host contracts and clock/recorder uncertainty
 * stop ALL new dispatch. Already-entered work remains observed. One fixed drain
 * timer bounds observation; expiry requests every owned close once and returns
 * HELD with honest pending counts, never synthetic operation/resource release.
 * Late completion cannot upgrade the cached result or authorize replay.
 *
 * Actual adapters must instrument real transaction entry/acknowledgement using
 * the operation-scoped beginLedgerTransaction capability; no ledger timing is
 * inferred from a funded-call Promise. Post-stop ledger starts belonging to an
 * already-entered operation use the genuine base recorder in a separate drain
 * series, never another admitted service call or a window-rate numerator.
 * Balance observations are genuinely asynchronous: a lane MUST return a native
 * Promise for a fresh read. No synchronous cache/thenable fallback exists.
 * An all-lane read barrier is owned before capability entry, remains covered
 * by setup/drain observation budgets and prevents overlapping work/close.
 * Independent expectations and actual native binding remain the adapter's
 * responsibility. This V2 does not modify or re-qualify the frozen sync core.
 */
export function createServiceCreditCapacityAsyncWorkloadOwnerCore(configuration) {
  if (arguments.length !== 1 || !invariant()) fail('configuration_rejected');
  let plan, runtime, lanes, recorder, drainLedger, limits;
  try {
    const c = exact(configuration, ['plan', 'recordingLimits', 'runtime', 'lanes']);
    plan = F(exact(c.plan, ['warmupCallsPerLane', 'measurementCallsPerLane',
      'setupBudgetMs', 'measurementWindowMs', 'drainGraceMs', 'maxLedgerTransactionsPerOperation']));
    integer(plan.warmupCallsPerLane, 0, 256); integer(plan.measurementCallsPerLane, 1, 256);
    integer(plan.setupBudgetMs, 1, 60000); integer(plan.measurementWindowMs, 1, 60000);
    integer(plan.drainGraceMs, 1, 1000);
    integer(plan.maxLedgerTransactionsPerOperation, 1, 16);
    limits = F(exact(c.recordingLimits, ['maxSamplesPerPhase', 'maxInFlightPerPhase']));
    integer(limits.maxSamplesPerPhase, 1, 4096); integer(limits.maxInFlightPerPhase, 1, 64);
    if (limits.maxInFlightPerPhase > limits.maxSamplesPerPhase) fail('configuration_rejected');
    runtime = F(exact(c.runtime, ['monotonicNowNs', 'schedule', 'cancel']));
    for (const fn of Object.values(runtime)) callable(fn);
    const values = dense(c.lanes, 1, 16), objects = new Set(), calls = new Set();
    lanes = values.map(value => {
      if (objects.has(value)) fail('configuration_rejected'); objects.add(value);
      const methods = exact(value, ['fund', 'execute', 'checkBalances', 'close'], true);
      for (const fn of Object.values(methods)) {
        callable(fn); if (calls.has(fn)) fail('configuration_rejected'); calls.add(fn);
      }
      return { ...methods, funded: false, fundEntered: false, busy: false, warmup: 0, measured: 0,
        ledgerPending: 0, closeEntered: false, closeOutcome: 'NOT_REQUESTED' };
    });
    const slots = (1 + plan.warmupCallsPerLane + plan.measurementCallsPerLane)
      * lanes.length * plan.maxLedgerTransactionsPerOperation;
    if (slots > limits.maxSamplesPerPhase || 3 * lanes.length > limits.maxSamplesPerPhase
        || lanes.length > limits.maxInFlightPerPhase) fail('configuration_rejected');
    recorder = WINDOW(limits);
    drainLedger = BASE(limits); // Only explicit ledger starts within already-entered work after stop.
  } catch { fail('configuration_rejected'); }
  configuration = null;
  const NOW = runtime.monotonicNowNs, SCHEDULE = runtime.schedule, CANCEL = runtime.cancel;
  let phase = 'CREATED', held = false, reason = null, uncertainty = null, stopping = false, pumping = false;
  let running = null, resolveRun = null, final = null, active = 0, pendingLedger = 0, closesDone = 0;
  let recordingStarted = false, measurementStarted = false, measurementStopped = false, warmupChecked = false;
  let setupTimer = null, measurementTimer = null, drainTimer = null, checks = 0, finalBalancesChecked = false;
  let fundingBalancesChecked = false, balanceBarrier = null, pendingBalances = 0, balanceReadAttempts = 0;
  let completedBalanceBarriers = 0;
  let lastClock = null, ledgerStarts = 0;
  const tokens = new Set();
  function hold(code) {
    held = true; if (reason === null) reason = code;
    if (uncertainty === null) uncertainty = code;
    if (phase === 'CLOSED') phase = 'HELD';
  }
  function clock() {
    const value = A(NOW, undefined, []);
    if (typeof value !== 'bigint' || value < 0n || value > MAX_NS
        || lastClock !== null && value < lastClock) fail('clock_rejected');
    lastClock = value;
    return value;
  }
  function cancel(slot) {
    if (slot === null || !slot.live) return;
    slot.live = false;
    try { if (A(CANCEL, undefined, [slot.token]) !== undefined) hold('TIMER_CANCEL_UNKNOWN'); }
    catch { hold('TIMER_CANCEL_UNKNOWN'); }
  }
  function arm(kind, budget) {
    const slot = { live: true, installing: true, early: false, token: null };
    const callback = F(function callback() {
      if (!slot.live) return undefined;
      slot.live = false;
      if (slot.installing) { slot.early = true; return undefined; }
      if (arguments.length !== 0) {
        hold('TIMER_PROTOCOL_UNKNOWN');
        if (kind === 'drain') { startCloses(true); finish(true); }
        else stopWork('TIMER_PROTOCOL_UNKNOWN');
        return undefined;
      }
      if (final !== null) return undefined;
      if (kind === 'setup') { hold('SETUP_DEADLINE_UNKNOWN'); stopWork('SETUP_DEADLINE_UNKNOWN'); }
      else if (kind === 'measurement') stopWork('MEASUREMENT_WINDOW_ELAPSED');
      else { hold('DRAIN_DEADLINE_UNKNOWN'); startCloses(true); finish(true); }
      return undefined;
    });
    try {
      const token = A(SCHEDULE, undefined, [callback, budget]);
      slot.token = token; slot.installing = false;
      if (token === null || token === undefined || tokens.has(token)) throw error('timer_rejected');
      tokens.add(token);
      if (slot.early) {
        hold('SYNCHRONOUS_TIMER_UNKNOWN');
        slot.live = true; cancel(slot); // Failure-only stop of this exact returned token.
        return null; // Already fired; do not invent an owned live timer.
      }
      // A trusted scheduler may reenter stop and even finish the run before
      // returning this token. Stop the late returned exact token once too.
      if (final !== null || kind !== 'drain' && stopping) cancel(slot);
      return slot;
    } catch { slot.installing = false; slot.live = false; hold('TIMER_SETUP_UNKNOWN'); return null; }
  }
  function observe(value, yes, no) {
    if (!safe(value)) { no(); return; }
    try {
      const bridge = A(THEN.value, value, [
        result => { try { yes(result); } catch { hold('HOST_OBSERVATION_UNKNOWN'); stopWork('HOST_OBSERVATION_UNKNOWN'); } },
        () => { try { no(); } catch { hold('HOST_OBSERVATION_UNKNOWN'); stopWork('HOST_OBSERVATION_UNKNOWN'); } },
      ]);
      if (!safe(bridge)) throw error('promise_rejected');
      A(THEN.value, bridge, [discard, discard]);
    } catch { no(); }
  }
  function beginBalanceBarrier(kind) {
    if (active !== 0 || pendingLedger !== 0 || pendingBalances !== 0 || balanceBarrier !== null || final !== null
        || !['FUNDING', 'WARMUP', 'DRAINING'].includes(kind) || phase !== kind) {
      hold('BALANCE_BARRIER_UNKNOWN'); stopWork('BALANCE_BARRIER_UNKNOWN'); return;
    }
    const barrier = { kind, installing: true, abandoned: false, failed: false, entered: 0, observed: 0 };
    balanceBarrier = barrier; // Before a trusted capability can stop/reenter.
    function eligible() {
      return final === null && !barrier.abandoned && !barrier.failed && phase === kind
        && (kind === 'DRAINING' ? stopping : !stopping);
    }
    function complete() {
      if (barrier.installing || pendingBalances !== 0 || balanceBarrier !== barrier) return;
      balanceBarrier = null;
      if (final !== null) return; // Keep the frozen HELD snapshot; only live pending counts changed.
      if (!barrier.abandoned && !barrier.failed && barrier.observed === lanes.length) completedBalanceBarriers++;
      else if (!stopping) { hold('BALANCE_OBSERVATION_UNKNOWN'); stopWork('BALANCE_OBSERVATION_UNKNOWN'); }
      progress();
    }
    for (const lane of lanes) {
      if (!eligible()) break; // Never enter another read after stop or a contract failure.
      if (lane.busy || balanceReadAttempts >= 3 * lanes.length) {
        barrier.failed = true; hold('BALANCE_BARRIER_UNKNOWN'); stopWork('BALANCE_BARRIER_UNKNOWN'); break;
      }
      barrier.entered++; pendingBalances++; balanceReadAttempts++;
      let settled = false;
      function terminal(value, returned) {
        if (settled) { hold('DUPLICATE_BALANCE_UNKNOWN'); stopWork('DUPLICATE_BALANCE_UNKNOWN'); return; }
        settled = true; pendingBalances--; barrier.observed++;
        if (eligible()) {
          try {
            if (!returned) throw error('balance_rejected');
            const captured = exact(value, ['observed', 'expected'], true);
            const at = clock();
            // The trusted clock may stop the run or exhaust the only drain
            // deadline. Do not write a recorder after that reentrant boundary.
            if (eligible()) {
              if (recorder.recordLedgerBalanceCheck(captured, at) !== true) throw error('balance_rejected');
              checks++;
            }
          } catch {
            barrier.failed = true; hold('BALANCE_OBSERVATION_UNKNOWN'); stopWork('BALANCE_OBSERVATION_UNKNOWN');
          }
        }
        complete();
      }
      try { observe(A(lane.checkBalances, undefined, []), value => terminal(value, true), () => terminal(undefined, false)); }
      catch { terminal(undefined, false); }
    }
    barrier.installing = false;
    complete();
  }
  function finishObservation(handle, outcome) {
    if (final !== null) return;
    try { handle.finish(outcome, clock()); }
    catch { hold('RECORDER_OR_CLOCK_UNKNOWN'); }
  }
  function beginOperation(lane, funding) {
    if (stopping || final !== null || lane.busy || balanceBarrier !== null || pendingBalances !== 0) return;
    const cohort = phase === 'MEASURING' ? 'MEASUREMENT' : 'WARMUP';
    const ordinal = funding ? 0 : cohort === 'WARMUP' ? lane.warmup : lane.measured;
    let observation;
    try {
      const at = clock();
      // The clock is a trusted host callback, so recheck admission after it.
      if (stopping || final !== null || lane.busy) return;
      observation = recorder.begin(funding ? 'FUNDING' : 'FUNDED_CALL', at);
    }
    catch { hold('RECORDER_OR_CLOCK_UNKNOWN'); stopWork('RECORDER_OR_CLOCK_UNKNOWN'); return; }
    const token = { active: true, ledgerStarts: 0, ledgerOpening: false };
    lane.busy = true; active++;
    if (funding) lane.fundEntered = true;
    const beginLedgerTransaction = F(function beginLedgerTransaction() {
      if (arguments.length !== 0 || !token.active || !lane.busy || token.ledgerOpening || final !== null
          || lane.ledgerPending !== 0 || token.ledgerStarts >= plan.maxLedgerTransactionsPerOperation
          || ledgerStarts >= limits.maxSamplesPerPhase) {
        hold('LEDGER_BOUNDARY_UNKNOWN'); stopWork('LEDGER_BOUNDARY_UNKNOWN'); fail('ledger_boundary_rejected');
      }
      let handle;
      token.ledgerOpening = true; // Reserve before the trusted clock can reenter this capability.
      try {
        const at = clock();
        if (!token.active || final !== null) throw error('ledger_boundary_rejected');
        // The parent operation was admitted before stop. Internal ledger work
        // may legitimately begin during its drain; do not abort that work just
        // because the MEASUREMENT observation window is already closed.
        handle = (stopping ? drainLedger : recorder).begin('LEDGER_TRANSACTION', at);
      }
      catch { hold('LEDGER_BOUNDARY_UNKNOWN'); stopWork('LEDGER_BOUNDARY_UNKNOWN'); fail('ledger_boundary_rejected'); }
      finally { token.ledgerOpening = false; }
      token.ledgerStarts++; ledgerStarts++; lane.ledgerPending++; pendingLedger++;
      let done = false;
      return F({ finish: F(function finishLedger(outcome) {
        if (arguments.length !== 1 || done || !OUTCOMES.includes(outcome)) {
          hold('LEDGER_BOUNDARY_UNKNOWN'); stopWork('LEDGER_BOUNDARY_UNKNOWN'); fail('ledger_boundary_rejected');
        }
        done = true; lane.ledgerPending--; pendingLedger--;
        finishObservation(handle, outcome);
        if (outcome === 'UNKNOWN') { hold('LEDGER_OUTCOME_UNKNOWN'); stopWork('LEDGER_OUTCOME_UNKNOWN'); }
        else if (held && !stopping) stopWork('RECORDER_OR_CLOCK_UNKNOWN');
        progress(); return undefined;
      }) });
    });
    const command = F({ cohort, ordinal, beginLedgerTransaction });
    function terminal(outcome) {
      if (!token.active) { hold('DUPLICATE_OPERATION_UNKNOWN'); stopWork('DUPLICATE_OPERATION_UNKNOWN'); return; }
      token.active = false; lane.busy = false; active--;
      if (!OUTCOMES.includes(outcome)) outcome = 'UNKNOWN';
      finishObservation(observation, outcome);
      if (funding) lane.funded = outcome === 'SUCCEEDED';
      else if (cohort === 'WARMUP') lane.warmup++;
      else lane.measured++;
      if (outcome === 'UNKNOWN' || funding && outcome !== 'SUCCEEDED') {
        hold(funding ? 'FUNDING_OUTCOME_UNKNOWN_OR_REJECTED' : 'SERVICE_OUTCOME_UNKNOWN');
        stopWork(reason);
      } else if (lane.ledgerPending !== 0) {
        hold('UNFINISHED_LEDGER_BOUNDARY'); stopWork('UNFINISHED_LEDGER_BOUNDARY');
      } else if (held && !stopping) stopWork('RECORDER_OR_CLOCK_UNKNOWN');
      progress();
    }
    try { observe(A(funding ? lane.fund : lane.execute, undefined, [command]), terminal, () => terminal('UNKNOWN')); }
    catch { terminal('UNKNOWN'); }
  }
  function startCloses(force = false) {
    if (final !== null || !stopping || !force && (active !== 0 || pendingLedger !== 0
        || pendingBalances !== 0 || balanceBarrier !== null)) return;
    if (!force && !finalBalancesChecked) {
      finalBalancesChecked = true;
      if (recordingStarted && !held) { beginBalanceBarrier('DRAINING'); return; }
    }
    if (final !== null || !force && (pendingBalances !== 0 || balanceBarrier !== null)) return;
    phase = 'CLOSING';
    for (const lane of lanes) if (!lane.closeEntered) {
      lane.closeEntered = true; lane.closeOutcome = 'PENDING';
      function closed(clean) {
        if (lane.closeOutcome !== 'PENDING') { hold('DUPLICATE_CLOSE_UNKNOWN'); return; }
        lane.closeOutcome = clean ? 'RETURNED' : 'UNKNOWN'; closesDone++;
        if (!clean) hold('OWNER_CLOSE_UNKNOWN');
        if (active === 0 && pendingLedger === 0 && pendingBalances === 0 && balanceBarrier === null && closesDone === lanes.length) finish(false);
      }
      try { observe(A(lane.close, undefined, []), value => closed(value === undefined), () => closed(false)); }
      catch { closed(false); }
    }
  }
  function stopWork(code) {
    if (final !== null || stopping) return;
    stopping = true; if (reason === null) reason = code;
    if (balanceBarrier !== null) {
      balanceBarrier.abandoned = true; hold('BALANCE_BARRIER_INTERRUPTED');
    }
    cancel(setupTimer); cancel(measurementTimer);
    if (measurementStarted && !measurementStopped) {
      measurementStopped = true;
      try { recorder.stopMeasurement(clock()); } catch { hold('RECORDER_OR_CLOCK_UNKNOWN'); }
    }
    phase = 'DRAINING';
    drainTimer = arm('drain', plan.drainGraceMs);
    if (drainTimer === null) { startCloses(true); finish(true); return; }
    progress();
  }
  function progress() {
    if (final !== null) return;
    if (stopping) { startCloses(); return; }
    if (pumping || balanceBarrier !== null || pendingBalances !== 0) return;
    pumping = true;
    try {
      // One operation per lane. Genuine Promise callbacks schedule later steps;
      // synchronous reentry never recursively dispatches another operation.
      if (phase === 'FUNDING') {
        for (const lane of lanes) if (!lane.fundEntered && !stopping) beginOperation(lane, true);
        if (stopping || active !== 0 || !lanes.every(l => l.funded)) return;
        if (!fundingBalancesChecked) {
          fundingBalancesChecked = true; beginBalanceBarrier('FUNDING'); return;
        }
        phase = 'WARMUP';
      }
      if (phase === 'WARMUP') {
        for (const lane of lanes) if (!lane.busy && lane.warmup < plan.warmupCallsPerLane && !stopping) beginOperation(lane, false);
        if (stopping || active !== 0 || !lanes.every(l => l.warmup === plan.warmupCallsPerLane)) return;
        if (!warmupChecked) {
          warmupChecked = true;
          beginBalanceBarrier('WARMUP'); return;
        }
        cancel(setupTimer);
        if (stopping || final !== null) return;
        if (held) { stopWork(reason); return; }
        try {
          const at = clock();
          if (stopping || final !== null) return;
          recorder.startMeasurement(at); measurementStarted = true;
        }
        catch { hold('RECORDER_OR_CLOCK_UNKNOWN'); stopWork(reason); return; }
        phase = 'MEASURING'; measurementTimer = arm('measurement', plan.measurementWindowMs);
        if (measurementTimer === null) { stopWork(reason); return; }
      }
      if (phase === 'MEASURING') {
        for (const lane of lanes) if (!lane.busy && lane.measured < plan.measurementCallsPerLane && !stopping) beginOperation(lane, false);
        if (!stopping && active === 0 && lanes.every(l => l.measured === plan.measurementCallsPerLane))
          stopWork('PLAN_COMPLETE');
      }
    } finally { pumping = false; }
  }
  function finish(force) {
    if (final !== null) return;
    if (!force && (active !== 0 || pendingLedger !== 0 || pendingBalances !== 0 || balanceBarrier !== null || closesDone !== lanes.length)) return;
    cancel(setupTimer); cancel(measurementTimer); cancel(drainTimer);
    let recording = null, postStopLedgerRecording = null;
    try { recording = recorder.finalize(clock()); }
    catch { hold('RECORDER_OR_CLOCK_UNKNOWN'); }
    try { postStopLedgerRecording = drainLedger.finalize(); }
    catch { hold('RECORDER_OR_CLOCK_UNKNOWN'); }
    if (recording === null || recording.recordingState === 'INCOMPLETE'
        || postStopLedgerRecording === null || postStopLedgerRecording.recordingState === 'INCOMPLETE')
      hold('RECORDING_INCOMPLETE');
    final = F({ capacityWorkloadOwnerVersion: 2, scope: 'TRUSTED_ASYNC_SOURCE_LANES_NOT_NATIVE_QUALIFICATION',
      outcome: held || force ? 'HELD_UNKNOWN' : 'OBSERVED_OWNERS_RETURNED', reason, uncertainty,
      measurementStatus: held || force ? 'WITHHELD_OWNER_UNKNOWN' : 'OBSERVED_COMPONENT_ONLY', plan,
      plannedCallsCompleted: lanes.every(l => l.measured === plan.measurementCallsPerLane),
      laneCount: lanes.length, pendingOperations: active, pendingLedgerBoundaries: pendingLedger,
      returnedCloses: lanes.filter(l => l.closeOutcome === 'RETURNED').length,
      unknownCloses: lanes.filter(l => l.closeOutcome === 'UNKNOWN').length,
      pendingCloses: lanes.filter(l => l.closeOutcome === 'PENDING').length, balanceBarriersObserved: checks,
      pendingBalanceReads: pendingBalances, balanceBarrierPending: balanceBarrier !== null,
      balanceReadAttempts, completedBalanceBarriers, balanceContract: 'GENUINE_PROMISE_FRESH_READ_NOT_SYNC_CACHE',
      recording, postStopLedgerRecording, ledgerBoundariesStarted: ledgerStarts,
      nativeClockAuthenticated: false, nativeResourcesQualified: false,
      benchmarkQualified: false, capacityQualified: false, authority: 'NONE' });
    phase = held || force ? 'HELD' : 'CLOSED';
    const yes = resolveRun; resolveRun = null; yes(final);
  }
  function start(preStopped) {
    if (running !== null) return running;
    const c = capability(); running = c.promise; resolveRun = c.resolve;
    if (preStopped) { stopWork('MANUAL_STOP_BEFORE_RUN'); return running; }
    phase = 'FUNDING';
    try {
      const at = clock();
      if (!stopping) {
        recorder.startWarmup(at); recordingStarted = true;
        setupTimer = arm('setup', plan.setupBudgetMs);
        if (setupTimer === null) stopWork(reason);
        else if (!stopping && final === null) progress();
      }
    } catch { hold('RECORDER_OR_CLOCK_UNKNOWN'); stopWork(reason); }
    return running;
  }
  const run = F(function run() {
    if (arguments.length !== 0) return rejected('input_rejected');
    return start(false);
  });
  const stop = F(function stop() {
    if (arguments.length !== 0) return rejected('input_rejected');
    if (running === null) return start(true);
    stopWork('MANUAL_MEASUREMENT_STOP'); return running;
  });
  const inspect = F(function inspect() {
    if (arguments.length !== 0) fail('input_rejected');
    return F({ phase, held, reason, uncertainty, runRequested: running !== null, stopRequested: stopping,
      activeOperations: active, pendingLedgerBoundaries: pendingLedger,
      pendingBalanceReads: pendingBalances, balanceBarrierPending: balanceBarrier !== null,
      balanceReadAttempts, completedBalanceBarriers,
      returnedCloses: lanes.filter(l => l.closeOutcome === 'RETURNED').length,
      pendingCloses: lanes.filter(l => l.closeOutcome === 'PENDING').length,
      finalCached: final !== null, recording: recorder.inspect(),
      postStopLedgerRecording: drainLedger.inspect(), ledgerBoundariesStarted: ledgerStarts, authority: 'NONE' });
  });
  return F({ run, stop, inspect });
}
function exact(value, fields, frozen = false) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) || P(value) !== Object.prototype
      || K(value).length !== fields.length || frozen && !Object.isFrozen(value)) fail('input_rejected');
  const out = {};
  for (const name of fields) {
    const d = D(value, name);
    if (!d || !O(d, 'value') || !d.enumerable) fail('input_rejected');
    DEFINE(out, name, { value: d.value, enumerable: true });
  }
  return out;
}
function dense(value, low, high) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) || P(value) !== Array.prototype
      || !Object.isFrozen(value)) fail('input_rejected');
  const length = D(value, 'length');
  if (!length || !O(length, 'value') || !Number.isSafeInteger(length.value) || length.value < low || length.value > high
      || K(value).length !== length.value + 1) fail('input_rejected');
  const out = [];
  for (let i = 0; i < length.value; i++) {
    const d = D(value, String(i)); if (!d || !O(d, 'value') || !d.enumerable) fail('input_rejected'); out.push(d.value);
  }
  return out;
}
function callable(value) { if (typeof value !== 'function' || IS_PROXY(value) || !Object.isFrozen(value)) fail('input_rejected'); }
function integer(value, low, high) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < low || value > high) fail('input_rejected');
}
function same(a, b) { return !!a && !!b && K(a).length === K(b).length && K(b).every(k => O(a,k) && a[k] === b[k]); }
function invariant() {
  return D(Object.prototype, 'then') === undefined && D(Object.prototype, 'toJSON') === undefined
    && same(D(PP, 'then'), THEN) && same(D(PP, 'constructor'), CTOR) && same(D(NativePromise, Symbol.species), SPECIES);
}
function safe(value) {
  if (!invariant() || !IS_PROMISE(value) || IS_PROXY(value) || P(value) !== PP || D(value, 'then') !== undefined) return false;
  const d = D(value, 'constructor');
  return d === undefined || O(d, 'value') && d.value === NativePromise && !d.enumerable && !d.writable && !d.configurable;
}
function capability() {
  let resolve; const promise = new NativePromise(yes => { resolve = yes; });
  DEFINE(promise, 'constructor', { value: NativePromise }); A(THEN.value, promise, [discard, discard]);
  return { promise, resolve };
}
function rejected(kind) {
  const promise = new NativePromise((yes, no) => no(error(kind)));
  DEFINE(promise, 'constructor', { value: NativePromise }); A(THEN.value, promise, [discard, discard]); return promise;
}
function error(kind) {
  const code = 'service_credit_capacity_async_workload_' + kind, e = new TypeError(code);
  DEFINE(e, 'code', { value: code, enumerable: true }); DEFINE(e, 'stack', { value: 'TypeError: ' + code }); return F(e);
}
function fail(kind) { throw error(kind); }
function discard() {}
