import { types as utilTypes } from 'node:util';
import { createOriginalPaymentCheckpointClient,
  createFundingPostOriginalPaymentCheckpointClient } from './x402-original-payment-checkpoint-client.js';
import { createOfficialSelectedPaymentClient } from './x402-official-selected-payment-client.js';
import { openServiceCreditCustodiedSqliteHttpClientV6,
  openServiceCreditCustodiedSqliteHttpClientV6WithNativeCloseGuard } from './service-credit-custodied-sqlite-http-client.js';
import { snapshotOriginalServiceRequestCustodyPolicy } from './service-credit-original-request-custody-contract.js';

const CORE = createOriginalPaymentCheckpointClient, OFFICIAL = createOfficialSelectedPaymentClient;
const FUNDING_POST_CORE = createFundingPostOriginalPaymentCheckpointClient;
const OPEN_V6 = openServiceCreditCustodiedSqliteHttpClientV6;
const OPEN_GUARDED_V6 = openServiceCreditCustodiedSqliteHttpClientV6WithNativeCloseGuard;
const POLICY = snapshotOriginalServiceRequestCustodyPolicy;
const FREEZE = Object.freeze, DESC = Object.getOwnPropertyDescriptor, PROTO = Object.getPrototypeOf;
const OWN = Object.hasOwn, KEYS = Reflect.ownKeys, APPLY = Reflect.apply;
const IS_PROXY = utilTypes.isProxy, IS_PROMISE = utilTypes.isPromise;
const NativePromise = Promise, PROMISE = NativePromise.prototype;
const THEN = DESC(PROMISE, 'then'), CTOR = DESC(PROMISE, 'constructor');
const SPECIES = DESC(NativePromise, Symbol.species);

/**
 * Default-off P1 client composition using the ACTUAL official client and ONE
 * ACTUAL existing V6 payer/HTTP owner. No injected SDK or store factory.
 *
 * The original canonical checkpoint and independent pins come from outside
 * the DB. One explicit restoreOriginalPayment call checks that same V6 record
 * before, during and after the official client's envelope creation. Its local
 * creator only returns the retained signed payload; there is no signer/PoW.
 * SDK DATA (including every transaction field) must match the original, even
 * when SDK JSON property order differs. ONLY the original PAYMENT-SIGNATURE
 * bytes are returned, never SDK-reencoded bytes. This is not permission to send.
 *
 * Existing service-only submit/read operations use that SAME V6 owner and its
 * selected grant. No new funding transition, fence, replayUnknown, grant or
 * activation is inferred from an x402 receipt. The host must separately own
 * the original funding submission/reconciliation and actual service authority.
 *
 * Opening may write owner_epoch. This is NOT SQLite readOnly mode, initialization,
 * migration or restart proof. Construction opens no network connection. The
 * supplied requestImpl is used only on explicit service submitOriginal.
 * Close revokes admission, drains an active operation, then closes the actual
 * V6 root once; UNKNOWN is preserved. It is not a cancellation/hard-time bound,
 * native physical-drain, ordinary package namespace or full P1 qualification.
 */
export async function openOfficialV6OriginalPaymentClient(configuration) {
  if (arguments.length !== 1) fail('configuration_rejected');
  return openOriginalPaymentClient(configuration, false);
}

/**
 * SOURCE-ONLY named POST /funding connection to the ACTUAL existing V6 owner
 * and official client. Same original signed checkpoint, independent pins and
 * one-context restoration; no GET /paid reinterpretation or funding resend.
 * Service-only submit still needs explicit original/proof and selected grant.
 * The returned requestProfile is DATA, not native binding or send authority.
 * This new SDK/SQLite graph has not been executed or runtime-qualified.
 */
export async function openOfficialV6FundingPostOriginalPaymentClient(configuration) {
  if (arguments.length !== 1) fail('configuration_rejected');
  return openOriginalPaymentClient(configuration, true);
}

/**
 * SOURCE-ONLY POST selection with the ACTUAL guarded V6 root. The private
 * nativeResourceCloseGuard belongs to the enclosing native client, not payment
 * DATA or a reusable permit. It runs again at actual store.close entry/return,
 * after async child joins. No change to legacy GET/plain POST close selection.
 */
export async function openOfficialV6GuardedFundingPostOriginalPaymentClient(configuration) {
  if (arguments.length !== 1) fail('configuration_rejected');
  return openOriginalPaymentClient(configuration, true, true);
}

