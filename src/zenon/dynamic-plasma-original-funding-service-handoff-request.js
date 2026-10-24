import { types as utilTypes } from 'node:util';
import { createFundingPostOriginalPaymentCheckpointClient } from '../x402-original-payment-checkpoint-client.js';
import { restoreOriginalPaymentCheckpoint } from '../service-credit-pilot-original-payment-checkpoint.js';
import { snapshotOriginalServiceRequestCustodyKey } from '../service-credit-original-request-custody-contract.js';

const CORE = createFundingPostOriginalPaymentCheckpointClient, RESTORE = restoreOriginalPaymentCheckpoint;
const KEY = snapshotOriginalServiceRequestCustodyKey, F = Object.freeze;
const DESC = Object.getOwnPropertyDescriptor, PROTO = Object.getPrototypeOf, KEYS = Reflect.ownKeys;
const OWN = Object.hasOwn, IS_PROXY = utilTypes.isProxy;
const BINDING = F(['requestId','paymentHash','origin','contextId']);
const DIGESTS = F(['requestBody','paymentPayload','paymentRequirements','context']);
const UNREACHABLE_READER = F(function unreachableCheckpointReader() { fail(); });

/**
 * Before consuming actual funding close/handoff, detach the EXTERNAL original
 * checkpoint/pins, exact original challenge and explicitly selected grant.
 * Compare against the source owner's retained preparation packet, never a DB
 * read, a receipt's grant guess or pins learned during recovery.
 *
 * Calls the actual POST checkpoint DATA constructor with a reader that MUST
 * NOT run. No SDK/SQL/native close/transport/signing/nonce. DATA can be fabricated:
 * this does not prove independent durable retention, native cleanup, funding,
 * provider authority, current grant validity or permission to send a header.
 */
export function captureOriginalFundingServiceHandoffRequest(request, retainedOriginal) {
  if (arguments.length !== 2) fail();
  let core = null;
  try {
    const r = exact(request, ['originalPayment','selectedGrantId','paymentRequiredHeader']);
    const old = exact(retainedOriginal, ['resourceUrl','serializedCheckpoint','paymentRequiredHeader']);
    const original = exact(r.originalPayment, ['resourceUrl','serializedCheckpoint','expectedPins']);
    const pins = exact(original.expectedPins, ['binding','digests']);
    const b = F(exact(pins.binding, BINDING)), d = F(exact(pins.digests, DIGESTS));
    // These are primitive caller expectations; never import nested hooks into
    // the checkpoint codec or derive expected values from the retained record.
    for (const v of [...Object.values(b), ...Object.values(d)]) if (typeof v !== 'string') fail();
    const independent = F({ binding: b, digests: d });
    if (typeof original.resourceUrl !== 'string' || original.resourceUrl !== old.resourceUrl
        || typeof original.serializedCheckpoint !== 'string' || original.serializedCheckpoint !== old.serializedCheckpoint
        || typeof r.paymentRequiredHeader !== 'string' || r.paymentRequiredHeader !== old.paymentRequiredHeader) fail();
    const checkpoint = RESTORE(original.serializedCheckpoint, independent);
    if (checkpoint.originalBytes.paymentRequirements !== r.paymentRequiredHeader) fail();
    const selectedGrantId = KEY({ grantId: r.selectedGrantId, requestId: 'handoff' }).grantId;
    const originalPayment = F({ resourceUrl: original.resourceUrl,
      serializedCheckpoint: original.serializedCheckpoint, expectedPins: independent });
    core = CORE({ ...originalPayment, readOriginalPaymentCheckpoint: UNREACHABLE_READER });
    const selection = core.selection();
    core.close(); core = null;
    return F({ originalPayment, selectedGrantId, paymentRequiredHeader: r.paymentRequiredHeader,
      requestProfile: selection.requestProfile, authority: 'NONE', transport: 'NOT_INVOKED',
      fundingAcknowledgement: 'NOT_ESTABLISHED', grantActivation: 'NOT_ESTABLISHED',
      independentDurableRetention: 'NOT_ESTABLISHED', nativeResourceCleanup: 'NOT_QUALIFIED' });
  } catch {
    if (core !== null) { try { core.close(); } catch {} }
    fail();
  }
}
function exact(value, fields) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || PROTO(value) !== Object.prototype || KEYS(value).length !== fields.length) fail();
  const out = {};
  for (const name of fields) {
    const d = DESC(value, name);
    if (!d || !OWN(d, 'value') || !d.enumerable) fail();
    Object.defineProperty(out, name, { value: d.value, enumerable: true });
  }
  return out;
}
function fail() {
  const code = 'original_funding_service_handoff_request_rejected', e = new TypeError(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code });
  throw F(e);
}

