import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { capturePurchasedOrderPayment } from './service-purchase-order-funding.js';
import {
  capturePurchasedOrderFundingApplicationSelection, createPurchasedOrderFundingApplicationCore,
} from './service-purchase-order-funding-application-core.js';
import {
  captureOfficialFundingPostHttpsRoute, captureOfficialFundingPostHttpsRequest,
} from './x402-official-funding-post-https-request-binding.js';
import { writeIssuedApplicationResponse } from './x402-issued-application-response-writer.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, NP = Promise, PP = NP.prototype, THEN = PP.then;
const BASE = [D(PP, 'then'), D(PP, 'constructor'), D(NP, Symbol.species)], selected = new WeakMap();
const PURCHASE = ['termsJson', 'termsDigest', 'paymentCheckpointJson', 'paymentPinsJson', 'fundingContextJson'];
const BAD = frame(400, 'Bad Request'), CONFLICT = frame(409, 'Original Payment Required');
const UNAVAILABLE = frame(503, 'Service Unavailable'), BOUND = frame(202, 'BOUND');
function error(suffix) {
  const code = 'ORDER_FUNDING_HTTP_APPLICATION_' + suffix, e = new TypeError(code);
  Object.defineProperties(e, { code: { value: code, enumerable: true }, stack: { value: 'TypeError: ' + code } }); return F(e);
}
function fail(suffix = 'INPUT_REJECTED') { throw error(suffix); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail();
  const result = {};
  for (const name of names) { const d = D(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); result[name] = d.value; }
  return result;
}
function callable(value) { return typeof value === 'function' && !types.isProxy(value); }
function method(value, name) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const d = D(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value') || !callable(d.value)) fail();
  return (...args) => Reflect.apply(d.value, value, args);
}
function invariant() {
  return [D(PP, 'then'), D(PP, 'constructor'), D(NP, Symbol.species)].every((v, i) => {
    const b = BASE[i]; return v && Reflect.ownKeys(v).length === Reflect.ownKeys(b).length
      && Reflect.ownKeys(b).every(k => Object.hasOwn(v, k) && v[k] === b[k]);
  });
}
function pending() {
  let resolve, reject; const promise = new NP((a, b) => { resolve = a; reject = b; });
  Object.defineProperty(promise, 'constructor', { value: NP }); Reflect.apply(THEN, promise, [undefined, () => {}]);
  return { promise, resolve, reject };
}
function observe(promise, yes, no) {
  try {
    if (!invariant() || !types.isPromise(promise) || types.isProxy(promise) || Object.getPrototypeOf(promise) !== PP || D(promise, 'then')) fail('PROMISE_UNKNOWN');
    const d = D(promise, 'constructor');
    if (!d) Object.defineProperty(promise, 'constructor', { value: NP }); else if (!Object.hasOwn(d, 'value') || d.value !== NP) fail('PROMISE_UNKNOWN');
    Reflect.apply(THEN, promise, [value => invariant() ? yes(value) : no(error('PROMISE_UNKNOWN')), no]);
  } catch { no(error('PROMISE_UNKNOWN')); }
}
function frame(statusCode, body) { return F({ statusCode, contentType: 'text/plain; charset=utf-8', body, headers: F({}) }); }
function candidate(raw) {
  if (typeof raw !== 'string' || !raw.length || Buffer.byteLength(raw) > 16384 || Buffer.from(raw).toString() !== raw) fail();
  let value; try { value = JSON.parse(raw); } catch { fail(); }
  const c = fields(value, ['evidenceVersion', 'artifact']);
  if (c.evidenceVersion !== 1 || c.artifact === null || typeof c.artifact !== 'object' || Array.isArray(c.artifact)) fail();
  const pending = [[c.artifact, 0]]; let nodes = 0;
  while (pending.length) {
    const [value, depth] = pending.pop(); if (++nodes > 8192 || depth > 20) fail();
    if (value !== null && typeof value === 'object') {
      if (Array.isArray(value) && value.length > 4096) fail();
      for (const item of Object.values(value)) pending.push([item, depth + 1]);
    }
  }
  if (JSON.stringify(c) !== raw) fail(); return raw;
}

