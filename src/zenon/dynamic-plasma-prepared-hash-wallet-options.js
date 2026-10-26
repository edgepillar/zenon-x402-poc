import { types as utilTypes } from 'node:util';
import { createPreparedHashWalletAdapter } from './wallet-adapter.js';

const WALLET = createPreparedHashWalletAdapter, F = Object.freeze;
const DESC = Object.getOwnPropertyDescriptor, PROTO = Object.getPrototypeOf;
const KEYS = Reflect.ownKeys, OWN = Object.hasOwn, PROXY = utilTypes.isProxy;
const FIELDS = F(['readOptions', 'materialExchange', 'materialWaitMs',
  'keyPair', 'expectedAddress', 'expectedPublicKey']);

/**
 * Construct the ACTUAL sign-only adapter and the exact options consumed by the
 * existing retained context-v7 DP candidate preparer. Preserve borrowed read
 * and material identities. Construction invokes no address/sign/read/material
 * callback and owns no private-key cleanup, SQL, transport or fallback path.
 * The actual consumer must still validate current reads, signature and custody.
 */
export function createDynamicPlasmaPreparedHashWalletOptions(configuration) {
  try {
    if (arguments.length !== 1 || configuration === null || typeof configuration !== 'object'
        || PROXY(configuration) || PROTO(configuration) !== Object.prototype
        || KEYS(configuration).length !== FIELDS.length) fail();
    const c = Object.create(null);
    for (const name of FIELDS) {
      const d = DESC(configuration, name);
      if (!d || !d.enumerable || !OWN(d, 'value')) fail();
      c[name] = d.value;
    }
    if (typeof c.readOptions !== 'object' || c.readOptions === null || PROXY(c.readOptions)
        || typeof c.materialExchange !== 'function' || PROXY(c.materialExchange)
        || !Number.isSafeInteger(c.materialWaitMs) || c.materialWaitMs < 1 || c.materialWaitMs > 60000) fail();
    const wallet = WALLET({ keyPair: c.keyPair, expectedAddress: c.expectedAddress, expectedPublicKey: c.expectedPublicKey });
    return F({ readOptions: c.readOptions, materialExchange: c.materialExchange,
      materialWaitMs: c.materialWaitMs, wallet });
  } catch { fail(); }
}
function fail() {
  const code = 'zenon_dynamic_plasma_prepared_hash_wallet_options_rejected', e = new TypeError(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code }); throw F(e);
}
