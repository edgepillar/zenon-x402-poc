import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { canonicalJson } from './canonical.js';
import { captureServiceCreditOriginalFundingGrantQuery, captureServiceCreditOriginalFundingGrantResult } from './service-credit-original-funding-grant.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn;
export const ORIGINAL_FUNDING_GRANT_PATH = '/service-credit/v1/original-funding-grant';
export const ORIGINAL_FUNDING_GRANT_MAX_RESPONSE_BYTES = 8192;
const VARY = 'Authorization, Original-Funding-Query';
function fail() {
  const code = 'ORIGINAL_FUNDING_GRANT_HTTP_REJECTED', e = new TypeError(code);
  Object.defineProperties(e, { code: { value: code, enumerable: true }, stack: { value: 'TypeError: ' + code } }); throw F(e);
}
function own(value, key) {
  if (value === null || typeof value !== 'object' || types.isProxy(value)) fail();
  const d = D(value, key); if (!d?.enumerable || !OWN(d, 'value')) fail(); return d.value;
}
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== names.length) fail();
  const c = {}; for (const key of names) c[key] = own(value, key); return c;
}
function ascii(value, max) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || /[^\x20-\x7e]/.test(value)) fail(); return value;
}
function freezeJson(value) {
  if (value && typeof value === 'object') { for (const key of Object.keys(value)) freezeJson(value[key]); F(value); } return value;
}
function encode(value, max) { const text = canonicalJson(value); ascii(text, max); return Buffer.from(text, 'ascii').toString('base64url'); }
function decode(value, max) {
  ascii(value, Math.ceil(max * 4 / 3)); if (!/^[A-Za-z0-9_-]+$/.test(value)) fail();
  const text = Buffer.from(value, 'base64url').toString('utf8'); ascii(text, max);
  const parsed = JSON.parse(text);
  if (canonicalJson(parsed) !== text || Buffer.from(text, 'ascii').toString('base64url') !== value) fail(); return parsed;
}
/** The funding URL and resource digest must come from the retained selected
 * provider context. No response or grant ID selects a different endpoint. */
export function captureOriginalFundingGrantRoute(fundingResourceUrl, expectedPaymentResourceDigest) {
  if (arguments.length !== 2) fail(); ascii(fundingResourceUrl, 4096);
  if (typeof expectedPaymentResourceDigest !== 'string' || expectedPaymentResourceDigest.length !== 71
      || !/^sha256:[0-9a-f]{64}$/.test(expectedPaymentResourceDigest) || fundingResourceUrl.includes('?') || fundingResourceUrl.includes('#')) fail();
  const u = new URL(fundingResourceUrl);
  if (u.protocol !== 'https:' || u.href !== fundingResourceUrl || u.pathname !== '/funding'
      || u.username || u.password || u.search || u.hash) fail();
  return F({ fundingResourceUrl, expectedPaymentResourceDigest, origin: u.origin, authority: u.host,
    queryUrl: u.origin + ORIGINAL_FUNDING_GRANT_PATH, requestTarget: ORIGINAL_FUNDING_GRANT_PATH });
}
export function captureOriginalFundingGrantSelectedRoute(value) {
  if (arguments.length !== 1) fail();
  const c = fields(value, ['fundingResourceUrl', 'expectedPaymentResourceDigest', 'origin', 'authority', 'queryUrl', 'requestTarget']);
  const r = captureOriginalFundingGrantRoute(c.fundingResourceUrl, c.expectedPaymentResourceDigest);
  if (Object.keys(r).some(k => c[k] !== r[k])) fail(); return r;
}
function selected(query, proof, route) {
  const q = captureServiceCreditOriginalFundingGrantQuery(query);
  if (q.query.originalFunding.paymentResourceDigest !== route.expectedPaymentResourceDigest) fail();
  const p = fields(proof, ['proofVersion', 'grantId', 'requestId', 'publicKey', 'maxCostUnits', 'signature']);
  if (p.proofVersion !== 1 || p.grantId !== q.request.grantId || p.requestId !== q.request.requestId || p.maxCostUnits !== 1) fail();
  ascii(p.publicKey, 128); ascii(p.signature, 256); return F({ selected: q, proof: F(p) });
}
export function createOriginalFundingGrantWireRequest(routeInput, query, proof) {
  if (arguments.length !== 3) fail(); const route = captureOriginalFundingGrantSelectedRoute(routeInput);
  const c = selected(query, proof, route);
  return F({ url: route.queryUrl, headers: F({ 'Content-Length': '0',
    'Original-Funding-Query': encode(c.selected.query, 6144), Authorization: 'ServiceCredit ' + encode(c.proof, 768) }) });
}
function headers(raw, allowed, limit) {
  if (!Array.isArray(raw) || types.isProxy(raw) || Object.getPrototypeOf(raw) !== Array.prototype) fail();
  const d = D(raw, 'length');
  if (!d || !OWN(d, 'value') || !Number.isSafeInteger(d.value) || d.value < 2 || d.value > 128 || d.value % 2
      || Reflect.ownKeys(raw).length !== d.value + 1) fail();
  const out = Object.create(null); let size = 0;
  for (let i = 0; i < d.value; i += 2) {
    const key = ascii(own(raw, String(i)), 128).toLowerCase(), value = ascii(own(raw, String(i + 1)), limit);
    if (!/^[a-z0-9-]+$/.test(key) || OWN(out, key) || !allowed.includes(key) || value.trim() !== value) fail();
    size += key.length + value.length + 4; if (size > 16384) fail(); out[key] = value;
  }
  return out;
}
/** Metadata and foreign resource rejection precede capability verification or
 * the first store read. Captures only own data; never reads an incoming body. */
