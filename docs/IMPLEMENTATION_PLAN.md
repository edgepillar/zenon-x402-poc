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

The first devnet slice defines the canonical local profile artifact and its offline observation checks. Ordinary buyer and server CLIs can select that family only through the closed, default-off selector with the exact local lane, a genuine canonical artifact, the exact local acknowledgement, and a canonical loopback WebSocket RPC input. Selection has no alias or fallback and permits ordinary runtime construction, requirement construction, server setup, and direct readiness wiring, but the owned live SDK session rejects the local policy before SDK effects. `src/zenon/operator-trusted-local-devnet-profile.js` parses one exact canonical `operator-trusted-self-created-local-four-node-devnet-v1` artifact and validates a supplied chain observation without RPC access. The artifact fixes its own acknowledgement, chain identifier 69, generated genesis predecessor and height-two Momentum, external-generator repository and immutable revision, node source repository and immutable revision, and container image by `sha256` digest. It has no environment override, floating image tag, endpoint, path, wallet, credential, node key, payment, transaction, or signature field.

The dedicated check requires the frontier and height-two observations to agree with that artifact and returns branded non-authenticating evidence. This establishes only internal consistency for operator-supplied declarations. It does not authenticate the generator, source revision, container contents, RPC endpoint, chain identity, genesis, or frontier lineage. The fixed semantic claim is reproducible equivalent behavior rather than byte-for-byte recreation of a private network whose timestamps and secret random material change per generation.

"Four-node" names the intended external operator workflow only; the artifact does not verify node count, roles, topology, or a topology digest. The exact false nonclaim records that limitation; a topology schema is deliberately deferred beyond this slice.

The merged, offline-tested policy-bridge slice adds a closed two-family dispatcher and an artifact-bound local policy. The exported direct local observer and dispatcher consume genuine local policies and evidence, while direct `assertZenonNodeReady` is the only payment-readiness integration that accepts the local family. Direct readiness revalidates the evidence family and requires the exact current observer result after an injected read before accessing evidence fields. Module import and policy construction are side-effect-free and offline; direct policy observation and direct readiness invocation perform the injected node reads. The local adapter snapshots descriptor-safe SDK Momentum and fixed-length Hash data, captures the frontier before the single height-two query, rejects mutation after the await, and returns only same-family branded non-authenticating evidence. Policies and evidence, together with their copied fields, are detached and deeply frozen; validation uses detached normalized copied snapshots. The SDK frontier object is returned unchanged by readiness and is not claimed to be detached or frozen. Adapter-controlled Promise handling uses captured intrinsics, but it cannot undo thenable assimilation or other behavior already performed inside an injected SDK method before that method returns a genuine native Promise. Local evidence does not populate `authenticatedProfile`.

The closed ordinary CLI selector supports two exact families without aliases or fallback. Public-testnet selection retains its existing profile and acknowledgements. Local selection requires the exact local lane, genuine canonical artifact, exact local acknowledgement, and validated canonical loopback RPC input. The client and facilitator constructors accept only the matching local-policy/RPC pair, while owned live sessions, the role probe, and the Gate-B runner remain public-testnet-only. Ordinary valid public-testnet selection and payment semantics remain unchanged; SDK network-ID behavior is unchanged. The bridge retains the non-enumerable readiness-result assimilation shield and earlier hostile-input rejection. At the owned live-session boundary this remains offline-tested, runtime-unregistered readiness plumbing, so the local lane provides no payment/evidence execution, authenticated chain identity, release, activation, production readiness, or Issue #45 completion.

The merged, offline-tested readiness-runner slice adds only a dedicated explicit opt-in local-devnet readiness runner, its fixed-output CLI, one internal Worker, focused tests, and these documentation updates. The public API accepts one descriptor-validated opaque options object and resolves only primitive `true`. Parent import and preflight perform no network I/O. A run requires the genuine artifact and exact acknowledgement, a restrictive current-directory artifact file opened and read through one checked descriptor generation, a bounded timeout, and exactly `ws://127.0.0.1:<non-default-port>/` or `ws://[::1]:<non-default-port>/`. The canonical decimal port must be explicit and cannot be 80, and the trailing slash is required. Hostnames and DNS, `wss`, credentials, implicit or default ports, alternate encodings, extra paths, queries, fragments, percent encoding, whitespace, and other noncanonical forms are rejected. Direct invocation uses only `node src/local-devnet-readiness-runner-cli.js` with exactly one each of `--artifact-file`, `--rpc-url`, `--acknowledgement`, and `--timeout-ms`. That readiness-runner slice did not add a package script, environment alias, selector, ordinary CLI, or public runner; the later closed selector permits explicit local policy selection for ordinary runtime construction but does not register or invoke this runner.

