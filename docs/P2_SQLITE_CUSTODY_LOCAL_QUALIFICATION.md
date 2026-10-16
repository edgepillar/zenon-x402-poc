# P2 SQLite custody: local component qualification

Status: source and local-execution evidence for a non-main review branch. This is not main merge eligibility, CI qualification, or operational activation.

## Scope and architecture

The opt-in client owns an existing V2 custody store and captured transport lifecycle. The runner consumes durable original references in order with explicit drain/close outcomes. The backend adds V2 custody/schema handling and an own nonenumerable stack data property, retaining sanitized error values and writable/configurable compatibility. Refusal whitelisting and fail-closed UNKNOWN handling are unchanged.

Shared V1 paths also change; these runs are not a complete V1 regression result.

## Exact source graph

SHA-256 identifies the qualified bytes. The first four files form the source portion of this five-file publication packet; this report is the fifth file.

| Packet source | Bytes | SHA-256 |
| --- | ---: | --- |
| `src/service-credit-custodied-sqlite-http-client.js` | 17045 | `1bf7e3d738b4f3f9e880e1ff5f99ee7eaf3df02c2e98f5993dd075eb0bbf4c7b` |
| `src/service-credit-custodied-sqlite-sequential-runner.js` | 8354 | `efe0ec55dc506159d416e8d8b94659a9dda060e2cc3c7eacfe533b0cea42ed8a` |
| `src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js` | 48099 | `ce94e19e5ec24ea88f126e40dac26d88e2cf5fd87f94e449a6b75ce4e0495f73` |
| `qualification/service-credit-custodied-sqlite-sequential-runner.draft.mjs` | 60410 | `ff37c21138d2dfca945076409a179b5a61ecd0bcc1086709689cef42578a22c1` |

The seven unchanged dependencies were part of the same guarded graph:

| Dependency | Bytes | SHA-256 |
| --- | ---: | --- |
| `src/service-credit-http-execute-dispatch.js` | 27034 | `254ba8eef5ea5efb3a1b901be09e9cb33afbc3cfcf63789ca4a23316b6180d1b` |
| `src/service-credit-original-request-custody-contract.js` | 9810 | `8f4d40d017a89e9a064c411c8e076cb21a45b9fb787fda7a664246b7bd744083` |
| `src/service-credit-custodied-request-owner.js` | 22965 | `4dabb9c49179e9d6533f5c3066faf730fa6d7deb3c4407d132841c1de4183f85` |
| `src/service-credit-custodied-http-client.js` | 9815 | `757c7d472410676b61baf2a3cda73e493a26ca6343d4e4c0a2c3af1a9e6abb9c` |
| `src/service-credit-custodied-sequential-runner-core.js` | 15208 | `07b73745c1a85e049ea374f1fd054b75dba9c0cd46d64adf4cfe4d266c4bc5f1` |
| `src/x402-wire.js` | 39886 | `5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56` |
| `package.json` | 1413 | `8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5` |

## Actual local execution

Run date: 2026-10-15 UTC. Node v24.19.0; configured binary SHA-256: `3c9448363b9976bf3d9e8f4d320397975800131b42c7b1be342dadc05871dd25`.

Order: 2, 3, 4, 5, 6, 7, 8, 1, once each in separate new private tasks. Each had one authored pass and zero failures/skips/todos/cancellations. All eight child/parent exits were 0 with complete bounded captures. Stderr was empty in every case (SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).

| Case | Authored test (PASS) | Stdout bytes | Stdout SHA-256 |
| --- | --- | ---: | --- |
| 2 | async configuration existing-only and resource busy refusals | 312 | `c0e0eb229dd3a0a05a7e18780f66605c01371da809889f9a6fa8fa5a6fad71a6` |
| 3 | manual close fences queued work until captured dispatch drains | 316 | `115ac56cf9d41f85b4d7309549d0aea73e8bccb8214c90c52b09c1e124072545` |
| 4 | first transport uncertainty survives positive owned db release | 316 | `4d9e4a9b0d8b3a50468c8d197d2a6f7dffa540797bce580609e50de2ebbeed21` |
| 5 | later semantic rejection preserves the first known original | 307 | `6add5f472ea4ae450435ae688d005615127c4091aee0e1e6073874abd82924ef` |
| 6 | same-process reopen recovers without replay or conflict replacement | 325 | `6db362074fadcdbd60ee2c5f5dae50ad991d9a19c1a922b9345294ab54ed3764` |
| 7 | prepared funding blocks submission and preserves declared originals | 326 | `cdee2d1f61dd5a9d8c58598a0ea7040f0ac2465b9b80b606aab5f1de50009d99` |
| 8 | new synthetic schema and custody corruption refuse without repair | 321 | `c340d54bea560970dbce94a1e9ca74e261e30daff8641ad166fba1822cea98ad` |
| 1 | actual V2 ordered completion for two and eight originals | 304 | `3c1f9ce86c7ae27297212a6400ec085ca7d0bf676ac5ef5615f30292602e3b38` |

The runs used fake captured transport and new synthetic SQLite files for the behaviors named above. CASE2 also checked genuine error descriptors without invoking accessors. Same-process reopen is not process restart.

Source/alias/runtime/manager/root pins and bounded non-SQL manifests passed. All eight manager tasks closed SUCCESS. Generated files and reservations remain retained under HOLD, without ledger adoption. HOLD proves neither deletion/cleanup completion nor durability.

## Execution premises and retained history

File chmod/fsync stayed unchanged. Node Permission Model was OFF because it disables required fchmod/fsync APIs. The cleared Node environment retained `--no-addons` and `--disallow-code-generation-from-strings`. Flags, path guards and temp-file direction are not an OS filesystem/process/worker/network/native-lifetime sandbox. Host, native engine and runner remain premises. The launcher was unsaved; no operational helper was installed.

Earlier outcomes remain separate: Permission Model store-creation failure; old-graph CASE1 child pass with parent zero-todo TAP false-red; old-graph CASE2 REFUSED/UNKNOWN assertion failure before the stack data-property fix. None was rewritten or counted here. Metadata/AST/hash controls are not SQL passes.

Historical SOURCE DRAFT / NOT_RUN headers remain authoring labels. They are not fresh runtime assurance; only the eight selected executions above are established.

## Publication and assurance boundary

Read-only main snapshot: `157ef8d6a5b3b521731d5ca8e85513fba3cbafdd`. Its seven dependency blobs match this graph, but its backend differs: 34,722 bytes, Git blob `8a9094bcb76a98c9a603dd7df8aa015e19added3`. Main and CI are not qualified by this report. The snapshot had no check runs or statuses establishing green CI.

Intended delivery is a new non-main review branch, `x402/p2-sqlite-local-qualification-20261016`, without a PR or CI dispatch. This draft does not establish that the branch exists or has been published. No workflow or protection changes are included.

This narrow component result provides no all-P2, official x402, SDK, Dynamic Plasma quote-to-inclusion, current-authority, real provider/READY/delivery, process-restart, native-fault/crash/durability, pilot or production assurance. No preparation/signing/payment activation or consumed-authority reset is included.

## 2026-10-16 addendum: owned recovery-state plan

Status: independently reviewed local component evidence, not publication or main/CI eligibility. The preceding sections remain the historical eight-case packet; their passing results are not transferred to this changed graph.

The additive `createOriginalRecoveryStatePlan` API connects the existing declared planner to the captured owned `readOriginalRecoveryState` operation. It binds the complete canonical original-request envelope and rejects a regressing funding revision. Current raw `OUTCOME_UNKNOWN`, uncertainty observed by this plan, and persisted historical ambiguity remain separate. Local plan close detaches a cached historical view without taking over the runner's native close ownership. Every returned plan remains `UNQUALIFIED`, with authority `NONE` and all payment, signing, dispatch and delivery flags false.

The exact selected graph has 13 files / 260,186 bytes. These eight entries differ from, or are additional to, the historical graph above:

| Selected source | Bytes | SHA-256 |
| --- | ---: | --- |
| `src/service-credit-custodied-request-owner.js` | 25108 | `f8bfabdf80531b42e424e331de37e0364294902933acbf10603275981fe1542f` |
| `src/service-credit-custodied-http-client.js` | 10106 | `442d4bf2587e099b1cd7883b50df615f94732c1a58d1432b09e05e8fcb3ff2bf` |
| `src/service-credit-custodied-sqlite-http-client.js` | 17391 | `0c76e10aebc1d88c1ff1e62ed67b553415f1c6e35a364d2efee91c61ebb91097` |
| `src/service-credit-custodied-sqlite-sequential-runner.js` | 17844 | `b862dfb99b84ec5303f297df411ff1a5d3a8804a981c9a1dea1b03479f8e3deb` |
| `src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js` | 48095 | `bd55ed39fb465eab75b71819b30693290b6e12aded503d57fe206cab1fe506b6` |
| `src/service-credit-pilot-client-plan.js` | 7483 | `73ee3d739de85150039e733234cd0761c228d68de040d1e126902e808a259ac6` |
| `src/service-credit-pilot-status-view.js` | 3202 | `cf3822d8b9ec4eb4772452ed1888b96d398fd87c1ead44cd155a5acc1a6b66ed` |
| `qualification/service-credit-custodied-sqlite-owned-recovery-plan.draft.mjs` | 37606 | `78a60bf1be9915252bcef6c1d1ebf38355779b8cbedf8ed3278691612bd31b10` |

