# Original-funding V3: selected native joined-close result

Status: **6/6 selected cases passed on fixture version 2**. Two of the three
approved native attempts were used. The first attempt remains a complete
five-pass / one-fail result; it has not been discarded or replaced.

The [actual local result](../qualification/dynamic-plasma-original-funding-v3-close-native.actual-local-result.json) contains both
complete receipts, path-redacted TAP, per-case outcomes, exact input hashes,
runtime counters and the protected-record review. This is real execution of
the opt-in V3 owner, retained-read session core, SDK/Noble and six new V6 SQLite
files per attempt. Reads and funding fetch are synthetic in-process callbacks.

## Source and fixture correction

All 52 application runtime files match
[immutable application parent 00d70ff65866](https://github.com/edgepillar/zenon-x402-poc/tree/00d70ff658664928bc57e634bca50de88dc269a6).
The distinct
[version 1 inventory](https://github.com/edgepillar/zenon-x402-poc/blob/x402/p1-router-late-pending-close-integration-v2/qualification/dynamic-plasma-original-funding-v3-close-native.inputs.json)
and
[version 2 inventory](https://github.com/edgepillar/zenon-x402-poc/blob/x402/p1-router-late-pending-close-integration-v2/qualification/dynamic-plasma-original-funding-v3-close-native.inputs-v2.json)
bind 57 application/qualification and 382 existing package files each. These
branch links are discovery links: the manifests' SHA-256/Git-blob pins and the
immutable application parent identify the qualified bytes. The recorded runtime
is Node 24.19.0 on darwin/arm64, SDK 1.0.5, Noble Ed25519 2.3.0 and hashes 1.8.0.

Attempt 1's success case returned `submission_unknown`; the other five cases
passed. Attempt 2 increased only that success fixture's explicit deadline from
200 ms to 2000 ms, retained fetch-assertion failure stages and emitted counters
before final assertions. Its launcher additionally accounts for its own root's
reservations. Production sources and deadlines did not change. The first
failure's precise cause is **not conclusively established**; the later pass is
not proof of a production root cause or production fix.

## Six selected outcomes

1. Actual prepare, independent pin retention, current-read commit, exact V6
   custody and one BOUND acknowledgement; join three read closes before store
   close.
2. Reentrant close during native recovery prevents POST entry and preserves
   the original PREPARED bytes.
3. Uncertain read close keeps the idle native PREPARED store held; late
   settlement cannot promote it and the store is not force-closed.
4. Closing the first pending account read aborts before material or signing
   and joins empty-store close.
5. Closing the sixth read after signing refuses custody without reassembly,
   replacement, another material request or signature.
6. A different `readOptions` object refuses construction before wallet/read
   entry and leaves the store with its caller.

Attempt 2 recorded six completed cases, one ephemeral synthetic key, four
transaction signatures, four independent pin files, one actual fetch entry and
18 read-owner closes. No skips, cancels or todos were reported. The unused old
helper's `fixture.fetchCalls=0` counter does not negate `fetchEntries=1`.
The BOUND response acknowledges funding intake only: it is not on-chain
publication, grant activation, settlement or service delivery.

## Storage and remaining gates

Each attempt used one new private managed task with a 4 MiB quota and retained
the 10 GiB free-space floor plus scoped reservations. Both tasks are CLOSED,
their complete raw streams and source profiles remain protected, and both
process groups were independently absent. The two tasks' native scratch is
**HOLD**, not cleanup success; no historical root or failed fixture was deleted
or adopted. Review inspected database names/counts/sizes, not their contents or
a reopen. This is not a global multi-project volume-capacity qualification.

This result does not execute native HTTPS, positive nonce work, the full bounded
HTTPS factory, forced-kill/reopen recovery, a provider, grant/service delivery or
a live/economic pilot. Native-fchmod mode has no Node Permission Model or
OS/network sandbox. Cooperative resolver/source guards are not isolation proof.
The old twelve-case V2 result remains eleven pass / one fail; this six-case V3
result does not requalify it.

Test sources are opt-in on the scoped source branch. Main receives only selected
evidence/docs, not a runnable copy of this native graph or a buyer/default
activation. No hosted CI was run or declared green for this batch. The full
P0-P4 roadmap and native HTTPS, positive-work, crash/reopen, current-head CI and
owner/provider activation gates remain incomplete.

The separate preflight-only report is historical authoring evidence. Inventory
fields such as `runtimeQualified: false` describe their non-receipt role; neither
those fields nor original NOT EXECUTED source headers replace the actual,
source-bound two-attempt receipts above.
