// Actual pure comparison used by the journal CAS. Journal persistence, SDK,
// chain authentication and native compare/readback are not executed here.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { captureJournalMomentumConfirmationAdvance as advance } from '../src/journal-momentum-confirmation-advance.js';

const checks=[],F=Object.freeze;
function check(id,run){checks.push({id,run});}
function detail(count=1){return {numConfirmations:count,momentumHeight:12,momentumHash:'a'.repeat(64),momentumTimestamp:1000};}

check('journal-confirmation-comparison-advances-original-one-to-three',()=>{assert.deepEqual(advance(detail(1),detail(3)),{changed:true,numConfirmations:3});});
check('journal-confirmation-comparison-allows-stronger-count-with-same-inclusion',()=>{assert.deepEqual(advance(detail(3),detail(100)),{changed:true,numConfirmations:100});});
check('journal-confirmation-comparison-identical-detail-is-idempotent',()=>{assert.deepEqual(advance(detail(3),detail(3)),{changed:false,numConfirmations:3});});
check('journal-confirmation-comparison-admits-safe-integer-upper-bound',()=>{assert.deepEqual(advance(detail(Number.MAX_SAFE_INTEGER-1),detail(Number.MAX_SAFE_INTEGER)),{changed:true,numConfirmations:Number.MAX_SAFE_INTEGER});});
check('journal-confirmation-comparison-refuses-count-regression',()=>{assert.throws(()=>advance(detail(3),detail(1)));});
check('journal-confirmation-comparison-refuses-different-momentum-hash',()=>{assert.throws(()=>advance(detail(1),{...detail(3),momentumHash:'b'.repeat(64)}));assert.throws(()=>advance(detail(3),{...detail(3),momentumHash:'b'.repeat(64)}));});
check('journal-confirmation-comparison-refuses-different-momentum-height',()=>{assert.throws(()=>advance(detail(1),{...detail(3),momentumHeight:13}));});
check('journal-confirmation-comparison-refuses-different-momentum-timestamp',()=>{assert.throws(()=>advance(detail(1),{...detail(3),momentumTimestamp:1001}));});
check('journal-confirmation-comparison-count-must-be-positive-safe-integer',()=>{for(const n of [0,-0,-1,1.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1,'3',null]){assert.throws(()=>advance(detail(n),detail(3)));assert.throws(()=>advance(detail(1),detail(n)));}});
check('journal-confirmation-comparison-height-must-be-positive-safe-integer',()=>{for(const n of [0,-0,-1,1.5,Infinity,Number.MAX_SAFE_INTEGER+1,'12'])assert.throws(()=>advance({...detail(),momentumHeight:n},{...detail(3),momentumHeight:n}));});
check('journal-confirmation-comparison-timestamp-allows-zero-but-refuses-unsafe-values',()=>{assert.equal(advance({...detail(),momentumTimestamp:0},{...detail(3),momentumTimestamp:0}).changed,true);for(const n of [-0,-1,1.5,Infinity,Number.MAX_SAFE_INTEGER+1,'1000'])assert.throws(()=>advance({...detail(),momentumTimestamp:n},{...detail(3),momentumTimestamp:n}));});
check('journal-confirmation-comparison-requires-canonical-lowercase-hash',()=>{for(const h of ['A'.repeat(64),'a'.repeat(63),'a'.repeat(65),'g'.repeat(64),'',null,1])assert.throws(()=>advance({...detail(),momentumHash:h},{...detail(3),momentumHash:h}));});
check('journal-confirmation-comparison-never-mutates-either-input-and-freezes-result',()=>{const a=F(detail()),b=F(detail(3)),beforeA=JSON.stringify(a),beforeB=JSON.stringify(b),r=advance(a,b);assert.equal(JSON.stringify(a),beforeA);assert.equal(JSON.stringify(b),beforeB);assert.equal(Object.isFrozen(r),true);assert.throws(()=>{r.changed=false;});});
check('journal-confirmation-comparison-does-not-enter-accessor-or-proxy-hooks',()=>{let hooks=0;for(const side of [0,1]){const x=detail();Object.defineProperty(x,'numConfirmations',{enumerable:true,get(){hooks++;return 3;}});assert.throws(()=>advance(...(side===0?[x,detail(3)]:[detail(),x])));}const p=new Proxy(detail(),{get(){hooks++;},getPrototypeOf(){hooks++;}});assert.throws(()=>advance(p,detail(3)));assert.equal(hooks,0);});
check('journal-confirmation-comparison-refuses-extra-symbol-and-inherited-fields',()=>{const a=detail();a[Symbol('extra')]=true;assert.throws(()=>advance(a,detail(3)));assert.throws(()=>advance({...detail(),extra:true},detail(3)));const inherited=Object.create(detail());assert.throws(()=>advance(inherited,detail(3)));const nullPrototype=Object.assign(Object.create(null),detail());assert.throws(()=>advance(nullPrototype,detail(3)));});
check('journal-confirmation-comparison-rejects-arity-and-non-data-inputs',()=>{assert.throws(()=>advance(detail()));assert.throws(()=>advance(detail(),detail(3),true));for(const x of [null,undefined,[],true,1,'detail',()=>detail()])assert.throws(()=>advance(x,detail(3)));});

export const journalMomentumConfirmationAdvanceDataCases=F([...checks]);
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const cases=[];for(const c of checks){try{c.run();cases.push({id:c.id,status:'PASS'});}catch{cases.push({id:c.id,status:'FAIL',error:'DATA_ASSERTION'});}}
 const failed=cases.filter(c=>c.status==='FAIL').length;console.log(JSON.stringify({qualification:'G2_JOURNAL_MOMENTUM_CONFIRMATION_ADVANCE_DATA',passed:cases.length-failed,failed,cases,
  scope:'ACTUAL_PURE_COMPARISON;JOURNAL_CAS_SOURCE_AND_PARSER_ONLY',nativeExecutions:0,SDK:0,SQLite:0,sockets:0,signals:0,keys:0,signatures:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,journalIO:0,physicalRelease:'NOT_ESTABLISHED',nativeAcceptance:'NOT_ESTABLISHED'}));if(failed)process.exitCode=1;
}
