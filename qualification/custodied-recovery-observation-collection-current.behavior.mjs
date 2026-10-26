import test from 'node:test';
import { equal as q, deepEqual as same, notEqual as ne, ok, throws } from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/* Current source-bound selection. Two preserved pure component tests.
 * Real unchanged collection core and real pure planner; declared owned-read
 * interfaces only. No SQL runner import, store, root close or transport.
 * Internal counters are not Native SQL counts or additional authored tests.
 */
const SPECS = [["src/service-credit-custodied-recovery-observation-collection-core.js",8579,213,"36b7cece2d436cbfcac5f4299dd6bd30e5eede6ebb2ebe769ae7bf3a6f1a72b4"],["src/service-credit-custodied-recovery-collection-core.js",13794,306,"51d06da70ecccd0cf8b38d650367d1ae903ea86010a5ebeadb682af98e4b890b"],["src/service-credit-custodied-sequential-runner-core.js",15983,492,"044477cb1300453f10bacf070037db175d08deec1d488549b34a5cb92e6328bd"],["src/service-credit-original-request-custody-contract.js",15100,376,"483d20e90d78ba95a8c5d5458dd201910e8d42aecbdc0dc03812e7044a464054"],["src/service-credit-pilot-client-plan.js",7483,181,"73ee3d739de85150039e733234cd0761c228d68de040d1e126902e808a259ac6"],["src/service-credit-pilot-status-view.js",3202,60,"cf3822d8b9ec4eb4772452ed1888b96d398fd87c1ead44cd155a5acc1a6b66ed"],["package.json",2677,40,"cb4364b57d7918682d68dd00b10a5c35c26ec6af2118a0d70353df2f3324c65f"],["src/service-credit-custodied-sqlite-sequential-runner.js",24572,560,"3448e5ee1c8408d47aa6ecdce9c7e133ee6515ba9ca929476ab5f433fb8f847d"]];
const checked = new Map();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
for (const [path, length, LF, digest] of SPECS) {
  const url = new URL('../' + path, import.meta.url), raw = readFileSync(url);
  q(raw.length, length); q(sha(raw), digest);
  const text = raw.toString('utf8');
  q(/[^\x00-\x7f]/.test(text), false); q(Buffer.byteLength(text), length);
  ok(text.endsWith('\n')); q(text.split('\n').length - 1, LF);
  checked.set(path, { url: url.href, text });
}
q(checked.size, 8);
q(JSON.parse(checked.get('package.json').text).type, 'module');
// Current owned runner is pinned source DATA only; it is never imported or evaluated.
const rootData=checked.get('src/service-credit-custodied-sqlite-sequential-runner.js').text;
for(const required of [
 'const CREATE_COLLECTION = createServiceCreditCustodiedRecoveryCollectionCore;',
 'const CREATE_OBSERVATION_COLLECTION = createServiceCreditCustodiedRecoveryObservationCollectionCore;',
 'readCatalog: ROOT_READ_RECOVERY_KEYS,',
 'createStatePlan: createOriginalRecoveryStatePlan,',
 'createOriginalRecoveryCollection: FREEZE(createOriginalRecoveryCollection),',
 'createOriginalRecoveryObservationCollection: FREEZE(createOriginalRecoveryObservationCollection),',
]) ok(rootData.includes(required));
const load = path => import(checked.get(path).url);
const { createServiceCreditCustodiedRecoveryObservationCollectionCore: CREATE } =
  await load('src/service-credit-custodied-recovery-observation-collection-core.js');
const C = await load('src/service-credit-original-request-custody-contract.js');
const { createServiceCreditPilotClientPlan: PLAN } = await load('src/service-credit-pilot-client-plan.js');

