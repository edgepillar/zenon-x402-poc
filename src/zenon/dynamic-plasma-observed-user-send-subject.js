import { types as utilTypes } from 'node:util';
import {
  createZenonUserSendObservationInput,
  createZenonUserSendSubject,
} from './transaction-planner.js';
import { snapshotDynamicPlasmaObservationCollectionInput } from './dynamic-plasma-observation-collector.js';
import { normalizeDynamicPlasmaObservation } from './dynamic-plasma-observation-normalizer.js';
import { decodeZenonAccountFrontierReadResult } from './dynamic-plasma-account-frontier-read.js';

const REQUEST = createZenonUserSendObservationInput;
const CAPTURE = snapshotDynamicPlasmaObservationCollectionInput;
const NORMALIZE = normalizeDynamicPlasmaObservation;
const FRONTIER = decodeZenonAccountFrontierReadResult;
const SUBJECT = createZenonUserSendSubject;
const ownKeys = Reflect.ownKeys;
const descriptor = Object.getOwnPropertyDescriptor;
const prototype = Object.getPrototypeOf;
const hasOwn = Object.hasOwn;
const create = Object.create;
const define = Object.defineProperty;
const freeze = Object.freeze;
const isProxy = utilTypes.isProxy;
const objectPrototype = Object.prototype;
const ErrorType = TypeError;
const FIELDS = freeze([
  'observedSubjectVersion', 'phase', 'paymentRequired', 'accepted', 'payerAddress',
  'compiledSporkIds', 'accountFrontierResultJson', 'observation',
]);

/**
 * Initial UNSIGNED UserSend subject from two kinds of supplied raw read DATA.
 * Independently derive the schema3 request/digest from the selected intent,
 * normalize the raw dual observation against that digest, and require its
 * DP_ACTIVE classification. Decode the account-frontier result with the
 * existing exact wire grammar and the independently selected payer/chain.
 * Select the INITIAL acknowledgement from the normalized quote-before
 * frontier (the existing pricing contract), not a caller-supplied ack.
 * Existing subject construction derives the next account height/previous hash
 * and selected transfer fields. Return its unchanged detached subject DTO.
 *
 * This is stateless initial planning, NOT an acknowledgement refresh service.
 * A later call can describe a different initial subject; it grants NO reuse of
 * an original quote/block or replacement of an original subject/acknowledgement.
 * The caller must retain those originals after quoting/signing. Phase is DATA,
 * not signer state or authority; old quote consistency is checked downstream.
 *
 * No request origin/authentication, account/Momentum ancestry, simultaneous or
 * current state, full frontier-block/hash/signature, funds, runtime p/policy,
 * key possession, preparation, work, signing, publication, retry, recovery or
 * provider READY is established. Both inputs can be forged coherent DATA.
 * Null/unavailable account results NEVER mean an empty account. The result-
 * text decoder's local envelope is syntax reuse, not real RPC correlation.
 * No transport, endpoint, native owner, callback or Promise is invoked here.
 */
export function createZenonObservedUserSendSubject(input) {
  try {
    if (arguments.length !== 1) reject();
    const top = record(input);
    if (top.observedSubjectVersion !== 1 || top.phase !== 'UNSIGNED') reject();
    const request = REQUEST({
      observationIntentVersion: 1, phase: top.phase,
      paymentRequired: top.paymentRequired, accepted: top.accepted,
      payerAddress: top.payerAddress, compiledSporkIds: top.compiledSporkIds,
    });
    const captured = CAPTURE(request);
    const normalized = NORMALIZE(top.observation, captured.expectedRequestContextDigest);
    if (normalized.schemaVersion !== 3 || normalized.classification !== 'DP_ACTIVE'
        || normalized.requestContextBinding !== 'MATCHES_DECLARED_EXPECTED_REQUEST_CONTEXT'
        || normalized.observation === null) reject();
    const frontier = FRONTIER({
      frontierReadVersion: 1, phase: top.phase,
      expectedChainIdentifier: request.expectedChainProfile.chainIdentifier,
      payerAddress: top.payerAddress, resultJson: top.accountFrontierResultJson,
    });
    const before = normalized.observation.beforeFrontier;
    return SUBJECT({
      subjectInputVersion: 1, phase: top.phase,
      paymentRequired: top.paymentRequired, accepted: top.accepted,
      payerAddress: top.payerAddress, compiledSporkIds: top.compiledSporkIds,
      accountFrontier: frontier,
      momentumAcknowledged: { hash: before.hash, height: before.height },
    });
  } catch { reject(); }
}

function record(value) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || prototype(value) !== objectPrototype || ownKeys(value).length !== FIELDS.length) reject();
  const result = create(null);
  for (const field of FIELDS) {
    const d = descriptor(value, field);
    if (d === undefined || d.enumerable !== true || !hasOwn(d, 'value')) reject();
    result[field] = d.value;
  }
  return result;
}

function reject() {
  const code = 'zenon_observed_user_send_subject_input_rejected';
  const error = new ErrorType(code);
  define(error, 'code', { value: code, enumerable: true });
  define(error, 'stack', { value: 'TypeError: ' + code, enumerable: false });
  throw freeze(error);
}
