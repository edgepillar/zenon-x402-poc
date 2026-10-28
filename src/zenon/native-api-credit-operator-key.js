import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { createSdk105ApiCreditExistingKeyLease } from './sdk105-api-credit-existing-key-lease.js';

const F = Object.freeze, DESC = Object.getOwnPropertyDescriptor, APPLY = Reflect.apply, FILL = Buffer.prototype.fill;
const ARRAY_BUFFER = DESC(Object.getPrototypeOf(Uint8Array.prototype), 'buffer').get, FAILED = new Set();
let entered = false;
function fail() { throw new TypeError('API_CREDIT_OPERATOR_KEY'); }
function method(proto, name) {
  const d = DESC(proto, name); if (!d || !Object.hasOwn(d, 'value') || typeof d.value !== 'function' || types.isProxy(d.value)) fail(); return d.value;
}
/** Fixed SDK1.0.5 key constructor, entered only after the keyless product
 * profile and explicit channels pass admission. The exact 32 input bytes are
 * copied by that SDK constructor. No mnemonic derivation, random key, signer,
 * environment input, callback/module selector, SDK PREPARE or payment exists. */
export async function createNativeApiCreditOperatorKeyLease(bytes, expectedIdentity, requireOpening) {
  if (arguments.length !== 3 || entered || bytes === null || typeof bytes !== 'object' || types.isProxy(bytes) || !Buffer.isBuffer(bytes) || Object.getPrototypeOf(bytes) !== Buffer.prototype
      || bytes.length !== 32 || types.isSharedArrayBuffer(APPLY(ARRAY_BUFFER, bytes, []))
      || typeof requireOpening !== 'function' || types.isProxy(requireOpening) || !Object.isFrozen(requireOpening)
      || expectedIdentity === null || typeof expectedIdentity !== 'object' || types.isProxy(expectedIdentity) || !Object.isFrozen(expectedIdentity)
      || Reflect.ownKeys(expectedIdentity).length !== 2) fail();
  const address = DESC(expectedIdentity, 'expectedAddress'), publicKey = DESC(expectedIdentity, 'expectedPublicKey');
  if (!address || !publicKey || !Object.hasOwn(address, 'value') || !Object.hasOwn(publicKey, 'value')
      || typeof address.value !== 'string' || typeof publicKey.value !== 'string') fail();
  const frame = { constructorEntered: false, key: null, lease: null, clear: null, clearEntered: false, clearReturned: false };
  try {
    requireOpening();
    const sdk = await import('znn-typescript-sdk');
    requireOpening();
    if (typeof sdk.KeyPair !== 'function' || types.isProxy(sdk.KeyPair) || typeof sdk.Address !== 'function' || types.isProxy(sdk.Address)) fail();
    const getPublicKey = method(sdk.KeyPair.prototype, 'getPublicKey'), getAddress = method(sdk.KeyPair.prototype, 'getAddress');
    frame.clear = method(sdk.KeyPair.prototype, 'clear'); const addressText = method(sdk.Address.prototype, 'toString');
    requireOpening(); entered = true; frame.constructorEntered = true;
    frame.key = Reflect.construct(sdk.KeyPair, [bytes]);
    const actualPublicKey = APPLY(getPublicKey, frame.key, []), actualAddress = APPLY(getAddress, frame.key, []);
    if (actualPublicKey === null || typeof actualPublicKey !== 'object' || types.isProxy(actualPublicKey)
        || (Object.getPrototypeOf(actualPublicKey) !== Buffer.prototype && Object.getPrototypeOf(actualPublicKey) !== Uint8Array.prototype)
        || actualPublicKey.length !== 32 || actualAddress === null || typeof actualAddress !== 'object'
        || types.isProxy(actualAddress) || Object.getPrototypeOf(actualAddress) !== sdk.Address.prototype
        || APPLY(addressText, actualAddress, []) !== address.value) fail();
    const publicCopy = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) { const d = DESC(actualPublicKey, String(i)); if (!d || !Object.hasOwn(d, 'value') || !Number.isInteger(d.value) || d.value < 0 || d.value > 255) fail(); publicCopy[i] = d.value; }
    if (publicCopy.toString('base64') !== publicKey.value) fail();
    // Return every actually acquired key owner even if the synchronous work
    // crossed the observation budget. The coordinator stops that late lease;
    // throwing after transfer would conceal the only known key owner.
    frame.lease = createSdk105ApiCreditExistingKeyLease(frame.key); frame.key = null;
    return frame.lease;
  } catch {
    if (frame.key !== null && frame.clear !== null && !frame.clearEntered) {
      frame.clearEntered = true;
      try { frame.clearReturned = APPLY(frame.clear, frame.key, []) === undefined; } catch {}
    }
    if (frame.constructorEntered) FAILED.add(frame);
    fail();
  } finally { APPLY(FILL, bytes, [0]); }
}
