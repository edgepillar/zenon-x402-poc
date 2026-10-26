# Single-buffer child prefix capture

The current offered V4 pair now retains each child's bounded stdout/stderr prefix
in one lazily allocated backing buffer. Previously every incoming chunk created
and retained another Buffer in an array, including empty chunks. A byte ceiling
therefore still allowed many Buffer objects and array entries for fragmented
output. The new collector copies incoming bytes directly into one capped prefix.
It does not allocate capture buffers for empty chunks.

Stdout remains capped at 1,024 bytes per child and stderr at 8,192 bytes.
All observed bytes are still counted after overflow. The retained prefix and its
SHA-256 stay exact; overflow is latched before entering the existing stop callback
and never authorizes a retry. EOF still requires its explicit observation.
An explicit private snapshot returns an independent copy rather than exposing
the retained backing buffer. Snapshot copies are intentional and unchanged.

## Actual extracted-definition checks

The test executes the exact nested stream definitions from the current V4 pair
and preserved V3 baseline. Before editing, those definitions were byte-identical.
It never imports either native pair module or constructs a child/process/pipe.
The supplied byte chunks, EOF observations and stop callback are declared DATA.
Buffer construction calls are counted through explicit instrumented capabilities;
SHA-256 is the actual Node builtin.

The original collector fails three allocation cases and passes the other 24.
The changed collector passes all 27 cases, including empty/mixed/exact/overflow
inputs, source mutation, independent snapshots, Uint8Array inputs, repeated
digest snapshots, throwing and reentrant stop callbacks, and both stream caps.

| Declared fragmented capture | Before | After |
| --- | ---: | ---: |
| Lanes / child roles per lane / streams | 16 / 2 / 64 | 16 / 2 / 64 |
| Buffer construction calls during one-byte additions | 294,912 | 64 |
| Complete retained prefix bytes | 294,912 | 294,912 |

These counts exclude explicit snapshot copies. They establish neither heap bytes,
native throughput nor reclaimed disk space. An initially empty stream allocates
no capture buffer; a nonempty stream reserves its full cap on first input.

## Current source binding and boundaries

All nine planned source/controller updates were derived and validated together
before source writes, including the parent total, source parent, producer,
resource/command/capture/context bindings, launcher's complete frozen inputs and
launch manifest. The complete 567-row parent now declares 5,161,518 bytes.
Its 163 application files and 404 package rows are unchanged in count. The
558-row child graph is preserved. All 413 other protected inputs keep their
bytes and identities.

The current bindings pass 329 Python pipeline cases, the actual source-only CLI
and a parser-only check of the changed pair. The unchanged adapter/entry/preloader
parsers and extracted namespace guard retain their previous source-scoped
results; they were not rerun or relabeled as fresh native evidence.

Task/resource ceilings remain 38 MiB, a 10 GiB free-space floor, a 1 GiB safety
margin and a 4 MiB metadata reservation. No package installation/import, SDK,
SQLite, socket, child, key, signature or nonce search was run. No physical root,
task, cleanup, quota, automation or finite native allowance was changed.
This is development-source and component evidence. Native close/EOF, the full
application composition, sustained load and production remain unqualified.

See the [source-bound result](../qualification/child-prefix-stream.actual-local-result.json)
and [selected definition tests](../qualification/child-prefix-stream.behavior.mjs).