Each invocation uses one single-use Worker and a new non-singleton SDK client. Reconnect and redirect behavior are disabled, Worker output is captured and discarded under a bound, and the read adapter exposes only network information, sync information, frontier Momentum, and the exact height-two query needed by `assertZenonNodeReady`. A successful run performs one connection and exactly four ordered readiness reads. It mutates neither SDK NetworkID nor ChainID, closes the SDK client once, and returns success only after Worker exit and both output-pipe close barriers are proven. Timeout, protocol ambiguity, hostile SDK shapes, unsafe close, or unproven destruction fails closed; unproven destruction poisons later use in that parent. Adapter-controlled native-Promise settlement cannot undo behavior already performed inside the pinned SDK producer before the genuine Promise is returned.

This slice operationalizes readiness only. It has no wallet, funding, signing, block construction, publication, facilitator, buyer/server HTTP, protected-resource delivery, journal, live-evidence capture or bundle, proof, or payment capability. The artifact, builder and runtime provenance, chain observations, and intended four-node label remain operator-trusted and non-authenticating; `fourNodeTopologyVerified` remains false. It does not authenticate identity or topology, activate a runtime lane, prove a public-testnet Gate B run, release a feature, or establish production readiness. Even a later successful local readiness run remains an intermediate milestone and cannot complete Issue #45.

`0x3639/testnet` stays an external operator tool: no code is copied, vendored, patched, redistributed, or added as a dependency. A later payment/evidence runner design must separately resolve the descriptive network label, SDK network-ID binding, local acknowledgement, loopback-only transport, the external tool's seed-plus-four-pillar/five-service workflow description, immutable image provenance, protected operator material, isolated journal/evidence state, and devnet evidence classification. `fourNodeTopologyVerified` remains false unless topology is independently authenticated. Wallets, credentials, node keys, endpoints, paths, transactions, signatures, Docker outputs, and generated packages stay outside this repository/artifact boundary. Even a successful local run is an intermediate milestone; it cannot complete Issue #45 and does not replace the later public-testnet evidence gate.

## Issue #45 staged live-evidence work

| Milestone | Repository status | Validation status | Operational boundary |
| --- | --- | --- | --- |
| Historical public-testnet profile | `MERGED` | `OFFLINE_TESTED` | `NOT_AUTHENTICATING` |
| Offline evidence contract | `MERGED` | `OFFLINE_TESTED` | `NOT_ACTIVATED` |
| Operational evidence runner | `MERGED` | `OFFLINE_TESTED` | `NOT_ACTIVATED` |
| Local artifact and explicit policy selection | `MERGED` | `OFFLINE_TESTED` | `EXPLICIT_DEFAULT_OFF` |
| Local readiness runner | `MERGED` | `OFFLINE_TESTED` | `RUNTIME_UNREGISTERED` |
| Public-testnet Gate B | `WS_ONCE_OFFLINE_TESTED` | `NOT_EXECUTED` | `ISSUE_45_OPEN` |

These status tokens describe repository integration and offline validation only. Merged work is not released, enabled by default, or live-tested. The historical public-testnet profile and operational runner remain behind their exact explicit opt-in gates. The local policy is explicitly selectable through the closed ordinary CLI selector, but the separate readiness runner remains runtime-unregistered and owned live sessions remain public-testnet-only. Operator-trusted evidence does not authenticate chain identity, local topology remains unverified, local readiness cannot replace public-testnet Gate B, and no live Gate-B run has occurred.

PR A is the merged, offline-tested pure evidence contract only and is part of Issue #45 without completing it. It is not activated and has not been live-executed. Its six-path boundary adds `src/live-evidence.js`, `src/live-evidence-cli.js`, `test/live-evidence.test.js`, and narrow updates to `README.md`, `SECURITY.md`, and this plan. It changes no settlement, buyer, server, journal, wire, live-runtime, dependency, workflow, or ordinary CLI behavior.

