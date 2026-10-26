import { run } from 'node:test';
import { tap } from 'node:test/reporters';
import { Writable, finished, pipeline } from 'node:stream';
const files = [
 'qualification/bounded-json-rpc-result-byte-budget.behavior.mjs',
 'qualification/dynamic-plasma-json-rpc-read-transport-current.behavior.mjs',
 'test/service-credit-zenon-funding-json-rpc-read-transport.test.js',
];
const rows = [], source = run({ files, isolation:'none', concurrency:false, timeout:20000, forceExit:false, watch:false });
let failed=false, ended=false, reporterDone=false, outputBytes=0;
source.on('test:pass',data=> {
 if(data.nesting!==0||data.skip!==undefined||data.todo!==undefined)failed=true;
 rows.push(data.name);
});
source.on('test:fail',()=>{failed=true;});
source.on('error',()=>{failed=true;});
source.once('end',()=>{ended=true;});
const sourceDone=new Promise(resolve=>finished(source,{writable:false},error=>{if(error)failed=true;resolve();}));
const sink=new Writable({write(chunk,encoding,callback){
 outputBytes+=Buffer.byteLength(chunk);
 if(outputBytes>196608)return callback(Error('REPORTER_CAP'));
 process.stdout.write(chunk,callback);
}});
const reportDone=new Promise(resolve=>pipeline(source.compose(tap),sink,error=>{reporterDone=!error;if(error)failed=true;resolve();}));
await Promise.all([sourceDone,reportDone]);
const expected=83;
if(failed||!ended||!reporterDone||rows.length!==expected||new Set(rows).size!==expected)process.exitCode=1;
else {
 process.exitCode=0;
 process.stdout.write('# RPC_BYTE_BUDGET_CASE_SELECTION '+JSON.stringify({tests:rows.length,pass:rows.length,
  ended,reporterDone,unique:true,entryFiles:files.length})+'\n');
}
