# Current API-credit application status

Baseline [373b4f0e](https://github.com/edgepillar/zenon-x402-poc/commit/373b4f0ea1dc3efea72de06ae4c20512ff1e77d8),
29 October 2026. [Current roadmap](docs/ROADMAP.md).

Target: one Zenon funding -> one grant -> many metered API requests, with exact
original replay/recovery. No production or economic pilot acceptance is claimed.

| Area | Evidence and remaining work |
| --- | --- |
| Current CI | [108 selected DATA/component controls passed](https://github.com/edgepillar/zenon-x402-poc/actions/runs/40777495110). This lane runs on PR/main push but does not execute native SDK/core/SQLite/HTTPS. Main requires a reviewed PR and this check, including administrator enforcement. |
| Paired funding/liability | [26 DATA cases passed](qualification/service-purchase-order-application.actual-local-result.json). Both records precede funded HTTP success; lost acknowledgements and replay are covered with synthetic I/O. This is not funding->grant->100-call native acceptance. |
| Spending reservations | [27 DATA cases passed](qualification/original-funding-spending.actual-local-result.json): exact payer/accepted-term binding, per-payment/total/daily exposure, unresolved carry, CAS conflict/lost ACK, reopen refusal and late BOUND. Opt-in actual lifecycle binding; SQLite durability and the native product entry remain unqualified. |
| Spending store candidate | [43 DATA controls and two parser checks passed](qualification/original-funding-spending-store.actual-local-result.json). The native SQLite port/assembly is source-only. Epoch/profile/state-history contracts and pending/malformed/lost-ACK composition are DATA covered; actual SQL, restart, contention and physical release are unqualified. |
| API-credit command entry | [17 DATA controls passed](qualification/api-credit-command.actual-local-result.json): opt-in 128-command owned entry, one declared funding/model grant, 100 distinct model debits/executions and exact replay. Original/recovery limits stay unchanged. This programmatic component is not the supported native product launch command; real SDK/core/SQLite/HTTPS, fresh-process reopen and Linux acceptance remain open. |
| Native API-credit binding candidate | [38 DATA controls and eight parser checks passed](qualification/api-credit-application.actual-local-result.json). The named buyer adapter now selects the fixed native wallet/funding/service and actual spending-file/SQLite owners as source. Current-epoch preflight and ordered logical/physical close are DATA covered; native execution, atomic cross-process dispatch fencing, Linux and the product bootstrap remain open. [Pinned source profile](qualification/profiles/api-credit-application-source-v1.json). |
| Admission before acquisition | [60 DATA controls and three parser checks passed](qualification/api-credit-admission.actual-local-result.json), including the earlier 38 application controls. The early selector and actual native opener share operational validation; one-use consumption rechecks the existing key-method shape and original CA digests before the budget-file/wallet call. Native execution, product launch and Linux acceptance remain open. [Current source profile](qualification/profiles/api-credit-application-source-v2.json). |
| Fixed API-credit product source | [84 DATA controls and three parser checks passed](qualification/api-credit-product.actual-local-result.json), including the earlier 60 controls. The named product entry binds one external original challenge, origin/network/asset/recipient and spending policy; a coherent different offer is refused before reservation. One model funding/grant, 100 distinct model debits/executions and exact replay pass through the actual application gate. Native execution, operator key bootstrap and the shell launch command remain open. [Current source profile](qualification/profiles/api-credit-application-source-v3.json). |
| Existing-key operator boundary | [111 DATA controls and three parser checks passed](qualification/api-credit-key-lease.actual-local-result.json), including the earlier 84 controls. The optional exclusive-key lease revokes before unclaimed cleanup and delegates to the same wallet owner after native claim. Late ownership cannot upgrade HELD or grant a new opening. Tests use declared JavaScript method ports, not SDK keys or cryptographic signing. [Current source profile](qualification/profiles/api-credit-application-source-v4.json). Native execution, operator secret/bootstrap and shell launch remain open. |
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
