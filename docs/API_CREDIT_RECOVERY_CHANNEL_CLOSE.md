# Observe the same recovery channel close after timer retirement

The five keyless recovery modes share the actual recovery-inspection
coordinator. This change tightens that coordinator's channel-close verdict;
it creates no new mode, payment command or authority.

One absolute 1000 ms observation window now starts before retirement of the
startup timer. That retirement's latency consumes the same close window.
The coordinator requests the same known channel's close once. If the close
remains pending, only the remaining window is armed; no callback renews it.

A clean result requires a genuine native Promise with a void close result,
fresh CLOSED/unheld/not-reading/not-writing views, monotonic time within the
same window, and synchronous void timer-cancel receipts. Closed views and
time are rechecked around close-timer cancellation and again after awaiting
the close observer. A queued state change between observer settlement and
the parent continuation therefore cannot become a CLOSED coordinator result.

Cancellation may reenter the expiry callback. The finish latch records that
failure before publishing any clean verdict; no provisional CLOSED result
escapes. If expiry fires during timer construction, the returned known handle
is retired exactly once after construction returns. A missing, opaque or
Promise-shaped timer handle is retained as uncertainty rather than passed to
an unrelated cleanup operation. Opaque cancellation results are retained;
only genuine native Promise rejections are safely observed, without thenable
assimilation or a cancellation retry.

A late close result cannot change the returned UNKNOWN, repeat output,
request another close or inspect the retired channel. An unobserved timer or
close remains in the existing bounded FAILED owner set; its sixteen-frame
limit is unchanged. A known malformed profile still produces bootstrap
refusal when that same channel's shutdown is clean. Output already attempted
before final shutdown cannot be retracted. Query result observation, channel
close, store release and actual service delivery remain separate facts.

The source candidate preserves the original query/output grammars, NONE
history authority, unchanged spending reservations and the existing native
port selection. CLI help now describes both ready grant-profile version one
and explicit existing-custody version two; neither admits a key or resend.

The DATA entry uses actual profile/output codecs and coordinator with declared
clock, timer, query and FIFO ports. It covers known close, cancellation latency,
nonvoid/throwing/Promise cancellation, state changes, clock expiry/regression,
reentry, opaque handles, late close and the post-await gap. Current-main
counterexamples and their failed command evidence are preserved separately.
The hosted 108-control profile is unchanged and does not include the new DATA
entry. No native FIFO, SQL, SDK/core package, TLS/socket, key/signature, nonce,
PREPARE, payment or fresh process is run. Native RL-LATE-CLOSE, NATIVE-RELEASE,
Linux and G1/G2 acceptance remain OPEN. These observations are neither OS
preemption nor a physical-release guarantee.
