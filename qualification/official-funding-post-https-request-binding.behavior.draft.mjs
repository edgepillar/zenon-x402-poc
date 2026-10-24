// Actual closed POST binding only. No official package, SQL, native stream,
// TLS, signature, intake, settlement or grant owner is imported or exercised.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureOfficialFundingPostHttpsRoute as ROUTE,
  captureOfficialFundingPostHttpsRequest as CAPTURE } from '../src/x402-official-funding-post-https-request-binding.js';
import { captureOfficialUpfrontHttpsRoute as GET_ROUTE,
  captureOfficialUpfrontHttpsRequest as GET_CAPTURE } from '../src/x402-official-https-request-binding.js';
assert.equal(process.version, 'v24.19.0'); assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.argv.length, 2); assert.equal(process.env.NODE_DISABLE_COMPILE_CACHE, '1');
assert.equal(process.env.X402_OFFICIAL_FUNDING_POST_BINDING_SELECTION, 'twelve-post-request-data-cases-only');
for (const key of ['NODE_OPTIONS','NODE_PATH','NODE_TEST_CONTEXT','NODE_V8_COVERAGE']) assert.equal(process.env[key], undefined);
assert.ok(process.permission && !process.permission.has('child') && !process.permission.has('worker') && !process.permission.has('fs.write'));
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PINS = JSON.parse(process.env.X402_OFFICIAL_FUNDING_POST_BINDING_SOURCE_PINS);
const names = ['package.json', 'src/x402-official-funding-post-https-request-binding.js',
  'src/x402-funding-post-checkpoint-route.js', 'src/x402-official-https-request-binding.js',
  'qualification/official-funding-post-https-request-binding.behavior.draft.mjs'];
assert.deepEqual(PINS.map(p => p.path), names);
const identity = s => [s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String);
function verify() {
  let total = 0;
  for (const p of PINS) {
    const path = resolve(ROOT, p.path), s = lstatSync(path, { bigint: true });
    assert.ok(s.isFile() && !s.isSymbolicLink()); assert.equal(s.nlink, 1n); assert.deepEqual(identity(s), p.identity);
    const raw = readFileSync(path); total += raw.length; assert.ok(total < 262144);
    assert.equal(raw.length, p.bytes); assert.equal(createHash('sha256').update(raw).digest('hex'), p.sha256);
    assert.deepEqual(identity(lstatSync(path, { bigint: true })), p.identity);
  }
}
verify();
const URL = 'https://post.invalid:8443/funding', route = ROUTE(URL), F = Object.freeze;
const OPT = { concurrency: false, timeout: 2000 };
let entered = 0, completed = 0, hooks = 0;
function request() { return { method: 'POST', url: '/funding', httpVersion: '1.1',
  socket: { encrypted: true }, rawHeaders: ['Host','post.invalid:8443','Connection','close','Payment-Signature','DECLARED_INVALID_BASE64'] }; }
function refused(fn) { assert.throws(fn, e => e instanceof TypeError && Object.isFrozen(e)
  && e.code === 'x402_official_funding_post_https_request_binding_rejected'); }
