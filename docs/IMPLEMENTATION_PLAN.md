# Implementation plan: first-class Zenon support in x402

## Scope

The current prototype explores:

- x402 v2;
- scheme `exact`;
- an experimental Zenon network family;
- concrete ZTS transfers represented by a payer-signed, unpublished `UserSend` account block;
- a self-hosted facilitator that never receives payer private keys.

No go-zenon consensus change or hypothetical sequence-independent authorization primitive is assumed.

## Current v0.2 payload and requirement

The mechanism payload is:

```ts
type ExactZenonPayloadV2 = {
  transaction: ZenonAccountBlockJson;
  intentDigest: string;
};
```

The selected requirement uses the ordinary x402 fields plus an exact chain profile:

```json
{
  "scheme": "exact",
  "network": "zenon:testnet",
  "asset": "zts1...",
  "amount": "<canonical-positive-atomic-integer>",
  "payTo": "z1...",
  "maxTimeoutSeconds": 60,
  "extra": {
    "poc": true,
    "paymentFlow": "upfront",
    "settlement": "account-block",
    "zenonChain": {
      "version": 1,
      "chainIdentifier": "<canonical-nonzero-decimal-string>",
      "genesisMomentumHash": "<64-lowercase-hex>"
    }
  }
}
```

The repository intentionally supplies no real live profile. `zenon:testnet` is descriptive, not authenticated chain identity and not a claim of registered CAIP-2 naming. A valid live design must authenticate both profile values; equal chain identifiers alone do not distinguish chains with different genesis Momentums.

The amount range is `1` through `2^255 - 1` atomic units. This is narrower than the account-block hash's 32-byte amount field because canonical go-zenon validation rejects values with a bit length above 255.

The intent digest covers the complete selected requirement and resource. Before standardization, generic JSON canonicalization should be replaced with a specified, domain-separated encoding and portable conformance vectors.

### Implemented local offer-selection boundary

The buyer applies generic stable-v2 structural validation to every advertised offer before selection. Built-in mock and live clients expose deeply immutable, client-owned `paymentCapabilities` descriptors for their exact scheme, local Zenon network label, and `upfront` flow. Multi-offer selection preserves order, skips structurally valid unsupported alternatives, and selects the first route matching the client's x402 version, scheme, network, and exact `upfront` flow. A claimed supported route receives complete strict Zenon validation; failure invalidates the challenge before payment construction.

A descriptor-less client retains existing single-offer behavior and rejects multi-offer challenges as ambiguous. Wrappers must explicitly copy the immutable descriptor to support multiple offers. Selection performs no speculative signing, SDK initialization, RPC, PoW, settlement, or protected-resource delivery. For both single-offer and multi-offer challenges, payment construction receives a detached view containing only the selected offer. Success and recovery retain the untouched original challenge, so mutation of the client-owned view cannot change the authoritative resource or selected requirement. The missing-flow option is restricted to the existing single-offer Phase 2A characterization lane.

This is a narrow internal compatibility boundary, not a replacement for official registered scheme handlers and not a claim of complete stable-v2 compatibility, official x402 or Zenon network registration, Phase 2C activation, hardware-wallet support, or production readiness.

## Implemented live-safety foundation

### Offline preflight

`verify()` and `settle()` call the same strict offline preflight before RPC. Direct settlement therefore cannot bypass envelope, requirement, profile, HTTPS live-resource, block, hash, signature, payer, recipient, asset or amount validation.

### Two ordering layers

```text
canonical payer queue
    |
    v
process-wide SDK owner
    |
    v
configure -> connect -> RPC/prepare -> close -> release
```

The payer queue orders logically competing settlements within one facilitator instance. The global owner protects the TypeScript SDK's mutable singleton across all buyer and facilitator instances. The enforced lock order is payer queue before global SDK owner. Client preparation and standalone verification acquire only the global owner.

This serializes one Node.js process, not other processes, facilitators or publishers.

### Fail-closed timeouts

Simple reads and publication have bounded local waits. Because SDK requests are not cancellable, a timeout poisons the process-wide live runtime before ownership release. Teardown is best effort, queued and future owners fail, and the process must restart. An unexpected cleanup failure also poisons the runtime before release. The code does not claim the late request was cancelled.

Publication timeout is `SUBMISSION_OUTCOME_UNKNOWN`, never a definite failure. The exact signed block is durably recorded first and must be reused for reconciliation.

`prepareBlock()` is not given a superficial whole-operation deadline. It may perform internal RPC calls and PoW, so the global SDK owner remains held until the composite call settles.

### Durable PoC journal

The ignored `.runtime/settlement-journal.json` file stores a versioned, checksummed set of exact payment attempts. Same-directory temporary writes, file sync, atomic rename and directory sync protect each revision where the operating system supports them. An initialization marker detects a missing state file after the first successful write. Invalid state fails closed; deletion of both state and marker is outside this local-filesystem trust model.

The journal has a default capacity of 256 records, is single-process, single-writer and single-host, and fails closed at capacity. Cached resource responses are plaintext JSON limited to 64 KiB. It does not implement distributed locking or production exactly-once delivery.

### Evidence and delivery

