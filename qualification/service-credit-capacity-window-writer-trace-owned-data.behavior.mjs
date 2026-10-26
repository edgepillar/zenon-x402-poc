import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { captureNativeCapacityServiceWindowData as capture,
  createServiceCreditCapacityWindowWriterTraceOwnedData as create } from '../src/service-credit-capacity-window-writer-trace-owned-data.js';
if(process.version!=='v24.19.0'||process.env.X402_CAPACITY_WINDOW_DATA_SELECTION!=='owned-child-window-data-v1')
  throw new TypeError('DECLARED_WINDOW_DATA_SELECTION_REQUIRED');
console.log('# owned-child-window-DATA '+JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,nativeEffects:false}));
const F=Object.freeze,context=F({runId:'1'.repeat(64),laneId:'declared.lane',sourceRowsSha256:'2'.repeat(64)});
const expected=F({context,phase:'STOPPED',totalCalls:1});
function window(edit={}){return F({windowVersion:1,context,clockDomain:'SERVICE_CHILD_LOCAL',phase:'STOPPED',
  startNs:'100',stopNs:'200',stopCause:'PARENT_STOP',unknown:false,clockReads:2,...edit});}
function config(edit={}){return F({context,plan:F({warmupCallsPerLane:0,measurementCallsPerLane:1}),
  completion:F({warmupCompleted:0,measuredCompleted:0}),window:window(),...edit});}
function row(before,after,edit={}){
  return F({ordinal:1,operation:'DECLARED.writer',command:'CONTROL',beforeBeginNs:String(before),afterBeginNs:String(before),
    beforeCommitNs:String(after),afterCommitNs:String(after),changed:true,
    timingKind:'ACTUAL_STORE_WRITER_BRACKET_INCLUDES_JS_AND_IDENTITY_CHECKS',...edit});
}
function page(records,from=0,total=records.length,edit={}){return F({records:F(records),next:from+records.length,total,
  started:total,active:false,unknown:false,clockDomain:'SERVICE_CHILD_LOCAL',...edit});}
function original(cohort,ordinal){return createHash('sha256').update('native-capacity-original-v1\0'+context.runId+'\0'+context.laneId+'\0'+cohort+'\0'+ordinal).digest('hex');}
const classes=['BEFORE','CROSSES_OPEN','INSIDE','CROSSES_STOP','CROSSES_BOTH','AFTER','TOUCHES_BOUNDARY'];
function metricsWithheld(s){for(const c of Object.values(s.cohorts))for(const group of Object.values(c))
  for(const name of ['writerBracketNs','insideWriterTransactionNs'])for(const key of ['min','p50','p95','p99','max'])assert.equal(group[name][key],null);}

