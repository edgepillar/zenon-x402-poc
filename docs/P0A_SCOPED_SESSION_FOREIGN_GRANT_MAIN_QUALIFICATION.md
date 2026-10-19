# P0-A actual scoped-session stored-foreign-grant qualification

## Outcome

One new local synthetic integration case passed through the actual returned durable session, HTTP component, execution owner, capability verifier and SQLite store. The joined Node command exited 0: **1 test, 1 pass, 0 fail, 0 skipped, 0 cancelled**. This is a bounded local result, not live pilot acceptance.

The immutable production base is `2a6dd2cd2c00942d8904d0e3bf3704e9e9668bc9` (tree `cb04200d608bd20eaeb7b6dd257678e224f5ad4b`). This adoption adds only the recipe, its result record and this document; it changes no production module, package script or default wiring.

- Recipe: [service-credit-scoped-session-stored-foreign-grant.draft.mjs](../qualification/service-credit-scoped-session-stored-foreign-grant.draft.mjs).
- Result and complete content pins: [service-credit-scoped-session-stored-foreign-grant.behavior.result.json](../qualification/service-credit-scoped-session-stored-foreign-grant.behavior.result.json).
- Exact recipe SHA-256: `cd1a5c0499ededb39d7223f1f059a538609a4579780181690df595bc505f67f1`.

## What the one case establishes

The fixture creates one new private synthetic SQLite database, one offer, two distinct mocked grants and two in-memory capability keypairs. It constructs one actual durable session with `admittedGrantId=A`.

| Step | Required observed result |
| --- | --- |
| Positive proof-validity control for stored grant B | The actual capability verifier accepts the exact B request/proof and returns the exact frozen five-field success value. |
| The same B proof through the actual session | Exact `401` unauthorized response and authentication/private-cache headers; zero execute calls; no requests or executions; complete ledger, durable state, metadata, revision and balances unchanged. |
| A through that same session | Exact `200` result and stored cached result; one immediate original native execute Promise, one request/execution and a two-unit debit in A only. B's complete grant remains unchanged and revision advances by three. |
| Known-owner close | Original work settles; the original session-close Promise fulfills; declared timer counts balance; the borrowed store remains readable and unchanged; one fixture-store close returns. |

A is not signed or dispatched if any preceding B assertion fails. A wrong unscoped implementation that executes B would settle immediately and fail the refusal/no-effect controls; an artificial pending callback cannot make it pass. No direct HTTP admission function is used as the refusal oracle.

The observed diagnostic reports two capability pairs, two capability signatures, two session dispatches, one execute call, four settled original Promises, one declared schedule/cancel pair and zero remaining declared handles. These are fixture control observations, not independent native instrumentation. No private key is exported or logged, and no wallet, provider or payment is signed.

The response is a bounded declared object, not a network socket. The declared monotonic clock returns zero. Neither control establishes delivery or real deadline behavior.

## Review and launch boundaries

The complete worker Source and first original handoff were independently read before application. The original recipe was 30,885 bytes with SHA-256 `c829afd9ba623f896f9630e4a68296634574fa211004b7be9af8213be5910f27`. Parent review added four lines: after the known session-close Promise fulfills, nonzero declared timer handles or unequal schedule/cancel counts cause HOLD before borrowed-store reads or fixture-store close. That adverse branch was not separately fault-injected.

The applied recipe is 31,057 bytes, above the 24,576-byte soft target and below the 32,768-byte hard cap. Readability was retained. Its source-stage `NOT_RUN` comment is preserved provenance; the separate result record binds the actual later outcome to the applied digest.

The closed repository graph contains eight production modules plus the root package; the recipe is the tenth guarded file. All exact content/identity pins matched before and after execution. The fixed unsaved CommonJS run-API callsite selected only this positional file, with isolation none, concurrency one, no forced exit, no `--input-type`, addons disabled and string code generation disabled. The environment was cleared to nine reviewed keys. No operational helper, framework, launcher file or host was added.

Limits were a 12-second test timeout, 20-second foreground timeout, 65,536-byte TAP cap, 131,072-byte stdout cap, 1,048,576-byte stderr cap and 60-second metadata-lock observation. These are not hard lifetime, cancellation, native cleanup or OS/network-sandbox guarantees.

Node was 24.19.0 on darwin/arm64, bound to retained binary SHA-256 `613be50c90e83aa8da58dd9ed393d0b39914a3b8ef4123fe817b46c2679cebe2` with matching full identity before launch. The large binary was not copied or rehashed. The original complete stdout was 2,094 bytes (SHA-256 `ff2f244475198e645116286dcdb2b457920145f37a82596d78a09cba0c4d525a`); stderr was empty. Source selection, callsite, command, task, outcome, cleanup, original streams and CAS ownership/provenance were independently reviewed.

## Retention and resource accounting

The approved task-storage manager used one fresh private task with 32 MiB expected allocation and a 64 MiB task quota. The production 10 GiB free-space floor plus 1 GiB safety margin and other reservations was unchanged. There was no download, installation, build, archive or duplicate binary/output copy.

The task is CLOSED/SUCCESS, but cleanup is separately HOLD because the synthetic database is an unregistered child. It was preserved, not adopted, repaired or deleted. The process and group were absent at one post-join observation; only a stable raw-file read followed, not SQL decoding or reopen. The retained database was 16,384 bytes with SHA-256 `a214e7faabd6898558110de6bd0fae1d7ed1e2c5c07b60d0f9823e517835f371`. This is not a durability, restart, native-close or cleanup proof.

## Retained coverage and remaining gates

The two earlier actual-session close cases used one grant. The four earlier direct HTTP admission cases did not establish this session integration; the composed close cases exercised close helpers while parent modules were data only. Their exact retained coverage informed this finite selection, and none was rerun. Missing coverage is not a novelty claim.

Earlier session-close outcomes used a different Node binary (`852d6074f741d18223b24967d8384e8920856a7fcd4348682a4ec524b5fc2ff4`). Equal version strings do not equate binaries, and this is not one combined multi-case run.

This case does not qualify the legacy unscoped path, invalid configuration before any store read, all adverse HOLD paths, same-request HTTP replay, process restart/crash recovery, native durability/cleanup, broad SDK/app/controller behavior or real delivery. Independent current context, funding, payer/provider/policy authority and real provider READY remain separate acceptance gates. Dynamic Plasma preparation and official x402 compatibility remain separate lanes.

The real signer remains DISABLED. Protected real totals remain two consumed admissions, one actual chain PREPARE, zero bundles and zero native-chain/provider qualification runs. The original payment/request bytes, hash, payload, requirements, context and consumed authority are unchanged. No ownership-metadata retry, replacement or re-signing occurred; the VALIDATED exact-same-signed-block versus UNKNOWN/ACKNOWLEDGED boundary remains unchanged.

No hosted CI was dispatched or executed by this qualification. This local result is not a CI, production-readiness or live-pilot claim.