async function scenario(name, fn) {
  let complete = false;
  await test(name, OPT, async () => { entered++; await fn(); completed++; complete = true; });
  if (!complete) throw new Error('OFFICIAL_POST_BINDING_COMPONENT_FAILED_STOP');
}
await scenario('route is explicitly immutable POST funding DATA with empty-body profile', () => {
  assert.ok(Object.isFrozen(route)); assert.equal(route.resourceUrl, URL); assert.equal(route.method, 'POST');
  assert.equal(route.requestTarget, '/funding'); assert.equal(route.originalBodyBase64, '');
});
await scenario('exact own HTTP fields retain the original header scalar without decoding or reencoding', () => {
  const input = request(), result = CAPTURE(input, route);
  assert.deepEqual(result, { method: 'POST', requestTarget: '/funding', resourceUrl: URL, paymentSignature: 'DECLARED_INVALID_BASE64' });
  input.rawHeaders[5] = 'changed'; assert.equal(result.paymentSignature, 'DECLARED_INVALID_BASE64'); assert.ok(Object.isFrozen(result));
});
await scenario('an unpaid exact POST and explicit zero content length remain distinguishable from a paid header', () => {
  const input = request(); input.rawHeaders = ['Host','post.invalid:8443','Content-Length','0'];
  assert.equal(CAPTURE(input, route).paymentSignature, null);
});
await scenario('GET wrong path query fragment and absolute request targets are refused', () => {
  for (const change of [r => { r.method = 'GET'; }, r => { r.url = '/paid'; },
    r => { r.url = '/funding?x=1'; }, r => { r.url = '/funding#x'; }, r => { r.url = URL; }]) {
    const input = request(); change(input); refused(() => CAPTURE(input, route));
  }
});
await scenario('noncanonical route URLs insecure profiles and caller-forged route records are refused', () => {
  for (const value of ['http://post.invalid/funding','https://post.invalid/paid',URL+'?',URL+'#',
    'https://user@post.invalid/funding','https://post.invalid:0/funding','https://post.invalid/a/../funding'])
    refused(() => ROUTE(value));
  refused(() => CAPTURE(request(), F({ ...route })));
});
await scenario('Host is exact and duplicate case-insensitive host fields cannot select another origin', () => {
  for (const headers of [['Host','other.invalid:8443'], ['Host','POST.invalid:8443'],
    ['Host','post.invalid:8443','hOsT','post.invalid:8443']]) {
    const input = request(); input.rawHeaders = headers; refused(() => CAPTURE(input, route));
  }
});
await scenario('nonzero or ambiguous body framing upgrade expectations and trailers are refused', () => {
  for (const [name,value] of [['Content-Length','1'],['Content-Length','00'],['Transfer-Encoding','chunked'],
    ['Expect','100-continue'],['Upgrade','websocket'],['Trailer','x-extra']]) {
    const input = request(); input.rawHeaders.push(name,value); refused(() => CAPTURE(input, route));
  }
});
await scenario('HTTP version and declared TLS fields must be own exact values not inherited facts', () => {
  for (const change of [r => { r.httpVersion = '2.0'; }, r => { r.socket.encrypted = false; },
    r => { r.socket = Object.create({ encrypted: true }); }, r => { delete r.httpVersion; }]) {
    const input = request(); change(input); refused(() => CAPTURE(input, route));
  }
});
await scenario('duplicate payment headers unsafe tokens whitespace control bytes and header bounds are refused', () => {
  const variants = [
    ['Host','post.invalid:8443','Payment-Signature','a','payment-signature','a'],
    ['Host','post.invalid:8443','Bad Name','x'],['Host','post.invalid:8443','X-Test','bad\nvalue'],
    ['Host','post.invalid:8443','Payment-Signature','with space'],['Host','post.invalid:8443','Payment-Signature',''],
    ['Host','post.invalid:8443','X-Test','x'.repeat(8193)],
    ['Host','post.invalid:8443',...Array.from({ length: 64 }, (_,i) => ['X-'+i,'a']).flat()],
  ];
  for (const headers of variants) { const input = request(); input.rawHeaders = headers; refused(() => CAPTURE(input, route)); }
  const input = request(); input.rawHeaders.extra = 'x'; refused(() => CAPTURE(input, route));
});
await scenario('request socket and raw-header proxies or getters refuse with zero hooks', () => {
  const trap = () => { hooks++; throw new Error('HOOK'); }, proxy = new Proxy({}, { get: trap, ownKeys: trap, getPrototypeOf: trap });
  refused(() => CAPTURE(proxy, route));
  for (const change of [r => { r.socket = proxy; }, r => { r.rawHeaders = proxy; },
    r => { Object.defineProperty(r, 'method', { get: trap, enumerable: true }); },
    r => { Object.defineProperty(r.rawHeaders, '0', { get: trap, enumerable: true }); }]) {
    const input = request(); change(input); refused(() => CAPTURE(input, route));
  }
  assert.equal(hooks, 0);
});
await scenario('POST and legacy GET route identities cannot cross-select and both reject wrong arity', () => {
  const getRoute = GET_ROUTE('https://post.invalid:8443/paid');
  const input = request(); refused(() => CAPTURE(input, getRoute));
  assert.throws(() => GET_CAPTURE(input, route), TypeError);
  const get = request(); get.method = 'GET'; get.url = '/paid';
  assert.equal(GET_CAPTURE(get, getRoute).method, 'GET');
  assert.throws(() => GET_CAPTURE(get), TypeError); assert.throws(() => GET_CAPTURE(get, getRoute, true), TypeError);
  refused(() => ROUTE(URL, true)); refused(() => CAPTURE(input)); refused(() => CAPTURE(input, route, true));
});
await scenario('request binding creates no intake BOUND settlement or grant authority', () => {
  const captured = CAPTURE(request(), route);
  for (const name of ['status','settlement','grant','signatureValid','nativePeer','close','submit'])
    assert.equal(Object.hasOwn(captured, name), false);
  assert.equal(Object.hasOwn(captured, 'BOUND'), false);
});
verify(); assert.equal(entered, 12); assert.equal(completed, 12); assert.equal(hooks, 0);
console.log('# official-funding-post-binding-source ' + JSON.stringify({
  tests: 12, entered, completed, hooks, actualPostBinding: true, actualGetBinding: true,
  actualOfficialSdk: false, actualNative: false, actualIntake: false, actualSQLite: false,
  settlementMappedToBound: false, authority: 'NONE', inputs: PINS.map(({identity,...pin}) => pin),
}));

