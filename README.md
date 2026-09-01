# Zenon x402 Prototype

A research proof of concept that maps x402 v2 `exact` payments to payer-signed Zenon account blocks.

The buyer prepares and signs a normal Zenon `UserSend` account block without publishing it. The x402 payload carries that exact signed block. The facilitator validates it against the selected payment requirement, journals the attempt, publishes it, observes Momentum inclusion, and only then authorizes the protected resource.

This is not an official Zenon integration, not an official x402 network implementation, and not production software. Mock mode is the default. No stablecoin or production security guarantee is bundled.

## Current architecture status

The current `main` branch contains the v0.3 architecture checkpoint; this is not a v0.3 package or production release. The planner, wallet, Plasma, payment-mechanism, chain-profile, and settlement-repository interfaces are additive design boundaries. They document intended ownership and separation but are not wired into the active transaction path.

Package semantic versioning is intentionally independent of architecture-checkpoint and payload-generation labels; those labels do not represent a published package release.

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
    | explicit operator-trusted historical observation (non-authenticating)
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

Requires Node.js 24+. Node 24 is the configured CI-tested minimum; CI does not exercise every higher Node major admitted by the package engine range.

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

## Operator-trusted historical testnet mode

The command-line entry points expose one exact, opt-in historical testnet profile. It is derived from the height-2 example in `zenon-network/znn-wiki` at the immutable 2021-12-17 source revision recorded in `src/zenon/operator-trusted-testnet-profile.js`. The profile name, the existing testnet-only acknowledgement, and a separate operator-trust acknowledgement must all match exactly before the server constructs a requirement or listens and before the buyer makes its initial request. There is no default, `current`, `latest`, or generic `testnet` alias. Chain-profile fields and trust-artifact URLs cannot be supplied through environment variables.

Inside the owned SDK session, the policy requires one exact height-2 identity tuple: version, height, chain identifier, Momentum hash, and predecessor must match the pinned source, and the later height query cannot report a total below the previously observed frontier height. Missing or malformed evidence, and honest mismatches or resets that alter that tuple, fail before signing or publication. A matching tuple is still an unsigned node self-report under operator trust. Forks after height 2 and disconnected or malicious RPC views are not detected. The result is not an authoritative current-network release, RPC authentication, canonical remote-chain identity, or verified linkage from the historical observation to the frontier. The policy uses the distinct `operatorTrustedChainPolicy` constructor field, produces explicit non-authenticating evidence, and never produces an `authenticatedProfile` result.

No live payment or real-node evidence is claimed by this offline integration. Issue #45 remains open until a separate operational run records settlement and delivery evidence.

### Offline local four-node devnet profile artifact

The repository also defines a separate `operator-trusted-self-created-local-four-node-devnet-v1` preparation lane. It is not registered with the public-testnet runner and cannot use either public-testnet acknowledgement. The ordinary buyer and server CLIs can select it only through the closed local selector, which requires the canonical local artifact, the exact local acknowledgement family, and a canonical loopback-only RPC location before either runtime is constructed. The dedicated parser accepts only one bounded canonical public artifact with the exact local-devnet acknowledgement, chain identifier 69, the generated genesis and height-two relationship, the immutable external-generator revision, the node source revision, and a `sha256` container-image digest. Missing provenance, floating tags such as `latest`, unknown fields, noncanonical JSON, and public-testnet substitution fail closed.

The artifact contains public configuration assertions only. Generated wallets, operator credentials, node keys, RPC or resource endpoints, filesystem locations, transactions, and signatures are outside its schema and must remain private. The offline observation check cross-binds the declared chain identifier, genesis predecessor, exact height-two Momentum, reported count, and frontier height. It remains an operator-supplied self-report: it does not authenticate the node, chain, generator, source revision, or image digest.

"Four-node" names the intended external operator workflow only; the artifact does not verify node count, roles, topology, or a topology digest. The fixed `fourNodeTopologyVerified: false` nonclaim prevents the lane name from being treated as topology evidence.

The artifact can create a separately branded local-devnet policy. The exported direct local observer and closed family dispatcher consume genuine local policies and evidence, while direct `assertZenonNodeReady` is the only payment-readiness integration that accepts the local family. The dispatcher queries height two exactly once, descriptor-safely snapshots the SDK response and frontier before and after the awaited query, and returns only branded non-authenticating evidence. Direct readiness revalidates the returned brand and family and requires the exact current observer result before reading evidence fields. This is offline-tested, runtime-unregistered readiness plumbing, not runtime activation or authenticated chain identity. Module import and policy construction are side-effect-free and offline; direct policy observation and direct readiness invocation perform the injected node reads. Policies and evidence, together with their copied fields, are detached and deeply frozen, while observation validation uses detached normalized copied snapshots. The SDK frontier object is returned unchanged by readiness and is not claimed to be detached or frozen. Adapter-controlled Promise handling uses captured intrinsics, but it cannot undo thenable assimilation or other behavior already performed inside an injected SDK method before that method returns a genuine native Promise. No default, public runner, generic alias, package script, constructor default, probe, client, or facilitator independently selects the local policy. The ordinary buyer and server CLIs may explicitly select it only through the closed local selector and pass its fixed policy and loopback RPC snapshot into ordinary runtime construction; their owned live-session and evidence boundaries remain public-testnet-only. A public-testnet input cannot activate this lane. Ordinary valid public-testnet selection and payment semantics remain unchanged; this bridge deliberately adds a non-enumerable readiness-result assimilation shield and earlier rejection for hostile inputs.

The dedicated `local-devnet-readiness-runner` and fixed-output CLI are an explicit opt-in, offline-tested, runtime-unregistered readiness tool. Import and argument validation perform no filesystem or network I/O; artifact preflight performs only one bounded local descriptor read and no network I/O. An explicitly invoked run accepts only the genuine local artifact and acknowledgement, a restrictive current-directory artifact file, and a canonical numeric-loopback WebSocket location. The URL must be exactly `ws://127.0.0.1:<non-default-port>/` or `ws://[::1]:<non-default-port>/`, with an explicit canonical decimal port other than 80 and the trailing slash. Hostnames and DNS, `wss`, credentials, implicit or default ports, alternate address encodings, additional paths, queries, fragments, whitespace, percent encoding, and noncanonical variants are rejected. The run starts one single-use Worker, creates one isolated SDK client, disables reconnects and redirects, performs one bounded connection and exactly four ordered readiness reads, closes the client once, then reports success only after the Worker and both captured output pipes are destroyed. Worker output is discarded under a fixed bound. The CLI emits only `LOCAL_DEVNET_READINESS_READY` or `LOCAL_DEVNET_READINESS_FAILED` and never echoes its inputs or diagnostics.

