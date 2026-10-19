import test from 'node:test';
import a from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { captureOriginalPaymentCheckpoint as C, encodeOriginalPaymentCheckpoint as E,
 restoreOriginalPaymentCheckpoint as R } from '../src/service-credit-pilot-original-payment-checkpoint.js';

const KEYS = ['requestBody', 'paymentPayload', 'paymentRequirements', 'context'];
const b64 = v => Buffer.from(v).toString('base64'), clone = v => JSON.parse(JSON.stringify(v));
const bad = fn => a.throws(fn, TypeError);
const digest = v => createHash('sha256').update(Buffer.from(v, 'base64')).digest('hex');
function input() {
 return { binding: { requestId: ' request ', paymentHash: 'AbCd'.repeat(16),
   origin: 'https://example.invalid', contextId: ' context ' },
 originalBytes: { requestBody: b64(' a \n'), paymentPayload: b64([0, 255, 10]),
   paymentRequirements: b64(' requirements\n'), context: b64('{"declared":true}\n') } };
}
function fresh() {
 const { checkpoint: c, pins: p } = C(input()); return { c, p, s: E(c) };
}
function badValues(section, key, values) {
 for (const x of values) { const v = input(); v[section][key] = x; bad(() => C(v)); }
}

test('opaque roundtrip', { timeout: 1000 }, () => {
 const { c, p, s } = fresh(), r = R(s, p), v = input();
 a.deepEqual(r, c); a.deepEqual(r.binding, v.binding); a.equal(E(r), s);
 for (const k of KEYS) {
   a.equal(r.originalBytes[k], v.originalBytes[k]); a.equal(r.digests[k], digest(v.originalBytes[k]));
 }
});
test('separate pins and binding identity', { timeout: 1000 }, () => {
{
 const { c, p, s } = fresh();
 for (const v of [undefined, null, {}, c, { binding: p.binding }, { digests: p.digests }, { ...p, extra: 1 }])
   bad(() => R(s, v));
 for (const k of ['binding', 'digests']) {
   const v = clone(p); delete v[k][k === 'binding' ? 'contextId' : 'context']; bad(() => R(s, v));
 }
}
{
 const { c, p, s } = fresh();
 for (const [k, x] of Object.entries({
   requestId: 'other', paymentHash: 'aBcD'.repeat(16), origin: 'https://other.invalid', contextId: 'other',
 })) {
   const q = clone(p); q.binding[k] = x; bad(() => R(s, q));
   const v = clone(c); v.binding[k] = x; bad(() => R(E(v), p));
 }
}
});
test('stale and self-consistent mutations', { timeout: 1000 }, () => {
 const { c, p, s } = fresh();
 for (const k of KEYS) {
   const v = clone(c); v.originalBytes[k] = b64('changed ' + k);
   bad(() => E(v)); bad(() => R(JSON.stringify(v), p));
   v.digests[k] = digest(v.originalBytes[k]);
   const altered = E(v); a.notEqual(altered, s); bad(() => R(altered, p));
 }
});
test('input limits', { timeout: 1000 }, () => {
{
 for (const k of KEYS) badValues('originalBytes', k, ['', 'Zg', '====', 'Zg==\n', 'Zg__', 'Zh==', 'Zm9=', '!!!!', 1].filter(value => k !== 'requestBody' || value !== ''));
}
{
 const v = input();
 for (const k of KEYS) v.originalBytes[k] = Buffer.alloc(4096, 97).toString('base64');
 v.binding.requestId = 'x'.repeat(256); v.binding.contextId = '\u00e9'.repeat(128);
 const { checkpoint: c, pins: p } = C(v); a.deepEqual(R(E(c), p), c);
 for (const k of KEYS) badValues('originalBytes', k, [Buffer.alloc(4097, 97).toString('base64'), 'A'.repeat(5468)]);
 for (const k of ['requestId', 'contextId']) badValues('binding', k, ['x'.repeat(257), '\u00e9'.repeat(129)]);
 badValues('binding', 'origin', ['https://' + 'a'.repeat(2041)]);
 for (const s of [' '.repeat(32769), '\u00e9'.repeat(16385)]) bad(() => R(s, p));
}
{
 for (const k of ['requestId', 'contextId']) badValues('binding', k, ['', '\n', '\0', '\x7f', '\x85', '\ud800', null]);
 badValues('binding', 'paymentHash', ['a'.repeat(63), 'a'.repeat(65), 'G'.repeat(64), 'a'.repeat(64) + '\n', 1]);
 badValues('binding', 'origin', ['http://example.invalid', 'https://EXAMPLE.invalid', 'https://example.invalid/',
   'https://example.invalid:443', 'https://user@example.invalid', 'https://example.invalid/path',
   'https://example.invalid?q=1', 'https://example.invalid#x']);
}
});
test('strict wrapper shape', { timeout: 1000 }, () => {
{
 bad(() => C({ ...input(), extra: 1 })); bad(() => C([]));
 for (const section of ['binding', 'originalBytes']) {
   const v = input(); v[section].extra = 1; bad(() => C(v));
 }
 const v = input(); v.binding = Object.assign(Object.create({}), v.binding); bad(() => C(v));
 let reads = 0; const sample = input();
 Object.defineProperty(sample.binding, 'requestId', { enumerable: true, get() { reads++; throw Error('getter'); } });
 bad(() => C(sample)); a.equal(reads, 0);
}
{
 const { c, p } = fresh();
 for (const [k, x] of [['version', 2], ['version', '1'], ['authorization', 'VALIDATED'],
   ['authorization', 'ACKNOWLEDGED'], ['authorization', null], ['extra', 1]]) {
   const v = { ...c, [k]: x }; bad(() => E(v)); bad(() => R(JSON.stringify(v), p));
 }
 for (const x of ['A'.repeat(64), '0'.repeat(63), 1]) {
   const v = clone(c); v.digests.context = x; bad(() => E(v));
 }
 const v = clone(c); delete v.digests.context; bad(() => E(v));
}
{
 const { c, p, s } = fresh(), field = '"requestId":' + JSON.stringify(c.binding.requestId);
 for (const v of [
   s.replace('"version":1', '"version":1,"version":1'), s.replace(field, field + ',' + field),
   s.slice(0, -1) + ',"extra":true}', s.replace('"version":1', '"version":1.0'), '\n' + s, s + '\n',
   JSON.stringify({ authorization: 'NONE', version: 1, binding: c.binding, originalBytes: c.originalBytes, digests: c.digests }),
   s.replace(' request ', ' \\u0072equest '),
 ]) { a.notEqual(v, s); bad(() => R(v, p)); }
}
});
test('immutable copies', { timeout: 1000 }, () => {
 const v = input(), result = C(v), { checkpoint: c, pins: p } = result, s = E(c);
 const external = clone(p), r = R(s, external);
 for (const [left, right] of [[c.binding, v.binding], [c.originalBytes, v.originalBytes],
   [p.binding, c.binding], [p.digests, c.digests], [r.binding, external.binding]]) a.notEqual(left, right);
 for (const x of [result, c, c.binding, c.originalBytes, c.digests, p, p.binding, p.digests,
   r, r.binding, r.originalBytes, r.digests]) a.equal(Object.isFrozen(x), true);
 bad(() => { c.binding.requestId = 'changed'; });
 bad(() => { p.digests.context = '0'.repeat(64); });
 bad(() => { r.originalBytes.context = b64('changed'); });
 v.binding.requestId = 'changed'; v.originalBytes.context = b64('changed'); external.binding.contextId = 'changed';
 a.equal(E(c), s); a.equal(E(r), s); a.equal(Object.isFrozen(v.binding), false);
});
