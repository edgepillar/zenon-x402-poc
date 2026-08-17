import { validateZenonChainProfile } from '../x402-wire.js';

/**
 * Immutable internal representation of the existing Zenon chain-profile
 * wire object. Instances are converted back to plain data before crossing a
 * JSON, journal, RPC, or authenticator boundary.
 */
export class ChainProfile {
  #version;
  #chainIdentifier;
  #genesisMomentumHash;

  constructor(value) {
    validateZenonChainProfile(value);
    this.#version = value.version;
    this.#chainIdentifier = value.chainIdentifier;
    this.#genesisMomentumHash = value.genesisMomentumHash;
    Object.freeze(this);
  }

  static fromWire(value) {
    return new ChainProfile(value);
  }

  get version() {
    return this.#version;
  }

  get chainIdentifier() {
    return this.#chainIdentifier;
  }

  get genesisMomentumHash() {
    return this.#genesisMomentumHash;
  }

  toWire() {
    return {
      version: this.#version,
      chainIdentifier: this.#chainIdentifier,
      genesisMomentumHash: this.#genesisMomentumHash,
    };
  }

  equals(other) {
    let candidate;
    try {
      candidate = other instanceof ChainProfile ? other : ChainProfile.fromWire(other);
    } catch {
      return false;
    }
    return this.#version === candidate.#version &&
      this.#chainIdentifier === candidate.#chainIdentifier &&
      this.#genesisMomentumHash === candidate.#genesisMomentumHash;
  }
}