The CLI accepts exactly one each of `--artifact-file`, `--rpc-url`, `--acknowledgement`, and `--timeout-ms`, in any order. It has no environment, standard-input, alias, default, discovery, help, or package-script path; the acknowledgement must be the exact local-artifact acknowledgement, and the timeout is a canonical decimal from 1000 through 30000 milliseconds.

Direct invocation uses the dedicated script and all four explicit values; this symbolic example does not identify an operator endpoint:

```sh
node src/local-devnet-readiness-runner-cli.js --artifact-file local-devnet-profile.json --rpc-url 'ws://127.0.0.1:<non-default-port>/' --acknowledgement 'I_UNDERSTAND_THIS_IS_A_SELF_CREATED_LOCAL_FOUR_NODE_DEVNET_NOT_PUBLIC_TESTNET_OR_AUTHENTICATED_CHAIN_IDENTITY' --timeout-ms 5000
```

This tool does not set SDK NetworkID or ChainID and makes no network-identity claim. Its local policy, provenance assertions, observations, and intended four-node label remain operator trusted and non-authenticating; `fourNodeTopologyVerified` remains false. Adapter-controlled Promise handling cannot undo behavior already performed inside a pinned SDK producer before that producer returns a genuine native Promise. The closed ordinary-CLI selector is explicit opt-in only; it does not change any public runner, alias, package script, or default. The selector itself has no wallet, funding, signing, block construction, publication, facilitator, protected-resource, journal, live-evidence capture or bundle, proof, or payment capability.

`0x3639/testnet` is treated only as an external operator tool; no source from it is copied, vendored, patched, redistributed, or installed as a package dependency here. Because the external generator uses fresh timestamps and private random material, the supported evidence claim is reproducible equivalent behavior, never byte-for-byte recreation of the same private network. This offline slice does not run Docker, a builder, a node, a wallet, or a payment. A future local-devnet success would be an intermediate research milestone only; Issue #45 stays open and the separately authorized public-testnet gate remains required.

A later payment/evidence runner design must separately resolve the descriptive network label, SDK network-ID binding, the local acknowledgement, loopback-only transport, the external tool's seed-plus-four-pillar/five-service workflow description, immutable image provenance, and devnet evidence classification. It must keep `fourNodeTopologyVerified: false` unless topology is independently authenticated. Wallets, credentials, node keys, endpoints, paths, transactions, signatures, Docker outputs, and generated operator packages remain outside this repository and artifact boundary.

### Offline live-evidence contract

Issue #45 now has a pure offline evidence-contract layer. It does not contact an RPC endpoint, load a wallet, read a settlement journal, start either ordinary CLI, sign or publish a block, or capture a live exchange. No live run has occurred, and PR A included no runtime capture or operational harness.

The three import-safe commands operate only on explicit files and emit one fixed status line without paths, identifiers, digests, or diagnostics:

```sh
node src/live-evidence-cli.js template --out NEW_TEMPLATE_FILE
node src/live-evidence-cli.js assemble --manifest MANIFEST_FILE --chain CHAIN_FILE --http HTTP_FILE --journal JOURNAL_FILE --timing TIMING_FILE --out NEW_BUNDLE_FILE
node src/live-evidence-cli.js verify --bundle BUNDLE_FILE
```

`template` creates an unexecuted checklist. `assemble` accepts five exact version-1 fragments, validates their offline cryptographic and semantic bindings, derives the Plasma/PoW description from the signed account block, and writes a new bundle without overwriting an existing file. `verify` revalidates the complete bundle without needing private keys or network access. Successful verification means only that the strict schema, internal digests, signed-block preflight, and cross-section bindings are consistent.

The bundle intentionally excludes the raw encoded payment and all recovery material. A complete public signed account block is nevertheless linkable payment material; its payer, payee, amount, asset, public key, signature, nonce, transaction identity and timing fields may be published only after a separate Gate-B authorization. Every public string also requires human review. Unkeyed bundle digests detect alteration but do not authenticate the bundle, its source, the HTTP exchange, the connected node, or the chain observation.

Gate B freezes the intended disclosure to a disposable, minimally funded, single-use testnet wallet after human review. The public evidence must include the complete exact six-field default protected response body, not only its digest, and the absolute UTC timestamps used for correlation, not relative-only timing. This deliberate disclosure carries low but nonzero linkability and is not a release, activation, authenticated-chain, or production-readiness claim.

### Offline-tested operational runner

The opt-in live-evidence runner is operational preparation for Gate B, not a live run. Its effectful runtime uses three logical roles in two processes: the long-lived coordinator also owns the buyer and its process-local same-payment recovery owner, while a separately spawned facilitator worker owns the facilitator SDK singleton, loopback resource server, journal, and fixed delivery adapter. The exceptional public-WS CLI adds a non-effectful fixed-output supervisor parent described below. The ordinary buyer and server CLIs remain mock by default and add only the explicit, closed local-devnet selector described above. That selector is operator-trusted execution preparation; it neither authenticates the remote chain nor activates the separate live-evidence runner.

The runner accepts one strict public configuration and three separate restrictive role files. It requires canonical credential-free WSS RPC locations, one canonical public HTTPS resource ending in `/paid`, bounded public DNS resolution pinned to the subsequent HTTPS requests, the exact operator-trusted profile, both acknowledgements, and a private workspace. Preflight checks file identity, ownership, mode, link count, descendants, aliases, and output collisions without reading wallet contents or contacting a service. Run mode performs wallet-free buyer and facilitator readiness and the exact HTTPS health/challenge checks before reading the one-purpose wallet. It never provisions public TLS ingress.

A separate `preflight-public-ws-once` / `run-public-ws-once` CLI lane permits exactly one explicitly authorized testnet attempt when the operator exposes only plaintext public WebSocket RPC. It does not relax the ordinary WSS parser, ordinary commands, defaults, aliases, or historical profile. The exceptional lane binds a distinct current-testnet height-2 profile, an exact transport switch, a fifth owner-only authorization file, schema-v2 RPC role files, one run name, source revision, complete configuration digest, payment-intent digest, and one value-equal buyer/facilitator endpoint. `configDigest` is lowercase hexadecimal `SHA-256(UTF-8("zenon-x402-public-ws-once-config-v1\n" + canonicalJson(parsedConfig)))`; it binds every configuration field, including runtime limits, requirement, acknowledgements, profile, and revision. That endpoint must be a canonical credential-free numeric public IP with an explicit non-default port and root path; DNS names, WSS, private/reserved addresses, credentials, parameters, fragments, percent encoding, and noncanonical forms are rejected. The SDK NetworkID remains the fixed testnet value and is not derived from the current chain identifier.

