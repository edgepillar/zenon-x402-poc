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

The CLI supplies one exact, internally pinned historical testnet profile under an explicit operator-trust policy. `zenon:testnet` remains descriptive, not authenticated chain identity and not a claim of registered CAIP-2 naming. The policy checks a pinned five-field height-2 identity tuple before signing or publication, but it does not authenticate the RPC endpoint, verify the remaining Momentum fields, or prove linkage to the observed frontier. Equal chain identifiers alone still do not distinguish chains with different genesis Momentums.

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

After `publish()` returns its asynchronous request promise, every promise rejection is reconciled by exact transaction lookup. If the exact block is not observed, the result remains `SUBMISSION_OUTCOME_UNKNOWN` whether the rejection appears to be a timeout, transport failure, or node-side refusal. A synchronous throw before the request promise is returned is a definite local pre-submission failure. The exact signed block is durably recorded first and must be reused for reconciliation.

`prepareBlock()` is not given a superficial whole-operation deadline. It may perform internal RPC calls and PoW, so the global SDK owner remains held until the composite call settles.

### Durable PoC journal

The ignored `.runtime/settlement-journal.json` file stores a versioned, checksummed set of exact payment attempts. Same-directory temporary writes, file sync, atomic rename and directory sync protect each revision where the operating system supports them. An initialization marker detects a missing state file after the first successful write. Invalid state fails closed; deletion of both state and marker is outside this local-filesystem trust model. Schema v1 remains readable and is not upgraded to v2 by reads, ordinary updates, or disabled retention. The first successful tombstone conversion atomically writes schema v2 in one revision and extends the checksum over active records and tombstones. Rollback to a v1-only reader is unsupported after v2 appears.

The journal has a default active-record capacity of 256 and a fixed separate tombstone capacity of 4096. Both maps remain inside `maxFileBytes`; tombstones participate permanently in replay and uniqueness checks and are not silently evicted or archived. Capacity failure preserves the full record. The journal is single-process, single-writer and single-host. Cached resource responses are plaintext JSON limited to 64 KiB. It does not implement distributed locking or production exactly-once delivery.

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

`reconciliationRetentionMs` is a constructor-only opt-in, defaulting to `null`, with an inclusive enabled range of 3,600,000 through 2,592,000,000 milliseconds. Only explicit zero-argument `runReconciliationMaintenance()` calls evaluate persisted `createdAt`; ordinary requests, startup, environment configuration, and background work do not. Each serial call examines at most 64 deterministic candidates. Backward clock movement delays terminalization, while a forward jump can terminalize early.

Maintenance queries only the exact transaction hash. Included evidence advances the full record to `MOMENTUM_INCLUDED`, exact unconfirmed evidence advances it to `SUBMISSION_ACKNOWLEDGED` when stronger, and unavailable lookup retains it. Only exact absence after age can atomically replace an eligible `NONE`-delivery record with a tombstone. Existing tombstones are rechecked during explicit maintenance even when new terminalization is disabled; first late inclusion is recorded without invoking delivery or authorizing retry, resource access, refund, credit, or replacement.

Candidate enumeration releases the journal writer before lock acquisition. Each candidate takes the payer queue before the process-global live-SDK owner and holds both through a fresh journal snapshot, exact-hash observation, and final compare-and-replace. The CAS rechecks the global revision and complete record identity/evidence/delivery state. This prevents same-process publication from crossing the final boundary but provides no distributed exclusion or restart-durable maintenance cursor.

An exact tombstone match returns a local response-only HTTP `402`: `PAYMENT-RESPONSE` contains bound network, transaction, payer, retained prior state, and fixed `payment_reconciliation_terminal`; `PAYMENT-REQUIRED` and retry are absent. The buyer accepts only that exact disjoint shape and creates no recovery owner. Malformed or mismatched terminal candidates fail closed, while the existing dual-header `payment_settlement_failed` `402` and recoverable `409` behavior remain unchanged. This is retention abandonment rather than inclusion, irreversible finality, supersession, or safe replacement authority. Installed official-parser behavior is characterization only, not standardization, official Zenon support, release, or activation.

Concurrent identical HTTP requests converge within one process. A `DELIVERED` cached response is returned without republishing or repeating the callback. Arbitrary external side effects still have a crash window between callback execution and the durable delivered record.

Live resources require HTTPS. The paid request uses manual redirect handling and treats redirects or unverifiable post-submission responses as uncertain. `/paid` responses are non-cacheable and vary on the payment header. Delivery requires an affirmative durable claim before the resource callback executes.

### Unconfirmed pagination

