import { types } from 'node:util';
import { captureApiCreditCliInvocation } from './api-credit-cli-invocation.js';

const F=Object.freeze, DESC=Object.getOwnPropertyDescriptor, OWN=Object.hasOwn;
const REFUSED=F({mode:'EXECUTION_CONTEXT_REFUSED'});
function plainContext(value){
 if(value===null||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)return false;
 const names=['execArgv','nodeOptions','nodePath','preserveSymlinks'];
 if(Reflect.ownKeys(value).length!==names.length)return false;
 const captured={};
 for(const name of names){const d=DESC(value,name);if(!d?.enumerable||!OWN(d,'value'))return false;captured[name]=d.value;}
 if(captured.nodeOptions!==undefined||captured.nodePath!==undefined||captured.preserveSymlinks!==undefined)return false;
 const flags=captured.execArgv;
 if(types.isProxy(flags)||!Array.isArray(flags)||Object.getPrototypeOf(flags)!==Array.prototype)return false;
 const keys=Reflect.ownKeys(flags),length=DESC(flags,'length');
 return keys.length===1&&keys[0]==='length'&&OWN(length,'value')&&length.value===0;
}
/** Fixed plain-process source profile. Metadata cannot undo Node preloads,
 * authenticate bytes or close ordinary package resolution. No context values,
 * descriptors, input objects or loader selectors escape through refusal. */
export function captureApiCreditCliExecutionContext(argv,nodeVersion,releaseName,platform,architecture,execution){
 if(arguments.length!==6)throw new TypeError('API_CREDIT_CLI_EXECUTION_CONTEXT_INPUT');
 const args=captureApiCreditCliInvocation(argv,nodeVersion,releaseName,platform,architecture);
 if(args.mode==='HELP'||args.mode==='RUNTIME_REFUSED')return args;
 return plainContext(execution)?args:REFUSED;
}
