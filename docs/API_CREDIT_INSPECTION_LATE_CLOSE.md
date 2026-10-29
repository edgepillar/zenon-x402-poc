# Original-result inspection: late completion matrix

The product query uses the existing V6 no-dispatch recovery connection. A
startup deadline includes profile admission, inspection and output. Expiry
ends the observation; it does not cancel an entered store open/close, prove
release or authorize a second operation. Channel shutdown has its own bounded
observation. A successful channel stop does not prove that a pending payer
has stopped.

The [DATA matrix](../qualification/api-credit-late-inspection-close.behavior.mjs)
composes the actual product/reference-state reconstruction, combined recovery
core, recorded-result owner and coordinator. It pauses declared open, payer
stop, output and channel-stop promises at observed call boundaries, advances a
declared clock, then completes or rejects the original promise. There is no
random delay or process termination. SQL, proof, file, epoch, channel and clock
ports remain declared DATA. Current evidence is in the
[source-bound result](../qualification/api-credit-late-inspection-close.actual-local-result.json).

| Controlled boundary | Required observation |
| --- | --- |
| Payer stop pending before expiry | No output or backend stop until the original void payer stop and fresh RELEASED view. Then one bounded result. |
| Query already observed, payer stop pending at expiry | CLOSE_UNKNOWN, no output and no competing backend stop. A later clean payer stop permits the original ordered backend stop, but cannot change the returned UNKNOWN result. |
| Late payer stop rejects or returns a value | Retain the borrowed backend. No retry or raw close. A clean-looking view cannot replace the void-stop receipt. |
| Late void payer stop without a RELEASED view | Retain the borrowed backend and withhold the result. |
| Payer open returns after expiry | Close that actual returned payer once, then its backend if release is known. Do not query it or open a replacement. |
| Payer open rejects after expiry | An unreturned payer may have acquired the backend. Do not infer that an independent backend close is safe. |
| Output completion/rejection after expiry | Preserve CLOSE_UNKNOWN and the single original query. An attempted output is not a confirmed write or delivery. |
| Channel stop exceeds its close budget or returns a value | Preserve CLOSE_UNKNOWN. A later clean channel stop cannot rewrite the result or repeat output. |
| Exhausted 100-unit reference grant and missing local response | Preserve the exact original checkpoint, original request, client uncertainty and 0 available / 0 held / 100 consumed reference units through late close. |

The returned coordinator observation is immutable and always grants no payment,
signing or dispatch authority. Ordered cleanup of a later known owner is not a
successful original query and cannot clear UNKNOWN. If output was attempted
before expiry, its bytes cannot be retracted; output observation, channel close,
store release and service delivery are separate claims.

This matrix does not run SQLite, SDK/core packages, sockets, cryptographic keys
or signatures, nonce search, native pipes, a fresh process or a payment. Native
RL-LATE-CLOSE, NATIVE-RELEASE, RL-REOPEN and Linux/G1/G2 acceptance remain OPEN.
The earlier 518 DATA controls and nineteen parser receipts are reusable only
where their exact source bytes and runtime still match. They are not promoted
to native evidence or silently repeated by this entry.

The shared recovery coordinator now includes startup-timer retirement in one
absolute channel-close window. It requires void timer-cancel receipts and fresh
closed/time observations around cancellation and after the parent await.
Reentrant expiry, opaque handles and late results cannot publish or repair a
clean verdict. See the [channel-close contract](API_CREDIT_RECOVERY_CHANNEL_CLOSE.md).
This source/DATA change does not establish native FIFO, SQL, TLS or release
acceptance and does not expand history or payment authority.