test('same-child window capture admits exact OPEN and STOPPED DATA without authenticating it',()=>{
  assert.equal(capture(window(),expected).stopNs,'200');
  const opened=capture(window({phase:'OPEN',stopNs:null,stopCause:null,clockReads:1}),F({...expected,phase:'OPEN'}));
  assert.equal(opened.stopNs,null);assert.equal(Object.isFrozen(opened),true);assert.equal(Object.isFrozen(opened.context),true);
});
test('window trace construction is inert with an empty private DATA cursor',()=>{
  const o=create(config()),s=o.inspect();assert.equal(s.phase,'CREATED');assert.equal(s.pagesAccepted,0);
  assert.equal(s.retainedDurationReferences,0);assert.equal(s.rawIdentityContextRetained,false);assert.equal(s.retainedCommandReferences,1);
});
for(const [kind,before,after]of [['BEFORE',10,90],['CROSSES_OPEN',90,110],['INSIDE',110,190],
  ['CROSSES_STOP',190,210],['CROSSES_BOTH',90,210],['AFTER',210,220],['TOUCHES_BOUNDARY',100,110]]){
  test('whole bracket classification '+kind+' never clips either endpoint',()=>{
    const o=create(config()),p=o.append(page([row(before,after)])),s=o.finalize(),g=s.cohorts.CONTROL[kind];
    assert.equal(p.intervals[0].windowClass,kind);assert.equal(g.writerIntervals,1);
    assert.equal(g.writerBracketNs.min,String(after-before));assert.equal(g.insideWriterTransactionNs.max,String(after-before));
    assert.equal(p.intervals[0].bracketElapsedNs,String(after-before));
    assert.equal(Object.hasOwn(p.intervals[0],'beforeBeginNs'),false);assert.equal(Object.hasOwn(p.intervals[0],'command'),false);
    assert.equal(s.wholeIntervalsNotClipped,true);assert.equal(s.declaredWindowElapsedNs,'100');
  });
}
for(const [before,after]of [[90,100],[90,200],[100,100],[100,200],[100,210],[190,200],[200,200],[200,210]]){
  test('equal-nanosecond contact '+before+'-'+after+' remains a separate conservative class',()=>{
    const o=create(config());o.append(page([row(before,after)]));const s=o.finalize();
    assert.equal(s.cohorts.CONTROL.TOUCHES_BOUNDARY.writerIntervals,1);
    assert.equal(s.cohorts.CONTROL.INSIDE.writerIntervals,0);
    assert.equal(s.boundaryEqualityPolicy,'CONTACTS_SEPARATE_NO_SUB_NANOSECOND_ORDER_INFERRED');
  });
}
const invalidWindows=[
  ['version',{windowVersion:2}],['parent clock',{clockDomain:'PARENT_MONOTONIC'}],['pending phase',{phase:'OPEN'}],
  ['sticky UNKNOWN',{unknown:true}],['fallback close',{stopCause:'OWNER_CLOSE_FALLBACK'}],
  ['missing STOP',{stopNs:null}],['empty duration',{stopNs:'100'}],['reversed duration',{stopNs:'99'}],
  ['noncanonical time',{startNs:'0100'}],['numeric time',{startNs:100}],['bigint time',{startNs:100n}],
  ['negative time',{startNs:'-1'}],['overlarge time',{stopNs:String(1n<<128n)}],
  ['noninteger read count',{clockReads:1.5}],['coerced read count',{clockReads:'2'}],
  ['negative zero count',{clockReads:-0}],['insufficient reads',{clockReads:1}],['per-plan read overflow',{clockReads:307}],
  ['foreign run',{context:F({...context,runId:'3'.repeat(64)})}],['foreign lane',{context:F({...context,laneId:'declared.foreign'})}],
  ['foreign source',{context:F({...context,sourceRowsSha256:'3'.repeat(64)})}],
];
for(const [name,edit]of invalidWindows)test('window capture refuses '+name,()=>assert.throws(()=>capture(window(edit),expected)));

