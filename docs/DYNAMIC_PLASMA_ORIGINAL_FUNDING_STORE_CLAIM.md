# Dynamic Plasma original-funding store-object claim

The default-off original-funding owner now uses the actual
`claimZenonDynamicPlasmaOriginalFundingStore(store)` primitive before exposing
a new owner. This closes a source-level gap: multiple wrappers around the SAME
already-open store previously relied solely on caller exclusivity. Each wrapper
had its own candidate/commit counters, so those per-wrapper counters alone did
not reject a second wrapper.

The new claim is SDK/SQL-free and keyed only by opaque object identity. It never
reads store fields, invokes methods, authenticates a store, opens a file, signs
or performs a database operation. The real owner still checks the actual store
class/resource, completes non-operational candidate-preparer configuration, then
claims the store object before returning any preparation interface. A refused
configuration before that point does not consume a claim.

Claims have no release/reset API. Failure, close, cancellation and unknown commit
do not grant another local wrapper a new signing/preparation attempt on that
object. The returned immutable null-prototype receipt is the same DATA for all
first claims, contains no store reference, and conveys no operational authority.

## Explicit limits

This is one store OBJECT in one evaluated module instance, not a database path,
file identity, process-global namespace or restart fence. Another store object
for the same file or a separately evaluated module namespace is not deduplicated
by this primitive. Do not treat object claims as crash recovery or current
economic authority.

The actual V6 store, exclusive resource lifetime, retained original bytes,
independent pins, nonempty-store rejection and fail-closed recovery remain
required. A normal DB close/reopen is not permission to create a replacement
payment after uncertainty. The caller retains close/quarantine/restart duties;
this claim does not close, reopen, release or repair anything.

## Source and qualification profiles

Selected local primitive cases exercise the REAL SDK/SQL-free module with
explicitly declared opaque objects. They do not substitute a fake native store
or qualify the effectful owner, wallet, real signature or SQLite composition.

The updated effectful owner and the future two-scenario SDK/V6 fixture remain
source-only on `x402/p1-dp-original-funding-store-claim-source-v1`. The prior
preparation source-review record stays immutable at its prior source digest;
the new store-claim source review identifies the updated owner separately.
Syntax parsing is not import/linkage or runtime qualification.

The intended real composition fixture is separate: one actual SDK/preflight
path, two fresh private V6 SQLite files, success with retained original pins and
normal reopen, and commit-before-return uncertainty without a replacement
candidate. It also checks that a duplicate owner of the same real store is
refused before any additional wallet/read callback. Do not execute that fixture
without its exact source/dependency/launcher review and the separately required
synthetic wallet-signature, SDK and new-private-SQLite scope.

The default buyer/legacy SDK composite, public transport, native HTTPS retry,
hosted CI, real PREPARE, payment and economic pilot are not activated here.
