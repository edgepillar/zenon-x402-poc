import { types as utilTypes } from 'node:util';

const FREEZE = Object.freeze, CREATE = Object.create, DEFINE = Object.defineProperty;
const DESCRIPTOR = Object.getOwnPropertyDescriptor, PROTOTYPE = Object.getPrototypeOf;
const KEYS = Reflect.ownKeys, HAS = Object.hasOwn, IS_PROXY = utilTypes.isProxy;
const IS_INTEGER = Number.isSafeInteger, OBJECT = Object.prototype, ErrorType = TypeError;
const PHASES = FREEZE(['FUNDING', 'FUNDED_CALL', 'LEDGER_TRANSACTION']);
const MAX_NS = (1n << 128n) - 1n, MAX_UNITS = (1n << 128n) - 1n;

/**
 * Bounded, DATA-only observations for P4. Does not execute a benchmark, start
 * funding/requests, read a clock/store, retry, classify a payment or own any
 * resource. The operator instruments the three real boundaries separately.
 * A ledger observation is NOT inferred from concurrent funded calls.
 *
 * Time is caller-supplied monotonic nanoseconds, not authenticated native time.
 * Outcomes and expected balances are also caller-declared. COMPLETE means
 * complete recorder input, never production, throughput or balance proof.
 * UNKNOWN/mismatched balances stop NEW observations, not real operations;
 * existing observations may finish. Operational drain/hold remains external.
 *
 * Never evict a slow/error observation to make room. A refused observation,
 * malformed input or missing finish permanently marks recording incomplete.
 * All entered outcomes remain in the denominator, with successful latency
 * reported separately. UNKNOWN is never rewritten as success by a late finish.
 * Each lane retains one packed BigInt per settled sample: duration * 2 plus
 * one success bit. Finalize sorts one series per nonempty lane, derives both
 * exact nearest-rank summaries and keeps at most five selected success values.
 * In-flight handles remain separately capped. Finalize caches deeply
 * frozen scalar summaries and releases its own duration/handle collections.
 * No raw headers, request IDs, payloads, exceptions or per-request log exist.
 *
 * No window throughput/TPS is derived from overlapping latencies. This adds
 * no default/CLI/demo wiring and does not change the old whole-demo benchmark.
 */
