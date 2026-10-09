// Synthetic declared-data projection tests only; no SDK, ledger or transport.
import assert from 'node:assert/strict';
import test from 'node:test';
import { getServiceCreditPilotStatusView as get } from '../src/service-credit-pilot-status-view.js';

const H = 'a'.repeat(64), R = 'synthetic-request';
const json = JSON.stringify;
function input(f = 'INCLUDED', s = 'IDLE', h = H, r = R) {
  const identity = { viewVersion: 1, paymentHash: h, requestId: r };
  return [json(identity), json({ ...identity, fundingStatus: f, serviceStatus: s })];
}
const [A, B] = input();
const bad = (a, b, message = 'INVALID_STATUS_VIEW_INPUT') =>
  assert.throws(() => get(a, b), { name: 'Error', message });
function check(f, s, phase, h = H, r = R) {
  const out = get(...input(f, s, h, r));
  assert.deepEqual(out, {
    viewVersion: 1, evidence: 'DECLARED_DATA_ONLY', phase,
    paymentHash: h, requestId: r,
    reconciliationRequired: ['RECOVERY_REQUIRED','FUNDING_PENDING'].includes(phase),
    authorization: 'NONE', mayStartPayment: false, maySignPayment: false,
    mayDispatchService: false, deliveryConfirmed: false
  });
  assert.ok(Object.isFrozen(out));
}

test('every phase stays non-authorizing', () => {
  for (const row of [
    ['UNKNOWN','IDLE','RECOVERY_REQUIRED'],
    ['PENDING','NOT_STARTED','FUNDING_PENDING'],
    ['FAILED','NOT_STARTED','FUNDING_REVIEW_REQUIRED'],
    ['INCLUDED','CLOSED','CLOSED'],
    ['NOT_STARTED','NOT_STARTED','FUNDING_NOT_STARTED'],
    ['INCLUDED','NOT_STARTED','FUNDED_NO_SESSION'],
    ['INCLUDED','IDLE','SERVICE_IDLE'],
    ['INCLUDED','EXECUTING','SERVICE_BUSY'],
    ['INCLUDED','SUCCEEDED','RESULT_REPORTED'],
    ['INCLUDED','UNAVAILABLE','SERVICE_UNAVAILABLE']
  ]) check(...row);
  check('INCLUDED', 'EXECUTING', 'SERVICE_BUSY', H, 'A0._:-' + 'r'.repeat(122));
});

test('uncertainty and funding precedence', () => {
  for (const s of ['SUCCEEDED','CLOSED']) {
    check('UNKNOWN', s, 'RECOVERY_REQUIRED');
    check('PENDING', s, 'FUNDING_PENDING');
    check('FAILED', s, 'FUNDING_REVIEW_REQUIRED');
  }
  for (const f of ['NOT_STARTED','PENDING','FAILED','INCLUDED']) {
    check(f, 'OUTCOME_UNKNOWN', 'RECOVERY_REQUIRED');
  }
  check('NOT_STARTED', 'CLOSED', 'CLOSED');
});

test('identity binding and null rules', () => {
  check('NOT_STARTED', 'NOT_STARTED', 'FUNDING_NOT_STARTED', null, null);
  for (const patch of [{ paymentHash: 'b'.repeat(64) }, { requestId: 'other' }]) {
    bad(A, json({ ...JSON.parse(B), ...patch }), 'ORIGINAL_IDENTITY_MISMATCH');
  }
  for (const [f, s] of [
    ['PENDING','NOT_STARTED'], ['NOT_STARTED','IDLE'], ['NOT_STARTED','CLOSED']
  ]) bad(...input(f, s, null, null));
  bad(...input('NOT_STARTED', 'NOT_STARTED', null, R));
  for (const s of ['EXECUTING','OUTCOME_UNKNOWN','SUCCEEDED']) {
    bad(...input('INCLUDED', s, H, null));
  }
});

test('strict transport, schema and error privacy', () => {
  for (const i of [0, 1]) {
    const text = [A, B][i], base = JSON.parse(text);
    const missing = { ...base };
    delete missing.requestId;
    for (const raw of [
      undefined, null, {}, [], 1, false, '', 'null', '[]', 'true', '0',
      'PRIVATE_SENTINEL{', ' ' + text, text + '\n',
      text.replace(':1', ':1.0'), text.replace('{', '{"viewVersion":1,'),
      json(missing), json({ requestId: R, ...base }),
      json({ ...base, privateProof: 'PRIVATE_SENTINEL' }), ' '.repeat(1025)
    ]) bad(i ? A : raw, i ? raw : B);
  }
});

test('invalid versions, IDs and labels', () => {
  const a = JSON.parse(A), b = JSON.parse(B);
  for (const [key, values] of [
    ['viewVersion', [0, 2, '1', null, true]],
    ['paymentHash', ['', 'A'.repeat(64), 'g'.repeat(64), H.slice(1), H + 'a', H + '\n', 1]],
    ['requestId', ['', '-bad', 'a b', '\u00e9', 'r'.repeat(129), 'r\n', 'r\u2028', false, {}]]
  ]) {
    for (const value of values) {
      bad(json({ ...a, [key]: value }), B);
      bad(A, json({ ...b, [key]: value }));
    }
  }
  for (const key of ['fundingStatus','serviceStatus']) {
    for (const value of ['READY', '', null, 1, {}, [], 'INCLUDED\n']) {
      bad(A, json({ ...b, [key]: value }));
    }
  }
});

test('fresh, frozen and stateless', () => {
  const args = input(), saved = [...args];
  const first = get(...args), second = get(...args);
  assert.notStrictEqual(first, second);
  assert.deepEqual(first, second);
  assert.ok(Object.isFrozen(first) && Object.isFrozen(second));
  assert.throws(() => { first.phase = 'READY'; }, TypeError);
  assert.deepEqual(args, saved);
  check('UNKNOWN', 'SUCCEEDED', 'RECOVERY_REQUIRED');
  check('INCLUDED', 'SUCCEEDED', 'RESULT_REPORTED');
});
