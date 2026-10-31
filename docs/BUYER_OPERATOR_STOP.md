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

During command processing, it synchronously enters the same accepted session's
cached close before rejecting the host observation. That session revokes command
admission before its child callbacks, so an already-queued READ continuation
cannot admit another command after the stop returns. The original finally joins
that same close and the remaining key/input stops. No unreturned owner is closed.

The parent close-observation window starts before that first session callback.
Finally uses only its remaining time, rounded up to whole milliseconds, and does
not arm a new timer when the window is exhausted. Clock refusal remains UNKNOWN
while the known session/key/input stops are still requested once. This is a
cooperative observation bound, not an OS deadline or cancellation guarantee.

The underlying host receipt remains observed and retained. Interrupted work
returns CLOSE_UNKNOWN even if known owner closes are later observed. Late host
success/rejection cannot repair that verdict. A second stop never repeats a known
owner stop, extends its configured budget or authorizes a competing run.

The fixed ports and child owners retain responsibility for active work and
physical resources. Logical void close acknowledgements are not physical
release evidence. There is no forced file close, raw close after ownership
transfer, forced key erasure, reset, reopen, replacement funding, signing,
service retry, grant activation or second debit/execution introduced here.
The CLI grammar, bootstrap/close limits and output schema are unchanged.

The original stop-controller DATA cases use the coordinator and declared
operator/reference fixture. The additional command-admission cases compose the
actual command session, host and codecs with declared client/channel ports.
The existing component close monitor uses cooperative Node timers; parent clock
and timer ports remain declared DATA. No process signal or native launcher runs.

The unchanged previous source was observed separately: resolving a queued
prepare command and immediately stopping admitted one declared method after the
stop returned. This is a source-ordering observation, not an executed payment
or native vulnerability. Candidate controls require zero post-stop method entries
for prepare, commit, funding, handoff and service commands. They preserve ordinary
explicit admission when no stop is requested.

Native SDK/core/SQLite/HTTPS/FIFO, Linux, restart, physical release and G0-G5
acceptance remain OPEN. Source, DATA and hosted CI evidence remain separate.