Evidence version 1 uses five exact typed fragments: a manifest, an operator-supplied declared complete public account block and declared confirmation observation, a decoded HTTP exchange, an asserted final journal record, and externally captured timing assertions. Offline validation proves only structural and cryptographic consistency among those declared observations. It does not independently authenticate inclusion or finality, facilitator publication, HTTP delivery, or buyer receipt. Assembly requires one advertised offer at selected index zero, reuses the existing network-free Zenon preflight and binding primitives, cross-binds the signed block, resource, intent, authorization, confirmation, response and delivered journal state, and derives the descriptive Plasma/PoW class from signed fields. The verifier performs the same complete validation on a detached snapshot and never queries a node.

The parser detects duplicate decoded keys before object construction and applies exact schemas, descriptor-safe snapshots, bounded depth/count/byte limits, deterministic canonical JSON, eight section digests and one domain-separated final digest. Timing events are exact and once-only, sequences preserve the cross-role protocol edges, role-scoped monotonic clocks recompute durations, and UTC values supply only explicit correlation and ordering assertions. The template is a null checklist rather than a fragment or bundle. The file CLI exposes only `template`, `assemble`, and `verify`, accepts no environment, standard-input, network, wallet, journal or server capability, and emits fixed sanitized status lines.

PR B is the merged, offline-tested operational-preparation slice and remains part of Issue #45 without completing it. It is not activated and has performed no Gate-B run. Its ten-path boundary adds the import-safe observation, coordinator runner, fixed-output runner CLI, facilitator worker, and focused runner tests; it modifies only the optional lifecycle seams in `src/zenon-payment.js`, their live-settlement tests, and these three documentation files. It leaves the ordinary buyer/server CLIs, buyer and resource-server behavior, live runtime, settlement journal implementation/schema, PR-A contract/CLI/tests, configuration files, packages, dependencies, and workflows unchanged.

The effectful runtime has three logical roles in two processes. The coordinator owns the runner and buyer and privately retains the buyer module's process-local WeakMap recovery owner. A separately spawned facilitator child owns the facilitator SDK singleton, loopback resource server, fresh journal, and fixed protected-response delivery adapter. The exceptional CLI adds a non-effectful fixed-output supervisor parent. IPC carries exact, bounded, allowlisted, request-correlated and cause-free protocol data; secrets and recovery owners never cross it. A facilitator restart is allowed only after a poisoned child has acknowledged stop and its operating-system exit has been confirmed; coordinator loss after submission is armed permanently marks the evidence incomplete. PR B adds no persisted recovery capsule and no resume-without-signing interface.

The strict public config binds the exact operator-trusted profile, both acknowledgements, one expected challenge/offer, recovery limits, and the public HTTPS `/paid` resource. Three separate owner-only files hold buyer RPC, buyer wallet and facilitator RPC inputs under one protected workspace. Component-wise path checks, safe-open generation checks, bounded reads, private modes, link/alias rejection and atomic output rules apply. Public DNS answers must be globally routable, resolve under a deadline, and remain pinned to the subsequent HTTPS health/challenge/payment/reconciliation requests. The operator remains responsible for external TLS ingress; PR B neither provisions nor contacts it in tests.

The optional plaintext transport exception is a separate closed family. `preflight-public-ws-once` and `run-public-ws-once` require the exact switch, a fifth protected authorization file, schema-v2 RPC role inputs, the distinct current-testnet operator-trusted height-2 profile, one run name, source revision, complete configuration digest, payment-intent digest, value-equal buyer/facilitator endpoint, and exact payment/publication acknowledgements. The configuration digest is `SHA-256(UTF-8("zenon-x402-public-ws-once-config-v1\n" + canonicalJson(parsedConfig)))`, encoded as exactly 64 lowercase hexadecimal characters, so the authorization binds the complete parsed configuration rather than selected duplicate fields. Run mode performs three raw-tree attestations with shell-free bounded calls to a fixed Git executable from the canonical module-derived repository root. Each requires checked-out `main`, equality among `HEAD`, local `main`, local `origin/main`, and the bound revision, and an exact frozen-commit tree manifest from non-helper `ls-tree` plumbing. Pure JavaScript then checks every tracked regular file's stable raw bytes, Git blob ID, identity, and exact mode without consulting the index or invoking clean/smudge filters; it rejects symlink, submodule, unsafe-path, mode, tracked-byte, and every untracked `src` entry, including ignored entries. All Git output and diagnostics remain suppressed.

