import { types } from 'node:util';
import { captureOriginalFundingGrantSelectedRoute, captureOriginalFundingGrantHttpsRequest } from './service-credit-original-grant-http-binding.js';
import { captureOfficialFundingPostHttpsRoute, captureOfficialFundingPostHttpsRequest } from './x402-official-funding-post-https-request-binding.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,O=Object.hasOwn;
const SERVICE='/service-credit/v1/execute';
function fail(){throw new TypeError('ISSUED_FUNDING_GRANT_REQUEST_REJECTED');}
function own(v,k){if(v===null||typeof v!=='object'||types.isProxy(v))fail();const d=D(v,k);if(!d?.enumerable||!O(d,'value'))fail();return d.value;}
/** Closed three-route source profile; it authenticates no peer or proof. */
export function captureIssuedFundingGrantRoutes(route){
  if(arguments.length!==1)fail();const query=captureOriginalFundingGrantSelectedRoute(route);
  return F({query,funding:captureOfficialFundingPostHttpsRoute(query.fundingResourceUrl),
    origin:query.origin,requestTargets:F(['/funding',SERVICE,query.requestTarget])});
}
function serviceHeaders(raw,authority){
  if(!Array.isArray(raw)||types.isProxy(raw)||Object.getPrototypeOf(raw)!==Array.prototype)fail();
  const d=D(raw,'length');if(!d||!O(d,'value')||!Number.isSafeInteger(d.value)||d.value<2||d.value>128||d.value%2||Reflect.ownKeys(raw).length!==d.value+1)fail();
  const out=Object.create(null);let total=0;
  for(let i=0;i<d.value;i+=2){
    const name=own(raw,String(i)),value=own(raw,String(i+1));
    if(typeof name!=='string'||!name.length||name.length>128||/[^!#$%&'*+\-.^_`|~0-9A-Za-z]/.test(name)
        ||typeof value!=='string'||value.length>16384||/[^\x20-\x7e]/.test(value)||value.trim()!==value)fail();
    total+=name.length+value.length+4;if(total>16384)fail();const lower=name.toLowerCase();
    if(O(out,lower)||['transfer-encoding','content-encoding','trailer','payment-signature','original-funding-query'].includes(lower))fail();out[lower]=value;
  }
  if(out.host!==authority||out['content-type']!=='application/json'||typeof out.authorization!=='string'||!out.authorization.length||out.authorization.length>1024
      ||typeof out['content-length']!=='string'||/^(?:0|[1-9][0-9]*)$/.exec(out['content-length'])?.[0]!==out['content-length']
      ||Number(out['content-length'])>16384)fail();
}
export function captureIssuedFundingGrantRequest(request,routes){
  if(arguments.length!==2)fail();
  // Recapture the source-selected routes; request metadata never selects them.
  const fixed=captureIssuedFundingGrantRoutes(own(routes,'query'));
  if(own(routes,'origin')!==fixed.origin)fail();
  const method=own(request,'method'),target=own(request,'url');
  if(own(request,'httpVersion')!=='1.1')fail();
  if(method==='GET'&&target===fixed.query.requestTarget){captureOriginalFundingGrantHttpsRequest(request,fixed.query);return F({role:'ORIGINAL_GRANT',target});}
  if(method==='POST'&&target==='/funding'){captureOfficialFundingPostHttpsRequest(request,fixed.funding);return F({role:'FUNDING',target});}
  if(method==='POST'&&target===SERVICE){serviceHeaders(own(request,'rawHeaders'),fixed.query.authority);return F({role:'SERVICE',target});}
  fail();
}
