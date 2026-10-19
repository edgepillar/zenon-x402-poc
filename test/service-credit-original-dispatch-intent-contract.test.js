import test from 'node:test';
import { equal as q, deepEqual as same, notEqual as ne, throws, ok } from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Pure declared metadata SOURCE DRAFT / NOT_RUN.
const selector = process.argv[2] ?? 'all';
if (process.argv.length > 3
|| !['all','1','2','3','4','5','6','7','8'].includes(selector)
) throw new Error('INVALID_SCENARIO_SELECTOR');
const url = new URL('../src/service-credit-original-request-custody-contract.js', import.meta.url);
const raw = readFileSync(url);
q(raw.length, 14051);
q(createHash('sha256').update(raw).digest('hex'),
'fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915');
const source = raw.toString('utf8');
q(/[^\x00-\x7f]/.test(source), false);
q(Buffer.byteLength(source, 'utf8'), 14051);
ok(source.endsWith('\n'));
const contract = await import(url.href);
const {
captureOriginalServiceRequestCustody: capture,
captureOriginalServiceDispatchIntent: intent,
serializeOriginalServiceDispatchIntent: serialize,
parseOriginalServiceDispatchIntent: parse,
} = contract;
const PROFILE = 'service-credit.execute.v1.empty-body';
const FUNDING = 'https://declared.invalid/funding';
const SERVICE = 'https://declared.invalid/service-credit/v1/execute';
const EMPTY = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const BINDING = { fundingResourceUrl: FUNDING, paymentHash: 'a'.repeat(64), network: 'zenon:declared' };
const POLICY = { policyVersion: 1, maxRequests: 3, serviceResourceUrl: SERVICE };
const D1 = 'sha256:' + 'b'.repeat(64), D2 = 'sha256:' + 'c'.repeat(64);
const FIELDS = ['intentVersion','profile','state','grantId','requestId',
'originalChecksum','originalEnvelopeDigest','fundingResourceUrl','paymentHash',
'network','fundingRevision','challengeDigest','paymentDigest','custodyPolicyDigest','checksum'];
const copy = value => JSON.parse(JSON.stringify(value));
const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');
// Independent flat-fixture oracle; never hostile data.
const canonical = value => JSON.stringify(value, Object.keys(value).sort());
const digest = (domain, text) => 'sha256:' + sha(domain + '\0' + text);
function known(kind) {
const message = kind === 'custody'
? 'Service credit original request custody rejected'
: 'Service credit original dispatch intent rejected';
const code = kind === 'custody' ? 'service_credit_original_request_custody_rejected'
: 'service_credit_original_dispatch_intent_rejected';
return error => error instanceof TypeError && error.name === 'TypeError'
&& error.message === message && error.code === code
&& error.stack === 'TypeError: ' + message && Object.isFrozen(error);
}
const C = known('custody'), I = known('intent');
function request(change = {}) {
return { modelVersion: 1, grantId: 'grant_A', requestId: 'request_A', method: 'POST',
routeId: 'service-credit.execute.v1', canonicalBodyDigest: EMPTY,
selectedContentType: 'application/json', maxCostUnits: 7, ...change };
}
function input(change = {}) {
return { originalRequestJson: JSON.stringify(request(change)),
originalBodyBase64: '', serviceResourceUrl: SERVICE };
}
function original(change = {}, bindingChange = {}) {
return capture(input(change), { ...BINDING, ...bindingChange });
}
function binding(change = {}) {
return { fundingRevision: 7, challengeDigest: D1, paymentDigest: D2,
custodyPolicy: { ...POLICY }, ...change };
}
function oOracle(change = {}, bindingChange = {}) {
const r = request(change), b = { ...BINDING, ...bindingChange };
const core = { custodyVersion: 1, profile: PROFILE,
originalRequestJson: JSON.stringify(r), originalBodyBase64: '',
serviceResourceUrl: SERVICE, fundingResourceUrl: b.fundingResourceUrl,
paymentHash: b.paymentHash, network: b.network, grantId: r.grantId, requestId: r.requestId };
return { ...core, checksum: digest('zenon-x402:original-service-request-custody-v1',
JSON.stringify(core)) };
}
function oracle(o, b) {
const core = { intentVersion: 1, profile: PROFILE, state: 'INTENT_RECORDED',
grantId: o.grantId, requestId: o.requestId, originalChecksum: o.checksum,
originalEnvelopeDigest: 'sha256:' + sha(JSON.stringify(o)),
fundingResourceUrl: o.fundingResourceUrl, paymentHash: o.paymentHash, network: o.network,
fundingRevision: b.fundingRevision, challengeDigest: b.challengeDigest,
paymentDigest: b.paymentDigest,
custodyPolicyDigest: digest('zenon-x402:dispatch-intent-policy-v1', canonical(b.custodyPolicy)) };
return { ...core, checksum: digest('zenon-x402:original-dispatch-intent-v1', canonical(core)) };
}
function rechecksum(record) {
const core = { ...record }; delete core.checksum;
return { ...core, checksum: digest('zenon-x402:original-dispatch-intent-v1', canonical(core)) };
}
function frozen(record) {
q(Object.getPrototypeOf(record), Object.prototype); ok(Object.isFrozen(record));
same(Reflect.ownKeys(record), FIELDS);
for (const d of Object.values(Object.getOwnPropertyDescriptors(record))) {
ok(Object.hasOwn(d, 'value')); q(d.writable, false); q(d.configurable, false);
q(typeof d.value === 'object' || typeof d.value === 'function', false);
}
}
function changes(before, after, expected) {
for (const field of FIELDS) q(before[field] !== after[field], expected.includes(field), field);
}
function caught(fn, predicate) {
let error;
try { fn(); } catch (value) { error = value; }
ok(predicate(error)); return error;
}

