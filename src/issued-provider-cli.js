import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { captureIssuedProviderCliInvocation } from './issued-provider-cli-invocation.js';

const HELP='Issued API-credit provider source candidate; native/Linux acceptance is OPEN.\n'
 +'node src/issued-provider-cli.js --profile-fd 3 --tls-fd 4 --input-fd 5 --output-fd 6 --bootstrap-ms 1000\n'
 +'Node 24.19.0; plain Linux/macOS x64/arm64 process, without Node flags or loader environment.\n'
 +'Four distinct exclusive operator-owned FIFO ends. Public canonical profile then EOF; binary existing TLS frame then EOF.\n'
 +'Control/output use bounded canonical JSON lines. No stdin, generated key, wallet, secret path or default profile.\n';
export async function runIssuedProviderCli(argv){
 const args=captureIssuedProviderCliInvocation(argv,process.versions.node,process.release.name,process.platform,process.arch,{execArgv:process.execArgv,nodeOptions:process.env.NODE_OPTIONS,nodePath:process.env.NODE_PATH,preserveSymlinks:process.env.NODE_PRESERVE_SYMLINKS});
 if(args.mode==='HELP'){process.stdout.write(HELP);return 0;}
 if(args.mode!=='RUN'){process.stderr.write('ISSUED_PROVIDER_CONTEXT_REFUSED\n');return 1;}
 try{const admission=await import('./issued-provider-native-package-admission.js');if(admission.admitNativeIssuedProviderPackages()!=='READY'){process.stderr.write('ISSUED_PROVIDER_PACKAGES_REFUSED\n');return 4;}
  const {runNativeIssuedProviderOperator}=await import('./issued-provider-native-operator.js');if(admission.readNativeIssuedProviderPackageAdmissionState()!=='READY')throw Error();
  const result=await runNativeIssuedProviderOperator(args,admission.readNativeIssuedProviderPackageAdmissionState);process.stderr.write(result.exitCode===0?'ISSUED_PROVIDER_CLOSED\n':result.exitCode===1?'ISSUED_PROVIDER_INPUT_REFUSED\n':'ISSUED_PROVIDER_HELD\n');return result.exitCode;
 }catch{process.stderr.write('ISSUED_PROVIDER_HELD\n');return 4;}
}
if(process.argv[1]!==undefined&&pathToFileURL(process.argv[1]).href===import.meta.url){try{process.exitCode=await runIssuedProviderCli(process.argv.slice(2));}catch{process.stderr.write('ISSUED_PROVIDER_ARGUMENTS_REFUSED\n');process.exitCode=1;}}
