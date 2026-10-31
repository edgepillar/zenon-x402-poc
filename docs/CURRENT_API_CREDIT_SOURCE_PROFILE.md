# Current API-credit source profile

The builtin-only source checker compares reviewed buyer/provider source bytes
without importing an application or installed package. Obtain the manifest
SHA-256 independently from the reviewed change. No installation is needed.

```sh
node scripts/report-current-api-credit-profile.mjs --profile-sha256 DIGEST
```

Replace `DIGEST` with the current manifest SHA-256:
`429fda55fb56fa17e70004f70d16cc83b4026bcb2580c28c235a0bbab58a7846`.

The current manifest selects the V69 buyer-stop candidate delta over source
parent `85903bdbffcfcb09529df4b9c1541756d1556eb0`, both catalogs, three extra
admission/guard sources and the application DATA result (568 executed / 1,347
retained exact controls; 1,915 source-bound application controls). The planned
application source union is 240 files / 3,333,829 bytes. The 404 package rows
per catalog are compared only as metadata. Installed files are not opened.
The parent reference is not a claim that its tree already contained the delta.

The unchanged checker/core have [44 retained DATA cases and a prior complete
source observation](../qualification/current-source-profile.actual-local-result.json).
That full observation covered the earlier manifest
`5a04a6bb346cc908edb329cb24ee0a4a9ff92cfac6af206afae6c258ccdbc432`
and its 240 files / 3,330,336 bytes before the buyer-stop delta. It is not a
fresh full observation of this changed candidate.

[The current metadata-plan command](../qualification/buyer-stop-current-profile-plan.actual-result.json)
checked the new manifest/catalog/DATA references with the actual unchanged
reporter core. It read zero application-source files and ran no source-check
shards. This verifies the current reference contract, not full source coverage.
The application DATA and both source catalogs were reviewed separately.

For a complete observation, use the command above or disjoint zero-based
`--shard 0/8` through `--shard 7/8` commands with the same current digest. Retain
the actual complete outputs and place all eight receipts in a JSON array.
Combine them using:

```sh
node scripts/report-current-api-credit-profile.mjs --profile-sha256 DIGEST --merge-receipts qualification/receipts.json
```

Combination requires every shard once with the same profile, baseline and
exact source coverage. Receipts are metadata, not signed attestations. Keep
their actual origins separately. Combination rereads the catalog/DATA references
but does not reread application files. Earlier-profile receipts cannot be
relabelled or mixed into a current-profile full match.

The reader bounds reads, rejects links/non-regular/multiply linked files,
checks before/open/after file and ancestor identities, and closes its own
file descriptors without writing files. These are cooperative checks, not an
atomic snapshot, source/Git/publisher authentication or an OS sandbox.
A failed shard consumes its attempt; a later run is a separate observation.
SOURCE_MATCH is byte identity only. It does not authenticate a runtime,
installed namespace or accepted application entry. Native SDK/core/SQLite,
keys/proofs/signatures, sockets, nonce, PREPARE/payment and Linux/product
acceptance remain unqualified. All G0-G5 gates remain OPEN.
