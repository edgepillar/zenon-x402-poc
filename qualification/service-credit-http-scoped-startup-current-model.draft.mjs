// Recontext qualification of the retained constructor/startup scenarios.
// Only source-pin DATA is rebound to the current model; the original draft is preserved.
// This adds no authorization, replay, close, signing, SQLite or pilot coverage.
// Real constructor checks with declared fixtures, not authorization or durability.
// No signing/SQL/network or admit() call. Native behavior remains a premise.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const pins=Object.freeze([
Object.freeze({
url:new URL('../src/service-credit-http.js',import.meta.url),
bytes:32432,
sha:'c76a7f1864bdfcd0c26916bf28fba615c8aecf899d53e69467e3ebe7d3353d0d',
}),
Object.freeze({
url:new URL('../src/service-credit-model.js',import.meta.url),
bytes:55461,
sha:'7ff7e3d88ab8c3b38a0073541533fbdb7a0d9f2be42f337ac35f6a3b05615c3a',
}),
Object.freeze({
url:new URL('../src/service-credit-capability.js',import.meta.url),
bytes:8284,
sha:'cb2b96d9a2e56c132dd1b4aca8f1c065b244ecd0e7e92f41ea3f4a8c969d17c3',
}),
]);
for (const pin of pins) {
const text=readFileSync(pin.url,'utf8');
assert.equal(/[^\x00-\x7f]/.test(text),false);
assert.ok(text.endsWith('\n'));
assert.equal(Buffer.byteLength(text,'utf8'),pin.bytes);
assert.equal(createHash('sha256').update(text,'utf8').digest('hex'),pin.sha);
}
assert.equal(pins.reduce((sum,pin)=>sum+pin.bytes,0),96177);
const { createServiceCreditHttpAdmission:admission }=await import(pins[0].url.href);
const INVALID='SERVICE_CREDIT_HTTP_INVALID_CONFIGURATION';
const invalidConfig=error=>
error instanceof TypeError
&&error.name==='TypeError'
&&error.message===INVALID;
function canonical(value) {
if (Array.isArray(value)) {
return '['+value.map(canonical).join(',')+']';
}
if (value !==null&&typeof value==='object') {
return '{'+Object.keys(value).sort().map(key=>
JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
}
return JSON.stringify(value);
}
function commitment(value) {
return 'sha256:'+createHash('sha256')
.update(canonical(value),'utf8')
.digest('hex');
}
const copy=value=>JSON.parse(JSON.stringify(value));
const digest=label=>commitment({ declaredFixture:label });
function declaredOffer() {
return {
modelVersion:1,
providerId:'provider.declared',
serviceId:'service.declared',
resourceId:'resource.declared',
resourceBinding:digest('resource-binding'),
offerId:'offer.declared',
offerVersion:1,
costPolicyId:'cost.declared',
fundingPolicyId:'funding.declared',
fundingPolicyVersion:1,
};
}
function declaredGrant(offer,tag,totalUnits) {
const holder='holder.declared.'+tag;
const record={
activationVersion:1,
authorityProfileId:'authority.declared',
authorityProfileVersion:1,
verifierVersion:1,
authorityRecordDigest:digest('authority-record-'+tag),
fundingPolicyId:offer.fundingPolicyId,
fundingPolicyVersion:offer.fundingPolicyVersion,
sourceSettlementId:'settlement.declared.'+tag,
transactionId:'mocktx:'+tag.repeat(64),
providerId:offer.providerId,
serviceId:offer.serviceId,
resourceId:offer.resourceId,
resourceBinding:offer.resourceBinding,
offerId:offer.offerId,
offerVersion:offer.offerVersion,
holderId:holder,
capabilityCommitment:digest('capability-'+tag),
totalUnits,
expiresAt:9007199254740991,
scheme:'exact',
paymentFlow:'upfront',
network:'zenon:mock',
chainProfile:{
version:1,
chainIdentifier:'9007199254740991',
genesisMomentumHash:'0'.repeat(64),
},
asset:'ZNN',
amount:String(totalUnits),
payee:'payee.declared',
payer:holder,
paymentResourceDigest:digest('payment-resource-'+tag),
paymentRequirementDigest:digest('payment-requirement-'+tag),
paymentIntentDigest:digest('payment-intent-'+tag),
grantFundingCommitment:digest('grant-funding-'+tag),
evidenceState:'MOMENTUM_INCLUDED',
confirmationPolicy:{
policyId:'mock.momentum-included',
policyVersion:1,
minimumConfirmations:1,
},
};
const activationId='activation_'+commitment({
domain:'zenon-x402-service-credit-activation-v1',
record,
}).slice('sha256:'.length);
const description={
modelVersion:1,
activationId,
providerId:record.providerId,
serviceId:record.serviceId,
resourceId:record.resourceId,
offerId:record.offerId,
offerVersion:record.offerVersion,
holderId:record.holderId,
capabilityCommitment:record.capabilityCommitment,
totalUnits:record.totalUnits,
expiresAt:record.expiresAt,
};
const grantId='grant_'+commitment({
domain:'zenon-x402-service-credit-grant-v1',
grant:description,
}).slice('sha256:'.length);
return {
grantId,
...description,
activation:{ activationId,...record },
sourceSettlementId:record.sourceSettlementId,
transactionId:record.transactionId,
paymentIntent:{
intentId:record.paymentIntentDigest,
requirementId:record.paymentRequirementDigest,
},
lifecycle:'ACTIVE',
availableUnits:totalUnits,
heldUnits:0,
consumedUnits:0,
};
}
function envelope(state,revision=7) {
const payload={ revision,schemaVersion:1,state };
return {
schemaVersion:1,
revision,
state,
checksum:commitment(payload),
};
}
function fixture() {
const offer=declaredOffer();
const grants=[
declaredGrant(offer,'a',10),
declaredGrant(offer,'b',12),
].sort((left,right)=>
left.grantId < right.grantId ? -1:left.grantId > right.grantId ? 1:0);
assert.notEqual(grants[0].grantId,grants[1].grantId);
assert.notEqual(grants[0].capabilityCommitment,grants[1].capabilityCommitment);
return envelope({
schemaVersion:2,
modelVersion:1,
offers:[offer],
grants,
requests:[],
});
}
function facade(input) {
const metrics={ loads:0,argc:[],mutations:[],executes:0 };
let store;
const forbidden=name=>{
metrics.mutations.push(name);
assert.fail('constructor invoked forbidden store method: '+name);
};
store={
load(...args) {
metrics.loads+=1;
metrics.argc.push(args.length);
assert.equal(this,store);
assert.equal(args.length,0);
return input;
},
reserveRequest() { return forbidden('reserveRequest'); },
beginExecution() { return forbidden('beginExecution'); },
completeExecution() { return forbidden('completeExecution'); },
markOutcomeUnknown() { return forbidden('markOutcomeUnknown'); },
execute() {
metrics.executes+=1;
assert.fail('constructor invoked execute');
},
};
return { store,input,metrics };
}
function optionsFor(store,scope) {
return scope===undefined ? { store }:{ store,admittedGrantId:scope };
}
function unchanged(f,before,raw,loads) {
assert.equal(f.metrics.loads,loads);
assert.deepEqual(f.metrics.argc,Array(loads).fill(0));
assert.deepEqual(f.metrics.mutations,[]);
assert.equal(f.metrics.executes,0);
assert.deepEqual(f.input,before);
assert.equal(JSON.stringify(f.input),raw);
}
function accepted(input,scope) {
const before=copy(input),raw=JSON.stringify(input),f=facade(input);
const api=admission(optionsFor(f.store,scope));
assert.deepEqual(Reflect.ownKeys(api),['admit']);
assert.equal(typeof api.admit,'function');
assert.ok(Object.isFrozen(api));
assert.ok(Object.isFrozen(api.admit));
unchanged(f,before,raw,1);
return api;
}
function rejected(input,scope) {
const before=copy(input),raw=JSON.stringify(input),f=facade(input);
assert.throws(()=>admission(optionsFor(f.store,scope)),invalidConfig);
unchanged(f,before,raw,1);
}
function validBefore(input) {
accepted(input);
accepted(input,input.state.grants[0].grantId);
}
test('startup rejects invalid present scopes and hostile options before load',{ timeout:5000 },()=>{
const baseline=fixture(),selected=baseline.state.grants[0].grantId;
let hooks=0;
const touch=()=>{
hooks+=1;
assert.fail('unexpected option or value hook');
};
const poison={
get toJSON() { return touch(); },
toString:touch,
valueOf:touch,
[Symbol.toPrimitive]:touch,
};
const valueProxy=new Proxy({},{
get:touch,ownKeys:touch,getOwnPropertyDescriptor:touch,getPrototypeOf:touch,
});
function rejectEarly(build) {
const f=facade(baseline),before=copy(baseline),raw=JSON.stringify(baseline);
const options=build(f.store);
assert.throws(()=>admission(options),invalidConfig);
unchanged(f,before,raw,0);
assert.equal(hooks,0);
}
for (const scope of [
undefined,null,'',false,0,{},[],poison,valueProxy,
new String(selected),Symbol('declared-scope'),1n,
'declared://invalid','g'.repeat(129),
]) {
rejectEarly(store=>({ store,admittedGrantId:scope }));
}
rejectEarly(store=>{
const options={ store };
Object.defineProperty(options,'admittedGrantId',{ enumerable:true,get:touch });
return options;
});
rejectEarly(()=>{
const options={ admittedGrantId:selected };
Object.defineProperty(options,'store',{ enumerable:true,get:touch });
return options;
});
rejectEarly(store=>{
const options={ store };
Object.defineProperty(options,'admittedGrantId',{ value:selected,enumerable:false });
return options;
});
rejectEarly(store=>new Proxy({ store,admittedGrantId:selected },{
get:touch,ownKeys:touch,getOwnPropertyDescriptor:touch,getPrototypeOf:touch,
}));
rejectEarly(store=>({ store:new Proxy(store,{
get:touch,ownKeys:touch,getOwnPropertyDescriptor:touch,getPrototypeOf:touch,
}) }));
rejectEarly(store=>{
const hostile={ ...store };
Object.defineProperty(hostile,'load',{ enumerable:true,get:touch });
return { store:hostile };
});
rejectEarly(store=>({ store,execute:touch }));
assert.equal(hooks,0);
});
test('startup accepts canonical two-grant snapshots scoped and unscoped without mutations',{ timeout:5000 },()=>{
const baseline=fixture(),before=copy(baseline);
assert.equal(baseline.state.schemaVersion,2);
assert.equal(baseline.schemaVersion,1);
assert.equal(baseline.state.grants.length,2);
assert.ok(baseline.state.grants[0].grantId < baseline.state.grants[1].grantId);
assert.equal(baseline.checksum,commitment({
revision:baseline.revision,schemaVersion:baseline.schemaVersion,state:baseline.state,
}));
accepted(baseline);
for (const grant of baseline.state.grants) accepted(baseline,grant.grantId);
assert.deepEqual(baseline,before);
});
test('scoped startup rejects corruption in the unselected grant with valid checksums',{ timeout:5000 },()=>{
const baseline=fixture(),selected=baseline.state.grants[0];
const baselineBefore=copy(baseline),selectedBefore=copy(selected);
validBefore(baseline);
for (const kind of ['commitment','counters']) {
const state=copy(baseline.state);
const other=state.grants.find(grant=>grant.grantId !==selected.grantId);
assert.ok(other);
if (kind==='commitment') other.capabilityCommitment='not-a-commitment';
else other.availableUnits -=1;
assert.deepEqual(state.grants.find(grant=>grant.grantId===selected.grantId),selectedBefore);
const hostile=envelope(state,baseline.revision);
assert.equal(hostile.checksum,commitment({
revision:hostile.revision,schemaVersion:hostile.schemaVersion,state:hostile.state,
}));
assert.notEqual(hostile.checksum,baseline.checksum);
assert.match(hostile.checksum,/^sha256:[0-9a-f]{64}$/);
rejected(hostile);
rejected(hostile,selected.grantId);
}
assert.deepEqual(baseline,baselineBefore);
assert.deepEqual(selected,selectedBefore);
});
test('startup rejects checksum-only mismatch without scope fallback or repair',{ timeout:5000 },()=>{
const baseline=fixture(),selected=baseline.state.grants[0].grantId;
const before=copy(baseline);
validBefore(baseline);
const hostile=copy(baseline);
hostile.checksum=hostile.checksum.slice(0,-1)+
(hostile.checksum.endsWith('0') ? '1':'0');
assert.match(hostile.checksum,/^sha256:[0-9a-f]{64}$/);
assert.notEqual(hostile.checksum,baseline.checksum);
assert.deepEqual({ ...hostile,checksum:baseline.checksum },before);
assert.equal(commitment({
revision:hostile.revision,schemaVersion:hostile.schemaVersion,state:hostile.state,
}),baseline.checksum);
rejected(hostile);
rejected(hostile,selected);
assert.deepEqual(baseline,before);
});
test('startup rejects missing scope noncanonical grant order and extra envelope fields',{ timeout:5000 },()=>{
const b=fixture(),g=b.state.grants[0].grantId;
const before=copy(b);
validBefore(b);
const missing='grant_'+'f'.repeat(64);
assert.match(missing,/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
assert.equal(b.state.grants.some(grant=>grant.grantId===missing),false);
rejected(b,missing);
const lf=facade(b);
assert.throws(()=>admission({store:lf.store,admittedGrantId:g+'\n'}),invalidConfig);
unchanged(lf,before,JSON.stringify(b),0);
const state=copy(b.state);
state.grants.reverse();
assert.ok(state.grants[0].grantId > state.grants[1].grantId);
const unsorted=envelope(state,b.revision);
assert.equal(unsorted.checksum,commitment({
revision:unsorted.revision,schemaVersion:unsorted.schemaVersion,state:unsorted.state,
}));
rejected(unsorted);
rejected(unsorted,g);
const extra={ ...copy(b),extra:'DECLARED_EXTRA_FIELD' };
assert.equal(extra.checksum,commitment({
revision:extra.revision,schemaVersion:extra.schemaVersion,state:extra.state,
}));
rejected(extra);
rejected(extra,g);
assert.deepEqual(b,before);
validBefore(b);
});
