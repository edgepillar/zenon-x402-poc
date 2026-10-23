import { types as utilTypes } from 'node:util';
import { captureZenonDynamicPlasmaBoundedOriginalFundingConfiguration } from './dynamic-plasma-bounded-original-funding-configuration.js';
import { createBoundedNonceDynamicPlasmaMaterialExchange } from './dynamic-plasma-bounded-material-exchange.js';
import { createRetainedDynamicPlasmaHttpsReadSession } from './dynamic-plasma-retained-https-read-session.js';
import { createZenonDynamicPlasmaOriginalFundingSubmissionV3 } from './dynamic-plasma-original-funding-submission.js';

const CAPTURE = captureZenonDynamicPlasmaBoundedOriginalFundingConfiguration;
const MATERIAL = createBoundedNonceDynamicPlasmaMaterialExchange;
const READ_SESSION = createRetainedDynamicPlasmaHttpsReadSession, SUBMISSION = createZenonDynamicPlasmaOriginalFundingSubmissionV3;
const FREEZE = Object.freeze, CREATE = Object.create, DEFINE = Object.defineProperty;
const DESCRIPTOR = Object.getOwnPropertyDescriptor, PROTOTYPE = Object.getPrototypeOf;
const KEYS = Reflect.ownKeys, HAS = Object.hasOwn, APPLY = Reflect.apply;
const IS_PROXY = utilTypes.isProxy, OBJECT = Object.prototype, ErrorType = TypeError;
const FIELDS = FREEZE(['readSessionOptions', 'materialOptions', 'materialWaitMs', 'wallet',
  'store', 'fundingResourceUrl', 'deadlineMs', 'fetchImpl']);

/**
 * SOURCE-ONLY full bounded HTTPS original-funding composition. Imports the
 * actual nonce producer, native HTTPS owners, SDK/preflight and V6 SQLite
 * graph. No component/DATA or syntax result qualifies this runtime graph.
 *
 * Public exact options replace readOptions with readSessionOptions. Hardwire
 * one actual bounded material capability, one actual three-owner retained
 * HTTPS session, and the actual joined V3 funding owner. No caller factory,
 * alternate validator/store writer, material substitute or retry is accepted.
 * Return that actual V3 owner DIRECTLY, preserving its operation Promises,
 * original packet, independent-pins stages and cached joined close Promise.
 *
 * Construction invokes no read/search/sign/SQL operation. Failure requests
 * close for the still-inert read session; caller retains existing store
 * close/quarantine and any consumed store claim stays consumed. Successful
 * outer construction transfers store lifetime to the unchanged actual payer
 * owner. Its close is entered only after clean read close and joined active
 * operation; uncertain reads leave the store HELD. Wallet/material/fetch
 * capabilities retain their own non-cooperative/unsafe-Promise duties.
 *
 * Prepare/independent pins/commit/submit remain explicit. No default buyer
 * cutover, automatic quote, re-sign, replay, reopen or chain publication is
 * introduced. BOUND is intake acknowledgement, not inclusion/grant/service.
 * These limits are not OS/scheduling/CPU cancellation or native cleanup proof.
 */
export function createZenonDynamicPlasmaBoundedHttpsOriginalFundingSubmission(configuration) {
  let session = null;
  try {
    if (arguments.length !== 1 || typeof configuration !== 'object' || configuration === null
        || IS_PROXY(configuration) || PROTOTYPE(configuration) !== OBJECT
        || KEYS(configuration).length !== FIELDS.length) reject();
    const fields = CREATE(null);
    for (let i = 0; i < FIELDS.length; i++) {
      const name = FIELDS[i], d = DESCRIPTOR(configuration, name);
      if (!d || d.enumerable !== true || !HAS(d, 'value')) reject();
      put(fields, name, d.value);
    }
    // Reuse the actual DATA capture before constructing any owned read set.
    // The temporary readOptions is only the borrowed future session config.
    const selected = CAPTURE({ readOptions: fields.readSessionOptions,
      materialOptions: fields.materialOptions, materialWaitMs: fields.materialWaitMs,
      wallet: fields.wallet, store: fields.store, fundingResourceUrl: fields.fundingResourceUrl,
      deadlineMs: fields.deadlineMs, fetchImpl: fields.fetchImpl });
    const materialExchange = MATERIAL(selected.materialOptions);
    session = READ_SESSION(selected.readOptions);
    return SUBMISSION({ preparerOptions: { readOptions: session.readOptions, materialExchange,
      materialWaitMs: selected.materialWaitMs, wallet: selected.wallet },
      store: selected.store, fundingResourceUrl: selected.fundingResourceUrl,
      deadlineMs: selected.deadlineMs, fetchImpl: selected.fetchImpl, readSession: session });
  } catch {
    // No operation ran and no public read capability escaped construction.
    // The actual session prehandles its close rejection; do not claim cleanup.
    if (session !== null) { try { APPLY(session.close, undefined, []); } catch {} }
    reject();
  }
}
function put(target, name, value) {
  const d = CREATE(null); d.value = value; d.enumerable = true; DEFINE(target, name, d);
}
function reject() {
  const code = 'zenon_bounded_https_original_funding_configuration_rejected', error = new ErrorType(code);
  put(error, 'code', code);
  const stack = CREATE(null); stack.value = 'TypeError: ' + code; DEFINE(error, 'stack', stack);
  throw FREEZE(error);
}
