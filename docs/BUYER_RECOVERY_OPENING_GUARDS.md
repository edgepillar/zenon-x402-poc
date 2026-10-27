# Recovery admission after deferred module loading

The actual recovery pipe coordinator now gives each trusted opener a frozen
`requireCurrentAcquisition()` check. The fixed native binding checks it before
and after each asynchronous module load and before acquiring a backend store
or native original-only payer. This prevents a deferred callback from starting
a new native acquisition after its original opening budget has expired.

## Reproduced failure and resulting behavior

Before the fix, the actual coordinator could return `CLOSE_UNKNOWN` and close
its owned pipes while an async opener was still loading a module. When loading
finished, the callback could start a new acquisition. The coordinator would only
observe and stop the returned late owner afterwards. That was too late to
prevent a new store open or owner-epoch write.

The unchanged regression source reproduced one declared payer acquisition after
the old host returned. With the fix it observes zero such acquisitions, and the
original unknown result remains unchanged. The regression executes real
anonymous pipe ownership, bootstrap, coordinator and close code; its native
constructors are declared callbacks, with no SDK, SQLite or IP connection.

## One original budget and one current leg

The trusted callback contract is now
`openNativeClient(bootstrap, requireCurrentAcquisition)` and, when selected,
`openBackend(bootstrap, requireCurrentAcquisition)`. The second argument is an
operational closure created by the coordinator. It cannot be selected through
bootstrap JSON, argv, a module path or a factory field.

The check accepts zero arguments and requires the original acquisition to be
pending, its monotonic deadline to remain live, its actual channel to remain
open and idle, and its own leg to be current and not already accepted. A backend
guard cannot admit payer acquisition. A guard retained after return, refusal or
transfer cannot admit another constructor. Multiple valid checks within the
same pending leg do not restart or extend the deadline.

Trusted bindings must call the check after each await and before each new
resource acquisition. Older callbacks which ignore the extra argument retain
their previous late-result observation/stop behavior; ignoring the check does
not obtain the new pre-acquisition protection. This is a cooperative binding
contract, not enforcement against hostile code.

The fixed backend binding checks again after synchronous store opening and
reader construction. If those steps consumed the budget, its existing failure
path retains/fences known owners and attempts its original one-time store stop.
The payer binding checks after its fixed module import and before calling the
actual native entry. Its temporary CA copy remains independently owned.

Already-entered imports or native work are not cancelled. The original opening
receipt, any returned late owner and one-call stop observations remain retained.
An unknown result never becomes clean because a later callback settles. The
guard does not clear a key, reopen a payer, replay funding/service, change an
owner epoch itself or prove physical native release.

## Validation and publication boundary

The [actual local result](../qualification/buyer-recovery-opening-guard.actual-local-result.json)
records eight new cases plus all 62 existing pipe cases passing at the current
source, in about 9.47 seconds. Cases cover deferred payer/backend loading,
expiry after a returned backend, synchronous event-loop delay, successful
transfer, stale/cross-leg guard refusal and invalid guard arguments. In the eight
new guard cases, owned descriptors close, standard descriptors remain unchanged,
timers are cancelled, and no restore, service, recovery read or backend query is
dispatched. The 62 existing cases retain their separately selected operations.

Main receives the tested coordinator, explicit guard runner/control, result and
this document. The actual native binding update remains source-only on
development. It was parsed and reviewed, without evaluating installed packages,
opening SQLite or running a native application. The unchanged 108-control hosted
profile does not contain these 70 controls. Historical results and manifests are
preserved rather than relabeled with the new coordinator hash.

This fixes a P2 startup admission gap. Full current native interruption,
lost-ACK/HELD-store recovery, owner-epoch behavior, physical resource release,
economic acceptance and production qualification still require their own
source-bound evidence. The separate SDK105 issued-command candidate and its
finite native authority are not extended by these builtin controls.
