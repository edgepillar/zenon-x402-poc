import { types } from 'node:util';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,P=Object.getPrototypeOf,K=Reflect.ownKeys;
const FIELDS=['policyVersion','maxFusedPlasma','maxMomentumAdvances'];
function fail(){const e=new TypeError('NON_DP_FUSED_RESOURCE_POLICY');Object.defineProperty(e,'stack',{value:e.message});throw F(e);}
/** Pure explicit policy DATA admission. No observation, quote, owner, key,
 * reservation or work is obtained. The original input is never normalized. */
export function captureNonDpFusedResourcePolicy(input){
  if(arguments.length!==1||new.target!==undefined||D(Object.prototype,'then')!==undefined||D(Object.prototype,'toJSON')!==undefined
      ||input===null||typeof input!=='object'||types.isProxy(input)||P(input)!==Object.prototype||K(input).length!==FIELDS.length)fail();
  const out={};
  for(const field of FIELDS){const d=D(input,field);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();out[field]=d.value;}
  if(out.policyVersion!==1)fail();
  for(const [field,min,max]of [['maxFusedPlasma',1,Number.MAX_SAFE_INTEGER],['maxMomentumAdvances',0,128]]){
    const value=out[field];if(!Number.isSafeInteger(value)||Object.is(value,-0)||value<min||value>max)fail();
  }
  return F(out);
}
