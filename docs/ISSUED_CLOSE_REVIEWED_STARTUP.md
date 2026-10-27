# Reviewed startup for the preserved issued-close application

Date: 2026-10-27. Controller revision 7; preserved application/profile version 6.
Native execution remains NOT_EXECUTED and requires a new finite approval.

Source review found an exact mismatch in the preserved V6 control set. The
launcher assigns X402_ISSUED_CLOSE_NATIVE_SELECTION to
current-native-issued-close-source-v4, while both its unchanged preload and case
require current-native-issued-close-source-v6. Their scope and clean mode agree.
This is a static source finding, not an attempted or observed native failure.
If reached, the old preload guard would refuse before SDK/application imports;
the old controller would already have entered its task and TLS command.

The original launcher, manifest, case, preload and all historical reports stay
unchanged. The one previously frozen allowance remains unconsumed and tied to
its original revision. It is not transferred to this reviewed controller.

## Source and DATA contract

issued_close_startup_contract.py recognizes the reviewed Python environment
assignment and JavaScript guard forms as DATA. It parses Python with ast without
importing or calling the launcher. It requires one closed literal environment,
the explicit preceding environment clear and the fixed runtime prefix. The
preload and case must independently agree on all three fixed version/scope/mode
values. Ambiguous, missing, dynamic or differently versioned selections refuse.
This is a narrow source-contract recognizer, not a general JavaScript analyzer.
Exact source hashes and the actual native guards remain required.

The corrected environment is detached DATA. Producing it neither mutates the
process environment nor opens a store, starts a child, creates a key, signs,
searches a nonce, performs TLS or authorizes a run. A matching record is not
evidence that the native process accepted it.

The separate run-issued-current-close-reviewed-v7.local.py reads the unchanged
frozen helpers as definitions and uses that corrected environment explicitly.
It never calls the preserved launcher's main, patches its environment object,
transforms source, replaces native modules or weakens either JavaScript guard.
The compact reviewed-v7 selection references the complete original 123
application/404 existing-package inventory instead of copying its source rows.
Its two additional controls, effects ceiling and task policy are bound exactly.

Default/--source-only mode admits source and the corrected startup DATA only.
It does not read installed packages, import the storage manager or acquire a
storage lease. --pre-native-plan retains the existing volume, root, complete
reservation, source/package, binary and manager checks. Capacity is checked
before installed package reads, binary hashing or manager/task entry.

The separate --execute-reviewed-clean-v7 flag and project marker require new
finite human authority; flags are not authority. The old execute flag is not
accepted. The intended bound remains one clean case, one test-TLS OpenSSL and
one Node command, zero Node children, five SQLite paths, two independent pin
files, four synthetic keys and six signatures. Connections are loopback-only
and capped at 182; nonce windows are 4096 with 65536 aggregate candidates.
The existing approved root, 4 MiB task quota, 10 GiB floor and every sibling
reservation remain mandatory. No new root, cleanup, policy override or retry.

The actual native preloader still checks all 527 source/package inputs before
case imports. The reviewed controller retains a small exact profile in CAS and
references unchanged application/package sources without making source copies.
Task/stream outcomes, retained failures, child files and cleanup remain separate
observations. A selected PASS would not establish physical release, genuine
chain identity, live payment, grant economics, default activation or production.

## Verification limits

The source/DATA controls and source-only CLI are recorded in
[the local result](../qualification/issued-close-startup-contract.actual-local-result.json).
All 14 controls and the actual source-only CLI passed on their first attempts;
the two Python commands took about 0.13 seconds together. No Node, OpenSSL,
SQLite, SDK, socket, key or signature operation ran.
Synthetic guard fixtures are parser controls. The separate actual source review
binds the preserved launcher/case/preload and reports the real v4/v6 mismatch.
Neither is a substitute for native SDK/SQLite/HTTPS execution.

The native driver and reviewed-v7 selection are available on development only.
Main receives the pure contract, DATA controls, local result and this document.
The existing 108-case hosted workflow is unchanged and does not run these new
controls. Storage ownership/identity refusals and unrelated work remain HOLD;
no historical data or recorded reservation was removed or rebound.