const scenarios = [
['complete intent capture matches independent canonical commitments and fresh roundtrips', () => {
const o = original(), b = binding(), before = JSON.stringify([o,b]);
const expectedO = oOracle();
same(o, expectedO);
const expected = oracle(expectedO, b);
const first = intent(o, b), second = intent(o, b);
same(first, expected); same(second, expected); ne(first, second);
frozen(first); frozen(second);
const text = serialize(first);
q(text, canonical(expected));
const decoded = parse(text); same(decoded, expected); ne(decoded, first); frozen(decoded);
q(serialize(decoded), text);
q(JSON.stringify([o,b]), before);
q(o.originalRequestJson, input().originalRequestJson); q(o.originalBodyBase64, '');
}],
['original identities and funding commitments remain fully separated', () => {
const o = original(), b = binding(), first = intent(o, b);
const cases = [
[{ grantId: 'grant_B' }, {}, ['grantId']],
[{ requestId: 'request_B' }, {}, ['requestId']],
[{ maxCostUnits: 8 }, {}, []],
[{}, { paymentHash: 'f'.repeat(64) }, ['paymentHash']],
[{}, { network: 'zenon:declared.other' }, ['network']],
[{}, { fundingResourceUrl: FUNDING + '-next' }, ['fundingResourceUrl']],
];
for (const [req, bind, fields] of cases) {
const changed = original(req, bind), expected = oOracle(req, bind);
same(changed, expected);
const next = intent(changed, b); same(next, oracle(expected, b));
changes(first, next, [...fields,'originalChecksum','originalEnvelopeDigest','checksum']);
q(changed.originalRequestJson, input(req).originalRequestJson);
}
for (const [patch, field] of [
[{ fundingRevision: 8 }, 'fundingRevision'], [{ challengeDigest: D2 }, 'challengeDigest'],
[{ paymentDigest: D1 }, 'paymentDigest'],
[{ custodyPolicy: { ...POLICY, maxRequests: 4 } }, 'custodyPolicyDigest'],
]) {
const nextBinding = binding(patch), next = intent(o, nextBinding);
same(next, oracle(oOracle(), nextBinding)); changes(first, next, [field,'checksum']);
}
same(o, oOracle()); q(o.originalRequestJson, input().originalRequestJson);
}],
['canonical schema parsing refuses missing duplicate corrupt and fixed-state metadata', () => {
const value = intent(original(), binding()), text = serialize(value);
q(serialize(copy(value)), text);
for (const field of FIELDS) {
const missing = copy(value); delete missing[field];
throws(() => serialize(missing), C); throws(() => parse(canonical(missing)), C);
}
throws(() => serialize({ ...value, extra: true }), C);
throws(() => parse(canonical({ ...value, extra: true })), C);
for (const bad of ['{', ' ' + text, text + '\n', JSON.stringify(value),
'{"state":"INTENT_RECORDED",' + text.slice(1),
text.replace('grant_A', '\\u0067rant_A')]) throws(() => parse(bad), I);
throws(() => parse(canonical({ ...value, checksum: D1 })), I);
for (const patch of [{ intentVersion: 2 }, { state: 'POSSIBLY_ATTEMPTED' }, { profile: 'other' }]) {
const bad = rechecksum({ ...value, ...patch });
throws(() => serialize(bad), I); throws(() => parse(canonical(bad)), I);
}
}],
['binding revision digest origin and policy errors keep exact rejection kinds', () => {
const o = original(), value = intent(o, binding());
throws(() => intent({ ...o, requestId: 'wrong' }, binding()), C);
const short = binding(); delete short.paymentDigest;
throws(() => intent(o, short), C); throws(() => intent(o, { ...binding(), extra: 1 }), C);
for (const fundingRevision of [-0,0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER + 1,1n,'1']) {
throws(() => intent(o, binding({ fundingRevision })), C);
throws(() => serialize({ ...value, fundingRevision }), C);
}
for (const field of ['challengeDigest','paymentDigest']) {
for (const bad of ['',null,1,'d'.repeat(72)])
throws(() => intent(o, binding({ [field]: bad })), C);
for (const bad of ['x'.repeat(71),'sha256:' + 'A'.repeat(64),'sha256:' + 'a'.repeat(63)])
throws(() => intent(o, binding({ [field]: bad })), I);
}
for (const field of ['originalChecksum','originalEnvelopeDigest','challengeDigest',
'paymentDigest','custodyPolicyDigest','checksum']) {
throws(() => serialize({ ...value, [field]: '' }), C);
throws(() => serialize({ ...value, [field]: 'sha256:' + 'A'.repeat(64) }), I);
}
for (const custodyPolicy of [
{ ...POLICY, maxRequests: 0 }, { ...POLICY, maxRequests: 1025 },
{ ...POLICY, policyVersion: 2 },
{ ...POLICY, serviceResourceUrl: 'https://other.invalid/service-credit/v1/execute' },
{ ...POLICY, serviceResourceUrl: 'https://u:p@declared.invalid/service-credit/v1/execute' },
]) throws(() => intent(o, binding({ custodyPolicy })), C);
throws(() => capture(input(), { ...BINDING, fundingResourceUrl: 'https://other.invalid/funding' }), C);
throws(() => serialize({ ...value, grantId: 'bad/id' }), C);
throws(() => serialize({ ...value, paymentHash: 'A'.repeat(64) }), I);
}],
['hostile records and nested policies never invoke traps getters or coercion', () => {
const o = original(), b = binding(), value = intent(o, b);
let touches = 0;
const trap = () => { touches++; throw new Error('FORBIDDEN_INPUT_CALLBACK'); };
const traps = { get: trap, ownKeys: trap, getPrototypeOf: trap, getOwnPropertyDescriptor: trap };
const proxy = record => new Proxy(record, traps);
const accessor = (record, field) => Object.defineProperty({ ...record }, field,
{ enumerable: true, get: trap });
const revoked = Proxy.revocable({}, traps); revoked.revoke();
for (const bad of [null,[],() => {},new Number(1),Object.assign(Object.create(null),o),
proxy(o),revoked.proxy,accessor(o,'grantId')]) throws(() => intent(bad, b), C);
for (const bad of [proxy(b),accessor(b,'custodyPolicy'),Object.assign(Object.create(null),b)])
throws(() => intent(o, bad), C);
for (const bad of [proxy(POLICY),accessor(POLICY,'serviceResourceUrl'),
Object.assign(Object.create(null),POLICY)])
throws(() => intent(o, binding({ custodyPolicy: bad })), C);
throws(() => serialize(proxy(value)), C);
throws(() => serialize(accessor(value,'paymentDigest')), C);
const coercible = { [Symbol.toPrimitive]: trap, valueOf: trap, toString: trap };
throws(() => intent(o, binding({ fundingRevision: coercible })), C);
throws(() => intent(o, binding({ challengeDigest: coercible })), C);
throws(() => intent(o, binding({ custodyPolicy: { ...POLICY, maxRequests: coercible } })), C);
throws(() => parse(coercible), C); q(touches, 0);
}],
['arity UTF8 safe-number and empty-body boundaries retain credential refusal', () => {
const o = original(), b = binding(), value = intent(o, b), text = serialize(value);
for (const args of [[],[o],[o,b,0]]) throws(() => Reflect.apply(intent,undefined,args), I);
for (const [fn, good] of [[serialize,value],[parse,text]])
for (const args of [[],[good,0]]) throws(() => Reflect.apply(fn,undefined,args), I);
for (const bad of ['', ' '.repeat(16385), '\u00e9'.repeat(8193)])
throws(() => parse(bad), C);
q(Buffer.byteLength('\u00e9'.repeat(8192),'utf8'), 16384);
for (const bad of [' '.repeat(16384), '\u00e9'.repeat(8192)])
throws(() => parse(bad), I);
const max = Number.MAX_SAFE_INTEGER;
const maximum = intent(original({ maxCostUnits: max }), binding({ fundingRevision: max,
custodyPolicy: { ...POLICY, maxRequests: 1024 } }));
q(maximum.fundingRevision, max); same(parse(serialize(maximum)), maximum);
throws(() => original({ maxCostUnits: max + 1 }), C);
const unicode = original({}, { network: '\u00e9'.repeat(128) });
q(Buffer.byteLength(unicode.network,'utf8'), 256);
same(parse(serialize(intent(unicode,b))), intent(unicode,b));
throws(() => original({}, { network: '\u00e9'.repeat(129) }), C);
throws(() => capture({ ...input(), originalBodyBase64: Buffer.from('x').toString('base64') },BINDING), C);
for (const field of ['authorization','headers','privateKey','signature','proof']) {
throws(() => capture({ ...input(), [field]: 'declared' },BINDING), C);
throws(() => intent(o, { ...b, [field]: 'declared' }), C);
}
q(o.originalBodyBase64, '');
}],
['self-consistent declared rewrites parse without external linkage or authority', () => {
const o = original(), before = JSON.stringify(o), value = intent(o, binding());
const rewritten = rechecksum({ ...value, grantId: 'grant_other', requestId: 'request_other',
originalChecksum: D1, originalEnvelopeDigest: D2, paymentHash: 'f'.repeat(64),
fundingResourceUrl: 'https://other.invalid/funding', network: 'zenon:declared.other',
fundingRevision: 99, custodyPolicyDigest: D1 });
const decoded = parse(canonical(rewritten)); same(decoded, rewritten); frozen(decoded);
ne(decoded.originalChecksum, o.checksum); ne(decoded.grantId, o.grantId);
q(JSON.stringify(o), before);
for (const field of ['paid','serviceDelivered','mayStartPayment','maySignPayment',
'mayDispatchService','deliveryConfirmed','authorized','authenticated','durable',
'dispatch','sign','verify','execute']) q(Object.hasOwn(decoded,field), false);
same(Object.keys(decoded), FIELDS); q(decoded.state, 'INTENT_RECORDED');
}],
['exact exports source imports and frozen rejection descriptors stay redacted', () => {
same(Object.keys(contract).sort(), [
'captureOriginalServiceDispatchIntent','captureOriginalServiceRequestCustody',
'parseOriginalServiceDispatchIntent','parseOriginalServiceRequestCustody',
'serializeOriginalServiceDispatchIntent','serializeOriginalServiceRequestCustody',
'snapshotOriginalServiceRequestCustodyKey','snapshotOriginalServiceRequestCustodyPolicy',
'validateOriginalServiceRequestCustody',
].sort());
same(source.split('\n').filter(line => line.startsWith('import ')), [
"import { Buffer } from 'node:buffer';",
"import { createHash } from 'node:crypto';",
"import { types as utilTypes } from 'node:util';",
]);
q(raw.subarray(9810).length, 4241);
q(createHash('sha256').update(raw.subarray(0,9810)).digest('hex'),
'8f4d40d017a89e9a064c411c8e076cb21a45b9fb787fda7a664246b7bd744083');
q(intent.length, 2); q(serialize.length, 1); q(parse.length, 1);
for (const error of [caught(() => intent(),I),caught(() => intent({},binding()),C)]) {
same(Reflect.ownKeys(error).sort(), ['code','message','stack']);
same(Object.keys(error), ['code']); q(Object.getPrototypeOf(error), TypeError.prototype);
for (const field of ['message','code','stack']) {
const d = Object.getOwnPropertyDescriptor(error,field);
ok(Object.hasOwn(d,'value')); q(d.writable,false); q(d.configurable,false);
q(d.enumerable,field === 'code');
}
q(error.stack, 'TypeError: ' + error.message); ok(Object.isFrozen(error));
}
}],
];
q(scenarios.length, 8);
for (let index = 0; index < scenarios.length; index++) {
if (selector === 'all' || selector === String(index + 1)) {
const [name, run] = scenarios[index];
test(name, { timeout: 5000 }, run);
}
}
