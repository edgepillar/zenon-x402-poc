import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServiceCreditCapacityCohortWriterTraceData as baselineCoverage } from '../src/service-credit-capacity-cohort-writer-trace-data.js';
import { createServiceCreditCapacityCohortWriterCoverageData as ownedCoverage } from '../src/service-credit-capacity-cohort-writer-coverage-data.js';
import { createServiceCreditCapacityWindowWriterTraceData as baselineWindow } from '../src/service-credit-capacity-window-writer-trace-data.js';
import { createServiceCreditCapacityWindowWriterTraceOwnedData as ownedWindow } from '../src/service-credit-capacity-window-writer-trace-owned-data.js';

if (process.version !== 'v24.19.0'
    || process.env.X402_CAPACITY_WINDOW_DATA_SELECTION !== 'owned-child-window-data-v1')
  throw new TypeError('EXACT_OWNED_WINDOW_DATA_SELECTION_REQUIRED');
const F = Object.freeze, names = [], metrics = {};
let entered = 0, completed = 0;
function check(name, body) {
  names.push(name);
  test(name, { concurrency: false, timeout: 10000 }, () => { entered++; body(); completed++; });
}
const context = F({ runId: '1'.repeat(64), laneId: 'lane.one', sourceRowsSha256: '2'.repeat(64) });
function options(edit = {}) {
  return F({ context, plan: F({ warmupCallsPerLane: 1, measurementCallsPerLane: 1 }),
    completion: F({ warmupCompleted: 1, measuredCompleted: 1 }),
    window: F({ windowVersion: 1, context, clockDomain: 'SERVICE_CHILD_LOCAL', phase: 'STOPPED',
      startNs: '1', stopNs: '100000000', stopCause: 'PARENT_STOP', unknown: false, clockReads: 2 }), ...edit });
}
function original(cohort, ordinal, laneId = context.laneId, runId = context.runId) {
  return createHash('sha256').update(['native-capacity-original-v1', runId, laneId, cohort, String(ordinal)].join('\0')).digest('hex');
}
const W0 = '446350fe79ca7a61da324335e2e6087ec89f148e9c72846b3405aa0523a40d74';
const M0 = '4733b3787d4c374dc760f91def308946993b212b4283cbfb5e8ecd4257400fe4';
function row(ordinal, command = 'CONTROL', elapsed = 3n, edit = {}) {
  const start = BigInt(ordinal) * 1000n + 10n;
  return F({ ordinal, operation: 'declared.writer', command, beforeBeginNs: String(start),
    afterBeginNs: String(start + 1n), beforeCommitNs: String(start + 2n), afterCommitNs: String(start + elapsed),
    changed: ordinal % 2 === 0, timingKind: 'ACTUAL_STORE_WRITER_BRACKET_INCLUDES_JS_AND_IDENTITY_CHECKS', ...edit });
}
function page(records, from = 0, total = records.length, edit = {}) {
  return F({ records: F(records), next: from + records.length, total, started: total,
    active: false, unknown: false, clockDomain: 'SERVICE_CHILD_LOCAL', ...edit });
}
function coverageOptions(value) {
  return F({ context: F({ runId: value.context.runId, laneId: value.context.laneId }),
    plan: value.plan, completion: value.completion });
}
function sharedCoverage(value) {
  const out = { ...value }; delete out.capacityCohortWriterTraceDataVersion;
  delete out.capacityCohortWriterCoverageDataVersion;
  out.cohorts = Object.fromEntries(Object.entries(value.cohorts).map(([name, cohort]) => [name, {
    originalsObserved: cohort.originalsObserved, writerIntervals: cohort.writerIntervals,
    changedIntervals: cohort.changedIntervals,
  }]));
  return out;
}
function compareInspect(before, current) {
  const a = { ...before }, b = { ...current };
  delete a.retainedDurationReferences; delete b.retainedDurationReferences;
  assert.deepEqual(b, a);
}
function coveragePair(value = options()) {
  return [baselineCoverage(coverageOptions(value)), ownedCoverage(coverageOptions(value))];
}
function appendBoth(pair, input) {
  const results = pair.map(owner => {
    try { return { accepted: true, value: owner.append(input) }; }
    catch (error) { return { accepted: false, code: error.code, message: error.message }; }
  });
  assert.deepEqual(results[1], results[0]); compareInspect(pair[0].inspect(), pair[1].inspect());
  assert.equal(pair[1].inspect().retainedDurationReferences, 0);
  return results[1].accepted;
}
function finalizeCoverage(pair) {
  const a = pair[0].finalize(), b = pair[1].finalize();
  assert.deepEqual(sharedCoverage(b), sharedCoverage(a));
  assert.equal(b.capacityCohortWriterCoverageDataVersion, 1);
  for (const group of Object.values(b.cohorts)) {
    assert.equal(Object.hasOwn(group, 'writerBracketNs'), false);
    assert.equal(Object.hasOwn(group, 'insideWriterTransactionNs'), false);
  }
  compareInspect(pair[0].inspect(), pair[1].inspect());
  assert.equal(pair[1].finalize(), b); return b;
}

