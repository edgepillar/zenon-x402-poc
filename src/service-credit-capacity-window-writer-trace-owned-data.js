import { types as utilTypes } from 'node:util';
import { createServiceCreditCapacityCohortWriterCoverageData as COHORT } from './service-credit-capacity-cohort-writer-coverage-data.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,O=Object.hasOwn,MAX_NS=1n<<128n;
const COHORTS=F(['CONTROL','WARMUP','MEASUREMENT']);
const CLASSES=F(['BEFORE','CROSSES_OPEN','INSIDE','CROSSES_STOP','CROSSES_BOTH','AFTER','TOUCHES_BOUNDARY']);

/** Strict DATA capture; no clock/process/namespace/SQL entry or authentication.
 * A matching declared source context is not proof of a native IPC sender.
 * Only the actual source-owned adapter can bind these bytes to its child.
 */
export function captureNativeCapacityServiceWindowData(value, expectation) {
  if(arguments.length!==2)fail();
  const e=exact(expectation,['context','phase','totalCalls']),context=exact(e.context,['runId','laneId','sourceRowsSha256']);
  integer(e.totalCalls,1,256);
  if(typeof context.runId!=='string'||!/^[0-9a-f]{64}$/.test(context.runId)
      ||typeof context.laneId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(context.laneId)
      ||typeof context.sourceRowsSha256!=='string'||!/^[0-9a-f]{64}$/.test(context.sourceRowsSha256)
      ||!['OPEN','STOPPED'].includes(e.phase))fail();
  const v=exact(value,['windowVersion','context','clockDomain','phase','startNs','stopNs','stopCause','unknown','clockReads']);
  const actual=exact(v.context,['runId','laneId','sourceRowsSha256']);
  if(Object.keys(context).some(k=>actual[k]!==context[k])||v.windowVersion!==1||v.clockDomain!=='SERVICE_CHILD_LOCAL'
      ||v.phase!==e.phase||v.unknown!==false)fail();
  integer(v.clockReads,1,4*(12*e.totalCalls+64)+2);const start=ns(v.startNs);
  if(e.phase==='OPEN'?(v.stopNs!==null||v.stopCause!==null):(v.stopCause!=='PARENT_STOP'||ns(v.stopNs)<=start||v.clockReads<2))fail();
  return F({...v,context:F({...actual})});
}

/** Whole writer bracket classification on the SAME declared child clock.
 * The inner coverage owner validates every original/page without retaining
 * duplicate durations. Only this owner keeps and sorts its private samples.
 * Genuine cohort/page validation is reused, including independently completed
 * originals, page atomicity and sticky incomplete coverage. Never clip a
 * transaction to a boundary or turn a bracket into pure SQL/TPS evidence.
 * Equal-nanosecond boundary contacts are conservative, not invented ordering.
 */
