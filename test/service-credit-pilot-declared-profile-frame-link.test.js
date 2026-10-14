import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Exact changed-source link: pin whole texts before importing the pure graph.
const specs=[
['service-credit-pilot-declared-http-headers.js',2995,'a7e0b90e4c0e56d20b16d04f12fd64a96cef070c26f8ba98b5d6c314e71579d0'],
['service-credit-pilot-history-envelope-response-json.js',3786,'d8ca7d3618986f4a2dbc4838b717fde4136f602a5141337256e935f0ec694dc8'],
['service-credit-pilot-declared-http-response-frame.js',1324,'4619f7b831c4422292014608f3cd31714cd20eef7a3d4c239d1d7a0bcc6842ec']
];
const urls=specs.map(([name])=>new URL('../src/'+name,import.meta.url));
for(let i=0;i<specs.length;i++){
const text=readFileSync(urls[i],'utf8');
assert.ok(!/[^\x00-\x7f]/.test(text)&&text.endsWith('\n'));
assert.equal(Buffer.byteLength(text,'utf8'),specs[i][1]);
assert.equal(createHash('sha256').update(text,'utf8').digest('hex'),specs[i][2]);
}
// Neither these hashes nor synthetic outputs authenticate native custody or HTTP.
const {encodeDeclaredPilotHttpResponseFrame:pe,decodeDeclaredPilotHttpResponseFrame:pd}
=await import(urls[2].href);
const {encodeServiceCreditPilotHistoryEnvelopeResponse:ge,decodeServiceCreditPilotHistoryEnvelopeResponse:gd}
=await import(urls[1].href);
const {parseDeclaredPilotHttpHeaders:parse}=await import(urls[0].href);

const J=JSON.stringify;
const exactTypeError = message => error =>
error instanceof TypeError && error.name === 'TypeError' && error.message === message;

// DECLARED_DATA_ONLY; no instrumentation or transport.
test('pure profile link preserves opaque bodies and distinct frozen record contracts',{timeout:1000},()=>{
const headers={ a:'first',constructor:'own-data',z:'last' };
const hj=J(headers),keys=['a','constructor','z'];
const rs=[parse(hj),parse(hj),parse(hj)];
for (const r of rs) {
assert.equal(Object.getPrototypeOf(r),null);
assert.ok(Object.isFrozen(r));
assert.equal(J(r),hj);
assert.deepEqual(Object.keys(r),keys);
for (const key of keys) {
assert.ok(Object.hasOwn(r,key));
assert.equal(r[key],headers[key]);
assert.deepEqual(Object.getOwnPropertyDescriptor(r,key),{
value:headers[key],writable:false,enumerable:true,configurable:false
});
assert.throws(()=>{ r[key]='changed'; },TypeError);
}
assert.throws(()=>{ r.extra='changed'; },TypeError);
}
for (let i=0; i<rs.length; i++) {
for (let j=i+1; j<rs.length; j++) assert.notEqual(rs[i],rs[j]);
}

const body='opaque\r\n\u00e9\ud800',other='different\r\n\u00e9\ud800';
const declared={ responseVersion:1,qualification:'UNQUALIFIED',authorization:'NONE',
status:201,headers,body };
const text=pe(201,hj,body);
const different=pe(201,hj,other);
assert.equal(text,J(declared));
assert.equal(different,J({ ...declared,body:other }));
assert.equal(ge(201,hj,body),text);
assert.equal(ge(201,hj,other),different);
const vs=[pd(text),pd(text),pd(different),
pd(text),gd(text)];
const texts=[text,text,different,text,text];
const bodies=[body,body,other,body,body];
for (let i=0; i<vs.length; i++) {
const v=vs[i];
assert.equal(J(v),texts[i]);
assert.equal(v.responseVersion,1);
assert.equal(v.qualification,'UNQUALIFIED');
assert.equal(v.authorization,'NONE');
assert.equal(v.status,201);
assert.equal(v.body,bodies[i]);
assert.equal(Object.getPrototypeOf(v),Object.prototype);
assert.equal(Object.getPrototypeOf(v.headers),Object.prototype);
assert.ok(Object.isFrozen(v)&&Object.isFrozen(v.headers));
assert.deepEqual(Object.keys(v.headers),keys);
assert.deepEqual(v.headers,headers);
assert.ok(Object.hasOwn(v.headers,'constructor'));
assert.equal(v.headers.constructor,'own-data');
for (const key of keys) {
assert.deepEqual(Object.getOwnPropertyDescriptor(v.headers,key),{
value:headers[key],writable:false,enumerable:true,configurable:false
});
assert.throws(()=>{ v.headers[key]='changed'; },TypeError);
}
assert.throws(()=>{ v.body='changed'; },TypeError);
assert.throws(()=>{ v.headers.extra='changed'; },TypeError);
}
for (let i=0; i<vs.length; i++) {
for (let j=i+1; j<vs.length; j++) {
assert.notEqual(vs[i],vs[j]);
assert.notEqual(vs[i].headers,vs[j].headers);
}
}
});

