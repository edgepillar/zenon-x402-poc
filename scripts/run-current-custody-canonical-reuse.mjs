import { run } from 'node:test';
import { tap } from 'node:test/reporters';
import { Writable, finished, pipeline } from 'node:stream';
const files = [
 'qualification/custody-canonical-text-reuse.behavior.mjs',
 'qualification/original-request-custody-current.behavior.mjs',
 'qualification/original-dispatch-intent-current.behavior.mjs',
 'qualification/custodied-recovery-observation-collection-current.behavior.mjs',
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
const expected=38;
if(failed||!ended||!reporterDone||rows.length!==expected||new Set(rows).size!==expected)process.exitCode=1;
else {
 process.exitCode=0;
 process.stdout.write('# CURRENT_CUSTODY_CANONICAL_CASE_SELECTION '+JSON.stringify({tests:rows.length,pass:rows.length,
  ended,reporterDone,unique:true,entryFiles:files.length})+'\n');
}
