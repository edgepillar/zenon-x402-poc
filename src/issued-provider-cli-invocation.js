import { types } from 'node:util';
import { captureApiCreditCliExecutionContext } from './api-credit-cli-execution-context.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor;
function fail(){throw new TypeError('ISSUED_PROVIDER_CLI_ARGUMENTS');}
/** Reuse the exact existing plain-process/runtime/FD admission. This entry has
 * RUN uses a TLS channel. Explicit initialization uses only public profile and
 * output descriptors; it never becomes a buyer or history-inspection mode. */
export function captureIssuedProviderCliInvocation(argv,version,release,platform,architecture,execution){
 if(arguments.length!==6||!Array.isArray(argv)||types.isProxy(argv)||Object.getPrototypeOf(argv)!==Array.prototype)fail();
 const n=D(argv,'length')?.value;if(n!==1&&n!==6&&n!==10||Reflect.ownKeys(argv).length!==n+1)fail();const values=[];
 for(let i=0;i<n;i++){const d=D(argv,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value')||typeof d.value!=='string')fail();values.push(d.value);}
 if(n===1){if(values[0]!=='--help')fail();}else if(n===6){if(values[0]!=='--initialize-journal-fd')fail();values[0]='--inspect-fd';}
 else{if(values[2]!=='--tls-fd')fail();values[2]='--key-fd';}
 const selected=captureApiCreditCliExecutionContext(values,version,release,platform,architecture,execution);
 if(n===6&&selected.mode==='INSPECT')return platform==='linux'?F({mode:'INITIALIZE_JOURNAL',profileFd:selected.inspectionFd,outputFd:selected.outputFd,bootstrapMs:selected.bootstrapMs}):F({mode:'RUNTIME_REFUSED'});
 if(selected.mode!=='RUN')return selected;
 return F({mode:'RUN',profileFd:selected.profileFd,tlsFd:selected.keyFd,inputFd:selected.inputFd,outputFd:selected.outputFd,bootstrapMs:selected.bootstrapMs});
}
