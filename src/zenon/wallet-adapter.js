/**
 * Signing boundary for a payer wallet. A wallet does not plan, prepare,
 * enrich, publish, or perform node RPC for an account block.
 *
 * sign() accepts a fully prepared unsigned AccountBlock and returns a signed
 * AccountBlock without mutating the input or changing hash-covered fields.
 */
export class WalletAdapter {
  async getAddress() {
    return notImplemented('WalletAdapter', 'getAddress()');
  }

  async sign(_accountBlock) {
    return notImplemented('WalletAdapter', 'sign()');
  }
}

export function assertWalletAdapter(value) {
  return assertMethods(value, 'WalletAdapter', ['getAddress', 'sign']);
}

function assertMethods(value, contract, methods) {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    throw new TypeError(`${contract} must be an object`);
  }
  for (const method of methods) {
    if (typeof value[method] !== 'function') {
      throw new TypeError(`${contract}.${method}() must be implemented`);
    }
  }
  return value;
}

function notImplemented(contract, method) {
  throw new TypeError(`${contract}.${method} must be implemented`);
}
