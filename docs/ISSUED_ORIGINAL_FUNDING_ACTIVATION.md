# Explicit original-funding grant activation

The existing `createIssuedFundingGrantNativeApplication` source entry now adds
`activateOriginalCommittedFunding(observerStore)`, an explicit LOCAL operator
method. It uses the provider's own intake/service stores, authority record,
funding policy, clock, original row and service selection. It does not add an
HTTP route or let a request supply an authority, verifier, mint callback or
different payment. Native execution remains unqualified.

The operator supplies an existing actual `ZenonFundingObserverSqliteStore` for
the original BOUND target. No observer file or provider is opened or chosen by
the new method. All SQL/observer stores remain borrowed.

## Source sequence

1. Claim one local operation before snapshot, reader or preparation callbacks.
   Require an idle, open, healthy provider, retained original BOUND and official
   SETTLED outcome, and no existing service session. Otherwise return NOT_READY
   without preparing or activating a grant.
2. Capture one bounded detached BOUND row from the same actual intake store.
   Bind the original transaction, resource URL, holder/offer/capability and
   canonical issued challenge. Keep the complete row stable around preparation
   and activation. No request can substitute another row or grant ID.
3. The fixed native preparer checks actual store prototypes. Match the original
   observer key, authority-record digest, target, chain and confirmation policy.
   A non-READY outbox is NOT_READY. This is an availability check, not a grant
   authorization. At most 16 explicit local attempts are admitted per owner.
4. For READY availability, construct the existing actual
   `createZenonFundingComposition` with those same borrowed stores and configured
   authority/policy/clock. It projects committed observer evidence and verifies
   the READY envelope/authority through actual prototype methods before the
   privileged grant activation. Neither a raw READY flag nor SETTLED alone
   bypasses this authentication.
5. Recheck provider and complete row before entering its captured activation
   capability. Claim the single activation entry before calling it. Require a
   genuine Promise and capture detached result DATA before returning to the
   caller. There is no second activation attempt after entry, including lost
   result, failure or close.
6. Require the returned grant to name the original transaction, then call the
   existing provider's `admitCommittedServiceGrant`. That controller reads and
   binds the actual committed grant and constructs its scoped durable session.
   Check its exact admitted ID, live provider view and unchanged original row
   before returning local ADMITTED metadata.

The original manual committed-grant admission keeps its synchronous contract
when no new activation is active. It is fenced while this operation owns
preparation/activation. Existing funding, service and original-grant HTTP routes
remain unchanged. Funding replay does not invoke activation.

## Ambiguity and lifetime

A known pre-entry NOT_READY can be retried only through another explicit local
call within the same 16-attempt bound. It does not resend funding, repeat SDK
verification/settlement, generate a provider signature or restore authority.

An uncertain preparation, foreign/changed row, opaque return, lost activation
or admission receipt, or close during work keeps the local owner HELD and
requests the same provider close once. Close fences local operations before
calling that provider. A late committed grant remains history; it cannot admit
a service, repeat activation or reopen a provider. The host must retain borrowed
stores while an unknown operation may still use them. No force-close or physical
release claim is made. The existing original-grant history channel remains the
read-only path for inspecting a committed result; it does not activate again.

DATA tests compose the actual local owner, provider controller and reference
ledger with declared observer/activation/service/listener/store ports. A
declared trusted activation record is not authenticated funding evidence.
The one-funding/one-grant/100-model-request plus exact-replay scenario is a
correctness model, not native HTTP/SQLite/SDK/core or Linux acceptance.

Actual READY-envelope authentication, native store transactions, lost-ACK and
process cutpoints, spending persistence across restart, ownership fencing,
physical release, Linux launch and full G0/G1/G2 acceptance remain OPEN. The
unchanged hosted 108-control workflow is separate from these local cases.

## Expiry during original verification

The fixed native preparation now explicitly selects `createZenonFundingCompositionWithExpiredFundingOutcome` for an initially eligible original. Its activation class enters `activateWithExpiredFundingOutcome` once and calls the same selected verifier once. If the original expires before or during that verification, all original authority, chain, payer/payee, price, offer, capability, units, absolute expiry, funding and inclusion fields must still match before a `FUNDED_NO_NEW_GRANT` receipt can be returned. The after-verification clock must be valid and must not regress. The fixed composition rebinds the receipt to its independently retained original transaction hash, funding commitment and expiry.

The receipt is produced before the grant-store activation call. It retains the same settlement identity and absolute expiry, reports `grantActivation: NOT_ENTERED_THIS_OPERATION`, `grantExistence: NOT_QUERIED`, `deliveryLiability: RECONCILIATION_REQUIRED` and `paymentAt: null`. Service delivery and compensation remain NOT_ESTABLISHED. All payment, signing, service, activation and compensation flags are false; authority is NONE. This is no claim that a grant never existed or that expiry cancels a provider obligation. The original BOUND observation remains retained for reconciliation.

Only the explicit prepared status `READY_WITH_EXPIRY_OUTCOME` permits the activation owner to receive this closed union. The same provider lifecycle and complete original BOUND row must still match before and after the result; no grant admission occurs for the expired outcome. The existing `activationEntered`/`activationCalls` diagnostics count entry into the activation-capable callback, not a grant write. The new mode additionally reports `activationResultMode: ACTIVATION_OR_EXPIRED_FUNDING`. DATA separately counts actual declared store entry and establishes zero such entries on the expired branch.

The existing already-expired preparation branch remains before normal composition. Legacy `activate` and `createZenonFundingComposition` retain their rejection contracts. An unexpired result uses the same activation record/store method. A verifier error, foreign record, invalid clock, lifecycle/row change or store-entry failure is not converted into known expired funding. In particular, a COMMIT_FAILED result remains OUTCOME_UNKNOWN/HELD with no second verification, store entry, payment, grant admission or automatic retry. No database schema, liability persistence, endpoint, signer, payout or compensation operation is added.

Qualification uses the actual activation class, actual in-memory credit model and actual activation owner over declared memory verifier/observer/provider ports. The native composition, native preparation and package admissions were only source-reviewed and parsed. Real funding authentication, SQLite durability, persisted reconciliation, Linux execution, reopening, physical release and G0-G5 acceptance remain OPEN.

## Retained expiry outcome

The fixed preparation now selects explicit retained-expiry modes for the original terminal funding record. The owner supplies its live lifecycle/full-BOUND-row fence before verifier entry and rechecks it around the added single CAS and exact readback before known output. A verified expired receipt is retained in the same intake row without changing SDK outcome bytes or admitting a grant. Ordinary unexpired activation keeps its existing path. Any ambiguous retention remains HELD without automatic verification, payment, compensation or retry. [Record contract and DATA limits](EXPIRED_FUNDING_RETENTION.md). Native persistence and cross-process fencing remain OPEN.
