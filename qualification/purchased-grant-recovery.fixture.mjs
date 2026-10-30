// Actual codecs, stored-file protocol and query owner over declared memory
// ports. Existing invalid signature-shaped DATA is never signed or verified.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../src/canonical.js';
import { retainedOriginalInputFixture } from './dynamic-plasma-retained-input.fixture.mjs';
import { purchaseExpectationFixture } from './api-credit-purchase-expectation.fixture.mjs';
import { fundingGrantCustodyDataFixture } from './funding-grant-custody.behavior.mjs';
import { captureApiCreditPurchaseExpectation } from '../src/api-credit-purchase-expectation.js';
import { createApiCreditFundingGrantRecoveryRecord } from '../src/api-credit-funding-grant-recovery-record.js';
import { decodeApiCreditOriginalGrantQueryProfile,consumeApiCreditOriginalGrantQueryProfile,releaseApiCreditOriginalGrantQueryProfile } from '../src/api-credit-original-grant-query-profile.js';
import { resolveApiCreditStoredGrantQueryOwner } from '../src/api-credit-stored-grant-query-owner.js';
import { runApiCreditOriginalGrantQueryOwner } from '../src/api-credit-original-grant-query-owner.js';
import { captureApiCreditPurchasedGrantRecoveryOutput } from '../src/api-credit-purchased-grant-recovery.js';
import { createServiceCreditOriginalFundingGrantResult } from '../src/service-credit-original-funding-grant.js';
import { runApiCreditOriginalGrantQueryCoordinator } from '../src/api-credit-recovery-inspection-coordinator.js';
import { captureApiCreditCliArguments } from '../src/api-credit-cli-arguments.js';

