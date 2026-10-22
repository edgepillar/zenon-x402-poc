/*
 * Explicit current-main integration of the bounded strategy and shared policy.
 * Synthetic declared metadata only. No SDK, actual work, keys, signatures,
 * account/chain/RPC observation, SQL, payment, provider or live validator.
 * p and frontier height/hash are declared inputs, never authenticated state.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { BoundedDynamicPlasmaStrategy } from '../src/zenon/bounded-dynamic-plasma-strategy.js';
import { classifyDynamicPlasmaCompatibility } from '../src/zenon/dynamic-plasma-compatibility.js';
import {
  selectDynamicPlasmaPricePolicyFields,
  validateDynamicPlasmaPricePolicySelection,
} from '../src/zenon/dynamic-plasma-price-policy.js';

const SUBJECT='sha256:'+'a'.repeat(64),RUNTIME='sha256:'+'b'.repeat(64);
function oracle(available,fusion,work){
 const fused=Math.min(available,Math.ceil(100*fusion/1000));
 const remaining=Math.max(0,100-Math.floor(fused*1000/fusion));
 return{fusedPlasma:fused,difficulty:Math.ceil(remaining*work/1000)*1500};
}
function raw(available,age=0,fusion=1200,work=1200){
 const frontier={height:400+age,hash:(age===0?'3':'4').repeat(64),version:2,
  nextFusionPrice:fusion,nextWorkPrice:work};
 return{chainProfileMatch:{classification:'MATCH'},beforeFrontier:{...frontier},
  rpcObservation:{availablePlasma:available,basePlasma:100,
   requiredDifficulty:oracle(available,fusion,work).difficulty},afterFrontier:{...frontier}};
}
function fixedPolicyError(error){
 assert.equal(error instanceof TypeError,true);
 assert.equal(error.code,'dynamic_plasma_price_policy_input_rejected');
 assert.equal(error.message,'Dynamic Plasma price policy input rejected');
 return true;
}
function frozenData(value){
 if(value===null||typeof value!=='object')return;
 assert.equal(Object.isFrozen(value),true);
 for(const child of Object.values(value))frozenData(child);
}
for(const[index,name]of ["current bounded strategy refuses early fusion and work price jumps for fusion-only metadata","current bounded strategy refuses early fusion and work price jumps for work-only metadata"].entries()){
 test(name,{timeout:5000},async t=>{
  const available=index===0?1000:0;
  const policy={policyVersion:1,maxPriceChangePercent:10,maxMomentumAdvances:3,
   maxFusedPlasma:available,maxDifficulty:5000000};
  const context=observation=>({phase:'UNSIGNED',subjectDigest:SUBJECT,
   runtimeContextDigest:RUNTIME,observation,policy});
  const strategy=new BoundedDynamicPlasmaStrategy();
  const origin=context(raw(available)),originBefore=JSON.stringify(origin);
  const quote=await strategy.quote(origin),quoteBefore=JSON.stringify(quote);
  const expected=index===0?{fusedPlasma:160,difficulty:0}:{fusedPlasma:0,difficulty:240000};
  assert.deepEqual(quote.selected,expected);
  assert.deepEqual(quote.boundPrices,{fusionPrice:1597,workPrice:1597});frozenData(quote);
  assert.equal(quote.chainAuthentication,'NOT_ESTABLISHED');assert.equal(quote.afterSigningAction,'NONE');
  let refused=0,coherent=0;
  const input=observation=>({quote,compatibility:classifyDynamicPlasmaCompatibility(observation),
   policy,subjectDigest:SUBJECT,runtimeContextDigest:RUNTIME});
  // Both prices remain below the original full-horizon1597 ceiling, but1321
  // is above the actual one-step1320 bound. No failed apply refreshes a quote.
  for(const[fusion,work]of[[1321,1200],[1200,1321]]){
   const observation=raw(available,1,fusion,work),before=JSON.stringify(observation);
   const value=input(observation);
   assert.throws(()=>selectDynamicPlasmaPricePolicyFields(value),fixedPolicyError);refused++;
   assert.throws(()=>validateDynamicPlasmaPricePolicySelection({...value,selection:expected}),fixedPolicyError);refused++;
   await assert.rejects(strategy.apply(context(observation),quote),fixedPolicyError);refused++;
   assert.equal(JSON.stringify(observation),before);assert.equal(JSON.stringify(quote),quoteBefore);
  }
  for(const[age,price]of[[1,1320],[2,1452],[3,1597]]){
   const observation=raw(available,age,price,price),value=input(observation);
   const outputs=[selectDynamicPlasmaPricePolicyFields(value),
    validateDynamicPlasmaPricePolicySelection({...value,selection:expected}),
    await strategy.apply(context(observation),quote)];
   for(const output of outputs){assert.deepEqual(output,expected);frozenData(output);coherent++;}
   assert.equal(JSON.stringify(quote),quoteBefore);
  }
  assert.equal(JSON.stringify(origin),originBefore);assert.equal(refused,6);assert.equal(coherent,9);
  t.diagnostic(JSON.stringify({kind:'P1A_CURRENT_STRATEGY_ELAPSED_BOUND',selection:index+1,
   mode:index===0?'FUSION_ONLY':'WORK_ONLY',refusedSelections:refused,coherentSelections:coherent,
   originalQuotePreserved:true,operationalCalls:0,qualification:'DECLARED_DATA_ONLY_NOT_LIVE_DP'}));
 });
}
