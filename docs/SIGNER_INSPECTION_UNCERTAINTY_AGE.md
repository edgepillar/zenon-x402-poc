# Signer inspection with original-reservation age

The existing explicit `--signer-inspect-fd` operator entry now has a version-two
source profile. It joins signer-history inspection to the canonical spending
history on the **same existing file owner**. It opens no second store and
creates, signs, submits or releases no original payment. Version-one input,
output and the one-signer-read owner path remain unchanged.

This is a source/DATA candidate. The native binding and package-admission
update receive parser checks only; the native application is not run.
Actual SQLite/SDK/core/HTTPS, current-owner contention, Linux, physical release
and G0-G5 acceptance remain unestablished.

## Explicit version two

Keep the existing `spendingFile` OPEN_EXISTING profile and independent
`expectedOriginal` payment ID, original digest and funding URL. Select
`signerInspectionVersion: 2` and add exactly:

```json
"uncertaintyAgeLimits": { "version": 1, "maximumUnresolvedAgeDays": 3 }
```

There is no default maximum. JSON cannot supply a clock, observation day,
opener, key, module or transport. The fixed native source obtains the UTC day
through the existing operator-clock codec and a captured `Date.now` function.
This is operator-clock observation, not authenticated chain time. The same
startup deadline, two owned pipe ends, runtime/context gates and output byte
ceiling remain.

The profile is consumed once. V2 output must retain its exact original
identity, spending policy ID and chosen maximum. A V1 result cannot satisfy a
V2 profile, or a V2 result a V1 profile. The coordinator also refuses an
otherwise genuine result produced under a different age maximum or policy.
The new V2 output capsule is producer-owned in the same module instance;
spreading or rebuilding a result does not create another accepted capsule.
The serialized private result remains historical DATA, not current authority.

## Same owned history before and after

The V2 owner observes the day before opening the existing file. It captures
the actual owner's `assertCurrent` and frozen backend's ordinary `load` method;
the native method itself need not be frozen. It never enters that backend's
`compareAndSwap` method.

Two explicit spending-history reads bracket the existing single signer-record
read. Each spending read has a void current-owner check before and after it,
using the same original owner. The actual native `assertCurrent` already
performs its own existing store load; those four checks are additional reads.
All work uses the existing opener/epoch/connection protocol. No reservation or
signer transition, new takeover mechanism or schema migration is introduced.

The spending history must remain exactly byte-identical. It is validated by
the existing canonical journal reader, and its selected payment row must match
the independent original digest. Signed or intent history without that
reservation is withheld. A missing signer record with a retained reservation
is allowed as historical absence and never authorizes another signer call.

The final observation day cannot precede the first or the last recorded day.
An initial day behind the stored history is refused before the signer read;
a later clock repair cannot revive that attempt. RESERVED and UNKNOWN age
starts at the original reservation. SPENT rows retain lifetime exposure but
have no unresolved age. A selected row's status/day/age and the bounded
account-level age summary are returned without the raw spending journal.
No unresolved spending row does not establish that other stores or external
funding, grant, signer or service effects are free of uncertainty.

These are cooperative checks around returned reads, not an atomic snapshot,
cross-process dispatch lease, hardware-durability result or proof of an absent
live worker. No external operation occurs inside a journal transition callback.

## Original close and unknown ownership

The original logical revoke and physical-close protocol completes before a
result can reach the private result pipe. Every old signing, payment, funding
and service permission stays false. Escalation cannot expire payment, clear
HELD, release a reservation or create dispatch/reconciliation authority.

An unreturned read/current-owner check or an unexpected Promise leaves the
original owner retained. Logical admission is revoked once when the owner is
known; physical close is withheld. A late value cannot restart inspection,
write output, trigger a new read or retry close. A fully returned read followed
by startup expiry may still take its one existing clean close path, without
returning history. Close uncertainty withholds the result and is never retried.

Local DATA controls use the real journal/profile/owner/coordinator with
declared memory file, day and pipe capabilities. They do not establish actual
native reads, real signals, process restart, signing, resource release or Linux
product acceptance. The approved hosted 108-control selection is unchanged
and excludes the new local controls. The buyer source catalog adds the pure
age module and retains all existing package rows and bare import edges;
source reachability/pins do not qualify installed-package evaluation.
