/* Selected real admission/gate/account-wire components with declared callbacks.
 * No native HTTPS owner import, socket, SDK, SQLite, key, signature or work.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { selectBoundedJsonRpcReadAdmissionProfile as PROFILE, createBoundedJsonRpcReadAdmission as ADMIT } from '../src/zenon/bounded-json-rpc-read-admission.js';
import { createRetainedAccountStateExchangeGate as GATE } from '../src/zenon/dynamic-plasma-retained-account-exchange-gate.js';
import { createZenonAccountStateReadTransport as WIRE } from '../src/zenon/dynamic-plasma-account-state-read-transport.js';
import { DYNAMIC_PLASMA_OBSERVATION_COLLECTOR_CONTRACT as COLLECTOR } from '../src/zenon/dynamic-plasma-observation-collector.js';

const DP = 'dynamic_plasma_retained_candidate', ACCOUNT = 'zenon_account_state_retained_candidate';
const METHOD = 'ledger.getFrontierAccountBlock', INFO = 'ledger.getAccountInfoByAddress';
const OPTIONS = { timeout: 5000, concurrency: false };
const totals = { declaredExchanges: 0, declaredAccepted: 0, declaredCloseStarts: 0, proxyTraps: 0, getters: 0 };
function address() {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l', words = [];
  let accumulator = 0, bits = 0, checksum = 1;
  for (const byte of [0, ...Array(19).fill(7)]) {
    accumulator = (accumulator << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; words.push((accumulator >>> bits) & 31); }
  }
  for (const word of [3, 0, 26, ...words, 0, 0, 0, 0, 0, 0]) {
    const top = checksum >>> 25; checksum = ((checksum & 0x1ffffff) << 5) ^ word;
    for (const [index, generator] of [0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3].entries())
      if ((top >>> index) & 1) checksum ^= generator;
  }
  checksum = (checksum ^ 1) >>> 0;
  return 'z1' + words.map(word => alphabet[word]).join('')
    + Array.from({ length: 6 }, (_, i) => alphabet[(checksum >>> (5 * (5 - i))) & 31]).join('');
}
const PAYER = address(); // Fixed address DATA, not a key or account claim.
const request = (method = METHOD) => Object.freeze({ method, params: Object.freeze([PAYER]) });
const body = (id = 1, method = METHOD, payer = PAYER) =>
  '{"jsonrpc":"2.0","id":' + id + ',"method":"' + method + '","params":["' + payer + '"]}';
const rejectGate = problem => {
  assert.ok(problem instanceof TypeError && Object.isFrozen(problem));
  assert.equal(problem.code, 'retained_account_state_exchange_unavailable');
  assert.equal(problem.stack, 'TypeError: ' + problem.code);
  assert.equal(Object.hasOwn(problem, 'cause'), false); return true;
};
function rejectedPromise(problem) { const p = Promise.reject(problem); p.catch(() => undefined); return p; }
function fixture({ exchange: customExchange, closeError = null } = {}) {
  const admission = ADMIT(ACCOUNT), seen = [];
  let exchanges = 0, accepted = 0, closeStarts = 0, closing = false;
  const closingPromise = closeError === null ? Promise.resolve(undefined) : rejectedPromise(closeError);
  const exchange = function exchange(text) {
    totals.declaredExchanges++; exchanges++; seen.push(text);
    if (!admission.claim()) return rejectedPromise(new Error('DECLARED_BUDGET_EXHAUSTED'));
    totals.declaredAccepted++; accepted++;
    if (customExchange !== undefined) return customExchange(text);
    const packet = JSON.parse(text);
    return Promise.resolve('{"jsonrpc":"2.0","id":' + packet.id + ',"result":null}');
  };
  const close = function close() {
    if (!closing) { closing = true; closeStarts++; totals.declaredCloseStarts++; }
    return closingPromise;
  };
  const owner = Object.freeze({ exchange, close });
  return { owner, gate: GATE(owner), admission, seen, closingPromise,
    counts: () => ({ exchanges, accepted, closeStarts }) };
}
function proxy(value) {
  const fail = () => { totals.proxyTraps++; throw new Error('PROXY_TRAP_FORBIDDEN'); };
  return new Proxy(value, { get: fail, getPrototypeOf: fail, ownKeys: fail, getOwnPropertyDescriptor: fail, apply: fail });
}

await test('legacy profiles retain thirteen and only explicit retained names select seventy-eight or eighteen', OPTIONS, () => {
  for (const name of ['dynamic_plasma', 'zenon_funding']) {
    assert.equal(PROFILE(name).maximumRequests, 13); assert.equal(PROFILE(name).policyVersion, 1);
  }
  assert.equal(PROFILE(DP).maximumRequests, 78); assert.equal(PROFILE(ACCOUNT).maximumRequests, 18);
  assert.equal(PROFILE(DP).policyVersion, 2); assert.equal(PROFILE(ACCOUNT).policyVersion, 2);
});
await test('all four actual counters admit exactly their fixed slots and remain exhausted without renewal', OPTIONS, () => {
  for (const name of ['dynamic_plasma', 'zenon_funding', DP, ACCOUNT]) {
    const a = ADMIT(name);
    for (let i = 0; i < a.profile.maximumRequests; i++) { assert.equal(a.available(), true); assert.equal(a.claim(), true); }
    assert.equal(a.available(), false); assert.equal(a.claim(), false); assert.equal(a.claim(), false);
    assert.equal(a.snapshot().remaining, 0); assert.equal(a.snapshot().consumed, a.profile.maximumRequests);
  }
});
await test('counter surfaces and detached snapshots are frozen and expose no reset or continuation', OPTIONS, () => {
  const a = ADMIT(DP), first = a.snapshot(); a.claim(); const second = a.snapshot();
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.profile) && Object.isFrozen(first));
  assert.deepEqual(Object.keys(a), ['profile','available','claim','snapshot']);
  assert.equal(first.consumed, 0); assert.equal(second.consumed, 1);
  assert.throws(() => { a.profile.maximumRequests = 1000; }, TypeError);
  assert.equal(a.profile.maximumRequests, 78);
});
await test('counter arity and closed name validation cannot consume or supply a floating budget', OPTIONS, () => {
  const a = ADMIT(ACCOUNT);
  assert.equal(a.claim(18), false); assert.equal(a.available(18), false); assert.equal(a.snapshot().consumed, 0);
  for (const value of [undefined,null,13,78,{},[],proxy({}),Symbol('profile'),'__proto__','constructor',DP + ' ']) {
    assert.throws(() => PROFILE(value), { code: 'bounded_json_rpc_read_admission_profile_rejected' });
    assert.throws(() => ADMIT(value), { code: 'bounded_json_rpc_read_admission_profile_rejected' });
  }
  assert.throws(() => PROFILE(DP, 1000), { code: 'bounded_json_rpc_read_admission_profile_rejected' });
  assert.throws(() => ADMIT(), { code: 'bounded_json_rpc_read_admission_profile_rejected' });
  assert.equal(totals.proxyTraps, 0);
});
await test('six maximal paginated DP cycles and account brackets derive the real one-hundred-seventy-four ceiling', OPTIONS, () => {
  assert.equal(COLLECTOR.maximumPages, 8); assert.equal(COLLECTOR.maximumCallsPerEndpoint, 13);
  assert.equal(PROFILE(DP).maximumRequests, 6 * (5 + COLLECTOR.maximumPages));
  assert.equal(PROFILE(ACCOUNT).maximumRequests, 6 * 3);
  assert.equal(2 * PROFILE(DP).maximumRequests + PROFILE(ACCOUNT).maximumRequests, 174);
  assert.notEqual(PROFILE(DP).maximumRequests, 6 * 6); // Not the easier single-page fixture ceiling.
});
await test('two independent endpoint counters and one account counter never share or refund slots', OPTIONS, () => {
  const a = ADMIT(DP), b = ADMIT(DP), c = ADMIT(ACCOUNT);
  for (let i = 0; i < 78; i++) assert.equal(a.claim(), true);
  assert.equal(a.claim(), false); assert.equal(b.snapshot().remaining, 78); assert.equal(c.snapshot().remaining, 18);
  for (let i = 0; i < 78; i++) assert.equal(b.claim(), true);
  for (let i = 0; i < 18; i++) assert.equal(c.claim(), true);
  assert.equal(a.snapshot().consumed + b.snapshot().consumed + c.snapshot().consumed, 174);
});
await test('gate construction is inert and retains the original close function', OPTIONS, () => {
  const f = fixture(); assert.deepEqual(f.counts(), { exchanges:0, accepted:0, closeStarts:0 });
  assert.equal(f.gate.close, f.owner.close); assert.ok(Object.isFrozen(f.gate) && Object.isFrozen(f.gate.exchange));
  assert.deepEqual(Object.keys(f.gate), ['exchange','close']);
});
await test('invalid owner shapes proxies and getters are rejected before any operational callback', OPTIONS, () => {
  for (const value of [null,{},[],proxy(Object.freeze({ exchange(){}, close(){} }))]) assert.throws(() => GATE(value), rejectGate);
  const getters = Object.freeze({ get exchange() { totals.getters++; throw Error('GETTER'); }, close(){} });
  assert.throws(() => GATE(getters), rejectGate);
  const mutable = { exchange(){}, close(){} }; assert.throws(() => GATE(mutable), rejectGate);
  assert.throws(() => GATE(Object.freeze({ exchange:proxy(() => undefined), close(){} })), rejectGate);
  assert.equal(totals.getters, 0); assert.equal(totals.proxyTraps, 0);
});
await test('actual account-state wire crosses all eighteen original generated request IDs without reset or re-encoding', OPTIONS, async () => {
  const f = fixture(), wire = WIRE({ exchange: f.gate.exchange });
  for (let i = 1; i <= 18; i++) {
    const method = i % 3 === 2 ? INFO : METHOD;
    assert.equal(await wire.callRead(request(method)), 'null');
    assert.equal(f.seen[i - 1], body(i, method));
  }
  assert.deepEqual(f.counts(), { exchanges:18, accepted:18, closeStarts:0 });
  await assert.rejects(wire.callRead(request()), { code: 'dynamic_plasma_json_rpc_read_transport_unavailable' });
  assert.deepEqual(f.counts(), { exchanges:18, accepted:18, closeStarts:1 });
});
await test('both closed account methods forward the identical original string bytes', OPTIONS, async () => {
  for (const method of [METHOD, INFO]) {
    const f = fixture(), original = body(1, method);
    const response = await f.gate.exchange(original);
    assert.equal(response, '{"jsonrpc":"2.0","id":1,"result":null}');
    assert.equal(f.seen[0], original); assert.equal(f.seen.length, 1);
  }
});
await test('publish funding and unrelated RPC methods are rejected before exchange and close only once', OPTIONS, async () => {
  for (const method of ['ledger.publishRawTransaction','ledger.getAccountBlockByHash','embedded.plasma.getRequiredPoWForAccountBlock','wallet.sign']) {
    const f = fixture();
    const first = f.gate.exchange(body(1, method)); await assert.rejects(first, rejectGate);
    assert.equal(f.gate.exchange(body()), first); await assert.rejects(f.gate.exchange(body()), rejectGate);
    assert.deepEqual(f.counts(), { exchanges:0, accepted:0, closeStarts:1 });
  }
});
await test('numeric IDs are only the exact canonical one-through-eighteen generated domain', OPTIONS, async () => {
  for (const id of ['0','19','01','1.0','1e0','-1','"1"','null']) {
    const f = fixture(); await assert.rejects(f.gate.exchange(body(id)), rejectGate);
    assert.deepEqual(f.counts(), { exchanges:0, accepted:0, closeStarts:1 });
  }
});
await test('invalid payer checksums are rejected with the actual address codec before native delegation', OPTIONS, async () => {
  const f = fixture(), invalid = PAYER.slice(0,-1) + (PAYER.endsWith('q') ? 'p' : 'q');
  await assert.rejects(f.gate.exchange(body(1, METHOD, invalid)), rejectGate);
  assert.deepEqual(f.counts(), { exchanges:0, accepted:0, closeStarts:1 });
});
await test('whitespace extra fields malformed parameters and oversized or non-string packets are not normalized', OPTIONS, async () => {
  const original = body();
  for (const value of [' ' + original, original + ' ', original.replace('"params":', '"extra":0,"params":'),
    original.replace('["' + PAYER + '"]','[]'), original.replace('2.0','1.0'), 'x'.repeat(1025), null,
    proxy({ toString(){ totals.getters++; return original; } })]) {
    const f = fixture(); await assert.rejects(f.gate.exchange(value), rejectGate);
    assert.deepEqual(f.counts(), { exchanges:0, accepted:0, closeStarts:1 });
  }
  assert.equal(totals.proxyTraps, 0); assert.equal(totals.getters, 0);
});
await test('actual account-wire busy refusal cannot issue a second borrowed exchange or consume the next ID', OPTIONS, async () => {
  let release; const f = fixture({ exchange: text => new Promise(resolve => { release = () => resolve('{"jsonrpc":"2.0","id":' + JSON.parse(text).id + ',"result":null}'); }) });
  const wire = WIRE({ exchange:f.gate.exchange }), first = wire.callRead(request());
  await assert.rejects(wire.callRead(request()), { code:'dynamic_plasma_json_rpc_read_transport_busy' });
  assert.equal(f.seen.length,1); release(); assert.equal(await first,'null');
  assert.equal(f.seen[0],body(1)); assert.equal(f.counts().closeStarts,0);
});
await test('synchronous borrowed failure is scrubbed without inspecting its properties or retrying', OPTIONS, async () => {
  const raw = proxy({ private:'must not inspect' }), f = fixture({ exchange:() => { throw raw; } });
  await assert.rejects(f.gate.exchange(body()), rejectGate);
  await assert.rejects(f.gate.exchange(body()), rejectGate);
  assert.deepEqual(f.counts(), { exchanges:1, accepted:1, closeStarts:1 }); assert.equal(totals.proxyTraps,0);
});
await test('underlying close uncertainty remains the same rejected close and is never reported as native cleanup', OPTIONS, async () => {
  const reason = Object.freeze(new Error('DECLARED_CLOSE_UNCERTAIN')), f = fixture({ closeError:reason });
  await assert.rejects(f.gate.exchange('invalid'), rejectGate);
  assert.equal(f.gate.close(),f.closingPromise); assert.equal(f.gate.close(),f.closingPromise);
  await assert.rejects(f.gate.close(),error => error === reason);
  assert.deepEqual(f.counts(), { exchanges:0, accepted:0, closeStarts:1 });
});
await test('repeated raw IDs do not renew the actual shared account admission counter', OPTIONS, async () => {
  const f = fixture();
  for (let i=0;i<18;i++) await f.gate.exchange(body(1));
  await assert.rejects(f.gate.exchange(body(1)), /DECLARED_BUDGET_EXHAUSTED/);
  assert.equal(f.admission.snapshot().consumed,18); assert.equal(f.counts().accepted,18);
  await assert.rejects(f.gate.exchange(body(1)), /DECLARED_BUDGET_EXHAUSTED/);
  assert.equal(f.admission.snapshot().remaining,0);
});
await test('successful delegation preserves the original owned Promise identity and never reads borrowed outcome properties', OPTIONS, () => {
  const pending = Promise.resolve('declared'), f = fixture({ exchange:() => pending });
  assert.equal(f.gate.exchange(body()),pending);
  const foreign = proxy({}), g = fixture({ exchange:() => foreign });
  assert.equal(g.gate.exchange(body()),foreign); assert.equal(totals.proxyTraps,0);
});
await test('runtime then drift fails closed permanently even after restoration without invoking the hook', OPTIONS, async () => {
  const f = fixture(); let rejected;
  try {
    Object.defineProperty(Object.prototype,'then',{ configurable:true,get(){ totals.getters++; throw Error('THEN_HOOK'); } });
    rejected = f.gate.exchange(body());
  } finally { delete Object.prototype.then; }
  await assert.rejects(rejected,rejectGate); await assert.rejects(f.gate.exchange(body()),rejectGate);
  assert.deepEqual(f.counts(),{exchanges:0,accepted:0,closeStarts:1});
  assert.equal(totals.getters,0); assert.equal(totals.proxyTraps,0);
});
console.log('# retained-read-admission-components ' + JSON.stringify({ cases:20,...totals,
  nativeHttpsOwnerImported:false,nativeConnections:0,SDK:0,SQLite:0,keys:0,signatures:0,nonceEvaluations:0,
  newTasks:0,newScratch:0,fullNativeRetainedReadsQualified:false }));
