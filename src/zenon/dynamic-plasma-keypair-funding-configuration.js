import { types as utilTypes } from 'node:util';
import { captureZenonDynamicPlasmaBoundedOriginalFundingConfiguration } from './dynamic-plasma-bounded-original-funding-configuration.js';

const CAPTURE = captureZenonDynamicPlasmaBoundedOriginalFundingConfiguration;
const F = Object.freeze, DESC = Object.getOwnPropertyDescriptor;
const PROTO = Object.getPrototypeOf, KEYS = Reflect.ownKeys, OWN = Object.hasOwn;
const PROXY = utilTypes.isProxy;
const FIELDS = F(['readOptions', 'materialOptions', 'materialWaitMs', 'keyPair',
  'expectedAddress', 'store', 'fundingResourceUrl', 'deadlineMs', 'fetchImpl']);

/**
 * Closed DATA selection for the explicit KeyPair funding connection. Reuse the
 * existing work/wait bounds, but name the borrowed key owner separately from a
 * WalletAdapter. The ONLY expected public bytes come from captured material
 * options. No method, signer, work producer, store or fetch is entered here.
 * This capture does not authenticate a payer or authorize preparation/signing.
 */
export function captureDynamicPlasmaKeyPairFundingConfiguration(configuration) {
  try {
    if (arguments.length !== 1 || configuration === null || typeof configuration !== 'object'
        || PROXY(configuration) || PROTO(configuration) !== Object.prototype
        || KEYS(configuration).length !== FIELDS.length) fail();
    const values = Object.create(null);
    for (const name of FIELDS) {
      const d = DESC(configuration, name);
      if (!d || !d.enumerable || !OWN(d, 'value')) fail();
      values[name] = d.value;
    }
    if (typeof values.expectedAddress !== 'string' || !/^[\x21-\x7e]{1,128}$/.test(values.expectedAddress)) fail();
    // The earlier capture checks a borrowed object handle, not wallet methods.
    // Do not expose that temporary field as an actual WalletAdapter.
    const selected = CAPTURE({ readOptions: values.readOptions, materialOptions: values.materialOptions,
      materialWaitMs: values.materialWaitMs, wallet: values.keyPair, store: values.store,
      fundingResourceUrl: values.fundingResourceUrl, deadlineMs: values.deadlineMs, fetchImpl: values.fetchImpl });
    return F({ readOptions: selected.readOptions, materialOptions: selected.materialOptions,
      materialWaitMs: selected.materialWaitMs, keyPair: selected.wallet,
      expectedAddress: values.expectedAddress, store: selected.store,
      fundingResourceUrl: selected.fundingResourceUrl, deadlineMs: selected.deadlineMs, fetchImpl: selected.fetchImpl });
  } catch { fail(); }
}
function fail() {
  const code = 'zenon_dynamic_plasma_keypair_funding_configuration_rejected', e = new TypeError(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code }); throw F(e);
}
