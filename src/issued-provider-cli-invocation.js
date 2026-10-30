import { types } from 'node:util';
import { captureApiCreditCliExecutionContext } from './api-credit-cli-execution-context.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor;
function fail(){throw new TypeError('ISSUED_PROVIDER_CLI_ARGUMENTS');}
/** Reuse the exact existing plain-process/runtime/FD admission. This entry has
 * one RUN grammar with a TLS channel, and no buyer or inspection mode. */
export function captureIssuedProviderCliInvocation(argv,version,release,platform,architecture,execution){
 if(arguments.length!==6||!Array.isArray(argv)||types.isProxy(argv)||Object.getPrototypeOf(argv)!==Array.prototype)fail();
 const n=D(argv,'length')?.value;if(n!==1&&n!==10||Reflect.ownKeys(argv).length!==n+1)fail();const values=[];
 for(let i=0;i<n;i++){const d=D(argv,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value')||typeof d.value!=='string')fail();values.push(d.value);}
 if(n===1){if(values[0]!=='--help')fail();}else{if(values[2]!=='--tls-fd')fail();values[2]='--key-fd';}
 const selected=captureApiCreditCliExecutionContext(values,version,release,platform,architecture,execution);
 if(selected.mode!=='RUN')return selected;
 return F({mode:'RUN',profileFd:selected.profileFd,tlsFd:selected.keyFd,inputFd:selected.inputFd,outputFd:selected.outputFd,bootstrapMs:selected.bootstrapMs});
}
