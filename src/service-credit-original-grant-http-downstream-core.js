import { types } from 'node:util';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,O=Object.hasOwn,A=Reflect.apply;
function fail(){throw new TypeError('ORIGINAL_GRANT_HTTP_DOWNSTREAM_REJECTED');}
function record(v,keys){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||!Object.isFrozen(v)||Reflect.ownKeys(v).length!==keys.length)fail();
  const out={};for(const key of keys){const d=D(v,key);if(!d?.enumerable||!O(d,'value'))fail();out[key]=d.value;}return out;}
function callable(fn){return typeof fn==='function'&&!types.isProxy(fn)&&Object.isFrozen(fn);}
const UNAVAILABLE=F({statusCode:503,contentType:'application/json',body:'{"error":"original_funding_query_unavailable"}',headers:F({
  'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff',Vary:'Authorization, Original-Funding-Query',Connection:'close'})});
/** Four-argument actual ingress seam, with declared read/write capabilities.
 * The opaque transport context is not wire input or proof authentication. */
export function createOriginalFundingGrantHttpDownstreamCore(httpReader,writeResponse){
  if(arguments.length!==2||!callable(writeResponse))fail();const reader=record(httpReader,['handle','close','inspect']);
  if(!Object.values(reader).every(callable))fail();const seen=new WeakSet();let held=false,closed=false,busy=false;
  function claim(value){const done=record(value,['success','failure']);if(!Object.values(done).every(callable)||seen.has(value))fail();seen.add(value);return done;}
  function finish(done,clean){try{if(A(clean?done.success:done.failure,undefined,[])!==undefined)held=true;}catch{held=true;}}
  function context(value){const c=record(value,['peerToken','abort']);if(c.peerToken===null||typeof c.peerToken!=='object'||types.isProxy(c.peerToken)||!Object.isFrozen(c.peerToken)||!callable(c.abort))fail();}
  function readerState(){const state=A(reader.inspect,undefined,[]);if(state===null||typeof state!=='object'||types.isProxy(state)||Object.getPrototypeOf(state)!==Object.prototype||!Object.isFrozen(state))fail();
    const d=D(state,'held');if(!d?.enumerable||!O(d,'value')||typeof d.value!=='boolean')fail();return state;}
  function operation(request,response,transportContext,completion,refused,argc){
    let done;try{done=claim(completion);}catch{held=true;return undefined;}
    let clean=false,entered=false;
    try{
      if(argc!==4)fail();context(transportContext);
      if(busy){held=true;fail();}busy=true;entered=true;
      const frame=refused||closed||held?UNAVAILABLE:A(reader.handle,undefined,[request]);
      if(!refused&&(closed||held))fail();
      if(A(writeResponse,undefined,[response,frame])!==true)fail();
      const state=readerState();if(D(state,'held').value!==false)held=true;
      clean=!held;
    }catch{held=true;}finally{if(entered)busy=false;}
    finish(done,clean);return undefined;
  }
  const handle=F(function handle(request,response,transportContext,completion){return operation(request,response,transportContext,completion,false,arguments.length);});
  const reject=F(function reject(request,response,transportContext,completion){return operation(request,response,transportContext,completion,true,arguments.length);});
  const close=F(function close(completion){
    let done;try{done=claim(completion);}catch{held=true;return undefined;}
    try{if(arguments.length!==1)fail();if(!closed){closed=true;if(busy)held=true;if(A(reader.close,undefined,[])!==undefined)fail();}
      if(D(readerState(),'held').value!==false)held=true;
    }catch{held=true;}finish(done,!held);return undefined;
  });
  const inspect=F(function inspect(){if(arguments.length!==0)fail();return F({held,closed,busy,reader:readerState(),
    transportAuthenticatedByThisComponent:false,storeOwnership:'BORROWED_NEVER_CLOSED',authority:'NONE'});});
  return F({downstream:F({handle,close}),reject,inspect});
}