Run mode performs three raw source-tree attestations after protected-input preflight. A fixed absolute Git executable runs without a shell from the canonical repository root derived from the module location, with isolated global/system configuration, disabled replacement objects and lazy fetch, bounded captured output, and suppressed diagnostics. Each attestation requires checked-out `main` and equality among `HEAD`, local `main`, local `origin/main`, and the configuration revision, then obtains the frozen commit's exact tree manifest through `ls-tree`. Pure JavaScript opens every tracked regular file without following links, checks stable identity and exact executable mode, computes its raw Git blob ID without clean/smudge filters, and rejects unsafe tree entries, symlinks, submodules, raw-byte mismatches, and every untracked entry under `src`, including ignored entries. The Git index is not used, so assume-unchanged, skip-worktree, and repository filter configuration cannot hide a raw-byte mismatch.

The first attestation precedes the parent facilitator-module preload. The second follows that preload and is immediately before the one-attempt marker. After marker and run-directory creation, the facilitator child is forked idle and must complete an enum-only `PRELOAD` / `PRELOADED` handshake; ESM initialization has therefore loaded its static repo-local graph, but the worker has not invoked its runtime start, RPC, wallet, journal, listener, signing, or publication path. The third attestation follows that handshake and precedes buyer readiness and `START`; no later repo-local path-based module load is initiated by this lane. Failure after consumption terminates and reaps the idle child while retaining the marker.

This attests committed tracked repo-local bytes against local Git metadata, not the Git metadata itself. Ignored or untracked content outside `src` and installed `node_modules` dependency bytes are not attested; the tracked lockfile is. Local `origin/main` equality is not network freshness and no fetch occurs. An actor already able to perform precisely timed same-UID replacement and restoration remains inside the local workspace trust boundary.

The exceptional CLI is only a fixed-output supervisor and imports neither the runner nor the SDK. It starts one fixed execution child with empty arguments and environment, ignored standard streams, and a dedicated one-use bounded option pipe carrying six local paths, the run name, and the transport-exception token. The parent enforces the exact option shape and bounds; the child performs semantic validation before accepting an enum-only request-correlated control message. Neither channel carries RPC endpoint or wallet contents, identifiers, errors, or stacks, and control IPC carries no paths. Success is reported only after the expected terminal enum and a clean child close. On a handled failure the supervisor escalates termination and waits for child close before reporting the one fixed failure line. The execution child also installs a fail-closed IPC-disconnect handler, but this is event-loop-driven rather than OS-enforced parent-death protection. This contains accidental or dependency standard-stream output; it is not confinement against hostile code running as the same user.

Exceptional preflight opens five distinct protected files but does not read wallet contents or perform network activity. Run exclusively creates and durably syncs one workspace-root consumed marker before worker creation, RPC, wallet access, signing, or publication; the marker and run directory are never removed after failure. Open workspace and run-directory handles retain their device/inode identities, and pathname state is checked against those identities before and after every effect and state-creation boundary. This is a fail-closed one-attempt guard only while the owner-controlled workspace namespace remains unchanged. Node exposes no portable `openat`-style primitive for these pathname writes, so an active same-UID actor can still race between checks and already lies inside the trust boundary by controlling the private wallet files. The implementation does not claim system-global one-shot enforcement or hostile same-UID confinement.

Recovery attempts and delay are fixed at zero. Any unknown or merely acknowledged submission, restart, crash, repeated phase, or other ambiguity hard-stops and quarantines the attempt without reconciliation, a new challenge, wallet reopen, or replacement signature. Even uninterrupted delivery retains the consumed marker, `SUBMISSION_ARMED`, the required private settlement journal and its initialization marker, and a private `PENDING_INDEPENDENT_VERIFICATION` directory. That directory contains fixed publication-ineligible metadata and the complete five typed capture fragments needed for later independent review. It contains no plaintext RPC endpoint, mnemonic, secret, local path, public bundle, `candidate-bundle.json`, `COMPLETE`, or evidence directory; the deliberately public HTTPS resource URL remains part of the payment evidence.

Publication remains a separate manual gate. A different independently operated WSS/HTTPS node or explorer must confirm the exact block, payment-intent binding, and Momentum inclusion; another query through the same endpoint or operator route is not independent. The current profile pins both fields of the exact height-2 link observed identically in two fresh reads from that one public source, which detects a different returned height-2 record but is only same-source reproducibility. Plaintext RPC discloses network metadata and permits an on-path party to alter node observations, delay or replay the exact signed block, or fabricate apparent inclusion. The current profile is therefore an operator-trusted, independently unverified anchor: public-genesis derivation, authenticated RPC/chain identity, verified frontier lineage, facilitator authorship, finality, recipient receipt, reproducible node binary, and production readiness remain explicit nonclaims.

Only a fresh schema-v1 journal at revision zero with no records is eligible for a clean run. After server closure and quiescence, the facilitator reads one final coherent snapshot; the clean path requires the exact five writes for validation, publication acknowledgement, Momentum inclusion, delivery pending, and delivery complete. The five PR-A fragments are assembled and verified in memory. The exceptional lane retains those five fragments only as a private, nonpublishable pending capture; it does not serialize or stage a public bundle. No evidence is uploaded or made public.

Evidence version 1 is eligible only after one uninterrupted first-attempt success with every lifecycle phase exactly once. For the ordinary WSS runner only, outcome-unknown handling follows the same-payment in-memory recovery lineage through one-use successor owners and may replace a poisoned facilitator only after its process has definitely exited; it never fetches another challenge, reopens the wallet, signs again, or constructs a replacement payment. The exceptional public-WS lane invokes no recovery or restart path and only quarantines ambiguous state for manual independent resolution. Every recovery, restart, cached delivery, observer loss, ambiguous acknowledgement, or crash permanently makes a run ineligible for a version-1 public bundle. If the coordinator is lost after submission is armed, the private journal and marker remain for safe resolution; no replay capsule or resume-without-signing interface exists.

