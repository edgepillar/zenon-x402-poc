# Original-only observation after provider close

`restoreIssuedFundingGrantNativeJournalRecovery` wraps the existing recorded
provider with one explicit local `reconcileOriginalFunding()` operation. The
configuration adds exactly `observation: { journal }`, an existing actual
`SettlementJournal`. Its captured `getEntrySnapshot` method is the only journal
capability. The wrapper constructs its own recorded provider and uses that SAME
root's close/snapshot capabilities; a caller cannot substitute a JSON CLOSED
flag or another root's receipt. Native execution remains unqualified.

The operation does not reconstruct a lost SDK tuple or continuation. It does
not call a facilitator verifier/settler, prepare, publish, sign, fetch, open an
RPC connection, activate a grant or dispatch a service. The journal is an
existing local historical source. New chain observation remains separate work.

## Ordered operation

1. Claim one same-provider close before returning the observation receipt.
   Require a genuine Promise, void fulfillment and a fresh CLOSED root view.
   No funding store or journal is read before this barrier.
2. Require revoked admission, no active operations/opening, completed child
   closes, clean native ingress and zero tracked sockets/requests/handlers/timers.
   Recheck this view around custody and asynchronous journal work.
3. Read the independently pinned complete BOUND row and original outcome. Match
   the exact publication, frame, service selection, transaction and fixed policy.
   Only PENDING with remaining persisted observations can proceed.
4. Strict CAS reserves OBSERVATION_IN_FLIGHT and increments the count. Exact
   synchronous acknowledgement and same-row readback precede the journal call.
   The existing three-table intake store supplies this transaction. No journal
   callback runs inside SQL; an identical stale proposal is not another claim.
5. Read the original authorization-key/transaction pair from the same journal.
   Compare all eight immutable journal fields, including full signed block,
   resource, chain profile, payer and intent. Do not substitute another payment.
6. Normalize the selected original observation. ACKNOWLEDGED stays PENDING;
   included evidence must meet the original confirmation threshold. At the last
   allowed pending observation, record EXHAUSTED. Included original evidence can
   record SETTLED history. Delivery state must be NONE; inclusion never proves
   service delivery, compensation, current canonicality or external grant authority.
7. Persist and read back the complete outcome before returning history and a
   new outcome-pin candidate. Retain it independently before selecting another
   provider. The old provider stays closed; there is no automatic reopen.

Explicit subsequent observations share that same close receipt and durable
remaining count. At most 32 local operation admissions are allowed per owner;
the original 0..16 persisted observation budget remains the economic-operation
bound. Neither limit is an OS scheduling, CPU or lifetime guarantee.

VALIDATED, publication UNKNOWN, missing records, tombstones, delivery ambiguity,
foreign or malformed journal facts are not promoted to settlement. The consumed
observation remains in flight and HELD on uncertainty. Lost CAS/result/readback
receipts, changed history, opaque returns and close during a read do not refund
the count or permit a new first attempt. A late result cannot repair HELD.

## Scope and ownership

The outcome retains observation provenance: existing journal revision/record
digest, declared publication classification, no SDK reentry and no current
canonicality or service-delivery claim. Its `observed-settlement` data uses the
existing normalizer and bounded internal wire header; this is not a new official
SDK execution or conformance receipt. HTTP history keeps the separate BOUND
contract when an operator explicitly opens the recorded provider with new pins.

The provider stores and journal remain borrowed. Logical close fences this
owner and shares the single provider close; an active or uncertain journal read
keeps close HELD. It never force-closes borrowed files or creates a competing
store owner. Native journal methods retain their existing file/locking limits.
This source protocol does not prove cross-process fencing or physical release.

DATA checks exercise the actual pure observation owner, codecs, result
normalizer and recorded provider controller under declared memory I/O. Native
SQLite/journal/HTTPS, real close/reopen cutpoints, Linux, live chain observation,
independent pin availability after lost results and complete G1/G2 acceptance
remain OPEN. The unchanged hosted 108-control CI and 22 inputs are separate.
No G0-G5 or economic/pilot gate is completed by this source change.
