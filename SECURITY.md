# Security

This repository is research proof-of-concept code. It is not production-ready and does not provide an official Zenon or x402 security guarantee.

## Live operation is fail-closed

The repository does not ship a real live chain profile or a chain-profile authenticator. Its command-line tools cannot enable live mode using `.env` alone. The default live client and facilitator stop with `node_network_identity_unavailable` because configured SDK values and node self-reports do not independently authenticate a remote chain.

Do not use mainnet, real funds, or a valuable wallet. If a future local experiment supplies the missing programmatic components, use only a disposable, minimally funded testnet wallet. The acknowledgement variable and the SDK network-ID check are defense-in-depth guards, not proof of connected-chain identity.

Never commit `.env`, a mnemonic, keyfile, private key, token, or RPC credential. The facilitator must never receive buyer key material. Credential-bearing RPC URLs are rejected because the SDK may log the complete URL.

## Payment invariants

The selected requirement commits an exact versioned chain profile:

```json
{
  "version": 1,
  "chainIdentifier": "<canonical-nonzero-decimal-string>",
  "genesisMomentumHash": "<64-lowercase-hex>"
}
```

The experimental `zenon:testnet` label is descriptive only. It neither identifies nor authenticates a chain. A future authenticator must establish the exact chain identifier and genesis identity during the exclusively owned SDK session.

Both live entry points use one strict offline preflight before any RPC. It binds the signed `UserSend` block to the exact x402 version, resource, requirement, chain profile, recipient, concrete ZTS and canonical positive amount. The facilitator reconstructs the hash, verifies Ed25519 with strict ZIP-215 behavior disabled, and binds the public key to the payer address.

The maximum payment amount is `2^255 - 1` atomic units, matching canonical go-zenon account-block validation. Zero and non-canonical decimal forms are rejected by this exact-payment scheme.

## SDK singleton and timeout behavior

The TypeScript SDK uses mutable process-global connection and chain configuration. One FIFO owner serializes the complete live SDK lifecycle across every buyer and facilitator instance:

```text
acquire global owner
configure and connect
perform live RPC / prepare / confirmation work
clear the connection
release global owner
```

Settlement acquires the canonical per-payer queue before the global SDK owner. No path acquires those locks in reverse order.

SDK RPC calls cannot be reliably cancelled. If a bounded read or publication wait expires, the code marks the process-local live runtime poisoned before cleanup or ownership release. The underlying request is not claimed to be cancelled. All queued and later live operations fail with `live_runtime_poisoned_restart_required`; restart the Node.js process before attempting any further live use.

An unexpected SDK connection-cleanup failure is handled the same way for future-use purposes: the runtime is poisoned before ownership is released, so uncertain singleton state is not reused.

`prepareBlock()` is composite and may perform several RPC calls and PoW. It is intentionally not wrapped in `Promise.race`; ownership remains held until it settles.

## Publication and recovery evidence

Publication results are classified by evidence:

- `VALIDATED` — offline validation succeeded; after node-dependent checks, the exact signed block and authorization identity are journaled before any publication attempt;
- `SUBMISSION_ACKNOWLEDGED` — publication returned or the exact block was observed without Momentum inclusion details;
- `SUBMISSION_OUTCOME_UNKNOWN` — publication returned its asynchronous request promise, that promise rejected, and reconciliation did not observe the exact block; every such rejection remains uncertain, not only a timeout or transport failure;
- `MOMENTUM_INCLUDED` — the queried node returned the exact block with `confirmationDetail`;
- `DELIVERY_PENDING` — an exclusive delivery claim was durably recorded; protected-resource execution may have begun;
- `DELIVERED` — the response was durably cached.

The implementation does not use `FINAL`. `MOMENTUM_INCLUDED` does not prove irreversible finality, independent canonicality, or the recipient's receive block. Merchant receipt remains separate.

An uncertain publication produces a distinct HTTP `409` recovery result. Clients must reuse and reconcile the same signed payment and must not automatically create a replacement payment. The resource is not released while the payment outcome is uncertain.

Optional reconciliation retention is local abandonment policy, not chain evidence. It is disabled by default and accepts only explicit constructor values from 3,600,000 through 2,592,000,000 milliseconds. Expiration uses persisted `createdAt`, never `updatedAt`, and is evaluated only by an explicit bounded maintenance call that examines at most 64 entries. There is no environment activation, scheduler, startup/request hook, background worker, CLI, or enforced cadence. A backward clock move delays expiration; an undetectable forward jump can terminalize early.

