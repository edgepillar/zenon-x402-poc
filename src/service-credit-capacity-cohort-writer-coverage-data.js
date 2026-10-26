import { createHash } from 'node:crypto';
import { types as utilTypes } from 'node:util';
import { captureNativeCapacityLedgerTimingPage as CAPTURE_PAGE } from './service-credit-capacity-native-observation-data.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, O = Object.hasOwn;
const PHASES = F(['CONTROL', 'WARMUP', 'MEASUREMENT']);
const DOMAIN = 'native-capacity-original-v1\0';

/**
 * Bounded coverage-only DATA owner for the real service writer-page contract.
 * Reuses the exact raw-page/original-order admission, without retaining or
 * sorting duration samples. Window owners retain their own classified samples.
 *
 * Match original command ids to the SAME run/lane/cohort/ordinal SHA-256 binding
 * used by the actual payer and pair. Independent completed-original counters
 * are required; a writer row alone never establishes an operation's success.
 * CONTROL, WARMUP and MEASUREMENT summaries remain separate and child-local.
 *
 * No clock, SQL read, SDK, key, signer, nonce search, socket, process or namespace
 * is entered. The existing strict page capture validates the genuine raw shape.
 * No raw request id, operation name or identity context is in returned DATA.
 * Cohort attribution is NOT measurement-window isolation, pure SQL latency,
 * causality, native-event authentication, throughput or economic authority.
 */
