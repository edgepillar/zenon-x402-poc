# Issued/native V3: full graph retained after the snapshot correction

## Source and DATA qualification only

The current binding correction is published on main at
[`e9c2b79`](https://github.com/edgepillar/zenon-x402-poc/commit/e9c2b7964b2b9aad802f636c800487a49faabda9).
It now charges field names and string values against one UTF-8 budget. See the
[budget-fix report](P1_ISSUED_GRANT_SNAPSHOT_BUDGET.md).

The old V2 native selection was not approved or run. Its immutable manifest now
differs from the actual binding source and is therefore superseded, not silently
reused. Its old pins and the consumed V1 native failure remain unchanged.
V3 itself has **not run natively** and grants no execution authority.

The [V3 inventory](../qualification/issued-funding-post-native-vertical.inputs-v3.json)
has SHA-256 `51ffb5b0ff0052523c1b7f3d75fa24e9be27e60ca3bcc09236b1f439096aaed1` and complete source-row seal
`81b9e3b15b442704535cbe040d0f56baaed6530d8c796f4389c6c2acaeb9381c`.
It retains all 117 application/profile and 404 existing package files.
Its only application-row change from V2 is the actual binding correction.
The actual application factory and native case are unchanged from V2.
The default source-only launcher and DATA test now select the distinct V3 file.

## Actual checks and resource plan

The 21 manifest/capture-parser DATA tests passed against V3. Their synthetic
receipts and native-looking transcript fields are fabricated DATA, not native
execution. Three Python files passed in-memory syntax checks without bytecode.

Actual source-only admission checked all 117 application files. A separate
read-only pre-native plan then checked the 404 existing package files, exact
manager/binary pins, mounted-volume identity, historical reservations and
capacity. It executed no application or package code and created no root/task.
That observation does not authorize execution or guarantee future capacity.

The full existing source set is 4364641 bytes, read in place. It is not
reduced or recopied as a smaller substitute. The private in-memory profile is
216651 bytes; private paths and identities are not published.
The proposed managed task retains only bounded controls, profile and actual
receipts. Its task quota remains 4 MiB with the 10 GiB floor plus reservations.
These sizes are not an executed disk/performance or APFS-reclaim benchmark.

See the [separate source-review record](../qualification/issued-funding-post-native-vertical.snapshot-v3.source-review.json).
The main 27-case hosted lane is unchanged and cannot qualify this native graph.

## Fresh clean-case gate

Only one newly approved clean attempt may enter this selection after source,
package, launcher, manager, runtime, mount and capacity rechecks. A valid explicit
manifest hash is required; passing source/parser checks or supplying
`--execute` is not approval.

The unchanged effect ceiling is one OpenSSL test-TLS command and one Node
command with zero Node children; five new synthetic SQLite paths, two independent
pin files, four in-memory synthetic Ed25519 keys and at most six signatures
(one transaction, three capability, two provider).
Only 127.0.0.1 may be used, with at most 182 connections.
Each nonce search/window is bounded to 4096 candidates, with aggregate
reference/producer/verification reservation at most 65536.
The loss-of-ACK variant is not included.

There is no installation, external endpoint, real wallet/payment, SDK PREPARE,
live pilot or default-buyer change. The managed launcher is not an OS/network
sandbox. Previous failed stores/tasks and their evidence cannot be reopened,
cleared or treated as fresh allowance.
