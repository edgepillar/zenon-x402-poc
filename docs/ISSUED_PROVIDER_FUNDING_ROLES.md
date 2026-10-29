# Issued-provider funding roles

Source candidate for the one-funding, one-grant API-credit provider. Native
execution is disabled by the current user instruction. This package supplies
the missing fixed facilitator/pending-observer role assembly; it is not a
completed Linux provider command or G1/G2 acceptance.

`createIssuedProviderNativeFundingRoles` accepts an actual, explicitly configured
borrowed `SettlementJournal` constructed explicitly with `existingOnly: true`, one upfront requirement and service selection, an explicit existing
operator-trusted testnet selection/RPC/timeout and a 0..16 pending budget. It
constructs the real `ExactZenonFacilitator` and returns `official` for the existing
owned provider's `funding.official` configuration. Its `validateChallenge` is a
void-returning strict local validator. The original journal must already be initialized: a missing file/marker refuses
without creating an empty replacement. The existing-only setting constrains
acquisition; the real first settlement can still append its normal original
record to the admitted journal. No arbitrary verifier, settlement callback,
module path, implicit environment or mock facilitator is selected by this entry.

The first verifier/settlement entry retains the existing facilitator's real
operational authority. The separate pending callback captures the selected
payload, requirement and challenge and reads only the same original journal
entry through its captured actual prototype method. It never calls `settle` or
`runReconciliationMaintenance`, creates a fresh RPC observer, publishes, signs,
writes custody or activates a grant. That distinction matters because general
maintenance can enter original publication paths.

Before the first read, the callback derives the existing authorization key from
the exact original resource, payment intent, chain profile and transaction hash.
It compares all eight original journal fields, including the complete signed
account block. Missing/tombstoned/unknown records, changed delivery state, a
cached service response, foreign context or unsafe callback result cannot
produce settlement success. A submission ACK or inclusion below the original
threshold remains PENDING. The shared existing recovery projection normalizes
included history; current canonicality remains NOT_ESTABLISHED. Native consumers
must not mistake that history for provider attestation, grant activation,
delivery proof, restored authority or a reason to repeat a payment.

One observer binds one tuple and consumes at most the original 0..16 local read
entries. Concurrent entry is refused. A failed/opaque read consumes its entry and
keeps HELD; closing during a read fences the late result. There is no retry,
rebind, budget reset, cleanup or automatic restart. The adapter borrows its
journal and its close method only retires this observer; it never closes the
journal or asserts physical release. The embedding owner must close the same
provider first, then this observer, before retiring its actual journal owner.

Only the repository's existing explicit historical/current/DP testnet policy
selectors are admitted, with their original acknowledgements and matching
requirement chain profile. DP selectors additionally retain their exact event
and endpoint selection. The reset-epoch facilitator additionally receives the
selected original holder as its explicit expected payer. Remote plaintext RPC, credentials, URL aliases and
missing settings are refused. Operator trust does not authenticate a running
network, binary, genesis, active rules, canonicality or finality. G3a and any
applicable DP G3b acceptance remain separate and OPEN.

Journal-only pending can remain pending or exhaust when no separately admitted
authenticated observer advances the original journal. This implementation does
not disguise that gap as successful fresh chain observation.

The remaining command work is bounded public bootstrap/credential/control
channel admission, explicit actual journal acquisition/ownership and binding
these roles to the existing owned provider. There is no documented executable
provider command yet. The complete current SDK/core/SQLite/HTTPS graph, Linux
startup, 100 real metered calls/exact replay, persisted reopen and physical
release remain unexecuted. Current proof is pure DATA with declared memory
readers/facilitators, plus a parser-only native adapter check. Existing successful
native records retain their original source/runtime scope.
