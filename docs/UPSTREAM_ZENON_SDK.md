# Potential Zenon SDK improvements for verification-first applications

These are possible upstream proposals, not accepted roadmap items. They would help x402, wallets, relayers and other applications that verify a payer-signed account block before publication.

## Authenticated chain profiles

Expose a documented way to authenticate an exact, versioned chain profile containing at least `chainIdentifier` and `genesisMomentumHash`. SDK-local `Zenon.getNetworkID()` configuration, the experimental `zenon:testnet` label and node self-reports are not evidence of the connected chain's identity. Equal chain identifiers do not rule out different genesis configurations.

An alternative could expose authoritative genesis/checkpoint data, provenance and header/inclusion verification sufficient to link the active chain to that trust anchor. The prototype now ships one explicitly operator-trusted historical testnet observation for bounded PoC use. Its exact height-2 RPC comparison can detect honest mismatches, but it is not a current-network trust manifest, authenticated endpoint, or verified lineage and does not satisfy this upstream requirement.

## Independent client sessions

Avoid requiring all callers in a process to share one mutable connection and static chain/network configuration. Explicit client/session objects would let concurrent buyers and verifiers own and clean up connections without rebinding or closing another operation's client.

The prototype currently serializes every live SDK lifecycle behind one process-wide FIFO owner, even for independent payer addresses. This prevents concurrent singleton ownership within that process, but severely limits concurrency and does not coordinate other processes.

## Canonical account-block byte decoding

SDK 1.0.5 decodes the `publicKey` and `signature` properties in `AccountBlock.fromJson()` with `Buffer.from(value)` while `toJson()` emits Base64 strings. Those operations are not inverses for JSON-RPC string values. Decode these fields explicitly as canonical Base64, reject aliases, and add a round-trip fixture for a signed account block. The prototype contains a narrow verification-time normalization for both the correctly decoded and the SDK 1.0.5 representations.

## RPC deadlines and cancellation

Expose per-call deadlines or cancellation signals below the SDK abstraction for readiness, ledger, publish and subscription RPCs. The transport should define what cancellation guarantees after a request is written.

Without cancellation, a local `Promise.race` leaves a late SDK continuation alive. Because that continuation shares mutable singleton state, the prototype permanently poisons live use in the process after any RPC deadline and requires restart. A publication timeout remains `SUBMISSION_OUTCOME_UNKNOWN`, not a definite rejection, because the node may have accepted the block before the response was lost.

`prepareBlock()` is a composite of RPC, Plasma/PoW work, hashing and signing. A supported API should either accept a cancellation context throughout that composite or expose its individual stages; wrapping the whole call in a superficial timeout is unsafe.

## Public account-block hash helper

The SDK internally computes the transaction hash during `prepareBlock()`, but its `getTxHash()` utility is not exported from the package root. A public `computeAccountBlockHash(block)` helper would prevent consumers from duplicating the field encoding.

## Public signature verification helper

The public `Crypto` API signs but does not verify. A supported `Crypto.verify(signature, message, publicKey)` helper would keep verification behavior aligned with SDK cryptography.

## Full account-block verifier

A public `verifyAccountBlock(block)` could validate structural fields, transaction hash, public-key/address binding and Ed25519 signature without publishing.

## Prepared-but-unpublished payment abstraction

`prepareBlock()` already provides the essential primitive. A documented abstraction for prepared, signed, unpublished blocks could make wallet, relayer and x402 use cases more explicit while preserving the rule that private keys remain with the payer.

## Subscription lifecycle

Subscription streams provide callbacks but no public unsubscribe operation. An explicit unsubscribe or disposable subscription API would make bounded hybrid subscription-and-reconciliation workflows easier to clean up without closing a dedicated connection.

## Portable conformance vectors

Publish and version portable account-block hash, signing, public-key/address, hash-height and token-standard vectors alongside SDK releases. This would let verification-first consumers compare independent implementations without importing private module paths.

## Evidence-oriented publication API

A publication result should distinguish definite local validation failure, request acknowledgement and unknown transport outcome. A reconciliation helper keyed by transaction hash could reduce the risk that applications convert a lost response into a second payment.

## Future research

Sequence-independent payment authorization could reduce account-frontier coupling, but it is not currently a Zenon protocol primitive and is intentionally not implemented by this prototype.
