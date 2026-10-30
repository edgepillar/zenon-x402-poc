// Actual public bootstrap and one-shot binding; declared memory DATA only.
// No native launcher, TLS parser, SDK, SQL, clock, timer or store entry runs.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { decodeIssuedProviderOperatorBootstrap as decode,readIssuedProviderOperatorBootstrap as read,bindIssuedProviderOperatorBootstrap as bind } from '../src/issued-provider-operator-bootstrap.js';
import { issuedProviderCliPublicDataProfile as profile } from './issued-provider-cli.behavior.mjs';

const F=Object.freeze,checks=[];
function check(id,run){checks.push({id,run});}
function input(version=1,budget=1000){const c=profile();c.providerBootstrapVersion=version;c.funding.closeBudgetMs=budget;if(version===2)c.funding.pendingObservationMode='JOURNAL_ONLY';return c;}

check('provider-funding-close-budget-versions-preserve-both-supported-endpoints',()=>{
 for(const version of [1,2])for(const budget of [1,1000]){const c=input(version,budget),prepared=decode(canonicalJson(c));assert.equal(prepared.providerBootstrapVersion,version);assert.equal(read(prepared).funding.closeBudgetMs,budget);}
});
check('provider-funding-close-budget-oversized-profiles-refuse-without-clamping',()=>{
 for(const version of [1,2])for(const budget of [1001,60000,Number.MAX_SAFE_INTEGER])assert.throws(()=>decode(canonicalJson(input(version,budget))));
});
check('provider-funding-close-budget-keeps-separate-operation-and-store-budgets',()=>{
 const c=input(2,1000);c.control.operationBudgetMs=60000;c.serviceStore.busyTimeoutMs=60000;const selected=read(decode(canonicalJson(c)));
 assert.equal(selected.funding.closeBudgetMs,1000);assert.equal(selected.control.operationBudgetMs,60000);assert.equal(selected.serviceStore.busyTimeoutMs,60000);assert.equal(selected.control.closeWaitMs,c.control.closeWaitMs);
});
check('provider-funding-close-budget-is-forwarded-through-the-actual-inert-one-shot-binding',()=>{
 for(const budget of [1,1000]){const prepared=decode(canonicalJson(input(2,budget))),official=F({declared:'MEMORY_ONLY'}),tls=F({declared:'UNPARSED_MEMORY_ONLY'});let clocks=0;const now=F(()=>{clocks++;return 0;});
  const configuration=bind(prepared,official,tls,now,null);assert.equal(configuration.funding.closeBudgetMs,budget);assert.equal(configuration.funding.official,official);assert.equal(configuration.transport.tlsMaterial,tls);assert.equal(clocks,0);assert.throws(()=>bind(prepared,official,tls,now,null));assert.equal(clocks,0);
 }
});

export const providerFundingCloseBudgetDataCases=F([...checks]);
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const cases=[];for(const c of checks){try{await c.run();cases.push({id:c.id,status:'PASS'});}catch{cases.push({id:c.id,status:'FAIL',error:'DATA_ASSERTION'});}}
 const failed=cases.filter(c=>c.status==='FAIL').length;console.log(JSON.stringify({qualification:'G1_PROVIDER_FUNDING_CLOSE_BUDGET_DATA',passed:cases.length-failed,failed,cases,scope:'ACTUAL_BOOTSTRAP_AND_BINDING_WITH_DECLARED_DATA_ONLY;BACKEND_AND_DRAIN_SOURCE_ONLY',nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,signals:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,timerFactories:0,clocks:0,TLSValidation:'NOT_EXECUTED',nativeAcceptance:'NOT_ESTABLISHED',physicalRelease:'NOT_ESTABLISHED'}));if(failed)process.exitCode=1;
}
