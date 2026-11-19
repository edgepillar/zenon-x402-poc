import { types } from 'node:util';
import { capturePurchasedOrderApplicationSelection, createPurchasedOrderApplicationCore } from './service-purchase-order-application-core.js';
import { createPurchasedOrderRecordedDeliveryVerifier } from './service-purchase-order-recorded-delivery.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, parse = JSON.parse;
const OPTIONS = ['selection', 'fundingBackend', 'fulfillmentBackend', 'originalStore',
  'verifyFundingEvidence', 'verifyCompensation', 'recordedDelivery', 'clock', 'deadlines'];
const PURCHASE = ['termsJson', 'termsDigest', 'paymentCheckpointJson', 'paymentPinsJson', 'fundingContextJson'];
function fail() {
  const code = 'ORDER_RECORDED_APPLICATION_INPUT', error = new TypeError(code);
  Object.defineProperties(error, { code: { value: code, enumerable: true }, stack: { value: 'TypeError: ' + code } });
  throw F(error);
}
function fields(value) {
  if (value === null || typeof value !== 'object' || types.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== OPTIONS.length) fail();
  const captured = {};
  for (const key of OPTIONS) {
    const descriptor = D(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail();
    captured[key] = descriptor.value;
  }
  return captured;
}

/**
 * Opt-in paired application with an owned recorded-delivery read adapter.
 *
 * The existing application retains all funding, CAS, recovery and compensation
 * semantics. The selected ledger is a borrowed synchronous read capability;
 * this composition never opens, closes or authenticates it. Service execution
 * remains separate. Construction performs no funding or ledger read.
 *
 * Close revokes this adapter synchronously before entering application close,
 * including when invoked inside a ledger callback. The exact application close
 * promise and rejection are returned without assimilation or a new deadline.
 * Logical adapter revocation is not physical backend release or native proof.
 */
export function createPurchasedOrderRecordedApplicationCore(options) {
  if (arguments.length !== 1) fail();
  const o = fields(options), selection = capturePurchasedOrderApplicationSelection(o.selection);
  if (typeof o.verifyCompensation !== 'function' || types.isProxy(o.verifyCompensation)) fail();
  const adapter = createPurchasedOrderRecordedDeliveryVerifier(...PURCHASE.map(key => selection.funding.purchase[key]), o.recordedDelivery);
  const serviceResourceUrl = D(o.recordedDelivery, 'serviceResourceUrl').value;
  function verifyDelivery(candidate, delivery) {
    // The owner supplies the context from its validated journal. A terminal,
    // matching receipt can be returned for the owner's existing equality check.
    if (delivery.status === 'DELIVERED' && candidate === delivery.originalDigest
        && delivery.serviceResourceUrl === serviceResourceUrl && delivery.quantity === 1) {
      const state = adapter.snapshot();
      if (!state.closed && !state.held) {
        const receipt = parse(delivery.proofJson);
        if (receipt.evidenceId === 'recorded.' + receipt.resultDigest.slice(7)) return delivery.proofJson;
      }
    }
    return adapter.verifyDelivery(candidate, delivery);
  }
  let app;
  try {
    app = createPurchasedOrderApplicationCore({ selection, fundingBackend: o.fundingBackend,
      fulfillmentBackend: o.fulfillmentBackend, originalStore: o.originalStore,
      verifyFundingEvidence: o.verifyFundingEvidence,
      verifier: { verifyDelivery, verifyCompensation: o.verifyCompensation },
      clock: o.clock, deadlines: o.deadlines });
  } catch (error) {
    // Only the adapter created here is retired. No partially selected borrowed
    // backend gains a close call or another owner from construction refusal.
    adapter.close();
    throw error;
  }
  const closeApplication = app.close;
  let closeRequested = false;
  const close = F(function close() {
    if (arguments.length !== 0) fail();
    if (!closeRequested) {
      closeRequested = true;
      adapter.close();
    }
    return closeApplication();
  });
  return F({ ...app, close,
    recordedDeliverySnapshot: F(function recordedDeliverySnapshot() {
      if (arguments.length !== 0) fail();
      return adapter.snapshot();
    }),
  });
}