export function createServiceCreditCapacityCohortWriterCoverageData(configuration) {
  if (arguments.length !== 1) fail();
  let c = exact(configuration, ['context', 'plan', 'completion']);
  let context = exact(c.context, ['runId', 'laneId']);
  const plan = exact(c.plan, ['warmupCallsPerLane', 'measurementCallsPerLane']);
  const completion = exact(c.completion, ['warmupCompleted', 'measuredCompleted']);
  if (typeof context.runId !== 'string' || !/^[0-9a-f]{64}$/.test(context.runId)
      || typeof context.laneId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(context.laneId)) fail();
  integer(plan.warmupCallsPerLane, 0, 255); integer(plan.measurementCallsPerLane, 1, 256);
  const totalCalls = plan.warmupCallsPerLane + plan.measurementCallsPerLane;
  integer(totalCalls, 1, 256);
  integer(completion.warmupCompleted, 0, plan.warmupCallsPerLane);
  integer(completion.measuredCompleted, 0, plan.measurementCallsPerLane);
  if (completion.measuredCompleted !== 0 && completion.warmupCompleted !== plan.warmupCallsPerLane) fail();
  const lookup = new Map();
  for (const [cohort, count, completed] of [
    ['WARMUP', plan.warmupCallsPerLane, completion.warmupCompleted],
    ['MEASUREMENT', plan.measurementCallsPerLane, completion.measuredCompleted],
  ]) {
    for (let ordinal = 0; ordinal < count; ordinal++) {
      const id = createHash('sha256').update(DOMAIN).update(context.runId).update('\0')
        .update(context.laneId).update('\0').update(cohort).update('\0').update(String(ordinal)).digest('hex');
      if (lookup.has(id)) fail();
      lookup.set(id, F({ cohort, originalOrdinal: ordinal, rank: lookup.size, completed: ordinal < completed }));
    }
  }
  // No caller object or identity context is retained by the owner.
  context = null; c = null; configuration = null;
  const recordLimit = 12 * totalCalls + 64, pageLimit = Math.ceil(recordLimit / 64);
  const expectedOriginals = completion.warmupCompleted + completion.measuredCompleted;
  const samples = Object.fromEntries(PHASES.map(name => [name, { intervals: 0, originals: 0, changed: 0 }]));
  let next = 0, total = null, previousAfterCommitNs = null, pages = 0;
  let lastRank = -1, closedByControl = false, seen = 0, held = false, reason = null, final = null;

  function hold(value) { held = true; if (reason === null) reason = value; }
  function assertWritable() { if (final !== null || held) fail(); }

  const append = F(function append(rawPage) {
    if (final !== null) fail();
    if (arguments.length !== 1) { hold('APPEND_ARITY'); fail(); }
    assertWritable();
    let issue = 'DECLARED_PAGE_REJECTED';
    function reject(value) { issue = value; fail(); }
    try {
      if (pages >= pageLimit || total !== null && next === total) reject('SNAPSHOT_EXHAUSTED_OR_REPLAYED');
      const page = CAPTURE_PAGE(rawPage, F({ from: next, maximum: 64, totalCalls,
        expectedTotal: total, previousAfterCommitNs }));
      // Stage the whole page. A malformed later row cannot partially commit
      // counts/durations or advance the source cursor.
      let rank = lastRank, closed = closedByControl;
      const additions = Object.fromEntries(PHASES.map(name => [name, { intervals: 0, originals: 0, changed: 0 }]));
      const rows = [], rawRows = D(rawPage, 'records').value;
      for (let i = 0; i < page.intervals.length; i++) {
        const interval = page.intervals[i], command = D(rawRows[i], 'command').value;
        let cohort = 'CONTROL', originalOrdinal = null;
        if (command === 'CONTROL') {
          if (rank >= 0) closed = true;
        } else {
          const original = lookup.get(command);
          if (original === undefined) reject('UNMATCHED_ORIGINAL_BINDING');
          if (!original.completed) reject('ORIGINAL_COMPLETION_UNOBSERVED');
          if (original.rank < rank || original.rank > rank + 1) reject('ORIGINAL_TRACE_PREFIX_OR_ORDER');
          if (original.rank === rank && closed) reject('ORIGINAL_REOPENED_AFTER_CONTROL');
          cohort = original.cohort; originalOrdinal = original.originalOrdinal;
          if (original.rank !== rank) {
            rank = original.rank; closed = false; additions[cohort].originals++;
          }
        }
        additions[cohort].intervals++;
        if (D(rawRows[i], 'changed').value) additions[cohort].changed++;
        rows.push(F({ ...interval, cohort, originalOrdinal }));
      }
      // All inputs and staged rows passed before mutating retained DATA.
      for (const name of PHASES) {
        samples[name].intervals += additions[name].intervals;
        samples[name].originals += additions[name].originals;
        samples[name].changed += additions[name].changed;
      }
      seen += additions.WARMUP.originals + additions.MEASUREMENT.originals;
      lastRank = rank; closedByControl = closed; total = page.total; next = page.next;
      previousAfterCommitNs = page.lastAfterCommitNs; pages++;
      return F({ intervals: F(rows), next, total, pagesAccepted: pages, snapshotComplete: next === total,
        clockDomain: 'SERVICE_CHILD_LOCAL', attribution: 'DECLARED_ORIGINAL_COMMAND_BINDING_NOT_NATIVE_AUTHENTICATION',
        rawIdentifiersIncluded: false, measurementWindowIsolationQualified: false,
        pureSqlLatencyQualified: false, nativeEventsAuthenticated: false, authority: 'NONE' });
    } catch { hold(issue); throw problem(); }
  });

  const finalize = F(function finalize() {
    if (arguments.length !== 0) { if (final === null) hold('FINALIZE_ARITY'); fail(); }
    if (final !== null) return final;
    if (total === null) hold('NO_DECLARED_SNAPSHOT');
    else if (next !== total) hold('DECLARED_SNAPSHOT_INCOMPLETE');
    if (seen !== expectedOriginals) hold('COMPLETED_ORIGINAL_TRACE_MISSING');
    const cohorts = Object.fromEntries(PHASES.map(name => [name, F({
      originalsObserved: samples[name].originals, writerIntervals: samples[name].intervals,
      changedIntervals: samples[name].changed,
      coverageStatus: held ? 'WITHHELD_INCOMPLETE_TRACE_DATA' : samples[name].intervals === 0
        ? 'NO_MATCHED_SAMPLES' : 'MATCHED_DECLARED_ORIGINAL_TRACE',
    })]));
    final = F({ capacityCohortWriterCoverageDataVersion: 1,
      status: held ? 'INCOMPLETE_DECLARED_TRACE_DATA' : next === 0 ? 'EMPTY_DECLARED_TRACE_DATA' : 'COMPLETE_DECLARED_TRACE_DATA',
      reason, pagesAccepted: pages, declaredIntervals: total, acceptedIntervals: next,
      independentlyDeclaredCompletedOriginals: F({ WARMUP: completion.warmupCompleted, MEASUREMENT: completion.measuredCompleted }),
      matchedCompletedOriginals: seen, missingCompletedOriginals: expectedOriginals - seen,
      cohorts: F(cohorts), clockDomain: 'SERVICE_CHILD_LOCAL',
      timingKind: 'WRITER_BRACKETS_INCLUDE_JS_AND_IDENTITY_CHECKS_NOT_PURE_SQL_LATENCY',
      attribution: 'CALL_COHORT_NOT_MEASUREMENT_TIME_WINDOW', rawIdentifiersIncluded: false,
      nativeEventsAuthenticated: false, nativeResourcesQualified: false, pureSqlLatencyQualified: false,
      measurementWindowIsolationQualified: false, sustainableCapacityQualified: false,
      liveOrProduction: false, authority: 'NONE' });
    lookup.clear();
    return final;
  });

  const inspect = F(function inspect() {
    if (arguments.length !== 0) fail();
    return F({ phase: final !== null ? 'FINALIZED' : held ? 'HELD' : total === null ? 'CREATED' : 'READING',
      held, reason, pagesAccepted: pages, acceptedIntervals: next, declaredIntervals: total,
      snapshotComplete: total !== null && next === total, matchedCompletedOriginals: seen,
      expectedCompletedOriginals: expectedOriginals, retainedCommandReferences: lookup.size,
      retainedDurationReferences: 0,
      rawIdentityContextRetained: false, recordLimit, pageLimit, nativeEventsAuthenticated: false, authority: 'NONE' });
  });
  return F({ append, finalize, inspect });
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
    out[name] = d.value;
  }
  return out;
}
function problem() {
  const code = 'NATIVE_CAPACITY_COHORT_WRITER_TRACE_REJECTED', e = new TypeError(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code });
  return F(e);
}
function fail() { throw problem(); }
