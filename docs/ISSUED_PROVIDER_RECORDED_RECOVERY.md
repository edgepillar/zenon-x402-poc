# Explicit provider recovery from original recorded outcomes

The source entry `restoreIssuedFundingGrantNativeApplication` selects existing
original history on the same funding/service/original-grant routes. It does not
construct an intake, SDK server, observer or pending continuation. The existing
fresh factory retains its BOUND startup refusal. Native execution is unqualified.

The recovery entry takes the existing `funding`, `service` and `transport`
configuration plus `recovery`: exactly `boundRowDigest` and
`outcomeRecordDigest`, both independently selected `sha256:` values. The former
uses the domain `zenon-x402:issued-provider-bound-row:v1` followed by a zero byte
and canonical `{issue,binding,status}` JSON; the latter uses the existing
official-outcome custody digest contract. Row bytes, framing, service selection,
original transaction, publication and fixed observation policy must agree.
Digest generation produces a pin candidate, not authentication or authority.
Do not obtain independent trust by copying a digest from the same untrusted row.

The caller supplies the already opened, explicit official-custody intake store
and service store. The native binding captures the actual prototype readers and
passes only history reads to the restored backend. It captures no custody CAS,
issuer, SDK, continuation or borrowed-store close capability. The complete BOUND
row is checked before and after each outcome read. Both digests are fixed for
the root's lifetime. Changed, missing, opaque or asynchronous replies retain
HELD state, without a replacement opening or late repair. The controller checks
the same history before HTTP processing and around committed-grant admission.

| Stored state | Restored behavior |
| --- | --- |
| `SETTLED` | Replay the exact original outcome. Service still requires a separate local admission of the actual matching ACTIVE grant. |
| `PENDING` | Replay recorded BOUND history; keep its consumed observation count. No continuation is recreated or resumed. |
| `EXHAUSTED` | Replay recorded history without renewing its budget. Service admission remains unavailable. |
| `FIRST_IN_FLIGHT` | Return 503 for the original funding operation; do not manufacture an outcome or enter SDK again. |
| `OBSERVATION_IN_FLIGHT` | Return 503; do not publish the older pending outcome as the completed observation or renew the reserved count. |
| Missing or mismatched original records | Refuse startup. No fresh-funding fallback. |

An unpaid funding request returns 503 in this mode; it cannot solicit a new
payment through a reissued challenge. A paid replay must carry the exact retained
header. HTTP history carries the original 202 BOUND contract without an x402
payment-response header. BOUND is still distinct from settlement and delivery.
The original-grant route retains its existing proof and history-only contract.

No historical result creates or activates a grant. After explicit operator
admission, the existing binding checks the actual grant ID, transaction, holder,
capability, offer, payment digests, chain profile and terms before opening the
existing scoped service session. Existing ledger state supplies consumed,
available, held and exact-request records; it is not reconstructed from a funding
receipt or reset on opening. Unknown executions retain their reserved units.

Logical backend close revokes history use and never closes borrowed SQL stores.
The actual ingress remains responsible for server, sockets, timers and handlers.
This point-in-time history comparison is not atomic cross-process owner fencing.

## Acceptance that remains open

DATA checks compose the actual pure backend, controller, binding and in-memory
ledger with declared store/session/writer/listener/verifier ports. A second
controller and reconstructed model state are not a fresh native process. The
100-request model scenario is not G1 native acceptance or a performance claim.
Synthetic activation metadata and existing signature-shaped fields are not
authenticated funding or proof.

Actual SQL/core/HTTPS, owner handover, stale workers, interruption cutpoints,
Linux, physical release and G1's complete native product remain OPEN. SDK-free
restore is implemented in source; native restart is not verified. Missing
post-BOUND intent, independently obtaining pins after a lost result, and explicit
resolution of in-flight/pending outcomes remain recovery work. This entry does
not silently add a new observation or settlement policy. The approved hosted
108-control profile and 22 inputs remain unchanged and separate. G0-G5 stay OPEN.
