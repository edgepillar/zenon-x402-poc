import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import { createVerificationBoundSelectedSettlementContext } from './x402-verification-bound-settlement-context.js';
import { normalizeSelectedSettlementCallbackResult } from './x402-selected-settlement-context.js';
import {
  validateActiveUpfrontRequirement, validatePaymentRequired, validatePaymentPayloadEnvelope,
  sameRequirements, sameResource, decodeB64Json, MAX_X402_HEADER_ENCODED_BYTES,
} from './x402-wire.js';

const OWNER = createVerificationBoundSelectedSettlementContext;
const NORMALIZE = normalizeSelectedSettlementCallbackResult;
const REQUIREMENT = validateActiveUpfrontRequirement, CHALLENGE = validatePaymentRequired;
const PAYLOAD = validatePaymentPayloadEnvelope, SAME_REQUIREMENT = sameRequirements, SAME_RESOURCE = sameResource;
const freeze = Object.freeze, create = Object.create, define = Object.defineProperty;
const descriptor = Object.getOwnPropertyDescriptor, prototype = Object.getPrototypeOf;
const ownKeys = Reflect.ownKeys, apply = Reflect.apply, hasOwn = Object.hasOwn;
const isProxy = utilTypes.isProxy, isPromise = utilTypes.isPromise;
const isArray = Array.isArray, safe = Number.isSafeInteger, same = Object.is;
const parse = JSON.parse, stringify = JSON.stringify, byteLength = Buffer.byteLength;
const test = Function.call.bind(RegExp.prototype.test);
const objectPrototype = Object.prototype, arrayPrototype = Array.prototype, functionPrototype = Function.prototype;
const NativePromise = Promise, promisePrototype = NativePromise.prototype, nativeThen = promisePrototype.then;
const constructorDescriptor = descriptor(promisePrototype, 'constructor');
const species = Symbol.species, speciesDescriptor = descriptor(NativePromise, species);
const initialThen = descriptor(objectPrototype, 'then');
const initialObjectJson = descriptor(objectPrototype, 'toJSON'), initialArrayJson = descriptor(arrayPrototype, 'toJSON');
const NativeMap = Map, mapGet = Map.prototype.get, mapHas = Map.prototype.has, mapSet = Map.prototype.set;
const push = arrayPrototype.push;
const ErrorType = TypeError;
const DECODE_HEADER = decodeB64Json, HEADER_LIMIT = MAX_X402_HEADER_ENCODED_BYTES;
const CONFIG = freeze([
  'requirement', 'localFacilitator', 'validateChallenge', 'reconcilePendingSettlement',
  'maxPendingReconciliations', 'contextLimit',
]);
const ENRICH = freeze(['paymentRequiredResponse', 'requirements']);
const HASH = /^[0-9a-f]{64}$/, REASON = /^[a-z][a-z0-9_]{0,127}$/;