The other five selected entries retain the exact bytes and hashes already listed above: dispatch, custody contract, sequential-runner core, wire module and root package metadata. The earlier sequential-runner fixture is not selected by this addendum.

One reviewed inline parent invocation used the existing Node v24.19.0 binary identified above. It completed with exit 0 after exactly three separate fresh Node processes, one new private task per selected scenario. Each process registered one authored test; all three passed, with zero failures, skips, cancellations or todos and empty stderr:

| Authored test (PASS) | Stdout bytes | Stdout SHA-256 |
| --- | ---: | --- |
| owned recovery plan preserves actual UNKNOWN against declared success and detaches local close | 1282 | `268b51ad75d9210146ccdf8f0ff73020530dc1fbe4d82738ab31d600c1993e1b` |
| owned recovery plan distinguishes acknowledged BOUND historical ambiguity from current UNKNOWN | 1279 | `d236548b34ca40d25ab11c85bd27b0fab915003b48bcd4fbb00fc1eafcd226bf` |
| owned recovery plan fences hostile reads and full-envelope changes with distinct native close outcomes | 1868 | `146488cd9e8cfb8b317a7511dc85a0f80c354986e047f54442d2c447c7677543` |

The tests created four new synthetic SQLite files, each 24,576 bytes. All four independently predicted funding/original row-hash pairs matched. There were zero request calls, two controlled original-envelope updates and no raw funding-row updates. All four owned native database closes returned once. The expected `CHILD_UNKNOWN` belongs only to the second client in the third scenario; it is not an unknown native close or an unobserved OS process. All three managed tasks closed SUCCESS, while the four unregistered database files remain retained under HOLD, outside CAS and without export or deletion.

The primary reviewer read the complete execution handoff and independently checked 133 unique files / 141,179,081 bytes: all 23 source/runtime/manager/storage pins, 39 independent source clones, the four final databases, selected CAS objects and ownership records. A separate read-only semantic check bound the 24 selected receipts, nine referenced creator task records and 17 object ledgers to the actual TAP captures and primary source pins. Neither primary check opened SQLite, imported repository code or the storage manager, launched Node, changed files or repeated the tests.

The complete parent capture is 33,927 bytes, SHA-256 `30f22a419de609f7f9febc68917e402dcf4c0999abef563ff74f821939a1471d`. Earlier failures and superseded handoff metadata remain retained separately; no failed loader, observer or historical draft label was silently converted into a passing test.

Funding-revision rollback and within-plan funding transitions remain `NOT_EXERCISED`. Owner-epoch and last-good-view evidence is source-bound assertion evidence; seed database hashes are historical in-process observations, not retained baseline binaries. These three separate scenario processes do not establish a writer/reader process-restart test of this API. Native fault handling, abrupt crash, host restart, power loss and durability remain unqualified. The execution premises stated above still apply, including the disabled Node Permission Model and the absence of an OS/network sandbox guarantee.

This addendum records local evidence only. It does not assert a GitHub upload, a PR, a main merge or current hosted CI. Independent current context, funding, payer/provider/policy authority, real provider READY, actual delivery and live pilot acceptance remain separate gates. Original payment/request bytes and consumed authority are not reset; no signing, replacement payment or operational resend is authorized here.

### 2026-10-16: owned recovery-state plan across two fresh processes

This is a narrow local synthetic SQLite component result, not full P2 or pilot acceptance. The existing `createOriginalRecoveryStatePlan` implementation was reused without production changes in this slice. A new qualification fixture was added at `qualification/service-credit-custodied-sqlite-owned-recovery-plan-reopen.draft.mjs`: 37,909 ASCII bytes, 650 LF, SHA-256 `8d5c5003f65e673c4dd0ddfdad8f52457945c14936604e65ac1cd8771113773b`. Its executed dependency graph contains the current 12 production/package files plus that fixture, totaling 260,489 bytes. The current sequential-runner SHA-256 remains `b862dfb99b84ec5303f297df411ff1a5d3a8804a981c9a1dea1b03479f8e3deb`.

One guarded inline parent invocation ran two sequential fresh Node 24.19.0 processes against one newly created private synthetic database. Both exact authored tests passed, each with one test, zero failures, skips, cancellations or TODOs, and empty stderr:

- `owned recovery state plan writer retains exact unknown custody and closes its actual owner`
- `owned recovery state plan reader reconstructs conservative state from the exact writer database`

The reader was admitted only after the writer's complete passing result, known close observations, process-group absence and an unchanged whole-file identity/hash/timestamp stamp. It accepted no writer recovery-plan DTO. Its own source guards checked the same database before application/SQLite imports and again before opening it. The writer observed owner epoch 2; the newly opened reader observed epoch 3. The committed epoch change legitimately changed the final database hash; retained funding, original-request, policy/schema and stable-row digests stayed equal.

Both phases retained funding revision 3, `OUTCOME_UNKNOWN` and the ambiguity latch despite declared success observations. The original-request rows and canonical envelope matched the fixed synthetic predictions. Each live factory/read/observe operation produced the expected public owner-counter deltas: two load reads and one original-record read. Detached local-plan views caused no additional public store calls. These are source-bound application store-call observations, not independently measured native SQL query counts.

Both actual owned roots reported one native-close attempt with outcome `RETURNED` and logical child `DRAINED`; seed/read-only auxiliary handles reported closed. Request implementation calls, raw table mutations, descriptor changes and real payment/signing operations were zero. The single managed task closed `SUCCESS`; the unregistered database remains private `HOLD`, not CAS-adopted, exported, packaged or deleted. Source/capture manifests contain explicit references only.

The accepted unsaved parent was 70,948 bytes / 909 LF, SHA-256 `ac608dbc6fbffdaaf9a499bf946f0ca59be59b5d20e68574d0bd8657437f1af8`; the inline Node driver was 1,039 bytes / 12 LF, SHA-256 `6bcae7a90f347213f7917825df30b37a49d59af2bdd20ed42f30d5afbb87d797`. The complete joined parent output was 48,816 bytes, SHA-256 `f718bd5a1e2ee73002ccb9b3b24042539e4e7359292d8d35637af2901136fa40`. An earlier unsaved caller candidate had a TAP string-substitution defect and was rejected and corrected before execution; it is not a failed or passing runtime assertion.

Primary independently read the complete accepted source/caller and actual test captures, checked all 25 protected file identities/hashes, and verified 82 distinct physical files totaling 140,526,745 bytes. These include the retained source clones, referenced CAS objects, ownership ledgers, closed task/evidence metadata and the final database. The exact fixed namespace contained nine registered directories and eleven directories including its scratch root and unregistered database leaf; both known child process groups were absent at the independent read-only observation.

A worker read-only postcheck exited 1 with `EXACT_FIXED_REGISTERED_DIRECTORY_SET`: its expected set omitted the two registered command directories created by the two process launches. That failed check and its partial inventory remain retained and were not rerun or relabeled as passing. Primary's separate physical/namespace verification resolved this observation without re-running the parent, Node or SQLite. A primary read-only observer's relative-path composition error was also retained and corrected for the same exact clone paths without changing application code or repeating tests. Neither metadata-control failure is counted as a failed or passed authored SQLite assertion.

This qualifies graceful new-process reconstruction only. It does not establish abrupt-crash/cold-host-restart or power-loss recovery, durability, independent native finalization/OS cleanup, current payer/provider/policy authority, real provider READY, service delivery, shipped SDK behavior, main/CI, native-chain qualification or production/pilot readiness. The 12/15/20-second observation/monitor limits are not hard lifetime or cleanup guarantees; Node permissions were OFF and exact source/environment guards were not an OS/network sandbox. Funding revision transitions and rollback were not exercised. Earlier passing, failed and stopped scopes remain separately retained. Real authority totals remain two consumed admissions, one actual chain PREPARE, zero bundles and zero native-chain/provider qualification runs.

## First INERT submission and fresh-reader guard (2026-10-16)

The finite `OCT16_P2_FIRST_INERT_SUBMIT_FRESH_READER_GUARD_PRIVATE_SQLITE_QUALIFICATION_V1` scope passed two new authored tests in two fresh sequential Node 24.19.0 Darwin processes. Existing production APIs were reused; no production defect was established or production file changed. This closes only the named current-graph execution/reopen guard seam, not P2 or the roadmap as a whole.

The new fixture is `qualification/service-credit-custodied-sqlite-first-inert-submit-reopen.draft.mjs`: 50,763 ASCII bytes, 785 LF, final LF, SHA-256 `14dde4bd2f846767d27282209eedbb15ba1b8322091ffb9048fcca5a38edd0ee`. Its executable graph is the unchanged 12-file production/package set (222,580 bytes; ordered table SHA-256 `2b7d4c6e9ed0e42fc6a0a464cd2f56658fb6cecc27f9b76248e9f191aa614f05`) plus this fixture: 13 files / 273,343 bytes. The retained draft/NOT_RUN source header describes authoring status; the actual selected executions below are separately evidenced.

