# Current API-credit application status

Target: one Zenon funding -> one grant -> many metered API requests, with exact
replay and recovery using the original payment and request.
**All G0-G5 product acceptance gates remain OPEN.**

## Current source and evidence

The [current source manifest](qualification/acceptance/api-credit-current.source-profile.json)
selects the [V97 application source candidate](qualification/profiles/api-credit-application-source-v97.json).
The selected runtime versions are Node 24.19.0, SDK 1.0.5 and x402 core 2.23.0.
The manifest records `supportedProfileEstablished: false`,
`acceptedEntryCommand: null` and native qualification `NOT_EXECUTED`.

| Lane | Published scope and acceptance boundary |
| --- | --- |
| Source-bound local DATA | The [V97 result](qualification/recorded-http-close.actual-local-result.json) records 251 fresh application controls and 2,292 unchanged V96 application controls. The 181 Linux memory-harness controls retain their V96 source graphs. The 43 supervisor memory controls remain separate. |
| Recorded API delivery DATA | The [local result](qualification/recorded-order-delivery.actual-local-result.json) covers 163 memory controls, including 100 distinct deliveries, exact repeat, delivery acknowledgement loss, and preserved 64-entry policies. The [owned application result](qualification/recorded-order-application-owner.actual-local-result.json) adds 15 passing memory controls for receipt reuse, recovery and close. The funding-to-grant fixture uses a preloaded grant. These results are outside the V96 count. |
| Required hosted CI | [Current capacity profile V3](docs/CURRENT_CAPACITY_QUALIFICATION_PROFILE_V3.md) selects 108 controls over 22 inputs. Its workflow does not install dependencies or execute SDK/x402 packages, SQL, sockets, signing, nonce search or the native application. Each hosted result requires its own exact-head check. |
| Native Linux product | The [acceptance harness](docs/API_CREDIT_LINUX_ACCEPTANCE_HARNESS.md) and [operator command contract](docs/API_CREDIT_OPERATOR_CLI.md) describe the candidate flow. Current native execution, installed-namespace qualification and Linux product acceptance remain unestablished. |
| Retained qualification | Historical clean, bounded-pending, response-loss and recovery records keep their original source/runtime scopes. Reuse requires unchanged inputs and valid provenance; failures and UNKNOWN outcomes stay recorded. |

The recorded HTTP session revokes read admission as soon as close is requested.
Its reader close waits for the active read and response callbacks to return,
including the writer for a refused request. A close requested during a
callback settles with HELD. The [V97 proof manifest](qualification/recorded-http-close.proof-manifest.json)
binds the passing DATA, reused V96 graphs and provider source pins.
Native close and physical release acceptance remain open.

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
