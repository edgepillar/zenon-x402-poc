import { run } from 'node:test';
import { tap } from 'node:test/reporters';
import { fileURLToPath } from 'node:url';
if(process.version!=='v24.19.0'||process.argv.length!==2||process.env.X402_SDK105_OWNED_WALLET!=='builtin-only-sync-sdk-shaped-data'){
  throw Error('EXPLICIT_SDK105_OWNED_WALLET_CONTROL_REQUIRED');
}
const file=fileURLToPath(new URL('../qualification/sdk105-owned-wallet-funding.behavior.mjs',import.meta.url));
const stream=run({files:[file],isolation:'none',concurrency:false,timeout:20000});
let passed=0,failed=0,skipped=0,output=0;
stream.on('data',event=>{
  if(event.type==='test:pass'&&event.data.nesting===0){passed++;if(event.data.skip||event.data.todo)skipped++;}
  if(event.type==='test:fail')failed++;
});
for await(const part of stream.compose(tap)){
  const text=String(part);output+=Buffer.byteLength(text);if(output>196608)throw Error('SDK105_OWNED_WALLET_TAP_CAP');process.stdout.write(text);
}
if(passed!==27||failed!==0||skipped!==0)process.exitCode=1;