test('window capture refuses mutable extra accessor and proxy DATA without hooks',()=>{
  let calls=0;
  for(const candidate of [{...window()},F({...window(),extra:1}),F({...window(),get startNs(){calls++;return '100';}}),
    new Proxy(window(),{getPrototypeOf(){calls++;return Object.prototype;}})])
    assert.throws(()=>capture(candidate,expected));
  assert.equal(calls,0);
});
test('window capture rejects wrong expectation context total phase and public arity',()=>{
  for(const e of [F({...expected,totalCalls:0}),F({...expected,totalCalls:257}),F({...expected,totalCalls:-0}),
    F({...expected,phase:'CREATED'}),F({...expected,context:F({...context,laneId:'mismatch'})}),F({...expected,extra:1})])
    assert.throws(()=>capture(window(),e));
  assert.throws(()=>capture(window(),expected,'extra'));assert.throws(()=>capture(window()));
});
test('window trace captures the plan through descriptors before deriving the finite clock budget',()=>{
  let calls=0;
  const plan=F({get warmupCallsPerLane(){calls++;return 0;},measurementCallsPerLane:1});
  assert.throws(()=>create(config({plan})));assert.equal(calls,0);
  for(const plan of [F({warmupCallsPerLane:0,measurementCallsPerLane:0}),F({warmupCallsPerLane:255,measurementCallsPerLane:2})])
    assert.throws(()=>create(config({plan})));
});
test('window trace binds independently completed originals and preserves separate cohorts',()=>{
  const o=create(config({plan:F({warmupCallsPerLane:1,measurementCallsPerLane:1}),
    completion:F({warmupCompleted:1,measuredCompleted:1})}));
  const p=o.append(page([row(10,20),row(30,40,{ordinal:2,command:original('WARMUP',0)}),
    row(110,190,{ordinal:3,command:original('MEASUREMENT',0)}),row(220,230,{ordinal:4})]));
  assert.deepEqual(p.intervals.map(r=>[r.cohort,r.windowClass]),
    [['CONTROL','BEFORE'],['WARMUP','BEFORE'],['MEASUREMENT','INSIDE'],['CONTROL','AFTER']]);
  const s=o.finalize();assert.equal(s.status,'COMPLETE_DECLARED_WINDOW_TRACE_DATA');
  assert.equal(s.matchedCompletedOriginals,2);assert.equal(s.cohorts.MEASUREMENT.INSIDE.writerIntervals,1);
  assert.equal(JSON.stringify(s).includes(context.runId),false);assert.equal(JSON.stringify(s).includes('DECLARED.writer'),false);
  assert.equal(JSON.stringify(s).includes(original('MEASUREMENT',0)),false);
});
test('writer row alone never proves completion of its declared original',()=>{
  const o=create(config());assert.throws(()=>o.append(page([row(110,120,{command:original('MEASUREMENT',0)})])));
  const s=o.finalize();assert.equal(s.status,'INCOMPLETE_DECLARED_WINDOW_TRACE_DATA');assert.equal(s.acceptedIntervals,0);metricsWithheld(s);
});
test('unmatched original binding cannot be replaced by a fuzzy cohort or ordinal match',()=>{
  const o=create(config());assert.throws(()=>o.append(page([row(110,120,{command:'f'.repeat(64)})])));
  assert.equal(o.inspect().acceptedIntervals,0);assert.equal(o.finalize().status,'INCOMPLETE_DECLARED_WINDOW_TRACE_DATA');
});
test('late malformed row cannot partly commit a valid prefix to the window aggregates',()=>{
  const o=create(config()),bad=row(130,140,{ordinal:2,changed:'true'});
  assert.throws(()=>o.append(page([row(110,120),bad])));
  assert.equal(o.inspect().acceptedIntervals,0);assert.equal(o.inspect().retainedDurationReferences,0);
  const s=o.finalize();assert.equal(s.acceptedIntervals,0);metricsWithheld(s);
});
test('incomplete multi-page snapshot retains counts but withholds every latency distribution',()=>{
  const o=create(config());o.append(page(Array.from({length:64},(_,i)=>row(i+1,i+1,{ordinal:i+1})),0,65));
  const s=o.finalize();assert.equal(s.acceptedIntervals,64);assert.equal(s.status,'INCOMPLETE_DECLARED_WINDOW_TRACE_DATA');metricsWithheld(s);
});
test('missing independently completed original makes otherwise complete paging insufficient',()=>{
  const o=create(config({completion:F({warmupCompleted:0,measuredCompleted:1})}));
  o.append(page([row(110,120)]));const s=o.finalize();assert.equal(s.status,'INCOMPLETE_DECLARED_WINDOW_TRACE_DATA');metricsWithheld(s);
});
test('raw source UNKNOWN active writer and changed totals never become window metrics',()=>{
  for(const edit of [{unknown:true},{active:true},{started:2},{clockDomain:'PAYER_CHILD_LOCAL'}]){
    const o=create(config());assert.throws(()=>o.append(page([row(110,120)],0,1,edit)));metricsWithheld(o.finalize());
  }
  const o=create(config());o.append(page(Array.from({length:64},(_,i)=>row(i+1,i+1,{ordinal:i+1})),0,65));
  assert.throws(()=>o.append(page([row(1000,1001,{ordinal:65})],64,66)));
  metricsWithheld(o.finalize());
});
test('replayed page after a complete snapshot sticks UNKNOWN rather than restarting a window',()=>{
  const o=create(config()),p=page([row(110,120)]);o.append(p);assert.throws(()=>o.append(p));assert.throws(()=>o.append(p));
  const s=o.finalize();assert.equal(s.acceptedIntervals,1);assert.equal(s.status,'INCOMPLETE_DECLARED_WINDOW_TRACE_DATA');metricsWithheld(s);
});
test('finalization releases both genuine cohort and window duration collections',()=>{
  const o=create(config());o.append(page([row(110,120)]));assert.equal(o.inspect().retainedDurationReferences,2);
  assert.equal(o.inspect().retainedCommandReferences,1);const s=o.finalize();
  assert.equal(o.inspect().retainedDurationReferences,0);assert.equal(o.inspect().retainedCommandReferences,0);
  assert.equal(o.finalize(),s);assert.throws(()=>o.append(page([row(130,140)])));assert.equal(o.finalize(),s);
});
test('max finite owned trace uses 49 pages 256 commands and two duration references per row',()=>{
  const total=3136,o=create(config({plan:F({warmupCallsPerLane:0,measurementCallsPerLane:256})}));
  for(let from=0;from<total;from+=64){
    const count=Math.min(64,total-from);
    o.append(page(Array.from({length:count},(_,j)=>row((from+j)*3+1,(from+j)*3+2,{ordinal:from+j+1})),from,total));
  }
  const live=o.inspect();assert.equal(live.pagesAccepted,49);assert.equal(live.acceptedIntervals,total);
  assert.equal(live.recordLimit,3136);assert.equal(live.retainedDurationReferences,6272);assert.equal(live.retainedCommandReferences,256);
  const s=o.finalize();assert.equal(s.status,'COMPLETE_DECLARED_WINDOW_TRACE_DATA');
  assert.equal(o.inspect().retainedDurationReferences,0);assert.equal(o.inspect().retainedCommandReferences,0);
});
test('empty DATA snapshot fabricates neither a latency sample nor native qualification',()=>{
  const o=create(config());o.append(page([]));const s=o.finalize();metricsWithheld(s);
  assert.equal(s.acceptedIntervals,0);assert.equal(s.nativeEventsAuthenticated,false);
  assert.equal(s.measurementWindowIsolationQualified,false);assert.equal(s.pureSqlLatencyQualified,false);
  assert.equal(s.sustainableCapacityQualified,false);assert.equal(s.parentAndChildClocksSubtracted,false);assert.equal(s.authority,'NONE');
});
test('public DATA arity failures are bounded and cannot rewrite a cached result',()=>{
  const o=create(config());assert.throws(()=>o.append());assert.throws(()=>o.inspect('extra'));
  const s=o.finalize();assert.throws(()=>o.finalize('extra'));assert.equal(o.finalize(),s);assert.equal(s.status,'INCOMPLETE_DECLARED_WINDOW_TRACE_DATA');
  assert.throws(()=>create(config(),'extra'));
});
test('large exact child timestamps remain bigint DATA rather than rounded JS numbers',()=>{
  const start=(1n<<127n)+10n,stop=start+100n;
  const o=create(config({window:window({startNs:String(start),stopNs:String(stop)})}));
  o.append(page([row(start+10n,start+20n)]));const s=o.finalize();
  assert.equal(s.declaredWindowElapsedNs,'100');assert.equal(s.cohorts.CONTROL.INSIDE.writerBracketNs.min,'10');
});

