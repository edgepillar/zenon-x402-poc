// SOURCE ONLY; no default argv/stdio or secret-loading behavior is changed.
import { types } from 'node:util';
import { captureSdk105ApiCreditSelection } from './sdk105-api-credit-selection.js';
import { captureSdk105ApiCreditProductSelection } from './sdk105-api-credit-product-profile.js';
import { openBuyerApiCreditFundingOwnedStreamSession } from '../buyer-funding-owned-stream-session.js';

const F = Object.freeze;
function fail() { throw new TypeError('SDK105_NATIVE_API_CREDIT_COMMAND_OPEN'); }
/** One fixed native binding under the actual reserved command-channel owner.
 * Every operation is still explicit command DATA. No caller-selected module,
 * client/store factory, automatic pin adoption, funding send or service retry. */
export async function openSdk105NativeApiCreditCommandSession(configuration) {
  if (arguments.length !== 1) fail();
  return openCommandSession(configuration, false);
}
export async function openSdk105NativeApiCreditProductCommandSession(configuration) {
  if (arguments.length !== 1) fail();
  return openCommandSession(configuration, true);
}
async function openCommandSession(configuration, product) {
  if (configuration === null || typeof configuration !== 'object' || types.isProxy(configuration)
      || Object.getPrototypeOf(configuration) !== Object.prototype) fail();
  const names = ['configuration', 'spendingFile', 'spending', 'input', 'output', 'limits', ...(product ? ['productProfileVersion', 'paymentRequiredHeader'] : [])];
  if (Reflect.ownKeys(configuration).length !== names.length) fail();
  const c = {};
  for (const name of names) { const d = Object.getOwnPropertyDescriptor(configuration, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); c[name] = d.value; }
  const selected = product ? captureSdk105ApiCreditProductSelection({ productProfileVersion: c.productProfileVersion, paymentRequiredHeader: c.paymentRequiredHeader,
    configuration: c.configuration, spendingFile: c.spendingFile, spending: c.spending })
    : captureSdk105ApiCreditSelection({ configuration: c.configuration, spendingFile: c.spendingFile, spending: c.spending });
  let entered = false;
  try {
    return await openBuyerApiCreditFundingOwnedStreamSession({ input: c.input, output: c.output, limits: c.limits,
      openWaitMs: selected.configuration.fundingOptions.deadlineMs,
      openClient: F(async function fixedNativeApiCreditBinding(requireCurrentOpening) {
        entered = true;
        try {
          requireCurrentOpening();
          const { openSdk105NativeApiCreditApplication, openSdk105NativeApiCreditProductApplication } = await import('./sdk105-native-api-credit-application.js');
          requireCurrentOpening();
          return product ? await openSdk105NativeApiCreditProductApplication(selected, requireCurrentOpening)
            : await openSdk105NativeApiCreditApplication(selected, requireCurrentOpening);
        } finally { selected.release(); }
      }) });
  } catch { fail(); }
  finally {
    // After entry, only the original opener releases trust copies when it
    // settles. An outer deadline does not release a pending consumer's bytes.
    if (!entered) selected.release();
  }
}
