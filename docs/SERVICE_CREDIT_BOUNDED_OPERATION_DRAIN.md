# Bounded operation-drain observation

Status: **16 helper unit cases passed locally. Payer-owner integration is
SOURCE ONLY and has not been parsed, imported or executed by that command.**
This is not native HTTP/socket, SQLite, SDK, current-main CI or pilot evidence.

## Application change

The actual funding payer recovery owner previously polled client occupancy
every one millisecond without an observation limit. The replacement starts its
observation only after either outcome of the client's public submission result.
It therefore does not consume drain grace during SDK preflight or the client's
own request deadline.

The new helper permits at most `min(deadlineMs, 1000)` milliseconds of cooperative
observation. BUSY probes use 1/2/4/.../32 ms backoff, with a 64-observation ceiling.
Only DRAINED observed before the monotonic deadline resolves true. UNKNOWN,
invalid results, probe failure, exhaustion or timeout resolve false. The watchdog
also settles the public observation when a probe's native Promise never settles.

A false observation preserves the existing owner's quarantine and active
attempt. The existing close path rejects instead of closing the still-owned
store. Late client completion cannot turn that false result into drain proof,
clear quarantine, automatically replay or release store custody. The invalid
submission probe remains unchanged: it supplies null and uses only the real
client's existing invalid-input versus operation-in-flight distinction. It
does not supply another payment packet or perform an authorized POST.

This does not cancel a suspended probe or bound a hung preflight/public client
Promise. A blocked event loop can delay timers. It is not a hard OS deadline,
hostile-code sandbox or proof that a native socket has physically closed.
External hold/quarantine and independent recovery remain necessary where
native release cannot be established.

## Local verification

The direct Node command ran only
[test/service-credit-bounded-operation-drain.test.js](../test/service-credit-bounded-operation-drain.test.js)
and the new SDK/SQL-free helper, under read-only file grants for those two files
and the root manifest. No global discovery, Node test-child mode, package import,
installation, writable file grant or qualification scratch was selected.

All 16 cases passed with no failures, cancellations, skips or TODOs on pinned
Node 24.19.0 / Darwin arm64. The command's actual exit was zero; complete stdout
was 3,017 bytes and stderr was empty. Source content and physical identities,
the executable identity and local Git status matched before and after.
The [actual result](../qualification/service-credit-bounded-operation-drain.actual-local-result.json)
retains the captured TAP output and hashes. A single short local command is
not a load, latency or production benchmark.

Cases cover immediate and async drain, BUSY progression, permanently BUSY,
a never-settling native probe, late DRAINED, late BUSY, UNKNOWN, synchronous
and async failures, invalid results, untrusted thenables, proxy probes,
invalid budgets/arity and a promise constructor accessor. Arbitrary thenables
are rejected without reading their then getter.

No SDK, SQLite, x402 package, network, key, signature, nonce search or actual
payer owner was executed. No new task-storage task or test-data file was created;
the remaining native-test slot was not used for this unit command. The public
JSON report is the single retained representation of the small text capture,
not a second raw-output file or archive.

## Source and qualification boundary

The owner edit is based on exact source parent
`2b4d3f9575981b8563f575455a7daae1e3945bc8`; the old owner blob is
`ce73531a2bf913bcdd3fe604ef91aa64877e9828`. The default buyer, legacy SDK adapter,
funding packet bytes, native SQLite schema and independent pin checks are not
changed. Existing branches, history and historical qualification files remain
separate.

The previous eight-case native profile is bound to its earlier owner bytes.
Do not reuse or relabel it with this new owner/helper graph. A future native
run needs a freshly reviewed matching graph, physical identities, launcher,
capacity admission and the separately authorized eight-case scope. The 16
helper cases do not replace those eight genuine composition scenarios.

Native acceptance still must show: an actual response that never drains;
durable OUTCOME_UNKNOWN and no further POST; bounded observation followed by
rejected close and retained store custody; no late automatic replay/reset;
and an actually drained success path that can close normally. Inspection here
does not prove these native behaviors.

Main/CI remains separate. This source-and-component-result packet must not be
presented as a fully tested payer owner or a completed P2 milestone.
