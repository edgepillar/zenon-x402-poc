// SOURCE ONLY; this complete native binding has not been executed.
import { createApiCreditPurchasedGrantRecoveryApplication, createApiCreditNonDpPurchasedGrantRecoveryApplication } from '../api-credit-funding-grant-recovery-application.js';
import { types } from 'node:util';
import { decodeApiCreditOriginalGrantQueryProfile, releaseApiCreditOriginalGrantQueryProfile } from '../api-credit-original-grant-query-profile.js';
import { inspectNativeApiCreditOriginalGrant } from './native-api-credit-original-grant-query.js';
import { createApiCreditOpeningFailureCustody } from '../api-credit-opening-failure-custody.js';
import { createApiCreditReturnedOpeningCustody } from '../api-credit-returned-opening-custody.js';
import { hrtime } from 'node:process';
import { claimSdk105ApiCreditExistingKeyLease, bindSdk105ApiCreditExistingKeyLeaseOwner } from './sdk105-api-credit-existing-key-lease.js';
import { consumeSdk105ApiCreditSelection, consumeSdk105NonDpApiCreditSelection } from './sdk105-api-credit-selection.js';
import { consumeSdk105ApiCreditProductSelection, consumeSdk105NonDpApiCreditProductSelection, bindSdk105ApiCreditProductLifecycle, bindSdk105ApiCreditProductLifecycleWithRecordedResults } from './sdk105-api-credit-product-profile.js';
import { captureSdk105FundingServiceConfiguration, captureSdk105NonDpFundingServiceConfiguration } from './sdk105-funding-service-lifecycle.js';
import { createSdk105AgeBoundSignerContextWalletOwner } from './sdk105-prepared-hash-wallet-owner.js';
import { openOriginalFundingSpendingSignerContextFileOwner, openOriginalFundingSpendingGrantRecoveryFileOwner } from '../original-funding-spending-file-owner.js';
import { createSdk105ApiCreditApplicationLifecycle } from './sdk105-api-credit-application-lifecycle.js';
import { createApiCreditWireOwnerGuard, requireCurrentApiCreditWireOwner } from '../api-credit-wire-owner-guard.js';

const F = Object.freeze, NP = Promise, THEN = NP.prototype.then, MONOTONIC = hrtime.bigint;
// Fixed first-product admission profile, not a chain quote TTL or OS timeout.
const SIGNER_ENTRY = F({ clock: F(() => Reflect.apply(MONOTONIC, hrtime, [])), maxReadToSignerMs: 1000 });
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
/** Explicit non-DP source entries. Existing named DP entries stay unchanged;
 * no difficulty reply, JSON module name or runtime fallback selects this lane. */
