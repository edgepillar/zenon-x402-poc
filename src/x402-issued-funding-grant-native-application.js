// SOURCE/PARSER ONLY. One shared listener; actual SQL/core/TLS is unexecuted.
import { types } from 'node:util';
import { hrtime } from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import { createIssuedFundingGrantApplicationCore } from './x402-issued-funding-grant-application-core.js';
import { createDurableOfficialFundingPostIntakeComposition } from './x402-official-funding-post-intake-composition.js';
import { createServiceCreditBoundedHttpsIngressOwnerForIssuedFundingGrant } from './service-credit-bounded-https-ingress-owner.js';
import { createDurableServiceCreditHttpSession } from './service-credit-durable-http-session.js';
import { createOriginalFundingGrantNativeHttpDownstream } from './service-credit-original-grant-native-http-downstream.js';
import { ZenonFundingIntakeSqliteStore } from './service-credit-zenon-funding-intake-sqlite-store.js';
import { ServiceCreditSqliteStore } from './service-credit-sqlite-store.js';
import { createServiceCreditBoundedNodeHttpsServerFactory } from './service-credit-bounded-node-https-server-factory.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,A=Reflect.apply;
const INTAKE=ZenonFundingIntakeSqliteStore.prototype,SERVICE=ServiceCreditSqliteStore.prototype;
const LOAD=D(INTAKE,'loadBound').value,GET=D(SERVICE,'getGrant').value;
const CUSTODY=D(INTAKE,'officialOutcomeCustody').value;
const CLOCK=hrtime.bigint,SCHEDULE=setTimeout,CANCEL=clearTimeout;
function exact(value,keys){
  if(value===null||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)
    throw new TypeError('ISSUED_FUNDING_GRANT_NATIVE_CONFIGURATION');
  const out={};for(const key of keys){const d=D(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))throw new TypeError('ISSUED_FUNDING_GRANT_NATIVE_CONFIGURATION');out[key]=d.value;}return out;
}
function brand(value,prototype,name,method){
  if(value===null||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==prototype
      ||Object.hasOwn(value,name)||D(prototype,name)?.value!==method)throw new TypeError('ISSUED_FUNDING_GRANT_NATIVE_STORE');
}
/** Fixed native factories only. Both SQL stores are borrowed; activation stays
 * external and explicit. Never reopen, replace or force-close a held owner. */
export function createIssuedFundingGrantNativeApplication(options){
  if(arguments.length!==1)throw new TypeError('ISSUED_FUNDING_GRANT_NATIVE_CONFIGURATION');
  const c=exact(options,['funding','service','transport']);
  const t=exact(c.transport,['origin','generation','limits','bind','tlsMaterial']),s=exact(c.service,['store','execute','selectedDurationMs']);
  const bind=F(exact(t.bind,['host','port','exclusive'])),tlsMaterial=F(exact(t.tlsMaterial,['key','cert']));
  const schedule=F((callback,delay)=>SCHEDULE(callback,delay)),cancel=F(token=>{CANCEL(token);});
  // Material is copied by the real factory only when the owned start enters
  // server construction. A refused core constructor acquires no TLS copy.
  const nativeServerFactory=F((settings,callbacks)=>createServiceCreditBoundedNodeHttpsServerFactory(F({bind,tlsMaterial}))(settings,callbacks));
  const transport=F({origin:t.origin,generation:t.generation,limits:t.limits,deadlineRuntime:F({schedule,cancel}),httpsServerFactory:nativeServerFactory});
  const service=F({...s,deadlineRuntime:F({monotonicNowNs:F(()=>A(CLOCK,hrtime,[])),schedule,cancel})});
  return createIssuedFundingGrantApplicationCore(F({...c,service,transport}),F({
    createFunding:F(c=>createDurableOfficialFundingPostIntakeComposition(c)),
    createIngress:F((c,route)=>createServiceCreditBoundedHttpsIngressOwnerForIssuedFundingGrant({...c,httpsServerFactory:nativeServerFactory},route)),
    createServiceSession:F(c=>createDurableServiceCreditHttpSession(c)),
    createQueryDownstream:F((store,route)=>createOriginalFundingGrantNativeHttpDownstream(store,route)),
    validateStores:F((intake,service)=>{brand(intake,INTAKE,'loadBound',LOAD);brand(intake,INTAKE,'officialOutcomeCustody',CUSTODY);brand(service,SERVICE,'getGrant',GET);}),
    loadBound:F(store=>{brand(store,INTAKE,'loadBound',LOAD);return A(LOAD,store,[]);}),
    readCommittedGrant:F((store,id)=>{brand(store,SERVICE,'getGrant',GET);return A(GET,store,[id]);}),
  }));
}
