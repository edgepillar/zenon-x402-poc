import { types } from 'node:util';
import { canonicalJson } from './canonical.js';
import { snapshotActiveUpfrontRequirement } from './x402-wire.js';
import { OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,GATE_B_CURRENT_TESTNET_PROFILE_NAME,
 PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROFILE_NAME,PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
 selectOperatorTrustedTestnetPolicy,selectGateBCurrentTestnetPolicy,selectPublicTestnetDynamicPlasmaEpochPolicy,
 selectPublicTestnetDynamicPlasmaResetEpochExecutionPolicy } from './zenon/operator-trusted-testnet-profile.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor;
function fail(){throw new TypeError('ISSUED_PROVIDER_CHAIN_SELECTION');}
function fields(v,names){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==names.length)fail();
 const out={};for(const k of names){const d=D(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();Object.defineProperty(out,k,{value:d.value,enumerable:true});}return out;}

/** Explicit selection of existing operator-trusted profiles only. No defaults,
 * ambient environment, new trust anchor, artifact file, remote observation or
 * profile fallback. These policy objects do NOT authenticate the running chain.
 */
export function captureIssuedProviderChainSelection(options,requirement){
 if(arguments.length!==2)fail();const c=fields(options,['selection','rpcUrl','rpcTimeoutMs']);
 if(c.selection===null||typeof c.selection!=='object'||types.isProxy(c.selection))fail();
 const name=D(c.selection,'profileName');if(!name||!Object.hasOwn(name,'value'))fail();
 let selection,policy;const profileName=name.value;
 if(profileName===OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME||profileName===GATE_B_CURRENT_TESTNET_PROFILE_NAME){
  selection=fields(c.selection,['profileName','operatorTrustAcknowledgement','liveAcknowledgement']);
  policy=(profileName===OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME?selectOperatorTrustedTestnetPolicy:selectGateBCurrentTestnetPolicy)(selection.profileName,selection.operatorTrustAcknowledgement,selection.liveAcknowledgement);
 }else if(profileName===PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROFILE_NAME||profileName===PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME){
  selection=fields(c.selection,['profileName','eventId','rpcEndpoint','operatorTrustAcknowledgement','liveAcknowledgement','wssAcknowledgement']);
  policy=(profileName===PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROFILE_NAME?selectPublicTestnetDynamicPlasmaEpochPolicy:selectPublicTestnetDynamicPlasmaResetEpochExecutionPolicy)(selection);
  if(c.rpcUrl!==selection.rpcEndpoint)fail();
 }else fail();
 if(typeof c.rpcUrl!=='string'||c.rpcUrl.length>4096)fail();const url=new URL(c.rpcUrl);
 if(url.href!==c.rpcUrl||url.username||url.password||url.search||url.hash||url.pathname!=='/'
  ||url.protocol!=='wss:'&&!(url.protocol==='ws:'&&['127.0.0.1','[::1]'].includes(url.hostname)))fail();
 if(!Number.isSafeInteger(c.rpcTimeoutMs)||Object.is(c.rpcTimeoutMs,-0)||c.rpcTimeoutMs<1||c.rpcTimeoutMs>60000)fail();
 const fixed=snapshotActiveUpfrontRequirement(requirement),chain=F(policy.chainProfile());
 if(canonicalJson(chain)!==canonicalJson(fixed.extra.zenonChain))fail();
 return F({operatorTrustedChainPolicy:policy,chainProfile:chain,rpcUrl:c.rpcUrl,rpcTimeoutMs:c.rpcTimeoutMs,
  environment:F({ZENON_LIVE_ACK:selection.liveAcknowledgement,ZENON_NETWORK_ID:'3'}),
  trustMode:policy.trustMode,remoteChainAuthenticated:false,currentNetworkAcceptance:'NOT_ESTABLISHED'});
}
