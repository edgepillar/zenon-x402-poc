# P1 DP module-owned context-v7 input reuse

This is an opt-in DATA optimization inside the original-funding preparation
chain. It is not a default buyer cutover, current-price cache, signing or
custody authority, native qualification, or a P4 application benchmark.

## Implementation

The existing public v1/v2 capture functions still always return a new detached,
recursively frozen snapshot. Caller input and an equal frozen clone are not
trusted as retained objects.

The DATA module now records its own successful context-v7 captures in a private
WeakMap, bound to the original canonical resource URL. The new
`retainCapturedZenonDynamicPlasmaOriginalFundingInputV2` entry reuses only that
exact immutable object. Every other input takes the unchanged complete capture.
Context-v6 and changed resources cannot acquire a v7 retention identity.

Current intrinsic checks and canonical URL validation run before a reuse.
Captured WeakMap methods do not consult a caller's later replacement methods.
No public brand, digest-keyed index, strong historical-payment registry,
callback, background task, filesystem cache or persisted format is added.
No RSS, GC timing or reclaimed-storage result is claimed.

V2 initial DATA assembly uses this retained-input entry. Candidate fields,
unsigned hash/fixed zero-work/public-key consistency, exact original wire
encoding, checkpoint codec and independent pins remain validated. A repeated
encoding is still DATA, never a new operation, permission to sign or retry.

Development additionally connects the actual v2 preparation owner to the new
entry; main keeps the old preparation file. In the native funding/service
source chain, an already captured fixed-POST input can therefore cross
preparation and initial assembly without two further deep copies. The actual
candidate preparer, wallet, cryptographic preflight, pre-custody current read,
independent pin check, atomic V6 method and readback are not removed or reordered.

That native source connection was only syntax-checked. Neither it nor the
changed full SDK/SQLite graph was imported or executed here. Unchanged native
files on main do not turn a changed DATA dependency into a qualified native
graph. Historical native receipts remain tied to their exact old sources.

## Actual selected local result

The adjacent
[actual local record](../qualification/dynamic-plasma-retained-input.actual-local-result.json)
binds the exact current sources and reports:

- 36 new scenarios and 33 expected refusal checks;
- the unchanged 42-case fixed-POST regression, relevant because its actual
  generic DATA dependency changed, with 41 expected refusal checks;
- 78 passed, zero failed, cancelled, skipped or todo;
- zero caller-hook or checkpoint-reader calls;
- actual v1/v2 initial DATA assembly and the real checkpoint/fixed-POST DATA
  constructor, without a native store or transport;
- one successful syntax-only check of the development preparation file.

The fixture uses fixed public bytes, a fixed unsigned zero-difficulty DTO,
its actual hash computation, and deliberately invalid signature-shaped DATA.
It invokes no wallet, key generation, signature operation or nonce search.
It supplies no authenticated chain state, quote issuance, payment, original
custody, economic grant, delivery or operator acceptance.

### Bounded micro-observation

Within the retained successful DATA run, 128 public fresh captures took
26,996,708 ns and reused zero input identities. The 128 explicit internal
retentions took 116,500 ns and returned the same module-owned immutable input
128 times. These are one-process observations, not a timing assertion, memory
measurement, native application latency, sustainable throughput or a guarantee.

Public fresh-copy behavior was deliberately retained. The optimization does
not share actual current-price/read results, reset any one-use owner, extend
a deadline/work budget or relax the required same-original validation.

### Evidence and controller limits

An earlier pure DATA invocation's output was lost at an ASCII-only controller
decoder and remains UNKNOWN, not a claimed passing run. The retained successful
run used Node's UTF-8 spec reporter; its complete stream, all 78 exact names and
order, successful exit and zero-failure totals were reconciled read-only after
a TAP-only selector refused it. That reconciliation repeated neither tests nor
the syntax command. Preflight/configuration controller errors happened before
application entry. The pre-change baseline controller's outer JSON was
truncated and is preserved as such; it was not rerun.

No SDK, SQL, key/signature, nonce-search, socket, external network, task-storage
manager/root operation or historical cleanup was performed. The old finite
native allowance was not consumed or transferred. No OS-sandbox, physical-drain
or hostile same-process isolation claim is made.

## Publication boundary

Main receives the verified DATA library, selected fixture/test and reports.
Development also receives the source-only preparation connection. Workflow,
package/defaults and the automatic 27-case Ubuntu/Node 24.19.0 profile are
unchanged. The new main-head CI result must be observed separately; these
78 local DATA cases are not claimed as that hosted profile or native proof.
