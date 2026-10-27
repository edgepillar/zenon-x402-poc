import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import { validatePaymentRequiredForOfferSelection } from '../x402-wire.js';
import { runBuyerOriginalRecoveryPipeHost } from '../buyer-original-recovery-pipe-host.js';

const F = Object.freeze, DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn;
const VALIDATE = F(function validateChallenge(value) { validatePaymentRequiredForOfferSelection(value); });
const OPEN = F(async function openOriginalOnly(bootstrap) {
  // Reached only after canonical external bootstrap capture, with one already
  // owned channel. No arbitrary module path, SDK/store factory or signer.
  const { openNativeOfficialV6FundingPostOriginalPaymentClient } =
    await import('../x402-native-v6-funding-post-client.js');
  const { caPem, ...transport } = bootstrap.transportOptions;
  const ca = Buffer.from(caPem, 'ascii');
  try {
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
  return runBuyerOriginalRecoveryPipeHost({ ...selected, openNativeClient: OPEN });
}
function fail() { throw new TypeError('buyer_native_original_recovery_pipe_configuration_required'); }