The facilitator reads every page implied by the RPC `Count`, rechecks the first page for a changing snapshot, and fails closed on malformed or incomplete results. The PoC accepts at most 200 unconfirmed blocks for one payer; larger results fail closed rather than enter an unbounded loop.

## Selected near-term path: operator-trusted historical observation

Issue #45 selected Path B as the bounded route to empirical testnet feedback. The CLI registry contains one immutable historical observation derived from the height-2 example in `zenon-network/znn-wiki` at the pinned 2021-12-17 source revision. The selector has no default or floating alias, accepts no environment-supplied chain-profile fields or trust-artifact URL, and requires the existing testnet-only acknowledgement plus a distinct operator-trust acknowledgement.

Inside the exclusively owned SDK session, the current policy requires exact agreement for:

1. the historical observation's Momentum version, height and identity;
2. its exact `chainIdentifier`;
3. its exact predecessor, used as the profile's `genesisMomentumHash` field;
4. the ordinary synchronized-frontier chain-identifier check.

This is a declared operator assumption, not authenticated chain identity. The source is unsigned, the predecessor observation does not independently prove current genesis semantics, and the RPC response does not prove continuity to the frontier. Honest mismatches or resets that alter the pinned tuple fail closed; forks after height 2 and disconnected or malicious RPC views are not detected. Path A remains the long-term research path: an authoritative trust artifact plus verified checkpoint/header linkage, SPV, or a light-client design belongs in the separate authenticated-policy path.

The current CLI supports one profile generation in the shared journal namespace. Profile rotation and rollback are unsupported. Before another profile can be selectable, journal state must be isolated and cross-profile maintenance, recovery, and rollback behavior must be tested.

The offline wiring does not complete Issue #45. A separate operational gate must use a disposable, minimally funded testnet wallet, perform the first real settlement and delivery, and publish the agreed verification evidence. No such live run is claimed here.

## Intermediate local four-node devnet lane

The first devnet slice is an offline preparation boundary, not a selectable runtime profile. `src/zenon/operator-trusted-local-devnet-profile.js` parses one exact canonical `operator-trusted-self-created-local-four-node-devnet-v1` artifact and validates a supplied chain observation without RPC access. The artifact fixes its own acknowledgement, chain identifier 69, generated genesis predecessor and height-two Momentum, external-generator repository and immutable revision, node source repository and immutable revision, and container image by `sha256` digest. It has no environment override, floating image tag, endpoint, path, wallet, credential, node key, payment, transaction, or signature field.

The dedicated check requires the frontier and height-two observations to agree with that artifact and returns branded non-authenticating evidence. This establishes only internal consistency for operator-supplied declarations. It does not authenticate the generator, source revision, container contents, RPC endpoint, chain identity, genesis, or frontier lineage. The fixed semantic claim is reproducible equivalent behavior rather than byte-for-byte recreation of a private network whose timestamps and secret random material change per generation.

"Four-node" names the intended external operator workflow only; the artifact does not verify node count, roles, topology, or a topology digest. The exact false nonclaim records that limitation; a topology schema is deliberately deferred beyond this slice.

The next offline-tested slice adds a closed two-family dispatcher and an artifact-bound local policy. The exported direct local observer and dispatcher consume genuine local policies and evidence, while direct `assertZenonNodeReady` is the only payment-readiness integration that accepts the local family. Direct readiness revalidates the evidence family and requires the exact current observer result after an injected read before accessing evidence fields. Module import and policy construction are side-effect-free and offline; direct policy observation and direct readiness invocation perform the injected node reads. The local adapter snapshots descriptor-safe SDK Momentum and fixed-length Hash data, captures the frontier before the single height-two query, rejects mutation after the await, and returns only same-family branded non-authenticating evidence. Policies and evidence, together with their copied fields, are detached and deeply frozen; validation uses detached normalized copied snapshots. The SDK frontier object is returned unchanged by readiness and is not claimed to be detached or frozen. Adapter-controlled Promise handling uses captured intrinsics, but it cannot undo thenable assimilation or other behavior already performed inside an injected SDK method before that method returns a genuine native Promise. Local evidence does not populate `authenticatedProfile`.

The existing public-testnet selector, acknowledgements, ordinary CLIs, role probe, owned payment sessions, client, facilitator, and Gate-B runner remain public-testnet-only. No existing ordinary CLI, public runner, environment alias, package script, default, or payment runtime constructor selects the local policy, and SDK network-ID behavior is unchanged. Ordinary valid public-testnet selection and payment semantics remain unchanged; this bridge deliberately adds a non-enumerable readiness-result assimilation shield and earlier rejection for hostile inputs. This is offline-tested, runtime-unregistered readiness plumbing, not runtime activation or authenticated chain identity.

