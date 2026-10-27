import { openSdk105NativeFundingServiceClient } from './sdk105-native-funding-service-client.js';
import { captureSdk105FundingServiceConfiguration } from './sdk105-funding-service-lifecycle.js';
import {
  captureBuyerCommandLineChannelConfiguration, createBuyerCommandLineChannel,
} from '../buyer-command-line-channel.js';
import { createBuyerOriginalFundingCommandSession } from '../buyer-original-funding-command-session.js';
import { types as utilTypes } from 'node:util';

const OPEN = openSdk105NativeFundingServiceClient, CHANNEL = createBuyerCommandLineChannel;
const SESSION = createBuyerOriginalFundingCommandSession, APPLY = Reflect.apply;
const NativePromise = Promise, PROMISE = NativePromise.prototype, THEN = PROMISE.then;
const DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn, F = Object.freeze;
let failedAcquisition = null;

/**
 * SOURCE ONLY opt-in host. Hardwire the real existing SDK105 funding/service
 * client and real Node command channel; no supplied SDK/store/client factories.
 * The existing KeyPair is transferred on successful SDK client acquisition.
 * Stream transfer starts only when the validated channel begins construction;
 * that constructor privately retains/stops partial acquisition failures.
 * No new mnemonic/key/KeyStore, automatic pins, implicit submission or retry.
 */
export async function openSdk105NativeFundingCommandSession(configuration) {
  if (arguments.length !== 1 || failedAcquisition !== null) fail();
  const c = capture(configuration);
  // Inert checks before native acquisition. The original closed client
  // configuration is still passed to the actual existing-key entry.
  captureSdk105FundingServiceConfiguration(c.configuration);
  const selected = captureBuyerCommandLineChannelConfiguration({ input: c.input, output: c.output, limits: c.limits });
  let client = null, channel = null;
  try {
    client = await OPEN(c.configuration);
    channel = CHANNEL(selected);
    return SESSION({ client, channel, limits: selected.limits });
  } catch {
    if (client !== null) {
      const held = { client, channel, clientStop: null, channelStop: null };
      failedAcquisition = held;
      // Retain actual owners/stop receipts. A synchronous failure on one leg
      // cannot suppress the other stop or reset the acquisition hold.
      try { held.clientStop = client.close(); consume(held.clientStop); } catch {}
      if (channel !== null) {
        try { held.channelStop = channel.close(); consume(held.channelStop); } catch {}
      }
    }
    // Before OPEN returns, its existing close/quarantine rules and caller key
    // cleanup duty remain. Unacquired streams remain the caller's resources.
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
function consume(value) {
  if (utilTypes.isProxy(value) || !utilTypes.isPromise(value) || Object.getPrototypeOf(value) !== PROMISE) return;
  const d = DESC(value, 'constructor');
  if (d !== undefined && (!OWN(d, 'value') || d.value !== NativePromise)) return;
  try { APPLY(THEN, value, [() => {}, () => {}]); } catch {}
}
function fail() {
  const code = 'buyer_sdk105_native_command_open_refused', error = new TypeError(code);
  Object.defineProperty(error, 'code', { value: code, enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: ' + code });
  throw F(error);
}