/** One existing original payment and one locally selected evidence candidate.
 * No new challenge is issued. Captured DATA does not authenticate a native peer,
 * verifier, TLS event or server factory. Independent original pins remain required.
 */
export function capturePurchasedOrderFundingHttpSelection(input) {
  if (arguments.length !== 1) fail(); if (selected.has(input)) return input;
  const c = fields(input, ['selection', 'fundingCandidateJson']);
  c.selection = capturePurchasedOrderFundingApplicationSelection(c.selection); candidate(c.fundingCandidateJson);
  const p = capturePurchasedOrderPayment(...PURCHASE.map(k => c.selection.purchase[k]));
  const route = captureOfficialFundingPostHttpsRoute(p.verifierContext.resourceUrl);
  const result = F(c); selected.set(result, F({ route, paymentSignature: p.checkpoint.originalBytes.paymentPayload })); return result;
}

/** Actual application/owner/receipt/deadline cores, with declared DATA ports. */
export function createPurchasedOrderFundingHttpApplicationCore(options) {
  if (arguments.length !== 1) fail();
  const c = fields(options, ['purchaseHttp', 'backend', 'verifyFundingEvidence', 'clock', 'deadlines']);
  const purchaseHttp = capturePurchasedOrderFundingHttpSelection(c.purchaseHttp);
  const application = createPurchasedOrderFundingApplicationCore({ selection: purchaseHttp.selection, backend: c.backend,
    verifyFundingEvidence: c.verifyFundingEvidence, clock: c.clock, deadlines: c.deadlines });
  return bindPurchasedOrderFundingHttpApplication(purchaseHttp, application);
}

/** Trusted application capability seam. The native entry fixes its real factory.
 * Supplying a facade here is DATA composition and never qualifies native I/O.
 * Existing POST-v1 clients see exactly 202 BOUND without x402 protocol headers.
 * Only selected verified funding produces BOUND; this is not service delivery.
 */
