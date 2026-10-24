# Committed crash pair V2: source only

V2 corrects a mutable-directory guard in the real full-application parent. It does not replace the issued HTTPS/x402/DP/V6 seed with a smaller SQLite test. The frozen V1 sources and [actual failed attempt](P2_COMMITTED_CRASH_LOCAL_FAILURE.md) are preserved.

## Implemented

The [V2 supervisor](../qualification/recovery-crash-cutpoint-supervisor-v2.draft.mjs) uses the actual [directory identity helper](../src/native-private-directory-identity.js) for its writable scratch root. Only device, inode, owner, group and mode are stable identity fields. Directory kind, owner, exact 0700 mode, absolute normalized path and no-link ancestors are still checked. Regular-file six-field identity, nlink=1, private mode and source/profile nine-field identity/content guards are unchanged.

It also retains a bounded source stage and fault category on failure. These labels contain no exception text, source path, endpoint, original, proof or key. A failure-only stop cannot become the selected committed SIGKILL. UNKNOWN and the actual child/EOF/IPC outcomes remain distinct.

The [V2 entry](../qualification/recovery-crash-pair-v2.entry.draft.mjs) admits six exact parent inputs before importing the supervisor. The [managed launcher](../qualification/run-recovery-crash-pair-v2.local.py) reuses the unchanged, pinned V1 source-admission and DATA profile-building code. It never invokes V1's command recipe. It retains all 130 child application and 404 package rows plus the historical controls. The [V2 launch selection](../qualification/recovery-crash-pair-v2.launch-inputs.json) references the frozen manifest instead of duplicating its full source table or copying installed packages.

## Verified boundary

The current source-only entry completed with zero exit, physically checked the frozen application/control sources and constructed the six-input parent profile in memory. It did not read/execute package code, run native commands, create a root or open SQLite. The real helper separately passed 17 DATA controls. The source/collector records are in the [V2 source report](../qualification/recovery-crash-pair-v2.source-only-result.json).

After this pre-native source snapshot, the separately approved V2 native attempt failed; see the [actual V2 failure](P2_COMMITTED_CRASH_V2_LOCAL_FAILURE.md). Its new allowance is consumed. V1's consumed approval and other clean/PREPARED/CI permissions are not reusable. A new finite native allowance and fresh managed root/task would be required for any further native attempt. Recheck exact source, packages, tool identities, mount UUID, free-space floor and reservations first. Preserve failed receipts and journals; do not reopen or repair the V1 files.

The future scope remains one parent, at most two sequential owned children, five SQLite paths, eight auxiliary read-only opens, two independent pin files, four synthetic keys, five synthetic Ed25519 signatures, one test-TLS command, at most 182 loopback connections and 65536 reserved nonce candidates. No installation, external network, real wallet/payment, SDK PREPARE, physical power-loss qualification or pilot is implied. This is not an OS/network sandbox.
