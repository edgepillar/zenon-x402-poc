# Original-funding uncertainty age

`inspectOriginalFundingUncertaintyAge(raw, policy, observedDay, ageLimits)`
classifies the existing canonical original-funding spending journal without
opening a store or changing it. It reuses the actual stored-history validator;
the original policy, exposure limits and transition grammar remain unchanged.

The first API-credit product already refuses another preparation whenever the
account contains a RESERVED or UNKNOWN original. Passing an age threshold does
not relax that rule. The new source API supplies bounded operational DATA for
classifying the outstanding reservation and requesting operator escalation.

Supply the existing serialized history (or the existing explicit `null`
absence observation), its exact spending policy, an explicit UTC day index and
exact `{ version: 1, maximumUnresolvedAgeDays }` limits. There is no default
threshold or clock. Both day values are nonnegative canonical safe integers
through 2147483647; negative zero is refused. The observation day cannot precede
the journal's last recorded day.

The result distinguishes RESERVED, UNKNOWN and SPENT counts. It reports the
oldest unresolved reservation day, the oldest UNKNOWN reservation day and their
ages at the supplied observation day. UNKNOWN age starts at its original
reservation, not at an inferred time of signing, submission or transition to
UNKNOWN. Repeated UNKNOWN observations do not renew that origin. SPENT rows
are excluded from outstanding ages while remaining in lifetime exposure.

An age strictly greater than the configured maximum requests escalation.
Equality stays within that age policy. A zero-day maximum therefore becomes
exceeded on a later UTC day; it is not an instantaneous or rolling 24-hour
deadline. An old RESERVED row also requests escalation because a lost prepare
or commit acknowledgement may leave the original's state unresolved.

This output is a frozen historical observation with `authority: "NONE"`.
Every payment, signing, submission, service-dispatch and reservation-release
permission remains false, including when no unresolved row was observed.
An escalation is not payment expiry, revocation, reconciliation proof or native
resource release. A later exact BOUND observation still belongs to the original
journal transition owner and never follows from this report alone.

The function receives no backend, key, signer, clock callback or transport.
It does not reload current state, establish file/owner identity, observe a live
worker or authenticate the supplied day. The report cannot replace admission
CAS, current-owner checks or the existing single-original gate. Re-reading an
older valid snapshot also does not establish current status.

This API is outside both unchanged default native entry graphs. It does not
add an operator CLI mode or claim a running alerting service. Its local DATA
controls join the real canonical journal, reservation, lost-ACK and reopen
logic through declared memory CAS ports. No native SQLite reopen, installed
SDK/core, socket, key/signature, nonce, actual PREPARE/payment or Linux
application executes. Native G1/G2 and all G0-G5 acceptance gates remain OPEN.
