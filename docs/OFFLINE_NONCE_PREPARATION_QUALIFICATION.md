# Offline Nonce Preparation Qualification Handoff

## Scope and status

This local qualification covers the internal
`produceOfflineUnsignedPreparation(trace)` connector in
[`offline-owned-nonce-preparation.js`](../src/zenon/internal/offline-owned-nonce-preparation.js).
It composes an unsigned, data-only block from a recorded offline trace and, only
for positive work, delegates one scoped nonce computation. It is not a public
entrypoint, planner, signer, publication grant, or activated integration.

The connector accepts exactly one argument. The
[`recorded-trace contract`](../src/zenon/internal/offline-observation-to-preparation-contract.js)
validates the raw trace before `structuredClone`, so cloning cannot evaluate
untrusted accessors first. The connector detaches and freezes the snapshot
before its first `await`. The unchanged
[`unsigned preparation`](../src/zenon/internal/pre-sign-account-block-preparation.js)
derives the original payer, previous-account hash, and difficulty from the
prepared block, not later caller state or producer output.

For zero difficulty, the connector uses the unchanged
[`preparation/proof composition`](../src/zenon/internal/offline-preparation-nonce-contract.js)
and returns `producerEvidence: null`; no producer is called. Positive work
requires the canonical staging placeholder. Pre-supplied non-placeholder work
is rejected before production. The connector calls the unchanged
[`owner`](../src/zenon/internal/offline-pow-producer-owner.js) once with the
original derived scope, waits for genuine settlement, and replaces only the
detached snapshot's `nonceRecord`. Final composition still uses the pure
contract and retains an empty unsigned signature. The
[`nonce predicate`](../src/zenon/internal/offline-nonce-proof-verifier.js)
remains unchanged.

Input failures use `OFFLINE_OWNED_NONCE_PREPARATION_INPUT_REJECTED`. Defensive
failures after successful production use
`OFFLINE_OWNED_NONCE_PREPARATION_POST_PRODUCTION_REJECTED`. The awaited owner
call is outside the post-production catch, so sanitized owner errors, including
`OFFLINE_ZENON_NONCE_PRODUCER_OUTCOME_UNKNOWN`, propagate unchanged. There is no
retry, replacement candidate, local race, or ownership shortcut.

## Evidence map

| Evidence | What it establishes | Boundary |
| --- | --- | --- |
| [Q12 modeled tests](../test/offline-owned-nonce-preparation.test.js) | Fail-closed trace handling, zero-work composition, modeled positive work, mutation resistance, closure waiting, and unchanged uncertainty | Fake transport markers are not actual SDK or native-entry evidence |
| [Q13 real combined test](../test/offline-owned-nonce-preparation-parallel.test.js) | Two distinct connector calls started without serial waiting; real isolated children, private-pipe correlation, independent predicates, original scope and acknowledgement preservation, and complete owned closure | Per-file two-call evidence only; not shared-session or throughput evidence |
| [Earlier mocked concurrency test](../test/offline-pow-producer-concurrency.test.js) | Independent actor state and owned-cleanup behavior under controlled interleaving and failure | Mocked transport does not establish live concurrency |
| Local negative controls and full regression | Intended success paths fail when key composition/connector boundaries are replaced; unchanged suite remains green | Local, unpublished observations do not prove absence of bugs or hosted-CI portability |

## Lifecycle and trust boundary

The owner and fixed
[`child`](../src/zenon/internal/offline-pow-producer-child.js) use private FD3/FD4
frames. Successful output is READY, JavaScript-wrapper invoked, then terminal
success; rejected or partial output need not complete this sequence. Success
requires zero exit plus process/private-stream closure. The three-second
startup/work deadline requests termination, not guaranteed settlement.
Unresolved termination/closure preserves ownership and uncertainty and
forbids replacement.

`JS_WRAPPER_INVOKED` describes the JavaScript wrapper only.
`nativeOrWasmEntry` remains `NOT_ESTABLISHED`, because no native/WASM entry
instrument exists. The network boundary remains
`TRUSTED_ARTIFACT_JS_DENIAL_FACADE_NOT_OS_SANDBOX`; it is not a claim of
universal operating-system network isolation.

