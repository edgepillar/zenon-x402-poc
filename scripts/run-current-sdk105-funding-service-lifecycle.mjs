import { run } from 'node:test';
import { tap } from 'node:test/reporters';
import { fileURLToPath } from 'node:url';
if(process.version!=='v24.19.0'||process.argv.length!==2||process.env.X402_SDK105_SERVICE_LIFETIME!=='builtin-only-original-key-close-handoff')
  throw Error('EXPLICIT_SDK105_SERVICE_LIFETIME_CONTROL_REQUIRED');
const file=fileURLToPath(new URL('../qualification/sdk105-funding-service-lifecycle.behavior.mjs',import.meta.url));
const stream=run({files:[file],isolation:'none',concurrency:false,timeout:20000});
let passed=0,failed=0,skipped=0,bytes=0;
stream.on('data',e=>{if(e.type==='test:pass'&&e.data.nesting===0){passed++;if(e.data.skip||e.data.todo)skipped++;}
  if(e.type==='test:fail')failed++;});
for await(const part of stream.compose(tap)){const text=String(part);bytes+=Buffer.byteLength(text);
  if(bytes>196608)throw Error('SDK105_SERVICE_LIFETIME_TAP_CAP');process.stdout.write(text);}
if(passed!==21||failed!==0||skipped!==0)process.exitCode=1;