Attestation one precedes parent worker-module preload; attestation two follows that load and is immediately before consumption. After marker creation, the public-only controller forks an idle child and performs an exact enum-only `PRELOAD` / `PRELOADED` exchange. Receipt proves the child's static ESM graph initialized without calling the runtime start path, so no RPC, wallet access, journal creation/load, resource listener, signing, or publication is initiated. Attestation three then runs before buyer readiness and `START`, and the lane initiates no repo-local path load afterward. Preload or third-attestation failure reaps the child and preserves the already-consumed marker. Ordinary WSS sends no preload message and retains its existing `START` protocol.

The attestation covers committed tracked repo-local bytes against trusted local repository metadata. It does not attest ignored or untracked content outside `src` or installed dependency bytes under `node_modules`; only the tracked dependency declarations and lockfile are covered. Local `origin/main` is a cached ref, not network freshness, and no fetch occurs. Precisely timed mutation and restoration by an already-authorized same-UID actor remains outside the claim. The profile pins the height-2 hash and previous hash reproduced by two fresh reads from the same source; this is not independent chain authentication. The endpoint parser accepts only canonical credential-free numeric public-IP `ws://` with an explicit non-default port and root path. The ordinary WSS parser, historical profile, CLI, worker mode and defaults remain unchanged and cannot alias or fall back into this lane. SDK testnet NetworkID remains fixed independently of the current chain identifier.

The exceptional CLI parent imports neither the runner nor the SDK. It supervises one fixed child with empty arguments and environment, ignored standard streams, one dedicated bounded option pipe carrying exactly six local paths, the run name, and the transport-exception token, and an exact request-correlated enum-only process-control protocol. The parent enforces structural limits and the child performs semantic validation; neither channel carries RPC endpoint or wallet contents, and control IPC carries no paths. Standard-stream output is discarded. A result is accepted only after the matching terminal enum and clean close; handled protocol/process faults escalate termination and are reported only after child close. A supervisor IPC disconnect handled by the child's event loop triggers fail-closed exit, but this is not OS-enforced parent-death protection. This is output containment, not a same-UID sandbox.

Exceptional preflight is filesystem-only and does not read wallet contents. Execution exclusively creates and durably syncs one workspace-root consumed marker before any worker, RPC, wallet, signing, or publication effect. Open workspace and run-directory handles pin device/inode identity, and handle/path identity, type, ownership, and mode are compared before and after every effect and pathname state boundary. Drift fails closed. The marker and run directory survive every failure; existing or partial marker state consumes one attempt while the owner-controlled workspace namespace remains unchanged. Node has no portable `openat`-style creation API, so an active same-UID actor can race between checks and already controls the protected input files. No global one-shot or hostile same-UID confinement is claimed. Recovery attempts and delay are zero. Any uncertain/acknowledged publication, timeout, disconnect, process restart, repeated phase, or crash hard-stops without same-payment recovery, replacement payment, another challenge, wallet reopen, or new signature.

The uninterrupted exceptional flow's run-created retained tree contains exactly the consumed marker, `SUBMISSION_ARMED`, the initialized schema-v1 settlement journal, and private pending metadata plus five typed capture fragments; the five protected inputs remain unchanged. Metadata declares plaintext transport, no confidentiality or peer authentication, explicit operator risk acceptance, RPC-endpoint nondisclosure, and `publicationEligible: false`. The capture contains no plaintext RPC endpoint, wallet secret, local path, evidence directory, `candidate-bundle.json`, or `COMPLETE`; the deliberately public HTTPS resource URL remains part of the payment evidence. A later manual gate must use a different independently operated WSS/HTTPS node or explorer to confirm the exact block, payment-intent binding, and Momentum inclusion. Once that independent record is supplied, the retained fragments are sufficient for the existing assembler and verifier; the same endpoint or operator route is insufficient. The anchor remains independently unverified; public-genesis derivation, authenticated chain identity, canonical lineage, facilitator authorship, finality, recipient receipt, reproducible binary, release, activation, and production readiness remain nonclaims.

