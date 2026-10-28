# Original-payment funding and liability application

`createPurchasedOrderApplicationCore` composes the actual funding application,
grant-free liability owner and both fenced storage ports. Startup retains the
original funding checkpoint and the unfunded liability record before verification
can begin. A verified result is returned only after the exact funding receipt is
also acknowledged by the liability journal. This adds the missing application
connection between the previously separate funding and delivery records.

The stores do not form an atomic distributed transaction. Funding commits first.
If the liability write fails or its acknowledgement is lost, the application is
HELD and does not report funded success. It never rolls back verified funding,
discards a possible liability write, resends a payment or refreshes ownership
automatically. Explicit new-epoch startup can recover the same verified receipt
and copy it to an unfunded journal without another authentication. If the copy
was already committed, startup keeps its exact bytes. Partial startup is retained
for recovery rather than converted into cleanup or inferred nonpayment.

The selection contains the original funding selection and separate fulfillment
store/owner/expected-envelope values. The store IDs and backend capability objects
must differ. This rejects an accidental capability reuse; it does not prove that
two native connections or files are physically distinct. Native launchers and
operators remain responsible for those identities, quotas and provenance.

The application exposes the actual liability owner's delivery and compensation
methods. They retain all original-request, quantity, witness and ambiguity rules.
The outstanding quantity in the paired view follows the delivery/compensation
record; verified funding alone is not a service-delivery observation. Views stay
cached observations and provide no signing, dispatch, grant or payout authority.

`exportRecoveryRecord()` captures both selected envelopes and the original
independent purchase inputs. It explicitly reports `snapshotAtomicAcrossStores:
false`. Protect its digest separately before using
`purchasedOrderApplicationSelectionFromRecovery()`, and explicitly select both new
owner IDs. The outer digest is checked before parsing. Inconsistent snapshots are
refused. A concurrent ownership change causes the exact subsequent claim to fail;
the application does not retry or silently read a newer envelope to take over.
The new recovery profile does not replace the older funding-only record format.

Close first revokes liability access and requests the actual bounded funding
close. A late success cannot create a liability copy or repair a rejected close.
Borrowed backends and native database handles are never closed here. Logical
backend retirement eligibility is separate from physical release. Deadline ports
are cooperative; they cannot preempt an arbitrary synchronous backend callback.

`createPurchasedOrderHttpApplicationCore` fixes this real composition under the
existing strict original-payment POST admission and response writer. It keeps
the existing `202 BOUND` wire frame without x402 protocol response headers. BOUND
now follows both acknowledged records. A lost response can be replayed on the
same original request without another verifier call or journal write. Missing or
foreign original-payment bytes remain rejected before either store is touched.

The [selected composition cases](../qualification/service-purchase-order-application.behavior.mjs)
run the actual application, HTTP writer/admission, owners, codecs, fenced ports
and deadline core with synthetic backend I/O, authenticators, timer actuators and
responses. No real SQLite, TLS, socket, SDK, key, signature, nonce, grant, service
execution or payout is run. Default application wiring and existing native graphs
are unchanged. Native two-store HTTP integration, physical release, full P1/P2,
economic pilot and production acceptance remain open. The declined native trial
is not repeated.
