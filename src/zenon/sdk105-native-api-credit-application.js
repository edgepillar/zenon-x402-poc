// SOURCE ONLY; this complete native binding has not been executed.
import { types } from 'node:util';
import { claimSdk105ApiCreditExistingKeyLease, bindSdk105ApiCreditExistingKeyLeaseOwner } from './sdk105-api-credit-existing-key-lease.js';
import { consumeSdk105ApiCreditSelection } from './sdk105-api-credit-selection.js';
import { consumeSdk105ApiCreditProductSelection, bindSdk105ApiCreditProductLifecycle } from './sdk105-api-credit-product-profile.js';
import { captureSdk105FundingServiceConfiguration } from './sdk105-funding-service-lifecycle.js';
import { createSdk105CustodiedPreparedHashWalletOwner } from './sdk105-prepared-hash-wallet-owner.js';
import { openOriginalFundingSpendingSignerContextFileOwner } from '../original-funding-spending-file-owner.js';
import { createSdk105ApiCreditApplicationLifecycle } from './sdk105-api-credit-application-lifecycle.js';

const F = Object.freeze, NP = Promise, THEN = NP.prototype.then;
let failedApplication = null;
function fail() { throw new TypeError('SDK105_NATIVE_API_CREDIT_OPEN_HELD'); }
function consume(promise, yes = () => {}, no = () => {}) {
  if (!types.isPromise(promise) || types.isProxy(promise) || Object.getPrototypeOf(promise) !== NP.prototype) return;
  const d = Object.getOwnPropertyDescriptor(promise, 'constructor');
  if (d !== undefined && (!Object.hasOwn(d, 'value') || d.value !== NP)) return;
  const bridge = Reflect.apply(THEN, promise, [yes, no]); Reflect.apply(THEN, bridge, [() => {}, () => {}]);
}
/** Hardwire actual budget file/SQLite, wallet, native funding/service client
 * and joined application. No supplied opener/store/client/SDK factory. The
 * caller retains cleanup of a key until the actual native client returns. */
export async function openSdk105NativeApiCreditApplication(selection, requireCurrentOpening) {
  if (arguments.length !== 2) fail();
  return openApplication(selection, requireCurrentOpening, null);
}

/** Fixed single-offer product binding. Its public DATA cannot select a module
 * or challenge callback. The existing application owns acquisition/cleanup. */
export async function openSdk105NativeApiCreditProductApplication(selection, requireCurrentOpening) {
  if (arguments.length !== 2 || failedApplication !== null || typeof requireCurrentOpening !== 'function'
      || types.isProxy(requireCurrentOpening) || !Object.isFrozen(requireCurrentOpening)) fail();
  const product = consumeSdk105ApiCreditProductSelection(selection);
  return openApplication(product.selection, requireCurrentOpening, product.profile);
}
async function openApplication(selection, requireCurrentOpening, productProfile) {
  if (failedApplication !== null || typeof requireCurrentOpening !== 'function'
      || types.isProxy(requireCurrentOpening) || !Object.isFrozen(requireCurrentOpening)) fail();
  const selected = consumeSdk105ApiCreditSelection(selection);
  let c, file = null, wallet = null, client = null, application = null;
  try {
    c = captureSdk105FundingServiceConfiguration(selected.configuration);
    requireCurrentOpening();
    file = openOriginalFundingSpendingSignerContextFileOwner({ storageProfile: selected.spendingFile.storageProfile,
      allowedRoot: selected.spendingFile.allowedRoot, filePolicy: selected.spendingFile.filePolicy });
    requireCurrentOpening();
    const { openZenonDynamicPlasmaNativeFundingServiceClient } = await import('./dynamic-plasma-native-funding-service-client.js');
    // No new key capability is entered after an expired module-loading budget.
    requireCurrentOpening();
    claimSdk105ApiCreditExistingKeyLease(c.walletOptions.keyPair);
    wallet = createSdk105CustodiedPreparedHashWalletOwner(c.walletOptions, { paymentId: selected.spending.paymentId, backend: file.signerCustody });
    bindSdk105ApiCreditExistingKeyLeaseOwner(c.walletOptions.keyPair, wallet);
    requireCurrentOpening();
    client = await openZenonDynamicPlasmaNativeFundingServiceClient({ storeOptions: c.storeOptions,
      fundingOptions: { ...c.fundingOptions, wallet }, serviceOptions: c.serviceOptions });
    // Ownership of the returned native client/key is now known. A refusal
    // after this point must stop both of those original owners once.
    requireCurrentOpening();
    application = createSdk105ApiCreditApplicationLifecycle({ client, walletOwner: wallet, fileOwner: file,
      fundingResourceUrl: c.storeOptions.resourceUrl, spending: selected.spending });
    const result = productProfile === null ? application : bindSdk105ApiCreditProductLifecycle(application, productProfile);
    requireCurrentOpening(); return result;
  } catch {
    const retained = { file, wallet, client, application, clientStop: null, walletStop: null, applicationStop: null,
      clientClosed: false, walletClosed: false, fileCloseEntered: false, fileCloseReturned: false };
    failedApplication = retained;
    if (application !== null) {
      // The application already owns all three stops. Never compete with it.
      try { retained.applicationStop = application.close(); consume(retained.applicationStop); } catch {}
    } else if (client !== null) {
      const closeFile = () => {
        if (!retained.clientClosed || !retained.walletClosed || retained.fileCloseEntered) return;
        retained.fileCloseEntered = true;
        try { if (file.revoke() !== undefined || file.close() !== undefined) fail(); const v = file.inspect();
          retained.fileCloseReturned = v.lifecycle === 'CLOSED' && v.physicalCloseReturned === true && v.databaseOpen === false && !v.held; } catch {}
      };
      try { retained.clientStop = client.close(); consume(retained.clientStop, value => {
        try { const v = client.inspect(); retained.clientClosed = value === undefined && v.lifecycle === 'CLOSED' && !v.held && !v.publicOperationActive; } catch {} closeFile();
      }); } catch {}
      try { retained.walletStop = wallet.close(); consume(retained.walletStop, value => {
        try { const v = wallet.inspect(); retained.walletClosed = value === undefined && v.lifecycle === 'CLOSED' && !v.held && v.clearOutcome === 'CLEAR_RETURNED'; } catch {} closeFile();
      }); } catch {}
    } else if (file !== null) {
      // No budget capability escaped into the still-unreturned native client.
      // An unreturned key remains the original caller's cleanup duty.
      retained.fileCloseEntered = true;
      try { file.revoke(); file.close(); retained.fileCloseReturned = file.inspect().physicalCloseReturned === true; } catch {}
    }
    fail();
  } finally { selected.release(); }
}