| Authored test | Result | stdout bytes | stdout SHA-256 |
| --- | --- | ---: | --- |
| owned runner first INERT submission retains original through drained transport uncertainty | PASS | 3,536 | `c475f79a56d55bb9eecd2136b67a39e741663f81f6925d5dc4955d66fcebae42` |
| fresh owned runner recovers the exact original and denies same-input replay without dispatch | PASS | 4,169 | `047b27b724f205b5ae4577693985783d09f136d6de2ac9c5ca29ea2eddb49064` |

Each process reported exactly one test/pass, zero failure, cancellation, skip or todo, and empty stderr. The reviewed unsaved parent was 79,794 bytes / 921 LF, SHA-256 `d77761769bc3c8ba4d1b1ce8dc54a261bb1c82fb0366601c484f7872970deb65`; its explicit CommonJS run-API driver was 1,038 bytes / 12 LF, SHA-256 `beffc39e10fe353f1d367db9320d24956407e11eebe162378e5ff856984b04f4`. One parent invocation and one empty session join completed with exit 0. Complete parent output: 53,131 bytes, SHA-256 `c2d315a92259c43ffa6b093fbb8d7a4e264651bed788e7c876a3f20a180028b6`. No test was retried.

The writer seeded only declared local BOUND revision-3 metadata, with ambiguity false and no original. Its one actual `runOriginals` retained the original before its sole captured FAKE 503 transport callback. Public source-bound ordering counters were load 2 / record 2 / retain 1 / readback 1 / dispatch 1 / completion 0. At both scripted undrained cutpoints, the run remained pending and the public store-close count was zero; both fake close acknowledgments were then observed. Expected public `RUN_FAILED / ENTRY_REJECTED` and logical `CHILD_UNKNOWN / CHILD_OUTCOME_UNKNOWN` coexisted with known native `RETURNED` once, resource `RELEASED`, and unknown-undrained false. This is an expected adverse case, not a failed authored test or an uncertain native release.

The fresh reader admitted only the exact writer file stamp and PID, not a writer recovery DTO. While its actual root was OPEN, it recovered the full original and state-bound plan, then detached only that diagnostic: load 6 / record 3, zero retention/dispatch, all authority and delivery flags false. One byte-identical synthetic submission was then rejected without a request callback: guard delta load 1 / record 1, zero retain/readback/dispatch/completion; final load 7 / record 4. Public `RUN_FAILED / ENTRY_REJECTED`, public owner phase `RECOVERY_REQUIRED`, full-envelope equality and these counters support `SOURCE_BOUND_EXISTING_ORIGINAL_GUARD_PATH`; they do not directly expose an inner exception or independently count native SQL queries. Automatic close was fulfilled/DRAINED with native RETURNED once. No live recovery/plan reads followed that automatic close.

One new synthetic database advanced owner epoch 2 to 3; original, BOUND funding, policy and schema rows were unchanged. The independently derived BOUND funding-row SHA-256 is `18536b6e9dcb6d75a9804dc1c377ff832320bb3e7b82b82e00d2ce9b026e6663`; stable semantic rows SHA-256 is `748a4394715a3b1fc7e3dd06dcd06e6e4b8e987436175b0dfaaf8eb94dc1a0b7`. Whole-file hashes honestly differ after acquisition: writer `0706564c2f4900bfe076f0127a405967eb0938ef59ff0faa41d1826cdbba84d0`; reader-final `67a5996d97215100740804d9ee5f3df039b0bdf2ca0aa8df01aac1e7a8ea7b41`.

The preceding 17,954-byte report prefix is preserved unchanged; this section is appended after qualification. The primary independently re-read the complete source/caller handoff, actual execution handoff and captured TAP, and performed a read-only physical audit of 84 exact files / 140,678,337 bytes, without opening SQLite. It verified all 27 protected files, 13 independent read-only source clones, 16 CAS payloads and their 16 ownership records, 10 closed evidence files, the task record and retained database. Nine registered directories, 11 physical scratch directories and 14 scratch files matched their exact identities and expected children; both known Node process groups were absent. The single task closed SUCCESS and retained the unregistered database under HOLD. The database was not CAS-adopted, exported, packaged or deleted; packaging contained only source/capture references.

Authoring evidence retains one read-only binding failure (`NameError: DEV`, before opening the selected source) and its corrected read. An unexecuted caller version that computed six registered directories while asserting nine was independently rejected; the corrected version explicitly includes the three retained input-staging directories and both returned command-directory IDs. Neither failure was hidden or counted as a test run. Earlier successful, failed and stopped scopes remain unchanged.

This is local synthetic component evidence only. Writer submission uncertainty is volatile historical object state, not a durable service-attempt/outcome journal. Fresh-reader false flags do not erase that history, establish delivery or restore send authority. Native close return does not independently prove deferred SQLite finalization, hard lifetime or OS cleanup; graceful fresh processes do not prove crash, cold-host restart, power-loss or durability recovery. No real network, payment, signature, provider READY, independent current funding/payer/provider/policy authority, SDK qualification, live service or pilot acceptance was established. Main/CI/publication remained separate. Protected live totals remain two consumed admissions, one actual chain PREPARE, zero bundles and zero native chain/provider qualification runs.

## 2026-10-16: opt-in V3 persisted dispatch intent, seven-phase local component qualification

Disposition: `LOCAL_SYNTHETIC_V3_DISPATCH_INTENT_SEVEN_PHASE_COMPONENT_QUALIFIED` for the exact local source graph below. This is a P2 custody/recovery enhancement using the existing backend, owner, HTTP client and runner, not a new architecture, a demonstrated V2 replay defect, a protocol requirement or pilot acceptance. The preceding 24,433-byte report is historical evidence and remains unchanged.

Seven existing source files were changed and two qualification fixtures were added. Explicit V3 create/open factories select user_version 3 and the exact five-table schema. V1/V2 default selection is preserved; no existing database is migrated, adopted or silently upgraded. Fresh V1/V2/V3 backend controls passed below; this does not requalify every old fixture on the changed graph.

| Written file | Bytes | SHA-256 |
| --- | ---: | --- |
| `src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js` | 55,597 | `945857725f70f4a17c8af6cc5b731fbdd5600e3c2d891bf84307d73bace5b3f4` |
| `src/service-credit-original-request-custody-contract.js` | 14,051 | `fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915` |
| `src/service-credit-custodied-request-owner.js` | 28,489 | `f2c6cddb0c1aa35252f394cdf61bc4f4131f8bcee6dc4befab6ccee79220e58e` |
| `src/service-credit-custodied-http-client.js` | 10,563 | `7c5443e05432ec31a26d180c42044bcc0d1b10457c9e6c1a6ce910010deec0b5` |
| `src/service-credit-custodied-sqlite-http-client.js` | 18,137 | `d8870f585614b55182127b87621c13987062626362c10aaece841c30acc7d86e` |
| `src/service-credit-custodied-sqlite-sequential-runner.js` | 19,433 | `b76f217e6471fd0ef2a8e60c70368d8f729129250eec26a0a43e02abd7856e54` |
| `src/service-credit-custodied-sequential-runner-core.js` | 15,288 | `36c99342bf9e47559e39535aefcde78acbbdd7fb210d42a77dbbb93c2fd9f8ff` |
| `qualification/service-credit-sqlite-dispatch-intent-v3.draft.mjs` | 42,206 | `2e31f28bc3913e2341472187658dd6b538999af5a09e39cbed4bfd2a72352144` |
| `qualification/service-credit-custodied-sqlite-dispatch-intent-reopen.draft.mjs` | 52,924 | `850205f16f08cb56329de8788172cd8db6f5fcf6771ebba2fcd4c35b684d3cdc` |

V3 commits an original-bound dispatch-intent marker before invoking the owned dispatch callback. Its canonical, descriptor-safe, bounded envelope binds the full original request, BOUND funding revision and pair/policy/resource/network identities with a domain-separated checksum. Duplicate intent insertion refuses; no reset, clear, replacement, retry or success-acknowledgment API was added. Persisted intent means `POSSIBLY_ATTEMPTED` and requires reconciliation, never acknowledged delivery. Absence is not send authority, and a same-user rewrite or deletion of an otherwise valid database is not authenticated.

The two new fixtures were selected in seven conditional fresh Node processes, with exactly one authored test per process:

| Phase | Retained coverage | Actual TAP |
| --- | --- | --- |
| baseline | Canonical/hostile codec cases; explicit fresh V1/V2/V3 schemas and cross-version refusal controls | 1 pass |
| hooks | Logical before-COMMIT rollback/absence and after-COMMIT committed/quarantined controls, on separate fresh databases | 1 pass |
| schema | Independently added extra schema is refused without repair | 1 pass |
| row | Independently corrupted canonical checksum row is refused without repair | 1 pass |
| bindings | Independent orphan and valid-checksum/wrong-original controls are refused without repair | 1 pass |
| writer | Actual owned V3 runner records intent before one drained fake INERT submission | 1 pass |
| reader | Fresh owned V3 runner recovers the marker and rejects same-input replay without dispatch | 1 pass |

