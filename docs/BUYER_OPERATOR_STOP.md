# Stop the same buyer operator

The buyer source candidate connects SIGINT/SIGTERM to the same operator's
opening and closing state. The fixed launcher subscribes before adopting its
four explicit descriptors and removes only its own two handlers. A failed
subscription or removal cannot produce a clean launcher result. This wiring
has not been executed as a native signal/FIFO/SDK test.

`createApiCreditOperatorCoordinator(configuration)` captures the existing
argument/port contract without calling a port. It returns frozen `run()` and
`requestStop()` methods. `run()` caches its original promise before callback
entry, so repeated or reentrant calls cannot open another run. The existing
`runApiCreditOperatorCoordinator(configuration)` remains the immediate entry
for existing callers.

`requestStop()` is a synchronous, sticky revocation, not a release receipt.
Before run, it prevents profile, credential, key and session acquisition. The
subsequent run only enters the original input owner's bounded close path and
can report BOOTSTRAP_REFUSED if those known stops succeed. No new command or
default profile is generated.

During an entered opening, it rejects the current stage's observation and
revokes its stage guard. Late profile/credential bytes use the existing wipe
path; late known key/session owners use their original one-shot stop. Unknown
ownership remains retained. The stop does not adopt a late receipt as a fresh
opening or return another key, session or payment permission.

During command processing, it unblocks the coordinator's wait for the same
host and enters its existing bounded finally/close path. The underlying host
receipt remains observed and retained. This does not cancel its economic
effect, prove its termination or permit a competing run. Interrupted work
returns CLOSE_UNKNOWN even if known owner closes are later observed. Late
host success/rejection cannot repair that verdict. A second stop never repeats
the known session/key/input stops or extends their configured budget.

The fixed ports and child owners retain responsibility for active work and
physical resources. Logical void close acknowledgements are not physical
release evidence. There is no forced file close, raw close after ownership
transfer, forced key erasure, reset, reopen, replacement funding, signing,
service retry, grant activation or second debit/execution introduced here.
The CLI grammar, bootstrap/close limits and output schema are unchanged.

The new DATA cases use the actual coordinator and the existing declared
operator/reference fixture. They call a memory stop method and declared timer
callbacks; they do not send process signals or run the native launcher. Native
SDK/core/SQLite/HTTPS/FIFO, Linux, restart, physical release and G0-G5 acceptance
remain OPEN. Source and DATA evidence must be reported separately.
