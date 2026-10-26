# Custody canonical text reuse

Date: 2026-10-26. Current local contract/recovery controls passed.

The [real custody contract](../src/service-credit-original-request-custody-contract.js) now retains the already-validated canonical text of its own frozen original-request and dispatch-intent records.
Two private WeakMaps keep the kinds separate. Every admitted record field is an immutable primitive; each text has already passed the existing 16384 UTF-8-byte and UTF-16-unit bounds before the record is registered.

Serialization of a recognized factory record returns that exact bounded string.
Unknown objects, mutable copies, frozen lookalikes, proxies and accessors take the existing complete validation/rejection path.
An unknown caller object is never registered as owned: validation constructs a fresh owned normalized record.
Explicit original validation still returns a distinct record, and parsing still validates input syntax, metadata, checksum and exact canonical bytes before returning a fresh frozen record.

The cache uses weak keys and does not acquire strong ownership of a record's lifetime.
It retains one canonical string per live factory-produced record. This is a memory/time tradeoff; no heap-byte bound, GC timing, immediate erasure or measured heap saving is established.
No file, schema, key, signature, payment, authorization, replay or dispatch state is added.

## Actual before/after checks

The same 38 selected cases passed before and after the runtime change: 18 retained custody/intent contract cases, two retained recovery observation-collection cases and 18 new reuse/provenance/fault controls.
The [machine-readable result](../qualification/custody-canonical-text-reuse.actual-local-result.json) binds each source input, complete command status and observation.
The test process imported the actual current source without rewriting or evaluating a source copy.
Counting delegates forwarded to real Node SHA-256 and JSON functions; the public delegates were restored before cases ran.

| Calls across the same eleven observation rows | Before | After |
| --- | ---: | ---: |
| SHA-256 construction | 216 | 80 |
| JSON parse | 160 | 80 |
| JSON stringify | 8256 | 2000 |

All eleven output digests, string lengths, iteration counts and callback observations matched.
The repeated borrowed-input scenarios retain their full hash/parse checks on every call, including a frozen external lookalike.
Recognized factory records require no additional hash, parse or stringify call during the measured serialization loops.

In eight complete collection refreshes, the same 16 catalog reads and 16 child snapshots still occur.
The collection still closes both diagnostic children once, retains immutable detached history, rejects changed complete envelopes/intents and preserves its unavailable latch.
The whole-collection serializer work changes from 24 hashes, 16 parses and 768 stringify calls to zero.
Catalog bookends, actual owned reads, grant/original identity, funding revision and uncertainty checks are not skipped.

These are deterministic operation counts for the selected synthetic interface scenarios.
They are not a measured wall-clock speedup, SQLite throughput, durable-storage saving, heap saving or sustainable-capacity result.

## Preserved unsuccessful attempt

The first optimized run completed with 37 passes and one failure.
The runtime behavior/operation rows passed; a historical source-prefix assertion still assumed an unchanged 9810-byte prefix plus a 4241-byte dispatch-intent append.
The current fixture now inverses exactly the seven reviewed edits as source DATA and verifies the old complete source hash, prefix hash and append size.
It continues to import the actual current original module.
The old failed receipt, historical tests and historical results remain unchanged. No reconstructed source is imported, evaluated or written.

## Running the current selection

Use the reviewed Node 24.19.0 runtime and set X402_CUSTODY_CANONICAL_PHASE=optimized when running scripts/run-current-custody-canonical-reuse.mjs.
The recorded command used Node permission mode with an explicit thirteen-file read selection, no addons, disabled string code generation, no Node test children and capped output.
The current observation fixture reads the owned SQLite runner only as pinned source DATA; it never imports or opens SQLite.
Historical tests keep their original source guards and are not relabelled as current results.

The existing 108-case V3 selection is preserved exactly and does not execute these 38 local cases.
Its live source manifest refreshes only the custody-contract row and review-base commit; the workflow, action pins, runtime, permissions, timeout, selected names and excluded scopes are unchanged.
The complete existing 108-case profile also passed locally against these current sources, with zero failures/skips and a final source-pin recheck.
Older V3 manifest/result versions remain bound to their original Git revisions; they are not relabelled as current evidence.
The earlier immutable V7/V6 native candidate retains its prior custody-source pin.
It does not qualify this changed contract for native worker, SDK, SQLite, HTTPS, signing, restart, crash/power-loss or live-payment behavior.
Matching native source/package/storage/scope admission remains a separate roadmap gate.