The next narrow slice adds only a dedicated explicit opt-in local-devnet readiness runner, its fixed-output CLI, one internal Worker, focused tests, and these documentation updates. The public API accepts one descriptor-validated opaque options object and resolves only primitive `true`. Parent import and preflight perform no network I/O. A run requires the genuine artifact and exact acknowledgement, a restrictive current-directory artifact file opened and read through one checked descriptor generation, a bounded timeout, and exactly `ws://127.0.0.1:<non-default-port>/` or `ws://[::1]:<non-default-port>/`. The canonical decimal port must be explicit and cannot be 80, and the trailing slash is required. Hostnames and DNS, `wss`, credentials, implicit or default ports, alternate encodings, extra paths, queries, fragments, percent encoding, whitespace, and other noncanonical forms are rejected. Direct invocation uses only `node src/local-devnet-readiness-runner-cli.js` with exactly one each of `--artifact-file`, `--rpc-url`, `--acknowledgement`, and `--timeout-ms`; no package script, environment alias, existing selector, ordinary CLI, or public runner is changed.

Each invocation uses one single-use Worker and a new non-singleton SDK client. Reconnect and redirect behavior are disabled, Worker output is captured and discarded under a bound, and the read adapter exposes only network information, sync information, frontier Momentum, and the exact height-two query needed by `assertZenonNodeReady`. A successful run performs one connection and exactly four ordered readiness reads. It mutates neither SDK NetworkID nor ChainID, closes the SDK client once, and returns success only after Worker exit and both output-pipe close barriers are proven. Timeout, protocol ambiguity, hostile SDK shapes, unsafe close, or unproven destruction fails closed; unproven destruction poisons later use in that parent. Adapter-controlled native-Promise settlement cannot undo behavior already performed inside the pinned SDK producer before the genuine Promise is returned.

This slice operationalizes readiness only. It has no wallet, funding, signing, block construction, publication, facilitator, buyer/server HTTP, protected-resource delivery, journal, live-evidence capture or bundle, proof, or payment capability. The artifact, builder and runtime provenance, chain observations, and intended four-node label remain operator-trusted and non-authenticating; `fourNodeTopologyVerified` remains false. It does not authenticate identity or topology, activate a runtime lane, prove a public-testnet Gate B run, release a feature, or establish production readiness. Even a later successful local readiness run remains an intermediate milestone and cannot close Issue #45.

`0x3639/testnet` stays an external operator tool: no code is copied, vendored, patched, redistributed, or added as a dependency. A later payment/evidence runner design must separately resolve the descriptive network label, SDK network-ID binding, local acknowledgement, loopback-only transport, the external tool's seed-plus-four-pillar/five-service workflow description, immutable image provenance, protected operator material, isolated journal/evidence state, and devnet evidence classification. `fourNodeTopologyVerified` remains false unless topology is independently authenticated. Wallets, credentials, node keys, endpoints, paths, transactions, signatures, Docker outputs, and generated packages stay outside this repository/artifact boundary. Even a successful local run is an intermediate milestone; it cannot close Issue #45 and does not replace the later public-testnet evidence gate.

## Issue #45 staged live-evidence work

PR A is the pure offline evidence contract only and is part of Issue #45 without closing it. Its six-path boundary adds `src/live-evidence.js`, `src/live-evidence-cli.js`, `test/live-evidence.test.js`, and narrow updates to `README.md`, `SECURITY.md`, and this plan. It changes no settlement, buyer, server, journal, wire, live-runtime, dependency, workflow, or ordinary CLI behavior.

Evidence version 1 uses five exact typed fragments: a manifest, an operator-supplied declared complete public account block and declared confirmation observation, a decoded HTTP exchange, an asserted final journal record, and externally captured timing assertions. Offline validation proves only structural and cryptographic consistency among those declared observations. It does not independently authenticate inclusion or finality, facilitator publication, HTTP delivery, or buyer receipt. Assembly requires one advertised offer at selected index zero, reuses the existing network-free Zenon preflight and binding primitives, cross-binds the signed block, resource, intent, authorization, confirmation, response and delivered journal state, and derives the descriptive Plasma/PoW class from signed fields. The verifier performs the same complete validation on a detached snapshot and never queries a node.

The parser detects duplicate decoded keys before object construction and applies exact schemas, descriptor-safe snapshots, bounded depth/count/byte limits, deterministic canonical JSON, eight section digests and one domain-separated final digest. Timing events are exact and once-only, sequences preserve the cross-role protocol edges, role-scoped monotonic clocks recompute durations, and UTC values supply only explicit correlation and ordering assertions. The template is a null checklist rather than a fragment or bundle. The file CLI exposes only `template`, `assemble`, and `verify`, accepts no environment, standard-input, network, wallet, journal or server capability, and emits fixed sanitized status lines.

