# Capacity payer-lane protocol

The [protocol](../qualification/capacity-native-payer-lane.protocol.js) has 43
passing selected local DATA controls on Node 24.19.0, darwin/arm64. This main
batch contains the pure protocol, its direct tests and exact-source evidence.
It does not contain or qualify the separate native payer-lane owner draft.

## Bounded original selection

One lane follows opening, preparation, commit, submission, grant/service binding
and explicit service execution in that order. A private identity-bound ticket
reserves an operation before any caller can dispatch work. There is at most one
active operation; another lane's ticket, clones and repeated completions cannot
free it. This is DATA sequencing, not a native ownership or authority brand.

Warmup originals precede measurement originals with exact, non-reusable ordinals.
Zero warmup is permitted. The combined plan must be at most 256 calls, matching
the actual native client transport maximum, rather than silently truncating it.
All service originals are captured before dispatch: one selected grant, unique
request IDs, the exact existing empty-body/two-unit profile, canonical request
bytes, explicit loopback route and immutable authorization-header DATA. Aggregate
capture is bounded. Shape validation does not authenticate a proof or signature.
The actual client/backend must still perform their real authentication and custody.

UNKNOWN permanently holds a lane without retry, re-signing, replacement, new
funding or ordinal reset. Close is separately cached, can overlap an already
entered operation and never discards that operation's accounting. A returned
close fact cannot erase earlier or later uncertainty. Neither HELD nor CLOSED in
this pure protocol proves the state of a physical handle.

## Actual evidence and its limits

The [controls](../qualification/capacity-native-payer-lane.protocol.behavior.mjs)
directly import the real protocol: 43 pass, zero failures, cancellations, skips
or TODO. Three cross-contract controls also call the genuine existing custody
capture, validation, serialization and parsing functions on the unchanged bytes.
The [current result](../qualification/capacity-native-payer-lane.protocol-v2.actual-local-result.json)
records exact source hashes, expected case names, actual exits and complete
stream digests. The earlier 40-control record is preserved as historical evidence,
not current qualification: its self-consistent fixture omitted the required
`sha256:` body-digest prefix. The protocol and fixture now use the real contract's
prefixed digest; both the real custody contract and protocol reject the old bare
hex and a wrong prefixed digest. The current controls perform metadata checksum
hashing, not key generation, signing or cryptographic proof verification.
A single direct Node command uses the Node Permission Model
without source writes, child/worker permission or package installation; that is
not an OS/network sandbox claim. It imports no native owner or SDK, opens no
SQLite/socket, generates no keys/signatures and performs no nonce search. There
are no qualification scratch files or source copies. Test/command durations are
not native transaction latency or sustainable throughput.

The separate default-off native owner draft in the source branch hardwires the
actual P1 client and V6 APIs, but requires additional real application sources
that are not in this main batch. Its syntax-only result is not merged into this
protocol's test total. Main receives no partial native graph or effectful default
cutover. The existing 27-case hosted CI profile is unchanged and does not run
these 43 controls.

P4 remains incomplete. Full-graph source/package admission, isolated native lane
workers, actual parent application/RPC/grant orchestration, independent real
backend balances and native transaction boundaries are still separate gates.
Never time IPC arrival as SQL latency or combine unrelated process clocks. Native
load requires its own complete reviewed managed selection and finite approval;
these DATA tests grant no native, pilot, economic or production authority.