Maintenance uses exact transaction-hash lookup only. Included and unconfirmed observations strengthen active evidence, unavailable lookup retains it, and only exact absence after age can create a tombstone. It acquires the per-payer queue before the global live-SDK owner and retains both through the final journal compare-and-replace. This is a same-process boundary only; it does not coordinate other processes or publishers. Existing tombstones are explicitly rechecked, and late inclusion is retained as operator-visible evidence without automatically delivering, refunding, crediting, retrying, or authorizing replacement.

Live resource URLs must use HTTPS. Paid submissions use manual redirect handling so the signed unpublished block is not forwarded to a redirect target. Missing, malformed or mismatched settlement evidence after submission is treated as uncertain and preserves the same payment for reconciliation. Every `/paid` response uses `Cache-Control: private, no-store` and `Vary: PAYMENT-SIGNATURE` to prevent shared-cache authorization bypass.

## Journal scope

Live attempts are stored in a versioned file under the ignored `.runtime/` directory. After node-dependent pre-publication checks, the journal persists the exact signed block before publication and uses a same-directory temporary file, file sync, atomic rename, and directory sync where supported. Malformed, inconsistent, oversized or corrupt state fails closed. An initialization marker detects a missing journal file after the first successful write; deleting both files is outside this single-host trust model.

The journal deliberately stores no mnemonic, private key, seed, token or RPC credential. Cached protected responses are plaintext JSON, are limited to 64 KiB, and may themselves be sensitive; filesystem access to `.runtime/` is therefore part of the PoC trust boundary. Its default active-record capacity is 256. Tombstones use a fixed separate capacity of 4096, remain within `maxFileBytes`, participate permanently in online replay and uniqueness checks, and are never evicted or archived automatically. Capacity failure preserves the full active record and fails closed.

Schema v1 remains readable and is not upgraded to v2 by reads, ordinary updates, or disabled retention. The first successful tombstone conversion removes the full record and writes schema v2 atomically in one journal revision; the checksum then covers active records and tombstones. A terminal response is not available until the tombstone durably reloads. Rollback to a v1-only reader is unsupported after v2 appears.

An exact retained tombstone is represented over the local HTTP boundary as response-only `402` with fixed `payment_reconciliation_terminal` evidence and no recovery owner. This means local retention abandonment only. It is not proof of inclusion, finality, supersession, payer remedy, or safe replacement. The server converts malformed internal terminal candidates to private `500`; the buyer converts malformed, mismatched, additional, accessor-backed, or dual-header terminal candidates to same-payment outcome unknown. The legacy `payment_settlement_failed` dual-header `402` and recovery `409` lanes remain separate. Official parser acceptance is characterized compatibility, not an upstream standard or activation claim.

This is a single-writer, single-process, single-host recovery mechanism. It supplies neither distributed locking nor durable exactly-once execution. In particular, an arbitrary resource callback can perform an external side effect and the process can crash before `DELIVERED` is recorded. Operators must reconcile `DELIVERY_PENDING` manually rather than assume whether delivery occurred.

## Node-dependent checks

A future authenticated live session must also pass sequential readiness checks, exact chain-profile comparison, token metadata validation, frontier validation and complete bounded unconfirmed-block inspection. Unconfirmed pagination reads every page implied by `Count` up to 200 entries and fails closed on malformed counts, incomplete pages, excessive counts and RPC failures. It rechecks page zero to detect some concurrent changes; the node view is not an atomic snapshot.

These checks remain observations of one node and cannot eliminate external frontier races. Process-local per-payer ordering does not coordinate client-side preparation, other processes, other facilitators or independent publication.

## Other known non-production properties

- no authenticated genesis/checkpoint implementation or SPV verification;
- no audited domain-separated binary payment-intent encoding;
- no formal CAIP-2 Zenon namespace is asserted;
- no RPC failover, rate limiting or distributed settlement database;
- no complete local verification of consensus or Plasma/PoW rules;
- live integration is not exercised against a node by the automated tests;
- RPC polling is authoritative and subscriptions are wake-up hints only;
- mock mode cannot establish live consensus, frontier, singleton or confirmation correctness;
- key-pair `clear()` is defense in depth and cannot guarantee JavaScript memory zeroization.

## Threat-model principle

The facilitator must never gain the ability to move more value, redirect value, choose another asset, or authorize another resource than the payer explicitly signed. Any future delegated-authorization design must preserve that property.
