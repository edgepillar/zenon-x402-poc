# Recovery application admission and borrowed inspection

The fixed-product recovery wrapper keeps the original checkpoint, grant-query
profile and spending owner. It delegates only explicit preparation, commit,
funding, selected-grant handoff and original service commands. No replacement
payment, proof generation, automatic retry or new authority is introduced.

Child inspection is a synchronous borrower. Its depth is reserved before the
callback, including public inspection and completion checks. New operation entry
is refused while that borrower is active. A close requested by the callback is
cached immediately, but its one original child stop waits until the borrower
returns. A cached OPEN snapshot cannot admit work after close: availability and
intrinsic guards are checked again before operation claims or delegation.

A rejected admission consumes no preparation, commit or funding claim, adds no
custody write/read and performs no grant query or child operation. This is
separate from already-entered work. Stopping entered work keeps HELD and original
custody; late results cannot reopen it, repair uncertainty or authorize a retry.
Known child stop receipts remain cached and are never repeated.

The unchanged previous source has two separate declared-DATA observations: one
post-close child method entry and two method entries after inspection reentry.
These observations do not establish native or economic effects. The actual
lower owners keep their independent gates.

The new controls use the existing product, query/custody, recorded-result and
reference-model components with declared memory ports. A fixture wrapper is
selected before the single recovery parent is constructed. The default fixture
is unchanged; no entered owner is replaced. Existing invalid signature-shaped
DATA stays unauthenticated. Component close monitors use cooperative Node timers.

Native SDK/core/SQLite/HTTPS, real signals, process restart, physical release,
Linux product acceptance and G0-G5 remain OPEN. DATA, hosted CI and native
acceptance must retain their separate source/runtime scope.