/**
 * Default-off SDK-FREE selected-context server bridge. Reuse existing strict
 * local wire validators, result normalizer and ONE verification-bound owner
 * per selected server view. Public surfaces match the existing bridge roles:
 * schemeServer, facilitatorClient, getSnapshot. No SDK package is imported.
 * This is actual shared bridge logic, NOT official SDK/HTTP conformance proof.
 *
 * Options are exactly CONFIG. validateChallenge is a trusted synchronous
 * validation capability: one detached frozen DATA argument; return undefined
 * or throw. An admitted SDK schema needs an explicit void-returning wrapper.
 * Its reply never replaces the retained server challenge. Verify/settle are
 * captured once from localFacilitator data methods (up to eight prototypes,
 * excluding ambient Object/Function prototypes). Observer must be a distinct
 * reviewed function, never a default to settle. These are OPERATIONAL trusted
 * capabilities, NOT a sandbox, proof of read-only behavior or permission to
 * use a real verifier, submitter, observer, signer or network owner.
 *
 * Capture atomically checks selected SDK-object identity, exact array order,
 * unique views, strict upfront Zenon requirement and the retained challenge.
 * Capture/enrich is a trusted SERVER-OWNER capability; this code does not
 * authenticate who supplied it. Equal/frozen DATA is not server-origin proof.
 * Every verify/settle snapshots bounded descriptor-DATA before any callback.
 * Verification constructs its owner and claims the declared hash BEFORE its
 * callback, retaining original payload/requirement/challenge serializations.
 * A hash cannot be rebound to a second selected context in this instance,
 * including after refused/unknown verification. Never reset a claim.
 *
 * Only a declared successful verification permits settle. PENDING retries go
 * through that SAME owner's explicit bounded observer, never a second first
 * settlement, replacement payload, refreshed quote or reconstructed authority.
 * Return only detached frozen SDK-shaped DATA, never raw callback objects.
 * At most one positive settlement response per claimed hash in THIS instance.
 * Handler execution, global replay, raw signed-byte custody, durable commit
 * and real process restart remain independent owners/gates.
 *
 * contextLimit is an explicit integer1..64. It separately bounds admitted
 * capture attempts (including failures) and retained selected contexts. A
 * challenge has at most16 views, committed all-or-none. Verification/first
 * callback counts are bounded by retained contexts; observers additionally
 * retain the existing0..16 per-owner budget. These are local admission/data
 * bounds, not hard CPU/memory/lifetime, cancellation or OS/network guarantees.
 * There is no close/reset/reclaim/TTL/fallback. New instances do not grant
 * replacement, re-signing, retry or current payer/provider/policy authority.
 *
 * Rejections expose no raw reasons. Native Promises are observed with captured
 * native then; fulfillment is normalized BEFORE await can assimilate it.
 * Unsafe returned rejections require owner prehandling. Direct public-receipt
 * dependencies are refused; indirect cycles may still deadlock. Captured
 * native intrinsics, loader/Promise/OS and unchanged dependency behavior remain
 * premises, not native-owner qualification. Exact SDK object continuity and
 * actual SDK composition MUST be source-pinned and separately qualified.
 *
 * No active buyer/server, legacy interop draft, SDK, storage, native HTTP/RPC
 * host, keys, nonce search, signing, publication or real PREPARE is changed.
 * All verifier/chain/publication values are DECLARED callback DATA, not
 * authenticated funding, real provider READY, inclusion or live-pilot proof.
 * Preserve original payment/request bytes/hash/payload/requirements/context and
 * consumed authority. VALIDATED possible exact-same-signed-block resend stays
 * separate from UNKNOWN/ACKNOWLEDGED; this module adds no replacement right.
 */
export function createSelectedSettlementServerBridge(configuration) {
  return constructBridge(configuration, arguments.length, false);
}

/**
 * Explicit opt-in compatibility profile for the separately pinned official
 * @x402/core 2.23.0 upfront composition. No SDK package is imported here and
 * this name is not runtime/package authentication or general SDK qualification.
 *
 * That SDK reassigns the enhanced requirement's extra field and skips a
 * separate facilitator verify for upfront. Return an OWNED mutable enhancement
 * copy, and reuse the SAME existing verification owner before first settle.
 * Preserve the original frozen-DATA entry's behavior. Only an own undefined
 * optional challenge error is omitted, matching the SDK's JSON wire encoding;
 * no source object, payment bytes, selected identity or authority is rewritten.
 * Pending reentry still uses only the original owner's bounded observer.
 * This adds no automatic HTTP retry, durability, restart or signing capability.
 */
export function createSelectedSettlementServerBridgeForOfficialX402Core223(configuration) {
  return constructBridge(configuration, arguments.length, true);
}

