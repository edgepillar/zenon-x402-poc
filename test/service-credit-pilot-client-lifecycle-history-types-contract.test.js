import test from'node:test';
import a from'node:assert/strict';
import{readFileSync}from'node:fs';
const N='getServiceCreditPilotClientLifecycleHistoryResponse';
const P='originalIdentityJson,observationsJson';
test('exact two-string declaration',()=>{
const d=readFileSync(new URL('../src/service-credit-pilot-client-lifecycle-history-response.d.ts',import.meta.url),'utf8');
a.equal(d,"// UNCOMPILED; UNQUALIFIED declared-data only; no runtime authority.\n"+
"import type{ServiceCreditPilotStatusResponse}from'./service-credit-pilot-status-response.js';\n"+
'export function '+N+'(originalIdentityJson: string, observationsJson: string): ServiceCreditPilotStatusResponse;\n');
});
test('public export and guard text',()=>{
const j=readFileSync(new URL('../src/service-credit-pilot-client-lifecycle-history-response.js',import.meta.url),'utf8');
a.deepEqual([j.match(/\bexport\b/g),j.match(/^export function [^\n]+\nconst i=[^\n]+\nif\([^\n]+\n/gm)],
[['export'],['export function '+N+'('+P+'){\n'+
"const i=originalIdentityJson,j=observationsJson,bad=new Error('INVALID_LIFECYCLE_HISTORY_INPUT');\n"+
"if(arguments.length!==2||typeof i!=='string'||typeof j!=='string'||j.length>8192)throw bad;\n"]]);
});
