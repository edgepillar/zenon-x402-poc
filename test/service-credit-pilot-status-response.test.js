import test from 'node:test';
import a from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { getServiceCreditPilotStatusResponse as get } from '../src/service-credit-pilot-status-response.js';

const H = 'a'.repeat(64), R = 'synthetic-request';
function inputs(f = 'INCLUDED', s = 'IDLE') {
  const id = { viewVersion: 1, paymentHash: H, requestId: R };
  return [JSON.stringify(id), JSON.stringify({ ...id, fundingStatus: f, serviceStatus: s })];
}
const args = inputs();
const policy = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY'
};
const bad = (values, message = 'INVALID_STATUS_VIEW_INPUT') =>
  a.throws(() => get(...values), { name: 'Error', message });
function data(object, keys) {
  a.deepEqual(Reflect.ownKeys(object), keys);
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(object, key);
    a.ok(Object.hasOwn(d, 'value'));
    a.equal(d.enumerable, true);
  }
}

test('exact descriptor and fixed policy without overrides', () => {
  const r = get(...args);
  data(r, ['statusCode', 'headers', 'body']);
  a.equal(r.statusCode, 200);
  a.equal(typeof r.body, 'string');
  const expected = { ...policy, 'content-length': String(Buffer.byteLength(r.body, 'utf8')) };
  data(r.headers, Object.keys(expected));
  a.deepEqual(r.headers, expected);
  bad([...args, { 'cache-control': 'public' }], 'INVALID_STATUS_RESPONSE_INPUT');
});

test('warnings and uncertainty survive construction-only 200', () => {
  for (const [f, s] of [
    ['UNKNOWN', 'SUCCEEDED'], ['UNKNOWN', 'CLOSED'],
    ['INCLUDED', 'OUTCOME_UNKNOWN'], ['PENDING', 'SUCCEEDED']
  ]) {
    const r = get(...inputs(f, s));
    a.equal(r.statusCode, 200);
    a.match(r.body, /<section aria-label="Service credit pilot status">/);
    a.match(r.body, /<strong>Caller-declared data only;/);
    a.match(r.body, /not evidence of funding, provider READY,/);
    a.match(r.body, f === 'PENDING'
      ? /Funding reported pending;/ : /Unknown funding or service outcome reported;/);
    a.doesNotMatch(r.body, /Service result reported;|Service reported closed\./);
  }
  const r = get(...inputs('INCLUDED', 'SUCCEEDED'));
  a.match(r.body, /Service result reported; delivery remains unconfirmed\./);
  a.match(r.body, /This view authorizes no reset, replacement, resigning, retry or new charge\./);
});

test('content-length measures UTF-8 rather than code units', () => {
  const r = get(...args), bytes = Buffer.byteLength(r.body, 'utf8');
  a.equal(r.headers['content-length'], String(bytes));
  a.match(r.headers['content-length'], /^[1-9][0-9]*$/);
  for (const tag of ['title', 'h1']) {
    a.ok(r.body.includes(`<${tag}>Service credit status — declared data</${tag}>`));
  }
  a.ok(bytes > r.body.length);
});

test('outer objects and fresh headers reject mutation', () => {
  const x = get(...args), y = get(...args);
  a.notStrictEqual(x, y);
  a.notStrictEqual(x.headers, y.headers);
  a.deepEqual(x, y);
  for (const o of [x, y, x.headers, y.headers]) a.ok(Object.isFrozen(o));
  for (const mutate of [
    () => { x.statusCode = 500; },
    () => { x.body = 'changed'; },
    () => { x.headers['cache-control'] = 'public'; },
    () => { x.headers.extra = 'override'; }
  ]) a.throws(mutate, TypeError);
});

test('inherited identity and noncanonical JSON errors', () => {
  const observation = JSON.parse(args[1]);
  for (const patch of [{ paymentHash: 'b'.repeat(64) }, { requestId: 'other-request' }]) {
    bad([args[0], JSON.stringify({ ...observation, ...patch })], 'ORIGINAL_IDENTITY_MISMATCH');
  }
  for (const changed of [
    [args[0] + ' ', args[1]], [args[0], '\n' + args[1]],
    [args[0], args[1].replace('{', '{"viewVersion":1,')]
  ]) bad(changed);
});

test('missing and extra arity reject before rendering', () => {
  for (const values of [
    [], [args[0]], ['not-json'], [...args, undefined],
    ['not-json', 'not-json', undefined]
  ]) bad(values, 'INVALID_STATUS_RESPONSE_INPUT');
  bad(['not-json', 'not-json']);
});
