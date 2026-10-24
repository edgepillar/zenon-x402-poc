# P1 funding POST: explicit readable-body flow

## Actual local result and limit

Eight selected tests passed on Node 24.19.0, darwin/arm64, in one direct Node
command with zero Node children. Seven real in-memory Node Readable streams
were created and closed. Tests import the actual new flow entry and existing
bounded response-custody implementation, not a copied implementation.

The changed funding HTTPS adapter was syntax-checked only. It was not imported,
constructed or run against TLS. The prior failed native TLS qualification
remains FAILED/NO-GO; this result neither proves its historical root cause nor
turns that failure into a passing rerun. Full P1/P2 and production remain open.

Source parent: `8cd23ff3b624e088de3aa8522f23f51e6452e383`.
Main parent: `7d32def694687264561269db28bb80e90ced0634`.

[Exact inputs, counts and capture digests](../qualification/funding-post-readable-flow.actual-local-result.json)
are retained separately from the historical native TLS manifest/result.

## Defect isolated with actual streams

The adapter registered response data handlers with the captured
`EventEmitter.prototype.on`, bypassing Readable's override. It did not
separately start readable flow. The selected regression reproduces that
registration on an actual Node Readable: after an event-loop turn it remains
idle with no reads or chunks. The actual new shared flow entry then consumes
the expected body and the stream closes.

The Node 24.19.0 [Readable.resume API](https://nodejs.org/download/release/v24.19.0/docs/api/stream.html#readableresume)
describes explicit flow entry. The local regression, rather than the
documentation alone, establishes this selected in-memory behavior.
The native TLS failure did not retain a failing-stage witness, so attributing
that historical failure specifically to this defect remains an inference.

## Source integration into the actual adapter

The actual adapter now starts the captured Readable resume capability only
after all response error, aborted, data, end and close handlers are installed.
A rejected/stopping entry receives no fresh flow entry. A source-owned flag
prevents repeated entry; settlement is deferred while flow entry is returning.
The entry is rechecked afterward before recording the bounded flow counter.

The helper never reads a response-owned `resume` property and retains no
response, listener, body, timer or callback. Prototype admission is cooperative
shape checking, not native-brand authentication or an untrusted-code sandbox.
It is for exclusively source-owned Readables, not arbitrary caller objects.

TLS/hostname/ALPN checks, exact Content-Length, 64-byte response custody,
request/socket close requirements, request/handshake/close budgets, UNKNOWN
latching and no-retry policy remain enabled. There is no new request, implicit
challenge, replacement payment, signer/store selection or default-buyer change.

## What the eight cases establish

- Direct EventEmitter data registration stays idle until explicit actual flow.
- Real split body flow reaches genuine custody end; handoff still requires
  both separately declared request/socket close observations.
- A short real body or a 65-byte overflow leaves the genuine custody UNKNOWN.
- An own `resume` getter is not read by the captured actual capability.
- A genuinely paused Readable is resumed after its listeners are installed.
- Invalid arity/proxy-bearing prototype chains refuse without proxy traps or
  a raw cause leak.
- An actual asynchronous Readable failure leaves genuine custody UNKNOWN.

The TLS/header/request/socket observations remain declared data. Readable close
is a real in-memory stream event, not authenticated HTTP/socket closure, OS
drain or a real funding acknowledgement. Seven successful flow entries count
method returns, not seven accepted funding responses. No timing/TPS benchmark
is inferred from test duration.

One separate `node --check` command parsed the changed actual adapter, with
exit zero and empty output. This loads no application graph and establishes no
native TLS, resource cleanup, current-main integration or hosted-CI success.

## Small publication and bounded resource use

Main receives only the tested shared flow helper, selected test, normalized
result and this document. The actual native adapter integration remains on the
source branch; main does not receive the unqualified native transport.
The unchanged custody dependency and package manifest match both parent trees.

Compile caching was disabled and only exact source read grants were supplied,
with no child/worker/addon/filesystem-write grant. Captures were limited to
64 KiB per stream with a 15-second component-supervisor deadline. These are
selected-run controls, not an OS/network sandbox or hard resource guarantee.

No TLS/OpenSSL command, socket, SQLite file, SDK, signature, nonce search,
download, archive, task-storage root/task or qualification scratch was used.
Historical failed TLS tasks, keys/certificates and held evidence were preserved.

Both source/main parents had zero check-runs, statuses and Actions runs at
review. No workflow was dispatched and no CI-green claim is made.
The consumed two-attempt native allowance is not reset by this edit; the
historical launcher still refuses changed inputs before creating a task.
A current-source, separately authorized native TLS run is still required,
followed by full read/funding/store integration and recovery qualification.
