import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import { validatePaymentRequiredForOfferSelection } from '../x402-wire.js';
import { runBuyerOriginalRecoveryPipeHost } from '../buyer-original-recovery-pipe-host.js';
import { createBuyerOwnedBackendRecoveryResource } from '../buyer-owned-backend-recovery-resource.js';

const F = Object.freeze, DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn;
const BACKEND_HELD = new Set();
const VALIDATE = F(function validateChallenge(value) { validatePaymentRequiredForOfferSelection(value); });
const NO_COST = F(function recoveryCannotDeriveCost() { fail(); });
const OPEN_BACKEND = F(async function openOwnedExistingBackend(bootstrap, requireCurrentAcquisition) {
  requireCurrentAcquisition();
  if (bootstrap.recoveryPipeBootstrapVersion !== 2 || BACKEND_HELD.size >= 16) fail();
  const { ServiceCreditSqliteStore } = await import('../service-credit-sqlite-store.js');
  requireCurrentAcquisition();
  const { createServiceCreditBackendOriginalOutcomeReader } = await import('../service-credit-backend-original-outcome-reader.js');
  requireCurrentAcquisition();
  const CLOSE = ServiceCreditSqliteStore.prototype.close;
  const frame = { store: null, reader: null, stopRequested: false, stopReceipt: null };
  try {
    requireCurrentAcquisition();
    frame.store = ServiceCreditSqliteStore.openExisting({
      databasePath: bootstrap.backendOptions.databasePath, allowedRoot: bootstrap.payerOptions.allowedRoot,
      deriveCost: NO_COST, ...bootstrap.backendOptions.limits,
    });
    // A synchronous open can consume the remaining budget too. Retain/fence
    // this actually acquired owner through the existing failure path.
    requireCurrentAcquisition();
    frame.reader = createServiceCreditBackendOriginalOutcomeReader({
      store: frame.store, admittedGrantId: bootstrap.selection.selectedGrantId,
    });
    requireCurrentAcquisition();
    return createBuyerOwnedBackendRecoveryResource({ reader: frame.reader, closeStore: F(function closeExistingStore() {
      if (frame.stopRequested) fail();
      frame.stopRequested = true;
      try {
        frame.stopReceipt = Reflect.apply(CLOSE, frame.store, []);
        if (frame.stopReceipt !== undefined) fail();
        frame.store = null; frame.reader = null; return undefined;
      } catch { BACKEND_HELD.add(frame); fail(); }
    }) });
  } catch {
    BACKEND_HELD.add(frame);
    // Before transfer this binding owns the known backend alone. Fence its
    // synchronous reader first; a failure cannot authorize store-close retry.
    let fenced = frame.reader === null;
    if (frame.reader !== null) {
      try { fenced = frame.reader.close().status === 'CLOSED'; } catch { fenced = false; }
    }
    if (fenced && frame.store !== null && !frame.stopRequested) {
      frame.stopRequested = true;
      try { frame.stopReceipt = Reflect.apply(CLOSE, frame.store, []); } catch {}
    }
    fail();
  }
});
const OPEN = F(async function openOriginalOnly(bootstrap, requireCurrentAcquisition) {
  // Reached only after canonical external bootstrap capture, with one already
  // owned channel. No arbitrary module path, SDK/store factory or signer.
  requireCurrentAcquisition();
  const { openNativeOfficialV6FundingPostOriginalPaymentClient } =
    await import('../x402-native-v6-funding-post-client.js');
  requireCurrentAcquisition();
  const { caPem, ...transport } = bootstrap.transportOptions;
  const ca = Buffer.from(caPem, 'ascii');
  try {
    requireCurrentAcquisition();
    return await openNativeOfficialV6FundingPostOriginalPaymentClient({
      payerOptions: bootstrap.payerOptions, originalPayment: bootstrap.selection.originalPayment,
      official: { ...bootstrap.official, validateChallenge: VALIDATE }, transportOptions: { ...transport, ca },
    });
  } finally { ca.fill(0); }
});

/** SOURCE-ONLY native application binding. No SDK module is loaded until the
 * explicit first pipe line passes the actual pure bootstrap validation.
 * Opening the existing V6 payer may write owner_epoch. This is not read-only
 * SQL, funding, payment, signed-block creation or default buyer selection. */
export async function runNativeOriginalRecoveryPipeHost(configuration) {
  if (arguments.length !== 1 || configuration === null || typeof configuration !== 'object'
      || utilTypes.isProxy(configuration) || Object.getPrototypeOf(configuration) !== Object.prototype
      || Reflect.ownKeys(configuration).length !== 3) fail();
  const selected = {};
  for (const name of ['inputFd', 'outputFd', 'allowedRoot']) {
    const d = DESC(configuration, name);
    if (!d || !OWN(d, 'value') || !d.enumerable) fail();
    Object.defineProperty(selected, name, { value: d.value, enumerable: true });
  }
  return runBuyerOriginalRecoveryPipeHost({ ...selected, openNativeClient: OPEN, openBackend: OPEN_BACKEND });
}
function fail() { throw new TypeError('buyer_native_original_recovery_pipe_configuration_required'); }
