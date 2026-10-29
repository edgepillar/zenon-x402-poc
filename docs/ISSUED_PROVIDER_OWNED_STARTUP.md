# Owned provider startup source candidate

`createOwnedIssuedFundingGrantNativeApplication(configuration)` adds store
ownership around the SAME existing issued funding/grant provider. Its creation
captures structural configuration and private TLS byte copies without opening
files, entering a supplied callback, initializing an SDK or starting a listener.
An explicit `start()` opens the selected store pair and then starts that provider.
This is source-only integration; native execution and Linux acceptance are OPEN.

The intended source call sequence is creation, `await application.start()`,
explicit local operator methods as needed, then `await application.close()`.
This module is an API for the supported command bootstrap being assembled; it is
not a completed Linux CLI, verified install recipe or native acceptance command.

## One explicit selection

Configuration requires exactly `applicationMode`, `serviceStore`, `intakeStore`,
`offer`, `funding`, `service`, `transport`, `recovery` and `observation`.
There is no default mode, automatic recovery or fallback after opening failure.

| Application mode | Store acquisition | Existing provider factory |
| --- | --- | --- |
| FRESH | Two new exclusive files; register the selected public offer only | `createIssuedFundingGrantNativeApplication` |
| RECORDED | Existing official-custody intake and service files; compare the exact offer | `restoreIssuedFundingGrantNativeApplication` |
| JOURNAL | Same existing files and separately borrowed original journal | `restoreIssuedFundingGrantNativeJournalRecovery` |
| WITNESSED | Same existing files, borrowed journal and independent witness | `restoreIssuedFundingGrantNativeWitnessedJournalRecovery` |

Fresh mode requires null recovery/observation. Recorded modes require independently
selected complete BOUND/outcome pins; only journal modes accept the corresponding
borrowed journal/witness. Existing state is never registered, migrated, adopted,
reset or replaced. A missing/mismatched offer fails rather than being refreshed.
No grant is activated by startup or by registering the public offer.

Both database paths must be absolute, canonical, distinct and direct children
of their declared private roots. Existing store implementations retain their
real identity, private-directory, link, schema, transaction and capacity checks.
All store limits are explicit: one offer, one grant and 100..10000 request slots,
a bounded state envelope and busy timeout. One supplied frozen clock capability
is shared by funding and service storage. No default clock or pricing callback
is synthesized for the operational stores. Offer normalization uses the existing
pure model with inert local capabilities; it grants no funding authority.

Structural capture checks all property descriptors, selection, bounds, route,
mode/pins and callback shapes before acquisition. It does not authenticate the
authority record, TLS PEM, facilitator, funding evidence or service proof. Actual
provider/store validation remains required. TLS input is copied independently
with a 65536-byte bound per buffer. The caller's original buffers remain its own.
Owned copies are cleared only on known release or inert construction refusal;
unknown acquired ownership retains them with its other state.

## Ordered ownership

A process-local lease claims both canonical database paths before the first
store opener. A conflicting known lease returns REFUSED without opening either
store. At most 16 active/held native owner frames can claim paths. These keys do
not prove physical identity aliasing or cross-process stale-owner exclusion.

The fixed native adapter creates/opens the actual service store, creates/opens
the actual official-custody intake, then binds those exact instances into the
same provider. It captures the actual prototype closers; callers cannot supply
another application's root, store closers, file opener or CLOSED flag. Private
store handles are not exported by the new owner. The embedded providers retain
their existing borrowed-store contract for other callers.

Successful start requires the actual `LISTENING` receipt and a consistent root
view. Repeated start observations share the one opening receipt. Operator methods
are selected by mode, preserve their argument contracts and are fenced before
close. At most 128 operator entries and 64 simultaneous operator operations are
admitted per owner; metered HTTP requests use the provider's own separate limits.
No HTTP route, automatic activation or funding retry is added.

Close fences this owner first and shares a single same-provider close receipt.
Before SQL close it requires void close fulfillment, CLOSED/revoked admission,
zero active/opening funding/service work, completed child closes, clean ingress
and zero tracked sockets, requests, handlers and timers. The intake store closes
before the service store. Only synchronous void store acknowledgements permit
local lease/TLS release. A failed intake close never advances to service close;
a failed service close never releases the lease. Close is cached, never retried.

A partial store open, opaque/provider-open result, listen uncertainty, active
operator cancellation, unknown close/readback or late root retains HELD and its
lease/resources. A late valid provider is asked to close once; its arrival does
not repair the earlier unknown start or authorize SQL release. There is no forced
close, new store pair, automatic reopen, deletion or cleanup of historical data.
A known pre-acquisition refusal or close before start releases only inert state.

## Evidence boundary

DATA composes the actual configuration/ownership code with declared memory
store/root/listener/release ports. A separate composition uses the actual
recorded controller and reference ledger, with declared LISTENING/ingress and
store ownership ports. Its 100 requests and exact replay are model correctness,
not native SQL/HTTPS, process restart, proof authentication or a capacity claim.
No operational key, signature, nonce, SDK PREPARE or payment is produced.

The source adapter imports the real store and provider factories but is not
executed by these DATA controls. Native file/SQL lifetime, cryptography, release,
concurrent/restart spending and delivery liability, stale-worker fencing, Linux
bootstrap/installation and full G0-G5 acceptance remain OPEN. Journal, witness,
observer and facilitator capabilities are borrowed; their acquisition/owner
lifetime still belongs to the complete command bootstrap work. A logical close
acknowledgement is not OS-level physical-release evidence.
