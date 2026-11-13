# Current API-credit application status

Target: one Zenon funding -> one grant -> many metered API requests, with exact
replay and recovery using the original payment and request.
**All G0-G5 product acceptance gates remain OPEN.**

## Current source and evidence

The [current source manifest](qualification/acceptance/api-credit-current.source-profile.json)
selects the [V95 application source candidate](qualification/profiles/api-credit-application-source-v95.json).
The selected runtime versions are Node 24.19.0, SDK 1.0.5 and x402 core 2.23.0.
The manifest records `supportedProfileEstablished: false`,
`acceptedEntryCommand: null` and native qualification `NOT_EXECUTED`.

| Lane | Published scope and acceptance boundary |
| --- | --- |
| Source-bound local DATA | The [V95 result](qualification/funding-inspection-guard.actual-local-result.json) covers 2,702 controls: 2,521 application controls and 181 separate Linux-harness DATA controls. One fresh broad command ran 1,054 controls in 24 Node processes; the earlier focused comparison contributed 50 candidate passes. Another 1,598 controls retain exact unchanged graphs and actual command origins. The 43 supervisor memory controls remain separate. |
| Required hosted CI | [Current capacity profile V3](docs/CURRENT_CAPACITY_QUALIFICATION_PROFILE_V3.md) selects 108 controls over 22 inputs. Its workflow does not install dependencies or execute SDK/x402 packages, SQL, sockets, signing, nonce search or the native application. Each hosted result requires its own exact-head check. |
| Native Linux product | The [acceptance harness](docs/API_CREDIT_LINUX_ACCEPTANCE_HARNESS.md) and [operator command contract](docs/API_CREDIT_OPERATOR_CLI.md) describe the candidate flow. Current native execution, installed-namespace qualification and Linux product acceptance remain unestablished. |
| Retained qualification | Historical clean, bounded-pending, response-loss and recovery records keep their original source/runtime scopes. Reuse requires unchanged inputs and valid provenance; failures and UNKNOWN outcomes stay recorded. |

The latest source change requires synchronous void opening permission throughout
funding inspection. Unknown guard receipts retain the original profile/store and
stop advancement; late settlement grants no retry or result authority. The
[opening-guard contract](docs/FUNDING_INSPECTION_OPENING_GUARD.md) and
[V95 proof manifest](qualification/funding-inspection-guard.proof-manifest.json)
separate current execution from retained command scopes. The earlier
[V94 result](qualification/recovery-completion-close.actual-local-result.json)
and all historical failures retain their original source/runtime bindings.

## Required product acceptance

| Gate | Remaining acceptance |
| --- | --- |
| G0 | Establish the complete supported graph, runtime and entry/data profile; verify uncovered changes and classify relevant failures. Required PR checks remain enabled. |
| G1 | Run the documented product flow with one funding, one grant and 100 distinct metered requests. Verify exact replay, reopen counts and concurrency/restart-safe spending limits on Linux. |
| G2 | Verify funding ACK loss, service commit loss, fresh-process reopen, signer response loss, stale-owner and late-close cutpoints, with observed physical release or controlled HELD. |
| G3a / G3b | Accept the pinned binary/genesis/active-rule trust profile before network use. Qualify Dynamic Plasma separately for the DP profile; it does not block the first non-DP slice. |
| G4 / G5 | Complete the prerequisite gates, bounded testnet operations and independent review before a separate economic/mainnet decision. |

See the [roadmap](docs/ROADMAP.md) for the full criteria and scope boundaries.

## Evidence navigation

- [Qualification history and frozen version record](docs/QUALIFICATION_HISTORY.md).
- [Source-bound acceptance evidence inventory](qualification/acceptance/api-credit-v1.evidence.json).
- [Inventory command and result](qualification/acceptance/api-credit-v1.inventory.actual-local-result.json).

`node scripts/report-acceptance-evidence.mjs` reproduces the retained inventory.
It does not execute the missing native product acceptance flow.
