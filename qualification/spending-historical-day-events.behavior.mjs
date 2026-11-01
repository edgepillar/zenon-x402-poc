// Actual spending DATA validator and journal; only declared memory CAS ports.
// No SDK/core/SQLite, files, sockets, keys/signatures, nonce or native owner.
import assert from 'node:assert/strict';
import { captureOriginalFundingSpendingPolicy, inspectOriginalFundingSpendingState,
  createOriginalFundingSpendingReservations } from '../src/original-funding-spending-reservations.js';
const F=Object.freeze,DAY_MAX=2147483647,MAX=(1n<<255n)-1n,checks=[];
let referenceCells=0,referenceVectors=0;
function check(id,run){checks.push({id,run});}
function row(i,start,end,amount='1',status=end===null?'UNKNOWN':'SPENT'){
 return {paymentId:'payment.synthetic.'+i,originalDigest:'sha256:'+BigInt(i+1).toString(16).padStart(64,'0'),
  network:'zenon:testnet',asset:'asset.synthetic',recipient:'recipient.synthetic',amount,reservedDay:start,status,spentDay:end};
}
function fixture(rows,{daily='10',total='1000000',payment='1',lastDay=null,revision=1}={}){
 const policy={version:1,policyId:'historical.daily.synthetic',accountId:'payer.synthetic',network:'zenon:testnet',asset:'asset.synthetic',
  recipients:['recipient.synthetic'],maxPayment:payment,maxTotal:total,maxDaily:daily,maxRecords:1024};
 const last=lastDay??Math.max(0,...rows.flatMap(r=>[r.reservedDay,r.spentDay??0]));
 const state={version:1,policy,revision,lastDay:last,reservations:rows};
 return {policy,state,raw:JSON.stringify(state)};
}
// Independent reference: count each original over its closed admission/spend
// interval. RESERVED/UNKNOWN has no end. Never derive expectations from output.
function reference(f){
 referenceVectors++;const r=f.state.reservations,cap=BigInt(f.policy.maxDaily);
 const points=new Set([f.state.lastDay,...r.flatMap(x=>x.spentDay===null?[x.reservedDay]:[x.reservedDay,x.spentDay])]);
 let lifetime=0n;for(const x of r)lifetime+=BigInt(x.amount);
 if(lifetime>BigInt(f.policy.maxTotal))return false;
 for(const d of points){let exposure=0n;for(const x of r){referenceCells++;
  if(x.reservedDay<=d&&(x.spentDay===null||x.spentDay>=d))exposure+=BigInt(x.amount);
 }if(exposure>cap)return false;}
 return true;
}
function agrees(f,expected){
 const before=f.raw,policyBefore=JSON.stringify(f.policy),allowed=reference(f);if(expected!==undefined)assert.equal(allowed,expected);
 let value=null,error=null;try{value=inspectOriginalFundingSpendingState(f.raw,f.policy);}catch(e){error=e;}
 assert.equal(error===null,allowed);assert.equal(f.raw,before);assert.equal(JSON.stringify(f.policy),policyBefore);
 if(allowed){assert.equal(JSON.stringify(value),before);assert.ok(Object.isFrozen(value)&&Object.isFrozen(value.reservations));
  assert.ok(value.reservations.every(Object.isFrozen));}
 return value;
}
function memory(initial){let raw=initial,writes=0;return {read:()=>raw,writes:()=>writes,
 backend:F({load:()=>raw,compareAndSwap:(account,expected,proposed)=>{assert.equal(account,'payer.synthetic');if(raw!==expected)return null;raw=proposed;writes++;return proposed;}})};}