const F = Object.freeze;
const GRANT = 'grant.observation', HASH = 'a'.repeat(64);
const FUNDING = 'https://recovery.invalid/funding';
const SERVICE = 'https://recovery.invalid/service-credit/v1/execute';
const EMPTY = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const PREFIX = 'SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_';
const FLAGS = ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed'];
function deep(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deep(child);
    F(value);
  }
  return value;
}
function assertFrozenData(value) {
  if (value === null || typeof value !== 'object') {
    q(typeof value === 'function', false); return;
  }
  ok(Object.isFrozen(value));
  for (const d of Object.values(Object.getOwnPropertyDescriptors(value))) {
    ok(Object.hasOwn(d,'value')); q(d.writable,false); q(d.configurable,false);
    assertFrozenData(d.value);
  }
}
function original(requestId) {
  return C.captureOriginalServiceRequestCustody({
    originalRequestJson: JSON.stringify({ modelVersion:1,grantId:GRANT,requestId,
      method:'POST',routeId:'service-credit.execute.v1',canonicalBodyDigest:EMPTY,
      selectedContentType:'application/json',maxCostUnits:7 }),
    originalBodyBase64:'',serviceResourceUrl:SERVICE,
  }, { fundingResourceUrl:FUNDING,paymentHash:HASH,network:'zenon:declared' });
}
const ORIGINALS = F([original('request.a'),original('request.b')]);
const KEYS = F(ORIGINALS.map(o=>F({grantId:o.grantId,requestId:o.requestId})));
const INTENT = C.captureOriginalServiceDispatchIntent(ORIGINALS[0], {
  fundingRevision:3,challengeDigest:'sha256:'+'b'.repeat(64),
  paymentDigest:'sha256:'+'c'.repeat(64),
  custodyPolicy:{policyVersion:1,maxRequests:2,serviceResourceUrl:SERVICE},
});
const ENVELOPES = ORIGINALS.map(o=>C.serializeOriginalServiceRequestCustody(o));
const INTENT_JSON = C.serializeOriginalServiceDispatchIntent(INTENT);
function observation(index, success=false) {
  return JSON.stringify({viewVersion:1,paymentHash:HASH,requestId:KEYS[index].requestId,
    fundingStatus:success?'INCLUDED':'UNKNOWN',serviceStatus:success?'SUCCEEDED':'OUTCOME_UNKNOWN'});
}
function input() {
  return JSON.stringify(KEYS.map((key,index)=>({...key,observationJson:observation(index)})));
}
const known = suffix => error => error instanceof TypeError && Object.isFrozen(error)
  && error.code===PREFIX+suffix && error.message===PREFIX+suffix
  && error.stack==='TypeError: '+PREFIX+suffix;