function constructBridge(configuration, argumentCount, officialCore223) {
  let fixed, receiver, verify, first, observe, schema, budget, limit;
  try {
    if (argumentCount !== 1 || !invariant()) fail('configuration_rejected');
    const c = record(configuration, CONFIG);
    fixed = parse(serialize(c.requirement)); REQUIREMENT(fixed); fixed = deepFreeze(fixed);
    receiver = c.localFacilitator;
    verify = captureMethod(receiver, 'verify'); first = captureMethod(receiver, 'settle');
    observe = c.reconcilePendingSettlement === null ? null : callable(c.reconcilePendingSettlement);
    schema = callable(c.validateChallenge); budget = c.maxPendingReconciliations; limit = c.contextLimit;
    if (!safe(budget) || budget < 0 || budget > 16 || same(budget, -0)
        || !safe(limit) || limit < 1 || limit > 64 || same(limit, -0)
        || verify === first || observe === verify || observe === first
        || schema === verify || schema === first || schema === observe) fail('configuration_rejected');
  } catch { fail('configuration_rejected'); }
  const RECEIVER = receiver, VERIFY = verify, FIRST = first, OBSERVE = observe, SCHEMA = schema;
  const entries = [], selectedEntries = new NativeMap(), hashClaims = new NativeMap();
  let captureBusy = false, captureAttempts = 0, schemaCalls = 0;
  let verifyCalls = 0, firstCalls = 0, observerCalls = 0, positiveResponses = 0;
  configuration = null; receiver = null; verify = null; first = null; observe = null; schema = null;

  function selected(value) {
    if (typeof value !== 'object' || value === null || isProxy(value)
        || prototype(value) !== objectPrototype) fail('input_rejected');
    const entry = apply(mapGet, selectedEntries, [value]);
    if (entry === undefined) fail('context_missing');
    return entry;
  }
  function requireFixed(value) {
    REQUIREMENT(value);
    if (!SAME_REQUIREMENT(value, fixed)) fail('input_rejected');
  }
  function challengeText(value) {
    if (!officialCore223) return serialize(value);
    if (typeof value !== 'object' || value === null || isProxy(value)
        || prototype(value) !== objectPrototype || ownKeys(value).length > 32) fail('input_rejected');
    const copy = create(objectPrototype);
    for (const key of ownKeys(value)) {
      if (typeof key !== 'string') fail('input_rejected');
      const d = descriptor(value, key);
      if (d === undefined || d.enumerable !== true || !hasOwn(d, 'value')) fail('input_rejected');
      if (key === 'error' && d.value === undefined) continue;
      put(copy, key, d.value);
    }
    return serialize(copy);
  }
  function bindingFor(payload, view, entry) {
    const payloadJson = serialize(payload), requirementsJson = serialize(view);
    const p = parse(payloadJson), r = parse(requirementsJson), challenge = parse(entry.challengeJson);
    requireFixed(r); PAYLOAD(p);
    if (!SAME_REQUIREMENT(r, challenge.accepts[entry.index])
        || !SAME_REQUIREMENT(p.accepted, r) || !SAME_RESOURCE(p.resource, challenge.resource))
      fail('input_rejected');
    const hash = descriptor(p.payload.transaction, 'hash');
    if (hash === undefined || !hasOwn(hash, 'value') || typeof hash.value !== 'string'
        || !test(HASH, hash.value)) fail('input_rejected');
    return freeze({ payloadJson, requirementsJson, challengeJson: entry.challengeJson,
      paymentHash: hash.value, network: r.network });
  }

  function capture(count, argument) {
    if (captureBusy) fail('busy');
    if (count !== 1) fail('input_rejected');
    if (captureAttempts >= limit) fail('budget_exhausted');
    captureAttempts++; captureBusy = true;
    try {
      if (!invariant()) fail('operation_rejected');
      const top = record(argument, ENRICH, true);
      const source = top.paymentRequiredResponse;
      const challengeJson = challengeText(source), challenge = parse(challengeJson);
      CHALLENGE(challenge);
      const views = arrayValues(top.requirements, 16);
      const originalViews = arrayValues(ownData(source, 'accepts'), 16);
      if (views.length === 0 || views.length !== originalViews.length
          || entries.length + views.length > limit) fail('input_rejected');
      for (let i = 0; i < views.length; i++) {
        if (views[i] !== originalViews[i] || apply(mapHas, selectedEntries, [views[i]])) fail('context_used');
        for (let j = 0; j < i; j++) if (views[i] === views[j]) fail('context_used');
        const viewData = parse(serialize(views[i]));
        requireFixed(viewData);
        if (!SAME_REQUIREMENT(challenge.accepts[i], viewData)) fail('input_rejected');
      }
      schemaCalls++;
      const result = apply(SCHEMA, undefined, [deepFreeze(parse(challengeJson))]);
      if (!invariant() || result !== undefined || challengeText(source) !== challengeJson) fail('operation_rejected');
      const after = arrayValues(top.requirements, 16), afterOriginal = arrayValues(ownData(source, 'accepts'), 16);
      if (after.length !== views.length || afterOriginal.length !== views.length) fail('operation_rejected');
      for (let i = 0; i < views.length; i++)
        if (after[i] !== views[i] || afterOriginal[i] !== views[i]) fail('operation_rejected');
      // No callback or await between this all-or-none commit and its preflight.
      for (let i = 0; i < views.length; i++) {
        const e = create(null);
        e.index = i; e.challengeJson = challengeJson; e.phase = 'CAPTURED';
        e.owner = null; e.verificationResponse = null; e.verifyTicket = null; e.settleTicket = null;
        apply(push, entries, [e]); apply(mapSet, selectedEntries, [views[i], e]);
      }
    } catch { fail('capture_rejected'); }
    finally { captureBusy = false; }
  }

  function invoke(callback, receiverValue, binding, entry, role) {
    if (!invariant()) fail('operation_rejected');
    if (role === 'verify') verifyCalls++; else if (role === 'first') firstCalls++; else observerCalls++;
    const value = apply(callback, receiverValue, [
      parse(binding.payloadJson), parse(binding.requirementsJson), parse(binding.challengeJson),
    ]);
    if (!invariant() || value === entry.verifyTicket?.promise || value === entry.settleTicket?.promise)
      fail('operation_rejected');
    const fulfilled = raw => {
      if (!invariant()) fail('operation_rejected');
      if (role !== 'verify') return NORMALIZE(raw, binding);
      const response = normalizeVerification(raw);
      entry.verificationResponse = response;
      return freeze({ isValid: response.isValid });
    };
    if (typeof value === 'object' && value !== null && !isProxy(value) && isPromise(value)) {
      if (!supportedPromise(value)) fail('operation_rejected');
      // Private undecorated bridge: the existing owner observes it natively.
      return apply(nativeThen, value, [fulfilled, () => { fail('operation_rejected'); }]);
    }
    return fulfilled(value);
  }

  async function verifyRun(count, payload, view, ticket, ownedSettleTicket = null) {
    let entry = null;
    try {
      if (captureBusy) fail('busy');
      if (count !== 2 || !invariant()) fail('input_rejected');
      entry = selected(view);
      if (entry.verifyTicket !== null
          || (entry.settleTicket !== null && entry.settleTicket !== ownedSettleTicket)) fail('busy');
      if (entry.phase !== 'CAPTURED') fail('stage_rejected');
      const original = bindingFor(payload, view, entry);
      if (apply(mapHas, hashClaims, [original.paymentHash])) fail('context_used');
      const owner = OWNER({
        original, verifyOriginal: b => invoke(VERIFY, RECEIVER, b, entry, 'verify'),
        settleFirst: b => invoke(FIRST, RECEIVER, b, entry, 'first'),
        reconcilePending: OBSERVE === null ? null : b => invoke(OBSERVE, undefined, b, entry, 'observer'),
        maxPendingReconciliations: budget,
      });
      apply(mapSet, hashClaims, [original.paymentHash, entry]);
      entry.owner = owner; entry.phase = 'VERIFYING'; entry.verifyTicket = ticket;
      if (officialCore223) {
        entry.originalBinding = original; entry.originalPayloadReference = payload;
      }
      await undefined;
      if (!invariant()) fail('operation_rejected');
      const valid = await shield(owner.verifyOriginal(original));
      if (!invariant() || entry.verificationResponse === null) fail('operation_rejected');
      entry.phase = valid ? 'VERIFIED' : 'REFUSED';
      return entry.verificationResponse;
    } catch {
      if (entry !== null && entry.verifyTicket === ticket) entry.phase = 'UNKNOWN';
      fail('verify_rejected');
    } finally {
      if (entry !== null && entry.verifyTicket === ticket) entry.verifyTicket = null;
    }
  }

  async function settleRun(count, payload, view, ticket) {
    let entry = null;
    try {
      if (captureBusy) fail('busy');
      if (count !== 2 || !invariant()) fail('input_rejected');
      entry = selected(view);
      if (entry.verifyTicket !== null || entry.settleTicket !== null) fail('busy');
      if (officialCore223 && entry.phase === 'CAPTURED') {
        // Claim the outer receipt before the verifier can reenter/return it.
        // Only this private call may verify under its OWN settle ticket.
        entry.settleTicket = ticket;
        const verificationTicket = create(null); verificationTicket.promise = null;
        const checking = shield(verifyRun(2, payload, view, verificationTicket, ticket));
        verificationTicket.promise = checking;
        await checking;
        if (!invariant() || entry.verifyTicket !== null || entry.settleTicket !== ticket) fail('busy');
      }
      if (entry.phase !== 'VERIFIED' || entry.owner === null) fail('stage_rejected');
      const binding = bindingFor(payload, view, entry);
      entry.settleTicket = ticket;
      await undefined;
      if (!invariant()) fail('operation_rejected');
      const responseJson = await shield(entry.owner.attempt(binding));
      if (!invariant() || typeof responseJson !== 'string') fail('operation_rejected');
      const response = parse(responseJson);
      if (response.success === true) positiveResponses++;
      return freeze(response);
    } catch { fail('settle_rejected'); }
    finally {
      if (entry !== null && entry.settleTicket === ticket) entry.settleTicket = null;
    }
  }


  /**
   * An opt-in server-owner continuation for an ALREADY pending upfront entry.
   * The caller supplies its captured SDK transport tuple and the captured
   * processSettlement capability; neither possession nor equality authenticates
   * a server, payer, provider, current request or permission to deliver.
   *
   * This adds no settlement owner, verification, first attempt, budget, HTTP
   * request, automatic retry loop or restart. Each explicit resume delegates
   * once to the same SDK operation in its before-handler phase, and requires
   * exactly one reconciliation by the existing owner before accepting a reply.
   * No after-handler no-op success or second positive reply is accepted.
   * The bounded wire receipt must agree with the normalized result and original
   * payment. A mismatch retains consumed authority and closes this continuation.
   *
   * Only the pinned request DATA shape (primitive fields plus an opaque adapter)
   * is admitted. Adapter internals and native/global behavior remain trusted
   * premises, not authenticated context. Do not use this to reconstruct context
   * after a process restart. Authorization and actual delivery have other owners.
   */
  function createPendingContinuation(configuration) {
    if (arguments.length !== 1 || !invariant()) fail('input_rejected');
    let c = record(configuration, freeze([
      'paymentPayload', 'requirements', 'transportContext', 'processSettlement',
    ]));
    const entry = selected(c.requirements), original = entry.originalBinding;
    if (!officialCore223 || original === undefined || c.paymentPayload !== entry.originalPayloadReference
        || entry.owner === null
        || entry.phase !== 'VERIFIED' || entry.verifyTicket !== null
        || entry.settleTicket !== null || entry.continuationClaimed === true) fail('stage_rejected');
    const initial = entry.owner.getSnapshot().settlement;
    if (initial.state !== 'PENDING' || initial.inFlight
        || !initial.firstAuthorityConsumed || initial.firstAttempts !== 1
        || !initial.observerConfigured
        || initial.pendingReconciliations >= initial.maxPendingReconciliations) fail('stage_rejected');
    let payload = c.paymentPayload, view = c.requirements, context = c.transportContext;
    let processSettlement = callable(c.processSettlement);
    let sealedContext = sealUpfrontTransport(context);
    let expectedReconciliations = initial.pendingReconciliations;
    let phase = 'PENDING', active = false, calls = 0, positiveReplies = 0;
    let referencesReleased = false;
    function checkOriginal() {
      const current = bindingFor(payload, view, entry);
      if (current.payloadJson !== original.payloadJson
          || current.requirementsJson !== original.requirementsJson
          || current.challengeJson !== original.challengeJson) fail('continuation_binding_changed');
      checkUpfrontTransport(context, sealedContext);
    }
    checkOriginal();
    entry.continuationClaimed = true; // Permanent; no new session/reset after uncertainty.
    entry.originalPayloadReference = null;
    c = null; configuration = null;
    function release() {
      payload = null; view = null; context = null; processSettlement = null;
      sealedContext = null; referencesReleased = true;
    }
    function currentOwner() {
      if (entry.verifyTicket !== null || entry.settleTicket !== null) fail('busy');
      const owner = entry.owner.getSnapshot().settlement;
      if (entry.phase !== 'VERIFIED' || owner.inFlight || owner.state !== 'PENDING'
          || owner.firstAttempts !== 1 || !owner.firstAuthorityConsumed
          || owner.pendingReconciliations !== expectedReconciliations
          || owner.pendingReconciliations >= owner.maxPendingReconciliations) {
        phase = 'UNKNOWN'; release(); fail('stage_rejected');
      }
      return owner;
    }
    async function resumeRun(count, ticket) {
      if (count !== 0 || !invariant()) fail('input_rejected');
      if (active) fail('busy');
      if (phase !== 'PENDING') fail('stage_rejected');
      checkOriginal();
      currentOwner();
      active = true;
      let invoked = false;
      try {
        await undefined; // Publish the receipt and fence reentry before any capability call.
        if (!invariant()) fail('operation_rejected');
        checkOriginal();
        const before = currentOwner();
        calls++; invoked = true;
        const returned = apply(processSettlement, undefined, [
          payload, view, undefined, context, undefined, undefined, 'before-handler',
        ]);
        if (!invariant() || returned === ticket.promise || typeof returned !== 'object'
            || returned === null || isProxy(returned) || !isPromise(returned)
            || !supportedPromise(returned)) fail('operation_rejected');
        const accepted = apply(nativeThen, returned, [raw => {
          if (!invariant()) fail('operation_rejected');
          const normalized = NORMALIZE(raw, original);
          const headers = record(ownData(raw, 'headers'), freeze(['PAYMENT-RESPONSE']));
          const header = headers['PAYMENT-RESPONSE'];
          if (typeof header !== 'string' || header.length === 0
              || header.length > HEADER_LIMIT) fail('operation_rejected');
          const wireResult = NORMALIZE(DECODE_HEADER(header, {
            maxEncodedBytes: HEADER_LIMIT, maxDecodedBytes: HEADER_LIMIT,
          }), original);
          if (wireResult.responseJson !== normalized.responseJson
              || wireResult.disposition !== normalized.disposition
              || wireResult.publicationStatus !== normalized.publicationStatus) fail('operation_rejected');
          return freeze({
            settlement: deepFreeze(parse(normalized.responseJson)),
            headers: deepFreeze(parse(serialize({ 'PAYMENT-RESPONSE': header }))),
          });
        }, () => { fail('operation_rejected'); }]);
        const result = await shield(accepted);
        if (!invariant()) fail('operation_rejected');
        checkOriginal();
        const after = entry.owner.getSnapshot().settlement;
        if (entry.phase !== 'VERIFIED' || entry.verifyTicket !== null
            || entry.settleTicket !== null || after.inFlight
            || after.firstAttempts !== before.firstAttempts
            || !after.firstAuthorityConsumed
            || after.pendingReconciliations !== before.pendingReconciliations + 1
            || (result.settlement.success ? after.state !== 'SUCCEEDED' : after.state !== 'PENDING')) {
          fail('operation_rejected');
        }
        expectedReconciliations = after.pendingReconciliations;
        if (result.settlement.success) { positiveReplies++; phase = 'SUCCEEDED'; }
        else phase = expectedReconciliations < after.maxPendingReconciliations
          ? 'PENDING' : 'PENDING_EXHAUSTED';
        return result;
      } catch {
        if (invoked) phase = 'UNKNOWN';
        fail('continuation_rejected');
      } finally {
        active = false;
        if (phase !== 'PENDING') release();
      }
    }
    return freeze({
      resume: freeze(function resume() {
        const ticket = create(null); ticket.promise = null;
        const pending = shield(resumeRun(arguments.length, ticket));
        ticket.promise = pending; return pending;
      }),
      getSnapshot: freeze(function getSnapshot() {
        if (arguments.length !== 0 || !invariant()) fail('input_rejected');
        const settlement = entry.owner.getSnapshot().settlement;
        return freeze({
          phase, active, sdkContinuationCalls: calls, positiveReplies, referencesReleased,
          pendingReconciliations: settlement.pendingReconciliations,
          maxPendingReconciliations: settlement.maxPendingReconciliations,
          firstAuthorityConsumed: settlement.firstAuthorityConsumed,
          publication: settlement.publication,
          persistence: 'MEMORY_ONLY', recoveryAuthority: 'NONE',
          qualification: 'PINNED_SDK_CONTINUATION_ONLY',
          serviceDelivery: 'NOT_ESTABLISHED', currentAuthority: 'NOT_ESTABLISHED',
        });
      }),
    });
  }

  function snapshot() {
    if (!invariant()) fail('input_rejected');
    return freeze({
      contextLimit: limit, captureAttempts, capturedContexts: entries.length,
      schemaCalls, verifyCalls, firstSettlementCalls: firstCalls,
      pendingObservationCalls: observerCalls, positiveSettlementResponses: positiveResponses,
      contexts: freeze(entries.map((e, i) => freeze({
        index: i, verificationPhase: e.phase,
        boundOwner: e.owner === null ? null : e.owner.getSnapshot(),
      }))),
      bindingScope: 'DECLARED_SERVER_VIEW_AND_SERIALIZED_CONTEXT_ONLY',
      persistence: 'MEMORY_ONLY', recoveryAuthority: 'NONE', qualification: 'SDK_FREE_CALLBACK_DATA_ONLY',
    });
  }

  async function parsePriceRun(count, price, network) {
    try {
      if (count !== 2 || !invariant() || network !== fixed.network) fail('input_rejected');
      const p = record(price, freeze(['amount', 'asset']));
      if (p.amount !== fixed.amount || p.asset !== fixed.asset) fail('input_rejected');
      return freeze({ amount: p.amount, asset: p.asset });
    } catch { fail('input_rejected'); }
  }
  async function enhanceRun(count, requirement, kind, extensions) {
    try {
      if (count !== 3 || !invariant()) fail('input_rejected');
      const r = parse(serialize(requirement)), k = parse(serialize(kind));
      requireFixed(r);
      if (k.x402Version !== 2 || k.scheme !== 'exact' || k.network !== fixed.network
          || arrayValues(extensions, 16).length !== 0) fail('input_rejected');
      return officialCore223 ? r : deepFreeze(r);
    } catch { fail('input_rejected'); }
  }
  const flows = freeze({ default: freeze({ supported: freeze(['upfront']), default: 'upfront' }) });
  const schemeServer = freeze({
    scheme: 'exact', defaultAssetTransferMethod: 'default', paymentFlows: flows,
    parsePrice: freeze(function parsePrice(price, network) { return shield(parsePriceRun(arguments.length, price, network)); }),
    enhancePaymentRequirements: freeze(function enhancePaymentRequirements(r, kind, extensions) {
      return shield(enhanceRun(arguments.length, r, kind, extensions));
    }),
    enrichPaymentRequiredResponse: freeze(function enrichPaymentRequiredResponse(argument) {
      return shield((async () => { capture(arguments.length, argument); })());
    }),
  });
  const facilitatorClient = freeze({
    getSupported: freeze(function getSupported() {
      const count = arguments.length;
      return shield((async () => {
        if (count !== 0 || !invariant()) fail('input_rejected');
        return deepFreeze({ kinds: [{ x402Version: 2, scheme: 'exact', network: fixed.network }], extensions: [], signers: {} });
      })());
    }),
    verify: freeze(function verify(payload, view) {
      const ticket = create(null); ticket.promise = null;
      const pending = shield(verifyRun(arguments.length, payload, view, ticket)); ticket.promise = pending; return pending;
    }),
    settle: freeze(function settle(payload, view) {
      const ticket = create(null); ticket.promise = null;
      const pending = shield(settleRun(arguments.length, payload, view, ticket)); ticket.promise = pending; return pending;
    }),
  });
  return freeze({
    schemeServer, facilitatorClient,
    ...(officialCore223 ? { createPendingContinuation: freeze(createPendingContinuation) } : {}),
    getSnapshot: freeze(function getSnapshot() {
      if (arguments.length !== 0) fail('input_rejected');
      return snapshot();
    }),
  });
}