Run mode performs buyer and facilitator wallet-free readiness before listening or signing, then requires the exact health and 402 challenge before the coordinator reads the disposable wallet. Observation is branded, synchronous, payload-free, free-form-metadata-free and default-off. It captures the exact 21 PR-A phases at their true lifecycle boundaries, with coordinator-assigned global sequence, role-local monotonic clocks and absolute UTC assertions. Inclusion UTC is captured exactly once when valid inclusion is first observed and is reused by the inclusion event and journal evidence without allowing an observer clock to choose durable data. Clock callbacks are never awaited and receive no receiver, payload, or free-form metadata; thrown or invalid results are contained without changing settlement, although arbitrary synchronous clock code can consume local execution time. Observation failure permanently makes the run nonpublishable.

Evidence version 1 accepts only an uninterrupted first-attempt success with every phase once. For the ordinary WSS runner, same-payment recovery retains only each in-memory successor owner, never repeats challenge acquisition, wallet access, payment construction or signing, and has both attempt and absolute elapsed bounds. The exceptional public-WS lane invokes no recovery or restart path and only quarantines ambiguous state for manual independent resolution. Every recovery, child restart, repeated phase, cached delivery, ambiguous publication acknowledgement, observer loss or crash is resolution-only and permanently ineligible for a version-1 bundle. If the coordinator dies after submission is armed, the journal remains protected for manual safe resolution and no replacement payment may be made.

The clean run starts from a schema-v1 revision-zero empty journal with maintenance disabled. After resource-server closure and quiescence, one final `SettlementJournal.load()` returns the coherent one-record snapshot; the runner never calls `list()`. The uninterrupted transition sequence fixes revision five: create, publication acknowledgement, inclusion, delivery pending and delivered. Schema v2, reused/multiple records, nonquiescence, unexpected generation, cached-response mismatch, or an unexpected retained-tree entry fails closed. PR-A's five fragments are parsed, assembled, and verified in memory; the exceptional lane atomically retains only those fragments under the private pending state. It neither persists nor publishes a candidate bundle.

Gate B is a separate authorization boundary for the actual public-testnet endpoint, a disposable, minimally funded, single-use wallet, one payment, live capture and deliberate publication of linkable evidence after human review. Its frozen publication package includes the complete exact six-field default protected response body rather than only a digest, plus absolute UTC correlation timestamps rather than relative-only timing. Gate B does not require Phase 2C or hardware-wallet support. PR B implementation and test validation perform no live run, and run mode remains default-off. Merging PR B does not release or activate the operational runner. Neither PR A nor PR B completes Issue #45, claims authenticated chain identity, enters Phase 2C, adds hardware-wallet support, or establishes production readiness.

### Gate B operator handoff

1. Obtain separate authority for the external operational inputs and a private workspace; commit none of their values.
2. Outside the repository, have the identified operator create and review a disposable, single-use test wallet, then fund it minimally under a separate authority. The optional fixed-output local helper can create only the protected wallet and address files; it does not fund or authorize them.
3. Require the existing preflight to succeed before authorizing run mode.
4. Treat only an uninterrupted evidence-eligible result as a publication candidate; recovery, restart or ambiguity remains nonpublishable.
5. Apply the existing offline verifier, then human-review every intended public string and the deliberate disclosure boundary.
6. Obtain separate publication authorization. Issue #45 remains open until the live execution and published evidence have been independently reviewed.

### Mandatory operator stop rules

Automation must stop before creating or populating private role files, provisioning live ingress, or accessing or funding the disposable wallet. An identified human operator must supply and approve those inputs. Only after that operator-authorized provisioning may preflight validate protected input-file identity, metadata, generation, public configuration, RPC syntax, and output noncollision. Ordinary WSS preflight opens every protected role file, reads only the public config and buyer-RPC input, and does not read buyer-wallet or facilitator-RPC contents. Exceptional preflight opens all five protected files and reads the public config, both RPC role files, and authorization, but never reads wallet contents. Neither preflight performs network activity.

The source-only macOS wallet helper is prepared and tested before this stop, but its invocation remains an identified operator action because it creates real secret material. It accepts only `create --workspace <absolute-private-workspace>` for the canonical fixed `zenon-x402-gate-b-wallet` directory directly beneath the current user's canonical Application Support root. The directory must already be empty, current-user owned, mode `0700`, ACL-free, non-symlinked and outside all Git-bearing ancestry. The supervisor rejects any other lexical shape before invoking its absolute fixed child with empty arguments and environment, ignored standard streams, enum-only IPC, the exact workspace cwd and one bounded private bootstrap pipe; no wallet secret enters any process channel. Terminal settlement synchronously disables all protocol actions and detaches only supervisor-owned protocol listeners before reaping, making late control messages inert. Failure destroys that bootstrap before a bounded TERM/KILL reap. An absent close leads only to deterministic disconnect/unreference cleanup and generic quarantine failure, never success or a claim that hostile same-UID or root code, or a kernel-unreapable process, terminated.