check('coverage uses independent literal original vectors and preserves every appended field', () => {
  assert.equal(original('WARMUP', 0), W0); assert.equal(original('MEASUREMENT', 0), M0);
  const pair = coveragePair();
  assert.equal(appendBoth(pair, page([row(1), row(2, W0), row(3, W0), row(4, M0), row(5)])), true);
  const value = finalizeCoverage(pair); assert.equal(value.matchedCompletedOriginals, 2);
  assert.equal(value.cohorts.WARMUP.writerIntervals, 2);
});
for (const [name, records, edit] of [
  ['foreign lane', [row(1, original('WARMUP', 0, 'lane.other'))], {}],
  ['foreign run', [row(1, original('WARMUP', 0, context.laneId, '3'.repeat(64)))], {}],
  ['ordinal gap', [row(1, M0)], {}],
  ['reversed original order', [row(1, W0), row(2, M0), row(3, W0)], {}],
  ['original reopened after control', [row(1, W0), row(2), row(3, W0)], {}],
  ['unobserved completion', [row(1, W0)], { completion: F({ warmupCompleted: 0, measuredCompleted: 0 }) }],
  ['late malformed row', [row(1, W0), row(2, M0, 3n, { changed: 'true' })], {}],
  ['noncanonical timestamp', [row(1, W0, 3n, { beforeBeginNs: '010' })], {}],
  ['nonmonotonic rows', [row(1, W0), row(2, M0, 3n, { beforeBeginNs: '1' })], {}],
]) check('coverage preserves whole-page refusal and sticky hold / ' + name, () => {
  const pair = coveragePair(options(edit)); assert.equal(appendBoth(pair, page(records)), false);
  assert.equal(pair[1].inspect().acceptedIntervals, 0);
  assert.equal(appendBoth(pair, page([row(1, W0), row(2, M0)])), false);
  assert.equal(finalizeCoverage(pair).status, 'INCOMPLETE_DECLARED_TRACE_DATA');
});
for (const [name, extra] of [['UNKNOWN', { unknown: true }], ['active writer', { active: true }],
  ['wrong child clock', { clockDomain: 'PAYER_CHILD_LOCAL' }], ['wrong total', { started: 3 }]])
  check('coverage preserves raw snapshot refusal / ' + name, () => {
    const pair = coveragePair(); assert.equal(appendBoth(pair, page([row(1, W0), row(2, M0)], 0, 2, extra)), false);
    assert.equal(finalizeCoverage(pair).acceptedIntervals, 0);
  });
check('coverage preserves incomplete paging and does not fabricate missing originals', () => {
  const pair = coveragePair();
  assert.equal(appendBoth(pair, page(Array.from({ length: 64 }, (_, i) => row(i + 1)), 0, 65)), true);
  const value = finalizeCoverage(pair); assert.equal(value.status, 'INCOMPLETE_DECLARED_TRACE_DATA');
  assert.equal(value.acceptedIntervals, 64); assert.equal(value.missingCompletedOriginals, 2);
});
check('coverage preserves cross-page grouping and control closure of an original', () => {
  const pair = coveragePair();
  assert.equal(appendBoth(pair, page(Array.from({ length: 64 }, (_, i) => row(i + 1, W0)), 0, 66)), true);
  assert.equal(appendBoth(pair, page([row(65, W0), row(66, M0)], 64, 66)), true);
  assert.equal(finalizeCoverage(pair).matchedCompletedOriginals, 2);
});
check('coverage rejects replay and changed declared totals without resetting its prefix', () => {
  for (const changedTotal of [false, true]) {
    const pair = coveragePair(), p = page(Array.from({ length: 64 }, (_, i) => row(i + 1)), 0, 65);
    assert.equal(appendBoth(pair, p), true);
    assert.equal(appendBoth(pair, changedTotal ? page([row(65)], 64, 66) : p), false);
    assert.equal(finalizeCoverage(pair).acceptedIntervals, 64);
  }
});
check('coverage refuses mutable/accessor/proxy DATA without entering user hooks', () => {
  let hooks = 0;
  for (const input of [{ ...page([]) }, F({ ...page([]), get records() { hooks++; return F([]); } }),
    new Proxy(page([]), { getPrototypeOf() { hooks++; return Object.prototype; } })]) {
    const pair = coveragePair(); assert.equal(appendBoth(pair, input), false); finalizeCoverage(pair);
  }
  assert.equal(hooks, 0);
});
check('coverage arity failure preserves exact hold and cached finalization behavior', () => {
  const pair = coveragePair(); for (const owner of pair) assert.throws(() => owner.append());
  finalizeCoverage(pair); for (const owner of pair) assert.throws(() => owner.finalize('extra'));
});
check('complete and incomplete window reports equal the preserved baseline byte for byte', () => {
  for (const variant of ['complete', 'empty', 'missing', 'bad', 'large-integer']) {
    const config = options(variant === 'empty' || variant === 'large-integer'
      ? { completion: F({ warmupCompleted: 0, measuredCompleted: 0 }) } : {});
    const pair = [baselineWindow(config), ownedWindow(config)];
    const rows = variant === 'empty' ? [] : variant === 'complete' ? [row(1, W0), row(2, M0)]
      : variant === 'large-integer' ? [row(1, 'CONTROL', 1n << 100n)]
        : variant === 'bad' ? [row(1, W0), row(2, M0, 3n, { changed: 1 })] : [row(1)];
    const values = pair.map(owner => { try { return { value: owner.append(page(rows)) }; } catch (e) { return { error: e.message }; } });
    assert.deepEqual(values[1], values[0]);
    assert.equal(JSON.stringify(pair[1].finalize()), JSON.stringify(pair[0].finalize()));
    compareInspect(pair[0].inspect(), pair[1].inspect());
  }
});

