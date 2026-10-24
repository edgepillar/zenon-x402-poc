# P2 PREPARED-before-executor crash: full-source draft

## Current evidence, 2026-10-24

This is a second, distinct interruption point. It does not change or reuse the
pending [committed-case selection](P2_MANAGED_CRASH_PAIR_PROFILE_AND_LAUNCHER_DRAFT.md)
or its native allowance. All of that case's selected sources remain unchanged.

The new [protocol and tests](../qualification/recovery-crash-prepared-cutpoint.behavior.mjs)
passed **36 DATA cases**, with 107 invalid-event refusals and zero caller hooks.
Eight cases invoke the actual pure
[execution contract](../src/service-credit-execution-contract.js), using
DECLARED request/clock data. They prove those pure state transitions, not a
native ledger, actual provider/grant acceptance, process death or SQLite reopen.

The prepared [child](../qualification/recovery-crash-prepared-intent.child.draft.mjs),
[grant fixture](../qualification/issued-funding-post-native-prepared-crash-grant-operator.fixture.draft.mjs),
[namespace preloader](../qualification/recovery-crash-prepared-namespace.preload.draft.mjs)
and [owned parent](../qualification/recovery-crash-prepared-supervisor.draft.mjs)
passed syntax-only checks. They were not imported or run.
See the [source-bound result](../qualification/recovery-crash-prepared.actual-local-result.json)
and [full source inventory](../qualification/recovery-crash-prepared-full-graph.source-inputs.json).

## The real prepare boundary is not committed success

The existing store's prepareDurableExecution operation reserves the request,
begins execution in the ledger, creates the durable execution and persists
the compound envelope before native COMMIT and its afterCommit hook.

At that cutpoint the ledger request is EXECUTING, while its durable execution
is PREPARED with terminal classification NONE. Two units are HELD, zero are
consumed, and eight remain available. The invocation fence and executor call
have not happened. The source does not rename this state into SUCCEEDED,
an unused grant, a one-unit example, NOT_INVOKED or a refund.

The actual execution owner returns from prepare before it can persist the
MAY_HAVE_STARTED fence. Only the later fenced state enters the executor path.
The new child therefore waits in the existing store's afterCommit hook for
prepareDurableExecution, with no store-method replacement or same-store reentry.
Separate read-only native SQLite handles inspect the real committed envelope.
If the executor is called instead of the selected interruption, the fixture
immediately fails rather than returning a fabricated successful action.

The full issued HTTPS/x402/DP/V6 funding and selected-grant application is
retained. Funding originals are fixed before submission; the service original
and proof are fixed before dispatch. At the selected cutpoint the original
owners remain OPEN, then one exact owned SIGKILL and complete exit/EOF/IPC
observations must precede one distinct recovery process.

These are source assertions, not observations from a native run.

## Passive recovery must not release the held credit

The existing ServiceCreditSqliteStore.openExisting validates and reads its
envelope; it does not invoke recoverDurableExecutions. The existing backend
outcome reader maps terminal NONE to RECONCILIATION_REQUIRED.

The new recovery source uses that actual passive V6/backend reader on the same
principal files. It requires the backend envelope and PREPARED/NONE record
unchanged, along with the exact original checkpoint/request/intent, no response
observation, one payer owner_epoch increment and persisted custody UNKNOWN.
Its backend afterCommit observer rejects changed transactions and the
recoverDurableExecutions operation. It neither dispatches again, signs again,
finalizes execution nor releases the two held units.

Payer CHILD_UNKNOWN remains UNKNOWN even if its one SQLite close returned.
Backend absence/success or a local read is not delivery, action authority or
permission to reconcile money.

The pure contract's explicit recovery function can compute a DIFFERENT
NOT_INVOKED/RECOVERY_PREPARED candidate for a PREPARED execution. The tests
demonstrate that the original state stays unchanged. This does not call the
native store mutator, release a real hold or authorize a passive reader to apply
that candidate. MAY_HAVE_STARTED recovery is a separate UNKNOWN/SEALED branch
and cannot satisfy this prepared cutpoint.

## Full graph and remaining qualification

The physically matched inventory contains 130 application and all 404 package
files: 4,711,970 source bytes read in place, without a copied application/SDK
tree or qualification scratch. All 117 baseline V3 application rows and all
404 baseline package rows are mandatory and unchanged. The 128 JavaScript-file
literal scan found 600 import occurrences with no unresolved literal edge;
that static superset is not runtime resolution proof.

Prepared mode has its own child, operator guard, namespace kind, protocol
version and parent. It does not alias actual SQLite, normalize event values to
fit the committed protocol, clear HELD/UNKNOWN, or silently broaden an existing
native selection. The parent has no CLI/autostart entry.

The dedicated managed prepared launcher/profile builder still needs completion
and source review. The existing committed-case launcher cannot execute this
other scope. Only after that work may a separately scoped finite native attempt
be considered; none is requested, granted or consumed by this DATA result.

Main, hosted CI, default runtime/signer, prior results and storage roots were
not changed. Full P2, native crash/reopen/cleanup, power-loss durability,
authenticated chain/provider evidence, delivery, live pilot and production
remain unqualified.