The child reuses the unchanged private-workspace capability. That capability reconciles retained pathname and cwd descriptors, exclusively and durably reserves exactly `buyer-wallet.json` and `buyer-address.json`, verifies distinct zero-length mode-`0600` single-link inodes, and syncs both directory descriptors before the SDK loader or entropy source can run. Production then injects 32 cryptographically secure bytes into the pinned SDK's Zenon-compatible entropy constructor and derives account index zero only. Safe short-write loops and per-artifact syncs precede a final two-directory sync and complete path, cwd, inode, generation, mode, link and ACL revalidation. This is not all-or-nothing file-content atomicity. Only a conclusively pre-effect first-open failure may be retried: both fixed leaves are rechecked absent through the retained pathname and cwd descriptors, all workspace metadata, ACL and generation checks remain valid, and neither SDK loading nor entropy was invoked. That classification is internal and exposes only the same generic failure result. The first reserved inode, an ambiguous or failed absence proof, SDK loading or possible entropy, and every later failure close handles and permanently quarantine the workspace without unlink, truncation, overwrite or retry; retained restrictive residue blocks a later attempt before SDK loading or entropy. No marker or third artifact records an ambiguous failure that leaves no residue, so the operator must quarantine the workspace and must not retry after that generic failure. The separate address artifact is cryptographically public but operationally private and linkable, so it remains mode `0600` until the disclosure or funding gate. The identity-bracketed pathname ACL check cannot exclude hostile same-UID races, and no protection is claimed against hostile same-UID code, root, or external backup and synchronization services. JavaScript secret clearing remains best effort, and the child is not an OS network sandbox. Key generation is chain-neutral and performs no RPC, network selection, funding, signing, payment, publication or Git action. Helper success grants no authority for any later gate.

The offline public-WS input primitive is source-only and remains disconnected from runtime activation. Its trusted import-safe launcher accepts private values in memory and invokes the fixed CLI with only one literal operation argument. Canonical schema-v1 bootstrap JSON crosses inherited descriptor 3 as a four-byte big-endian length plus at most 8192 bytes and exact EOF; the fixed supervisor forwards it to one isolated child on descriptor 4. The supervisor requires both a valid request-correlated `READY` and the successful FD4 write/EOF callback before sending exactly one `EXECUTE`; a terminal or close cannot succeed without both conditions. Both requested environments are empty, standard input is ignored, standard output/error are bounded and fixed, and control IPC is request-correlated enum-only. Importing the launcher or CLI has no filesystem or process effect. Direct CLI use without the private descriptor fails; this is deliberately not a shell interface for endpoints, paths, reviewed digests, or acknowledgements.

The exact private source schemas are `{"kind":"gate-b-protected-endpoint-source","rpcEndpoint":...,"schemaVersion":1}` and `{"hostname":...,"kind":"gate-b-quick-tunnel-hostname-source","schemaVersion":1}` in canonical JSON plus LF. Their canonical parsers/serializers and the single frozen hostname policy live in the pure schema module with no runner, SDK, filesystem, or network import. `PROVISION_ENDPOINT` keeps endpoint semantic validation in the isolated child through the existing schema-v2 numeric public-WS policy and creates only the first source with exclusive open and durable sync; it performs no network operation. The hostname producer belongs to a later ingress step and can reuse the schema helper. This slice accepts only a bare lowercase, non-IDN, single-label `trycloudflare.com` hostname with no scheme, credentials, port, path, query, fragment, percent encoding, or control character.

