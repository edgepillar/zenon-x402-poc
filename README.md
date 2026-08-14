# Zenon x402 v0.2 Prototype

A research proof of concept that maps x402 v2 `exact` payments to payer-signed Zenon account blocks.

The buyer prepares and signs a normal Zenon `UserSend` account block without publishing it. The x402 payload carries that exact signed block. The facilitator validates it against the selected payment requirement, journals the attempt, publishes it, observes Momentum inclusion, and only then authorizes the protected resource.

This is not an official Zenon integration, not an official x402 network implementation, and not production software. Mock mode is the default. No stablecoin or production security guarantee is bundled.

## Architecture

```text
Buyer / AI agent
    |
    | GET /paid
    v
Resource server
    |
    | 402 + PAYMENT-REQUIRED
    v
Buyer validates the requirement
    |
    | globally owned SDK session
    | prepareBlock() + local signing
    v
Signed Zenon UserSend block, not yet published
    |
    | PAYMENT-SIGNATURE
    v
Resource server / facilitator
    |
    | strict offline preflight
    | journal lookup and retry reconciliation
    | per-payer settlement ordering
    | globally owned SDK session
    | required profile authentication (implementation not shipped)
    | sync, asset, frontier and unconfirmed checks
    | publishRawTransaction()
    | RPC reconciliation until Momentum inclusion is observed
    | journal delivery state and cached response
    v
Protected resource or a non-authorizing reconciliation response
```

The facilitator never receives the buyer mnemonic or private key.

## Local mock demo

Requires Node.js 20+.

```bash
npm ci --ignore-scripts
npm run demo
npm test
```

Mock mode performs no blockchain access. It uses the x402 v2 HTTP header shape and a reserved synthetic chain profile that cannot validate as a live profile. The mock transfer is signed so requirement, resource, replay and delivery behavior can be exercised locally.

The mock server and buyer can also run separately:

```bash
npm run server
# in another terminal
npm run buyer -- http://127.0.0.1:8402/paid
```

## Live mode is intentionally unavailable by default

This repository does not ship a real testnet chain identifier, genesis Momentum hash, checkpoint, or node authenticator. `buildRequirement('zenon')` requires an explicit programmatic chain profile, and the default client and facilitator have no implementation that can authenticate that profile against the connected chain. The command-line entry points therefore cannot enable a live session from `.env` alone.

The live adapter remains fail-closed. Do not use it with real funds, mainnet, or a valuable wallet.

### Experimental chain profile

Every selected Zenon payment requirement includes:

```json
{
  "poc": true,
  "settlement": "account-block",
  "zenonChain": {
    "version": 1,
    "chainIdentifier": "<canonical-nonzero-decimal-string>",
    "genesisMomentumHash": "<64-lowercase-hex>"
  }
}
```

The complete selected requirement, including this profile, is committed by the payment-intent digest in the signed account block. The signed block's `chainIdentifier` must equal the profile value.

`network: "zenon:testnet"` is only an experimental descriptive label. It is not a CAIP-2 claim and does not authenticate a chain. Exact chain identity requires both the chain identifier and the genesis identity to be authenticated within the owned SDK session. The configured SDK network ID and node self-reports are not sufficient evidence.

Mock mode uses `network: "zenon:mock"` and an explicitly reserved synthetic profile. That profile is rejected for live requirements.

## Safety foundation

### Exact amount rule

Amounts are canonical positive decimal strings in atomic units. The maximum accepted amount is `2^255 - 1`, matching canonical go-zenon account-block validation. Zero, signs, leading zeroes, fractions, exponent notation, whitespace and `2^255` or greater are rejected.

### Offline preflight

Both `verify()` and `settle()` run the same strict offline preflight before opening an SDK connection. It validates exact object shapes, x402 version, network label, an HTTPS live resource URL, full requirement equality, resource binding, chain profile, account-block fields, recipient, ZTS, amount, intent digest, locally reconstructed hash, strict Ed25519 signature, payer/public-key binding, and block/profile chain-identifier equality.

Token lookup, node readiness, frontier lookup and unconfirmed-block inspection occur only after offline cryptographic validation succeeds.

### SDK ownership and deadlines

The installed TypeScript SDK keeps mutable process-global connection and chain configuration. One module-wide FIFO owner therefore protects every live buyer and facilitator SDK lifecycle across all instances. Settlement acquires the per-payer queue before the global SDK owner; no code acquires them in the opposite order.

Simple live RPC observations and publication have bounded local waits. The SDK cannot reliably cancel an in-flight request, so any such deadline permanently poisons live SDK use in that Node.js process before ownership is released. Connection teardown is best effort, the underlying operation is not claimed to be cancelled, queued and future live sessions fail with `live_runtime_poisoned_restart_required`, and a process restart is required.

An unexpected SDK connection-cleanup failure also poisons the runtime before ownership is released; later live sessions are never allowed to reuse uncertain singleton state.

`prepareBlock()` is a composite operation containing SDK RPC and possible PoW. It is not wrapped in a superficial timeout; the global owner remains held until it completes or throws.

### Journal and retry behavior

