// Fixed public DATA and deliberately invalid signature bytes only.
// Actual SDK105 owner/lifecycle with explicitly declared native children.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createSdk105PreparedHashWalletOwner as WALLET } from '../src/zenon/sdk105-prepared-hash-wallet-owner.js';
import { createSdk105FundingServiceLifecycle as JOIN } from '../src/zenon/sdk105-funding-service-lifecycle.js';
import { retainedOriginalInputFixture } from './dynamic-plasma-retained-input.fixture.mjs';
import { assembleZenonDynamicPlasmaOriginalFundingDataV2 as ASSEMBLE } from '../src/zenon/dynamic-plasma-original-funding-data.js';
const F=Object.freeze,copy=value=>structuredClone(value);
export function sdk105FundingServiceFixture(mode={}){
  const base=retainedOriginalInputFixture(),original=base.candidate.originalUnsignedBlock;
  const f={base,original,publicBytes:Buffer.from(original.publicKey,'base64'),signature:Buffer.alloc(64,42),
    signs:0,clears:0,prepares:0,commits:0,submits:0,handoffs:0,services:0,closes:0,trace:[],childHeld:false,childLifecycle:'OPEN'};
  f.keyPair={getPublicKey(){return f.publicBytes;},getAddress(){return original.address;},
    sign(bytes){f.signs++;assert.equal(bytes.toString('hex'),original.hash);f.trace.push('sign');
      return f.onSign?f.onSign():f.signature;},
    clear(){f.clears++;f.trace.push('clear');if(f.onClear)return f.onClear();f.publicBytes.fill(0);}};
  f.wallet=WALLET({keyPair:f.keyPair,expectedAddress:original.address,expectedPublicKey:original.publicKey});
  f.child=F({
    prepareOriginalFunding:F(async function prepare(input){
      f.prepares++;f.input=input;const signed=await f.wallet.sign(original);
      f.packet=ASSEMBLE(base.input,{originalUnsignedBlock:original,accountBlock:signed},base.resourceUrl);
      if(f.prepareGate)await f.prepareGate.promise;
      return F({phase:'AWAITING_INDEPENDENT_PINS',packet:f.packet});
    }),
    commitOriginalFunding:F(function commit(input){f.commits++;f.commitInput=input;
      return Promise.resolve(Object.hasOwn(mode,'commitResult')?mode.commitResult:F({phase:'LOCAL_STORE_READBACK_MATCHED',transactionHash:f.packet.transactionHash,authority:'NONE'}));}),
    submitOriginalFunding:F(function submit(input){f.submits++;f.submitInput=input;
      return Promise.resolve(F({phase:mode.unbound?'SUBMISSION_OUTCOME_UNKNOWN':'FUNDING_INTAKE_BOUND',fundingIntakeStatus:mode.unbound?'UNKNOWN':'BOUND',transactionHash:f.packet.transactionHash}));}),
    handoffToService:F(function handoff(input){
      f.handoffs++;f.handoffInput=input;f.trace.push('handoff');
      if(f.onHandoff)return f.onHandoff(input);
      return Promise.resolve(F({phase:'SERVICE_CLIENT_OPEN_ORIGINAL_RESTORED',authority:'NONE'}));
    }),
    submitOriginal:F(function service(input){f.services++;f.serviceInput=input;
      if(f.onService)return f.onService(input);
      return Promise.resolve(Object.hasOwn(mode,'serviceResult')?mode.serviceResult:undefined);}),
    inspect:F(function inspect(){return F({lifecycle:f.childLifecycle,held:f.childHeld,declared:true});}),
    close:F(function close(){f.closes++;f.trace.push('client-close');
      if(f.onClose)return f.onClose();f.childLifecycle='CLOSED';return Promise.resolve(undefined);}),
  });
  f.owner=JOIN({client:f.child,walletOwner:f.wallet,fundingResourceUrl:base.resourceUrl});
  f.request=()=>({originalPayment:{resourceUrl:base.resourceUrl,serializedCheckpoint:f.packet.serializedCheckpoint,
    expectedPins:copy(f.packet.expectedPins)},selectedGrantId:'grant.sdk105.1',paymentRequiredHeader:base.input.challenge.paymentRequiredHeader});
  f.ready=async()=>{
    const prepared=await f.owner.prepareOriginalFunding(base.input);assert.equal(prepared.packet,f.packet);
    await f.owner.commitOriginalFunding({expectedPins:copy(f.packet.expectedPins)});
    await f.owner.submitOriginalFunding({expectedPins:copy(f.packet.expectedPins)});return f;
  };
  return f;
}
