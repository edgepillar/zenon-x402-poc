# Durable purchased terms and original requests

The purchase store retains accepted canonical terms before an original request
can be attached. The first attached original fixes one exact payment checkpoint,
chain identity, service endpoint and grant for that order. Distinct request IDs
under the same payment/grant can be retained independently. Repeating the exact
same record is idempotent; changed terms, payment/context, grant or request cost
conflict with the retained original. One payment scope cannot belong to two
orders in this store.

The payment key includes network, chain identifier, genesis and transaction hash.
It is independent of order ID and price similarity. Storage capacity is explicit
and separate from purchased quantity, execution quotas or consumed service units.
This store does not verify funding, bill calls, activate grants, dispatch work,
sign, pay, deliver, expire orders or compensate. Those application integrations
remain separate. In particular, metadata presence is not payment verification.

`createNewServicePurchaseOriginalStore(database, limits)` creates the schema on a
dedicated empty `DatabaseSync` connection. `openExistingServicePurchaseOriginalStore`
requires the exact existing schema and the independently selected original limits.
The caller configures DELETE journaling, FULL-or-stronger synchronous mode,
in-memory temporary storage and foreign keys, with no extension loading, attached
database, temporary user objects or shared connection mutation. The wrapper opens
no path and never closes the borrowed native connection. Its owner must enforce
file identity/permissions, storage leases, quota and physical connection cleanup.

Operations are `retainTerms`, `retainOriginal`, `readTerms` and `readOriginal`.
Reads require independent terms/purchase/checkpoint pins rather than accepting
stored checksum fields as authority. Startup corruption checks may derive stored
checksum witnesses solely to validate metadata consistency; that path is explicitly
distinguished from independent pin admission.

Every operation takes BEGIN IMMEDIATE, including reads; this is not an
OS-read-only handle. Accepted terms and originals have no
delete/replace API. Binding the order and inserting the first original commit
together. Schema constraints and unique indexes preserve exact identities.
Startup performs bounded complete validation. Data/schema versions and
`total_changes()` detect commits from another connection or changes on the
borrowed handle; such changes cause validation again. Epochs are captured before
COMMIT while the write lock is held, so a commit in the unlock gap cannot become
an unchecked baseline. Stable reads query their selected row instead of decoding
the complete request history again. Connection durability settings are checked
each time because changing a PRAGMA need not increment those epochs.

A corruption, uncertain commit or failed rollback holds this wrapper unavailable.
Expected input/conflict/capacity refusals preserve prior records. Closing the
wrapper revokes its methods and does not close the native database. A successful
wrapper close is not physical release evidence. Same-user native code and the
dedicated SQLite connection remain trusted premises; checksums do not authenticate
against a consistent same-user rewrite or arbitrary out-of-band file modification.

The pure contract and native SQLite tests are separate entry points. The native
fixture selects two new synthetic database paths and one independent pin file,
then a second local Node process reopens those same files. It exercises immutable
terms, several originals per payment, duplicate funding refusal across connections,
capacity, cached validation, and preserved corruption. It uses no SDK, network,
key, signature, nonce search or real payment. These fixture sources do not by
themselves establish native execution, power-loss durability, buyer recovery,
economic liability, delivery or production acceptance.

The qualification host pre-creates all three empty files with task-storage,
records their independent identities, and gives only those owned paths to the
fixture. SQLite writes in place. After both processes terminate, the host can
preserve each registered output once in CAS instead of leaving unregistered
child output and a full-quota ownership hold. Failed or uncertain attempts retain
their honest outcome and original evidence; no historical cleanup is involved.

## Selected native SQLite qualification

The [second selected native trial passed](../qualification/service-purchase-original-sqlite-store.actual-local-result.json)
on Node 24.19.0 / darwin-arm64 with the exact twelve-file input graph. Its first
Node command passed thirteen write/retention/corruption cases using four native
SQLite connections. The second independent Node process passed two same-file
reopen cases using two further connections. Both commands exited 0; the three
retained files were byte-identical before and after the second process.
Two private synthetic databases and one independent pin file were used. SDK,
network, keys, signatures, nonce work, child Node processes and real payments
were absent. The qualification task closed SUCCESS and retained each output by
digest in CAS. No historical evidence was removed.

The first trial remains CLOSED/FAILURE. Its write program passed 13 cases and
exited 0, but the host mistakenly rejected the task manager's registered empty
command directory, so the separate reopen process did not start. The reviewed
host correction verifies exact registration, identity, owner, private mode and
emptiness; it does not accept unknown output or change the native source graph.
Twelve synthetic metadata-description checks cover that correction separately
from the fifteen native SQLite cases. Both finite trial slots are consumed.

This qualifies the selected original-purchase storage component and normal
same-file fresh-process reopen, including refusal of the preserved corrupt
fixture. It is not an application SIGKILL/power-loss test, authenticated funding,
service execution, signer recovery, physical release of the full application or
economic/production acceptance. The newer fulfillment CAS SQLite backend is a
different development-only source candidate and was not loaded or qualified.
Package defaults and the existing 108-control hosted selection remain unchanged.
