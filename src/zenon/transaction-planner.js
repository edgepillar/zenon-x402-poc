/**
 * Central Zenon payment-planning boundary.
 *
 * A planner consumes a payment intent, ChainProfile, payer address, and
 * PlasmaStrategy and returns a fully prepared unsigned AccountBlock. It must
 * not receive a WalletAdapter or private key, sign or publish the block, or
 * construct the surrounding x402 PaymentPayload.
 */
export class ZenonTransactionPlanner {
  async prepareUnsigned(_context) {
    return notImplemented('ZenonTransactionPlanner', 'prepareUnsigned()');
  }
}

export function assertZenonTransactionPlanner(value) {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    throw new TypeError('ZenonTransactionPlanner must be an object');
  }
  if (typeof value.prepareUnsigned !== 'function') {
    throw new TypeError('ZenonTransactionPlanner.prepareUnsigned() must be implemented');
  }
  return value;
}

function notImplemented(contract, method) {
  throw new TypeError(`${contract}.${method} must be implemented`);
}
