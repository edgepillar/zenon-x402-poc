import { types } from 'node:util';
import { createPurchasedOrderApplicationCore } from './service-purchase-order-application-core.js';
import { capturePurchasedOrderFundingHttpSelection, bindPurchasedOrderFundingHttpApplication } from './service-purchase-order-funding-http-application.js';

function reject() {
  const code = 'PURCHASE_ORDER_HTTP_INPUT_REJECTED', e = new TypeError(code);
  Object.defineProperties(e, { code: { value: code, enumerable: true }, stack: { value: 'TypeError: ' + code } }); throw Object.freeze(e);
}

/** Existing original-only POST admission/writer, backed by both actual owners.
 * BOUND follows acknowledged funding and liability custody, never delivery.
 * Selected backend/authentication/timer ports do not qualify native I/O.
 */
export function createPurchasedOrderHttpApplicationCore(options) {
  if (arguments.length !== 1 || options === null || typeof options !== 'object' || types.isProxy(options) || Object.getPrototypeOf(options) !== Object.prototype) reject();
  const names = ['purchaseHttp', 'fulfillmentOwnership', 'fundingBackend', 'fulfillmentBackend', 'originalStore', 'verifyFundingEvidence', 'verifier', 'clock', 'deadlines'], c = {};
  if (Reflect.ownKeys(options).length !== names.length) reject();
  for (const k of names) {
    const d = Object.getOwnPropertyDescriptor(options, k);
    if (!d?.enumerable || !Object.hasOwn(d, 'value')) reject(); c[k] = d.value;
  }
  const selected = capturePurchasedOrderFundingHttpSelection(c.purchaseHttp);
  const app = createPurchasedOrderApplicationCore({ selection: { funding: selected.selection, fulfillmentOwnership: c.fulfillmentOwnership },
    fundingBackend: c.fundingBackend, fulfillmentBackend: c.fulfillmentBackend, originalStore: c.originalStore,
    verifyFundingEvidence: c.verifyFundingEvidence, verifier: c.verifier, clock: c.clock, deadlines: c.deadlines });
  const http = bindPurchasedOrderFundingHttpApplication(selected, app);
  return Object.freeze({ ...http, readLiability: app.readLiability, beginDelivery: app.beginDelivery, recordDelivery: app.recordDelivery,
    retainCompensation: app.retainCompensation, recordCompensation: app.recordCompensation });
}
