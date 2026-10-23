# Explicit DP preparation to original funding POST composition

Status: SOURCE-ONLY / NOT PARSED OR IMPORTED / NOT RUNTIME QUALIFIED.

This application module connects the actual Dynamic Plasma original-funding
preparation owner to the actual payer-recovery owner and funding POST-v1 client.
It does not replace those components with callbacks, a fake preflight or a fake
store. It does not enable the default buyer, legacy SDK cutover, Phase 2C,
provider, native HTTPS, hosted CI or an economic pilot.

The new code has not been executed. Existing DATA-only unit cases, preparation
syntax checks, source retention and the earlier two-case SDK/V6 fixture do not
qualify this larger application composition. Its own dependency/launcher review,
matching execution scope and actual selected results are still required. The
earlier pinned preload has a different exact entry; it must not be reused as
permission or evidence for this module.

## Explicit operations

The factory accepts exactly preparerOptions, store, fundingResourceUrl,
deadlineMs and fetchImpl. The store must be a genuine, caller-opened V6 store,
exclusively owned for this operation. fetchImpl is an explicit operational
capability; there is no implicit selection of global fetch or a new endpoint.
The real DP preparer and funding owner validate/capture their own capabilities.
An environment label, matching DATA or these arguments alone do not establish
payer consent, economic authority or a trustworthy endpoint.

Successful construction transfers store lifetime to the composition's real
payer owner. The preparation owner borrows that same store; no store is opened,
created, migrated or recovered by construction. No wallet or fetch operation is
started by the factory. On factory refusal, close/quarantine remains the
caller's responsibility and a prior store-object claim may already be consumed.
There is no release/reset or cross-namespace/restart ownership proof.

V6 is a caller precondition, not a private schema-version check by this factory.
A genuine non-V6 instance is rejected by the actual checkpoint commit before
any funding POST; a signed candidate may already exist by then and is retained
for inspection, not replaced. Do not describe this as a pre-wallet V6 check.

1. prepareOriginalFunding(input) invokes the actual context-v6 candidate
   preparer and cryptographic preflight. It retains the original signed packet
   and returns independent pin DATA, without writing the V6 checkpoint.
2. The caller independently retains those pins outside the database, with its
   own durability/identity procedure. Matching pins do not prove this happened.
3. commitOriginalFunding({expectedPins}) invokes the actual atomic V6 pair and
   checkpoint commit/readback. It does not recover the payer owner or submit.
4. submitOriginalFunding({expectedPins}) requires the independent pins AGAIN.
   It checks original headers, resource, checkpoint, PREPARED revision 1 and
   absence of ambiguity. It explicitly recovers the real payer owner without
   transport, checks the same original state again, then invokes exactly one
   submitPrepared operation. That real owner performs cryptographic preflight,
   the durable attempt fence and the actual funding POST-v1 client.

The original challenge and PAYMENT-SIGNATURE strings are never regenerated for
sending. Checkpoint encoding is only an equality check on original retained
bytes; it is not a new wire encoder, signer or replay authority. Wrong caller
pins are rejected before SQL/recovery/transport or submission-counter
consumption. A refusal after recovery begins is held, not reset for another try.

The post-attempt readback requires the exact original checkpoint and headers
at revision 3: PREPARED -> ATTEMPT_FENCED -> the actual outcome. Unexpected
revision, bytes or status cannot be treated as success. This assumes exclusive
store use and the actual components' profile checks; it is not a cross-process
ownership or current-main qualification claim.

## Outcomes and uncertainty

FUNDING_INTAKE_BOUND records the funding endpoint's BOUND acknowledgement.
It proves neither chain publication/inclusion nor a grant, funded service
credit, successful service delivery or native provider qualification. The
existing server publication bridge, observer, grant and service composition
still need their separate integration/evidence gates.

A returned OUTCOME_UNKNOWN, a thrown submission or a failed post-entry
readback leaves SUBMISSION_OUTCOME_UNKNOWN. A commit throw blocks submission
even if the underlying database might have committed. Preparation/commit each
have one attempt, and submission has one admitted attempt. No replayUnknown,
new challenge, re-sign, replacement, store reopen or reset API is exposed.
No state, callback or cached success automatically sends again.

inspectOriginalFunding() retains the child's original packet/candidate and
the old operation phase, including after close. publicOperationActive describes
only the wrapper's public Promise; it does NOT say the transport drained.
The inspection explicitly does not expose a transport-drain proof. Any
separately selected recovery must use independently retained pins and preserve
the original signed bytes/hash, rather than treating the database as a source
of its own expected digests.

## Close and resource ownership

With unchanged guard premises, valid close() calls share one Promise identity.
It stops new wrapper operations,
waits for an already active operation, and delegates close exactly once to the
actual payer owner. A close request while the no-transport recovery is pending
prevents subsequent entry into submitPrepared. It does not cancel an already
entered submission. The operation phase is not rewritten to success by close.

The wrapper records its pending Promise before entering any operation, SQL or
callback. That prevents a reentrant close from bypassing the active-operation
wait. It does not insert a new delay before the actual owner's synchronous
input capture. An already entered preparation/commit is not cancelled by close;
the separate pre-submit close fence still prevents later submission entry.

The actual payer owner still owns its drain/lifetime rules. An undrained
transport or callback dependency cycle may keep close pending. This module
adds no new polling loop, forced close, timer-success conversion or claimed
hard deadline. External HOLD/quarantine remains necessary when lifetime cannot
be established. Neither a public Promise result nor normal close/reopen proves
physical resource reclamation, forced-exit/power-loss recovery or crash safety.

## Required qualification before promotion

Use a freshly reviewed, exact current source/profile and separately matched
scope for the real SDK, synthetic keys/signatures, new private SQLite and
selected transport. Do not copy historical results to new hashes. Required
cases include exact one-shot intake acknowledgement, response loss, commit
loss before submission, independent-pin rejection, original-state conflict,
close before submission entry and unresolved drain. Source documentation is
not a runnable test, result, network sandbox, payer consent or activation gate.
