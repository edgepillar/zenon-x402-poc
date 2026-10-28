# Current API-credit application status

Baseline [d9a65eaf](https://github.com/edgepillar/zenon-x402-poc/commit/d9a65eafd73323961643ebc66232dcf0d133d6ab),
28 October 2026. [Current roadmap](docs/ROADMAP.md).

Target: one Zenon funding -> one grant -> many metered API requests, with exact
original replay/recovery. No production or economic pilot acceptance is claimed.

| Area | Evidence and remaining work |
| --- | --- |
| Current CI | [108 selected DATA/component controls passed](https://github.com/edgepillar/zenon-x402-poc/actions/runs/40746894739). This lane runs on PR/main push but does not execute native SDK/core/SQLite/HTTPS. Main requires a reviewed PR and this check, including administrator enforcement. |
| Paired funding/liability | [26 DATA cases passed](qualification/service-purchase-order-application.actual-local-result.json). Both records precede funded HTTP success; lost acknowledgements and replay are covered with synthetic I/O. This is not funding->grant->100-call native acceptance. |
| Spending reservations | [25 DATA cases passed](qualification/original-funding-spending.actual-local-result.json): exact payer/accepted-term binding, per-payment/total/daily exposure, unresolved carry, CAS conflict/lost ACK, reopen refusal and late BOUND. Opt-in actual lifecycle binding; SQLite durability and the native product entry remain unqualified. |
| Retained native evidence | V4 clean, V5 bounded pending and V5 service-commit-loss/backend replay remain source-bound results. Reuse only unchanged scopes; preserve failures and report defects separately. |
| G0 | OPEN: select/admit the complete product graph, one entry/data profile and Linux runtime; classify relevant failures and verify uncovered differences. Required PR/CI controls are enabled. |
| G1 | OPEN: one documented product entry, one grant and 100 distinct metered requests; replay/reopen counts, concurrent/restart-safe spending limits and Linux verification. |
| G2 | OPEN: current funding ACK-loss acceptance, fresh-process reopen, signer loss, stale-owner/late-close matrix and native physical release. |
| G3-G5 | Trust, DP profile acceptance, bounded testnet and separate economic/mainnet decisions remain open. |

Reproduce the retained failure/evidence inventory without executing its native
programs: `node scripts/report-acceptance-evidence.mjs`. This is an inventory
command, not the missing product entry command. The inventory verifies frozen
artifact hashes/statuses and retains product/harness distinctions; it cannot
turn source or documentary results into an accepted gate.

Current native execution is disabled by user instruction. The prepared paired
native draft is not selected as the supported one-grant product profile. New
feature families and unrelated capacity work do not precede the G0/G1/G2 package.
