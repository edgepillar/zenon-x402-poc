import test from 'node:test';
import {equal as q,deepEqual as same,notEqual as ne,throws as t,ok} from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const selector = process.argv[2] ?? 'all';
if (process.argv.length > 3 || !['all','1','2','3'].includes(selector)) {
  throw new Error('INVALID_SCENARIO_SELECTOR');
}

const specs = [
  ['../src/service-credit-pilot-history-envelope-response-json.js',3786,
    'd8ca7d3618986f4a2dbc4838b717fde4136f602a5141337256e935f0ec694dc8'],
  ['../src/service-credit-pilot-declared-http-response-frame.js',1324,
    '4619f7b831c4422292014608f3cd31714cd20eef7a3d4c239d1d7a0bcc6842ec'],
  ['../src/service-credit-pilot-declared-http-headers.js',2995,
    'a7e0b90e4c0e56d20b16d04f12fd64a96cef070c26f8ba98b5d6c314e71579d0'],
];
const sources = Object.freeze(specs.map(([path,bytes,sha]) => {
  const url = new URL(path,import.meta.url);
  const raw = readFileSync(url);
  q(raw.length,bytes);
  q(createHash('sha256').update(raw).digest('hex'),sha);
  return Object.freeze({url:url.href,text:raw.toString('utf8')});
}));
const src = sources[0].text;
const T=TypeError,R=RangeError,S=SyntaxError,O=Object;

// Remove only the encoder cache; retain the current escaped-body preflight.
const changes = [
  [
    "let lastDecodedFrame;\n",
    "let lastDecodedFrame;\n\n// One successful raw header declaration for encoding; each frame stays fresh.\nlet lastEncodedHeadersJson;\nlet lastEncodedHeaders;\n",
  ],
  [
    "  const headers = JSON.parse(headersJson);\n",
    "  const headers = lastEncodedHeaders && headersJson === lastEncodedHeadersJson\n    ? lastEncodedHeaders : JSON.parse(headersJson);\n",
  ],
  [
    "  return serialize(frame);\n",
    "  const text = serialize(frame);\n  lastEncodedHeadersJson = headersJson;\n  lastEncodedHeaders = headers;\n  return text;\n",
  ],
];
let v = src;
for (const [old,next] of changes) {
  q(v.split(next).length,2);
  v = v.replace(next,old);
}
q(Buffer.byteLength(v,'utf8'),3473);
q(createHash('sha256').update(v,'utf8').digest('hex'),
  '134a02f6e209fb0a6f6e6cafd9dd7517fd6227447b3ea7b6c57929afc057c736');

// All three source pins precede every production or controlled-copy import.
const {
  encodeServiceCreditPilotHistoryEnvelopeResponse:e,
  decodeServiceCreditPilotHistoryEnvelopeResponse:d,
} = await import(sources[0].url);
const {
  encodeDeclaredPilotHttpResponseFrame:pe,
  decodeDeclaredPilotHttpResponseFrame:pd,
} = await import(sources[1].url);

const P="import { Buffer } from 'node:buffer';\n",J=JSON.stringify;
q(src.slice(0,P.length),P);
const url = s => 'data:text/javascript,' + encodeURIComponent(s);
let seq = 0;

// Counts belong only to the bound lexical JSON facade, not global/native/
// production parse counts or performance. These are declared unit fixtures.
async function copy(code) {
  ok(code === src || code === v);
  q(code.slice(0,P.length),P);
  const u = url('const N=globalThis.JSON;export const n={parse:0};export const JSON={parse(s){n.parse++;return N.parse(s);},stringify(v){return N.stringify(v);}};\n// fixture '+(++seq));
  const f = await import(u);
  const m = await import(url(P+'import{JSON}from '+J(u)+';\n'+code.slice(P.length)));
  return {e:m.encodeServiceCreditPilotHistoryEnvelopeResponse,n:f.n};
}