function finalizationCounters(body) {
  const sortDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'sort');
  const iteratorDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator);
  const counts = { sorts: 0, sortedDurationReferences: 0, iteratedDurationReferences: 0 };
  try {
    Object.defineProperty(Array.prototype, 'sort', { ...sortDescriptor, value: function (...args) {
      counts.sorts++; counts.sortedDurationReferences += this.length;
      return Reflect.apply(sortDescriptor.value, this, args);
    } });
    Object.defineProperty(Array.prototype, Symbol.iterator, { ...iteratorDescriptor, value: function* () {
      const it = Reflect.apply(iteratorDescriptor.value, this, []);
      for (let step = it.next(); !step.done; step = it.next()) {
        if (typeof step.value === 'bigint') counts.iteratedDurationReferences++;
        yield step.value;
      }
    } });
    return { result: body(), counts };
  } finally {
    Object.defineProperty(Array.prototype, 'sort', sortDescriptor);
    Object.defineProperty(Array.prototype, Symbol.iterator, iteratorDescriptor);
  }
}
check('full 16-lane trace retains half the durations and eliminates finalize duration copies', () => {
  const total = 3136, config = options({ plan: F({ warmupCallsPerLane: 0, measurementCallsPerLane: 256 }),
    completion: F({ warmupCompleted: 0, measuredCompleted: 0 }) });
  const before = { retained: 0, sorts: 0, sorted: 0, copied: 0 }, current = { ...before };
  for (let lane = 0; lane < 16; lane++) {
    const pair = [baselineWindow(config), ownedWindow(config)];
    for (let from = 0; from < total; from += 64) {
      const rows = Array.from({ length: Math.min(64, total - from) }, (_, i) => row(from + i + 1, 'CONTROL', BigInt(3 + (i % 23))));
      const input = page(rows, from, total);
      assert.deepEqual(pair[1].append(input), pair[0].append(input));
    }
    const oldInspect = pair[0].inspect(), newInspect = pair[1].inspect();
    before.retained += oldInspect.retainedDurationReferences; current.retained += newInspect.retainedDurationReferences;
    compareInspect(oldInspect, newInspect);
    const oldFinal = finalizationCounters(() => pair[0].finalize());
    const newFinal = finalizationCounters(() => pair[1].finalize());
    assert.equal(JSON.stringify(newFinal.result), JSON.stringify(oldFinal.result));
    for (const [out, value] of [[before, oldFinal.counts], [current, newFinal.counts]]) {
      out.sorts += value.sorts; out.sorted += value.sortedDurationReferences; out.copied += value.iteratedDurationReferences;
    }
    for (const owner of pair) {
      assert.equal(owner.inspect().retainedDurationReferences, 0); assert.equal(owner.inspect().retainedCommandReferences, 0);
    }
  }
  assert.deepEqual(before, { retained: 200704, sorts: 64, sorted: 200704, copied: 200704 });
  assert.deepEqual(current, { retained: 100352, sorts: 32, sorted: 100352, copied: 0 });
  metrics.fullTrace = { lanes: 16, rowsPerLane: total, rawIntervals: total * 16, before, current,
    finalReportsEqual: true, arraysReleasedAtFinalization: true, actualHeapBytesMeasured: false,
    nativeThroughputMeasured: false, physicalReclaimMeasured: false };
});