Operator-visible standard output, standard error, and fixed errors expose no payment headers, recovery owners, wallet material, credentials, private or RPC endpoint details, environment values, paths, identifiers, or diagnostics. The exceptional supervisor's control IPC is enum-only; its separate one-use inherited option pipe carries six bounded local paths, the run name, and the transport-exception token, but no file contents. Facilitator IPC remains bounded and allowlisted, and secrets and recovery owners never cross it. Lifecycle observations are payload-free and free-form-metadata-free. Gate B still requires separate authority for the endpoint, disposable minimum funding, wallet access, signing, exactly one payment, capture, human review of every public string, and deliberate publication of the complete six-field body and absolute UTC timestamps. Gate B does not require Phase 2C or hardware-wallet support. This PR B implementation and its test validation performed none of those live actions. Run mode remains default-off and separately authorized, and merging PR B does not release or activate it. Issue #45 remains open.

The import-safe `gate-b-buyer-wallet-cli` is a source-only macOS local provisioning helper. An identified operator may explicitly invoke exactly `create --workspace <absolute-private-workspace>`, where the canonical path is the fixed `zenon-x402-gate-b-wallet` directory directly beneath the current user's canonical macOS Application Support root. That dedicated directory must already exist, be empty, be current-user owned and mode `0700`, have no ACL or symlink resolution, and be outside every Git-bearing ancestry. The fixed-output supervisor rejects any other lexical location before fork, invokes only its absolute fixed child with no shell or `PATH` lookup, and gives the child empty arguments, a requested empty environment, ignored standard streams, enum-only control IPC, the exact private workspace as current directory, and the same path on one bounded private bootstrap pipe. No wallet secret enters those channels. The first terminal settlement synchronously disables protocol actions and detaches only the supervisor-owned protocol listeners before cleanup, so a late `READY` cannot send `CREATE`. Failure destroys the bootstrap before one bounded TERM/KILL reap; if close never arrives, supported IPC and child handles are disconnected and unreferenced before the same generic quarantine failure. Abandonment is never success and is not evidence that hostile same-UID or root code, or a kernel-unreapable process, terminated.

The child delegates filesystem authority to the unchanged shared private-workspace capability instead of duplicating its checks. That capability retains and repeatedly reconciles pathname and current-directory descriptors, generation, device/inode identity, owner, mode, link count and fixed pathname ACL results. After confirming the directory is empty, it exclusively reserves exactly `buyer-wallet.json` and `buyer-address.json` through no-follow handles and syncs both retained directory descriptors before the SDK is loaded or entropy is requested. Production obtains 32 cryptographically secure bytes from the injected `node:crypto` source and passes their Zenon-compatible encoding to the lockfile-pinned SDK, deriving only fresh account index zero. The capability loops over safe short writes, syncs and revalidates each distinct mode-`0600` single-link artifact, performs a final sync of both directory descriptors, then revalidates the workspace, cwd, paths, generations and ACLs before success. This is durable reservation and descriptor-bound writing, not all-or-nothing file-content atomicity.

Only a conclusively pre-effect first-open failure may be retried: both fixed leaves are rechecked absent through the retained pathname and current-directory descriptors, all workspace identity, generation, ownership, mode and ACL checks still pass, and neither the SDK loader nor entropy source was invoked. That classification remains internal; the operator receives the same generic failure line. The first reserved inode, a failed or ambiguous absence proof, SDK loading or possible entropy, and every later failure consume and quarantine the entire workspace. Handles close, but no artifact is unlinked, truncated, retried or overwritten; retained restrictive residue may be partial or complete and may contain a valid mnemonic, and it forces a later attempt to fail before SDK loading or entropy. No marker or third artifact records an ambiguous failure that leaves no residue, so the operator must treat that generic failure as quarantined and must not retry. `buyer-address.json` is cryptographically public data but remains operationally private and linkable, so it stays a separate mode-`0600` artifact until the later disclosure or funding gate. Pathname ACL inspection is bracketed by retained identity checks but cannot exclude races by code already authorized under the same UID. The checks do not protect against hostile same-UID code, root, or external backup and synchronization services. JavaScript memory clearing remains best effort, and the SDK child is not an OS network sandbox. Key generation itself is chain-neutral and performs no RPC, network selection, funding, signing, payment, publication or Git action. Offline tests inject deterministic fake entropy and synthetic secret sentinels; they never invoke the production generator or create a real random wallet.

The source-only `gate-b-public-ws-inputs-launcher` is a private operational-input primitive, not an activated CLI workflow. A trusted in-memory caller may request exactly `PROVISION_ENDPOINT`, `PREPARE`, or `AUTHORIZE`. It starts the fixed CLI with `process.execPath`, one literal operation argument, ignored standard input, a requested empty environment, and bounded fixed standard-stream output. The canonical bootstrap is carried only on inherited descriptor 3 as a four-byte big-endian length plus at most 8192 UTF-8 JSON bytes and exact EOF; the supervisor validates it and forwards the same private bootstrap to one fixed isolated child on descriptor 4. The supervisor sends `EXECUTE` exactly once only after both a valid request-correlated `READY` and successful completion/EOF of that descriptor write; terminal success requires both conditions. Control IPC otherwise contains only request-correlated enums. Direct CLI invocation without descriptor 3 fails with the single fixed failure line. No endpoint, workspace, address, digest, revision, secret, diagnostic, or raw error is placed in arguments, environment, standard streams, or control IPC.

All operations are macOS-only and fail closed before protected-file access or reservation on any other platform. They require the worker's actual current directory to be the canonical current-user `0700` workspace outside Git, with no macOS ACL. Fixed leaves must be distinct current-user regular `0600`, single-link files with stable retained-handle/path identities and no ACL. One import-safe, network-free private-workspace module exposes an opaque capability for fixed-leaf absence checks, reservation sets, reads, writes, identity checks, directory sync, and closure; it does not expose paths or handles. The pure schema module owns canonical endpoint/hostname parsing and serialization plus the single frozen hostname policy, so a later ingress producer can reuse the contract without importing the SDK or runner or duplicating filesystem rules. `PROVISION_ENDPOINT` validates the existing schema-v2 public-WS endpoint policy and exclusively creates canonical `{"kind":"gate-b-protected-endpoint-source","rpcEndpoint":...,"schemaVersion":1}` without contacting it. A later ingress step may exclusively create canonical `{"hostname":...,"kind":"gate-b-quick-tunnel-hostname-source","schemaVersion":1}`; this slice only accepts one lowercase non-IDN label beneath `trycloudflare.com`. Both sources remain private.

