import { types } from 'node:util';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor;
function fail(){throw new TypeError('ISSUED_PROVIDER_ORIGINAL_OBSERVER_ADMISSION');}
function fields(value,names,frozen=false){
  if(value===null||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype
      ||Reflect.ownKeys(value).length!==names.length||frozen&&!Object.isFrozen(value))fail();
  const out={};for(const name of names){const d=D(value,name);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();out[name]=d.value;}return out;
}
function tuple(value,frozen=false){
  const c=fields(value,['observerFileName','recordKey'],frozen);
  if(typeof c.observerFileName!=='string'||!/^funding-observer-[0-9a-f]{64}\.sqlite$/.test(c.observerFileName)
      ||typeof c.recordKey!=='string'||!/^sha256:[0-9a-f]{64}$/.test(c.recordKey))fail();return c;
}

/** Fixed native ports select the retained original tuple before file entry.
 * DATA supplies declared memory ports. No observer/chain authentication,
 * activation, fallback, retry, raw close or release claim is introduced.
 * The actual opener's return passes untouched to its existing owner frame. */
export function enterIssuedProviderOriginalObserver(argument,ports){
  if(arguments.length!==2)fail();const input=tuple(argument),p=fields(ports,['check','select','open'],true);
  for(const fn of Object.values(p))if(typeof fn!=='function'||types.isProxy(fn)||!Object.isFrozen(fn))fail();
  if(new Set(Object.values(p)).size!==3)fail();
  if(p.check()!==undefined)fail();
  const selected=tuple(p.select(F(input)),true);
  if(selected.observerFileName!==input.observerFileName||selected.recordKey!==input.recordKey)fail();
  if(p.check()!==undefined)fail();
  return p.open(F(selected));
}
