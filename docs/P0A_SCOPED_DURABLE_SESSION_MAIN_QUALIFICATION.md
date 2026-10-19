# P0-A optional scoped durable HTTP session: bounded main-adoption evidence

Status: existing opt-in session wiring adopted after exact source/evidence review. Two retained local synthetic lifecycle cases support only their named scope; no new runtime execution or full P0-A/pilot acceptance is claimed.

## Exact production change

Base main: `c81bd40589ad5699089e8331a700e902da2948d3`.

Only `src/service-credit-durable-http-session.js` changes. The complete delta is three unified hunks, 13 added/two removed lines, net 382 bytes and 11 line feeds. Imports, public return surface, handler, execution-owner wiring, response mapping, close helper and borrowed-store ownership are unchanged.

| Source | Bytes | SHA-256 | Git blob |
| --- | ---: | --- | --- |
| Base session | 13596 | `1108d78981dddd3bfeba79d5fc235ff57f87ad8e72eb73681b3d274c9b36d1de` | `e0d02684cb0939b61e2508d34c381c6c8ea4f380` |
| Adopted session | 13978 | `a0d6d1436cdb697f125fee2f4dc723a5ddcfd2ee7063b55d56fa006bb8ba69bf` | `307b72b8a1d114463ad8e18935312b18ccb23199` |

The constructor retains the exact legacy four-key option object: `store`, `execute`, `deadlineRuntime`, `selectedDurationMs`. It additionally accepts those four keys plus `admittedGrantId`. Both forms use the existing ordinary-object, non-proxy, enumerable own-data-descriptor capture; accessor properties, symbols and extra keys are not added to the accepted shape.

Presence of the captured fifth key controls whether it is forwarded to the already-adopted HTTP admission component. Omission constructs the old exact store-only admission option. A present invalid value is not silently converted into omission: the HTTP component validates the identifier and rejects it through the existing fixed session configuration-error mapping.

Existing durable-cutover snapshot validation still runs before HTTP admission construction. Therefore the HTTP component's direct invalid-scope-before-load property is NOT an invalid-session-scope-before-any-store-read guarantee. No new negative session-configuration runtime cases are claimed.

The session still borrows one already initialized durable store. It does not initialize, recover, reconcile or close that store, mount itself on the resource server, provision a provider, select a signing policy or activate a live pilot.

## Complete dependency alignment

The eight other production/package blobs in the retained graph already match base main exactly. None is republished in this batch.

| Path | Exact main Git blob |
| --- | --- |
| `src/service-credit-durable-session-close.js` | `f744b55595e2238dc088cf71ca8849e480cda1bc` |
| `src/service-credit-durable-execution-owner.js` | `f0fd445a17466dd1ab83c785c44aa5e6fdf1e765` |
| `src/service-credit-http.js` | `040da1547c2fa6cc4a4044c47619b253f16d19a1` |
| `src/service-credit-sqlite-store.js` | `6a7364fbc59c43edffb7a73f550210644e78daff` |
| `src/service-credit-model.js` | `e6ac17254874584d1a01f70e7abc6f771bd35d73` |
| `src/service-credit-execution-contract.js` | `acfbb5c5e943b9e09958a7831b3dbe159463dcf9` |
| `src/service-credit-capability.js` | `2e19d42c1b9311a75897c84669849f56ae40f785` |
| `package.json` | `ec7193f6fd76f34778515079dc777594175c4c34` |

This adopts the exact graph used in the retained outcomes. It is not an entire feature-branch merge or qualification of unrelated parents, UI/history, SDK, Dynamic Plasma or official x402 compatibility work.

## Retained actual lifecycle outcomes

The unchanged [fixture](../qualification/service-credit-durable-http-session-active-close.draft.mjs) is 19286 bytes, SHA-256 `009ea6f43a9abdae89b03f5a7ef5c541ceb79b827f545a72305171cdf7e8ff52`. Its unchanged [execution record](../qualification/service-credit-durable-http-session-active-close.behavior.result.json) is 13287 bytes, SHA-256 `083c7c537c65dbdbe9f70fad53c7d6bf66cfe33918c5a7fda7c92f84aac5414f`.

Both actual cases explicitly constructed the adopted session with `admittedGrantId`, an actual durable execution owner, HTTP admission, genuine in-memory synthetic capability proofs and a fresh private synthetic SQLite store:

1. External close waits for the one active original; new work during closing and after close is refused without another execution.
2. Close called from the original callback after external close rejects with the fixed frozen session close error and does not poison the external close.

Each original command joined exit 0 with one authored pass and no failures/skips/cancellations. Across the two original outcomes there are two distinct cases, not a newly executed two-test run. Each observes one execution, one original result release, one credit consumption transition and one returned fixture store close. The borrowed store remains readable after session close and is closed separately by the fixture.

The runtime was Node v24.19.0, darwin/arm64, binary SHA-256 `852d6074f741d18223b24967d8384e8920856a7fcd4348682a4ec524b5fc2ff4`. This is historical exact-runtime evidence. It is not the different currently retained binary `613be50c90e83aa8da58dd9ed393d0b39914a3b8ef4123fe817b46c2679cebe2`; equal version strings do not equate binaries. No case, signature, SQLite operation, Node invocation or dependency installation is repeated for this adoption.

Both cases use a single synthetic grant and a declared deadline runtime. They are not new foreign-grant exclusion, ordinary open-handle replay, real-clock/deadline or negative session-option coverage. The sampled RESPONSE_BEFORE_CLOSE observation is not a response-delivery/send-order guarantee; the close boundary remains OWNER_COMPLETION_ONLY. Closed handles return 503 while the successful request cache remains retained.

## Preservation and boundaries

Two earlier terminal manager-Busy refusals created no tasks or Node processes and remain in the original record. They are not failed authored tests or passes. The historical source-only stage remains unchanged and is not relabeled as executed. The fixture's authored source-draft header and result's local-at-recording publication/NO_GO descriptions are retained as provenance. This document records the later bounded main adoption, not retrospective production approval.

The original tasks are CLOSED/SUCCESS with separate cleanup HOLD dispositions. Unregistered synthetic files are preserved, not adopted or deleted. A returned store close is not durability or OS-cleanup proof. No historical database is reopened, no old stream is repackaged and no runtime/source binary is copied for this transfer.

The fixture contains no embedded local absolute path, physical owner/device/inode binding or private-key export. Its generated holder keys/proofs remain synthetic in-memory test data. Complete original streams and ownership bindings were independently reviewed for the retained outcomes; this adoption preserves their references and exact report bytes rather than manufacturing new execution receipts.

No hosted CI is dispatched or asserted green. Native loader, runner, crypto, SQLite, streams, OS behavior, pristine intrinsics and source/import race freedom remain premises. The retained cooperative test/manager limits and microtask turns are not hard lifetime, cancellation, native-cleanup or OS/network-sandbox guarantees.

Independent current context, funding, payer/provider/policy authority, provider READY, durability, commit uncertainty and restart/recovery remain separate gates. This is not full durable composition, HTTP/HTTPS socket lifecycle, shipped SDK, live-chain inclusion/receive, service delivery, production or pilot acceptance.

The real payment signer remains disabled. Protected totals remain two consumed chain admissions, one actual chain PREPARE, zero bundles and zero native-chain/provider qualification runs. Original payment/request bytes, hashes, payloads, requirements, context and consumed authority remain unchanged. PR193's possible VALIDATED exact-same-signed-block resend remains distinct from UNKNOWN versus ACKNOWLEDGED; no real resend occurs.
