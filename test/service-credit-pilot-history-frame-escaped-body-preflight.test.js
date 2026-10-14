import test from 'node:test';
import {equal as q,deepEqual as same,notEqual as ne,throws as t,ok} from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const ADDITION=`  // Body-literal lower bound only; preserve the final full-frame bounds.
  const body = frame.body;
  let units = 2, bytes = 2;
  for (let i = 0; i < body.length; i++) {
    const c = body.charCodeAt(i);
    let u = 1, b = 1;
    if (c === 34 || c === 92 || c === 8 || c === 9 ||
        c === 10 || c === 12 || c === 13) u = b = 2;
    else if (c < 32) u = b = 6;
    else if (c >= 0xd800 && c <= 0xdbff) {
      const next = body.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        u = 2; b = 4; i++;
      } else u = b = 6;
    } else if (c >= 0xdc00 && c <= 0xdfff) u = b = 6;
    else b = c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
    units += u; bytes += b;
    if (units > FRAME_LIMIT || bytes > FRAME_LIMIT) throw new RangeError();
  }
`;
const target=new URL('../src/service-credit-pilot-history-envelope-response-json.js',import.meta.url);
const source=readFileSync(target,'utf8'),marker='function serialize(frame) {\n';
ok(!/[^\x00-\x7f]/.test(source)&&source.endsWith('\n'));
q(Buffer.byteLength(source,'utf8'),3786);
q(createHash('sha256').update(source,'utf8').digest('hex'),'d8ca7d3618986f4a2dbc4838b717fde4136f602a5141337256e935f0ec694dc8');
q(source.split(marker+ADDITION).length,2);
const original=source.replace(marker+ADDITION,marker);
q(Buffer.byteLength(original,'utf8'),3028);
q(createHash('sha256').update(original,'utf8').digest('hex'),'03049dd7bea3a1c8514a12e2d3f8c18d3e500937819c684e04282c838e06d047');
q(source,original.replace(marker,marker+ADDITION));
const {encodeServiceCreditPilotHistoryEnvelopeResponse:e,decodeServiceCreditPilotHistoryEnvelopeResponse:d}=await import(target.href);
const J=JSON.stringify,L=131072;
const frame=(status,headers,body)=>({responseVersion:1,qualification:'UNQUALIFIED',authorization:'NONE',status,headers,body});
const rawAdmitted=body=>ok(body.length<=L&&Buffer.byteLength(body,'utf8')<=L);

 test('escaped body preflight preserves canonical frames and fresh frozen decoding',{timeout:5000},()=>{
  const bodies=Array.from({length:32},(_,i)=>String.fromCharCode(i));
  bodies.push('"','\\',' ','!','/','~','\u007f','\u0080','\u07ff','\u0800','\ud7ff','\ue000','\uffff',
    '\u2028','\u2029','\ud800','\udbff','\udc00','\udfff','\ud800\udc00','\udbff\udfff',
    '\ud800\ud800','\udc00\udc00','\udc00\ud800','\ud800\ud800\udc00','\ud800\udc00\udc00',
    'opaque\r\n\u00e9\ud800\\"\ud83d\ude00');
  const headers={a:'v',constructor:'own-data',z:'last'},hj=J(headers);
  for(const body of bodies)for(const status of [100,201,599]){
    const value=frame(status,headers,body),oracle=J(value);
    q(e(status,hj,body),oracle);q(e(status,hj,body),oracle);
    const first=d(oracle),second=d(oracle);
    same(first,value);same(second,value);q(J(first),oracle);
    ne(first,second);ne(first.headers,second.headers);
    for(const v of [first,second]){
      ok(Object.isFrozen(v)&&Object.isFrozen(v.headers));
      q(Object.getPrototypeOf(v),Object.prototype);q(Object.getPrototypeOf(v.headers),Object.prototype);
      same(Object.keys(v.headers),['a','constructor','z']);ok(Object.hasOwn(v.headers,'constructor'));
      q(v.headers.constructor,'own-data');
      t(()=>{v.body='changed';},TypeError);t(()=>{v.headers.a='changed';},TypeError);
    }
  }
});

