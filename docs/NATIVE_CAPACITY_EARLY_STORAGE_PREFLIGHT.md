# Native capacity: refuse storage before installed source capture

The current V3 launcher now checks the mounted volume, cooperative reservations
and existing root policy before capturing installed SDK/package sources or
hashing the Node executable. A known storage refusal therefore stops at this
earlier boundary in both execution and read-only preflight modes.

The application-only source gate still runs first. On an admitted early check,
the existing full 566-row context capture follows. The launcher retains a fresh
global capacity check after that capture and before task creation, plus the
existing checks before each native command. The early observation does not
replace task admission, authorize a run, change policy or qualify native
behavior. No root is initialized or adopted by this change.

## Local verification

The complete pipeline DATA suite passed **280 tests**, with no failures, errors
or skips. The two new tests exercise the real main function with declared
callbacks in both modes:

- A declared capacity refusal in the real early preflight stops before manager
  source reads, package/context capture or native execution.
- A declared successful early preflight reaches the installed-context boundary
  next; the test deliberately stops there before reading installed sources.

The test audit observed zero child launches, socket or SQLite operations,
write opens, mutations and reads outside the admitted source/standard library
set. These are source-bound ordering controls, not physical native composition
tests. The actual default source-only CLI also completed successfully. Its
application gate verified 162 files and retained no JavaScript application
bodies; the unchanged-input recheck observed zero source-byte reopen events.

The existing resource plan, 32 complete child profile bindings and 89 resource
fields remain covered. The Node-native sources, installed package declarations,
profile producers, resource/controller modules and finite plan math are
unchanged. All 385 other protected files matched their recorded bytes and
identities before and after the controls.

The machine-readable receipt is
[here](../qualification/native-capacity-early-storage-preflight.actual-local-result.json).
Its three source pins bind this change. The prior 278-test receipt remains
unchanged and describes the code at commit
30e5bd3af8976a2563707efc2572293c4e094ca5; it is not a fresh receipt for
the modified launcher or behavior test.

## Separate read-only storage observation

A bounded metadata-only observation recognized 111 sibling stores. After 64
stable stores and 6,744 task records, known reservations plus the unchanged
production floor, safety margin and proposed allocation already required
389,054,201,856 bytes against 386,319,081,472 available bytes. The known
shortfall was **at least 2,735,120,384 bytes**. The other 47 stores were not
treated as zero. The observer stopped with NO_GO_KNOWN_RESERVATIONS.

This is a cooperative lower-bound observation, not atomic full-root admission,
allocated-byte or reclaim measurement, or a cleanup plan. Freeing that lower
bound alone would not establish admission. No task, manager import, package
execution, SQLite file, signing material, nonce search or native application
run was created. Existing roots, policies and evidence were preserved.

The first metadata observer failed while writing its own protected report;
its empty report and failure receipt were preserved. A separate corrected
observer completed. No admission conclusion is attributed to the failed
attempt.

## Qualification boundary

The successful DATA controls do not consume or extend any finite native
allowance. No old clean/R4 allowance is reused for the current V3/V5 capacity
graph. SDK imports, real signing/payment, TLS/socket composition, crash
recovery and live operation remain unqualified by this change. Hosted main CI
is separate and does not execute these Python controls. The source gate and
audit hooks are not an operating-system or network sandbox.
