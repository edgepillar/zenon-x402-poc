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
