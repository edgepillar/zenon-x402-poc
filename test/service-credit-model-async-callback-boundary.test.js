import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  InMemoryServiceCreditModel,
  SERVICE_CREDIT_ACTIVATION_VERSION,
  SERVICE_CREDIT_MODEL_VERSION,
} from '../src/service-credit-model.js';

const NOW=2_000_000_000_000;
const digest=fill=>'sha256:'+fill.repeat(64);

function offer() {
  return {
    modelVersion:SERVICE_CREDIT_MODEL_VERSION,
    providerId:'provider.alpha',serviceId:'service.lookup',
    resourceId:'resource.lookup',resourceBinding:digest('e'),
    offerId:'offer.standard',offerVersion:1,costPolicyId:'policy.fixed',
    fundingPolicyId:'funding.fixed',fundingPolicyVersion:1,
  };
}

function activation() {
  return {
    activationVersion:SERVICE_CREDIT_ACTIVATION_VERSION,
    authorityProfileId:'authority.mock.reference',
    authorityProfileVersion:1,verifierVersion:1,authorityRecordDigest:digest('d'),
    fundingPolicyId:'funding.fixed',fundingPolicyVersion:1,
    sourceSettlementId:'settlement.public.1',
    transactionId:'mocktx:'+createHash('sha256').update('transaction.public.1').digest('hex'),
    providerId:'provider.alpha',serviceId:'service.lookup',
    resourceId:'resource.lookup',resourceBinding:digest('e'),
    offerId:'offer.standard',offerVersion:1,
    holderId:'holder.public.1',capabilityCommitment:digest('a'),
    totalUnits:8,expiresAt:NOW+10_000,
    scheme:'exact',paymentFlow:'upfront',network:'zenon:mock',
    chainProfile:{
      version:1,chainIdentifier:Number.MAX_SAFE_INTEGER.toString(),
      genesisMomentumHash:'0'.repeat(64),
    },
    asset:'zts1mockasset',amount:'1',payee:'payee.mock.1',payer:'holder.public.1',
    paymentResourceDigest:digest('4'),paymentRequirementDigest:digest('2'),
    paymentIntentDigest:digest('1'),grantFundingCommitment:digest('3'),
    evidenceState:'MOMENTUM_INCLUDED',
    confirmationPolicy:{
      policyId:'mock.momentum-included',policyVersion:1,minimumConfirmations:1,
    },
  };
}

function conserved(grant) {
  assert.equal(grant.totalUnits,
    grant.availableUnits+grant.heldUnits+grant.consumedUnits);
  assert.ok(grant.availableUnits>=0);
  assert.ok(grant.heldUnits>=0);
  assert.ok(grant.consumedUnits>=0);
}

function fixture() {
  const calls={clock:0,pricing:0};
  const returned={clock:0,pricing:0};
  const control={clock:NOW,price:3};
  const model=new InMemoryServiceCreditModel({
    now:()=>{
      calls.clock+=1;
      const value=control.clock;
      returned.clock+=1;
      return value;
    },
    deriveCost:()=>{
      calls.pricing+=1;
      const value=control.price;
      returned.pricing+=1;
      return value;
    },
  });
  // Outside these synchronous callbacks, entry minus return counts records
  // an aborted callback return. Model validation errors are separate.
  const thrown=()=>({
    clock:calls.clock-returned.clock,
    pricing:calls.pricing-returned.pricing,
  });
  model.registerOffer(offer());
  const active=model.activateGrantFromTrustedRecord(activation());
  const original=Object.freeze({
    modelVersion:SERVICE_CREDIT_MODEL_VERSION,
    grantId:active.grantId,requestId:'request.1',method:'POST',routeId:'lookup.v1',
    canonicalBodyDigest:digest('b'),selectedContentType:'application/json',
    maxCostUnits:Number.MAX_SAFE_INTEGER,
  });
  const reference=Object.freeze({
    grantId:original.grantId,requestId:original.requestId,
  });
  const before=model.exportState();
  assert.equal(before.offers.length,1);
  assert.equal(before.grants.length,1);
  assert.deepEqual(before.requests,[]);
  const grant=before.grants[0];
  assert.equal(grant.lifecycle,'ACTIVE');
  assert.equal(grant.totalUnits,8);
  assert.equal(grant.availableUnits,8);
  assert.equal(grant.heldUnits,0);
  assert.equal(grant.consumedUnits,0);
  conserved(grant);
  assert.ok(calls.clock>0);
  assert.equal(calls.pricing,0);
  assert.deepEqual(thrown(),{clock:0,pricing:0});
  return {model,original,reference,before,calls,thrown,control};
}

