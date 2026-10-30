# Bounded source snapshots

`scripts/qualification_snapshot_codec.py` provides an in-memory format for new
qualification JSON snapshots. It has no application, storage, file or network
operation. Storage allocation and retention belong to the approved owned-task
manager. Private snapshots and paths are never repository inputs.

The format is `bounded-gzip-json-source-snapshot-v1`. `encode_snapshot` preserves
the original UTF-8 JSON bytes, including whitespace and key order. Its gzip header
has no filename, timestamp or optional fields. It does not claim identical
DEFLATE output across Python/zlib versions; retain each actual output digest.

`decode_snapshot` requires both byte counts and both SHA-256 digests. Each count
is a positive integer no larger than 1 MiB. It requests no more than the declared
plain size plus one byte from the decompressor, never calls an unbounded flush,
and requires the exact size/hash, complete end marker and no remaining input.
Truncation, corruption, another member, trailing bytes and another format are
refused. There is no plain-JSON fallback or partial-success result.

JSON must have an object root, unique object keys and finite numbers. The module
also bounds parsed value depth and node count. Compression is a byte-preserving
representation, not normalization, signature verification, ownership, freshness
or qualification. An expected digest must come from the existing trusted review
chain. Successfully decoding a snapshot cannot qualify its application or tests.

For a new retained snapshot:

1. Produce and validate its ordinary complete JSON in memory.
2. Encode it and call `snapshot_pins` for an actual exact-byte roundtrip.
3. Check the mounted storage identity, capacity/floor and owned-task quota.
4. Retain only the encoded object, once per digest, through task storage and keep
   a small private reference with format, both sizes/hashes and the object identity.
5. On reading, verify the manager's object record and compressed pin before the
   bounded decoder. Reconstruct the unchanged JSON in memory for existing readers.

Do not compress in place, remove an old report, adopt historical data, reset
ownership or delete evidence. Existing uncompressed snapshots and their hashes
remain immutable historical inputs. Application source/runtime manifests, commit
identity, branch protections and required CI checks remain independent checks.

The local qualification uses in-memory fixtures and an exact roundtrip of a
preexisting private snapshot. The published result contains only its hashes and
size/counter measurements, without source bytes or private paths. This is not an
application/native test, a storage-recovery test or a claim about physical APFS
reclaim. Current G0/G1/G2 acceptance remains OPEN.
