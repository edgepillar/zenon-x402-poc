# Actual original-funding v2 native qualification profile

This is a separately versioned test implementation for the explicit contextv7
original-funding preparation/submission v2 owners. It preserves the earlier
two/eight/nine-case entries and consumed V4 profile unchanged. The input
inventory is not an execution result, human authority or an activation claim.

## Actual local result: 11 pass, 1 fail; not fully qualified

The bounded three-run approval is exhausted. All three native commands exited
1 with complete captures; no fourth native command was launched. The
[actual result](../qualification/dynamic-plasma-original-funding-submission-v2-native.actual-local-result.json)
preserves separate source bindings, counters, all twelve case outcomes and
sanitized streams for every attempt. Raw streams and executed source bytes
remain protected privately. Earlier failures are not relabeled as passes.

| Attempt | Passed / failed | First blocking stage |
| --- | --- | --- |
| 1 | 0 / 12 | Fixture used a service path rejected before file creation. |
| 2 | 0 / 12 | Node Permission Model rejected the genuine store's fchmodSync. |
| 3 | 11 / 1 | Fixture expected successful close after bounded drain exhaustion. |

Attempt 3 reached real SDK preflight, ten synthetic transaction signatures,
twelve private SQLite files, ten independent pin files and three in-process
fetch callbacks. Price advances one and two, horizon refusal, exact original
custody, ambiguity and the direct payer reentrant-close case passed. The one
failed case rejected with `close_unknown`; its finalizer can mask an earlier
assertion, so the old case's complete late-response/retained-custody predicates
are NOT established by that failure alone.

The reviewed payer contract makes exhausted drain terminal: close must reject
and keep the same owner/store, even after late completion. A separate corrected
body and selection driver retain all twelve scenarios and strengthen those
assertions. They are AUTHORED / NOT EXECUTED, not a corrected passing result.
They are not selected by the old executed profile. Fresh matching native
authority, profile, launcher and private capacity are required before running.

Implementation and test sources remain on
[the scoped source branch](https://github.com/edgepillar/zenon-x402-poc/tree/x402/p1-router-late-pending-close-integration-v2).
The main publication contains evidence only: neither original-funding effectful
owner nor the payer-owner/drain integration is promoted by this report.
Main is not a runnable qualification checkout. The package-input inventory
resolves at its explicitly pinned source commit, not at a missing main path;
test and implementation source association must use the scoped source graph.

The selected driver includes all eleven v2 funding cases plus one direct
payer/V6 recovery-close regression. None of the earlier eight scenarios is
filtered out to obtain an easier passing subset.

1. Exact original capture, independent pins and one funding-intake acknowledgement.
2. Lost response preserves the original unknown outcome through normal reopen.
3. V6 commit-before-return loss prevents automatic submission or replacement.
4. Existing durable attempt fence rejects conflicting submission before transport.
5. Reentrant close during actual recovery prevents later submission entry.
6. Unresolved synthetic transport and late BOUND: the old successful-close expectation failed.
7. A genuine V5 negative store refuses V6 checkpoint commit before any POST.
8. Price advance one preserves the same signed bytes, ACK, nonce and V6 custody.
9. Price advance two does the same within the original horizon.
10. Horizon expiry retains the signed packet before any store entry, without a new attempt.
11. Configuration rejects proxy/wrong-brand/shadowed stores and unsafe fetch.
12. Direct actual payer recovery/close reentry completes safely and permits normal reopen.

The executed attempt-3 graph has 436 inputs / 2,639,285 bytes: 54 application and
382 existing package files. All 49 application runtime inputs match the scoped
published source parent; five new qualification sources complete this graph.
The packages are the real existing SDK 1.0.5, Noble Ed25519 2.3.0 and Noble hashes
1.8.0, with their full reviewed dependency input list. No installation or smaller
fake SDK/preflight/store is selected.

A synchronous native Node 24.19.0 / Darwin arm64 resolver redirects only five
explicit bare-import edges to three actual package entries. Other resolution
uses Node unchanged and must land in the reviewed input set. No implementation
source transform, async loader worker or child process is supplied. Package
resolution and source checks are cooperative guards, not an OS/network sandbox.
Attempt 3 deliberately did not enable Node's Permission Model: the pinned
[Node 24.19.0 implementation](https://github.com/nodejs/node/blob/v24.19.0/lib/fs.js#L1912-L1919)
disables `fchmodSync` whenever that model is enabled. The genuine descriptor-based
store and its private-mode, no-follow, identity, schema and ownership validators
remain unchanged. No fs monkeypatch, fake store or all-files grant was used.

Each authorized run is limited to one direct Node command, at most twelve NEW
private SQLite files (eleven V6 and one V5 negative), ten independent pin files,
one ephemeral synthetic Ed25519 key and ten transaction signatures. Three fetch
callbacks are declared in-process responses, NOT sockets or native HTTP/HTTPS.
Current account/DP reads also use declared JSON callbacks. Difficulty is zero;
no nonce search, SDK prepareBlock, chain PREPARE or real wallet/payment/provider
operation is selected.

The operator approved this exact effect scope for at most three local runs,
including reviewed fixes within these selected cases. Those runs have now all
been consumed. That approval is NOT
permission for other SDK/native tests, old-profile replay, package installation,
real signing/payment, live runtime activation, provider setup or pilot. Actual
launch, exit, complete streams and source binding must still be inspected;
selection strings or this document alone never authorize a run.

New qualification writes must use one newly initialized private manager root on
the verified approved volume. Each fresh task has a 4 MiB logical quota; the
production 10 GiB free-space floor plus expected allocations and existing held
reservations remains in force. The new root permits at most three tasks and one
native command per task. Existing roots, source retention, held raw fixtures and
their metadata are not cleaned, rebound, adopted or silently bypassed.

The launcher checks source, package, runtime/manager identity, mounted volume,
capacity and profile immediately before admission/launch. Source/profile and
bounded raw captures are protected through the manager; there is no recursive
archive or duplicate full SDK copy. Unknown child-created DB/pin files remain
HOLD on close rather than being retroactively adopted for deletion. Native
readback/normal reopen is not forced-exit, crash or power-loss qualification.

This input inventory is not an execution result. Actual results are recorded
separately with exact input and output digests; old results are never rebound
to a changed graph. Positive PoW in the current signing/custody chain, real
RPC/runtime/chain validation, P2 forced interruption, hosted CI and economic
pilot acceptance remain separate gates.