function expectCode(operation,code,label) {
  assert.throws(operation,error=>{
    assert.equal(error?.code,code,label);
    assert.equal(error?.message,code,label);
    return true;
  },label);
}

function checkState(f,expected,calls,label) {
  const actual=f.model.exportState();
  assert.deepEqual(actual,expected,label);
  assert.deepEqual(f.calls,calls,label);
  assert.deepEqual(f.thrown(),{clock:0,pricing:0},label);
  conserved(actual.grants[0]);
}

function checkEmpty(f,calls,label) {
  checkState(f,f.before,calls,label);
  assert.equal(f.model.getRequest(f.reference),null,label);
  checkState(f,f.before,calls,label);
}

function rejectReservation(f,code,pricingDelta,label) {
  const before={...f.calls};
  expectCode(()=>f.model.reserveRequest(f.original),code,label);
  const after={
    clock:before.clock+1,
    pricing:before.pricing+pricingDelta,
  };
  checkEmpty(f,after,label);
  return after;
}

function reserveSuccessfully(f,beforeCalls,label) {
  const accepted=f.model.reserveRequest(f.original);
  assert.equal(accepted.replayed,false,label);
  assert.equal(accepted.executionAuthorized,false,label);
  assert.equal(accepted.request.state,'RESERVED',label);
  assert.equal(accepted.request.costUnits,3,label);
  assert.equal(accepted.request.cachedResult,null,label);
  for(const [key,value] of Object.entries(f.original)) {
    assert.equal(accepted.request[key],value,label);
  }
  const expected={
    ...f.before,
    grants:[{...f.before.grants[0],availableUnits:5,heldUnits:3}],
    requests:[accepted.request],
  };
  checkState(f,expected,{
    clock:beforeCalls.clock+2,
    pricing:beforeCalls.pricing+1,
  },label);
  assert.equal(expected.grants[0].lifecycle,'ACTIVE');
  assert.equal(expected.grants[0].consumedUnits,0);
}

async function nativePromiseCase(field,code,pricingDelta,validValue) {
  const f=fixture();
  const label=field+' native Promise';
  let settle;
  const pending=new Promise(resolve=>{settle=resolve;});
  let after;
  let observed;
  try {
    assert.equal(typeof settle,'function',label);
    f.control[field]=pending;
    after=rejectReservation(f,code,pricingDelta,label);
  } finally {
    // This is the test-owned native Promise, fulfilled only with a primitive.
    // Settle it even when a preceding assertion fails.
    settle(validValue);
    observed=await pending;
    await Promise.resolve();
  }
  assert.equal(observed,validValue,label);
  checkEmpty(f,after,label);
  f.control[field]=validValue;
  reserveSuccessfully(f,after,label);
}

function thenableProbe() {
  const hits={then:0,catch:0,finally:0};
  const value={};
  for(const name of ['then','catch','finally']) {
    Object.defineProperty(value,name,{
      enumerable:true,
      get() {
        hits[name]+=1;
        throw new Error('controlled '+name+' getter');
      },
    });
  }
  Object.freeze(value);
  const descriptors=Object.getOwnPropertyDescriptors(value);
  function check() {
    assert.deepEqual(hits,{then:0,catch:0,finally:0});
    assert.equal(Object.getPrototypeOf(value),Object.prototype);
    assert.equal(Object.isFrozen(value),true);
    assert.deepEqual(Object.getOwnPropertyDescriptors(value),descriptors);
  }
  return {value,check};
}

async function thenableCase(field,code,pricingDelta,validValue) {
  const f=fixture();
  const label=field+' thenable';
  const probe=thenableProbe();
  f.control[field]=probe.value;
  const after=rejectReservation(f,code,pricingDelta,label);
  probe.check();
  // No await or Promise method receives the thenable-like object.
  await Promise.resolve();
  checkEmpty(f,after,label);
  probe.check();
  f.control[field]=validValue;
  reserveSuccessfully(f,after,label);
  probe.check();
}

test('promise and thenable clock returns reject synchronously without late request admission',
  {timeout:1000},async()=>{
    await nativePromiseCase('clock','INVALID_CLOCK',0,NOW);
    await thenableCase('clock','INVALID_CLOCK',0,NOW);
  });

test('promise and thenable pricing returns reject synchronously without late request admission',
  {timeout:1000},async()=>{
    await nativePromiseCase('price','INVALID_COST',1,3);
    await thenableCase('price','INVALID_COST',1,3);
  });