PR B is the separate offline-tested operational-preparation slice and remains part of Issue #45 without closing it. Its ten-path boundary adds the import-safe observation, coordinator runner, fixed-output runner CLI, facilitator worker, and focused runner tests; it modifies only the optional lifecycle seams in `src/zenon-payment.js`, their live-settlement tests, and these three documentation files. It leaves the ordinary buyer/server CLIs, buyer and resource-server behavior, live runtime, settlement journal implementation/schema, PR-A contract/CLI/tests, configuration files, packages, dependencies, and workflows unchanged.

The runner has three logical roles in two processes. The coordinator owns the runner and buyer and privately retains the buyer module's process-local WeakMap recovery owner. A separately spawned facilitator child owns the facilitator SDK singleton, loopback resource server, fresh journal, and fixed protected-response delivery adapter. IPC carries exact, bounded, allowlisted, request-correlated and cause-free protocol data; secrets and recovery owners never cross it. A facilitator restart is allowed only after a poisoned child has acknowledged stop and its operating-system exit has been confirmed; coordinator loss after submission is armed permanently marks the evidence incomplete. PR B adds no persisted recovery capsule and no resume-without-signing interface.

The strict public config binds the exact operator-trusted profile, both acknowledgements, one expected challenge/offer, recovery limits, and the public HTTPS `/paid` resource. Three separate owner-only files hold buyer RPC, buyer wallet and facilitator RPC inputs under one protected workspace. Component-wise path checks, safe-open generation checks, bounded reads, private modes, link/alias rejection and atomic output rules apply. Public DNS answers must be globally routable, resolve under a deadline, and remain pinned to the subsequent HTTPS health/challenge/payment/reconciliation requests. The operator remains responsible for external TLS ingress; PR B neither provisions nor contacts it in tests.

Run mode performs buyer and facilitator wallet-free readiness before listening or signing, then requires the exact health and 402 challenge before the coordinator reads the disposable wallet. Observation is branded, synchronous, payload-free, free-form-metadata-free and default-off. It captures the exact 21 PR-A phases at their true lifecycle boundaries, with coordinator-assigned global sequence, role-local monotonic clocks and absolute UTC assertions. Inclusion UTC is captured exactly once when valid inclusion is first observed and is reused by the inclusion event and journal evidence without allowing an observer clock to choose durable data. Clock callbacks are never awaited and receive no receiver, payload, or free-form metadata; thrown or invalid results are contained without changing settlement, although arbitrary synchronous clock code can consume local execution time. Observation failure permanently makes the run nonpublishable.

Evidence version 1 accepts only an uninterrupted first-attempt success with every phase once. Same-payment recovery retains only each in-memory successor owner, never repeats challenge acquisition, wallet access, payment construction or signing, and has both attempt and absolute elapsed bounds. Every recovery, child restart, repeated phase, cached delivery, ambiguous publication acknowledgement, observer loss or crash is resolution-only and permanently ineligible for a version-1 bundle. If the coordinator dies after submission is armed, the journal remains protected for manual safe resolution and no replacement payment may be made.

The clean run starts from a schema-v1 revision-zero empty journal with maintenance disabled. After resource-server closure and quiescence, one final `SettlementJournal.load()` returns the coherent one-record snapshot; the runner never calls `list()`. The uninterrupted transition sequence fixes revision five: create, publication acknowledgement, inclusion, delivery pending and delivered. Schema v2, reused/multiple records, nonquiescence, unexpected generation or cached-response mismatch fail closed. PR-A's five fragments are parsed, assembled, verified and serialized fully in memory before the fixed private artifact set is written into a protected staging directory, fsynced and atomically renamed. PR B never publishes it.

Gate B is a separate authorization boundary for the actual public-testnet endpoint, a disposable, minimally funded, single-use wallet, one payment, live capture and deliberate publication of linkable evidence after human review. Its frozen publication package includes the complete exact six-field default protected response body rather than only a digest, plus absolute UTC correlation timestamps rather than relative-only timing. Gate B does not require Phase 2C or hardware-wallet support. PR B implementation and test validation perform no live run, and run mode remains default-off. Merging PR B does not release or activate the operational runner. Neither PR A nor PR B closes Issue #45, claims authenticated chain identity, enters Phase 2C, adds hardware-wallet support, or establishes production readiness.

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

Future isolated devnet tests should cover protected operator material, local-only exposure, fresh accounts, Plasma and PoW, sequential and conflicting preparations, process restart at every journal transition, delayed inclusion, node disconnect/reconnect and merchant receive. The committed offline artifact boundary must remain separate from the public-testnet policy, and no live-network integration test should run by default.
