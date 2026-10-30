// SOURCE ONLY; no default argv/stdio or secret-loading behavior is changed.
import { types } from 'node:util';
import { captureSdk105ApiCreditSelection } from './sdk105-api-credit-selection.js';
import { captureSdk105ApiCreditProductSelection, assertSdk105ApiCreditProductSelection } from './sdk105-api-credit-product-profile.js';
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
/** Fixed operator entry for a previously admitted product/key selection.
 * This does not consume the selection; the actual native application does.
 * Once this function is entered, stream setup failures retain the original
 * owner/quarantine. Its caller must not compete with raw or stream stops. */
export async function openSdk105NativeApiCreditProductSelectionCommandSession(configuration, requireOperatorOpening) {
  if (arguments.length !== 2 || typeof requireOperatorOpening !== 'function' || types.isProxy(requireOperatorOpening)
      || !Object.isFrozen(requireOperatorOpening)) fail();
  const c = fields(configuration, ['selection', 'input', 'output', 'limits']);
  const selected = assertSdk105ApiCreditProductSelection(c.selection);
  return openSelectedSession(c, selected, true, requireOperatorOpening);
}
async function openCommandSession(configuration, product) {
  if (configuration === null || typeof configuration !== 'object' || types.isProxy(configuration)
      || Object.getPrototypeOf(configuration) !== Object.prototype) fail();
  const names = ['configuration', 'spendingFile', 'spending', 'input', 'output', 'limits', ...(product ? ['productProfileVersion', 'paymentRequiredHeader', 'purchaseExpectationJson'] : [])];
  if (Reflect.ownKeys(configuration).length !== names.length) fail();
  const c = {};
  for (const name of names) { const d = Object.getOwnPropertyDescriptor(configuration, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); c[name] = d.value; }
  const selected = product ? captureSdk105ApiCreditProductSelection({ productProfileVersion: c.productProfileVersion, paymentRequiredHeader: c.paymentRequiredHeader, purchaseExpectationJson: c.purchaseExpectationJson,
    configuration: c.configuration, spendingFile: c.spendingFile, spending: c.spending })
    : captureSdk105ApiCreditSelection({ configuration: c.configuration, spendingFile: c.spendingFile, spending: c.spending });
  return openSelectedSession(c, selected, product, null);
}
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {};
  for (const name of names) { const d = Object.getOwnPropertyDescriptor(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); out[name] = d.value; }
  return out;
}
async function openSelectedSession(c, selected, product, requireOperatorOpening) {
  let entered = false;
  try {
    if (requireOperatorOpening !== null) requireOperatorOpening();
    return await openBuyerApiCreditFundingOwnedStreamSession({ input: c.input, output: c.output, limits: c.limits,
      openWaitMs: selected.configuration.fundingOptions.deadlineMs,
      openClient: F(async function fixedNativeApiCreditBinding(requireCurrentOpening) {
        entered = true;
        try {
          const guard = F(function requireCurrentProductOpening() {
            if (arguments.length !== 0) fail();
            requireCurrentOpening();
            if (requireOperatorOpening !== null) requireOperatorOpening();
          });
          guard();
          const { openSdk105NativeApiCreditApplication, openSdk105NativeApiCreditProductApplication } = await import('./sdk105-native-api-credit-application.js');
          guard();
          return product ? await openSdk105NativeApiCreditProductApplication(selected, guard)
            : await openSdk105NativeApiCreditApplication(selected, guard);
        } finally { selected.release(); }
      }) });
  } catch { fail(); }
  finally {
    // After entry, only the original opener releases trust copies when it
    // settles. An outer deadline does not release a pending consumer's bytes.
    if (!entered) selected.release();
  }
}
