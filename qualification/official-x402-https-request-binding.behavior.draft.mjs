// Explicit current source selection. No official-package import or native HTTP.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureOfficialUpfrontHttpsRoute as ROUTE,
  captureOfficialUpfrontHttpsRequest as REQUEST,
} from '../src/x402-official-https-request-binding.js';

assert.equal(process.versions.node, '24.19.0');
assert.equal(process.argv.length, 2);
const URL = 'https://request-binding.invalid:8443/paid';
const FAILURE = { code: 'x402_official_https_request_binding_input_rejected' };
const OPTIONS = Object.freeze({ timeout: 5000, concurrency: false });
function request(headers = []) {
  return { method: 'GET', url: '/paid', httpVersion: '1.1', socket: { encrypted: true },
    rawHeaders: ['Host', 'request-binding.invalid:8443', ...headers] };
}
const reject = (value, route = ROUTE(URL)) => assert.throws(() => REQUEST(value, route), FAILURE);

test('official HTTPS route selects one exact canonical resource without transport', OPTIONS, () => {
  const route = ROUTE(URL);
  assert.ok(Object.isFrozen(route));
  assert.deepEqual(route, { resourceUrl: URL, authority: 'request-binding.invalid:8443', requestTarget: '/paid' });
  for (const value of ['http://request-binding.invalid:8443/paid',
    'https://request-binding.invalid:443/paid', 'https://REQUEST-binding.invalid:8443/paid',
    'https://request-binding.invalid:8443/%70aid', URL + '?x=1', URL + '#x',
    'https://user@request-binding.invalid:8443/paid', 'https://request-binding.invalid:8443/other', null])
    assert.throws(() => ROUTE(value), FAILURE);
  assert.throws(() => ROUTE(URL, null), FAILURE);
});
test('official HTTPS request retains absent or original payment header as frozen DATA', OPTIONS, () => {
  const route = ROUTE(URL), unpaid = REQUEST(request(), route);
  assert.deepEqual(unpaid, { method: 'GET', requestTarget: '/paid', resourceUrl: URL, paymentSignature: null });
  assert.ok(Object.isFrozen(unpaid));
  const input = request(['Payment-Signature', 'b3JpZ2luYWw=', 'Content-Length', '0', 'Connection', 'close']);
  const paid = REQUEST(input, route);
  input.rawHeaders[3] = 'Y2hhbmdlZA=='; input.url = '/changed';
  assert.equal(paid.paymentSignature, 'b3JpZ2luYWw='); assert.ok(Object.isFrozen(paid));
  assert.equal(REQUEST(request(['pAyMeNt-SiGnAtUrE', 'b3JpZ2luYWw=']), route).paymentSignature, paid.paymentSignature);
});
test('official HTTPS request rejects method target protocol authority and TLS changes', OPTIONS, () => {
  for (const change of [
    value => { value.method = 'POST'; }, value => { value.url = '/paid?x=1'; },
    value => { value.url = 'https://request-binding.invalid:8443/paid'; },
    value => { value.url = '/%70aid'; }, value => { value.httpVersion = '2.0'; },
    value => { value.rawHeaders[1] = 'other.invalid:8443'; },
    value => { value.rawHeaders[1] = 'request-binding.invalid'; },
    value => { value.rawHeaders[1] = 'REQUEST-binding.invalid:8443'; },
    value => { value.socket.encrypted = false; }, value => { delete value.socket; },
  ]) { const value = request(); change(value); reject(value); }
  reject(request(), Object.freeze({ ...ROUTE(URL) }));
});
test('official HTTPS request refuses body framing upgrades and duplicate raw headers', OPTIONS, () => {
  for (const headers of [
    ['Content-Length', '1'], ['Content-Length', '00'], ['Transfer-Encoding', 'chunked'],
    ['Expect', '100-continue'], ['Upgrade', 'websocket'], ['Trailer', 'x-end'],
    ['Connection', 'upgrade'], ['Host', 'request-binding.invalid:8443'],
    ['Payment-Signature', 'a', 'payment-signature', 'b'], ['X-Test', 'a', 'x-test', 'b'],
  ]) reject(request(headers));
});
test('official HTTPS request bounds raw header shape count bytes and payment scalar', OPTIONS, () => {
  const route = ROUTE(URL);
  for (const value of ['', ' ', 'a\r\nb', 'a'.repeat(8193)]) reject(request(['Payment-Signature', value]), route);
  reject(request(['Bad Header', 'a']), route);
  for (const name of ['X-Test\n', 'X-Test\r', 'X-Test\u2028']) reject(request([name, 'v']), route);
  for (const value of ['v\n', 'v\r', 'v\u2028']) reject(request(['X-Test', value]), route);
  const odd = request(); odd.rawHeaders.push('X-Incomplete'); reject(odd, route);
  const sparse = request(); sparse.rawHeaders.length = 4; reject(sparse, route);
  const extra = request(); extra.rawHeaders.extra = true; reject(extra, route);
  const excess = request(Array.from({ length: 64 }, (_, index) => ['X-' + index, 'v']).flat()); reject(excess, route);
  const bytes = request(['X-First', 'a'.repeat(8192), 'X-Second', 'b'.repeat(8192)]); reject(bytes, route);
  assert.equal(REQUEST(request(['Payment-Signature', 'a'.repeat(8192)]), route).paymentSignature.length, 8192);
});
test('official HTTPS request never invokes accessor proxy or stream hooks', OPTIONS, () => {
  let hooks = 0;
  const hook = () => { hooks++; throw Error('PRIVATE_DECLARED_HOOK'); };
  const route = ROUTE(URL);
  reject(new Proxy(request(), { get: hook, ownKeys: hook, getOwnPropertyDescriptor: hook }), route);
  for (const field of ['method', 'url', 'httpVersion', 'socket', 'rawHeaders']) {
    const value = request(); Object.defineProperty(value, field, { enumerable: true, get: hook }); reject(value, route);
  }
  const socket = request(); Object.defineProperty(socket.socket, 'encrypted', { enumerable: true, get: hook }); reject(socket, route);
  const headers = request(); Object.defineProperty(headers.rawHeaders, '0', { enumerable: true, get: hook }); reject(headers, route);
  const body = request(); body.on = hook; body.read = hook; body.resume = hook; body.destroy = hook;
  assert.equal(REQUEST(body, route).paymentSignature, null);
  assert.equal(hooks, 0);
});
test('official HTTPS request does not consume inputs on a rejected route or arity', OPTIONS, t => {
  const value = request(), route = ROUTE(URL), before = JSON.stringify(value);
  assert.throws(() => REQUEST(value), FAILURE);
  assert.throws(() => REQUEST(value, route, null), FAILURE);
  reject(value, null);
  assert.equal(JSON.stringify(value), before);
  assert.equal(REQUEST(value, route).paymentSignature, null);
  t.diagnostic(JSON.stringify({ kind: 'P1_OFFICIAL_HTTPS_REQUEST_BINDING', version: 1,
    selectedCases: 7, declaredRequestFieldsOnly: true, rawHeaderPairsBound: 64,
    rawHeaderBytesBound: 16384, paymentHeaderBytesBound: 8192,
    officialPackageImported: false, officialServerImported: false,
    nativeHttpOrTls: 0, network: 0, sql: 0, keys: 0, signatures: 0,
    nonceSearch: 0, realPrepare: 0, payments: 0, serviceDelivery: 'NOT_ESTABLISHED' }));
});
