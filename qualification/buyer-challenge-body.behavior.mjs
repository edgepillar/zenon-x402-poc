// Actual buyer + real in-memory Web Streams. Declared HTTP/payload DATA only.
// No SDK, official x402 package, socket, SQL, keys/signatures or nonce search.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ReadableStream } from 'node:stream/web';
import { paidFetch, reconcilePayment, PaymentSubmissionOutcomeUnknownError } from '../src/buyer.js';
import { cancelBuyerChallengeBody as CANCEL } from '../src/buyer-challenge-body.js';
import { encodeB64Json as ENCODE, decodeB64Json as DECODE, HEADERS, MOCK_ZENON_CHAIN_PROFILE } from '../src/x402-wire.js';

assert.equal(process.version, 'v24.19.0');
assert.equal(process.env.X402_BUYER_CHALLENGE_BODY, 'builtin-only-memory-streams-and-declared-http');
const TARGET = 'https://buyer-body.invalid/paid';
const FAILURE = 'payment_challenge_response_cleanup_failed';
const headers = fields => ({ get(name) { return Object.hasOwn(fields, name) ? fields[name] : null; } });
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
function fixture({ cancel, body = 'stream', realResponse = false } = {}) {
  const f = { calls: 0, submissions: 0, preparations: 0, cancels: 0, paidCancels: 0, trace: [], sent: [], state: 'success' };
  f.requirement = { scheme: 'exact', network: 'zenon:mock', asset: 'synthetic-asset', amount: '1', payTo: 'synthetic-payee',
    maxTimeoutSeconds: 60, extra: { poc: true, settlement: 'account-block', zenonChain: { ...MOCK_ZENON_CHAIN_PROFILE }, paymentFlow: 'upfront' } };
  f.required = { x402Version: 2, resource: { url: TARGET }, accepts: [f.requirement] };
  f.stream = new ReadableStream({ cancel(reason) { f.cancels++; f.trace.push('cancel'); assert.equal(reason, undefined); return cancel?.(); } });
  f.paidBody = new ReadableStream({ cancel() { f.paidCancels++; } });
  const selectedBody = body === 'stream' ? f.stream : body === 'null' ? null : undefined;
  f.first = realResponse ? new Response(selectedBody, { status: 402, headers: { [HEADERS.PAYMENT_REQUIRED]: ENCODE(f.required) } })
    : { status: 402, url: TARGET, headers: headers({ [HEADERS.PAYMENT_REQUIRED]: ENCODE(f.required) }),
      ...(body === 'missing' ? {} : { body: selectedBody }) };
  f.client = { async createPaymentPayload(required, accepted) {
    f.preparations++; f.trace.push('prepare');
    if (f.prepare) return f.prepare(required, accepted);
    return { x402Version: 2, resource: structuredClone(required.resource), accepted: structuredClone(accepted),
      payload: { transaction: { hash: 'a'.repeat(64), address: 'declared-payer' }, intentDigest: 'b'.repeat(64) } };
  } };
  f.fetch = async (_target, options) => {
    f.calls++;
    if (options === undefined) return f.first;
    f.submissions++; f.trace.push('submit'); f.sent.push(options.headers[HEADERS.PAYMENT_SIGNATURE]);
    assert.equal(_target, TARGET); assert.equal(options.redirect, 'manual');
    if (f.state === 'lost') throw new Error('declared transport loss');
    if (f.state === 'redirect') return { status: 302, headers: headers({}), body: f.paidBody };
    const payload = DECODE(options.headers[HEADERS.PAYMENT_SIGNATURE]);
    const identity = { network: payload.accepted.network, transaction: payload.payload.transaction.hash, payer: payload.payload.transaction.address };
    const settlement = f.state === 'pending'
      ? { success: false, ...identity, state: 'SUBMISSION_OUTCOME_UNKNOWN', errorReason: 'pending', retrySamePayment: true }
      : { success: true, ...identity, state: 'MOMENTUM_INCLUDED' };
    f.paid = { status: f.state === 'pending' ? 409 : 200, headers: headers({ [HEADERS.PAYMENT_RESPONSE]: ENCODE(settlement) }), body: f.paidBody };
    return f.paid;
  };
  f.run = () => paidFetch(TARGET, f.client, f.fetch);
  return f;
}

