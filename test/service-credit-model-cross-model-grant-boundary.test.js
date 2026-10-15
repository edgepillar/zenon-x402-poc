import test from 'node:test';
import { strictEqual as eq, deepStrictEqual as same } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  InMemoryServiceCreditModel,
  ServiceCreditModelError,
  SERVICE_CREDIT_ACTIVATION_VERSION,
  SERVICE_CREDIT_MODEL_VERSION,
} from '../src/service-credit-model.js';

// MOCK only. These fixtures provide no live authority or funding evidence.
const NOW=2_000_000_000_000;
const digest=fill=>'sha256:'+fill.repeat(64);
const copy=value=>JSON.parse(JSON.stringify(value));
const REQUEST_KEYS=[
  'modelVersion','grantId','requestId','method','routeId',
  'canonicalBodyDigest','selectedContentType','maxCostUnits',
];

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

function descriptor(actual, expected) {
  same(Reflect.ownKeys(actual),Reflect.ownKeys(expected));
  for (const key of Reflect.ownKeys(expected)) eq(actual[key],expected[key]);
}

function data(value, keys) {
  Object.freeze(value);
  eq(Object.getPrototypeOf(value),Object.prototype);
  same(Reflect.ownKeys(value),keys);
  eq(Object.isFrozen(value),true);
  eq(Object.isExtensible(value),false);
  for (const key of keys) {
    descriptor(Object.getOwnPropertyDescriptor(value,key),{
      value:value[key],writable:false,enumerable:true,configurable:false,
    });
  }
  return value;
}

function save(v) {
  const keys=Reflect.ownKeys(v);
  return {
    v,keys,proto:Object.getPrototypeOf(v),
    open:Object.isExtensible(v),frozen:Object.isFrozen(v),
    entries:keys.map(key=>[key,Object.getOwnPropertyDescriptor(v,key)]),
  };
}

function verify(s) {
  eq(Object.getPrototypeOf(s.v),s.proto);
  eq(Object.isExtensible(s.v),s.open);
  eq(Object.isFrozen(s.v),s.frozen);
  same(Reflect.ownKeys(s.v),s.keys);
  for (const [key,before] of s.entries) {
    descriptor(Object.getOwnPropertyDescriptor(s.v,key),before);
  }
}

