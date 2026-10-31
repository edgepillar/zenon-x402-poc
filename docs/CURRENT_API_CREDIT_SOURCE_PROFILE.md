# Current API-credit source profile

The source checker reads the current buyer/provider catalog metadata and the
reviewed application source bytes without loading the application or installed
packages. It complements the retained historical evidence inventory. Neither
report accepts a product gate.

Run from a fresh source checkout with Node 24.19.0. No dependency installation
is needed. Obtain the manifest digest independently from the reviewed change;
do not adopt a digest calculated from an untrusted local manifest as authority.

```sh
node scripts/report-current-api-credit-profile.mjs --profile-sha256 5a04a6bb346cc908edb329cb24ee0a4a9ff92cfac6af206afae6c258ccdbc432
```

The manifest binds source baseline
`1928215ecd5aba6eef768cf3b6a5323e994d9968`, both catalogs, three supplementary
admission/guard sources, the V68 DATA profile and its result. The checked union
has 240 files and 3,330,336 bytes. The 404 installed-package rows per catalog
are compared as metadata; installed package files are never opened. The
manifest is deliberately separate from the application's self-pinned catalog.

`SOURCE_MATCH` means those observed bytes match the supplied identities. It
does not authenticate Git history, a publisher, the Node binary, an installed
namespace, an accepted entry command or execution of the application. The
1,893 application DATA controls are retained references, not tests rerun by
this checker. G0-G5, native qualification and Linux/product acceptance remain
OPEN or NOT_ESTABLISHED.

For bounded qualification tasks, use zero-based disjoint shards. For example,
run `--shard 0/8` through `--shard 7/8` in separate managed tasks with the same
manifest digest. Each command emits a JSON shard receipt on stdout. Retain the
actual complete outputs and combine them into a JSON array; then run:

```sh
node scripts/report-current-api-credit-profile.mjs --profile-sha256 5a04a6bb346cc908edb329cb24ee0a4a9ff92cfac6af206afae6c258ccdbc432 --merge-receipts qualification/receipts.json
```

Combination requires every shard exactly once with matching profile, source
set, baseline and file coverage. A partial or failed observation is not a full
match. Receipts are ordinary metadata, not signed attestations: their origin
must be retained separately. Combination checks receipt consistency and reads
the catalog/DATA references again; it does not reread application files.

The reader rejects links and non-regular or multiply linked files, checks file
and ancestor identities before/open/after each bounded read, closes each owned
descriptor and writes no files. A refusal exits nonzero with a fixed diagnostic
that does not expose a local path. Observations across files or shards are not
an atomic snapshot, and these checks are not an OS sandbox. A failed shard
consumes its attempt in that in-memory plan; a later observation is a separate
explicit run, never repair of the earlier record.

This command uses only builtins and source metadata. It does not import an
application/SDK/core package, open application SQLite, create a key or proof,
connect a socket, search a nonce, prepare a payment or alter a release gate.

Validation of the new checker is recorded separately from the retained
application DATA controls and the unchanged approved hosted CI profile.

[44 new DATA cases, three parser checks and eight actual source-byte shards passed](../qualification/current-source-profile.actual-local-result.json). The actual shard outputs combined to 240 matching files (3,330,336 bytes) in a separate command. Seven CLOSED/SUCCESS tasks kept the existing 4 MiB quota; the 1,893 application DATA controls were not rerun. The hosted 108-control selection is unchanged and excludes these new local cases.