Internal states describe evidence rather than assumed finality:

```text
VALIDATED (offline checks complete; journaled before publication)
    |
    +--> SUBMISSION_OUTCOME_UNKNOWN
    |
    v
SUBMISSION_ACKNOWLEDGED
    |
    v
MOMENTUM_INCLUDED
    |
    v
DELIVERY_PENDING (claim recorded; execution may have begun)
    |
    v
DELIVERED
```

An account lookup showing `confirmationDetail` establishes only `MOMENTUM_INCLUDED` under the current node-observation policy. It does not prove irreversible finality or merchant receipt. Observed inclusion evidence is never downgraded by a later transient lookup failure.

The HTTP boundary returns a distinct `409` recovery response for uncertain or pending outcomes. It directs the buyer to reuse and reconcile the same payment. It does not release the protected resource.

Concurrent identical HTTP requests converge within one process. A `DELIVERED` cached response is returned without republishing or repeating the callback. Arbitrary external side effects still have a crash window between callback execution and the durable delivered record.

Live resources require HTTPS. The paid request uses manual redirect handling and treats redirects or unverifiable post-submission responses as uncertain. `/paid` responses are non-cacheable and vary on the payment header. Delivery requires an affirmative durable claim before the resource callback executes.

### Unconfirmed pagination

The facilitator reads every page implied by the RPC `Count`, rechecks the first page for a changing snapshot, and fails closed on malformed or incomplete results. The PoC accepts at most 200 unconfirmed blocks for one payer; larger results fail closed rather than enter an unbounded loop.

## Immediate next milestone: authenticated chain identity

The default live path deliberately remains unavailable. The next patch must introduce a defensible authenticator for an explicitly supplied profile without embedding an invented or weakly sourced network constant.

The authenticator should establish, inside the exclusively owned SDK session:

1. the exact `chainIdentifier`;
2. the exact genesis Momentum identity;
3. the provenance and version of the trust anchor;
4. linkage from the trusted genesis or checkpoint to the observed chain.

An authoritative node API, verified checkpoint scheme, SPV implementation or light-client design may supply this evidence. SDK configuration and RPC self-reporting cannot.

## Frontier architecture

`prepareBlock()` fixes `height` and `previousHash`. Two payments prepared from one payer frontier can conflict.

### Current mitigation: process-local ordering

The facilitator reconciles a previously known transaction before applying a new frontier-sensitive publication check. The canonical per-payer queue orders one facilitator instance, while the global SDK owner serializes live sessions across instances in the process. Bounded unconfirmed inspection rejects a conflicting node-observed block, but cannot make the node view atomic.

This cannot serialize buyer-side preparation, another process, another facilitator, a stale node view or an independent publisher.

### Near-term option: payment subaccounts

Agents can derive multiple payment accounts and serialize within each one. This uses existing protocol behavior but requires liquidity and Plasma management.

### Long-term research

A native sequence-independent authorization or escrow/voucher scheme could remove frontier coupling. Neither is an existing Zenon primitive assumed by this prototype, and each requires separate protocol design and security review.

## Plasma and signing

`prepareBlock()` can perform PoW when fused Plasma is insufficient. Production agent UX may need pre-fused payment accounts, provisioned subaccounts or an explicitly designed sponsorship mechanism.

The buyer or approval UI should display the actual account block being signed: recipient, concrete ZTS, amount, chain profile, account frontier, intent/resource digest and any Plasma/PoW fields. It should not authorize only the server-provided prose.

## First-class x402 package target

An upstream package should implement the official client, server and facilitator interfaces rather than maintaining custom core HTTP helpers:

```text
packages/mechanisms/zenon/
  src/
    exact/
      client/scheme.ts
      server/scheme.ts
      facilitator/scheme.ts
    types.ts
    signer.ts
    index.ts
```

Zenon-specific address, ZTS, block-hash, signature, frontier, Plasma/PoW, publication and observation policy belongs in that package, not x402 core.

Before publishing network defaults, establish canonical namespace/reference naming and immutable profile metadata. The label alone must never substitute for chain identity.

## Production requirements

A production facilitator still needs:

- an authenticated chain trust root and independently verified inclusion policy;
- explicit client sessions rather than a mutable SDK singleton, or a Go service with clear lifecycle ownership;
- cancellable RPC with deadlines below the transport;
- a transactional multi-process database and distributed coordination;
- durable entitlement/delivery design appropriate to each resource side effect;
- rate limiting, RPC failover and operational telemetry without wallet secrets;
- an explicit confirmation-depth and reorganization policy;
- merchant receive-account-block handling where the business requires it;
- an audited payment-intent encoding and x402 conformance suite.

## Test roadmap

The local suite covers strict wire shapes, amount/profile boundaries, hash/signature reconstruction, offline preflight, singleton ownership, poisoning, journal corruption/reload, state monotonicity, pagination, retries, duplicate delivery and ambiguous HTTP outcomes.

Future isolated devnet tests should cover fresh accounts, Plasma and PoW, sequential and conflicting preparations, process restart at every journal transition, delayed inclusion, node disconnect/reconnect and merchant receive. No live-network integration test should run by default.
