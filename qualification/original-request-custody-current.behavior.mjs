import test from 'node:test';
import {
  equal as q, deepEqual as same, notEqual as ne, throws, ok,
} from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Current custody contract source selection. Historical qualification remains unchanged.
// The original V2 store-wiring unit remains separate and unchanged.
const selector = process.argv[2] ?? 'all';
if (process.argv.length > 3
  || !['all','1','2','3','4','5','6','7','8','9','10'].includes(selector)
) throw new Error('INVALID_SCENARIO_SELECTOR');

const specs = [
  ['../src/service-credit-original-request-custody-contract.js',
    15100, '483d20e90d78ba95a8c5d5458dd201910e8d42aecbdc0dc03812e7044a464054'],
];
const pins = Object.freeze(specs.map(([path, bytes, sha]) => {
  const url = new URL(path, import.meta.url);
  const raw = readFileSync(url);
  q(raw.length, bytes);
  q(createHash('sha256').update(raw).digest('hex'), sha);
  const text = raw.toString('utf8');
  q(/[^\x00-\x7f]/.test(text), false);
  q(Buffer.byteLength(text, 'utf8'), bytes);
  ok(text.endsWith('\n'));
  return Object.freeze({ url: url.href, text });
}));

// The sole repository import is the exact guarded pure custody contract.
const contract = await import(pins[0].url);
const {
  snapshotOriginalServiceRequestCustodyPolicy: policy,
  snapshotOriginalServiceRequestCustodyKey: key,
  captureOriginalServiceRequestCustody: capture,
  validateOriginalServiceRequestCustody: validate,
  serializeOriginalServiceRequestCustody: serialize,
  parseOriginalServiceRequestCustody: parse,
} = contract;

const FUNDING = 'https://declared.invalid/funding';
const SERVICE = 'https://declared.invalid/service-credit/v1/execute';
const EMPTY = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const DOMAIN = 'zenon-x402:original-service-request-custody-v1';
const BINDING = Object.freeze({
  fundingResourceUrl: FUNDING,
  paymentHash: 'a'.repeat(64),
  network: 'zenon:declared',
});
const rejected = error => error instanceof TypeError
  && error.name === 'TypeError'
  && error.message === 'Service credit original request custody rejected'
  && error.code === 'service_credit_original_request_custody_rejected'
  && error.stack === 'TypeError: Service credit original request custody rejected';

function request(overrides={}) {
  return {
    modelVersion: 1,
    grantId: 'grant_A',
    requestId: 'request_A',
    method: 'POST',
    routeId: 'service-credit.execute.v1',
    canonicalBodyDigest: EMPTY,
    selectedContentType: 'application/json',
    maxCostUnits: 7,
    ...overrides,
  };
}
function input(overrides={}) {
  return {
    originalRequestJson: JSON.stringify(request()),
    originalBodyBase64: '',
    serviceResourceUrl: SERVICE,
    ...overrides,
  };
}
function selectedPolicy(maxRequests=3) {
  return { policyVersion: 1, maxRequests, serviceResourceUrl: SERVICE };
}
const copy = value => JSON.parse(JSON.stringify(value));
function declaredChecksum(value) {
  // Called only on owned ordinary declared metadata, never hostile inputs.
  const core = { ...value };
  delete core.checksum;
  return 'sha256:' + createHash('sha256')
    .update(DOMAIN).update('\0').update(JSON.stringify(core), 'utf8').digest('hex');
}
function frozenData(value) {
  q(Object.getPrototypeOf(value), Object.prototype);
  ok(Object.isFrozen(value));
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === 'object') frozenData(child);
  }
}
function withRequest(overrides) {
  return input({ originalRequestJson: JSON.stringify(request(overrides)) });
}

