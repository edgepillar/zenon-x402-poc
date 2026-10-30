# Original-only funding chain observation

This is a source candidate for explicit pending continuation on the single
issued-provider entry. Native execution remains disabled. This contract does
not close G0/G1/G2, authenticate a chain or qualify Linux/product operation.

## Explicit selection and original identity

Bootstrap version 1 retains JOURNAL_ONLY. Version 2 requires an explicit
funding.pendingObservationMode, either JOURNAL_ONLY or ORIGINAL_RPC. RPC mode
is restricted to FRESH. No restored process obtains live continuation from a
historical ACK, witness, journal record or new configuration field.

The actual intake reserves and reads back its durable observation before the
selected pending callback. The separate chain owner captures one exact tuple:
authorization key, transaction hash, chain profile, intent digest, resource
identity, resource digest, payer and complete signed account block. It checks
context digests, original data and the configured chain/payer before entering
the fixed payer queue. A local 0..16 entry bound is consumed before queue entry;
failed entries are never refunded. This second bound does not replace the
original durable budget or grant cross-process fencing.

## Fixed native path

The real adapter accepts only the actual facilitator brand and its captured
existing-only journal, payer queue, live runtime, original RPC/timeout and
operator-trusted testnet policy. It cannot receive an arbitrary chain reader,
writer, signer or settlement callback. Each operation runs through the actual
fixed-payer queue, reads the original journal record, obtains one existing owned
SDK session and reuses its readiness checks. It then requests only the original
hash through ledger.getAccountBlockByHash and validates the full returned block
and recomputed hash with the existing journal-block validator.

Readiness itself performs the existing bounded identity/readiness reads; this
is one original-block lookup, not a one-network-request claim. The new entry
guard fences queued acquisition, lazy dependency return, initialization and
each readiness/block RPC entry. The original SDK owner performs its existing
connection cleanup even after a stop; no second closer is introduced.

The pure decision owner uses declared fixed ports in the native binding. ACK
plus not-found/unconfirmed remains PENDING with no terminalization or write.
A prior included record plus not-found/unconfirmed, a different Momentum or a
count regression is a conflict and stays HELD. Same inclusion/count is
idempotent. ACK-to-inclusion and a strictly stronger count for the same Momentum
use only the existing journal compareAndUpdateEvidence with the original full
record and revision. Initial observation time and original fields survive count
advancement. CAS success requires an exact subsequent revision/record readback.
A lost CAS ACK may follow a write; it is UNKNOWN/HELD and cannot authorize retry.

The actual selected journal projector then applies the original requirement's
confirmation threshold and normalized response. An ACK or weak inclusion cannot
be promoted to settlement success. Journal history and operator-trusted RPC
still do not establish authenticated current canonicality, finality, grant
activation or delivery authority.

## Stop and evidence boundary

Normal close/EOF and signal-driven close fence the observation owner before
requesting the same provider's close. Queued work cannot enter a late read or
RPC; late RPC cannot enter CAS, and late CAS cannot trigger readback/retry.
Already entered resources remain with their actual owners. Unknown promises,
receipts and partial work stay retained; no competing close, cleanup, reopen,
re-sign, republish, payment replacement, general maintenance or tombstone scan
is added. The provider's existing close path still runs even if observer stop
is HELD. Physical release remains NOT_ESTABLISHED.

Local DATA checks execute the actual pure observer and selected projector with
declared memory queue/journal/chain/CAS ports. Their account-block signature
fields are unauthenticated synthetic metadata. Parser checks do not execute the
native binding. SDK, actual journal I/O/CAS, SQLite, sockets, credentials,
signatures, nonce work and native commands remain unexecuted. Existing passing
native evidence is bound to its old exact graph; full product, fresh-process,
Linux and economic acceptance remain OPEN.