`PREPARE` exclusively reserves `payee-address.json`, `run.json`, `buyer-rpc.json`, and `facilitator-rpc.json` before reading `buyer-wallet.json`; after the complete distinct reservation set it immediately syncs both retained directory descriptors before any hook, protected-input open, or output byte. A successful directory sync makes those reserved names durable. A partial reservation or initial directory-sync failure leaves restrictive residue in the running system but has indeterminate persistence; operationally it still consumes and quarantines that workspace, with no retry. `PROVISION_ENDPOINT` and `AUTHORIZE` apply the same reserve-verify-two-directory-sync ordering before populating their single output. It proves the stored account-zero address, derives a distinct canonical account-one payee, and emits the exact current Gate-B configuration: one atomic native testnet ZNN, resource `https://<reviewed-hostname>/paid`, timeout 60 seconds, listener 41000, RPC timeout 30000 ms, and zero recovery with a one-millisecond elapsed bound. It copies the protected endpoint into two distinct schema-v2 RPC files, validates prospective and written artifacts with the merged parsers and SDK, syncs every file and the directory, and performs merged raw-source attestation before effects and immediately before success. It never creates or reserves `authorization.json`.

`AUTHORIZE` reopens and revalidates every private source and prepared artifact, rederives both accounts, recomputes the complete configuration digest, requires the reviewed lowercase digest and exact transport/payment/publication acknowledgements, and reattests the bound clean current-`main` revision before exclusively writing and syncing `authorization.json`. A later trusted in-memory controller must acquire or recompute `reviewedConfigDigest` after human review and supply it without arguments, environment, standard streams, or shell substitution; this primitive intentionally provides no direct shell-secret workflow. The authorization binds the parsed configuration, requirement, endpoint, run, intent, profile, acknowledgements, and revision. It does not bind the wallet inode or payer, so later same-user wallet replacement remains inside the private operational trust boundary. Reachable byte arrays and SDK keypairs are cleared best effort, but JavaScript strings are not reliably erasable. The helper performs no DNS, socket, RPC, server, signing, payment, evidence publication, or runtime activation.

The import-safe quick-tunnel controller is another source-only macOS primitive and is not registered with any CLI or live runner. A trusted in-memory caller supplies one canonical private frame containing a canonical operator-selected `cloudflared` executable, its lowercase SHA-256 pin, the private workspace, and exactly one telemetry acknowledgement pair. The launcher rejects non-macOS platforms before any fork, starts only the absolute fixed supervisor in a detached process group, uses the selected private workspace as the supervisor's exact current directory so the reused workspace capability can verify actual and canonical directory equality, puts the frame on descriptor 3, ignores standard streams, and uses request-correlated enum-only IPC. Its returned lease is a frozen fieldless capability. The selected workspace necessarily appears as that current directory; no other bootstrap value, hostname, connector identifier, metrics port, executable pin, acknowledgement, or diagnostic enters IPC, arguments, environment, current directory, or output.

The supervisor exclusively reserves and durably syncs the existing hostname-source leaf before any runtime effect. It then validates `/dev/null`, the pinned executable's canonical no-follow identity, current-user non-writable mode, native Mach-O header, bounded stable bytes, exact digest, and exact `2026.8.2` version before and after spawn. The installed-binary pin is operator trust, not vendor authentication. The only permitted future child command is the fixed accountless-tunnel command with auto-update, prechecks, management diagnostics, configuration, origin certificate and credentials disabled. Both the bounded `--version` probe and tunnel launch keep the attested absolute executable only as the OS exec target and fix child-visible argument zero to `cloudflared`, so that private path is absent from their argument vectors, options, environments, IPC and captured output. The tunnel environment contains only one process-owned empty `0700` directory as `HOME` and `TMPDIR`, its current directory is that same directory, and its standard streams are ignored. There is no shell, PATH lookup, restart or fallback, and the hard lifetime is ten minutes.

Readiness is derived only from a strict exact-PID `/usr/sbin/lsof` loopback-listener observation and direct numeric-loopback GETs of the `2026.8.2` `/quicktunnel` and `/ready` response contracts. Two equal observations precede the single durable hostname-source write; a gap, third equal observation and exact source reread precede `ACTIVE`. Every later readiness assertion repeats child liveness, listener discovery, both HTTP checks and listener rediscovery against the pinned port, hostname and connector identifier. A `CHECKED` send remains inside the same bounded check deadline. Stop preempts an in-flight check and suppresses later completion. The supervisor retains every tunnel spawn return before validation and attempts bounded direct-handle cleanup while preserving the private runtime quarantine if identity or closure is uncertain. The launcher separately retains the exact detached supervisor PGID and performs bounded exact-group probes with TERM/KILL escalation on both normal and failure paths; leader or direct-child close alone never proves group exhaustion. `STOPPED` and clean supervisor exit/close are necessary but the lease closes successfully only after that whole group, including any remaining descendants, is proved absent. Uncertainty rejects with fixed errors. The hostname is never overwritten or retried.

One telemetry mode explicitly accepts that `cloudflared` may send error telemetry; the other records an operator assertion that an external egress control blocks Sentry. The code validates only the exact acknowledgement pair and cannot verify firewall truth. The trust boundary still includes root and same-UID namespace/process control, the pinned local binary and host kernel, Cloudflare quick-tunnel and DNS/routing behavior, system clock and certificate roots. `/ready` proves only one currently reported edge connection, not public route reachability, stability or origin delivery, and a persisted hostname can become stale immediately. A future trusted controller must retain the lease and request fresh readiness immediately before `PREPARE`, again before `AUTHORIZE`, and again before any separately authorized live run. These checks authorize none of those steps. This source merge creates no tunnel, makes no network request or payment, publishes no evidence, and does not complete Issue #45.

The preceding public-WS input slice is confined to nine paths: this README, `docs/IMPLEMENTATION_PLAN.md`, the schema, launcher, CLI, supervisor, isolated child, shared private-workspace module, and one focused test file. It changes no existing runner, facilitator worker, source attestor, wallet helper, package script, dependency, or runtime activation path.

Ordinary live CLI output withholds the requirement, settlement object, payer, transaction identifier, listening URL, and protected response body. A future evidence package must be produced by a separate, explicitly reviewed workflow that discloses only its agreed public artifacts.

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

The built-in mock and live clients advertise only their exact Zenon network and `upfront` route. A wrapper must explicitly copy that immutable descriptor to participate in multi-offer negotiation. Descriptor-less clients retain the existing single-offer behavior and reject multi-offer challenges as ambiguous. Selection performs no speculative signing, SDK initialization, RPC, PoW, settlement, or protected-resource delivery. For both single-offer and multi-offer construction, the client receives a detached view containing only the selected offer. Success and recovery retain the untouched original challenge, so client mutation of that detached view cannot change the authoritative resource or selected requirement.