function appendConversionCounts(owner,input) {
  const bigintDescriptor=Object.getOwnPropertyDescriptor(globalThis,'BigInt');
  const stringDescriptor=Object.getOwnPropertyDescriptor(globalThis,'String');
  const counts={bigintCalls:0,stringCalls:0};
  let value;
  try {
    Object.defineProperty(globalThis,'BigInt',{...bigintDescriptor,value:function(value) {
      counts.bigintCalls++;return Reflect.apply(bigintDescriptor.value,undefined,[value]);
    }});
    Object.defineProperty(globalThis,'String',{...stringDescriptor,value:function(value) {
      counts.stringCalls++;return Reflect.apply(stringDescriptor.value,undefined,[value]);
    }});
    value=owner.append(input);
  } finally {
    Object.defineProperty(globalThis,'BigInt',bigintDescriptor);
    Object.defineProperty(globalThis,'String',stringDescriptor);
  }
  return {value,counts};
}
function durationReuseOwners(config) {
  return {
    originalWindow:baselineWindow(config),currentWindow:ownedWindow(config),
    originalCoverage:baselineCoverage(coverageOptions(config)),
    currentCoverage:ownedCoverage(coverageOptions(config)),
  };
}
function durationReusePage(owners,input) {
  const a=appendConversionCounts(owners.originalWindow,input);
  const b=appendConversionCounts(owners.currentWindow,input);
  const c=appendConversionCounts(owners.originalCoverage,input);
  const d=appendConversionCounts(owners.currentCoverage,input);
  assert.deepEqual(b.value,a.value);
  compareInspect(owners.originalWindow.inspect(),owners.currentWindow.inspect());
  const subtract=(x,y)=>({bigintCalls:x.bigintCalls-y.bigintCalls,stringCalls:x.stringCalls-y.stringCalls});
  return {previousOwnedWindow:subtract(a.counts,c.counts),
    currentOwnedWindow:subtract(b.counts,d.counts),
    originalFullPath:a.counts,currentFullPath:b.counts};
}
check('duration reuse keeps exact zero and large canonical decimal reports',()=>{
  const maximum=(1n<<128n)-1n;
  for(const [before,after,begin,commit]of [
    [0n,0n,0n,0n],[10n,20n,11n,19n],
    [(1n<<53n)+1n,(1n<<53n)+19n,(1n<<53n)+2n,(1n<<53n)+18n],
    [maximum-100n,maximum,maximum-99n,maximum-1n]]) {
    const config=options({completion:F({warmupCompleted:0,measuredCompleted:0})});
    const pair=[baselineWindow(config),ownedWindow(config)];
    const input=page([row(1,'CONTROL',0n,{beforeBeginNs:String(before),afterBeginNs:String(begin),
      beforeCommitNs:String(commit),afterCommitNs:String(after)})]);
    const old=pair[0].append(input),now=pair[1].append(input);
    assert.deepEqual(now,old);assert.equal(now.intervals[0].bracketElapsedNs,String(after-before));
    assert.equal(now.intervals[0].insideTransactionElapsedNs,String(commit-begin));
    assert.equal(JSON.stringify(pair[1].finalize()),JSON.stringify(pair[0].finalize()));
  }
});
check('duration reuse counts one fewer bigint parse and no repeated decimal rendering per row',()=>{
  const config=options({plan:F({warmupCallsPerLane:0,measurementCallsPerLane:1}),
    completion:F({warmupCompleted:0,measuredCompleted:0})});
  const owners=durationReuseOwners(config);
  const input=page(Array.from({length:64},(_,i)=>row(i+1,'CONTROL',BigInt(3+i%23))));
  const result=durationReusePage(owners,input);
  assert.deepEqual(result.previousOwnedWindow,{bigintCalls:256,stringCalls:128});
  assert.deepEqual(result.currentOwnedWindow,{bigintCalls:192,stringCalls:0});
  assert.deepEqual(result.originalFullPath,{bigintCalls:640,stringCalls:321});
  assert.deepEqual(result.currentFullPath,{bigintCalls:448,stringCalls:193});
  assert.equal(JSON.stringify(owners.currentWindow.finalize()),JSON.stringify(owners.originalWindow.finalize()));
  owners.originalCoverage.finalize();owners.currentCoverage.finalize();
  metrics.durationReuseOnePage={rows:64,...result,cohortOverheadSubtracted:true,
    previousWindowBodyMatchesPriorOwnedSource:true,countsOnly:true};
});
check('duration reuse preserves page atomicity when a later endpoint is malformed',()=>{
  const config=options({completion:F({warmupCompleted:0,measuredCompleted:0})});
  for(const malformed of ['00020','-1',String(1n<<128n),20n,20]) {
    const pair=[baselineWindow(config),ownedWindow(config)];
    const input=page([row(1),row(2,'CONTROL',3n,{afterCommitNs:malformed})]);
    for(const owner of pair)assert.throws(()=>owner.append(input));
    assert.equal(pair[1].inspect().acceptedIntervals,0);
    assert.equal(pair[1].inspect().retainedDurationReferences,0);
    assert.equal(JSON.stringify(pair[1].finalize()),JSON.stringify(pair[0].finalize()));
  }
});
check('duration reuse never reads an accessor or coerces a boxed timestamp',()=>{
  let hooks=0;
  const config=options({completion:F({warmupCompleted:0,measuredCompleted:0})});
  const withGetter=F({...row(1),get afterCommitNs(){hooks++;return '1013';}});
  const boxed=Object.freeze({toString(){hooks++;return '1013';}});
  for(const input of [page([withGetter]),page([row(1,'CONTROL',3n,{afterCommitNs:boxed})])]) {
    const pair=[baselineWindow(config),ownedWindow(config)];
    for(const owner of pair)assert.throws(()=>owner.append(input));
    assert.equal(pair[1].inspect().acceptedIntervals,0);
    assert.equal(JSON.stringify(pair[1].finalize()),JSON.stringify(pair[0].finalize()));
  }
  assert.equal(hooks,0);
});
check('full 16-lane duration reuse avoids 100352 decimal renders with identical distributions',()=>{
  const total=3136,lanes=16;
  const config=options({plan:F({warmupCallsPerLane:0,measurementCallsPerLane:256}),
    completion:F({warmupCompleted:0,measuredCompleted:0})});
  const previous={bigintCalls:0,stringCalls:0},current={...previous};
  const originalFullPath={...previous},currentFullPath={...previous};
  let accepted=0;
  for(let lane=0;lane<lanes;lane++) {
    const owners=durationReuseOwners(config);
    for(let from=0;from<total;from+=64) {
      const input=page(Array.from({length:Math.min(64,total-from)},
        (_,i)=>row(from+i+1,'CONTROL',BigInt(3+i%23))),from,total);
      const r=durationReusePage(owners,input);
      for(const [target,value]of [[previous,r.previousOwnedWindow],[current,r.currentOwnedWindow],
        [originalFullPath,r.originalFullPath],[currentFullPath,r.currentFullPath]])
        for(const field of ['bigintCalls','stringCalls'])target[field]+=value[field];
      accepted+=input.records.length;
    }
    assert.equal(JSON.stringify(owners.currentWindow.finalize()),JSON.stringify(owners.originalWindow.finalize()));
    owners.originalCoverage.finalize();owners.currentCoverage.finalize();
    for(const owner of Object.values(owners)) {
      assert.equal(owner.inspect().retainedDurationReferences,0);
      assert.equal(owner.inspect().retainedCommandReferences,0);
    }
  }
  assert.equal(accepted,50176);
  assert.deepEqual(previous,{bigintCalls:200704,stringCalls:100352});
  assert.deepEqual(current,{bigintCalls:150528,stringCalls:0});
  assert.equal(previous.bigintCalls-current.bigintCalls,50176);
  assert.equal(previous.stringCalls-current.stringCalls,100352);
  metrics.durationReuseFullTrace={lanes,rowsPerLane:total,rawIntervals:accepted,
    previousOwnedWindow:previous,currentOwnedWindow:current,originalFullPath,currentFullPath,
    cohortOverheadSubtracted:true,priorOwnedAppendBodyMatched:true,finalReportsEqual:true,
    arraysReleasedAtFinalization:true,actualHeapBytesMeasured:false,
    nativeThroughputMeasured:false,physicalReclaimMeasured:false};
});

after(() => console.log(JSON.stringify({ event: 'OWNED_WINDOW_REAL_COMPONENT_COMPARISON', selected: names.length,
  entered, completed, names, ...metrics, componentsImported: true, declaredPagesOnly: true,
  nativeApplicationImported: false, SDKImported: false, SQLite: false, sockets: false,
  keysOrSignatures: false, nonce: false, applicationTimersOrChildren: false, storageRootRead: false,
  nativeResourcesQualified: false, productionQualified: false, authority: 'NONE' })));
