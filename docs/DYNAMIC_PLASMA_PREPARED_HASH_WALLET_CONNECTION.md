# DP preparation through the prepared-hash wallet

Date: 2026-10-26. All 14 current builtin component controls passed.

The new [configuration capture](../src/zenon/dynamic-plasma-keypair-funding-configuration.js)
and [preparer-options builder](../src/zenon/dynamic-plasma-prepared-hash-wallet-options.js)
connect the concrete prepared-hash WalletAdapter to the existing context-v7
retained DP candidate preparer. They invoke no operational callback during
construction. Work bounds and public bytes are detached, while the same borrowed
read/material/key-owner identities are retained.

## Actual component order

The same options builder used by the native source connection is exercised with
the actual production retained candidate preparer:

1. Check the borrowed owner's address against the independently selected payer.
2. Run the original quote, work request, material handoff, unsigned assembly and
   validation through four bracketed account/balance/dual-DP read cycles.
3. Enter the concrete adapter once. It validates the original unsigned hash and
   public identity, rechecks the key-owner address, and passes only that 32-byte
   hash to the captured callback.
4. Preserve every original field except the returned signature, then perform
   the fifth current-read cycle with the same original quote and account.
5. Retain the encoded original payment and independent checkpoint pins.
6. Run the sixth current-read revalidation before custody without reassembly,
   another material request, signature operation, quote refresh or new payment.

The result's exact payment header, hash, nonce, acknowledgement and checkpoint
bytes remain unchanged across accepted revalidation. Both permitted post-signer
Momentum advances are covered. Fifth/sixth horizon expiry, moved account,
insufficient balance and changed pricing parameters refuse while retaining the
same original. Pending signer/read operations keep ownership and refuse reentry.
Late material fulfillment cannot resume a timed-out attempt.

## Native source connection

The development branch x402/p1-router-late-pending-close-integration-v2 adds
createZenonDynamicPlasmaBoundedKeyPairOriginalFundingSubmission in
src/zenon/dynamic-plasma-bounded-original-funding-submission.js.

This named source entry hardwires the actual bounded material producer, the
same prepared-hash options builder and the existing V2 original-funding owner.
Expected public bytes come only from captured materialOptions.publicKey.
The real owner already connects retained-candidate preparation, cryptographic
preflight, independent pins, a sixth revalidation, atomic V6 custody/readback,
and one explicit original funding POST. The factory returns that actual owner
directly; prepare, commit and submit remain separate caller-selected steps.
There is no injected owner/preparer/preflight/store-writer factory, legacy
fallback, reset or automatic resign/replay. Key consent and cleanup stay with
the independent key owner.

That SDK/SQLite binding is SOURCE AND PARSER ONLY. Its existing native factory
body and error helper remain byte-identical. A parser-only command passed, and
its 59-file literal relative source closure was retained without evaluating it
or loading the referenced SDK/Noble packages. This is not proof that its full
native construction, actual SDK KeyPair, SQL commit or transport works.

The native binding's current main/development versions differ already.
Main receives only the seven tested component, fixture, runner and evidence
paths; its native binding is preserved. The modified native source is published
only on the development branch. Neither publication switches the ordinary buyer
or the separately gated Phase 2C path.

## Verification and limits

The [actual local result](../qualification/dynamic-plasma-keypair-candidate.actual-local-result.json)
pins the complete 42-file component import closure, the native source closure,
the selected 14 cases, actual exits and stream hashes. One Node 24.19.0 component
command passed all 14 with no failures, skips, cancellations or todo. One other
Node command parsed only the native entry; it did not import its dependencies.

Account and dual-DP exchanges return declared in-process JSON. Material is a
fixed zero-difficulty nonce, and the key callback returns deliberately invalid
constant signature DATA. The real repository preparer, signer adapter,
original-field/price validators, funding DATA codec and checkpoint restore are
executed. There is no actual SDK, key, signature generation/verification,
positive-work search, SQL, HTTPS/socket or native funding application.

No source tree/package copy, database, managed task or Node child is created.
These controls establish component sequencing and DATA retention, not chain
authentication, price acceptance by a node, real key possession, physical
cleanup, durable custody/crash recovery, funding inclusion or service delivery.
The existing 108-case hosted selection remains unchanged and does not execute
these 14 local controls.

The exact separately approved V6 native selection retains its 123 source rows
and unconsumed allowance. The new native connection is not substituted into that
selection. Actual SDK/signature/custody/transport qualification, forced
interruption/lost-ACK/HELD recovery and economic acceptance remain open.
