// Real repository planner/adapter/codecs, declared JSON exchanges and KeyPair.
// Fixed zero-work material and invalid signature DATA; no key or real signing.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { retainedOriginalInputFixture } from './dynamic-plasma-retained-input.fixture.mjs';
import { createDynamicPlasmaJsonRpcReadTransport as WIRE } from '../src/zenon/dynamic-plasma-json-rpc-read-transport.js';
import { createObservedBalanceDeadlineBoundMaterialRetainedCandidatePreparer as PREPARER } from '../src/zenon/dynamic-plasma-observed-balance-deferred-material-planner.js';
import { captureDynamicPlasmaKeyPairFundingConfiguration as CAPTURE } from '../src/zenon/dynamic-plasma-keypair-funding-configuration.js';
import { createDynamicPlasmaPreparedHashWalletOptions as OPTIONS } from '../src/zenon/dynamic-plasma-prepared-hash-wallet-options.js';

const copy = value => structuredClone(value), ZERO = '0'.repeat(64);
const METHODS = ['ledger.getFrontierMomentum','ledger.getMomentumsByHeight','embedded.spork.getAll',
  'embedded.plasma.getVariables','embedded.plasma.getRequiredPoWForAccountBlock','ledger.getFrontierMomentum'];
export function deferred() { let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject}; }

