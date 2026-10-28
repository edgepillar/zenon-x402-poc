# API-credit application roadmap

Adopted 28 October 2026. The product is one application funded once with Zenon,
making many metered API calls and recovering the same payment and original
request after interruption. Process and consolidation support product acceptance;
repository cleanup and additional feature families do not precede it.

Baseline: [db91359c](https://github.com/edgepillar/zenon-x402-poc/commit/db91359ce77a354ec463daf6adf4b4b7b999c3d6),
with the [108-control CI run](https://github.com/edgepillar/zenon-x402-poc/actions/runs/40740949739).
The paired funding/liability application is implemented and DATA tested. It does
not establish native two-store product acceptance. See [current status](../STATUS.md)
and the [preserved evidence inventory](../qualification/acceptance/api-credit-v1.evidence.json).
Earlier dated roadmaps and results remain immutable historical evidence.

## First product

One provider, one API product and fixed offer; one explicit network/rule profile
and asset; one funding, one grant and many metered calls. Exact replay and recovery
use durable original records. Spending, resource and uncertainty bounds are
explicit. Acceptance requires one documented application entry command. The
existing `/paid` route may remain a basic payment control. BTC checkout, resource
rental and a general service marketplace do not enter this slice.

## Gates

| Gate | Delivery and acceptance |
| --- | --- |
| G0 / P0 | Pin one supported application/source, dependency, runtime and data profile; list differences from retained evidence; require current PR checks; make failure classification reproducible. Current supported regressions must have zero failures and unexpected skips/cancellations. A product defect cannot be excluded merely by calling it historical. |
| G1 / P1 | One documented entry runs funding -> one grant -> metered calls -> result/replay. Real SDK/core/SQLite/HTTPS composition processes 100 distinct request IDs with exact debit/execution counts and replay without a second economic operation. Linux setup/run is verified. |
| G1 contract | Immutable terms, separate funding/delivery/compensation, surviving late-payment liability and fail-closed spending limits withstand concurrency and restart. Payment acceptance is not delivery success. |
| G2 / P2 | Selected interruption cutpoints, funding ACK loss, fresh-process reopen, signer-response loss, stale workers, late close and native resource ownership preserve original bytes/hash and deny second authority. Observe release or controlled HELD. |
| G3a, before network runs | Accept the running binary, genesis, active rules, exact payment identity and observation policy. Stale/reset/conflicting observations cannot produce grant or delivery authority. |
| G3b, DP profile only | Positive work and quote age/price/frontier changes are tested on the selected runtime within resource/work limits. Revalidate before signing; reconcile only the original after signing. |
| G4 / P3 | Bounded testnet pilot with a real API, outside buyer, operator procedures, accepted required G1-G3 gates, bounded-load correctness and independent review. |
| G5 / P4 | Separate mainnet decision, low economic limits, accepted funding/provider authority, key custody and release profile, followed by operational/economic GO or NO-GO. |

G0 is not an attempt to make every historical recipe pass in one command.
Maintain three lanes: current required regression, pinned native integration and
immutable historical qualification. Classify failures as product behavior,
harness mismatch, platform difference or historical prerequisite, and compare
product-relevant failures against the target profile before closing them.
PRs identify acceptance IDs, validation scope and risk. Small changes are preferred;
line count does not require artificial splitting of a coherent safety change.

## G1 deterministic acceptance

After one funding, observe exactly one grant. Run 100 distinct request IDs and
check total consumption. Exact original replay does not add a debit/execution.
Reject foreign grants, changed offers and different payment identities. Preserve
spent and remaining units across reopen. Test concurrent requests and different
users as separate cases. One hundred calls is a deterministic correctness case,
not a throughput or sustained-capacity claim.

Include a per-payment ceiling, durable total/daily budget, recipient/network/asset
allowlists and missing-configuration refusal. Pending and UNKNOWN operations keep
budget reservations. Counting successful payments alone is insufficient: parallel
workers and restart must not overspend.

Keep funding->grant and per-request debit->execution within their appropriate local
transaction boundaries. External chain observations and service effects stay
outside transaction callbacks. Choose one or two databases according to ownership
and consistency; a single file does not make a remote effect or lost ACK atomic.
The paired application's partial commits belong in acceptance. Reuse existing
custody/ledger components; do not open a generic multi-payment refactor.

## G2 critical acceptance IDs

| ID | Required observation |
| --- | --- |
| RL-FUNDING-ACK | Recover the same payment and obligation after funding binds but its response is lost. |
| RL-SERVICE-COMMIT | A committed service with a lost response does not debit or execute twice. |
| RL-EXACT-REPLAY | The original request finds its exact recorded result without a new economic operation. |
| RL-REOPEN | A new process opens the same records; historical success grants no new dispatch authority. |
| RL-LATE-CLOSE | Late success/error cannot repair UNKNOWN or bypass ownership. |
| SIGNER-RESPONSE-LOSS | Recover the same durable signed bytes/hash, or keep the account uncertain. |
| OWNER-FENCING | A still-live old worker cannot acquire second economic authority through a handoff. |
| NATIVE-RELEASE | Observe physical release; otherwise retain a bounded, controlled HELD state. |

Linux process-interruption checks use identified commit cutpoints, not arbitrary
sleeps before killing a process. Process death is not hardware power-loss proof.
Classify every UNKNOWN; preserve the original transaction and liability. Resolve
with evidence when possible, otherwise keep bounded HELD. Excess uncertainty age
causes escalation or refusal of new work, not forced closure.

## Trust and Dynamic Plasma

G3a separates RPC agreement, SPV inclusion, state authentication and finality.
Three nodes reporting the same hash is a useful comparison, not independent
canonicality proof. Begin the x402 SPV consumer with the existing inclusion API
and explicitly accepted trust inputs.

G3b covers quote age, positive PoW, price/frontier changes and work/resource
exhaustion together. A `momentumAcknowledged` age policy may bound admission but
does not prove chain-level cancellation. A first non-DP product profile does not
wait for mainnet DP activation or all DP work.

## Pilot, parallel work and consolidation

Keep one provider/offer and a measured real API for the bounded testnet window.
Measure funding, API call and native delivery latency separately; record UNKNOWN
count/age, support effort and cost. Exercise stop, recovery, key rotation and
compensation. Close critical/high economic-safety findings and state remaining
risk decisions. The proposed November-December integration and January-February
testnet windows are planning targets, not gates. February is not an automatic
mainnet date.

Keep a short README and one current STATUS; index rather than erase dated
evidence. Merge codecs only with equivalent byte/rejection contracts. Simplify
intrinsics only with ownership/reentry analysis and retained negative tests.
Never delete branch/file/version families by name or count. Dependency changes
are targeted and major compatibility is separately verified. Freeze capacity
micro-optimizations that do not block the product.

The x402 Zenon mechanism/spec draft and SDK #31 compatibility work are parallel
milestones; release alone is not signer acceptance. SPV follows the trust profile.
BTC development is deferred until demand and operator selection; bounded B0
research freezes if it divides the core owner. A native attestor is considered
only if the selected pilot needs its key/authority model. PTLC, ZVM, StateRoot and
a BTC bridge are not first-product prerequisites. Issue #173 remains out of scope.

The next package combines G0 with missing G1/G2 acceptance: fix the candidate
profile, establish PR/required CI controls, and close funding ACK loss,
fresh-process reopen, late-close and native ownership gaps. Additional features
do not take priority. Existing payment, signing, test, publication and cleanup
permissions remain separate; this roadmap does not authorize a live pilot.
