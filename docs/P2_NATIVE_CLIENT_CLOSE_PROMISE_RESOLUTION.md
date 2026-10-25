# P2 native client close Promise resolution

Status: a reproduced close-core result-handling gap is fixed and locally
qualified at component scope. The actual production close owner passed 45
selected controls; the funding stop/close/response DATA composition passed 24
more cases with the changed dependency. Native HTTPS/TLS was not executed.

## Reproduced behavior

One bounded pre-fix command imported the actual, unchanged production
`createNativeHttpsClientCloseOwner`. A configurable getter named `then` was
installed on the private control process's `Object.prototype` only during
`observe()`, then restored synchronously. The getter was read once while the
close Promise accepted its ordinary clean receipt. The getter returned
undefined, so this particular control still fulfilled; it did not reproduce a
hung native request, service outage or real resource leak.

The exact old component SHA-256 was
`00366016a37cf71234cb305e860b5d3f406c97f6b6a7af8569ae76726b759c91`.
Actual exit was zero, stdout complete at 380 bytes, and stderr empty.

## Implementation

The close owner captures `Object.prototype` at import. Immediately before a
pending clean receipt handoff, after both count reads and the trusted local
releaser, it checks the inherited `then` descriptor with its already captured
descriptor reader. It does not read the property or call its value.

Any descriptor at that point, even a non-callable data member, permanently
latches UNKNOWN and rejects the cached close Promise. Rejection does not
assimilate its reason. Restoring the prototype cannot upgrade that rejection or
authorize another release. A previously fulfilled Promise is not rewritten by
a later global change. A transient member removed before handoff does not
change the normal receipt.

Only eight lines were added. Existing public methods, the exact ordinary
frozen clean receipt, read/count rules and one-attempt local release behavior
are unchanged. No timer, retry, store-close or native factory is added.

## Current-source qualification

The new entry retains the original 27 pure case bodies verbatim. Their body
SHA-256 is `dca6f2bcccfd5798703238bb4205806ab31786250eda6b8e3d15644a2035dd57`
for 11,824 bytes. The old fs/crypto/TAP launcher was not executed or repinned;
its source and result remain historical. The new reviewed parent supplies the
current source/identity and post-run checks.

- 45/45 current-owner controls passed: those 27 regressions plus 18 new cases.
  Actual exit 0, complete 3,676-byte stdout, empty stderr.
- The 18 cover inherited getters/callables/data, changes introduced by either
  count read or the releaser, cached descriptor capture, no repair on restore,
  late changes and no repeated release.
- 24/24 stop/close/response composition cases passed in a second command with
  the new close owner: actual exit 0, complete 1,942-byte stdout, empty stderr.
  This replay was needed because its production dependency changed, not because
  the prior unchanged test needed another green run.

All six selected sources and the 235-file protected-input pin set matched
before and after; overlapping sets are not additive. These are separate test
lanes, not 69 native cases, a coverage percentage or full application proof.
The earlier pre-fix command did not run the 27 registered legacy cases.

The private prototype/property changes were restored within their own Node
control process. No actual SDK, SQLite, key, signature, nonce, native transport,
socket, product timer, test child, install, fixture file or task-storage manager
was used. Node 24.19.0 was selected, and its retained byte hash was reused only
with matching full nine-field identity before and after each command. No new
121 MB executable hash pass or source-tree copy was needed.

## Transfer and remaining acceptance

This is a qualified pure production component, so the close-core patch, new
entry and reports may move to main in one small reviewed batch. The automatic
27-case hosted profile remains unchanged and does not select the new 45/24
component entries. Its exact new-main result must be checked separately.

The prior funding transport wiring fix remains development-only and unqualified
over native TLS. This close-core change is another changed application input;
old installed-source/native/capacity records are not rebound to it. Their
profiles, launchers, hashes and outcomes remain unchanged historical evidence.

The two callbacks still represent trusted host observations/capabilities.
Descriptor checking is not hostile-code isolation or an OS/realm sandbox.
Native close, real store lifetime/reopen/crash, full P1/P2/P4, live payments,
economic pilot, cleanup authority and production readiness remain separate
acceptance work. No native allowance was granted or consumed here.

Result: `qualification/native-client-close-then-safety-data.actual-local-result.json`.
Authority remains `NONE`.