test('cancel the initial 402 stream before payment preparation and submission', async () => {
  const f=fixture(), result=await f.run(); assert.equal(result.settlement.success,true);
  assert.deepEqual(f.trace,['cancel','prepare','submit']); assert.equal(f.cancels,1);
});
test('wait for deferred cancellation before entering the payment callback', async () => {
  const gate=deferred(),f=fixture({cancel:()=>gate.promise}); const pending=f.run();
  try { await tick(); assert.equal(f.preparations,0); assert.equal(f.submissions,0); assert.equal(f.cancels,1); }
  finally { gate.resolve(); await pending; }
  assert.deepEqual(f.trace,['cancel','prepare','submit']);
});
test('rejected cancellation prevents any payment construction or signed request', async () => {
  const f=fixture({cancel:()=>Promise.reject(new Error('private-cancel-reason'))});
  await assert.rejects(f.run(),e=>e.message===FAILURE && !(e instanceof PaymentSubmissionOutcomeUnknownError));
  assert.equal(f.preparations+f.submissions,0); assert.equal(f.cancels,1);
});
test('throwing cancellation is a pre-payment refusal with a fixed error', async () => {
  const f=fixture({cancel:()=>{throw Error('private-cancel-throw');}});
  await assert.rejects(f.run(),{message:FAILURE}); assert.equal(f.preparations+f.submissions,0);
});
test('a locked initial stream cannot allow payment preparation', async () => {
  const f=fixture(),reader=f.stream.getReader();
  try { await assert.rejects(f.run(),{message:FAILURE}); assert.equal(f.preparations+f.submissions,0); }
  finally { reader.releaseLock(); }
});
test('malformed challenge cleanup runs while preserving the original validation error', async () => {
  const f=fixture(); f.first.headers=headers({[HEADERS.PAYMENT_REQUIRED]:'invalid!'});
  await assert.rejects(f.run(),e=>e.message!==FAILURE); assert.equal(f.cancels,1); assert.equal(f.preparations+f.submissions,0);
});
test('resource mismatch closes the discarded challenge before its original error', async () => {
  const f=fixture(); f.first.url='https://other.invalid/paid';
  await assert.rejects(f.run(),/payment resource does not match/); assert.equal(f.cancels,1); assert.equal(f.preparations,0);
});
test('unsupported payment flow still cancels the discarded challenge', async () => {
  const f=fixture(); const bad=structuredClone(f.required);bad.accepts[0].extra.paymentFlow='escrow';
  f.first.headers=headers({[HEADERS.PAYMENT_REQUIRED]:ENCODE(bad)});
  await assert.rejects(f.run()); assert.equal(f.cancels,1); assert.equal(f.preparations,0);
});
test('a cleanup rejection cannot replace an earlier malformed-challenge error', async () => {
  const f=fixture({cancel:()=>Promise.reject(Error('private-cleanup'))}); f.first.headers=headers({});
  await assert.rejects(f.run(),/402 response did not contain PAYMENT-REQUIRED/); assert.equal(f.cancels,1); assert.equal(f.preparations,0);
});
test('an unobservable initial body prevents payment without exposing its getter error', async () => {
  const f=fixture();Object.defineProperty(f.first,'body',{get(){throw Error('private-body-getter');}});
  await assert.rejects(f.run(),{message:FAILURE}); assert.equal(f.preparations+f.submissions,0);
});
test('legacy response-like fixtures without a body retain their payment behavior', async () => {
  const f=fixture({body:'missing'}), result=await f.run(); assert.equal(result.settlement.success,true);
  assert.equal(f.preparations,1);assert.equal(f.cancels,0);
});
test('an explicit null challenge body needs no cancellation', async () => {
  const f=fixture({body:'null'});await f.run();assert.equal(f.preparations,1);assert.equal(f.cancels,0);
});
test('non-402 passthrough keeps the caller-owned response body intact', async () => {
  const f=fixture();f.first.status=200;const result=await f.run();
  assert.equal(result.response,f.first);assert.equal(f.cancels+f.preparations+f.submissions,0);
});
test('an unpaid server error returns its body without taking cancellation ownership', async () => {
  const f=fixture();f.first.status=500;const result=await f.run();assert.equal(result.response.body,f.stream);assert.equal(f.cancels,0);
});
test('the final paid body stays with the caller', async () => {
  const f=fixture(),result=await f.run();assert.equal(result.response.body,f.paidBody);
  assert.equal(f.paidCancels,0);assert.equal(f.cancels,1);
});
test('pending reconciliation retains the same payment bytes and one preparation', async () => {
  const f=fixture();f.state='pending';const pending=await f.run();assert.equal(pending.settlement.retrySamePayment,true);
  f.state='success';const done=await reconcilePayment(pending,f.fetch);assert.equal(done.settlement.success,true);
  assert.equal(f.sent[0],f.sent[1]);assert.equal(f.preparations,1);assert.equal(f.cancels,1);assert.equal(f.paidCancels,0);
});
test('lost-response recovery keeps the same original payload without new challenge cleanup', async () => {
  const f=fixture();f.state='lost';let owner;try{await f.run();}catch(e){owner=e;}
  assert.ok(owner instanceof PaymentSubmissionOutcomeUnknownError);f.state='success';await reconcilePayment(owner,f.fetch);
  assert.equal(f.sent[0],f.sent[1]);assert.equal(f.preparations,1);assert.equal(f.cancels,1);
});
test('a paid redirect remains outcome-unknown and its body is not canceled as a challenge', async () => {
  const f=fixture();f.state='redirect';await assert.rejects(f.run(),PaymentSubmissionOutcomeUnknownError);
  assert.equal(f.cancels,1);assert.equal(f.paidCancels,0);assert.equal(f.preparations,1);
});
test('invalid payment output is rejected after initial-body cleanup and before send', async () => {
  const f=fixture();f.prepare=()=>({});await assert.rejects(f.run());assert.equal(f.cancels,1);assert.equal(f.submissions,0);
});
test('a failed initial fetch cannot start payment preparation', async () => {
  let preparations=0;await assert.rejects(paidFetch(TARGET,{createPaymentPayload(){preparations++;}},async()=>{throw Error('declared-first-fetch');}));
  assert.equal(preparations,0);
});
test('real Node Response cancellation uses its actual in-memory Web Stream', async () => {
  const f=fixture({realResponse:true});const result=await f.run();assert.equal(result.settlement.success,true);assert.equal(f.cancels,1);
});
test('real empty Node Response is accepted without an unused body', async () => {
  const f=fixture({realResponse:true,body:'null'});await f.run();assert.equal(f.cancels,0);assert.equal(f.preparations,1);
});
test('the helper calls one real stream cancellation without buffering bytes', async () => {
  let cancels=0;const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(128));},cancel(){cancels++;}});
  assert.equal(await CANCEL({body:stream}),true);assert.equal(cancels,1);assert.equal(stream.locked,false);
});
test('missing and null bodies settle successfully without stream work', async () => {
  assert.equal(await CANCEL({}),true);assert.equal(await CANCEL({body:null}),true);
});
test('native cancellation bypasses a caller replacement cancel getter', async () => {
  let getters=0,cancels=0;const stream=new ReadableStream({cancel(){cancels++;}});
  Object.defineProperty(stream,'cancel',{get(){getters++;throw Error('NO_GETTER');}});
  assert.equal(await CANCEL({body:stream}),true);assert.equal(getters,0);assert.equal(cancels,1);
});
test('proxy response and body are refused without invoking their traps', async () => {
  let traps=0;const proxy=new Proxy({},{get(){traps++;throw Error('NO_PROXY');}});
  assert.equal(await CANCEL(proxy),false);assert.equal(await CANCEL({body:proxy}),false);assert.equal(traps,0);
});
test('a foreign cancellation object cannot impersonate a native Web Stream', async () => {
  let calls=0;assert.equal(await CANCEL({body:{cancel(){calls++;return Promise.resolve();}}}),false);assert.equal(calls,0);
});
test('helper cancellation errors are boolean refusal without arbitrary reason data', async () => {
  assert.equal(await CANCEL({body:new ReadableStream({cancel(){throw Error('private');}})}),false);
});
test('invalid budgets and arities are refused before reading a response body', async () => {
  let reads=0;const r={get body(){reads++;return null;}};
  for(const budget of [0,-1,1001,Infinity,NaN,true,'1',1.5])assert.equal(await CANCEL(r,budget),false);
  assert.equal(await CANCEL(),false);assert.equal(await CANCEL(r,10,1),false);assert.equal(reads,0);
});
test('late cancellation fulfillment cannot change a timed-out helper outcome', async () => {
  const gate=deferred();let cancels=0;const stream=new ReadableStream({cancel(){cancels++;return gate.promise;}});
  const result=await CANCEL({body:stream},10);assert.equal(result,false);assert.equal(cancels,1);
  gate.resolve();await tick();assert.equal(result,false);
});
test('late cancellation rejection remains consumed after timeout', async () => {
  const gate=deferred();const stream=new ReadableStream({cancel(){return gate.promise;}});
  assert.equal(await CANCEL({body:stream},10),false);gate.reject(Error('private-late'));await tick();
});
test('an already closed stream can be canceled without invoking its source', async () => {
  let cancels=0;const stream=new ReadableStream({start(c){c.close();},cancel(){cancels++;}});
  assert.equal(await CANCEL({body:stream}),true);assert.equal(cancels,0);
});
