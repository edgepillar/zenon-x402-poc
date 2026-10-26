# Compare complete profile bytes without a second whole expected Buffer

`matchesNativeProfileByteFragments(actual, fragments, maximumBytes)` compares
the entire actual Buffer with a complete sequence of already encoded expected
fields. A caller can reuse large encoded source/runtime/import tables across
many profiles and encode only their small changing context fields.

The matcher checks every byte and the final length. It does not concatenate a
second full expected profile, accept a prefix, normalize JSON, authenticate
source or profile identities, or grant native execution authority. Callers
remain responsible for the complete expected field set and admission policy.

The caller-selected limit must be a safe integer from 1 through 1,048,576 bytes.
There are at most 256 fragments. Empty fragments are allowed; sparse arrays,
accessor entries, proxies, non-Buffers and forged own Buffer lengths are refused.
The primitive captures the Buffer comparison operation at import. These are
component input controls, not a process-memory or OS/network sandbox.

The actual pinned Node 24.19.0 component control passed eleven tests with zero
failures or skips. It covered arbitrary fragment boundaries, every-byte
corruption, exact cap/length refusal, invalid inputs, accessor/proxy refusal,
captured comparison, absence of whole Buffer concatenation and 32 complete
synthetic profiles compared against an independent whole JSON reference.
Noncanonical and reordered JSON was rejected as different bytes.

Exact source pins, exit and output digests are in the
[component result](../qualification/native-profile-byte-fragments.actual-local-result.json).
No SDK, SQLite, signatures, nonce work, TLS/socket, managed task or full native
application ran. The development-only parent integration has a separate source
and DATA qualification. No native heap saving, latency or throughput result is
inferred from these tests. Main CI is observed independently after transfer.
