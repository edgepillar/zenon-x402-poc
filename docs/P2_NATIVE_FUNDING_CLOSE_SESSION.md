# P2 native read/funding close session

Status: actual SDK/SQL/network-free close-component composition PASS, 20/20.
The changed actual native DP factory is source-reviewed and syntax-checked only.
No full SDK/SQLite/HTTPS application, native cleanup, hosted CI, live payment or
production claim follows.

## Concrete application change

The actual default-off native original-funding factory previously kept its
read/funding close join inline. It now selects the extracted
`createNativeOriginalFundingCloseSession(reads, funding)` implementation. The
old inline join is removed; this is not a copied substitute or unused alternative.

The factory still constructs the actual V2 retained HTTPS read session, actual
native funding POST transport, and actual V4 original-funding submission. Its
caller cannot inject owner/request/store/preflight factories. Original read
options and the returned actual V4 methods are preserved. No default buyer,
quote, payment packet, signing, nonce, schema or replay behavior changes.

The extracted session captures frozen source-owned methods without calling them
at construction. Its cached prehandled close exists before either child can
reenter. Both read and funding close attempts start without awaiting the other;
a throw/refusal on one side cannot suppress the independent other attempt.
Read close must fulfill undefined and funding close must supply CLOSED data.

## Current views, not historical settlement

Before every close permit, the session reads current source-owned views:

- The actual read core must report version 1, three requested/settled/clean
  closes, CLOSED lifecycle and no latched close uncertainty.
- All three native read-owner views must report their expected version,
  requested/settled/observed close, no active generation, uncertainty or retired
  error, and zero observed request/response/socket/agent/timer references.
- Funding must report current clean CLOSED with zero requests/sockets/timers.
  Its nested close state must also be clean, non-reentrant and quiescent, with
  matching zero observed counts and one returned local-material release.

Only immutable own data is read. Proxies, accessors, thenables, malformed owner
arrays, negative-zero counters, public-close cycles, child-Promise aliases and
reentrant inspection refuse without invoking their getters. Raw child rejection
properties are never inspected.

A later view failure permanently vetoes future permits. If public close already
fulfilled, its historical outcome remains CLOSED while current lifecycle becomes
UNKNOWN. That distinction also matches the actual funding close lifecycle's
ability to latch a late error without rewriting its old Promise result.

The actual V4 still combines this private native guard with its own current
bounded-close permission. The unchanged actual payer rechecks the composite
after its own awaits immediately before and after genuine store close. This
session itself never closes a store, creates a watchdog or grants a retry. A
store close already entered or returned cannot be undone or reported as still
open merely because a later guard refuses.

## Exact local evidence

One direct Node 24.19.0 / darwin / arm64 command completed on its first attempt:
20 tests, 20 pass, zero fail/cancel/skip/todo, actual exit 0 and complete captures.

Seven actual production modules were loaded, not copied or replaced. The five
selected composition cases construct the actual retained-read core and actual
funding close lifecycle five times, plus this session and the actual bounded
original-funding join. They cover clean composition, a pending read close, a
pending original operation, actual funding-close-core late UNKNOWN before a
declared post-await store boundary, and a declared retired-read error after an
earlier aggregate CLOSED result.

The remaining selected cases cover inert capture, cached inspection, input
hooks, both independent starts, peer throw/rejection, opaque failure data,
thenables/cycles/aliasing, mandatory aggregate/per-owner/funding views,
late-result permanence, malformed snapshots, reentry, arity and intrinsic drift.
Internal mutation controls are not additional authored test registrations.

Native views, borrowed resource closes and store boundaries are declared DATA.
No actual native factory, V4, payer, SDK, SQLite, socket, key, signature, nonce,
real PREPARE or payment was imported/executed. The one clean declared store
callback is not a real store operation. A real lifecycle supplied with declared
counts does not prove native drain.

The component command grants reads only to its nine exact input files; it has
no filesystem write/child/worker grant, addons or compile cache. A 15-second
supervisor caps each captured stream at 64 KiB and verifies input/runtime
identities and bytes before/after. This is not an OS or network sandbox claim.
Complete captures remain in the command record; public JSON retains input pins,
counts and stream byte sizes/digests without private paths.

One separate `node --check` parsed only the changed native factory. It did not
import that factory's dependencies, construct native owners or execute the full
application. Old results must not be rebound to the new factory source.

## Resource/observation optimization

Public inspection is now cached metadata: it invokes no source inspector,
timer or I/O. Current permission still requires fresh views, not that cache.
Fixed match records are allocated once at module initialization; each immutable
record shape is validated once per match instead of once for every field.
No new polling loop, timer, download, archive, managed root/task or qualification
scratch was introduced. These are implementation changes, not latency/capacity
benchmarks or physical cleanup evidence.

## Publication and remaining gates

Source publication includes the extracted session, its executed test/result,
this document and the changed actual native factory. Main eligibility includes
only the extracted session, executed test/result and this document; all unchanged
executed dependencies already match both parent trees. The changed native factory
stays off main.

Review pins the current source/main refs and full trees, exact file delta,
protections/rules, four open PRs without target overlap, and exact-parent CI.
Both parent heads have zero check runs/statuses/workflow runs, not green CI.
Publication permits only ordinary fast-forwards, with no workflow, PR/comment,
unrelated-branch or default-buyer mutation.

The separate funding-only native TLS profile and its 11 input rows remain
byte-identical. Its previous two native attempts stay consumed. No new native
attempt, OpenSSL command, source-admission replay, storage adoption or cleanup
occurs here; a component PASS is not its pending explicit human authority.

Next qualification remains the changed actual V4/native-read/native-funding/
payer/store graph under its own reviewed effects scope. P0/P1/P2 and the roadmap
remain open. Economic pilot and production are not qualified.
