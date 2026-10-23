const FREEZE = Object.freeze, DEFINE = Object.defineProperty;
const HAS = Object.hasOwn, CREATE = Object.create;
const ErrorType = TypeError;
const profiles = FREEZE({
  dynamic_plasma: FREEZE({ name: 'dynamic_plasma', policyVersion: 1, maximumRequests: 13,
    cycles: null, maximumRequestsPerCycle: null, maximumSporkPages: null }),
  zenon_funding: FREEZE({ name: 'zenon_funding', policyVersion: 1, maximumRequests: 13,
    cycles: null, maximumRequestsPerCycle: null, maximumSporkPages: null }),
  dynamic_plasma_retained_candidate: FREEZE({ name: 'dynamic_plasma_retained_candidate', policyVersion: 2,
    maximumRequests: 78, cycles: 6, maximumRequestsPerCycle: 13, maximumSporkPages: 8 }),
  zenon_account_state_retained_candidate: FREEZE({ name: 'zenon_account_state_retained_candidate', policyVersion: 2,
    maximumRequests: 18, cycles: 6, maximumRequestsPerCycle: 3, maximumSporkPages: null }),
});

/** Closed SOURCE-selected budgets, not a user-supplied limit or authority. */
export function selectBoundedJsonRpcReadAdmissionProfile(name) {
  if (arguments.length !== 1 || typeof name !== 'string'
      || !HAS(profiles, name)) reject();
  return profiles[name];
}

/**
 * The actual HTTPS core owns exactly one counter. No reset/renewal exists.
 * Legacy owners keep thirteen. A retained candidate's six DP cycles need
 * 6 * (five fixed reads + up to eight spork pages) = 78 per endpoint; its
 * account bracket needs 6 * (frontier/info/frontier) = 18. Counts do not grant
 * network, signing, retry or replacement authority, or prove time/cleanup.
 */
export function createBoundedJsonRpcReadAdmission(name) {
  if (arguments.length !== 1) reject();
  const profile = selectBoundedJsonRpcReadAdmissionProfile(name);
  let consumed = 0;
  return FREEZE({ profile,
    available: FREEZE(function available() { return arguments.length === 0 && consumed < profile.maximumRequests; }),
    claim: FREEZE(function claim() {
      if (arguments.length !== 0 || consumed >= profile.maximumRequests) return false;
      consumed += 1; return true;
    }),
    snapshot: FREEZE(function snapshot() {
      if (arguments.length !== 0) reject();
      return FREEZE({ consumed, remaining: profile.maximumRequests - consumed,
        maximumRequests: profile.maximumRequests });
    }),
  });
}
function reject() {
  const code = 'bounded_json_rpc_read_admission_profile_rejected', error = new ErrorType(code);
  const d = CREATE(null); d.value = code; d.enumerable = true; DEFINE(error, 'code', d);
  const stack = CREATE(null); stack.value = 'TypeError: ' + code;
  DEFINE(error, 'stack', stack); throw FREEZE(error);
}