async function openOriginalPaymentClient(configuration, fundingPost, nativeGuarded = false) {
  let payer = null, originals = null, official = null;
  let payerConfig, officialConfig, originalConfig, policy, selection;
  try {
    if (!invariant()) fail('configuration_rejected');
    const c = record(configuration, ['payerOptions', 'originalPayment', 'official']);
    const payerFields = ['databasePath', 'allowedRoot', 'fundingResourceUrl',
      'custodyPolicy', 'selectedGrantId', 'requestImpl', 'deadlineMs'];
    payerConfig = record(c.payerOptions, nativeGuarded ? [...payerFields, 'nativeResourceCloseGuard'] : payerFields);
    if (nativeGuarded && (typeof payerConfig.nativeResourceCloseGuard !== 'function'
        || IS_PROXY(payerConfig.nativeResourceCloseGuard)
        || PROTO(payerConfig.nativeResourceCloseGuard) !== Function.prototype
        || !Object.isFrozen(payerConfig.nativeResourceCloseGuard))) fail('configuration_rejected');
    originalConfig = record(c.originalPayment, ['resourceUrl', 'serializedCheckpoint', 'expectedPins']);
    officialConfig = record(c.official, ['validateChallenge', 'assetInfo', 'contextLimit']);
    // CORE construction captures only caller DATA and never calls this reader.
    originals = (fundingPost ? FUNDING_POST_CORE : CORE)({ ...originalConfig, readOriginalPaymentCheckpoint: FREEZE(pins => {
      if (payer === null) fail('payer_unavailable');
      return payer.readOriginalPaymentCheckpoint(pins);
    }) });
    selection = originals.selection();
    policy = POLICY(payerConfig.custodyPolicy, payerConfig.fundingResourceUrl);
    if (payerConfig.fundingResourceUrl !== selection.resourceUrl
        || policy.serviceResourceUrl !== new URL(selection.resourceUrl).origin + '/service-credit/v1/execute')
      fail('configuration_rejected');
    official = OFFICIAL({ requirement: selection.requirement, localClient: originals.localClient,
      ...officialConfig });
    // No arbitrary root/factory, missing-DB fallback or server-side payer.
    payer = (nativeGuarded ? OPEN_GUARDED_V6 : OPEN_V6)({ ...payerConfig, custodyPolicy: policy });
  } catch (caught) {
    if (originals !== null) originals.close();
    if (payer !== null) {
      try { await payer.close(); } catch { fail('construction_close_unknown'); }
    }
    // The actual root may hold an acquired or indeterminate native DB before
    // returning a facade. Do not collapse that refusal into clean config failure.
    if (nativeGuarded && heldRootRefusal(caught)) fail('construction_close_unknown');
    fail('configuration_rejected');
  } finally {
    configuration = null; payerConfig = null; originalConfig = null; officialConfig = null; policy = null;
  }
  const PAYER = payer, ORIGINAL = originals, SDK = official, RESOURCE = selection.resourceUrl;
  const REQUEST_PROFILE = fundingPost ? selection.requestProfile : null;
  const PROFILE = nativeGuarded ? 'OFFICIAL_X402_2_23_GUARDED_FUNDING_POST_RETAINED_ORIGINAL_V6_CLIENT'
    : fundingPost ? 'OFFICIAL_X402_2_23_FUNDING_POST_RETAINED_ORIGINAL_V6_CLIENT'
    : 'OFFICIAL_X402_2_23_RETAINED_ORIGINAL_V6_CLIENT';
  // The captured reader above intentionally keeps the actual payer reference.
  const SUBMIT = PAYER.submitOriginal, CLOSE = PAYER.close;
  let lifecycle = 'OPEN', pending = null, closing = null, restorations = 0;
  originals = null; official = null; selection = null;

  function launch(work, count, expected) {
    if (count !== expected || !invariant() || lifecycle !== 'OPEN' || pending !== null)
      return rejected('operation_unavailable');
    const c = capability();
    pending = c.promise; // Claim BEFORE any synchronous V6 or caller callback.
    APPLY(THEN.value, c.promise, [
      () => { if (pending === c.promise) pending = null; },
      () => { if (pending === c.promise) pending = null; },
    ]);
    try {
      const observed = work();
      if (!safe(observed)) fail('operation_unavailable');
      APPLY(THEN.value, observed, [c.resolve, () => c.reject(error('operation_unavailable'))]);
    } catch { c.reject(error('operation_unavailable')); }
    return c.promise;
  }
  const restoreOriginalPayment = FREEZE(function restoreOriginalPayment(input) {
    return launch(async () => {
      if (restorations !== 0) fail('original_already_consumed');
      const captured = ORIGINAL.captureChallenge(input);
      restorations = 1; // No new SDK context/attempt after refusal or close.
      const challenge = SDK.decodePaymentRequiredHeader(captured.paymentRequiredHeader);
      const payload = await SDK.createPaymentPayload(challenge);
      if (lifecycle !== 'OPEN' || !invariant()) fail('closed');
      const encoded = SDK.encodePaymentSignatureHeader(payload);
      const header = ORIGINAL.selectOriginalPaymentHeader(encoded, captured.expectedPins);
      return FREEZE({ resourceUrl: RESOURCE, paymentSignatureHeader: header,
        ...(fundingPost ? { requestProfile: REQUEST_PROFILE } : {}),
        source: 'EXACT_RETAINED_V6_ORIGINAL', authority: 'NONE', transport: 'NOT_INVOKED',
        signatureCreated: false, fundingAcknowledgement: 'NOT_ESTABLISHED',
        grantActivation: 'NOT_ESTABLISHED', serviceDelivery: 'NOT_ESTABLISHED' });
    }, arguments.length, 1);
  });
  const submitOriginal = FREEZE(function submitOriginal(input) {
    return launch(() => APPLY(SUBMIT, PAYER, [input]), arguments.length, 1);
  });
  function read(name, args, expected) {
    if (args.length !== expected || !invariant() || lifecycle !== 'OPEN' || pending !== null)
      fail('read_unavailable');
    return APPLY(PAYER[name], PAYER, args);
  }
  const close = FREEZE(function close() {
    if (arguments.length !== 0) return rejected('input_rejected');
    if (closing !== null) return closing;
    const c = capability();
    closing = c.promise; lifecycle = 'CLOSING';
    ORIGINAL.close();
    const finish = () => {
      try {
        if (!invariant()) fail('close_unknown');
        const result = APPLY(CLOSE, PAYER, []);
        if (!safe(result)) fail('close_unknown');
        APPLY(THEN.value, result, [
          () => {
            payer = null;
            if (ORIGINAL.snapshot().uncertain) {
              lifecycle = 'CLOSE_UNKNOWN'; c.reject(error('close_unknown'));
            } else { lifecycle = 'CLOSED'; c.resolve(undefined); }
          },
          () => { lifecycle = 'CLOSE_UNKNOWN'; c.reject(error('close_unknown')); },
        ]);
      } catch { lifecycle = 'CLOSE_UNKNOWN'; c.reject(error('close_unknown')); }
    };
    const active = pending;
    if (active === null) finish();
    else APPLY(THEN.value, active, [finish, finish]);
    return closing;
  });
  const snapshot = FREEZE(function snapshot() {
    if (arguments.length !== 0 || !invariant()) fail('input_rejected');
    return FREEZE({ profile: PROFILE,
      lifecycle, operationActive: pending !== null, restorations,
      original: ORIGINAL.snapshot(), official: SDK.getSnapshot(), payer: PAYER.snapshot(),
      defaultEnabled: false, authority: 'NONE', originalFundingSubmission: 'EXTERNAL_EXPLICIT_OPERATION',
      serviceDelivery: 'NOT_ESTABLISHED', fullP1: 'NOT_ESTABLISHED' });
  });
  return FREEZE({
    restoreOriginalPayment, submitOriginal,
    readOriginal: FREEZE(function readOriginal(...args) { return read('readOriginal', args, 1); }),
    readOriginalRecoveryState: FREEZE(function readOriginalRecoveryState(...args) {
      return read('readOriginalRecoveryState', args, 1);
    }),
    readOriginalRecoveryKeys: FREEZE(function readOriginalRecoveryKeys(...args) {
      return read('readOriginalRecoveryKeys', args, 0);
    }),
    readOriginalPaymentCheckpoint: FREEZE(function readOriginalPaymentCheckpoint(...args) {
      return read('readOriginalPaymentCheckpoint', args, 1);
    }),
    snapshot, close,
  });
}
function record(value, fields) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || PROTO(value) !== Object.prototype || KEYS(value).length !== fields.length) fail('input_rejected');
  const out = {};
  for (const field of fields) {
    const d = DESC(value, field);
    if (!d || !OWN(d, 'value') || !d.enumerable) fail('input_rejected');
    Object.defineProperty(out, field, { value: d.value, enumerable: true });
  }
  return out;
}
function heldRootRefusal(value) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || PROTO(value) !== TypeError.prototype) return false;
  const d = DESC(value, 'code');
  return d !== undefined && OWN(d, 'value')
    && (d.value === 'SERVICE_CREDIT_CUSTODIED_SQLITE_HTTP_CLIENT_ACQUISITION_HELD'
      || d.value === 'SERVICE_CREDIT_CUSTODIED_SQLITE_HTTP_CLIENT_RESOURCE_HELD');
}
function same(actual, expected) {
  if (!actual || !expected || KEYS(actual).length !== KEYS(expected).length) return false;
  return KEYS(expected).every(k => OWN(actual, k) && actual[k] === expected[k]);
}
function invariant() {
  return DESC(Object.prototype, 'then') === undefined && DESC(Object.prototype, 'toJSON') === undefined
    && same(DESC(PROMISE, 'then'), THEN) && same(DESC(PROMISE, 'constructor'), CTOR)
    && same(DESC(NativePromise, Symbol.species), SPECIES);
}
function safe(value) {
  if (!invariant() || !IS_PROMISE(value) || IS_PROXY(value) || PROTO(value) !== PROMISE) return false;
  const ctor = DESC(value, 'constructor');
  return ctor === undefined || OWN(ctor, 'value') && ctor.value === NativePromise
    && ctor.enumerable === false && ctor.writable === false && ctor.configurable === false;
}
function capability() {
  let resolve, reject;
  const promise = new NativePromise((yes, no) => { resolve = yes; reject = no; });
  Object.defineProperty(promise, 'constructor', { value: NativePromise });
  return { promise, resolve, reject };
}
function rejected(kind) { const c = capability(); c.reject(error(kind)); return c.promise; }
function error(kind) {
  const code = 'x402_official_v6_original_payment_client_' + kind, e = new TypeError(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code });
  return FREEZE(e);
}
function fail(kind) { throw error(kind); }