All seven command receipts are COMPLETE, exit 0, with complete captured stdout, empty stderr and distinct observed process groups. Total: seven tests, seven pass, zero fail/cancelled/skipped/todo. Exactly ten new private synthetic databases were used; the reader alone reopens the writer's existing synthetic database. Runtime evidence is pinned to the existing Node 24.19.0 and Python 3.12.14, without installation or broad SDK/app qualification.

Every attempt is retained. The initial unchanged parent exited 1 at `EXACT_CLEARED_PARENT_ENV_REQUIRED`, before manager initialization: all seven phases NOT_RUN, zero task/Node/SQLite allocations, and no new physical-pin audit. A separate metadata-only probe observed the additional platform text-encoding environment key; an explicit three-key environment probe passed. The corrected unsaved parent changes only that exact environment comparison and the corresponding explicit launch assignment. Inverse-byte and grammar-only checks passed before its separate finite execution. Initial parent SHA-256: `16d63cf1766d90b7ff6162b269213f25ae5b14aea9603c6812527db62b4b6e65`; corrected parent: `d597c7607faa8c1b2deea62f907b032db4f8aa291552feac9b999a0c8e7d28d8`; corrected complete command: `d7ea97bf78a19cb2238705f2780c1518d91914ea8a0a03b8594295bd68ef050b`. One actual returned session was polled once and joined exit 0; its complete 51,839-byte parent capture SHA-256 is `a2c5c5e837508d07326f41becba1b06071d590c532710ef3604055b08bcee808`. No failed loader or refused launch is counted as a passed assertion.

The writer records one original and one intent before its sole fake request callback. Source-bound public counters are load 3 / record 2 / retain 1 / original-readback 1 / intent-write 1 / intent-read 1 / intent-readback 1 / dispatch 1 / completion 0. The controlled 503 request and response both close. Logical `CHILD_UNKNOWN / SUBMISSION_OUTCOME_UNKNOWN` coexists with one known native `RETURNED` close and unknown-undrained false; delivery remains unestablished.

The reader admits the exact closed writer file identity/hash/nanosecond stamp and PID before importing the selected graph. It recovers the full original and intent, and the state-bound plan reports `POSSIBLY_ATTEMPTED / RECONCILIATION_REQUIRED` with all authority capabilities false. Detaching that plan does not close the owned database. The one same-input guard attempt adds load 1 / record 1 and zero retain, intent-write, request callback, dispatch or completion; final counts are load 7 / record 4 / intent-read 2. The fresh root can close DRAINED with native RETURNED once while persistent service history still requires reconciliation. No live plan read follows automatic root close.

The connected database advances owner epoch 2 to 3, while the full original, funding, policy, schema and intent rows remain equal. Stable semantic rows SHA-256: `f2434bf19b01afa47d627bc7cac35d3749b465e62b0d45d29504ebfaa1ea25f6`; original-envelope SHA-256: `325e83729b9ec8604b4ab7b0d6e19383ee2b2cb156ebc6e9579159ffd5272ca8`; intent-envelope SHA-256: `5f47af645ec5df54fd7450519b910329473b5ed10a5c1f132b071d5398a1e810`. Whole-file hashes honestly differ: writer `d70b05355b1bd9046541371a3093bff9dc84f63b22186cafa16938025d981dbd`, reader-final `70087aa2086cdd35f6bfa1714456df3ad4688c257f97516070c81e9c3c03a5a9`.

Primary independent read-only audit verified 120 exact files / 141,277,573 bytes: all 29 protected originals, 14 independent read-only source clones, ten retained database files, 22 closed evidence records, the task record, and 22 CAS payloads with 22 creator/ownership records. All seven full TAP captures matched their exact authored names. Thirty logical references deduplicate to 22 objects; the exact scratch namespace contains 15 registered directories, 26 physical directories and 24 files. The owned task closed SUCCESS, with all ten unregistered database units retained under HOLD. No database was CAS-adopted, exported, packaged or deleted; packaging is reference-only. The audit opened no SQLite database and ran no additional test.

The 39 source-bound resource entries are 29 returned handles, six pre-native version refusals and four source-bound post-native constructor cleanup-path refusals, not 39 native opens or independently intercepted native closes. Public logical hooks are not physical disk-fault simulation. Source checks, finite capture limits and 12/15/20-second observations are not an OS/network sandbox, hard lifetime/cancellation guarantee, hard quota or deferred native-finalization proof. Earlier metadata, source, stopped-selection and execution evidence remains historical, not silently requalified; source authoring corrections and the separate metadata-only pin-order/observer failures remain retained.

This completes only this finite local V3 component slice. Crash/power-loss/cold-host recovery, hostile database rewriting, real provider READY, current funding/payer/provider/policy authority, protocol/official x402 compatibility, service acknowledgment/delivery and live pilot acceptance remain separate gates. V3 is explicit opt-in and is not default activation. No Git, GitHub, CI, publication, signing, payment or provider operation was performed in this slice. Protected totals remain two consumed admissions, one actual chain PREPARE, zero bundles and zero native chain/provider qualification runs; signer remains disabled.

## V3 two-original capacity and same-database reopen qualification (2026-10-16)

This distinct P2 slice qualifies the existing opt-in V3 component for one synthetic BOUND funding pair, one grant and a two-request policy. It adds only the finite fixture `qualification/service-credit-custodied-sqlite-multi-original-capacity-reopen.draft.mjs`; no production module, package, earlier fixture or default activation changes in this slice. The selected graph is twelve existing production/package files plus that fixture. The previous seven-phase qualification is separate and was not rerun.

The complete 65,064-byte / 903-LF / final-LF fixture has SHA-256 `15a5cddb55f4e907aa9b0f4cd69f7cdac170567d840b867e0af6a4ad34fbc16e`. Source, dependency, ownership, environment and outcome review preceded execution. Independent DATA-only checks verified the literal original/intent envelopes, domain-separated checksums and aggregate row hashes; these checks alone were not runtime evidence. The complete unsaved caller and its explicit CJS run-API driver were then reviewed before the distinct execution admission. No launcher or operational helper was saved.

The exact command was invoked once, joined with actual exit 0, and conditionally ran these three fresh Node 24.19.0 processes against one new private SQLite database:

| Phase | Exact authored test registration | Actual result |
|---|---|---|
| writer | V3 writer completes A and B synthetic interfaces then refuses distinct C at owner capacity | 1 test / 1 pass |
| reader-replay | fresh V3 reader recovers both persisted intents and refuses exact A replay without dispatch | 1 test / 1 pass |
| reader-capacity | fresh V3 owner preserves custody uncertainty while public backend proves persisted capacity | 1 test / 1 pass |

These are three distinct authored tests, not a rerun of earlier assertions: three passes, zero failures, skipped, cancelled or TODO tests. All three child stderr captures are empty. Full child stdout captures are 2,169 / 2,195 / 2,246 bytes and remain in verified CAS objects. The complete 32,538-byte marked parent result has SHA-256 `af4b5240dc05c9161513209731cfdf0b536ebe827af2e9176d798b1b3d852d8a`. The outer execution API exposes combined output, not independently labeled outer stdout/stderr lanes; the three child stream pairs are separately retained. No clipped display was used as completeness evidence.

The writer made one `runOriginals([A, B, C])` call. A and B each retained/read back their own original and persisted intent before their injected request callback. Both FAKE200 interfaces observed a canonical reply, response end/complete, request close and response close, cleared timers, and no transport uncertainty. C was refused by the already-full volatile owner before retention started: attempted 3 / completed 2, exactly two callbacks, owner `IDLE / DRAINED`, and no custody uncertainty. C has neither an original nor an intent row. FAKE200 is synthetic interface completion only, not acknowledgment, delivery or payment acceptance.

Each reader required the immediately preceding accepted exit/TAP/capture/drain/native-return/group-absence result and the exact full database identity/hash/nanosecond stamp before imports and the first database open. A PID alone was not the gate. The replay reader recovered both full originals and intent-bound state plans, locally detached each without closing the database, and refused exact A with zero retain, intent-write, dispatch or callback. Both histories remain `POSSIBLY_ATTEMPTED / RECONCILIATION_REQUIRED`, with all authority/action/delivery capabilities false. The owner/root could close DRAINED without erasing that history.

The fresh capacity reader attempted distinct C with an empty volatile owner. Its retained path conservatively preserved `CUSTODY_OUTCOME_UNKNOWN`, tracked 1, root `CHILD_UNKNOWN`, logical unknown true and undrained false, despite the owned native close method returning once. Its generic `RUN_FAILED` is not direct evidence of the private inner error. Only a separate public V3 backend acquisition after that known returned close directly observed the exact trusted `ZENON_FUNDING_PAYER_RECOVERY_STORE_CUSTODY_CAPACITY` error, including prototype, own descriptors, name, message, code and redacted stack. Full public rereads preserved A/B originals and intents, C absence and BOUND revision 3. That control closed before the final read-only SQL view; the logical custody uncertainty was not cleared.

