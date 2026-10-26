# Current command binding uses the full-profile canonical source URL

The current managed command now uses the same file-URL encoding as its pinned
full-profile producer: an admitted path keeps @ and encodes spaces as %20.
Previously, the command encoded @ as %40, so an otherwise valid current profile
was rejected with CURRENT_COMMAND_SOURCE_ROOT when its repository path
contained @. The correction changes the command comparison, its reviewed digest
and the current launch manifest. It preserves exact whole-profile comparison
and the original source-root contract.

## Reproduction and correction

The actual Python pipeline was run with genuine current V3 parent/V5 child
profile producers and declared synthetic capture data. Before the correction,
292 tests completed with four errors, all CURRENT_COMMAND_SOURCE_ROOT:

- @ in the repository name.
- @ and spaces together in the repository path.
- @ in a parent directory.
- @ and spaces in both application and package roots.

The original failure and stderr remain preserved privately. After the fix,
the same 292-test suite passed with zero failures, errors or skips. Eight
complete-profile cases cover plain paths, spaces, @ in application or package
paths, scoped-package directories and mixed roots. A different command source
root still fails; percent syntax, fragments and authority-style roots remain
outside the admitted source alphabet.

The fixture creates every child and parent with the genuine pinned producers;
it does not patch a URL into a precomputed profile or replace profile validation
with a digest-only check. All 566 parent rows and 558 child rows remain present.
The 32-child case and all 89 resource fields also remain covered. No source
alphabet, resource quota, native scope or automatic retry policy was widened.

The default source-only CLI completed as well. It verified the existing 162
application files while reading zero installed package files and retaining no
JavaScript application bodies. The unchanged-input check observed zero source
byte reopen events. The early storage refusal still precedes installed-source
capture in both native modes, and the native task/command execution body is
unchanged.

The machine-readable
[local receipt](../qualification/native-capacity-canonical-source-url.actual-local-result.json)
binds the four current source files and records both actual attempts. All 386
other protected files retained their recorded bytes and identities. Prior
qualification receipts remain unchanged at their original source commits;
their earlier source pins are not relabeled as results for this correction.

## Evidence boundary

These are actual Python composition controls over declared synthetic source
identities. They do not establish physical root admission or execution of
Node pathToFileURL, installed packages, the SDK, SQLite, TLS, sockets, signing,
nonce search, a payment or the full native workload. No task-storage root was
read or changed by these controls, and no native allowance was consumed.

The separate storage reservation refusal remains separate evidence; this
change performs no cleanup or policy update. Hosted main CI does not run this
Python suite. The manifest and audit hooks do not provide an OS/network sandbox
or new native authority. Physical native validation and production acceptance
remain open roadmap work.
