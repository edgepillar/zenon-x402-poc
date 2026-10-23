# Dynamic Plasma signed-original handoff

This default-off library connects an original unsigned UserSend and price quote
to the block returned by an external wallet. It does not call a wallet, SDK,
signer, storage owner or transport. The active buyer and its legacy SDK path
remain unchanged; this is not the separate Phase 2C cutover.

## Contract

`createZenonDynamicPlasmaSignedOriginalHandoff(context, originalQuote,
unsignedBlock)` captures detached originals and validates their actual shared
intent, hash, literal-nonce predicate, public-key/address and price binding.
It returns a frozen facade with `originalUnsignedBlock` and
`acceptSigned(candidate, currentContext)`.

The candidate must have the exact closed AccountBlock field set. Only signature
may change; every other scalar and both Momentum ACK fields must match the
captured original, including publicKey even though it is not hash-covered.
The signature must be canonical Base64 for 64 bytes. This is syntax, NOT
cryptographic signature validation or key possession.

Acceptance reuses the actual shared binder against the independently supplied
current context and the captured ORIGINAL quote/block. It does not re-quote,
refresh an ACK, recalculate a replacement hash, search for work or resign.
Changed runtime parameters, intent, price policy or an expired quote must still
fail the existing consumer. Inputs detach synchronously before an await.

Only one candidate can be presented to a facade, including concurrent or
malformed attempts. A failed candidate/current-context check consumes this local
handoff. This latch is not a durable/global payment-admission counter and cannot
detect or prevent an external wallet signing again. A new facade is not authority
to retry, replace or spend. The operation owner must retain an uncertain signed
original and its consumed authority separately.

## Required integration order

1. Prepare and retain the original unsigned block/quote under the existing DP
   preparation owner; capture this handoff before external signing.
2. The separately authorized wallet signs exactly that unsigned block. This
   library does not perform or qualify that operation.
3. Obtain the independently current observation/context, then present the
   wallet result to this handoff once. A result preserves original signed DATA;
   it does not confer signing, payment or chain authority.
4. Run the real payment/signature preflight and retain the original signed
   payment bytes/hash/context with the existing custody owner before transport.
   Publish/reconcile only through that operation's established owner.

The pre-sign-only unsigned checkpoint reader/codec is NOT called after signing
and is not repurposed as signed-payment custody. No V6 SQLite schema or checkpoint
is created or modified here. The final handoff remains volatile DATA.

## Evidence boundary

The selected behavior entry uses real repository hash/key/price consumers with
fixed public-byte DATA, a literal zero-difficulty nonce and deliberately invalid
signature-shaped bytes. Passing those cases does not establish a real wallet
signature, SDK invocation, authenticated RPC/funds, positive-work preparation,
durable custody, native HTTPS, complete P1 composition or live readiness.

Source review, selected local results, hosted CI and real integration remain
separate. No package script, production default or CI scope is expanded.