export function createServiceCreditCapacityRecorderPacked(options) {
  let limits;
  try {
    if (arguments.length !== 1) reject('configuration_rejected');
    const input = exact(options, ['maxSamplesPerPhase', 'maxInFlightPerPhase']);
    if (!integer(input.maxSamplesPerPhase, 1, 4096)
        || !integer(input.maxInFlightPerPhase, 1, 64)
        || input.maxInFlightPerPhase > input.maxSamplesPerPhase) reject('configuration_rejected');
    limits = record(input);
  } catch { reject('configuration_rejected'); }

  const lanes = CREATE(null);
  for (const name of PHASES) lanes[name] = {
    entered: 0, settled: 0, succeeded: 0, rejected: 0, unknown: 0, peak: 0,
    durations: [], active: new Set(),
  };
  let firstTime = null, lastTime = null, issue = null, stopped = null, finalized = null;
  let refusedStarts = 0, balanceChecks = 0, balanceMismatches = 0;

  function taint(kind) {
    if (issue === null) issue = kind;
    if (stopped === null) stopped = kind;
    reject(kind);
  }
  function open() { if (finalized !== null) reject('finalized'); }
  function clock(value) {
    if (typeof value !== 'bigint' || value < 0n || value > MAX_NS
        || (lastTime !== null && value < lastTime)) taint('clock_rejected');
    return value;
  }
  function tick(value) {
    if (firstTime === null) firstTime = value;
    lastTime = value;
  }

  const begin = FREEZE(function begin(phase, monotonicNanoseconds) {
    open();
    if (stopped !== null) {
      refusedStarts += 1;
      // A stop is not permission to omit later attempted observations.
      taint('recording_stopped');
    }
    if (arguments.length !== 2 || !PHASES.includes(phase)) taint('input_rejected');
    const at = clock(monotonicNanoseconds), lane = lanes[phase];
    if (lane.entered >= limits.maxSamplesPerPhase) {
      refusedStarts += 1; taint('sample_limit');
    }
    if (lane.active.size >= limits.maxInFlightPerPhase) {
      refusedStarts += 1; taint('in_flight_limit');
    }
    tick(at);
    const entry = { at, finished: false };
    lane.entered += 1; lane.active.add(entry);
    lane.peak = Math.max(lane.peak, lane.active.size);
    const finish = FREEZE(function finish(outcome, monotonicNanoseconds) {
      open();
      if (entry.finished) taint('duplicate_finish');
      if (arguments.length !== 2
          || (outcome !== 'SUCCEEDED' && outcome !== 'REJECTED' && outcome !== 'UNKNOWN'))
        taint('input_rejected');
      const ended = clock(monotonicNanoseconds);
      // Commit the terminal observation exactly once, before any caller reentry.
      entry.finished = true; lane.active.delete(entry); tick(ended);
      const duration = ended - entry.at;
      lane.settled += 1; lane.durations.push((duration << 1n) | (outcome === 'SUCCEEDED' ? 1n : 0n));
      if (outcome === 'SUCCEEDED') {
        lane.succeeded += 1;
      } else if (outcome === 'REJECTED') lane.rejected += 1;
      else {
        lane.unknown += 1;
        if (stopped === null) stopped = 'outcome_unknown';
      }
    });
    return record({ finish });
  });

  const recordLedgerBalanceCheck = FREEZE(function recordLedgerBalanceCheck(input) {
    open();
    if (arguments.length !== 1) taint('balance_input_rejected');
    if (balanceChecks >= limits.maxSamplesPerPhase) taint('balance_sample_limit');
    let observed, expected;
    try {
      const top = exact(input, ['observed', 'expected']);
      observed = balance(top.observed); expected = balance(top.expected);
    } catch { taint('balance_input_rejected'); }
    balanceChecks += 1;
    const matches = observed.availableUnits === expected.availableUnits
      && observed.heldUnits === expected.heldUnits && observed.consumedUnits === expected.consumedUnits;
    if (!matches) {
      balanceMismatches += 1;
      if (stopped === null) stopped = 'balance_mismatch';
    }
    return matches;
  });

  const inspect = FREEZE(function inspect() {
    if (arguments.length !== 0) {
      if (finalized !== null) reject('input_rejected');
      taint('input_rejected');
    }
    let retained = 0, pending = 0;
    for (const name of PHASES) {
      retained += lanes[name].durations.length;
      pending += lanes[name].entered - lanes[name].settled;
    }
    return record({ finalized: finalized !== null, recordingIssue: issue, stopReason: stopped,
      refusedStarts, pendingObservations: pending, retainedDurationReferences: retained,
      capacityQualification: 'NOT_ESTABLISHED' });
  });

  const finalize = FREEZE(function finalize() {
    if (arguments.length !== 0) {
      if (finalized !== null) reject('input_rejected');
      taint('input_rejected');
    }
    if (finalized !== null) return finalized;
    const phases = CREATE(null);
    let entered = 0, pending = 0;
    for (const name of PHASES) {
      const lane = lanes[name], inFlight = lane.entered - lane.settled;
      entered += lane.entered; pending += inFlight;
      const latency = summarizePacked(lane.durations, lane.succeeded);
      put(phases, name, record({
        entered: lane.entered, settled: lane.settled, pending: inFlight,
        succeeded: lane.succeeded, rejected: lane.rejected, unknown: lane.unknown,
        peakInFlight: lane.peak,
        nonSuccessFraction: lane.settled === 0 ? null
          : record({ numerator: lane.rejected + lane.unknown, denominator: lane.settled }),
        terminalLatencyNanoseconds: latency.terminal,
        successfulLatencyNanoseconds: latency.successful,
      }));
    }
    if (pending !== 0 && issue === null) issue = 'in_flight_at_finalize';
    finalized = record({
      capacityRecorderVersion: 1, scope: 'CALLER_DECLARED_OBSERVATIONS_ONLY',
      clock: 'CALLER_SUPPLIED_MONOTONIC_NANOSECONDS', percentileMethod: 'NEAREST_RANK',
      recordingState: issue !== null ? 'INCOMPLETE' : entered === 0 ? 'EMPTY' : 'COMPLETE',
      recordingIssue: issue, stopReason: stopped, limits, refusedStarts, pendingObservations: pending,
      observedSpanNanoseconds: firstTime === null ? null : String(lastTime - firstTime),
      phases: FREEZE(phases),
      ledgerBalanceChecks: record({ samples: balanceChecks, mismatches: balanceMismatches,
        result: balanceMismatches !== 0 ? 'MISMATCH'
          : balanceChecks === 0 ? 'NOT_RECORDED' : 'MATCHES_CALLER_DECLARED_EXPECTATIONS' }),
      capacityQualification: 'NOT_ESTABLISHED', ledgerCorrectness: 'NOT_ESTABLISHED',
      authenticatedExecution: false, liveOrProduction: false, authority: 'NONE',
    });
    // These collections own measurement DATA only, never application resources.
    for (const name of PHASES) {
      lanes[name].durations.length = 0;
      lanes[name].active.clear();
    }
    return finalized;
  });
  return record({ begin, recordLedgerBalanceCheck, inspect, finalize });
}

