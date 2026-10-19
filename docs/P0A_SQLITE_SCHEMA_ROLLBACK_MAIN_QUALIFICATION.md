# P0-A SQLite schema and rollback hardening: bounded main-adoption evidence

Status: exact source hardening accepted after independent source review and one local synthetic schema-refusal case. Failed-rollback execution, native cleanup and full P0-A/P2/live acceptance remain unestablished.

## Exact production scope

Base main: `6771aba2c539e94d1887983d7c540430f2add4e9`.

Only `src/service-credit-sqlite-store.js` changes. The complete delta is four unified hunks, five added/two removed lines, net 141 bytes and three line feeds. No imports, public API, error helpers, quarantine/close bodies, schema versions, dependencies or defaults are changed; no SQL call site is added or removed.

| Source | Bytes | SHA-256 | Git blob |
| --- | ---: | --- | --- |
| Base store | 82000 | `3ea290da4010e1dbadec08083dbd7012840d362608cf846df0eaf33d85ce3506` | `5012fd9961fe181cf6ffef145f167f82e7855687` |
| Adopted store | 82141 | `bda45bd553c8580a7bd66573bb2fb7c3bf12d79bab49a91fe3ac6dc1ebad8422` | `6a7364fbc59c43edffb7a73f550210644e78daff` |

Two existing local changes are adopted together; this is not a whole-branch merge or a newly demonstrated vulnerability claim:

1. The schema query excludes the literal `sqlite_` system prefix using an explicit escape, instead of interpreting the underscore as a LIKE wildcard. This contributes 12 net bytes.
2. A private per-`#runTransaction` rollback-attempt flag is set before either existing explicit rollback call. Finally fallback requires that no rollback was already attempted. This contributes 129 net bytes.

The model, execution-contract and package dependencies already match base main exactly. Their pinned contents and the test's complete graph are recorded in the execution result; no dependency installation or rewrite is included.

## Actual local schema-refusal case

The unchanged [fixture](../qualification/service-credit-sqlite-literal-system-prefix.draft.mjs) is 22401 bytes, SHA-256 `1e6910c706fb8ebbdbc6be92bb1790a23c1084443c8730148eb1429c3ae3072f`. Its [execution record](../qualification/service-credit-sqlite-literal-system-prefix.result.json) is 12422 bytes, SHA-256 `91b7e17a1ebcb1158b70f0d8f39be2f2af3c5cbd01c1e356d0fd6a24fc78c463`.

Exactly one explicit Node command joined exit 0: one authored test passed, with zero failures/skips/cancellations. The test took 111.870375 ms; the runner reported 121.676583 ms. The runtime was Node v24.19.0, darwin/arm64, binary SHA-256 `613be50c90e83aa8da58dd9ed393d0b39914a3b8ef4123fe817b46c2679cebe2`.

The actual current store creates a new empty synthetic database and returns once from its close. A single actual raw SQLite connection adds `sqliteX_shadow`. The old query sees one object while the literal-prefix query sees both. Complete ledger rows, ledger schema/root page/columns, application/user versions, journal mode, integrity and foreign-key controls remain intact. The raw connection closes once with a known return. The final actual current-store open is attempted once and throws the exact current `SERVICE_CREDIT_STORE_CORRUPT` class/code/name/message/redacted stack. A generic exception cannot pass.

The original source-only request named `SERVICE_CREDIT_STORE_SCHEMA_UNSUPPORTED`; exact source review corrected that oracle before launch. The current source uses that other code for application-id/user-version mismatch, not the extra-table acceptance established here. It remains a separate unqualified case.

There are no grants, keys, signing, funding, execution/debit, SDK, network or provider operations in this case. Cost and clock callbacks are not invoked. Earlier completed session/helper/schema cases are not rerun or extended.

## Independent rollback source argument

The complete worker assessment was read and independently compared with the pinned base/current source and complete delta. Assessment SHA-256: `e5f8eb825c024dda3a2d5d9bb9502b4c62d46b00a4fd585edd39d440ad0ff6e7`. Exact DATA reconstruction/inversion binds the entire file; this is not JavaScript or failed-rollback execution.

At current lines 2162-2220, usability/identity checks precede the try. Each invocation starts with a fresh false rollback flag. Catch marks it true before selecting the first rollback call. A thrown call quarantines and throws fixed `SERVICE_CREDIT_STORE_ROLLBACK_FAILED`; finally cannot select that rollback again. If no catch rollback was selected, the existing finally fallback remains available and marks the flag before its own call.

Under the reviewed ordinary intrinsic/native-method premise, this gives at-most-once selection of the existing explicit rollback sites per transaction invocation. It is not a database-wide/process-wide counter or a measurement of SQLite's internal work. Existing commit/error precedence is unchanged: after a successful catch rollback, recognized model/store errors retain their fixed mapping, while commit uncertainty maps to `SERVICE_CREDIT_STORE_COMMIT_FAILED`.

Unchanged limits remain explicit:

- Finally fallback failure quarantines without explicitly replacing the pending completion/error with `ROLLBACK_FAILED`. Native-state probe exceptions are not proof that no transaction exists.
- Quarantine uses best-effort native close, swallows close errors and sets the closed flag. Constructor catches can attempt close again. Public close can return because the closed flag is set; this does not verify an earlier native close.
- At-most-once close, actual transaction termination, failed-rollback classifications in execution, layered native close outcomes and OS cleanup are not established. These source limits are not new demonstrated native failures.

The actual schema outcome is consistent with the ordinary successful-rollback path, not a native failed-rollback experiment or measured rollback count. Its final thrown constructor returns no owner; internal close remains `UNINSTRUMENTED_NOT_ESTABLISHED`. Source reasoning and actual local execution are deliberately separate evidence classes.

## Storage, preservation and remaining gates

The existing approved manager supervises one fresh private task/database: expected allocation 32 MiB, quota 64 MiB, unchanged 10 GiB production floor plus other reservations. No binary download, dependency installation, runtime/source copy, saved helper or new host is used. The large runtime binary is not copied or rehashed.

The task is CLOSED/SUCCESS; cleanup is separately HOLD because child-created entries remain unregistered. The sole persistent database is 12288 bytes and is preserved, not adopted or deleted. After observed original-process/group absence, the parent performed only a stable raw-FD hash, not a SQLite decode/reopen. This does not establish application close, crash/power-loss durability or restart/recovery. Source/package/fixture and manager pins match after the run; root configuration and runtime identity are unchanged.

Complete separately captured stdout is 1898 bytes, stderr zero. The case uses nine cleared-environment keys and an unsaved inline explicit run-API callsite. The 20 s foreground and 12 s test limits, stream caps and sampled manager quotas are not an OS/network sandbox, aggregate OS quota, hard lifetime, cancellation or native-cleanup guarantee.

The unchanged execution record's local-only publication section describes its pre-adoption disposition. This document adds the independent source review and bounded adoption decision; it does not retroactively turn the schema pass into failed-rollback runtime qualification. The fixture's authored source-draft provenance header is likewise preserved.

No hosted CI is dispatched or asserted green. No broad store, migration, durable composition, restart/recovery, live pilot, provider READY, service delivery or production acceptance is established. Acceptance requiring failed-rollback/native-close properties remains unmet and requires its own separately admitted scope.

The real payment signer stays disabled. Protected totals remain two consumed admissions, one actual chain PREPARE, zero bundles and zero native-chain/provider qualification runs. Original payment/request bytes, hashes, payloads, requirements, context and consumed authority are unchanged. PR193's possible VALIDATED exact-same-signed-block resend remains distinct from UNKNOWN versus ACKNOWLEDGED; no real resend occurs.
