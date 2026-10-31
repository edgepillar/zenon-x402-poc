# Current wallet observation at opening-failure file close

The existing opening-failure custody owner keeps the same file, wallet, cached
stop receipt and one physical-close attempt. A returned wallet stop must be
known before borrowing the file view. The current clean-wallet observation now
follows that borrowed view, immediately before entering file close. Intrinsic
and retained-owner refusal checks still follow the callback.

Previously, the owner observed the wallet before reading the file view. A file
view callback could invalidate that earlier observation and still return a
clean revoked-file view. The old source then entered file close before its
post-close wallet observation reported the inconsistency. The baseline DATA
run demonstrated eight failing controls and four passing controls; its raw
exit and FAILURE task remain preserved.

The updated order refuses file-close entry if the same wallet is now HELD,
active, no longer closed, has a different clear receipt, or cannot be observed.
The historical wallet-stop return remains recorded. A later clean wallet view
cannot repair that refusal, repeat the wallet stop or authorize physical close.
Reentrant construction joins the original controller and cannot request another
revoke, stop or close.

The pre-wallet path retains its original revoke/view/close order and enters no
wallet method. An entered unreturned client or wallet still retains the file
without a competing stop. If physical close actually returns void and a later
observation fails, the actual close return remains recorded while the owner
stays HELD. No receipt or earlier failure is rewritten.

The twelve new controls use the actual pure custody owner with declared
file/wallet callbacks. The two affected existing DATA entries are checked with
their complete original case sets. These callbacks are deterministic component
evidence; they do not establish a native file release or a real wallet stop.
No new owner, storage table, cleanup method, retry, timer, key or authority is
introduced. The public controller remains observation-only.

Native application, installed SDK/core, SQLite, sockets, keys/signatures, nonce
search, PREPARE, payments, process interruption/reopening, Linux and G0-G5
acceptance remain unestablished. The separate hosted 108-control selection and
its 22 inputs remain unchanged.