function exercise(kind) {
  const zero=Object.freeze({
    clockEntry:0,clockReturn:0,priceEntry:0,priceReturn:0,
  });
  const a={...zero};
  const b={...zero};
  const spec=offer();
  const seed=activation();
  const spec0=copy(spec);
  const seed0=copy(seed);
  const inputs=[
    spec,seed,seed.chainProfile,seed.confirmationPolicy,
  ].map(save);
  const A=new InMemoryServiceCreditModel({
    now() {
      a.clockEntry+=1;
      a.clockReturn+=1;
      return NOW;
    },
    deriveCost() {
      a.priceEntry+=1;
      a.priceReturn+=1;
      return 3;
    },
  });
  A.registerOffer(spec);
  const initial=A.activateGrantFromTrustedRecord(seed);
  const q=data({
    modelVersion:SERVICE_CREDIT_MODEL_VERSION,
    grantId:initial.grantId,requestId:'request.1',method:'POST',
    routeId:'lookup.v1',canonicalBodyDigest:digest('b'),
    selectedContentType:'application/json',maxCostUnits:Number.MAX_SAFE_INTEGER,
  },REQUEST_KEYS);
  const ref=data({
    grantId:q.grantId,requestId:q.requestId,
  },['grantId','requestId']);
  inputs.push(save(q),save(ref));
  eq(typeof q.grantId,'string');
  eq(a.clockEntry,a.clockReturn);
  same([a.priceEntry,a.priceReturn],[0,0]);

  const start={...a};
  const reserved=A.reserveRequest(q);
  const held={
    clockEntry:start.clockEntry+2,clockReturn:start.clockReturn+2,
    priceEntry:start.priceEntry+1,priceReturn:start.priceReturn+1,
  };
  const stateA=copy(A.exportState());
  const originalA=copy(stateA);
  const request=copy(stateA.requests[0]);
  const stateB={
    schemaVersion:2,modelVersion:1,
    offers:copy(stateA.offers),grants:[],requests:[],
  };
  const originalB=copy(stateB);

  function check() {
    same(a,held);
    same(b,zero);
    same(spec,spec0);
    same(seed,seed0);
    same(stateA,originalA);
    same(stateB,originalB);
    same(request,originalA.requests[0]);
    for (const saved of inputs) verify(saved);
    same(a,held);
    same(b,zero);
  }

  check();
  same([
    stateA.schemaVersion,stateA.modelVersion,
    stateA.offers.length,stateA.grants.length,stateA.requests.length,
  ],[2,1,1,1,1]);
  const grant=stateA.grants[0];
  same([
    grant.grantId,grant.lifecycle,grant.totalUnits,
    grant.availableUnits,grant.heldUnits,grant.consumedUnits,
  ],[q.grantId,'ACTIVE',8,5,3,0]);
  eq(grant.availableUnits+grant.heldUnits+grant.consumedUnits,grant.totalUnits);
  same(grant.activation,initial.activation);
  eq(initial.sourceSettlementId,seed.sourceSettlementId);
  eq(initial.transactionId,seed.transactionId);
  eq(typeof request.requestDigest,'string');
  eq(request.requestDigest.length>0,true);
  eq(Reflect.ownKeys(request).length,14);
  same(request,{
    ...q,requestDigest:request.requestDigest,
    offerId:'offer.standard',offerVersion:1,
    costUnits:3,state:'RESERVED',cachedResult:null,
  });
  eq(reserved.replayed,false);
  eq(reserved.executionAuthorized,false);
  same(reserved.request,request);

  // Both B callbacks are armed from construction and are never probed.
  const fault=Object.freeze(new Error('mock unactivated model callback fault'));
  const B=new InMemoryServiceCreditModel({
    now() {
      b.clockEntry+=1;
      if (kind==='throw') throw fault;
      b.clockReturn+=1;
      return NaN;
    },
    deriveCost() {
      b.priceEntry+=1;
      if (kind==='throw') throw fault;
      b.priceReturn+=1;
      return NaN;
    },
  });
  eq(A===B,false);
  check();
  B.registerOffer(spec);
  check();
  same(B.exportState(),stateB);
  check();

  function inspect() {
    for (const [read,expected] of [
      [()=>A.exportState(),stateA],
      [()=>A.getRequest(ref),request],
      [()=>A.exportState(),stateA],
      [()=>B.exportState(),stateB],
    ]) {
      check();
      const value=read();
      check();
      same(value,expected);
      check();
    }
  }

  const operations=[
    ['getGrant',()=>B.getGrant(q.grantId),false],
    ['getRequest',()=>B.getRequest(ref),false],
    ['reserveRequest',()=>B.reserveRequest(q),true],
    ['beginExecution',()=>B.beginExecution(ref),true],
  ];
  const seen=[];
  for (const [name,call,denied] of operations) {
    inspect();
    let attempts=0;
    let returns=0;
    let value;
    let caught;
    attempts+=1;
    try {
      value=call();
      returns+=1;
    } catch (error) {
      caught=error;
    }
    inspect();
    eq(attempts,1);
    if (denied) {
      eq(returns,0);
      eq(caught instanceof ServiceCreditModelError,true);
      eq(caught.name,'ServiceCreditModelError');
      eq(caught.code,'GRANT_NOT_FOUND');
      eq(caught.message,'GRANT_NOT_FOUND');
    } else {
      eq(returns,1);
      eq(caught,undefined);
      eq(value,null);
    }
    check();
    seen.push(name);
  }
  same(seen,['getGrant','getRequest','reserveRequest','beginExecution']);
}

test('unactivated model rejects a borrowed original grant with NaN callbacks',
  { timeout: 5000 }, () => exercise('nan'));

test('unactivated model rejects a borrowed original grant with throwing callbacks',
  { timeout: 5000 }, () => exercise('throw'));
