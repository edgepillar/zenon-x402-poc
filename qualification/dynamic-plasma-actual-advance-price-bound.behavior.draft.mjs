/*
 * Explicit finite declared-data price-policy regression entry.
 * No automatic test registration or CLI. The reviewed caller must pin this
 * entry, package metadata, and both independently staged policy images before
 * import, then guard the unchanged complete graph around every invocation.
 *
 * The baseline is immutable main source; candidate source differs only in
 * bounding current observations by ACTUAL elapsed advances as well as by the
 * original full quote horizon. Neither image is rewritten or virtually mocked.
 * Source-to-native-import, loader/runner/intrinsic/stream/OS behavior remains
 * a premise. A deadline is not hard cancellation, lifetime or sandbox proof.
 *
 * All values below are synthetic declared metadata, including p, frontier
 * height/hash, availability and difficulty. No quote authentication, ancestry,
 * runtime governance, actual work/nonce production, key, signer, SDK, SQL,
 * payment, RPC, endpoint, listener, child, native owner or host is introduced.
 * Original signed bytes and consumed authority cannot be passed to this API.
 */
import assert from 'node:assert/strict';

export const CASE_NAMES = Object.freeze([
  "elapsed price bound rejects a one-step fusion jump despite spare full-horizon headroom",
  "elapsed price bound rejects a one-step work jump despite spare full-horizon headroom",
  "elapsed price bound rejects a two-step jump above the actual two-step ceiling",
  "elapsed price bound applies integer flooring at the actual elapsed step",
  "elapsed price bound keeps original selections at coherent one-step and two-step prices",
  "elapsed price bound preserves the full horizon for declared rates one ten twenty-five and one hundred"
]);
const seen = new Set();
const SUBJECT = 'sha256:' + 'a'.repeat(64);
const RUNTIME = 'sha256:' + 'b'.repeat(64);
const ORIGIN_HASH = '1'.repeat(64);
const CURRENT_HASH = '2'.repeat(64);
const PREFIX = 'dynamic_plasma_price_policy_input_rejected';
let baseline = null, candidate = null, active = false;