Final views have the same funding pair/revision, policy, five-table schema, two originals, two intents and no C row. Stable semantic rows SHA-256 is `4963ced70c9902197e4391f8ec3a8b86eaf2cce57600dd8b0573aa2d894ecdbd`; it deliberately excludes owner epoch. Observed final epochs are 2 / 3 / 5: the last phase includes the owned acquisition at epoch 4 and separate public control at epoch 5. Whole-file hashes and timestamps honestly change across those acquisitions. The final retained database is 32,768 bytes, SHA-256 `27f1cbf7ca78209f67457b44356cb81f3a8944e7943614058cdafa8bedfab263`.

The independent primary read-only audit verified 94 exact files / 140,948,240 content bytes: all 30 protected originals, 13 independent read-only source clones, the one closed database, 15 closed evidence records, the task record, and 17 CAS payloads with 17 creator records. It read all three full TAP captures and checked exact names, diagnostics, counters, continuity, namespace, provenance and known absent process groups. Twenty logical references deduplicate to 17 objects; scratch has 10 registered directories, 12 physical directories and 14 files. The owned task closed SUCCESS with the unregistered database/leaf retained under HOLD. Database bytes were not CAS-adopted, exported, packaged or deleted; packaging is reference-only. The audit imported no manager, opened no SQLite handle and ran no extra test.

All 30 original physical pins matched before/after the run, after task close and in that independent audit, before this report-only append. The exact unsaved parent/command/driver digests are `bacccf0e95d765957b28e2d94910ba887b62bc0a1926569d7213cb6df18a7ad8` / `f1a59a91977fc243c4d50b52a8c6451ee691745862b7c9111d478616b99fb8b7` / `7c48872a5dab838bcbdd795ae2a81548a4690e326031ea19869d381f4bc9b0cd`. Earlier failures, corrected authoring drafts, stopped selections and NOT_RUN plans remain retained, not silently promoted or repeated.

The finite allocation plan was 64 MiB expected / 128 MiB task quota, under the existing 10 GiB free-space floor plus policy safety margin and live reservations. Source clones are separate 0400 APFS files, not hard links. Returned handle observations are 3 / 2 / 3, not independent native interception or C++ finalization proof. Cleared environments, source/path guards, stream caps and 2/12/15/20-second observations are not an OS/network sandbox, hard lifetime/cancellation guarantee or power-loss durability proof; Node permissions were OFF.

This completes only the local synthetic two-original/capacity slice. Real current context/funding/payer/provider/policy authority, provider READY, real acknowledgment/delivery, unknown-payment reconciliation, cold-host/crash recovery, official x402 compatibility and live pilot acceptance remain separate gates. No SDK, signing, payment, provider, Git/GitHub, main/CI, publication, automation or cleanup operation was performed. Protected real totals remain two consumed admissions, one actual chain PREPARE, zero bundles and zero native chain/provider qualification runs; signer remains disabled.

## 2026-10-16: V3 scoped original-request key discovery

This local increment reuses the existing V3 custody backend, owner, HTTP adapter and owned runner. The backend adds `listOriginalRequestKeys()`; the connected V3 owner, HTTP and owned SQLite surfaces add `readOriginalRecoveryKeys()`. The backend validates the bounded schema, funding, policy, complete original records and intents before returning freshly frozen, sorted keys. The owner validates every returned key, including foreign-grant entries, before selecting the current grant. Missing optional support is unavailable, not an empty successful catalog. This projection is not an atomic, authenticated global catalog and grants no request, dispatch, retry, signing or payment authority.

The existing V1/V2 profiles remain separate. Their catalog calls refuse without enabling V3 SQL or changing legacy behavior. Funding drift, lifecycle, reentrant/busy, captured-capability and hostile-data boundaries remain fail-closed. Stored originals and intents are not rewritten by catalog reads; an existing uncertain attempt remains uncertain. Discovering a no-intent original does not authorize a new dispatch.

### Retained outcomes and fixture correction

The first exact six-phase local run was **FAILURE**: the two owner assertions passed, the SQLite writer assertion failed, and reader, profiles and corrupt phases were **NOT_RUN**. Complete stdout/stderr, receipts, task outcome, independent file/hash checks and the failed synthetic database were retained. Its complete parent-output SHA-256 is `2396e58ff3c1844d8e1a27d6fb38c0b0848a08996d3e8478e0b87a29158ce69f`. This is not a clean six-test run.

The writer failed before its first catalog call: a test helper incorrectly required a DB-only directory while a live connection had a rollback-journal file. The local fixture now distinguishes live DB-plus-optional-journal snapshots from strict, flat, closed DB-only stamps. Live snapshots retain complete bounded bytes and physical stamps of both files; the combined unit remains limited to 2 MiB. Closed/read-only/reopen/input/final/corrupt-before-open boundaries stay strict. This does not establish an atomic snapshot or explain all native SQLite behavior. Process-group absence and CLOSED/FAILURE task metadata are not evidence that an unreturned native close completed.

The earlier source-only asynchronous-adapter fixture defect was corrected before any execution of that draft. A later read-only prewrite check rejected a missing positional selector before root inspection or any manager, Node, SQLite or write action; the corrected check completed before the single fixture edit. Failed data/parse checks and execution outcomes remain retained rather than recast as passing assertions.

The two already-passed owner assertions are not selected again because the owner fixture and its twelve-file production dependency graph are unchanged. A separate fresh-task four-phase remainder selects only writer, reader, profiles and foreign-corruption-before-open. Each accepted phase requires its exact authored TAP assertion and declared-data oracle, complete captures, exact source/clone pins and bounded native-handle/lifecycle evidence. The reader additionally requires the immediately preceding writer's known exit, declared returned closes, absent process group and exact closed-file identity/hash/stamps before its first native open. Older passing graphs are not requalified by this increment.

### Exact local source identities

The five changed implementation files and the two qualification fixtures were completely reviewed, with whole-file forward/inverse checks. SHA-256 identities for this increment:

- `src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js`: `eafb5b71f082fd571a35fdf6d5a9b0c39b22c2559d39af49a824d53057e07614`.
- `src/service-credit-custodied-request-owner.js`: `504efcbe8caac7091e221c4545ca7d9f71c29191d309388b9e91a42e69af01a4`.
- `src/service-credit-custodied-http-client.js`: `ddbc54faf4a14d95e6274bc9df27b7b49db251bab67c11b871cfb2f9e78b4f15`.
- `src/service-credit-custodied-sqlite-http-client.js`: `ea16d6ac5ce72d6434c06e98c52c324daf918dd570f15997cdc21e501f677f4e`.
- `src/service-credit-custodied-sqlite-sequential-runner.js`: `5842694117d3e0800b8f51225638e5955c013813ee52094ad918896fdf9c3529`.
- `qualification/service-credit-original-recovery-keys-owner.draft.mjs`: `79c2f9d99bdee815f44c13524b45f87c113656e3d357de789b99ff4c936d1159`.
- `qualification/service-credit-custodied-sqlite-recovery-keys-reopen.draft.mjs`: `ca8a31775854128d04fca4f7b7a8ec9f193742957604829b2ba0313280fdf00f` (45,772 bytes; repaired live-journal fixture).

Only new private synthetic SQLite data is in scope. Existing databases, historical evidence, original payment/request bytes and consumed authority are preserved. Local source and fixture evidence is not SDK, full-app/store/controller, native chain/provider, cold-restart, power-loss durability, service-delivery or pilot assurance. Live catalog mutation during an already-open handle is not tested. Native loader/runtime/OS behavior remains a premise. Main, hosted CI and publication remain separate gates; no dependency installation, build, payment, signing, provider provisioning or activation is part of this increment.

Protected real-operation totals remain **2 consumed admissions / 1 actual chain PREPARE / 0 bundles / 0 native chain-provider qualification runs**. Local SQLite statement preparation does not increment the actual chain PREPARE counter.

### Repaired SQLite remainder: actual local result

The one repaired four-phase invocation joined with **exit 0**. Exactly four authored assertions passed, with no failures, skips, cancellations or TODOs:

| Phase | Retained local result |
| --- | --- |
| Writer | All three validated original keys were cataloged without changing live DB/journal byte-and-stamp snapshots. |
| Fresh reader | The selected grant discovered two keys; an empty grant discovered none. Full original/state/plan recovery preserved the uncertain intent and no-intent action boundaries. |
| Profiles | V1/V2 catalog operations refused while their legacy owned surfaces and empty stored state remained unchanged. |
| Corrupt-before-open | A corrupted foreign original was refused before V3 ownership; constructor cleanup is source-bound evidence only. |

