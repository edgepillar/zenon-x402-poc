import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import { canonicalJson } from './canonical.js';
import { decodeB64Json, validatePaymentRequired, validateActiveUpfrontRequirement } from './x402-wire.js';
import { captureFundingPostCheckpointRoute } from './x402-funding-post-checkpoint-route.js';

const F = Object.freeze, DESC = Object.getOwnPropertyDescriptor, PROTO = Object.getPrototypeOf;
const KEYS = Reflect.ownKeys, OWN = Object.hasOwn, DEFINE = Object.defineProperty;
const IS_PROXY = utilTypes.isProxy, CANONICAL = canonicalJson;

/**
 * Source-owned formation of ONE issued funding challenge at the actual SDK
 * enrichment hook, BEFORE the existing bridge captures its context. The SDK
 * 2.23 HTTP layer adds empty description/mimeType fields; the actual intake's
 * signed resource contract has ONLY url/tags. Never rewrite a signed payload,
 * header, requirement, selected-view identity or already-captured context.
 *
 * Inputs in component tests are declared DATA, not an actual SDK/intake or
 * issuance proof. This does not bind/settle/fund, create a grant, authenticate
 * a native peer or assert installed-package compatibility by version label.
 */
export function createIssuedFundingPostSdkResourceBinding(frame, resourceUrl) {
  if (arguments.length !== 2) fail();
  let original, retainedHeader;
  try {
    captureFundingPostCheckpointRoute(resourceUrl);
    const fixed = exact(frame, ['status','paymentRequiredHeader','body']);
    if (fixed.status !== 402 || fixed.body !== 'Payment Required') fail();
    const required = decodeB64Json(fixed.paymentRequiredHeader, { maxEncodedBytes: 5464, maxDecodedBytes: 4096 });
    validatePaymentRequired(required);
    if (required.x402Version !== 2 || KEYS(required).length !== 3 || required.accepts.length !== 1) fail();
    validateActiveUpfrontRequirement(required.accepts[0]);
    const resource = exact(required.resource, ['url','tags']);
    if (resource.url !== resourceUrl) fail();
    tags(resource.tags);
    if (Buffer.from(CANONICAL(required), 'utf8').toString('base64') !== fixed.paymentRequiredHeader) fail();
    retainedHeader = fixed.paymentRequiredHeader;
    original = snapshot(required);
  } catch { fail(); }
  const RESOURCE = original.resource, REQUIREMENT = original.accepts[0], EXPECTED = CANONICAL(original);
  const FRAME = F({ status: 402, paymentRequiredHeader: retainedHeader, body: 'Payment Required' });
  let used = false, held = false, captureEntered = false, resourceFormed = false;
  const selection = F(function selection() {
    if (arguments.length !== 0) fail();
    return F({ frame: FRAME, paymentRequired: original, resource: RESOURCE, requirement: REQUIREMENT,
      authority: 'NONE', issuanceAuthenticated: false });
  });
  const capture = F(function capture(context) {
    if (arguments.length !== 1 || used || held) fail();
    // One source-owned enrichment entry; refusal cannot renew a context.
    used = true; captureEntered = true;
    try {
      const c = exact(context, ['requirements','paymentPayload','resourceInfo','error','paymentRequiredResponse','transportContext']);
      const response = c.paymentRequiredResponse;
      const s = exact(response, ['x402Version','error','resource','accepts']);
      // The pinned HTTP upfront caller does NOT pass paymentPayload into this
      // hook. The actual server checks its original header before SDK entry;
      // this hook forms only the unsigned challenge, not a signed-payload view.
      if (c.paymentPayload !== undefined || c.error !== undefined || s.error !== undefined || s.x402Version !== 2
          || s.resource !== c.resourceInfo || s.accepts !== c.requirements
          || c.transportContext === null || typeof c.transportContext !== 'object' || IS_PROXY(c.transportContext)) fail();
      const generated = exact(c.resourceInfo, ['url','description','mimeType','tags']);
      if (generated.url !== RESOURCE.url || generated.description !== '' || generated.mimeType !== ''
          || CANONICAL(tags(generated.tags)) !== CANONICAL(RESOURCE.tags)) fail();
      const formed = snapshot({ x402Version: s.x402Version, resource: RESOURCE, accepts: s.accepts });
      if (CANONICAL(formed) !== EXPECTED) fail();
      const d = DESC(response, 'resource');
      if (!d || !OWN(d, 'value') || !d.enumerable || !d.writable || !d.configurable) fail();
      // Mutate only the SDK-owned UNSIGNED response before bridge capture.
      // The original SDK context/response/selected views and payload survive.
      DEFINE(response, 'resource', { ...d, value: RESOURCE });
      resourceFormed = true;
      return context;
    } catch { held = true; fail(); }
  });
  const inspect = F(function inspect() {
    if (arguments.length !== 0) fail();
    return F({ issuedFundingPostSdkResourceVersion: 1, used, held, captureEntered, resourceFormed,
      signedPayloadRewritten: false, selectedViewsReplaced: false, sdkQualified: false, authority: 'NONE' });
  });
  return F({ selection, capture, inspect });
}
function tags(value) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) || !Array.isArray(value)
      || PROTO(value) !== Array.prototype || KEYS(value).length !== 4) fail();
  const length = DESC(value, 'length');
  if (!length || !OWN(length, 'value') || length.value !== 3) fail();
  const out = [own(value,'0'),own(value,'1'),own(value,'2')];
  if (out[0] !== 'x402-service-credit-funding-v1' || typeof out[1] !== 'string'
      || typeof out[2] !== 'string' || !/^[0-9a-f]{32}$/.test(out[1]) || !/^[0-9a-f]{32}$/.test(out[2])) fail();
  return F(out);
}
function exact(value, fields) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) || PROTO(value) !== Object.prototype
      || KEYS(value).length !== fields.length) fail();
  const out = {};
  for (const field of fields) DEFINE(out, field, { value: own(value,field), enumerable: true });
  return out;
}
function own(value, field) {
  const d = DESC(value, field); if (!d || !OWN(d,'value') || !d.enumerable) fail(); return d.value;
}
function snapshot(value, depth = 0, budget = { nodes: 4096, bytes: 131072 }) {
  if (depth > 16 || --budget.nodes < 0) fail();
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') { budget.bytes -= Buffer.byteLength(value); if (budget.bytes < 0) fail(); return value; }
  if (typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value,-0)) return value;
  if (typeof value !== 'object' || IS_PROXY(value)) fail();
  const array = Array.isArray(value);
  if (PROTO(value) !== (array ? Array.prototype : Object.prototype)) fail();
  const keys = KEYS(value), out = array ? [] : {};
  if (array) {
    const d = DESC(value,'length');
    if (!d || !OWN(d,'value') || !Number.isSafeInteger(d.value) || d.value < 0 || d.value > 128 || keys.length !== d.value+1) fail();
    for (let i=0;i<d.value;i++) out.push(snapshot(own(value,String(i)),depth+1,budget));
  } else {
    if (keys.length > 128) fail();
    for (const key of keys) {
      if (typeof key !== 'string' || key === 'toJSON') fail();
      DEFINE(out,key,{value:snapshot(own(value,key),depth+1,budget),enumerable:true});
    }
  }
  return F(out);
}
function fail() {
  const code = 'issued_funding_post_sdk_resource_binding_rejected', e = new TypeError(code);
  DEFINE(e,'code',{value:code,enumerable:true}); DEFINE(e,'stack',{value:'TypeError: '+code}); throw F(e);
}