function sealUpfrontTransport(context) {
  const request = record(context, freeze(['request'])).request;
  const fields = record(request, freeze(['adapter', 'method', 'path', 'paymentHeader']), true);
  if (typeof fields.adapter !== 'object' || fields.adapter === null || isProxy(fields.adapter)
      || typeof fields.method !== 'string' || !test(/^[A-Z]{1,16}$/, fields.method)
      || typeof fields.path !== 'string' || fields.path.length < 1 || fields.path.length > 4096
      || typeof fields.paymentHeader !== 'string' || fields.paymentHeader.length < 1
      || fields.paymentHeader.length > 131072) fail('input_rejected');
  const rows = [], budget = { units: 131072, bytes: 131072 };
  for (const key of ownKeys(request)) {
    const value = ownData(request, key);
    if (key !== 'adapter') {
      if (typeof value === 'string') textBudget(value, budget);
      else if (value !== null && typeof value !== 'boolean'
          && (typeof value !== 'number' || !safe(value) || same(value, -0))) fail('input_rejected');
    }
    apply(push, rows, [freeze({ key, value })]);
  }
  return freeze({ request, rows: freeze(rows) });
}
function checkUpfrontTransport(context, sealed) {
  const request = record(context, freeze(['request'])).request;
  if (request !== sealed.request) fail('continuation_binding_changed');
  const keys = ownKeys(request);
  if (keys.length !== sealed.rows.length) fail('continuation_binding_changed');
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] !== sealed.rows[i].key
        || ownData(request, keys[i]) !== sealed.rows[i].value) fail('continuation_binding_changed');
  }
}

