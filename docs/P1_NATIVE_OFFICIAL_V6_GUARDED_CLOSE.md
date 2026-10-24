# Native official/V6 close-boundary connection

The opt-in source composition now connects the actual native HTTPS client,
actual official funding-POST original client and one existing guarded V6 SQLite
root. The close guard is checked at the actual store-close boundary, not merely
before starting an asynchronous child close. This is SOURCE AND SYNTAX ONLY
for the effectful graph. Twenty-one DATA component cases passed separately.

## Actual source connection and unchanged defaults

The new `openNativeOfficialV6FundingPostOriginalPaymentClient` hardwires the
native transport and `openOfficialV6GuardedFundingPostOriginalPaymentClient`.
That official client hardwires
`openServiceCreditCustodiedSqliteHttpClientV6WithNativeCloseGuard`.
The latter reuses the actual V6 opener, V5 HTTP child and original module slot;
it does not inject a fake DB, SDK or native request implementation.

The native factory accepts four closed groups: payerOptions, originalPayment,
official and transportOptions. Payer options contain the existing DB/allowed
root, funding resource, custody policy, selected grant and deadline. The caller
cannot supply requestImpl, a native close guard or component factories through
this enclosing factory. Original serialized checkpoint and external independent
pins are still required. Origin, POST /funding checkpoint and same-origin
/service-credit/v1/execute must agree. Native concurrency is one; request counts
and deadlines cannot exceed the captured custody/deadline constraints.
The cooperative close budget is between one and 1000 milliseconds.

Opening is an existing-V6 open that may advance owner_epoch, NOT readOnly mode,
missing-file creation, migration or adoption. Construction opens no socket.
The POST profile is for restoring the original checkpoint, not another funding
sender: `fundingPostTransport` remains NOT_PROVIDED. Only explicit
submitOriginal uses native HTTPS for service-credit execution with the existing
selected grant, original proof, intent and quarantine checks. No BOUND/receipt
or restored header activates a grant or establishes delivery/current authority.

The legacy V2-V6 root exports and GET/plain funding-POST official selections
keep their previous close selection and public shape in source. Their shared
effectful modules changed and were not runtime regression-tested in this round.
Default buyer/planner/signer/transport selection remains unchanged.

## Close order and the actual SQL entry fence

1. Cache the public close Promise and revoke wrapper admission before callbacks.
   Request actual native close immediately, even if observing the join refuses.
2. The existing bounded read-close coordinator joins native close and the
   current operation. Native close must fulfill its actual CLOSED contract and
   a fresh snapshot must show zero owned requests/sockets/timers, no uncertainty
   and returned local-material release. A stale fulfilled Promise is insufficient.
3. Only then can the actual official/V6 child close start. After its own awaits,
   the V6 root invokes the synchronous native-guarded boundary. Its PRIVATE
   guard freshly rechecks both the same cooperative join budget and actual
   native close view, immediately BEFORE captured actual store.close.
4. The same guard runs immediately AFTER the expected synchronous void return.
   Only a clean boundary can release that root's module slot. There is no
   automatic force-close, second entry, reset or reopen.

An earlier permit is not a lease across awaits. If native state changes while
a child is awaited, or the budget has ended, the boundary refuses store entry.
A refused native join can also prevent official close from starting at all:
the DB may remain OPEN with its module slot occupied. The wrapper reports
CLOSE_UNKNOWN; it does not pretend the underlying root already reached HELD.

If the guard refuses before store entry, attempts remain zero and the root slot
is retained. If store.close throws or returns a non-void value, the one entry is
recorded with unknown return and is never retried. resourceCloseReturned means
the expected VOID contract returned, not that any arbitrary value was accepted.
If the post-guard refuses after a void return, that returned close remains
recorded: the CLOSED slot is quarantined, NOT relabeled as an open database.
A later view cannot undo the returned close or rewrite historical settlement.

During unpublished construction cleanup only, the source-owned guard may allow
closing a DB while its private native owner is provably unused: zero starts,
zero owned counts/timers and no uncertainty, or the same unused owner already
cleanly closed. A hidden actual-root acquisition hold is propagated as
construction_close_unknown; it is never reopened or silently downgraded to a
clean configuration failure.

Late public SDK/service completions cannot emit a restored header or application
success after wrapper close. Business-operation outcome remains separate from
resource close. A later native error can downgrade the current snapshot even
after a historically fulfilled close Promise; there is no new Promise or retry.
These source-level checks are not an OS/network sandbox or physical-drain proof.

## Selected evidence and exact limits

The new `native-guarded-store-close.behavior.draft.mjs` entry ran ONCE using
pinned Node 24.19.0 on darwin-arm64: 21 passed, zero failures/skips/cancellations/
todo, complete captured output and empty stderr. Six exact input identities and
hashes were checked before and after. No temporary qualification files, managed
storage roots/tasks, dependencies, keys, sockets, SDK, SQL or signing were used.

Eighteen cases cover strict before/after guards, void-return semantics, reentry,
no retry, immutable snapshots and descriptor/proxy/arity refusals. Three compose
the ACTUAL boundary and ACTUAL bounded/read-close/drain modules with declared
in-memory callbacks. Real Node timers exercise the existing cooperative budget.
The clean order passes; changed native DATA during a child await and an expired
budget both veto the later declared resource-close callback. These declared
callbacks are NOT native TLS handles or real SQL close proof.

The actual SQLite root, official client and new native wrapper each passed
node --check without importing their graphs. Four syntax commands were used:
the wrapper was checked again after a source-review correction to its close
refusal path. Both syntax input versions are retained in the result. This is
not execution of the real TLS/SDK/SQLite graph or a full current-suite result.

See qualification/native-guarded-store-close.actual-local-result.json for exact
source, case and stream pins. Earlier component/TLS results remain unchanged and
are not requalified by this run.

## Publication and next gate

Seven exact files are selected for the source branch. Only the tested pure
boundary, component entry, result and this document are selected for main.
The changed actual SQLite root, official client and new native wrapper remain
OFF main. Main's effectful blobs are preserved; no current full native behavior
or default activation is claimed. No hosted workflow was dispatched and no
current-head CI pass is inferred from absent checks/statuses/runs.

The pending full native DP profile remains frozen at SHA-256
`a472e3bcd8840ef4236e395cb918ae5f2a84be9ca45d8f59417c0b77da291933`.
None of this new guarded native/official/V6 graph is in that selection.
Its pending permission is NOT expanded or treated as approval for this graph.
Old consumed TLS/SDK/SQL allowances are not reused. Existing storage refusals,
protected data, failed evidence and unrelated work remain untouched.

Remaining integration: explicit clean original-funding-owner handoff, same-file
existing-V6 open with independent retained originals/pins, actual official POST
restoration and selected-grant service execution/reconciliation under a
separately admitted exact runtime graph. HELD owners cannot be force-closed or
reopened to satisfy that flow. Full P0/P1/P2 and production remain NOT_COMPLETE.