test('warm generic success never bypasses the stricter declared header profile',{timeout:1000},()=>{
const vh='{"a":"A","constructor":"own"}',body='valid boundary DATA';
const valid=pe(200,vh,body);
const before=pd(valid);
const cases=[
[{ a:'\r\n' },'Invalid declared header value'],
[{ ['a'.repeat(65)]:'v' },'Invalid declared header name']
];
for (const [headers,message] of cases) {
const text=ge(200,J(headers),'generic boundary DATA');
const seeded=gd(text);
assert.equal(J(seeded),text);
assert.deepEqual(seeded.headers,headers);
for (let attempt=0; attempt<2; attempt++) {
assert.throws(()=>pd(text),exactTypeError(message));
}
}

const canonical='{"a":"A","z":"Z"}';
pe(200,canonical,'representation DATA');
const badH=[
['{"z":"Z","a":"A"}','Declared header names are not in lexical order'],
['{"a":"A","a":"A","z":"Z"}','Declared header JSON is not canonical'],
['{"a":"\\u0041","z":"Z"}','Declared header JSON is not canonical']
];
for (const [text,message] of badH) {
assert.throws(()=>pe(200,text,'representation DATA'),exactTypeError(message));
}
pd(valid);
const badF=[
valid.replace('"qualification":"UNQUALIFIED"','"qualification":"QUALIFIED"'),
valid.replace('"authorization":"NONE"','"authorization":"AUTHORIZED"'),
valid+' '
];
for (const text of badF) {
assert.throws(()=>gd(text),TypeError);
assert.throws(()=>pd(text),TypeError);
}
assert.equal(pe(200,vh,body),valid);
const after=pd(valid);
assert.equal(J(before),valid);
assert.equal(J(after),valid);
assert.deepEqual(after,before);
assert.notEqual(after,before);
assert.notEqual(after.headers,before.headers);
assert.ok(Object.isFrozen(after)&&Object.isFrozen(after.headers));
});

