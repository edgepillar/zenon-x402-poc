// Actual pure resource-binding component; SDK-shaped inputs below are declared
// DATA, not official SDK, SQL/intake, TLS, signatures or issuance qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIssuedFundingPostSdkResourceBinding as CREATE } from '../src/x402-issued-funding-post-sdk-resource.js';
import { canonicalJson } from '../src/canonical.js';
import { sameResource } from '../src/x402-wire.js';
assert.equal(process.version, 'v24.19.0'); assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.argv.length, 2); assert.equal(process.env.NODE_DISABLE_COMPILE_CACHE, '1');
assert.equal(process.env.X402_ISSUED_FUNDING_RESOURCE_SELECTION, 'twelve-issued-resource-data-cases-only');
for (const key of ['NODE_OPTIONS','NODE_PATH','NODE_TEST_CONTEXT','NODE_V8_COVERAGE']) assert.equal(process.env[key], undefined);
assert.ok(process.permission && !process.permission.has('child') && !process.permission.has('worker') && !process.permission.has('fs.write'));
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PINS = JSON.parse(process.env.X402_ISSUED_FUNDING_RESOURCE_SOURCE_PINS);
const names = ['package.json', 'src/x402-issued-funding-post-sdk-resource.js', 'src/canonical.js',
  'src/x402-wire.js', 'src/x402-funding-post-checkpoint-route.js',
  'qualification/issued-funding-post-sdk-resource.behavior.draft.mjs'];
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
const URL = 'https://issued.invalid:8443/funding', F = Object.freeze;
const OPT = { concurrency: false, timeout: 2000 }, copy = v => JSON.parse(JSON.stringify(v));
let entered = 0, completed = 0, hooks = 0;
const encode = v => Buffer.from(canonicalJson(v), 'utf8').toString('base64');
function required() {
  return { x402Version: 2, resource: { url: URL, tags: [
    'x402-service-credit-funding-v1', '1'.repeat(32), '2'.repeat(32)] }, accepts: [{
    scheme: 'exact', network: 'zenon:mock', asset: 'zts1declaredasset', amount: '1',
    payTo: 'z1declaredrecipient', maxTimeoutSeconds: 60, extra: { paymentFlow: 'upfront',
      poc: true, settlement: 'account-block', zenonChain: { version: 1,
        chainIdentifier: String(Number.MAX_SAFE_INTEGER), genesisMomentumHash: '0'.repeat(64) } } }] };
}
function frame(value = required()) { return { status: 402, paymentRequiredHeader: encode(value), body: 'Payment Required' }; }
function fixture() {
  const sourceFrame = frame(), binding = CREATE(sourceFrame, URL), selected = binding.selection();
  const resourceInfo = { url: URL, description: '', mimeType: '', tags: copy(selected.resource.tags) };
  const requirements = copy(selected.paymentRequired.accepts);
  const response = { x402Version: 2, error: undefined, resource: resourceInfo, accepts: requirements };
  const context = { requirements, paymentPayload: undefined, resourceInfo, error: undefined,
    paymentRequiredResponse: response, transportContext: { request: { method: 'POST', path: '/funding' } } };
  return { sourceFrame, binding, selected, resourceInfo, requirements, response, context };
}
function refused(fn) { assert.throws(fn, e => e instanceof TypeError && Object.isFrozen(e)
  && e.code === 'issued_funding_post_sdk_resource_binding_rejected'); }
