// Fixed bounded HTTP refusal collector over an explicitly supplied request port.
// No native transport, socket, timer, key, signature, SDK or store is selected.
import { Buffer } from 'node:buffer';
import { types } from 'node:util';
const F=Object.freeze, EXPECTED='{"error":"unauthorized"}';
function fail(){return new TypeError('API_CREDIT_LINUX_NEGATIVE_HTTP_UNKNOWN');}
function record(v,names){
 if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==names.length)throw fail();
 const c={};for(const k of names){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))throw fail();c[k]=d.value;}return c;
}
function headers(raw){
 if(!Array.isArray(raw)||types.isProxy(raw)||Object.getPrototypeOf(raw)!==Array.prototype||raw.length<10||raw.length>128||raw.length%2)throw fail();
 const found={};let bytes=0;
 for(let i=0;i<raw.length;i+=2){
  const a=Object.getOwnPropertyDescriptor(raw,String(i)),b=Object.getOwnPropertyDescriptor(raw,String(i+1));
  if(!a?.enumerable||!b?.enumerable||!Object.hasOwn(a,'value')||!Object.hasOwn(b,'value'))throw fail();
  const k=a.value,v=b.value;if(typeof k!=='string'||typeof v!=='string'||!/^[A-Za-z][A-Za-z0-9-]{0,127}$/.test(k)||!/^[\x20-\x7e]*$/.test(v))throw fail();
  bytes+=Buffer.byteLength(k)+Buffer.byteLength(v);const name=k.toLowerCase();
  if(bytes>16384||Object.hasOwn(found,name)||!['cache-control','content-type','vary','x-content-type-options','content-length','www-authenticate','date','connection'].includes(name))throw fail();
  Object.defineProperty(found,name,{value:v,enumerable:true});
 }
 if(found['cache-control']!=='private, no-store, max-age=0'||found['content-type']!=='application/json'||found.vary!=='Authorization'
   ||found['x-content-type-options']!=='nosniff'||found['www-authenticate']!=='ServiceCredit'||found['content-length']!==String(Buffer.byteLength(EXPECTED))
   ||Object.hasOwn(found,'connection')&&found.connection!=='close')throw fail();
}
/** One known port call and zero-argument end. A matched result requires exact
 * status/headers/body, complete end and BOTH request/response close events.
 * Failure leaves cleanup to the fixed native client owner; no handle is raw
 * destroyed, retried, reopened or classified released by this helper. */
export function collectApiCreditNegativeHttpReply(options){
 if(arguments.length!==1)throw fail();const c=record(options,['resourceUrl','authorizationHeader','requestImpl']);
 if(typeof c.resourceUrl!=='string'||new URL(c.resourceUrl).protocol!=='https:'||new URL(c.resourceUrl).hostname!=='127.0.0.1'
   ||Number(new URL(c.resourceUrl).port||443)<1024||new URL(c.resourceUrl).pathname!=='/service-credit/v1/execute'||new URL(c.resourceUrl).href!==c.resourceUrl||new URL(c.resourceUrl).search||new URL(c.resourceUrl).hash
   ||new URL(c.resourceUrl).username||new URL(c.resourceUrl).password||typeof c.authorizationHeader!=='string'||Buffer.byteLength(c.authorizationHeader)>1024
   ||!/^ServiceCredit [A-Za-z0-9_-]+$/.test(c.authorizationHeader)||typeof c.requestImpl!=='function'||types.isProxy(c.requestImpl))throw fail();
 return new Promise((resolve,reject)=>{
  let request=null,response=null,requestClosed=false,responseClosed=false,ended=false,settled=false,returned=false,body=Buffer.alloc(Buffer.byteLength(EXPECTED)),received=0,chunks=0;
  function bad(){if(!settled){settled=true;body.fill(0);body=null;reject(fail());}}
  function done(){
   if(settled||!returned||!requestClosed||!responseClosed||!ended)return;
   if(response.complete!==true||received!==Buffer.byteLength(EXPECTED)||body.toString('utf8',0,received)!==EXPECTED){bad();return;}
   settled=true;body.fill(0);body=null;resolve(F({statusCode:401,body:EXPECTED,requestClosed:true,responseClosed:true,responseComplete:true}));
  }
  function listen(target,event,callback){
   if(target===null||typeof target!=='object'||types.isProxy(target)||typeof target.on!=='function')throw fail();
   target.on(event,(...args)=>{if(settled)return;try{callback(...args);}catch{bad();}});
  }
  try{
   const options=F({method:'POST',headers:F({Authorization:c.authorizationHeader}),agent:false,rejectUnauthorized:true,maxHeaderSize:16384,insecureHTTPParser:false});
   request=Reflect.apply(c.requestImpl,undefined,[c.resourceUrl,options,target=>{
    try{
     if(response!==null||settled||target===null||typeof target!=='object'||types.isProxy(target))throw fail();response=target;
     if(response.statusCode!==401)throw fail();headers(response.rawHeaders);
     listen(response,'error',bad);listen(response,'aborted',bad);
     listen(response,'data',chunk=>{
      if(ended||++chunks>512||!Buffer.isBuffer(chunk)||types.isProxy(chunk)||Object.getPrototypeOf(chunk)!==Buffer.prototype||received+chunk.length>Buffer.byteLength(EXPECTED))throw fail();
      body.set(chunk,received);received+=chunk.length;
     });
     listen(response,'end',()=>{if(ended)throw fail();ended=true;if(response.complete!==true)throw fail();done();});
     listen(response,'close',()=>{if(responseClosed||!ended)throw fail();responseClosed=true;done();});
    }catch{bad();}
   }]);
   if(request===null||typeof request!=='object'||types.isProxy(request)||typeof request.end!=='function')throw fail();
   listen(request,'error',bad);listen(request,'close',()=>{if(requestClosed)throw fail();requestClosed=true;if(response===null)throw fail();done();});
   returned=true;if(!settled)Reflect.apply(request.end,request,[]);done();
  }catch{bad();}
 });
}