const scenarios = [
  ['fixed empty-body capture retains exact request and declared funding metadata', () => {
    const original = input(), before = JSON.stringify(original);
    const record = capture(original, BINDING);
    q(record.custodyVersion, 1);
    q(record.profile, 'service-credit.execute.v1.empty-body');
    q(record.originalRequestJson, original.originalRequestJson);
    q(record.originalBodyBase64, '');
    q(record.serviceResourceUrl, SERVICE);
    q(record.fundingResourceUrl, FUNDING);
    q(record.paymentHash, BINDING.paymentHash);
    q(record.network, BINDING.network);
    q(record.grantId, 'grant_A');
    q(record.requestId, 'request_A');
    q(record.checksum, declaredChecksum(record));
    same(Object.keys(record), [
      'custodyVersion', 'profile', 'originalRequestJson', 'originalBodyBase64',
      'serviceResourceUrl', 'fundingResourceUrl', 'paymentHash', 'network',
      'grantId', 'requestId', 'checksum',
    ]);
    frozenData(record);
    same(policy(selectedPolicy(), FUNDING), selectedPolicy());
    same(key({ grantId: record.grantId, requestId: record.requestId }), {
      grantId: 'grant_A', requestId: 'request_A',
    });
    q(JSON.stringify(original), before);
  }],
  ['whole envelopes roundtrip with fresh frozen complete revalidation', () => {
    const first = capture(input(), BINDING);
    const text = serialize(first), parsed = parse(text), checked = validate(first);
    same(parsed, first);
    same(checked, first);
    ne(parsed, first);
    ne(checked, first);
    ne(parsed, checked);
    q(serialize(parsed), text);
    same(validate(copy(first)), first);
    same(parse(JSON.stringify(copy(first))), first);
    frozenData(parsed);
    frozenData(checked);
    throws(() => { parsed.grantId = 'changed'; }, TypeError);
    const p1 = policy(selectedPolicy(), FUNDING), p2 = policy(selectedPolicy(), FUNDING);
    same(p1, p2);
    ne(p1, p2);
    frozenData(p1);
    const k1 = key({ grantId: 'grant_A', requestId: 'request_A' });
    const k2 = key({ grantId: 'grant_A', requestId: 'request_A' });
    same(k1, k2);
    ne(k1, k2);
    frozenData(k1);
  }],
  ['deterministic records separate declared metadata without claiming SQL idempotency', () => {
    const first = capture(input(), BINDING), second = capture(input(), { ...BINDING });
    ne(first, second);
    q(serialize(first), serialize(second));
    q(first.checksum, second.checksum);
    const variants = [
      capture(withRequest({ requestId: 'request_B' }), BINDING),
      capture(withRequest({ grantId: 'grant_B' }), BINDING),
      capture(input(), { ...BINDING, paymentHash: 'b'.repeat(64) }),
      capture(input(), { ...BINDING, network: 'zenon:other-declared' }),
      capture(input(), { ...BINDING, fundingResourceUrl: FUNDING + '-other' }),
    ];
    for (const value of variants) {
      ne(serialize(value), serialize(first));
      ne(value.checksum, first.checksum);
      same(parse(serialize(value)), value);
    }
    q(variants[2].grantId, first.grantId);
    q(variants[2].requestId, first.requestId);
    ne(variants[2].paymentHash, first.paymentHash);
    // Contract determinism is not a database insertion or overwrite result.
    q(Object.hasOwn(first, 'persisted'), false);
    q(Object.hasOwn(first, 'durable'), false);
  }],
  ['wrong profiles bodies costs and credential fields are rejected', () => {
    for (const value of ['AA==', ' ', '\0', new String('')]) {
      throws(() => capture(input({ originalBodyBase64: value }), BINDING), rejected);
    }
    for (const change of [
      { modelVersion: 2 }, { method: 'GET' }, { routeId: 'other.execute' },
      { canonicalBodyDigest: 'sha256:' + '0'.repeat(64) },
      { selectedContentType: 'text/plain' }, { maxCostUnits: 0 },
      { maxCostUnits: -1 }, { maxCostUnits: 1.5 },
      { maxCostUnits: Number.MAX_SAFE_INTEGER + 1 },
      { proof: 'not-accepted' }, { header: 'not-accepted' },
      { authorization: 'ServiceCredit not-accepted' },
      { signature: 'not-accepted' },
    ]) throws(() => capture(withRequest(change), BINDING), rejected);
    for (const field of ['proof', 'authorization', 'headers', 'paymentSignatureHeader']) {
      throws(() => capture({ ...input(), [field]: 'not-accepted' }, BINDING), rejected);
    }
    const normal = input().originalRequestJson;
    for (const text of [
      ' ' + normal, normal + '\n',
      normal.replace('"grant_A"', '"\\u0067rant_A"'),
      JSON.stringify(Object.fromEntries(Object.entries(request()).reverse())),
      normal.replace('"modelVersion":1', '"modelVersion":1,"modelVersion":1'),
    ]) throws(() => capture(input({ originalRequestJson: text }), BINDING), rejected);
    for (const field of Object.keys(request())) {
      const missing = request();
      delete missing[field];
      throws(() => capture(input({ originalRequestJson: JSON.stringify(missing) }), BINDING),
        rejected);
    }
  }],
  ['canonical same-origin URLs refuse path query userinfo and redirect-like changes', () => {
    const badService = [
      'http://declared.invalid/service-credit/v1/execute',
      'https://user@declared.invalid/service-credit/v1/execute',
      'https://declared.invalid/service-credit/v1/execute?x=1',
      SERVICE + '?', SERVICE + '#', SERVICE + '#fragment',
      SERVICE + '/', 'https://declared.invalid/service-credit/v1/other',
      'https://other.invalid/service-credit/v1/execute',
      'https://DECLARED.invalid/service-credit/v1/execute',
      'https://declared.invalid:443/service-credit/v1/execute',
      'https://declared.invalid/service-credit/v1/../v1/execute',
      'https://declared.invalid/service-credit/v1/%65xecute',
      SERVICE + '?redirect=https://other.invalid/',
      SERVICE + '\r\n',
    ];
    for (const serviceResourceUrl of badService) {
      throws(() => capture(input({ serviceResourceUrl }), BINDING), rejected);
      throws(() => policy({ ...selectedPolicy(), serviceResourceUrl }, FUNDING), rejected);
    }
    for (const fundingResourceUrl of [
      'http://declared.invalid/funding', 'https://user:pass@declared.invalid/funding',
      FUNDING + '?x=1', FUNDING + '?', FUNDING + '#fragment',
      'https://declared.invalid/', FUNDING + '/',
      'https://declared.invalid/a/../funding', 'https://declared.invalid/%66unding',
      'https://other.invalid/funding', 'https://declared.invalid:8443/funding',
    ]) {
      throws(() => capture(input(), { ...BINDING, fundingResourceUrl }), rejected);
      throws(() => policy(selectedPolicy(), fundingResourceUrl), rejected);
    }
    const alternateFunding = 'https://declared.invalid:8443/funding';
    const alternateService = 'https://declared.invalid:8443/service-credit/v1/execute';
    const alternate = capture(input({ serviceResourceUrl: alternateService }), {
      ...BINDING, fundingResourceUrl: alternateFunding,
    });
    q(alternate.serviceResourceUrl, alternateService);
    q(alternate.fundingResourceUrl, alternateFunding);
    const changed = { ...capture(input(), BINDING), fundingResourceUrl: FUNDING + '/redirect' };
    throws(() => validate(changed), rejected);
  }],
  ['custody policy is explicit finite and versioned without default capacity', () => {
    for (const maxRequests of [1, 1024]) {
      const value = policy(selectedPolicy(maxRequests), FUNDING);
      q(value.maxRequests, maxRequests);
      frozenData(value);
    }
    for (const maxRequests of [
      0, 1025, -0, -1, NaN, Infinity, -Infinity, 1.5,
      Number.MAX_SAFE_INTEGER + 1, 1n, new Number(1),
    ]) throws(() => policy(selectedPolicy(maxRequests), FUNDING), rejected);
    for (const policyVersion of [0, 2, -0, NaN, 1n, new Number(1)]) {
      throws(() => policy({ ...selectedPolicy(), policyVersion }, FUNDING), rejected);
    }
    for (const field of Object.keys(selectedPolicy())) {
      const missing = selectedPolicy();
      delete missing[field];
      throws(() => policy(missing, FUNDING), rejected);
    }
    throws(() => policy({ ...selectedPolicy(), extra: true }, FUNDING), rejected);
    throws(() => policy(Object.assign(Object.create(null), selectedPolicy()), FUNDING), rejected);
    throws(() => policy(selectedPolicy()), rejected);
  }],
  ['corrupt extra missing and mixed envelopes never pass whole-record validation', () => {
    const original = capture(input(), BINDING), text = serialize(original);
    const changes = [
      { custodyVersion: 2 }, { profile: 'arbitrary-body' },
      { originalRequestJson: JSON.stringify(request({ maxCostUnits: 8 })) },
      { originalBodyBase64: 'AA==' }, { serviceResourceUrl: SERVICE + '/' },
      { fundingResourceUrl: FUNDING + '-changed' },
      { paymentHash: 'b'.repeat(64) }, { network: 'zenon:changed' },
      { grantId: 'grant_B' }, { requestId: 'request_B' },
      { checksum: 'sha256:' + '0'.repeat(64) },
    ];
    for (const change of changes) {
      const value = { ...original, ...change };
      throws(() => validate(value), rejected);
      throws(() => serialize(value), rejected);
      throws(() => parse(JSON.stringify(value)), rejected);
    }
    for (const field of Object.keys(original)) {
      const missing = { ...original };
      delete missing[field];
      throws(() => validate(missing), rejected);
      throws(() => parse(JSON.stringify(missing)), rejected);
    }
    throws(() => validate({ ...original, proof: 'not-accepted' }), rejected);
    throws(() => parse(JSON.stringify({ ...original, authorization: 'not-accepted' })), rejected);
    for (const value of [
      '{', 'null', '[]', text + '\n', ' ' + text,
      JSON.stringify(Object.fromEntries(Object.entries(original).reverse())),
      text.replace('"custodyVersion":1', '"custodyVersion":1,"custodyVersion":1'),
    ]) throws(() => parse(value), rejected);
    const falseDerived = { ...original, grantId: 'grant_B' };
    falseDerived.checksum = declaredChecksum(falseDerived);
    throws(() => validate(falseDerived), rejected);
    const other = capture(withRequest({ requestId: 'request_B' }), {
      ...BINDING, paymentHash: 'b'.repeat(64),
    });
    throws(() => validate({
      ...original, paymentHash: other.paymentHash, checksum: other.checksum,
    }), rejected);
    q(serialize(original), text);
  }],
  ['hostile records and coercible fields execute no input traps', () => {
    let touches = 0;
    const trap = () => { touches++; throw new Error('UNREACHED_INPUT_TRAP'); };
    const traps = {
      get: trap, ownKeys: trap, getPrototypeOf: trap,
      getOwnPropertyDescriptor: trap, has: trap,
    };
    function accessor(value, field) {
      const result = { ...value };
      Object.defineProperty(result, field, { enumerable: true, get: trap });
      return result;
    }
    const original = capture(input(), BINDING);
    throws(() => capture(new Proxy(input(), traps), BINDING), rejected);
    throws(() => capture(input(), new Proxy({ ...BINDING }, traps)), rejected);
    throws(() => policy(new Proxy(selectedPolicy(), traps), FUNDING), rejected);
    throws(() => key(new Proxy({ grantId: 'g', requestId: 'r' }, traps)), rejected);
    throws(() => validate(new Proxy(original, traps)), rejected);
    for (const field of Object.keys(input())) {
      throws(() => capture(accessor(input(), field), BINDING), rejected);
    }
    for (const field of Object.keys(BINDING)) {
      throws(() => capture(input(), accessor(BINDING, field)), rejected);
    }
    for (const field of Object.keys(original)) {
      throws(() => validate(accessor(original, field)), rejected);
    }
    throws(() => policy(accessor(selectedPolicy(), 'maxRequests'), FUNDING), rejected);
    throws(() => capture({ ...input(), [Symbol('extra')]: 1 }, BINDING), rejected);
    throws(() => validate({ ...original, [Symbol('extra')]: 1 }), rejected);
    const coercible = { [Symbol.toPrimitive]: trap, toString: trap, toJSON: trap };
    for (const value of [coercible, new String('fixed'), Symbol('fixed'), 1n]) {
      throws(() => capture(input({ originalRequestJson: value }), BINDING), rejected);
      throws(() => capture(input({ serviceResourceUrl: value }), BINDING), rejected);
      throws(() => capture(input(), { ...BINDING, paymentHash: value }), rejected);
      throws(() => parse(value), rejected);
    }
    throws(() => policy({ ...selectedPolicy(), serviceResourceUrl: coercible }, FUNDING), rejected);
    throws(() => policy(selectedPolicy(), coercible), rejected);
    throws(() => key({ grantId: coercible, requestId: 'r' }), rejected);
    const revoked = Proxy.revocable({}, traps);
    revoked.revoke();
    throws(() => capture(revoked.proxy, BINDING), rejected);
    q(touches, 0);
  }],
  ['arity byte character and safe-number limits preserve the zero-body boundary', () => {
    const original = capture(input(), BINDING);
    const text = serialize(original);
    throws(() => capture(), rejected);
    throws(() => capture(input()), rejected);
    throws(() => capture(input(), BINDING, undefined), rejected);
    throws(() => validate(original, undefined), rejected);
    throws(() => serialize(original, undefined), rejected);
    throws(() => parse(text, undefined), rejected);
    throws(() => key({ grantId: 'g', requestId: 'r' }, undefined), rejected);
    throws(() => policy(selectedPolicy(), FUNDING, undefined), rejected);
    for (const value of ['x'.repeat(4097), '\u00e9'.repeat(2049)]) {
      throws(() => capture(input({ originalRequestJson: value }), BINDING), rejected);
    }
    for (const value of ['x'.repeat(16385), '\u00e9'.repeat(8193)]) {
      throws(() => parse(value), rejected);
    }
    for (const network of ['x'.repeat(257), '\u00e9'.repeat(129), '']) {
      throws(() => capture(input(), { ...BINDING, network }), rejected);
    }
    q(capture(input(), { ...BINDING, network: 'x'.repeat(256) }).network.length, 256);
    q(capture(input(), { ...BINDING, network: '\u00e9'.repeat(128) }).network.length, 128);
    for (const paymentHash of ['a'.repeat(65), 'A'.repeat(64), '', 'a'.repeat(63)]) {
      throws(() => capture(input(), { ...BINDING, paymentHash }), rejected);
    }
    const maximum = capture(withRequest({
      grantId: 'G'.repeat(128), requestId: 'R'.repeat(128),
      maxCostUnits: Number.MAX_SAFE_INTEGER,
    }), BINDING);
    same(parse(serialize(maximum)), maximum);
    for (const grantId of ['', '_bad', 'a'.repeat(129), 'https://bad', 'a\n']) {
      throws(() => capture(withRequest({ grantId }), BINDING), rejected);
      throws(() => key({ grantId, requestId: 'r' }), rejected);
    }
    const zeroCost = input().originalRequestJson.replace('"maxCostUnits":7', '"maxCostUnits":-0');
    throws(() => capture(input({ originalRequestJson: zeroCost }), BINDING), rejected);
    for (const value of ['NaN', 'Infinity', '9007199254740992']) {
      const json = input().originalRequestJson.replace('"maxCostUnits":7', '"maxCostUnits":' + value);
      throws(() => capture(input({ originalRequestJson: json }), BINDING), rejected);
    }
    const empty = Buffer.alloc(0).toString('base64');
    q(empty, '');
    q(capture(input({ originalBodyBase64: empty }), BINDING).originalBodyBase64, '');
    throws(() => capture(input({ originalBodyBase64: Buffer.alloc(0) }), BINDING), rejected);
    throws(() => capture(input({ originalBodyBase64: Buffer.from('x').toString('base64') }),
      BINDING), rejected);
  }],
  ['declared identity grants no credential dispatch or durability authority', () => {
    const original = capture(input(), BINDING);
    same(Object.keys(contract).sort(), [
      'captureOriginalServiceDispatchIntent',
      'captureOriginalServiceRequestCustody',
      'parseOriginalServiceDispatchIntent',
      'parseOriginalServiceRequestCustody',
      'serializeOriginalServiceDispatchIntent',
      'serializeOriginalServiceRequestCustody',
      'snapshotOriginalServiceRequestCustodyKey',
      'snapshotOriginalServiceRequestCustodyPolicy',
      'validateOriginalServiceRequestCustody',
    ].sort());
    for (const field of [
      'proof', 'signature', 'authorization', 'headers', 'paymentHeader',
      'challengeHeader', 'privateKey', 'status', 'ready', 'custodyConfirmed',
      'reset', 'restore', 'dispatch', 'sign', 'verify', 'prepare',
    ]) q(Object.hasOwn(original, field), false);
    const anotherDeclaration = capture(input(), { ...BINDING, paymentHash: 'f'.repeat(64) });
    q(anotherDeclaration.grantId, original.grantId);
    q(anotherDeclaration.requestId, original.requestId);
    ne(anotherDeclaration.checksum, original.checksum);
    q(original.originalBodyBase64, '');
    // Pure source-boundary assertions; this establishes no backend behavior.
    q(pins[0].text.includes("from 'node:sqlite'"), false);
    q(pins[0].text.includes("from 'node:fs'"), false);
    q(pins[0].text.includes("from './service-credit-client.js'"), false);
    q(pins[0].text.includes("from './service-credit-capability.js'"), false);
  }],
];

q(scenarios.length, 10);
for (let index = 0; index < scenarios.length; index++) {
  if (selector === 'all' || selector === String(index + 1)) {
    const [name, run] = scenarios[index];
    test(name, { timeout: 5000 }, run);
  }
}
