# Full native capacity V2 source preparation

Status: versioned source and selected DATA only. No native workload was run.

The payer/service application remains the real full issued P1 graph, not a
smaller substitute. The previous files and all historical successful, failed
and unknown evidence remain unchanged. This is P4 preparation, not P4 completion.

## Implemented source changes

Private mutable directories use exactly five stable fields:
dev, ino, uid, gid and mode. Creating a legitimate SQLite side file must not
invalidate the directory by changing nlink, size, mtime or ctime. Immutable files
still require their complete nine-field identity, owner and single-link guards.
The profile readers admit only owner-private regular-file modes 0400 (protected
managed CAS) or 0600 (managed scratch), not broader modes.

Three real role preloaders now share one source-pinned implementation. Before
application loading it checks the selected Node/runtime, source bytes and file
identities, package versions, exact resolution edges and role/root bindings.
The parent also compares each complete canonical child profile to its own graph,
not merely a matching digest/context summary. The child repeats its own admission.
These are cooperative local identity checks, not authentication against a
malicious same-user writer and not an OS or network sandbox.

The compact inventory retains all 117 baseline application inputs and all 404
existing package inputs, adds 18 application inputs, and replaces no baseline
row. The resulting namespace has 135 application files and 404 package files.
Sources are read in place; no package tree, download or qualification scratch
was copied. The existing Node executable is hashed once per source-registry
capture and its full immutable identity is carried by the private role plans.

The actual parent entry binds the hardwired payer/service pair to the
asynchronous workload owner: three fresh balance barriers, actual writer timing
pages, independent child-local clocks and real process/IPC/EOF obligations.
The builder only constructs bounded private profile bytes in memory. It has
no execution option and creates no task roots or private files.

## Actual checks

The [source-bound result](../qualification/capacity-native-full-graph-v2.source-only-result.json)
records:

- 85 passing Python profile DATA tests and 7 passing inert adapter tests, zero skips.
- Syntax-only checks for 12 current JavaScript files and the Python builder.
- A read-only match of all 539 existing source/package files to the exact table.
- No real preloader admission, native workload, SDK, SQL, keys, signatures, nonce
  search, sockets or native child acquisition.

The DATA tests cover exact full-graph and role bindings, complete child bytes,
independent root paths and dev/ino identities, context, runtime, source seals,
file identities, private-mode data and bounded canonical profiles. Their
synthetic DTOs are not native observations. The inert adapter tests never enter
a valid native run or stop, never install a fake namespace and never substitute
an SDK, SQL store, transport or process factory.

## Remaining gates

The complete managed native launcher is still missing. It must own fresh
registered roots, account for every profile/file/stream, validate the mounted
volume and capacity, bind actual storage receipts, supervise the owned process
group and preserve failure/UNKNOWN evidence. A profile, source seal or green
DATA test is not permission to run it.

Only after that source review is complete can a new finite native workload
allowance be proposed. Earlier P2/DP/clean/HTTPS allowances are not renewed or
extended. No native command is hidden inside the source-only builder or these
tests.

P2 lost-ack, uncertain launch, actual socket drain and HELD-store lifecycle remain
separate qualification work. P3 economic acceptance and P4 sustainable throughput
remain unestablished; no live pilot, chain authentication or production claim
follows from this source increment. Main/CI changes remain separate from this
source-only publication.

See the [exact input inventory](../qualification/capacity-native-full-graph-v2.inputs.json),
[source delta](../qualification/capacity-native-full-graph-v2.source-delta.json),
[previous workload adapter](NATIVE_CAPACITY_WORKLOAD_ADAPTER_SOURCE.md) and
[asynchronous balance owner](SERVICE_CREDIT_CAPACITY_ASYNC_WORKLOAD_OWNER.md).
