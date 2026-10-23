# Actual original-funding application fixture: source-only

Status: AUTHORED / NOT PARSED, IMPORTED OR EXECUTED.

The new entry targets the actual original-funding submission composition,
preparation owner, native payer store, payer-recovery owner and funding POST-v1
client. It does not replace a store, preflight, SDK, preparer or client factory.
Its wallet uses a newly generated synthetic key and the real selected Ed25519
implementation. Account/DP reads and the three fetch callbacks are synthetic.
There is no RPC/socket/HTTP/HTTPS connection, real wallet, chain PREPARE, payment
publication, funding attestation, grant, provider or delivered service here.

The shared fixture module holds common synthetic data once rather than copying
it into each case. Per-case descriptions/tags bind seven distinct transaction
hashes through the real payment-intent path, despite the shared synthetic key.
Fixed Momentum/chain observations are declared test DATA, not authenticated
chain evidence. Work difficulty is zero and nonce material is fixed; positive
PoW with changing price/horizon remains a different acceptance gate.

## Eight authored cases, zero executed cases

1. Capture the original context immediately at the actual public call, mutate
   caller input before the first await, and require the old checkpoint bytes.
   Check duplicate operation/owner refusal, actual V6 commit with independent
   pins, wrong-pin refusal before submission, one real client invocation and
   intake-only BOUND at revision 3. Close/reopen must preserve the original.
2. Reject the synthetic transport response after its one original POST entry.
   Require native OUTCOME_UNKNOWN, no new signature/reads/replay, and unchanged
   old uncertainty after normal close/reopen.
3. Throw from the actual native store's after-commit hook. The original packet
   remains inspectable, zero funding POSTs occur, and normal reopen can inspect
   the committed PREPARED record without rewriting the old owner's uncertainty.
4. Create a deliberate attempt-fence conflict using the actual native store in
   a new fixture. Submission must refuse before transport, rather than learn
   new originals, reset the record or automatically recover/send.
5. Call close reentrantly inside the actual recoverAfterRestart transaction
   hook. The wrapper must already expose its pending operation, await rather
   than close the store early, and refuse later submission entry.
6. Hold the synthetic transport Promise across the real client's deadline.
   Public UNKNOWN must not imply drain; close must remain pending until the
   fixture explicitly releases a late BOUND response. That late DATA must not
   promote the old operation or native OUTCOME_UNKNOWN record to success.
7. Supply a genuine V5 negative fixture. V6 is a caller precondition, not a
   factory-time schema check: a signature can already exist before checkpoint
   commit refuses. Preserve it, send nothing and expose no replacement retry.
8. Refuse proxy/wrong-brand/shadowed stores and missing/proxy fetch capabilities
   without wallet/transport effects. Check proxy traps remain untouched.

Assertions inside hooks and fetch callbacks are retained separately and checked
outside the callback. An assertion mapped to a generic UNKNOWN must not make a
negative test falsely pass. Checkpoint assertions use the actual nested
inspection/codec contracts. These are source design properties, not executed
test results.

## Intended effects and bounds

One future direct Node entry would register all eight cases in one process,
without a test-runner child, worker, install or separate SDK preparation call.
Cases use explicitly awaited top-level test calls; see the
[Node 24.19.0 test API](https://nodejs.org/download/release/v24.19.0/docs/api/test.html#testname-options-fn).
A future launcher must select the direct entry, not test-file discovery/forking.
The declaration is eight new private SQLite files (seven V6, one V5), seven
separate independent-pin JSON files, one new in-memory Ed25519 key and seven
synthetic transaction signatures. The signature counter also requires seven
distinct original hashes. Key overwrite is best effort on normal termination,
not secure erasure or crash cleanup.

Declared callback ceilings are seven address reads, 105 account-read exchanges,
420 DP-read exchanges, seven material handoffs and three synthetic fetch calls.
One commit-loss hook, one recovery-close hook and one held-transport release
are expected. These counters are NOT actual results, physical allocation caps,
an OS/network sandbox, a timeout guarantee or proof of hostile-code confinement.

The entry requires its root argument to equal the manager's owned scratch
environment and refuses any existing fixture file. Pin files are new exclusive
0600 files, fsynced and independently reopened with no-follow and bounded reads,
with physical identities checked around the read. Expectations are never
learned from the database. File fsync and normal reopen do not prove power-loss
durability or physical resource reclamation.

## Execution and publication boundaries

This larger fixture is NOT covered by the earlier two-case preparation entry,
its pinned namespace/preload, historical results or consumed HTTPS approval.
The earlier loader pins a different exact entry and must not be weakened to
accept this file. Existing SDK/package provenance, full actual import graph,
namespace, launcher, output capacity and matching execution scope must be
reviewed afresh before any command. Current-main/clean-owner claims also require
reconciliation of any different-ref inputs; selected source pins are not a full
native dependency qualification.

No storage task, SQLite file, key, signature, fetch or Node command was created
or executed while authoring this source packet. The existing private-root
policy, quota, task/object limits and free-space floor are unchanged. Eight
databases and capture streams have NOT been shown to fit a future task quota;
perform the actual capacity/admission review rather than silently increasing a
limit, using a home-cache fallback or dropping difficult cases.

The fixture never deletes its raw outputs. Child-created SQLite/pin files may
leave cleanup HOLD after a future task closes; preserve identities, actual exit
and failure streams honestly. Do not retrofit the manager, adopt history,
repeat the experiment to repair metadata or report HOLD as scratch removal.

Even a successful future run could qualify only these selected synthetic
application cases. It would not establish native HTTPS/socket release, forced
termination, power loss, official x402/one-grant service integration, current
hosted CI, chain publication/inclusion, economic authority or a live pilot.
