# Application deadline ownership core - selected local result

## Outcome and exact scope

**32 / 32 selected component cases passed**, with zero failures, skips,
cancellations or todo tests. Actual Node exit 0 and complete bounded stdout/
stderr capture are retained in the
[source-bound result](../qualification/service-credit-application-deadline-owner-core.actual-local-result.json).

The actual tested implementation is
`src/service-credit-application-deadline-owner-core.js`, not a copied model.
The selected entry imports that implementation directly. Only package.json,
the core and the selected fixture are filesystem-read inputs: 31,210 bytes
total. The Node binary was pinned by SHA-256 and runtime to 24.19.0 / Darwin
arm64. Source bytes and identities matched before and after execution.

One direct Node command ran under permission mode with exactly those three
read grants, no write grants, no addons, no string code generation, a sanitized
environment and bounded parent capture. It used no global discovery, package
installation, child test runner, qualification scratch or new storage task.
There was no native application timer, real application monotonic-clock read,
SDK, SQL connection, socket, key generation, signature or nonce work.

The test harness/control-plane hashing and file reads are not application I/O.
Its timer/clock capabilities are explicitly synthetic callbacks, so a component
pass is **not** native timer, HTTPS-host or physical-drain qualification.

## Production binding, kept separate

The explicit native deadline owner now imports this core and privately supplies
captured `node:timers` and `hrtime.bigint` capabilities. Callers of that native
binding cannot inject a fake clock or scheduler. Construction remains inert.
The native HTTPS application host continues to use that actual binding.

That native wrapper change stays on the working branch. It was neither parsed
nor executed in this increment; the host also remains unqualified. Only the
tested core, selected fixture, exact result and this document are eligible for
the small main transfer. No default payment path is changed.

The old P1 V3 fixture still uses its old application graph and does not import
this native binding, core or new native host. This increment does not reuse the
consumed V2 native permission or silently broaden a selected native experiment.

## Ownership and interface contract

The core receives exact limits plus three **trusted** capabilities:
`armTimer`, `cancelTimer` and `readMonotonicTime`. The native binding alone
selects the real intrinsics. A caller using the core directly must not treat
supplied data/callbacks as independent OS observations.

| Interface | Schedule result | Cancel result |
| --- | --- | --- |
| ingressRuntime | opaque frozen ticket | boolean |
| serviceRuntime | opaque frozen ticket | undefined |

Tickets are private to an owner and kind. They never expose an actuator handle.
Cancellation of a known fired/cancelled ticket is idempotent without another
actuator call. Total starts, concurrent owned rows and delay are bounded;
invalid requests do not consume an arm.

Failed/unknown arm or cancellation is latched, not retried. An uncertain row
retains its ownership until a later wake is observed. That wake suppresses work
and may release the row, but never repairs a rejected CLOSE_UNKNOWN Promise.

## Selected lifecycle coverage

The selected cases exercise inert construction, frozen interfaces, exact
configuration/arity, proxy/accessor rejection without invoking traps, opaque
tickets, owner/kind separation, start/concurrency/delay bounds, idempotent
boolean-versus-void cancellation, and bigint monotonicity.

They also cover:

- Cached void clean close and immediate revocation of new work.
- Close while a callback is delivering: wait for that callback's completion.
- Thrown/non-void callback results, without thenable assimilation.
- Failed/non-void cancellation with no second actuator call.
- Arm failure or invalid handle with retained uncertain ownership.
- Late wake cleanup without UNKNOWN repair or callback replay.
- Premature synchronous wake refusal and one cleanup of a later-known handle.
- Close during arm, close during cancellation and recursive cancellation.
- Late monotonic result after reentrant close: current phase downgrades to
  CLOSE_UNKNOWN without rewriting the historical Promise settlement.
- Original configuration mutation cannot replace captured capabilities.
- Snapshots contain neither callback data nor actuator handles.

These are cooperative application ownership checks, not an OS quota, hard
thread deadline, secure erasure, service-delivery evidence or payment authority.

## Remaining roadmap gates

The native application host/deadline binding requires its own current-source
native qualification. P1 V2 remains a failed partial composition result; no
source or historical record was relabelled as passed. Its corrected V3 draft
and any new native attempt remain separately scoped.

This result establishes no forced-interruption, hardware power-loss, native
socket/SQL reopen, real funding-to-grant, provider activation or live pilot
acceptance. Hosted CI is NOT_RUN_NOT_GREEN. Full P1 and economic pilot remain
NOT_ESTABLISHED / NO_GO respectively.