function summarizePacked(values, successes) {
  const empty = () => record({ samples: 0, min: null, p50: null, p95: null, p99: null, max: null });
  if (values.length === 0) return { terminal: empty(), successful: empty() };
  // Success is the low bit, so sorting the packed integers also sorts latency.
  const ordered = values.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const unpack = value => String(value >> 1n);
  const rank = percentage => unpack(ordered[Math.ceil(ordered.length * percentage / 100) - 1]);
  const terminal = record({ samples: ordered.length, min: unpack(ordered[0]),
    p50: rank(50), p95: rank(95), p99: rank(99), max: unpack(ordered[ordered.length - 1]) });
  if (successes === 0) return { terminal, successful: empty() };
  const r50 = Math.ceil(successes * 50 / 100), r95 = Math.ceil(successes * 95 / 100);
  const r99 = Math.ceil(successes * 99 / 100);
  let seen = 0, first = null, last = null, p50 = null, p95 = null, p99 = null;
  for (const value of ordered) {
    if ((value & 1n) === 0n) continue;
    seen += 1;
    if (first === null) first = value;
    if (seen === r50) p50 = value;
    if (seen === r95) p95 = value;
    if (seen === r99) p99 = value;
    last = value;
  }
  return { terminal, successful: record({ samples: successes, min: unpack(first),
    p50: unpack(p50), p95: unpack(p95), p99: unpack(p99), max: unpack(last) }) };
}
function balance(input) {
  const out = exact(input, ['availableUnits', 'heldUnits', 'consumedUnits']);
  for (const key of KEYS(out))
    if (typeof out[key] !== 'bigint' || out[key] < 0n || out[key] > MAX_UNITS)
      reject('balance_input_rejected');
  if (out.availableUnits + out.heldUnits + out.consumedUnits > MAX_UNITS)
    reject('balance_input_rejected');
  return out;
}
function exact(input, fields) {
  if (typeof input !== 'object' || input === null || IS_PROXY(input)
      || PROTOTYPE(input) !== OBJECT || KEYS(input).length !== fields.length) reject('input_rejected');
  const out = CREATE(null);
  for (const key of fields) {
    const d = DESCRIPTOR(input, key);
    if (!d || d.enumerable !== true || !HAS(d, 'value')) reject('input_rejected');
    put(out, key, d.value);
  }
  return out;
}
function record(fields) {
  const out = CREATE(null);
  for (const key of KEYS(fields)) put(out, key, fields[key]);
  return FREEZE(out);
}
function put(target, key, value) {
  const d = CREATE(null); d.value = value; d.enumerable = true; DEFINE(target, key, d);
}
function integer(value, min, max) {
  return IS_INTEGER(value) && value >= min && value <= max && !Object.is(value, -0);
}
function reject(kind) {
  const code = 'service_credit_capacity_recorder_' + kind, error = new ErrorType(code);
  put(error, 'code', code);
  const d = CREATE(null); d.value = 'TypeError: ' + code; DEFINE(error, 'stack', d);
  throw FREEZE(error);
}
