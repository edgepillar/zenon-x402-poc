# Dynamic Plasma wallet-candidate composition

The explicit `createObservedBalanceDeadlineBoundMaterialWalletCandidatePreparer`
factory connects the existing deadline-bound material preparer, signed-original
field handoff and current-read validator. It is default-off and does not replace
the active legacy buyer or establish the separately gated Phase 2C cutover.

## Selected interface and order

Configuration is exactly `{readOptions, materialExchange, materialWaitMs, wallet}`.
The wallet supplies `getAddress()` and `sign(unsignedBlock)`, each returning a
supported native Promise. Methods are captured once without invoking accessors.
They are trusted operational capabilities: constructing this factory does not
authorize a real wallet, keys or signing. There is no default SDK or wallet.

`prepareSignedCandidate({plannerContextVersion:6, readInput})` accepts the existing
explicit v3 read-input contract. One admitted call performs:

1. Compare the borrowed wallet's address with the independently selected payer,
   before account reads, material production or signing.
2. Run the actual quote, work request, material wait, assembly and unsigned
   checkpoint path. Four bracketed account/balance/dual-DP cycles retain the
   ORIGINAL quote, account sequence, acknowledgement, nonce, key and block hash.
3. Call the captured wallet `sign` method ONCE with the frozen original unsigned
   block. No account/DP reads run while its native Promise is pending.
4. Capture fulfillment inside the native observer. Require the actual original
   field handoff, including unhashed publicKey and every field except signature,
   BEFORE another account read. An altered block is not repaired or rehashed.
5. On the SAME account wire/read owner, perform a fifth bracketed current-read
   cycle. Validate the original unsigned projection and original quote against
   that new account, balance and price DATA. Return the signed candidate only
   after this completes. No pre-sign checkpoint reader is called after signing.

The existing material timer bounds ONLY material waiting. It does not bound a
wallet, synchronous callback, read operation, whole run or native cleanup. The
borrowed wallet/read owners retain lifetime, cancellation and unsafe-Promise
prehandling responsibilities. Source/intrinsic/loader trust remains a premise.

## Refusal, inspection and custody

Busy/used guards precede input inspection. Rejection, expiry, a moved account,
insufficient balance or changed runtime price policy never opens a replacement
quote, nonce, signing attempt or payment. Recreating a preparer grants no new
authority. v3/v4/v5 factories keep their existing surfaces and contracts.

`getSignedOriginalData()` is explicit volatile inspection, not dispatch. Once
the returned candidate passes original-field binding, its exact signed DATA,
unsigned original, original plan and pre-sign checkpoint remain inspectable
while the fifth read is pending and after that read rejects. The phase is
`VALIDATING_CURRENT_READS`, `VALIDATED_DECLARED_READS` or `UNKNOWN_OR_REJECTED`.
Inspection never converts uncertainty into authority. A wallet operation that
throws/rejects, returns unsafe/malformed data or violates the original-field
contract still requires its independent wallet owner to retain/reconcile the
unreturned or unbound result; this facade cannot reconstruct it.

A 64-byte canonical signature field is syntax, NOT cryptographic validation.
Even successful current reads are declared projections, not authenticated funds,
atomic freshness, chain inclusion, signer consent or provider readiness. The
result explicitly reports signature validation and persistence NOT_PERFORMED.
It is a CANDIDATE, not an x402 payment payload, V6 recovery record or replay token.

The real payment/signature preflight and original signed-payment custody owner
must run before any transport/publication. This component exposes neither. It
does not persist a DP checkpoint, mutate a SQLite schema, call the composite SDK
preparer, publish a block or automatically resend an uncertain operation.

## Qualification boundary

The selected behavior entry uses the actual repository preparer, read transports,
collector, codecs, original-field binder and price validator. Read exchanges and
wallet methods are declared in-process test doubles. The sign-shaped test method
returns deliberately invalid constant signature DATA; no signature is generated
or verified and no real wallet implementation or key is used. Material is one
fixed literal zero-difficulty nonce, with no candidate search.

Selected cases cover five-cycle success, both allowed post-wallet price advances,
expiry, moved account, insufficient balance, changed runtime p, altered public
bytes, rehashed replacement, unsafe native/foreign fulfillment, pending ownership,
late material drain and current v3/v4/v5 compatibility. A source-bound local result
does not establish actual wallet/SDK signing, positive PoW, native RPC/HTTPS,
durable signed-payment custody, full P1 integration or a live/economic pilot.
Historical source-bound results are preserved, not updated or relabeled.
