import { types } from 'node:util';

export const API_CREDIT_PUBLIC_PROFILE_REFUSAL_STDERR = 'API_CREDIT_OPERATOR_PUBLIC_PROFILE_REFUSED\n';
const IS_PROXY=types.isProxy, PROTO=Object.getPrototypeOf, IS_FROZEN=Object.isFrozen;
const DESC=Object.getOwnPropertyDescriptor, OWN=Object.hasOwn, PLAIN=Object.prototype;
const EXPECTED = Object.freeze({ apiCreditOperatorCliVersion: 1, status: 'BOOTSTRAP_REFUSED', exitCode: 1, stage: 'PROFILE',
  publicProfileAdmission: 'REFUSED', credentialReadEntered: false, keyCreationEntered: false,
  sessionOpeningEntered: false, sessionAccepted: false, knownStopsObserved: true, keyLease: null,
  historicalObservation: true, keyErasure: 'NOT_ESTABLISHED', nativeResourceRelease: 'NOT_ESTABLISHED',
  serviceDelivery: 'NOT_ESTABLISHED', automaticRetry: false, authority: 'NONE' });
const CHECKS=Object.freeze(Object.entries(EXPECTED).map(pair=>Object.freeze(pair))), COUNT=CHECKS.length;

/** Classify the fixed coordinator's frozen, sanitized result for the CLI.
 * This is DATA, not authenticity, physical release, payment or retry authority.
 * A decoder refusal is distinct from failed/expired profile I/O, credential EOF
 * and later unknown owners. Those keep their existing generic diagnostics.
 * No property getter, proxy hook, private input or owner method is entered. */
export function isApiCreditPublicProfileRefusal(value) {
  if (arguments.length !== 1) return false;
  try {
    if (value === null || typeof value !== 'object' || IS_PROXY(value)
        || PROTO(value) !== PLAIN || !IS_FROZEN(value)) return false;
    for (let i=0;i<COUNT;i++) {
      const name=CHECKS[i][0],expected=CHECKS[i][1],d=DESC(value,name);
      if (!d?.enumerable || !OWN(d, 'value') || d.value !== expected) return false;
    }
    return true;
  } catch { return false; }
}