const F=Object.freeze;
export const copy=v=>JSON.parse(JSON.stringify(v));
export const hash=v=>createHash('sha256').update(v).digest('hex');
export function freeze(v){if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);F(v);}return v;}
export function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
export async function flush(){for(let i=0;i<30;i++)await Promise.resolve();}
export function purchasedGrantRecoveryData(){
  const p=purchaseExpectationFixture(),f=retainedOriginalInputFixture({resourceUrl:p.resourceUrl,paymentRequired:p.paymentRequired});
  const purchase=captureApiCreditPurchaseExpectation(p.purchaseExpectationJson,p.paymentRequiredHeader,p.resourceUrl);
  const d=fundingGrantCustodyDataFixture({fundingFixture:f,purchase}),policy={version:1,policyId:'synthetic.policy',accountId:purchase.holderId,
    network:d.row.network,asset:d.row.asset,recipients:[d.row.recipient],maxPayment:d.row.amount,maxTotal:d.row.amount,maxDaily:d.row.amount,maxRecords:4};
  const envelope={originalGrantQueryVersion:3,spendingFile:{storageProfile:{version:1,mode:'OPEN_EXISTING',databasePath:'/synthetic/recovery/ledger.sqlite',policy,
    ownerToken:{version:1,storeId:'synthetic.store',accountId:policy.accountId,ownerId:'synthetic.owner',epoch:1,minimumRevision:0}},allowedRoot:'/synthetic/recovery',
    filePolicy:{expectedDevice:'1',reservedBytes:'0',maxDatabaseBytes:4194304}},expectedOriginal:{...d.expected,fundingResourceUrl:f.resourceUrl,
      paymentHash:d.packet.transactionHash,requestId:d.profile.query.requestId,profileDigest:hash(d.text)},
    originalPayment:copy(d.profile.originalPayment),purchaseExpectationJson:p.purchaseExpectationJson};
  return {...d,p,purchase,envelope,raw:createApiCreditFundingGrantRecoveryRecord(d.row,d.signer,d.text)};
}
export function captured(envelope){
  const token=decodeApiCreditOriginalGrantQueryProfile(canonicalJson(envelope));
  try{return consumeApiCreditOriginalGrantQueryProfile(token);}finally{releaseApiCreditOriginalGrantQueryProfile(token);}
}
export function purchasedGrantRecoveryFixture(options={}){
  const d=options.data??purchasedGrantRecoveryData();
  const s={opens:0,reads:0,revokes:0,closes:0,writes:0,queries:0,queryCloses:0,queryOpens:0,queryClosed:false,
    phase:'OPEN',held:false,current:0,trace:[],now:0n,timers:[],cancelled:0,ready:null,selection:null,output:null,guardCalls:0,raw:d.raw};
  const view=()=>F({spendingFileOwnerVersion:1,lifecycle:s.phase,held:s.held,busy:false,backendClosed:s.phase!=='OPEN',
    databaseOpen:s.phase!=='CLOSED',physicalCloseEntered:s.phase==='CLOSED',physicalCloseReturned:s.phase==='CLOSED'});
  const custody=F(Object.defineProperty({read:F(id=>{s.reads++;s.trace.push('file-read');assert.equal(id,d.row.paymentId);
    return options.read?options.read(s,d):s.raw;})},'retain',{enumerable:true,get(){s.writes++;throw Error('unselected write');}}));
  const owner=F({grantQueryCustody:custody,assertCurrent:F(()=>{s.current++;if(options.current)return options.current(s,d);}),
    inspect:F(()=>options.fileView?options.fileView(s,view()):view()),
    revoke:F(()=>{s.revokes++;s.trace.push('file-revoke');s.phase='REVOKED';}),
    close:F(()=>{s.closes++;s.trace.push('file-close');if(options.fileClose)return options.fileClose(s);s.phase='CLOSED';})});
  const guard=F(()=>{s.guardCalls++;if(options.guard)return options.guard(s);});
  const filePorts=F({openFile:F(configuration=>{s.opens++;s.trace.push('file-open');assert.equal(configuration.storageProfile.mode,'OPEN_EXISTING');return owner;})});
  const profile=captured(d.envelope);
  const resolve=(input=profile,requireOpening=guard)=>{
    const result=resolveApiCreditStoredGrantQueryOwner(F({profile:input,ports:filePorts,requireOpening}));
    assert.equal(result.purchasedGrantRecoveryVersion,1);s.ready=result.profile;s.selection=result.purchaseSelection;return result;
  };
  const receipt=()=>F({phase:'CLOSED',trackedRequests:0,trackedSockets:0,ownedTimers:0,serviceDelivery:'NOT_ESTABLISHED'});
  const queryView=()=>F({phase:s.queryClosed?'CLOSED':'OPEN',unknown:false,requestStarts:s.queries,trackedRequests:0,trackedSockets:0,ownedTimers:0,
    close:F({phase:s.queryClosed?'CLOSED':'OPEN',unknown:false,closeRequested:s.queryCloses>0,closePromiseOutcome:s.queryClosed?'CLOSED':'PENDING',
      observing:false,quiescenceObserved:s.queryClosed,localMaterialRelease:F({attempts:s.queryClosed?1:0,outcome:s.queryClosed?'RETURNED':'NOT_ATTEMPTED'})})});
  const history=()=>{
    const q=s.ready.query.originalFunding,p=d.purchase;
    if(options.absent)return createServiceCreditOriginalFundingGrantResult(q,null);
    const grant={activation:q,transactionId:q.transactionId,offerId:q.offerId,offerVersion:q.offerVersion,holderId:q.holderId,
      capabilityCommitment:q.capabilityCommitment,grantId:'grant_'+'a'.repeat(64),activationId:'activation_'+'b'.repeat(64),
      totalUnits:p.totalUnits,expiresAt:p.expiresAt,lifecycle:options.lifecycle??'ACTIVE',availableUnits:p.totalUnits-9,heldUnits:2,consumedUnits:7};
    if(options.grant)options.grant(grant);return createServiceCreditOriginalFundingGrantResult(q,F(grant));
  };
  const queryPorts=F({openTransport:F(ready=>{assert.equal(s.phase,'CLOSED');assert.equal(s.closes,1);assert.equal(ready,s.ready);
      s.queryOpens++;s.trace.push('query-open');return F({declaredTransport:true});}),
    read:F((handle,query,proof)=>{s.queries++;s.trace.push('query-read');assert.deepEqual(query,s.ready.query);assert.equal(proof,s.ready.proof);
      return options.queryRead?options.queryRead(s,history):Promise.resolve(history());}),
    inspect:F(()=>queryView()),close:F(()=>{s.queryCloses++;s.trace.push('query-close');
      if(options.queryClose)return options.queryClose(s,receipt);s.queryClosed=true;return Promise.resolve(receipt());}),
    clock:F(()=>s.now),armTimer:F((budget,callback)=>{const t={budget,callback};s.timers.push(t);return t;}),
    cancelTimer:F(()=>{s.cancelled++;})});
  const query=async(requireOpening=guard)=>{
    const output=await runApiCreditOriginalGrantQueryOwner(F({profile:s.ready,ports:queryPorts,requireOpening}));
    s.output=output;const selected=options.output?options.output(s,output):output;
    requireOpening();const result=captureApiCreditPurchasedGrantRecoveryOutput(s.selection,selected);requireOpening();return result;
  };
  const run=async()=>{resolve();return query();};
  const coordinate=()=>{
    const channel={closed:false,writes:[],inspections:0},timers=[];
    const ports=F({readProfile:F(g=>{g();return Promise.resolve(canonicalJson(d.envelope));}),
      inspectOriginal:F((token,g)=>{g();channel.inspections++;const input=consumeApiCreditOriginalGrantQueryProfile(token);
        releaseApiCreditOriginalGrantQueryProfile(token);resolve(input,g);return query(g);}),
      writeResult:F((line,g)=>{g();channel.writes.push(line);return Promise.resolve(undefined);}),
      close:F(()=>{channel.closed=true;return Promise.resolve(undefined);}),
      inspect:F(()=>F({lifecycle:channel.closed?'CLOSED':'OPEN',held:false,reading:false,writing:false})),clock:F(()=>0n),
      armTimer:F((budget,callback)=>{const t={budget,callback};timers.push(t);return t;}),cancelTimer:F(()=>{})});
    return {channel,run:()=>runApiCreditOriginalGrantQueryCoordinator({arguments:captureApiCreditCliArguments(
      ['--funding-grant-query-fd','3','--output-fd','6','--bootstrap-ms','1000']),ports})};
  };
  return {d,s,owner,profile,guard,filePorts,resolve,query,run,coordinate,history};
}
