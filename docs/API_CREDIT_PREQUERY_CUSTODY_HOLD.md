# Funded custody failure before grant lookup

The purchased-grant application admits the external original payment, checkpoint,
pins, challenge and selected grant before its first handoff custody read. The
same retained record must then be read back under the existing current-owner
guard before claiming the one grant query.

A failed or mismatched read at this funded boundary retains the application in
HELD. No query claim, lookup, service child, second preparation, replacement
record or funding dispatch is authorized. Returning the original bytes on a
later callback does not reopen the held application. The original payment and
reservation remain under their existing ownership and uncertainty rules.

Public input admission still precedes that custody boundary. A foreign payment
pin, invalid grant shape or accessor input is refused without reading custody
or claiming the query. An explicitly corrected original input can use the same
unclaimed flow when the retained application remains known and available.

Known returned custody mismatches keep the existing child-close protocol.
Unreturned or invalid custody receipts remain UNKNOWN/HELD and block a competing
child close. Query/postquery failure handling, one-use query selection, command
wire format and the legacy no-lookup component retain their existing contracts.

The focused controls call the actual purchased-grant application over existing
declared memory ports. They cover corrupted and foreign records, restored bytes,
repeated work, close joining, current-owner and opaque-receipt failure, external
different-payment refusal, the positive handoff and postquery rejection.
See the exact local result in
[`prequery-custody-hold.actual-local-result.json`](../qualification/prequery-custody-hold.actual-local-result.json).

These controls do not execute SDK/core, SQLite, native files, TLS/sockets, keys,
signatures, nonce search, native CLI or payment. Native corrupted-store,
concurrency/restart, physical-release and full G1/G2 acceptance remain
NOT_ESTABLISHED. All G0-G5 acceptance gates remain OPEN.
