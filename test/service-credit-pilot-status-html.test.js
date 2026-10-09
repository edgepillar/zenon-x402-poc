// Synthetic declared-data string checks only; no browser, SDK, ledger or transport.
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderServiceCreditPilotStatusHtml as render } from '../src/service-credit-pilot-status-html.js';

const H = 'a'.repeat(64), R = 'request._:-7';
const json = JSON.stringify;
function pair(f = 'INCLUDED', s = 'IDLE', h = H, r = R) {
  const original = { viewVersion: 1, paymentHash: h, requestId: r };
  return [json(original), json({ ...original, fundingStatus: f, serviceStatus: s })];
}
const [A, B] = pair();
const show = (f, s) => render(...pair(f, s));
const fail = (a, b, message = 'INVALID_STATUS_VIEW_INPUT') =>
  assert.throws(() => render(a, b), { name: 'Error', message });
const cases = [
  ['UNKNOWN','IDLE','Unknown funding or service outcome reported; original reconciliation required.'],
  ['PENDING','NOT_STARTED','Funding reported pending; original reconciliation required.'],
  ['FAILED','NOT_STARTED','Funding failure reported; original payment review required.'],
  ['INCLUDED','CLOSED','Service reported closed.'],
  ['NOT_STARTED','NOT_STARTED','Funding reported not started.'],
  ['INCLUDED','NOT_STARTED','Funding inclusion reported; no session reported.'],
  ['INCLUDED','IDLE','Service reported idle.'],
  ['INCLUDED','EXECUTING','Service execution reported in progress.'],
  ['INCLUDED','SUCCEEDED','Service result reported; delivery remains unconfirmed.'],
  ['INCLUDED','UNAVAILABLE','Service reported unavailable.']
];
function check(out, status) {
  assert.ok(out.includes(`<p><strong>Status:</strong> ${status}</p>`));
  assert.match(out, /<strong>Caller-declared data only; not evidence of funding, provider READY, current-context authority, authorization, delivery receipt or durable recovery\./);
  assert.ok(out.includes('This view authorizes no reset, replacement, resigning, retry or new charge.'));
}

test('every phase renders a declared non-authorizing status', () => {
  for (const [f, s, status] of cases) {
    const out = show(f, s);
    check(out, status);
    assert.ok(out.includes(`<dd>${H}</dd>`));
    assert.ok(out.includes(`<dd>${R}</dd>`));
  }
});

test('uncertainty dominates result and close', () => {
  for (const s of ['SUCCEEDED','CLOSED']) {
    check(show('UNKNOWN', s), cases[0][2]);
    check(show('PENDING', s), cases[1][2]);
  }
  for (const f of ['INCLUDED','PENDING','FAILED','NOT_STARTED']) {
    check(show(f, 'OUTCOME_UNKNOWN'), cases[0][2]);
  }
});

test('declared original identity is retained and mismatches reject', () => {
  const out = show('INCLUDED', 'IDLE');
  assert.ok(out.includes(`<dt>Declared original payment hash</dt><dd>${H}</dd>`));
  assert.ok(out.includes(`<dt>Declared original request ID</dt><dd>${R}</dd>`));
  for (const patch of [{ paymentHash: 'b'.repeat(64) }, { requestId: 'other' }]) {
    fail(A, json({ ...JSON.parse(B), ...patch }), 'ORIGINAL_IDENTITY_MISMATCH');
  }
});

test('unsafe and extra supplied fields never render', () => {
  for (const value of ['<PRIVATE_SENTINEL>', 'x&y', 'x>y', 'x"y', "x'y"]) {
    for (const i of [0, 1]) {
      const args = [A, B];
      args[i] = json({ ...JSON.parse(args[i]), requestId: value });
      fail(...args);
    }
  }
  for (const i of [0, 1]) {
    const args = [A, B];
    args[i] = json({ ...JSON.parse(args[i]), proof: 'PRIVATE_SENTINEL<script>' });
    fail(...args);
  }
});

test('null and invalid inputs keep inherited stable errors', () => {
  const out = render(...pair('NOT_STARTED', 'NOT_STARTED', null, null));
  check(out, cases[4][2]);
  assert.equal((out.match(/<dd>.*?<\/dd>/g) || []).join(''),
    '<dd>Not supplied</dd><dd>Not supplied</dd>');
  for (const i of [0, 1]) {
    const text = [A, B][i], base = JSON.parse(text);
    const missing = { ...base };
    delete missing.requestId;
    for (const raw of [
      undefined, null, {}, [], 1, false, '', 'PRIVATE_SENTINEL{', 'null', '[]',
      ' ' + text, text + '\n', text.replace('{', '{"viewVersion":1,'),
      json(missing), json({ requestId: R, ...base }),
      json({ ...base, viewVersion: '1' }), ' '.repeat(1025)
    ]) fail(i ? A : raw, i ? raw : B);
  }
  fail(...pair('PENDING', 'NOT_STARTED', null, null));
  fail(...pair('INCLUDED', 'EXECUTING', H, null));
  for (const key of ['fundingStatus','serviceStatus']) {
    fail(A, json({ ...JSON.parse(B), [key]: 'READY' }));
  }
});

test('output is deterministic and has no active surface', () => {
  const tags = [
    '<section aria-label="Service credit pilot status">', '</section>',
    '<h2>', '</h2>', '<p>', '</p>', '<strong>', '</strong>',
    '<dl>', '</dl>', '<dt>', '</dt>', '<dd>', '</dd>'
  ];
  for (const [f, s] of cases) {
    const out = show(f, s);
    assert.equal(out, show(f, s));
    assert.match(out, /^<section aria-label="Service credit pilot status">[\s\S]*<\/section>$/);
    assert.equal((out.match(/<\/?section/g) || []).join(''), '<section</section');
    assert.ok(out.includes('<h2>Service credit pilot status</h2>'));
    for (const tag of out.match(/<[^>]+>/g) || []) assert.ok(tags.includes(tag));
  }
});
