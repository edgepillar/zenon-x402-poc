# Funding inspection opening guard

The funding inspection owner requires synchronous opening permission before
opening the selected store, around each original-record read, and before
producing its historical result. Each guard call must return `undefined`.

A synchronous throw stops advancement. The existing cleanup contract may still
close the same known, quiescent store once. This preserves cleanup after an
expired observation window without acquiring another store or retrying a read.

Every non-void return is an unknown guard receipt. This includes a promise,
thenable, proxy, `false` or `null`. The owner retains that exact receipt, profile
and any already known store under its existing limit of sixteen retained frames.
It starts no further open, read, inspection or competing close. Late settlement
cannot restore permission, publish a result or make the consumed profile reusable.
The frame-count limit is not a heap-size or operating-system resource guarantee.

Unknown receipts are not assimilated. The receipt observer uses captured
property operations and accepts only a genuine promise with the supported
prototype, constructor, `then` and species descriptors. It does not look up an
opaque `then`, enter proxy hooks, use mutable array methods or invoke an altered
species getter. Unsupported receipts stay retained.

Successful output remains historical DATA. Even a locally recorded `BOUND`
status does not establish funding acknowledgement, provider acceptance, grant
activation or service delivery. Spending reservations and independently selected
original checkpoint bytes remain unchanged; payment, signing and dispatch
permissions remain false.

## Declared-memory controls

The new entry covers nineteen controls across all eleven guard boundaries,
late receipt settlement, unsupported receipt shapes and altered promise species.
The existing funding-inspection entry contains thirty-one related controls.
Run from the reviewed repository with Node 24.19.0:

```sh
node --no-addons --disallow-code-generation-from-strings --disable-proto=throw --unhandled-rejections=strict qualification/funding-inspection-guard-receipts.behavior.mjs
node --no-addons --disallow-code-generation-from-strings --disable-proto=throw --unhandled-rejections=strict qualification/api-credit-funding-inspection.behavior.mjs
```

These entries use declared memory ports and existing synthetic checkpoint DATA.
They do not open SQLite, evaluate SDK/x402 packages, create keys or signatures,
search a nonce, use sockets or run the native application. They do not reproduce
the complete supported regression lineage. Native release, fresh-process store
recovery, Linux product acceptance and all G0-G5 product gates remain open.

## Executed focused comparison

The [recorded comparison](../qualification/funding-inspection-guard.focused.actual-local-result.json)
binds the actual case records and source hashes to Node 24.19.0 on darwin-arm64.
The candidate passed nineteen new controls and thirty-one existing controls.
The same new entry with the main runtime reproduced sixteen assertion failures
and three passes; its reference child exited 1. Those failures stay recorded.

This focused record excludes the other 1,054 affected regression controls.
Broader supported-profile completion requires separate command/source evidence.
The unchanged hosted selection covers 108 controls and excludes these entries.
Native application execution and all G0-G5 product acceptance remain open.
