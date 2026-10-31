# Exact local response binding during recovery

The normal product result and recorded-result recovery projection now share
the same pure original/dispatch-intent validation. Before returning local
response bytes, both validate the retained original, reconstruct the expected
intent from its funding revision, challenge/payment commitments and custody
policy, compare the serialized intent, and match the response original/intent
digests to those exact bytes.

The recorded-result projection already compares the original request with the
backend ledger and terminal execution, checks cached-result agreement, and
keeps all payment, signing and dispatch authority false. The additional check
prevents missing or mismatched local response commitments from being projected
as exact original response bytes. A malformed binding withholds the whole
projection; the existing read owner still closes payer before backend once.
The coordinator withholds its output without another query or debit.

Backend-only cached history remains available when no local response was
observed. It returns no response JSON and does not consume a local dispatch
intent. An unknown backend returns no cache or local body. Neither outcome
clears client reconciliation or supplies current service authority.

The existing owned V6 SQL reader already validates stored records. This source
change is a shared product output check, not evidence of a native reader
bypass, independent provider authentication, signature validation or durable
persistence. The SQL reader, query grammar, output schema, budgets and close
ordering are unchanged. The shared validator returns no new authority or
dispatchable input.

The controls compose the actual product, pure original/intent codecs, reference
ledger, recorded-result read owner and coordinator over declared memory SQL,
proof, file, epoch and channel ports. The full reference-grant control performs
100 declared calls and then reads its original response without another debit
or execution. It is not native 100-call acceptance or a capacity claim.

No installed SDK/core package, SQLite, socket, key/signature, nonce search,
actual PREPARE/payment, process reopening or native application is executed.
Physical release, native/Linux acceptance and G0-G5 remain OPEN. Earlier
observations retain their original source/runtime scope and failure status.
