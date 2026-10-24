# Issued-native clean V1: retained failure and source correction

One separately authorized clean attempt ran on 2026-10-24 against source head
`ef0951b73e1c1b0d3b6eda00f5373fcadebf638e`. It failed during actual application
construction. The original allowance is consumed; it was not retried.

The original 520-input namespace was checked before case imports. OpenSSL
completed with exit 0; the actual Node case completed with exit 1 and complete
captures. TAP reported one test, zero passes, one failure and no skips,
cancellations or TODOs. The retained public error code is
`official_issued_funding_post_native_application_construction`.
The application intentionally did not retain a raw nested exception, so this
coarse error does not locate the exact inner construction step.

The managed task closed with FAILURE. Cleanup remained HOLD and all synthetic
SQL, TLS and command evidence was preserved. Two SQLite files and no independent
pin file were present after failure. A completed native case/footer, grant
activation, funding/service completion and cleanup success are not established.
The loss-of-ACK case was not run.

See the [failed native record](../qualification/issued-funding-post-native-vertical.clean-v1.failed-local-result.json).
Neither the original manifest nor the old source-review records were rewritten.

## Guaranteed incompatible case limits

The old case supplied a 5000 ms request/response deadline but only a 1000 ms
ingress close grace. The actual ingress requires the response deadline not to
exceed close grace. That input cannot pass its real limit admission. This is a
source-proven defect, not proof that no earlier independent failure occurred.

The corrected case uses 5000 ms for close grace. No native limit was weakened.
The ingress's complete exact-field, per-number and cross-budget admission now
lives in `src/service-credit-bounded-https-ingress-limits.js`. Both the real
native owner and the issued application call this same DATA-only function.
The application checks it before the initial store read, intake challenge
issuance or official SDK initialization. Invalid limit DATA therefore has no
path past that new source boundary into those operations.

This extraction preserves all thirteen fields, numerical ceilings, capacity
relationships, deadline ordering and the 32-counter metrics reserve. It rejects
getters, proxies, coercions and unexpected shapes without invoking caller hooks.
It grants no authority to activate, sign, issue, execute, recover or start TLS.

## Actual follow-up checks, not a second native run

The shared validator's twelve DATA-only tests passed. They cover the original
bad limits, the corrected combination, all field bounds, cross-budget ordering,
snapshot immutability, and no-hook refusals. The current admission/parser's 21
DATA-only tests also passed; their fabricated native receipts are not SDK/SQL,
crypto, transport, cleanup or application execution evidence.

Four changed JavaScript sources passed syntax-only checks. Three Python
sources compiled in memory without bytecode. No issued-native application was
imported by these checks. The prior three-case full-DP source inventory remains
unchanged; its earlier selected PASS is not reused as an issued/grant PASS.

The distinct corrected inventory is
`qualification/issued-funding-post-native-vertical.inputs-v2.json`, SHA-256
`980bc24a3effe011b6199338f3a3224da8c79e33b48a40296cbe4bf13ee21c5b`.
It preserves the complete graph: 117 application/profile inputs and 404 existing
package inputs, with source-row seal
`a21d6b74f995786807793b7c2417b63fe66b82e0480b67a3ec7c580e32c71b09`.
No module/source alias, reduced graph or smaller substitute is used.

The corrected native selection has not run. Its use needs a fresh explicit
allowance, source/package/tool/mount/capacity admission and a new private task.
The original failed store/task will not be reopened or reused. Main/CI,
ordinary installed compatibility, full P1/P2 and live/production qualification
remain separate.
