# P0-A same-open-session exact signed-request replay qualification

## Outcome

One new local synthetic integration case passed: the same original signed capability envelope was sent twice through the same actual open durable session. Both responses were exact `200` successes; the application executed once and credit was consumed once. The joined command exited 0: **1 test, 1 pass, 0 fail, 0 skipped, 0 cancelled**.

The immutable production base is `b3ac86119b5a5b6d9fc5b751f88dfe3dcf500cfe` (tree `4bfa749435e72570bec1ab2c28ee5d7998154208`). This batch adds only the recipe, result and this document. No production module, package script, active route or default wiring is changed.

- [Exact replay recipe](../qualification/service-credit-scoped-session-exact-request-replay.draft.mjs), SHA-256 `17b0ef4160b4b94da9fa8e89491065b5163002790adae49e52be6239dbd995a9`.
- [Result and complete content pins](../qualification/service-credit-scoped-session-exact-request-replay.behavior.result.json).

## Actual integration and observed invariants

The fixture uses the actual session, HTTP admission, execution owner, capability verifier and SQLite store. It creates one new private mock database, one offer, one seven-unit grant and one session with `admittedGrantId=A`. Journal capacity is two, so this is not a full-capacity test.

| Stage | Required observed result |
| --- | --- |
| Capability positive control | One in-memory keypair and one signature; the actual verifier accepts the exact stored grant/request/proof and returns its exact frozen five-field success. |
| First call through the actual session | Exact successful bytes, private headers and stored cache; one immediate original native execute Promise, one request/execution, two-unit debit and revision +3; SUCCEEDED / MAY_HAVE_STARTED. |
| Second call through that same open session | The identical captured frozen envelope, request, proof and headers are reused. Original signing-message Buffer and authorization bytes are checked before and after. Exact same response/cache; no extra execute, debit, request, execution, schedule or cancellation; the entire first-success ledger/durable/metadata/checksum/revision/balance/terminal snapshot is unchanged. |
| Known-owner close | Original work settles; one original session-close Promise fulfills; zero declared handles and balanced schedule/cancel counts are required before borrowed-store reads or fixture-store close. The borrowed store is readable and unchanged; one fixture-store close returns. |

The source path is anchored to the existing `prepareDurableExecution` UNCHANGED branch, the owner's CACHED_SUCCESS classification and the session's successful-response mapping. The runtime oracle is the returned session's `handle`, not a direct admission/owner call or a patched implementation.

There is no second keypair, signature, request or dispatch envelope. Comparison-only encodings do not replace the original dispatch object. A wrong implementation executing twice would also settle immediately and fail the counters/state assertions; an artificial pending callback cannot make the test pass. An earlier failure blocks the later dispatch.

The complete diagnostic reports two handle calls, one execute call, one signed envelope, four settled original Promises, one declared schedule/cancel pair and zero remaining declared handles. These are fixture control observations, not independent native instrumentation. Private keys are neither exported nor logged; reference release is not key-erasure proof.

## Source review and bounded launch

The complete Source, first original handoff, original accounting records and final public accounting call were independently reviewed. Two oversized RAM drafts (33,133 and 32,817 bytes) and the rejected 400,251-byte package projection are retained as source-only refusals, not Node/test failures.

The hard Source-byte bound remained 400,000. An unconsumed generic hash-return reserve was replaced by the fixed successful response size plus margin; the handoff text delta was charged. The reviewed worker byte account is 399,651, with prior cumulative 4,596,337 preserved and cumulative 4,995,988. This is not an OS memory, token or financial measurement. The source-only soft target of 250,000 was exceeded; no consumed charge or failure was discarded.

The setup baseline was reproduced exactly in RAM with the parent's timer-cleanup HOLD amendment, avoiding a baseline disk read. Previously charged unchanged graph material was reused; only the newly inspected cache windows and metadata were new intake. The recipe is 32,738 bytes, below the 32,768-byte hard cap and above the 24,576-byte soft target. The complete Source frame is 39,895 bytes, below 40,000. Its `NOT_RUN` comment remains source-stage provenance; the separate actual result binds the exact later executed digest.

Nine source/package files plus the recipe were guarded; all identities/content pins matched before and after execution. The fixed unsaved positional CommonJS run API selected only this one file, with isolation none, concurrency one, no forced exit, no `--input-type`, addons disabled and string code generation disabled. The environment was cleared to nine reviewed keys. No saved operational helper, framework, launcher file or host was added.

Node was 24.19.0 on darwin/arm64, bound to retained binary SHA-256 `613be50c90e83aa8da58dd9ed393d0b39914a3b8ef4123fe817b46c2679cebe2` with full identity matched before launch. The large binary was not copied or rehashed. Complete stdout was 2,187 bytes, SHA-256 `0ddb60950000c81d5a728975568b9016de8fc4c8d7a9793d1357230b6922091e`; stderr was empty. The original command, source selection, callsite, task, outcome, cleanup, streams and CAS ownership/creator records were independently checked.

The test timeout was 12 seconds and foreground timeout 20 seconds. TAP/stdout/stderr limits were 65,536 / 131,072 / 1,048,576 bytes, with a 60-second metadata-lock observation. These do not guarantee hard lifetime, cancellation, OS/network isolation or native cleanup.

## Retention and remaining gates

The approved task-storage manager used one fresh private task, 32 MiB expected allocation and a 64 MiB task quota. The production 10 GiB free-space floor plus 1 GiB safety margin and other reservations was unchanged. No download, installation, build, archive or duplicate binary/output copy occurred.

The task is CLOSED/SUCCESS; cleanup is separately HOLD for an unregistered synthetic child. The database is preserved, not adopted, repaired or deleted. A post-join point observation found the process and group absent. Only a stable raw-file read followed: 16,384 bytes, SHA-256 `0f6f144d83621208d9c066624667512bc5ed44df9210f9bd77a7123a06b9fe49`. There was no SQL decoding or reopen. This is not restart, durability, native-close or cleanup proof.

Prior foreign-grant, close-helper and direct-HTTP outcomes remain separate and were not rerun. This is not one combined multi-case run, a novelty claim or a project-wide acceptance claim.

The case does not establish conflicting-request handling, in-flight coalescing, exhausted-balance/full-capacity behavior, closed/replacement-session replay, process restart/recovery, every adverse HOLD branch, real deadlines, delivery or broad SDK/app/controller behavior. Independent current context, funding, payer/provider/policy authority and real provider READY remain separate acceptance gates. Dynamic Plasma preparation and official x402 compatibility remain separate lanes.

This is synthetic capability-envelope replay, not real payment or signed-block resend and not PR193 live recovery. The real signer stays DISABLED. Protected real totals remain two consumed admissions, one actual chain PREPARE, zero bundles and zero native-chain/provider qualification runs. Original real payment/request bytes, hash, payload, requirements, context and consumed authority are preserved; no ownership-metadata retry, replacement or re-signing occurred. VALIDATED exact-same-signed-block versus UNKNOWN/ACKNOWLEDGED boundaries are unchanged.

No hosted CI was dispatched or executed by this qualification. The local result is not CI, production-readiness or live-pilot assurance.
