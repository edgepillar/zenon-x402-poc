# Reuse the complete JSON-RPC response byte bound

The shared read core for the Dynamic Plasma and Zenon funding adapters now avoids
one redundant UTF-8 result scan when the complete validated response already fits
the 1 MiB result budget. This changes ordinary parser work, not the accepted
request/response grammar, payment behavior or execution authority.

## Why the bound is sufficient

The first pass still validates the complete response's UTF-8 and its independent
1 MiB + 4 KiB envelope cap. The existing scanner then admits one complete JSON-RPC
result envelope, checks the exact numeric ID, duplicate/dangerous keys, Unicode,
numbers, structure and all parser budgets, and identifies the same raw result
substring. No JSON parse/re-serialization or numeric coercion is introduced.

If the whole response has at most 1 MiB of UTF-8 bytes, its syntactically complete
contiguous result cannot have more bytes than that response. Repeating the same
UTF-8 scan of that result is unnecessary. When the whole response is larger, the
original independent raw-result scan still enforces the 1 MiB result cap. Large
envelopes therefore cannot enlarge the result budget. Escaped JSON strings are
bounded by their raw representation as before.

The result slice, request IDs, six-handoff funding limit, Promise/intrinsic
guards, error objects and reusable-after-failure behavior retain their contracts.
No callback, retry, transport, counter, cache or new public API is added.

## Actual before and after controls

The [source-bound result](../qualification/bounded-json-rpc-result-byte-budget.actual-local-result.json)
records complete local runs on Node 24.19.0/darwin-arm64: **83 passes before and
83 passes after**, with zero skips, todo, cancellations or stderr. The selection
contains all 51 DP adapter cases in a new current-source entry, eight unchanged
funding cases and 24 new byte-budget cases.

The historical DP entry remains unchanged. Its namespace assertion and VM
fixture predate named snapshot/hash-core exports. The new current entry admits
the exact current export set and strips those declarations only in its existing
VM admission fixture. Ordinary module cases and the operation probe import the
actual files. Two unsuccessful precursor runs remain recorded separately;
neither is relabeled as a pass.

The operation probe captures the native character reader before actual module
import and restores the public descriptor before any case runs. Its forwarding
call is also captured so existing intrinsic-replacement cases remain meaningful.
It classifies the two response strings by length and compares each large string
at most once, avoiding a measurement-induced repeated content comparison.

Across the same 34 observation rows:

| Result-section character reads | Calls |
| --- | ---: |
| Actual pre-change core | 11,534,468 |
| Actual optimized core | 7,340,022 |
| Avoided calls | 4,194,446 |

Accepted result hashes, rejected error codes, exchange counts and complete-
response/parser character reads match. Only accepted responses whose whole byte
length fits the result budget omit the second result scan. Exact/plus-one whole
and result bounds, raw multibyte/escaped text, malformed Unicode, duplicate keys,
envelope overhead and independent adapter reuse are included.

These are observed calls into the captured native character reader. They are not
a measured speedup, latency/throughput result, heap/RSS saving, disk saving or
physical reclaim. The two command durations are not a controlled benchmark.

## Reproduction and qualification limits

The closed [file launcher](../scripts/run-bounded-json-rpc-byte-budget.mjs) runs
the explicit three entries with isolation=none, serial execution, bounded output,
complete stream checks and exactly 83 unique passes. It discovers no other
historical tests. Use the restricted portable argv in the result from the
repository root; it includes only the reviewed source read paths, no addon,
filesystem-write, child-process or worker permission, and a 192 MiB V8 old-space
limit. These flags are not an OS/network sandbox or a whole-process RSS bound.

The retained before run selected the pre-change core at the stated source pin.
Its baseline phase is not compatible with the optimized core and must not be
used to relabel a new run. The default launcher selects optimized expectations.

The existing 108-case V3 CI profile is unchanged and does not execute these 83
local controls. No SDK/x402 package, SQLite, socket/network, key/signature, nonce
search, real PREPARE, payment, storage-manager task or native application ran.
The older capacity graph bindings remain at their original source pins; this
local result does not qualify that graph after the core changes. Current-source
native P1/P2 composition and measured capacity remain separate work.
