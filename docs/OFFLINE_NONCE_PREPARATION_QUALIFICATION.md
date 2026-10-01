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
requires zero exit plus process/private-stream closure. One JavaScript timer
requests termination after the configured three-second startup/work deadline;
a second timer, scheduled from the same attempt start, supplies the
non-sliding 500 ms cleanup budget and configured 3.5-second settlement
boundary. These are timer callbacks, and the owner does not independently
compare a monotonic elapsed clock before successful completion. The configured
3.5-second boundary therefore is not a hard wall-clock guarantee during
event-loop suspension or starvation. Child `close` alone does not satisfy
required closure while either private pipe remains unresolved. When the timer
callbacks run normally, closure completed before settlement preserves the
existing success or fail-closed result.

If the settlement-bound callback runs before required closure is observed, the
owner atomically puts the exact child, private streams, and required listeners
in a module-private strong reaper registry before rejecting with
`OFFLINE_ZENON_NONCE_PRODUCER_OUTCOME_UNKNOWN`. The frozen lifecycle reports
`ownerDisposition` as
`RETAINED_UNTIL_ACTUAL_CLOSURE` and reports only exit, process-close, and
stdio-close events observed by caller settlement. The reaper continues to
observe those original resources, keeps stream error listeners and a persistent
child error listener through closure, handles repeated late child errors,
ignores late protocol data, and retires the entry only after actual process and
required private-stream closure. It does not retry, spawn a replacement,
search by PID, detach, or `unref` the unresolved owner. This registry provides
process-lifetime ownership only; it is not durable operating-system containment
across a crash or process restart.

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
a hosted workflow result. At that historical local-only checkpoint, Linux and
hosted CI had not yet been observed. The later distinct hosted observation
below does not retroactively make this local result hosted evidence. Live
RPC/payment behavior and real throughput were unverified then and remain
unverified.

The initial standalone offline qualification checkpoint excludes the seven
buyer tests from the combined checkout. Its single local Node 24.19.0 macOS
full suite reported 5,488 tests: 5,487 passed, none failed or cancelled, one
existing skip, and no todos. All 59 captured offline-specific parent tests
passed. This initial standalone result is likewise not hosted CI, live-chain,
or throughput evidence.

The bounded-owner lifecycle change was developed red-first. Before the source
change, the focused owner file reported 17 tests: 15 passed and the two new
bounded-settlement cases failed. The final focused Node 24 run reported all 17
passing, with no failures, skips, cancellations, or todos. Those cases cover a
failed `SIGKILL` with no process close, both request- and response-pipe close
withholding after observed process exit/close, late exact-owner closure,
frozen historical evidence, single settlement, and peer/decoy isolation.

An earlier task-owned report states that the first full run after
implementation exposed an unintended lifecycle-shape change and reported
5,488 tests: 5,473 passed, 14 failed, one skipped, and none cancelled or marked
todo. It then records that normal closed outcomes were restored to their prior
shape, so only a retained unresolved owner receives `ownerDisposition`. The
same report records a later isolated-symlink-layout run with 5,488 tests:
5,478 passed, nine failed, one skipped, and none cancelled or marked todo. Its
targeted diagnosis attributed those remaining failures to genuine children
exiting before READY: Node 24 required lexical-path access through the
worktree's `node_modules` symlink, while the reviewed fixed guard permits only
canonical child, manifest, and individual dependency paths. This handoff
update preserves that bounded historical report; it does not newly reproduce
or independently re-establish its triage.

The symlink was then retained recoverably outside the checkout and replaced
locally by a byte-matched, mode-preserving physical copy of the same installed
dependency source. No package manager, download, runtime change, child change,
or lexical permission exception was used. The initial post-lifecycle Node 24
full suite in that physical layout reported 5,490 tests: 5,489 passed, none
failed or cancelled, one existing skip, and no todos. Runner exit and output
closure were observed. Postchecks preserved source/test bytes, the fixed
permission guard, SDK 1.0.5 bytes, the dependency source, runtime bytes, index,
Git refs, and the original source checkout. The historical combined counts,
initial standalone checkpoint, and post-lifecycle result are separate local
observations.

A narrow reviewer correction then kept the owned child's error listener active
until the same actual-closure cleanup that removes its other listeners. The
new repeated-late-error assertion made the focused owner file fail 1 of 17
before that correction and pass all 17 afterward. The latest complete local
Node 24 suite in the physical dependency layout reported 5,490 tests: 5,489
passed, none failed or cancelled, one existing skip, and no todos. Runner exit
and output closure were observed. This latest result remains separate from the
initial standalone 5,488-test checkpoint and the combined 5,495-test result.

A separate full-suite invocation, distinct from the 14-failure and
nine-failure observations above, recorded two failures. The PR validation
record reports that a targeted follow-up and a default full rerun passed. No
identifiable task-owned primary trace containing those two individual test
identities or their causes was available for this handoff, so both remain
unavailable. No aggregate total is asserted for that invocation, and later
green runs do not establish its cause.

A distinct
[hosted Ubuntu/Node 24 Test workflow observation](https://github.com/edgepillar/zenon-x402-poc/actions/runs/36791671788)
at the exact reviewed PR head reported 5,490 tests: 5,432 passed, none failed,
58 skipped, none cancelled, and no todos. The 58 skips comprised 57 existing
macOS-specific tests and one existing PTY test; none was a new offline nonce
qualification test. All 61 top-level tests added by this PR were present as
successful, non-skipped output, including the genuine two-child
PRE_DP/recorded-DP_ACTIVE preparation test. This is bounded hosted offline
qualification only. It is not evidence of a live chain, signing, payment,
finality, authenticated identity, or throughput.

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
testnet/mainnet transfer. Bounded hosted Ubuntu offline qualification is now
observed. That workflow does not qualify its skipped native/macOS features or
any unsupported platform; the separate local macOS observations remain
bounded as stated above. Every live-chain gate remains unverified. The
remaining gates include separately reviewed frontier/quote freshness,
per-payer sequencing and admission, and durable uncertainty recovery. Only
after those gates should a separately authorized current-epoch, multi-payer
measurement be considered. Trust anchors, signing, activation, and publication
remain separate decisions.
