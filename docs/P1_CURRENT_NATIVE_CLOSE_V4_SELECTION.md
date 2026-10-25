# Current issued funding-to-service clean selection (V4)

Status: source and DATA checks passed; the current full native case has not run.
P1 and P2 acceptance remain open. Economic pilot and production remain NO-GO.

## What changed

The development source lane now has one current clean-case entry for production
source parent `61f7c11967afcb4310fb50700c8e91d7acdb8a25`.
It retains the immutable V3 inventory's 117 application and 404 package rows,
applies eight explicit current-source replacements, and adds six application
rows. The resolved selection contains 123 application files and 404 package
files (527 total; 4,473,160 declared bytes). The current package bytes were not
read or executed by this qualification.

The new case specifies the existing issued funding POST, bounded positive-work
search, original V6 custody, pending reconciliation, signed synthetic provider
grant activation, same-file handoff, two service calls, exact backend replay and
foreign-grant refusal. These are assertions to be executed, not observed results.

The close checks additionally require the actual whole-close observer, current
closed funding and service views, the funding store close returning, and release
of the application slot. A historical fulfilled close promise alone cannot pass.
The parser rejects UNKNOWN/held/late observations and an old reduced namespace.

The namespace preloader verifies the complete declared graph before case entry.
It uses pinned real package files and an explicit bare-import map, not native
module aliases or source transforms. This is not qualification of an ordinary
installed namespace, an OS/network sandbox, or physical absence of all handles.

## Actual checks

- 36 current Python DATA tests passed, including malformed pins, strict counter
  types, receipt completeness, mandatory close proof and reservation scope.
- Four unchanged JavaScript case/fixture/preloader files passed parser-only
  `node --check` checks. No application or dependency was imported.
- The source-only launcher passed against all 123 application inputs. It read no
  package files, imported no storage manager and created no managed task.
- All recorded source identities and bytes matched before and after these checks.

Synthetic TAP/receipt fixtures exercise a parser; they are never native evidence.
The earlier 29-case DATA run is retained privately, not added to the current
36-case count. The existing automatic 27-case CI profile was not changed and
does not execute this native graph or the new Python cases.

## Admission and preservation

The current attempt stopped at a read-only capacity preflight: a stable subset
of reservation metadata already exceeded available capacity after the required
free-space floor and new allocation. This subset proves refusal only; it is not
a complete global inventory, an allocated-payload measurement or deletion advice.
Omitted roots were not treated as zero. Private paths, disk identity, budgets,
task IDs and receipts are not published.

No OpenSSL or effectful Node command entered. No SQL, key generation, signature,
nonce search or loopback socket ran. The separately granted single current clean
attempt remains unconsumed; old V3/R4 authority was neither reused nor transferred.

The new launcher supports up to 128 explicitly declared sibling roots and checks
that every discovered managed root is present. It refuses omitted, duplicate,
noncanonical or uncertain roots; discovery is bounded to 512 sibling entries.
This replaces neither the storage manager nor any frozen historical launcher.
It does not admit the current storage or authorize cleanup/reservation edits.

## Reproduction and remaining gate

In the development source lane
`x402/p1-router-late-pending-close-integration-v2`, the source-only commands are:

```sh
python3 -I -S -B qualification/issued-current-close-v4-profile.test.py
python3 -I -S -B qualification/run-issued-current-close-v4.local.py \
  --repo /absolute/checkout --manifest-sha256 MANIFEST_SHA256 --source-only
```

Compute the manifest digest from the reviewed selection and use explicit trusted
paths. Native flags and a source-only pass are not authority. Native execution
additionally needs the approved existing manager/root, verified mounted identity,
all reservations, complete current source/package/tool pins, and actual admission.
The declared input-byte cap is per verification pass, not cumulative I/O.

One admitted clean run can qualify only its actual captured path and closure
observations. It cannot qualify crash/restart, lost acknowledgement, adversarial
shutdown, offered-rate capacity, independent review, real provider acceptance or
live economics. Never retry a native command after an observation/metadata error;
reconcile its actual task/receipt instead. No old evidence or root is reset.

The exact source pins and actual capture digests are in the companion result.
Native fixtures, preloader, profile and launcher stay on the development lane;
a main publication of this report does not promote the unexecuted runtime graph.