check('historical-zero-length-spend-is-charged-on-its-own-day',()=>{
 agrees(fixture([row(0,7,7,'5')],{payment:'5',daily:'5'}),true);
});
check('historical-spent-day-and-new-reserve-on-the-same-day-overlap',()=>{
 agrees(fixture([row(0,2,7,'5'),row(1,7,8,'1')],{payment:'5',daily:'5',lastDay:10}),false);
});
check('historical-release-after-previous-day-permits-next-day-admission',()=>{
 agrees(fixture([row(0,2,7,'5'),row(1,8,8,'5')],{payment:'5',daily:'5',lastDay:10}),true);
});
check('historical-all-starts-on-a-day-count-before-any-same-day-release',()=>{
 agrees(fixture([row(0,1,5,'5'),row(1,5,5,'5'),row(2,5,5,'1')],{payment:'5',daily:'10',lastDay:9}),false);
});
check('historical-multiple-ends-and-starts-are-aggregated-with-closed-interval-semantics',()=>{
 agrees(fixture([row(0,0,1,'2'),row(1,0,1,'3'),row(2,1,2,'5')],{payment:'5',daily:'10'}),true);
});
check('historical-unknown-original-carries-across-every-later-day',()=>{
 agrees(fixture([row(0,1,null,'5'),row(1,100,100,'1')],{payment:'5',daily:'5'}),false);
});
check('historical-reserved-original-carries-without-expiry-or-release',()=>{
 agrees(fixture([row(0,1,null,'5','RESERVED'),row(1,100,100,'1')],{payment:'5',daily:'5'}),false);
});
check('historical-early-overage-is-refused-even-when-current-daily-exposure-is-zero',()=>{
 agrees(fixture([row(0,1,1,'5'),row(1,1,1,'1')],{payment:'5',daily:'5',lastDay:100}),false);
});
check('historical-nested-intervals-retain-their-peak-overlap',()=>{
 agrees(fixture([row(0,0,20,'4'),row(1,2,18,'3'),row(2,4,16,'2'),row(3,6,14,'1')],{payment:'4',daily:'10'}),true);
 agrees(fixture([row(0,0,20,'4'),row(1,2,18,'3'),row(2,4,16,'2'),row(3,6,14,'2')],{payment:'4',daily:'10',lastDay:30}),false);
});
check('historical-input-row-order-does-not-change-acceptance-or-returned-bytes',()=>{
 const rows=[row(0,3,3,'5'),row(1,0,1,'5'),row(2,4,4,'5')];
 for(const order of [rows,[...rows].reverse(),[rows[1],rows[2],rows[0]]])agrees(fixture(order,{payment:'5',daily:'5'}),true);
});
check('historical-day-zero-keeps-its-start-and-spend-in-the-same-charge',()=>{
 agrees(fixture([row(0,0,0),row(1,1,1)],{daily:'1'}),true);
 agrees(fixture([row(0,0,0),row(1,0,0)],{daily:'1',lastDay:1}),false);
});
check('historical-maximum-supported-day-does-not-need-a-successor-day',()=>{
 agrees(fixture([row(0,DAY_MAX-1,DAY_MAX-1),row(1,DAY_MAX,DAY_MAX)],{daily:'1'}),true);
 agrees(fixture([row(0,DAY_MAX-1,DAY_MAX),row(1,DAY_MAX,DAY_MAX)],{daily:'1'}),false);
});
check('historical-full-1024-record-profile-validates-disjoint-intervals',()=>{
 agrees(fixture(Array.from({length:1024},(_,i)=>row(i,2*i,2*i+1)),{daily:'1'}),true);
});
check('historical-full-profile-cannot-hide-an-earlier-overlapping-payment',()=>{
 const rows=Array.from({length:1024},(_,i)=>row(i,2*i,2*i));rows[1]=row(1,0,0);
 agrees(fixture(rows,{daily:'1',lastDay:4096}),false);
});
check('historical-full-profile-keeps-all-unresolved-exposure-reserved',()=>{
 const rows=Array.from({length:1024},(_,i)=>row(i,i,null,'1',i%2?'UNKNOWN':'RESERVED'));
 agrees(fixture(rows,{daily:'1024',lastDay:DAY_MAX}),true);
});
check('historical-decimal-exposure-above-number-precision-remains-exact',()=>{
 const v=9007199254740993n;
 agrees(fixture([row(0,0,2,String(v)),row(1,2,3,String(v))],{payment:String(v),daily:String(2n*v),total:String(3n*v)}),true);
 agrees(fixture([row(0,0,2,String(v)),row(1,2,3,String(v))],{payment:String(v),daily:String(2n*v-1n),total:String(3n*v),lastDay:10}),false);
});
check('historical-255-bit-budget-comparisons-do-not-round-or-overflow',()=>{
 const v=MAX/4n,rows=[row(0,0,3,String(v)),row(1,3,6,String(v)),row(2,6,9,String(v))];
 agrees(fixture(rows,{payment:String(v),daily:String(2n*v),total:String(MAX)}),true);
 agrees(fixture(rows,{payment:String(v),daily:String(2n*v-1n),total:String(MAX),lastDay:12}),false);
});
check('historical-lifetime-limit-is-independent-of-disjoint-daily-intervals',()=>{
 agrees(fixture([row(0,0,0,'5'),row(1,1,1,'5')],{payment:'5',daily:'5',total:'9'}),false);
});
check('historical-deterministic-interval-matrix-matches-an-independent-reference',()=>{
 let seed=0x472901;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 for(let k=0;k<96;k++){
  const count=8+next()%41,rows=[];for(let i=0;i<count;i++){
   const start=next()%31,kind=next()%5,end=kind<2?null:start+next()%21;
   rows.push(row(i,start,end,String(1+next()%3),end===null?(kind?'UNKNOWN':'RESERVED'):'SPENT'));
  }
  agrees(fixture(rows,{payment:'3',daily:String(3+next()%80),total:'1000',lastDay:60}));
 }
});
check('historical-reopen-check-is-read-only-and-preserves-the-canonical-record',()=>{
 const f=fixture([row(0,0,1,'5'),row(1,2,3,'5')],{payment:'5',daily:'5'}),db=memory(f.raw);
 const s=createOriginalFundingSpendingReservations(f.policy,db.backend);assert.equal(db.writes(),0);assert.equal(db.read(),f.raw);
 assert.equal(s.inspect(4).totalExposure,'10');assert.equal(s.inspect(4).dailyExposure,'0');s.close();assert.equal(db.read(),f.raw);
});
check('historical-reopen-rejects-a-past-overage-before-any-cas-write',()=>{
 const f=fixture([row(0,0,0,'5'),row(1,0,0,'1')],{payment:'5',daily:'5',lastDay:10}),db=memory(f.raw);
 assert.throws(()=>createOriginalFundingSpendingReservations(f.policy,db.backend));assert.equal(db.writes(),0);assert.equal(db.read(),f.raw);
});
check('historical-unknown-reopen-cannot-free-the-next-day-budget',()=>{
 const f=fixture([row(0,0,null,'5')],{payment:'5',daily:'5',lastDay:10}),db=memory(f.raw),s=createOriginalFundingSpendingReservations(f.policy,db.backend);
 const r=row(1,11,null,'1');const {paymentId,originalDigest,network,asset,recipient,amount}=r;
 assert.throws(()=>s.reserve({paymentId,originalDigest,network,asset,recipient,amount},11));assert.equal(db.writes(),0);assert.equal(db.read(),f.raw);s.close();
});
check('historical-single-original-reopen-retains-the-unresolved-owner-stop',()=>{
 const f=fixture([row(0,0,null,'1')],{daily:'5',lastDay:10}),db=memory(f.raw),s=createOriginalFundingSpendingReservations(f.policy,db.backend);
 const {paymentId,originalDigest,network,asset,recipient,amount}=row(1,11,null,'1');
 assert.throws(()=>s.reserveSingleOriginal({paymentId,originalDigest,network,asset,recipient,amount},11));
 assert.equal(s.snapshot().held,true);assert.equal(db.writes(),0);assert.equal(db.read(),f.raw);s.close();
});
check('historical-codec-retains-its-existing-day-amount-and-byte-admission',()=>{
 const f=fixture([row(0,0,0)]);for(const change of [v=>v.lastDay=-1,v=>v.reservations[0].amount='01',v=>v.reservations[0].spentDay=-1]){
  const value=JSON.parse(f.raw);change(value);assert.throws(()=>inspectOriginalFundingSpendingState(JSON.stringify(value),f.policy));
 }
 assert.throws(()=>inspectOriginalFundingSpendingState(f.raw+' ',f.policy));assert.throws(()=>captureOriginalFundingSpendingPolicy({...f.policy,maxDaily:'0'}));
});

const cases=[];for(const {id,run}of checks){try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',errorType:e?.name??'UNKNOWN'});}}
assert.ok(referenceVectors<=140&&referenceCells<=8000000);
const failed=cases.filter(c=>c.status!=='PASS').length;
process.stdout.write(JSON.stringify({qualification:'G1_SPENDING_HISTORICAL_DAY_EVENTS_DATA',passed:cases.length-failed,failed,cases,
 referenceVectors,referenceCells,maximumRecordsExercised:1024,scope:'ACTUAL_DATA_VALIDATOR_WITH_INDEPENDENT_CLOSED_INTERVAL_REFERENCE',
 nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0})+'\n');
if(failed)process.exitCode=1;
