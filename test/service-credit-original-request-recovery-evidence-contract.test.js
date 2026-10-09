import t from 'node:test';
import a from 'node:assert/strict';
import{readFileSync as r}from'node:fs';
const f=JSON.parse(r(new URL('./fixtures/service-credit-original-request-recovery-evidence-v1.json',import.meta.url),'utf8'));
const P={source:'SYNTHETIC_DECLARED_DATA',qualification:'NOT_RUN',authority:'NONE'};
const S=['COMMITTED_SUCCESS','MAY_HAVE_STARTED/UNKNOWN'],Z=[0,0,0,0,0,0,0];
function m(u=0){
 const id=Object.keys(f.original).map((k,i)=>i<6?'SYNTHETIC_'+k:i<9?2:u?null:'SYNTHETIC_RESULT');
 return {u,p:{...P},proc:['A','B'],id,after:[...id],cache:u?null:[...id],s:S[u],e:[...Z]};
}
function c(x){
 a.notEqual(...x.proc);
 a.deepEqual(x,{...x,p:P,after:x.id,cache:x.u?null:x.id,s:S[x.u],e:Z});
 a.equal(x.id[9],x.u?null:'SYNTHETIC_RESULT');
}
const bad=x=>a.throws(()=>c(x));
t('unexecuted intents',()=>{
 a.deepEqual([f.schema,f.version,f.scope,f.qualification,f.authority],['CREDIT_PROCESS_RESTART_INTENTS',1,'SYNTHETIC_DECLARED_DATA','NOT_RUN','NONE']);
 a.deepEqual(f.intents,S);a.equal(f.UNQUALIFIED.length,8);
 a.equal(Object.keys(f.original).join(),'grantId,ledgerId,requestId,requestDigest,executionId,reservationId,cost,maxCost,chargedCost,resultCommitment');
 a.equal(Object.keys(f.evidence).join(),'process,custody,commit,cache,effects,counters');
 a.ok([...Object.values(f.original),...Object.values(f.evidence)].every(v=>v===null));
});
t('synthetic success',()=>c(m()));
t('synthetic uncertainty',()=>c(m(1)));
t('bindings',()=>{
 for(const field of ['after','cache'])for(let i=0;i<10;i++){
  const x=m();x[field][i]=i<6||i===9?'SYNTHETIC_CHANGED':3;bad(x);
 }
});
t('no effects or uncertainty upgrade',()=>{
 for(const u of [0,1])for(let i=0;i<7;i++){const x=m(u);x.e[i]=1;bad(x)}
 for(const s of [S[0],'UNKNOWN']){const x=m(1);x.s=s;bad(x)}
 const x=m(1);x.cache=[...x.id];bad(x);
 const y=m(1);y.id[9]=y.after[9]='FORGED';bad(y);
});
t('provenance/process',()=>{
 for(const k of ['source','qualification','authority','captured','restartProven','delivery']){
  const x=m();x.p[k]=true;bad(x);
 }
 const x=m();x.proc[1]=x.proc[0];bad(x);
});
