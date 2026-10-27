# Explicitly owned buyer process pipes

Status: four real OS-pipe controls and 124 current builtin component cases
passed on Node 24.19.0 / macOS arm64. This is the process-I/O foundation for the
explicit original buyer command application.
Native SDK, store, transport and standalone recovery launching remain separate.

## Ownership contract

createBuyerOwnedPipeStreams({ inputFd, outputFd }) adopts two fresh POSIX FIFO
descriptors supplied by its caller. The input must be the read end of one pipe
and the output the write end of a different pipe. Both descriptor numbers must
be integers from 3 through 1023. They must belong to the current user, have
different stable fstat identities and alias neither stdin, stdout nor stderr.
All validation precedes either Node stream constructor. Invalid configuration,
proxies, accessors, duplicate descriptors, non-FIFOs and standard descriptors
are refused without acquiring the pair.

The caller transfers exclusive ownership and must not keep another Node wrapper,
close or reuse either descriptor. fstat does not prove exclusive ownership,
access direction, anonymous-pipe creation or peer identity; those remain caller
premises. The API is cooperative, not a boundary against hostile code in the
same process. It does not open a path, discover descriptors, duplicate a handle,
connect, listen or create an IP endpoint. Named FIFOs are not authenticated.

Node Socket wraps each supplied FIFO with one direction enabled. No private Node
field, fabricated close event, timer or implicit process stdio is used. Stable
fstat identities are checked again after both constructors. A successful return
contains { input, output } for the existing actual command channel/session:

```js
const streams = createBuyerOwnedPipeStreams({ inputFd, outputFd });
const channel = createBuyerCommandLineChannel({ ...streams, limits });
const session = createBuyerOriginalRecoveryCommandSession({ client, channel, limits });
const result = await runBuyerOriginalCommandHost(session);
```

The existing channel owns real stream shutdown, write callbacks and backpressure;
the existing session owns its one whole-close observation budget and client stop.
The host returns its existing historical result. A local write callback is not
peer consumption, application delivery, durable custody or payment evidence.

Consumed descriptor numbers remain reserved for the module lifetime, including
after close, with at most 128 numbers. Do not reopen a consumed number and ask
this module to adopt it again. A native error fences further acquisitions.
If construction only partially succeeds, the module retains actual owners and
attempts each constructed stream's destroy independently once. It does not
raw-close a failed constructor's descriptor, retry, erase uncertainty or claim
partial release. Callers must preserve open/acquisition failures for explicit
recovery; a standalone native launcher still needs the full ownership transfer
and failure contract.

## Why process stdout is kept separate

Node has special process stdout/stderr lifetime rules. Its implementation
overrides their destroy behavior to keep the standard file descriptor open.
The ordinary owned-channel contract therefore cannot treat those objects as
equivalent to newly owned FIFO streams. Command results use the independent
provided pipe; diagnostics and final process status stay outside it.
[Node 24.19.0 process implementation](https://github.com/nodejs/node/blob/v24.19.0/lib/internal/bootstrap/switches/is_main_thread.js#L142-L160),
[Node process I/O](https://nodejs.org/download/release/v24.19.0/docs/api/process.html#a-note-on-process-io),
[Node supplied-descriptor Socket API](https://nodejs.org/download/release/v24.19.0/docs/api/net.html#new-netsocketoptions).

## Selected qualification

scripts/run-current-buyer-owned-pipe-streams.py accepts an explicit physical
--node path. Its four fixed controls cover clean command close, aliased pair
refusal, standard-descriptor refusal and a missing output peer. It reviews a
bounded literal relative import graph and permits Node builtins only. It runs
one Node process per case with read permissions for those exact source files,
no Node children, no code generation or addon loading, a ten-second command
deadline and bounded stdout/stderr/result capture. No test discovery, package
installation, source copies or filesystem scratch is used. It is not an OS or
network sandbox. The selected executable must be trusted and independently
identified by the invoking qualification controller.

Python creates the anonymous OS pipes, explicitly passes only selected ends,
closes parent duplicates and concurrently drains diagnostics and command output.
Each child runs the actual channel/session/host over declared native recovery
callbacks. It verifies real stream close and EBADF for the owned descriptors,
unchanged standard descriptors, one original native stop and zero business
operations. The missing output peer must retain unknown output and rejected
historical close. No application TCP/HTTPS connection, SDK, SQL, key,
cryptographic signature, nonce search or native payment is exercised.

The [actual local result](../qualification/buyer-owned-pipe-streams.actual-local-result.json)
binds 48 unique reviewed input files. Its pipeControls section contains four
actual command exits and all three stream digests per command. Its separate
componentRegression section contains the unchanged 124 case bodies, their
45-file source selection, exact names, actual exit and TAP stream digest.
The successful attempt took about 2.32 seconds: four serialized pipe-control
Node processes and one Node process for the 124-case regression. Node created
no children. No source-tree copy, package copy or scratch file was made.

The actual missing-peer control exposed a shared session bug: a failed inspect
write was closed as unknown, but outputOutcomeUnknown stayed false because no
business operation had been admitted. The catch path now preserves an existing
uncertainty latch and treats active WRITE as uncertain regardless of business
count. Clean close still reports 0; lost output retains the original rejected
close and reports CLOSE_UNKNOWN / 4. Nothing replays the retained result.

Earlier observations remain separate: the first control refused a noncanonical
test command; the next passed three cases and exposed the real shared flag bug.
A later parent-report field error left its unpersisted observations UNKNOWN.
The successful attempt records raw observations before deriving its final
assertions. No earlier failure or unretained output is relabeled as success.

All 124 component cases were rerun because the shared session changed; the old
124-case result remains historical at its original source pins. The unchanged
108-case hosted profile retains its original scope. These pipe controls do not
extend either selection to native store,
funding, service delivery, default cutover, crash recovery or production.

The [original-only pipe bootstrap host](BUYER_ORIGINAL_RECOVERY_PIPE_HOST.md)
now owns this channel before native acquisition and transfers the same channel
to the actual recovery session. Its external original/pins/grant bootstrap must
match a separately supplied operator root. Thirteen new real-pipe controls pass;
native standalone CLI/binding wiring remains source-only on development. The
four controls recorded here keep their original pins and were not rerun.
