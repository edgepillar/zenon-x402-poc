// Unexecuted native harness entry: one fixed local HTTPS client per refusal.
// No SDK/core/SQL/key/signature/nonce/funding capability is imported or exposed.
import { readSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { createServiceCreditNativeHttpsClientTransport } from '../src/service-credit-native-https-client-transport.js';
import { captureApiCreditNegativeAcceptanceSelection,apiCreditNegativeAcceptancePlan,runApiCreditNegativeAcceptance } from './api-credit-linux-negative-contract.mjs';
import { collectApiCreditNegativeHttpReply } from './api-credit-linux-negative-reply.mjs';
const F=Object.freeze;
function fail(){throw new TypeError('API_CREDIT_LINUX_NEGATIVE_PROBE_UNKNOWN');}
try{
 if(process.versions.node!=='24.19.0'||process.platform!=='linux')fail();
 const chunks=[];let total=0;
 for(;;){const b=Buffer.alloc(Math.min(65536,9437185-total)),n=readSync(0,b);if(n===0)break;total+=n;if(total>9437184)fail();chunks.push(b.subarray(0,n));}
 const input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,total)));
 if(input===null||typeof input!=='object'||Object.keys(input).length!==3||input.version!==1
   ||!Object.hasOwn(input,'selection')||!Number.isSafeInteger(input.maximumOpenMs)||input.maximumOpenMs<1||input.maximumOpenMs>120000)fail();
 const token=captureApiCreditNegativeAcceptanceSelection(input.selection),plan=apiCreditNegativeAcceptancePlan(token),deadline=performance.now()+input.maximumOpenMs;
 const remaining=()=>{const ms=Math.floor(deadline-performance.now());if(ms<1)fail();return ms;};
 const result=await runApiCreditNegativeAcceptance(token,F({exchange:F(async selected=>{
  const budget=remaining(),requestDeadlineMs=Math.min(plan.requestDeadlineMs,budget),ca=Buffer.from(plan.publicCaPem,'utf8');let owner;
  try{owner=createServiceCreditNativeHttpsClientTransport({origin:plan.origin,ca,maxRequestStarts:1,maxConcurrentRequests:1,
   requestDeadlineMs,handshakeDeadlineMs:Math.min(plan.handshakeDeadlineMs,requestDeadlineMs),closeGraceMs:Math.min(plan.closeGraceMs,budget)});}
  finally{ca.fill(0);}
  let reply;
  try{remaining();reply=await collectApiCreditNegativeHttpReply({resourceUrl:selected.resourceUrl,authorizationHeader:selected.authorizationHeader,requestImpl:owner.requestImpl});}
  finally{await owner.close();}
  const closed=owner.snapshot();
  if(closed.phase!=='CLOSED'||closed.unknown!==false||closed.requestStarts!==1||closed.authenticatedTlsHandshakes!==1
    ||closed.trackedRequests!==0||closed.trackedSockets!==0||closed.ownedTimers!==0)fail();
  remaining();return F({...reply,clientCloseReturned:true});
 })}));
 process.stdout.write(JSON.stringify(result)+'\n');
}catch{process.stderr.write('API_CREDIT_LINUX_NEGATIVE_PROBE_UNKNOWN\n');process.exitCode=1;}