function caught(fn,predicate) {
  let error; try { fn(); } catch (value) { error=value; }
  ok(predicate(error)); return error;
}
function unit() {
  const fault = new Error('DECLARED_OWNED_READ_FAULT');
  Object.defineProperty(fault,'stack',{value:'Error: DECLARED_OWNED_READ_FAULT'});
  const e = { catalog:0,creates:0,gets:0,observes:0,ownedReads:0,closes:0,
    rootCloses:0,requestCalls:0,children:[],observedKeys:[],planners:[],
    observeFault:-1,getFault:-1,closeFault:-1,afterObserveFault:false,fault:F(fault),
    funding:deep({revision:3,status:'BOUND',ambiguityLatched:false,
      fundingResourceUrl:FUNDING,paymentHash:HASH,network:'zenon:declared'}),
    uncertainty:deep({custody:false,submission:false,undrained:false,declaredFundingAmbiguitySeen:false}) };
  e.readCatalog = () => {
    e.catalog++;
    return deep({grantId:GRANT,keys:KEYS,funding:e.funding,uncertainty:e.uncertainty,
      evidence:'LOCAL_STORE_DECLARED_RECOVERY_KEYS',qualification:'UNQUALIFIED',authority:'NONE',
      serviceOutcome:'NOT_ESTABLISHED',mayStartPayment:false,maySignPayment:false,
      mayDispatchService:false,deliveryConfirmed:false});
  };
  e.createStatePlan = (key,json) => {
    const index=e.creates++; same(key,KEYS[index]);
    const declared=PLAN(JSON.stringify({viewVersion:1,paymentHash:HASH,requestId:key.requestId}),json);
    e.planners.push(declared);
    const child={observed:false,closed:false,closes:0}; e.children.push(child);
    function owned(phase) {
      e.ownedReads++;
      if ((phase==='get'&&e.getFault===index)||(phase==='observe'&&e.observeFault===index)) throw e.fault;
      child.observed=child.observed||e.funding.status==='OUTCOME_UNKNOWN';
      const intent=index===0?INTENT:null;
      return deep({original:ORIGINALS[index],funding:e.funding,uncertainty:e.uncertainty,
        dispatchIntent:intent,dispatchStatus:intent===null?'NO_INTENT_RECORDED':'POSSIBLY_ATTEMPTED',
        evidence:'LOCAL_STORE_DECLARED_RECOVERY_STATE',qualification:'UNQUALIFIED',authority:'NONE',
        serviceOutcome:'NOT_ESTABLISHED'});
    }
    function view(state,declaredPlan) {
      return deep({recoveryState:state,declaredPlan,
        currentFundingUncertain:state.funding.status==='OUTCOME_UNKNOWN',
        observedFundingUncertain:child.observed,closed:false,
        nextStep:state.dispatchIntent===null?'REVIEW_CURRENT_AUTHORITY_FOR_ORIGINAL':'RECONCILIATION_REQUIRED',
        evidence:'OWNED_LOCAL_RECOVERY_BOUND_PLAN',qualification:'UNQUALIFIED',authority:'NONE',
        mayStartPayment:false,maySignPayment:false,mayDispatchService:false,deliveryConfirmed:false});
    }
    function getSnapshot() { e.gets++; return view(owned('get'),declared.getSnapshot()); }
    function observe(json) {
      q(arguments.length,1); e.observes++; e.observedKeys.push(key.requestId);
      const state=owned('observe'), next=declared.observe(json);
      if(e.afterObserveFault) e.getFault=1;
      return view(state,next);
    }
    function close() {
      q(child.closed,false); child.closed=true; child.closes++; e.closes++;
      if(e.closeFault===index) throw e.fault;
      return declared.close();
    }
    return F({observe:F(observe),getSnapshot:F(getSnapshot),close:F(close)});
  };
  e.config={readCatalog:e.readCatalog,createStatePlan:e.createStatePlan,selectedGrantId:GRANT};
  return e;
}
function vector(e) { return [e.catalog,e.creates,e.gets,e.observes,e.ownedReads,e.closes,e.rootCloses,e.requestCalls]; }
function open(e) {
  const c=CREATE(e.config,input());
  same(Object.keys(c),['observeOriginal','getSnapshot','close']); ok(Object.isFrozen(c));
  for(const fn of Object.values(c)) ok(Object.isFrozen(fn));
  same(vector(e),[4,2,4,0,4,0,0,0]); return c;
}
function flags(value) {
  assertFrozenData(value);
  q(value.collectionVersion,1); q(value.observationCollectionVersion,1);
  q(value.qualification,'UNQUALIFIED'); q(value.authority,'NONE');
  for(const flag of FLAGS) q(value[flag],false);
  same(value.keys,KEYS); q(value.entries.length,2);
  value.entries.forEach((entry,index)=>{
    same(entry.key,KEYS[index]);
    q(C.serializeOriginalServiceRequestCustody(entry.recoveryPlan.recoveryState.original),ENVELOPES[index]);
    const intent=entry.recoveryPlan.recoveryState.dispatchIntent;
    q(intent===null?null:C.serializeOriginalServiceDispatchIntent(intent),index===0?INTENT_JSON:null);
    for(const node of [entry.recoveryPlan,entry.recoveryPlan.declaredPlan,entry.recoveryPlan.declaredPlan.view]) {
      for(const flag of FLAGS) q(node[flag],false);
    }
    q(entry.recoveryPlan.authority,'NONE');
    q(entry.recoveryPlan.recoveryState.authority,'NONE');
    q(entry.recoveryPlan.declaredPlan.authorization,'NONE');
  });
}
function detach(e,c,before,expected,kind,unknown=false) {
  const reads=vector(e),history=c.close(); flags(history);
  q(history.closed,true); q(history.snapshotKind,'DETACHED_HISTORICAL');
  q(history.nextStep,'LOCALLY_CLOSED'); q(history.entries,before.entries);
  q(history.funding,before.funding); q(history.uncertainty,before.uncertainty);
  q(history.observationFailureKind,kind); q(history.childCloseAttempts,2);
  q(history.childCloseOutcome,unknown?'UNKNOWN':'RETURNED');
  q(history.observationCloseOutcome,'RETURNED');
  q(c.close(),history); q(c.getSnapshot(),history);
  q(e.catalog,reads[0]); q(e.gets,reads[2]); q(e.ownedReads,reads[4]);
  same(vector(e),expected);
  for(const child of e.children){q(child.closed,true);q(child.closes,1);}
  q(e.rootCloses,0);q(e.requestCalls,0);
  throws(()=>c.close(undefined),known('INVALID_INPUT'));
  throws(()=>c.getSnapshot(undefined),known('INVALID_INPUT'));
  throws(()=>c.observeOriginal(),known('INVALID_INPUT'));
  throws(()=>c.observeOriginal(KEYS[0],observation(0,true)),
    known('RECOVERY_OBSERVATION_COLLECTION_CLOSED'));
  same(vector(e),expected);
  return history;
}