export async function openSdk105NativeNonDpApiCreditApplication(selection, requireCurrentOpening) {
  if (arguments.length !== 2) fail();
  return openApplication(selection, requireCurrentOpening, null, true);
}
export async function openSdk105NativeNonDpApiCreditProductApplication(selection, requireCurrentOpening) {
  if (arguments.length !== 2 || failedApplication !== null || typeof requireCurrentOpening !== 'function'
      || types.isProxy(requireCurrentOpening) || !Object.isFrozen(requireCurrentOpening)) fail();
  const product = consumeSdk105NonDpApiCreditProductSelection(selection);
  return openApplication(product.selection, requireCurrentOpening, product.profile, true);
}
async function openApplication(selection, requireCurrentOpening, productProfile, nonDp = false) {
  if (failedApplication !== null || typeof requireCurrentOpening !== 'function'
      || types.isProxy(requireCurrentOpening) || !Object.isFrozen(requireCurrentOpening)) fail();
  const selected = (nonDp ? consumeSdk105NonDpApiCreditSelection : consumeSdk105ApiCreditSelection)(selection);
  let c, file = null, wallet = null, client = null, application = null, wireOwner = null;
  let walletOpeningEntered = false, clientOpeningEntered = false;
  try {
    c = (nonDp ? captureSdk105NonDpFundingServiceConfiguration : captureSdk105FundingServiceConfiguration)(selected.configuration);
    const lookupPolicy=productProfile===null?null:F({caBase64:c.serviceOptions.transportOptions.ca.toString('base64'),maxTotalMs:c.serviceOptions.deadlineMs});
    requireCurrentOpening();
    file = (productProfile === null ? openOriginalFundingSpendingSignerContextFileOwner : openOriginalFundingSpendingGrantRecoveryFileOwner)({ storageProfile: selected.spendingFile.storageProfile,
      allowedRoot: selected.spendingFile.allowedRoot, filePolicy: selected.spendingFile.filePolicy });
    requireCurrentOpening();
    wireOwner = createApiCreditWireOwnerGuard({ fileOwner: file, clock: SIGNER_ENTRY.clock });
    const nativeClient = await import('./dynamic-plasma-native-funding-service-client.js');
    const openClient = nonDp ? nativeClient.openZenonNonDpNativeFundingServiceClientWithApiCreditWireOwner
      : nativeClient.openZenonDynamicPlasmaNativeFundingServiceClientWithApiCreditWireOwner;
    // No new key capability is entered after an expired module-loading budget.
    requireCurrentOpening();
    claimSdk105ApiCreditExistingKeyLease(c.walletOptions.keyPair);
    walletOpeningEntered = true;
    wallet = createSdk105AgeBoundSignerContextWalletOwner(c.walletOptions, { paymentId: selected.spending.paymentId, backend: file.signerCustody }, SIGNER_ENTRY);
    bindSdk105ApiCreditExistingKeyLeaseOwner(c.walletOptions.keyPair, wallet);
    requireCurrentOpening();
    clientOpeningEntered = true;
    client = await openClient({ storeOptions: c.storeOptions,
      fundingOptions: { ...c.fundingOptions, wallet }, serviceOptions: c.serviceOptions }, wireOwner);
    // Ownership of the returned native client/key is now known. A refusal
    // after this point must stop both of those original owners once.
    requireCurrentOpening();
    application = createSdk105ApiCreditApplicationLifecycle({ client, walletOwner: wallet, fileOwner: file,
      fundingResourceUrl: c.storeOptions.resourceUrl, spending: selected.spending });
    const readBudgetMs = Math.min(c.serviceOptions.deadlineMs, 1000);
    const readState = F(function readCurrentOwnedServiceState(key) {
      if (arguments.length !== 1) fail();
      requireCurrentApiCreditWireOwner(wireOwner, readBudgetMs);
      const observed = client.readOriginalRecoveryState(key);
      requireCurrentApiCreditWireOwner(wireOwner, readBudgetMs);
      return observed;
    });
    if (productProfile !== null) {
      const product = bindSdk105ApiCreditProductLifecycleWithRecordedResults(application, productProfile, readState);
      const inspectGrant=F(async function inspectPurchasedOriginalGrant(profileJson,requireCurrent){
        if(arguments.length!==2)fail();let token;
        const guard=F(function requireCurrentPurchasedLookup(){
          if(arguments.length!==0)fail();requireCurrent();requireCurrentApiCreditWireOwner(wireOwner,readBudgetMs);requireCurrent();
        });
        try{
          guard();token=decodeApiCreditOriginalGrantQueryProfile(profileJson);if(token.originalGrantQueryVersion!==1)fail();
          const result=await inspectNativeApiCreditOriginalGrant(token,guard);guard();return result;
        }finally{if(token!==undefined)releaseApiCreditOriginalGrantQueryProfile(token);}
      });
      application = (nonDp ? createApiCreditNonDpPurchasedGrantRecoveryApplication : createApiCreditPurchasedGrantRecoveryApplication)(F({ application: product,
        custody: file.grantQueryCustody, paymentId: selected.spending.paymentId, fundingResourceUrl: c.storeOptions.resourceUrl,
        purchase: productProfile.purchase, inspectGrant, lookupPolicy }));
      // Keep the same stateful recovery/result/close owners. The stateless
      // fixed-offer gate also fences their outer preparation admission, so a
      // coherent foreign offer cannot consume the original recovery claim.
      application = bindSdk105ApiCreditProductLifecycle(application, productProfile);
    }
    requireCurrentOpening(); return application;
  } catch {
    const retained = { file, wallet, client, application, wireOwner, clientStop: null, walletStop: null, applicationStop: null,
      clientClosed: false, walletClosed: false, fileCloseEntered: false, fileCloseReturned: false,
      walletOpeningEntered, clientOpeningEntered, openingCustody: null, openingCustodyUnknown: false,
      returnedOpeningCustody: null, returnedOpeningCustodyUnknown: false };
    failedApplication = retained;
    if (application !== null) {
      // The application already owns all three stops. Never compete with it.
      try { retained.applicationStop = application.close(); consume(retained.applicationStop); } catch {}
    } else if (client !== null) {
      // The same file remains borrowed until BOTH returned owners are current
      // and clean at the actual close boundary, rather than at older callbacks.
      try { retained.returnedOpeningCustody = createApiCreditReturnedOpeningCustody(F({ fileOwner: file,
        clientOwner: client, walletOwner: wallet })); }
      catch { retained.returnedOpeningCustodyUnknown = true; }
    } else if (file !== null) {
      // A rejected opener can retain a borrower without returning its facade.
      // Revoke new admission, but do not raw-close its still-borrowed file.
      // Before client entry, a known wallet must stop before physical close.
      try { retained.openingCustody = createApiCreditOpeningFailureCustody(F({ fileOwner: file, walletOwner: wallet,
        walletOpeningEntered, clientOpeningEntered })); }
      catch { retained.openingCustodyUnknown = true; }
    }
    fail();
  } finally { selected.release(); }
}