The complete parent capture is 41,943 ASCII bytes, SHA-256 `4920e2e80c393e3b7d6e766301439fff26a7ce5b76ef82360cea08af81930375`. The source-pinned unsaved parent/callsite/driver digests are `ef61660e85efb09aeab84d083424808db5892eb5ec8858fecf341881da228bdd` / `32e26f850c2a1fe08707774162ef498bdcb8c7763cb068cd786a648a3325af60` / `2dc67b557f6768cb6bc31ccd9003c45cf0dacd5ba2754714aeafa2ddb33edd26`. The runtime was the reviewed Node 24.19.0/darwin graph; no other qualification suite was run.

The independent primary read-only audit verified **107 exact files / 141,166,106 content bytes**: 32 protected originals, 14 independent read-only source clones, 18 closed evidence records plus the task record, four closed databases, and 19 CAS payloads with 19 creator records. It read all four complete TAP captures, compared exact names and ordered diagnostics, checked writer-to-reader identity/hash/stamp continuity, and confirmed four distinct absent process groups. Twenty-four logical references deduplicate to 19 objects. The namespace contains 12 registered directories, 17 physical directories and 18 files. The task closed SUCCESS; all four unregistered raw DB units remain on HOLD. No database was adopted into CAS, exported, packaged, copied, reseeded or deleted. Packaging contains references only. The audit opened no SQLite handle, imported no manager and ran no additional test.

The first independent audit attempt rejected its historical diagnostic comparison because it used the auditor's current PID as the expected parent PID. That read-only check was corrected to use the retained original supervisor PID and then passed. This checker-context error and its actual failed attempt remain retained; no test, source or evidence artifact was rewritten or rerun to obtain that result.

There are now **six distinct authored assertions with passing outcomes across two executions**: the two earlier owner assertions and these four repaired SQLite assertions. This is **not a clean six-phase run**. The original writer failure and its then-NOT_RUN later phases remain intact. The two owner assertions were not rerun.

This completes only `LOCAL_SYNTHETIC_V3_SCOPED_RECOVERY_KEYS_SQLITE_FOUR_COMPONENT_QUALIFIED`, together with the separate retained owner component evidence. It does not complete P2 globally or qualify a live pilot. The 14 declared returned native handles (2 / 3 / 6 / 3), four owned roots, ten auxiliary handles and one terminal source-bound constructor refusal remain distinct from independent native-close interception, C++ finalization, cold-host/crash recovery, power-loss durability, delivery or authority assurance. All 32 original physical pins matched through execution, close and independent audit before this report-only append. Main/CI, publication, official x402 compatibility and real-provider acceptance remain separate; the protected real-operation totals above are unchanged.

## Persisted-capacity preflight V3: five-phase local qualification (2026-10-16 UTC)

Disposition: `LOCAL_SYNTHETIC_V3_PERSISTED_CAPACITY_FIVE_COMPONENT_QUALIFIED`. This is a distinct, completed P2 component slice, not a claim that P2 or a live pilot is complete. It uses the existing custodied owner, HTTP client, SQLite backend and sequential runner rather than introducing another implementation or public API.

The opt-in V3 owner now reads the captured optional **complete global** original-request catalog before new tracking or retention. Foreign-grant rows count toward the persisted policy limit. A valid full catalog produces the existing public owner `CAPACITY` refusal with zero new tracking, retention, intent fencing or dispatch. Existing-original, input, scope, closed, busy and prior-hold precedence remains intact. The same private strict catalog validator is reused by recovery-key reads. Missing optional capability and legacy owner fallback controls preserve the prior path; this run is not new native V1/V2 schema qualification.

The independently reviewed C2 correction distinguishes an initially missing funding record (`FUNDING_REQUIRED`, no new custody uncertainty) from a funding record disappearing after a valid catalog read (`CUSTODY_OUTCOME_UNKNOWN`, latched). A nonfull catalog reserves no slot: a later authoritative retention failure still remains UNKNOWN and cannot be laundered into a known capacity refusal. Existing uncertainty is never cleared.

### Exact executed source and launch

| Executed source | UTF-8 bytes / LF | SHA-256 |
| --- | --- | --- |
| `src/service-credit-custodied-request-owner.js` | 34,704 / 920 | `3771fabb422f021993dd63d730d748b7128160d362574dffe36c619fac77261d` |
| `qualification/service-credit-original-capacity-preflight-owner.draft.mjs` | 33,537 / 377 | `26e73b298d9d7e1fa22ec88272f09a65ab07205f09ed391f0c84fa83943bf965` |
| `qualification/service-credit-custodied-sqlite-capacity-preflight-reopen.draft.mjs` | 59,714 / 554 | `be73b08ed13e779f9f8dbf0cbcc80c2b2c28e489192b8a51c380c8b9629f2b80` |

The source-draft NOT_RUN headers were not rewritten. This section and the retained receipts record the actual component outcomes for those exact immutable authored bytes.

The exact 14-file dependency/fixture selection totals 342,595 bytes; the first 12 production/package files total 249,344 bytes. Its canonical physical-pin table is 6,357 bytes, SHA-256 `f1852ae6410f87e0e7764168f620ac1418a1f846529f144bda666a0498b1ae46`. The pre-append 34-file protected table is 15,235 bytes, SHA-256 `ecdc44c3fde663e67af22205b920bbb697fa48bb8d45a04397b0173659dcb074`, covering 140,376,055 content bytes.

The full unsaved parent, exact quoted-heredoc Native callsite, CJS driver, imports, environment, oracles, resource accounting and outcome protocol were independently reviewed before execution. A Python AST-only check passed without executing the parent, manager, JavaScript or SQLite. The parent / exact command / driver SHA-256 values are `c981d5d8e8a0f1cf552593029a2d195d605a7cfccc86023f869fccfa371a290c` / `02846e1fcdcc13b61b17a742a8333c07032c8673e688245937693ce9eafb2b53` / `2f0ff1c170308167b128855986c78de5a858ff5314a0335d6a92b5ad1e976c68`. No saved or installed operational helper was added.

One exact Native launch (`8d5037`) returned session `10317`; one observation of that same session (`3f6f96`) joined with actual exit 0. There was no replacement launch or test retry. Its complete combined Native capture is 48,770 ASCII bytes, SHA-256 `4e0288bf0fecd1ecb9d2fa89b0e2aa9d8b07a3179bfe0310623c80432483fa0d`; the framed JSON payload is 48,686 bytes, SHA-256 `8695e74cba03c0bb52234944549e6dfbe9cd9d733e037c17c6280fc86b64d734`. The Native interface exposes a combined parent channel, not independent parent stdout/stderr lanes. Each child has separate complete manager-retained stdout/stderr references; all five child stderr captures are empty.

The runtime is the reviewed Node 24.19.0/darwin graph. The fixed driver uses explicit positional files/phases and `node:test` with isolation disabled; no directory discovery or `--input-type` is used. The cleared environment, `--no-addons`, string-code-generation restriction, private source guards, output caps and original owned-task supervision remain explicit. Node permission flags are OFF, not an OS or network sandbox.

### Actual results

| Phase | Authored assertions | Actual result |
| --- | --- | --- |
| owner-valid | 1 | PASS; 18 declared controls across 12 borrowed owners |
| owner-adverse | 1 | PASS; 39 declared controls across 22 borrowed owners |
| writer | 1 | PASS; direct owned HTTP client exposes exact owner CAPACITY |
| reader | 1 | PASS; distinct fresh process reopens only the accepted writer file |
| under-capacity | 1 | PASS; new original crosses one fully drained synthetic interface |

All five actual TAP captures have one exact authored registration, one PASS, zero failures, skipped, cancelled or TODO tests. The 57 internal owner controls are not 57 additional authored tests. All five distinct process groups were observed absent. The 26 previously reviewed SQL golden DATA predictions remain unchanged; their prior DATA-only check was not counted as a runtime test.

The full-store writer retains two originals, including one foreign-grant row, and one own-grant intent. Its public CAPACITY refusal has owner counters `loadReads=2, recordReads=2`, with all action counters zero and no new tracking or uncertainty. The closed writer database was 32,768 bytes, SHA-256 `8a2b2c65bdc5ca57c3750318167ca3d2b296bd81320131478cd1187ef8ef3444`. Admission of the reader required the actual writer exit, complete TAP/captures, returned-close/drain declarations, absent group, writer PID and full path/device/inode/owner/mode/link/size/hash/mtime/ctime stamp before imports and first open.

The reader recovered the exact original and `POSSIBLY_ATTEMPTED` intent. Its new request produced public generic `RUN_FAILED / ENTRY_REJECTED`, without new custody uncertainty, retention, intent write or transport. This generic refusal does **not** disclose or independently prove the private CAPACITY reason. Owner counters are `loadReads=4, recordReads=3, intentReads=1`; other action counters remain zero. Ownership epoch 2 -> 3 is an expected database change, while funding, policy, schema, original and intent semantics match the retained goldens.

