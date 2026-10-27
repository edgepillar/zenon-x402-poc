import { types as utilTypes } from 'node:util';
import { openNativeOfficialV6FundingPostOriginalPaymentClient } from '../x402-native-v6-funding-post-client.js';
import { captureBuyerOriginalRecoverySelection, createBuyerOriginalRecoveryClient } from '../buyer-original-recovery-client.js';
import { captureBuyerCommandLineChannelConfiguration, createBuyerCommandLineChannel } from '../buyer-command-line-channel.js';
import { createBuyerOriginalRecoveryCommandSession } from '../buyer-original-funding-command-session.js';

const OPEN = openNativeOfficialV6FundingPostOriginalPaymentClient;
const F = Object.freeze, DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn;
const NativePromise = Promise, PROMISE = NativePromise.prototype, THEN = PROMISE.then, APPLY = Reflect.apply;
let failedAcquisition = null;

/** SOURCE ONLY, explicit retained-original entry. Opens the existing V6 store
 * through its real guarded owner. It may advance the local owner epoch; it is
 * not SQLite read-only. No new store, signer, KeyPair or funding POST transport.
 * The external selection is captured before acquisition, never learned from
 * stored state. Application I/O still requires an explicit service command. */
export async function openNativeOriginalRecoveryCommandSession(configuration) {
  if (arguments.length !== 1 || failedAcquisition !== null) fail();
  const c = fields(configuration, ['configuration', 'selection', 'input', 'output', 'limits']);
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
  const streams = captureBuyerCommandLineChannelConfiguration({ input: c.input, output: c.output, limits: c.limits });
  let native = null, client = null, channel = null;
  try {
    native = await OPEN(nativeConfiguration);
    client = createBuyerOriginalRecoveryClient({ client: native, selection: selected });
    channel = createBuyerCommandLineChannel(streams);
    return createBuyerOriginalRecoveryCommandSession({ client, channel, limits: streams.limits });
  } catch {
    if (native !== null) {
      const held = { native, client, channel, clientStop: null, channelStop: null };
      failedAcquisition = held;
      // Preserve actual owners and original stop promises independently. A
      // failed channel constructor retains its own partially acquired streams.
      try { held.clientStop = (client ?? native).close(); consume(held.clientStop); } catch {}
      if (channel !== null) {
        try { held.channelStop = channel.close(); consume(held.channelStop); } catch {}
      }
    }
    // Before OPEN returns, its existing guarded construction cleanup applies.
    // Unacquired streams remain caller-owned; no reopen, retry or force-close.
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
function consume(value) {
  if (utilTypes.isProxy(value) || !utilTypes.isPromise(value) || Object.getPrototypeOf(value) !== PROMISE) return;
  const d = DESC(value, 'constructor');
  if (d !== undefined && (!OWN(d, 'value') || d.value !== NativePromise)) return;
  try { APPLY(THEN, value, [() => {}, () => {}]); } catch {}
}
function fail() {
  const code = 'buyer_native_original_recovery_command_open_refused', error = new TypeError(code);
  Object.defineProperty(error, 'code', { value: code, enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: ' + code });
  throw F(error);
}
