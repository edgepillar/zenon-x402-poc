import { types } from 'node:util';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor;
function fail(){throw new TypeError('JOURNAL_MOMENTUM_CONFIRMATION_ADVANCE');}
function capture(value){
 const keys=['numConfirmations','momentumHeight','momentumHash','momentumTimestamp'];
 if(value===null||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)fail();
 const out={};for(const key of keys){const d=D(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();Object.defineProperty(out,key,{value:d.value,enumerable:true});}
 for(const key of ['numConfirmations','momentumHeight','momentumTimestamp'])if(!Number.isSafeInteger(out[key])||Object.is(out[key],-0)||out[key]<(key==='momentumTimestamp'?0:1))fail();
 if(typeof out.momentumHash!=='string'||!/^[0-9a-f]{64}$/.test(out.momentumHash))fail();return out;
}

/** Pure comparison of two already selected inclusion details. It performs no
 * chain authentication, record mutation, publication, grant or delivery. Only
 * the count may increase; a different Momentum or regression is a conflict.
 */
export function captureJournalMomentumConfirmationAdvance(currentDetail,nextDetail){
 if(arguments.length!==2)fail();const current=capture(currentDetail),next=capture(nextDetail);
 for(const key of ['momentumHeight','momentumHash','momentumTimestamp'])if(current[key]!==next[key])fail();
 if(next.numConfirmations<current.numConfirmations)fail();
 return F({changed:next.numConfirmations>current.numConfirmations,numConfirmations:next.numConfirmations});
}