function refusedCapture(f) {
  const old = Object.getOwnPropertyDescriptor(f.response, 'resource');
  refused(() => f.binding.capture(f.context));
  assert.deepEqual(Object.getOwnPropertyDescriptor(f.response, 'resource'), old);
  const s = f.binding.inspect(); assert.equal(s.used, true); assert.equal(s.held, true); assert.equal(s.resourceFormed, false);
  refused(() => f.binding.capture(fixture().context));
}
async function scenario(name, fn) {
  let complete = false;
  await test(name, OPT, async () => { entered++; await fn(); completed++; complete = true; });
  if (!complete) throw new Error('ISSUED_FUNDING_RESOURCE_COMPONENT_FAILED_STOP');
}
await scenario('issued canonical url and funding tags are detached with the exact original header', () => {
  const f = fixture(), originalHeader = f.sourceFrame.paymentRequiredHeader;
  f.sourceFrame.paymentRequiredHeader = 'changed'; f.sourceFrame.status = 500;
  assert.equal(f.selected.frame.paymentRequiredHeader, originalHeader); assert.equal(f.selected.frame.status, 402);
  assert.deepEqual(Object.keys(f.selected.resource), ['tags','url']);
  assert.deepEqual(f.selected.resource.tags, required().resource.tags);
  for (const value of [f.selected, f.selected.frame, f.selected.paymentRequired, f.selected.resource,
    f.selected.resource.tags, f.selected.requirement, f.selected.requirement.extra]) assert.ok(Object.isFrozen(value));
});
await scenario('one unsigned response field is formed while SDK-shaped context and selected identities survive', () => {
  const f = fixture(), requirement = f.requirements[0], payload = { declared: 'NOT_A_SIGNED_PAYMENT' };
  const originalPayload = canonicalJson(payload), header = Buffer.from(originalPayload).toString('base64');
  const beforeContext = Object.getOwnPropertyDescriptors(f.context), beforeResponse = Object.getOwnPropertyDescriptors(f.response);
  assert.equal(f.binding.capture(f.context), f.context);
  assert.equal(f.context.paymentRequiredResponse, f.response); assert.equal(f.context.resourceInfo, f.resourceInfo);
  assert.equal(f.context.requirements, f.requirements); assert.equal(f.response.accepts, f.requirements);
  assert.equal(f.requirements[0], requirement); assert.equal(f.response.resource, f.selected.resource);
  for (const key of Object.keys(beforeContext)) assert.deepEqual(Object.getOwnPropertyDescriptor(f.context,key), beforeContext[key]);
  for (const key of ['x402Version','error','accepts']) assert.deepEqual(Object.getOwnPropertyDescriptor(f.response,key), beforeResponse[key]);
  assert.equal(canonicalJson(payload), originalPayload); assert.equal(Buffer.from(originalPayload).toString('base64'), header);
});
await scenario('empty SDK-generated metadata is presence-sensitive and only the unsigned challenge loses it', () => {
  const f = fixture(); assert.equal(sameResource(f.resourceInfo, f.selected.resource), false);
  f.binding.capture(f.context);
  assert.equal(sameResource(f.response.resource, f.selected.resource), true);
  assert.equal(f.resourceInfo.description, ''); assert.equal(f.resourceInfo.mimeType, '');
  const projected = { x402Version: f.response.x402Version, resource: f.response.resource, accepts: f.response.accepts };
  assert.equal(encode(projected), f.selected.frame.paymentRequiredHeader);
});
await scenario('wrong API arity does not consume entry but a successful formation cannot be reused', () => {
  const f = fixture(); refused(() => CREATE(f.sourceFrame)); refused(() => CREATE(f.sourceFrame,URL,true));
  refused(() => f.binding.selection(true)); refused(() => f.binding.inspect(true));
  refused(() => f.binding.capture()); refused(() => f.binding.capture(f.context,true));
  assert.equal(f.binding.inspect().used, false); f.binding.capture(f.context);
  refused(() => f.binding.capture(f.context)); assert.equal(f.binding.inspect().held, false);
});
await scenario('constructor refuses noncanonical routes frames resources funding tags and ambiguous requirements', () => {
  for (const url of ['http://issued.invalid/funding', URL+'?', 'https://issued.invalid:8443/paid']) refused(() => CREATE(frame(),url));
  for (const change of [r => { r.resource.description = ''; }, r => { r.resource.tags[0] = 'other'; },
    r => { r.resource.tags[1] = 'A'.repeat(32); }, r => { r.resource.tags.pop(); },
    r => { r.accepts.push(copy(r.accepts[0])); }, r => { r.error = 'new quote'; },
    r => { r.resource.url = 'https://other.invalid/funding'; }]) {
    const r = required(); change(r); refused(() => CREATE(frame(r),URL));
  }
  const noncanonical = frame(); noncanonical.paymentRequiredHeader = Buffer.from(JSON.stringify(required())).toString('base64');
  refused(() => CREATE(noncanonical, URL));
  for (const change of [f => { f.status = 403; }, f => { f.body = 'replacement'; }, f => { f.extra = true; },
    f => { f.paymentRequiredHeader += '\\n'; }]) { const f = frame(); change(f); refused(() => CREATE(f,URL)); }
});
await scenario('changed generated URL tags nonempty metadata or extra fields refuse before mutation and stay held', () => {
  for (const change of [r => { r.url = 'https://other.invalid/funding'; }, r => { r.tags[1] = '3'.repeat(32); },
    r => { r.description = 'not empty'; }, r => { r.mimeType = 'application/json'; },
    r => { r.serviceName = 'extra'; }, r => { delete r.description; }]) {
    const f = fixture(); change(f.resourceInfo); refusedCapture(f);
  }
});
await scenario('changed requirement values and replaced array identities cannot create a selected view', () => {
  for (const change of [f => { f.requirements[0].amount = '2'; },
    f => { f.requirements.push(copy(f.requirements[0])); },
    f => { f.response.accepts = copy(f.requirements); },
    f => { f.context.requirements = copy(f.requirements); }]) {
    const f = fixture(); change(f); refusedCapture(f);
  }
});
await scenario('actual HTTP hook shape requires undefined payload and no error or error-generated challenge', () => {
  for (const change of [f => { f.context.paymentPayload = {}; }, f => { f.context.error = 'Payment required'; },
    f => { f.response.error = 'new challenge'; }, f => { f.response.x402Version = 1; },
    f => { delete f.context.paymentPayload; }, f => { f.context.extra = true; },
    f => { f.context.transportContext = null; }]) {
    const f = fixture(); change(f); refusedCapture(f);
  }
});
await scenario('SDK-shaped getters proxies and thenables execute no hooks on refusal', () => {
  const trap = () => { hooks++; throw new Error('HOOK'); };
  const proxy = new Proxy({}, { get:trap, ownKeys:trap, getPrototypeOf:trap });
  const a = fixture(); refused(() => a.binding.capture(proxy)); assert.equal(a.binding.inspect().held,true);
  for (const change of [f => { Object.defineProperty(f.context,'resourceInfo',{get:trap,enumerable:true}); },
    f => { Object.defineProperty(f.resourceInfo.tags,'1',{get:trap,enumerable:true}); },
    f => { Object.defineProperty(f.response,'resource',{get:trap,enumerable:true}); },
    f => { f.context.transportContext=proxy; }, f => { f.context.paymentPayload={then:trap}; },
    f => { f.resourceInfo.tags=proxy; }]) { const f=fixture();change(f);refusedCapture(f); }
  assert.equal(hooks,0);
});
await scenario('frozen or nonwritable response resource cannot be partially formed or retried', () => {
  for (const change of [f => { F(f.response); },
    f => { Object.defineProperty(f.response,'resource',{writable:false}); },
    f => { Object.defineProperty(f.response,'resource',{configurable:false}); },
    f => { Object.defineProperty(f.response,'resource',{enumerable:false}); }]) {
    const f=fixture();change(f);refusedCapture(f);
  }
});
await scenario('constructor rejects frame getters proxies and nonenumerable fields without reading hooks', () => {
  const trap=()=>{hooks++;throw new Error('HOOK');}, proxy=new Proxy({}, {get:trap,ownKeys:trap,getPrototypeOf:trap});
  refused(()=>CREATE(proxy,URL));
  for(const change of [f=>{Object.defineProperty(f,'paymentRequiredHeader',{get:trap,enumerable:true});},
    f=>{Object.defineProperty(f,'status',{enumerable:false});},f=>{f[Symbol('extra')]=true;}]){
    const f=frame();change(f);refused(()=>CREATE(f,URL));
  }
  assert.equal(hooks,0);
});
await scenario('data selection and one capture never authenticate issuance SDK behavior intake BOUND or grants', () => {
  const f=fixture();f.binding.capture(f.context);const s=f.binding.inspect();
  assert.equal(f.selected.authority,'NONE');assert.equal(f.selected.issuanceAuthenticated,false);
  assert.equal(s.sdkQualified,false);assert.equal(s.signedPayloadRewritten,false);assert.equal(s.selectedViewsReplaced,false);
  assert.equal(s.authority,'NONE');assert.equal(s.resourceFormed,true);
  for(const key of ['BOUND','settlement','grant','sign','submit','close','nativePeer'])assert.equal(Object.hasOwn(f.binding,key),false);
});
verify();assert.equal(entered,12);assert.equal(completed,12);assert.equal(hooks,0);
console.log('# issued-funding-sdk-resource-source '+JSON.stringify({tests:12,entered,completed,hooks,
  actualResourceBinding:true,declaredSdkShapedData:true,actualOfficialSdk:false,actualIntake:false,
  actualSQLite:false,actualNative:false,signedPayloadRewritten:false,selectedViewsReplaced:false,
  authority:'NONE',inputs:PINS.map(({identity,...pin})=>pin)}));
