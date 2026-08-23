# Zenon x402 Prototype

A research proof of concept that maps x402 v2 `exact` payments to payer-signed Zenon account blocks.

The buyer prepares and signs a normal Zenon `UserSend` account block without publishing it. The x402 payload carries that exact signed block. The facilitator validates it against the selected payment requirement, journals the attempt, publishes it, observes Momentum inclusion, and only then authorizes the protected resource.

This is not an official Zenon integration, not an official x402 network implementation, and not production software. Mock mode is the default. No stablecoin or production security guarantee is bundled.

## Current architecture status

The current `main` branch contains the v0.3 architecture checkpoint; this is not a v0.3 package or production release. The planner, wallet, Plasma, payment-mechanism, chain-profile, and settlement-repository interfaces are additive design boundaries. They document intended ownership and separation but are not wired into the active transaction path.

The active live Zenon buyer path still uses the legacy signed-composite behavior of `znn-typescript-sdk@1.0.5`: `prepareBlock(accountBlockTemplate, keyPair)` performs preparation, possible PoW, hashing, and signing. Phase 2A provides immutable golden and lifecycle characterization of that behavior. Phase 2B.1 routes the same call through a transparent internal legacy comparator seam without changing its semantics.

Phase 2C is deferred and remains `NO-GO`. No unsigned planner/wallet split or hardware-wallet integration is active. [digitalSloth/znn-typescript-sdk#31](https://github.com/digitalSloth/znn-typescript-sdk/issues/31) is an upstream staged-preparation proposal only; this codebase neither implements nor consumes the proposed API. This remains a research PoC, and production deployment remains `NO-GO`.

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
    | legacy SDK 1.0.5 signed-composite
    | prepareBlock(accountBlockTemplate, keyPair)
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

The additive `WalletAdapter`, `ZenonTransactionPlanner`, and `PlasmaStrategy` boundaries describe intended future ownership only; they are not active runtime components. The legacy composite SDK path remains active for live Zenon payments through the transparent Phase 2B.1 seam.

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
  "paymentFlow": "upfront",
  "settlement": "account-block",
  "zenonChain": {
    "version": 1,
    "chainIdentifier": "<canonical-nonzero-decimal-string>",
    "genesisMomentumHash": "<64-lowercase-hex>"
  }
}
```

Active HTTP Zenon payments use exactly `extra.paymentFlow: "upfront"`. Before selection, the buyer applies generic stable-v2 structural validation to every advertised offer. For a client with an immutable `paymentCapabilities` descriptor, multi-offer selection preserves advertised order and chooses the first offer matching that client's x402 version, scheme, network, and exact `upfront` flow. Structurally valid unsupported alternatives are skipped. A malformed offer, or strict Zenon validation failure for a claimed supported route, invalidates the challenge before payment construction.

The built-in mock and live clients advertise only their exact Zenon network and `upfront` route. A wrapper must explicitly copy that immutable descriptor to participate in multi-offer negotiation. Descriptor-less clients retain the existing single-offer behavior and reject multi-offer challenges as ambiguous. Selection performs no speculative signing, SDK initialization, RPC, PoW, settlement, or protected-resource delivery. For multi-offer construction, the client receives a detached view containing only the selected offer; success and recovery results retain the original challenge.

The resource server independently requires `upfront` before settlement or delivery. Here, `upfront` means successful settlement and Momentum inclusion precede release of the protected resource. Missing or non-upfront single offers remain rejected. The missing-field compatibility path is restricted to the existing single-offer Phase 2A characterization lane and is not enabled by ordinary runtime callers. This internal negotiation boundary is not a claim of complete stable-v2 compatibility, official x402 registration, an official Zenon network identifier, Phase 2C activation, hardware-wallet support, or production readiness.

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

### Compatibility characterization

The legacy comparator is locked to `znn-typescript-sdk@1.0.5`. Immutable Phase 2A fixtures and golden/lifecycle tests characterize transaction bytes, the account-block preimage and hash, public key and signature, mutation timing, RPC ordering, key and connection cleanup, timeout handling, runtime poisoning, and queued-owner behavior. Phase 2B.1 tests verify that the transparent internal seam remains on this active live PoC path.

These tests preserve the legacy baseline; they do not provide a supported unsigned-preparation or canonical-hash SDK API. The deterministic custom-provider PoW fixture characterizes legacy SDK behavior and is not evidence of a consensus-valid difficulty-17 PoW solution.

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

Known evidence is not downgraded after a transient lookup failure. A publication timeout is never described as a definite rejection. HTTP returns a PoC-specific `409` recovery response with `PAYMENT-RESPONSE`, `retrySamePayment: true`, and an instruction to reuse and reconcile the same payment rather than create another transaction.

A redacted `PAYMENT-RESPONSE` may accompany HTTP `402` only when the facilitator returns the exact compound evidence `success === false`, `state === "VALIDATED"`, `retrySamePayment === false`, and `deliveryState === "NONE"`, with exact network, transaction-hash, and canonical payer binding to the submitted payment. The public response uses the fixed reason `payment_settlement_failed`; facilitator error details and raw causes are not exposed, and `retrySamePayment` is omitted. Before submission, the buyer derives a detached, validated payment snapshot by decoding the exact encoded `PAYMENT-SIGNATURE` value that it will send. Settlement validation then binds the response network, transaction hash, and payer to that submitted snapshot.

A purported definite-`402` response with missing, malformed, additional, mismatched, ambiguous, wrongly statused, or unexpected evidence remains `payment_submission_outcome_unknown`. Other HTTP `402` responses are not implicitly definite. Valid HTTP `409` evidence remains the reuse-and-reconcile path for uncertain or recoverable outcomes. Neither an uncertain nor a definite failed payment releases the resource. This lane necessarily trusts the facilitator's exact compound state as evidence that publication and delivery were not attempted.

Concurrent duplicate requests in one resource-server process converge on one in-flight settlement and delivery operation. A delivered response is cached and returned without republishing or rerunning the callback. Cached response bodies are stored as plaintext JSON in the local journal and are limited to 64 KiB, so operators must protect the runtime directory and must not use it for sensitive resource content. There remains a crash window after an arbitrary resource callback performs a side effect but before `DELIVERED` is durably recorded; the journal does not justify an exactly-once claim.

Live payment resource URLs must use HTTPS. The buyer does not follow redirects while carrying `PAYMENT-SIGNATURE`; a redirect, transport failure, or missing/mismatched settlement response after submission is treated as an uncertain outcome that retains the same payment for reconciliation. Every `/paid` response is marked `private, no-store` and varies on `PAYMENT-SIGNATURE` so shared HTTP caches cannot bypass the payment boundary.

### Node-dependent checks

When a future integration supplies a real chain-profile authenticator, the facilitator also requires `SyncState.SyncDone`, compares the frontier Momentum chain identifier with the requirement profile and signed block, validates non-native token metadata, checks the payer frontier, and inspects all unconfirmed pages implied by the node's `Count` value. Inspection is bounded to 200 blocks and fails closed for malformed, inconsistent, excessive or unavailable results. A page-zero recheck detects some concurrent changes, but it is not an atomic snapshot.

RPC polling remains authoritative for inclusion observation. Subscriptions are wake-up hints only and are cleaned up by closing the owned connection.

## Confirmation semantics

`MOMENTUM_INCLUDED` means only that the queried node returned the exact account block with a non-empty `confirmationDetail`. It is not a claim of irreversible finality, independently verified canonicality, or merchant receipt. The recipient's receive account block is a separate protocol event.

## Important limitations

- Phase 2C is deferred and remains `NO-GO`; production deployment is also `NO-GO`.
- Hardware-wallet support is not implemented.
- The planner, wallet, Plasma, payment-mechanism, chain-profile, and settlement-repository boundaries are not wired into the active live Zenon transaction path.
- No supported public unsigned-preparation or canonical-account-block-hash SDK API is consumed.
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
  buyer.js                    generic x402 paid-fetch flow
  resource-server.js          protected HTTP resource and retry boundary
  x402-wire.js                strict x402 wire/profile validation
  mock-payment.js             local mock client and facilitator
  zenon-payment.js            active legacy client and live facilitator
  live-runtime.js             process-wide SDK ownership and poisoning
  settlement-journal.js       dependency-free recovery journal
  config.js                    payment requirement configuration
  settlement/
    settlement-repository.js  additive repository boundary
  x402/
    payment-mechanism.js      additive mechanism boundary
  zenon/
    chain-profile.js          additive chain-profile boundary
    wallet-adapter.js         additive wallet boundary
    transaction-planner.js    additive planner boundary
    plasma-strategy.js        additive Plasma boundary
    internal/
      legacy-sdk-1-0-5-signed-composite.js
                               active transparent legacy seam
test-support/
  phase2a-sdk-harness.js       isolated SDK/lifecycle harness
  phase2a-inputs.js            deterministic public scenario inputs
  phase2a-account-block-preimage.js
                               independent account-block preimage helper
test/
  fixtures/
    phase2a-exact-client-goldens.v1.json
                               immutable Phase 2A golden values
  architecture-boundaries.test.js
  conformance.test.js
  e2e.test.js
  journal.test.js
  live-runtime.test.js
  phase2a-exact-client-golden.test.js
  phase2a-exact-client-lifecycle.test.js
  phase2b1-legacy-sdk-signed-composite.test.js
  http-recovery.test.js
  live-settlement-integration.test.js
  security.test.js
  wire-profile.test.js
docs/
  IMPLEMENTATION_PLAN.md
  UPSTREAM_X402.md
  UPSTREAM_ZENON_SDK.md
SECURITY.md
```

## Next target

Future work has two separate lanes:

1. Near-term work continues x402 correctness, interoperability, and operational hardening on the frozen legacy signing baseline.
2. A separately approved Phase 2C remains gated on a supported upstream unsigned-preparation and canonical-hash API, a wallet identity/lease/disposal and cleanup contract, and a separately versioned successor characterization suite.

Production prerequisites across either lane include independently authenticated chain-profile verification, durable multi-process settlement, an explicit confirmation policy, and official interoperability testing. Phase 2C and hardware-wallet work are not required for the current mock x402 flow.
