# Native client late-close lifecycle

Status: 27 SDK/SQL/socket-free component cases passed on Node 24.19.0,
darwin/arm64. The native HTTPS binding is source/syntax-only.
Full P1 remains NOT_ESTABLISHED; the economic pilot remains NO_GO.

## Implemented change

The explicit native HTTPS client previously stopped its close-finalization path
once the grace deadline set CLOSE_UNKNOWN. Later native request/socket close
events could remove tracked handles, but no longer reached local CA-copy release.
A separate close owner now distinguishes the immutable close-Promise settlement
from later cleanup observations.

The actual native binding supplies two private captured capabilities:

- Read counts from its actual request/socket/timer sets. Only the close-grace
  timer is excluded because the local-material releaser cancels it.
- Cancel that grace token and zero/drop only the client's owned local CA copy.

The owner claims release before calling the releaser, checks counts again after
its return and never retries a failed release. A request, socket or non-grace
timer still observed blocks release. Deadline/observation/release uncertainty
settles the cached Promise as CLOSE_UNKNOWN. Later zero-count observations can
release local material once, but cannot repair that rejected verdict or provide
retry/payment authority.

A late error can downgrade the current phase after an earlier clean settlement.
The historical Promise settlement is separately visible and is not rewritten.
Snapshots expose no callback, TLS material or payment header.

## Exact selected qualification

The fixture is
qualification/service-credit-native-client-close-owner.behavior.draft.mjs.
It directly imports the actual close owner, not the native transport. Its
callbacks supply declared counter observations and a void local releaser.

The 27 cases cover inert construction, cached close identity, clean receipt
compatibility, each remaining-resource fence, preexisting UNKNOWN, grace expiry,
late cleanup, repeated callbacks, throwing/proxy/getter/unfrozen observations,
invalid numeric counts, release failures and non-void/thenable results,
read/release reentry, post-release work, captured-capability mutation, late error
downgrade, stale grace callbacks, arity checks and frozen private snapshots.

The test used three pinned source inputs / 24,582 bytes. All 27 tests passed
with zero skips/cancellations/todos and complete exit-0 output. Exact TAP,
source pins and scope counters are in
[the component result](../qualification/service-credit-native-client-close-owner.actual-local-result.json).
The original 5,754-byte TAP is retained without private-path substitutions.

The component invoked no SDK, SQLite, socket, signer, key generation, nonce,
application timer, child process or managed scratch task. The read-only Node
permission profile granted only its three source files. These source/callback
bounds are not an OS/network or hostile-code sandbox.

The changed native transport also received a separate exit-0 syntax-only check.
A preceding syntax invocation had an unretained result because its Python
wrapper emitted a warning before JSON; that observation remains UNKNOWN and is
not counted as a pass. This increment used one component Node invocation and
two syntax-only invocations. No actual native transport experiment was rerun.

## Remaining acceptance gate

The actual native HTTPS client now delegates closing to this owner and invokes
observation again after native timer/request/socket events, including after an
uncertain deadline. That wiring was not imported or executed in this component
qualification. Neither declared zero counts nor syntax establishes physical
socket drain, complete native resource release, SQLite reopen or service delivery.

The earlier full P1 experiment remains FAILED_OR_INCOMPLETE. Its raw failure,
OUTCOME_UNKNOWN state, CLOSE_UNCERTAIN verdict and held SQLite files are
unchanged. The separate P1 v2 draft and fresh one-shot approval gate remain in
place; no old permission is reused or extended to other native/DP tests.

Only the tested opt-in close owner, selected component fixture and this evidence
are eligible for the small main transfer. The changed native binding stays on
the working branch pending exact-current-source native qualification. Existing
default package/test/CLI paths, workflows, historical results and storage roots
are unchanged. Hosted CI is NOT_RUN_NOT_GREEN.

