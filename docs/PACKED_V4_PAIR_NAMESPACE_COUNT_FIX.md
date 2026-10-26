# V4 pair namespace agrees with the 163-application graph

The packed V4 parent, preloader and entry describe 163 application and 404
package files. The pair supervisor still required applicationFiles to equal
162, inherited from V3. A correctly admitted V4 namespace would therefore fail
at the pair's namespace check before constructing or launching its children.

The pair now requires 163. This is its only semantic source change; all other
namespace, source, runtime and resource checks remain. The parent row seal,
manifest/producer, resource/command/capture/context controls and launch pins
are updated together. The child V5 graph remains unchanged at 154 application
and 404 package files, 558 complete rows.

## Reproduced guard behavior

The new focused test reads the exact namespace function definition from the
pair source and executes only that definition in a test VM context. The
namespace snapshot, descriptor and runtime facts are explicitly declared.
No native pair module or native filesystem/process/SDK/SQL/transport path is
imported or invoked. The harness reads only admitted repository source and
manifest files.

Before the correction, two of 24 cases failed: a matching 163-application V4
snapshot was refused, while a stale 162 snapshot was accepted. The original
failure is retained. After the correction all 24 cases pass, including the
unchanged foreign kind/package/child/seal, root, source-transform, builtin-alias,
runtime and descriptor refusals.

This is execution of the actual guard over declared data. It does not
authenticate a real namespace, source root, runtime or parent profile. The VM
context is a test harness, not an OS/network sandbox or native qualification.

## Complete binding verification

The current 329-test Python pipeline suite, actual default source-only CLI and
changed pair file's Node syntax check pass. The pipeline's source-wiring test
now checks the pair application count against the actual selected rows as well
as the entry and preloader counts. All 32 complete V5 profiles, 89 resource
fields, whole original capture bytes and existing early capacity guards remain
covered.

The default source gate verifies 163 real application files, reads zero
installed package files and retains no JavaScript application bodies. Its
unchanged-input check still observes zero source-byte opens. The other three
native-driver sources retain their previous syntax evidence at the previous
commit; they were unchanged and not parsed again.

The [current local receipt](../qualification/packed-v4-pair-namespace.actual-local-result.json)
contains the ten changed source pins, focused guard test, before/after results
and complete binding observations. The other 406 protected files retained
their recorded bytes and identities. Prior results remain attached to their
original source commits and are not relabeled as tests of this correction.

The prior 329-test source/DATA suite and syntax passes had not exercised this
pair guard and were not native execution evidence. This focused regression
closes that specific coverage gap without claiming full native acceptance.

## Unchanged qualification boundary

The 38 MiB task quota, 10 GiB floor, 1 GiB safety margin, finite scopes and
managed task/receipt behavior are unchanged. There was no physical root read,
SDK import, SQLite file, key/signature, nonce search, socket, native application
run, cleanup or reuse of a finite native allowance. Hosted main CI remains
separate. Actual SDK/HTTPS/SQLite composition, native resource closure and
sustainable capacity remain open roadmap qualifications.