const scenarios = [
  ['encoder exact header repeats retain fresh frames and opaque bodies',async () => {
    const bb=['\r\n\u00e9\ud800','changed\r\n\u00e9\ud800','last\r\n\u00e9\ud800'];
    for (const h of ['{}','{"z":"Z","constructor":"own","a":"A"}',J({['a'.repeat(65)]:'\r\n'})]) {
      const pre=await copy(v),post=await copy(src),fs=[],raw=JSON.parse(h);
      const hs=O.fromEntries(O.keys(raw).sort().map(k=>[k,raw[k]]));
      for (let i=0;i<3;i++) {
        const s=post.e(200+i,h,bb[i]);
        q(s,pre.e(200+i,h,bb[i]));
        q(s,e(200+i,h,bb[i]));
        q(s,J({
          responseVersion:1,qualification:'UNQUALIFIED',authorization:'NONE',
          status:200+i,headers:hs,body:bb[i],
        }));
        fs.push(d(s));
      }
      q(pre.n.parse,3);
      q(post.n.parse,1);
      for (let i=0;i<fs.length;i++) {
        for (const r of [fs[i],fs[i].headers]) {
          q(O.getPrototypeOf(r),O.prototype);
          ok(O.isFrozen(r));
          for (const k of O.keys(r)) {
            same(O.getOwnPropertyDescriptor(r,k),{
              value:r[k],writable:false,enumerable:true,configurable:false,
            });
          }
        }
        t(()=>{fs[i].status=599;},T);
        t(()=>{fs[i].headers.a='changed';},T);
        for (let j=0;j<i;j++) {
          ne(fs[i],fs[j]);
          ne(fs[i].headers,fs[j].headers);
        }
      }
    }
  }],
  ['encoder one success slot evicts and never installs rejected calls',async () => {
    const f=await copy(src),A='{"a":"A"}',B='{"b":"B"}',
      big='x'.repeat(131073),good=f.e(200,A,'ok');
    f.e(200,B,'ok');
    f.e(200,A,'ok');
    f.e(200,A,'ok');
    q(f.n.parse,3);
    const cases=[
      ['{',S,99,big],
      ['{"a":"A","a":"A"}',T],
      ['{"a":"\\u0041"}',T],
      [' '+A,T],
      ['null',T],
      ['[]',T],
      ['{"a":1}',T],
      ['{"A":"v"}',T],
      [J(O.fromEntries(Array.from({length:33},(_,i)=>['a'+i,'v']))),R],
      [B,T,99,big],
      [B,T,200,0],
      [B,R,200,big],
      [B,R,200,big.slice(1)],
      [B,R,200,'"'.repeat(66000)],
    ];
    for (const [h,E,s=200,b='ok'] of cases) {
      for (let i=0;i<2;i++) {
        const n=f.n.parse;
        t(()=>f.e(s,h,b),E);
        q(f.n.parse,n+1);
        q(f.e(200,A,'ok'),good);
        q(f.n.parse,n+1);
      }
    }
  }],
  ['warmed encoder raw guards and unchanged declared profile stay strict',async () => {
    const f=await copy(src),A='{"a":"A"}',V=e(200,A,'ok');
    f.e(200,A,'ok');
    for (const args of [[],[200,A],[200,A,'ok',undefined]]) {
      t(()=>f.e(...args),T);
    }
    const z=new Error('UNREACHED_COERCION'),trap=()=>{throw z;};
    const o={get toJSON(){throw z;},[Symbol.toPrimitive]:trap};
    const p=new Proxy({},{get:trap,ownKeys:trap,getPrototypeOf:trap});
    const vv=[undefined,null,1,new String(A),o,p,Symbol('fixed'),1n];
    for (const v of vv) t(()=>f.e(200,v,'ok'),T);
    for (const v of vv) t(()=>f.e(200,A,v),T);
    for (const s of [99,600,1.5,NaN,Infinity,o,p,1n]) t(()=>f.e(s,A,'ok'),T);
    for (const h of ['x'.repeat(4097),'\u00e9'.repeat(2049)]) {
      t(()=>f.e(200,h,'ok'),R);
    }
    for (const b of ['x'.repeat(131073),'\u00e9'.repeat(65537)]) {
      t(()=>f.e(200,A,b),R);
    }
    t(()=>f.e(99,A,'x'.repeat(131073)),T);
    q(f.n.parse,1);
    q(f.e(200,A,'ok'),V);
    q(f.n.parse,1);
    const H='{"z":"Z","a":"A"}';
    for (const h of [
      J({a:'\r\n'}),J({['a'.repeat(65)]:'v'}),H,
      J({a:'\u00e9'}),J({a:'x'.repeat(2049)}),
    ]) {
      const s=e(200,h,'profile DATA');
      d(s);
      q(e(200,h,'profile DATA'),s);
      for (let i=0;i<2;i++) {
        t(()=>pe(200,h,'profile DATA'),T);
        if (h!==H) t(()=>pd(s),T);
      }
      if (h===H) q(J(pd(s)),s);
    }
    const s=pe(200,A,'ok'),a1=pd(s),a2=pd(s);
    q(s,V);
    q(J(a1),V);
    q(J(a2),V);
    ne(a1,a2);
    ne(a1.headers,a2.headers);
    ok(O.isFrozen(a1)&&O.isFrozen(a1.headers));
  }],
];

for (let index=0;index<scenarios.length;index++) {
  if (selector === 'all' || selector === String(index+1)) {
    const [name,run] = scenarios[index];
    test(name,{timeout:1000},run);
  }
}
