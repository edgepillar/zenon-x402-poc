# P2 funding POST native stop/TLS v2 source draft

Status: seven-case native regression code and bounded native observation counters
are implemented as a development-only source draft. 53/53 source-DATA controls
and three syntax checks passed. Zero native cases ran; no TLS key, socket,
storage task or native application owner was created.

This is not an executable approved managed recipe. The new native controller
is not implemented in this batch. Old one-shot permissions and old launchers
must not be applied to this changed source selection.

## Application and harness changes

The actual funding transport adds four bounded numeric observations:

- `socketAssignmentsObserved`
- `stoppedSocketAssignmentsObserved`
- `handshakeTimerStartAttempts`
- `requestClosesWithoutSocketObserved`

They observe first socket assignment, association already fenced by stop,
entry into handshake-timer creation and request close before socket observation.
The native request/stop/close owners, fixed URL/headers, original bytes and TLS
policy remain the existing hardwired path. No request factory, SDK, signer,
store or substitute transport is injected. Counters do not authenticate native
events or qualify a path that did not occur.

The new body uses genuine Node HTTPS and TCP fixtures, plus the actual funding
adapter. It proposes these seven sequential cases:

1. Complete BOUND response and observed client close.
2. Partial body retained as UNKNOWN.
3. Abort after the original request is observed, without replacement.
4. Immediate abort, with no await before stop.
5. Immediate owner close, with no await before stop.
6. Abort during a genuine pending TLS handshake against a silent TCP peer.
7. Wrong URL/method and pre-aborted signal refused before request start.

Early-stop cases compare the counters immediately before stop with their
post-drain values. They do not assume a socket must be assigned in that schedule.
The future footer records the actual stopped-assignment count and explicitly
refuses to qualify an unobserved late path or a nonclosing-socket path.
Fixture-forced cleanup is counted separately and vetoes a successful selection.

The explicit entry is gated before importing the native body. Selection markers
and manifest flags are not human authority. No native entry was imported or
called for this source result.

## Current source-DATA result

The new manifest pins nine current rows: package text, five application modules,
the native body/entry and the pure Python source gate. Closed imports include
the real shared request-stop owner missing from the older four-case selection.
The historical manifest, four-case body, helper and actual results are unchanged.

53 controls passed in one Python command: one admission of these actual source
bytes and 52 negative DATA cases. They reject changed pins/row order, widened
effects, forged execution/authority, computed/extra imports, wildcard binding,
missing/duplicate cases, removed stop/counter assertions and a changed Python
import closure even after an input row is rebound. This is structural/source
admission, not an adversarial-code sandbox or live effect enforcement.

The adapter, native body and explicit entry separately passed Node syntax
checking only. All three commands exited 0 with complete empty streams.
The Python command exited 0 with complete 6,241-byte stdout and empty stderr.
All 11 selected files and the 241-file protected-input set remained pinned
before/after; overlapping sets are not additive. The 241 deliberately exclude
the changed funding adapter and retain historical evidence and unrelated work.

The existing Node byte hash was reused only with matching full nine-field
identity. No 121 MB binary rehash, installed-package/551-file recapture,
dependency installation, source tree copy or repeated completed native/CI run
was needed. No task-storage manager was imported or invoked.

## Proposed finite native envelope, not permission

The declared proposal is one run, one test-TLS OpenSSL command, one Node command,
zero Node children, two listeners bound only to 127.0.0.1, at most eight total
loopback connections, a 4 MiB task quota and a 45-second Node command bound.
The 10 GiB production free-space floor plus all expected allocations and other
open/held reservations remains mandatory. SDK, SQLite, nonce, wallet/payment/
capability/provider signing, external network and the full DP graph are absent.
The proposed OpenSSL test key is not a wallet or payment signature.

No current capacity, mount, reservation or task admission was performed here.
A future new controller must use the approved manager and independently bind
the exact sources, Node/tool identities, volume identity and complete reservation
scope before any native command. It must preserve failures/incomplete streams,
close only its owned task and retain test TLS material privately. It must not
omit held roots, lower the floor, release old reservations or reuse an old
allowance to make this draft run. Count/time bounds are not OS isolation.

Main remains unchanged; these files and diagnostics stay on the development
branch. The prior pure close-core fix on main remains separate. No new hosted
CI or native result is claimed. Actual native TLS/resource closure, full
P1/P2/P4, store/reopen/crash behavior, economic pilot and production acceptance
remain separate open work.

Result: `qualification/funding-post-native-stop-tls-v2.source-data-actual-local-result.json`.
Authority remains `NONE`.
