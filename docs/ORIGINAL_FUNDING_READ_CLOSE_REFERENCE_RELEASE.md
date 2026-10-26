# Release coordinator references after clean original-funding read close

The original-funding read-close coordinator now drops its captured callback
record and read/operation Promise aliases after its existing clean CLOSED result
has resolved. A cached closed coordinator can remain reachable without retaining
those source callback closures. OPEN, CLOSING and CLOSE_OUTCOME_UNKNOWN keep their
references and their existing behavior.

This releases only references owned by the coordinator. It does not destroy a
native handle, close a database, delete a file, retry an operation, re-sign a
payment or establish physical cleanup. Public methods and close-result shapes
are unchanged. The same reserved Promise is returned on subsequent start calls.

The source parent is f40a097af3109fa96684e3370fb08bd4047f8cc9 and the reviewed main
base is def563729f31aaebce143a4f819402b4f8318a3c. Exact source bindings and actual
before/after receipts are in the
[local result](../qualification/original-funding-read-close-retention.actual-local-result.json).

## Actual retention and lifecycle controls

A pinned Node 24.19.0 process used WeakRef and explicit test-only GC to observe
four captured callback functions and their shared synthetic source object.
Resolver capabilities were created outside that callback lexical environment,
and the coordinator remained strongly reachable throughout each observation.
A discarded-coordinator control demonstrated collection in the same driver.

Before the change, all five weakly observed objects remained live in each of
four clean CLOSED scenarios after eight GC passes. After the change, all five
were collected in the first observed pass in each scenario. A healthy initial
close and delayed read, operation and funding-close completion are covered.

OPEN, all three pending states and the guard/alias/rejection HELD cases kept all
five references in both versions. Late settlement did not upgrade HELD, and
Promise alias checks still rejected indirect close dependencies before release.

The twelve retention observations passed. The existing 24 close-coordinator
cases and ten response-close policy cases also passed, including 64 boolean
handle-state rows. These exercise actual shared JavaScript components with
declared in-process resource callbacks. No native HTTP, SDK, SQLite, keys,
signatures, nonce work or task-storage task ran.

The corrected GC control stdout was 1,879 bytes, SHA-256
8a011cbfd4cbd45d822b1c0f68ea27360537ffd3d8f7ed43a553d42d7d7627d8.
Actual bounded outputs and command/source identities are retained privately.
These observations do not establish a universal GC schedule, a heap-byte saving,
APFS reclaim, native physical drain or production memory behavior.

## Qualification and publication scope

A source-only comparison of the existing 160-application selection found exactly
one mismatch: this updated coordinator. Zero installed-package files were read.
The existing clean and capacity manifests were preserved; they still describe
their previous coordinator bytes. Their native admission must refuse the
changed source until a separate current selection is prepared and qualified.
No previous native allowance was consumed or expanded.

The current change contains one runtime edit, a focused retention control and
its report/result. It adds no default activation, CLI or native-profile rewrite.
The approved hosted profile remains 27 controls and does not execute the new GC
control. The transferred main commit's hosted result must be observed separately.
Full current-source native integration, operational/economic acceptance and
production qualification remain open.
