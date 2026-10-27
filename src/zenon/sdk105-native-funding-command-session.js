import { captureSdk105FundingServiceConfiguration } from './sdk105-funding-service-lifecycle.js';
import { openBuyerFundingOwnedStreamSession } from '../buyer-funding-owned-stream-session.js';
import { types as utilTypes } from 'node:util';

const DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn, F = Object.freeze;

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
  captureSdk105FundingServiceConfiguration(c.configuration);
  try {
    return await openBuyerFundingOwnedStreamSession({ input: c.input, output: c.output, limits: c.limits,
      openClient: F(async function openCapturedNativeClient() {
        const { openSdk105NativeFundingServiceClient } = await import('./sdk105-native-funding-service-client.js');
        return openSdk105NativeFundingServiceClient(c.configuration);
      }) });
  } catch {
    // The shared entry stops only known returned client/channel owners. Before
    // the real client returns, its quarantine and caller key-cleanup contract
    // remain; no wrapper guesses ownership or clears an unreturned key.
    fail();
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
