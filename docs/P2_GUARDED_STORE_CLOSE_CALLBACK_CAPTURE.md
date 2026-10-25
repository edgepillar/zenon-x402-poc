# P2 guarded-store close callback capture

This change fixes the actual synchronous guarded-close boundary. Tests use
declared in-memory guard/close functions, not a native store or TLS owner.
The relevant existing close-budget regression additionally uses real bounded
Node timers; no SDK, SQLite, x402 package, socket, key, signature or nonce
producer is imported or run.

## Reproduced behavior

The old boundary captured two already validated callback properties with
assignment into an ordinary object. Inherited `nativeGuard` or
`closeResource` setters/getters could therefore learn the original callback
and replace the callback selected by that private intermediate object.

Three isolated actual baselines covered the guard, the close function, and
both together. Each returned a clean result. With a substituted guard, the
original refusing guard was never called. With a substituted close function,
the original close callback was never called, despite reported returned-close
evidence. The prototype properties were restored before calling close.

These are actual boundary-component results, not evidence that a real V6
store, physical handle or transport was released, or a live payment was
affected.

## Correction and preserved behavior

The object allocator is captured at import, and the private callback container
has a null prototype. Inherited-name setters/getters cannot learn or replace
either inspected callback, including during construction that later refuses
another field. The exact original functions remain selected.

Public input grammar remains a frozen ordinary record with exactly the same
two frozen plain-function callbacks. Construction stays inert. No callback,
store, resource, option, environment/default switch or new authority is added.

The existing guard checks immediately before close entry and after its void
return, single attempt, reentry refusal and permanent UNKNOWN state remain.
Post-return refusal truthfully preserves that the callback returned; it does
not undo close or authorize repair, retry, reopen or a second attempt.
The boundary still authenticates no native handle brand.

## Actual local verification

The [source-bound local result](../qualification/native-guarded-store-close-callback-capture.actual-local-result.json)
records:

- 26 new callback-capture cases;
- the unchanged 18 boundary and 3 actual bounded-close-join cases;
- 47 passed, zero failed, cancelled, skipped or todo;
- zero new-case getter/setter calls, leaked callbacks, or substituted callback
  invocations;
- complete bounded UTF-8/TAP output, successful exit, empty stderr, and exact
  before/after source and Node identities.

The focused cases cover both inherited slots, a rejecting original guard,
accessor/setter-only/getter-only/read-only/writable prototype properties,
partial construction refusal, getters/proxies/arity, unchanged public
surfaces and receivers, prototype changes after capture and during the real
guard, returned-close uncertainty and permanent refusal.

The existing 21-case harness was not edited. A new current-source selection
covers its complete SDK/SQL-free dependency graph, including the preceding
Promise-integrity drain fix. This is a fresh component result, not a rebinding
of its old result or of a native qualification recipe. Both published branches
already contain those exact dependencies.

## Qualification limits

Only the selected runtime components and declared callbacks were exercised.
The native V6 owner that supplies the genuine captured store-close method was
not imported. Actual native store lifetime, socket drain, crash/lost-ACK,
quarantine/reopen, key custody, chain context, funding/grant economics and
production acceptance remain separate.

Callbacks and the reviewed realm remain cooperating dependencies. A private
null-prototype capture is not a hostile-code/OS sandbox or proof that a callback
actually closed a physical resource. The bounded join is cooperative, not
hard cancellation or an OS deadline. No physical cleanup or retry authority
is inferred from a historical boolean result.

Main and development receive the same four scoped files. Package/defaults,
workflow and the automatic 27-case Ubuntu/Node 24.19.0 profile are unchanged.
The new-head hosted result must be observed separately; it is not these
47 local cases or native-application qualification. No new scratch/storage
task, download, installation or historical cleanup was performed.