test('warm direct raw guards reject coercion and bounded overflow before valid reuse',{timeout:1000},()=>{
const hj='{"a":"guard","constructor":"own"}',body='guard body';
const text=pe(200,hj,body);
const before=pd(text),hb=parse(hj);
const arity=[
()=>parse(),()=>parse(hj,undefined),
()=>pe(200,hj),()=>pe(200,hj,body,undefined),
()=>ge(200,hj),()=>ge(200,hj,body,undefined),
()=>pd(),()=>pd(text,undefined),
()=>gd(),()=>gd(text,undefined)
];
for (const call of arity) assert.throws(call,TypeError);
// Input hooks throw a distinct non-TypeError.
const sentinel=new Error('UNREACHED_INPUT_COERCION');
const trap=()=>{ throw sentinel; };
const object={ get toJSON() { throw sentinel; },[Symbol.toPrimitive]:trap,toString:trap };
const proxy=new Proxy({},{ get:trap,ownKeys:trap,getPrototypeOf:trap });
for (const v of [undefined,null,true,1,new String(hj),object,proxy,Symbol('fixed'),1n]) {
assert.throws(()=>parse(v),TypeError);
assert.throws(()=>pd(v),TypeError);
assert.throws(()=>gd(v),TypeError);
assert.throws(()=>pe(200,v,body),TypeError);
assert.throws(()=>ge(200,v,body),TypeError);
assert.throws(()=>pe(v,hj,body),TypeError);
assert.throws(()=>ge(v,hj,body),TypeError);
assert.throws(()=>pe(200,hj,v),TypeError);
assert.throws(()=>ge(200,hj,v),TypeError);
}
const largeH=J({ a:'x'.repeat(4096) });
const byteH=J({ a:'\u00e9'.repeat(2048) });
assert.ok(largeH.length>4096);
assert.ok(byteH.length<=4096&&Buffer.byteLength(byteH,'utf8')>4096);
for (const headers of [largeH,byteH]) {
assert.throws(()=>parse(headers),RangeError);
assert.throws(()=>pe(200,headers,body),RangeError);
assert.throws(()=>ge(200,headers,body),RangeError);
}
const meta={ responseVersion:1,qualification:'UNQUALIFIED',authorization:'NONE',
status:200,headers:{ a:'guard' },body:'' };
const largeF=J({ ...meta,body:'x'.repeat(131072) });
const byteF=J({ ...meta,body:'\u00e9'.repeat(65536) });
assert.ok(largeF.length>131072);
assert.ok(byteF.length<=131072&&Buffer.byteLength(byteF,'utf8')>131072);
for (const frame of [largeF,byteF]) {
assert.throws(()=>gd(frame),RangeError);
assert.throws(()=>pd(frame),RangeError);
}
const largeB='x'.repeat(131073);
assert.throws(()=>pe(200,hj,largeB),RangeError);
assert.throws(()=>pe(99,hj,largeB),TypeError);
assert.throws(()=>ge(99,hj,largeB),TypeError);
assert.throws(()=>pe(99,new String(hj),largeB),
exactTypeError('Expected exactly one primitive JSON string'));
assert.throws(()=>ge(99,largeH,largeB),RangeError);
assert.throws(()=>pe(99,largeH,largeB,undefined),TypeError);
assert.equal(pe(200,hj,body),text);
const after=pd(text),again=gd(text),ha=parse(hj);
assert.equal(J(before),text);
assert.equal(J(after),text);
assert.equal(J(again),text);
assert.notEqual(after,before);
assert.notEqual(again,after);
assert.notEqual(after.headers,before.headers);
assert.notEqual(again.headers,after.headers);
assert.ok(Object.isFrozen(after)&&Object.isFrozen(after.headers));
assert.ok(Object.isFrozen(again)&&Object.isFrozen(again.headers));
assert.equal(J(hb),hj);
assert.equal(J(ha),hj);
assert.notEqual(ha,hb);
assert.equal(Object.getPrototypeOf(ha),null);
assert.ok(Object.isFrozen(ha));
});

test('exact TypeError matcher rejects name and message lookalikes',{timeout:1000},()=>{
const message='synthetic matched message';
const matches=exactTypeError(message);
const ordinary=new Error(message);
ordinary.name='TypeError';
for (const error of [{ name:'TypeError',message },ordinary]) {
assert.equal(matches(error),false);
// The old property matcher alone accepts both of these non-TypeErrors.
assert.throws(()=>{ throw error; },{ name:'TypeError',message });
assert.throws(()=>assert.throws(()=>{ throw error; },matches),assert.AssertionError);
}
const real=new TypeError(message);
assert.equal(matches(real),true);
assert.throws(()=>{ throw real; },matches);
const wrongName=new TypeError(message);
wrongName.name='Error';
for (const error of [new TypeError(message+' differs'),wrongName]) {
assert.equal(matches(error),false);
assert.throws(()=>assert.throws(()=>{ throw error; },matches),assert.AssertionError);
}
});
