import { types as utilTypes } from 'node:util';
import { captureBuyerOriginalRecoverySelection } from '../buyer-original-recovery-client.js';
import { openBuyerOriginalRecoveryOwnedStreamSession } from '../buyer-recovery-owned-stream-session.js';

const F = Object.freeze, DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn;
let failedAcquisition = null;

/** SOURCE ONLY, explicit retained-original entry. Opens the existing V6 store
 * through its real guarded owner. It may advance the local owner epoch; it is
 * not SQLite read-only. No new store, signer, KeyPair or funding POST transport.
 * The external selection is captured before acquisition, never learned from
 * stored state. Application I/O still requires an explicit service command. */
export async function openNativeOriginalRecoveryCommandSession(configuration) {
  if (arguments.length !== 1 || failedAcquisition !== null) fail();
  return openSession(configuration, false);
}

/** Borrow an actual existing backend store, reuse the same original-only native
 * payer, and own one selected-grant reader. This is a local two-store query,
 * not an HTTP status endpoint or an atomic transaction across both stores. */
export async function openNativeOriginalBackendRecoveryCommandSession(configuration) {
  if (arguments.length !== 1 || failedAcquisition !== null) fail();
  return openSession(configuration, true);
}

async function openSession(configuration, withBackend) {
  const c = fields(configuration, ['configuration', 'selection', 'input', 'output', 'limits',
    ...(withBackend ? ['backendStore'] : [])]);
  const selected = captureBuyerOriginalRecoverySelection(c.selection);
  const raw = fields(c.configuration, ['payerOptions', 'originalPayment', 'official', 'transportOptions']);
  const payer = fields(raw.payerOptions, ['databasePath', 'allowedRoot', 'fundingResourceUrl',
    'custodyPolicy', 'selectedGrantId', 'deadlineMs']);
  const configured = captureBuyerOriginalRecoverySelection({ originalPayment: raw.originalPayment,
    selectedGrantId: payer.selectedGrantId, paymentRequiredHeader: selected.paymentRequiredHeader });
  if (configured.selectedGrantId !== selected.selectedGrantId
      || configured.originalPayment.resourceUrl !== selected.originalPayment.resourceUrl
      || configured.originalPayment.serializedCheckpoint !== selected.originalPayment.serializedCheckpoint
      || JSON.stringify(configured.originalPayment.expectedPins) !== JSON.stringify(selected.originalPayment.expectedPins)
      || payer.fundingResourceUrl !== selected.originalPayment.resourceUrl) fail();
  const nativeConfiguration = F({ ...raw, payerOptions: F(payer), originalPayment: selected.originalPayment });
  let entered = false;
  const openNativeClient = F(async function openNativeClient(requireCurrentOpening) {
    requireCurrentOpening(); entered = true;
    const { openNativeOfficialV6FundingPostOriginalPaymentClient: OPEN } = await import('../x402-native-v6-funding-post-client.js');
    requireCurrentOpening();
    return await OPEN(nativeConfiguration);
  });
  const openBackendReader = withBackend ? F(async function openBackendReader(requireCurrentOpening) {
    requireCurrentOpening(); entered = true;
    const { createServiceCreditBackendOriginalOutcomeReader: READER } = await import('../service-credit-backend-original-outcome-reader.js');
    requireCurrentOpening();
    return READER({ store: c.backendStore, admittedGrantId: selected.selectedGrantId });
  }) : null;
  try {
    return await openBuyerOriginalRecoveryOwnedStreamSession({
      selection: { originalPayment: selected.originalPayment, selectedGrantId: selected.selectedGrantId,
        paymentRequiredHeader: selected.paymentRequiredHeader },
      input: c.input, output: c.output, limits: c.limits, openWaitMs: payer.deadlineMs,
      openNativeClient, ...(withBackend ? { openBackendReader } : {}),
    });
  } catch {
    // The actual stream coordinator retains original opening/stop receipts and
    // owns cleanup exactly once. Never compete with it or the native opener.
    // Even an unreturned, already-entered import/acquisition prevents a retry.
    if (entered) failedAcquisition = F({ entered: true, outcome: 'UNKNOWN' });
    fail();
  }
}
function fields(value, names) {
  if (value === null || typeof value !== 'object' || utilTypes.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {};
  for (const name of names) {
    const d = DESC(value, name);
    if (!d || !OWN(d, 'value') || !d.enumerable) fail();
    Object.defineProperty(out, name, { value: d.value, enumerable: true });
  }
  return out;
}
function fail() {
  const code = 'buyer_native_original_recovery_command_open_refused', error = new TypeError(code);
  Object.defineProperty(error, 'code', { value: code, enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: ' + code });
  throw F(error);
}