function captureMethod(receiver, name) {
  if (typeof receiver !== 'object' || receiver === null || isProxy(receiver)) fail('configuration_rejected');
  let p = receiver;
  for (let depth = 0; depth < 8 && p !== null && p !== objectPrototype && p !== functionPrototype; depth++) {
    if (isProxy(p)) fail('configuration_rejected');
    const d = descriptor(p, name);
    if (d !== undefined) {
      if (!hasOwn(d, 'value')) fail('configuration_rejected');
      return callable(d.value);
    }
    p = prototype(p);
  }
  fail('configuration_rejected');
}
function callable(value) {
  if (typeof value !== 'function' || isProxy(value)) fail('configuration_rejected');
  return value;
}
function record(value, fields, allowExtra = false) {
  if (typeof value !== 'object' || value === null || isProxy(value) || prototype(value) !== objectPrototype)
    fail('input_rejected');
  const keys = ownKeys(value);
  if (keys.length > 32 || (!allowExtra && keys.length !== fields.length)) fail('input_rejected');
  const out = create(null);
  for (const key of keys) {
    if (typeof key !== 'string') fail('input_rejected');
    const d = descriptor(value, key);
    if (d === undefined || d.enumerable !== true || !hasOwn(d, 'value')) fail('input_rejected');
    for (let i = 0; i < fields.length; i++) if (fields[i] === key) put(out, key, d.value);
  }
  for (const key of fields) if (!hasOwn(out, key)) fail('input_rejected');
  return out;
}
function ownData(value, key) {
  if (typeof value !== 'object' || value === null || isProxy(value) || prototype(value) !== objectPrototype)
    fail('input_rejected');
  const d = descriptor(value, key);
  if (d === undefined || !hasOwn(d, 'value') || d.enumerable !== true) fail('input_rejected');
  return d.value;
}
function arrayValues(value, cap) {
  if (typeof value !== 'object' || value === null || isProxy(value) || !isArray(value)
      || prototype(value) !== arrayPrototype) fail('input_rejected');
  const d = descriptor(value, 'length');
  if (d === undefined || !hasOwn(d, 'value') || !safe(d.value) || d.value < 0
      || d.value > cap || ownKeys(value).length !== d.value + 1) fail('input_rejected');
  const out = [];
  for (let i = 0; i < d.value; i++) {
    const x = descriptor(value, String(i));
    if (x === undefined || !hasOwn(x, 'value') || x.enumerable !== true) fail('input_rejected');
    apply(push, out, [x.value]);
  }
  return out;
}
function serialize(value) {
  const budget = { nodes: 4096, units: 131072, bytes: 131072 };
  const text = stringify(data(value, 0, budget));
  if (typeof text !== 'string' || text.length === 0 || text.length > 131072
      || apply(byteLength, Buffer, [text, 'utf8']) > 131072) fail('input_rejected');
  return text;
}
function data(value, depth, budget) {
  if (depth > 16 || --budget.nodes < 0) fail('input_rejected');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!safe(value) || same(value, -0)) fail('input_rejected');
    return value;
  }
  if (typeof value === 'string') { textBudget(value, budget); return value; }
  if (typeof value !== 'object' || isProxy(value)) fail('input_rejected');
  if (isArray(value)) {
    const items = arrayValues(value, 1024), result = [];
    for (let i = 0; i < items.length; i++) put(result, String(i), data(items[i], depth + 1, budget));
    return freeze(result);
  }
  if (prototype(value) !== objectPrototype || ownKeys(value).length > 256) fail('input_rejected');
  const result = create(null);
  for (const key of ownKeys(value)) {
    if (typeof key !== 'string' || key.length > 128 || key === 'toJSON') fail('input_rejected');
    textBudget(key, budget);
    const d = descriptor(value, key);
    if (d === undefined || !hasOwn(d, 'value') || d.enumerable !== true) fail('input_rejected');
    put(result, key, data(d.value, depth + 1, budget));
  }
  return freeze(result);
}
function textBudget(value, budget) {
  if (value.length > 131072) fail('input_rejected');
  budget.units -= value.length; budget.bytes -= apply(byteLength, Buffer, [value, 'utf8']);
  if (budget.units < 0 || budget.bytes < 0) fail('input_rejected');
}
function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const key of ownKeys(value)) deepFreeze(value[key]);
    return freeze(value);
  }
  return value;
}
function normalizeVerification(value) {
  const r = record(value, freeze(['isValid']), true);
  if (typeof r.isValid !== 'boolean') fail('operation_rejected');
  // The single record scan checked every own descriptor. Copy only admitted primitives.
  const payer = descriptor(value, 'payer'), reason = descriptor(value, 'invalidReason');
  const out = { isValid: r.isValid };
  if (payer !== undefined && payer.value !== undefined) {
    if (typeof payer.value !== 'string' || payer.value.length === 0 || payer.value.length > 512
        || apply(byteLength, Buffer, [payer.value, 'utf8']) > 512) fail('operation_rejected');
    out.payer = payer.value;
  }
  if (!r.isValid) {
    const code = reason === undefined || reason.value === undefined ? 'verification_failed' : reason.value;
    if (typeof code !== 'string' || !test(REASON, code)) fail('operation_rejected');
    out.invalidReason = code; out.invalidMessage = code;
  }
  return freeze(out);
}
function supportedPromise(value) {
  if (prototype(value) !== promisePrototype) return false;
  const d = descriptor(value, 'constructor');
  return d === undefined || (hasOwn(d, 'value') && d.value === NativePromise);
}
function shield(value) { put(value, 'constructor', NativePromise, false); return value; }
function invariant() {
  return initialThen === undefined && descriptor(objectPrototype, 'then') === undefined
    && initialObjectJson === undefined && descriptor(objectPrototype, 'toJSON') === undefined
    && initialArrayJson === undefined && descriptor(arrayPrototype, 'toJSON') === undefined
    && sameDescriptor(descriptor(promisePrototype, 'constructor'), constructorDescriptor)
    && sameDescriptor(descriptor(NativePromise, species), speciesDescriptor);
}
function sameDescriptor(actual, expected) {
  if (actual === undefined || expected === undefined || ownKeys(actual).length !== ownKeys(expected).length) return false;
  for (const key of ownKeys(expected)) if (!hasOwn(actual, key) || actual[key] !== expected[key]) return false;
  return true;
}
function put(value, key, content, enumerable = true) {
  const d = create(null); d.value = content; d.enumerable = enumerable; d.writable = false; d.configurable = false;
  define(value, key, d);
}
function fail(kind) {
  const code = 'x402_selected_server_bridge_' + kind;
  const error = new ErrorType(code);
  put(error, 'code', code); put(error, 'stack', 'TypeError: ' + code, false);
  throw freeze(error);
}
