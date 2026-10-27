# Committed response loss qualification control

The qualification gate owns one already selected response-stop capability. It
queues at most one deferred committed-state probe and stops the known transport
at most once. It does not construct a socket, access SQLite, run a client, sign,
pay, retry or establish delivery. Its snapshots always keep native delivery loss
NOT_ESTABLISHED and physical drain NOT_QUALIFIED.

All 18 [current controls](../qualification/committed-response-loss-gate.actual-local-result.json)
passed with the actual gate and declared commit/read/stop capabilities. One
control uses the actual microtask queue to check commit -> probe -> stop ->
response-continuation order. The other controls cover one-shot ownership, all
eight independent original fields, the execution link/digest/debit, missing or
uncertain commits, getters/proxies, failed or nonvoid callbacks, reentrancy and
late callbacks. They do not run the native fixture or qualify network timing.

The probe requires one compound committed snapshot whose request and linked
execution both identify the exact independent original, with SUCCEEDED and the
expected cached 200 application/json result. The read is not admission or replay
authority. Failed queue/read/stop remains UNKNOWN; a late matching result cannot
repair it. A successful void stop receipt still does not prove physical release.

The intended native binding captures the real server request socket and uses
the existing HTTPS server factory without replacing a builtin or response. Its
service timer cancellation queues the probe; the current durable owner then
performs its synchronous completion transaction before the HTTP continuation.
A future source-bound native trial must verify the actual ledger commit, client
refusal, unchanged original, one execution/debit and an unfaulted exact replay.

Listening only for `prefinish` is insufficient to guarantee a lost response:
the pinned [Node 24.19.0 outgoing-message implementation](https://github.com/nodejs/node/blob/v24.19.0/lib/_http_outgoing.js#L1067-L1092)
uncorks the connection before emitting that event. The chosen earlier probe is
a source-based ordering argument until the real native trial succeeds.

The closed Python runner selects four source inputs and three builtin imports,
uses one Node command, and imports no SDK, native fixture or SQLite module. The
unchanged production/control source rows also matched the retained 197 actual
local controls; those controls were reused rather than rerun. Hosted CI remains
the separately authorized 108-control profile and does not execute these 18
controls. Native trial permission, storage admission, economic pilot and
production qualification remain separate.
