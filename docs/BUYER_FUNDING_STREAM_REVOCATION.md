# Funding opening observes immediate stream revocation

The actual owned-stream funding opener now checks current Node stream state as
well as its command channel observation. This closes the interval between a
synchronous stream `destroy()`/`end()` and the later close/end event delivered to
the channel. A channel snapshot can still say OPEN during that interval.

The unchanged regression source reproduced the old behavior: an input destroy
was followed by one declared native acquisition and a transferred session.
Cleanup afterwards did not undo that unwanted acquisition. The current source
refuses before acquisition and does not transfer the session. Equivalent output
destroy and output-end controls pass too. These execute the actual Node stream,
SDK105 wallet/lifecycle owner and command session with declared native/key
callbacks, not installed SDK code or real cryptographic signing.

The same current-resource check runs before the trusted opener, in its frozen
opening guard, when its original receipt returns, after client inspection and
after session construction. A trusted opener must still check its guard after
each await and before acquisition. Work already entered by an opener which
ignores that contract cannot be cancelled; its returned owner is stopped once
through the existing original-receipt retention path.

The single monotonic opening budget now starts before synchronous channel
reservation/setup, after inert configuration capture. A second unchanged
regression reproduced a channel pause callback consuming the budget while the
old opener subsequently started native acquisition. The current source refuses
before invoking the opener. Synchronous code remains cooperative: this is not a
CPU deadline, cancellation primitive or OS sandbox.

The [actual local result](../qualification/buyer-funding-stream-revocation.actual-local-result.json)
records ten new revocation/setup controls and all 31 existing funding opening
controls at the changed current source, in about 1.72 seconds. The existing
cases include explicit command-driven prepare/commit/funding/handoff/service
lifecycle checks, using fixed invalid signature DATA and declared signer/native
callbacks. No installed SDK/x402/Noble package, SQLite, socket, generated key,
cryptographic signature, nonce search or managed scratch ran. Physical native
release, actual service delivery, economic acceptance and production remain
unqualified. The unchanged hosted 108-control profile does not include these
41 controls.

The SDK105 P1 native source selection has a separate V2 candidate for this
funding source. V1 manifests, entry sources and old results are preserved; their
source-bound evidence is not relabeled as V2 qualification. Native permissions
are not transferred. Main receives this tested funding patch and its builtin
controls/result/document; V2 native qualification sources stay on development.