test('observation collection updates one declared member and detaches complete powerless history',
  () => {
    const e=unit(),c=open(e),before=c.getSnapshot(); flags(before);
    same(vector(e),[6,2,6,0,6,0,0,0]);
    const text=observation(0,true),after=c.observeOriginal({...KEYS[0]},text);
    flags(after); ne(after,before); q(after.unavailable,false);
    q(after.snapshotKind,'COMPLETE_OWNED_READ'); q(after.observationFailureKind,'NONE');
    q(after.entries[0].recoveryPlan.declaredPlan.observationJson,text);
    q(after.entries[1].recoveryPlan.declaredPlan,before.entries[1].recoveryPlan.declaredPlan);
    same(e.observedKeys,[KEYS[0].requestId]);
    same(vector(e),[10,2,10,1,11,0,0,0]);
    q(after.funding,before.funding); q(after.uncertainty,before.uncertainty);
    q(after.currentFundingUncertain,false); q(after.observedFundingUncertain,false);
    q(after.entries[0].recoveryPlan.declaredPlan.fundingUncertain,true);
    q(after.entries[0].recoveryPlan.declaredPlan.serviceUncertain,true);
    q(after.nextStep,'RECONCILIATION_REQUIRED');
    const history=detach(e,c,after,[10,2,10,1,11,2,0,0],'NONE');
    q(history.unavailable,false);q(history.failureKind,'NONE');
    q(history.underlyingUnavailable,false);q(history.underlyingFailureKind,'NONE');
  });

test('observation collection rejects wrong keys and latches only complete history across live faults',
  () => {
    // Internal declared controls below are two fault phases, not extra tests or SQL cases.
    for(const phase of ['observe','post-refresh']) {
      const e=unit(),c=open(e),before=c.getSnapshot(); flags(before);
      const count=vector(e);
      for(const [key,code] of [
        [null,'INVALID_INPUT'],[{...KEYS[0],extra:true},'INVALID_INPUT'],
        [{grantId:'grant.foreign',requestId:KEYS[0].requestId},'RECOVERY_OBSERVATION_COLLECTION_MEMBER_NOT_FOUND'],
        [{grantId:GRANT,requestId:'request.unknown'},'RECOVERY_OBSERVATION_COLLECTION_MEMBER_NOT_FOUND'],
      ]) throws(()=>c.observeOriginal(key,observation(0,true)),known(code));
      throws(()=>c.observeOriginal(KEYS[0]),known('INVALID_INPUT'));
      same(vector(e),count); same(e.observedKeys,[]);
      if(phase==='observe') e.observeFault=0;
      else {e.afterObserveFault=true;e.closeFault=1;}
      caught(()=>c.observeOriginal(KEYS[0],observation(0,true)),error=>error===e.fault);
      const expected=phase==='observe'?[8,2,8,1,9,0,0,0]:[9,2,10,1,11,0,0,0];
      same(vector(e),expected); same(e.observedKeys,[KEYS[0].requestId]);
      throws(()=>c.getSnapshot(),known('RECOVERY_OBSERVATION_COLLECTION_UNAVAILABLE'));
      throws(()=>c.observeOriginal(KEYS[1],observation(1,true)),
        known('RECOVERY_OBSERVATION_COLLECTION_UNAVAILABLE'));
      throws(()=>c.observeOriginal(null,observation(0,true)),known('INVALID_INPUT'));
      same(vector(e),expected);
      // A successful child change is not a published partial collection.
      if(phase==='post-refresh') {
        q(e.planners[0].getSnapshot().observationJson,observation(0,true));
        q(before.entries[0].recoveryPlan.declaredPlan.observationJson,observation(0));
      }
      const final=[...expected];final[5]=2;
      const history=detach(e,c,before,final,
        phase==='observe'?'OBSERVE_FAILED':'POST_OBSERVE_REFRESH_FAILED',phase==='post-refresh');
      q(history.unavailable,true);
      if(phase==='observe') {
        q(history.failureKind,'LIVE_OBSERVATION_FAILED');
        q(history.underlyingUnavailable,false);q(history.underlyingFailureKind,'NONE');
      } else {
        q(history.failureKind,'LOCAL_CLOSE_UNKNOWN');
        q(history.underlyingUnavailable,true);q(history.underlyingFailureKind,'LOCAL_CLOSE_UNKNOWN');
      }
    }
  });
