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
