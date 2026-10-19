import test from 'node:test';
import a from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { captureOriginalPaymentCheckpoint as C, encodeOriginalPaymentCheckpoint as E,
 restoreOriginalPaymentCheckpoint as R } from '../src/service-credit-pilot-original-payment-checkpoint.js';

const K = ['requestBody','paymentPayload','paymentRequirements','context'];
const b64 = v => Buffer.from(v).toString('base64'), clone = v => JSON.parse(JSON.stringify(v));
const hash = s => createHash('sha256').update(Buffer.from(s, 'base64')).digest('hex');
const EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const bad = fn => a.throws(fn, TypeError);
const input = (body = b64('body')) => ({
 binding: { requestId: 'request.synthetic', paymentHash: 'a'.repeat(64),
  origin: 'https://checkpoint.invalid', contextId: 'context.synthetic' },
 originalBytes: { requestBody: body, paymentPayload: b64([0,255,10]),
  paymentRequirements: b64('requirements'), context: b64('{"synthetic":true}\n') },
});
const pins = v => ({ binding: { ...v.binding },
 digests: Object.fromEntries(K.map(k => [k, hash(v.originalBytes[k])])) });

test('empty original request body roundtrips without replacement or authority', () => {
 const v = input(''), expected = pins(v);
 a.equal(expected.digests.requestBody, EMPTY);
 let result, s, r;
 a.doesNotThrow(() => { result = C(v); s = E(result.checkpoint); r = R(s, expected); },
  'EMPTY_ORIGINAL_REQUEST_BODY_CAPTURE_AND_ROUNDTRIP');
 const { checkpoint: c, pins: p } = result;
 a.deepEqual(p, expected); a.deepEqual(r, c); a.deepEqual(r.originalBytes, v.originalBytes);
 a.equal(Object.hasOwn(r.originalBytes, 'requestBody'), true);
 a.equal(r.originalBytes.requestBody, ''); a.equal(Buffer.from(r.originalBytes.requestBody, 'base64').length, 0);
 a.equal(r.digests.requestBody, EMPTY); a.equal(E(r), s); bad(() => R(s + '\n', expected));
 a.equal(c.version, 1); a.equal(r.authorization, 'NONE'); a.equal(c.authorization, 'NONE');
 for (const x of [result,c,c.binding,c.originalBytes,c.digests,p,p.binding,p.digests,
  r,r.binding,r.originalBytes,r.digests]) a.equal(Object.isFrozen(x), true);
 for (const [x,y] of [[c.binding,v.binding],[c.originalBytes,v.originalBytes],
  [p.binding,c.binding],[p.digests,c.digests],[r.binding,expected.binding],
  [r.digests,expected.digests],[r.originalBytes,c.originalBytes]]) a.notEqual(x,y);
 v.binding.requestId = 'changed'; v.originalBytes.context = b64('changed');
 expected.binding.contextId = 'changed'; a.equal(E(c), s); a.equal(E(r), s);
});

test('nonempty checkpoint controls retain field binding and authority rejection', () => {
 const { checkpoint: c, pins: p } = C(input()), s = E(c);
 a.equal(R(s, p).authorization, 'NONE');
 const reject = (k, value, missing = false) => {
  const v = input(), d = clone(c);
  if (missing) { delete v.originalBytes[k]; delete d.originalBytes[k]; }
  else { v.originalBytes[k] = value; d.originalBytes[k] = value; d.digests[k] = hash(value); }
  bad(() => C(v)); bad(() => E(d));
  bad(() => R(JSON.stringify(d), { binding: { ...d.binding }, digests: { ...d.digests } }));
 };
 for (const k of K) reject(k, '', true);
 for (const k of K.slice(1)) reject(k, '');
 for (const v of ['Zg','Zh==','Zg==\n',b64(Buffer.alloc(4097))]) reject('requestBody', v);
 for (const [k,value] of Object.entries({ requestId: 'other', paymentHash: 'b'.repeat(64),
  origin: 'https://other.invalid', contextId: 'other' })) {
  const d = clone(c); d.binding[k] = value;
  const changed = E(d); a.notEqual(changed, s); bad(() => R(changed, p));
  const external = clone(p); external.binding[k] = value; bad(() => R(s, external));
 }
 const d = clone(c); d.originalBytes.context = b64('changed context');
 bad(() => E(d)); d.digests.context = hash(d.originalBytes.context);
 bad(() => R(E(d), p));
 const external = clone(p); external.digests.context = '0'.repeat(64); bad(() => R(s, external));
 for (const authorization of ['VALIDATED','ACKNOWLEDGED']) {
  const changed = { ...c, authorization }; bad(() => E(changed));
  bad(() => R(JSON.stringify(changed), p));
  bad(() => R(s, { ...p, authorization }));
 }
});
