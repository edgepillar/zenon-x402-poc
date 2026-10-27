import { captureSdk105FundingServiceConfiguration } from './sdk105-funding-service-lifecycle.js';
import { captureSdk105LocalFundingServiceSelection } from './sdk105-local-funding-service-selection.js';
import { openBuyerFundingOwnedStreamSession } from '../buyer-funding-owned-stream-session.js';
import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';

const DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn, F = Object.freeze;
const APPLY = Reflect.apply, FILL = Buffer.prototype.fill;

/**
 * SOURCE ONLY opt-in host. Hardwire the real existing SDK105 funding/service
 * client and real Node command channel; no supplied SDK/store/client factories.
 * The existing KeyPair is transferred on successful SDK client acquisition.
 * The actual channel is owned before SDK module loading/native client opening;
 * its constructor retains/stops partial acquisition failures. The shared pure
 * entry preserves original opening/stop receipts and independently stops known
 * channel/client owners after refusal. It never clears an unreturned key.
 * No new mnemonic/key/KeyStore, automatic pins, implicit submission or retry.
 */
export async function openSdk105NativeFundingCommandSession(configuration) {
  if (arguments.length !== 1) fail();
  const c = capture(configuration);
  // Inert checks before native acquisition. The original closed client
  // configuration is still passed to the actual existing-key entry.
  const selected = captureSdk105FundingServiceConfiguration(c.configuration);
  try {
    return await openBuyerFundingOwnedStreamSession({ input: c.input, output: c.output, limits: c.limits,
      openWaitMs: selected.fundingOptions.deadlineMs,
      openClient: F(async function openCapturedNativeClient(requireCurrentOpening) {
        requireCurrentOpening();
        const { openSdk105NativeFundingServiceClient } = await import('./sdk105-native-funding-service-client.js');
        requireCurrentOpening();
        return openSdk105NativeFundingServiceClient(c.configuration);
      }) });
  } catch {
    // The shared entry stops only known returned client/channel owners. Before
    // the real client returns, its quarantine and caller key-cleanup contract
    // remain; no wrapper guesses ownership or clears an unreturned key.
    fail();
  }
}

/** Named SOURCE-ONLY local qualification with the SAME actual stream/session
 * ownership and opening deadline. No command may choose a module, constructor,
 * CA, key or execution authority. Capture before channel/key acquisition; check
 * the opening guard after the fixed SDK module import. A timed-out original
 * opener may still be pending: only that opener's finally releases its owned CA
 * after it settles. No competing unreturned-key stop or second opening. */
export async function openSdk105NativeFundingCommandSessionForLocalQualification(configuration, localReadOptions) {
  if (arguments.length !== 2) fail();
  const c = capture(configuration);
  let local = null, entered = false, released = false;
  function release() {
    if (local !== null && !released) { released = true; APPLY(FILL, local.localReadOptions.ca, [0]); }
  }
  try {
    local = captureSdk105LocalFundingServiceSelection(c.configuration, localReadOptions);
    return await openBuyerFundingOwnedStreamSession({ input: c.input, output: c.output, limits: c.limits,
      openWaitMs: local.configuration.fundingOptions.deadlineMs,
      openClient: F(async function openCapturedLocalNativeClient(requireCurrentOpening) {
        entered = true;
        try {
          requireCurrentOpening();
          const { openSdk105NativeFundingServiceClientForLocalQualification } = await import('./sdk105-native-funding-service-client.js');
          requireCurrentOpening();
          return await openSdk105NativeFundingServiceClientForLocalQualification(local.configuration, local.localReadOptions);
        } finally { release(); }
      }) });
  } catch { fail(); }
  finally {
    // Before opener entry, no asynchronous consumer can retain these bytes.
    // After entry, an outer timeout must leave release to the original opener.
    if (!entered) release();
  }
}
function capture(value) {
  const names = ['configuration', 'input', 'output', 'limits'];
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
  const code = 'buyer_sdk105_native_command_open_refused', error = new TypeError(code);
  Object.defineProperty(error, 'code', { value: code, enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: ' + code });
  throw F(error);
}
