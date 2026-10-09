import test from 'node:test';
import a from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// Runs Node text checks; no app imports or TypeScript compiler.
const [D,H,P,R,V]=[
 new URL('../src/service-credit-pilot-client-plan.d.ts',import.meta.url),
 new URL('../src/service-credit-pilot-client-status-html.d.ts',import.meta.url),
 new URL('../src/service-credit-pilot-client-plan.js',import.meta.url),
 new URL('../src/service-credit-pilot-client-status-html.js',import.meta.url),
 new URL('../src/service-credit-pilot-status-view.d.ts',import.meta.url)
].map(p=>readFileSync(p,'utf8'));
const N='ServiceCreditPilotClient',S=N+'Snapshot';
const compact=s=>s.replace(/\/\/[^\n]*|\s/g,'');
const take=(s,r)=>{const m=s.match(r);a.ok(m);return m[1];};
function signature(src,n,result) {
 const m=src.match(/export function (\w+)\(([^)]*)\)/);
 a.ok(m); a.equal((src.match(/\bexport\b/g)||[]).length,1);
 const args=m[2].split(','); a.equal(args.length,n);
 return 'exportfunction'+m[1]+'('+args.map(x=>x+':string').join(',')+'):'+result+';';
}
function check(d=D,h=H) {
 const ctor=signature(P,2,N+'Plan');
 const render=signature(R,1,'string');
 const parts=take(P,/state=Object\.freeze\(\{([\s\S]*?)\n  \}\);/).split(',').map(x=>x.trim());
 const keys=parts.map(x=>x.split(':')[0]);
 a.equal(keys.length,16);
 const types=['string','string','string','string',
  'ServiceCreditPilotStatusView&Readonly<{paymentHash:string;requestId:string}>',
  'boolean','boolean',"'SUCCEEDED'|'CLOSED'|null",'boolean',N+'Step',
  "'UNQUALIFIED'","'NONE'",'false','false','false','false'];
 a.deepEqual(parts.slice(10).map(x=>x.split(':')[1]),types.slice(10));
 a.equal(parts[7],"terminal:state?.terminal??(s==='SUCCEEDED'||s==='CLOSED'?s:null)");
 const steps=[...new Set([...take(P,/const nextStep=([\s\S]*?);/).matchAll(/[?:]'([^']+)'/g)].map(m=>m[1])
  .concat(take(P,/nextStep:'([^']+)'/)))];
 a.equal(steps.length,11);
 const methods=[...P.matchAll(/^  (\w+)\(([^)]*)\) \{/gm)].map(m=>[m[1],m[2]]);
 a.deepEqual(methods,[['observe','o'],['getSnapshot',''],['close','']]);
 const expected="importtype{ServiceCreditPilotStatusView}from'./service-credit-pilot-status-view.js';"+
  'exporttype'+N+'Step='+steps.map(x=>"'"+x+"'").join('|')+';'+
  'exporttype'+S+'=Readonly<{'+keys.map((k,i)=>k+':'+types[i]+';').join('')+'}>;'+
  'exporttype'+N+'Plan=Readonly<{'+methods.map(([k,p])=>k+':('+(p?'observationJson:string':'')+')=>'+S+';').join('')+'}>;'+ctor;
 a.equal(compact(d),expected);
 a.equal(compact(h),render);
}
test('source/declaration correspondence',()=>{
 for(const s of [D,H,P,R,V]) a.ok(s.length<=4096&&s.endsWith('\n'));
 check();
});
test('nonnull DTO refinement',()=>{
 a.ok(P.includes('if(view.paymentHash===null||view.requestId===null)'));
 a.match(V,/export type ServiceCreditPilotStatusView = Readonly<\{/);
 for(const k of ['paymentHash','requestId']) a.ok(V.includes(k+': string | null;'));
});
test('diagnostic limits',()=>{
 for(const s of [D,H]) for(const t of ['UNCOMPILED','TS/type-resolution','Readonly is not native freeze',
  'history/custody/READY','restart/recovery',
  'no reset/signing/dispatch/payment','bytes/context stay external'])
  a.ok(s.includes(t));
});
