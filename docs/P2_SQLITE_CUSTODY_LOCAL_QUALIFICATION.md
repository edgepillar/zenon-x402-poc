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
