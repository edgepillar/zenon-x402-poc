# Full native DP loopback: selected local result

On 2026-10-24, one separately authorized synthetic local attempt passed all three
selected cases. This is actual native application execution, not a replay of a
recorded result or a syntax-only check. The allowance is consumed; this report
does not authorize another run.

The qualified source head is `aaf6967e940780affed0c3517a9f8c4aaafff75f`.
All 74 application/profile inputs, five launcher inputs and the manifest matched
that head. The native preloader verified the complete 456-file application and
existing-package inventory before importing the fixture. The manifest SHA-256 is
`a472e3bcd8840ef4236e395cb918ae5f2a84be9ca45d8f59417c0b77da291933`, with source-row seal
`e6617bdc907d1c2d362e459038bda0801e3eb71e62a8e637b8d5ebb9cedd89b1`.

The machine-readable record is
[`dynamic-plasma-full-native-loopback.actual-local-result.json`](../qualification/dynamic-plasma-full-native-loopback.actual-local-result.json).
The original [source-only review](../qualification/dynamic-plasma-full-native-loopback.source-review.json)
is preserved unchanged as historical evidence.

## What passed

| Selected case | Observed application behavior |
| --- | --- |
| BOUND | Actual native read owners, positive bounded work, SDK signing/preflight, independent pins, V6 custody and one original HTTPS funding POST reached BOUND; actual joined close succeeded. |
| Lost funding ACK | The server dropped the socket only after observing the original durable-fenced POST. V6 retained the original checkpoint as OUTCOME_UNKNOWN. The actual owner refused store.close; no replay, replacement, re-signing or reopen occurred. |
| Horizon expired after signing | A later read exceeded the permitted horizon. Commit was refused before custody and before a funding POST; the signed candidate remained unchanged and normal joined close succeeded. |

One OpenSSL command and one Node 24.19.0 process completed with exit 0 and
complete captures. Node spawned no children. Three new synthetic V6 databases,
three independent pin files and one in-memory synthetic transaction key were
used. The three tests passed without skips, cancellations or TODOs.

The observed transcript contained 272 TCP/TLS connections restricted to IPv4
loopback: 270 RPC requests and two funding requests. It contained three
transaction signatures and three unique signed hashes. Two owners closed
normally; the one expected HELD store was not force-closed. Fixture-owned raw
and TLS socket sets were empty at completion, with no asynchronous errors or
forced server cleanup. These are selected correctness counters, not a latency,
concurrency or throughput benchmark.

The reference searched 13,081 candidates in four bounded windows. Adding the
12,288 producer reservation and 16,384 fixed-verification reservation gives
41,753 reserved candidates, below 65,536. Each producer search was capped at
4,096. The actual producer evaluation count was not instrumented; the reservation
must not be presented as a measured aggregate evaluation count.

## Task close is separate from cleanup

The private managed task reached CLOSED/SUCCESS. Its final cleanup disposition
was HOLD because child-created SQLite and pin files were unregistered. Those
files remain protected evidence; they were not adopted, force-closed, reopened
or deleted to obtain a clean result. Test PASS does not imply cleanup PASS.

The task used a 4 MiB quota and a 10 GiB production free-space floor plus
historical reservations and safety margin. Sources and existing packages were
read in place. No dependency installation occurred. Private profiles, paths,
TLS key material, payment/checkpoint bytes and raw captures are not published.

## What this does not establish

The real native transports and real SDK/V6 code ran, but their chain observations
and funding acknowledgment were synthetic. The namespace used five explicitly
pinned bare-import bindings; ordinary installed-namespace compatibility is not
qualified. Native builtins and sources were not replaced or transformed. There
was no Node Permission Model or OS/network sandbox claim.

Official x402 runtime composition, the issued/selected-grant service vertical
slice, provider or capability signing, SDK PREPARE, external network, real wallet
or payment, chain publication, inclusion/finality and live pilot were not included.
This is not full P1 completion, current-main qualification, hosted CI, economic
acceptance or production readiness. Main/CI publication remains a separate gate.
