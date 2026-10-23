# Original-funding v2: retained candidate before custody

## Implemented changes and evidence boundary

The SDK/SQL-free DATA module now has explicit contextv7 entries:
`captureZenonDynamicPlasmaOriginalFundingInputV2` and
`assembleZenonDynamicPlasmaOriginalFundingDataV2`. They return DATA version2.
Existing entries still require contextv6 and return DATA version1. There is no
automatic context upgrade or active legacy-buyer cutover.

The [selected actual DATA result](../qualification/dynamic-plasma-original-funding-v2-data.actual-local-result.json)
records 19/19 passing cases against 34 source inputs, totaling 427,161 bytes,
using Node 24.19.0 / Darwin arm64. It imports the actual v7 preparer/read stage,
wire, field/hash/key/intent and original-payment checkpoint modules. The
candidate callback returns fixed deliberately invalid signature-shaped DATA;
material difficulty is zero. No real signature, key, SDK, SQLite, network,
nonce search, real chain PREPARE or payment operation ran.

These cases verify the DATA plus retained-candidate stage, NOT the effectful
preparation/submission owners. Those changed owner sources are kept only on the
scoped working branch, not promoted to main or executed by this result.
Their [source-only linkage review](../qualification/dynamic-plasma-original-funding-v2-owner.source-review.json)
records exact authored hashes, actual imported names and source ordering.
It is neither a JavaScript parse/link check nor runtime qualification.

## Source-only application integration

The explicit factories `createZenonDynamicPlasmaOriginalFundingPreparationV2`
and `createZenonDynamicPlasmaOriginalFundingSubmissionV2` select the real
contextv7 retained-candidate preparer and DATA version2. They retain the actual
cryptographic preflight, genuine V6 store prototype methods, one-use store
object claim, funding POST owner and existing lifetime/close rules. No injected
preflight, writer, factory or success callback replaces those components.

The intended source sequence is:

1. Capture independent originals before callbacks, reject occupied custody,
   prepare the candidate once, encode its original wire/checkpoint once and
   await the actual cryptographic preflight.
2. Return the original packet so the caller can retain its pins independently
   of the database. Matching DATA is not proof of independent durable retention.
3. On the one admitted commit, check those caller pins first, then call the
   same private preparer's `revalidateSignedOriginal()` exactly once.
4. Require the v2 pre-custody result, unchanged signed block, original unsigned
   fields and pre-sign checkpoint. Enter the captured V6 atomic pair/checkpoint
   method with the already retained packet, without an intervening await,
   wallet call or re-encoding. Read back the exact original checkpoint.
5. Submission separately requires the same caller pins and exact V6 original
   bytes, recovers the actual payer owner without transport, checks them again
   and delegates one original funding POST attempt.

A pre-custody read refusal consumes the commit attempt and retains the original
packet in HELD_BEFORE_COMMIT. Failure after store entry remains
COMMIT_OUTCOME_UNKNOWN even if a commit may have happened. No new quote, second
wallet/material call, replacement, reset, reopen or replay right is exposed.
The earlier v1 factory still selects v6; its historical results are unchanged.

This source ordering is implemented but has NOT run with the actual
SDK/signature/V6 store. The DATA test does not prove that owner order, actual
store commit, submission or close behavior.

## What the selected DATA cases establish

Initial PAYMENT-SIGNATURE, original challenge, request/context bytes and
independent checkpoint pins remain byte-identical across the actual one-shot
sixth read at one and two price advances. Horizon expiry, changed policy,
insufficient balance and moved frontier refuse while retaining the same packet.
An unresolved sixth read cannot open a second preparation. Separate cases
cover explicit version boundaries, actual v6 compatibility, exact-field and
independent-pin rejection, descriptor/Proxy handling and signature-shape limits.

An initial run passed 15/19: four cases read the phase from the wrong inspection
level after their expected refusal and packet checks. The failed fixture and
its complete source pins/output digests are retained. A separate corrected
fixture changes only that assertion to `.candidate.phase`; it passed all
19 cases. No failed case, implementation, source guard or old result was removed
or relabeled.

Two direct Node commands ran, with exact read allowlists and no write, child or
worker permission. Output was bounded in memory. The existing bounded material
timer ran; this is not a timer-free or whole-operation-deadline result. No new
storage root/task/scratch, native fixture, archive or cleanup was created.

## Remaining qualification and roadmap gates

Current read projections are declared and non-atomic, not authenticated funds,
ancestry, ABA exclusion, runtime activation or a guarantee that the price cannot
change after the check. These components do not establish provider readiness,
grant activation, chain inclusion or economic acceptance.

Before promoting the effectful owners, bind and qualify their complete current
graph with separately matched SDK, synthetic transaction-signature, private V6
SQLite and selected transport scope. The consumed V4 native permission and old
nine-case source profile cannot be reused or rebound to these hashes. Positive
PoW with the current signing/custody chain and P2 forced-interruption/lifetime
cases remain open. Hosted CI is NOT_RUN_NOT_GREEN, full P0/P1 is NOT_ESTABLISHED
and the economic pilot remains NO_GO.

