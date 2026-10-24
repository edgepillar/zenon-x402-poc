# P1: native issued-funding grant-operator fixture support

## Status: source and syntax only

The new
[`issued-funding-post-native-grant-operator.fixture.draft.mjs`](../qualification/issued-funding-post-native-grant-operator.fixture.draft.mjs)
authors the real provider/observer/activation support needed by the new native
vertical fixture. It is not the complete native case driver or a runtime result.
It was **not imported, instantiated or executed**. No key, signature, SQL file,
listener or managed task was created.

Three Node syntax-only checks ran during development. The final checked source
SHA-256 is `b1224cc52ef9a5dd67418392b3064ea79d6a7f8c8abb9c7fb9b986a42bb4f587`.
A read-only source-literal review found the 18 imported application exports and
12 referenced class methods in their pinned sources. These matches are not
behavior tests, transitive graph qualification or proof that the runtime works.
Earlier syntax pins remain historical, not current runtime evidence.

The exact record is
[`issued-funding-post-native-grant-operator.source-review.json`](../qualification/issued-funding-post-native-grant-operator.source-review.json).
Review source/main parents are
`cefa6d1cfe67cac06fdfbcb372f7bf8199eb98c5` and
`21aa0770caf6590053bff05ab9c24d200c0928c8`; these parents do not contain the new files.

## Why this support is needed

The native application deliberately does not activate service from a BOUND or
official settlement receipt. Its local admission must read an actual committed
grant matching the original transaction, issued challenge and fixed
holder/capability/offer. A test that inserts a lookalike grant directly or injects
a successful verifier would not exercise that missing link.

This draft instead hardwires the actual observer SQLite store, provider
attestation signing-byte builder/verifier, and funding composition. The provider
key is generated only inside the explicitly invoked factory, never at module
load, and is neither accepted from a wallet nor exported/persisted.

## Two actual activation paths, with declared chain data

For the original paid POST, `activateBoundOriginal` requires independent
`transactionHash` and `paymentRequiredHeader` inputs retained by the harness.
It loads the actual owned intake row for the fixed selection and matches BOUND,
authority, exact original header, hash and observer target. It opens **only** the
existing observer file created by the actual intake. A missing primary observer
is a refusal, not permission to create a substitute or rebuild payment data.

It then advances the actual observer through a bounded declared page/inclusion,
commits an actual signed provider envelope to the real outbox, verifies READY
funding evidence, and invokes actual
`createZenonFundingComposition(...).activateCommittedFunding(...)`.
The actual returned grant is read back from the real service store.

`activateDeclaredForeign` creates a separately named new observer for a distinct,
explicitly declared synthetic transaction and different offer/capability. It
uses the same actual provider/outbox/activation path. This supplies a valid
synthetic-ledger foreign grant for the later selected-grant refusal case without
pretending a second wallet payment or native funding POST occurred.

Both paths use **declared synthetic chain observations** and an ephemeral test
provider. Successful future execution would demonstrate local composition under
those premises, not authenticated node/SPV inclusion, real provider authority,
economic acceptance, live funding or production.

## New-file and ownership boundaries

The factory accepts only DATA configuration, not borrowed store/factory/verifier
replacements. It requires the managed scratch root selected by the reviewed
launcher, a physical private owned directory without special mode bits, and
absent exact service/intake database paths and sidecars. Actual constructors
create those two databases with no existing-file adoption.

After successful construction, the actual service/intake instances are handed
to the native harness. That harness owns their lifetime and may close them only
at the real current application/client shutdown boundary. This helper never
closes those handed-off stores. `closeOwnedObservers()` is explicitly limited
to its own observer opens and provider-key reference.

Every returned observer is retained before load/validation can throw. File
identity is retained and checked around closure. After its own operation settles,
each owned observer close is attempted at most once, independently. Unknown
construction, activation, replaced identity or close latches HOLD; there is no
automatic retry, reopen, deletion, home-temp fallback or cleanup. The fixture
cannot construct again in the same module lifetime even after clean close.

Dropping a Node key-object reference is not memory-erasure proof. None is claimed.

## Declared future effect bounds, not observed behavior

The source caps one factory construction, two service/intake create attempts,
two observer database paths, one synthetic provider key, at most two provider
signature calls and two actual grant activations. It allows two bounded pages,
at most three confirmation momentums per page and 32 policy calls. Primary and
foreign transaction hashes must differ.

These are source-owned checks, not an OS sandbox or a managed quota guarantee.
The per-database inspection cap is 4 MiB; total allocation, transient SQLite
journals and all TLS/pin/log files need separate launcher accounting. Together
with the client V6 database, the intended full fixture has five SQLite database
paths, not five total filesystem files.

No TLS, socket, nonce, wallet/capability signing or SDK PREPARE operation is
implemented by this support module. The complete native harness still needs
its own reviewed exact effect/connection/CPU/storage bounds, approved private
root and volume identity, 10 GiB production free-space floor plus reservations,
and fresh authorization wherever prior one-use scope is insufficient. An
environment selection string is not such authorization.

## Remaining vertical work and publication

Next is the actual bounded native RPC/application setup, DP/client/V6 original
custody, original hash/pin retention, service proof creation, and success/pending,
foreign-grant, exact-original replay and response-loss/close driver. No fake
native module, SDK alias, test source transform or canned BOUND server may
replace the actual new application in that driver.

Legacy offline test files were read as API references only. Their home-temp,
recursive cleanup, module-load keys and SDK PREPARE patterns were not run or
copied into this draft. The frozen pending full-DP profile is unchanged and does
not acquire this new graph or a larger permission scope.

Only these three draft fixture/source-review/document files are eligible for
the existing source branch. Nothing from this unexecuted support is eligible
for main. Ordinary buyer and production code remain unchanged. Both parent
heads had zero checks/statuses/workflow runs; no current CI pass is inferred.
No workflow, PR state, public comment, force-push or protection bypass follows
from this source transfer. Full P0, P1, P2, the roadmap and production remain
incomplete.
