# Original observer selection before native activation file entry

The existing provider's explicit local `ACTIVATE` command previously passed
its syntactically valid observer filename and record key to the native opener
before the activation owner compared the selected evidence with the original
funding record. The later activation and evidence checks remain required.
This source change moves the original-identity comparison before file entry.
It is not a claim of an observed native failure or an economic exploit.

The funding POST application binding already retains the exact transaction
hash, observer filename and observer record key from its strict BOUND receipt.
Its new local selector accepts only that complete filename/key pair, after
the existing official state is SETTLED and before service-grant admission.
Pending BOUND, a different file, a different key or a matching amount cannot
select an observer. A known mismatching argument does not replace the retained
original or change the binding's state.

The fresh provider core exposes `selectOriginalActivationObserver` only while
its admission is open, no funding/query operation or opening is active, and
no service session has been admitted. Selection enters no callback, ledger
read, file opener, RPC, pricing, signer or grant activation. Restored cores
do not expose this capability. The actual provider store owner forwards the
fresh capability through its existing lifecycle, argument, synchronous-result
and operator-call limits.

The native operator uses the fixed `enterIssuedProviderOriginalObserver`
admission function. It admits descriptor-only command/port data, checks the
current guard, invokes the original selector, compares both exact tuple fields,
and checks the guard again before entering its one fixed opener. No caller
chooses a module, path, fallback opener or close method through this interface.
The native frame records entry before opening and retains its existing same-file
and same-record-key checks. The opener's return is forwarded untouched to that
frame; an opaque result is not inspected or normalized by the admission gate.
An opening failure causes no retry or second acquisition.

Selection is a local pre-opening comparison. It does not authenticate the
observer, chain, inclusion, finality or provider authority. Actual activation
still validates the original bound row, current provider state, observer,
authority and funding evidence before committing and admitting a grant. HTTP,
funding ACK and historical reads cannot invoke activation or gain this local
capability. No reservation, payment or delivery obligation is released.

Qualification uses the actual pure binding, provider core, store owner and
admission function with declared memory ports. It covers same-original
selection, no-entry refusals, guards, descriptor/proxy rejection, lifecycle
barriers, unchanged ledger state and opaque returns. Parser checks do not
evaluate the native operator or installed dependencies. Native SDK/core,
SQLite, HTTPS, keys/signatures and Linux execution remain unexecuted under the
current user decision; physical release and G1/G2 acceptance remain unproven.

The Linux acceptance harness still needs explicit provider lifecycle and
activation orchestration between the original funding response and buyer
handoff. This guard is the real provider-side precondition for that work, not
an implementation or execution claim for the complete orchestration. Defined
interruption, signer-response-loss, concurrency and controlled HELD acceptance
also remain separate outstanding work.
