# Dynamic Plasma original-funding preparation

This work connects the actual context-v6 DP candidate format to the existing
x402 funding wire and V6 original-payment checkpoint contracts. It does not
replace the default legacy buyer or open the separate Phase 2C cutover.

The SDK/SQL-free DATA module and its selected local result can be qualified
independently. The effectful `dynamic-plasma-original-funding-preparation.js`
owner is intentionally kept on `x402/p1-dp-original-funding-owner-source-v1`
as a SOURCE-ONLY draft, not activated or runtime-qualified by those data tests.
Main does not provide that effectful owner. Its syntax result and source review
are not a successful SDK/signature/SQLite composition experiment.

## Original DATA capture and encoding

`captureZenonDynamicPlasmaOriginalFundingInput(input, fundingResourceUrl)` takes
exactly `{plannerContext, challenge, originalRequest}`. The planner context is the
existing explicit context-v6/v3-read contract. The challenge is the original
funding client's `{status, resourceUrl, paymentRequiredHeader, paymentRequired}`.
The request supplies `{requestId, contextId, requestBodyBase64, contextBase64}`.

Capture detaches bounded DATA before callbacks. The selected intent must match
the original, canonical PAYMENT-REQUIRED header and independent funding URL.
Original body/context bytes and IDs are supplied, never inferred from a DB,
grant or recovery summary. Empty request-body bytes are permitted; context bytes
must be nonempty. Checkpoint byte fields retain their existing 4096-byte bounds.

`assembleZenonDynamicPlasmaOriginalFundingData(originals, candidate, url)` takes
exactly `{originalUnsignedBlock, accountBlock}` for the candidate. It reuses the
actual closed DTO field digest, complete hash/fixed-nonce/key-address consumer
and independently selected intent binder. All original fields except signature
must match, including publicKey which is not hash-covered. The signature must
be canonical Base64 for 64 bytes, but is NOT cryptographically verified here.

The result contains the initial PAYMENT-SIGNATURE wire encoding, exact original
challenge header, original signed payload, canonical original-payment checkpoint
and independent expected pins. This is the V6 input DATA, not a store write or
verified payment. First encoding does not change transaction field values or
sign again. A recovered header must instead be retained/reused byte-for-byte;
do not reconstruct it with this builder as new dispatch authority.

`snapshotZenonDynamicPlasmaOriginalFundingPins(serialized, expectedPins)` safely
copies caller-retained pins and checks the retained canonical bytes through the
actual checkpoint codec. Expectations are never learned from a DB. Coherent
fabricated DATA can still pass these stateless functions; equality authenticates
neither provenance, key possession, caller consent nor independent durability.

## Effectful owner draft: two separate stages

The source-only owner hardwires the actual context-v6 candidate preparer,
`preflightZenonPayment` and captured prototype methods of an already opened
`ZenonFundingPayerRecoverySqliteStore`. There is no injected fake validator,
store writer or preparer factory. The caller must select a real V6 store from
the existing approved factory, retain EXCLUSIVE use/lifetime until settlement,
and own close/quarantine/recovery. This draft does not open, create, migrate,
close or silently adopt any database. A wrong store/profile can still refuse;
it does not grant a replacement signing attempt.

1. `prepareOriginalFunding(input)` captures originals, rejects an occupied store,
   runs the actual DP/wallet-candidate path, constructs original wire/checkpoint
   DATA and awaits the REAL payment/signature preflight. The packet is retained
   before that preflight, including on refusal. No DB write occurs in this step.
2. The caller retains the returned expected pins durably OUTSIDE the database.
   A matching object is not proof that the caller actually did so.
3. `commitOriginalFunding({expectedPins})` accepts one attempt only. It checks
   those independent pins, calls the actual V6 atomic funding-plus-checkpoint
   method, requires PREPARED revision1 without ambiguity, and reads the exact
   checkpoint back through the actual V6 API. It does not dispatch or publish.

A failure after entering the atomic store method is UNKNOWN to this owner,
including a possible commit-before-return loss. The same packet/candidate stays
available through explicit volatile `inspectOriginalFunding()`. There is no
retry, reset, quote refresh, re-sign, reopen, migration, replacement or automatic
resend. Existing records require their separate recovery path, not a new signer.

Local store readback is not process/crash durability qualification, remote
publication, service delivery, provider READY, inclusion or economic authority.
Borrowed wallet/read/material owners retain lifetime and unsafe-Promise duties;
direct/indirect dependencies on the owner's public preparation Promise must not
be supplied. No hard cancellation, whole-operation deadline or hostile-code
sandbox is claimed. Source/native intrinsics and dependencies remain premises.

## Evidence and remaining gates

Selected DATA tests use one actual DP candidate preparation with in-process
wallet/read doubles, fixed public bytes, a literal zero-difficulty nonce and
deliberately invalid signature-shaped bytes. They exercise actual wire,
hash/field/key/intent and checkpoint codecs, not the SDK/SQL owner module.
Historical results and source guards are preserved, not rebound or relabeled.

`node --check` on the effectful owner only parses its source. It does not resolve
or execute the SDK/native-store graph and proves neither method linkage nor
behavior. Before any real owner test, review and pin that complete graph and
launcher, obtain the needed narrow SDK/synthetic-wallet-signature/SQLite scope,
and use only new private managed fixtures. No real wallet, chain PREPARE,
funding/payment, network, provider setup, default cutover or pilot is authorized
by this source/data work. Main/hosted-CI qualification remains separate.