The strict local `ResourceInfo` profile requires `url`; `description` and `mimeType` are optional strings, and empty strings are accepted for interoperability with official server defaults. `serviceName` is an optional 1–32 character printable-ASCII string. `tags` is an optional array of zero through five printable-ASCII strings, each 1–32 characters. `iconUrl` is optional and, when present, must be a non-empty absolute HTTP or HTTPS URL of at most 2048 JavaScript UTF-16 code units with a hostname and no non-empty username or password. Exact field presence, `tags: []`, tag order, duplicate multiplicity, and the original `iconUrl` string remain distinct and are bound into the payment intent and retained recovery state. The buyer and resource server compare this complete representation, and a valid but mismatched submitted resource is rejected before facilitator invocation. Explicit `null` and unknown resource members remain unsupported.

At the top-level wire envelope, a `PaymentPayload` accepts an absent `extensions` property, the pinned official client's own enumerable data property `extensions: undefined` in memory, or an empty plain-object `extensions: {}` as equivalent. JSON transport omits the undefined property while preserving the empty object. `PaymentRequired.extensions: undefined`, `null`, non-empty maps, malformed containers, and unsafe descriptors remain unsupported. This is empty-container compatibility only: local clients and servers do not add or advertise `extensions: {}` by default, register, negotiate, execute, or echo extensions, or bind extension content into payment intent, signing, settlement, journal, or recovery state. It is not a claim of broader stable-v2 support.

`iconUrl` is metadata only. The PoC does not normalize, fetch, render, probe, resolve DNS for, or otherwise dereference it, and it does not reject a parser-accepted URL solely because its hostname is localhost, private, public, an IP literal, or internationalized. This boundary makes no SSRF-safety claim for any future dereferencing feature; such a feature requires a separate security design.

The resource server independently requires `upfront` before settlement or delivery. Here, `upfront` means successful settlement and Momentum inclusion precede release of the protected resource. Missing or non-upfront single offers remain rejected. The missing-field compatibility path is restricted to the existing single-offer Phase 2A characterization lane and is not enabled by ordinary runtime callers. This internal negotiation boundary is not a claim of complete stable-v2 compatibility, official x402 registration, an official Zenon network identifier, Phase 2C activation, hardware-wallet support, or production readiness.

The complete selected requirement, including this profile, is committed by the payment-intent digest in the signed account block. The signed block's `chainIdentifier` must equal the profile value.

`network: "zenon:testnet"` is only an experimental descriptive label. It is not a CAIP-2 claim and does not authenticate a chain. Exact chain identity would require both the chain identifier and the genesis identity to be authenticated and linked to the observed frontier. The operator-trusted historical policy, configured SDK network ID, and node self-reports do not supply that evidence.

Mock mode uses `network: "zenon:mock"` and an explicitly reserved synthetic profile. That profile is rejected for live requirements.

## Safety foundation

### Exact amount rule

Amounts are canonical positive decimal strings in atomic units. The maximum accepted amount is `2^255 - 1`, matching canonical go-zenon account-block validation. Zero, signs, leading zeroes, fractions, exponent notation, whitespace and `2^255` or greater are rejected.

### Offline preflight

Both `verify()` and `settle()` run the same strict offline preflight before opening an SDK connection. It validates exact object shapes, x402 version, network label, an HTTPS live resource URL, full requirement equality, resource binding, chain profile, account-block fields, recipient, ZTS, amount, intent digest, locally reconstructed hash, strict Ed25519 signature, payer/public-key binding, and block/profile chain-identifier equality.

Only a node-owned first `settle()` attempt with no durable record or tombstone and no exact transaction observation applies an additional payer-balance filter. After chain and asset validation, it reads the signed payer's account information through the bounded SDK read path, validates the account height and requested-ZTS entry without using accessors, and rejects an aligned balance below the signed amount before frontier inspection, subscription, any settlement-record write, publication, or delivery. A successfully returned account observation is followed by another exact-transaction lookup before its balance is interpreted; an exact transaction or concurrent durable record takes the existing reconciliation path instead. `verify()`, retries with durable evidence, tombstone matches, and already-observed transactions do not use this filter.

This balance check is only an obvious-insufficiency observation from one configured node. It is process-local and TOCTOU-prone, reserves no funds, does not authenticate chain state, and cannot exclude another process, publisher, stale view, or dishonest node. Unavailable, malformed, mismatched, or otherwise uncertain account information preserves same-payment recovery rather than becoming a definite rejection. The filter does not validate Plasma or PoW sufficiency, and no live payment or real-node evidence is claimed by this offline change.

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

Live settlement uses a versioned journal under the ignored `.runtime/` directory. After node-dependent pre-publication checks and before publication, it records the exact validated signed block, transaction and authorization identities, complete `ResourceInfo` representation, resource and chain-profile commitments, and the `VALIDATED` evidence state. URL-only and independently omitted optional metadata remain readable, while `serviceName`, `tags: []`, tag order, duplicate multiplicity, and the exact original `iconUrl` string survive persistence, reload, and recovery without normalization. Writes use a same-directory temporary file, file `fsync`, atomic rename, and directory sync where supported. Corrupt, malformed, or resource-tampered state fails closed. An initialization marker also makes a missing journal file fail closed after the first successful write; deleting both the journal and marker remains outside the guarantees of this local-file design. Schema-v1 journals remain readable and are not upgraded to v2 by reads, ordinary updates, or disabled retention. The first successful full-record-to-tombstone conversion atomically writes schema v2 with checksums over both active records and tombstones; rollback to a v1-only reader is unsupported after that write.

The current CLI supports one profile generation and retains the existing shared journal namespace. Profile rotation or rollback is not implemented. Before any second profile can become selectable, its journal state must be isolated from older-profile records and maintenance, recovery, and rollback behavior must receive separate tests.

The journal's default active-record capacity is 256 and it fails closed at capacity. Tombstones use a separate fixed capacity of 4096, remain subject to `maxFileBytes`, participate permanently in replay and uniqueness checks, and are never evicted or archived automatically. A tombstone or file-capacity failure preserves the full record and its existing recovery lane. This is a single-process, single-writer, single-host PoC mechanism, not a distributed lock or universal exactly-once guarantee.

The evidence and delivery states are:

- `VALIDATED`: offline validation succeeded; after node-dependent checks, the same evidence is durably recorded before any publication attempt;
- `SUBMISSION_ACKNOWLEDGED`: `publishRawTransaction()` returned successfully, or the exact block was observed without inclusion details;
- `SUBMISSION_OUTCOME_UNKNOWN`: publication may have reached the node, but its outcome was not established;
- `MOMENTUM_INCLUDED`: RPC lookup returned the exact block with `confirmationDetail`;
- `DELIVERY_PENDING`: an exclusive delivery claim was durably recorded; callback execution may have begun;
- `DELIVERED`: a response was recorded and can be returned on retry.

Known evidence is not downgraded after a transient lookup failure. Once publication returns its asynchronous request promise, every rejection is reconciled by exact transaction lookup. If the exact block is not observed, the outcome remains `SUBMISSION_OUTCOME_UNKNOWN`, whether the rejection appears to be a timeout, transport failure, or node-side refusal. Only a synchronous throw before the request promise is returned is a definite local failure. HTTP returns a PoC-specific `409` recovery response with `PAYMENT-RESPONSE`, `retrySamePayment: true`, and an instruction to reuse and reconcile the same payment rather than create another transaction.

Reconciliation retention is disabled by default: the `ExactZenonFacilitator` constructor accepts `reconciliationRetentionMs: null` or a safe integer from 3,600,000 through 2,592,000,000. Only an explicit zero-argument `runReconciliationMaintenance()` call evaluates persisted `createdAt`; `updatedAt` does not extend retention. Each serial call examines at most 64 deterministic candidates. There is no environment activation, scheduler, CLI, startup/request hook, background worker, distributed lock, or mandated invocation cadence. Exact included evidence strengthens the full record to `MOMENTUM_INCLUDED`; exact unconfirmed evidence strengthens it to `SUBMISSION_ACKNOWLEDGED`; unavailable lookup retains it; only fresh exact absence after the configured age can atomically replace an eligible `NONE`-delivery record with a tombstone. Backward clock movement delays terminalization, while a forward jump can terminalize early.

Maintenance takes the payer queue before the process-global live-SDK owner and holds both through the final journal compare-and-replace. This closes only same-process races. Existing tombstones are rechecked by exact transaction hash even when new terminalization is disabled. A first late inclusion is retained as operator-visible journal evidence, but it does not resurrect delivery, retry, resource access, refund, credit, or replacement-payment authority.

At the HTTP transport boundary, a missing `PAYMENT-SIGNATURE` receives the ordinary `402` challenge. A present header that cannot be decoded within the bounded transport profile, or whose submitted V2 payload is definitely malformed in shape, container type, recognized ResourceInfo type, descriptor or size constraints, descriptor-safe tag shape, malformed top-level `extensions` structure, or applicable Zenon primitive encoding, receives a private `400` response with `{"error":"invalid_payment"}` and no payment response headers. A correctly typed `iconUrl` that is empty, relative, unparsable, credential-bearing, or uses a non-HTTP(S) scheme remains a strict local-policy rejection in the `402` lane. Explicit `null`, a non-empty well-formed extensions map, unknown resource members, valid but mismatched representations, and rejected payments also remain `402`; an empty plain-object extensions map is accepted as absence. Uncertain settlement remains the PoC-specific `409` reconciliation lane. This is normative HTTP transport alignment, not complete stable-V2 compatibility or exact parity with the released TypeScript resource-server implementation.