The separate under-capacity unit admitted one new original through retention/readback, an original-bound intent fence and one canonical FAKE200 response. Actual run/callback/root completion remained pending after response end and after request close; response close allowed the callback and owned drain to complete. Final owner counters are `4,3,1,1,1,1,1,1,1` in the declared load/read/retain/readback/dispatch/callback/intent-write/intent-read/intent-confirmation order. One request, seven listener registrations, 46 response bytes, one settlement and zero destroys were observed. Intent state remains `POSSIBLY_ATTEMPTED`, not ACK, delivery, payment or authority evidence. The earlier full unit remained byte-, identity- and namespace-identical throughout this phase.

### Independent audit, retention and limits

The primary independently read all five complete TAP captures and verified **112 physical files / 141,313,117 content bytes**: 34 protected originals, 14 independent read-only source clones, 21 protected evidence files plus the task record, two raw databases, and 20 CAS objects with 20 creator ledgers. Twenty-six logical references deduplicate to 20 objects. The scratch namespace has 13 registered directories, 16 physical directories, 16 files and five command directories. The audit bound diagnostics to the retained original supervisor PID, not the later auditor PID, and checked strict writer/reader continuity, current closed DB stamps, all source bindings, command receipts and creator records. It opened no SQLite handle, imported no manager and ran no additional test.

The first read-only audit invocation (`6b6035`) had a missing separator newline and stopped at Python syntax parsing before any runtime statement. Its exact failure remains retained. Only the unsaved checker composition was corrected; the independent audit then passed (`760245`). No test, source, existing receipt or database was rerun or changed to obtain the audit result. Earlier DATA-authoring refusal, display truncations, the README label defect and the primary callsite-review expectation correction remain retained as preparation history, not qualification launches.

The new task closed SUCCESS. Both unregistered 32,768-byte raw units and their directories remain HOLD; they were not CAS-adopted, exported, packaged, copied, reseeded or deleted. Their final full/under SHA-256 values are `74fdf0e3f34dfd5fb8a2799087cd59fc288150452e55ab8b2d3ba0f5f908a679` / `d53c68edf77e28504e8a0c3d5232aa00507041e47f8aef66df99c6237b8ebb29`. Packaging is a reference manifest only. Historical X/R databases, failures, stopped selections and graph-specific outcomes are unchanged and were not reused as qualification of these changed owner bytes.

The source-bound returned SQLite controls are 3 / 2 / 3: three owned roots and five auxiliary handles, maximum one live slot. Returned method/close declarations, parent-FD return, task CLOSED/SUCCESS and observed absent groups are not independent C++ finalization, inherited-resource release or OS cleanup proof. The 2 / 12 / 15 / 20-second observation bounds are not hard lifetime, cancellation, restart or power-loss durability guarantees. The original manager's exact-owned-child fault handling and intrinsic own-task close collection were retained; no replacement supervisor, standalone cleanup or recovery operation was introduced.

All 34 protected pins matched through execution, close and the independent audit before this report-only append. This result establishes only the named local synthetic component behavior. Independent current context, funding, payer/provider/policy authority, real provider READY, shipped SDK compatibility, official x402 interoperability, pending-payment reconciliation, durable production recovery and service/pilot acceptance remain separate gates. Main/CI and publication remain separate; no commit, push or publication occurred in this slice.

Protected real-operation totals remain **2 consumed admissions / 1 actual chain PREPARE / 0 bundles / 0 native chain-provider qualification runs**. Local SQLite `prepare` calls do not consume chain PREPARE authority. The signer remains disabled, #165 ownership metadata is not retried, and original signed payment/request bytes, hashes, payload, requirements, context and consumed authority are preserved. PR193's possible VALIDATED exact-same-signed-block resend remains separate from UNKNOWN/ACKNOWLEDGED. No new payment, signature, replacement or authority reset occurred.

## Recovery second-funding disappearance: declared owner component (2026-10-17 local)

Scope: `OCT17_P2_RECOVERY_SECOND_FUNDING_DISAPPEARANCE_V1`. Status: **LOCAL_DECLARED_V3_RECOVERY_SECOND_FUNDING_COMPONENT_QUALIFIED**, not whole-P2 or SQLite/native qualification. Source review found a specific inconsistency: after a valid first funding read and an original/intent or catalog read, a missing second funding read escaped as the known `FUNDING_REQUIRED` error without latching custody uncertainty. This selection follows that positive source path, not an inference from missing coverage. The proposed catalog-plan collection API was deferred.

Only the two second-read sites in `src/service-credit-custodied-request-owner.js` changed. Each now catches a failed second funding observation, latches custody uncertainty and throws `CUSTODY_OUTCOME_UNKNOWN`. Initial absence still produces `FUNDING_REQUIRED` without a hold. Shared `currentFunding`, direct legacy `readOriginal`, submission, the completed C2 capacity preflight, public APIs and dependencies remain unchanged. The full owner changed from 34,704 bytes / SHA-256 `3771fabb422f021993dd63d730d748b7128160d362574dffe36c619fac77261d` to 34,950 bytes / 932 LF / SHA-256 `35386cc84c281aee4636141171076b84aa139ae20c66e4366788927cef43f3ca`; exact complete-source forward/inverse comparison confined the difference to those two sites.

The separate new fixture is `qualification/service-credit-original-recovery-funding-disappearance.draft.mjs`: 19,676 bytes / 290 LF, SHA-256 `85ffcea84ac4042c4f48b2186a73872735ab28aa3db8e4f7abf7b81422ffc4e5`. The existing implementation worker's complete source handoff was independently reviewed: four artifacts, 23 ASCII frames, 95,094 framed bytes, SHA-256 `dcafdba27fcb22c88f3baf81841000d9050c06d908c9bc982079afb2132a3983`. The source's draft/NOT_RUN labels remain historical authoring labels; the exact subsequent local outcome is recorded here.

Exactly one new foreground Node 24.19.0 process ran exactly one authored test: `V3 recovery reads latch second funding loss while preserving initial absence and borrowed close ownership`. Actual exit was 0 with complete TAP: **1 test / 1 pass / 0 fail / 0 skipped / 0 cancelled / 0 todo**. Its 15 internal controls are not 15 authored tests. They cover four initial-null cases, four second-null cases, four nonnull revision-drift cases, closed/arity precedence, and two busy-precedence cases. State variants distinguish a retained intent, no intent and no original; catalog reads still filter foreign keys. Returning funding does not clear an observed custody hold. Seven logical borrowed-owner closes drained and eight retained UNKNOWN through their original cached native Promises. Borrowed-store close, retention, intent-write, dispatch and callback-completion counters remained zero.

The complete stdout is 2,395 bytes, SHA-256 `5de9717f4e93f0f5a0b2d3cf23031e1704d90a522251909a6c02e1b48561cb0b`; stderr is empty. A subsequent independent read-only audit checked 57 distinct physical files, 140,525,862 bytes, with record-set SHA-256 `7e3b6f52382f642fd7f63013eae8a30a2e4202b8a23b4c4512bd0be7ff26f770`. It reread the complete TAP, seven protected receipts, six unique CAS objects and creator records, and their exact source bindings without rerunning Node, opening SQL, evaluating the manager or writing repository files.

The launched graph comprised only the fixture, owner, custody contract and root package JSON: four files / 70,090 bytes. The package was module/engine DATA, not SDK qualification. Independent APFS source clones were used, never hard links. The unchanged trusted manager admitted one fresh task with expected 16 MiB / quota 32 MiB under its live allocation/reservation checks and unchanged 10 GiB floor / 1 GiB policy margin. The task closed SUCCESS; only its registered reproducible 70,090-byte source-clone scratch was cleaned. Protected sources, complete streams and reference-only evidence remain retained; seven logical references resolve to six CAS objects. No historical database, cache, failed output or unregistered raw unit was adopted, reopened, reseeded, exported or deleted.

The fixed unsaved caller used a cleared environment, `--no-addons`, string-code-generation restrictions and explicit test-API `isolation: none`; it introduced no saved operational helper. Node permissions were OFF: source/path/environment checks are not an OS or network sandbox. The 2 / 12 / 15 / 20-second observation bounds do not guarantee hard lifetime, cancellation, native finalization or cleanup. The diagnostic's `nativeHandles: 0` denotes the fixture's zero SQLite/store-handle control, not zero OS file descriptors. No SQLite, HTTP, owned runner, wire or SDK module was imported. The original manager's own-child fault supervision and own-task context close remained premises; no replacement supervisor, ad hoc signal, retry or standalone collection was used.

All 35 protected pins matched before and after execution and during the independent audit, before this report-only append: canonical table SHA-256 `fcba498b00c1c821b11066d9ec9ec1a0f0f062ac47db797e4869b04ef66de6ee`, 140,406,860 bytes. Other 33 baseline files were unchanged when the owner and new fixture were written. No old fixture was changed or rerun. Prior results remain bound to their prior complete graphs; this new owner-component pass does not requalify the changed owned-SQLite graph, recover a real pending payment, establish restart/durability, provider READY, delivery or pilot acceptance.

Main/CI, publication and external acceptance gates remain separate. No commit, push, CI, network, new payment, signature, replacement or consumed-authority reset occurred. The signer stays disabled, #165 ownership metadata is not retried, original payment/request bytes and hash/payload/requirements/context are preserved, and PR193 VALIDATED exact-same-signed-block resend stays separate from UNKNOWN/ACKNOWLEDGED. Protected real totals remain **2 consumed admissions / 1 actual chain PREPARE / 0 bundles / 0 native chain-provider qualification runs**.