// Independent small-integer Number oracle; no candidate function is used.
function amounts(base, available, fusionPrice, workPrice) {
  const required = Math.ceil(base * fusionPrice / 1000);
  const fused = Math.min(available, required);
  const remaining = Math.max(0, base - Math.floor(fused * 1000 / fusionPrice));
  return { fusedPlasma: fused, difficulty: Math.ceil(remaining * workPrice / 1000) * 1500 };
}
function ceiling(price, percent, advances) {
  for (let step = 0; step < advances; step++)
    price = Math.max(1000, Math.floor(price * (100 + percent) / 100));
  return price;
}
function compatibility(available, fusionPrice, workPrice, age = 0) {
  const selected = amounts(100, available, fusionPrice, workPrice);
  return {
    classification:'DP_ACTIVE',reason:'NONE',scope:'OBSERVED_FRONTIER_ONLY',
    chainProfileGuard:'MATCH',chainAuthentication:'NOT_ESTABLISHED',afterSigningAction:'NONE',
    quote:{
      frontier:{height:1000 + age,hash:age === 0 ? ORIGIN_HASH : CURRENT_HASH,
        version:2,nextFusionPrice:fusionPrice,nextWorkPrice:workPrice},
      rpcObservation:{availablePlasma:available,basePlasma:100,requiredDifficulty:selected.difficulty},
      selectedFusedPlasma:selected.fusedPlasma,requiredDifficulty:selected.difficulty,
      powRequired:selected.difficulty !== 0,
      pricingMode:selected.difficulty === 0 ? 'FUSION_ONLY' : 'FUSION_AND_POW',
      sdk105BasePlasmaUnderpricingDetected:selected.difficulty === 0 && selected.fusedPlasma > 100,
    },
  };
}
function quote(module, available, initial = 1000, percent = 10) {
  return module.createDynamicPlasmaPricePolicyQuote({
    compatibility:compatibility(available,initial,initial),
    policy:{policyVersion:1,maxPriceChangePercent:percent,maxMomentumAdvances:3,
      maxFusedPlasma:available,maxDifficulty:5000000},
    subjectDigest:SUBJECT,runtimeContextDigest:RUNTIME,
  });
}
function inputs(original, current) {
  return {quote:original,compatibility:current,policy:original.policy,
    subjectDigest:SUBJECT,runtimeContextDigest:RUNTIME};
}
function frozenData(value) {
  if(value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value),true);
  for(const item of Object.values(value)) frozenData(item);
}
function refusal(error) {
  assert.equal(error instanceof TypeError,true);
  assert.equal(error.code,PREFIX);
  assert.equal(error.message,'Dynamic Plasma price policy input rejected');
  assert.equal(error.stack,'TypeError: Dynamic Plasma price policy input rejected');
  assert.equal(Object.isFrozen(error),true);
  return true;
}
function selectBoth(module, original, current, counters, field) {
  const input=inputs(original,current), before=JSON.stringify(input);
  const selected=module.selectDynamicPlasmaPricePolicyFields(input);
  assert.deepEqual(selected,original.selected);frozenData(selected);counters[field]++;
  const validated=module.validateDynamicPlasmaPricePolicySelection({...input,selection:selected});
  assert.deepEqual(validated,original.selected);frozenData(validated);counters[field]++;
  assert.equal(JSON.stringify(input),before);
  assert.equal(original.chainAuthentication,'NOT_ESTABLISHED');
  assert.equal(original.afterSigningAction,'NONE');
}
function rejectBoth(original, current, counters) {
  const input=inputs(original,current), before=JSON.stringify(input);
  assert.throws(()=>candidate.selectDynamicPlasmaPricePolicyFields(input),refusal);
  counters.candidateRejections++;
  assert.throws(()=>candidate.validateDynamicPlasmaPricePolicySelection(
    {...input,selection:original.selected}),refusal);
  counters.candidateRejections++;
  assert.equal(JSON.stringify(input),before);
}
function negative(selection,counters) {
  const available=selection === 2 ? 0 : 10000;
  const initial=selection === 4 ? 1019 : 1000;
  const percent=selection === 4 ? 1 : 10;
  const age=selection === 3 ? 2 : 1;
  const expectedActualCeiling=selection === 3 ? 1210 : selection === 4 ? 1029 : 1100;
  const tooHigh=expectedActualCeiling + 1;
  assert.equal(ceiling(initial,percent,age),expectedActualCeiling);
  const oldQuote=quote(baseline,available,initial,percent);
  const newQuote=quote(candidate,available,initial,percent);
  assert.deepEqual(newQuote,oldQuote);frozenData(newQuote);
  assert.ok(tooHigh <= newQuote.boundPrices.fusionPrice);
  assert.ok(tooHigh <= newQuote.boundPrices.workPrice);
  const current=compatibility(available,
    selection === 2 ? initial : tooHigh,selection === 2 ? tooHigh : initial,age);
  const before=JSON.stringify(newQuote);
  selectBoth(baseline,oldQuote,current,counters,'baselineSelections');
  rejectBoth(newQuote,current,counters);
  assert.equal(JSON.stringify(newQuote),before);
}
function coherentEarly(counters) {
  for(const available of [10000,0]) {
    const oldQuote=quote(baseline,available), newQuote=quote(candidate,available);
    assert.deepEqual(newQuote,oldQuote);
    assert.deepEqual(newQuote.boundPrices,{fusionPrice:1331,workPrice:1331});
    assert.deepEqual(newQuote.selected,available === 0
      ? {fusedPlasma:0,difficulty:201000}:{fusedPlasma:134,difficulty:0});
    const before=JSON.stringify(newQuote);
    for(const age of [1,2]) {
      const cap=ceiling(1000,10,age);
      const current=compatibility(available,cap,cap,age);
      selectBoth(baseline,oldQuote,current,counters,'coherentSelections');
      selectBoth(candidate,newQuote,current,counters,'coherentSelections');
      assert.equal(JSON.stringify(newQuote),before);
    }
  }
}
function coherentHorizon(counters) {
  for(const percent of [1,10,25,100])for(const available of [10000,0]) {
    const cap=ceiling(1000,percent,3);
    const oldQuote=quote(baseline,available,1000,percent);
    const newQuote=quote(candidate,available,1000,percent);
    assert.deepEqual(newQuote,oldQuote);
    assert.deepEqual(newQuote.boundPrices,{fusionPrice:cap,workPrice:cap});
    const current=compatibility(available,cap,cap,3), before=JSON.stringify(newQuote);
    selectBoth(baseline,oldQuote,current,counters,'coherentSelections');
    selectBoth(candidate,newQuote,current,counters,'coherentSelections');
    assert.equal(JSON.stringify(newQuote),before);
  }
}
export async function runElapsedPriceCase(selection) {
  assert.equal(arguments.length,1);assert.ok(Number.isInteger(selection) && selection >= 1 && selection <= 6);
  assert.equal(active,false);assert.equal(seen.has(selection),false);
  active=true;seen.add(selection);
  try {
    // Exact sibling images, no query suffix, loader rewrite, fake adapter or
    // third-party import. The caller verifies both byte/identity pins first.
    baseline ??= await import('../baseline/dynamic-plasma-price-policy.js');
    candidate ??= await import('../candidate/dynamic-plasma-price-policy.js');
    const counters={baselineSelections:0,candidateRejections:0,coherentSelections:0};
    if(selection <= 4)negative(selection,counters);
    else if(selection === 5)coherentEarly(counters);
    else coherentHorizon(counters);
    const expected=selection <= 4
      ? {baselineSelections:2,candidateRejections:2,coherentSelections:0}
      : {baselineSelections:0,candidateRejections:0,coherentSelections:selection === 5 ? 16 : 32};
    assert.deepEqual(counters,expected);
    return Object.freeze({kind:'P1A_ELAPSED_PRICE_BOUND',selection,status:'ASSERTIONS_COMPLETED',
      ...counters,originalQuotePreserved:true,operationalCalls:0,
      qualification:'DECLARED_DATA_ONLY_NO_RUNTIME_P_OR_CHAIN_PROOF'});
  } finally {active=false;}
}