As a stricter local PoC transport policy, each raw Base64 value in `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, and `PAYMENT-RESPONSE` has an inclusive limit of 8,192 UTF-8 bytes. Decoded JSON byte, depth, and schema guards remain separate, and this slice adds no aggregate HTTP header-section budget. An oversized submitted signature uses the private `400` lane; an oversized challenge fails locally before payment construction; an oversized response after submission retains the same-payment reconciliation path; and a server-side outbound overflow returns private `500` `internal_error` without either x402 response header.

A redacted `PAYMENT-RESPONSE` may accompany HTTP `402` only when the facilitator returns the exact compound evidence `success === false`, `state === "VALIDATED"`, `retrySamePayment === false`, and `deliveryState === "NONE"`, with exact network, transaction-hash, and canonical payer binding to the submitted payment. The public response uses the fixed reason `payment_settlement_failed`; facilitator error details and raw causes are not exposed, and `retrySamePayment` is omitted. Before submission, the buyer derives a detached, validated payment snapshot by decoding the exact encoded `PAYMENT-SIGNATURE` value that it will send. Settlement validation then binds the response network, transaction hash, and payer to that submitted snapshot.

A purported definite-`402` response with missing, malformed, additional, mismatched, ambiguous, wrongly statused, or unexpected evidence remains `payment_submission_outcome_unknown`. Other HTTP `402` responses are not implicitly definite. Valid HTTP `409` evidence remains the reuse-and-reconcile path for uncertain or recoverable outcomes. Neither an uncertain nor a definite failed payment releases the resource. This lane necessarily trusts the facilitator's exact compound state as evidence that publication and delivery were not attempted.

An exact tombstone match uses a separate local terminal profile: HTTP `402` with `PAYMENT-RESPONSE` only, body `{"error":"payment_reconciliation_terminal"}`, the retained prior evidence state, and no retry field or recovery owner. This is local retention abandonment, not proof of inclusion, irreversible finality, supersession, or permission to create a replacement payment. Malformed, mismatched, additional, accessor-backed, or dual-header candidates for this new reason fail closed as outcome unknown at the buyer; the server exposes malformed internal candidates only as private `500`. The existing dual-header `payment_settlement_failed` lane and PoC-specific `409` lane remain unchanged. The installed official parser's `settle_failed` classification is compatibility characterization, not standardization or official Zenon support.

Concurrent duplicate requests in one resource-server process converge on one in-flight settlement and delivery operation. A delivered response is cached and returned without republishing or rerunning the callback. Cached response bodies are stored as plaintext JSON in the local journal and are limited to 64 KiB, so operators must protect the runtime directory and must not use it for sensitive resource content. There remains a crash window after an arbitrary resource callback performs a side effect but before `DELIVERED` is durably recorded; the journal does not justify an exactly-once claim.

Live payment resource URLs must use HTTPS. The buyer does not follow redirects while carrying `PAYMENT-SIGNATURE`; a redirect, transport failure, or missing/mismatched settlement response after submission is treated as an uncertain outcome that retains the same payment for reconciliation. Every `/paid` response is marked `private, no-store` and varies on `PAYMENT-SIGNATURE` so shared HTTP caches cannot bypass the payment boundary.

On the buyer side, a valid recoverable result or a `PaymentSubmissionOutcomeUnknownError` produced after payment submission exposes a hidden, non-enumerable `recoveryHandle` whose value is the exact encoded `PAYMENT-SIGNATURE` string. The outcome or error object, not that string, is a linear single-use recovery capability for the same loaded buyer module instance. Pass the exact owner with `await reconcilePayment(recoverableOutcomeOrError)`; the call consumes that owner synchronously before making exactly one request to its privately bound target, resending the original string unchanged without fetching another challenge or constructing or signing another payment. A recoverable result or outcome-unknown error becomes the next owner and preserves the same hidden string; successful settlement, definite failure, and exact local retention terminalization expose no successor. Reused, concurrent, reentrant, serialized, cloned, proxied, forged, or foreign-module owners, as well as primitive strings and equal string copies, are rejected before a request. The private target and challenge binding is reachable from the recovery registry only through its current owner, so abandoning every owner does not leave a strong string-keyed registry entry; this is not a claim of JavaScript memory zeroization. Independently produced initial owners with byte-identical strings remain separate lineages, so a terminal result in one lineage cannot retire another without reintroducing a strong signature index. Restart persistence and recovery are not supported or claimed. The hidden string is sensitive, replay-capable signed payment material and must not be logged, shared, or persisted. Scheduling, backoff, and retry limits remain the caller's responsibility. Returned `paymentRequired` and `paymentPayload` snapshots are detached, non-authoritative copies whose mutation cannot change the private bound recovery state.

```js
const reconciled = await reconcilePayment(recoverableResult);
```

### Node-dependent checks

For the current operator-trusted policy, the facilitator requires `SyncState.SyncDone`, the exact historical height-2 identity tuple, and agreement between the frontier Momentum chain identifier, requirement profile, and signed block. It then validates non-native token metadata, checks the payer frontier, and inspects all unconfirmed pages implied by the node's `Count` value. Inspection is bounded to 200 blocks and fails closed for malformed, inconsistent, excessive or unavailable results. A page-zero recheck detects some concurrent changes, but it is not an atomic snapshot. A future authenticated implementation belongs in the separate authenticated-policy path; operator-trusted evidence cannot be promoted into it.

RPC polling remains authoritative for inclusion observation. Subscriptions are wake-up hints only and are cleaned up by closing the owned connection.

## Confirmation semantics

`MOMENTUM_INCLUDED` means only that the queried node returned the exact account block with a non-empty `confirmationDetail`. It is not a claim of irreversible finality, independently verified canonicality, or merchant receipt. The recipient's receive account block is a separate protocol event.

## Important limitations

- Phase 2C is deferred and remains `NO-GO`; production deployment is also `NO-GO`.
- Hardware-wallet support is not implemented.
- The planner, wallet, Plasma, payment-mechanism, chain-profile, and settlement-repository boundaries are not wired into the active live Zenon transaction path.
- No supported public unsigned-preparation or canonical-account-block-hash SDK API is consumed.
- The only shipped live profile is an operator-trusted historical observation; no authenticated live chain profile ships.
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
  buyer-cli.js                command-line paid-fetch entry point
  resource-server.js          protected HTTP resource and retry boundary
  server-cli.js               command-line resource-server entry point
  x402-wire.js                strict x402 wire/profile validation
  canonical.js                canonical JSON and payment-intent digests
  mock-payment.js             local mock client and facilitator
  demo.js                     local mock end-to-end demonstration
  zenon-payment.js            active legacy client and live facilitator
  live-runtime.js             process-wide SDK ownership and poisoning
  settlement-journal.js       dependency-free recovery journal
  config.js                   payment requirement configuration
  env.js                      dotenv and integer environment parsing
  local-devnet-readiness-runner.js
                              explicit opt-in readiness parent
  local-devnet-readiness-worker.js
                              isolated readiness-only SDK owner
  local-devnet-readiness-runner-cli.js
                              fixed-output readiness entry point
  settlement/
    settlement-repository.js  additive repository boundary
  x402/
    payment-mechanism.js      additive mechanism boundary
  zenon/
    chain-profile.js          additive chain-profile boundary
    operator-trusted-chain-policy.js
                              closed readiness-only family dispatcher
    operator-trusted-local-devnet-profile.js
                              offline local-devnet artifact boundary
    operator-trusted-testnet-profile.js  historical CLI trust policy
    wallet-adapter.js         additive wallet boundary
    transaction-planner.js    additive planner boundary
    plasma-strategy.js        additive Plasma boundary
    internal/
      legacy-sdk-1-0-5-signed-composite.js
                              active transparent legacy seam
test-support/
  phase2a-sdk-harness.js      isolated SDK/lifecycle harness
  phase2a-inputs.js           deterministic public scenario inputs
  phase2a-account-block-preimage.js
                              independent account-block preimage helper
test/
  fixtures/
    local-devnet-readiness-sdk-hook.js
                              test-only SDK module redirect
    local-devnet-readiness-sdk-fixture.js
                              hostile and valid Worker SDK shapes
    phase2a-exact-client-goldens.v1.json
                              immutable Phase 2A golden values
  architecture-boundaries.test.js
  chain-profile-source-vector.test.js
  cli-output.test.js
  conformance.test.js
  e2e.test.js
  operator-trusted-local-devnet-profile.test.js
  operator-trusted-testnet-profile.test.js
  journal.test.js
  live-runtime.test.js
  local-devnet-readiness-runner.test.js
  official-x402-client-interop.test.js
  official-x402-client-resource-server-interop.test.js
  official-x402-http-interop.test.js
  official-x402-resource-server-interop.test.js
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
LICENSE
SECURITY.md
```

## License

This project is licensed under the [Apache License, Version 2.0](LICENSE). The license grant provides no warranty and does not relax the security requirements in [SECURITY.md](SECURITY.md).

## Next target

Future work has two separate lanes:

1. Near-term work continues x402 correctness, interoperability, and operational hardening on the frozen legacy signing baseline.
2. A separately approved Phase 2C remains gated on a supported upstream unsigned-preparation and canonical-hash API, a wallet identity/lease/disposal and cleanup contract, and a separately versioned successor characterization suite.

Production prerequisites across either lane include independently authenticated chain-profile verification, durable multi-process settlement, an explicit confirmation policy, and official interoperability testing. Phase 2C and hardware-wallet work are not required for the current mock x402 flow.