Live settlement uses a versioned journal under the ignored `.runtime/` directory. After node-dependent pre-publication checks and before publication, it records the exact validated signed block, transaction and authorization identities, resource and chain-profile commitments, and the `VALIDATED` evidence state. Writes use a same-directory temporary file, file `fsync`, atomic rename, and directory sync where supported. Corrupt or malformed state fails closed. An initialization marker also makes a missing journal file fail closed after the first successful write; deleting both the journal and marker remains outside the guarantees of this local-file design.

The journal's default capacity is 256 records and it fails closed at capacity. It is a single-process, single-writer, single-host PoC mechanism. It is not a distributed lock and does not provide universal exactly-once execution.

The evidence and delivery states are:

- `VALIDATED`: offline validation succeeded; after node-dependent checks, the same evidence is durably recorded before any publication attempt;
- `SUBMISSION_ACKNOWLEDGED`: `publishRawTransaction()` returned successfully, or the exact block was observed without inclusion details;
- `SUBMISSION_OUTCOME_UNKNOWN`: publication may have reached the node, but its outcome was not established;
- `MOMENTUM_INCLUDED`: RPC lookup returned the exact block with `confirmationDetail`;
- `DELIVERY_PENDING`: an exclusive delivery claim was durably recorded; callback execution may have begun;
- `DELIVERED`: a response was recorded and can be returned on retry.

Known evidence is not downgraded after a transient lookup failure. A publication timeout is never described as a definite rejection. HTTP returns a PoC-specific `409` recovery response with `PAYMENT-RESPONSE`, `retrySamePayment: true`, and an instruction to reuse and reconcile the same payment rather than create another transaction. An uncertain payment does not release the resource.

Concurrent duplicate requests in one resource-server process converge on one in-flight settlement and delivery operation. A delivered response is cached and returned without republishing or rerunning the callback. Cached response bodies are stored as plaintext JSON in the local journal and are limited to 64 KiB, so operators must protect the runtime directory and must not use it for sensitive resource content. There remains a crash window after an arbitrary resource callback performs a side effect but before `DELIVERED` is durably recorded; the journal does not justify an exactly-once claim.

Live payment resource URLs must use HTTPS. The buyer does not follow redirects while carrying `PAYMENT-SIGNATURE`; a redirect, transport failure, or missing/mismatched settlement response after submission is treated as an uncertain outcome that retains the same payment for reconciliation. Every `/paid` response is marked `private, no-store` and varies on `PAYMENT-SIGNATURE` so shared HTTP caches cannot bypass the payment boundary.

### Node-dependent checks

When a future integration supplies a real chain-profile authenticator, the facilitator also requires `SyncState.SyncDone`, compares the frontier Momentum chain identifier with the requirement profile and signed block, validates non-native token metadata, checks the payer frontier, and inspects all unconfirmed pages implied by the node's `Count` value. Inspection is bounded to 200 blocks and fails closed for malformed, inconsistent, excessive or unavailable results. A page-zero recheck detects some concurrent changes, but it is not an atomic snapshot.

RPC polling remains authoritative for inclusion observation. Subscriptions are wake-up hints only and are cleaned up by closing the owned connection.

## Confirmation semantics

`MOMENTUM_INCLUDED` means only that the queried node returned the exact account block with a non-empty `confirmationDetail`. It is not a claim of irreversible finality, independently verified canonicality, or merchant receipt. The recipient's receive account block is a separate protocol event.

## Important limitations

- No authenticated live chain profile or real live profile ships in this repository.
- The RPC node remains a trust boundary; no SPV or checkpoint verification is implemented.
- The journal and queues coordinate one process on one host only.
- Other facilitators, buyer-side concurrent preparation and external publishers can still advance the same payer frontier.
- Account-frontier and unconfirmed views can become stale after observation.
- The mock does not model live RPC, SDK singleton behavior, consensus validation, Plasma/PoW or genuine Momentum inclusion.
- No audited binary payment-intent encoding or formal Zenon x402 network namespace exists.
- No rate limiting, RPC failover, distributed lock or production database is included.
- Key-pair `clear()` is defense in depth; JavaScript memory zeroization is not guaranteed.

## Repository structure

```text
src/
  buyer.js                 generic x402 paid-fetch flow
  resource-server.js       protected HTTP resource and retry boundary
  x402-wire.js             strict x402 wire/profile validation
  mock-payment.js          local mock client and facilitator
  zenon-payment.js         prepared-block client and live facilitator
  live-runtime.js          process-wide SDK ownership and poisoning
  settlement-journal.js    dependency-free recovery journal
  config.js                payment requirement configuration
test/
  e2e.test.js
  security.test.js
  wire-profile.test.js
  live-runtime.test.js
  journal.test.js
  http-recovery.test.js
  conformance.test.js
docs/
  IMPLEMENTATION_PLAN.md
  UPSTREAM_X402.md
  UPSTREAM_ZENON_SDK.md
SECURITY.md
```

## Next target

The next live milestone is an independently verifiable chain-profile authenticator anchored to authoritative genesis or checkpoint data. A production design also needs an explicit-session SDK or facilitator runtime, durable multi-process settlement state, deeper confirmation policy, and official x402 integration tests.