The child delegates protected-file operations to one import-safe, network-free module that exposes only an opaque fixed-leaf capability for workspace validation, reservation, reads, writes, identity checks, directory sync, and closure. Production is macOS-only: any other platform fails before protected-file access or reservation. On macOS the actual current directory and supplied workspace must resolve to the same current-user `0700`, ACL-free, non-Git directory and both descriptors remain retained. Every fixed leaf is current-user `0600`, ACL-free, regular, single-link, no-follow opened, identity-bracketed, and device/inode-distinct. After every successful complete reservation set, the capability verifies distinct zero-length files and immediately syncs both retained directory descriptors before returning control. A successful initial directory sync makes the reserved names durable. `PREPARE` therefore reserves all four prepared outputs before its hook or any wallet/source open; `PROVISION_ENDPOINT` and `AUTHORIZE` cannot populate their reserved output before the same two-directory boundary. If that initial sync fails, restrictive residue remains in the running system but its persistence is indeterminate; no output byte follows, `PREPARE` has not opened any protected input, and the workspace is still consumed and quarantined with no retry. `PREPARE` validates account zero against `buyer-address.json`, derives distinct account one, and emits the exact one-atomic-ZNN current-testnet requirement, reviewed quick-tunnel `/paid` resource, 60-second payment timeout, listener 41000, 30000-ms RPC timeout, zero attempts/delay, and one-ms recovery elapsed limit. It validates both prospective and descriptor-reread artifacts using the merged public-WS parsers and SDK, syncs files then directory, and invokes the merged clean-current-`main` raw-tree attestor before reservation and immediately before success. A failure after the successful initial directory sync leaves durable restrictive reservation names and consumes the workspace; it never creates or reserves authorization.

`AUTHORIZE` revalidates the four private sources and four prepared outputs, rederives account zero and account one, requires equal endpoint copies and payee/config binding, recomputes `publicWsOnceConfigDigest`, compares the separately reviewed exact lowercase digest, checks every frozen value and acknowledgement, recaptures the current revision, and runs the merged attestor before exclusively creating and syncing authorization. A later trusted in-memory controller must obtain or recompute the reviewed digest after human review and pass it through the private bootstrap; neither this slice nor its documentation defines a direct shell workflow. Authorization binds the complete parsed configuration, endpoint, payment intent, run, profile, acknowledgements, and revision, but its schema does not bind the wallet inode or payer. A later same-user wallet replacement therefore remains within the private operational trust boundary. Byte-array and SDK-key clearing is best effort, while JavaScript strings cannot be reliably erased. Installed dependencies, local Git metadata, and precisely timed same-UID mutation remain trusted inputs. None of the three operations performs DNS, sockets, RPC, listener start, wallet creation, funding, signing, payment, evidence capture/publication, or Issue #45 closure.

The next source-only slice adds an import-safe quick-tunnel schema, launcher and supervisor plus one focused synthetic test file. It reuses the unchanged hostname schema and opaque private-workspace capability. It adds no CLI, dependency, package script, workflow or runtime registration. Import and test execution start no real process, listener, tunnel, DNS request, HTTP request, wallet, RPC, signing, payment or publication operation.

The private bootstrap fixes operation and schema versions, the canonical workspace and `cloudflared` executable, a lowercase SHA-256 pin, and one of two exact telemetry acknowledgement pairs. One pair accepts possible `cloudflared` error telemetry; the other records an operator claim that external egress control blocks Sentry. The implementation validates the pair but cannot inspect or prove firewall state. The launcher enforces macOS before fork, starts the absolute supervisor module with the selected private workspace as its exact current directory, carries the frame only on descriptor 3, requests an empty standard environment, ignores standard streams, and exposes only a frozen fieldless lease. The workspace is the sole private bootstrap value necessarily present in current-directory state; arguments, environment and IPC contain none of the private bootstrap. IPC is exactly `READY/START/ACTIVE`, monotonic `CHECK/CHECKED`, and `STOP/STOPPED`; it never contains private values or diagnostics. Checks are single-flight, a `CHECKED` send remains governed by the original check deadline, stop preempts a check with the next request identifier, and late responses fail closed without consuming another identifier. Successful closure requires matching `STOPPED`, clean supervisor exit and close, and bounded proof that its retained exact detached PGID is absent. Startup, check, shutdown, group reaping and the ten-minute hard lifetime are bounded.