test('escaped body and whole-frame UTF16 and UTF8 limits remain distinct',{timeout:5000},()=>{
  const blank=J(frame(200,{},''));
  for(const [token,dimension] of [['x','units'],['"','units'],['\u0000','units'],
    ['\ud800','units'],['\udc00','units'],['\u00e9','bytes'],['\ud83d\ude00','bytes']]){
    const size=s=>dimension==='units'?s.length:Buffer.byteLength(s,'utf8');
    const width=size(J(token))-2,room=L-size(blank);
    const body=token.repeat(Math.floor(room/width))+'x'.repeat(room%width);
    const oracle=J(frame(200,{},body));rawAdmitted(body);q(size(oracle),L);
    q(e(200,'{}',body),oracle);q(d(oracle).body,body);
    const over=body+'x',full=J(frame(200,{},over)),literal=J(over);
    rawAdmitted(over);q(size(full),L+1);
    ok(literal.length<=L&&Buffer.byteLength(literal,'utf8')<=L);
    t(()=>e(200,'{}',over),RangeError);t(()=>d(full),RangeError);
  }
  // Literal fit alone never admits a frame; metadata still requires the final bounds.
  for(const token of ['x','"','\u0000','\ud800','\udc00','\ud83d\ude00']){
    const width=Buffer.byteLength(J(token),'utf8')-2,room=L-2;
    const body=token.repeat(Math.floor(room/width))+'x'.repeat(room%width);
    rawAdmitted(body);q(Buffer.byteLength(J(body),'utf8'),L);ok(J(body).length<=L);
    ok(Buffer.byteLength(J(frame(200,{},body)),'utf8')>L);
    t(()=>e(200,'{}',body),RangeError);
    const over=body+'x';rawAdmitted(over);q(Buffer.byteLength(J(over),'utf8'),L+1);
    t(()=>e(200,'{}',over),RangeError);
  }
  const expansion='\u00e9'.repeat(32768)+'"'.repeat(32768),literal=J(expansion);
  rawAdmitted(expansion);ok(literal.length<=L&&Buffer.byteLength(literal,'utf8')>L);
  t(()=>e(200,'{}',expansion),RangeError);

  // A raw-admitted noncanonical lone-surrogate frame reaches serialization.
  const raw=J(frame(200,{},'')).replace('"body":""','"body":"'+ '\ud800'.repeat(21846)+'"');
  ok(raw.length<=L&&Buffer.byteLength(raw,'utf8')<=L);
  t(()=>d(raw),RangeError);
});

test('escaped body rejection preserves guard priority and successful-cache recovery',{timeout:5000},()=>{
  const headers={a:'v',constructor:'own'},hj=J(headers),body='warm\r\n\u00e9\ud800';
  const valid=e(201,hj,body),before=d(valid),overflow='"'.repeat(65536);
  rawAdmitted(overflow);ok(J(overflow).length>L);
  for(const args of [[],[201],[201,hj],[201,hj,body,undefined]])t(()=>e(...args),TypeError);
  t(()=>d(),TypeError);t(()=>d(valid,undefined),TypeError);
  const sentinel=new Error('UNREACHED_COERCION'),trap=()=>{throw sentinel;};
  const object={get length(){return trap();},get toJSON(){return trap();},[Symbol.toPrimitive]:trap};
  const proxy=new Proxy({},{get:trap,ownKeys:trap,getPrototypeOf:trap});
  for(const value of [undefined,null,true,1,new String(hj),object,proxy,Symbol('fixed'),1n]){
    t(()=>e(201,value,overflow),TypeError);t(()=>e(201,hj,value),TypeError);t(()=>d(value),TypeError);
  }
  for(const h of ['x'.repeat(4097),J({a:'\u00e9'.repeat(2048)})])t(()=>e(201,h,overflow),RangeError);
  for(const b of ['x'.repeat(L+1),'\u00e9'.repeat(65537)])t(()=>e(201,hj,b),RangeError);
  for(const text of ['x'.repeat(L+1),'\u00e9'.repeat(65537)])t(()=>d(text),RangeError);
  for(const status of [99,600,200.5,NaN,Infinity,'201',proxy])t(()=>e(status,hj,overflow),TypeError);
  t(()=>e(201,'{',overflow),SyntaxError);
  for(const h of [' '+hj,'{"a":"v","a":"v"}','{"a":"\\u0076"}','{"a":1}','{"A":"v"}']){
    t(()=>e(201,h,overflow),TypeError);
  }
  t(()=>e(201,hj,overflow),RangeError);
  t(()=>d(valid+' '),TypeError);
  const alternate=e(599,'{"b":"alternate"}','different\\body');q(d(alternate).body,'different\\body');
  q(e(201,hj,body),valid);
  const after=d(valid),again=d(valid);
  same(after,before);q(J(after),valid);ne(after,before);ne(after,again);
  ne(after.headers,before.headers);ne(after.headers,again.headers);
  ok(Object.isFrozen(after)&&Object.isFrozen(after.headers)&&Object.isFrozen(again)&&Object.isFrozen(again.headers));
});