export function createServiceCreditCapacityWindowWriterTraceOwnedData(configuration) {
  if(arguments.length!==1)fail();
  let c=exact(configuration,['context','plan','completion','window']);
  const plan=F({...exact(c.plan,['warmupCallsPerLane','measurementCallsPerLane'])});
  integer(plan.warmupCallsPerLane,0,255);integer(plan.measurementCallsPerLane,1,256);
  const totalCalls=plan.warmupCallsPerLane+plan.measurementCallsPerLane;integer(totalCalls,1,256);
  let window=captureNativeCapacityServiceWindowData(c.window,F({context:c.context,phase:'STOPPED',totalCalls}));
  const start=ns(window.startNs),stop=ns(window.stopNs),elapsed=String(stop-start);
  const cohort=COHORT(F({context:F({runId:window.context.runId,laneId:window.context.laneId}),plan,completion:c.completion}));
  window=null;c=null;configuration=null;
  const samples=Object.fromEntries(COHORTS.map(name=>[name,Object.fromEntries(CLASSES.map(kind=>[kind,{bracket:[],inside:[],changed:0}]))]));
  let held=false,reason=null,final=null,pages=0,accepted=0,total=null;
  function hold(code){held=true;if(reason===null)reason=code;}
  function classify(before,after) {
    if(before===start||before===stop||after===start||after===stop)return 'TOUCHES_BOUNDARY';
    if(after<start)return 'BEFORE';
    if(before>stop)return 'AFTER';
    if(before<start&&after>stop)return 'CROSSES_BOTH';
    if(before<start)return 'CROSSES_OPEN';
    if(after>stop)return 'CROSSES_STOP';
    return 'INSIDE';
  }
  const append=F(function append(rawPage) {
    if(final!==null)fail();
    if(arguments.length!==1){hold('APPEND_ARITY');fail();}
    if(held)fail();
    try {
      // The genuine inner owner validates/stages the ENTIRE raw page first.
      // Classification below uses only its validated immutable returned DATA.
      const page=cohort.append(rawPage),staged=[];
      for(const row of page.intervals) {
        const kind=classify(ns(row.beforeBeginNs),ns(row.afterCommitNs));
        staged.push({cohort:row.cohort,kind,bracket:BigInt(row.bracketElapsedNs),
          inside:BigInt(row.insideTransactionElapsedNs),changed:row.changed,
          ordinal:row.ordinal,originalOrdinal:row.originalOrdinal});
      }
      for(const row of staged) {
        const s=samples[row.cohort][row.kind];s.bracket.push(row.bracket);s.inside.push(row.inside);if(row.changed)s.changed++;
      }
      pages=page.pagesAccepted;accepted=page.next;total=page.total;
      return F({intervals:F(staged.map(r=>F({ordinal:r.ordinal,cohort:r.cohort,originalOrdinal:r.originalOrdinal,
        windowClass:r.kind,changed:r.changed,bracketElapsedNs:String(r.bracket),insideTransactionElapsedNs:String(r.inside)}))),
        next:accepted,total,pagesAccepted:pages,snapshotComplete:page.snapshotComplete,clockDomain:'SERVICE_CHILD_LOCAL',
        rawIdentifiersIncluded:false,nativeEventsAuthenticated:false,authority:'NONE'});
    }catch{hold('DECLARED_WINDOW_TRACE_PAGE_REJECTED');throw problem();}
  });
  const finalize=F(function finalize() {
    if(arguments.length!==0){if(final===null)hold('FINALIZE_ARITY');fail();}
    if(final!==null)return final;
    const completed=cohort.finalize();
    if(!['COMPLETE_DECLARED_TRACE_DATA','EMPTY_DECLARED_TRACE_DATA'].includes(completed.status))hold('DECLARED_COHORT_TRACE_INCOMPLETE');
    final=F({capacityWindowWriterTraceDataVersion:1,status:held?'INCOMPLETE_DECLARED_WINDOW_TRACE_DATA':'COMPLETE_DECLARED_WINDOW_TRACE_DATA',
      reason,pagesAccepted:pages,acceptedIntervals:accepted,declaredIntervals:total,cohortTraceStatus:completed.status,
      matchedCompletedOriginals:completed.matchedCompletedOriginals,clockDomain:'SERVICE_CHILD_LOCAL',declaredWindowElapsedNs:elapsed,
      cohorts:F(Object.fromEntries(COHORTS.map(name=>[name,F(Object.fromEntries(CLASSES.map(kind=>{
        const s=samples[name][kind];return [kind,F({writerIntervals:s.bracket.length,changedIntervals:s.changed,
          metricsStatus:held?'WITHHELD_INCOMPLETE_TRACE_DATA':s.bracket.length?'WHOLE_DECLARED_BRACKETS_NOT_PURE_SQL':'NO_MATCHED_SAMPLES',
          writerBracketNs:summary(s.bracket,held),insideWriterTransactionNs:summary(s.inside,held)})];
      })))]))),
      boundaryEqualityPolicy:'CONTACTS_SEPARATE_NO_SUB_NANOSECOND_ORDER_INFERRED',
      wholeIntervalsNotClipped:true,rawIdentifiersIncluded:false,parentAndChildClocksSubtracted:false,
      nativeEventsAuthenticated:false,nativeResourcesQualified:false,measurementWindowIsolationQualified:false,
      pureSqlLatencyQualified:false,sustainableCapacityQualified:false,authority:'NONE'});
    for(const name of COHORTS)for(const kind of CLASSES){samples[name][kind].bracket.length=0;samples[name][kind].inside.length=0;}
    return final;
  });
  const inspect=F(function inspect() {
    if(arguments.length!==0)fail();
    const inner=cohort.inspect();
    return F({phase:final!==null?'FINALIZED':held?'HELD':pages?'READING':'CREATED',held,reason,pagesAccepted:pages,
      acceptedIntervals:accepted,declaredIntervals:total,recordLimit:inner.recordLimit,pageLimit:inner.pageLimit,
      retainedDurationReferences:inner.retainedDurationReferences+COHORTS.reduce((n,name)=>n+CLASSES.reduce((m,kind)=>
        m+samples[name][kind].bracket.length+samples[name][kind].inside.length,0),0),
      retainedCommandReferences:inner.retainedCommandReferences,rawIdentityContextRetained:false,nativeEventsAuthenticated:false,authority:'NONE'});
  });
  return F({append,finalize,inspect});
}
function summary(values,withheld) {
  if(!values.length||withheld)return F({samples:values.length,min:null,p50:null,p95:null,p99:null,max:null});
  // The owner exclusively owns these arrays and clears them after finalization.
  const v=values.sort((a,b)=>a<b?-1:a>b?1:0),rank=p=>String(v[Math.ceil(v.length*p/100)-1]);
  return F({samples:v.length,min:String(v[0]),p50:rank(50),p95:rank(95),p99:rank(99),max:String(v.at(-1))});
}
function ns(value){if(typeof value!=='string'||!/^(?:0|[1-9][0-9]{0,38})$/.test(value))fail();
  const n=BigInt(value);if(n>=MAX_NS)fail();return n;}
function integer(v,min,max){if(!Number.isSafeInteger(v)||Object.is(v,-0)||v<min||v>max)fail();}
function exact(v,names){if(v===null||typeof v!=='object'||utilTypes.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype
    ||!Object.isFrozen(v)||Reflect.ownKeys(v).length!==names.length)fail();
  const out=Object.create(null);for(const name of names){const d=D(v,name);if(!d||!O(d,'value')||!d.enumerable)fail();out[name]=d.value;}return out;}
function problem(){const e=new TypeError('NATIVE_CAPACITY_WINDOW_TRACE_DATA_REJECTED');
  Object.defineProperty(e,'stack',{value:'TypeError: NATIVE_CAPACITY_WINDOW_TRACE_DATA_REJECTED'});return F(e);}
function fail(){throw problem();}