Before any tunnel-process effect, the macOS supervisor opens the existing private-workspace capability, exclusively reserves the hostname-source leaf, and syncs both retained directory descriptors. It never removes, overwrites or retries that source. It validates `/dev/null` and attests the canonical current-user, non-group/world-writable, no-setid, native Mach-O, bounded and generation-stable `cloudflared` bytes against the operator pin and exact version `2026.8.2` before and after spawn. The pin authenticates only the operator-selected local bytes, not Cloudflare or a vendor release. The fixed direct command disables configuration, credentials, origin certificate, auto-update, prechecks and management diagnostics, sends all child output to `/dev/null`, uses no shell or PATH lookup, and gives the child only one process-owned empty `0700` directory as `HOME`, `TMPDIR` and current directory. Both the bounded fixed-argument version probe and tunnel launch use `cloudflared` as child-visible argument zero; the attested absolute executable path remains solely their OS exec target and is absent from argument vectors, options, environments, IPC and captured output.

Metrics discovery invokes exactly `/usr/sbin/lsof -nP -a -p <pid> -iTCP -sTCP:LISTEN -F0pftnPT` through a bounded no-shell seam and accepts exactly one IPv4 `127.0.0.1` TCP listener not using the origin port. Direct numeric-loopback HTTP uses GET, no proxy, redirects, connection reuse or content encoding, and strict bounded `2026.8.2` `/quicktunnel` and `/ready` snapshots. Each observation brackets those reads with liveness and listener rediscovery. Two equal observations precede the one durable hostname-source write; a stability gap, third equal observation and exact reread precede `ACTIVE`. Every `CHECK` repeats the complete observation and must match the private pinned hostname, connector identifier and metrics port; it never rewrites the source. The supervisor retains its tunnel spawn return before structural validation, attempts bounded direct-handle cleanup, and removes the runtime directory only after validated direct-child closure; an unvalidated return or closure uncertainty preserves quarantine residue. Independently, the launcher retains the detached supervisor's exact PID as the attested PGID, probes and sweeps only that negative group identity with bounded TERM/KILL escalation, and does not infer group exhaustion from supervisor close. Matching `STOPPED` plus clean exit and close therefore cannot resolve the public lease until the whole group, including hostile remaining descendants, is proved absent; failure-path closure also waits for the bounded proof attempt before rejecting.

This is a lifecycle guard, not confinement or availability proof. Root and same-UID actors, the operator-pinned binary, host kernel, Sentry policy, Cloudflare service, DNS and routing, clock and certificate roots remain trusted. `/ready` establishes only one currently reported edge connection; it does not prove public hostname propagation, route stability, origin reachability, protected-resource delivery or payment. The hostname may become stale after any successful check. A future trusted in-memory controller must retain the same lease and request fresh readiness immediately before `PREPARE`, immediately before `AUTHORIZE`, and immediately before the separately authorized live run. Each later effect remains independently gated. The slice performs none of those effects, makes no live-evidence claim, and leaves Issue #45 open.

Its exact boundary is `src/gate-b-quick-tunnel-schema.js`, `src/gate-b-quick-tunnel-launcher.js`, `src/gate-b-quick-tunnel-supervisor.js`, `test/gate-b-quick-tunnel.test.js`, `README.md`, and this plan. Existing Gate-B source, settlement, runner, wallet, package, dependency and workflow paths remain unchanged.

This PR-A slice has an exact nine-path boundary: `README.md`, `docs/IMPLEMENTATION_PLAN.md`, `src/gate-b-public-ws-inputs-schema.js`, `src/gate-b-public-ws-inputs-launcher.js`, `src/gate-b-public-ws-inputs-cli.js`, `src/gate-b-public-ws-inputs-supervisor.js`, `src/gate-b-public-ws-inputs-child.js`, `src/gate-b-public-ws-private-workspace.js`, and `test/gate-b-public-ws-inputs.test.js`. It does not modify the live-evidence runner, facilitator worker, source attestor, wallet helper, package scripts, dependencies, or runtime activation.

A successful `preflight` does not authorize `run`. Stop again before invoking `run`; a separate explicit human authorization permits exactly one payment. Preflight and run do not themselves authorize evidence publication.

For the ordinary WSS runner, if publication becomes `SUBMISSION_OUTCOME_UNKNOWN` or `SUBMISSION_ACKNOWLEDGED`, or a process crashes after submission is armed, reconcile only the byte-identical payment and never construct or publish a replacement payment. The exceptional public-WS lane performs no reconciliation; quarantine its payer and journal for manual independent resolution. Recovery, ambiguity, or crash remains nonpublishable, and Issue #45 remains open.

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