export function keyPairCandidateFixture(mode = {}) {
  const base=retainedOriginalInputFixture(),read=base.input.plannerContext.readInput;
  const payer=read.payerAddress,asset=read.accepted.asset,payee=read.accepted.payTo;
  const f={...base,mode,payer,asset,payee,stage:0,accountCalls:[],positions:[0,0],materialCalls:0,
    addressCalls:0,keyCalls:0,fetchCalls:0,ages:mode.ages??[0,0,0,0,0,0],originalUnsigned:null,hash:null,
    signature:new Uint8Array(64).fill(42),keyReady:deferred(),keyGate:deferred(),
    readReady:deferred(),readGate:deferred(),materialReady:deferred(),materialGate:deferred()};
  const frontierBlock=()=>({version:1,chainIdentifier:73404,blockType:3,hash:'66'.repeat(32),previousHash:'77'.repeat(32),height:6,
    momentumAcknowledged:{hash:'33'.repeat(32),height:100},address:payer,toAddress:payee,amount:'5',tokenStandard:asset,
    fromBlockHash:'88'.repeat(32),descendantBlocks:[],data:null,fusedPlasma:0,difficulty:0,nonce:'0000000000000000',
    basePlasma:21000,usedPlasma:21000,changesHash:ZERO,publicKey:'',signature:'',token:null,confirmationDetail:null,pairedAccountBlock:null});
  const momentum=(age=0,two=false)=>({version:two?1:2,chainIdentifier:73404,
    hash:two?'22'.repeat(32):['33','44','55','66'][age].repeat(32),previousHash:'11'.repeat(32),
    height:two?2:100+age,timestamp:1234,data:'',content:[],changesHash:'66'.repeat(32),
    publicKey:Buffer.alloc(32,6).toString('base64'),signature:Buffer.alloc(64,8).toString('base64'),
    nextFusionPrice:two?0:[1000,1100,1210,1331][age],nextWorkPrice:two?0:[1000,1100,1210,1331][age],producer:payer});
  const transports=[0,1].map(side=>WIRE({exchange:function exchange(text){
    const request=JSON.parse(text),index=f.positions[side]++%6;
    assert.ok(f.positions[side]<=36);assert.equal(request.id,f.positions[side]);assert.equal(request.method,METHODS[index]);
    const age=f.ages[f.stage-1],price=[1000,1100,1210,1331][age];
    const replies=[momentum(age),{count:200,list:[momentum(0,true)]},{count:2,list:[
      {id:read.compiledSporkIds.libp2pId,name:'libp2p',description:'Synthetic.',activated:false,enforcementHeight:0},
      {id:read.compiledSporkIds.dynamicPlasmaId,name:'dynamic-plasma',description:'Synthetic.',activated:true,enforcementHeight:10}]},
      {MaxBasePlasmaInMomentum:4200000,FusedPlasmaTarget:1050000,PowPlasmaTarget:1050000,
        MaxPriceChangePercent:mode.changedSixthRuntime&&f.stage===6?11:10,PriceChangeDenominator:20},
      {availablePlasma:30000,basePlasma:21000,requiredDifficulty:0,requiredFusedPlasma:Math.ceil(21000*price/1000)},momentum(age)];
    return Promise.resolve(JSON.stringify({jsonrpc:'2.0',id:request.id,result:replies[index]}));
  }}));
  f.readOptions={transports,accountExchange:function accountExchange(text){
    const request=JSON.parse(text);f.accountCalls.push(request);assert.ok(f.accountCalls.length<=18);
    assert.equal(request.id,f.accountCalls.length);assert.deepEqual(request.params,[payer]);
    f.stage=Math.floor((f.accountCalls.length-1)/3)+1;assert.ok(f.stage<=6);
    let result;
    if(request.method==='ledger.getAccountInfoByAddress') result={address:payer,accountHeight:6,
      balanceInfoMap:{[asset]:{token:{tokenStandard:asset},balance:mode.insufficientSixth&&f.stage===6?'4':'5'}}};
    else {assert.equal(request.method,'ledger.getFrontierAccountBlock');result=frontierBlock();
      if(mode.movedSixth&&f.stage===6){result.height=7;result.hash='99'.repeat(32);}}
    const reply=JSON.stringify({jsonrpc:'2.0',id:request.id,result});
    if(mode.deferSixth&&f.stage===6&&f.accountCalls.length===16){f.releaseRead=()=>f.readGate.resolve(reply);f.readReady.resolve();return f.readGate.promise;}
    return Promise.resolve(reply);
  }};
  f.material=function material(request){
    assert.equal(++f.materialCalls,1);assert.equal(f.accountCalls.length,6);assert.deepEqual(f.positions,[12,12]);
    assert.equal(request.workRequest.accountBlock.difficulty,0);f.materialReady.resolve();
    const value={materialVersion:1,publicKey:base.candidate.originalUnsignedBlock.publicKey,nonce:'0000000000000000'};
    f.materialData=value;return mode.deferMaterial?f.materialGate.promise:Promise.resolve(value);
  };
  f.keyPair={getAddress(){assert.equal(this,f.keyPair);assert.ok(++f.addressCalls<=2);return mode.wrongAddress?payee:payer;},
    sign(bytes){assert.equal(this,f.keyPair);assert.equal(++f.keyCalls,1);assert.ok(Buffer.isBuffer(bytes));assert.equal(bytes.length,32);
      assert.equal(f.accountCalls.length,12);assert.deepEqual(f.positions,[24,24]);assert.equal(f.materialCalls,1);
      f.hash=bytes.toString('hex');f.originalUnsigned=f.options.wallet.inspect().originalUnsignedBlock;assert.equal(f.hash,f.originalUnsigned.hash);
      f.keyReady.resolve();if(mode.rejectKey)return Promise.reject(Error('PRIVATE_KEY_OWNER_FAILURE'));
      return mode.deferKey?f.keyGate.promise:Promise.resolve(f.signature);
    }};
  f.configuration={readOptions:f.readOptions,materialOptions:{publicKey:base.candidate.originalUnsignedBlock.publicKey,
    startNonce:'0000000000000000',limits:{maxAttempts:4096,maxDifficulty:0}},materialWaitMs:mode.waitMs??250,
    keyPair:f.keyPair,expectedAddress:payer,store:{},fundingResourceUrl:base.resourceUrl,deadlineMs:500,
    fetchImpl:function fetchImpl(){f.fetchCalls++;throw Error('NO_FETCH');}};
  f.selected=CAPTURE(f.configuration);
  f.options=OPTIONS({readOptions:f.selected.readOptions,materialExchange:f.material,materialWaitMs:f.selected.materialWaitMs,
    keyPair:f.selected.keyPair,expectedAddress:f.selected.expectedAddress,expectedPublicKey:f.selected.materialOptions.publicKey});
  f.preparer=PREPARER(f.options);
  f.prepare=()=>f.preparer.prepareSignedCandidate(copy(f.input.plannerContext));
  assert.equal(f.accountCalls.length+f.addressCalls+f.keyCalls+f.materialCalls+f.fetchCalls,0);
  return f;
}