export function captureOriginalFundingGrantHttpsRequest(request, routeInput) {
  if (arguments.length !== 2) fail(); const route = captureOriginalFundingGrantSelectedRoute(routeInput);
  if (own(request, 'method') !== 'GET' || own(request, 'url') !== route.requestTarget || own(request, 'httpVersion') !== '1.1') fail();
  const h = headers(own(request, 'rawHeaders'), ['host', 'connection', 'content-length', 'authorization', 'original-funding-query'], 8192);
  if (Object.keys(h).length !== 5 || h.host !== route.authority || h.connection !== 'close'
      || h['content-length'] !== '0' || !h.authorization.startsWith('ServiceCredit ')) fail();
  const c = selected(decode(h['original-funding-query'], 6144), decode(h.authorization.slice(14), 768), route);
  return F({ query: c.selected.query, proof: c.proof });
}
export function createOriginalFundingGrantHttpFrame(result, expectedIdentity) {
  if (arguments.length !== 2) fail(); const value = captureServiceCreditOriginalFundingGrantResult(result, expectedIdentity);
  const body = canonicalJson(value); ascii(body, ORIGINAL_FUNDING_GRANT_MAX_RESPONSE_BYTES);
  return F({ statusCode: 200, contentType: 'application/json', body,
    headers: F({ 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff',
      Vary: VARY, Connection: 'close', 'Content-Length': String(Buffer.byteLength(body, 'ascii')) }) });
}
/** Called after the native transport has observed exact body/end and actual
 * request/socket close. This parser itself authenticates no TLS or signature. */
export function captureOriginalFundingGrantHttpResponse(input, expectedIdentity) {
  if (arguments.length !== 2) fail(); const c = fields(input, ['statusCode', 'rawHeaders', 'body']);
  if (c.statusCode !== 200) fail(); ascii(c.body, ORIGINAL_FUNDING_GRANT_MAX_RESPONSE_BYTES);
  const h = headers(c.rawHeaders, ['content-type', 'cache-control', 'x-content-type-options', 'vary', 'connection', 'content-length', 'date'], 8192);
  if (h['content-type'] !== 'application/json' || h['cache-control'] !== 'private, no-store, max-age=0'
      || h['x-content-type-options'] !== 'nosniff' || h.vary !== VARY || h.connection !== 'close'
      || h['content-length'] !== String(Buffer.byteLength(c.body, 'ascii'))) fail();
  const parsed = JSON.parse(c.body); if (canonicalJson(parsed) !== c.body) fail();
  return captureServiceCreditOriginalFundingGrantResult(freezeJson(parsed), expectedIdentity);
}