## Catalog-bound owned recovery collection: actual SQLite lifecycle (2026-10-17 local)

Scope: `OCT17_P2_CATALOG_BOUND_OWNED_RECOVERY_LIFECYCLE_V1`; actual execution handoff: `OCT17_P2_CATALOG_BOUND_OWNED_RECOVERY_LIFECYCLE_THREE_PHASE_EXECUTION_V1`. Status: **LOCAL_SYNTHETIC_V3_CATALOG_BOUND_OWNED_RECOVERY_LIFECYCLE_COMPONENT_QUALIFIED**, independently audited. This closes the named local collection component, not whole P2, a live pilot, provider readiness or production recovery. The previously deferred collection was selected from the positive backend/startup-recovery path and existing catalog/per-key APIs; absence of a test was not treated as novelty.

The V3 owned runner now exposes `createOriginalRecoveryCollection(initialObservationsJson)` over the existing owned catalog and per-key recovery plans. Its canonical observation list must match the entire selected catalog, in order, with at most eight entries; no truncation, foreign membership or silent adoption is allowed. Construction checks complete child snapshots and catalog bookends before publication. Refresh binds retained original/intent envelopes, funding identity and nonregressing revisions; the first failed live refresh latches local unavailability. Local, idempotent detach preserves the last complete historical view and never closes the root owner. Current UNKNOWN, an observed custody latch, historical ambiguity and POSSIBLY_ATTEMPTED intent remain distinct. None grants action or delivery authority.

Exactly four source files were admitted and independently reviewed. `src/service-credit-custodied-sqlite-sequential-runner.js` is 20,469 bytes / 489 LF, SHA-256 `24b0a62ac889574e3d9176e025d84f252c6c18796e57d2ea20de14497aeed0be`; its 843-byte difference is four insertions, with complete-source inverse comparison preserving the old single-key, run and close bodies. New `src/service-credit-custodied-recovery-collection-core.js` is 13,794 bytes / 306 LF, SHA-256 `51d06da70ecccd0cf8b38d650367d1ae903ea86010a5ebeadb682af98e4b890b`. The default V2 method surface is unchanged, but the changed import graph was not requalified as V2 behavior.

The new fixtures are `qualification/service-credit-custodied-recovery-collection-core.draft.mjs`, 32,597 bytes / 349 LF / SHA-256 `6a33cd5c330f35814ac505a27af7dc8c3affc15ed71b214849bd6772c7b9a4ae`, and `qualification/service-credit-custodied-sqlite-recovery-collection-reopen.draft.mjs`, 41,395 bytes / 474 LF / SHA-256 `d9cb887a7f393ea254dae3dee0164535067e19be713385da55a3afb1f631f873`. Draft filenames and nested UNQUALIFIED diagnostics do not become live/production evidence; this entry records the subsequent exact local execution. No old fixture was changed or rerun.

One exact fixed unsaved caller ran once, with three conditional fresh foreground Node 24.19.0/darwin processes in the order core -> writer -> reader. Each ran exactly one authored test and produced complete TAP: **3 tests / 3 pass / 0 fail / 0 skipped / 0 cancelled / 0 todo**. Core's 41 internal interface controls are not 41 authored tests or real SQLite fault-injection cases. Exact authored names were `catalog-bound recovery collection owns complete diagnostic lifecycle over declared internal operations`, `V3 collection writer retains literal selected and foreign originals with one reconciliation intent`, and `fresh owned V3 recovery collection binds catalog and detaches history across actual root close`.

Complete stdout byte counts and SHA-256 values are core: 2,405 / `1b867d9992185f4b9564ce880dab1843181bf95b65e711bdf1ecc73a81c2afda`; writer: 1,158 / `db80ce57b6254913e6feb7bc40b4f0ca439cf51e4c7f3a752d6d34d5399edbab`; reader: 2,290 / `12a19a06359c0c15c231e936e084a4177b26c6bbf6de866fed19189c298bf8c8`. All three stderr streams are empty. Launch attempts, actual fixture-confirmed Node processes and observed native process groups were separately counted; there were no unverified Node launches.

The writer retained three literal originals, including a foreign grant, and one selected reconciliation intent. After its actual two returned closes and complete zero-exit/TAP/capture/group checks, the reader received that immediate writer's PID and full closed-file physical stamp before repository imports or its first SQLite open. The same database identity advanced from owner epoch 1 to epoch 3 without changing the stable SQL semantic view. The reader's selected and empty roots drained; source-bound closes returned three times. The maximum live source-bound handle count was one. Selected final owner counters were `48,24,0,0,0,0,0,14,0`; empty counters were `8,4,0,0,0,0,0,0,0`, ordered as loadReads, recordReads, retainCalls, readbackConfirmations, dispatchCalls, callbackCompletions, intentWrites, intentReads and intentReadbackConfirmations. Collections detached cached history without a second root close; a live collection became unavailable after the actual root closed.

The complete final caller source is 109,226 bytes / 1,228 LF, SHA-256 `40f6d04368d2caf87d10ffbc05a4ecd4bb7430702f3b0afede69f86aae8a6610`. Its exact stdin invocation object is 118,519 bytes, SHA-256 `4630deb078543e86ca74eace7bebed154ed8ca41c7422665514404eba1f4e3be`; its inline CJS driver is 1,358 bytes, SHA-256 `1640a747ae5e8f8bd336a39c7e3de23029575ddfc9d871599d6c528a9da804f0`. The complete parent output is 34,800 bytes, SHA-256 `5c8973256ba123296989a0cfff6e0f1792296c2f42f3d1ac4c5f8f95d71288c4`, with both markers, actual exit 0 and no overflow fallback. The execution handoff's three artifacts / 21 frames / 84,090 bytes have ordered body aggregate SHA-256 `e6d69ef7f9ea818852145ace7bdf892c380abea83061eef9d0d0a558266d146e`. A stale five-phase namespace check was corrected before execution; withdrawn generation A and both source-only validator refusals remain preserved, not passed tests.

An independent read-only audit checked **108 distinct physical files / 141,341,543 bytes**, record-set SHA-256 `ea473b4b8d526190d9a5b4abb31e94cf35a8cba12e2dff9daa21deee75151aba`. It read the full three TAP streams, exact protected receipts and continuity manifests, reference-only package, all 19 CAS objects and creator ledgers, source clones, raw database and current 38 original source/runtime/manager/config pins. It matched the committed object-record set and writer-to-reader stamp, checked the closed task, directory namespaces and absent child groups, without rerunning Node, opening SQLite, evaluating the manager or writing files.

The unchanged trusted manager used one fresh original task context and artifact lease, expected 64 MiB / quota 128 MiB, over a 16,863,830-byte declared allocation plan. Its live reservation/allocation checks retained the 10 GiB free-space floor and unchanged 1 GiB policy margin; free-space snapshots were not admission. Fifteen independent APFS source clones totalled 338,219 bytes. Task close was SUCCESS. One unregistered 32,768-byte raw SQLite unit caused HOLD of the entire scratch tree, including the reproducible clones; 23 logical references resolve to 19 linked unique CAS objects, with 15 protected evidence files. The raw database's final SHA-256 is `4f6239968bc4054f0a798cf0126ffc0a2e88709dc9246e3bf925a484e3532758`. It was not CAS-adopted, exported, copied, reseeded or deleted, and no historical database/cache cleanup or rebinding occurred.

All 38 current protected pins matched through close and the independent audit before this report-only append: canonical table SHA-256 `055c616f6c1768592a54b42002e1b5d4f783b9b6df5931ec945b5adfbe49d513`. The fixed cleared-environment callsite retained explicit test-API `isolation: none`, no addons, string-code-generation restrictions and the original manager's own-child fault supervision/context close. No saved operational helper or replacement supervisor was introduced. Permissions OFF is not an OS/network sandbox. The 2 / 12 / 15 / 20-second observations are not hard lifetime, cancellation, native finalization or cleanup guarantees.

This is graceful synthetic reopen and source/API returned-close evidence, not C++ finalizer interception, hostile callback/reentrancy qualification, live catalog mutation under the unchanged EXCLUSIVE store contract, ungraceful restart or power-loss durability. Independent current context/funding/payer/provider/policy authority, real provider READY, shipped SDK/official x402 compatibility, actual pending-payment recovery, service delivery, whole-P2 recovery and live-pilot acceptance remain separate gates. Main/CI and publication remain separate; no commit, push, CI or publication occurred. The signer stays disabled, #165 ownership metadata is not retried, original payment/request bytes/hash/payload/requirements/context and consumed authority remain unchanged, and PR193 VALIDATED exact-same-signed-block resend stays separate from UNKNOWN/ACKNOWLEDGED. Protected real totals remain **2 consumed admissions / 1 actual chain PREPARE / 0 bundles / 0 native chain-provider qualification runs**.