The returned wrapper qualification is `OFFLINE_OWNED_PREPARATION_ONLY`. Its
composition and optional producer evidence remain unchanged, deeply frozen,
and data-only. The six trust dimensions `sourceAuthentication`,
`chainAuthentication`, `canonicality`, `finality`, `liveFreshness`, and
`signingAuthorization` all remain `NOT_ESTABLISHED`.

## Observed qualification

Q12's five modeled cases covered malformed, accessor, proxy, alias, and
mismatched trace inputs before delegation; fused PRE_DP and DP_ACTIVE zero-work;
modeled recorded-price positive work; caller mutation with withheld closure;
pre-supplied-work rejection; and unchanged owner uncertainty.

Q13 used distinct public synthetic payer, frontier, intent, and context inputs:
one PRE_DP trace and one recorded DP_ACTIVE elevated-price trace. It observed
two genuine delegates and independent private pipes, correlated each success
frame with its owner DTO, independently checked the SHA3/LE64 predicate, and
preserved original difficulty, fused plasma, intent, context, and momentum
acknowledgement despite caller mutation. Results were frozen and data-only with
empty signatures and complete exit/process/stdio closure. No successful child
was signaled or output injected. The two-call budget is per test-file process,
not global; the full regression also ran earlier qualifier files.

Calibrated local negative controls replaced Q12 composition and the combined
connector in memory. They failed at the intended boundaries with zero actual
delegates, produced sanitized post-production failures where applicable, and
preserved owner uncertainty. These controls are not published CI evidence.

The initial normal local regression on the combined qualification checkout
reported 5,495 tests: 5,494 passed, none failed or cancelled, one existing
skip, and no todos, using Node 26.5 on macOS with installed SDK 1.0.5.

A subsequent single full-suite invocation of that combined checkout reused an
existing Node 24.19.0 runtime on macOS and reported the same counts. The
combined real
PRE_DP/recorded DP_ACTIVE preparation parent, five modeled connector cases,
and existing isolated producer/composition parents passed. The owned runner,
process group, stdout, and stderr closed naturally, without timeout, signals,
capture overflow, or a retry. Independent postchecks preserved all reviewed
file bytes, SDK 1.0.5, runtime bytes, Git refs, and the original source checkout.
No runtime was installed and no dependency changed. The package declares
Node >=24 and the existing workflow selects Node 24; this local result is not
a hosted workflow result. Linux, hosted CI, live RPC/payment behavior, and real
throughput remain unverified.

A separate standalone offline qualification branch excludes the seven buyer
tests from the combined checkout. Its single local Node 24.19.0 macOS full
suite reported 5,488 tests: 5,487 passed, none failed or cancelled, one
existing skip, and no todos. All 59 captured offline-specific parent tests
passed. This separate local result is likewise not hosted CI, live-chain, or
throughput evidence.

## Explicit limits and next gates

A recorded DP_ACTIVE classification and elevated quote are not a fresh or
authenticated RPC quote, actual spork activation, or chain evidence. Work is
computed after recorded before/after observations; it neither refreshes
frontiers or prices nor resolves the quote-to-inclusion race.

PoW checks a candidate against the payer/previous-account-hash domain at
required difficulty. Stronger candidates may satisfy weaker thresholds; a nonce
does not uniquely commit that difficulty. It authenticates no intent, resource,
amount, chain, or epoch and provides no expiry, cancellation, finality,
delivery, or signing authority. Unsigned intent/context is a separate contract.

Two isolated owners started without serial waiting do not establish shared SDK
session parallelism, same-payer safety, admission control, latency improvement,
live L1 concurrency, TPS, or sustainable capacity. This qualification made no
testnet/mainnet transfer. Next gates are cross-platform and hosted CI
qualification, followed by separately reviewed frontier/quote freshness,
per-payer sequencing and admission, and durable uncertainty recovery. Only
after those gates should a separately authorized current-epoch, multi-payer
measurement be considered. Trust anchors, signing, activation, and publication
remain separate decisions.