export function bindPurchasedOrderFundingHttpApplication(purchaseHttp, application) {
  if (arguments.length !== 2 || !invariant()) fail();
  const chosen = capturePurchasedOrderFundingHttpSelection(purchaseHttp), context = selected.get(chosen);
  const startApplication = method(application, 'start'), verify = method(application, 'verifyFunding'), read = method(application, 'readFunding');
  const closeApplication = method(application, 'close'), inspect = method(application, 'snapshot'), exportRecovery = method(application, 'exportRecoveryRecord');
  if (inspect().phase !== 'CREATED' || inspect().startRequested !== false) fail('APPLICATION_NOT_FRESH');
  const seen = new WeakSet(), operations = new Set();
  let startRequested = false, startupComplete = false, closed = false, held = false, closing = null, closeOutcome = 'NOT_REQUESTED';
  let active = false, requests = 0, exactRequests = 0, verificationStarts = 0, cachedReplies = 0, boundWrites = 0, failedWrites = 0;
  function live() { if (closed || held || !invariant()) fail('UNAVAILABLE'); }
  function complete(done, clean) {
    try { if (Reflect.apply(clean ? done.success : done.failure, undefined, []) !== undefined) held = true; }
    catch { held = true; }
  }
  function completion(input) {
    const c = fields(input, ['success', 'failure']);
    if (!Object.isFrozen(input) || !callable(c.success) || !callable(c.failure) || !Object.isFrozen(c.success) || !Object.isFrozen(c.failure) || seen.has(input)) fail('COMPLETION_REJECTED');
    seen.add(input); return c;
  }
  function write(response, value, done) {
    const ok = writeIssuedApplicationResponse(response, value, '/funding');
    if (ok && value === BOUND) boundWrites++; if (!ok) failedWrites++;
    complete(done, ok); return ok;
  }
  const start = F(function start() {
    if (arguments.length !== 0) fail(); live(); if (startRequested) fail('ALREADY_STARTED'); startRequested = true;
    try { const value = startApplication(); live(); startupComplete = true; return value; }
    catch { held = true; throw error('STARTUP_UNKNOWN'); }
  });
  const handle = F(function handle(request, response, transportContext, completionValue) {
    let done; try { done = completion(completionValue); } catch { held = true; return undefined; }
    requests++;
    if (arguments.length !== 4 || !startupComplete || closed || held || !invariant()) { write(response, UNAVAILABLE, done); return undefined; }
    let captured;
    try { captured = captureOfficialFundingPostHttpsRequest(request, context.route); }
    catch { write(response, BAD, done); return undefined; }
    if (captured.paymentSignature === null) { write(response, BAD, done); return undefined; }
    if (captured.paymentSignature !== context.paymentSignature) { write(response, CONFLICT, done); return undefined; }
    exactRequests++;
    if (active) { write(response, UNAVAILABLE, done); return undefined; }
    let view;
    try { view = read(); } catch { write(response, UNAVAILABLE, done); return undefined; }
    if (closed || held) { write(response, UNAVAILABLE, done); return undefined; }
    if (view.phase === 'VERIFIED') { cachedReplies++; write(response, BOUND, done); return undefined; }
    // This explicit HTTP replay observes the SAME locally selected proof. It
    // never calls any wallet, signer, funding sender, grant or service port.
    active = true; verificationStarts++;
    const cell = { response, done, finished: false }; operations.add(cell);
    function finish(value) {
      if (cell.finished) { held = true; return; } cell.finished = true;
      active = false; operations.delete(cell);
      if (cell.done !== null) write(cell.response, !closed && !held && value?.phase === 'VERIFIED' ? BOUND : UNAVAILABLE, cell.done);
      cell.response = null; cell.done = null;
    }
    try { observe(verify(chosen.fundingCandidateJson), finish, () => finish(null)); } catch { held = true; finish(null); }
    request = null; response = null; transportContext = null; done = null; return undefined;
  });
  const close = F(function close() {
    if (arguments.length !== 0) fail(); if (closing !== null) return closing.promise;
    closing = pending(); closed = true; closeOutcome = 'PENDING';
    // Detach response/completion capabilities before the actual owner drains.
    // A late verifier result cannot write to a closed or reassigned response.
    for (const cell of operations) {
      if (cell.done !== null) complete(cell.done, false); cell.done = null; cell.response = null;
    }
    try { observe(closeApplication(), value => {
      if (value !== undefined || held) { held = true; closeOutcome = 'REJECTED'; closing.reject(error('CLOSE_UNKNOWN')); }
      else { closeOutcome = 'FULFILLED_UNDEFINED'; closing.resolve(undefined); }
    }, () => { held = true; closeOutcome = 'REJECTED'; closing.reject(error('CLOSE_UNKNOWN')); }); }
    catch { held = true; closeOutcome = 'REJECTED'; closing.reject(error('CLOSE_UNKNOWN')); }
    return closing.promise;
  });
  const closeWithCompletion = F(function closeWithCompletion(input) {
    let done; try { if (arguments.length !== 1) fail(); done = completion(input); } catch { held = true; return undefined; }
    try { observe(close(), value => complete(done, value === undefined), () => complete(done, false)); } catch { complete(done, false); }
    return undefined;
  });
  const exportRecoveryRecord = F(function exportRecoveryRecord() { if (arguments.length !== 0) fail(); return exportRecovery(); });
  const snapshot = F(function snapshot() {
    if (arguments.length !== 0) fail(); const inner = inspect();
    return F({ profile: 'PURCHASE_ORDER_FUNDING_ORIGINAL_HTTP_V1', phase: held || inner.phase === 'HELD' ? 'HELD'
      : closed ? closeOutcome === 'FULFILLED_UNDEFINED' ? 'CLOSED' : 'CLOSING' : startupComplete ? 'OPEN' : 'CREATED',
      startRequested, startupComplete, requests, exactRequests, verificationStarts, verificationActive: active,
      cachedReplies, boundResponseWrites: boundWrites, failedResponseWrites: failedWrites, closeOutcome, application: inner,
      responseWriteMeansDelivery: false, fixedOriginalPayment: true, automaticRetry: false, challengeIssuance: false,
      fundingSend: false, grantActivation: 'NOT_ESTABLISHED', serviceDelivery: 'NOT_ESTABLISHED', authority: 'NONE' });
  });
  return F({ start, handle, close, exportRecoveryRecord, snapshot, downstream: F({ handle, close: closeWithCompletion }) });
}
